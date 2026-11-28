<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useRouter } from 'vue-router'
import { performanceTagFillQuestionApi, performanceTemplateApi } from '@/api/performance'
import { usePerformanceFilterDraft } from '@/composables/usePerformanceFilterDraft'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceFilterPopover from '@/components/performance/PerformanceFilterPopover.vue'
import PerformanceFilterField from '@/components/performance/PerformanceFilterField.vue'
import PerformanceFilterActions from '@/components/performance/PerformanceFilterActions.vue'
import TagFillQuestionTable from '@/components/performance/TagFillQuestionTable.vue'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import type { PerformanceFilterField as PerformanceFilterFieldDescriptor } from '@/components/performance/performanceFilterTypes'
import type { TagFillQuestionRecord } from '@/components/performance/tagFillQuestionFixtures'

const router = useRouter()
const keyword = ref('')
const page = ref(1)
const pageSize = ref(10)
const total = ref(0)
const loading = ref(false)
const questions = ref<TagFillQuestionRecord[]>([])

const filterDraft = usePerformanceFilterDraft<Record<string, string[]>>(() => ({ creator: [] }))
const { applied: appliedFilters, draft: draftFilters, activeCount: filterCount, open: openFilterDraft, confirm: confirmFilterDraft, cancel: cancelFilterDraft, clear: clearFilterDraft } = filterDraft
const filterOpen = ref(false)
const filterAnchor = ref<HTMLElement | null>(null)
const filterFields: PerformanceFilterFieldDescriptor[] = [
  { key: 'creator', label: '创建人', type: 'person', placeholder: '请搜索', emptyText: '暂无匹配人员', loadingText: '搜索中', loadOptions: loadCreatorOptions },
]

async function load() {
  loading.value = true
  try {
    const creator = appliedFilters.value.creator[0]
    const result = await performanceTagFillQuestionApi.list(keyword.value, page.value, pageSize.value, creator)
    questions.value = result.items
    total.value = result.total
  } catch {
    questions.value = []
    total.value = 0
    ElMessage.error('标签型填写题加载失败')
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
      value: person.portal_user_id || person.employee_no,
      label: name,
      subLabel: person.department || undefined,
      avatarFallback: name.slice(-1),
      searchText: `${name} ${person.employee_no} ${person.department || ''}`,
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
  void load()
}
function cancelFilter() {
  cancelFilterDraft()
  filterOpen.value = false
}
function clearFilter() {
  clearFilterDraft()
}

function create() {
  void router.push({ name: 'TaggedFillQuestionCreate' })
}

function edit(question: TagFillQuestionRecord) {
  void router.push({ name: 'TaggedFillQuestionEdit', params: { id: question.id }, query: { from: 'list' } })
}

async function remove(question: TagFillQuestionRecord) {
  try {
    await performanceTagFillQuestionApi.remove(question.id)
    ElMessage.success('已删除')
    if (questions.value.length === 1 && page.value > 1) page.value -= 1
    else await load()
  } catch {
    ElMessage.error('删除失败，请确认该题目未被绩效模板引用')
  }
}

watch([page, pageSize], () => { void load() })
onMounted(load)
</script>

<template>
  <PerformanceListPage title="标签型填写题">
    <PerformanceListToolbar
      v-model:keyword="keyword"
      :filter-active="filterCount > 0"
      :filter-count="filterCount"
      @search="page = 1; load()"
      @clear="page = 1; load()"
      @filter="toggleFilter"
    >
      <template #left>
        <UiButton variant="primary" class="create-button" @click="create">
          <AddOutlinedIcon class="create-icon" aria-hidden="true" />新建
        </UiButton>
      </template>
    </PerformanceListToolbar>
    <PerformanceFilterPopover :visible="filterOpen" :anchor="filterAnchor" aria-label="标签型填写题筛选" @close="cancelFilter">
      <PerformanceFilterField v-for="field in filterFields" :key="field.key" v-model="draftFilters[field.key]" :field="field" />
      <template #footer>
        <PerformanceFilterActions @confirm="confirmFilter" @cancel="cancelFilter" @clear="clearFilter" />
      </template>
    </PerformanceFilterPopover>
    <TagFillQuestionTable
      :questions="questions"
      :loading="loading"
      :page="page"
      :page-size="pageSize"
      :total="total"
      @page-change="page = $event"
      @page-size-change="pageSize = $event; page = 1"
      @edit="edit"
      @remove="remove"
    />
  </PerformanceListPage>
</template>

<style scoped>
.create-button { width: 80px; height: 32px; padding: 4px 11px; border-radius: 6px; font: 400 14px/22px inherit; }
.create-icon { width: 14px; height: 14px; margin-right: 4px; }
</style>
