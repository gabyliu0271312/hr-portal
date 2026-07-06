<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Refresh, Warning, Plus, Delete } from '@element-plus/icons-vue'
import {
  listWarehouseRuns, listAlertRules, createAlertRule, deleteAlertRule,
  RUN_TYPE_LABELS, ALERT_TYPE_LABELS,
} from '@/api/warehouse'
import type { WarehouseRunSummary, AlertRule, AlertRuleCreatePayload } from '@/api/warehouse'

const router = useRouter()

// ==================== 状态 ====================

const loading = ref(false)
const runs = ref<WarehouseRunSummary[]>([])
const filterRunType = ref('')
const filterStatus = ref('')

// 失败详情
const detailVisible = ref(false)
const selectedRun = ref<WarehouseRunSummary | null>(null)

// 告警规则
const alertRules = ref<AlertRule[]>([])
const alertFormVisible = ref(false)
const alertForm = ref<AlertRuleCreatePayload>({
  alert_type: 'quality_fail',
  target_code: '',
  enabled: true,
  severity: 'warn',
})

// ==================== 方法 ====================

async function loadRuns() {
  loading.value = true
  try {
    runs.value = await listWarehouseRuns({
      run_type: filterRunType.value || undefined,
      status: filterStatus.value || undefined,
      page_size: 50,
    })
  } catch {
    ElMessage.error('加载运行记录失败')
  } finally {
    loading.value = false
  }
}

async function loadAlertRules() {
  try {
    alertRules.value = await listAlertRules()
  } catch { /* 告警加载失败不影响主列表 */ }
}

function openDetail(run: WarehouseRunSummary) {
  selectedRun.value = run
  detailVisible.value = true
}

function navigateTo(link: string | null) {
  if (!link) return
  if (link.startsWith('/')) {
    router.push(link)
  } else {
    router.push({ name: link })
  }
}

function runTypeLabel(type: string) {
  return RUN_TYPE_LABELS[type] || type
}

function statusTagType(status: string) {
  if (status === 'pass' || status === 'success') return 'success'
  if (status === 'fail' || status === 'error') return 'danger'
  if (status === 'warn') return 'warning'
  return 'info'
}

function statusLabel(status: string) {
  const m: Record<string, string> = { pass: '通过', success: '成功', fail: '失败', error: '异常', warn: '警告', running: '运行中' }
  return m[status] || status
}

function formatDuration(sec: number | null) {
  if (sec === null || sec === undefined) return '-'
  if (sec < 60) return `${sec.toFixed(0)}s`
  return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(0)}s`
}

async function handleAddAlert() {
  if (!alertForm.value.target_code.trim()) {
    ElMessage.warning('请输入目标资产编码')
    return
  }
  try {
    await createAlertRule({ ...alertForm.value })
    ElMessage.success('告警规则已创建')
    alertFormVisible.value = false
    await loadAlertRules()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '创建失败')
  }
}

async function handleDeleteAlert(id: number) {
  try {
    await deleteAlertRule(id)
    ElMessage.success('已删除')
    await loadAlertRules()
  } catch { ElMessage.error('删除失败') }
}

// ==================== 生命周期 ====================

onMounted(() => {
  loadRuns()
  loadAlertRules()
})
</script>

<template>
  <div class="monitor-page">
    <div class="page-header">
      <h2>数据仓库监控</h2>
    </div>

    <!-- 趋势卡片 (Q0604) -->
    <el-row :gutter="16" style="margin-bottom: 12px">
      <el-col :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ runs.filter(r => r.status === 'fail' || r.status === 'error').length }}</div>
          <div class="stat-label">同步失败</div>
        </el-card>
      </el-col>
      <el-col :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num text-warning">{{ runs.filter(r => r.run_type === 'quality' && r.status === 'fail').length }}</div>
          <div class="stat-label">质量失败</div>
        </el-card>
      </el-col>
      <el-col :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ alertRules.filter(r => r.enabled).length }}</div>
          <div class="stat-label">告警规则</div>
        </el-card>
      </el-col>
      <el-col :sm="6">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-num">{{ runs.length }}</div>
          <div class="stat-label">总运行记录</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card shadow="never" style="margin-bottom: 12px">
      <el-form :inline="true" size="default">
        <el-form-item label="运行类型">
          <el-select v-model="filterRunType" clearable placeholder="全部" style="width: 140px" @change="loadRuns">
            <el-option v-for="(label, val) in RUN_TYPE_LABELS" :key="val" :label="label" :value="val" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filterStatus" clearable placeholder="全部" style="width: 110px" @change="loadRuns">
            <el-option label="成功" value="success" />
            <el-option label="通过" value="pass" />
            <el-option label="失败" value="fail" />
            <el-option label="异常" value="error" />
            <el-option label="警告" value="warn" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button :icon="Refresh" @click="loadRuns">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 运行列表 (Q0603) -->
    <el-card shadow="never" v-loading="loading">
      <el-table :data="runs" size="small" stripe row-key="run_id" max-height="500">
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ runTypeLabel(row.run_type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="目标" min-width="160">
          <template #default="{ row }">
            <span style="font-size: 13px">{{ row.target_label }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small" effect="dark">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始时间" width="150">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #909399">{{ row.started_at || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="80">
          <template #default="{ row }">
            {{ formatDuration(row.duration) }}
          </template>
        </el-table-column>
        <el-table-column label="错误摘要" min-width="160">
          <template #default="{ row }">
            <span v-if="row.error_summary" style="font-size: 12px; color: #F56C6C">
              {{ row.error_summary.length > 80 ? row.error_summary.slice(0, 80) + '…' : row.error_summary }}
            </span>
            <span v-else style="color: #c0c4cc">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" type="primary" @click="openDetail(row)">详情</el-button>
            <el-button v-if="row.source_link" link size="small" @click="navigateTo(row.source_link)">
              跳转
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && runs.length === 0" description="暂无运行记录" :image-size="80" />
    </el-card>

    <!-- 失败详情抽屉 (Q0604) -->
    <el-drawer v-model="detailVisible" title="运行详情" size="450px" direction="rtl">
      <template v-if="selectedRun">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="运行类型">{{ runTypeLabel(selectedRun.run_type) }}</el-descriptions-item>
          <el-descriptions-item label="目标">{{ selectedRun.target_label }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusTagType(selectedRun.status)" size="small" effect="dark">
              {{ statusLabel(selectedRun.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ selectedRun.started_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="结束时间">{{ selectedRun.finished_at || '-' }}</el-descriptions-item>
          <el-descriptions-item label="耗时">{{ formatDuration(selectedRun.duration) }}</el-descriptions-item>
          <el-descriptions-item label="错误详情" v-if="selectedRun.error_summary">
            <span style="color: #F56C6C">{{ selectedRun.error_summary }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div style="margin-top: 16px" v-if="selectedRun.source_link">
          <el-button type="primary" @click="navigateTo(selectedRun.source_link)">
            跳转到来源页
          </el-button>
        </div>
      </template>
    </el-drawer>

    <!-- ==================== 告警规则 (Q0606) ==================== -->
    <el-card shadow="never" style="margin-top: 16px">
      <template #header>
        <div style="display: flex; align-items: center; justify-content: space-between">
          <span style="font-weight: 600">告警规则</span>
          <el-button size="small" type="primary" :icon="Plus" @click="alertFormVisible = true">新建规则</el-button>
        </div>
      </template>

      <el-alert
        title="告警规则仅保存配置，暂不发送实际通知。通知能力将在后续版本中支持。"
        type="info" show-icon :closable="false"
        style="margin-bottom: 12px"
      />

      <el-table :data="alertRules" size="small" stripe row-key="id">
        <el-table-column label="告警类型" width="120">
          <template #default="{ row }">
            {{ ALERT_TYPE_LABELS[row.alert_type] || row.alert_type }}
          </template>
        </el-table-column>
        <el-table-column prop="target_code" label="目标资产" min-width="160" />
        <el-table-column label="严重级" width="80">
          <template #default="{ row }">
            <el-tag :type="row.severity === 'error' ? 'danger' : row.severity === 'warn' ? 'warning' : 'info'" size="small">
              {{ row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="启用" width="70">
          <template #default="{ row }">
            <el-switch :model-value="row.enabled" disabled size="small" />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80">
          <template #default="{ row }">
            <el-button link size="small" type="danger" :icon="Delete" @click="handleDeleteAlert(row.id)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="alertRules.length === 0" description="暂无告警规则" :image-size="60" />
    </el-card>

    <!-- 告警规则创建对话框 -->
    <el-dialog v-model="alertFormVisible" title="新建告警规则" width="480px">
      <el-form :model="alertForm" label-width="80px" size="default">
        <el-form-item label="告警类型" required>
          <el-select v-model="alertForm.alert_type" style="width: 100%">
            <el-option v-for="(label, val) in ALERT_TYPE_LABELS" :key="val" :label="label" :value="val" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标资产" required>
          <el-input v-model="alertForm.target_code" placeholder="资产编码（如 table_name）" />
        </el-form-item>
        <el-form-item label="严重级别">
          <el-radio-group v-model="alertForm.severity">
            <el-radio value="info">提示</el-radio>
            <el-radio value="warn">警告</el-radio>
            <el-radio value="error">严重</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="alertFormVisible = false">取消</el-button>
        <el-button type="primary" @click="handleAddAlert">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.monitor-page { padding: 24px; max-width: 1600px; margin: 0 auto; }
.page-header { margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }
.stat-card { text-align: center; }
.stat-num { font-size: 28px; font-weight: 600; color: #303133; }
.stat-label { font-size: 13px; color: #909399; margin-top: 4px; }
.text-warning { color: #E6A23C; }
.text-danger { color: #F56C6C; }
</style>
