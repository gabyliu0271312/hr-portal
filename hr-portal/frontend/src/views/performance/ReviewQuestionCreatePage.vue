<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { performanceReviewQuestionApi, performanceReviewRuleApi, type PerformanceReviewRuleDetail, type PerformanceReviewSubQuestionOption } from '@/api/performance'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import PerformanceRequiredLabel from '@/components/performance/PerformanceRequiredLabel.vue'
import ReviewQuestionFormBasic from '@/components/performance/ReviewQuestionFormBasic.vue'
import ReviewQuestionFormType from '@/components/performance/ReviewQuestionFormType.vue'
import ReviewQuestionRuleSelect from '@/components/performance/ReviewQuestionRuleSelect.vue'
import ReviewRuleConfigRenderer from '@/components/performance/ReviewRuleConfigRenderer.vue'
import ReviewQuestionRuleAdditionalCards from '@/components/performance/ReviewQuestionRuleAdditionalCards.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'
import type { ReviewQuestionForm, ReviewRuleOption } from '@/components/performance/reviewQuestionTypes'
import type { ReviewQuestionSubQuestion } from '@/components/performance/ReviewQuestionSubQuestionList.vue'

const route = useRoute()
const router = useRouter()
const mode = computed(() => (route.name === 'ReviewQuestionEdit' ? 'edit' : 'create') as 'create' | 'edit')
const isSubQuestion = computed(() => route.query.isSub === '1' || route.query.isSub === 'true' || route.query.isSub === '' || route.query.isSub === null)
const entryMode = computed<'regular_question' | 'sub_question'>(() => isSubQuestion.value ? 'sub_question' : 'regular_question')
const title = computed(() => mode.value === 'edit' ? '编辑评估题' : isSubQuestion.value ? '新建子评估题' : '新建评估题')
const parentQuestionId = computed(() => {
  const value = Number(route.query.parent_question_id)
  return Number.isInteger(value) && value > 0 ? value : null
})
const questionId = computed(() => {
  const value = Number(route.params.id)
  return Number.isInteger(value) && value > 0 ? value : null
})

const form = reactive<ReviewQuestionForm>({
  language: '中文',
  name: String(route.query.name || ''),
  description: '',
  type: String(route.query.type || 'regular'),
  rule_id: null,
  remark: String(route.query.remark || ''),
})
const ruleOptions = ref<ReviewRuleOption[]>([])
const selectedRule = ref<PerformanceReviewRuleDetail | null>(null)
const displayMode = ref<'标签样式' | '下拉样式'>('标签样式')
const subQuestionOptions = ref<{ none: PerformanceReviewSubQuestionOption[]; condition: PerformanceReviewSubQuestionOption[] }>({ none: [], condition: [] })
const subQuestions = ref<ReviewQuestionSubQuestion[]>([])
const subQuestionValidation = ref('')
const scoringMethod = ref('direct')
const loadingSubQuestionOptions = ref(false)
const loadingRules = ref(false)
const loadingRule = ref(false)
const ruleError = ref('')
const submitting = ref(false)
const hydratingQuestion = ref(false)
let ruleLoadVersion = 0

async function loadRules() {
  loadingRules.value = true
  ruleError.value = ''
  try {
    ruleOptions.value = await performanceReviewRuleApi.list()
  } catch {
    ruleError.value = '评估规则加载失败，请稍后重试'
  } finally {
    loadingRules.value = false
  }
}

async function loadSubQuestionOptions() {
  loadingSubQuestionOptions.value = true
  try {
    const [none, condition] = await Promise.all([
      performanceReviewQuestionApi.listSubQuestionOptions('none'),
      performanceReviewQuestionApi.listSubQuestionOptions('condition'),
    ])
    subQuestionOptions.value = { none, condition }
  } catch {
    subQuestionOptions.value = { none: [], condition: [] }
  } finally {
    loadingSubQuestionOptions.value = false
  }
}

function normalizeScoringMethod(config: Record<string, unknown>): string {
  const value = config.evaluationMethod ?? config.evaluation_method
  const text = String(value ?? '')
  if (text === 'sub_items' || text.includes('子评估项')) return 'sub_items'
  if (text === 'total_score' || text.includes('总分项')) return 'total_score'
  return 'direct'
}

async function loadRule(id: number | null) {
  const requestVersion = ++ruleLoadVersion
  selectedRule.value = null
  loadingRule.value = false
  subQuestions.value = []
  subQuestionValidation.value = ''
  scoringMethod.value = 'direct'
  if (id === null) return
  loadingRule.value = true
  ruleError.value = ''
  try {
    const rule = await performanceReviewRuleApi.get(id)
    if (requestVersion === ruleLoadVersion) {
      selectedRule.value = rule
      scoringMethod.value = normalizeScoringMethod(rule.config)
      subQuestions.value = []
      subQuestionValidation.value = ''
    }
  } catch {
    if (requestVersion === ruleLoadVersion) ruleError.value = '评估规则配置加载失败，请稍后重试'
  } finally {
    if (requestVersion === ruleLoadVersion) loadingRule.value = false
  }
}

watch(() => form.rule_id, (id) => { void loadRule(id) })

watch(() => form.type, () => {
  if (mode.value !== 'create' || hydratingQuestion.value) return
  ruleLoadVersion += 1
  selectedRule.value = null
  displayMode.value = '标签样式'
  loadingRule.value = false
  ruleError.value = ''
  if (form.rule_id !== null) form.rule_id = null
}, { flush: 'sync' })

async function loadQuestion() {
  if (mode.value !== 'edit' || questionId.value === null) return
  hydratingQuestion.value = true
  try {
    const question = await performanceReviewQuestionApi.get(questionId.value)
    form.language = question.language === 'zh-CN' ? '中文' : question.language
    form.name = question.name
    form.description = question.description
    form.type = question.type
    form.rule_id = question.rule_id
    displayMode.value = question.display_mode || '标签样式'
    form.remark = question.remark
  } catch {
    ElMessage.error('评估题加载失败，请稍后重试')
  } finally {
    hydratingQuestion.value = false
  }
}

onMounted(async () => {
  await Promise.all([loadRules(), loadSubQuestionOptions()])
  await loadQuestion()
})

function back() { void router.push({ name: 'ReviewQuestionManagement' }) }

function isScoreRangeSubItems() {
  const rule = selectedRule.value
  if (entryMode.value !== 'regular_question' || !rule || !['评分', '评分映射等级型'].includes(rule.review_type) || scoringMethod.value !== 'sub_items') return false
  if (rule.review_type === '评分映射等级型') return true
  const config = rule.config.score && typeof rule.config.score === 'object'
    ? rule.config.score as Record<string, unknown>
    : rule.config
  const method = config.method ?? config.score_method
  return String(method ?? '').includes('分数上下限') || String(method ?? '').includes('score_range')
}

function updateDisplayMode(value: '标签样式' | '下拉样式') {
  displayMode.value = value
}

async function submit() {
  subQuestionValidation.value = ''
  if (!form.name.trim()) { ElMessage.warning('请输入名称'); return }
  if (form.rule_id === null) { ElMessage.warning('请选择评估规则'); return }
  if (isScoreRangeSubItems() && !subQuestions.value.some((row) => row.question_id !== null)) {
    subQuestionValidation.value = '该字段是必填字段'
    return
  }
  submitting.value = true
  const payload = {
    language: 'zh-CN' as const,
    name: form.name.trim(),
    description: form.description,
    type: form.type as 'regular' | 'okr' | 'bonus' | 'deduction',
    is_sub_question: isSubQuestion.value,
    parent_question_id: parentQuestionId.value,
    rule_id: form.rule_id,
    display_mode: displayMode.value,
    remark: form.remark,
  }
  try {
    if (mode.value === 'edit' && questionId.value !== null) await performanceReviewQuestionApi.update(questionId.value, payload)
    else await performanceReviewQuestionApi.create(payload)
    ElMessage.success(mode.value === 'create' ? '已创建' : '已保存')
    back()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail?.message || '评估题保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function preview() { ElMessage.info('预览') }
</script>

<template>
  <FullScreenModal :title="title" :submitting="submitting" @back="back" @submit="submit" @preview="preview" @cancel="back">
    <div class="question-create-content">
      <section class="question-card">
        <h2>基本信息</h2>
        <ReviewQuestionFormBasic :model-value="form" @update:model-value="Object.assign(form, $event)" />
        <el-form label-position="top" class="question-section-form">
          <el-form-item>
            <template #label><PerformanceRequiredLabel label="类型" /></template>
            <ReviewQuestionFormType v-model="form.type" :entry-mode="entryMode" />
          </el-form-item>
        </el-form>
      </section>
      <section class="question-card rule-card" :class="{ 'is-loaded': form.rule_id !== null, 'rating-rule-card': selectedRule?.review_type === '评级' }">
        <h2>评估规则</h2>
        <el-form label-position="top" class="question-section-form">
          <el-form-item>
            <template #label><PerformanceRequiredLabel label="评估规则" /></template>
            <ReviewQuestionRuleSelect v-model="form.rule_id" :options="ruleOptions" :loading="loadingRules" :error="ruleError" />
          </el-form-item>
        </el-form>
        <ReviewRuleConfigRenderer
          v-if="form.rule_id !== null"
          :entry-mode="entryMode"
          :rule-type="selectedRule?.review_type || '评级'"
          :config="selectedRule?.config || {}"
          :loading="loadingRule"
          :error="ruleError"
        />
      </section>
      <ReviewQuestionRuleAdditionalCards
        v-if="selectedRule"
        :entry-mode="entryMode"
        :rule-type="selectedRule.review_type"
        :config="selectedRule.config"
        :display-mode="displayMode"
        :rule-options="ruleOptions"
        :scoring-method="scoringMethod"
        :sub-questions="subQuestions"
        :validation-message="subQuestionValidation"
        :sub-question-options="subQuestionOptions"
        :sub-question-options-loading="loadingSubQuestionOptions"
        @update:display-mode="updateDisplayMode"
        @update:scoring-method="scoringMethod = $event"
        @update:sub-questions="subQuestions = $event"
      />
      <section class="question-card remark-card">
        <h2>备注信息</h2>
        <el-form label-position="top" class="question-section-form">
          <el-form-item>
            <template #label><span class="field-label">备注</span></template>
            <PerformanceTextField v-model="form.remark" type="textarea" :maxlength="2000" show-count />
          </el-form-item>
        </el-form>
      </section>
    </div>
  </FullScreenModal>
</template>

<style scoped>
.question-create-content { flex: 0 0 auto; width: min(800px, calc(100vw - 40px)); min-height: max-content; margin: 18px auto 48px; }
.question-card { width: 800px; max-width: 100%; margin-bottom: 16px; padding: 20px 20px 0 21px; box-sizing: border-box; border-radius: 8px; background: rgb(255,255,255); box-shadow: rgba(31,35,41,0.02) 0 1px 2px -2px, rgba(31,35,41,0.02) 0 2px 4px 0, rgba(31,35,41,0.02) 0 2px 8px 2px; }
.question-card:first-child { height: 388px; }
.rule-card { padding-bottom: 20px; }
.rule-card.is-loaded { height: auto; }
.rating-rule-card { height: 342px; }
.remark-card { padding-bottom: 20px; }
.question-card h2 { margin: 0 0 16px; font-size: 16px; line-height: 24px; font-weight: 600; color: #1f2329; }
.question-section-form :deep(.el-form-item) { margin-bottom: 0; }
.question-section-form :deep(.el-form-item__label) { height: 22px; margin-bottom: 8px; color: #1f2329; font-size: 14px; font-weight: 600; line-height: 22px; }
.field-label { color: rgb(31,35,41); font-weight: 600; }
.question-section-form :deep(.performance-text-field) { width: 100%; max-width: 759px; }
.question-card:first-child { overflow: visible; }
</style>
