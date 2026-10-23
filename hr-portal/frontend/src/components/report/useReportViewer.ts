import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { reportsApi, reportErrorMessage, type FilterCond, type ReportItem, type RunResult } from '@/api/reports'
import { datasetsApi, type DatasetItem } from '@/api/datasets'
import { dataApi } from '@/api/data'
import { getToken } from '@/api/client'
import { useUserStore } from '@/stores/user'

export function useReportViewer(reportId: () => number) {
  const user = useUserStore()
  const report = ref<ReportItem | null>(null)
  const columns = ref<RunResult['columns']>([])
  const items = ref<RunResult['items']>([])
  const total = ref(0)
  const runWarnings = ref<string[]>([])
  const page = ref(1)
  const pageSize = ref(50)
  const loading = ref(false)
  const loadingReport = ref(false)
  const reportLoadError = ref('')
  const runError = ref('')
  const integrity = ref<{ ok: boolean; issues: string[] } | null>(null)
  const runtimeFilters = ref<FilterCond[]>([])
  const columnLabels = ref<Record<string, string>>({})
  const datasetTables = ref<DatasetItem['tables']>([])
  const authorizedExecution = computed(() => report.value?.execution_version === 'authorized_v1')
  let generation = 0
  let runSequence = 0
  let exportSequence = 0
  function clearResults() {
    columns.value = []; items.value = []; total.value = 0; runWarnings.value = []
  }
  function invalidate() {
    generation++; runSequence++; exportSequence++
    loading.value = false; loadingReport.value = false
    clearResults()
  }
  onBeforeUnmount(invalidate)
  async function loadReport() {
    invalidate()
    const request = generation
    report.value = null
    integrity.value = null
    runtimeFilters.value = []
    columnLabels.value = {}
    datasetTables.value = []
    runError.value = ''; reportLoadError.value = ''; loadingReport.value = true
    try {
      const result = await reportsApi.get(reportId())
      if (request !== generation) return
      report.value = result
      if (result.execution_version === 'authorized_v1') return
      try {
        const [health, ds] = await Promise.all([datasetsApi.integrity(result.dataset_id), datasetsApi.get(result.dataset_id)])
        if (request !== generation) return
        integrity.value = health
        datasetTables.value = ds.tables
        const entries = await Promise.all(ds.tables.map(async (table) => {
          const cols = await dataApi.columns(table.table_name)
          return cols.map((col) => [`${table.alias}.${col.code}`, `${table.table_label || table.table_name}.${col.label}`])
        }))
        if (request === generation) columnLabels.value = Object.fromEntries(entries.flat())
      } catch {}
    } catch (e) {
      if (request === generation) reportLoadError.value = reportErrorMessage(e, '加载报表失败')
    } finally {
      if (request === generation) loadingReport.value = false
    }
  }
  async function run() {
    if (!report.value || loadingReport.value) return
    const current = generation
    const request = ++runSequence
    exportSequence++
    clearResults()
    runError.value = ''
    if (integrity.value && !integrity.value.ok) {
      runError.value = '数据集关联不完整，请先修复后再运行'
      return
    }
    loading.value = true
    try {
      const result = await reportsApi.run(reportId(), page.value, pageSize.value, authorizedExecution.value ? [] : runtimeFilters.value)
      if (current !== generation || request !== runSequence) return
      columns.value = result.columns; items.value = result.items; total.value = result.total
      runWarnings.value = result.warnings || []
      report.value!.last_run_at = new Date().toISOString()
      report.value!.run_count++
    } catch (e) {
      if (current !== generation || request !== runSequence) return
      clearResults()
      runError.value = reportErrorMessage(e, '运行失败，请重新加载并核对当前授权')
    } finally {
      if (current === generation && request === runSequence) loading.value = false
    }
  }
  async function retryLoadReport() {
    await loadReport()
    if (report.value && !loadingReport.value) await run()
  }
  async function doExport(format: 'csv' | 'xlsx') {
    if (!report.value || loading.value || loadingReport.value || runError.value || !user.hasOp('report.list', 'E')) return
    const current = generation
    const request = ++exportSequence
    const filters = authorizedExecution.value ? [] : runtimeFilters.value
    const url = format === 'xlsx' ? reportsApi.exportXlsxUrl(reportId(), filters) : reportsApi.exportCsvUrl(reportId(), filters)
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      if (current !== generation || request !== exportSequence) return
      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw { response: { data: body } }
      }
      const blob = await response.blob()
      if (current !== generation || request !== exportSequence) return
      const downloadUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl; link.download = `${report.value?.name || 'report'}.${format}`
      document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(downloadUrl)
      const warning = response.headers.get('X-Export-Warnings')
      if (warning) ElMessage.warning(warning)
      else ElMessage.success('导出成功')
    } catch (e) {
      if (current !== generation || request !== exportSequence) return
      runSequence++
      loading.value = false
      clearResults()
      runError.value = reportErrorMessage(e, '导出失败，请重新加载并核对当前授权')
    }
  }
  function applyRuntimeFilters(filters: FilterCond[]) {
    if (authorizedExecution.value) return
    runtimeFilters.value = filters; page.value = 1; void run()
  }
  watch(reportId, () => {
    page.value = 1
    void retryLoadReport()
  }, { immediate: true, flush: 'sync' })
  watch(() => JSON.stringify([user.user?.id, user.menus, user.roles]), () => {
    invalidate()
    report.value = null
    reportLoadError.value = '当前权限已变更，请主动重新加载报表'
  }, { flush: 'sync' })
  return { report, columns, items, total, runWarnings, page, pageSize, loading, loadingReport,
    reportLoadError, runError, integrity, columnLabels, datasetTables, authorizedExecution,
    run, retryLoadReport, doExport, applyRuntimeFilters }
}
