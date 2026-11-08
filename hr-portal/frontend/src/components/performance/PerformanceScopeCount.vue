<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { performanceFocusGroupApi, toFeishuScopes } from '@/api/performance'
import type { PerformanceAudienceGroup, PerformanceFocusGroupChangePerson } from '@/api/performance'
import FocusGroupPeopleDialog from './focus-group/FocusGroupPeopleDialog.vue'

/**
 * 人员范围统计（共享组件，新建人员组页 / 添加人员范围弹窗复用）。
 * - 统计行：「符合条件的人员，共 N 人」；N=0/未算时 disabled，>0 时蓝色可跳转人员列表
 * - 默认 slot 暴露 { counts, loading, open(index), total, openTotal }：消费方把
 *   PerformanceAudienceRuleEditor 放入默认 slot，并在其 group-heading-extra 里渲染
 *   「同时满足以下条件：N人」组计数按钮（open(index) 跳转该组名单）
 * - 数据：resolve-scope 轮询一次返回 total(selected) + group_counts + group_peoples
 * - 跳转：复用 FocusGroupPeopleDialog 全屏人员列表表格
 */
const props = defineProps<{
  cycleId: number | null
  groups: PerformanceAudienceGroup[]
  /** 规则完整才触发计数（如 hasCompleteScopeRule） */
  enabled: boolean
  /** 人员列表弹窗标题（默认「人员列表」） */
  title?: string
}>()

const totalCount = ref(0)
const groupCounts = ref<number[]>([])
const groupPeoples = ref<PerformanceFocusGroupChangePerson[][]>([])
const loading = ref(false)
const error = ref('')
const dialogOpen = ref(false)
const dialogTitle = ref('')
const dialogSubtitle = ref('')
const dialogRows = ref<PerformanceFocusGroupChangePerson[]>([])
const dialogTotal = ref(0)
const dialogLoading = ref(false)
const dialogError = ref('')

let debounceTimer: ReturnType<typeof setTimeout> | undefined
let pollTimer: ReturnType<typeof setTimeout> | undefined
let requestVersion = 0

async function refresh() {
  const version = ++requestVersion
  if (!props.cycleId || !props.enabled) {
    loading.value = false
    totalCount.value = 0
    groupCounts.value = []
    groupPeoples.value = []
    return
  }
  if (pollTimer) clearTimeout(pollTimer)
  loading.value = true
  error.value = ''
  try {
    const payload = { scopes: toFeishuScopes(props.groups), user_group_id: '' }
    const created = await performanceFocusGroupApi.resolveScope(props.cycleId, payload, '-1')
    if (version !== requestVersion || !created.task_id) return
    const poll = async () => {
      if (version !== requestVersion) return
      try {
        const result = await performanceFocusGroupApi.resolveScope(props.cycleId!, payload, created.task_id!)
        if (version !== requestVersion) return
        if (result.status === 3 || result.status === 4) throw new Error('人员范围统计失败，请重试')
        const selected = result.selected ?? result.scopes?.[0]?.selected
        if (result.selected_count != null || selected != null || result.group_counts) {
          totalCount.value = result.selected_count ?? selected?.length ?? 0
          groupCounts.value = result.group_counts || []
          groupPeoples.value = result.group_peoples || []
          loading.value = false
          return
        }
        pollTimer = setTimeout(() => void poll(), 500)
      } catch (e: any) {
        if (version === requestVersion) {
          loading.value = false
          error.value = e?.response?.data?.detail || '人员范围统计失败'
        }
      }
    }
    pollTimer = setTimeout(() => void poll(), 250)
  } catch (e: any) {
    if (version === requestVersion) {
      loading.value = false
      error.value = e?.response?.data?.detail || '人员范围统计失败'
    }
  }
}

watch(() => props.groups, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pollTimer) clearTimeout(pollTimer)
  debounceTimer = setTimeout(() => void refresh(), 200)
}, { deep: true })

watch(() => props.enabled, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pollTimer) clearTimeout(pollTimer)
  debounceTimer = setTimeout(() => void refresh(), 0)
})

onMounted(() => {
  if (props.enabled) debounceTimer = setTimeout(() => void refresh(), 0)
})

function openDialog(rows: PerformanceFocusGroupChangePerson[], subtitle: string) {
  if (!rows.length) return
  dialogOpen.value = true
  dialogTitle.value = props.title || '人员列表'
  dialogSubtitle.value = subtitle
  dialogRows.value = rows
  dialogTotal.value = rows.length
  dialogLoading.value = false
  dialogError.value = ''
}

/** 打开某条件组的人员列表 */
function openGroup(index: number) {
  openDialog(groupPeoples.value[index] || [], `条件组 ${index + 1}`)
}

/** 打开总名单人员列表 */
function openTotal() {
  openDialog(groupPeoples.value.flat(), `符合条件的员工，共计 ${totalCount.value} 人`)
}

onBeforeUnmount(() => {
  requestVersion += 1
  if (debounceTimer) clearTimeout(debounceTimer)
  if (pollTimer) clearTimeout(pollTimer)
})
</script>

<template>
  <div class="performance-scope-count">
    <p v-if="error" class="performance-scope-count__error" role="alert">{{ error }}</p>
    <button
      type="button"
      class="performance-scope-count__total"
      @click="openTotal"
    >
      <span class="performance-scope-count__label">符合条件的人员，共 </span><span class="performance-scope-count__num" :class="{ 'performance-scope-count__num--active': totalCount > 0 }">{{ totalCount }}</span><span class="performance-scope-count__label"> 人</span>
    </button>
    <slot
      :counts="groupCounts"
      :loading="loading"
      :open="openGroup"
      :total="totalCount"
      :open-total="openTotal"
    />

    <FocusGroupPeopleDialog
      v-model="dialogOpen"
      :title="dialogTitle"
      :subtitle="dialogSubtitle"
      :rows="dialogRows"
      :total="dialogTotal"
      :loading="dialogLoading"
      :error="dialogError"
    />
  </div>
</template>

<style scoped>
.performance-scope-count { min-width: 0; }
.performance-scope-count__error { margin: 0 0 var(--spacing-2); color: var(--performance-field-error-color); font-size: var(--font-size-sm); line-height: var(--performance-input-line-height); }
.performance-scope-count__total {
  display: inline-block;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-secondary);
  font: 400 var(--font-size-md)/22px var(--font-sans);
  cursor: default;
}
.performance-scope-count__num {
  color: var(--performance-button-link-disabled-color);
}
.performance-scope-count__num--active {
  color: var(--color-primary-hover);
  cursor: pointer;
}
</style>
