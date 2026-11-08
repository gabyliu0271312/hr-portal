<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceFocusGroupApi, type PerformanceFocusGroupMember } from '@/api/performance'
import type { PerformanceFocusGroupOverviewItem } from '@/api/performance'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import type { PerformanceTableColumn } from '@/components/performance/performanceTableColumns'
import PerformanceSearchInput from '@/components/performance/PerformanceSearchInput.vue'
import PerformanceConfirmDialog from '@/components/performance/PerformanceConfirmDialog.vue'
import MetricTemplateEmptyIllustration from '@/components/performance/MetricTemplateEmptyIllustration.vue'
import FocusGroupFrontMemberAddDialog from './FocusGroupFrontMemberAddDialog.vue'

const props = defineProps<{
  modelValue: boolean
  cycleId: number | null
  /** 测试可关闭 Teleport（内容原地渲染便于查询）；生产默认 teleport 到 body */
  teleport?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

/* ---- 人员组 Tab（overview 一次全量，切换不发组列表请求） ---- */
const groups = ref<PerformanceFocusGroupOverviewItem[]>([])
const overviewError = ref('')
const activeGroupId = ref<number | null>(null)
const loaded = ref(false)

const activeGroup = computed(() => groups.value.find(group => group.id === activeGroupId.value) || null)
const isProject = computed(() => activeGroup.value?.tab === 'project')
const tabs = computed<PerformanceLineTab[]>(() => groups.value.map(group => ({ key: String(group.id), label: group.name })))

async function loadOverview() {
  if (!props.cycleId || loaded.value) return
  overviewError.value = ''
  try {
    const overview = await performanceFocusGroupApi.overview(props.cycleId)
    groups.value = overview.groups
    if (!overview.can_show) {
      emit('update:modelValue', false)
      return
    }
    if (overview.groups.length) {
      activeGroupId.value = overview.groups[0].id
      void loadMembers()
    }
    loaded.value = true
  } catch (e: any) {
    overviewError.value = e?.response?.data?.detail || '人员组加载失败，请稍后重试'
  }
}

/* ---- 成员表格（分页 + 搜索，切换 tab 重置 total） ---- */
const rows = ref<PerformanceFocusGroupMember[]>([])
const total = ref(0)
const loading = ref(false)
const memberError = ref('')
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')

const columns = computed<PerformanceTableColumn[]>(() => [
  { key: 'display_name', label: '姓名', width: 195, fixed: 'left' },
  { key: 'direct_supervisor_name', label: '直属上级', width: 195 },
  { key: 'department', label: '一级部门', width: 240 },
  { key: 'department_5', label: '末级部门', width: 240 },
  { key: 'job_sequence', label: '序列', width: 240 },
  { key: 'added_by', label: '添加人', width: 195 },
  { key: 'added_at', label: '添加时间', width: 195 },
  { key: 'action', label: '操作', width: 102, fixed: 'right' },
])

/** 添加/移除能力：规则维护组（scope_setting_mode 0）仅周期级可移除；手动组（1）可添加移除 */
const maintainable = computed(() => activeGroup.value?.scope_setting_mode === 1)
const removable = computed(() => !isProject.value || maintainable.value)

async function loadMembers() {
  if (!props.cycleId || activeGroupId.value == null) return
  loading.value = true
  memberError.value = ''
  try {
    const result = await performanceFocusGroupApi.members(props.cycleId, activeGroupId.value, {
      current: page.value,
      size: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    })
    rows.value = result.people
    total.value = result.total ?? result.people.length
  } catch (e: any) {
    rows.value = []
    total.value = 0
    memberError.value = e?.response?.data?.detail || '成员加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function selectGroup(groupId: string) {
  if (Number(groupId) === activeGroupId.value) return
  activeGroupId.value = Number(groupId)
  page.value = 1
  keyword.value = ''
  rows.value = []
  total.value = 0
  void loadMembers()
}

watch(() => props.modelValue, visible => {
  if (!visible) return
  if (!loaded.value) void loadOverview()
  if (activeGroupId.value != null) void loadMembers()
}, { immediate: true })

watch(() => props.cycleId, () => {
  loaded.value = false
  groups.value = []
  activeGroupId.value = null
  rows.value = []
  total.value = 0
})

function search() { if (page.value !== 1) { page.value = 1; void loadMembers() } else void loadMembers() }
function clearSearch() { if (page.value !== 1) { page.value = 1; void loadMembers() } else void loadMembers() }
function changePage(next: number) {
  page.value = next
  void loadMembers()
}
function changePageSize(next: number) {
  pageSize.value = next
  page.value = 1
  void loadMembers()
}

/* ---- 添加 / 移除 ---- */
const addOpen = ref(false)
const removeOpen = ref(false)
const removeTarget = ref<PerformanceFocusGroupMember | null>(null)
const removing = ref(false)

async function confirmRemove() {
  const target = removeTarget.value
  if (!props.cycleId || activeGroupId.value == null || !target || removing.value) return
  removing.value = true
  try {
    const next = rows.value.filter(person => person.value !== target.value).map(person => person.value)
    await performanceFocusGroupApi.updateMembers(props.cycleId, activeGroupId.value, next)
    removeOpen.value = false
    removeTarget.value = null
    await loadMembers()
    ElMessage.success('移除成功')
  } catch (e: any) {
    ElMessage.error(e?.response?.data?.detail || '移除失败，请稍后重试')
  } finally {
    removing.value = false
  }
}

function onAdded() {
  void loadMembers()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '--'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '--'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
</script>

<template>
  <Teleport to="body" :disabled="!teleport">
    <div v-if="modelValue" class="front-fg-dialog-overlay" @mousedown.self="emit('update:modelValue', false)">
      <section class="front-fg-dialog" role="dialog" aria-modal="true" aria-label="人员组管理">
        <header class="front-fg-dialog__header">
          <div class="front-fg-dialog__header-left">
            <button class="front-fg-dialog__back" type="button" @click="emit('update:modelValue', false)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14.5 4.5 7 12l7.5 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
              <span>返回</span>
            </button>
            <span class="front-fg-dialog__header-gap" aria-hidden="true"></span>
            <h2 class="front-fg-dialog__title">人员组管理</h2>
          </div>
        </header>

        <div class="front-fg-dialog__body">
          <p v-if="overviewError" class="front-fg-dialog__error" role="alert">{{ overviewError }}</p>
          <template v-else-if="groups.length">
            <PerformanceLineTabs :model-value="String(activeGroupId ?? '')" :tabs="tabs" fill class="front-fg-dialog__tabs" @update:model-value="selectGroup">
              <!-- 提示条：周期版 / 关联项目版（REA 差异化呈现） -->
              <div class="front-fg-dialog__hint" :class="{ 'front-fg-dialog__hint--project': isProject }">
                <template v-if="isProject">
                  <p class="front-fg-dialog__hint-title">关联评估项目：{{ activeGroup?.activity_names?.join('、') || '--' }}</p>
                  <p class="front-fg-dialog__hint-desc">人员组仅可圈入关联评估项目的被评估人，你可对权限范围内的人员进行添加和移除。</p>
                </template>
                <p v-else>仅可查看你有权限的人员组成员。你可将权限范围内的人员添加/移出人员组。</p>
              </div>

              <div class="front-fg-dialog__table-wrap">
                <div class="front-fg-dialog__toolbar">
                  <UiButton v-if="maintainable" variant="primary" :disabled="!cycleId" @click="addOpen = true">添加</UiButton>
                  <div v-else class="front-fg-dialog__toolbar-placeholder" />
                  <div class="front-fg-dialog__tools">
                    <PerformanceSearchInput v-model="keyword" placeholder="搜索成员" aria-label="搜索成员" @search="search" @clear="clearSearch" />
                    <UiButton variant="secondary" class="front-fg-dialog__filter" @click="search">筛选</UiButton>
                  </div>
                </div>
                <PerformanceManagementTable
                  :rows="rows"
                  :columns="columns"
                  :loading="loading"
                  loading-text="正在加载成员…"
                  :empty-text="memberError || '暂无人员'"
                  table-aria-label="人员组成员表格"
                  pagination-aria-label="人员组成员分页"
                  scroll-mode="page"
                  row-key="value"
                  :page="page"
                  :page-size="pageSize"
                  :total="total"
                  :show-pagination="true"
                  class="front-fg-dialog__table"
                  @page-change="changePage"
                  @page-size-change="changePageSize"
                >
                  <template #pagination-prefix><span class="front-fg-dialog__total">共 {{ total }} 条</span></template>
                  <template #cell="{ row, column }">
                    <template v-if="column.key === 'action'">
                      <button v-if="removable" class="front-fg-dialog__row-action" type="button" :disabled="loading" @click="removeOpen = true; removeTarget = row as PerformanceFocusGroupMember">移除</button>
                    </template>
                    <span v-else-if="column.key === 'added_at'">{{ formatDateTime((row as PerformanceFocusGroupMember).added_at) }}</span>
                    <span v-else-if="column.key === 'added_by'">{{ (row as PerformanceFocusGroupMember).added_by || '--' }}</span>
                    <span v-else>{{ (row as any)[column.key] || '--' }}</span>
                  </template>
                  <template #empty="{ loading: isLoading, text }">
                    <div v-if="!isLoading" class="front-fg-dialog__empty">
                      <MetricTemplateEmptyIllustration />
                      <span class="front-fg-dialog__empty-text">{{ text }}</span>
                    </div>
                  </template>
                </PerformanceManagementTable>
              </div>
            </PerformanceLineTabs>

            <FocusGroupFrontMemberAddDialog
              v-model="addOpen"
              :cycle-id="cycleId"
              :group-id="activeGroupId"
              :current-employee-nos="rows.map(person => person.value)"
              @added="onAdded"
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
          </template>
          <div v-else-if="!overviewError && loaded" class="front-fg-dialog__empty">
            <MetricTemplateEmptyIllustration />
            <span class="front-fg-dialog__empty-text">暂无人员组</span>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.front-fg-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--performance-confirm-z-index);
  background: var(--performance-dialog-overlay);
}
.front-fg-dialog {
  display: flex;
  flex-direction: column;
  width: 100vw;
  height: 100vh;
  max-width: none;
  box-sizing: border-box;
  overflow: hidden;
  background: var(--color-bg-card);
  color: var(--color-text-primary);
  font: 400 14px/22px var(--font-sans);
}
/* head：56px，下边框 1px rgba(31,35,41,0.15)（前端管理 v2 端独立主题，非全局 token） */
.front-fg-dialog__header {
  position: relative;
  z-index: 2;
  display: flex;
  flex: 0 0 56px;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px 0 20px;
  box-sizing: border-box;
  background: #fff;
  border-bottom: 1px solid rgba(31, 35, 41, 0.15);
}
.front-fg-dialog__header-left { display: flex; align-items: center; min-width: 0; }
.front-fg-dialog__back {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 2px 8px;
  box-sizing: border-box;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #1f2329;
  font: 600 16px/24px var(--font-sans);
  cursor: pointer;
}
.front-fg-dialog__back:hover { background: #eff0f1; }
.front-fg-dialog__back svg { width: 14px; height: 14px; margin-right: 4px; }
.front-fg-dialog__header-gap {
  width: 1px;
  height: 16px;
  flex: 0 0 1px;
  margin: 0 16px 0 12px;
  background: rgba(31, 35, 41, 0.15);
}
.front-fg-dialog__title { margin: 0; color: #1f2329; font-size: 16px; font-weight: 600; line-height: 22px; }
.front-fg-dialog__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: auto;
}
.front-fg-dialog__error { margin: 0; padding: 16px 24px; color: var(--performance-field-error-color); font-size: 14px; line-height: 22px; }
/* tab：14px/500 激活（前端 v2 端覆盖 PerformanceLineTabs 16px 默认） */
.front-fg-dialog__tabs {
  flex: 1 1 auto;
  min-height: 0;
  --performance-line-tabs-surface: #fff;
  --performance-line-tabs-text: #1f2329;
}
.front-fg-dialog__tabs :deep(.line-tab) { font-size: 14px; line-height: 22px; }
.front-fg-dialog__tabs :deep(.line-tab.active) { font-weight: 500; }
/* 提示条：40px #F0F4FF */
.front-fg-dialog__hint {
  margin: 0 24px;
  padding: 9px 16px;
  box-sizing: border-box;
  border-radius: 6px;
  background: #f0f4ff;
  color: #1f2329;
  font-size: 14px;
  line-height: 22px;
}
.front-fg-dialog__hint p { margin: 0; }
.front-fg-dialog__hint--project { display: flex; flex-direction: column; gap: 2px; }
.front-fg-dialog__hint-title { font-weight: 500; }
.front-fg-dialog__hint-desc { color: #646a73; font-size: 12px; line-height: 18px; }
.front-fg-dialog__table-wrap { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; padding: 16px 24px 0; }
.front-fg-dialog__toolbar { display: flex; flex: none; align-items: center; justify-content: space-between; min-height: 32px; }
.front-fg-dialog__tools { display: flex; align-items: center; gap: 8px; }
.front-fg-dialog__tools :deep(.performance-search-input) { flex: 0 0 292px; width: 292px !important; }
.front-fg-dialog__filter { min-width: var(--performance-button-min-width); }
.front-fg-dialog__table {
  flex: 1 1 auto;
  min-height: 0;
  --ui-table-header-background: #ffffff;
  --ui-table-header-height: 47px;
}
.front-fg-dialog__table :deep(.ui-table__cell--head) { color: #646a73; font-weight: 500; }
.front-fg-dialog__total { color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }
.front-fg-dialog__row-action {
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
.front-fg-dialog__row-action:hover { background: #eff0f1; }
.front-fg-dialog__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 20px 0; }
.front-fg-dialog__empty-text { color: #646a73; font-size: 14px; line-height: 22px; }
</style>
