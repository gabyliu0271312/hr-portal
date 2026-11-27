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
    expect(document.body.textContent).toContain('有1名员工没有绩效结果')
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
  it('uses unified confirmation without delegated wording or a parent-lock promise', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, has_original_tasks: false })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    expect(document.body.textContent).toContain('确定要完成校准嘛')
    expect(document.body.textContent).not.toContain('本次仅完成你的授权任务')
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
  it('allows an overdue task to inspect a HARD violation without allowing a completion write', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, can_complete: false, blocked_reason: 'SUBMISSION_NOT_ALLOWED' })
    vi.mocked(performanceCalibrationApi.distribution).mockResolvedValueOnce({ ...tips, enabled: true, rules: [{ assessment_item_id: 'grade', assessment_label: '绩效评级', conditions: [{ control_mode: 'HARD', grades: ['优秀'], operator: 'LTE', value: 25, unit: 'PERCENT', rounding: 'ROUND', target_people: 0, current_people: 1, diff: 1, violated: true }] }] })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope: { ...scope, status: 'overdue', can_complete: false } } })
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
    await click('完成校准')
    expect(document.body.textContent).toContain('不符合强制分布规则，请调整后重新提交')
    const footer = document.querySelector('.calibration-completion__actions')!
    expect([...footer.querySelectorAll('button')].map(button => button.textContent?.trim())).toEqual(['继续校准'])
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    await click('继续校准')
    wrapper.unmount()
  })
  it('keeps a writable-looking entry from bypassing a server-side window rejection', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, can_complete: false, blocked_reason: 'SUBMISSION_NOT_ALLOWED' })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope: { ...scope, can_complete: false } } })
    await click('完成校准')
    expect(document.body.textContent).toContain('当前任务不允许完成')
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '确定')!
    expect(confirm.disabled).toBe(true)
    confirm.click(); await flushPromises()
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('does not report completion when confirmation returns an incomplete task', async () => {
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce(preview)
    await click('确定')
    expect(wrapper.emitted('completed')).toBeUndefined()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('任务尚未完成，请重新预检')
    expect(document.querySelector('.calibration-completion__actions')?.textContent).toContain('重新预检')
    wrapper.unmount()
  })
  it('allows a SOFT violation to confirm and invalidates preview when the same scope is refreshed', async () => {
    vi.mocked(performanceCalibrationApi.distribution).mockResolvedValueOnce({ ...tips, enabled: true, rules: [{ assessment_item_id: 'grade', assessment_label: '绩效评级', conditions: [{ control_mode: 'SOFT', grades: ['优秀'], operator: 'LTE', value: 25, unit: 'PERCENT', rounding: 'ROUND', target_people: 0, current_people: 1, diff: 1, violated: true }] }] })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('确定要完成校准嘛')
    expect(dialog.textContent).toContain('有1名员工没有绩效结果')
    expect(dialog.textContent).toContain('建议分布')
    expect(dialog.textContent).toContain('不符合')
    expect(dialog.textContent).toContain('需小于等于 0 人，当前 1 人，需减少 1人')
    const confirm = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '确定')!
    expect(confirm.disabled).toBe(false)
    await wrapper.setProps({ scope: { ...scope, read_only: true } }); await flushPromises()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('shows the same plain confirmation for original and delegated tasks with no missing results', async () => {
    for (const hasOriginalTasks of [true, false]) {
      vi.mocked(performanceCalibrationApi.preview).mockResolvedValueOnce({ ...preview, missing_result_count: 0, has_original_tasks: hasOriginalTasks })
      const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
      await click('完成校准')
      const dialog = document.querySelector('[role="dialog"]')!
      expect(dialog.textContent).toContain('确定要完成校准嘛')
      expect(dialog.textContent).not.toContain('没有绩效结果')
      expect(dialog.textContent).not.toContain('授权任务')
      expect(dialog.querySelector('.performance-distribution-tips')).toBeNull()
      await click('取消')
      expect(performanceCalibrationApi.confirm).not.toHaveBeenCalled()
      wrapper.unmount()
    }
  })
  it('reuses page distribution details for SOFT violations and still completes the selected task', async () => {
    vi.mocked(performanceCalibrationApi.distribution).mockResolvedValueOnce({ ...tips, enabled: true, rules: [{ assessment_item_id: 'grade', assessment_label: '绩效评级', conditions: [{ control_mode: 'SOFT', grades: ['优秀'], operator: 'GTE', value: 2, unit: 'PEOPLE', rounding: 'ROUND', target_people: 2, current_people: 1, diff: -1, violated: true }] }] })
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce({ ...preview, completed: true })
    const wrapper = mount(CalibrationTaskCompletion, { attachTo: document.body, props: { scope } })
    await click('完成校准')
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('需大于等于 2 人，当前 1 人，需增加 1人')
    expect([...dialog.querySelectorAll('.calibration-completion__actions button')].map(button => button.textContent?.trim())).toEqual(['取消', '确定'])
    await click('确定')
    expect(performanceCalibrationApi.confirm).toHaveBeenCalledWith(scope, 'v1')
    expect(wrapper.emitted('completed')).toHaveLength(1)
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
