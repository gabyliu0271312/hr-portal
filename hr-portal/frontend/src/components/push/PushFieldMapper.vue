<!-- PushTarget 到公共 MappingDocument 的薄适配层；规则编辑统一由 MappingWorkspace 提供。 -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ColumnInfo } from '@/api/data'
import {
  createEmptyDocument,
  type MappingCompatibility,
  type MappingDocument,
  type MappingCallerPolicy,
} from '@/api/mapping'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'

interface LegacyMapping {
  source: string
  target: string
  [key: string]: unknown
}

const props = withDefaults(defineProps<{
  mappings: LegacyMapping[]
  mappingComponent?: MappingDocument | null
  sourceColumns: ColumnInfo[]
  targetFields?: Array<{ code: string; label: string; type?: string }>
  sourceAsset?: string
}>(), {
  targetFields: () => [],
  sourceAsset: '',
})

const emit = defineEmits<{
  'update:mappings': [v: LegacyMapping[]]
  'document': [v: MappingDocument]
}>()

const document = ref<MappingDocument>(props.mappingComponent ? clone(props.mappingComponent) : createDocument())
let syncingFromParent = false
watch(() => [props.mappings, props.mappingComponent], () => {
  if (!syncingFromParent) document.value = props.mappingComponent ? clone(props.mappingComponent) : createDocument()
  syncingFromParent = false
}, { deep: true })

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function createDocument(): MappingDocument {
  const doc = createEmptyDocument('push_target', 'PushTarget')
  doc.ruleSet.sourceAsset = props.sourceAsset || null
  doc.ruleSet.targetAsset = null
  doc.ruleSet.rules = props.mappings.map((mapping, index) => ({
    id: String(index),
    type: 'field' as const,
    enabled: true,
    displayOrder: index,
    sourceFields: [mapping.source],
    targetFields: [mapping.target],
    config: { mode: 'rename' as const },
  }))
  return doc
}

const sourceFields = computed(() => props.sourceColumns.map((column) => ({
  code: column.code,
  label: column.label,
  type: column.data_type,
})))

const targetFields = computed(() => {
  const fields = new Map<string, { code: string; label: string; type?: string }>()
  props.targetFields.forEach((field) => fields.set(field.code, field))
  props.mappings.forEach((mapping) => {
    if (mapping.target && !fields.has(mapping.target)) {
      fields.set(mapping.target, { code: mapping.target, label: mapping.target })
    }
  })
  document.value.ruleSet.rules.forEach((rule) => rule.targetFields.forEach((code) => {
    if (code && !fields.has(code)) fields.set(code, { code, label: code })
  }))
  return Array.from(fields.values())
})

const policy = computed<MappingCallerPolicy>(() => ({
  caller: 'push_target',
  allowedRuleTypes: [
    'field', 'value_map', 'reference_lookup', 'identity_with_overrides',
    'type_convert', 'format', 'split_merge',
  ],
  source: {
    assetId: props.sourceAsset || null,
    schemaHash: '',
    allowedFieldIds: sourceFields.value.map((field) => field.code),
  },
  target: {
    assetId: null,
    schemaHash: '',
    allowedFieldIds: targetFields.value.map((field) => field.code),
    readonlyFieldIds: [],
    protectedKeyFieldIds: [],
  },
  referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
  effects: {
    allowPreview: true,
    allowSave: true,
    allowPublish: false,
    allowExecute: false,
    allowRebuild: false,
  },
  legacy: {
    sourceFormat: 'push_target_field_mappings',
    allowLegacyRead: true,
    allowLegacyWrite: true,
    allowMigration: false,
  },
  metadata: { policyVersion: 1, permissionScope: 'warehouse.service', issuedAt: '' },
}))

const compatibility = computed<MappingCompatibility>(() => {
  const lossyFields = props.mappings.flatMap((mapping, index) => {
    if (!mapping || typeof mapping !== 'object' || !mapping.source || !mapping.target) {
      return [`field_mappings[${index}]`]
    }
    if (!sourceFields.value.some((field) => field.code === mapping.source)) {
      return [`field_mappings[${index}].source`]
    }
    return []
  })
  return {
    sourceFormat: 'push_target_field_mappings',
    readable: true,
    writable: lossyFields.length === 0,
    requiresMigration: false,
    lossyFields,
    unknownFields: {},
  }
})

function onDocumentUpdate(next: MappingDocument) {
  document.value = next
  syncingFromParent = true
  const originalById = new Map(props.mappings.map((mapping, index) => [String(index), mapping]))
  emit('update:mappings', next.ruleSet.rules
    .filter((rule) => rule.type === 'field')
    .map((rule) => ({
      ...(originalById.get(rule.id) || {}),
      source: rule.sourceFields[0] || '',
      target: rule.targetFields[0] || '',
    })))
  emit('document', next)
}

function serialize() {
  const rules = [...document.value.ruleSet.rules].sort((a, b) => a.displayOrder - b.displayOrder)
  const originalById = new Map(props.mappings.map((mapping, index) => [String(index), mapping]))
  const lossyFields = [...compatibility.value.lossyFields]

  if (rules.some((rule) => rule.type !== 'field')) {
    return { ok: true as const, storageMode: 'component_v1' as const, document: clone(document.value) }
  }

  const output: LegacyMapping[] = []
  const retainedIds = new Set<string>()
  for (const rule of rules) {
    const fieldConfig = rule.config as { mode?: string }
    if (!rule.enabled || fieldConfig.mode !== 'rename' || rule.sourceFields.length !== 1 || rule.targetFields.length !== 1) {
      return {
        ok: false as const,
        reason: `公共规则 ${rule.id} 无法无损表达为旧 field_mappings，已阻断保存。`,
      }
    }
    const source = rule.sourceFields[0]
    const target = rule.targetFields[0]
    if (!source || !target || !sourceFields.value.some((field) => field.code === source)) {
      return { ok: false as const, reason: `规则 ${rule.id} 的字段不在允许白名单内，已阻断保存。` }
    }
    const original = originalById.get(rule.id)
    output.push({ ...(original || {}), source, target })
    if (original) retainedIds.add(rule.id)
  }

  for (const [id, original] of originalById) {
    if (retainedIds.has(id)) continue
    const unknownKeys = Object.keys(original).filter((key) => key !== 'source' && key !== 'target')
    if (unknownKeys.length) lossyFields.push(`field_mappings[${id}]`)
  }
  if (lossyFields.length) {
    return { ok: false as const, reason: '旧 field_mappings 含无法无损回写的字段，已阻断保存。' }
  }
  return { ok: true as const, storageMode: 'legacy_v1' as const, mappings: output }
}

defineExpose({ serialize, getDocument: () => clone(document.value) })
</script>

<template>
  <MappingWorkspace
    :model-value="document"
    :policy="policy"
    :compatibility="compatibility"
    :source-fields="sourceFields"
    :target-fields="targetFields"
    @update:model-value="onDocumentUpdate"
  />
</template>
