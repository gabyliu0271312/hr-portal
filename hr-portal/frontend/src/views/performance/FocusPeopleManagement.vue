<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { performanceFocusGroupApi, type PerformanceFocusGroup } from '@/api/performance'
import { type PerformanceTableColumn } from '@/components/performance/performanceTableColumns'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue'
import PerformanceLineTabs from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformancePermissionButton from '@/components/performance/PerformancePermissionButton.vue'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import MetricTemplateEmptyIllustration from '@/components/performance/MetricTemplateEmptyIllustration.vue'

const route = useRoute()
const router = useRouter()

function cycleId() {
  const value = Number(route.params.cycleId)
  return Number.isInteger(value) && value > 0 ? value : null
}

const activeTab = ref<'semester' | 'project'>(route.query.tab === 'project' ? 'project' : 'semester')
const tabs = [
  { key: 'semester', label: '周期级人员组' },
  { key: 'project', label: '关联评估项目的人员组' },
]
const keyword = ref('')
const rows = ref<PerformanceFocusGroup[]>([])
const loading = ref(false)
const error = ref('')
const canCreate = ref(false)
const priorityLoading = ref(true)
const deleteOpen = ref(false)
const deleteTarget = ref<PerformanceFocusGroup | null>(null)
const deleting = ref(false)

const columns = computed<PerformanceTableColumn[]>(() => [
  { key: 'name', label: '人员组名称', width: 240, fixed: 'left' },
  ...(activeTab.value === 'semester'
    ? [{ key: 'people_count', label: '人数', width: 120 }]
    : [
        { key: 'project', label: '关联评估项目', width: 180 },
        { key: 'people_count', label: '人数', width: 120 },
      ]),
  { key: 'scope_mode', label: '人员范围设置方式', width: 240 },
  { key: 'created_by', label: '创建人', width: 200 },
  { key: 'created_at', label: '创建时间', width: 200 },
  { key: 'updated_by', label: '更新人', width: 200 },
  { key: 'updated_at', label: '更新时间', width: 200 },
  { key: 'action', label: '操作', width: 160, fixed: 'right' },
])

function formatDateTime(value: string) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const scopeModeLabels: Record<string, string> = {
  manual: '手动圈选',
  department: '按部门选择',
  rule: '按规则匹配',
}

async function load() {
  const id = cycleId()
  if (!id) { error.value = '缺少绩效周期'; return }
  loading.value = true
  error.value = ''
  try {
    const result = await performanceFocusGroupApi.list(id, {
      tab: activeTab.value,
      keyword: keyword.value.trim() || undefined,
    })
    rows.value = result.items
  } catch (e: any) {
    rows.value = []
    error.value = e?.response?.data?.detail || '人员组加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function search() {
  void load()
}

function clearSearch() {
  keyword.value = ''
  void load()
}

function openCreate() {
  const id = cycleId()
  if (!id) { ElMessage.warning('缺少绩效周期'); return }
  void router.push({ name: 'PerformanceCycleFocusPeopleCreate', params: { cycleId: id }, query: { tab: activeTab.value } })
}

function openDetail(row: PerformanceFocusGroup) {
  const id = cycleId()
  if (!id) { ElMessage.warning('缺少绩效周期'); return }
  // 飞书两层链路：列表「编辑」先进详情管理页（基本信息 + 人员列表 + 变更记录），头部「编辑」才进表单
  const name = activeTab.value === 'project' ? 'PerformanceActivityFocusPeopleDetail' : 'PerformanceCycleFocusPeopleManagementDetail'
  void router.push({ name, params: { cycleId: id, groupId: row.id }, query: { tab: activeTab.value } })
}

function openDelete(row: PerformanceFocusGroup) {
  deleteTarget.value = row
  deleteOpen.value = true
}

async function confirmDelete() {
  const id = cycleId()
  const target = deleteTarget.value
  if (!id || !target || deleting.value) return
  deleting.value = true
  try {
    await performanceFocusGroupApi.remove(id, target.id)
    deleteOpen.value = false
    deleteTarget.value = null
    await load()
    ElMessage.success('人员组已删除')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '删除失败，请稍后重试')
  } finally {
    deleting.value = false
  }
}

function goBack() {
  void router.push({ name: 'PerformanceCycles' })
}

watch(activeTab, () => {
  keyword.value = ''
  void load()
})

watch(() => route.query.tab, value => {
  if (value === 'project' || value === 'semester') activeTab.value = value
})

onMounted(async () => {
  void load()
  const id = cycleId()
  if (id) {
    try {
      canCreate.value = await performanceFocusGroupApi.priorityCheck(id)
    } catch {
      canCreate.value = false
    } finally {
      priorityLoading.value = false
    }
  } else {
    priorityLoading.value = false
  }
})
</script>

<template>
  <UiFullScreenModal title="人员组管理" :show-footer="false" @back="goBack">
    <div class="focus-people-page">
      <PerformanceContentSurface class="focus-people-surface">
        <PerformanceLineTabs v-model="activeTab" :tabs="tabs" fill>
          <div class="focus-people-toolbar">
            <PerformanceCreateButton :disabled="!canCreate" label="新建" @click="openCreate" />
            <div class="focus-people-tools">
              <PerformanceSearchInput
                v-model="keyword"
                placeholder="搜索"
                aria-label="搜索人员组"
                @search="search"
                @clear="clearSearch"
              />
              <button class="filter-button" type="button" aria-label="筛选人员组" @click="search">筛选</button>
            </div>
          </div>
          <PerformanceManagementTable
            :rows="rows"
            :columns="columns"
            :loading="loading"
            loading-text="正在加载人员组…"
            :empty-text="error || '暂无内容'"
            table-aria-label="人员组表格"
            pagination-aria-label="人员组分页"
            scroll-mode="page"
            row-key="id"
            :show-pagination="false"
            class="focus-people-table"
          >
            <template #cell="{ row, column }">
              <template v-if="column.key === 'action'">
                <button class="row-action" type="button" :disabled="loading || !canCreate" @click="openDetail(row as PerformanceFocusGroup)">编辑</button>
                <button class="row-action" type="button" :disabled="loading || !canCreate" @click="openDelete(row as PerformanceFocusGroup)">删除</button>
              </template>
              <span v-else-if="column.key === 'people_count'">{{ (row as PerformanceFocusGroup).employee_nos.length }}</span>
              <span v-else-if="column.key === 'project'">{{ (row as PerformanceFocusGroup).activity_names?.length ? (row as PerformanceFocusGroup).activity_names.join('、') : ((row as PerformanceFocusGroup).project_ref || '--') }}</span>
              <span v-else-if="column.key === 'scope_mode'">{{ scopeModeLabels[(row as PerformanceFocusGroup).scope_mode] || (row as PerformanceFocusGroup).scope_mode || '--' }}</span>
              <span v-else-if="column.key === 'created_at' || column.key === 'updated_at'">{{ formatDateTime((row as PerformanceFocusGroup)[column.key]) }}</span>
              <span v-else>{{ (row as any)[column.key] || '--' }}</span>
            </template>
            <template #empty="{ loading: isLoading, text }">
              <div v-if="!isLoading" class="focus-people-empty">
                <MetricTemplateEmptyIllustration />
                <span class="focus-people-empty__text">{{ text }}</span>
              </div>
            </template>
          </PerformanceManagementTable>
        </PerformanceLineTabs>
      </PerformanceContentSurface>
      <PerformanceConfirmDialog
        v-model="deleteOpen"
        message="确定删除该人员组吗？"
        :description="`删除后，人员组「${deleteTarget?.name || ''}」将不再可用，且不可恢复。`"
        confirm-text="删除"
        :loading="deleting"
        @confirm="confirmDelete"
      />
    </div>
  </UiFullScreenModal>
</template>

<style scoped>
.focus-people-page {
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  padding: 16px 20px 0;
  box-sizing: border-box;
  overflow: auto;
  background: #f5f6f7;
}
.focus-people-surface {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0 20px 20px;
  box-shadow: none;
  --performance-line-tabs-surface: #fff;
}
.focus-people-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  margin-bottom: 8px;
}
.focus-people-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.focus-people-tools :deep(.performance-search-input) {
  flex: 0 0 292px;
  width: 292px !important;
}
.filter-button {
  width: 80px;
  height: 32px;
  border: 1px solid #d0d3d6;
  border-radius: 6px;
  background: #fff;
  color: #1f2329;
  font: 400 14px/22px var(--font-sans);
  cursor: pointer;
}
.filter-button:hover {
  background: #f5f6f7;
}
.focus-people-table {
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
  /* 表格区域高度 = 视口剩余（head 56 + page padding 16 + tabs 区 48 + toolbar 48+8 + 表头 47 = 223，空态从表头底起） */
  --ui-table-empty-height: calc(100vh - 223px);
}
.focus-people-table :deep(.ui-table__cell--head) {
  color: #646a73;
  font-weight: 500;
}
.row-action {
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3370ff;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.row-action:hover {
  background: #eff0f1;
}
.focus-people-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}
.focus-people-empty__text {
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
</style>
