<template>
  <div class="external-account-list">
    <div class="page-header">
      <h2>外部账号管理（External Accounts）</h2>
      <p class="desc">
        管理员工在外部系统（滴滴/曹操等）的账号生命周期。
        高风险动作（删除/停用）需要走 Phase 3-5 审批流程。
      </p>
    </div>

    <!-- 统计卡片 -->
    <div class="stat-row">
      <el-card class="stat-card">
        <div class="stat-label">总账号数</div>
        <div class="stat-value">{{ totalCount }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">活跃</div>
        <div class="stat-value text-success">{{ countByStatus('ACTIVE') }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">待处理</div>
        <div class="stat-value text-warning">{{ countByStatus('PENDING') }}</div>
      </el-card>
      <el-card class="stat-card">
        <div class="stat-label">失败</div>
        <div class="stat-value text-danger">{{ countByStatus('FAILED') }}</div>
      </el-card>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-select
        v-model="filterSystem"
        placeholder="系统"
        clearable
        style="width: 140px"
        @change="onFilterChange"
      >
        <el-option label="DIDI" value="DIDI" />
        <el-option label="CAOCAO" value="CAOCAO" />
      </el-select>
      <el-select
        v-model="filterStatus"
        placeholder="状态"
        clearable
        style="width: 140px"
        @change="onFilterChange"
      >
        <el-option label="PENDING" value="PENDING" />
        <el-option label="ACTIVE" value="ACTIVE" />
        <el-option label="DISABLED" value="DISABLED" />
        <el-option label="DELETED" value="DELETED" />
        <el-option label="FAILED" value="FAILED" />
      </el-select>
      <el-button :icon="Refresh" @click="loadList">刷新</el-button>
      <PermissionButton
        menu="ucp.executions"
        op="C"
        type="primary"
        :icon="Plus"
        @click="openActionDialog"
      >
        手动动作
      </PermissionButton>
    </div>

    <!-- 账号列表 -->
    <el-table :data="items" v-loading="loading" stripe border>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="system_code" label="系统" width="100">
        <template #default="{ row }">
          <el-tag size="small" :type="row.system_code === 'DIDI' ? 'primary' : 'success'">
            {{ row.system_code }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="employee_id" label="员工 ID" width="120" />
      <el-table-column prop="employee_name" label="姓名" width="120" />
      <el-table-column prop="employee_mobile_masked" label="手机号" width="140">
        <template #default="{ row }">
          <span v-if="row.employee_mobile_masked">{{ row.employee_mobile_masked }}</span>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="external_user_id" label="外部账号 ID" min-width="180" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="110">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTagType(row.status)">{{ row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="last_action" label="最近动作" width="100">
        <template #default="{ row }">
          <code v-if="row.last_action">{{ row.last_action }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="retry_count" label="重试" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.retry_count > 0" size="small" type="danger">
            {{ row.retry_count }}
          </el-tag>
          <span v-else>0</span>
        </template>
      </el-table-column>
      <el-table-column prop="last_error_code" label="错误" width="120" show-overflow-tooltip>
        <template #default="{ row }">
          <code v-if="row.last_error_code" class="text-danger">{{ row.last_error_code }}</code>
          <span v-else class="empty">-</span>
        </template>
      </el-table-column>
      <el-table-column prop="updated_at" label="更新时间" width="170">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button size="small" link type="warning" @click="openAudits(row)">审计</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pager"
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="totalCount"
      :page-sizes="[20, 50, 100, 200]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="loadList"
      @size-change="loadList"
    />

    <!-- 详情 Dialog -->
    <el-dialog v-model="detailVisible" title="外部账号详情" width="720px">
      <el-descriptions v-if="current" :column="2" border>
        <el-descriptions-item label="ID">{{ current.id }}</el-descriptions-item>
        <el-descriptions-item label="系统">{{ current.system_code }}</el-descriptions-item>
        <el-descriptions-item label="员工 ID">{{ current.employee_id }}</el-descriptions-item>
        <el-descriptions-item label="姓名">{{ current.employee_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="手机号">{{ current.employee_mobile_masked || '-' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="statusTagType(current.status)">{{ current.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="外部账号 ID" :span="2">
          <code>{{ current.external_user_id }}</code>
        </el-descriptions-item>
        <el-descriptions-item label="账号名">{{ current.external_account_name || '-' }}</el-descriptions-item>
        <el-descriptions-item label="最近动作">
          <code v-if="current.last_action">{{ current.last_action }}</code>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="激活时间" :span="2">{{ formatTime(current.activated_at) }}</el-descriptions-item>
        <el-descriptions-item label="停用时间">{{ formatTime(current.disabled_at) }}</el-descriptions-item>
        <el-descriptions-item label="删除时间">{{ formatTime(current.deleted_at) }}</el-descriptions-item>
        <el-descriptions-item label="最近错误" :span="2">
          <span v-if="current.last_error_code" class="text-danger">
            [{{ current.last_error_code }}] {{ current.last_error_message }}
          </span>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item label="最近 Pipeline" :span="2">
          <code v-if="current.last_pipeline_run_id">{{ current.last_pipeline_run_id }}</code>
          <span v-else>-</span>
        </el-descriptions-item>
        <el-descriptions-item v-if="current.extra" label="扩展信息" :span="2">
          <pre class="json-block">{{ JSON.stringify(current.extra, null, 2) }}</pre>
        </el-descriptions-item>
      </el-descriptions>
    </el-dialog>

    <!-- 审计 Dialog -->
    <el-dialog v-model="auditVisible" title="操作审计" width="900px">
      <el-table :data="audits" v-loading="auditLoading" stripe border size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="action" label="动作" width="90">
          <template #default="{ row }">
            <code>{{ row.action }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="结果" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.result === 'SUCCESS' ? 'success' : 'danger'">
              {{ row.result }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="trigger_source" label="触发" width="100" />
        <el-table-column prop="operator" label="操作人" width="120" />
        <el-table-column prop="error_code" label="错误码" width="120" show-overflow-tooltip />
        <el-table-column prop="error_message" label="错误信息" min-width="200" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 手动动作 Dialog -->
    <el-dialog v-model="actionVisible" title="手动触发外部账号动作" width="540px">
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 16px">
        高风险动作 (DELETE / DISABLE) 需走审批流程，请通过 Pipeline 触发。
      </el-alert>
      <el-form :model="actionForm" label-width="100px">
        <el-form-item label="系统" required>
          <el-select v-model="actionForm.system_code" placeholder="选择系统" style="width: 100%">
            <el-option label="DIDI (滴滴)" value="DIDI" />
            <el-option label="CAOCAO (曹操)" value="CAOCAO" />
          </el-select>
        </el-form-item>
        <el-form-item label="动作" required>
          <el-select v-model="actionForm.action" placeholder="选择动作" style="width: 100%">
            <el-option label="CREATE (创建)" value="CREATE" />
            <el-option label="UPDATE (更新)" value="UPDATE" />
            <el-option label="REACTIVATE (重启)" value="REACTIVATE" />
          </el-select>
        </el-form-item>
        <el-form-item label="员工 ID" required>
          <el-input v-model="actionForm.employee_id" placeholder="EMP-001" />
        </el-form-item>
        <el-form-item label="姓名" required>
          <el-input v-model="actionForm.employee_name" />
        </el-form-item>
        <el-form-item label="手机号" required>
          <el-input v-model="actionForm.employee_mobile" placeholder="13800000000" />
        </el-form-item>
        <el-form-item label="外部账号 ID">
          <el-input v-model="actionForm.external_user_id" placeholder="UPDATE/REACTIVATE 时必填" />
        </el-form-item>
        <el-form-item label="部门">
          <el-input v-model="actionForm.department" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="actionVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionSubmitting" @click="submitAction">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import { externalAccountApi, type ExternalAccount, type ExternalAccountAudit } from '@/api/ucp'
import PermissionButton from '@/components/PermissionButton.vue'

const items = ref<ExternalAccount[]>([])
const totalCount = ref(0)
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const filterSystem = ref<string>('')
const filterStatus = ref<string>('')

const detailVisible = ref(false)
const current = ref<ExternalAccount | null>(null)

const auditVisible = ref(false)
const audits = ref<ExternalAccountAudit[]>([])
const auditLoading = ref(false)

const actionVisible = ref(false)
const actionSubmitting = ref(false)
const actionForm = ref({
  system_code: 'DIDI',
  action: 'CREATE',
  employee_id: '',
  employee_name: '',
  employee_mobile: '',
  external_user_id: '',
  department: '',
})

const countByStatus = (s: string) => items.value.filter((x) => x.status === s).length

const statusTagType = (s: string) => {
  switch (s) {
    case 'ACTIVE': return 'success'
    case 'PENDING': return 'warning'
    case 'DISABLED': return 'info'
    case 'DELETED': return ''
    case 'FAILED': return 'danger'
    default: return ''
  }
}

const formatTime = (s: string | null) => (s ? new Date(s).toLocaleString('zh-CN') : '-')

const onFilterChange = () => {
  page.value = 1
  loadList()
}

const loadList = async () => {
  loading.value = true
  try {
    const all = await externalAccountApi.list({
      system_code: filterSystem.value || undefined,
      status: filterStatus.value || undefined,
      limit: pageSize.value,
      offset: (page.value - 1) * pageSize.value,
    })
    items.value = all
    totalCount.value = all.length
  } catch (e: any) {
    ElMessage.error('加载账号列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

const openDetail = (row: ExternalAccount) => {
  current.value = row
  detailVisible.value = true
}

const openAudits = async (row: ExternalAccount) => {
  auditVisible.value = true
  auditLoading.value = true
  try {
    audits.value = await externalAccountApi.listAudits(row.id, 100, 0)
  } catch (e: any) {
    ElMessage.error('加载审计失败: ' + (e?.message || e))
  } finally {
    auditLoading.value = false
  }
}

const openActionDialog = () => {
  actionForm.value = {
    system_code: 'DIDI',
    action: 'CREATE',
    employee_id: '',
    employee_name: '',
    employee_mobile: '',
    external_user_id: '',
    department: '',
  }
  actionVisible.value = true
}

const submitAction = async () => {
  if (!actionForm.value.employee_id || !actionForm.value.employee_name || !actionForm.value.employee_mobile) {
    ElMessage.warning('请填写员工 ID / 姓名 / 手机号')
    return
  }
  actionSubmitting.value = true
  try {
    const result = await externalAccountApi.runAction(actionForm.value)
    if (result.status === 'success') {
      ElMessage.success(
        `动作 ${result.data?.[0]?.action || actionForm.value.action} 执行成功` +
        (result.data?.[0]?.simulated ? ' (模拟模式)' : ''),
      )
      actionVisible.value = false
      loadList()
    } else {
      ElMessage.error(`动作失败: ${result.error_code || ''} ${result.error_message || ''}`)
    }
  } catch (e: any) {
    ElMessage.error('提交失败: ' + (e?.response?.data?.detail || e?.message || e))
  } finally {
    actionSubmitting.value = false
  }
}

onMounted(() => {
  loadList()
})
</script>

<style scoped>
.external-account-list {
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
  align-items: center;
}
.pager {
  margin-top: 12px;
  text-align: right;
}
.empty {
  color: #c0c4cc;
}
.json-block {
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  font-size: 12px;
  margin: 0;
  max-height: 200px;
  overflow: auto;
}
code {
  background: #f0f9ff;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 12px;
  color: #409eff;
}
</style>
