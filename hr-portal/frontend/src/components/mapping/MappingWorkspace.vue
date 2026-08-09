<template>
  <div ref="workspaceRoot" class="mapping-workspace">
    <!-- Header -->
    <div class="workspace-header">
      <div class="header-left">
        <span class="caller-tag" :class="`caller-${policy.caller}`">
          {{ callerLabel }}
        </span>
        <span v-if="document.ruleSet.sourceAsset" class="asset-info">
          {{ document.ruleSet.sourceAsset }}
          <span class="arrow">→</span>
          <span v-if="document.ruleSet.targetAsset">{{ document.ruleSet.targetAsset }}</span>
        </span>
        <span class="schema-version">DTO v{{ document.mappingSchemaVersion }}</span>
        <span v-if="compatibility" class="compat-tag" :class="{ lossy: !compatibility.writable }">
          {{ compatibility.sourceFormat || 'component_v1' }}
          <template v-if="!compatibility.writable">⚠ 有损</template>
        </span>
      </div>
      <div class="header-right">
        <span v-if="dirty" class="dirty-tag">未保存</span>
        <el-button
          v-if="canValidate"
          size="small"
          @click="doValidate"
          :loading="validating"
        >校验</el-button>
        <el-button
          v-if="props.policy.effects.allowPreview"
          size="small"
          @click="doPreview"
          :loading="previewing"
        >预览</el-button>
        <slot
          name="footer-actions"
          :can-save="canEdit"
          :can-publish="canPublish"
          :can-execute="canExecute"
          :can-rebuild="canRebuild"
        />
      </div>
    </div>

    <!-- Caller Policy 提示区 -->
    <div v-if="policyDenied" class="policy-denied">
      <el-alert :title="policyDenied" type="error" :closable="false" />
    </div>

    <!-- 兼容提示区 -->
    <div v-if="compatibility && !compatibility.writable" class="compat-blocked">
      <el-alert type="warning" :closable="false">
        <template #title>
          无法无损回写 — 以下字段无法表达: {{ compatibility.lossyFields.join(', ') }}
        </template>
      </el-alert>
    </div>

    <!-- 规则列表 -->
    <div class="mapping-status" aria-live="polite" aria-atomic="true">
      <span v-if="dirty">映射规则有未保存修改</span>
    </div>
    <div class="rule-list">
      <div
        v-for="(rule, index) in document.ruleSet.rules"
        :key="rule.id"
        class="rule-item"
        :class="{ disabled: !rule.enabled, editing: editingIndex === index }"
      >
        <div class="rule-header">
          <div class="rule-left">
            <el-switch
              v-model="rule.enabled"
              size="small"
              :aria-label="`${index + 1} ${ruleLabel(rule.type)} 规则启用状态`"
              @change="markDirty"
              :disabled="!canEdit"
            />
            <button
              type="button"
              class="rule-toggle"
              :aria-expanded="editingIndex === index"
              :aria-controls="`mapping-rule-panel-${rule.id}`"
              :aria-label="`${index + 1} ${ruleLabel(rule.type)} 规则，${editingIndex === index ? '收起' : '展开'}`"
              :ref="(element) => setToggleRef(rule.id, element as HTMLButtonElement | null)"
              @click="toggleEdit(index)"
            >
              <span class="rule-type-badge" :class="`type-${rule.type}`">
                {{ ruleLabel(rule.type) }}
              </span>
              <span class="rule-summary">{{ ruleSummary(rule) }}</span>
            </button>
          </div>
          <div class="rule-actions" @click.stop>
            <el-button link size="small" @click="moveUp(index)" :disabled="!canEdit || index === 0">↑</el-button>
            <el-button link size="small" @click="moveDown(index)" :disabled="!canEdit || index === rules.length - 1">↓</el-button>
            <el-button link size="small" @click="duplicateRule(index)" :disabled="!canEdit">复制</el-button>
            <el-button link type="danger" size="small" @click="removeRule(index)" :disabled="!canEdit">删除</el-button>
          </div>
        </div>

        <!-- 规则编辑面板 -->
        <div
          v-if="editingIndex === index"
          :id="`mapping-rule-panel-${rule.id}`"
          class="rule-editor-panel"
          role="region"
          tabindex="-1"
          :ref="(element) => setPanelRef(rule.id, element as HTMLElement | null)"
          :aria-label="`${index + 1} ${ruleLabel(rule.type)} 规则编辑`"
        >
          <component
            :is="ruleEditorComponent(rule.type)"
            :rule="rule"
            :source-fields="sourceFields"
            :target-fields="targetFields"
            :policy="policy"
            @change="markDirty"
          />
        </div>
      </div>

      <!-- 添加规则 -->
      <div v-if="canEdit" class="add-rule-area">
        <el-dropdown @command="addRule" trigger="click">
          <el-button ref="addRuleRef">+ 添加规则</el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item
                v-for="rt in allowedRuleTypes"
                :key="rt"
                :command="rt"
              >
                {{ ruleLabel(rt) }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- Preview 面板 -->
    <div v-if="previewResult" class="preview-panel">
      <el-divider content-position="left">预览结果</el-divider>
      <div class="preview-stats">
        <span>输入: {{ previewResult.stats.input }}</span>
        <span>输出: {{ previewResult.stats.output }}</span>
        <span class="matched">命中: {{ previewResult.stats.matched }}</span>
        <span class="unmatched">未命中: {{ previewResult.stats.unmatched }}</span>
        <span v-if="previewResult.stats.errors" class="errors">错误: {{ previewResult.stats.errors }}</span>
      </div>
      <el-table :data="previewResult.outputRows" max-height="300" size="small" border>
        <el-table-column
          v-for="col in previewColumns"
          :key="col"
          :prop="col"
          :label="col"
          min-width="120"
        />
      </el-table>
      <div v-if="previewResult.errors.length" class="preview-errors">
        <div v-for="(err, i) in previewResult.errors" :key="i" class="error-item">
          <el-tag type="danger" size="small">{{ err.code }}</el-tag>
          {{ err.message }}
          <span v-if="err.rowIndex !== undefined"> (行 {{ err.rowIndex }})</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus'
import { ref, computed, nextTick } from 'vue'
import {
  type MappingDocument,
  type MappingRule,
  type MappingRuleType,
  type MappingCallerPolicy,
  type MappingCompatibility,
  type MappingResult,
  RULE_TYPES,
  RULE_LABELS,
  createEmptyRule,
  mappingApi,
} from '@/api/mapping'
import FieldEditor from './rules/FieldEditor.vue'
import ValueMapEditor from './rules/ValueMapEditor.vue'
import ReferenceLookupEditor from './rules/ReferenceLookupEditor.vue'
import IdentityWithOverridesEditor from './rules/IdentityWithOverridesEditor.vue'
import TypeConvertEditor from './rules/TypeConvertEditor.vue'
import FormatEditor from './rules/FormatEditor.vue'
import SplitMergeEditor from './rules/SplitMergeEditor.vue'

const props = defineProps<{
  modelValue: MappingDocument
  policy: MappingCallerPolicy
  compatibility?: MappingCompatibility | null
  sourceFields?: Array<{ code: string; label: string; type?: string }>
  targetFields?: Array<{ code: string; label: string; type?: string }>
  previewRows?: Record<string, any>[]
  referenceSnapshot?: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [v: MappingDocument]
  dirty: [v: boolean]
  validate: [v: { valid: boolean; warnings: string[] }]
}>()

const document = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const rules = computed(() => document.value.ruleSet.rules)

const dirty = ref(false)
const editingIndex = ref(-1)
const validating = ref(false)
const previewing = ref(false)
const previewResult = ref<MappingResult | null>(null)
const workspaceRoot = ref<HTMLElement | null>(null)
const toggleRefs = ref<Record<string, HTMLButtonElement | null>>({})
const panelRefs = ref<Record<string, HTMLElement | null>>({})
const addRuleRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)

function setToggleRef(id: string, element: HTMLButtonElement | null) {
  toggleRefs.value[id] = element
}

function setPanelRef(id: string, element: HTMLElement | null) {
  panelRefs.value[id] = element
}

const callerLabels: Record<string, string> = {
  warehouse: '数据仓库',
  workflow: '流程编排',
  ucp_transform: 'UCP TRANSFORM',
  warehouse_sink: '资产入仓',
  push_target: '推送目标',
}

const callerLabel = computed(() => callerLabels[props.policy.caller] || props.policy.caller)

const allowedRuleTypes = computed(() => {
  return RULE_TYPES.filter((rt) => props.policy.allowedRuleTypes.includes(rt))
})

const canEdit = computed(() => (
  props.policy.effects.allowSave
  && props.policy.legacy.allowLegacyWrite
  && (!props.compatibility || props.compatibility.writable)
))
const canValidate = computed(() => props.policy.effects.allowPreview || props.policy.effects.allowSave)
const canPublish = computed(() => props.policy.effects.allowPublish && canEdit.value)
const canExecute = computed(() => props.policy.effects.allowExecute)
const canRebuild = computed(() => props.policy.effects.allowRebuild)
const policyDenied = computed(() => {
  if (!props.policy.effects.allowPreview && !props.policy.effects.allowSave) {
    return '当前调用方策略禁止校验、预览和保存'
  }
  if (!canEdit.value) {
    return '当前调用方策略或兼容状态禁止修改映射规则'
  }
  return null
})

const previewColumns = computed(() => {
  if (!previewResult.value?.outputRows?.length) return []
  const cols = new Set<string>()
  previewResult.value.outputRows.forEach((row) => {
    Object.keys(row).forEach((k) => cols.add(k))
  })
  return Array.from(cols).slice(0, 20)
})

function ruleLabel(type: string): string {
  return RULE_LABELS[type as MappingRuleType] || type
}

function ruleEditorComponent(type: string) {
  const map: Record<string, any> = {
    field: FieldEditor,
    value_map: ValueMapEditor,
    reference_lookup: ReferenceLookupEditor,
    identity_with_overrides: IdentityWithOverridesEditor,
    type_convert: TypeConvertEditor,
    format: FormatEditor,
    split_merge: SplitMergeEditor,
  }
  return map[type] || null
}

function ruleSummary(rule: MappingRule): string {
  const src = rule.sourceFields.join(', ')
  const tgt = rule.targetFields.join(', ')
  if (rule.type === 'field') {
    return `${src} → ${tgt} (${(rule.config as any).mode || 'rename'})`
  }
  if (rule.type === 'value_map') {
    const cfg = rule.config as any
    return `${src} → ${tgt} (${Object.keys(cfg.mappings || {}).length} 条映射)`
  }
  if (rule.type === 'reference_lookup') {
    const cfg = rule.config as any
    return `${src} → ${tgt} (参考: ${cfg.referenceDatasetId || '?'})`
  }
  if (rule.type === 'identity_with_overrides') {
    const cfg = rule.config as any
    return `${src} → ${tgt} (${Object.keys(cfg.overrides || {}).length} 条例外)`
  }
  if (rule.type === 'type_convert') {
    const cfg = rule.config as any
    return `${src} → ${tgt} (→ ${cfg.targetType})`
  }
  if (rule.type === 'format') {
    const cfg = rule.config as any
    return `${src} → ${tgt} (${cfg.formatType})`
  }
  if (rule.type === 'split_merge') {
    const cfg = rule.config as any
    return `${cfg.action}: ${src} → ${tgt}`
  }
  return `${src} → ${tgt}`
}

async function focusRuleEditor(ruleId: string) {
  await nextTick()
  const panel = panelRefs.value[ruleId]
  const firstControl = panel?.querySelector<HTMLElement>(
    'button:not([disabled]):not([aria-hidden="true"]), input:not([disabled]):not([aria-hidden="true"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"])',
  )
  ;(firstControl || panel)?.focus()
}

function focusAddRule() {
  const refValue = addRuleRef.value
  const target = refValue && ('$el' in refValue ? refValue.$el : refValue)
  if (target instanceof HTMLElement) target.focus()
}

async function addRule(type: MappingRuleType) {
  if (!canEdit.value) return
  const rule = createEmptyRule(type)
  rule.displayOrder = rules.value.length
  document.value.ruleSet.rules.push(rule)
  editingIndex.value = rules.value.length - 1
  markDirty()
  await focusRuleEditor(rule.id)
}

async function removeRule(index: number) {
  if (!canEdit.value) return
  const removed = rules.value[index]
  const wasEditing = editingIndex.value === index
  document.value.ruleSet.rules.splice(index, 1)
  if (editingIndex.value === index) editingIndex.value = -1
  else if (editingIndex.value > index) editingIndex.value--
  markDirty()
  if (!wasEditing) return
  await nextTick()
  const successor = rules.value[index] || rules.value[index - 1]
  if (successor) toggleRefs.value[successor.id]?.focus()
  else focusAddRule()
}

async function duplicateRule(index: number) {
  if (!canEdit.value) return
  const original = rules.value[index]
  const copy = JSON.parse(JSON.stringify(original))
  copy.id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  copy.displayOrder = rules.value.length
  document.value.ruleSet.rules.push(copy)
  editingIndex.value = rules.value.length - 1
  markDirty()
  await focusRuleEditor(copy.id)
}

function moveUp(index: number) {
  if (!canEdit.value || index === 0) return
  const r = rules.value
  const tmp = r[index]
  r[index] = r[index - 1]
  r[index - 1] = tmp
  r.forEach((rule, i) => (rule.displayOrder = i))
  markDirty()
}

function moveDown(index: number) {
  if (!canEdit.value || index === rules.value.length - 1) return
  const r = rules.value
  const tmp = r[index]
  r[index] = r[index + 1]
  r[index + 1] = tmp
  r.forEach((rule, i) => (rule.displayOrder = i))
  markDirty()
}

async function toggleEdit(index: number) {
  if (!canEdit.value) return
  const rule = rules.value[index]
  const closing = editingIndex.value === index
  editingIndex.value = closing ? -1 : index
  if (closing) {
    await nextTick()
    toggleRefs.value[rule.id]?.focus()
    return
  }
  await focusRuleEditor(rule.id)
}

function markDirty() {
  if (!canEdit.value) return
  dirty.value = true
  emit('dirty', true)
}

async function doValidate() {
  validating.value = true
  try {
    const res = await mappingApi.validate(document.value, props.policy)
    emit('validate', { valid: res.data.valid, warnings: res.data.warnings || [] })
    if (!res.data.valid) {
      ElMessage.error('校验未通过')
    } else if (res.data.warnings?.length) {
      ElMessage.warning(`校验通过, ${res.data.warnings.length} 条警告`)
    } else {
      ElMessage.success('校验通过')
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || '校验失败')
  } finally {
    validating.value = false
  }
}

async function doPreview() {
  if (!props.policy.effects.allowPreview) {
    ElMessage.error('当前调用方策略禁止预览')
    return
  }
  if (!props.previewRows?.length) {
    ElMessage.warning('无预览数据')
    return
  }
  previewing.value = true
  try {
    previewResult.value = await mappingApi.preview(
      document.value,
      props.previewRows,
      props.referenceSnapshot,
      props.policy,
    )
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail?.message || '预览失败')
  } finally {
    previewing.value = false
  }
}

async function focusRule(ruleId: string): Promise<boolean> {
  const index = rules.value.findIndex((rule) => rule.id === ruleId)
  if (index < 0 || !canEdit.value) return false
  workspaceRoot.value?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  editingIndex.value = index
  await focusRuleEditor(ruleId)
  toggleRefs.value[ruleId]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return true
}

// 暴露方法给父组件
defineExpose({
  markDirty,
  focusRule,
  doValidate,
  doPreview,
  canEdit,
  canPublish,
  canExecute,
  canRebuild,
  resetDirty: () => {
    dirty.value = false
    emit('dirty', false)
  },
})
</script>

<style scoped>
.mapping-workspace {
  border: 1px solid var(--el-border-color-light);
  border-radius: 8px;
  background: var(--el-bg-color);
  overflow: hidden;
}

.workspace-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-light);
  flex-wrap: wrap;
  gap: 8px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.caller-tag {
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
}

.caller-warehouse { background: #e8f5e9; color: #2e7d32; }
.caller-workflow { background: #e3f2fd; color: #1565c0; }
.caller-ucp_transform { background: #f3e5f5; color: #7b1fa2; }
.caller-warehouse_sink { background: #fff3e0; color: #e65100; }
.caller-push_target { background: #fce4ec; color: #c62828; }

.asset-info {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.arrow {
  margin: 0 4px;
  color: var(--el-text-color-secondary);
}

.schema-version {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.compat-tag {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  background: #e8f5e9;
  color: #2e7d32;
}

.compat-tag.lossy {
  background: #ffebee;
  color: #c62828;
}

.dirty-tag {
  font-size: 11px;
  color: var(--el-color-warning);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.policy-denied,
.compat-blocked {
  padding: 4px 12px;
}

.rule-list {
  padding: 8px 12px;
  max-height: 600px;
  overflow-y: auto;
}

.rule-item {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  margin-bottom: 6px;
  background: var(--el-bg-color);
  transition: border-color 0.2s;
}

.rule-item.editing {
  border-color: var(--el-color-primary);
}

.rule-item.disabled {
  opacity: 0.5;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  cursor: default;
}

.rule-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  border: 0;
  padding: 2px 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.rule-toggle:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 2px;
  border-radius: 3px;
}

.rule-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rule-type-badge {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
}

.type-field { background: #e3f2fd; color: #1565c0; }
.type-value_map { background: #e8f5e9; color: #2e7d32; }
.type-reference_lookup { background: #fff3e0; color: #e65100; }
.type-identity_with_overrides { background: #f3e5f5; color: #7b1fa2; }
.type-type_convert { background: #fce4ec; color: #c62828; }
.type-format { background: #e0f7fa; color: #00838f; }
.type-split_merge { background: #f1f8e9; color: #558b2f; }

.rule-summary {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.rule-actions {
  display: flex;
  gap: 2px;
}

.rule-editor-panel {
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.add-rule-area {
  margin-top: 8px;
  text-align: center;
}

.preview-panel {
  padding: 8px 12px;
  border-top: 1px solid var(--el-border-color-light);
  background: var(--el-fill-color-lighter);
}

.preview-stats {
  display: flex;
  gap: 16px;
  font-size: 13px;
  margin-bottom: 8px;
}

.preview-stats .matched { color: var(--el-color-success); }
.preview-stats .unmatched { color: var(--el-color-warning); }
.preview-stats .errors { color: var(--el-color-danger); }

.preview-errors {
  margin-top: 8px;
}

.error-item {
  font-size: 12px;
  color: var(--el-color-danger);
  margin: 2px 0;
}
</style>
