<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { ScopeStrategy } from '@/constants/scopeStrategy'
import type { ColumnInfo } from '@/api/data'
import {
  reportsApi,
  type DimensionMergePreview,
  type DimensionMergeRule,
  type DimensionMergeTarget,
  type ReportConfig,
} from '@/api/reports'
import ReportDimensionCombinationPicker from './ReportDimensionCombinationPicker.vue'
import ReportDimensionMergeRuleList from './ReportDimensionMergeRuleList.vue'
import ReportDimensionMergeTargetEditor from './ReportDimensionMergeTargetEditor.vue'

type DimensionColumn = ColumnInfo & { _instance_id?: string }

const props = defineProps<{
  modelValue: DimensionMergeRule[]
  dimensions: DimensionColumn[]
  datasetId: number
  scopeStrategy?: ScopeStrategy | null
  reportId?: number | null
  reportConfig: ReportConfig
  aggregate: boolean
  structuralReshape: boolean
  errors?: Array<{ code?: string; message?: string; rule_id?: string; field?: string; path?: string }>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: DimensionMergeRule[]]
  openRules: []
  openReshape: []
}>()

const selectedId = ref('')
const previewing = ref(false)
const preview = ref<DimensionMergePreview | null>(null)

function idOf(column: DimensionColumn) {
  return column._instance_id || column.code
}

const signature = computed(() => props.dimensions.map(idOf))
const selectedRule = computed(() => props.modelValue.find((rule) => rule.id === selectedId.value) || null)
const searchConfig = computed<ReportConfig>(() => ({
  ...props.reportConfig,
  aggregate: true,
  dimension_merge_rules: props.modelValue.filter((rule) => rule.sources.length > 0),
}))

const errorRuleIds = computed(() => {
  const names = new Map<string, string>()
  const sources = new Map<string, string>()
  const invalid = new Set<string>()
  for (const rule of props.modelValue) {
    const name = rule.name.trim()
    if (!name || names.has(name)) invalid.add(rule.id)
    names.set(name, rule.id)
    if (rule.dimension_signature.join('|') !== signature.value.join('|') || !rule.sources.length) invalid.add(rule.id)
    for (const source of rule.sources) {
      const key = JSON.stringify(signature.value.map((field) => source.values[field]))
      if (sources.has(key) && sources.get(key) !== rule.id) invalid.add(rule.id)
      sources.set(key, rule.id)
    }
  }
  for (const item of props.errors || []) {
    if (item.rule_id) invalid.add(item.rule_id)
  }
  return [...invalid]
})

function replaceRule(nextRule: DimensionMergeRule) {
  emit('update:modelValue', props.modelValue.map((rule) => rule.id === nextRule.id ? nextRule : rule))
  preview.value = null
}

function createRule() {
  if (!signature.value.length) {
    ElMessage.warning('请先在字段编排中添加至少一个维度字段')
    return
  }
  const values = Object.fromEntries(signature.value.map((field) => [field, '']))
  const modes = Object.fromEntries(signature.value.map((field) => [field, 'custom' as const]))
  const rule: DimensionMergeRule = {
    id: globalThis.crypto?.randomUUID?.() || `merge-${Date.now()}`,
    name: `归并规则 ${props.modelValue.length + 1}`,
    dimension_signature: [...signature.value],
    sources: [],
    target: { values, modes },
  }
  emit('update:modelValue', [...props.modelValue, rule])
  selectedId.value = rule.id
}

async function removeRule(id: string) {
  const rule = props.modelValue.find((item) => item.id === id)
  if (!rule) return
  await ElMessageBox.confirm(`确认删除归并规则“${rule.name}”？`, '删除归并规则', { type: 'warning' })
  const next = props.modelValue.filter((item) => item.id !== id)
  emit('update:modelValue', next)
  selectedId.value = next[0]?.id || ''
  preview.value = null
}

async function loadPreview() {
  const rule = selectedRule.value
  if (!rule || !props.datasetId) return
  previewing.value = true
  try {
    preview.value = await reportsApi.previewDimensionMerge({
      report_id: props.reportId,
      dataset_id: props.datasetId,
      scope_strategy: props.scopeStrategy,
      config: searchConfig.value,
      dimension_signature: signature.value,
      rule_id: rule.id,
      page: 1,
      page_size: 100,
    })
  } finally {
    previewing.value = false
  }
}

watch(
  () => props.modelValue.map((item) => item.id),
  (ids) => {
    if (!ids.includes(selectedId.value)) selectedId.value = ids[0] || ''
  },
  { immediate: true },
)
</script>

<template>
  <div class="merge-config">
    <el-alert v-if="errors?.length" type="error" :closable="false" show-icon>
      <template #title>维度归并配置存在 {{ errors.length }} 项问题</template>
      <ul class="error-list" role="alert">
        <li v-for="(item, index) in errors" :key="`${item.code}-${item.rule_id}-${index}`">
          {{ item.message || item.code }}<span v-if="item.field">（{{ item.field }}）</span>
        </li>
      </ul>
    </el-alert>
    <el-alert v-if="!aggregate" type="warning" :closable="false" show-icon>
      <template #title>维度归并仅适用于汇总表</template>
      <template #default>
        <span v-if="modelValue.length">请删除全部归并规则后再保存为明细表。</span>
        <el-button v-else link type="primary" @click="emit('openRules')">去统计规则切换为汇总表</el-button>
      </template>
    </el-alert>
    <el-alert v-if="structuralReshape" type="error" :closable="false" show-icon>
      <template #title>维度归并不能与列转行或行转列同时启用</template>
      <el-button link type="primary" @click="emit('openReshape')">去数据重塑处理</el-button>
    </el-alert>

    <div class="merge-workspace">
      <ReportDimensionMergeRuleList
        :rules="modelValue"
        :selected-id="selectedId"
        :error-rule-ids="errorRuleIds"
        @select="selectedId = $event"
        @add="createRule"
        @remove="removeRule"
      />

      <main v-if="selectedRule" class="rule-editor">
        <div class="editor-head">
          <div>
            <strong>编辑归并规则</strong>
            <span>完整组合映射后，全部指标按原统计规则重新汇总</span>
          </div>
          <el-button :loading="previewing" @click="loadPreview">影响预览</el-button>
        </div>

        <el-form label-position="top">
          <el-form-item label="规则名称" :error="!selectedRule.name.trim() ? '请输入规则名称' : ''">
            <el-input
              :model-value="selectedRule.name"
              maxlength="128"
              show-word-limit
              @update:model-value="replaceRule({ ...selectedRule, name: $event })"
            />
          </el-form-item>
        </el-form>

        <ReportDimensionCombinationPicker
          :report-id="reportId"
          :dataset-id="datasetId"
          :scope-strategy="scopeStrategy"
          :config="searchConfig"
          :dimensions="dimensions"
          :model-value="selectedRule.sources"
          :current-rule-name="selectedRule.name"
          @update:model-value="replaceRule({ ...selectedRule, sources: $event })"
        />

        <ReportDimensionMergeTargetEditor
          :model-value="selectedRule.target"
          :dimensions="dimensions"
          :sources="selectedRule.sources"
          @update:model-value="replaceRule({ ...selectedRule, target: $event as DimensionMergeTarget })"
        />

        <el-alert v-if="preview" type="info" :closable="false" show-icon>
          <template #title>
            {{ preview.source_count }} 个来源组合，当前范围命中 {{ preview.matched_combination_count }} 个
          </template>
          <template #default>
            {{ preview.collides_with_existing ? '结果与现有组合相同，将自动汇总。' : '结果为当前报表中的新组合。' }}
          </template>
        </el-alert>
      </main>
      <el-empty v-else class="workspace-empty" description="新建规则后开始配置" />
    </div>
  </div>
</template>

<style scoped>
.merge-config { min-width: 0; max-width: 100%; display: grid; gap: 12px; min-height: 620px; }
.merge-workspace { width: 100%; min-width: 0; max-width: 100%; min-height: 600px; display: flex; border: 1px solid var(--color-border-light); border-radius: 8px; background: #fff; overflow: hidden; }
.rule-editor { min-width: 0; max-width: 100%; flex: 1; display: grid; align-content: start; gap: 14px; padding: 18px; overflow-x: hidden; overflow-y: auto; }
.editor-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.editor-head > div { display: grid; gap: 4px; }
.editor-head span { color: var(--color-text-secondary); font-size: 13px; }
.workspace-empty { flex: 1; }
.error-list { margin: 8px 0 0; padding-left: 20px; }
.error-list li + li { margin-top: 4px; }
@media (max-width: 768px) { .merge-workspace { flex-direction: column; } }
</style>
