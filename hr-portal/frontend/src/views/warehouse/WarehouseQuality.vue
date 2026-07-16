<script setup lang="ts">
import { formatDateTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Search, Refresh, VideoPlay, Switch, Delete, Edit, InfoFilled, Loading, Clock, RefreshRight } from '@element-plus/icons-vue'
import {
  listQualityRules,
  createQualityRule,
  updateQualityRule,
  enableQualityRule,
  disableQualityRule,
  deleteQualityRule,
  runQualityRule,
  getQualityAlerts,
  listQualityRuns,
  QUALITY_RULE_TYPE_LABELS,
  QUALITY_SEVERITY_LABELS,
} from '@/api/warehouse'
import type {
  QualityRule,
  QualityRuleCreatePayload,
  QualityRunTriggerResult,
  QualityRun,
  QualityAlertSummary,
} from '@/api/warehouse'
import ScheduleConfigDialog from '@/components/common/ScheduleConfigDialog.vue'

// ==================== 状态 ====================

const loading = ref(false)
const rules = ref<QualityRule[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

// 筛选
const filterAssetType = ref('')
const filterRuleType = ref('')
const filterEnabled = ref<string | undefined>(undefined)

// 表单
const dialogVisible = ref(false)
const dialogTitle = ref('新建质量规则')
const editingId = ref<number | null>(null)
const formRef = ref<any>(null)
const form = reactive<QualityRuleCreatePayload>({
  asset_type: 'table',
  asset_code: '',
  rule_type: 'not_null',
  rule_config: { column: '' },
  enabled: true,
  severity: 'warn',
})

// 运行结果
const runDialogVisible = ref(false)
const runResult = ref<QualityRunTriggerResult | null>(null)
const runLoading = ref(false)

// 告警摘要
const alerts = ref<QualityAlertSummary | null>(null)

// 运行历史 + 重跑
const runsVisible = ref(false)
const runs = ref<QualityRun[]>([])
const runsRuleId = ref(0)
const runsTotal = ref(0)
const retrying = ref<Set<number>>(new Set())

async function showRuns(ruleId: number) {
  runsRuleId.value = ruleId
  try {
    const res = await listQualityRuns({ rule_id: ruleId, page_size: 20 })
    runs.value = res.items
    runsTotal.value = res.total
  } catch { runs.value = [] }
  runsVisible.value = true
}

async function retryQualityRun(ruleId: number) {
  retrying.value.add(ruleId)
  try {
    await runQualityRule(ruleId)
    ElMessage.success('已重新执行')
    runsVisible.value = false
    load()
    loadAlerts()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '重试失败')
  } finally {
    retrying.value.delete(ruleId)
  }
}

// 定时配置
const scheduleVisible = ref(false)
const scheduleBizId = ref(0)
const scheduleBizName = ref('')

function openSchedule(rule: QualityRule) {
  scheduleBizId.value = rule.id
  scheduleBizName.value = `${rule.asset_code} (${QUALITY_RULE_TYPE_LABELS[rule.rule_type] || rule.rule_type})`
  scheduleVisible.value = true
}

// ==================== 计算 ====================

const ruleTypeOptions = computed(() =>
  Object.entries(QUALITY_RULE_TYPE_LABELS).map(([value, label]) => ({ value, label }))
)

const severityOptions = computed(() =>
  Object.entries(QUALITY_SEVERITY_LABELS).map(([value, label]) => ({ value, label }))
)

/** 不可执行的规则类型（Q0309） */
const isUnexecutable = (ruleType: string) =>
  ruleType === 'referential_integrity' || ruleType === 'custom_sql'

// ==================== 方法 ====================

async function load() {
  loading.value = true
  try {
    const res = await listQualityRules({
      asset_type: filterAssetType.value || undefined,
      rule_type: filterRuleType.value || undefined,
      enabled: filterEnabled.value !== undefined ? filterEnabled.value === 'true' : undefined,
      page: page.value,
      page_size: pageSize.value,
    })
    rules.value = res.items
    total.value = res.total
  } catch {
    ElMessage.error('加载质量规则失败')
  } finally {
    loading.value = false
  }
}

async function loadAlerts() {
  try {
    alerts.value = await getQualityAlerts()
  } catch { /* 告警摘要加载失败不影响主列表 */ }
}

function openCreate() {
  editingId.value = null
  dialogTitle.value = '新建质量规则'
  form.asset_type = 'table'
  form.asset_code = ''
  form.rule_type = 'not_null'
  form.rule_config = { column: '' }
  form.enabled = true
  form.severity = 'warn'
  dialogVisible.value = true
}

function openEdit(rule: QualityRule) {
  editingId.value = rule.id
  dialogTitle.value = '编辑质量规则'
  form.asset_type = rule.asset_type
  form.asset_code = rule.asset_code
  form.rule_type = rule.rule_type
  form.rule_config = { ...rule.rule_config }
  form.enabled = rule.enabled
  form.severity = rule.severity
  dialogVisible.value = true
}

function onRuleTypeChange() {
  // 根据 rule_type 重置 rule_config 默认值
  if (editingId.value) return // 编辑时不重置
  const defaults: Record<string, any> = {
    not_null: { column: '' },
    unique: { column: '' },
    enum: { column: '', values: [] },
    date_format: { column: '', format: '%Y-%m-%d' },
    referential_integrity: { column: '', ref_table: '', ref_column: '' },
    custom_sql: { sql: '' },
  }
  form.rule_config = defaults[form.rule_type] || {}
}

async function handleSave() {
  try {
    if (editingId.value) {
      await updateQualityRule(editingId.value, {
        rule_config: form.rule_config,
        enabled: form.enabled,
        severity: form.severity,
      })
      ElMessage.success('规则已更新')
    } else {
      await createQualityRule({ ...form })
      ElMessage.success('规则已创建')
    }
    dialogVisible.value = false
    await load()
    await loadAlerts()
  } catch (e: any) {
    const msg = e?.response?.data?.detail || e?.message || '保存失败'
    ElMessage.error(msg)
  }
}

async function handleToggle(rule: QualityRule) {
  try {
    if (rule.enabled) {
      await disableQualityRule(rule.id)
      ElMessage.success('已禁用')
    } else {
      await enableQualityRule(rule.id)
      ElMessage.success('已启用')
    }
    await load()
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleDelete(rule: QualityRule) {
  try {
    await ElMessageBox.confirm(`确定删除规则「${rule.asset_code}」吗？历史运行记录将保留。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteQualityRule(rule.id)
    ElMessage.success('已删除')
    await load()
    await loadAlerts()
  } catch {
    // 用户取消
  }
}

async function handleRun(rule: QualityRule) {
  runLoading.value = true
  runResult.value = null
  runDialogVisible.value = true
  try {
    runResult.value = await runQualityRule(rule.id)
    await load()
    await loadAlerts()
  } catch (e: any) {
    const msg = e?.response?.data?.detail || e?.message || '执行失败'
    ElMessage.error(msg)
    runDialogVisible.value = false
  } finally {
    runLoading.value = false
  }
}

function ruleTypeLabel(type: string) {
  return QUALITY_RULE_TYPE_LABELS[type] || type
}

function severityTagType(sev: string) {
  if (sev === 'error') return 'danger'
  if (sev === 'warn') return 'warning'
  return 'info'
}

function runStatusTagType(status: string | null) {
  if (status === 'pass') return 'success'
  if (status === 'fail' || status === 'error') return 'danger'
  if (status === 'warn') return 'warning'
  return 'info'
}

function runStatusLabel(status: string | null) {
  if (!status) return '未运行'
  const map: Record<string, string> = { pass: '通过', warn: '警告', fail: '失败', error: '异常' }
  return map[status] || status
}

// ==================== 生命周期 ====================

onMounted(() => {
  load()
  loadAlerts()
})
</script>

<template>
  <div class="quality-page">
    <div class="page-header">
      <h2>数据质量</h2>
      <el-button type="primary" :icon="Plus" @click="openCreate">新建规则</el-button>
    </div>

    <!-- 告警摘要卡片 (Q0314) -->
    <el-row v-if="alerts" :gutter="16" style="margin-bottom: 12px">
      <el-col :sm="8">
        <el-card shadow="hover" class="alert-card">
          <div class="alert-num">{{ alerts.total_rules }}</div>
          <div class="alert-label">规则总数</div>
        </el-card>
      </el-col>
      <el-col :sm="8">
        <el-card shadow="hover" class="alert-card" :style="{ borderLeft: alerts.failed_rules ? '3px solid #F56C6C' : '' }">
          <div class="alert-num" :class="{ 'text-danger': alerts.failed_rules }">{{ alerts.failed_rules }}</div>
          <div class="alert-label">失败/异常</div>
        </el-card>
      </el-col>
      <el-col :sm="8">
        <el-card shadow="hover" class="alert-card" :style="{ borderLeft: alerts.warning_rules ? '3px solid #E6A23C' : '' }">
          <div class="alert-num" :class="{ 'text-warning': alerts.warning_rules }">{{ alerts.warning_rules }}</div>
          <div class="alert-label">警告</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 筛选栏 -->
    <el-card shadow="never" class="filter-card">
      <el-form :inline="true" size="default">
        <el-form-item label="资产类型">
          <el-select v-model="filterAssetType" clearable placeholder="全部" style="width: 120px" @change="load">
            <el-option label="数据表" value="table" />
            <el-option label="数据集" value="dataset" />
            <el-option label="字段" value="field" />
          </el-select>
        </el-form-item>
        <el-form-item label="规则类型">
          <el-select v-model="filterRuleType" clearable placeholder="全部" style="width: 140px" @change="load">
            <el-option v-for="o in ruleTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-select v-model="filterEnabled" clearable placeholder="全部" style="width: 100px" @change="load">
            <el-option label="启用" value="true" />
            <el-option label="禁用" value="false" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button :icon="Refresh" @click="load">刷新</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 规则列表 -->
    <el-card shadow="never" v-loading="loading">
      <el-table :data="rules" size="small" stripe row-key="id">
        <el-table-column label="资产" min-width="160">
          <template #default="{ row }">
            <el-tag size="small" type="info" style="margin-right: 4px">{{ row.asset_type }}</el-tag>
            {{ row.asset_code }}
          </template>
        </el-table-column>
        <el-table-column label="规则类型" width="120">
          <template #default="{ row }">
            <span>{{ ruleTypeLabel(row.rule_type) }}</span>
            <el-tooltip v-if="isUnexecutable(row.rule_type)" content="执行暂不支持，仅可保存配置" placement="top">
              <el-icon style="margin-left: 4px; color: #909399; font-size: 14px"><InfoFilled /></el-icon>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column label="参数" min-width="140">
          <template #default="{ row }">
            <span style="font-size: 12px; color: #606266">
              <template v-if="row.rule_config.column">字段: {{ row.rule_config.column }}</template>
              <template v-if="row.rule_config.values"> 值: {{ row.rule_config.values?.join(', ') }}</template>
              <template v-if="row.rule_config.format"> 格式: {{ row.rule_config.format }}</template>
            </span>
          </template>
        </el-table-column>
        <el-table-column label="严重级" width="80">
          <template #default="{ row }">
            <el-tag :type="severityTagType(row.severity)" size="small" effect="dark">
              {{ QUALITY_SEVERITY_LABELS[row.severity] || row.severity }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近运行" width="100">
          <template #default="{ row }">
            <el-tag :type="runStatusTagType(row.last_run_status)" size="small" effect="plain">
              {{ runStatusLabel(row.last_run_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <el-button link size="small" type="primary" :icon="VideoPlay" @click="handleRun(row)"
              :loading="runLoading" :disabled="isUnexecutable(row.rule_type)">
              运行
            </el-button>
            <el-button link size="small" :icon="Switch" @click="handleToggle(row)">
              {{ row.enabled ? '禁用' : '启用' }}
            </el-button>
            <el-button link size="small" :icon="Edit" @click="openEdit(row)">编辑</el-button>
            <el-button link size="small" :icon="Clock" @click="openSchedule(row)">定时</el-button>
            <el-button link size="small" @click="showRuns(row.id)">记录</el-button>
            <el-button link size="small" type="danger" :icon="Delete" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50]"
        layout="total, prev, pager, next, sizes"
        style="margin-top: 12px; justify-content: flex-end"
        @change="load"
      />
    </el-card>

    <!-- ==================== 创建/编辑对话框 ==================== -->
    <el-dialog v-model="dialogVisible" :title="dialogTitle" width="560px" destroy-on-close>
      <el-form :model="form" label-width="80px" size="default" ref="formRef">
        <el-form-item label="资产类型" required>
          <el-select v-model="form.asset_type" style="width: 100%">
            <el-option label="数据表 (table)" value="table" />
            <el-option label="数据集 (dataset)" value="dataset" />
            <el-option label="字段 (field)" value="field" />
          </el-select>
        </el-form-item>
        <el-form-item label="资产编码" required>
          <el-input v-model="form.asset_code" placeholder="table_name 或 dataset_id 或 table.column" />
        </el-form-item>
        <el-form-item label="规则类型" required>
          <el-select v-model="form.rule_type" style="width: 100%" @change="onRuleTypeChange">
            <el-option v-for="o in ruleTypeOptions" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>

        <!-- 动态 rule_config 参数 -->
        <template v-if="form.rule_type === 'not_null' || form.rule_type === 'unique'">
          <el-form-item label="检查字段" required>
            <el-input v-model="form.rule_config.column" placeholder="column_code" />
          </el-form-item>
        </template>
        <template v-else-if="form.rule_type === 'enum'">
          <el-form-item label="检查字段" required>
            <el-input v-model="form.rule_config.column" placeholder="column_code" />
          </el-form-item>
          <el-form-item label="合法枚举值" required>
            <el-input v-model="form.rule_config.valuesStr" placeholder="用逗号分隔，如: A,B,C"
              @change="form.rule_config.values = (form.rule_config.valuesStr || '').split(',').map((s: string) => s.trim()).filter(Boolean)" />
          </el-form-item>
        </template>
        <template v-else-if="form.rule_type === 'date_format'">
          <el-form-item label="检查字段" required>
            <el-input v-model="form.rule_config.column" placeholder="column_code" />
          </el-form-item>
          <el-form-item label="日期格式" required>
            <el-select v-model="form.rule_config.format" style="width: 100%">
              <el-option label="%Y-%m-%d (2024-01-01)" value="%Y-%m-%d" />
              <el-option label="%Y/%m/%d (2024/01/01)" value="%Y/%m/%d" />
              <el-option label="%Y%m%d (20240101)" value="%Y%m%d" />
              <el-option label="%d/%m/%Y (01/01/2024)" value="%d/%m/%Y" />
              <el-option label="%Y-%m-%d %H:%i:%s (日期时间)" value="%Y-%m-%d %H:%i:%s" />
            </el-select>
          </el-form-item>
        </template>
        <template v-else-if="form.rule_type === 'referential_integrity'">
          <el-alert title="引用完整性检查暂不支持执行，仅可保存配置。将在后续版本中支持。" type="info" show-icon :closable="false"
            style="margin-bottom: 12px" />
          <el-form-item label="检查字段" required>
            <el-input v-model="form.rule_config.column" placeholder="column_code" />
          </el-form-item>
          <el-form-item label="引用表">
            <el-input v-model="form.rule_config.ref_table" placeholder="引用的目标表" />
          </el-form-item>
          <el-form-item label="引用字段">
            <el-input v-model="form.rule_config.ref_column" placeholder="引用的目标字段" />
          </el-form-item>
        </template>
        <template v-else-if="form.rule_type === 'custom_sql'">
          <el-alert title="自定义 SQL 检查暂不支持执行，仅可保存配置。将在后续版本中支持。" type="info" show-icon :closable="false"
            style="margin-bottom: 12px" />
          <el-form-item label="SQL 语句">
            <el-input v-model="form.rule_config.sql" type="textarea" :rows="3" placeholder="SELECT COUNT(*) FROM ..." />
          </el-form-item>
        </template>

        <el-form-item label="严重级别">
          <el-radio-group v-model="form.severity">
            <el-radio v-for="o in severityOptions" :key="o.value" :value="o.value">{{ o.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <!-- Q0315: 定时执行 — 保存后在列表操作栏配置 -->
        <el-form-item label="定时执行">
          <span style="font-size: 12px; color: #909399">保存规则后，在列表操作栏点击「定时」配置</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- ==================== 运行历史对话框 ==================== -->
    <el-dialog v-model="runsVisible" title="质量运行历史" width="780px" @close="runs = []">
      <el-table :data="runs" size="small" border max-height="400">
        <el-table-column prop="id" label="运行ID" width="80" />
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="runStatusTagType(row.status)">{{ runStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="checked_count" label="检查数" width="80" align="center" />
        <el-table-column prop="failed_count" label="失败数" width="80" align="center" />
        <el-table-column prop="started_at" label="开始时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.started_at) }}</template>
        </el-table-column>
        <el-table-column prop="finished_at" label="结束时间" width="150">
          <template #default="{ row }">{{ formatDateTime(row.finished_at) }}</template>
        </el-table-column>
        <el-table-column prop="message" label="消息" min-width="120" show-overflow-tooltip />
        <el-table-column label="操作" width="70" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'fail' || row.status === 'error'"
              text size="small" type="warning" :icon="RefreshRight"
              :loading="retrying.has(row.rule_id)"
              @click="retryQualityRun(row.rule_id)"
            >重跑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>

    <!-- 定时配置弹窗 -->
    <ScheduleConfigDialog
      v-model:visible="scheduleVisible"
      kind="quality_run"
      :business-id="scheduleBizId"
      :business-name="scheduleBizName"
      :payload="{ rule_id: scheduleBizId }"
    />

    <!-- ==================== 运行结果对话框 ==================== -->
    <el-dialog v-model="runDialogVisible" title="运行结果" width="500px">
      <div v-if="runLoading" style="text-align: center; padding: 40px">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p style="margin-top: 12px; color: #909399">执行中…</p>
      </div>
      <template v-else-if="runResult">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="运行 ID">{{ runResult.run_id }}</el-descriptions-item>
          <el-descriptions-item label="结果">
            <el-tag :type="runStatusTagType(runResult.status)" size="small">
              {{ runStatusLabel(runResult.status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="详情">{{ runResult.message }}</el-descriptions-item>
        </el-descriptions>
      </template>
      <template #footer>
        <el-button @click="runDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.quality-page { padding: 24px; max-width: 1400px; margin: 0 auto; }

.page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page-header h2 { margin: 0; font-size: 20px; }

.filter-card { margin-bottom: 12px; }

.alert-card { text-align: center; }
.alert-num { font-size: 28px; font-weight: 600; color: #303133; }
.alert-label { font-size: 13px; color: #909399; margin-top: 4px; }
.text-danger { color: #F56C6C; }
.text-warning { color: #E6A23C; }
</style>
