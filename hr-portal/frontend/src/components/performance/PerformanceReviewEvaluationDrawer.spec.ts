import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceReviewApi } from '@/api/performance'
import PerformanceReviewEvaluationDrawer from './PerformanceReviewEvaluationDrawer.vue'

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

describe('PerformanceReviewEvaluationDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
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
    expect(document.body.querySelector('.performance-drawer__panel')?.getAttribute('style')).toContain('width: 720px')
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

  it('returns the same task to the edit action and closes from the mask', async () => {
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', person: task.person },
      global: { stubs: { PerformanceTemplateRenderer: true } },
    })
    await flushPromises()

    await (document.body.querySelector('.performance-review-completion-notice__edit') as HTMLButtonElement).click()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 145, employee_no: 'E001' }]])

    ;(document.body.querySelector('.performance-drawer__mask') as HTMLElement).click()
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toContainEqual([false])
    wrapper.unmount()
  })
})
