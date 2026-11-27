<template>
  <section class="review-content" :class="{ 'review-content--tabbed': showsTabbedWorkspace }" aria-live="polite">
    <div v-if="loading" class="review-state">正在加载绩效评估…</div>
    <div v-else-if="error" class="review-state error-state">
      <p>{{ error }}</p>
      <UiButton variant="primary" @click="emit('retry')">重新加载</UiButton>
    </div>
    <div v-else-if="!node" class="review-state">
      <div class="state-illustration" aria-hidden="true">⌁</div>
      <p>{{ templateName ? '当前模板暂无可处理节点' : '暂无已启动的绩效评估' }}</p>
    </div>
    <template v-else>
      <div class="review-heading">
        <div class="review-heading-copy">
          <h2>{{ contentTitle || node.node_name }}</h2>
          <template v-if="node.node_type !== 'result_view' && !(shows360Feedback && (feedbackSources?.length || 0) > 1)">
          <span v-if="isNotStarted && node.start_at" class="review-deadline">启动时间：{{ formatStartTime(node.start_at) }}</span>
          <span v-else-if="node.status !== 'completed' && node.end_at" class="review-deadline">截止时间：{{ formatDeadline(node.end_at) }}</span>
          <span v-else-if="node.status !== 'completed' && templateName" class="review-deadline">{{ templateName }}</span>
          </template>
        </div>
        <slot name="heading-actions" />
        <div v-if="shows360Feedback && showsFeedbackTable && feedbackPanel?.voluntaryEnabled" class="review-heading-actions">
          <PerformanceDisabledReason :disabled="!feedbackPanel?.allowVoluntary" :reason="feedbackPanel?.voluntaryDisabledReason">
            <UiButton variant="primary" aria-label="自愿评估" :disabled="!feedbackPanel?.allowVoluntary" @click="feedbackPanel?.openVoluntaryDialog()">自愿评估</UiButton>
          </PerformanceDisabledReason>
        </div>
      </div>
      <div class="review-body" :class="{ 'review-body--completed': !resultUnavailable && (node.node_type === 'result_view' || node.status === 'completed' && !showsEvaluationWorkspace), 'review-body--workspace': showsEvaluationWorkspace || showsFeedbackTable }">
        <PerformanceTabbedSurface v-if="showsTabbedWorkspace" v-model="evaluationTab" :tabs="performanceAnalysisTabs" :contained="isCalibrationNode">
          <template v-if="isCalibrationNode && props.projectId && node.node_id" #before-tabs>
            <p v-if="distributionLoading" role="status">正在加载分布提示…</p>
            <p v-else-if="distributionError" role="alert">{{ distributionError }} <UiButton variant="text" @click="loadDistributionTips">重试</UiButton></p>
            <PerformanceDistributionTipsPanel v-else :tips="distributionTips" />
          </template>
          <ProjectMemberListPanel
            v-if="evaluationTab === 'members' && props.projectId && node.node_id"
            :project-id="props.projectId"
            :key="analysisScopeKey"
            :review-context="{ nodeId: node.node_id, state: 'all', phaseId: node.phase_id }"
            :preference-scope="props.memberPreferenceScope"
            :provider="props.memberProvider"
            variant="review"
            :show-export="false"
            @select-member="emit('open-member', { node, member: $event })"
            @remind-evaluate="emit('remind-evaluate', { node, ...$event })"
          />
          <slot v-else-if="evaluationTab === 'matrix' || evaluationTab === 'reports'" name="analysis" :key="analysisScopeKey" :tab="evaluationTab === 'matrix' ? 'matrix' : 'report'">
            <PerformanceReviewScopeAnalysis
              v-if="props.projectId && analysisCycleId"
              :key="analysisScopeKey"
              :project-id="props.projectId"
              :cycle-id="analysisCycleId"
              :node="node"
              :tab="evaluationTab"
              @open-member="emit('open-member', { node, member: $event })"
            />
            <p v-else class="evaluation-pane-hint">当前周期信息尚未就绪</p>
          </slot>
          <p v-else class="evaluation-pane-hint">当前周期信息尚未就绪</p>
        </PerformanceTabbedSurface>
        <div v-else class="review-panel" :class="{ completed: !resultUnavailable && (node.node_type === 'result_view' || node.status === 'completed' && !showsEvaluationWorkspace), evaluation: showsEvaluationWorkspace, feedback: showsFeedbackTable }">
        <template v-if="node.node_type === 'result_view' && resultUnavailable">
          <div class="state-illustration" aria-hidden="true"><img src="/performance-not-started.svg" alt="" width="120" height="121"></div>
          <p>暂未开通结果</p>
        </template>
        <div v-else-if="node.node_type === 'result_view'" class="completed-content"><slot /></div>
        <PerformanceReview360FeedbackPanel
          v-else-if="showsFeedbackTable && props.projectId"
          ref="feedbackPanel"
          embedded
          :key="`${props.projectId}-${node.node_id}`"
          :mode="displayConfig?.table === 'taskPeople' ? 'taskPeople' : displayConfig?.table === 'communication' ? 'communication' : 'feedback'"
          :project-id="props.projectId"
          :node-id="node.node_id"
          :sources="shows360Feedback ? feedbackSources : undefined"
          @open-task="openFeedbackTask"
          @remind-evaluate="emit('remind-evaluate', { node, ...$event })"
        />
        <template v-else-if="showsEvaluationWorkspace">
          <div class="evaluation-workspace">
            <ProjectMemberListPanel
              v-if="displayConfig?.table === 'members' && props.projectId && node.node_id"
              :project-id="props.projectId"
              :key="`${props.projectId}-${node.node_id}`"
              :review-context="{ nodeId: node.node_id, state: 'all', phaseId: node.phase_id }"
              :preference-scope="props.memberPreferenceScope"
              :provider="props.memberProvider"
              variant="review"
              :show-export="false"
              @select-member="emit('open-member', { node, member: $event })"
              @remind-evaluate="emit('remind-evaluate', { node, ...$event })"
            />
          </div>
        </template>
        <template v-else-if="node.status === 'completed'">
          <div class="completed-content">
            <PerformanceReviewCompletionNotice :task-id="node.task_id || undefined" :task-kind="node.task_kind" :editable="Boolean(node.editable)" :message="node.editable ? (node.end_at ? `你可以在 ${formatEditDeadline(node.end_at)} 前继续编辑` : '已提交，可继续编辑') : (node.end_at ? `该环节已在 ${formatEditDeadline(node.end_at)} 截止；如有疑问，请联系你的 HRBP。` : '该环节已截止；如有疑问，请联系你的 HRBP。')" @edit="choice => emit('open-node', { ...node!, draft_choice: choice })" />
            <PerformanceComparisonNotice :comparison="node.comparison" :task-id="node.task_id" readonly />
            <PerformanceTemplateRenderer v-if="node.form_schema?.length" mode="readonly" :sections="node.form_schema" :answers="node.answers || {}" />
            <p v-else class="completed-fallback">已完成</p>
          </div>
        </template>
        <template v-else>
        <div class="state-illustration" aria-hidden="true">
          <img v-if="isNotStarted" src="/performance-not-started.svg" alt="" width="120" height="121">
          <img v-else src="/performance-no-submit.svg" alt="" width="120" height="120">
        </div>
        <p>{{ isNotStarted ? '暂未启动' : node.status === 'overdue' ? '该环节已逾期' : '暂未填写' }}</p>
        <UiButton v-if="!isNotStarted" class="primary-button" variant="primary" @click="emit('open-node', node)">去完成</UiButton>
        </template>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import type { PerformanceColumnPreferenceScope, PerformanceDistributionTips, PerformanceReviewMemberContext, PerformanceReviewNode, PerformanceReview360Source } from '@/api/performance'
import { performanceWorkbenchApi } from '@/api/performance'
import PerformanceComparisonNotice from './PerformanceComparisonNotice.vue'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceTabbedSurface, { performanceAnalysisTabs } from './PerformanceTabbedSurface.vue'
import ProjectMemberListPanel from './ProjectMemberListPanel.vue'
import PerformanceReviewScopeAnalysis from './PerformanceReviewScopeAnalysis.vue'
import PerformanceReview360FeedbackPanel from './PerformanceReview360FeedbackPanel.vue'
import PerformanceDistributionTipsPanel from './PerformanceDistributionTips.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import { isReviewer360Node, isSelfEvaluationNode } from './performanceExecutorOptions'
import { performanceReviewDisplay } from './performanceReviewDisplay'

const props = defineProps<{
  loading: boolean
  error: string
  templateName: string
  node: PerformanceReviewNode | null
  feedbackSources?: PerformanceReview360Source[]
  feedbackState?: 'not_started' | 'started'
  projectId?: number | null
  cycleId?: number | null
  memberPreferenceScope?: PerformanceColumnPreferenceScope
  memberProvider?: InstanceType<typeof ProjectMemberListPanel>['$props']['provider']
  contentTitle?: string
  resultUnavailable?: boolean
}>()

const displayConfig = computed(() => props.node ? performanceReviewDisplay(props.node.node_type) : null)
const isNotStarted = computed(() => shows360Feedback.value && props.feedbackState ? props.feedbackState === 'not_started' : props.node?.status === 'not_started')
const showsFeedbackTable = computed(() => !isNotStarted.value && (shows360Feedback.value || displayConfig.value?.table === 'communication' || displayConfig.value?.table === 'taskPeople'))
const showsEvaluationWorkspace = computed(() => {
  const node = props.node
  return Boolean(node && node.status !== 'not_started' && (displayConfig.value?.table === 'manager' || displayConfig.value?.table === 'members' || (node.task_kind === 'evaluation' && !isSelfEvaluationNode(node))))
})
const shows360Feedback = computed(() => {
  const node = props.node
  return Boolean(node && node.node_type === 'evaluation' && isReviewer360Node(node))
})
const feedbackPanel = ref<InstanceType<typeof PerformanceReview360FeedbackPanel> | null>(null)
const showsTabbedWorkspace = computed(() => showsEvaluationWorkspace.value && displayConfig.value?.table !== 'members' && !showsFeedbackTable.value && props.node?.node_type !== 'result_view')
const evaluationTab = ref('members')
const analysisCycleId = computed(() => {
  const id = Number(props.cycleId ?? props.memberPreferenceScope?.cycle_ref)
  return Number.isSafeInteger(id) && id > 0 ? id : null
})
const analysisScopeKey = computed(() => JSON.stringify([props.projectId, analysisCycleId.value, props.node?.node_id, props.node?.phase_id, props.node?.scope_key, employeeSwitchEpoch.value]))
watch(() => props.node?.node_id, () => { evaluationTab.value = 'members' })

const isCalibrationNode = computed(() => props.node?.node_type === 'calibration')
const distributionTips = ref<PerformanceDistributionTips | null>(null)
const distributionLoading = ref(false), distributionError = ref('')
let distributionRequest = 0
async function loadDistributionTips() {
  const request = ++distributionRequest
  const node = props.node
  const projectId = props.projectId
  distributionTips.value = null; distributionError.value = ''; distributionLoading.value = false
  if (!node || node.node_type !== 'calibration' || !projectId) return
  distributionLoading.value = true
  try {
    const tips = await performanceWorkbenchApi.taskDistributionTips(Number(projectId), node.node_id, node.phase_id || null, node.scope_key)
    if (request === distributionRequest) distributionTips.value = tips
  } catch (cause: any) {
    if (request === distributionRequest) distributionError.value = cause?.response?.status === 403 ? '无权查看当前任务的分布。' : '分布提示加载失败，请重试。'
  } finally { if (request === distributionRequest) distributionLoading.value = false }
}
watch(() => [props.node?.node_type, props.node?.node_id, props.node?.phase_id, props.node?.scope_key, props.projectId, employeeSwitchEpoch.value], loadDistributionTips, { immediate: true })
onBeforeUnmount(() => { ++distributionRequest })

const emit = defineEmits<{
  retry: []
  'open-node': [node: PerformanceReviewNode]
  'remind-evaluate': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext; pendingCount: number }]
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
}>()

function openFeedbackTask(member: PerformanceReviewMemberContext & { project_id?: number; node_id?: string }) {
  if (!props.node) return
  emit('open-member', { node: { ...props.node, ...(member.node_id ? { node_id: member.node_id } : {}) }, member })
}

function formatDeadline(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const remaining = date.getTime() - Date.now()
  if (remaining > 0) {
    const hours = Math.floor(remaining / 3600000)
    const minutes = Math.floor((remaining % 3600000) / 60000)
    return `${hours} 小时 ${minutes} 分钟后`
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
function formatEditDeadline(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}（GMT+8）`
}
function formatStartTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}（GMT+8）`
}
</script>

<style scoped>
.review-content { display: flex; min-width: 0; min-height: 0; height: 100%; flex: 1; flex-direction: column; overflow: auto; padding: var(--performance-review-surface-inset) var(--performance-review-surface-inset) 0; box-sizing: border-box; background: var(--performance-review-page-bg); scrollbar-width: none; }
.review-content--tabbed { padding-bottom: var(--performance-review-surface-inset); }
.review-content--tabbed .review-body { margin: 0; }
.review-content::-webkit-scrollbar { display: none; }
.review-heading { display: flex; flex: none; align-items: flex-start; margin: 0; max-width: none; }
.review-heading-copy { flex: 1; min-width: 0; margin-right: var(--spacing-8); box-sizing: border-box; color: var(--color-text-primary); font-size: var(--font-size-md); font-weight: var(--font-weight-normal); line-height: var(--line-height-base); }
.review-heading-actions { display: flex; flex: none; align-items: center; gap: var(--spacing-2); }
.review-heading-copy h2 { min-width: 0; min-height: 0; margin: 0; box-sizing: border-box; color: var(--color-text-primary); font-size: var(--performance-page-title-size); font-weight: var(--performance-page-title-weight); line-height: var(--page-title-line-height); }
.review-deadline { display: block; min-width: 0; min-height: 0; box-sizing: border-box; color: var(--color-text-tertiary); font-size: var(--font-size-xs); font-weight: var(--font-weight-normal); line-height: var(--performance-button-line-height); }
.evaluation-workspace { display: flex; width: 100%; min-width: 0; align-self: stretch; flex: none; flex-direction: column; --performance-line-tabs-surface: var(--performance-content-surface-background); }
.evaluation-pane-hint { display: grid; min-height: calc(var(--spacing-8) * 9); place-items: center; margin: 0; color: var(--color-text-placeholder); font-size: var(--font-size-md); }
.review-body { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; flex-direction: column; margin: var(--spacing-4) 0 var(--spacing-5); }
.review-panel { display: flex; flex: 1 1 auto; min-height: 100%; max-width: none; flex-direction: column; align-items: center; justify-content: center; margin: 0; padding: var(--performance-review-surface-inset); box-sizing: border-box; border-radius: var(--performance-content-surface-radius); background: var(--performance-content-surface-background); color: var(--color-text-tertiary); box-shadow: var(--shadow-dialog); }
.review-body--completed { flex: 1 0 auto; }
.review-panel.completed { flex: 1 0 auto; min-height: 0; align-items: stretch; justify-content: flex-start; padding: var(--performance-review-surface-inset); }
.review-body--workspace { flex: 1 0 auto; }
.review-panel.evaluation, .review-panel.feedback { flex: 1 0 auto; min-height: 0; align-items: stretch; justify-content: flex-start; }
.completed-content { flex: none; min-width: 0; width: 100%; max-width: var(--performance-review-content-max-width); margin: 0 auto; }
.completed-fallback { margin: auto !important; }
.review-panel > p, .review-state p { margin: var(--spacing-2) 0 var(--spacing-5); color: var(--color-text-tertiary); font-size: var(--font-size-lg); font-weight: var(--font-weight-normal); line-height: var(--line-height-base); text-align: center; }
.state-illustration { display: grid; width: var(--performance-calibration-empty-size); height: var(--performance-calibration-empty-size); place-items: center; }
.review-state { display: flex; min-height: calc(var(--spacing-8) * 16); flex-direction: column; align-items: center; justify-content: center; color: var(--color-text-tertiary); }
.error-state { color: var(--color-text-danger-strong); }
@media (max-width: 45rem) { .review-content { padding: var(--spacing-6) var(--spacing-4) var(--spacing-7); } .review-panel { min-height: calc(var(--spacing-8) * 9); } }
</style>
