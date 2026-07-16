<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CircleCheck, CircleClose, Refresh } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'
import { getWarehouseFeatures, listL4Approvals, createL4Approval, approveL4Approval, rejectL4Approval, revokeL4Approval, listMetrics, getL4Timeline, rollbackL4Metric, getL4Status, type L4AutoApproval, type MetricListItem } from '@/api/warehouse'

const userStore = useUserStore()
const isAdmin = userStore.hasOp('warehouse.metrics', 'U')  // U=更新权限 → 管理员

const featureEnabled = ref(false)
const loading = ref(true)
const approvals = ref<L4AutoApproval[]>([])
const emergencyStopped = ref(false)

const showCreate = ref(false)
const creating = ref(false)
const createForm = ref({ metric_id: undefined as number | undefined, max_auto_frequency: 1, auto_rollback_enabled: true, reason: '' })
const metrics = ref<MetricListItem[]>([])

const showTimeline = ref(false)
const timelineMetricId = ref<number | null>(null)
const timelineData = ref<any>(null)

const RISK_LABELS: Record<string, string> = { low: '低风险', medium: '中风险', high: '高风险' }
const STATUS_LABELS: Record<string, string> = { pending: '审批中', approved: '已通过', rejected: '已驳回', revoked: '已撤销' }
const STATUS_TAG: Record<string, string> = { pending: 'warning', approved: 'success', rejected: 'info', revoked: 'info' }

async function load() {
  loading.value = true
  try {
    const f = await getWarehouseFeatures()
    featureEnabled.value = f.l4_full_auto
    if (featureEnabled.value) {
      approvals.value = await listL4Approvals()
      try { const s = await getL4Status(); emergencyStopped.value = s?.emergency_stop || false } catch { }
    }
  } catch { featureEnabled.value = false; approvals.value = [] }
  finally { loading.value = false }
}

async function doApprove(a: L4AutoApproval) {
  try { await approveL4Approval(a.id); ElMessage.success(`已通过 ${a.metric_name}`); await load() } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '操作失败') }
}
async function doReject(a: L4AutoApproval) {
  try {
    const { value } = await ElMessageBox.prompt('驳回原因（可选）', '驳回试点申请', { confirmButtonText: '确定驳回', cancelButtonText: '取消' })
    await rejectL4Approval(a.id, value || undefined)
    ElMessage.success(`已驳回 ${a.metric_name}`); await load()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '操作失败') }
}
async function doRevoke(a: L4AutoApproval) {
  try {
    await ElMessageBox.confirm(`确定撤销 ${a.metric_name} 的试点？`, '确认撤销', { type: 'warning' })
    await revokeL4Approval(a.id); ElMessage.success('已撤销'); await load()
  } catch (e: any) { if (e !== 'cancel') ElMessage.error(e?.response?.data?.detail || '操作失败') }
}
async function openCreate() {
  try { const r = await listMetrics({ page: 1, page_size: 100 }); metrics.value = r.items || [] } catch { metrics.value = [] }
  createForm.value = { metric_id: undefined, max_auto_frequency: 1, auto_rollback_enabled: true, reason: '' }
  showCreate.value = true
}
async function doCreate() {
  if (!createForm.value.metric_id) { ElMessage.warning('请选择指标'); return }
  creating.value = true
  try {
    await createL4Approval({ metric_id: createForm.value.metric_id, max_auto_frequency: createForm.value.max_auto_frequency, auto_rollback_enabled: createForm.value.auto_rollback_enabled, reason: createForm.value.reason })
    ElMessage.success('试点申请已提交'); showCreate.value = false; await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '操作失败') }
  finally { creating.value = false }
}
async function openTimeline(metricId: number) {
  timelineMetricId.value = metricId
  showTimeline.value = true
  try { timelineData.value = await getL4Timeline(metricId) } catch { timelineData.value = null }
}
const rollbackTarget = ref<any>(null)
const showRollbackConfirm = ref(false)

async function doRollback(row: any) {
  try {
    const tl = await getL4Timeline(row.metric_id)
    rollbackTarget.value = { metric_name: row.metric_name || row.metric_code || `#${row.metric_id}`, metric_id: row.metric_id, timeline: tl }
    showRollbackConfirm.value = true
  } catch (e: any) { ElMessage.error('无法加载审计信息') }
}

async function confirmRollback() {
  if (!rollbackTarget.value) return
  try {
    const r = await rollbackL4Metric(rollbackTarget.value.metric_id)
    ElMessage.success(r.message || '回滚完成')
    showRollbackConfirm.value = false
    await load()
  } catch (e: any) { ElMessage.error(e?.response?.data?.detail || '操作失败') }
}

onMounted(load)
</script>

<template>
  <div>
    <el-alert v-if="!featureEnabled && !loading" type="info" :closable="false" show-icon style="margin-bottom:12px">
      <template #title>L4 全自动级联能力当前未启用</template>
      请先开启 <code>WAREHOUSE_FEATURE_L4_FULL_AUTO=true</code>，并完成 Z0306 专项验收后开放试点。
    </el-alert>

    <div v-if="featureEnabled" style="margin-bottom:12px;display:flex;gap:8px">
      <el-button v-if="isAdmin" type="primary" size="small" :icon="CircleCheck" @click="openCreate">新建试点申请</el-button>
      <el-button size="small" :icon="Refresh" @click="load">刷新</el-button>
      <span v-if="!isAdmin" style="font-size:12px;color:#909399;line-height:32px">查看模式 — 仅管理员可管理试点申请</span>
    </div>

    <el-table v-if="featureEnabled" :data="approvals" v-loading="loading" border stripe size="default" empty-text="暂无试点申请">
      <el-table-column label="指标" min-width="160">
        <template #default="{ row }">{{ row.metric_name || row.metric_code }}<span style="color:#909399;margin-left:4px">#{{ row.metric_id }}</span></template>
      </el-table-column>
      <el-table-column prop="requested_by" label="申请人" width="80" />
      <el-table-column label="风险等级" width="90">
        <template #default="{ row }"><el-tag :type="row.risk_level === 'high' ? 'danger' : row.risk_level === 'medium' ? 'warning' : 'success'" size="small">{{ RISK_LABELS[row.risk_level] || row.risk_level }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="max_auto_frequency" label="频率/天" width="75" />
      <el-table-column label="状态" width="80">
        <template #default="{ row }"><el-tag :type="STATUS_TAG[row.status]" size="small">{{ STATUS_LABELS[row.status] || row.status }}</el-tag></template>
      </el-table-column>
      <el-table-column prop="approved_by" label="审批人" width="80" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="row.status === 'pending' && isAdmin" type="primary" size="small" @click="doApprove(row)">通过</el-button>
          <el-button v-if="row.status === 'pending' && isAdmin" type="warning" size="small" @click="doReject(row)">驳回</el-button>
          <el-button v-if="['pending','approved'].includes(row.status) && isAdmin" size="small" @click="doRevoke(row)">撤销</el-button>
          <el-button size="small" @click="openTimeline(row.metric_id)">审计</el-button>
          <el-button size="small" type="danger" @click="doRollback(row.metric_id)">回滚</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 新建申请 -->
    <el-dialog v-model="showCreate" title="新建 L4 试点申请" width="500px">
      <el-form label-position="top">
        <el-form-item label="选择指标"><el-select v-model="createForm.metric_id" filterable style="width:100%" placeholder="请选择指标"><el-option v-for="m in metrics" :key="m.id" :label="`${m.metric_name || m.metric_code} #${m.id}`" :value="m.id" /></el-select></el-form-item>
        <el-form-item label="每日最大执行次数"><el-input-number v-model="createForm.max_auto_frequency" :min="1" :max="100" style="width:100%" /></el-form-item>
        <el-form-item label="失败自动回滚"><el-switch v-model="createForm.auto_rollback_enabled" /></el-form-item>
        <el-form-item label="申请理由"><el-input v-model="createForm.reason" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="showCreate = false">取消</el-button><el-button type="primary" :loading="creating" @click="doCreate">提交申请</el-button></template>
    </el-dialog>

    <!-- 回滚确认 -->
    <el-dialog v-model="showRollbackConfirm" title="确认回滚" width="480px">
      <template v-if="rollbackTarget">
        <el-alert type="warning" :closable="false" show-icon title="即将回滚最近一次 L4 自动发布的全部资产" style="margin-bottom:12px" />
        <div style="font-size:13px;line-height:1.8">
          <div><strong>指标：</strong>{{ rollbackTarget.metric_name }}</div>
          <div><strong>将撤回资产：</strong></div>
          <ul style="margin:4px 0;padding-left:16px">
            <li>DWS View（最近一次自动发布版本）</li>
            <li>ADS View（最近一次自动发布版本）</li>
            <li>BI/帆软消费契约（恢复到上一版本）</li>
          </ul>
          <div style="color:#F56C6C"><strong>注意：</strong>回滚后下游报表可能暂时看不到最新数据，请确认后再操作。</div>
        </div>
      </template>
      <template #footer>
        <el-button @click="showRollbackConfirm = false">取消</el-button>
        <el-button type="danger" @click="confirmRollback">确定回滚</el-button>
      </template>
    </el-dialog>

    <!-- 审计时间线 -->
    <el-drawer v-model="showTimeline" title="L4 执行审计" size="500px">
      <div v-if="timelineData?.events?.length">
        <div v-for="e in timelineData.events.slice(0, 20)" :key="e.execution_id" style="margin-bottom:12px;padding:10px;background:#f5f7fa;border-radius:6px">
          <div style="display:flex;justify-content:space-between;font-size:12px">
            <span>{{ e.trigger_type }}</span>
            <el-tag size="small" :type="e.status === 'success' ? 'success' : e.status === 'failed' ? 'danger' : 'warning'">{{ e.status }}</el-tag>
          </div>
          <div style="font-size:11px;color:#909399;margin-top:4px">{{ formatDateTime(e.started_at) || '-' }} → {{ formatDateTime(e.finished_at) || '-' }}</div>
          <div v-if="e.steps?.length" style="margin-top:6px">
            <div v-for="s in e.steps" :key="s.step" style="font-size:11px;padding:2px 0">{{ s.step }}: {{ s.status }}</div>
          </div>
        </div>
      </div>
      <el-empty v-else description="暂无 L4 执行记录" />
    </el-drawer>
  </div>
</template>
