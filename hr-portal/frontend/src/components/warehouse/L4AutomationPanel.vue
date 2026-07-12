<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { DataAnalysis, Refresh, ArrowRight } from '@element-plus/icons-vue'
import { getL4CascadeRule, updateL4CascadeRule, getL4Timeline, rollbackL4Metric, listL4Approvals, type L4CascadeRule, type L4AutoApproval } from '@/api/warehouse'

const props = defineProps<{ metricId: number }>()

const l4Approval = ref<L4AutoApproval | null>(null)
const l4Rule = ref<L4CascadeRule | null>(null)
const loading = ref(true)
const saving = ref(false)
const expanded = ref(false)
const timeline = ref<any>(null)

const TRIGGERS = [
  { value: 'dwd_data_refreshed', label: 'DWD 数据刷新后' },
  { value: 'ods_table_data_changed', label: 'ODS 数据变更后' },
  { value: 'dwd_schema_changed', label: 'DWD 结构变更后' },
  { value: 'dwd_metadata_changed', label: 'DWD 元数据变更后' },
  { value: 'metric_saved', label: '指标保存/发布后' },
]

async function load() {
  if (!props.metricId) return
  loading.value = true
  try {
    const approvals = await listL4Approvals({ metric_id: props.metricId })
    l4Approval.value = approvals.find((a: L4AutoApproval) => a.status === 'approved') || null
    if (l4Approval.value) {
      l4Rule.value = await getL4CascadeRule(props.metricId)
      timeline.value = await getL4Timeline(props.metricId)
    }
  } catch { l4Approval.value = null; l4Rule.value = null }
  finally { loading.value = false }
}

function toggleTrigger(t: string) {
  if (!l4Rule.value) return
  const idx = l4Rule.value.trigger_conditions.indexOf(t)
  if (idx >= 0) l4Rule.value.trigger_conditions.splice(idx, 1)
  else l4Rule.value.trigger_conditions.push(t)
}

async function saveRule() {
  if (!l4Rule.value) return
  saving.value = true
  try {
    await updateL4CascadeRule(props.metricId, {
      trigger_conditions: l4Rule.value.trigger_conditions,
      max_frequency: l4Rule.value.max_frequency,
      auto_rollback: l4Rule.value.auto_rollback,
      notify_on_success: l4Rule.value.notify_on_success,
      notify_on_block: l4Rule.value.notify_on_block,
      notify_on_fail: l4Rule.value.notify_on_fail,
    })
    ElMessage.success('L4 规则已保存')
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '保存失败') }
  finally { saving.value = false }
}

async function doRollback() {
  try {
    const { ElMessageBox } = await import('element-plus')
    await ElMessageBox.confirm('确定回滚该指标最近一次 L4 自动发布？', '确认回滚', { type: 'warning' })
    const r = await rollbackL4Metric(props.metricId)
    ElMessage.success(r.message || '回滚完成')
    await load()
  } catch { /* cancelled */ }
}

const STATUS_LABELS: Record<string, string> = { pending: '审批中', approved: '已通过', rejected: '已驳回', revoked: '已撤销' }

watch(() => props.metricId, () => { if (props.metricId) load() }, { immediate: false })
</script>

<template>
  <div v-if="!loading" class="l4-panel">
    <div class="l4-header" @click="expanded = !expanded; if (expanded) load()">
      <div class="l4-header-left">
        <el-icon><DataAnalysis /></el-icon>
        <span>L4 全自动级联</span>
        <el-tag v-if="l4Approval" type="success" size="small">试点中</el-tag>
        <el-tag v-else type="info" size="small">未开放</el-tag>
      </div>
      <el-icon class="expand-icon" :class="{ rotated: expanded }"><ArrowRight /></el-icon>
    </div>

    <div v-show="expanded" class="l4-body">
      <!-- 未开放 -->
      <div v-if="!l4Approval" style="font-size:12px;color:#909399;padding:12px">
        该指标尚未开通 L4 全自动级联试点。前往 <router-link to="/warehouse/automation">自动化配置</router-link> 申请审批。
      </div>

      <!-- 已审批 -->
      <template v-else-if="l4Rule">
        <div style="font-size:12px;color:#606266;margin-bottom:8px">
          <span>风险等级：<el-tag :type="l4Approval.risk_level === 'low' ? 'success' : 'warning'" size="small">{{ l4Approval.risk_level === 'low' ? '低风险' : l4Approval.risk_level === 'medium' ? '中风险' : '高风险' }}</el-tag></span>
          <span style="margin-left:12px">审批人：{{ l4Approval.approved_by || '-' }}</span>
          <span style="margin-left:12px">频率上限：{{ l4Approval.max_auto_frequency }}/天</span>
        </div>

        <div class="rule-row"><span class="rule-label">触发条件</span>
          <el-checkbox v-for="t in TRIGGERS" :key="t.value" :model-value="l4Rule.trigger_conditions.includes(t.value)" @change="() => toggleTrigger(t.value)" size="small">{{ t.label }}</el-checkbox>
        </div>

        <div class="rule-row"><span class="rule-label">每日最大执行</span>
          <el-input-number v-model="l4Rule.max_frequency" :min="1" :max="100" size="small" style="width:100px" />
          <span style="font-size:11px;color:#909399;margin-left:6px">超出后退化为草稿模式</span>
        </div>

        <div class="rule-row"><span class="rule-label">失败自动回滚</span><el-switch v-model="l4Rule.auto_rollback" size="small" /></div>

        <div class="rule-row"><span class="rule-label">通知</span>
          <el-checkbox v-model="l4Rule.notify_on_success" size="small">成功</el-checkbox>
          <el-checkbox v-model="l4Rule.notify_on_block" size="small">阻断</el-checkbox>
          <el-checkbox v-model="l4Rule.notify_on_fail" size="small">失败</el-checkbox>
        </div>

        <div class="rule-actions">
          <el-button type="primary" size="small" @click="saveRule" :loading="saving">保存规则</el-button>
          <el-button size="small" type="danger" @click="doRollback">一键回滚</el-button>
        </div>
      </template>

      <!-- 审计时间线 -->
      <div v-if="timeline?.events?.length" style="margin-top:8px;border-top:1px solid #ebeef5;padding-top:8px">
        <div style="font-size:12px;font-weight:600;color:#606266;margin-bottom:6px">最近执行记录</div>
        <div v-for="e in timeline.events.slice(0, 5)" :key="e.execution_id" style="font-size:11px;padding:3px 0;color:#909399">
          <el-tag size="small" :type="e.status === 'success' ? 'success' : 'danger'">{{ e.status }}</el-tag>
          <span style="margin-left:6px">{{ e.trigger_type }}</span>
          <span style="margin-left:6px">{{ e.started_at?.slice(0, 16) || '-' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.l4-panel { border: 1px solid #e4e7ed; border-radius: 8px; margin-top: 12px; background: #fff; }
.l4-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; cursor: pointer; }
.l4-header:hover { background: #f5f7fa; }
.l4-header-left { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; }
.expand-icon { transition: transform 0.2s; }
.expand-icon.rotated { transform: rotate(90deg); }
.l4-body { padding: 12px 14px; border-top: 1px solid #ebeef5; }
.rule-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.rule-label { font-size: 12px; color: #606266; font-weight: 500; min-width: 90px; }
.rule-actions { display: flex; gap: 6px; margin-top: 8px; padding-top: 8px; border-top: 1px solid #ebeef5; }
</style>
