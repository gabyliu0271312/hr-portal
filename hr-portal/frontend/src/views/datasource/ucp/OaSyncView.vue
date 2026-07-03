<template>
  <div class="oa-sync">
    <div class="page-header">
      <h2>OA 组织架构同步（OA Org Sync）</h2>
      <p class="desc">
        定时扫描 + 事件触发双模式同步北森与 OA 系统的组织架构。
        高风险动作（删除/移动）走 Phase 3-5 审批流程。
      </p>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <el-card class="stat-card">
        <div class="stat-label">总批次</div>
        <div class="stat-value">{{ runs.length }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">成功</div>
        <div class="stat-value text-success">{{ countByStatus('SUCCESS') }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">失败</div>
        <div class="stat-value text-danger">{{ countByStatus('FAILED') }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">待审批</div>
        <div class="stat-value text-warning">{{ totalApprovalPending }}</div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button :icon="Refresh" @click="loadRuns">刷新</el-button>
      <PermissionButton
        menu="datasource.ucp_executions"
        op="C"
        type="primary"
        :icon="VideoPlay"
        @click="openTriggerDialog"
      >
        触发同步
      </PermissionButton>
    </div>

    <!-- 批次列表 -->
    <el-table :data="runs" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="run_code" label="批次号" min-width="180" />
      <el-table-column prop="trigger_type" label="触发" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="triggerTagType(row.trigger_type)">
            {{ row.trigger_type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="差异统计" width="320">
        <template #default="{ row }">
          <span class="diff-summary">
            <el-tag size="small" type="success">+{{ row.created_count }}</el-tag>
            <el-tag size="small" type="warning">~{{ row.updated_count }}</el-tag>
            <el-tag size="small" type="info">↔{{ row.moved_count }}</el-tag>
            <el-tag size="small" type="danger">-{{ row.deleted_count }}</el-tag>
            <el-tag size="small">={{ row.unchanged_count }}</el-tag>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="approval_pending_count" label="待审批" width="80" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.approval_pending_count > 0" size="small" type="warning">
            {{ row.approval_pending_count }}
          </el-tag>
          <span v-else>0</span>
        </template>
      </el-table-column>
      <el-table-column prop="triggered_by" label="触发人" width="120" />
      <el-table-column prop="started_at" label="开始时间" width="170">
        <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openRunDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 批次详情 Dialog -->
    <el-dialog v-model="runDetailVisible" :title="`同步批次详情 - ${currentRun?.run_code || ''}`" width="900px">
      <div v-if="currentRun">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="批次号">
            <code>{{ currentRun.run_code }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(currentRun.status)">{{ currentRun.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="触发">{{ currentRun.trigger_type }}</el-descriptions-item>
          <el-descriptions-item label="源系统">{{ currentRun.source_system }}</el-descriptions-item>
          <el-descriptions-item label="目标系统">{{ currentRun.target_system }}</el-descriptions-item>
          <el-descriptions-item label="触发人">{{ currentRun.triggered_by || '-' }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatTime(currentRun.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束时间" :span="2">{{ formatTime(currentRun.ended_at) }}</el-descriptions-item>
          <el-descriptions-item v-if="currentRun.error_message" label="错误" :span="3">
            <span class="text-danger">{{ currentRun.error_message }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <h3 class="section-title">差异记录</h3>
        <div class="filter-row">
          <el-radio-group v-model="recordFilter" @change="loadRecords">
            <el-radio-button label="">全部</el-radio-button>
            <el-radio-button label="CREATED">新增</el-radio-button>
            <el-radio-button label="UPDATED">更新</el-radio-button>
            <el-radio-button label="MOVED">移动</el-radio-button>
            <el-radio-button label="DELETED">删除</el-radio-button>
            <el-radio-button label="UNCHANGED">无变化</el-radio-button>
          </el-radio-group>
        </div>
        <el-table :data="records" v-loading="recordsLoading" stripe size="small" border>
          <el-table-column prop="org_code" label="组织 Code" min-width="160" show-overflow-tooltip />
          <el-table-column prop="org_name" label="组织名称" min-width="160" show-overflow-tooltip />
          <el-table-column prop="parent_org_code" label="父组织" width="140">
            <template #default="{ row }">
              <code v-if="row.parent_org_code">{{ row.parent_org_code }}</code>
              <span v-else class="empty">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="diff_type" label="差异" width="100">
            <template #default="{ row }">
              <el-tag size="small" :type="diffTagType(row.diff_type)">{{ row.diff_type }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="process_status" label="处理" width="140">
            <template #default="{ row }">
              <el-tag size="small" :type="processTagType(row.process_status)">
                {{ row.process_status }}
              </el-tag>
              <el-link
                v-if="row.approval_id"
                type="warning"
                :underline="false"
                style="margin-left: 4px"
                @click="goApproval(row.approval_id)"
              >
                #{{ row.approval_id }}
              </el-link>
            </template>
          </el-table-column>
          <el-table-column prop="synced_at" label="同步时间" width="170">
            <template #default="{ row }">{{ formatTime(row.synced_at) }}</template>
          </el-table-column>
        </el-table>
      </div>
    </el-dialog>

    <!-- 触发同步 Dialog -->
    <el-dialog v-model="triggerVisible" title="触发 OA 同步" width="540px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        默认会从数据库派生北森组织列表 + 拉取 OA 当前组织。
        高风险动作（删除/移动）会生成审批请求。
      </el-alert>
      <el-form :model="triggerForm" label-width="100px">
        <el-form-item label="触发类型">
          <el-select v-model="triggerForm.trigger_type" style="width: 100%">
            <el-option label="MANUAL (手动)" value="MANUAL" />
            <el-option label="SCHEDULED (定时)" value="SCHEDULED" />
            <el-option label="EVENT (事件)" value="EVENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批模式">
          <el-select v-model="triggerForm.approval_mode" style="width: 100%">
            <el-option label="SINGLE (单人)" value="SINGLE" />
            <el-option label="ANY (或签)" value="ANY" />
            <el-option label="ALL (会签)" value="ALL" />
          </el-select>
        </el-form-item>
        <el-form-item label="审批人">
          <el-input
            v-model="approverInput"
            placeholder="user_id (回车添加)"
            @keyup.enter="addApprover"
          />
          <div class="approver-list">
            <el-tag
              v-for="(a, idx) in triggerForm.high_risk_approvers"
              :key="idx"
              closable
              @close="removeApprover(idx)"
              style="margin: 4px 4px 0 0"
            >
              {{ a.user_id }}{{ a.user_name ? ` (${a.user_name})` : '' }}
            </el-tag>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="triggerVisible = false">取消</el-button>
        <el-button type="primary" :loading="triggerSubmitting" @click="onTrigger">触发</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, VideoPlay } from '@element-plus/icons-vue'
import { oaSyncApi, type OaSyncRun, type OaSyncRecord, type ApprovalApprover } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const router = useRouter()
const runs = ref<OaSyncRun[]>([])
const loading = ref(false)

const runDetailVisible = ref(false)
const currentRun = ref<OaSyncRun | null>(null)
const records = ref<OaSyncRecord[]>([])
const recordsLoading = ref(false)
const recordFilter = ref('')

const triggerVisible = ref(false)
const triggerSubmitting = ref(false)
const approverInput = ref('')
const triggerForm = ref({
  trigger_type: 'MANUAL',
  approval_mode: 'ANY',
  high_risk_approvers: [] as ApprovalApprover[],
})

const totalApprovalPending = computed(() =>
  runs.value.reduce((sum, r) => sum + (r.approval_pending_count || 0), 0),
)

const countByStatus = (s: string) => runs.value.filter((r) => r.status === s).length

const statusTagType = (s: string) => {
  switch (s) {
    case 'SUCCESS': return 'success'
    case 'FAILED': return 'danger'
    case 'RUNNING': return 'warning'
    case 'PENDING': return 'info'
    default: return ''
  }
}

const triggerTagType = (s: string) => {
  switch (s) {
    case 'SCHEDULED': return 'primary'
    case 'EVENT': return 'warning'
    case 'MANUAL': return 'info'
    default: return ''
  }
}

const diffTagType = (s: string) => {
  switch (s) {
    case 'CREATED': return 'success'
    case 'UPDATED': return 'warning'
    case 'MOVED': return 'info'
    case 'DELETED': return 'danger'
    case 'UNCHANGED': return ''
    default: return ''
  }
}

const processTagType = (s: string) => {
  switch (s) {
    case 'SYNCED': return 'success'
    case 'FAILED': return 'danger'
    case 'APPROVAL_PENDING': return 'warning'
    case 'SKIPPED': return 'info'
    default: return ''
  }
}

const formatTime = (s: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '-')

const loadRuns = async () => {
  loading.value = true
  try {
    const items = await oaSyncApi.listRuns({ limit: 50, offset: 0 })
    runs.value = items
  } catch (e: any) {
    ElMessage.error('加载批次列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const openRunDetail = async (row: OaSyncRun) => {
  currentRun.value = row
  runDetailVisible.value = true
  recordFilter.value = ''
  await loadRecords()
}

const loadRecords = async () => {
  if (!currentRun.value) return
  recordsLoading.value = true
  try {
    const items = await oaSyncApi.listRecords(currentRun.value.id, {
      diff_type: recordFilter.value || undefined,
      limit: 200,
      offset: 0,
    })
    records.value = items
  } catch (e: any) {
    ElMessage.error('加载差异记录失败: ' + (e?.message || e))
  } finally {
    recordsLoading.value = false
  }
}

const goApproval = (id: number) => {
  router.push({ name: 'UcpApprovalInbox' })
  ElMessage.info(`请在审批工作台查看 #${id}`)
}

const openTriggerDialog = () => {
  triggerForm.value = {
    trigger_type: 'MANUAL',
    approval_mode: 'ANY',
    high_risk_approvers: [],
  }
  approverInput.value = ''
  triggerVisible.value = true
}

const addApprover = () => {
  const userId = approverInput.value.trim()
  if (!userId) return
  triggerForm.value.high_risk_approvers.push({ user_id: userId })
  approverInput.value = ''
}

const removeApprover = (idx: number) => {
  triggerForm.value.high_risk_approvers.splice(idx, 1)
}

const onTrigger = async () => {
  if (triggerForm.value.high_risk_approvers.length === 0) {
    ElMessage.warning('请至少添加一个审批人')
    return
  }
  triggerSubmitting.value = true
  try {
    const result = await oaSyncApi.trigger({
      trigger_type: triggerForm.value.trigger_type as 'MANUAL',
      approval_mode: triggerForm.value.approval_mode as 'ANY',
      high_risk_approvers: triggerForm.value.high_risk_approvers,
    })
    const approvalCount = Object.keys(result.approvals || {}).length
    ElMessage.success(
      `同步完成, 共 ${result.total_orgs} 个组织, 生成 ${approvalCount} 个审批请求`,
    )
    triggerVisible.value = false
    loadRuns()
  } catch (e: any) {
    ElMessage.error('触发失败: ' + (e?.response?.data?.detail?.error_message || e?.message || e))
  } finally {
    triggerSubmitting.value = false
  }
}

onMounted(() => {
  loadRuns()
})
</script>

<style scoped>
.oa-sync {
  padding: 16px;
}
.page-header h2 {
  margin: 0 0 4px 0;
}
.desc {
  color: #909399;
  font-size: 13px;
  margin: 0 0 16px 0;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.stat-card {
  text-align: center;
}
.stat-label {
  font-size: 12px;
  color: #909399;
}
.stat-value {
  font-size: 24px;
  font-weight: 600;
  margin-top: 4px;
}
.text-success { color: #67c23a; }
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.section-title {
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}
.filter-row {
  margin-bottom: 8px;
}
.diff-summary {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}
.approver-list {
  display: flex;
  flex-wrap: wrap;
  margin-top: 4px;
}
code {
  background: #f0f9ff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #409eff;
}
.empty { color: #c0c4cc; }
</style>
