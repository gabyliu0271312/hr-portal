import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceOkrApi, performanceReviewApi, projectManagementApi } from '@/api/performance'
import PerformanceReviewEvaluationDrawer from './PerformanceReviewEvaluationDrawer.vue'
import source from './PerformanceReviewEvaluationDrawer.vue?raw'

const task = {
  task_id: 145,
  task_kind: 'evaluation',
  entry_mode: 'template_task' as const,
  node_name: '上级评估',
  deadline_at: '2026-10-03T15:59:00Z',
  submitted_at: '2026-09-22T07:29:00Z',
  editable: true,
  submit_allowed: true,
  person: { employee_no: 'E001', display_name: 'alice.xiao肖惠方', department: '创梦天地集', direct_supervisor_name: 'gaby.liu刘琦' },
  form_schema: [{ id: 'value', name: '价值贡献', fields: [{ id: 'good', type: 'rich_text' as const, label: '做得好的' }] }],
  answers: { good: '11' },
}

afterEach(() => vi.unstubAllGlobals())

describe('PerformanceReviewEvaluationDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
    vi.stubGlobal('innerWidth', 1280)
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue(structuredClone(task))
  })

  it('loads the selected task and renders its readonly template content', async () => {
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', nodeName: '上级评估', person: task.person },
      global: { stubs: { PerformanceTemplateRenderer: { template: '<div class="readonly-template">{{ sections[0]?.name }} {{ answers.good }}</div>', props: ['sections', 'answers', 'mode'] } } },
    })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(145, 'E001')
    expect(document.body.textContent).toContain('alice.xiao肖惠方')
    expect(document.body.textContent).toContain('价值贡献 11')
    expect(document.body.textContent).toContain('你可在 2026-10-03 23:59（GMT+8） 前继续编辑')
    expect(document.body.querySelector('.performance-drawer__panel')?.getAttribute('style')).toContain('width: 1000px')
    expect(document.body.querySelector('[role="separator"]')).not.toBeNull()
    wrapper.unmount()
  })

  it('renders only configured reference tabs and shows unsubmitted reminder action', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task),
      reference_tabs: [{
        key: 'reference-node',
        node_id: 'work-summary-1',
        node_name: '工作总结环节',
        task_id: 201,
        employee_no: 'E001',
        status: 'pending',
        submitted_at: null,
        form_schema: [],
        answers: {},
        can_remind: true,
      }],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', person: task.person },
      global: { stubs: { PerformanceTemplateRenderer: true } },
    })
    await flushPromises()

    expect([...document.body.querySelectorAll('.line-tab')].map(tab => tab.textContent)).toEqual(['上级评估', '工作总结环节'])
    await (document.body.querySelectorAll('.line-tab')[1] as HTMLButtonElement).click()
    expect(document.body.textContent).toContain('暂未提交')
    expect(document.body.querySelector('.performance-reminder-button')).not.toBeNull()
    await (document.body.querySelector('.performance-reminder-button') as HTMLButtonElement).click()
    expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ node_id: 'work-summary-1', task_id: 201 })]])
    wrapper.unmount()
  })

  it('switches readonly OKR and node references using stable keys through controlled tab updates', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task),
      reference_tabs: [
        { key: 'reference-summary', node_id: 'summary', node_name: '工作总结', kind: 'node', task_id: 201, employee_no: 'E001', status: 'pending', submitted_at: null, form_schema: [], answers: {}, can_remind: false },
        { key: 'reference-okr', node_id: '', node_name: 'OKR', kind: 'okr', task_id: 145, employee_no: 'E001', status: 'not_started', submitted_at: null, form_schema: [], answers: {}, can_remind: false },
      ],
    })
    const fetchOkr = vi.spyOn(performanceOkrApi, 'taskOkr').mockResolvedValue({ enabled: true, employee_no: 'E001', okr: null })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, taskId: 145, employeeNo: 'E001' } })
    await flushPromises()
    const clickTab = async (label: string) => {
      const tab = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.performance-drawer .line-tab')).find(button => button.textContent === label)!
      tab.click()
      await flushPromises()
      const value = wrapper.emitted('update:activeTab')!.at(-1)![0] as string
      await wrapper.setProps({ activeTab: value || 'evaluation' })
      await flushPromises()
      expect(tab.getAttribute('aria-selected')).toBe('true')
      return value
    }
    expect(await clickTab('OKR')).toBe('reference-okr')
    expect(document.body.querySelector('.okr-card')).not.toBeNull()
    expect(fetchOkr).toHaveBeenCalledWith(145)
    expect(await clickTab('工作总结')).toBe('reference-summary')
    expect(document.body.textContent).toContain('暂未提交')
    expect(await clickTab('上级评估')).toBe('evaluation')
    expect(await clickTab('OKR')).toBe('reference-okr')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(document.body.querySelector('.okr-card')).not.toBeNull()
    await wrapper.setProps({ activeTab: 'summary' })
    await flushPromises()
    expect(document.body.textContent).toContain('暂未提交')
    wrapper.unmount()
  })

  it('loads management periods through the supplied loader and switches OKR without using handler task APIs', async () => {
    const fetchOkr = vi.spyOn(performanceOkrApi, 'taskOkr')
    const periods = ['本期', '上期'].map((label, index) => ({ source: 'feishu', okr_id: `okr-${index}`, period_id: `period-${index}`, period_label: label, objectives: [{ id: `o-${index}`, content: `${label}管理目标`, key_results: [] }] }))
    const detailLoader = vi.fn().mockResolvedValue({ ...task, task_id: null, editable: false, submit_allowed: false, opened_at: '2026-09-22T07:29:00Z', management_tabs: [
      { key: 'management-final', node_id: 'final', node_name: '上级评估', kind: 'node', status: 'completed', employee_no: 'E001', can_remind: false, form_schema: task.form_schema, answers: { good: '管理只读答案' } },
      { key: 'management-okr', node_id: '', node_name: 'OKR', kind: 'okr', task_id: null, status: 'completed', employee_no: 'E001', can_remind: false, form_schema: [], answers: {}, okr: periods[0], okrs: periods },
    ], default_active_tab: 'management-final' })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', readonly: true, detailLoader } })
    await flushPromises()
    expect(detailLoader).toHaveBeenCalledTimes(1)
    expect(performanceReviewApi.templateTask).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('管理只读答案')
    expect(document.body.textContent).toContain('本次绩效结果已于')
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    ;(document.body.querySelectorAll('.performance-drawer .line-tab')[1] as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.emitted('update:activeTab')).toContainEqual(['management-okr'])
    expect(document.body.querySelector('.okr-card')).not.toBeNull()
    expect(document.body.textContent).toContain('本期管理目标')
    const selector = document.body.querySelector<HTMLSelectElement>('.okr-card select')!
    expect(Array.from(selector.options).map(option => option.text)).toEqual(['本期', '上期'])
    selector.value = '1'
    selector.dispatchEvent(new Event('change', { bubbles: true }))
    await flushPromises()
    expect(document.body.textContent).toContain('上期管理目标')
    expect(document.body.textContent).not.toContain('本期管理目标')
    expect(fetchOkr).not.toHaveBeenCalled()
    expect(detailLoader).toHaveBeenCalledTimes(1)
    expect(performanceReviewApi.templateTask).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('displays a denied task as an error without leaking list profile data', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockRejectedValueOnce(new Error('TASK_NOT_FOUND'))
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', activeTab: 'reference-hidden', person: { employee_no: 'E001', display_name: '不可回退的列表姓名' } },
    })
    await flushPromises()
    expect(document.body.textContent).toContain('评估内容加载失败')
    expect(document.body.textContent).not.toContain('不可回退的列表姓名')
    expect(document.body.querySelector('.performance-template-renderer')).toBeNull()
    wrapper.unmount()
  })

  it('ignores a previous member response when switching tasks during loading', async () => {
    let first: (value: typeof task) => void = () => {}
    vi.mocked(performanceReviewApi.templateTask).mockImplementationOnce(() => new Promise(resolve => { first = resolve }))
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValueOnce({ ...structuredClone(task), task_id: 146, person: { employee_no: 'E002', display_name: '当前员工' } })
    await wrapper.setProps({ taskId: 146, employeeNo: 'E002' })
    await flushPromises()
    first(structuredClone(task))
    await flushPromises()
    expect(document.body.textContent).toContain('当前员工')
    expect(document.body.textContent).not.toContain('alice.xiao肖惠方')
    wrapper.unmount()
  })

  it('returns the same task to the edit action and closes without a mask', async () => {
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', person: task.person },
      global: { stubs: { PerformanceTemplateRenderer: true } },
    })
    await flushPromises()

    await (document.body.querySelector('.performance-review-completion-notice__edit') as HTMLButtonElement).click()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 145, employee_no: 'E001' }]])

    expect(document.body.querySelector('.performance-drawer__mask')).toBeNull()
    ;(document.body.querySelector('.performance-drawer__close') as HTMLElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
    wrapper.unmount()
  })
  it('fills the available body height through scoped flex containers rather than a fixed card minimum', () => {
    expect(source).toContain(':deep(.line-tabs){min-height:100%;flex:1 0 auto}')
    expect(source).toContain(':deep(.line-tabs-content),.performance-review-evaluation-drawer__scroll :deep(.line-tabs-pane){display:flex;min-height:0;flex:1 0 auto;flex-direction:column}')
    expect(source).toContain('__tab-content{display:flex;min-height:0;flex:1 0 auto;flex-direction:column;')
    expect(source).toContain('__card{flex:1 0 auto;padding:12px 20px;')
    expect(source).toContain('padding:12px 20px 0!important')
    expect(source).toContain(':deep(.line-tabs.sticky .line-tabs-holder){top:0}')
    expect(source).toContain(':deep(.performance-reference-content){min-height:0}')
    expect(source).not.toContain('padding:12px 20px 32px')
  })

  it('renders the empty stage with fill action and emits edit for the pending task', async () => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      task_id: null,
      editable: false,
      submit_allowed: false,
      node_name: '自评',
      management_tabs: [{ key: 'management-summary', node_id: 'summary', node_name: '自评', kind: 'node', status: 'pending', task_id: 12, task_kind: 'work_summary', employee_no: 'E001', can_remind: false, submitted_at: null, deadline_at: null, form_schema: [], answers: {} }],
      default_active_tab: 'management-summary',
      stage_views: [{ node_id: 'summary', node_type: 'work_summary', node_name: '自评', key: 'management-summary', status: 'pending', task_id: 12, task_kind: 'work_summary', deadline_at: null, submitted_at: null, empty: false, can_fill: true, reminder_target: null, anonymous: false }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    expect(document.body.textContent).toContain('暂未提交')
    const fill = document.body.querySelector<HTMLButtonElement>('.performance-stage-empty__fill')!
    expect(fill).not.toBeNull()
    fill.click()
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 12, employee_no: 'E001', node_id: 'summary' }]])
    wrapper.unmount()
  })

  it('opens the remind confirm with preview link and loads the bot card preview on hover', async () => {
    const preview = { title: '绩效任务提醒', description: '请尽快前往绩效系统为@rita.tang唐洁完成自评。', stage_label: '自评', deadline_at: '2026-11-21T23:59:00Z', cycle_name: '测试绩效', cycle_start_at: '2026-01-01T00:00:00Z', cycle_end_at: '2026-12-31T23:59:00Z', reminder_name: 'gaby.liu刘琦', stage_type: '自评' }
    vi.spyOn(projectManagementApi, 'memberReminderPreview').mockResolvedValue(preview)
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      task_id: null,
      editable: false,
      submit_allowed: false,
      node_name: '自评',
      management_tabs: [{ key: 'management-summary', node_id: 'summary', node_name: '自评', kind: 'node', status: 'pending', task_id: 12, task_kind: 'work_summary', employee_no: 'E001', can_remind: false, submitted_at: null, deadline_at: null, form_schema: [], answers: {} }],
      default_active_tab: 'management-summary',
      stage_views: [{ node_id: 'summary', node_type: 'work_summary', node_name: '自评', key: 'management-summary', status: 'pending', task_id: 12, task_kind: 'work_summary', deadline_at: null, submitted_at: null, empty: false, can_fill: false, reminder_target: 'rita.tang唐洁', anonymous: false }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    const remind = document.body.querySelector<HTMLButtonElement>('.performance-stage-empty__remind')!
    expect(remind).not.toBeNull()
    remind.click()
    await flushPromises()
    expect(document.body.textContent).toContain('确定催办后，会立即向rita.tang唐洁发送飞书通知')
    const previewLink = document.body.querySelector<HTMLAnchorElement>('.performance-remind-preview-link')!
    expect(previewLink).not.toBeNull()
    previewLink.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    expect(projectManagementApi.memberReminderPreview).toHaveBeenCalledWith(1, 'E001', 'summary', 12)
    expect(document.body.textContent).toContain('飞书推送')
    expect(document.body.textContent).toContain('请尽快前往绩效系统为')
    expect(document.body.textContent).toContain('截止时间：')
    expect(document.body.textContent).toContain('评估周期：测试绩效')
    expect(document.body.textContent).toContain('周期范围：')
    expect(document.body.textContent).toContain('前往飞书绩效')
    const action = document.body.querySelector<HTMLButtonElement>('.reminder-preview-card__action')!
    expect(action).not.toBeNull()
    expect(action.tagName).toBe('BUTTON')
    expect(action.hasAttribute('href')).toBe(false)
    wrapper.unmount()
  })

  it('sends the member remind and surfaces the delivery result', async () => {    vi.spyOn(projectManagementApi, 'memberRemind').mockResolvedValue({ delivery_status: 'success', accepted_task_ids: [12], skipped_task_ids: [], failed_task_ids: [] } as any)
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      task_id: null,
      editable: false,
      submit_allowed: false,
      node_name: '自评',
      management_tabs: [{ key: 'management-summary', node_id: 'summary', node_name: '自评', kind: 'node', status: 'pending', task_id: 12, task_kind: 'work_summary', employee_no: 'E001', can_remind: false, submitted_at: null, deadline_at: null, form_schema: [], answers: {} }],
      default_active_tab: 'management-summary',
      stage_views: [{ node_id: 'summary', node_type: 'work_summary', node_name: '自评', key: 'management-summary', status: 'pending', task_id: 12, task_kind: 'work_summary', deadline_at: null, submitted_at: null, empty: false, can_fill: false, reminder_target: 'rita.tang唐洁', anonymous: false }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    ;(document.body.querySelector<HTMLButtonElement>('.performance-stage-empty__remind')!).click()
    await flushPromises()
    const dialog = document.body.querySelector('.performance-confirm-dialog--submit')!
    const confirm = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === '确定')!
    confirm.click()
    await flushPromises()
    expect(projectManagementApi.memberRemind).toHaveBeenCalledWith(1, 'E001', 'summary', 12)
    wrapper.unmount()
  })

  it('renders the anonymous 360 stage as fill when the actor is its handler', async () => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      task_id: null,
      editable: false,
      submit_allowed: false,
      node_name: '360°反馈',
      management_tabs: [{ key: 'management-feedback', node_id: 'feedback', node_name: '360°反馈', kind: 'node', status: 'pending', task_id: null, task_kind: 'evaluation', employee_no: 'E001', can_remind: false, submitted_at: null, deadline_at: null, form_schema: [], answers: {} }],
      default_active_tab: 'management-feedback',
      stage_views: [{ node_id: 'feedback', node_type: 'evaluation', node_name: '360°反馈', key: 'management-feedback', status: 'pending', task_id: 40, task_kind: 'evaluation', deadline_at: null, submitted_at: null, empty: false, can_fill: true, reminder_target: null, anonymous: true }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    expect(document.body.textContent).toContain('暂未提交')
    const fill = document.body.querySelector<HTMLButtonElement>('.performance-stage-empty__fill')!
    expect(fill).not.toBeNull()
    fill.click()
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 40, employee_no: 'E001', node_id: 'feedback' }]])
    wrapper.unmount()
  })

})
