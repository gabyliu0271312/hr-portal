<script setup lang="ts">
import type { PerformanceReviewSubQuestionOption } from '@/api/performance'
import { computed, ref, watch } from 'vue'
import type { ReviewRuleOption } from './reviewQuestionTypes'
import ReviewQuestionDisplayMethodCard from './ReviewQuestionDisplayMethodCard.vue'
import ReviewQuestionRatingMethodSection from './ReviewQuestionRatingMethodSection.vue'
import ReviewQuestionScoringMethodCard from './ReviewQuestionScoringMethodCard.vue'
import ReviewQuestionSubQuestionCreateModal from './ReviewQuestionSubQuestionCreateModal.vue'
import ReviewQuestionSubQuestionList, { type ReviewQuestionSubQuestion } from './ReviewQuestionSubQuestionList.vue'
import ReviewQuestionCalculationRuleSection, { type CalculationRuleOption } from './ReviewQuestionCalculationRuleSection.vue'

type RuleType = '评级' | '评分' | '评分映射等级型'

const props = withDefaults(defineProps<{
  entryMode: 'regular_question' | 'sub_question'
  ruleType: RuleType
  config: Record<string, unknown>
  displayMode?: '标签样式' | '下拉样式'
  subQuestionOptions?: { none: PerformanceReviewSubQuestionOption[]; condition: PerformanceReviewSubQuestionOption[] }
  subQuestionOptionsLoading?: boolean
  ruleOptions?: ReviewRuleOption[]
  scoringMethod?: string
  subQuestions?: ReviewQuestionSubQuestion[]
  validationMessage?: string
}>(), {
  subQuestionOptions: () => ({ none: [], condition: [] }),
  subQuestionOptionsLoading: false,
  ruleOptions: () => [],
  scoringMethod: '',
  subQuestions: () => [],
  validationMessage: '',
})

const emit = defineEmits<{
  'update:displayMode': [value: '标签样式' | '下拉样式']
  'update:scoringMethod': [value: string]
  'update:subQuestions': [value: ReviewQuestionSubQuestion[]]
  'create-sub-question': []
}>()

function valueOf(source: Record<string, unknown>, camel: string, snake: string): unknown {
  return source[camel] ?? source[snake]
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeMethod(value: unknown): string {
  const text = String(value ?? '')
  if (text === 'sub_items' || text.includes('子评估项')) return 'sub_items'
  if (text === 'total_score' || text.includes('总分项')) return 'total_score'
  return 'direct'
}

function normalizeCalculationRule(value: unknown): string {
  const text = String(value ?? '')
  if (text === 'weighted_sum' || text.includes('加权')) return 'weighted_sum'
  if (text === 'direct_sum' || text.includes('直接求和')) return 'direct_sum'
  if (text === 'average' || text.includes('平均')) return 'average'
  if (text === 'condition' || text.includes('条件')) return 'condition'
  return 'none'
}

const scoreConfig = computed(() => record(props.config.score ?? props.config))
const isFixedScore = computed(() => String(valueOf(scoreConfig.value, 'method', 'score_method') ?? '').includes('固定分值'))
const showAdditionalCards = computed(() => props.entryMode === 'regular_question')
const scoringVariant = computed<'score_range' | 'score_fixed' | 'score_mapping'>(() => {
  if (props.ruleType === '评分映射等级型') return 'score_mapping'
  return isFixedScore.value ? 'score_fixed' : 'score_range'
})
const scoringMethod = ref(props.scoringMethod || normalizeMethod(valueOf(props.config, 'evaluationMethod', 'evaluation_method')))
function createRatingSubQuestions(): ReviewQuestionSubQuestion[] {
  return [
    { id: 'sub-question-1', question_id: null },
    { id: 'sub-question-2', question_id: null },
  ]
}

const ratingSubQuestions = ref<ReviewQuestionSubQuestion[]>(props.subQuestions.length ? props.subQuestions : createRatingSubQuestions())
const scoreSubQuestions = ref<ReviewQuestionSubQuestion[]>(props.subQuestions.slice())
const calculationRule = ref(normalizeCalculationRule(valueOf(props.config, 'calculationRule', 'calculation_rule')))
const isRatingSubItems = computed(() => props.ruleType === '评级' && scoringMethod.value === 'sub_items')
const isTotalScore = computed(() => scoringMethod.value === 'total_score')
const isScoreSubItems = computed(() => props.ruleType === '评分' || props.ruleType === '评分映射等级型' ? (scoringVariant.value !== 'score_fixed' && scoringMethod.value === 'sub_items') : false)
const showOrder = computed(() => showAdditionalCards.value && (isRatingSubItems.value || isScoreSubItems.value))
const showDisplay = computed(() => showAdditionalCards.value && (props.ruleType === '评级' || isFixedScore.value || isScoreSubItems.value))
const showOptions = computed(() => (props.ruleType === '评级' && !isTotalScore.value) || isFixedScore.value)
const currentSubQuestionOptions = computed(() => calculationRule.value === 'condition' ? props.subQuestionOptions.condition : props.subQuestionOptions.none)
const scoreCalculationRuleOptions: CalculationRuleOption[] = [
  { value: 'none', label: '不设置计算规则' },
  { value: 'weighted_sum', label: '加权求和' },
  { value: 'direct_sum', label: '直接求和' },
  { value: 'average', label: '求平均分' },
]
const showCreateModal = ref(false)

watch(() => props.config, () => {
  scoringMethod.value = props.scoringMethod || normalizeMethod(valueOf(props.config, 'evaluationMethod', 'evaluation_method'))
  calculationRule.value = normalizeCalculationRule(valueOf(props.config, 'calculationRule', 'calculation_rule'))
}, { deep: true })

watch(() => props.scoringMethod, (value) => {
  if (value) scoringMethod.value = value
})

watch(scoringMethod, (value) => {
  emit('update:scoringMethod', value)
})

watch(scoringMethod, (value) => {
  if (value !== 'sub_items') {
    calculationRule.value = 'none'
    emit('update:subQuestions', [])
  }
})

watch(() => props.subQuestions, (value) => {
  scoreSubQuestions.value = value.slice()
}, { deep: true })

function updateScoreSubQuestions(value: ReviewQuestionSubQuestion[]) {
  scoreSubQuestions.value = value
  emit('update:subQuestions', value)
}

function updateRatingSubQuestions(value: ReviewQuestionSubQuestion[]) {
  ratingSubQuestions.value = value
  emit('update:subQuestions', value)
}

function openCreateModal() {
  showCreateModal.value = true
}

function handleCreateSubQuestion() {
  openCreateModal()
  emit('create-sub-question')
}
</script>

<template>
  <div class="rule-additional-cards">
    <ReviewQuestionRatingMethodSection
      v-if="showAdditionalCards && ruleType === '评级'"
      v-model="scoringMethod"
      v-model:calculation-rule="calculationRule"
      :sub-questions="ratingSubQuestions"
      :sub-question-options="currentSubQuestionOptions"
      :sub-question-options-loading="subQuestionOptionsLoading"
      class="evaluation-method-card"
      @update:sub-questions="updateRatingSubQuestions"
    />
    <template v-else-if="showAdditionalCards && (ruleType === '评分' || ruleType === '评分映射等级型')">
      <ReviewQuestionScoringMethodCard
        v-model="scoringMethod"
        :variant="scoringVariant"
        :config="config"
      >
        <template v-if="isScoreSubItems">
          <div class="score-sub-items-section">
            <ReviewQuestionCalculationRuleSection v-model="calculationRule" :options="scoreCalculationRuleOptions" />
            <ReviewQuestionSubQuestionList
              :model-value="scoreSubQuestions"
              :calculation-rule="calculationRule"
              :options="currentSubQuestionOptions"
              :loading="subQuestionOptionsLoading"
              :validation-message="validationMessage"
              @update:model-value="updateScoreSubQuestions"
              @create-sub-question="handleCreateSubQuestion"
            />
          </div>
        </template>
      </ReviewQuestionScoringMethodCard>
    </template>
    <ReviewQuestionScoringMethodCard
      v-else-if="showAdditionalCards"
      :variant="scoringVariant"
      :config="config"
    />
    <ReviewQuestionDisplayMethodCard
      v-if="showDisplay"
      :rule-type="ruleType"
      :config="config"
      :display-mode="displayMode"
      :show-options="showOptions"
      :show-order="showOrder"
      @update:display-mode="emit('update:displayMode', $event)"
    />
    <ReviewQuestionSubQuestionCreateModal v-model:open="showCreateModal" :rule-options="props.ruleOptions" />
  </div>
</template>

<style scoped>
.rule-additional-cards { width: 800px; max-width: 100%; }
.score-sub-items-section { width: 100%; }
</style>
