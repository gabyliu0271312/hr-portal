import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import CalibrationSingleTask from './CalibrationSingleTask.vue'
import CalibrationTaskCompletion from './CalibrationTaskCompletion.vue'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import { performanceWorkbenchApi } from '@/api/performance'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
vi.mock('@/api/performanceCalibration', async original => ({ ...await original<typeof import('@/api/performanceCalibration')>(), performanceCalibrationApi: { preview: vi.fn(), distribution: vi.fn(), confirm: vi.fn() } }))
const scope: PerformanceCalibrationTaskScope = { scope_key: 'single', project_id: 2, project_name: '项目', node_id: 'calibration', node_name: '绩效校准', phase_id: 'phase', source_rule_id: 'rule', task_number: 1, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 2, read_only: false, can_complete: true }
const preview = { scope_version: 'v1', total_count: 2, completed_count: 0, missing_result_count: 1, completed: false, can_complete: true }
const tips = { enabled: false, total_people: 2, rated_people: 1, rules: [], lines: [] }
const blockedTips = { ...tips, enabled: true, rules: [{ assessment_item_id: 'grade', assessment_label: '绩效评级', conditions: [{ control_mode: 'HARD' as const, grades: ['优秀'], operator: 'LTE' as const, value: 25, unit: 'PERCENT' as const, rounding: 'ROUND' as const, target_people: 0, current_people: 1, diff: 1, violated: true }] }] }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(performanceCalibrationApi.preview).mockResolvedValue(preview)
  vi.mocked(performanceCalibrationApi.distribution).mockResolvedValue(tips)
  vi.spyOn(performanceWorkbenchApi, 'taskDistributionTips').mockResolvedValue(tips)
})
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })
const mountSingle = () => mount(CalibrationSingleTask, { attachTo: document.body, props: { scope, cycleId: 1 }, global: { stubs: { ProjectMemberListPanel: true } } })
const click = async (text: string) => { const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent?.trim() === text); expect(button).toBeTruthy(); button!.click(); await flushPromises() }
describe('single calibration shares task completion and scoped distribution', () => {
  it('keeps the direct review layout but uses the shared completion component and scoped initial tips', async () => {
    const wrapper = mountSingle(); await flushPromises()
    expect(wrapper.getComponent(PerformanceReviewContent).props()).toMatchObject({ projectId: 2, node: { node_type: 'calibration', phase_id: 'phase', scope_key: 'single' } })
    expect(wrapper.getComponent(CalibrationTaskCompletion).props('scope')).toEqual(scope)
    expect(performanceWorkbenchApi.taskDistributionTips).toHaveBeenCalledWith(2, 'calibration', 'phase', 'single')
    await click('完成校准')
    expect(document.body.textContent).toContain('确定要完成校准嘛')
    expect(document.body.textContent).toContain('有1名员工没有绩效结果')
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce({ ...preview, completed: true })
    await click('确定')
    expect(performanceCalibrationApi.confirm).toHaveBeenCalledWith(scope, 'v1')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    wrapper.unmount()
  })
  it('shows HARD distribution details with only continue-calibration and never confirms', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, can_complete: false, blocked_reason: 'CALIBRATION_DISTRIBUTION_VIOLATED' })
    vi.mocked(performanceCalibrationApi.distribution).mockResolvedValueOnce(blockedTips)
    const wrapper = mountSingle(); await flushPromises(); await click('完成校准')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('不符合强制分布规则，请调整后重新提交')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('绩效评级')
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('当前 1 人')
    expect([...document.querySelectorAll('.calibration-completion__actions button')].map(button => button.textContent?.trim())).toEqual(['继续校准'])
    await click('继续校准')
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('requires re-preview after a version conflict before confirming again', async () => {
    const wrapper = mountSingle(); await flushPromises(); await click('完成校准')
    vi.mocked(performanceCalibrationApi.confirm).mockRejectedValueOnce({ response: { status: 409 } })
    await click('确定')
    expect(wrapper.emitted('completed')).toBeUndefined()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('重新预检')
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, scope_version: 'v2' })
    await click('重新预检')
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce({ ...preview, completed: true })
    await click('确定')
    expect(performanceCalibrationApi.confirm).toHaveBeenLastCalledWith(scope, 'v2')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    wrapper.unmount()
  })
  it('uses unified confirmation without delegated wording or a parent-lock promise', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, has_original_tasks: false })
    const wrapper = mountSingle(); await flushPromises(); await click('完成校准')
    expect(document.body.textContent).toContain('确定要完成校准嘛')
    expect(document.body.textContent).not.toContain('本次仅完成你的授权任务')
    expect(document.body.textContent).not.toContain('锁定该范围终评')
    wrapper.unmount()
  })
  it('shows failed initial tips and retries with the same task scope', async () => {
    vi.mocked(performanceWorkbenchApi.taskDistributionTips).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(blockedTips)
    const wrapper = mountSingle(); await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('分布提示加载失败')
    await click('重试')
    expect(performanceWorkbenchApi.taskDistributionTips).toHaveBeenLastCalledWith(2, 'calibration', 'phase', 'single')
    expect(wrapper.text()).toContain('绩效评级')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    wrapper.unmount()
  })
  it('ignores late tips and preflight when the single task changes', async () => {
    let resolveTips!: (value: typeof blockedTips) => void
    let resolvePreview!: (value: typeof preview) => void
    vi.mocked(performanceWorkbenchApi.taskDistributionTips).mockReturnValueOnce(new Promise(done => { resolveTips = done }))
    vi.mocked(performanceCalibrationApi.preview).mockReturnValueOnce(new Promise(done => { resolvePreview = done }))
    const wrapper = mountSingle(); await click('完成校准')
    await wrapper.setProps({ scope: { ...scope, scope_key: 'new' } }); await flushPromises()
    resolveTips(blockedTips); resolvePreview({ ...preview, completed: true }); await flushPromises()
    expect(performanceWorkbenchApi.taskDistributionTips).toHaveBeenLastCalledWith(2, 'calibration', 'phase', 'new')
    expect(wrapper.text()).not.toContain('绩效评级')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
