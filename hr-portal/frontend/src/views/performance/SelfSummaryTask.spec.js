import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SelfSummaryTask from './SelfSummaryTask.vue'
import PerformanceRichTextEditor from '@/components/performance/PerformanceRichTextEditor.vue'
import PerformanceTagRichTextInput from '@/components/performance/PerformanceTagRichTextInput.vue'
import PerformanceWriteModeSwitch from '@/components/performance/PerformanceWriteModeSwitch.vue'
import PerformanceTemplateRenderer from '@/components/performance/PerformanceTemplateRenderer.vue'
import { performanceReviewApi } from '@/api/performance'
import { api } from '@/api/client'
import { clearEmployeeSwitch, employeeSwitchSession, employeeSwitchNotice, setEmployeeSwitch } from '@/stores/identitySwitch'
import { useRoute, useRouter } from 'vue-router'

enableAutoUnmount(afterEach)

const back = vi.fn()
const push = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: vi.fn(() => ({ query: { task_id: 'task-1' } })),
  useRouter: vi.fn(() => ({ back, push })),
}))

const task = {
  task_id: 'task-1',
  node_name: '模板维护的总结名称',
  person: { employee_no: 'E001', display_name: '刘琦', department: '产品中心', direct_supervisor_name: '刘芝萍' },
  editable: true,
  submit_allowed: true,
  version: 1,
  form_schema: [
    { id: 'text-section', name: '文本型填写题', description: '描述', fields: [{ id: 'text', type: 'rich_text', label: '填写题名称', required: false, placeholder: '提示' }] },
    { id: 'work-section', name: '工作总结', description: '描述', fields: [{ id: 'work', type: 'rich_text', label: '填写题名称', required: true, placeholder: '提示' }] },
    { id: 'rating-section', name: '评分评级', description: '描述', fields: [{ id: 'rating', type: 'rating', label: '绩效评级', required: true, options: [{ id: 'one', label: '1星', color: '#f54a45' }, { id: 'five', label: '5星', color: '#3370ff' }] }] },
    { id: 'tag-section', name: '标签型填写题', description: '描述', fields: [{ id: 'value', type: 'tag_with_followup', label: '价值贡献', required: true, options: [{ id: 'good', label: '做得好的', placeholder: '填写亮点', required: true }, { id: 'improve', label: '待改进的' }], placeholder: '勾选标签后填写' }] },
  ],
  answers: {},
}

describe('SelfSummaryTask', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    back.mockReset()
    push.mockReset()
    Element.prototype.scrollIntoView = vi.fn()
    localStorage.clear()
    localStorage.setItem('userMode', 'fullScreenMode')
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(structuredClone(task))
    vi.spyOn(performanceReviewApi, 'saveSelfSummaryDraft').mockResolvedValue({ answers: {}, version: 2 })
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ answers: {}, version: 3, submitted_at: '2026-09-11T00:00:00Z', editable: true, submit_allowed: true })
  })

  it('renders configured reference tabs and reminder action for an unsubmitted reference task', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({
      ...structuredClone(task),
      reference_tabs: [{
        key: 'reference-node',
        node_id: 'evaluation-1',
        node_name: '上级评估',
        task_id: 77,
        employee_no: 'E001',
        status: 'pending',
        submitted_at: null,
        form_schema: [],
        answers: {},
        can_remind: true,
      }],
    })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.findAll('.split-single-tabs .summary-tabs button').map(button => button.text())).toEqual(['模板维护的总结名称', '上级评估'])
    await wrapper.findAll('.split-single-tabs .summary-tabs button')[1].trigger('click')
    expect(wrapper.text()).toContain('暂未提交')
    expect(wrapper.find('.performance-reminder-button').exists()).toBe(true)
    await wrapper.get('.performance-reminder-button').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceReminderPlaceholder', query: { project_id: '', node_id: 'evaluation-1', task_id: '77', employee_no: 'E001' } })
  })

  it.each([undefined, { tags: [], notes: {} }])('applies default tags only to missing editable answers: %o', async value => {
    const loaded = structuredClone(task)
    loaded.form_schema = [{ id: 'tags', name: '标签', fields: [{ id: 'value', type: 'tag_with_followup', label: '默认标签', default_all: true, options: [{ id: 'good', label: '亮点' }] }] }]
    if (value !== undefined) loaded.answers.value = value
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue(loaded)
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.tag-options input').element.checked).toBe(value === undefined)
    wrapper.unmount()
  })

  it('renders server-projected readonly tags without defaults or required validation', async () => {
    const loaded = structuredClone(task)
    loaded.form_schema = [{ id: 'tags', name: '已提交填写结果', fields: [{ id: 'value', type: 'tag_with_followup', label: '查看题', readonly: true, required: true, default_all: true, options: [{ id: 'good', label: '亮点', required: true }] }] }]
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue(loaded)
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.find('.tag-options').exists()).toBe(false)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.find('.template-field-label em').exists()).toBe(false)
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalled()
    expect(vi.mocked(performanceReviewApi.submitSelfSummary).mock.calls[0][1]).toEqual({})
    wrapper.unmount()
  })

  it('keeps server-supplied readonly answers visible without submitting them back', async () => {
    const loaded = structuredClone(task)
    loaded.form_schema = [{ id: 'source', name: '已提交结果', fields: [{ id: 'value', type: 'tag_with_followup', label: '查看题', readonly: true, options: [{ id: 'good', label: '亮点' }] }] }]
    loaded.answers = { value: { tags: ['good'], notes: { good: '<p>来源只读答案</p>' } }, hidden: '不应提交的旧字段' }
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue(loaded)
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.readonly-tag-panel').text()).toContain('来源只读答案')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(vi.mocked(performanceReviewApi.submitSelfSummary).mock.calls[0][1]).toEqual({})
    wrapper.unmount()
  })

  it('does not invent default tag answers for a noneditable task', async () => {
    const loaded = structuredClone(task)
    loaded.editable = false
    loaded.form_schema[3].fields[0].default_all = true
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue(loaded)
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.findAll('.tag-options input').every(input => !input.element.checked)).toBe(true)
    wrapper.unmount()
  })

  it('loads an evaluation task through the generic template task endpoint', async () => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'evaluation', entry_mode: 'template_task', node_name: '上级评估' })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith('task-1')
    expect(performanceReviewApi.selfSummary).not.toHaveBeenCalled()
    expect(wrapper.get('.summary-tabs .active').text()).toBe('上级评估')
  })

  it('carries calibration source answers through editing, submits only writable fields and shows trusted saved values', async () => {
    const loaded = {
      ...structuredClone(task), task_kind: 'calibration', node_name: '校准', project_id: 1, node_id: 'calibration', return_view: 'drawer',
      calibration_notice: '绩效校准人修改评估内容后会产生修改记录',
      form_schema: [{ id: 'result', name: '终评内容', fields: [
        { id: 'locked', type: 'rich_text', label: '不可调整', readonly: true },
        { id: 'editable', type: 'rich_text', label: '可调整' },
      ] }],
      answers: { locked: '<p>终评只读原值</p>', editable: '<p>终评可调原值</p>' },
    }
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue(loaded)
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockResolvedValue({ answers: { locked: '<p>服务器保留的可信值</p>', editable: '<p>校准调整</p>' }, version: 2, submitted_at: '2026-11-10T00:00:00Z', editable: true, submit_allowed: true })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    expect(wrapper.get('[data-field-id="locked"]').text()).toContain('终评只读原值')
    expect(wrapper.find('[data-field-id="locked"] [contenteditable="true"]').exists()).toBe(false)
    const input = wrapper.get('[data-field-id="editable"] .rich-input')
    expect(input.element.innerHTML).toContain('终评可调原值')
    input.element.innerHTML = '<p>校准调整</p>'
    await input.trigger('input')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('task-1', { editable: expect.stringContaining('校准调整') }, 1)
    expect(wrapper.text()).toContain('服务器保留的可信值')
    expect(wrapper.text()).toContain('校准调整')
    expect(wrapper.get('.task-form-shell .task-notices--calibration').text()).toContain('修改记录')
    expect(push).toHaveBeenCalledWith({ path: '/performance/review', query: expect.objectContaining({ rootReviewId: 'task-1', activeTab: 'calibration', node: 'calibration' }) })
    wrapper.unmount()
  })

  it.each([
    ['CALIBRATION_SOURCE_CONFLICT', '存在不一致的结果'],
    ['CALIBRATION_SOURCE_NOT_READY', '尚未全部提交'],
  ])('blocks calibration editing with a readable source failure: %s', async (code, message) => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockRejectedValue({ response: { data: { detail: code } } })
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask')
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    expect(wrapper.get('.state.error').text()).toContain(message)
    expect(wrapper.get('.summary-tabs .active').text()).toBe('加载失败')
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(submit).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('reconsideration task shows keep/change radio and hides result content on keep, submitting keep_result (REA 联动)', async () => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({
      ...structuredClone(task), task_kind: 'result_reconsideration', entry_mode: 'template_task', node_name: '结果复议处理',
      reconsideration_reason: '对评级有异议',
      show_result_and_modify: true, keep_result: 'change',
      form_schema: [{ id: 'recon', name: '复议处理结果', fields: [{ id: 'feedback', type: 'rich_text', label: '反馈说明', required: true }] }],
    })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    // 复议理由 + 单选项 + 绩效结果内容链均渲染
    expect(wrapper.get('.task-form-shell .reconsideration-reason').text()).toBe('对评级有异议')
    expect(wrapper.get('.reconsideration-choice-label').text()).toBe('是否保持复议前结果')
    expect(wrapper.findAll('.reconsideration-choice .performance-single-select__option')).toHaveLength(2)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(true)
    // 切换到「保持原结果」→ 内容链隐藏，显示保持提示
    await wrapper.get('.reconsideration-choice input[value="keep"]').setValue(true)
    await flushPromises()
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('已保持复议前结果')
    expect(wrapper.find('.task-content > .state').exists()).toBe(false)
    // 切回「变更结果」→ 内容链恢复；提交时携带 keep_result=change
    await wrapper.get('.reconsideration-choice input[value="change"]').setValue(true)
    await flushPromises()
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('autosaves choice-only changes without sending hidden required results and restores draft choice on reopen', async () => {
    vi.useFakeTimers()
    const loaded = { ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '<p>有效理由</p><script>bad()</script><img src=x onerror=bad()>', keep_result: 'change', answers: {}, has_draft: false }
    vi.spyOn(performanceReviewApi, 'templateTask').mockImplementation(async () => structuredClone(loaded))
    const save = vi.spyOn(performanceReviewApi, 'saveTemplateTaskDraft').mockImplementation(async (_id, values) => { loaded.has_draft = true; loaded.draft_answers = values; loaded.keep_result = values.keep_result; return { version: 2 } })
    let wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    try {
      await flushPromises()
      expect(wrapper.get('.reconsideration-reason').html()).not.toMatch(/script|onerror|<img/)
      expect(wrapper.get('.reconsideration-reason').text()).toBe('有效理由')
      await vi.advanceTimersByTimeAsync(400)
      expect(save).not.toHaveBeenCalled()
      await wrapper.get('.reconsideration-choice input[value="keep"]').setValue(true)
      await vi.advanceTimersByTimeAsync(350)
      expect(save).toHaveBeenCalledWith('task-1', { keep_result: 'keep' }, 1)
      wrapper.unmount()
      wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
      await flushPromises()
      expect(wrapper.get('.reconsideration-choice input[value="keep"]').element.checked).toBe(true)
      expect(wrapper.find('.reconsideration-result').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(400)
      expect(save).toHaveBeenCalledTimes(1)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('retains a changed result draft while keep is selected and restores both on reopen', async () => {
    vi.useFakeTimers()
    const loaded = { ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', keep_result: 'change', has_draft: false, form_schema: [{ id: 'c', name: '结果', fields: [{ id: 'text', type: 'rich_text', label: '结果说明' }] }], answers: {} }
    vi.spyOn(performanceReviewApi, 'templateTask').mockImplementation(async () => structuredClone(loaded))
    const save = vi.spyOn(performanceReviewApi, 'saveTemplateTaskDraft').mockImplementation(async (_id, values) => { loaded.has_draft = true; loaded.draft_answers = values; loaded.keep_result = values.keep_result; return { version: 2 } })
    let wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    try {
      await flushPromises()
      const input = wrapper.get('[data-field-id="text"] .rich-input')
      input.element.innerHTML = '切换后保留的草稿'
      await input.trigger('input')
      await wrapper.get('.reconsideration-choice input[value="keep"]').setValue(true)
      await vi.advanceTimersByTimeAsync(350)
      expect(save).toHaveBeenCalledWith('task-1', { text: expect.stringContaining('切换后保留的草稿'), keep_result: 'keep' }, 1)
      wrapper.unmount()
      wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
      await flushPromises()
      await wrapper.get('.reconsideration-choice input[value="change"]').setValue(true)
      expect(wrapper.get('[data-field-id="text"] .rich-input').text()).toContain('切换后保留的草稿')
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('restores formal choice rather than the top-level draft choice when discarding draft', async () => {
    const loaded = { ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', keep_result: 'keep', has_draft: true, draft_answers: { keep_result: 'keep', work: '弃用草稿' }, answers: { keep_result: 'change', work: '正式答案' } }
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue(loaded)
    vi.mocked(useRoute).mockReturnValue({ query: { task_id: 'task-1', draft_choice: 'discard' } })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    try {
      await flushPromises()
      expect(wrapper.get('.reconsideration-choice input[value="change"]').element.checked).toBe(true)
      expect(wrapper.get('[data-field-id="work"] .rich-input').text()).toContain('正式答案')
      expect(wrapper.text()).not.toContain('弃用草稿')
    } finally { wrapper.unmount(); vi.mocked(useRoute).mockReturnValue({ query: { task_id: 'task-1' } }) }
  })

  it.each(['rating', 'single_select', 'tag_with_followup'])('rejects out-of-template %s answers for reconsideration', async type => {
    const value = type === 'tag_with_followup' ? { tags: ['forged'], notes: {} } : 'forged'
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', form_schema: [{ id: 'c', name: '结果', fields: [{ id: 'choice', type, label: '模板结果', options: [{ id: 'valid', label: '有效选项' }] }] }], answers: { choice: value } })
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask')
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    expect(submit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('请选择模板配置的有效')
    wrapper.unmount()
  })

  it.each([true, false])('submits keep without validating or sending hidden result fields, show=%s', async show => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', show_result_and_modify: show, keep_result: 'change', answers: { work: '不应回写的字段' } })
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockResolvedValue({ answers: { keep_result: 'keep' }, version: 2, submitted_at: '2026-11-10T00:00:00Z', editable: false, submit_allowed: false })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    if (show) await wrapper.get('.reconsideration-choice input[value="keep"]').setValue(true)
    else expect(wrapper.find('.reconsideration-choice').exists()).toBe(false)
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('task-1', { keep_result: 'keep' }, 1)
    expect(wrapper.find('.performance-review-completion-notice').exists()).toBe(false)
    expect(wrapper.find('[aria-label="编辑已提交内容"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('继续编辑')
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    expect(wrapper.findAll('.reconsideration-choice input').every(input => input.element.disabled)).toBe(true)
    expect(push).toHaveBeenCalledWith({ path: '/performance/review', query: { project_id: '', node: '' } })
    wrapper.unmount()
  })

  it.each(['keep', 'change'])('returns submitted reconsideration to its project/cycle members list, decision=%s', async decision => {
    vi.mocked(useRoute).mockReturnValue({ path: '/performance/review/template-task', query: { task_id: '8', project_id: '3', node: 'appeal', cycle_id: '2', employee_no: 'E001', view: undefined } })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_id: 8, project_id: 3, node_id: 'appeal', task_kind: 'result_reconsideration', return_view: 'page', reconsideration_reason: '理由', keep_result: decision, form_schema: [], answers: {} })
    vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockResolvedValue({ answers: { keep_result: decision }, submitted_at: '2026-11-10T00:00:00Z', editable: false, submit_allowed: false })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(push).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith({ path: '/performance/review', query: { project_id: '3', node: 'appeal', cycle_id: '2' } })
    wrapper.unmount()
  })

  it('keeps failed reconsideration in the editing workspace without navigating', async () => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', return_view: 'page', reconsideration_reason: '理由', keep_result: 'keep', form_schema: [], answers: {} })
    vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockRejectedValue(new Error('offline'))
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.get('.self-summary-footer').text()).toContain('提交失败')
    expect(wrapper.get('.reconsideration-choice input[value="keep"]').element.checked).toBe(true)
    wrapper.unmount()
  })

  it('validates change results and after success renders only server answers without continuing edits', async () => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', keep_result: 'change', form_schema: [{ id: 'c', name: '模板终评结果', fields: [{ id: 'grade', type: 'single_select', label: '评级', required: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }] }], answers: {} })
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockResolvedValue({ answers: { keep_result: 'change', grade: 'b' }, version: 2, submitted_at: '2026-11-10T00:00:00Z', editable: true, submit_allowed: true })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    expect(submit).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('评级为必填')
    await wrapper.get('[data-field-id="grade"] input[value="a"]').setValue(true)
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('task-1', { grade: 'a', keep_result: 'change' }, 1)
    expect(wrapper.get('[data-field-id="grade"]').text()).toContain('B')
    expect(wrapper.findAll('.reconsideration-choice input').every(input => input.element.disabled)).toBe(true)
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('继续编辑')
    expect(wrapper.find('[aria-label="编辑已提交内容"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it.each([{ reconsideration_closed: true }, { submitted_at: '2026-11-10T00:00:00Z' }])('opens a closed reconsideration entirely readonly without a draft chooser: %o', async closed => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', ...closed, reconsideration_reason: '理由', keep_result: 'keep', has_draft: true, draft_answers: { keep_result: 'keep', work: '草稿' }, answers: { keep_result: 'change', work: '正式结果' } })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('.reconsideration-choice input[value="change"]').element.checked).toBe(true)
    expect(wrapper.findAll('.reconsideration-choice input').every(input => input.element.disabled)).toBe(true)
    expect(wrapper.text()).toContain('正式结果')
    expect(wrapper.text()).not.toContain('草稿')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(document.querySelector('.performance-draft-choice')).toBeNull()
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('继续编辑')
    wrapper.unmount()
  })

  it.each([true, false])('allows authorized zero-field reconsideration submission, show=%s', async show => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', show_result_and_modify: show, form_schema: [] })
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockResolvedValue({ answers: { keep_result: show ? 'change' : 'keep' }, submitted_at: '2026-11-10T00:00:00Z', editable: false, submit_allowed: false })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    expect(wrapper.get('.self-summary-footer .performance-button--primary').element.disabled).toBe(false)
    expect(wrapper.text()).not.toContain('暂无填写内容')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledWith('task-1', { keep_result: show ? 'change' : 'keep' }, 1)
    wrapper.unmount()
  })

  it.each(['save', 'submit'])('locks stale open reconsideration after a concurrent close returned by %s', async action => {
    vi.useFakeTimers()
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'result_reconsideration', reconsideration_reason: '理由', form_schema: [], answers: {} })
    const closed = { response: { data: { detail: 'RECONSIDERATION_CLOSED' } } }
    const save = vi.spyOn(performanceReviewApi, 'saveTemplateTaskDraft').mockRejectedValue(closed)
    const submit = vi.spyOn(performanceReviewApi, 'submitTemplateTask').mockRejectedValue(closed)
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    try {
      await flushPromises()
      if (action === 'save') {
        await wrapper.get('.reconsideration-choice input[value="keep"]').setValue(true)
        await vi.advanceTimersByTimeAsync(350)
        expect(save).toHaveBeenCalledTimes(1)
      } else {
        await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
        await flushPromises()
        expect(submit).toHaveBeenCalledTimes(1)
      }
      expect(wrapper.get('.state.error').text()).toContain('复议已处理完成')
      expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
      expect(wrapper.find('.reconsideration-choice').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(1000)
      expect(push).not.toHaveBeenCalled()
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it.each([
    ['RECONSIDERATION_CLOSED', '复议已处理完成'],
    ['RECONSIDERATION_BASELINE_UNAVAILABLE', '复议前绩效结果暂不可用'],
    ['RECONSIDERATION_SOURCE_CONFLICT', '复议结果来源不一致'],
  ])('translates reconsideration errors without allowing editing after load failure: %s', async (code, message) => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockRejectedValue({ response: { data: { detail: code } } })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    expect(wrapper.get('.state.error').text()).toContain(message)
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders the template-maintained title, employee context, and content hierarchy', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.get('.summary-tabs .active').text()).toBe('模板维护的总结名称')
    expect(wrapper.get('.self-summary-form h1').text()).toBe('模板维护的总结名称')
    expect(wrapper.get('.person-info').text()).toContain('刘琦')
    expect(wrapper.findAll('.person-meta__separator')).toHaveLength(1)
    expect(wrapper.findAll('.section-header h2').map(section => section.text())).toEqual(['文本型填写题', '工作总结', '评分评级', '标签型填写题'])
    expect(wrapper.findAll('.field-label span').map(field => field.text())).toEqual(['填写题名称', '填写题名称', '绩效评级', '价值贡献'])
    expect(wrapper.findAll('.rating-option').map(option => option.text())).toEqual(['1星', '5星'])
    expect(wrapper.find('.rating-connector').exists()).toBe(true)
  })

  it('uses a shared rich-text editor for tag follow-up and submits valid answers', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.find('textarea').exists()).toBe(false)
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    expect(wrapper.find('.tag-answer').exists()).toBe(true)
    expect(wrapper.get('.tag-rich-input').attributes('data-placeholder')).toBe('填写亮点')

    const richInputs = wrapper.findAll('.rich-input')
    richInputs[1].element.innerHTML = '本期完成项目交付'
    await richInputs[1].trigger('input')
    await wrapper.findAll('.rating-option')[0].trigger('click')
    const tagInput = wrapper.get('.tag-rich-input')
    tagInput.element.innerHTML = '主动解决关键问题'
    await tagInput.trigger('input')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({
      work: expect.stringContaining('本期完成项目交付'),
      rating: 'one',
      value: { tags: ['good'], notes: { good: expect.stringContaining('主动解决关键问题') } },
    }), 1)
    expect(wrapper.text()).toContain('提交成功')
  })

  it('stores independent notes for selected tags and validates only required selections', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    await checkboxes[0].setValue(true)
    await checkboxes[1].setValue(true)
    expect(wrapper.findAll('.tag-rich-input')).toHaveLength(2)
    const inputs = wrapper.findAll('.tag-rich-input')
    inputs[0].element.innerHTML = '亮点说明'
    await inputs[0].trigger('input')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('请填写做得好的的补充说明')
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
  })

  it('shares the tag input and editor while preserving separate tag notes and one toolbar', async () => {
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body })
    await flushPromises()
    await wrapper.findAll('.tag-options input')[0].setValue(true)
    await wrapper.findAll('.tag-options input')[1].setValue(true)
    expect(wrapper.findAllComponents(PerformanceTagRichTextInput)).toHaveLength(1)
    expect(wrapper.findAllComponents(PerformanceRichTextEditor)).toHaveLength(4)
    expect(wrapper.findAll('.tag-rich-text-input [role="toolbar"]')).toHaveLength(1)
    expect(wrapper.findAll('.tag-answer [role="toolbar"]')).toHaveLength(0)
    const input = wrapper.findAll('.tag-rich-input')[1]
    input.element.innerHTML = 'LongToken'.repeat(100)
    await input.trigger('input')
    expect(wrapper.findAll('.tag-rich-input')[1].text()).toBe('LongToken'.repeat(100))
    expect(wrapper.findAll('.tag-rich-input')[0].text().replace(/​/g, '')).toBe('')
    await wrapper.get('.tag-preview__selected-tag button[aria-label="删除待改进的"]').trigger('click')
    expect(wrapper.findAll('.tag-rich-input')).toHaveLength(1)
    await wrapper.findAll('.tag-options input')[1].setValue(true)
    expect(wrapper.findAll('.tag-rich-input')[1].text().replace(/​/g, '')).toBe('LongToken'.repeat(100))
    wrapper.unmount()
  })

  it('uses a text cursor only for editable rich-text content', async () => {
    const source = readFileSync(resolve(process.cwd(), 'src/components/performance/PerformanceRichTextBox.vue'), 'utf8')
    const editableWrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(editableWrapper.findAll('.rich-input')[0].attributes('contenteditable')).toBe('true')
    expect(source).toContain('.rich-input[contenteditable="true"]){cursor:text}')
    expect(source).toContain('.rich-input[contenteditable="false"]){cursor:default}')

    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({
      ...structuredClone(task),
      editable: false,
    })
    const readonlyWrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(readonlyWrapper.findAll('.rich-input')[0].attributes('contenteditable')).toBe('false')
  })

  it('renders and submits dropdown-style ratings from the field contract', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({
      ...structuredClone(task),
      form_schema: [{ id: 'rating-section', name: '评分评级', fields: [{ id: 'rating', type: 'rating', label: '绩效评级', required: true, display_mode: '下拉样式', options: [{ id: 'one', label: '1星' }, { id: 'five', label: '5星' }] }] }],
    })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.find('.performance-rating-control__labels').exists()).toBe(false)
    wrapper.getComponent({ name: 'PerformanceSearchSelect' }).vm.$emit('update:modelValue', 'five')
    await wrapper.vm.$nextTick()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({ rating: 'five' }), 1)
  })

  it('skips unknown content only and validates it again after a normal rating is selected', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), form_schema: [
      { id: 'rating', name: '评级内容', fields: [{ id: 'grade', type: 'rating', label: '评级', allow_unknown: true, required: true, options: [{ id: 'a', label: 'A' }] }, { id: 'note', type: 'rich_text', label: '说明', required: true }] },
      { id: 'other', name: '其他内容', fields: [{ id: 'other', type: 'rich_text', label: '其他必填', required: true }] },
    ], answers: { grade: '__unknown__' } })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('其他必填为必填')
    expect(wrapper.text()).not.toContain('说明为必填')
    const other = wrapper.get('[data-field-id="other"] .rich-input')
    other.element.innerHTML = '其他内容已填写'
    await other.trigger('input')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({ grade: '__unknown__', other: expect.stringContaining('其他内容已填写') }), 1)
    vi.mocked(performanceReviewApi.submitSelfSummary).mockClear()
    await wrapper.get('[aria-label="编辑已提交内容"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-field-id="grade"] .rating-option').trigger('click')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    expect(wrapper.text()).toContain('说明为必填')
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('adds and submits multiple instances when the template allows it', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({
      ...structuredClone(task),
      form_schema: [{ id: 'work-section', name: '工作总结', description: '描述', allow_multiple: true, fields: [{ id: 'work', type: 'rich_text', label: '填写题名称', required: true, placeholder: '提示' }] }],
    })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.findAll('.performance-add-another-button')).toHaveLength(1)
    await wrapper.get('.performance-add-another-button').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.repeatable-content-instance')).toHaveLength(2)
    expect(wrapper.findAll('.field-label span').map(label => label.text())).toEqual(['填写题名称 1', '填写题名称 2'])
    expect(wrapper.findAll('.repeatable-instance-remove')).toHaveLength(2)

    const editors = wrapper.findAll('.rich-input')
    editors[0].element.innerHTML = '第一条总结'
    await editors[0].trigger('input')
    editors[1].element.innerHTML = '第二条总结'
    await editors[1].trigger('input')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({
      work: [expect.stringContaining('第一条总结'), expect.stringContaining('第二条总结')],
    }), 1)
  })

  it('keeps inputs and focuses the first field when required validation fails', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')

    expect(wrapper.text()).toContain('填写题名称为必填')
    expect(wrapper.text()).toContain('绩效评级为必填')
    expect(wrapper.text()).toContain('请选择至少一个标签')
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('keeps the caret position while reactive answers update', async () => {
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body })
    await flushPromises()
    const editor = wrapper.findAll('.rich-input')[1]
    editor.element.innerHTML = '连续输入'
    ;(editor.element).focus()
    const text = editor.element.firstChild
    const range = document.createRange()
    range.setStart(text, 4)
    range.collapse(true)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)

    await editor.trigger('input')
    await wrapper.vm.$nextTick()

    expect(editor.element.textContent).toBe('连续输入')
    expect(editor.element.querySelector('.ace-line')).not.toBeNull()
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
    wrapper.unmount()
  })

  it('uses the configured page name independently of the workflow tab name', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), content_page_name: '填写本期重点产出' })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.summary-tabs .active').text()).toBe(task.node_name)
    expect(wrapper.get('.self-summary-form h1').text()).toBe('填写本期重点产出')
    expect(wrapper.find('.split-current-card > .summary-scroll > .task-content').exists()).toBe(true)
    expect(wrapper.find('.split-current-card > .split-current-footer > .self-summary-footer').exists()).toBe(true)
    expect(wrapper.find('.write-mode-trigger').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps the draft anchor in the growing canvas height chain without shrinking long content', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.task-content > .task-form-shell > .task-template-renderer').exists()).toBe(true)
    const source = readFileSync(resolve(process.cwd(), 'src/views/performance/SelfSummaryTask.vue'), 'utf8')
    expect(source).toContain('.task-form-shell{display:flex;flex:1 0 auto;min-width:0;flex-direction:column;border-radius:8px;background:var(--color-bg-card)}')
    expect(source).toContain('.task-template-renderer,.task-content > .state{flex:1 0 auto;min-height:0}')
    expect(source).toContain('.reference-scroll > *{flex:1 0 auto;min-width:0}')
    expect(source).toContain('.reference-scroll{display:flex;flex:1;min-height:0;flex-direction:column;overflow:auto;')
    expect(source).toContain('.task-reference-content{display:flex;flex-direction:column;min-height:0;')
    expect(source).toContain('.task-reference-content :deep(.performance-reference-empty){flex:1 0 auto;min-height:0}')
  })

  it.each([
    ['fullScreenMode', 'completed'], ['fullScreenMode', 'pending'], ['fullScreenMode', 'filtered'], ['fullScreenMode', 'not_started'], ['fullScreenMode', 'overdue'],
    ['basicWriteMode', 'completed'], ['basicWriteMode', 'pending'], ['basicWriteMode', 'filtered'], ['basicWriteMode', 'not_started'], ['basicWriteMode', 'overdue'],
  ])('uses a readonly reference canvas for %s / %s without changing task answers', async (mode, status) => {
    localStorage.setItem('userMode', mode)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 1280, height: 700, left: 0, top: 0, right: 1280, bottom: 700 })
    const reference = { key: 'source', node_id: 'source', node_name: '配置参考', employee_no: 'E001', status: status === 'filtered' ? 'completed' : status, form_schema: status === 'completed' ? [{ id: 'source', name: '参考', fields: [{ id: 'source-text', type: 'rich_text', label: '来源内容' }] }] : [], answers: { 'source-text': '参考答案' }, can_remind: false }
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), reference_tabs: [reference] })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    if (mode === 'fullScreenMode') await wrapper.findAll('.split-single-tabs .summary-tabs button')[1].trigger('click')
    const canvas = wrapper.get('.task-reference-content')
    expect(canvas.classes()).toContain('performance-reference-content')
    expect(canvas.get('.reference-content-title').text()).toBe('配置参考')
    if (status !== 'completed') expect(canvas.get('.performance-reference-empty > img').attributes('src')).toBe(status === 'not_started' ? '/performance-not-started.svg' : '/performance-no-submit.svg')
    expect(canvas.find('[contenteditable="true"]').exists()).toBe(false)
    expect(canvas.text()).toContain(status === 'completed' ? '参考答案' : status === 'filtered' ? '暂无可查看内容' : '暂未提交')
    expect(performanceReviewApi.selfSummary).toHaveBeenCalledTimes(1)
    expect(performanceReviewApi.saveSelfSummaryDraft).not.toHaveBeenCalled()
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
  })

  it('shares the complete unsubmitted illustration with review and keeps drawer titles single', () => {
    for (const path of ['src/components/performance/PerformanceReviewContent.vue', 'src/components/performance/PerformanceReferenceContent.vue']) {
      const source = readFileSync(resolve(process.cwd(), path), 'utf8')
      expect(source).toContain('src="/performance-no-submit.svg"')
      expect(source).toContain('src="/performance-not-started.svg"')
    }
    const illustration = readFileSync(resolve(process.cwd(), 'public/performance-no-submit.svg'), 'utf8')
    expect(illustration.match(/<path /g)).toHaveLength(6)
    const reference = readFileSync(resolve(process.cwd(), 'src/components/performance/PerformanceReferenceContent.vue'), 'utf8')
    expect(reference).toContain('<h2 v-if="showTitle"')
    const drawer = readFileSync(resolve(process.cwd(), 'src/components/performance/PerformanceReviewEvaluationDrawer.vue'), 'utf8')
    expect(drawer).not.toContain('show-title')
  })

  it('keeps an empty task non-submittable without inventing fields', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), form_schema: [] })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.text()).toContain('暂无填写内容')
    expect(wrapper.find('.self-summary-form').exists()).toBe(false)
    expect(wrapper.get('.self-summary-footer .performance-button--primary').element.disabled).toBe(true)
    wrapper.unmount()
  })

  it('keeps the workspace during load failure and retries without allowing submit', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.find('.performance-task-workspace').exists()).toBe(true)
    expect(wrapper.text()).toContain('自我总结加载失败')
    expect(wrapper.find('.self-summary-footer').exists()).toBe(false)
    await wrapper.get('.state.error button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.self-summary-form').exists()).toBe(true)
    wrapper.unmount()
  })

  it('keeps newer edits after a failed save and does not drain pending saves after unmount', async () => {
    vi.useFakeTimers()
    let rejectSave
    let finishSave
    vi.mocked(performanceReviewApi.saveSelfSummaryDraft).mockImplementationOnce(() => new Promise((resolve, reject) => { rejectSave = reject })).mockImplementationOnce(() => new Promise(resolve => { finishSave = resolve }))
    const wrapper = mount(SelfSummaryTask)
    try {
      await flushPromises()
      const renderer = wrapper.getComponent(PerformanceTemplateRenderer)
      renderer.vm.$emit('update-answer', 'text', 'first')
      renderer.vm.$emit('queue-save')
      await vi.advanceTimersByTimeAsync(350)
      renderer.vm.$emit('update-answer', 'text', 'latest')
      renderer.vm.$emit('queue-save')
      rejectSave(new Error('offline'))
      await flushPromises()
      expect(wrapper.text()).toContain('自动保存失败')
      renderer.vm.$emit('queue-save')
      await vi.advanceTimersByTimeAsync(350)
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenLastCalledWith('task-1', { text: 'latest' }, 1)
      renderer.vm.$emit('update-answer', 'text', 'leaving')
      renderer.vm.$emit('queue-save')
      wrapper.unmount()
      finishSave({ version: 2 })
      await flushPromises()
      await vi.advanceTimersByTimeAsync(1000)
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledTimes(2)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('autosaves rating and tag changes through the shared renderer and retains failures', async () => {
    vi.useFakeTimers()
    const wrapper = mount(SelfSummaryTask)
    try {
      await flushPromises()
      await wrapper.findAll('.rating-option')[0].trigger('click')
      await wrapper.findAll('.tag-options input')[0].setValue(true)
      await vi.advanceTimersByTimeAsync(350)
      await flushPromises()
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledWith('task-1', expect.objectContaining({ rating: 'one', value: { tags: ['good'], notes: {} } }), 1)
      vi.mocked(performanceReviewApi.saveSelfSummaryDraft).mockRejectedValueOnce(new Error('offline'))
      await wrapper.findAll('.rating-option')[1].trigger('click')
      await vi.advanceTimersByTimeAsync(350)
      await flushPromises()
      expect(wrapper.text()).toContain('自动保存失败，内容已保留')
      expect(wrapper.findAll('.rating-option')[1].classes()).toContain('selected')
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('distinguishes a completed but fully filtered reference from an unsubmitted source', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), reference_tabs: [{ key: 'filtered', node_id: 'source', node_name: '来源内容', employee_no: 'E001', status: 'completed', form_schema: [], answers: {}, can_remind: false }] })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.findAll('.split-single-tabs .summary-tabs button')[1].trigger('click')
    expect(wrapper.text()).toContain('暂无可查看内容')
    expect(wrapper.text()).not.toContain('暂未提交')
    expect(wrapper.find('.performance-reminder-button').exists()).toBe(false)
    wrapper.unmount()
  })

  it('renders template prompts and the calibration notice inside the same white form shell', async () => {
    const prompt = { title: '360°评估说明', content: '请客观反馈', color: '#3370ff', scope: 'all' }
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({
      ...structuredClone(task), task_kind: 'evaluation', node_name: '360°评估', calibration_notice: '系统通知', prompts: [],
      form_schema: [{ id: 'page-prompt', name: '', fields: [], elements: [{ kind: 'prompt', id: 'page-prompt', prompt }] }, ...structuredClone(task.form_schema)],
    })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()
    expect(wrapper.get('.self-summary-form [data-prompt-id="page-prompt"]').text()).toContain('请客观反馈')
    expect(wrapper.find('.task-notices .performance-prompt-display').exists()).toBe(false)
    expect(wrapper.get('.task-notices').text()).toBe('系统通知')
    expect(wrapper.get('.task-form-shell .task-notices--calibration').text()).toBe('系统通知')
    expect(wrapper.get('.task-form-shell').element.contains(wrapper.get('.self-summary-form').element)).toBe(true)
    expect(wrapper.find('.task-content > .task-notices').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps a prompt-only page inside the canvas without inventing writable answers', async () => {
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), form_schema: [{ id: 'prompt', name: '', fields: [], elements: [{ kind: 'prompt', id: 'prompt', prompt: { content: '仅填写时说明', color: '#3370ff', onlyWhenFilling: true } }] }] })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.self-summary-form').text()).toContain('仅填写时说明')
    expect(wrapper.text()).not.toContain('暂无填写内容')
    expect(wrapper.get('.self-summary-footer .performance-button--primary').element.disabled).toBe(true)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the live form, prompt order, errors and pending save across display modes', async () => {
    vi.useFakeTimers()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 1280, height: 700, left: 0, top: 0, right: 1280, bottom: 700 })
    const loaded = structuredClone(task)
    loaded.form_schema[0].elements = [{ kind: 'prompt', id: 'inline', prompt: { content: '不丢提示', color: '#3370ff' } }, { kind: 'field', id: 'text' }]
    loaded.reference_tabs = [{ key: 'r1', node_id: 'src', node_name: '参考环节', employee_no: 'E001', status: 'completed', form_schema: [{ id: 'src', name: '参考', fields: [{ id: 'src', type: 'rich_text', label: '来源' }] }], answers: { src: '不可写入当前任务' }, can_remind: false }]
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue(loaded)
    const wrapper = mount(SelfSummaryTask)
    try {
      await flushPromises()
      const rendererId = wrapper.get('.task-content').getComponent(PerformanceTemplateRenderer).vm.$.uid
      const input = wrapper.get('[data-field-id="text"] .rich-input')
      input.element.innerHTML = '模式切换保留的输入'
      await input.trigger('input')
      await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
      expect(wrapper.text()).toContain('填写题名称为必填')
      const control = wrapper.getComponent(PerformanceWriteModeSwitch)
      control.vm.$emit('update:modelValue', 'basicWriteMode')
      await wrapper.vm.$nextTick()
      expect(wrapper.get('.performance-split-workspace').classes()).toContain('is-split')
      expect(wrapper.get('.task-content').getComponent(PerformanceTemplateRenderer).vm.$.uid).toBe(rendererId)
      expect(wrapper.get('[data-field-id="text"] .rich-input').element).toBe(input.element)
      expect(wrapper.text()).toContain('不丢提示')
      expect(wrapper.text()).toContain('填写题名称为必填')
      expect(performanceReviewApi.selfSummary).toHaveBeenCalledTimes(1)
      expect(performanceReviewApi.saveSelfSummaryDraft).not.toHaveBeenCalled()
      expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
      control.vm.$emit('update:modelValue', 'fullScreenMode')
      await wrapper.vm.$nextTick()
      expect(wrapper.get('.task-content').getComponent(PerformanceTemplateRenderer).vm.$.uid).toBe(rendererId)
      await vi.advanceTimersByTimeAsync(350)
      await flushPromises()
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledWith('task-1', expect.objectContaining({ text: expect.stringContaining('模式切换保留的输入') }), 1)
      expect(vi.mocked(performanceReviewApi.saveSelfSummaryDraft).mock.calls[0][1]).not.toHaveProperty('src')
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

  it('renders a dual empty state with a single readonly current form when references are absent', async () => {
    localStorage.removeItem('userMode')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, width: 1280, height: 700, left: 0, top: 0, right: 1280, bottom: 700 })
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), editable: false, submit_allowed: false })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    expect(wrapper.get('.performance-split-workspace').classes()).toContain('is-split')
    expect(wrapper.text()).toContain('暂无参考内容')
    expect(wrapper.findAllComponents(PerformanceTemplateRenderer)).toHaveLength(1)
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.get('.self-summary-footer .performance-button--primary').element.disabled).toBe(true)
    wrapper.unmount()
  })

  it('sanitizes executable markup before rendering and saving', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({ ...structuredClone(task), answers: { work: '<img src=x onerror=alert(1)><script>alert(1)</script><b>安全内容</b>' } })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    const editor = wrapper.findAll('.rich-input')[1]
    expect(editor.html()).not.toContain('script')
    expect(editor.html()).not.toContain('onerror')
    expect(editor.text()).toContain('安全内容')
  })
})

describe('SelfSummaryTask switched identity navigation', () => {
  let wrapper
  beforeEach(() => {
    vi.useFakeTimers()
    clearEmployeeSwitch()
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(structuredClone(task))
    setEmployeeSwitch({ session_id: 'current', session_token: 'secret-current', expires_at: new Date(Date.now() + 30 * 60000).toISOString(), effective_identity: { employee_no: 'E001', display_name: '测试员工' }, mode: 'TARGET_POLICY' })
  })
  afterEach(() => {
    wrapper?.unmount()
    clearEmployeeSwitch()
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.mocked(useRoute).mockImplementation(() => ({ query: { task_id: 'task-1' } }))
    vi.mocked(useRouter).mockImplementation(() => ({ back, push }))
  })

  it.each([['.back-button', 0], ['.back-button', 31], ['.self-summary-footer .performance-button--secondary', 31]])('keeps identity and returns to my review via %s after %i minutes', async (selector, minutes) => {
    const { createRouter, createMemoryHistory } = await vi.importActual('vue-router')
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/performance/review', component: { template: '<div>我的绩效</div>' } },
      { path: '/performance/review/self-summary', component: SelfSummaryTask },
    ] })
    vi.mocked(useRoute).mockImplementation(() => router.currentRoute.value)
    vi.mocked(useRouter).mockReturnValue(router)
    let serverExpiry = Date.now() + 30 * 60000
    const get = vi.spyOn(api, 'get').mockImplementation(async () => {
      if (Date.now() >= serverExpiry) throw { response: { status: 410, data: { detail: '身份切换已到期，请恢复本人' } } }
      serverExpiry = Date.now() + 30 * 60000
      return { data: { expires_at: new Date(serverExpiry).toISOString() } }
    })
    const reviewPath = '/performance/review?cycle_id=2&project_id=3&node=summary'
    await router.push(reviewPath)
    wrapper = mount({ template: '<router-view />' }, { global: { plugins: [router] } })
    await router.push('/performance/review/self-summary?task_id=task-1&project_id=3')
    await flushPromises()
    await vi.advanceTimersByTimeAsync(minutes * 60000)
    if (minutes) expect(get).toHaveBeenCalledWith('/performance/identity-switch/session', { headers: { 'X-App-Switch-Session': 'secret-current' } })
    expect(serverExpiry).toBeGreaterThan(Date.now())
    await wrapper.get(selector).trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(reviewPath)
    expect(wrapper.text()).toBe('我的绩效')
    expect(employeeSwitchSession.value?.session_id).toBe('current')
    expect(employeeSwitchNotice.value).toBe('')
    const calls = get.mock.calls.length
    await vi.advanceTimersByTimeAsync(15000)
    window.dispatchEvent(new Event('focus'))
    expect(get).toHaveBeenCalledTimes(calls)
  })
  it('coalesces in-flight changes into the latest draft and uses the resulting version on submit', async () => {
    vi.useFakeTimers()
    let finish
    vi.mocked(performanceReviewApi.selfSummary).mockResolvedValue({ ...structuredClone(task), form_schema: [{ id: 's', name: '总结', fields: [{ id: 'text', type: 'rich_text', label: '说明' }] }] })
    vi.spyOn(performanceReviewApi, 'saveSelfSummaryDraft').mockImplementationOnce(() => new Promise(resolve => { finish = resolve })).mockResolvedValue({ version: 3 })
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ version: 4, editable: true, submit_allowed: true })
    const wrapper = mount(SelfSummaryTask)
    try {
      await flushPromises()
      const renderer = wrapper.getComponent(PerformanceTemplateRenderer)
      renderer.vm.$emit('update-answer', 'text', 'first')
      renderer.vm.$emit('queue-save')
      await vi.advanceTimersByTimeAsync(350)
      await flushPromises()
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledTimes(1)
      for (const value of ['second', 'third', 'latest']) {
        renderer.vm.$emit('update-answer', 'text', value)
        renderer.vm.$emit('queue-save')
        await vi.advanceTimersByTimeAsync(400)
      }
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledTimes(1)
      finish({ version: 2 })
      await flushPromises()
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledTimes(2)
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenLastCalledWith('task-1', { text: 'latest' }, 2)
      renderer.vm.$emit('queue-save')
      await vi.advanceTimersByTimeAsync(350)
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalledTimes(2)
      await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
      await flushPromises()
      expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', { text: 'latest' }, 3)
    } finally { wrapper.unmount(); vi.useRealTimers() }
  })

})


describe('submitted answers and draft choices', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    vi.mocked(useRoute).mockReturnValue({ path: '/performance/review/self-summary', query: { task_id: '901', project_id: '3', node: 'summary' } })
    vi.mocked(useRouter).mockReturnValue({ back, push })
    localStorage.setItem('userMode', 'fullScreenMode')
    Element.prototype.scrollIntoView = vi.fn()
  })
  afterEach(() => {
    vi.mocked(useRoute).mockReturnValue({ query: { task_id: 'task-1' } })
    vi.mocked(useRouter).mockReturnValue({ back, push })
  })
  const submittedTask = () => ({ ...structuredClone(task), task_id: 901, task_kind: 'work_summary', project_id: 3, node_id: 'summary', return_view: 'node', submitted_at: '2026-11-01T00:00:00Z', version: 5, has_draft: true, draft_answers: { work: '<p>草稿B</p>' }, answers: { work: '<p>提交A</p>' }, form_schema: [{ id: 's', name: '工作总结', fields: [{ id: 'work', type: 'rich_text', label: '总结', required: true }] }] })

  it.each(['use', 'discard'])('requires a choice and loads the matching %s data', async choice => {
    const loaded = submittedTask()
    vi.spyOn(performanceReviewApi, 'selfSummary').mockImplementation(async () => structuredClone(loaded))
    const discard = vi.spyOn(performanceReviewApi, 'discardTaskDraft').mockImplementation(async () => { loaded.has_draft = false; loaded.draft_answers = {}; loaded.version++; return { version: loaded.version } })
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body })
    await flushPromises()
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.get('.rich-answer').text()).toBe('提交A')
    const buttons = document.body.querySelectorAll('.performance-draft-choice button')
    expect(buttons).toHaveLength(2)
    ;buttons[choice === 'use' ? 1 : 0].click()
    await flushPromises()
    expect(wrapper.get('[contenteditable="true"]').text()).toContain(choice === 'use' ? '草稿B' : '提交A')
    expect(discard).toHaveBeenCalledTimes(choice === 'use' ? 0 : 1)
    if (choice === 'discard') expect(discard).toHaveBeenCalledWith(901, 'work_summary', 5, 'E001')
    wrapper.unmount()
  })

  it('keeps the choice open on a discard conflict without entering editing', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(submittedTask())
    vi.spyOn(performanceReviewApi, 'discardTaskDraft').mockRejectedValue(new Error('VERSION_CONFLICT'))
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body })
    await flushPromises()
    document.body.querySelector('.performance-draft-choice button').click()
    await flushPromises()
    expect(document.body.textContent).toContain('草稿处理失败，请重试')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    expect(wrapper.get('.rich-answer').text()).toBe('提交A')
    wrapper.unmount()
  })

  it.each(['node', 'drawer', 'page'])('navigates to the corresponding %s view only after success', async returnView => {
    const loaded = { ...submittedTask(), return_view: returnView, has_draft: false }
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(loaded)
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ answers: loaded.answers, version: 6, submitted_at: '2026-11-01T01:00:00Z', editable: true, submit_allowed: true })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    const location = push.mock.calls.at(-1)[0]
    expect(location.path).toBe(returnView === 'page' ? '/performance/review/self-summary' : '/performance/review')
    expect(location.query).toMatchObject({ project_id: '3', task_id: '901', node: 'summary' })
    if (returnView === 'drawer') expect(location.query.rootReviewId).toBe('901')
    if (returnView === 'page') expect(location.query.view).toBe('1')
    expect(wrapper.find('[contenteditable="true"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not navigate on failed submit and retains editable content', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({ ...submittedTask(), has_draft: false })
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockRejectedValue(new Error('VERSION_CONFLICT'))
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.get('[contenteditable="true"]').text()).toContain('提交A')
    wrapper.unmount()
  })
  it('opens edit choice on the view page without navigating until selected', async () => {
    const Notice = (await import('@/components/performance/PerformanceReviewCompletionNotice.vue')).default
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(submittedTask())
    const wrapper = mount(Notice, { attachTo: document.body, props: { editable: true, message: '已提交', taskId: 901, taskKind: 'work_summary' } })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(document.activeElement.textContent).toBe('不使用')
    document.body.querySelector('.performance-draft-choice .performance-button--primary').click()
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([['use']])
    wrapper.unmount()
  })

})

describe('overdue first submission confirmation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    push.mockReset()
    vi.mocked(useRoute).mockReturnValue({ path: '/performance/review/self-summary', query: { task_id: '901', project_id: '3', node: 'summary' } })
    vi.mocked(useRouter).mockReturnValue({ back, push })
    localStorage.setItem('userMode', 'fullScreenMode')
  })
  afterEach(() => { vi.mocked(useRoute).mockReturnValue({ query: { task_id: 'task-1' } }); vi.mocked(useRouter).mockReturnValue({ back, push }) })
  const loaded = () => ({ ...structuredClone(task), task_id: 901, node_id: 'summary', task_kind: 'work_summary', return_view: 'node', deadline_at: new Date(Date.now() - 60000).toISOString(), submitted_at: null, version: 2, answers: { work: '待补交内容' }, form_schema: [{ id: 's', name: '总结', fields: [{ id: 'work', type: 'rich_text', label: '总结', required: true }] }] })

  it.each(['work_summary', 'evaluation'])('waits for explicit %s confirmation and leaves input intact after cancellation', async taskKind => {
    vi.spyOn(performanceReviewApi, taskKind === 'work_summary' ? 'selfSummary' : 'templateTask').mockResolvedValue(loaded())
    const submit = vi.spyOn(performanceReviewApi, taskKind === 'work_summary' ? 'submitSelfSummary' : 'submitTemplateTask').mockResolvedValue({ version: 3, answers: { work: '待补交内容' }, editable: false, submit_allowed: false })
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body, props: { taskKind } })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('当前环节已过截止时间，提交后将无法修改内容。')
    document.querySelector('.performance-confirm-dialog__button--cancel').click()
    await flushPromises()
    expect(submit).not.toHaveBeenCalled()
    expect(wrapper.get('[contenteditable="true"]').text()).toContain('待补交内容')
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    document.querySelector('.performance-confirm-dialog__button--danger').click()
    document.querySelector('.performance-confirm-dialog__button--danger').click()
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(push).toHaveBeenCalledWith(expect.objectContaining({ path: '/performance/review' }))
    expect(document.querySelector('.performance-confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it.each(['first', 'near-deadline'])('does not show an overdue modal for an on-time %s submit', async scenario => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue({ ...loaded(), deadline_at: new Date(Date.now() + (scenario === 'first' ? 86400000 : 60000)).toISOString() })
    const submit = vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ version: 3 })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(document.querySelector('.performance-confirm-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('shows errors inside the modal and retains editable content after a rejected submit', async () => {
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(loaded())
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockRejectedValue(new Error('VERSION_CONFLICT'))
    const wrapper = mount(SelfSummaryTask, { attachTo: document.body })
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    document.querySelector('.performance-confirm-dialog__button--danger').click()
    await flushPromises()
    expect(document.querySelector('.performance-confirm-dialog [role="alert"]')).not.toBeNull()
    expect(wrapper.get('[contenteditable="true"]').text()).toContain('待补交内容')
    expect(push).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each(['invalid', 'submitted', 'forbidden'])('does not offer a new overdue submit opportunity for %s content', async condition => {
    const value = loaded()
    if (condition === 'invalid') value.answers = {}
    if (condition === 'submitted') value.submitted_at = '2026-01-01T00:00:00Z'
    if (condition === 'forbidden') value.submit_allowed = false
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(value)
    const submit = vi.spyOn(performanceReviewApi, 'submitSelfSummary')
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    expect(submit).not.toHaveBeenCalled()
    expect(document.querySelector('.performance-confirm-dialog')).toBeNull()
    wrapper.unmount()
  })
})

describe('global submitted success toast', () => {
  let messages
  const loaded = () => ({ ...structuredClone(task), task_id: 901, node_id: 'summary', project_id: 3, task_kind: 'work_summary', return_view: 'node', answers: { work: '<p>正式内容</p>' }, form_schema: [{ id: 's', name: '工作总结', fields: [{ id: 'work', type: 'rich_text', label: '总结', required: true }] }] })
  beforeEach(async () => {
    vi.restoreAllMocks()
    messages = (await import('element-plus')).ElMessage
    messages.closeAll()
    push.mockReset()
    vi.mocked(useRoute).mockReturnValue({ query: { task_id: '901', project_id: '3', node: 'summary' } })
    vi.mocked(useRouter).mockReturnValue({ back, push })
    localStorage.setItem('userMode', 'fullScreenMode')
  })
  afterEach(() => {
    messages.closeAll()
    vi.mocked(useRoute).mockReturnValue({ query: { task_id: 'task-1' } })
    vi.mocked(useRouter).mockReturnValue({ back, push })
    vi.useRealTimers()
  })

  it.each(['work_summary', 'evaluation'])('shows the shared success toast only once after %s succeeds and before navigation', async kind => {
    vi.spyOn(performanceReviewApi, kind === 'work_summary' ? 'selfSummary' : 'templateTask').mockResolvedValue(loaded())
    let resolveSubmit
    const submit = vi.spyOn(performanceReviewApi, kind === 'work_summary' ? 'submitSelfSummary' : 'submitTemplateTask').mockReturnValue(new Promise(resolve => { resolveSubmit = resolve }))
    const success = vi.spyOn(messages, 'success').mockImplementation(() => ({ close: vi.fn() }))
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: kind } })
    await flushPromises()
    const button = wrapper.get('.self-summary-footer .performance-button--primary')
    await button.trigger('click')
    await button.trigger('click')
    expect(submit).toHaveBeenCalledTimes(1)
    expect(success).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    resolveSubmit({ answers: loaded().answers, version: 2, submitted_at: '2026-11-01T00:00:00Z' })
    await flushPromises()
    expect(success).toHaveBeenCalledTimes(1)
    expect(success).toHaveBeenCalledWith(expect.objectContaining({ message: '已提交', offset: 40, duration: 3000, showClose: false, customClass: 'performance-submit-toast' }))
    expect(success.mock.invocationCallOrder[0]).toBeLessThan(push.mock.invocationCallOrder[0])
    wrapper.unmount()
  })

  it('keeps the global toast alive after the edit page unmounts', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(loaded())
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ version: 2 })
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
    await flushPromises()
    const toast = Array.from(document.querySelectorAll('.performance-submit-toast')).at(-1)
    wrapper.unmount()
    expect(toast.textContent).toBe('已提交')
    expect(toast.querySelector('[data-icon="SucceedFilled"]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(2999)
    expect(toast.isConnected).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    expect(toast.isConnected).toBe(false)
  })

  it.each(['failed', 'invalid', 'draft', 'cancel-overdue'])('does not emit success for %s', async mode => {
    const value = loaded()
    if (mode === 'invalid') value.answers = {}
    if (mode === 'cancel-overdue') value.deadline_at = '2020-01-01T00:00:00Z'
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(value)
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockRejectedValue(new Error('VERSION_CONFLICT'))
    vi.spyOn(performanceReviewApi, 'saveSelfSummaryDraft').mockResolvedValue({ version: 2 })
    const success = vi.spyOn(messages, 'success').mockImplementation(() => ({ close: vi.fn() }))
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    if (mode === 'draft') {
      const editor = wrapper.get('[contenteditable="true"]')
      editor.element.innerHTML = '<p>仅草稿</p>'
      await editor.trigger('input')
      await editor.trigger('blur')
      await new Promise(resolve => setTimeout(resolve, 400))
      await flushPromises()
      expect(performanceReviewApi.saveSelfSummaryDraft).toHaveBeenCalled()
    } else {
      await wrapper.get('.self-summary-footer .performance-button--primary').trigger('click')
      await flushPromises()
      if (mode === 'cancel-overdue') {
        document.querySelector('.performance-confirm-dialog__button--cancel').click()
        await flushPromises()
      }
    }
    expect(success).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
