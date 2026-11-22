import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import CalibrationSingleTask from './CalibrationSingleTask.vue'
import PerformanceReviewContent from '../PerformanceReviewContent.vue'
import { performanceCalibrationApi, type PerformanceCalibrationTaskScope } from '@/api/performanceCalibration'
vi.mock('@/api/performanceCalibration', async original => ({ ...await original<typeof import('@/api/performanceCalibration')>(), performanceCalibrationApi: { preview: vi.fn(), confirm: vi.fn() } }))
const scope: PerformanceCalibrationTaskScope = { scope_key: 'single', project_id: 2, project_name: '项目', node_id: 'calibration', node_name: '绩效校准', phase_id: 'phase', source_rule_id: 'rule', task_number: 1, scope_label: '项目全员', rule: null, status: 'pending', start_at: null, end_at: null, member_count: 2, read_only: false, can_complete: true }
const preview = { scope_version: 'v1', total_count: 2, completed_count: 0, missing_result_count: 1, completed: false, can_complete: true }
beforeEach(() => { vi.clearAllMocks(); vi.mocked(performanceCalibrationApi.preview).mockResolvedValue(preview) })
afterEach(() => { document.body.innerHTML = '' })
const mountSingle = () => mount(CalibrationSingleTask, { attachTo: document.body, props: { scope, cycleId: 1 }, global: { stubs: { PerformanceReviewContent: { props: ['node', 'projectId', 'memberPreferenceScope'], template: '<section><slot name="heading-actions" /></section>' } } } })
describe('single calibration preserves existing interaction', () => {
  it('uses the original review content and confirmation while submitting only its scope', async () => {
    const wrapper = mountSingle(); await flushPromises()
    expect(wrapper.getComponent(PerformanceReviewContent).props()).toMatchObject({ projectId: 2, node: { node_type: 'calibration', phase_id: 'phase' } })
    await wrapper.find('button').trigger('click'); await flushPromises()
    expect(document.body.textContent).toContain('确定要完成校准吗？')
    expect(document.body.textContent).toContain('1 名被评估人尚无绩效结果')
    vi.mocked(performanceCalibrationApi.confirm).mockResolvedValueOnce({ ...preview, completed: true })
    document.querySelector<HTMLButtonElement>('.performance-confirm-dialog--calibration-completion .performance-button--primary')!.click(); await flushPromises()
    expect(performanceCalibrationApi.confirm).toHaveBeenCalledWith(scope, 'v1')
    expect(wrapper.emitted('completed')).toHaveLength(1)
    wrapper.unmount()
  })
  it('retains delegated wording without claiming that delegated completion locks the parent', async () => {
    vi.mocked(performanceCalibrationApi.preview).mockResolvedValue({ ...preview, has_original_tasks: false })
    const wrapper = mountSingle(); await flushPromises(); await wrapper.find('button').trigger('click'); await flushPromises()
    expect(document.body.textContent).toContain('本次仅完成你的授权任务')
    expect(document.body.textContent).not.toContain('终评结果将无法修改')
    wrapper.unmount()
  })
  it('ignores old scope preflight when the single task changes', async () => {
    let resolve!: (value: typeof preview) => void
    vi.mocked(performanceCalibrationApi.preview).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountSingle()
    await wrapper.setProps({ scope: { ...scope, scope_key: 'new' } }); await flushPromises()
    resolve({ ...preview, completed: true }); await flushPromises()
    expect(wrapper.text()).toContain('完成校准')
    expect(wrapper.text()).not.toContain('已完成校准')
    wrapper.unmount()
  })
})
