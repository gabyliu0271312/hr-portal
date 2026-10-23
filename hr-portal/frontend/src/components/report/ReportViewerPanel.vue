<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Download, Edit, InfoFilled, Refresh } from '@element-plus/icons-vue'
import FullscreenWorkspaceShell from '@/components/layout/FullscreenWorkspaceShell.vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { formatDateTime } from '@/utils/datetime'
import ReportPreviewTable from '@/components/report/ReportPreviewTable.vue'
import ReportRuntimeFilters from '@/components/report/ReportRuntimeFilters.vue'
import ReportExecutionAuthorization from '@/components/report/ReportExecutionAuthorization.vue'
import { REPORT_VISIBILITY_LABELS } from '@/api/reports'
import { useReportViewer } from './useReportViewer'

const props = defineProps<{ reportId: number }>()
const router = useRouter()
const route = useRoute()
const reportListTarget = computed(() => {
  const target = route.query.returnTo
  return typeof target === 'string' && target.startsWith('/report/list') ? target : '/report/list'
})
const { report, columns, items, total, runWarnings, page, pageSize, loading, loadingReport,
  reportLoadError, runError, integrity, columnLabels, datasetTables, authorizedExecution,
  run, retryLoadReport, doExport, applyRuntimeFilters } = useReportViewer(() => props.reportId)
const visibilityTagType = computed(() => report.value?.visibility === 'public' ? 'success' : report.value?.visibility === 'scoped' ? 'warning' : 'info')
const sourceSummary = computed(() => report.value ? `数据集 · ${report.value.dataset_name || `#${report.value.dataset_id}`}` : '')
const fieldCount = computed(() => columns.value.length || report.value?.config.columns?.length || 0)
defineExpose({ run })
</script>

<template>
  <FullscreenWorkspaceShell :title="report?.name || '查看报表'" :subtitle="sourceSummary" @back="router.push(reportListTarget)">
    <template v-if="report" #title-extra>
      <el-tooltip placement="bottom-start" :width="320">
        <template #content>
          <div class="report-info-tip">
            <div>数据来源：{{ sourceSummary }}</div>
            <div>所有者：{{ report.owner_name || '—' }}</div>
            <div>字段数：{{ fieldCount }}</div>
            <div>运行次数：{{ report.run_count }}</div>
            <div>上次运行：{{ formatDateTime(report.last_run_at) }}</div>
            <div v-if="report.description">描述：{{ report.description }}</div>
          </div>
        </template>
        <el-icon class="info-icon"><InfoFilled /></el-icon>
      </el-tooltip>
      <el-tag :type="visibilityTagType" size="small" effect="plain">{{ REPORT_VISIBILITY_LABELS[report.visibility] }}</el-tag>
    </template>
    <template v-if="report" #actions>
      <slot v-if="!authorizedExecution" name="toolbar-extra" />
      <ReportExecutionAuthorization :report="report" @approved="retryLoadReport" />
      <PermissionButton menu="report.list" op="V" :disabled="loading || loadingReport" @click="run">
        <el-icon><Refresh /></el-icon>刷新
      </PermissionButton>
      <PermissionButton v-if="report.can_edit && !authorizedExecution" menu="report.list" op="U"
        @click="router.push({ path: `/report/designer/${report.id}`, query: { returnTo: reportListTarget } })">
        <el-icon><Edit /></el-icon>编辑
      </PermissionButton>
      <PermissionButton menu="report.list" op="E" :disabled="loading || !!runError" @click="doExport('csv')">
        <el-icon><Download /></el-icon>CSV
      </PermissionButton>
      <PermissionButton menu="report.list" op="E" type="primary" :disabled="loading || !!runError" @click="doExport('xlsx')">
        <el-icon><Download /></el-icon>Excel
      </PermissionButton>
    </template>
    <div v-if="report" class="report-view-content">
      <el-alert v-if="authorizedExecution" type="info" :closable="false" show-icon
        title="当前授权范围内汇总（人员范围与成本中心汇总范围合并），不代表全量数据。"
        description="仅开放 run / COUNT / CSV / XLSX；无明细下钻、复杂过滤或对外出口。AI解释、推送、筛选、设计器模型预览等渠道未开放。" />
      <ReportRuntimeFilters v-else :filters="report.config.filters || []" :filter-logic="report.config.filter_logic"
        :column-labels="columnLabels" :current-dataset-tables="datasetTables" @apply="applyRuntimeFilters" />
      <el-alert v-if="integrity && !integrity.ok" type="warning" :closable="false" show-icon title="数据集关联不完整，运行已禁用">
        <ul><li v-for="issue in integrity.issues" :key="issue">{{ issue }}</li></ul>
      </el-alert>
      <el-alert v-if="runError" type="error" :closable="false" show-icon :title="runError" />
      <el-alert v-if="runWarnings.length" type="warning" :closable="false" show-icon title="运行提示">
        <ul><li v-for="warning in runWarnings" :key="warning">{{ warning }}</li></ul>
      </el-alert>
      <ReportPreviewTable v-if="!runError" :columns="columns" :items="items" :total="total" :page="page"
        :page-size="pageSize" :loading="loading" :column-settings="report.config.column_settings || {}"
        fill-viewport :page-sizes="[20, 50, 100]" @update:page="page = $event" @update:page-size="pageSize = $event" @page-change="run" />
      <slot v-if="!authorizedExecution && !runError" name="below-table" />
    </div>
    <el-empty v-else-if="reportLoadError" :description="reportLoadError">
      <PermissionButton menu="report.list" op="V" type="primary" @click="retryLoadReport">重新加载</PermissionButton>
    </el-empty>
    <el-empty v-else description="加载报表中..." />
  </FullscreenWorkspaceShell>
</template>

<style scoped>
.report-view-content { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.info-icon { flex: none; color: var(--el-color-primary); cursor: help; font-size: 16px; }
.report-info-tip { display: grid; gap: 8px; }
.report-view-content :deep(.runtime-filter-bar), .report-view-content :deep(.el-alert) { flex: 0 0 auto; }
.report-view-content :deep(.el-alert) { margin: 0 16px 16px; }
.report-view-content :deep(.report-preview-table) { margin-inline: 16px; }
.report-view-content :deep(.report-table-pagination) { padding-bottom: 16px; }
</style>
