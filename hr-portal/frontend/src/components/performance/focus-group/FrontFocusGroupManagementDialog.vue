<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { performanceFocusGroupApi, type PerformanceFocusGroupMember } from '@/api/performance'
import type { PerformanceFocusGroupOverviewItem } from '@/api/performance'
import UiButton from '@/components/ui/UiButton.vue'
import UiSurface from '@/components/ui/UiSurface.vue'
import UiFullScreenModal from '@/components/ui/UiFullScreenModal.vue'
import PerformancePromptNotice from '@/components/performance/PerformancePromptNotice.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from '@/components/performance/PerformanceLineTabs.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import type { PerformanceTableColumn } from '@/components/performance/performanceTableColumns'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
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
      <UiFullScreenModal :title="'人员组管理'" :show-footer="false" content-scroll="inner" class="front-fg-dialog" @back="emit('update:modelValue', false)">
        <div class="front-fg-dialog__body">
          <p v-if="overviewError" class="front-fg-dialog__error" role="alert">{{ overviewError }}</p>
          <template v-else-if="groups.length">
            <PerformanceLineTabs :model-value="String(activeGroupId ?? '')" :tabs="tabs" fill flush class="front-fg-dialog__tabs" @update:model-value="selectGroup">
              <UiSurface class="front-fg-dialog__surface" radius="all" min-width="0" padding="var(--ui-surface-padding-spacious)">
              <PerformancePromptNotice type="info" multiline class="front-fg-dialog__hint" :class="{ 'front-fg-dialog__hint--project': isProject }">
                <template v-if="isProject">
                  <p class="front-fg-dialog__hint-title">关联评估项目：{{ activeGroup?.activity_names?.join('、') || '--' }}</p>
                  <p class="front-fg-dialog__hint-desc">人员组仅可圈入关联评估项目的被评估人，你可对权限范围内的人员进行添加和移除。</p>
                </template>
                <p v-else>仅可查看你有权限的人员组成员。你可将权限范围内的人员添加/移出人员组。</p>
              </PerformancePromptNotice>

              <div class="front-fg-dialog__table-wrap">
                <PerformanceManagementTable
                  :rows="rows"
                  :columns="columns"
                  :loading="loading"
                  loading-text="正在加载成员…"
                  :empty-text="memberError || '暂无人员'"
                  table-aria-label="人员组成员表格"
                  pagination-aria-label="人员组成员分页"
                  scroll-mode="inner"
                  fit-available-height
                  row-key="value"
                  :page="page"
                  :page-size="pageSize"
                  :total="total"
                  :show-pagination="true"
                  class="front-fg-dialog__table"
                  @page-change="changePage"
                  @page-size-change="changePageSize"
                >
                  <template #toolbar>
                    <PerformanceListToolbar v-model:keyword="keyword" search-placeholder="搜索成员" search-aria-label="搜索成员" search-width="var(--search-input-width-wide)" @search="search" @clear="clearSearch" @filter="search">
                      <template v-if="maintainable" #left>
                        <UiButton variant="primary" :disabled="!cycleId" @click="addOpen = true">添加</UiButton>
                      </template>
                    </PerformanceListToolbar>
                  </template>
                  <template #pagination-prefix><span class="front-fg-dialog__total">共 {{ total }} 条</span></template>
                  <template #cell="{ row, column }">
                    <template v-if="column.key === 'action'">
                      <UiButton v-if="removable" variant="link" :disabled="loading" @click="removeOpen = true; removeTarget = row as PerformanceFocusGroupMember">移除</UiButton>
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
              </UiSurface>
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
      </UiFullScreenModal>
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
  --ui-fullscreen-background: var(--ui-page-background);
  --ui-header-border-bottom: var(--ui-header-divider);
}
.front-fg-dialog__body {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: var(--ui-page-tabs-top-gap) var(--ui-page-content-inset) var(--ui-page-content-inset);
  overflow: hidden;
}
.front-fg-dialog__error { margin: 0; padding: var(--spacing-4) var(--ui-page-content-inset); color: var(--performance-field-error-color); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
/* tab：14px/500 激活（前端 v2 端覆盖 PerformanceLineTabs 16px 默认） */
.front-fg-dialog__tabs {
  flex: 1 1 auto;
  min-height: 0;
  --performance-line-tabs-surface: transparent;
  --performance-line-tabs-text: var(--color-text-primary);
  --performance-table-tabs-gap: var(--ui-page-tabs-content-gap);
  --ui-tabs-holder-padding-top: 0px;
  --ui-tabs-overflow-bottom-gap: 0px;
  --ui-tabs-font-size: var(--ui-tabs-compact-font-size);
  --ui-tabs-line-height: var(--ui-tabs-compact-line-height);
  --ui-tabs-tab-padding: var(--ui-tabs-compact-padding);
  --ui-tabs-active-weight: var(--ui-tabs-compact-active-weight);
  --ui-tabs-ink-top: var(--ui-tabs-compact-ink-top);
  --ui-tabs-divider-top: var(--ui-tabs-compact-divider-top);
}
.front-fg-dialog__surface {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
}
.front-fg-dialog__hint { --ui-notice-text-bottom-gap: 0px; flex-shrink: 0; margin-bottom: var(--page-gap-toolbar-table); }
.front-fg-dialog__hint p { margin: 0; }
.front-fg-dialog__hint-title { font-weight: var(--ui-tabs-compact-active-weight); }
.front-fg-dialog__hint-desc { color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 18px; }
.front-fg-dialog__table-wrap { display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; min-height: 0; }
.front-fg-dialog__table {
  flex: 1 1 0;
  min-height: 0;
}
.front-fg-dialog__total { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
.front-fg-dialog__empty { display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: var(--spacing-2); padding: var(--spacing-5) 0; }
.front-fg-dialog__empty-text { color: var(--color-text-secondary); font-size: var(--font-size-md); line-height: var(--ui-table-line-height); }
</style>
