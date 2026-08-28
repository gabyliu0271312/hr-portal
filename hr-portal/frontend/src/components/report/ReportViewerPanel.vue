<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Download, Edit, InfoFilled, Refresh } from '@element-plus/icons-vue'
import FullscreenWorkspaceShell from '@/components/layout/FullscreenWorkspaceShell.vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { formatDateTime } from '@/utils/datetime'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import ReportRuntimeFilters from '@/components/report/ReportRuntimeFilters.vue'
import { reportsApi, REPORT_VISIBILITY_LABELS, type FilterCond, type ReportItem, type RunResult } from '@/api/reports'
import { datasetsApi, type DatasetItem } from '@/api/datasets'
import { dataApi } from '@/api/data'
import { getToken } from '@/api/client'

const props = defineProps<{
  reportId: number
}>()

const router = useRouter()
const route = useRoute()
const reportListTarget = computed(() => {
  const target = route.query.returnTo
  return typeof target === 'string' && target.startsWith('/report/list') ? target : '/report/list'
})

const report = ref<ReportItem | null>(null)
const visibilityTagType = computed<'info' | 'warning' | 'success'>(() => {
  const v = report.value?.visibility
  return v === 'public' ? 'success' : v === 'scoped' ? 'warning' : 'info'
})
const columns = ref<RunResult['columns']>([])
const items = ref<RunResult['items']>([])
const total = ref(0)
const runWarnings = ref<string[]>([])
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const loadingReport = ref(false)
const reportLoadError = ref('')
const integrity = ref<{ ok: boolean; issues: string[] } | null>(null)
const runtimeFilters = ref<FilterCond[]>([])
const runtimeFilterRef = ref<InstanceType<typeof ReportRuntimeFilters> | null>(null)
const columnLabels = ref<Record<string, string>>({})
const datasetTables = ref<DatasetItem['tables']>([])

function datasetTableName(table: DatasetItem['tables'][number]): string {
  return table.table_label || table.table_name
}

async function loadReport() {
  loadingReport.value = true
  reportLoadError.value = ''
  try {
    report.value = await reportsApi.get(props.reportId)
    try {
      integrity.value = await datasetsApi.integrity(report.value.dataset_id)
    } catch {
      integrity.value = null
    }
    await loadDatasetColumnLabels(report.value.dataset_id)
  } catch (e: any) {
    reportLoadError.value = e?.response?.data?.detail || '加载报表失败'
  } finally {
    loadingReport.value = false
  }
}

async function retryLoadReport() {
  await loadReport()
  if (report.value) await run()
}

async function loadDatasetColumnLabels(datasetId: number) {
  try {
    const ds = await datasetsApi.get(datasetId)
    datasetTables.value = ds.tables
    const entries: [string, string][] = []
    for (const table of ds.tables) {
      const cols = await dataApi.columns(table.table_name)
      const tableName = datasetTableName(table)
      for (const col of cols) {
        entries.push([`${table.alias}.${col.code}`, `${tableName}.${col.label}`])
      }
    }
    columnLabels.value = Object.fromEntries(entries)
  } catch {
    columnLabels.value = {}
  }
}

async function run() {
  if (integrity.value && !integrity.value.ok) {
    ElMessage.warning('数据集关联不完整，请先修复后再运行')
    return
  }
  loading.value = true
  try {
    const res = await reportsApi.run(props.reportId, page.value, pageSize.value, runtimeFilters.value)
    columns.value = res.columns
    items.value = res.items
    total.value = res.total
    runWarnings.value = res.warnings || []
    if (report.value) {
      report.value.last_run_at = new Date().toISOString()
      report.value.run_count = (report.value.run_count || 0) + 1
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '运行失败')
  } finally {
    loading.value = false
  }
}

async function doExport(format: 'csv' | 'xlsx') {
  try {
    const url = format === 'xlsx'
      ? reportsApi.exportXlsxUrl(props.reportId, runtimeFilters.value)
      : reportsApi.exportCsvUrl(props.reportId, runtimeFilters.value)
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(text || `HTTP ${resp.status}`)
    }
    const blob = await resp.blob()
    const dlUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = dlUrl
    a.download = `${report.value?.name || 'report'}.${format}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(dlUrl)

    // 检查导出警告头（如 XLSX 大数文本降级提示）
    const exportWarning = resp.headers.get('X-Export-Warnings')
    if (exportWarning) {
      ElMessage.warning(exportWarning)
    } else {
      ElMessage.success('导出成功')
    }
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const sourceSummary = computed(() => {
  if (!report.value) return ''
  return `数据集 · ${report.value.dataset_name || `#${report.value.dataset_id}`}`
})

const fieldCount = computed(() => columns.value.length || report.value?.config.columns?.length || 0)

function applyRuntimeFilters(filters: FilterCond[]) {
  runtimeFilters.value = filters
  page.value = 1
  run()
}

onMounted(async () => {
  await loadReport()
  if (report.value) await run()
})

defineExpose({ run })
</script>

<template>
  <FullscreenWorkspaceShell
    :title="report?.name || '查看报表'"
    :subtitle="report ? sourceSummary : ''"
    @back="router.push(reportListTarget)"
  >
    <template v-if="report" #title-extra>
      <el-tooltip placement="bottom-start" :width="320">
        <template #content>
          <div class="report-info-tip">
            <div><span>数据来源</span><strong>{{ sourceSummary }}</strong></div>
            <div><span>所有者</span><strong>{{ report.owner_name || '—' }}</strong></div>
            <div><span>字段数</span><strong>{{ fieldCount }}</strong></div>
            <div><span>运行次数</span><strong>{{ report.run_count }}</strong></div>
            <div><span>上次运行</span><strong>{{ formatDateTime(report.last_run_at) }}</strong></div>
            <div v-if="report.description" class="tip-desc"><span>描述</span><strong>{{ report.description }}</strong></div>
          </div>
        </template>
        <el-icon class="info-icon"><InfoFilled /></el-icon>
      </el-tooltip>
      <el-tag :type="visibilityTagType" size="small" effect="plain">
        {{ REPORT_VISIBILITY_LABELS[report.visibility] }}
      </el-tag>
    </template>

    <template v-if="report" #actions>
      <slot name="toolbar-extra" />
      <el-button :loading="loading" @click="run">
        <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
      </el-button>
      <PermissionButton
        menu="report.list"
        op="U"
        @click="router.push({ path: `/report/designer/${report.id}`, query: { returnTo: reportListTarget } })"
      >
        <el-icon style="margin-right: 4px"><Edit /></el-icon>编辑
      </PermissionButton>
      <PermissionButton menu="report.list" op="E" @click="doExport('csv')">
        <el-icon style="margin-right: 4px"><Download /></el-icon>CSV
      </PermissionButton>
      <PermissionButton menu="report.list" op="E" type="primary" @click="doExport('xlsx')">
        <el-icon style="margin-right: 4px"><Download /></el-icon>Excel
      </PermissionButton>
    </template>

    <div v-if="report" class="report-view-content">
      <ReportRuntimeFilters
        ref="runtimeFilterRef"
        :filters="report.config.filters || []"
        :filter-logic="report.config.filter_logic"
        :column-labels="columnLabels"
        :current-dataset-tables="datasetTables"
        @apply="applyRuntimeFilters"
      />

    <el-alert
      v-if="integrity && !integrity.ok"
      type="warning"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    >
      <strong>该报表的数据集关联不完整，运行已禁用：</strong>
      <ul style="margin: 6px 0 0; padding-left: 20px">
        <li v-for="(iss, i) in integrity.issues" :key="i">{{ iss }}</li>
      </ul>
      <div style="margin-top: 6px; font-size: 12px">
        请到「系统设置 → 数据接入 → 表间关联」修复后再回到此页运行。
      </div>
    </el-alert>

    <el-alert
      v-if="runWarnings.length"
      type="warning"
      :closable="true"
      show-icon
      style="margin-bottom: 16px"
    >
      <strong>字段类型不一致已自动兼容（结果可能存在漏匹配）：</strong>
      <ul style="margin: 6px 0 0; padding-left: 20px">
        <li v-for="(w, i) in runWarnings" :key="i">{{ w }}</li>
      </ul>
    </el-alert>

    <ReportPreviewTable
      :columns="columns"
      :items="items"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :loading="loading"
      :column-settings="report.config.column_settings || {}"
      fill-viewport
      :page-sizes="[20, 50, 100]"
      @update:page="page = $event"
      @update:page-size="pageSize = $event"
      @page-change="run"
    />

      <slot name="below-table" />
    </div>

    <el-empty v-else-if="reportLoadError" :description="reportLoadError">
      <el-button type="primary" @click="retryLoadReport">重新加载</el-button>
    </el-empty>
    <el-empty v-else description="加载报表中..." />
  </FullscreenWorkspaceShell>
</template>

<style scoped>
.report-view-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.info-icon {
  flex: none;
  color: var(--color-primary);
  cursor: help;
  font-size: 16px;
}
.report-info-tip {
  display: grid;
  gap: 8px;
}
.report-info-tip div {
  display: grid;
  grid-template-columns: 68px 1fr;
  gap: 10px;
}
.report-info-tip span {
  color: rgba(255, 255, 255, 0.72);
}
.report-info-tip strong {
  color: #fff;
  font-weight: 600;
}
.tip-desc strong {
  line-height: 1.5;
}
.report-view-content :deep(.runtime-filter-bar) {
  flex: 0 0 auto;
}
.report-view-content :deep(.el-alert) {
  flex: 0 0 auto;
  margin-left: 16px;
  margin-right: 16px;
}
.report-view-content :deep(.report-preview-table) {
  margin-left: 16px;
  margin-right: 16px;
}
.report-view-content :deep(.report-table-pagination) {
  padding-bottom: 16px;
}
</style>
