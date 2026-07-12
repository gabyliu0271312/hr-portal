<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  DataAnalysis, Refresh, View, Check, CircleCheck, CircleClose,
  Warning, InfoFilled, Loading, ArrowRight,
} from '@element-plus/icons-vue'
import {
  diagnoseMetric, generateDwsDraft, previewMetricDraft,
  publishMetricDraft, rollbackMetricDraft,
  generateAdsDraft, getAdsImpact, getBiContract,
  getMetricChangePlan, getMetricAutomationTimeline,
  getWarehouseFeatures, getL4CascadeRule, updateL4CascadeRule,
  listL4Approvals,
  type MetricAutomationDiagnosis, type MetricAutomationPreview,
  type L4CascadeRule, type L4AutoApproval,
} from '@/api/warehouse'

const props = defineProps<{ metricId: number; metricCode: string; metricName: string }>()

const featureEnabled = ref(false)
const loadingFeature = ref(true)
const expanded = ref(false)

const diagnosis = ref<MetricAutomationDiagnosis | null>(null)
const diagnosing = ref(false)

const dwsDraft = ref<any>(null)
const generating = ref(false)

const preview = ref<MetricAutomationPreview | null>(null)
const previewing = ref(false)

const publishing = ref(false)
const publishedResult = ref<any>(null)

const adsDraft = ref<any>(null)
const generatingAds = ref(false)

const timeline = ref<any[]>([])
const timelineSummary = ref<Record<string, number>>({})
const loadingTimeline = ref(false)

// ---- L4 全自动级联规则配置 ----
const l4FeatureEnabled = ref(false)
const l4Approval = ref<L4AutoApproval | null>(null)
const l4Rule = ref<L4CascadeRule | null>(null)
const l4RuleLoading = ref(false)
const l4RuleSaving = ref(false)
const l4RuleExpanded = ref(false)

const TRIGGER_OPTIONS = [
  { value: 'dwd_data_refreshed', label: 'DWD 数据刷新后' },
  { value: 'ods_table_data_changed', label: 'ODS 数据变更后' },
  { value: 'dwd_schema_changed', label: 'DWD 结构变更后' },
  { value: 'dwd_metadata_changed', label: 'DWD 元数据变更后' },
  { value: 'metric_saved', label: '指标保存/发布后' },
]

async function loadL4Config() {
  if (!props.metricId) return
  try {
    const f = await getWarehouseFeatures()
    l4FeatureEnabled.value = f.l4_full_auto
    if (!l4FeatureEnabled.value) return

    // 查审批状态
    const approvals = await listL4Approvals({ metric_id: props.metricId })
    l4Approval.value = approvals.find((a: L4AutoApproval) => a.status === 'approved') || null

    if (l4Approval.value) {
      l4Rule.value = await getL4CascadeRule(props.metricId)
      // 确保默认值
      if (!l4Rule.value.trigger_conditions) l4Rule.value.trigger_conditions = []
      if (!l4Rule.value.risk_strategies) l4Rule.value.risk_strategies = {}
      if (!l4Rule.value.max_frequency) l4Rule.value.max_frequency = 1
    }
  } catch { l4FeatureEnabled.value = false }
}

function toggleTrigger(trigger: string) {
  if (!l4Rule.value) return
  const idx = l4Rule.value.trigger_conditions.indexOf(trigger)
  if (idx >= 0) {
    l4Rule.value.trigger_conditions.splice(idx, 1)
  } else {
    l4Rule.value.trigger_conditions.push(trigger)
  }
}

async function saveL4Rule() {
  if (!props.metricId || !l4Rule.value) return
  l4RuleSaving.value = true
  try {
    await updateL4CascadeRule(props.metricId, {
      trigger_conditions: l4Rule.value.trigger_conditions,
      risk_strategies: l4Rule.value.risk_strategies,
      max_frequency: l4Rule.value.max_frequency,
      auto_rollback: l4Rule.value.auto_rollback,
      notify_on_success: l4Rule.value.notify_on_success,
      notify_on_block: l4Rule.value.notify_on_block,
      notify_on_fail: l4Rule.value.notify_on_fail,
    })
    ElMessage.success('L4 级联规则已保存')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '保存失败')
  }
  finally { l4RuleSaving.value = false }
}

const ACTION_LABELS: Record<string, string> = {
  diagnose: '解析诊断', generate_dws_draft: '生成 DWS 草稿', preview: '预览门禁',
  quality_gate: '质量门禁', publish_dws: '发布 DWS', rollback_dws: '回滚 DWS',
  generate_ads_draft: '生成 ADS 草稿', publish_ads: '发布 ADS',
  impact_analysis: '影响分析', generate_bi_contract: '生成 BI 契约',
  set_refresh_policy: '设置刷新策略', rollback_ads: '回滚 ADS',
}
function actionLabel(action: string) { return ACTION_LABELS[action] || action }
function statusTag(status: string) { return status === 'success' ? 'success' : status === 'failed' ? 'danger' : status === 'blocked' ? 'warning' : 'info' }

// 步骤状态
type Step = 'diagnose' | 'dws_draft' | 'preview' | 'publish' | 'ads_draft' | 'done'
const currentStep = ref<Step>('diagnose')

async function loadFeatureFlag() {
  try { const f = await getWarehouseFeatures(); featureEnabled.value = f.metric_automation } catch { featureEnabled.value = false }
  finally { loadingFeature.value = false }
}

async function doDiagnose() {
  if (!props.metricId) return
  diagnosing.value = true
  diagnosis.value = null
  try {
    diagnosis.value = await diagnoseMetric(props.metricId)
    if (diagnosis.value.automatable) {
      currentStep.value = 'dws_draft'
      ElMessage.success('指标可自动化生成 DWS/ADS 草稿')
    } else {
      ElMessage.warning('该指标暂不支持自动化：' + (diagnosis.value.errors?.[0] || '未知原因'))
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '诊断失败')
  }
  finally { diagnosing.value = false }
}

async function doGenerateDws() {
  if (!props.metricId) return
  generating.value = true
  try {
    dwsDraft.value = await generateDwsDraft({ metric_id: props.metricId })
    currentStep.value = 'preview'
    ElMessage.success('DWS 草稿已生成')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '生成失败')
  }
  finally { generating.value = false }
}

async function doPreview() {
  if (!dwsDraft.value) return
  previewing.value = true
  try {
    preview.value = await previewMetricDraft({ draft_id: dwsDraft.value.draft_id, draft_type: 'dws' })
    currentStep.value = 'publish'
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '预览失败')
  }
  finally { previewing.value = false }
}

async function doPublish() {
  if (!dwsDraft.value) return
  try {
    await ElMessageBox.confirm(
      `确认发布 DWS View "${preview.value?.view_name || dwsDraft.value.aggregate_name}"？发布后将对下游可见。`,
      '确认发布', { confirmButtonText: '确定发布', cancelButtonText: '取消', type: 'warning' }
    )
    publishing.value = true
    publishedResult.value = await publishMetricDraft({
      draft_id: dwsDraft.value.draft_id,
      draft_type: 'dws',
      confirmed: true,
    })
    currentStep.value = 'ads_draft'
    ElMessage.success('DWS 已发布')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '发布失败')
  }
  finally { publishing.value = false }
}

async function doRollback() {
  if (!dwsDraft.value) return
  try {
    await ElMessageBox.confirm('确定回滚到上一版本？DWS View 将被删除。', '确认回滚', { type: 'warning' })
    await rollbackMetricDraft({ draft_id: dwsDraft.value.draft_id, draft_type: 'dws', target_version: 1 })
    currentStep.value = 'dws_draft'
    publishedResult.value = null
    ElMessage.success('已回滚')
  } catch (e: any) {
    if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '回滚失败')
  }
}

async function doGenerateAds() {
  if (!dwsDraft.value) return
  generatingAds.value = true
  try {
    adsDraft.value = await generateAdsDraft({
      source_type: 'dws_aggregate',
      source_id: dwsDraft.value.draft_id,
    })
    currentStep.value = 'done'
    ElMessage.success('ADS 草稿已生成')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || 'ADS 生成失败')
  }
  finally { generatingAds.value = false }
}

async function loadTimeline() {
  if (!props.metricId) return
  loadingTimeline.value = true
  try {
    const r = await getMetricAutomationTimeline(props.metricId)
    timeline.value = r.events || []
    timelineSummary.value = r.summary?.by_status || {}
  } catch { timeline.value = []; timelineSummary.value = {} }
  finally { loadingTimeline.value = false }
}

watch(() => props.metricId, () => {
  if (props.metricId) { currentStep.value = 'diagnose'; diagnosis.value = null; dwsDraft.value = null; preview.value = null; publishedResult.value = null }
})
watch(expanded, (val) => { if (val && props.metricId) { doDiagnose(); loadTimeline(); loadL4Config() } })
onMounted(() => { loadFeatureFlag() })

function stepClass(step: Step) {
  const order = ['diagnose', 'dws_draft', 'preview', 'publish', 'ads_draft', 'done']
  const cur = order.indexOf(currentStep.value)
  const s = order.indexOf(step)
  if (s < cur) return 'step-done'
  if (s === cur) return 'step-active'
  return 'step-pending'
}

function riskTagType(risk: string) { return risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'success' }
</script>

<template>
  <div class="ma-panel" v-if="!loadingFeature">
    <!-- Feature Flag 关闭 -->
    <el-alert v-if="!featureEnabled" type="info" :closable="false" show-icon title="指标自动化生成未启用" />

    <template v-else-if="metricId">
      <div class="ma-header" @click="expanded = !expanded">
        <div class="ma-title">
          <el-icon><DataAnalysis /></el-icon>
          <span>自动化生成 DWS/ADS</span>
          <el-tag v-if="currentStep !== 'diagnose'" size="small" type="warning" effect="dark">进行中</el-tag>
        </div>
        <el-icon class="expand-icon" :class="{ rotated: expanded }"><ArrowRight /></el-icon>
      </div>

      <div class="ma-body" v-show="expanded">
        <!-- L4 全自动级联规则 -->
        <div v-if="l4FeatureEnabled && l4Approval" class="l4-section">
          <div class="l4-header" @click="l4RuleExpanded = !l4RuleExpanded">
            <div class="l4-header-left">
              <el-icon><DataAnalysis /></el-icon>
              <span>L4 全自动级联规则</span>
              <el-tag type="success" size="small" effect="dark">试点中</el-tag>
              <span style="font-size:11px;color:#909399">风险: {{ l4Approval.risk_level }} | 频率上限: {{ l4Approval.max_auto_frequency }}/天</span>
            </div>
            <el-icon class="expand-icon" :class="{ rotated: l4RuleExpanded }"><ArrowRight /></el-icon>
          </div>
          <div class="l4-body" v-show="l4RuleExpanded" v-if="l4Rule">
            <div class="l4-row">
              <span class="l4-label">触发条件</span>
              <div class="l4-checks">
                <el-checkbox
                  v-for="t in TRIGGER_OPTIONS" :key="t.value"
                  :model-value="l4Rule.trigger_conditions.includes(t.value)"
                  @change="toggleTrigger(t.value)"
                >{{ t.label }}</el-checkbox>
              </div>
            </div>
            <div class="l4-row">
              <span class="l4-label">每日最大执行次数</span>
              <el-input-number v-model="l4Rule.max_frequency" :min="1" :max="100" size="small" style="width:120px" />
              <span style="font-size:11px;color:#909399;margin-left:8px">超出后自动退化为草稿模式</span>
            </div>
            <div class="l4-row">
              <span class="l4-label">失败自动回滚</span>
              <el-switch v-model="l4Rule.auto_rollback" size="small" />
              <span style="font-size:11px;color:#909399;margin-left:8px">DWS 已发布但 ADS 失败时，自动回滚 DWS</span>
            </div>
            <div class="l4-row">
              <span class="l4-label">通知设置</span>
              <div class="l4-checks">
                <el-checkbox v-model="l4Rule.notify_on_success">成功时通知</el-checkbox>
                <el-checkbox v-model="l4Rule.notify_on_block">阻断时通知</el-checkbox>
                <el-checkbox v-model="l4Rule.notify_on_fail">失败时通知</el-checkbox>
              </div>
            </div>
            <div class="l4-row">
              <span class="l4-label">风险状态策略</span>
              <div style="font-size:12px;color:#606266">
                <div>低风险 → 自动发布</div>
                <div>中风险 → 自动发布 + 通知</div>
                <div>高风险 → 阻断，生成草稿待确认</div>
              </div>
            </div>
            <div class="l4-actions">
              <el-button type="primary" size="small" @click="saveL4Rule" :loading="l4RuleSaving">保存规则</el-button>
            </div>
          </div>
        </div>

        <div v-else-if="l4FeatureEnabled && !l4Approval" class="l4-section" style="padding:10px 16px;font-size:12px;color:#909399">
          <span>L4 全自动未开通 — 前往 <el-link type="primary" :underline="false" href="/warehouse/automation" @click.prevent style="font-size:12px">自动化配置 → L4 全自动试点</el-link> 申请审批</span>
        </div>

        <!-- 步骤条 -->
        <div class="ma-steps">
          <div :class="['step', stepClass('diagnose')]"><span class="step-dot">1</span>解析诊断</div>
          <div :class="['step', stepClass('dws_draft')]"><span class="step-dot">2</span>DWS草稿</div>
          <div :class="['step', stepClass('preview')]"><span class="step-dot">3</span>预览门禁</div>
          <div :class="['step', stepClass('publish')]"><span class="step-dot">4</span>发布DWS</div>
          <div :class="['step', stepClass('ads_draft')]"><span class="step-dot">5</span>ADS草稿</div>
          <div :class="['step', stepClass('done')]"><span class="step-dot">6</span>完成</div>
        </div>

        <!-- 诊断结果 -->
        <div v-if="diagnosis" class="ma-section">
          <div class="section-title">解析诊断</div>
          <div class="diag-grid">
            <div class="diag-item"><span class="label">可自动化</span><el-tag :type="diagnosis.automatable ? 'success' : 'danger'" size="small">{{ diagnosis.automatable ? '是' : '否' }}</el-tag></div>
            <div class="diag-item"><span class="label">来源数据集</span><span>{{ diagnosis.source_dataset_name || '-' }}</span></div>
            <div class="diag-item"><span class="label">维度字段</span><span>{{ diagnosis.dimension_fields?.join(', ') || '-' }}</span></div>
            <div class="diag-item"><span class="label">度量字段</span><span>{{ diagnosis.measure_fields?.join(', ') || '-' }}</span></div>
            <div class="diag-item"><span class="label">聚合函数</span><span>{{ diagnosis.aggregation_functions?.join(', ') || '-' }}</span></div>
          </div>
          <div v-if="diagnosis.errors?.length" class="diag-errors">
            <span v-for="e in diagnosis.errors" :key="e" class="err-item"><el-icon><CircleClose /></el-icon>{{ e }}</span>
          </div>
          <div v-if="diagnosis.warnings?.length" class="diag-warns">
            <span v-for="w in diagnosis.warnings" :key="w" class="warn-item"><el-icon><Warning /></el-icon>{{ w }}</span>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="ma-actions">
          <el-button size="default" @click="doDiagnose" :loading="diagnosing" :disabled="!diagnosis">
            <el-icon><Refresh /></el-icon>重新解析
          </el-button>
          <el-button v-if="diagnosis?.automatable" size="default" type="primary" @click="doGenerateDws" :loading="generating" :disabled="!!dwsDraft">
            <el-icon><DataAnalysis /></el-icon>生成 DWS 草稿
          </el-button>
          <el-button v-if="dwsDraft && !preview" size="default" type="primary" @click="doPreview" :loading="previewing">
            <el-icon><View /></el-icon>预览与门禁
          </el-button>
          <el-button v-if="preview && !preview.blocked && !publishedResult" size="default" type="success" @click="doPublish" :loading="publishing">
            <el-icon><Check /></el-icon>发布 DWS
          </el-button>
          <el-button v-if="publishedResult" size="default" type="warning" @click="doRollback">
            回滚 DWS
          </el-button>
          <el-button v-if="publishedResult && !adsDraft" size="default" type="primary" @click="doGenerateAds" :loading="generatingAds">
            生成 ADS 草稿
          </el-button>
        </div>

        <!-- 预览结果 -->
        <div v-if="preview" class="ma-section">
          <div class="section-title">预览与门禁</div>
          <div class="preview-info">
            <el-tag :type="riskTagType(preview.risk_level)" size="small">风险: {{ preview.risk_level }}</el-tag>
            <el-tag :type="preview.quality_status === 'pass' ? 'success' : preview.quality_status === 'fail' ? 'danger' : 'warning'" size="small">质量: {{ preview.quality_status }}</el-tag>
            <el-tag :type="preview.small_sample_risk === 'low' ? 'success' : preview.small_sample_risk === 'block' ? 'danger' : 'warning'" size="small">小样本: {{ preview.small_sample_risk }}</el-tag>
            <span style="font-size:12px;color:#909399">{{ preview.output_fields?.length || 0 }} 个输出字段</span>
          </div>
          <div v-if="preview.blocked" class="blocked-box">
            <el-alert type="error" :closable="false" title="发布已阻断">
              <template #default>
                <div v-for="r in preview.blocked_reasons" :key="r">{{ r }}</div>
              </template>
            </el-alert>
          </div>
          <div class="sql-box" v-if="preview.sql_summary">
            <div class="sql-label">SQL 摘要（只读）</div>
            <pre>{{ preview.sql_summary }}</pre>
          </div>
          <div v-if="preview.sample_rows?.length" class="sample-box">
            <div class="sql-label">数据样例（{{ preview.sample_rows.length }} 行）</div>
            <el-table :data="preview.sample_rows.slice(0, 5)" size="small" stripe max-height="200">
              <el-table-column v-for="c in preview.sample_columns.slice(0, 6)" :key="c" :prop="c" :label="c" min-width="100" />
            </el-table>
          </div>
        </div>

        <!-- 发布结果 -->
        <div v-if="publishedResult" class="ma-section">
          <div class="section-title">发布结果</div>
          <div class="publish-result">
            <el-tag type="success">{{ publishedResult.view_name }}</el-tag>
            <span style="font-size:12px;color:#909399">{{ publishedResult.output_fields_count }} 个输出字段</span>
          </div>
        </div>

        <!-- 审计时间线 -->
        <div v-if="timeline.length" class="ma-section">
          <div class="section-title">
            审计时间线
            <span style="font-size:11px;color:#909399;margin-left:8px">
              <template v-if="timelineSummary.success">成功 {{ timelineSummary.success }}&nbsp;</template>
              <template v-if="timelineSummary.failed">失败 {{ timelineSummary.failed }}&nbsp;</template>
              <template v-if="timelineSummary.blocked">阻断 {{ timelineSummary.blocked }}</template>
            </span>
          </div>
          <div class="timeline-list">
            <div v-for="e in timeline.slice(0, 10)" :key="e.id" class="tl-item">
              <span class="tl-time">{{ e.created_at?.slice(0, 16) || '-' }}</span>
              <el-tag size="small" :type="statusTag(e.status)">{{ e.status }}</el-tag>
              <span class="tl-act">{{ actionLabel(e.action) }}</span>
              <span v-if="e.message" class="tl-msg">{{ e.message?.substring(0, 80) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ma-panel { border: 1px solid #e4e7ed; border-radius: 8px; margin-top: 12px; background: #fff; }
.ma-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; cursor: pointer; user-select: none; }
.ma-header:hover { background: #f5f7fa; }
.ma-title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 14px; }
.expand-icon { transition: transform 0.2s; }
.expand-icon.rotated { transform: rotate(90deg); }
.ma-body { padding: 16px; border-top: 1px solid #ebeef5; }
.ma-steps { display: flex; gap: 0; margin-bottom: 16px; font-size: 12px; color: #909399; }
.step { flex: 1; text-align: center; padding: 8px 4px; border-bottom: 2px solid #e4e7ed; }
.step-dot { display: inline-block; width: 20px; height: 20px; line-height: 20px; border-radius: 50%; background: #e4e7ed; color: #909399; margin-right: 4px; font-size: 11px; }
.step-done { color: #67C23A; border-color: #67C23A; } .step-done .step-dot { background: #67C23A; color: #fff; }
.step-active { color: #409EFF; border-color: #409EFF; font-weight: 600; } .step-active .step-dot { background: #409EFF; color: #fff; }
.ma-section { margin-top: 12px; }
.section-title { font-size: 13px; font-weight: 600; color: #606266; margin-bottom: 8px; }
.diag-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 12px; }
.diag-item { display: flex; gap: 8px; }
.diag-item .label { color: #909399; min-width: 80px; }
.diag-errors, .diag-warns { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
.err-item { color: #F56C6C; display: flex; align-items: center; gap: 4px; }
.warn-item { color: #E6A23C; display: flex; align-items: center; gap: 4px; }
.ma-actions { display: flex; gap: 8px; margin-top: 12px; flex-wrap: wrap; }
.preview-info { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.blocked-box { margin-top: 8px; }
.sql-box { margin-top: 8px; background: #f5f7fa; border-radius: 4px; padding: 8px; }
.sql-label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.sql-box pre { margin: 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
.sample-box { margin-top: 8px; }
.publish-result { display: flex; gap: 8px; align-items: center; }
.timeline-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.tl-item { display: flex; gap: 8px; font-size: 12px; align-items: center; }
.tl-time { color: #909399; min-width: 100px; flex: none; }
.tl-act { color: #409EFF; min-width: 80px; flex: none; }
.tl-msg { color: #909399; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* L4 */
.l4-section { border: 1px dashed #67C23A; border-radius: 6px; margin-bottom: 12px; background: #f0f9eb; }
.l4-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; user-select: none; }
.l4-header:hover { background: #e8f5e0; }
.l4-header-left { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: #303133; }
.l4-body { padding: 12px 14px; border-top: 1px solid #d4edc9; }
.l4-row { display: flex; align-items: center; margin-bottom: 10px; }
.l4-label { min-width: 110px; font-size: 12px; color: #606266; font-weight: 500; }
.l4-checks { display: flex; gap: 12px; flex-wrap: wrap; }
.l4-actions { margin-top: 8px; padding-top: 8px; border-top: 1px solid #d4edc9; }
</style>
