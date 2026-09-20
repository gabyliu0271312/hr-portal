import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { performanceWorkbenchApi, type PerformanceWorkbenchProject, type PerformanceWorkbenchTaskGroup, type PerformanceWorkbenchTimelineNode } from '@/api/performance'
import { usePerformanceProjectContextStore } from '@/stores/performanceProjectContext'
import Workbench from './Workbench.vue'

const push = vi.fn()
const replace = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push, replace }),
}))

const projects: PerformanceWorkbenchProject[] = [
  { project_id: 1, project_name: '项目一', cycle_name: '2025周期', cycle_start_at: '2025-01-01', cycle_end_at: '2025-12-31', project_status: 'STARTED' },
  { project_id: 2, project_name: '项目二', cycle_name: '2026周期', cycle_start_at: '2026-01-01', cycle_end_at: '2026-12-31', project_status: 'STARTED' },
]
const timeline: PerformanceWorkbenchTimelineNode[] = [
  { node_id: 'summary', node_name: '工作总结', node_type: 'work_summary', node_order: 1, start_at: null, end_at: null, status: 'pending' },
]
const pending: PerformanceWorkbenchTaskGroup[] = [
  { task_id: 11, node_id: 'summary', node_type: 'work_summary', node_name: '工作总结', pending_count: 1, completed_count: 0, overdue_count: 0, available_at: null, due_at: null, action_url: '/performance/review' },
]

let pinia: Pinia
function mountView() {
  return mount(Workbench, {
    global: {
      plugins: [pinia],
      stubs: {
        'el-dropdown': { template: '<div><slot /><button class="select-project-one" @click="$emit(\'command\', 1)">切换</button><slot name="dropdown" /></div>', emits: ['command'] },
        'el-dropdown-menu': { template: '<div><slot /></div>' },
        'el-dropdown-item': { template: '<div><slot /></div>', props: ['command'] },
        'el-icon': { template: '<span><slot /></span>' },
        'el-button': { template: '<button><slot /></button>' },
        PerformanceWorkbenchTimeline: { template: '<div class="timeline-stub" />' },
      },
    },
  })
}

describe('PerformanceWorkbench project context', () => {
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    localStorage.clear()
    push.mockReset()
    replace.mockReset()
    vi.restoreAllMocks()
    vi.spyOn(performanceWorkbenchApi, 'listProjects').mockResolvedValue(projects)
    vi.spyOn(performanceWorkbenchApi, 'timeline').mockResolvedValue(timeline)
    vi.spyOn(performanceWorkbenchApi, 'tasks').mockImplementation(async (_projectId, state) => state === 'pending' ? pending : [])
  })

  it('uses the project selected in performance review and keeps it in the URL', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()

    expect(wrapper.get('.cycle-picker-text').text()).toBe('2026周期')
    expect(performanceWorkbenchApi.timeline).toHaveBeenCalledWith(2)
    expect(replace).toHaveBeenCalledWith({ query: { project_id: '2' } })
  })

  it('updates the shared project when the workbench selector changes', async () => {
    const context = usePerformanceProjectContextStore()
    context.setActiveProjectId(2)
    const wrapper = mountView()
    await flushPromises()
    await wrapper.get('.select-project-one').trigger('click')
    await flushPromises()

    expect(context.activeProjectId).toBe(1)
    expect(replace).toHaveBeenLastCalledWith({ query: { project_id: '1' } })
    expect(performanceWorkbenchApi.timeline).toHaveBeenCalledWith(1)
  })
})
