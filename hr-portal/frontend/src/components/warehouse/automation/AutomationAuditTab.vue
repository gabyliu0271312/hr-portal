<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { getL4Summary, listL4Executions, type L4ExecutionItem, type L4ExecutionsList } from '@/api/warehouse'

const summary = ref<any>(null)
const loading = ref(true)

const executions = ref<L4ExecutionItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const filterStatus = ref('')
const filterTrigger = ref('')
const filterMetricId = ref('')

const STATUS_LABELS: Record<string, string> = {
  success: '成功', partial_failed: '部分失败', failed: '失败',
  review_required: '待确认', approval_required: '待审批',
  skipped: '已跳过', blocked: '已阻断', running: '执行中',
}
const STATUS_TAG: Record<string, string> = {
  success: 'success', partial_failed: 'warning', failed: 'danger',
  review_required: 'warning', approval_required: 'warning',
  skipped: 'info', blocked: 'danger', running: 'info',
}
const TRIGGER_LABELS: Record<string, string> = {
  metric_saved: '指标保存', dwd_data_refreshed: 'DWD 刷新',
  dwd_schema_changed: 'DWD 结构变更', dwd_metadata_changed: 'DWD 元数据变更',
  ods_table_data_changed: 'ODS 数据变更', datasource_sync_completed: '数据源同步',
  ods_table_metadata_changed: 'ODS 元数据变更', standardization_rule_changed: '清洗规则变更',
  ods_dwd_automation_config_changed: '自动化配置变更',
}

async function loadSummary() {
  try { summary.value = await getL4Summary() } catch { summary.value = null }
}

async function loadExecs() {
  loading.value = true
  try {
    const params: any = { page: page.value, page_size: pageSize.value }
    if (filterStatus.value) params.status = filterStatus.value
    if (filterTrigger.value) params.trigger_type = filterTrigger.value
    if (filterMetricId.value) params.metric_id = Number(filterMetricId.value)
    const r = await listL4Executions(params)
    executions.value = r.items
    total.value = r.total
  } catch { executions.value = []; total.value = 0 }
  finally { loading.value = false }
}

onMounted(() => { loadSummary(); loadExecs() })
watch([page, filterStatus, filterTrigger, filterMetricId], () => { loadExecs() })
</script>

<template>
  <div>
    <!-- 摘要 -->
    <el-row :gutter="16" style="margin-bottom:16px">
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num">{{ summary?.total ?? '-' }}</div><div class="stat-label">总执行</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num success">{{ summary?.success ?? '-' }}</div><div class="stat-label">成功</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num warning">{{ summary?.blocked ?? '-' }}</div><div class="stat-label">阻断</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num danger">{{ summary?.failed ?? '-' }}</div><div class="stat-label">失败</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num" :class="summary?.emergency_stopped ? 'danger' : ''">{{ summary?.emergency_stopped ? '⛔' : '✓' }}</div><div class="stat-label">运行状态</div></el-card></el-col>
      <el-col :span="4"><el-card shadow="hover"><div class="stat-num info">{{ summary?.period_hours ?? 24 }}h</div><div class="stat-label">统计周期</div></el-card></el-col>
    </el-row>

    <!-- 筛选 -->
    <el-card shadow="never" style="margin-bottom:12px">
      <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
        <el-select v-model="filterStatus" placeholder="状态" clearable size="small" style="width:120px" @change="page=1">
          <el-option v-for="(label, key) in STATUS_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-select v-model="filterTrigger" placeholder="触发方式" clearable size="small" style="width:150px" @change="page=1">
          <el-option v-for="(label, key) in TRIGGER_LABELS" :key="key" :label="label" :value="key" />
        </el-select>
        <el-input v-model="filterMetricId" placeholder="指标 ID" clearable size="small" style="width:120px" @change="page=1" />
        <el-button size="small" :icon="Refresh" @click="loadExecs">刷新</el-button>
      </div>
    </el-card>

    <!-- 列表 -->
    <el-table :data="executions" v-loading="loading" stripe size="small" empty-text="暂无 L4 运行记录">
      <el-table-column label="执行 ID" width="80" prop="execution_id" />
      <el-table-column label="触发方式" width="130">
        <template #default="{ row }">{{ TRIGGER_LABELS[row.trigger_type] || row.trigger_type }}</template>
      </el-table-column>
      <el-table-column label="指标 ID" width="80" prop="biz_id" />
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="STATUS_TAG[row.status]">{{ STATUS_LABELS[row.status] || row.status }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="开始时间" width="140">
        <template #default="{ row }">{{ row.started_at?.slice(0, 19) || '-' }}</template>
      </el-table-column>
      <el-table-column label="结束时间" width="140">
        <template #default="{ row }">{{ row.finished_at?.slice(0, 19) || '-' }}</template>
      </el-table-column>
      <el-table-column label="输出摘要" min-width="120">
        <template #default="{ row }">{{ row.output_summary || row.error_message?.substring(0, 80) || '-' }}</template>
      </el-table-column>
    </el-table>

    <el-pagination v-if="total > 0" style="margin-top:12px;justify-content:flex-end"
      v-model:current-page="page" v-model:page-size="pageSize"
      :total="total" layout="total,sizes,prev,pager,next" :page-sizes="[10,20,50]" />
  </div>
</template>

<style scoped>
.stat-num { font-size: 24px; font-weight: 700; text-align: center; color: #303133; }
.stat-num.success { color: #67C23A; }
.stat-num.warning { color: #E6A23C; }
.stat-num.danger { color: #F56C6C; }
.stat-num.info { color: #409EFF; }
.stat-label { font-size: 12px; color: #909399; text-align: center; margin-top: 4px; }
</style>
