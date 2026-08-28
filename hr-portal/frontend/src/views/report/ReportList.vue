<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, Document, Edit, InfoFilled, MoreFilled, Plus, Position, Search } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import { useUserStore } from '@/stores/user'
import { formatDateTime } from '@/utils/datetime'
import { reportsApi, REPORT_VISIBILITY_LABELS, type ReportItem, type ReportVisibility } from '@/api/reports'
import { datasetsApi, type DatasetItem } from '@/api/datasets'

const PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 300

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

function positiveInt(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function visibilityTagType(v: ReportVisibility): 'info' | 'warning' | 'success' {
  return v === 'public' ? 'success' : v === 'scoped' ? 'warning' : 'info'
}

const list = ref<ReportItem[]>([])
const datasets = ref<DatasetItem[]>([])
const loading = ref(false)
const loadError = ref('')
const pushing = ref<number | null>(null)
const copying = ref<number | null>(null)
const filterDataset = ref<number | null>(route.query.dataset ? positiveInt(route.query.dataset, 0) || null : null)
const filterKeyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const page = ref(positiveInt(route.query.page, 1))
let searchTimer: number | undefined
let requestSequence = 0

const hasFilters = computed(() => Boolean(filterDataset.value || filterKeyword.value.trim()))
const pageCount = computed(() => Math.max(1, Math.ceil(list.value.length / PAGE_SIZE)))
const pagedList = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return list.value.slice(start, start + PAGE_SIZE)
})

function syncRouteQuery() {
  const query: Record<string, string> = {}
  if (filterDataset.value) query.dataset = String(filterDataset.value)
  if (filterKeyword.value.trim()) query.keyword = filterKeyword.value.trim()
  if (page.value > 1) query.page = String(page.value)
  void router.replace({ query })
}

async function load() {
  const sequence = ++requestSequence
  loading.value = true
  loadError.value = ''
  try {
    const result = await reportsApi.list({
      dataset_id: filterDataset.value || undefined,
      keyword: filterKeyword.value.trim() || undefined,
    })
    if (sequence !== requestSequence) return
    list.value = result
    if (page.value > Math.max(1, Math.ceil(result.length / PAGE_SIZE))) {
      page.value = 1
      syncRouteQuery()
    }
  } catch (e: any) {
    if (sequence !== requestSequence) return
    list.value = []
    loadError.value = e?.response?.data?.detail || '报表加载失败，请稍后重试'
  } finally {
    if (sequence === requestSequence) loading.value = false
  }
}

async function loadDatasets() {
  try {
    datasets.value = await datasetsApi.list()
  } catch {
    datasets.value = []
  }
}

function openDesigner(row?: ReportItem) {
  router.push({
    path: row ? `/report/designer/${row.id}` : '/report/designer/new',
    query: { returnTo: route.fullPath },
  })
}

function openRun(row: ReportItem) {
  router.push({ path: `/report/run/${row.id}`, query: { returnTo: route.fullPath } })
}

async function handlePush(row: ReportItem) {
  if (!row.can_edit || !row.active_push_target_count) return
  pushing.value = row.id
  try {
    const results = await reportsApi.push(row.id)
    const failed = results.filter((result) => !result.ok)
    if (failed.length) {
      ElMessage.error(`推送完成，但 ${failed.length} 个目标失败：${failed[0].message || failed[0].target_name}`)
    } else {
      const rows = results.reduce((sum, result) => sum + (result.rows || 0), 0)
      ElMessage.success(`报表推送成功：${results.length} 个目标，${rows} 行`)
    }
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '推送失败')
  } finally {
    pushing.value = null
  }
}

async function handleCopy(row: ReportItem) {
  try {
    await ElMessageBox.confirm(
      `确认复制报表「${row.name}」？将生成一份完全相同的副本。`,
      '复制报表',
      { type: 'info', confirmButtonText: '确认复制' },
    )
  } catch {
    return
  }

  copying.value = row.id
  try {
    const detail = await reportsApi.get(row.id)
    const result = await reportsApi.create({
      name: `${row.name} - 副本`,
      description: detail.description,
      dataset_id: detail.dataset_id,
      config: detail.config,
      visibility: 'private',
      scope_strategy: detail.scope_strategy,
      acl: [],
    })
    ElMessage.success('报表已复制')
    router.push({ path: `/report/designer/${result.id}`, query: { returnTo: route.fullPath } })
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '复制失败')
  } finally {
    copying.value = null
  }
}

async function handleDelete(row: ReportItem) {
  try {
    await ElMessageBox.confirm(`确认删除报表「${row.name}」？该操作不可恢复。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await reportsApi.remove(row.id)
    ElMessage.success('已删除')
    await load()
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败')
  }
}

function canCopy() {
  return userStore.hasOp('report.list', 'C')
}

function canPush(row: ReportItem) {
  return row.can_edit && Boolean(row.active_push_target_count) && userStore.hasOp('report.list', 'C')
}

function canDelete(row: ReportItem) {
  return row.can_edit && userStore.hasOp('report.list', 'D')
}

function hasSecondaryActions(row: ReportItem) {
  return canCopy() || canPush(row) || canDelete(row)
}

function handleRowCommand(command: string, row: ReportItem) {
  if (command === 'copy') void handleCopy(row)
  if (command === 'push') void handlePush(row)
  if (command === 'delete') void handleDelete(row)
}

watch(filterDataset, () => {
  page.value = 1
  syncRouteQuery()
  void load()
})

watch(filterKeyword, () => {
  window.clearTimeout(searchTimer)
  if (!filterKeyword.value.trim()) {
    page.value = 1
    syncRouteQuery()
    void load()
    return
  }
  searchTimer = window.setTimeout(() => {
    page.value = 1
    syncRouteQuery()
    void load()
  }, SEARCH_DEBOUNCE_MS)
})

watch(page, syncRouteQuery)

onMounted(async () => {
  await Promise.all([loadDatasets(), load()])
})

onBeforeUnmount(() => window.clearTimeout(searchTimer))
</script>

<template>
  <section class="report-list-page">
    <div class="report-toolbar">
      <div class="report-filters" role="search" aria-label="筛选报表">
        <el-select v-model="filterDataset" placeholder="全部数据集" clearable class="dataset-filter">
          <el-option v-for="dataset in datasets" :key="dataset.id" :label="dataset.name" :value="dataset.id" />
        </el-select>
        <el-input v-model="filterKeyword" placeholder="搜索报表名称" clearable class="name-filter">
          <template #prefix><el-icon><Search /></el-icon></template>
        </el-input>
      </div>
      <PermissionButton menu="report.list" op="C" type="primary" @click="openDesigner()">
        <el-icon><Plus /></el-icon><span>新建报表</span>
      </PermissionButton>
    </div>

    <div v-if="loadError && !loading" class="report-error" role="alert">
      <el-empty :description="loadError">
        <el-button type="primary" @click="load">重新加载</el-button>
      </el-empty>
    </div>

    <template v-else>
      <div class="report-table-region">
        <el-table v-loading="loading" :data="pagedList" stripe height="100%" table-layout="fixed">
          <el-table-column label="报表名称" min-width="240">
            <template #default="{ row }">
              <div class="report-name-cell">
                <div class="report-name-line">
                  <button class="report-name-link" type="button" @click="openRun(row)">{{ row.name }}</button>
                  <el-tag :type="visibilityTagType(row.visibility)" size="small" effect="plain">
                    {{ REPORT_VISIBILITY_LABELS[(row.visibility as ReportVisibility)] }}
                  </el-tag>
                  <el-tooltip :content="`更新时间：${formatDateTime(row.updated_at)}`" placement="top">
                    <el-icon class="report-info-icon" aria-label="查看报表信息"><InfoFilled /></el-icon>
                  </el-tooltip>
                </div>
                <span v-if="row.description" class="report-description">{{ row.description }}</span>
              </div>
            </template>
          </el-table-column>
          <el-table-column label="数据集" min-width="180">
            <template #default="{ row }">{{ row.dataset_name || `#${row.dataset_id}` }}</template>
          </el-table-column>
          <el-table-column label="所有者" width="120">
            <template #default="{ row }">{{ row.owner_name || '—' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="150" fixed="right" align="center">
            <template #default="{ row }">
              <div class="row-actions">
                <PermissionButton
                  v-if="row.can_edit"
                  menu="report.list"
                  op="U"
                  size="small"
                  link
                  @click="openDesigner(row)"
                >
                  <el-icon><Edit /></el-icon><span>编辑</span>
                </PermissionButton>
                <PermissionButton v-else menu="report.list" op="C" size="small" link @click="openDesigner(row)">
                  <el-icon><Edit /></el-icon><span>另存编辑</span>
                </PermissionButton>
                <el-dropdown
                  v-if="hasSecondaryActions(row)"
                  trigger="click"
                  @command="handleRowCommand($event, row)"
                >
                  <el-button link size="small" aria-label="更多操作" title="更多操作">
                    <el-icon><MoreFilled /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item v-if="canCopy()" command="copy" :disabled="copying === row.id">
                        <el-icon><CopyDocument /></el-icon>复制
                      </el-dropdown-item>
                      <el-dropdown-item v-if="canPush(row)" command="push" :disabled="pushing === row.id">
                        <el-icon><Position /></el-icon>推送
                      </el-dropdown-item>
                      <el-dropdown-item v-if="canDelete(row)" command="delete" divided class="danger-menu-item">
                        <el-icon><Delete /></el-icon>删除
                      </el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
              </div>
            </template>
          </el-table-column>
          <template #empty>
            <div class="report-empty">
              <el-icon><Document /></el-icon>
              <span>{{ hasFilters ? '没有符合筛选条件的报表' : '暂无报表' }}</span>
              <small>{{ hasFilters ? '可调整数据集或名称后重试' : '新建报表后将在这里统一管理' }}</small>
            </div>
          </template>
        </el-table>
      </div>

      <footer class="report-pagination">
        <span class="result-count">共 {{ list.length }} 条</span>
        <el-pagination
          v-if="pageCount > 1"
          v-model:current-page="page"
          :page-size="PAGE_SIZE"
          :total="list.length"
          layout="prev, pager, next"
          background
        />
      </footer>
    </template>
  </section>
</template>

<style scoped>
.report-list-page {
  box-sizing: border-box;
  display: flex;
  min-height: calc(100vh - 56px);
  padding: 24px 32px 16px;
  flex-direction: column;
  gap: 16px;
}
.report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
}
.report-filters { display: flex; align-items: center; gap: 12px; min-width: 0; }
.dataset-filter { width: 220px; }
.name-filter { width: 280px; }
.report-toolbar :deep(.el-select__wrapper),
.report-toolbar :deep(.el-input__wrapper),
.report-toolbar :deep(.el-button) { min-height: 32px; }
.report-table-region { min-height: 360px; flex: 1 1 auto; }
.report-name-cell { display: grid; gap: 4px; min-width: 0; }
.report-name-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
.report-name-link {
  min-width: 0;
  padding: 0;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: var(--color-primary);
  cursor: pointer;
  font: inherit;
  font-weight: 600;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.report-name-link:hover { text-decoration: underline; }
.report-name-link:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.report-info-icon { flex: none; color: var(--color-text-placeholder); cursor: help; }
.report-info-icon:hover { color: var(--color-primary); }
.report-description {
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-actions { display: flex; align-items: center; justify-content: center; gap: 4px; }
.danger-menu-item { color: var(--el-color-danger); }
.report-empty { display: grid; justify-items: center; gap: 8px; padding: 32px 0; color: var(--color-text-placeholder); }
.report-empty .el-icon { font-size: 28px; }
.report-empty small { font-size: 12px; }
.report-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  flex: 0 0 auto;
}
.result-count { color: var(--color-text-secondary); font-size: 13px; }
.report-error { display: grid; min-height: 360px; flex: 1; place-items: center; }
@media (max-width: 720px) {
  .report-list-page { padding: 16px; }
  .report-toolbar { align-items: flex-start; }
  .report-filters { flex: 1; flex-wrap: wrap; }
  .dataset-filter, .name-filter { width: min(100%, 280px); }
}
</style>
