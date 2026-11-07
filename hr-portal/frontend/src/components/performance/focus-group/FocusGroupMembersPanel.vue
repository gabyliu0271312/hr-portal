<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceFocusGroupApi, type PerformanceFocusGroupMember } from '@/api/performance'
import PerformanceManagementTable from '../PerformanceManagementTable.vue'
import PerformanceSearchInput from '../PerformanceSearchInput.vue'
import PerformanceConfirmDialog from '../PerformanceConfirmDialog.vue'
import MetricTemplateEmptyIllustration from '../MetricTemplateEmptyIllustration.vue'
import UiButton from '@/components/ui/UiButton.vue'
import type { PerformanceTableColumn } from '../performanceTableColumns'
import FocusGroupMemberAddDialog from './FocusGroupMemberAddDialog.vue'

const props = defineProps<{
  cycleId: number | null
  groupId: number | null
  groupName: string
}>()

const rows = ref<PerformanceFocusGroupMember[]>([])
const loading = ref(false)
const error = ref('')
const keyword = ref('')
const removeOpen = ref(false)
const removeTarget = ref<PerformanceFocusGroupMember | null>(null)
const removing = ref(false)
const addOpen = ref(false)

const columns = computed<PerformanceTableColumn[]>(() => [
  { key: 'display_name', label: '姓名', width: 195, fixed: 'left' },
  { key: 'direct_supervisor_name', label: '直属上级', width: 195 },
  { key: 'department_2', label: '一级部门', width: 240 },
  { key: 'department_5', label: '末级部门', width: 240 },
  { key: 'job_family', label: '序列', width: 240 },
  { key: 'added_by', label: '添加人', width: 195 },
  { key: 'added_at', label: '添加时间', width: 195 },
  { key: 'action', label: '操作', width: 102, fixed: 'right' },
])

const filteredRows = computed(() => {
  const query = keyword.value.trim()
  if (!query) return rows.value
  return rows.value.filter(person =>
    [person.display_name, person.value, person.direct_supervisor_name, person.department_2, person.department_5, person.job_family]
      .filter(Boolean)
      .some(value => String(value).includes(query)))
})

async function load() {
  if (!props.cycleId || !props.groupId) return
  loading.value = true
  error.value = ''
  try {
    const result = await performanceFocusGroupApi.members(props.cycleId, props.groupId)
    rows.value = result.people
  } catch (e: any) {
    rows.value = []
    error.value = e?.response?.data?.detail || '成员加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function search() { /* 本地过滤已实时生效，搜索按钮仅触发一次（对齐工具栏语义） */ }

function clearSearch() {
  keyword.value = ''
}

function openRemove(person: PerformanceFocusGroupMember) {
  removeTarget.value = person
  removeOpen.value = true
}

async function confirmRemove() {
  const target = removeTarget.value
  if (!props.cycleId || !props.groupId || !target || removing.value) return
  removing.value = true
  try {
    const next = rows.value.filter(person => person.value !== target.value).map(person => person.value)
    await performanceFocusGroupApi.updateMembers(props.cycleId, props.groupId, next)
    removeOpen.value = false
    removeTarget.value = null
    await load()
    ElMessage.success('移除成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '移除失败，请稍后重试')
  } finally {
    removing.value = false
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

watch(() => [props.cycleId, props.groupId], () => {
  keyword.value = ''
  rows.value = []
  void load()
}, { immediate: true })
</script>

<template>
  <div class="focus-group-members-panel">
    <div class="focus-group-members-toolbar">
      <UiButton variant="outline-primary" :disabled="!cycleId || !groupId" @click="addOpen = true">添加</UiButton>
      <div class="focus-group-members-tools">
        <PerformanceSearchInput
          v-model="keyword"
          placeholder="搜索成员"
          aria-label="搜索成员"
          @search="search"
          @clear="clearSearch"
        />
        <UiButton variant="secondary" class="focus-group-members-filter" @click="search">筛选</UiButton>
      </div>
    </div>
    <PerformanceManagementTable
      :rows="filteredRows"
      :columns="columns"
      :loading="loading"
      loading-text="正在加载成员…"
      :empty-text="error || '暂无人员'"
      table-aria-label="人员组成员表格"
      pagination-aria-label="人员组成员分页"
      scroll-mode="page"
      row-key="value"
      :show-pagination="false"
      selectable
      selection-key="value"
      class="focus-group-members-table"
    >
      <template #cell="{ row, column }">
        <template v-if="column.key === 'action'">
          <button class="focus-group-members-row-action" type="button" :disabled="loading" @click="openRemove(row as PerformanceFocusGroupMember)">移除</button>
        </template>
        <span v-else-if="column.key === 'added_at'">{{ formatDateTime((row as PerformanceFocusGroupMember).added_at) }}</span>
        <span v-else-if="column.key === 'added_by'">{{ (row as PerformanceFocusGroupMember).added_by || '--' }}</span>
        <span v-else>{{ (row as any)[column.key] || '--' }}</span>
      </template>
      <template #empty="{ loading: isLoading, text }">
        <div v-if="!isLoading" class="focus-group-empty">
          <MetricTemplateEmptyIllustration />
          <span class="focus-group-empty__text">{{ text }}</span>
        </div>
      </template>
    </PerformanceManagementTable>

    <FocusGroupMemberAddDialog
      v-model="addOpen"
      :cycle-id="cycleId"
      :group-id="groupId"
      :current-employee-nos="rows.map(person => person.value)"
      @added="load"
    />

    <PerformanceConfirmDialog
      v-model="removeOpen"
      :message="`确定要将 ${removeTarget?.display_name || ''} 从人员组移除嘛`"
      confirm-text="移除"
      cancel-text="取消"
      :loading="removing"
      confirm-variant="primary"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped>
.focus-group-members-panel {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  gap: var(--spacing-3);
}
.focus-group-members-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  min-height: 32px;
}
.focus-group-members-tools {
  display: flex;
  align-items: center;
  gap: 8px;
}
.focus-group-members-tools :deep(.performance-search-input) {
  flex: 0 0 292px;
  width: 292px !important;
}
.focus-group-members-filter {
  min-width: var(--performance-button-min-width);
}
.focus-group-members-table {
  flex: 1 1 auto;
  min-height: 0;
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
}
.focus-group-members-table :deep(.ui-table__cell--head) {
  color: #646a73;
  font-weight: 500;
}
.focus-group-members-row-action {
  padding: 2px 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1456f0;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  cursor: pointer;
}
.focus-group-members-row-action:hover {
  background: #eff0f1;
}
.focus-group-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
}
.focus-group-empty__text {
  color: #646a73;
  font-size: 14px;
  line-height: 22px;
}
</style>
