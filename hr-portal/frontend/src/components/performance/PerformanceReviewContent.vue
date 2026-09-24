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
      </div>
      <div class="review-body">
        <div class="review-panel" :class="{ completed: node.status === 'completed' && node.task_kind !== 'evaluation', evaluation: node.task_kind === 'evaluation' && node.status !== 'not_started' }">
        <template v-if="node.task_kind === 'evaluation' && node.status !== 'not_started'">
          <div class="evaluation-workspace">
            <PerformanceLineTabs v-model="evaluationTab" :tabs="evaluationTabs" sticky flush>
              <ProjectMemberListPanel
                v-if="evaluationTab === 'members' && props.projectId && node.node_id"
                :project-id="props.projectId"
                :review-context="{ nodeId: node.node_id, state: 'all' }"
                :show-export="false"
                search-width="calc(100% - 88px)"
                @select-member="emit('open-member', { node, member: $event })"
              />
              <p v-else class="evaluation-pane-hint">该页签内容将在后续迭代中开发</p>
            </PerformanceLineTabs>
          </div>
        </template>
        <template v-else-if="node.status === 'completed'">
          <div class="completed-content">
            <PerformanceReviewCompletionNotice :editable="Boolean(node.editable)" :message="node.editable ? (node.end_at ? `你可以在 ${formatEditDeadline(node.end_at)} 前继续编辑` : '已提交，可继续编辑') : (node.end_at ? `该环节已在 ${formatEditDeadline(node.end_at)} 截止；如有疑问，请联系你的 HRBP。` : '该环节已截止；如有疑问，请联系你的 HRBP。')" @edit="emit('open-node', node)" />
            <PerformanceTemplateRenderer v-if="node.form_schema?.length" mode="readonly" :sections="node.form_schema" :answers="node.answers || {}" />
            <p v-else class="completed-fallback">已完成</p>
          </div>
        </template>
        <template v-else>
        <div class="state-illustration" aria-hidden="true">
          <img v-if="node.status === 'not_started'" src="/performance-not-started.svg" alt="" width="120" height="121">
          <svg v-else width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M76.543 70.079l-.216-.099-14.469 11.05a4 4 0 01-4.137.438L7.719 57.835c-1.36-.643-1.55-2.502-.347-3.407L21.06 44.142l21.08-36.53a4 4 0 015.175-1.617l51.362 24.281a4 4 0 01.975.65l14.776 13.376a4 4 0 01.781 4.964l-3.377 5.853-18.03 31.225-2.846 15.935c-.276 1.545-2.144 2.185-3.31 1.132l-13.33-12.042a4 4 0 01-1.242-3.746l3.478-17.535-.01-.009z" fill="#BBBFC4" fill-opacity=".45"/>
            <path d="M99.111 30.555a.5.5 0 00-.682.186l-22.1 38.56a.5.5 0 00.867.496l22.1-38.56a.5.5 0 00-.185-.682zM22.65 44.609a.5.5 0 01.663-.244l50.87 23.6a.5.5 0 01-.42.907l-50.87-23.6a.5.5 0 01-.244-.663zm55.94 26.106a.5.5 0 01.706 0l13.63 13.64a.5.5 0 01-.707.707l-13.63-13.64a.5.5 0 010-.707z" fill="#8F959E"/>
            <path d="M11.797 85.076c.096.265.382.41.638.324l13.99-4.695a.486.486 0 00.29-.635.515.515 0 00-.637-.324l-13.99 4.695a.486.486 0 00-.29.635zm16.86 8.06a.48.48 0 00.674-.168l3.574-6.425a.523.523 0 00-.194-.694.478.478 0 00-.674.168l-3.574 6.425a.523.523 0 00.194.694zm11.693 5.218a.472.472 0 00.604-.335l1.753-6.816a.53.53 0 00-.356-.63.473.473 0 00-.604.335l-1.753 6.816a.53.53 0 00.356.63zM21.545 15.237c-.237.733-1.515 4.842-2.65 10.987 2.172-9.38 11.841-10.024 18.856-10.958l3.906-6.82C28.54 6.833 22.7 12.754 21.545 15.236z" fill="#0C296E"/>
            <path d="M20.423 22.535c.128.519.289 1.031.482 1.538 1.09 2.859 3.17 5.435 5.97 7.907 5.131 4.532 12.937 8.92 22.25 14.157l1.377.774-3.766 4.694c-10.434-5.964-17.9-10.53-22.445-14.687-2.317-2.12-3.805-4.074-4.558-5.983-.74-1.879-.793-3.778-.122-5.87l.812-2.53zm-1.764 2.225c-2.949 9.19 6.726 15.819 28.323 28.137l5.037-6.279a1470.103 1470.103 0 00-2.364-1.33c-16.44-9.246-27.794-15.63-28.564-24.836-.144-1.711.079-3.52.702-5.463l-3.134 9.771zm96.069 61.305c-.439-2.174-7.212-11.455-12.955-13.49l3.138-5.455c5.669 2.65 9.792 7.27 9.799 10.05.007 2.861.064 6.394.018 8.895z" fill="#0C296E"/>
            <path d="M83.16 91.966l-.015-6.781c6.087.82 11.591 1.8 19.848 1.244 8.343-.56 11.725-4.535 11.716-8.563l.02 8.528c-.429 2.506-4.331 6.553-11.285 6.832-6.954.28-13.357-.145-20.283-1.26z" fill="#00D6B9"/>
            <path d="M66.162 105.194c-4.152-1.24-7.07-2.422-9.09-3.412l-.139-7.075c2.953 1.806 6.434 2.833 9.873 3.745 3.507.93 8.526 2.211 13.766 3.46l.016 6.817c-5.258-1.133-10.572-2.382-14.426-3.535zm18.538 4.352l-.016-6.782c6.088.82 11.592 1.8 19.849 1.245 8.342-.561 11.725-4.535 11.715-8.564l.021 8.529c-.429 2.506-4.331 6.553-11.285 6.832-6.954.279-13.358-.145-20.284-1.26z" fill="#3370FF"/>
          </svg>
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
import { ref } from 'vue'
import type { PerformanceReviewMemberContext, PerformanceReviewNode } from '@/api/performance'
import PerformanceReviewCompletionNotice from './PerformanceReviewCompletionNotice.vue'
import PerformanceLineTabs, { type PerformanceLineTab } from './PerformanceLineTabs.vue'
import ProjectMemberListPanel from './ProjectMemberListPanel.vue'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

const props = defineProps<{
  loading: boolean
  error: string
  templateName: string
  node: PerformanceReviewNode | null
  projectId?: number | null
}>()

const evaluationTabs: PerformanceLineTab[] = [
  { key: 'members', label: '成员列表' },
  { key: 'matrix', label: '矩阵分析' },
  { key: 'reports', label: '统计报表' },
]
const evaluationTab = ref('members')

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
.review-heading { display: flex; flex: none; align-items: flex-start; margin: 0; max-width: none; }.review-heading-copy { flex: 1; min-width: 0; margin-right: 40px; box-sizing: border-box; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 21px; }.review-heading-copy h2 { min-width: 0; min-height: 0; margin: 0; box-sizing: border-box; color: rgba(0,0,0,.85); font-size: 18px; font-weight: 600; line-height: 26px; }.review-deadline { display: block; min-width: 0; min-height: 0; box-sizing: border-box; color: #646a73; font-size: 12px; font-weight: 400; line-height: 22px; }
.evaluation-workspace { display: flex; width: 100%; min-width: 0; align-self: stretch; flex: 1; flex-direction: column; }
.evaluation-pane-hint { display: grid; min-height: 360px; place-items: center; margin: 0; color: #8f959e; font-size: 14px; }
.heading-status { padding: 5px 9px; border-radius: 4px; background: #f1f2f4; color: #646a73; font-size: 12px; }
.heading-status.status-pending { background: #fff0df; color: #d46b08; }
.heading-status.status-overdue { background: #ffe8e8; color: #d14343; }
.review-body { display: flex; flex: 1 1 auto; min-width: 0; min-height: 0; flex-direction: column; margin: 16px 0 20px; }
.review-panel { display: flex; flex: 1 1 auto; min-height: 100%; max-width: none; flex-direction: column; align-items: center; justify-content: center; margin: 0; padding: var(--performance-review-surface-inset); box-sizing: border-box; border-radius: var(--performance-content-surface-radius); background: var(--performance-content-surface-background); color: #646a73; box-shadow: var(--shadow-dialog); }
.review-panel.completed { align-items: stretch; justify-content: flex-start; padding: var(--performance-review-surface-inset); }
.review-panel.evaluation { align-items: stretch; justify-content: flex-start; padding: 0; border-radius: 0; background: transparent; box-shadow: none; }
.completed-content { width: 100%; max-width: var(--performance-review-content-max-width); margin: 0 auto; }
.completed-fallback { margin: auto !important; }
.review-panel p, .review-state p { margin: 8px 0 20px; color: #646a73; font-size: 16px; font-weight: 400; line-height: 24px; text-align: center; }
.state-illustration { display: grid; width: 120px; height: 121px; place-items: center; }
.primary-button, .review-state button { min-width: 80px; height: 32px; padding: 0 16px; border: 0; border-radius: 6px; background: #3370ff; color: #fff; cursor: pointer; font-size: 14px; line-height: 22px; }
.review-state { display: flex; min-height: 640px; flex-direction: column; align-items: center; justify-content: center; color: #646a73; }
.error-state { color: #d14343; }
@media (max-width: 720px) { .review-content { padding: 24px 14px 32px; } .review-panel { min-height: 360px; } }
</style>
