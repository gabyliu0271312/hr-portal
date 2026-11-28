<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { performanceReviewRuleApi, performanceTemplateApi, type PerformanceReviewRuleOption } from '@/api/performance'
import { usePerformanceFilterDraft } from '@/composables/usePerformanceFilterDraft'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceFilterPopover from '@/components/performance/PerformanceFilterPopover.vue'
import PerformanceFilterField from '@/components/performance/PerformanceFilterField.vue'
import PerformanceFilterActions from '@/components/performance/PerformanceFilterActions.vue'
import ReviewRuleTable from '@/components/performance/ReviewRuleTable.vue'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import type { PerformanceFilterField as PerformanceFilterFieldDescriptor } from '@/components/performance/performanceFilterTypes'
import type { ReviewRule } from '@/components/performance/reviewRuleTypes'

const emit = defineEmits<{
  create: []
  edit: [rule: ReviewRule]
}>()

const keyword = ref('')
const loading = ref(false)
const rules = ref<ReviewRule[]>([])
const page = ref(1)
const pageSize = ref(10)

const filterDraft = usePerformanceFilterDraft<Record<string, string[]>>(() => ({ method: [], creator: [] }))
const { applied: appliedFilters, draft: draftFilters, activeCount: filterCount, open: openFilterDraft, confirm: confirmFilterDraft, cancel: cancelFilterDraft, clear: clearFilterDraft } = filterDraft
const filterOpen = ref(false)
const filterAnchor = ref<HTMLElement | null>(null)

const METHOD_OPTIONS: PerformanceSearchSelectOption[] = [
  { value: '评级', label: '评级' },
  { value: '评分', label: '评分' },
  { value: '评分映射等级型', label: '评分映射等级型' },
]
const filterFields: PerformanceFilterFieldDescriptor[] = [
  { key: 'method', label: '评估方式', type: 'select', options: METHOD_OPTIONS, placeholder: '请选择' },
  { key: 'creator', label: '创建人', type: 'person', placeholder: '请搜索', emptyText: '暂无匹配人员', loadingText: '搜索中', loadOptions: loadCreatorOptions },
]

async function loadRules() {
  loading.value = true
  try {
    const reviewType = appliedFilters.value.method[0]
    const creator = appliedFilters.value.creator[0]
    const items = await performanceReviewRuleApi.list({
      ...(reviewType ? { review_type: reviewType as PerformanceReviewRuleOption['review_type'] } : {}),
      ...(creator ? { creator } : {}),
    })
    rules.value = items.map((item) => ({
      id: String(item.id),
      name: item.name,
      method: item.review_type === '评级' ? 'rating' : item.review_type === '评分' ? 'score' : 'score_mapping',
      creator: item.creator,
      createdAt: item.created_at,
      remark: item.remark,
      deletable: item.deletable,
      isUsed: item.is_used,
    }))
  } catch {
    rules.value = []
  } finally {
    loading.value = false
  }
}

async function loadCreatorOptions(query: string): Promise<PerformanceSearchSelectOption[]> {
  const people = await performanceTemplateApi.peopleOptions(query)
  const options: PerformanceSearchSelectOption[] = []
  const seen = new Set<string>()
  for (const person of people) {
    const name = person.display_name?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    options.push({
      value: person.employee_no,
      label: name,
      avatarFallback: name.slice(-1),
      searchText: `${name} ${person.employee_no}`,
    })
  }
  return options
}

function toggleFilter(anchor?: HTMLElement) {
  if (filterOpen.value) { cancelFilter(); return }
  if (anchor instanceof HTMLElement) filterAnchor.value = anchor
  openFilterDraft()
  filterOpen.value = true
}
function confirmFilter() {
  confirmFilterDraft()
  filterOpen.value = false
  page.value = 1
  void loadRules()
}
function cancelFilter() {
  cancelFilterDraft()
  filterOpen.value = false
}
function clearFilter() {
  clearFilterDraft()
}

async function removeRule(rule: ReviewRule) {
  try {
    await ElMessageBox.confirm(`确定删除「${rule.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await performanceReviewRuleApi.remove(Number(rule.id))
    ElMessage.success('评估规则已删除')
    await loadRules()
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    const detail = error?.response?.data?.detail
    ElMessage.error((typeof detail === 'string' ? detail : detail?.message) || '评估规则删除失败，请稍后重试')
    if (error?.response?.status === 409 || error?.response?.status === 404) await loadRules()
  }
}

onMounted(() => { void loadRules() })
</script>

<template>
  <div class="review-rule-management">
    <PerformanceListToolbar v-model:keyword="keyword" :filter-active="filterCount > 0" :filter-count="filterCount" @filter="toggleFilter">
      <template #left>
        <UiButton variant="primary" class="rule-create-button" @click="emit('create')">
          <AddOutlinedIcon class="rule-create-icon" /><span class="rule-create-label">新建</span></UiButton>
      </template>
    </PerformanceListToolbar>
    <PerformanceFilterPopover :visible="filterOpen" :anchor="filterAnchor" aria-label="评估规则筛选" @close="cancelFilter">
      <PerformanceFilterField v-for="field in filterFields" :key="field.key" v-model="draftFilters[field.key]" :field="field" />
      <template #footer>
        <PerformanceFilterActions @confirm="confirmFilter" @cancel="cancelFilter" @clear="clearFilter" />
      </template>
    </PerformanceFilterPopover>

    <ReviewRuleTable
      :rules="rules"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="rules.length"
      @edit="emit('edit', $event)"
      @remove="removeRule"
      @page-change="page = $event"
      @page-size-change="pageSize = $event"
    />
  </div>
</template>

<style scoped>
.rule-create-button {
  width: 80px;
  height: 32px;
  flex: none;
  box-sizing: border-box;
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.rule-create-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.rule-create-label {
  position: relative;
  top: 1px;
}
</style>
