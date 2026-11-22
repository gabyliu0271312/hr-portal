import { mount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalibrationTaskCompletion from './CalibrationTaskCompletion.vue'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
vi.mock('@/api/performanceCalibration', () => ({ performanceCalibrationApi: { preview: vi.fn(), distribution: vi.fn(), confirm: vi.fn() } }))
const scope: PerformanceCalibrationTaskScope = { scope_key: 'scope-A', project_id: 8, project_name: '项目A', node_id: 'calibration', node_name: '校准', phase_id: 'phase-1', source_rule_id: 'rule-A', task_number: 1, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 2, can_complete: true, read_only: false }
const preview = { scope_version: 'v1', total_count: 2, completed_count: 0, missing_result_count: 1, can_complete: true, completed: false }
const tips = { enabled: false, total_people: 2, rated_people: 1, rules: [], lines: [] }
const click = async (text: string) => { const button = [...document.querySelectorAll('button')].find(node => node.textContent?.trim() === text); expect(button).toBeTruthy(); button!.click(); await flushPromises() }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(performanceCalibrationApi.preview).mockResolvedValue(preview); vi.mocked(performanceCalibrationApi.distribution).mockResolvedValue(tips) })
afterEach(() => { document.body.innerHTML = '' })
describe('task-scoped calibration completion', () => {
  it('confirms only selected scope with preview version, does not emit on failure, and requires new preview after 409', async () => {
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    expect(document.body.textContent).toContain('1 人尚无校准结果')
    vi.mocked(performanceCalibrationApi.confirm).mockRejectedValueOnce({ response: { status: 409 } })
    await click('确定')
    expect(wrapper.emitted('completed')).toBeUndefined()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('重新预检')
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(performanceCalibrationApi.confirm).toHaveBeenLastCalledWith(scope, 'v1')
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, scope_version: 'v2' })
    await click('重新预检')
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce({ ...preview, completed: true })
    await click('确定')
    expect(performanceCalibrationApi.confirm).toHaveBeenLastCalledWith(scope, 'v2')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    wrapper.unmount()
  })
  it('blocks HARD violation and never sends confirmation, closes without writing', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, can_complete: false, blocked_reason: 'CALIBRATION_DISTRIBUTION_VIOLATED' })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    expect(document.body.textContent).toContain('不符合强制分布规则，请调整后重新提交')
    expect([...document.querySelectorAll('button')].some(button => button.textContent?.trim() === '确定')).toBe(false)
    await click('继续校准')
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('states delegated completion without promising the parent final-review lock', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, has_original_tasks: false })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    expect(document.body.textContent).toContain('本次仅完成你的授权任务，原校准人仍需完成父任务')
    expect(document.body.textContent).not.toContain('锁定该范围终评')
    wrapper.unmount()
  })
  it('permits re-preview when task completion was denied only by distribution', async () => {
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope: { ...scope, can_complete: false, blocked_reason: 'CALIBRATION_DISTRIBUTION_VIOLATED' } } })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    await click('完成校准')
    expect(performanceCalibrationApi.preview).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
  it('ignores previous scope preview while a different task is selected', async () => {
    let resolve: (value: any) => void = () => {}
    vi.mocked(performanceCalibrationApi.preview).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    await wrapper.setProps({ scope: { ...scope, scope_key: 'scope-B', source_rule_id: 'rule-B' } })
    resolve(preview); await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
