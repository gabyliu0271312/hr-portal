<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { performanceReviewRuleApi, type PerformanceReviewRuleDetail } from '@/api/performance'
import FullScreenModal from '@/components/performance/FullScreenModal.vue'
import ReviewRuleForm, { type ReviewRuleFormValue, type ReviewRulePreviewPayload } from '@/components/performance/ReviewRuleForm.vue'
import ReviewRulePreviewModal from '@/components/performance/ReviewRulePreviewModal.vue'

const route = useRoute()
const router = useRouter()

const mode = computed<'create' | 'edit'>(() => route.name === 'ReviewRuleEdit' ? 'edit' : 'create')
const title = computed(() => mode.value === 'create' ? '新建评估规则' : String(route.query.name || '编辑评估规则'))
const ruleId = computed(() => {
  const value = Number(route.params.id)
  return Number.isInteger(value) && value > 0 ? value : null
})

const formRef = ref<InstanceType<typeof ReviewRuleForm> | null>(null)
const formValue = ref<Partial<ReviewRuleFormValue>>({})
const isUsed = ref(false)
const ruleLoaded = ref(mode.value === 'create')
const previewPayload = ref<ReviewRulePreviewPayload | null>(null)
const previewOpen = computed(() => previewPayload.value !== null)
const previewType = computed<'rating' | 'score' | 'mapping'>(() => {
  if (previewPayload.value?.reviewType === '评分') return 'score'
  if (previewPayload.value?.reviewType === '评分映射等级型') return 'mapping'
  return 'rating'
})
const submitting = ref(false)

function returnToRuleList() {
  void router.push({ name: 'ReviewQuestionManagement', query: { tab: 'rule' } })
}

function openPreview(value: ReviewRulePreviewPayload) {
  previewPayload.value = value
}

function closePreview() {
  previewPayload.value = null
}

function toPayload(value: ReviewRuleFormValue) {
  return {
    name: value.name.trim(),
    review_type: value.reviewType,
    config: {
      languages: value.languages,
      gradeParticipatesInCalculation: value.gradeParticipatesInCalculation,
      levels: value.levels,
      score: value.score,
      mapping: value.mapping,
    },
    remark: value.remark,
  }
}

async function handleSubmit(value: ReviewRuleFormValue) {
  if (submitting.value) return
  submitting.value = true
  try {
    if (mode.value === 'edit' && ruleId.value !== null) {
      await performanceReviewRuleApi.update(ruleId.value, toPayload(value))
    } else {
      await performanceReviewRuleApi.create(toPayload(value))
    }
    ElMessage.success(mode.value === 'create' ? '评估规则已创建' : '评估规则已保存')
    returnToRuleList()
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.detail?.message || '评估规则保存失败，请稍后重试')
  } finally {
    submitting.value = false
  }
}

async function loadRule() {
  if (mode.value !== 'edit' || ruleId.value === null) return
  try {
    const detail: PerformanceReviewRuleDetail = await performanceReviewRuleApi.get(ruleId.value)
    isUsed.value = detail.is_used
    formValue.value = {
      name: detail.name,
      reviewType: detail.review_type,
      ...detail.config,
      remark: detail.remark,
    }
  } catch {
    ElMessage.error('评估规则加载失败，请稍后重试')
  } finally {
    ruleLoaded.value = true
  }
}

onMounted(() => { void loadRule() })
</script>

<template>
  <FullScreenModal
    :title="title"
    :submitting="submitting"
    @back="returnToRuleList"
    @submit="formRef?.submit()"
    @preview="formRef?.preview()"
    @cancel="returnToRuleList"
  >
    <div class="review-rule-page-content" :data-mode="mode">
      <ReviewRuleForm v-if="ruleLoaded" ref="formRef" v-model="formValue" :mode="mode" :is-used="isUsed" @preview="openPreview" @submit="handleSubmit" />
    </div>
    <ReviewRulePreviewModal
      v-if="previewPayload"
      :open="previewOpen"
      :review-type="previewType"
      :form-value="previewPayload"
      @close="closePreview"
    />
  </FullScreenModal>
</template>

<style scoped>
.review-rule-page-content {
  flex: 0 0 100vw;
  width: 100vw;
  min-height: 100%;
}
</style>
