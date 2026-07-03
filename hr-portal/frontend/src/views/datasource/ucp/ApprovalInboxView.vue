<template>
  <div class="approval-inbox">
    <div class="page-header">
      <h2>审批工作台（Approvals）</h2>
      <p class="desc">
        高风险动作（删除/停用外部账号、组织变更等）的审批流程。
        待办显示当前用户作为审批人的请求。
      </p>
    </div>

    <!-- 标签页 -->
    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="`我的待办 (${todoCount})`" name="todo" />
      <el-tab-pane label="我提交的" name="submitted" />
      <el-tab-pane label="全部" name="all" />
    </el-tabs>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select
        v-model="filterStatus"
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="onFilterChange"
      >
        <el-option label="PENDING" value="PENDING" />
        <el-option label="APPROVED" value="APPROVED" />
        <el-option label="REJECTED" value="REJECTED" />
        <el-option label="CANCELLED" value="CANCELLED" />
        <el-option label="EXPIRED" value="EXPIRED" />
      </el-select>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <PermissionButton
        menu="datasource.ucp_external_accounts"
        op="U"
        type="warning"
        :icon="Clock"
        @click="onScanExpired"
      >
        扫描过期
      </PermissionButton>
    </div>

    <!-- 列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="request_code" label="请求号" min-width="200" />
      <el-table-column prop="business_type" label="业务类型" width="180" show-overflow-tooltip />
      <el-table-column prop="business_key" label="业务对象" width="180" show-overflow-tooltip>
        <template #default="{ row }">
          <code>{{ row.business_key }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="action" label="动作" width="80">
        <template #default="{ row }">
          <code>{{ row.action }}</code>
        </template>
      </el-table-column>
      <el-table-column prop="approval_mode" label="模式" width="80" align="center" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="120" align="center">
        <template #default="{ row }">
          <span>
            <el-tag size="small" type="success">{{ row.approved_count }}</el-tag>
            /
            <span>{{ row.total_steps }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column prop="triggered_by" label="提交人" width="120" />
      <el-table-column prop="expires_at" label="过期时间" width="170">
        <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
      </el-table-column>
      <el-table-column prop="created_at" label="提交时间" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="totalCount"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 详情 Dialog -->
    <el-dialog v-model="detailVisible" :title="`审批详情 - ${current?.request_code || ''}`" width="900px">
      <div v-if="current">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="请求号">{{ current.request_code }}</el-descriptions-item>
          <el-descriptions-item label="业务类型">{{ current.business_type }}</el-descriptions-item>
          <el-descriptions-item label="业务对象">
            <code>{{ current.business_key }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="动作">
            <code>{{ current.action }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="审批模式">{{ current.approval_mode }}</el-descriptions-item>
          <el-descriptions-item label="二次确认">
            {{ current.confirmation_type }}
            <code v-if="current.confirmation_token" class="text-warning">
              Token: {{ current.confirmation_token }}
            </code>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(current.status)">{{ current.status }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="进度">
            <el-tag size="small" type="success">{{ current.approved_count }}</el-tag> /
            {{ current.total_steps }}
          </el-descriptions-item>
          <el-descriptions-item label="提交人">{{ current.triggered_by }}</el-descriptions-item>
          <el-descriptions-item label="触发来源">{{ current.trigger_source }}</el-descriptions-item>
          <el-descriptions-item v-if="current.reason" label="申请理由" :span="2">
            {{ current.reason }}
          </el-descriptions-item>
          <el-descriptions-item v-if="current.business_summary" label="业务摘要" :span="2">
            {{ current.business_summary }}
          </el-descriptions-item>
          <el-descriptions-item v-if="current.action_payload" label="动作参数" :span="2">
            <pre class="json-block">{{ JSON.stringify(current.action_payload, null, 2) }}</pre>
          </el-descriptions-item>
          <el-descriptions-item v-if="current.execution_error" label="执行错误" :span="2">
            <span class="text-danger">{{ current.execution_error }}</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 步骤 -->
        <h3 class="section-title">审批步骤</h3>
        <el-timeline>
          <el-timeline-item
            v-for="step in current.steps"
            :key="step.id"
            :type="stepTypeColor(step.status)"
            :timestamp="formatTime(step.action_at) || '待审批'"
          >
            <strong>{{ step.approver_name || step.approver_id }}</strong>
            <el-tag size="small" :type="stepTypeColor(step.status)" style="margin-left: 8px">
              {{ step.status }}
            </el-tag>
            <div v-if="step.comment" class="step-comment">备注: {{ step.comment }}</div>
            <div v-if="step.transferred_to" class="step-comment">转交给: {{ step.transferred_to }}</div>
          </el-timeline-item>
        </el-timeline>

        <!-- 操作历史 -->
        <h3 class="section-title">操作历史</h3>
        <el-table :data="current.actions || []" size="small" border>
          <el-table-column prop="action" label="动作" width="100">
            <template #default="{ row }">
              <code>{{ row.action }}</code>
            </template>
          </el-table-column>
          <el-table-column prop="operator_name" label="操作人" width="120" />
          <el-table-column prop="comment" label="备注" min-width="200" show-overflow-tooltip />
          <el-table-column prop="created_at" label="时间" width="170">
            <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
          </el-table-column>
        </el-table>

        <!-- 操作区 -->
        <div v-if="canApprove(current)" class="action-bar">
          <el-input
            v-model="actionComment"
            type="textarea"
            :rows="2"
            placeholder="审批意见 (可选)"
            style="margin-bottom: 12px"
          />
          <el-button type="success" :icon="Check" :loading="actionSubmitting" @click="onApprove(current)">
            同意
          </el-button>
          <el-button type="danger" :icon="Close" :loading="actionSubmitting" @click="onReject(current)">
            拒绝
          </el-button>
          <el-button type="warning" :icon="Promotion" @click="onTransfer(current)">
            转交
          </el-button>
        </div>
        <div v-else-if="canWithdraw(current)" class="action-bar">
          <el-button type="info" :icon="Refresh" :loading="actionSubmitting" @click="onWithdraw(current)">
            撤回请求
          </el-button>
        </div>
        <div v-else-if="canExecute(current)" class="action-bar">
          <el-alert
            v-if="current.confirmation_type === 'TOKEN'"
            type="warning"
            :closable="false"
            show-icon
            style="margin-bottom: 12px"
          >
            此动作需要二次令牌确认。
          </el-alert>
          <el-input
            v-if="current.confirmation_type === 'TOKEN'"
            v-model="confirmationToken"
            placeholder="输入二次确认令牌"
            style="margin-bottom: 12px"
          />
          <el-button
            type="primary"
            :icon="VideoPlay"
            :loading="actionSubmitting"
            @click="onExecute(current)"
          >
            执行动作
          </el-button>
        </div>
      </div>
    </el-dialog>

    <!-- 转交 Dialog -->
    <el-dialog v-model="transferVisible" title="转交审批" width="420px">
      <el-form :model="transferForm" label-width="100px">
        <el-form-item label="转交给">
          <el-input v-model="transferForm.to_user_id" placeholder="用户 ID" />
        </el-form-item>
        <el-form-item label="用户姓名">
          <el-input v-model="transferForm.to_user_name" placeholder="(可选) 用于显示" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="transferForm.comment" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionSubmitting" @click="submitTransfer">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Refresh,
  Check,
  Close,
  Promotion,
  VideoPlay,
  Clock,
} from '@element-plus/icons-vue'
import { approvalApi, type ApprovalRequest } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const items = ref<ApprovalRequest[]>([])
const totalCount = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const filterStatus = ref<string>('')
const activeTab = ref<'todo' | 'submitted' | 'all'>('todo')
const todoCount = ref(0)

const detailVisible = ref(false)
const current = ref<ApprovalRequest | null>(null)
const actionComment = ref('')
const actionSubmitting = ref(false)
const confirmationToken = ref('')

const transferVisible = ref(false)
const transferForm = ref({ to_user_id: '', to_user_name: '', comment: '' })
let transferTarget: ApprovalRequest | null = null

const statusTagType = (s: string) => {
  switch (s) {
    case 'PENDING': return 'warning'
    case 'APPROVED': return 'success'
    case 'REJECTED': return 'danger'
    case 'CANCELLED': return 'info'
    case 'EXPIRED': return ''
    default: return ''
  }
}

const stepTypeColor = (s: string) => {
  switch (s) {
    case 'APPROVED': return 'success'
    case 'REJECTED': return 'danger'
    case 'SKIPPED': return 'info'
    default: return 'primary'
  }
}

const formatTime = (s: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '-')

const onTabChange = () => {
  page.value = 1
  loadList()
}

const onFilterChange = () => {
  page.value = 1
  loadList()
}

const loadList = async () => {
  loading.value = true
  try {
    const params: any = {
      status: filterStatus.value || undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    }
    if (activeTab.value === 'todo') {
      // 后端需要知道当前用户 ID, 这里暂通过用户上下文透传
      params.approver_id = '__current__'  // 占位, 实际由后端解析 current_user
    } else if (activeTab.value === 'submitted') {
      params.triggered_by = '__current__'
    }
    const all = await approvalApi.list(params)
    items.value = all
    totalCount.value = all.length
  } catch (e: any) {
    ElMessage.error('加载审批列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const loadTodoCount = async () => {
  try {
    const r = await approvalApi.myTodo()
    todoCount.value = r.count
  } catch {
    todoCount.value = 0
  }
}

const openDetail = async (row: ApprovalRequest) => {
  try {
    current.value = await approvalApi.getDetail(row.id)
    detailVisible.value = true
    actionComment.value = ''
    confirmationToken.value = ''
  } catch (e: any) {
    ElMessage.error('加载审批详情失败: ' + (e?.message || e))
  }
}

const canApprove = (req: ApprovalRequest) => {
  if (req.status !== 'PENDING') return false
  return req.steps?.some((s) => s.status === 'PENDING') || false
}

const canWithdraw = (req: ApprovalRequest) => req.status === 'PENDING'

const canExecute = (req: ApprovalRequest) => req.status === 'APPROVED' && !req.executed_at

const onApprove = async (req: ApprovalRequest) => {
  actionSubmitting.value = true
  try {
    current.value = await approvalApi.doAction(req.id, {
      action: 'APPROVE',
      comment: actionComment.value,
    })
    ElMessage.success('已同意')
    loadList()
    loadTodoCount()
  } catch (e: any) {
    ElMessage.error('同意失败: ' + (e?.response?.data?.detail?.message || e?.message))
  } finally {
    actionSubmitting.value = false
  }
}

const onReject = async (req: ApprovalRequest) => {
  try {
    await ElMessageBox.confirm('确定拒绝此审批请求吗?', '确认', { type: 'warning' })
  } catch {
    return
  }
  actionSubmitting.value = true
  try {
    current.value = await approvalApi.doAction(req.id, {
      action: 'REJECT',
      comment: actionComment.value,
    })
    ElMessage.success('已拒绝')
    loadList()
    loadTodoCount()
  } catch (e: any) {
    ElMessage.error('拒绝失败: ' + (e?.response?.data?.detail?.message || e?.message))
  } finally {
    actionSubmitting.value = false
  }
}

const onTransfer = (req: ApprovalRequest) => {
  transferTarget = req
  transferForm.value = { to_user_id: '', to_user_name: '', comment: '' }
  transferVisible.value = true
}

const submitTransfer = async () => {
  if (!transferForm.value.to_user_id) {
    ElMessage.warning('请填写转交对象')
    return
  }
  if (!transferTarget) return
  actionSubmitting.value = true
  try {
    current.value = await approvalApi.doAction(transferTarget.id, {
      action: 'TRANSFER',
      comment: transferForm.value.comment,
      to_user_id: transferForm.value.to_user_id,
      to_user_name: transferForm.value.to_user_name,
    })
    ElMessage.success('已转交')
    transferVisible.value = false
    loadList()
    loadTodoCount()
  } catch (e: any) {
    ElMessage.error('转交失败: ' + (e?.response?.data?.detail?.message || e?.message))
  } finally {
    actionSubmitting.value = false
  }
}

const onWithdraw = async (req: ApprovalRequest) => {
  try {
    await ElMessageBox.confirm('确定撤回此审批请求吗?', '确认', { type: 'warning' })
  } catch {
    return
  }
  actionSubmitting.value = true
  try {
    current.value = await approvalApi.doAction(req.id, {
      action: 'WITHDRAW',
      comment: actionComment.value,
    })
    ElMessage.success('已撤回')
    detailVisible.value = false
    loadList()
  } catch (e: any) {
    ElMessage.error('撤回失败: ' + (e?.response?.data?.detail?.message || e?.message))
  } finally {
    actionSubmitting.value = false
  }
}

const onExecute = async (req: ApprovalRequest) => {
  if (req.confirmation_type === 'TOKEN' && !confirmationToken.value) {
    ElMessage.warning('请输入二次确认令牌')
    return
  }
  actionSubmitting.value = true
  try {
    current.value = await approvalApi.doAction(req.id, {
      action: 'EXECUTE',
      confirmation_token: confirmationToken.value || undefined,
    })
    ElMessage.success(
      current.value.execution_result === 'SUCCESS'
        ? '执行成功'
        : `执行失败: ${current.value.execution_error}`,
    )
    loadList()
  } catch (e: any) {
    ElMessage.error('执行失败: ' + (e?.response?.data?.detail?.message || e?.message))
  } finally {
    actionSubmitting.value = false
  }
}

const onScanExpired = async () => {
  try {
    const r = await approvalApi.scanExpired()
    ElMessage.success(`已扫描, ${r.expired_count} 个审批标记为过期`)
    loadList()
  } catch (e: any) {
    ElMessage.error('扫描失败: ' + (e?.message || e))
  }
}

onMounted(() => {
  loadList()
  loadTodoCount()
})
</script>

<style scoped>
.approval-inbox {
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
.toolbar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  align-items: center;
}
.pager {
  margin-top: 12px;
  text-align: right;
}
.section-title {
  margin: 16px 0 8px 0;
  font-size: 14px;
  font-weight: 600;
}
.json-block {
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 0;
  max-height: 160px;
  overflow: auto;
}
.step-comment {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}
.action-bar {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid #ebeef5;
}
code {
  background: #f0f9ff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #409eff;
}
.text-warning { color: #e6a23c; }
.text-danger { color: #f56c6c; }
</style>
