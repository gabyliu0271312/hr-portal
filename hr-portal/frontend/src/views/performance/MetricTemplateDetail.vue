<template>
  <FullScreenModal title="编辑指标模板" :show-footer="false" @back="goBack">
    <template #actions>
      <PerformanceButton variant="primary" disabled aria-label="启用指标模板">启用</PerformanceButton>
      <PerformanceButton variant="outline-primary" aria-label="保存指标模板" :loading="saving" :disabled="!template" @click="save">保存</PerformanceButton>
      <PerformanceButton variant="secondary" aria-label="通过导入更新" @click="notify('通过导入更新功能将在后续开放')">
        <span class="metric-template-detail-button-icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 9h3v2H4v10h16V11h-2V9h3a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1Z" fill="currentColor" /><path d="M7 13.5a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-1Zm0 4a.5.5 0 0 1 .5-.5h9a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5v-1Zm9.692-10.598a.5.5 0 0 0 0-.707l-.707-.707-2.297 2.297.037-6.282a.5.5 0 0 0-.5-.497l-.947.003a.5.5 0 0 0-.498.497l-.036 6.109-2.12-2.121a.5.5 0 0 0-.708 0l-.707.707a.5.5 0 0 0 0 .707l3.89 3.89a1 1 0 0 0 1.413 0l3.89-3.89a.5.5 0 0 0 .003-.707Z" fill="currentColor" /></svg></span>
      </PerformanceButton>
    </template>

    <main class="metric-template-detail-content" aria-label="指标模板详情">
      <p v-if="loading" class="metric-template-detail-state" role="status">正在加载模板</p>
      <div v-else-if="error" class="metric-template-detail-state metric-template-detail-state--error" role="alert">
        <p>{{ error }}</p>
        <PerformanceButton variant="secondary" @click="load">重新加载</PerformanceButton>
      </div>
      <template v-else-if="template">
        <PerformanceSurfaceCard class="metric-template-detail-card">
          <div class="metric-template-detail-card__heading">
            <h1>基本信息</h1>
            <PerformanceIconButton icon="EditOutlined" label="编辑基本信息" text="编辑" variant="outlined" @click="editOpen = true" />
          </div>
          <div class="metric-template-detail-fields">
            <div><span class="metric-template-detail-label">名称</span><span class="metric-template-detail-value">{{ template.name }}</span></div>
            <div><span class="metric-template-detail-label">描述</span><span class="metric-template-detail-value">{{ template.description || '—' }}</span></div>
            <div><span class="metric-template-detail-label">分人群设置指标内容</span><span class="metric-template-detail-value">{{ template.audience_settings_enabled ? '是' : '否' }}</span></div>
          </div>
        </PerformanceSurfaceCard>

        <PerformanceSurfaceCard class="metric-template-detail-card metric-template-detail-card--score">
          <h2>指标总分</h2>
          <PerformanceRadioGroup v-model="scoreMethod" name="metric-total-score" aria-label="指标总分方式" :options="scoreOptions" />
        </PerformanceSurfaceCard>

        <PerformanceSurfaceCard class="metric-template-detail-card metric-template-detail-card--dimensions">
          <h2>指标维度</h2>
          <div v-if="template.dimensions?.length" class="metric-template-dimension-list">
            <div v-for="dimension in template.dimensions" :key="dimension.id" class="metric-template-dimension-item">
              <div>
                <strong>{{ dimension.name }}</strong>
                <span v-if="dimension.description">{{ dimension.description }}</span>
              </div>
              <span class="metric-template-dimension-meta">{{ dimension.need_weight ? '需设置权重' : '不设置权重' }}</span>
            </div>
          </div>
          <PerformanceButton variant="outline-primary" class="metric-template-detail-add" aria-label="添加指标维度" :disabled="dimensionLoading || dimensionSaving" @click="openDimensionDialog"><AddOutlinedIcon />添加指标维度</PerformanceButton>
        </PerformanceSurfaceCard>
      </template>
    </main>
    <MetricTemplateCreateDialog
      v-model="editOpen"
      mode="edit"
      :initial-value="template ? { name: template.name, description: template.description, byAudience: template.audience_settings_enabled } : null"
      :saving="editSaving"
      :error-message="editError"
      @confirm="saveBasicInfo"
    />
    <PerformanceMetricDimensionCreateDialog
      v-model="dimensionOpen"
      :metric-type-options="metricTypeOptions"
      :review-rule-options="reviewRuleOptions"
      :saving="dimensionSaving"
      :error-message="dimensionError"
      @confirm="saveDimension"
    />
    <div v-if="notice" class="metric-template-detail-notice" role="status">{{ notice }}</div>
  </FullScreenModal>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { performanceReviewRuleApi, performanceTemplateApi, type PerformanceMetricTemplateDimension, type PerformanceReviewRuleOption, type PerformanceTemplateDetail } from '@/api/performance'
import { performanceMetricTypesApi, type PerformanceMetricType } from '@/api/performanceMetricTypes'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceButton from '@/components/performance/PerformanceButton.vue'
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue'
import MetricTemplateCreateDialog, { type MetricTemplateDraft } from '@/components/performance/MetricTemplateCreateDialog.vue'
import PerformanceMetricDimensionCreateDialog, { type MetricDimensionDraft } from '@/components/performance/PerformanceMetricDimensionCreateDialog.vue'
import PerformanceRadioGroup from '@/components/performance/PerformanceRadioGroup.vue'
import PerformanceSurfaceCard from '@/components/performance/PerformanceSurfaceCard.vue'

const route = useRoute()
const router = useRouter()
const template = ref<PerformanceTemplateDetail | null>(null)
const loading = ref(false)
const error = ref('')
const notice = ref('')
const saving = ref(false)
const editOpen = ref(false)
const editSaving = ref(false)
const editError = ref('')
const dimensionOpen = ref(false)
const dimensionLoading = ref(false)
const dimensionSaving = ref(false)
const dimensionError = ref('')
const metricTypeOptions = ref<PerformanceMetricType[]>([])
const reviewRuleOptions = ref<PerformanceReviewRuleOption[]>([])
const scoreMethod = ref<'manual' | 'dimension_sum' | 'dimension_weighted' | 'custom_formula'>('manual')
const scoreOptions = [
  { value: 'manual', label: '手动评估' },
  { value: 'dimension_sum', label: '维度加和' },
  { value: 'dimension_weighted', label: '维度加权' },
  { value: 'custom_formula', label: '自定义公式' },
]

function templateId() {
  const value = Number(route.params.templateId)
  return Number.isInteger(value) && value > 0 ? value : null
}
function notify(message: string) { notice.value = message }
function goBack() { void router.push({ name: 'PerformanceMetricTemplates' }) }
async function openDimensionDialog() {
  if (!template.value || dimensionLoading.value) return
  dimensionLoading.value = true
  dimensionError.value = ''
  try {
    const [types, rules] = await Promise.all([
      performanceMetricTypesApi.list({ keyword: '', offset: 0, limit: 100 }),
      performanceReviewRuleApi.list(),
    ])
    metricTypeOptions.value = types.items
    reviewRuleOptions.value = rules
    dimensionOpen.value = true
  } catch (cause: any) {
    notice.value = cause?.response?.status === 403 ? '无权限配置指标维度' : '指标类型或评估规则加载失败，请重试'
  } finally { dimensionLoading.value = false }
}
function payload(dimensions: PerformanceMetricTemplateDimension[]) {
  const current = template.value!
  return {
    name: current.name,
    description: current.description,
    language: current.language,
    english_enabled: current.english_enabled,
    audience_settings_enabled: current.audience_settings_enabled,
    template_kind: 'metric' as const,
    score_method: scoreMethod.value,
    dimensions,
    calculation_enabled: current.calculation_enabled,
    selected_rules: current.selected_rules,
  }
}
async function saveDimension(draft: MetricDimensionDraft) {
  if (!template.value || dimensionSaving.value) return
  dimensionSaving.value = true
  dimensionError.value = ''
  try {
    template.value = await performanceTemplateApi.update(template.value.template_id, payload([...(template.value.dimensions || []), draft as PerformanceMetricTemplateDimension]))
    dimensionOpen.value = false
    notice.value = '指标维度已保存'
  } catch (cause: any) {
    dimensionError.value = cause?.response?.data?.detail?.message || (cause?.response?.status === 403 ? '无权限配置指标维度' : '指标维度保存失败，请重试')
  } finally { dimensionSaving.value = false }
}
async function load() {
  const id = templateId()
  if (!id) { error.value = '模板地址无效'; return }
  loading.value = true
  error.value = ''
  try { template.value = await performanceTemplateApi.get(id, 'metric'); scoreMethod.value = template.value.score_method || 'manual' } catch (cause: any) { error.value = cause?.response?.data?.detail?.message || '模板加载失败，请返回列表后重试' } finally { loading.value = false }
}
async function save() {
  if (!template.value || saving.value) return
  saving.value = true
  try {
    template.value = await performanceTemplateApi.update(template.value.template_id, payload(template.value.dimensions || []))
    notice.value = '保存成功'
  } catch (cause: any) { notice.value = cause?.response?.data?.detail?.message || '模板保存失败，请稍后重试' } finally { saving.value = false }
}
async function saveBasicInfo(draft: MetricTemplateDraft) {
  if (!template.value || editSaving.value) return
  editSaving.value = true
  editError.value = ''
  try {
    template.value = await performanceTemplateApi.update(template.value.template_id, {
      name: draft.name,
      description: draft.description,
      language: template.value.language,
      english_enabled: template.value.english_enabled,
      audience_settings_enabled: draft.byAudience,
      template_kind: 'metric',
      score_method: scoreMethod.value,
      dimensions: template.value.dimensions || [],
      calculation_enabled: template.value.calculation_enabled,
      selected_rules: template.value.selected_rules,
    })
    editOpen.value = false
    notice.value = '基本信息保存成功'
  } catch (cause: any) { editError.value = cause?.response?.data?.detail?.message || '基本信息保存失败，请稍后重试' } finally { editSaving.value = false }
}
onMounted(() => { void load() })
</script>

<style scoped>
.metric-template-detail-content { display: flex; min-width: 1024px; flex: 1 1 auto; flex-direction: column; align-items: center; gap: var(--spacing-7); padding: var(--spacing-5); box-sizing: border-box; overflow: auto; background: var(--color-bg-subtle); }
.metric-template-detail-card { width: 100%; max-width: 1494px; flex: 0 0 auto; padding: var(--spacing-5); }
.metric-template-detail-card__heading { display: flex; align-items: center; justify-content: space-between; }
.metric-template-detail-card h1, .metric-template-detail-card h2 { margin: 0; color: var(--color-text-primary); font-size: var(--font-size-lg); font-weight: 600; line-height: 24px; }
.metric-template-detail-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--spacing-5); margin-top: var(--spacing-2); }
.metric-template-detail-fields > div { display: flex; min-width: 0; flex-direction: column; gap: var(--spacing-2); }
.metric-template-detail-label { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; }
.metric-template-detail-value { overflow: hidden; color: var(--color-text-primary); font-size: var(--font-size-md); line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.metric-template-detail-card--score { min-height: 106px; }
.metric-template-detail-card--score :deep(.performance-radio-group) { margin-top: var(--spacing-2); }
.metric-template-detail-card--score :deep(.performance-radio-option) { color: var(--color-text-primary); }
.metric-template-detail-card--dimensions { position: relative; min-height: 148px; }
.metric-template-dimension-list { display: flex; flex-direction: column; gap: var(--spacing-2); margin-top: var(--spacing-4); }
.metric-template-dimension-item { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-4); padding: var(--spacing-3); border: 1px solid var(--color-line-control); border-radius: var(--radius-md); color: var(--color-text-primary); font-size: var(--font-size-md); }
.metric-template-dimension-item > div { display: flex; min-width: 0; flex-direction: column; }
.metric-template-dimension-item span { color: var(--color-text-secondary); }
.metric-template-dimension-meta { flex: 0 0 auto; }
.metric-template-detail-add { display: flex; width: 100%; min-height: 32px; align-items: center; justify-content: center; margin-top: var(--spacing-5); padding: 6px 11px; border: 1px dashed var(--color-primary-hover); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-primary-hover); cursor: pointer; }
.metric-template-detail-add:hover { background: var(--color-bg-hover); }
.metric-template-detail-add svg { width: 14px; height: 14px; }
.metric-template-detail-button-icon { display: inline-flex; align-items: center; margin-right: var(--spacing-2); line-height: 0; }
.metric-template-detail-button-icon svg { width: 14px; height: 14px; }
.metric-template-detail-state { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-4); margin: auto; color: var(--color-text-secondary); font-size: var(--font-size-md); }
.metric-template-detail-state p { margin: 0; }
.metric-template-detail-notice { position: fixed; right: var(--spacing-5); bottom: var(--spacing-5); z-index: var(--z-index-toast); max-width: calc(100vw - 48px); padding: 10px 16px; border: 1px solid var(--color-border-light); border-radius: var(--radius-md); background: var(--color-bg-card); color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: 22px; }
</style>
