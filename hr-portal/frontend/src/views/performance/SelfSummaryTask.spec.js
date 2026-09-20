import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SelfSummaryTask from './SelfSummaryTask.vue'
import { performanceReviewApi } from '@/api/performance'

const back = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { task_id: 'task-1' } }),
  useRouter: () => ({ back }),
}))

const task = {
  task_id: 'task-1',
  node_name: '模板维护的总结名称',
  person: { employee_no: 'E001', display_name: '刘琦', organization_ref: '产品中心', manager_name: '刘芝萍' },
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
    Element.prototype.scrollIntoView = vi.fn()
    vi.spyOn(performanceReviewApi, 'selfSummary').mockResolvedValue(structuredClone(task))
    vi.spyOn(performanceReviewApi, 'saveSelfSummaryDraft').mockResolvedValue({ answers: {}, version: 2 })
    vi.spyOn(performanceReviewApi, 'submitSelfSummary').mockResolvedValue({ answers: {}, version: 3, submitted_at: '2026-09-11T00:00:00Z', editable: true, submit_allowed: true })
  })

  it('loads an evaluation task through the generic template task endpoint', async () => {
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_kind: 'evaluation', entry_mode: 'template_task', node_name: '上级评估' })
    const wrapper = mount(SelfSummaryTask, { props: { taskKind: 'evaluation' } })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith('task-1')
    expect(performanceReviewApi.selfSummary).not.toHaveBeenCalled()
    expect(wrapper.get('.summary-tabs .active').text()).toBe('上级评估')
  })

  it('renders the template-maintained title, employee context, and content hierarchy', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()

    expect(wrapper.get('.summary-tabs .active').text()).toBe('模板维护的总结名称')
    expect(wrapper.get('.self-summary-form h1').text()).toBe('模板维护的总结名称')
    expect(wrapper.get('.person-info').text()).toContain('刘琦')
    expect(wrapper.get('.person-info').text()).toContain('产品中心 · 刘芝萍')
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
    await wrapper.get('.self-summary-footer .primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({
      work: '本期完成项目交付',
      rating: 'one',
      value: { tags: ['good'], notes: { good: '主动解决关键问题' } },
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
    await wrapper.get('.self-summary-footer .primary').trigger('click')
    await flushPromises()

    expect(wrapper.text()).not.toContain('请填写做得好的的补充说明')
    expect(performanceReviewApi.submitSelfSummary).not.toHaveBeenCalled()
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
    await wrapper.get('.performance-rating-control__select').setValue('five')
    await wrapper.get('.self-summary-footer .primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({ rating: 'five' }), 1)
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
    await wrapper.get('.self-summary-footer .primary').trigger('click')
    await flushPromises()

    expect(performanceReviewApi.submitSelfSummary).toHaveBeenCalledWith('task-1', expect.objectContaining({
      work: ['第一条总结', '第二条总结'],
    }), 1)
  })

  it('keeps inputs and focuses the first field when required validation fails', async () => {
    const wrapper = mount(SelfSummaryTask)
    await flushPromises()
    await wrapper.get('.self-summary-footer .primary').trigger('click')

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

    expect(editor.element.innerHTML).toBe('连续输入')
    expect(selection.focusNode).toBe(text)
    expect(selection.focusOffset).toBe(4)
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
