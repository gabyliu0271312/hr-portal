import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { getToken } from '@/api/client'

export function useDataExport() {
  const exporting = ref(false)

  async function exportCsv(
    tableName: string,
    tableLabel: string,
    params: { keyword?: string; filters?: Record<string, string> } = {}
  ) {
    exporting.value = true
    try {
      const query = new URLSearchParams()
      if (params.keyword) query.set('keyword', params.keyword)
      if (params.filters && Object.keys(params.filters).length) {
        query.set('filters', JSON.stringify(params.filters))
      }
      const url = `/api/v1/data/${tableName}/export.csv${query.toString() ? '?' + query.toString() : ''}`
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
      a.download = `${tableLabel || tableName}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(dlUrl)
      ElMessage.success('导出成功')
    } catch (e: any) {
      ElMessage.error(e?.message || '导出失败')
    } finally {
      exporting.value = false
    }
  }

  return { exporting, exportCsv }
}
