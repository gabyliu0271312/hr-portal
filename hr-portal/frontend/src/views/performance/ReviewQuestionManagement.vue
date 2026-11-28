<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { performanceReviewQuestionApi, performanceReviewRuleApi, performanceTemplateApi } from '@/api/performance'
import { usePerformanceFilterDraft } from '@/composables/usePerformanceFilterDraft'
import AddOutlinedIcon from '@/components/performance/AddOutlinedIcon.vue'
import UiButton from '@/components/ui/UiButton.vue'
import PerformanceListPage from '@/components/performance/PerformanceListPage.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceFilterPopover from '@/components/performance/PerformanceFilterPopover.vue'
import PerformanceFilterField from '@/components/performance/PerformanceFilterField.vue'
import PerformanceFilterActions from '@/components/performance/PerformanceFilterActions.vue'
import ReviewQuestionTable from '@/components/performance/ReviewQuestionTable.vue'
import ReviewRuleManagement from './ReviewRuleManagement.vue'
import type { PerformanceSearchSelectOption } from '@/components/performance/PerformanceSearchSelect.vue'
import type { PerformanceFilterField as PerformanceFilterFieldDescriptor } from '@/components/performance/performanceFilterTypes'
import type { ReviewQuestion } from '@/components/performance/reviewQuestionTypes'
import type { ReviewRule } from '@/components/performance/reviewRuleTypes'

type TabKey = 'question' | 'rule'

const route = useRoute()
const router = useRouter()
const activeTab = ref<TabKey>(route.query.tab === 'rule' ? 'rule' : 'question')
const keyword = ref('')
const loading = ref(false)
const questions = ref<ReviewQuestion[]>([])
const page = ref(1)
const pageSize = ref(10)
const ruleOptions = ref<PerformanceSearchSelectOption[]>([])

const filterDraft = usePerformanceFilterDraft<Record<string, string[]>>(() => ({ type: [], rule: [], creator: [] }))
const { applied: appliedFilters, draft: draftFilters, activeCount: filterCount, open: openFilterDraft, confirm: confirmFilterDraft, cancel: cancelFilterDraft, clear: clearFilterDraft } = filterDraft
const filterOpen = ref(false)
const filterAnchor = ref<HTMLElement | null>(null)

const TYPE_OPTIONS: PerformanceSearchSelectOption[] = [
  { value: '0', label: '评估项' },
  { value: '1', label: '子评估题' },
]
const filterFields = ref<PerformanceFilterFieldDescriptor[]>([])

async function loadRuleOptions() {
  try {
    const items = await performanceReviewRuleApi.list()
    ruleOptions.value = items.map((item) => ({ value: String(item.id), label: item.name }))
  } catch {
    ruleOptions.value = []
  }
}

function syncFilterFields() {
  filterFields.value = [
    { key: 'type', label: '类型', type: 'select', options: TYPE_OPTIONS, placeholder: '请选择' },
    { key: 'rule', label: '评估规则', type: 'select', options: ruleOptions.value, placeholder: '请选择' },
    { key: 'creator', label: '创建人', type: 'person', placeholder: '请搜索', emptyText: '暂无匹配人员', loadingText: '搜索中', loadOptions: loadCreatorOptions },
  ]
}

async function loadQuestions() {
  loading.value = true
  try {
    const type = appliedFilters.value.type[0]
    const rule = appliedFilters.value.rule[0]
    const creator = appliedFilters.value.creator[0]
    const items = await performanceReviewQuestionApi.list({
      ...(type ? { is_sub_question: type === '1' } : {}),
      ...(rule ? { rule_id: Number(rule) } : {}),
      ...(creator ? { creator } : {}),
    })
    questions.value = items.map((item) => ({
      id: String(item.id),
      name: item.name,
      type: item.type,
      creator: item.rule?.creator || '',
      createdAt: item.created_at,
      remark: item.remark,
      rule_id: item.rule_id,
      is_sub_question: item.is_sub_question,
      parent_question_id: item.parent_question_id,
      display_mode: item.display_mode,
      deletable: item.deletable,
      delete_reason: item.delete_reason,
    }))
  } catch {
    questions.value = []
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

onMounted(async () => {
  await loadRuleOptions()
  syncFilterFields()
  void loadQuestions()
})

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
  void loadQuestions()
}
function cancelFilter() {
  cancelFilterDraft()
  filterOpen.value = false
}
function clearFilter() {
  clearFilterDraft()
}

function selectTab(tab: TabKey) {
  activeTab.value = tab
  void router.replace({
    query: {
      ...route.query,
      tab: tab === 'rule' ? 'rule' : undefined,
    },
  })
}

function handleRuleCreate() {
  void router.push({ name: 'ReviewRuleCreate' })
}

function handleRuleEdit(rule: ReviewRule) {
  void router.push({
    name: 'ReviewRuleEdit',
    params: { id: rule.id },
    query: { name: rule.name },
  })
}

function handleCreate(command?: string) {
  if (command === 'create-sub') {
    void router.push({ name: 'ReviewQuestionCreate', query: { isSub: null } })
    return
  }
  void router.push({ name: 'ReviewQuestionCreate' })
}

function handleEdit(question: ReviewQuestion) {
  void router.push({ name: 'ReviewQuestionEdit', params: { id: question.id }, query: { name: question.name, type: question.type, remark: question.remark } })
}

async function handleRemove(question: ReviewQuestion) {
  if (!question.deletable) return
  try {
    await ElMessageBox.confirm(`确定删除「${question.name}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await performanceReviewQuestionApi.remove(Number(question.id))
    questions.value = questions.value.filter((item) => item.id !== question.id)
    ElMessage.success('已删除')
  } catch (error: any) {
    if (error === 'cancel' || error === 'close') return
    const detail = error?.response?.data?.detail
    ElMessage.error((typeof detail === 'string' ? detail : detail?.message) || '评估题删除失败，请稍后重试')
    if (error?.response?.status === 409 || error?.response?.status === 404) await loadQuestions()
  }
}

</script>

<template>
  <PerformanceListPage title="评估题">
    <template #header>
      <div class="page-tabs">
        <span class="tab" :class="{ active: activeTab === 'question' }" @click="selectTab('question')">评估题</span>
        <span class="tab" :class="{ active: activeTab === 'rule' }" @click="selectTab('rule')">评估规则</span>
      </div>
    </template>

    <template v-if="activeTab === 'question'">
      <PerformanceListToolbar v-model:keyword="keyword" :filter-active="filterCount > 0" :filter-count="filterCount" @filter="toggleFilter">
        <template #left>
          <el-dropdown trigger="click" @command="handleCreate">
            <UiButton variant="primary" class="create-button">
              <AddOutlinedIcon class="create-icon" /><span class="create-label">新建</span></UiButton>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="create">新建评估题</el-dropdown-item>
                <el-dropdown-item command="create-sub">新建子评估题</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </template>
      </PerformanceListToolbar>
      <PerformanceFilterPopover :visible="filterOpen" :anchor="filterAnchor" aria-label="评估题筛选" @close="cancelFilter">
        <PerformanceFilterField v-for="field in filterFields" :key="field.key" v-model="draftFilters[field.key]" :field="field" />
        <template #footer>
          <PerformanceFilterActions @confirm="confirmFilter" @cancel="cancelFilter" @clear="clearFilter" />
        </template>
      </PerformanceFilterPopover>

      <ReviewQuestionTable
        :questions="questions"
        :loading="loading"
        :page="page"
        :page-size="pageSize"
        :total="questions.length"
        @page-change="page = $event"
        @page-size-change="pageSize = $event"
        @edit="handleEdit"
        @remove="handleRemove"
      />
    </template>
    <ReviewRuleManagement v-else @create="handleRuleCreate" @edit="handleRuleEdit" />

  </PerformanceListPage>
</template>

<style scoped>
.page-tabs {
  display: flex;
  align-items: center;
  height: 48px;
  margin-top: -16px;
  margin-bottom: 12px;
  border-bottom: 1px solid rgba(31, 35, 41, 0.15);
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex: none;
  height: 48px;
  margin-right: 28px;
  padding: 12px 0;
  box-sizing: border-box;
  font-size: 16px;
  font-weight: 400;
  line-height: 24px;
  color: rgba(0, 0, 0, 0.65);
  cursor: pointer;
}
.tab.active {
  font-weight: 600;
  color: rgb(20, 86, 240);
}
.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: rgb(20, 86, 240);
  border-radius: 2px;
}
.create-button {
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
.create-icon {
  width: 14px;
  height: 14px;
  margin-right: 4px;
}
.create-label {
  position: relative;
  top: 1px;
}
</style>
