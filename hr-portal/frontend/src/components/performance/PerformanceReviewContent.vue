<template>
  <section class="review-content" aria-live="polite">
    <div v-if="loading" class="review-state">正在加载绩效评估…</div>
    <div v-else-if="error" class="review-state error-state">
      <p>{{ error }}</p>
      <button type="button" @click="emit('retry')">重新加载</button>
    </div>
    <div v-else-if="!node" class="review-state">
      <div class="state-illustration" aria-hidden="true">⌁</div>
      <p>{{ templateName ? '当前模板暂无可处理节点' : '暂无已启动的绩效评估' }}</p>
    </div>
    <template v-else>
      <div class="review-heading">
        <div class="review-heading-copy">
          <h2>{{ node.node_name }}</h2>
          <span v-if="node.status === 'not_started' && node.start_at" class="review-deadline">启动时间：{{ formatStartTime(node.start_at) }}</span>
          <span v-else-if="node.status !== 'completed' && node.end_at" class="review-deadline">截止时间：{{ formatDeadline(node.end_at) }}</span>
          <span v-else-if="node.status !== 'completed' && templateName" class="review-deadline">{{ templateName }}</span>
        </div>
        <div v-if="shows360Feedback && feedbackPanel?.voluntaryEnabled" class="review-heading-actions">
          <PerformanceDisabledReason :disabled="!feedbackPanel?.allowVoluntary" :reason="feedbackPanel?.voluntaryDisabledReason">
            <UiButton variant="primary" aria-label="自愿评估" :disabled="!feedbackPanel?.allowVoluntary" @click="feedbackPanel?.openVoluntaryDialog()">自愿评估</UiButton>
          </PerformanceDisabledReason>
        </div>
      </div>
      <div class="review-body" :class="{ 'review-body--completed': node.status === 'completed' && !showsEvaluationWorkspace }">
        <div class="review-panel" :class="{ completed: node.status === 'completed' && !showsEvaluationWorkspace, evaluation: showsEvaluationWorkspace, invite: node.node_type === 'reviewer_360_invite', feedback: showsFeedbackTable }">
        <PerformanceReview360InvitePanel
          v-if="node.node_type === 'reviewer_360_invite' && props.projectId"
          :project-id="props.projectId"
          :node-id="node.node_id"
        />
        <PerformanceReview360FeedbackPanel
          v-else-if="showsFeedbackTable && props.projectId"
          ref="feedbackPanel"
          :key="`${props.projectId}-${node.node_id}`"
          :mode="displayConfig?.table === 'communication' ? 'communication' : 'feedback'"
          :project-id="props.projectId"
          :node-id="node.node_id"
          @open-task="emit('open-member', { node, member: $event })"
        />
        <template v-else-if="showsEvaluationWorkspace">
          <div class="evaluation-workspace">
            <PerformanceLineTabs v-model="evaluationTab" :tabs="evaluationTabs" flush>
              <ProjectMemberListPanel
                v-if="evaluationTab === 'members' && props.projectId && node.node_id"
                :project-id="props.projectId"
                :key="`${props.projectId}-${node.node_id}-${node.phase_id || ''}`"
                :review-context="{ nodeId: node.node_id, state: 'all', phaseId: node.phase_id }"
                :show-export="false"
                @select-member="emit('open-member', { node, member: $event })"
              />
              <p v-else class="evaluation-pane-hint">该页签内容将在后续迭代中开发</p>
            </PerformanceLineTabs>
          </div>
        </template>
        <template v-else-if="node.status === 'completed'">
          <div class="completed-content">
            <PerformanceReviewCompletionNotice :task-id="node.task_id || undefined" :task-kind="node.task_kind" :editable="Boolean(node.editable)" :message="node.editable ? (node.end_at ? `你可以在 ${formatEditDeadline(node.end_at)} 前继续编辑` : '已提交，可继续编辑') : (node.end_at ? `该环节已在 ${formatEditDeadline(node.end_at)} 截止；如有疑问，请联系你的 HRBP。` : '该环节已截止；如有疑问，请联系你的 HRBP。')" @edit="choice => emit('open-node', { ...node!, draft_choice: choice })" />
            <PerformanceTemplateRenderer v-if="node.form_schema?.length" mode="readonly" :sections="node.form_schema" :answers="node.answers || {}" />
            <p v-else class="completed-fallback">已完成</p>
          </div>
        </template>
        <template v-else>
        <div class="state-illustration" aria-hidden="true">
          <img v-if="node.status === 'not_started'" src="/performance-not-started.svg" alt="" width="120" height="121">
          <img v-else src="/performance-no-submit.svg" alt="" width="120" height="120">
        </div>
        <p>{{ node.status === 'not_started' ? '暂未启动' : node.status === 'overdue' ? '该环节已逾期' : '暂未填写' }}</p>
        <button v-if="node.status !== 'not_started'" type="button" class="primary-button" @click="emit('open-node', node)">去完成</button>
        </template>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import UiButton from '../ui/UiButton.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import ProjectMemberListPanel from './ProjectMemberListPanel.vue'
import PerformanceReview360InvitePanel from './PerformanceReview360InvitePanel.vue'
import PerformanceReview360FeedbackPanel from './PerformanceReview360FeedbackPanel.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'
import { isReviewer360Node, isSelfEvaluationNode } from './performanceExecutorOptions'
import { performanceReviewDisplay } from './performanceReviewDisplay'

const props = defineProps<{
  loading: boolean
  error: string
  templateName: string
  node: PerformanceReviewNode | null
  projectId?: number | null
}>()

const displayConfig = computed(() => props.node ? performanceReviewDisplay(props.node.node_type) : null)
const showsFeedbackTable = computed(() => shows360Feedback.value || Boolean(displayConfig.value?.table === 'communication' && props.node?.status !== 'not_started'))
const showsEvaluationWorkspace = computed(() => {
  const node = props.node
  return Boolean(node && node.status !== 'not_started' && (displayConfig.value?.table === 'manager' || (node.task_kind === 'evaluation' && !isSelfEvaluationNode(node))))
})
const shows360Feedback = computed(() => {
  const node = props.node
  return Boolean(node && node.node_type === 'evaluation' && isReviewer360Node(node))
})
const feedbackPanel = ref<InstanceType<typeof PerformanceReview360FeedbackPanel> | null>(null)
const evaluationTabs: PerformanceLineTab[] = [
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
]
const evaluationTab = ref('members')
watch(() => props.node?.node_id, () => { evaluationTab.value = 'members' })

const emit = defineEmits<{
  retry: []
  'open-node': [node: PerformanceReviewNode]
  'open-member': [payload: { node: PerformanceReviewNode; member: PerformanceReviewMemberContext }]
}>()

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
.review-content::-webkit-scrollbar { display: none; }
.review-heading { display: flex; flex: none; align-items: flex-start; margin: 0; max-width: none; }.review-heading-copy { flex: 1; min-width: 0; margin-right: 40px; box-sizing: border-box; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 21px; }.review-heading-actions { display: flex; flex: none; align-items: center; gap: 8px; }.review-heading-copy h2 { min-width: 0; min-height: 0; margin: 0; box-sizing: border-box; color: rgba(0,0,0,.85); font-size: 18px; font-weight: 600; line-height: 26px; }.review-deadline { display: block; min-width: 0; min-height: 0; box-sizing: border-box; color: #646a73; font-size: 12px; font-weight: 400; line-height: 22px; }
.evaluation-workspace { display: flex; width: 100%; min-width: 0; align-self: stretch; flex: 1; flex-direction: column; }
.evaluation-pane-hint { display: grid; min-height: 360px; place-items: center; margin: 0; color: #8f959e; font-size: 14px; }
.heading-status { padding: 5px 9px; border-radius: 4px; background: #f1f2f4; color: #646a73; font-size: 12px; }
.heading-status.status-pending { background: #fff0df; color: #d46b08; }
.heading-status.status-overdue { background: #ffe8e8; color: #d14343; }
.review-body { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; flex-direction: column; margin: 16px 0 20px; }
.review-panel { display: flex; flex: 1 1 auto; min-height: 100%; max-width: none; flex-direction: column; align-items: center; justify-content: center; margin: 0; padding: var(--performance-review-surface-inset); box-sizing: border-box; border-radius: var(--performance-content-surface-radius); background: var(--performance-content-surface-background); color: #646a73; box-shadow: var(--shadow-dialog); }
.review-body--completed { flex: 1 0 auto; }
.review-panel.completed { flex: 1 0 auto; min-height: 0; align-items: stretch; justify-content: flex-start; padding: var(--performance-review-surface-inset); }
.review-panel.evaluation { align-items: stretch; justify-content: flex-start; padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
.review-panel.invite { align-items: stretch; justify-content: flex-start; padding: 0; }
.review-panel.feedback { align-items: stretch; justify-content: flex-start; padding: 0; }
.completed-content { flex: none; min-width: 0; width: 100%; max-width: var(--performance-review-content-max-width); margin: 0 auto; }
.completed-fallback { margin: auto !important; }
.review-panel > p, .review-state p { margin: 8px 0 20px; color: #646a73; font-size: 16px; font-weight: 400; line-height: 24px; text-align: center; }
.state-illustration { display: grid; width: 120px; height: 121px; place-items: center; }
.primary-button, .review-state button { min-width: 80px; height: 32px; padding: 0 16px; border: 0; border-radius: 6px; background: #3370ff; color: #fff; cursor: pointer; font-size: 14px; line-height: 22px; }
.review-state { display: flex; min-height: 640px; flex-direction: column; align-items: center; justify-content: center; color: #646a73; }
.error-state { color: #d14343; }
@media (max-width: 720px) { .review-content { padding: 24px 14px 32px; } .review-panel { min-height: 360px; } }
</style>
