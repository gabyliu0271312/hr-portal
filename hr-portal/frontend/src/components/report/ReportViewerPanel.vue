<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft, Download, Edit, Refresh } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import { reportsApi, type ReportItem, type RunResult } from '@/api/reports'
import { datasetsApi } from '@/api/datasets'
import { getToken } from '@/api/client'

const props = defineProps<{
  reportId: number
}>()

const router = useRouter()

const report = ref<ReportItem | null>(null)
const columns = ref<RunResult['columns']>([])
const items = ref<RunResult['items']>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(50)
const loading = ref(false)
const integrity = ref<{ ok: boolean; issues: string[] } | null>(null)

async function loadReport() {
  try {
    report.value = await reportsApi.get(props.reportId)
    if (report.value.dataset_id) {
      try {
        integrity.value = await datasetsApi.integrity(report.value.dataset_id)
      } catch {
        integrity.value = null
      }
    } else {
      integrity.value = null
    }
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '加载报表失败')
  }
}

async function run() {
  if (integrity.value && !integrity.value.ok) {
    ElMessage.warning('数据集关联不完整，请先修复后再运行')
    return
  }
  loading.value = true
  try {
    const res = await reportsApi.run(props.reportId, page.value, pageSize.value)
    columns.value = res.columns
    items.value = res.items
    total.value = res.total
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
      ? reportsApi.exportXlsxUrl(props.reportId)
      : reportsApi.exportCsvUrl(props.reportId)
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
    ElMessage.success('导出成功')
  } catch (e: any) {
    ElMessage.error(e?.message || '导出失败')
  }
}

const filterDescriptions = computed(() => {
  const cfg = report.value?.config
  if (!cfg) return [] as string[]
  return cfg.filters.map((f) => `${f.column} ${f.op} ${JSON.stringify(f.value)}`)
})

onMounted(async () => {
  await loadReport()
  await run()
})

defineExpose({ run })
</script>

<template>
  <el-card v-if="report">
    <template #header>
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div>
          <el-button link @click="router.push('/report/list')">
            <el-icon><ArrowLeft /></el-icon>返回列表
          </el-button>
          <span style="font-size: 16px; font-weight: 600; margin-left: 8px">{{ report.name }}</span>
          <el-tag v-if="report.is_published" size="small" type="success" effect="plain" style="margin-left: 8px">已发布</el-tag>
          <el-tag v-else size="small" type="info" effect="plain" style="margin-left: 8px">草稿</el-tag>
        </div>
        <div style="display: flex; gap: 8px; align-items: center">
          <slot name="toolbar-extra" />
          <el-button :loading="loading" @click="run">
            <el-icon style="margin-right: 4px"><Refresh /></el-icon>刷新
          </el-button>
          <PermissionButton menu="report.list" op="U" @click="router.push(`/report/designer/${report.id}`)">
            <el-icon style="margin-right: 4px"><Edit /></el-icon>编辑
          </PermissionButton>
          <PermissionButton menu="report.list" op="E" @click="doExport('csv')">
            <el-icon style="margin-right: 4px"><Download /></el-icon>CSV
          </PermissionButton>
          <PermissionButton menu="report.list" op="E" type="primary" @click="doExport('xlsx')">
            <el-icon style="margin-right: 4px"><Download /></el-icon>Excel
          </PermissionButton>
        </div>
      </div>
    </template>

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

    <el-descriptions :column="3" size="small" border style="margin-bottom: 16px">
      <el-descriptions-item label="数据来源">
        <span v-if="report.dataset_id">
          <el-tag size="small" type="warning" effect="plain">数据集</el-tag>
          <strong style="margin-left: 6px">{{ report.dataset_name }}</strong>
        </span>
        <span v-else>
          <el-tag size="small" effect="plain">单表</el-tag>
          <strong style="margin-left: 6px">{{ report.table_label || report.table_name }}</strong>
        </span>
      </el-descriptions-item>
      <el-descriptions-item label="所有者">{{ report.owner_name || '—' }}</el-descriptions-item>
      <el-descriptions-item label="字段数">{{ columns.length }}</el-descriptions-item>
      <el-descriptions-item label="筛选条件" :span="3">
        <span v-if="!filterDescriptions.length" style="color: var(--color-text-placeholder)">无</span>
        <el-tag v-for="(d, i) in filterDescriptions" :key="i" size="small" effect="plain" style="margin-right: 4px">{{ d }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item v-if="report.description" label="描述" :span="3">{{ report.description }}</el-descriptions-item>
    </el-descriptions>

    <ReportPreviewTable
      :columns="columns"
      :items="items"
      :total="total"
      :page="page"
      :page-size="pageSize"
      :loading="loading"
      :max-height="600"
      :page-sizes="[20, 50, 100, 200]"
      @update:page="page = $event"
      @update:page-size="pageSize = $event"
      @page-change="run"
    />

    <slot name="below-table" />
  </el-card>

  <el-card v-else>
    <el-empty description="加载报表中..." />
  </el-card>
</template>
