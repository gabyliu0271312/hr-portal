<template>
  <div class="workbench-page">
    <section v-if="devAdminDebug" class="dev-debug-banner" role="status">
      开发调试模式：绩效管理员可预览全部人员任务
    </section>
    <section class="workbench-main">
      <div class="cycle-picker-row">
        <el-dropdown trigger="click" @command="selectProject">
          <button class="cycle-picker" type="button">
            <span class="cycle-picker-text">{{ activeProject?.cycle_name || '我的绩效项目' }}</span>
            <DownOutlinedIcon class="cycle-picker-icon" />
          </button>
          <template #dropdown>
            <el-dropdown-menu class="project-menu">
              <el-dropdown-item
                v-for="project in projects"
                :key="project.project_id"
                :command="project.project_id"
                :class="{ selected: project.project_id === activeProject?.project_id }"
              >
                <div class="project-option">
                  <strong>{{ project.project_name }}</strong>
                  <span>{{ formatRange(project.cycle_start_at, project.cycle_end_at) }}</span>
                  <em v-if="project.project_id === activeProject?.project_id">{{ project.project_status === 'STARTED' ? '进行中' : project.project_status }}</em>
                </div>
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <div class="timeline-card">
        <div class="timeline-card-content">
          <PerformanceWorkbenchTimeline :key="activeProjectId ?? 'empty'" :nodes="visibleNodes" />
        </div>
      </div>

      <section v-if="activeProject?.result_published" class="result-card">
        <div class="result-icon"><el-icon><Document /></el-icon></div>
        <div class="result-copy">
          <strong>查看绩效结果</strong>
          <span>查看你的绩效评估结果，请注意信息保密</span>
        </div>
        <el-button plain @click="goToResults">查看</el-button>
      </section>

      <section class="todo-section">
        <p class="todo-title">我的待办</p>
        <div class="todo-card">
          <div class="todo-tabs" role="tablist">
            <button :class="{ active: todoTab === 'pending' }" type="button" @click="todoTab = 'pending'">
              待完成 ({{ pendingCount }})
            </button>
            <button :class="{ active: todoTab === 'completed' }" type="button" @click="todoTab = 'completed'">
              已完成 ({{ completedCount }})
            </button>
          </div>
          <div v-if="visibleTodos.length" class="todo-list">
            <a v-for="todo in visibleTodos" :key="`${todo.node_id}-${todo.task_id || todo.completed}`" class="todo-item" :href="todoHref(todo)" @click="openTodo(todo, $event)">
              <span class="todo-icon"><component :is="todo.icon" /></span>
              <span class="todo-content">
                <span class="todo-heading">
                  <span class="todo-name">{{ todo.node_name }}</span>
                  <em v-if="todo.deadline_label">{{ todo.deadline_label }}</em>
                </span>
                <small>截止时间: {{ todo.display_due_at }}（GMT+8）</small>
              </span>
              <span class="todo-action">{{ todoTab === 'pending' ? '去完成' : '查看' }}</span>
            </a>
          </div>
          <div v-else class="todo-empty">暂无内容</div>
        </div>
      </section>
    </section>

    <aside class="workbench-side">
      <section class="side-card quick-card">
        <div class="quick-title">快捷入口</div>
        <div class="quick-group">
          <div class="quick-group-label">我的绩效</div>
          <button class="quick-link" type="button" @click="goToResults">
            <span class="quick-icon-slot"><FileLinkOtherfileOutlinedIcon /></span>
            <div class="quick-link-text">我的绩效结果</div>
            <span class="quick-result-spacer" aria-hidden="true"></span>
            <RightOutlinedIcon class="chevron" />
          </button>
        </div>
        <div class="quick-group">
          <div class="quick-group-label">我管理的团队</div>
          <button class="quick-link" type="button" @click="openTeam">
            <span class="quick-icon-slot"><GroupOutlinedIcon /></span>
            <div class="quick-link-text">我团队成员的绩效</div>
            <RightOutlinedIcon class="chevron" />
          </button>
        </div>
        <div class="quick-group">
          <div class="quick-group-label">我支持的团队</div>
          <button class="quick-link" type="button" @click="openTeam">
            <span class="quick-icon-slot is-warning"><ReadinfoOutlinedIcon /></span>
            <div class="quick-link-text">评估进展及催办</div>
            <RightOutlinedIcon class="chevron" />
          </button>
          <button class="quick-link" type="button" @click="openTeam">
            <span class="quick-icon-slot"><GroupOutlinedIcon /></span>
            <div class="quick-link-text">我团队成员的绩效</div>
            <RightOutlinedIcon class="chevron" />
          </button>
        </div>
      </section>
      <section class="side-card announcement-card">
        <h2>公告</h2>
        <button v-for="announcement in announcements" :key="announcement.title" type="button">
          <span>{{ announcement.title }}</span><time>{{ announcement.time }}</time>
        </button>
      </section>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, type Component } from 'vue'
import { ElMessage } from 'element-plus'
import { useRoute, useRouter } from 'vue-router'
import { Document, Tickets, User } from '@element-plus/icons-vue'
import DownOutlinedIcon from '@/components/performance/DownOutlinedIcon.vue'
import FileLinkOtherfileOutlinedIcon from '@/components/performance/FileLinkOtherfileOutlinedIcon.vue'
import GroupOutlinedIcon from '@/components/performance/GroupOutlinedIcon.vue'
import InviteTaskIcon from '@/components/performance/InviteTaskIcon.vue'
import ReadinfoOutlinedIcon from '@/components/performance/ReadinfoOutlinedIcon.vue'
import RightOutlinedIcon from '@/components/performance/RightOutlinedIcon.vue'
import WorkSummaryTaskIcon from '@/components/performance/WorkSummaryTaskIcon.vue'
import PerformanceWorkbenchTimeline from '@/components/performance/PerformanceWorkbenchTimeline.vue'
import { performanceApi, performanceWorkbenchApi, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'
import { usePerformanceProjectContextStore, type PerformanceWorkbenchSnapshot } from '@/stores/performanceProjectContext'

interface Todo extends PerformanceWorkbenchTaskGroup {
  completed: boolean
  icon: Component
  deadline_label: string
  display_due_at: string
}

const route = useRoute()
const router = useRouter()
const projectContext = usePerformanceProjectContextStore()
const routeProjectId = Number(route.query.project_id)
if (Number.isFinite(routeProjectId) && routeProjectId > 0) projectContext.setActiveProjectId(routeProjectId)
const todoTab = ref<'pending' | 'completed'>('pending')
const projects = ref<PerformanceWorkbenchProject[]>(projectContext.workbenchProjects || [])
const activeProjectId = computed(() => projectContext.activeProjectId)
const visibleNodes = ref<Array<PerformanceWorkbenchTimelineNode & { completed: boolean; current: boolean; range: string }>>([])
const pendingTodos = ref<PerformanceWorkbenchTaskGroup[]>([])
const completedTodos = ref<PerformanceWorkbenchTaskGroup[]>([])
const loading = ref(true)
const devAdminDebug = ref(false)
const activeProject = computed(() => projects.value.find((project) => project.project_id === activeProjectId.value) || projects.value[0])
const visibleTodos = computed<Todo[]>(() => (todoTab.value === 'pending' ? pendingTodos.value : completedTodos.value).map((todo) => {
  const dueAt = todo.due_at || visibleNodes.value.find((node) => node.node_id === todo.node_id)?.end_at || null
  return {
    ...todo,
    due_at: dueAt,
    completed: todoTab.value === 'completed',
    icon: resolveTodoIcon(todo.node_type),
    deadline_label: resolveDeadlineLabel(todo, dueAt),
    display_due_at: formatDueAt(dueAt),
  }
}))
const pendingCount = computed(() => pendingTodos.value.length)
const completedCount = computed(() => completedTodos.value.length)
const announcements = [{ title: '2026半年度个人绩效评估方案', time: '2个月前' }, { title: '管理者绩效面谈指引', time: '9个月前' }]

function formatDateTime(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function formatRange(startAt: string | null, endAt: string | null) {
  if (!startAt && !endAt) return '时间待配置'
  return `${formatDateTime(startAt) || '--'} - ${formatDateTime(endAt) || '--'}`
}
function formatDueAt(value: string | null) {
  if (!value) return '未配置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '未配置'
  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function resolveDeadlineLabel(todo: PerformanceWorkbenchTaskGroup, dueAt: string | null) {
  if (todo.overdue_count > 0) return `逾期 ${todo.overdue_count} 人`
  if (!dueAt) return ''
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return ''
  const remainingDays = Math.ceil((due.getTime() - Date.now()) / 86_400_000)
  return remainingDays > 0 && remainingDays <= 3 ? `${remainingDays} 天内截止` : ''
}
function resolveTodoIcon(nodeType: string): Component {
  if (nodeType === 'work_summary') return WorkSummaryTaskIcon
  if (nodeType === 'reviewer_360_invite' || nodeType.includes('invite')) return InviteTaskIcon
  if (nodeType.includes('communication')) return Tickets
  if (nodeType.includes('evaluation')) return User
  return Document
}
function applyProjectSnapshot(snapshot: PerformanceWorkbenchSnapshot) {
  visibleNodes.value = snapshot.timeline.map((node) => ({ ...node, range: formatRange(node.start_at, node.end_at), completed: node.status === 'completed', current: node.status === 'pending' }))
  pendingTodos.value = snapshot.pending
  completedTodos.value = snapshot.completed
}
async function loadProject(projectId: number) {
  const [timeline, pending, completed] = await Promise.all([
    performanceWorkbenchApi.timeline(projectId),
    performanceWorkbenchApi.tasks(projectId, 'pending'),
    performanceWorkbenchApi.tasks(projectId, 'completed'),
  ])
  const snapshot = { timeline, pending, completed }
  projectContext.setWorkbenchSnapshot(projectId, snapshot)
  if (activeProjectId.value === projectId) applyProjectSnapshot(snapshot)
}
async function selectProject(rawId: number | string) {
  const id = Number(rawId)
  if (!Number.isFinite(id) || id <= 0) return
  const unchanged = id === activeProjectId.value && Boolean(projectContext.workbenchSnapshot(id))
  projectContext.setActiveProjectId(id)
  await router.replace({ query: { ...route.query, project_id: String(id) } })
  const cached = projectContext.workbenchSnapshot(id)
  if (cached) applyProjectSnapshot(cached)
  if (unchanged) return
  try { await loadProject(id) } catch { ElMessage.error('工作台数据加载失败') }
}
function reviewQuery(entry: string) { return { name: 'PerformanceReview', query: { entry, project_id: String(activeProjectId.value || '') } } }
function goToResults() { router.push(reviewQuery('results')) }
function openTeam() { router.push(reviewQuery('team')) }
function todoHref(todo: Todo) {
  const query = new URLSearchParams({ node: String(todo.node_id), project_id: String(activeProjectId.value || '') })
  if (todo.node_type === 'work_summary' && todo.task_id) {
    return `/performance/review/self-summary?${new URLSearchParams({ task_id: String(todo.task_id), project_id: String(activeProjectId.value || '') }).toString()}`
  }
  return `${todo.action_url || '/performance/review'}?${query.toString()}`
}

function openTodo(todo: Todo, event?: MouseEvent) {
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)) return
  event?.preventDefault()
  event?.stopPropagation()
  void router.push(todoHref(todo))
}
onMounted(async () => {
  try { devAdminDebug.value = Boolean((await performanceApi.getAccessContext()).dev_admin_debug) } catch { devAdminDebug.value = false }
  const cachedProjects = projectContext.workbenchProjects
  if (cachedProjects) projects.value = cachedProjects
  const cachedProjectId = activeProjectId.value
  const cachedSnapshot = projectContext.workbenchSnapshot(cachedProjectId)
  if (cachedSnapshot) {
    applyProjectSnapshot(cachedSnapshot)
    loading.value = false
  }
  try {
    const loadedProjects = await performanceWorkbenchApi.listProjects()
    projects.value = loadedProjects
    projectContext.setWorkbenchProjects(loadedProjects)
    const preferredId = activeProjectId.value && loadedProjects.some(project => project.project_id === activeProjectId.value)
      ? activeProjectId.value
      : loadedProjects[0]?.project_id || null
    projectContext.setActiveProjectId(preferredId)
    if (!preferredId) return
    if (String(route.query.project_id || '') !== String(preferredId)) await router.replace({ query: { ...route.query, project_id: String(preferredId) } })
    const snapshot = projectContext.workbenchSnapshot(preferredId)
    if (snapshot) {
      applyProjectSnapshot(snapshot)
      loading.value = false
      await loadProject(preferredId)
    } else await loadProject(preferredId)
  } catch { ElMessage.error('工作台数据加载失败') } finally { loading.value = false }
})
</script>

<style scoped>
.dev-debug-banner { grid-column: 1 / -1; padding: 8px 12px; border: 1px solid #f3c56b; border-radius: 6px; background: #fff8e6; color: #8a5a00; font-size: 13px; }
.workbench-page { display: grid; grid-template-columns: minmax(640px, 1fr) 340px; align-items: start; gap: 12px; width: min(1408px, calc(100vw - 40px)); min-width: 992px; max-width: 1408px; min-height: 100%; margin: 0 auto; padding: 18px 0 32px; background: #f4f6f8; color: #172033; }
.workbench-main { display: flex; min-width: 0; width: auto; flex-direction: column; padding: 20px; border: 0.666667px solid transparent; border-radius: 12px; background: #fff; box-shadow: rgba(31, 35, 41, 0.03) 0 4px 16px 4px, rgba(31, 35, 41, 0.02) 0 4px 8px 0, rgba(31, 35, 41, 0.02) 0 2px 4px -4px; }
.cycle-picker-row { margin: 0 0 16px; }
.cycle-picker { display: inline-flex; min-width: 0; max-width: 760px; align-items: center; gap: 8px; padding: 0; border: 0; background: transparent; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; }
.cycle-picker-text { overflow: hidden; color: #1f2329; font-size: 20px; font-weight: 600; line-height: 26px; text-overflow: ellipsis; white-space: nowrap; }
.cycle-picker-icon { width: 20px; height: 20px; flex: 0 0 20px; color: #646a73; }
.timeline-card, .side-card { border: 1px solid #dee0e3; border-radius: 8px; background: #fff; box-shadow: none; }
.timeline-card { margin-bottom: 28px; padding: 24px; overflow: hidden; border-width: 0.666667px; box-shadow: none; }
.timeline-card-content { margin: -4px 0; }
.result-card { display: flex; align-items: center; gap: 22px; margin-top: 14px; padding: 24px 30px; border: 1px solid #edf0f4; border-radius: 12px; background: #fff; box-shadow: 0 5px 18px rgb(26 41 70 / 3%); }
.result-icon { display: grid; flex: 0 0 auto; width: 56px; height: 56px; place-items: center; border-radius: 12px; background: #f1f5fb; color: #3478f6; font-size: 27px; }
.result-copy { display: grid; flex: 1; gap: 8px; }
.result-copy strong { font-size: 17px; font-weight: 500; }
.result-copy span { color: #718098; font-size: 14px; }
.result-card :deep(.el-button) { min-width: 120px; height: 42px; color: #245fd5; }
.todo-section { margin-top: 0; }
.todo-title { margin: 0 0 16px; color: rgba(0, 0, 0, 0.65); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; font-size: 18px; font-weight: 600; line-height: 27px; }
.todo-card { display: flex; min-width: 0; min-height: 0; flex-direction: column; border: 0.666667px solid #dee0e3; border-radius: 8px; background: #fff; box-shadow: none; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; }
.todo-tabs { position: relative; display: flex; height: 52px; align-items: flex-start; gap: 0; margin-bottom: 12px; padding: 4px 0 0 16px; border-bottom: 1px solid rgba(31, 35, 41, 0.15); }
.todo-tabs button { position: relative; display: inline-flex; height: 48px; max-width: 240px; align-items: center; margin-right: 28px; padding: 12px 0; border: 0; background: transparent; color: #1f2329; cursor: pointer; font-family: inherit; font-size: 16px; font-weight: 400; line-height: 24px; transition: color .1s linear, background-color .1s linear, border-color .1s linear; }
.todo-tabs button.active { color: #1456f0; font-weight: 600; }
.todo-tabs button.active::after { position: absolute; right: 0; bottom: 0; left: 0; height: 3px; background: #3370ff; content: ''; }
.todo-list { padding: 8px 20px 0; }
.todo-empty { display: flex; align-items: center; justify-content: center; margin: 30px 0; padding: 0 20px; color: rgba(0, 0, 0, 0.65); font-size: 14px; line-height: 21px; }
.todo-item { display: flex; width: 100%; height: 44px; align-items: center; margin: 0 0 16px; padding: 0; border: 0; background: transparent; color: inherit; cursor: pointer; text-align: left; }
.todo-icon { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; margin-right: 16px; padding: 10px; border-radius: 8px; background: #f5f6f7; color: #3370ff; }
.todo-icon :deep(svg) { display: block; width: 24px; height: 24px; color: currentColor; fill: currentColor; }
.todo-content { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.todo-heading { display: flex; min-width: 0; align-items: center; gap: 8px; }
.todo-name { overflow: hidden; color: #1f2329; font-size: 14px; font-weight: 400; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.todo-heading em { display: flex; overflow: hidden; max-width: 100%; align-items: center; padding: 0 6px; border-radius: 4px; background: rgba(245, 74, 69, 0.2); color: #c02a26; font-size: 12px; font-style: normal; font-weight: 400; line-height: 20px; white-space: nowrap; }
.todo-content small { margin-top: 4px; color: #646a73; font-size: 12px; font-weight: 400; line-height: 18px; }
.todo-action { display: flex; min-width: 80px; height: 32px; align-items: center; justify-content: center; margin-left: 16px; padding: 4px 11px; border: 1px solid #bacefd; border-radius: 6px; background: #fff; color: #3370ff; font-size: 14px; font-weight: 400; line-height: 22px; text-align: center; white-space: nowrap; }
.workbench-side { display: grid; align-content: start; gap: 18px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"; }
.side-card { width: 340px; padding: 20px; }
.quick-card { height: 285px; border: 0.666667px solid transparent; border-radius: 12px; background: #fff; box-shadow: rgba(31, 35, 41, 0.03) 0 4px 16px 4px, rgba(31, 35, 41, 0.02) 0 4px 8px 0, rgba(31, 35, 41, 0.02) 0 2px 4px -4px; color: rgba(0, 0, 0, 0.65); font-size: 14px; font-weight: 400; line-height: 21px; }
.quick-title { min-width: 0; min-height: 0; margin-bottom: 12px; color: #1f2329; font-family: inherit; font-size: 18px; font-weight: 600; line-height: 22px; }
.quick-group { display: flex; min-width: 0; min-height: 0; flex-direction: column; margin: 0 0 12px; }
.quick-group:last-child { margin-bottom: 0; }
.quick-group-label { min-width: 0; min-height: 0; color: #646a73; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 22px; }
.quick-link { display: flex; width: calc(100% + 16px); height: 30px; min-width: 0; align-items: center; margin: 0 -8px; padding: 4px 8px; border: 0; border-radius: 4px; background: transparent; color: #1479e1; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 21px; text-align: left; transition: color .3s, background-color .3s; }
.quick-link:hover { background: #f5f6f7; }
.quick-icon-slot { display: inline-block; width: 16px; height: 16px; flex: 0 0 16px; margin-right: 8px; color: #3370ff; line-height: 0; text-align: center; }
.quick-icon-slot.is-warning { color: #ff8800; }
.quick-icon-slot :deep(svg) { display: inline-block; overflow: hidden; width: 16px; height: 16px; line-height: 16px; }
.quick-link-text { min-width: 0; overflow: hidden; flex: 1; box-sizing: border-box; color: #1f2329; cursor: pointer; font-family: inherit; font-size: 14px; font-weight: 400; line-height: 22px; text-overflow: ellipsis; white-space: nowrap; }
.quick-result-spacer { flex: 0 0 auto; margin-right: 4px; margin-left: 16px; }
.quick-group .chevron { display: block; width: 12px; height: 12px; flex: 0 0 12px; color: #8f959e; line-height: 0; }
.announcement-card h2 { margin: 0 0 12px; color: #1f2329; font-family: inherit; font-size: 18px; font-weight: 500; line-height: 27px; }
.announcement-card button { display: flex; width: 100%; align-items: center; justify-content: space-between; margin-top: 12px; padding: 0; border: 0; background: transparent; cursor: pointer; font-family: inherit; text-align: left; }
.announcement-card button:first-of-type { margin-top: 0; }
.announcement-card button span { overflow: hidden; color: #3370ff; font-size: 14px; font-weight: 400; line-height: 19px; text-overflow: ellipsis; white-space: nowrap; }
.announcement-card time { color: #8b96a7; font-size: 13px; white-space: nowrap; }
@media (max-width: 720px) { .workbench-page { width: calc(100vw - 32px); min-width: 0; grid-template-columns: 1fr; padding: 16px 0; } .workbench-main, .side-card { width: 100%; } .workbench-side { grid-template-columns: 1fr; } .timeline-card { overflow-x: auto; padding: 24px 12px 18px; } .result-card { align-items: flex-start; padding: 18px; } .result-card :deep(.el-button) { min-width: 76px; } .todo-tabs { padding: 0 14px; } .todo-item { gap: 12px; } .todo-icon { width: 44px; height: 44px; font-size: 21px; } .todo-action { padding: 8px 12px; } }
</style>
