import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceOkrApi, performanceReviewApi, projectManagementApi, type PerformanceManagementDetail, type PerformanceReferenceTab } from '@/api/performance'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'
import PerformanceComparisonNotice from './PerformanceComparisonNotice.vue'
import type { PerformanceComparisonResult } from '@/api/performance'
import PerformanceReferenceContent from './PerformanceReferenceContent.vue'
import PerformanceReminderButton from './PerformanceReminderButton.vue'
import PerformanceReviewEvaluationDrawer from './PerformanceReviewEvaluationDrawer.vue'
import PerformanceReconsiderationAdjustments from './PerformanceReconsiderationAdjustments.vue'
import PerformanceChangeHistory from './PerformanceChangeHistory.vue'
import PerformanceReconsiderationDetail from './PerformanceReconsiderationDetail.vue'
import source from './PerformanceReviewEvaluationDrawer.vue?raw'
import previewCardSource from './PerformanceReminderPreviewCard.vue?raw'

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

enableAutoUnmount(afterEach)
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('PerformanceReviewEvaluationDrawer', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-23T00:00:00Z'))
    localStorage.clear()
    vi.stubGlobal('innerWidth', 1280)
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue(structuredClone(task))
  })

  it.each([true, false])('renders reference task actions from server capability and forwards the real target with can_fill=%s', async allowed => {
    const reference: PerformanceReferenceTab = { key: 'reference-work', node_id: 'work', node_name: '工作总结', task_id: 77, task_kind: 'work_summary', project_id: 3, phase_id: 'phase-a', employee_no: 'E001', status: 'pending', form_schema: [], answers: {}, can_fill: allowed, can_remind: true }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), reference_tabs: [reference] })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, activeTab: reference.key, detailLoader } })
    await flushPromises()
    const content = wrapper.getComponent(PerformanceReferenceContent)
    if (allowed) {
      const button = content.findAll('button').find(item => item.text() === '去完成')!
      expect(button).toBeDefined()
      expect(content.findComponent(PerformanceReminderButton).exists()).toBe(false)
      await button.trigger('click')
      expect(wrapper.emitted('edit')).toEqual([[{ task_id: 77, task_kind: 'work_summary', node_id: 'work', employee_no: 'E001', project_id: 3, phase_id: 'phase-a' }]])
    } else {
      expect(content.text()).not.toContain('去完成')
      content.getComponent(PerformanceReminderButton).vm.$emit('click')
      expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ task_id: 77, employee_no: 'E001' }), 145]])
    }
  })

  it.each(['not_started', 'completed', 'locked', 'missing'])('hides invalid reference fill and reminder actions for %s', condition => {
    const reference: PerformanceReferenceTab = { key: 'work', node_id: 'work', node_name: '工作总结', task_id: condition === 'missing' ? null : 77, task_kind: 'work_summary', employee_no: 'E001', status: condition === 'not_started' || condition === 'completed' ? condition : 'pending', final_result_locked: condition === 'locked', can_fill: true, can_remind: condition !== 'missing', form_schema: [], answers: {} }
    const wrapper = mount(PerformanceReferenceContent, { props: { reference } })
    expect(wrapper.text()).not.toContain('去完成')
    expect(wrapper.findComponent(PerformanceReminderButton).exists()).toBe(false)
  })

  it.each([false, true])('isolates member management from readonly results with allowed=%s', async allowed => {
    const member = { project_id: 1, employee_no: 'E001', display_name: '成员' }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), member_actions: { can_remove: allowed, task_map: [] } })
    const readonly = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, member, detailLoader } })
    await flushPromises()
    expect(readonly.findComponent({ name: 'PerformanceMemberMoreMenu' }).exists()).toBe(false)
    readonly.unmount()
    const managed = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, memberManagement: true, member, detailLoader } })
    await flushPromises()
    expect(Boolean(document.body.querySelector('[aria-label="更多成员操作"]'))).toBe(allowed)
    expect(document.body.querySelector('.performance-review-completion-notice button')).toBeNull()
    managed.unmount()
  })

  it('fails closed when capabilities are missing and clears a pending delete on member change', async () => {
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), member_actions: { can_remove: true, task_map: [] } })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, memberManagement: true, member: { project_id: 1, employee_no: 'E001' }, employeeNo: 'E001', detailLoader } })
    await flushPromises()
    ;(document.body.querySelector('[aria-label="更多成员操作"]') as HTMLButtonElement).click()
    await flushPromises()
    const deletion = [...document.body.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(item => item.textContent === '删除')!
    deletion.click()
    await flushPromises()
    expect(wrapper.getComponent({ name: 'PerformanceConfirmDialog' }).props('modelValue')).toBe(true)
    detailLoader.mockResolvedValue(structuredClone(task) as any)
    await wrapper.setProps({ employeeNo: 'E002', member: { project_id: 1, employee_no: 'E002' } })
    await flushPromises()
    expect(document.body.querySelector('[aria-label="更多成员操作"]')).toBeNull()
    expect(wrapper.getComponent({ name: 'PerformanceConfirmDialog' }).props('modelValue')).toBe(false)
    wrapper.unmount()
  })

  it.each(['task', 'reference', 'locked-reference', 'management', 'locked-management'] as const)('shows each authorized historical comparison reason in the %s readonly branch', async entry => {
    const group = { rule_id: 'r1', matches: [], show_notice_in_review: false, fill_in_diff_reason: false, reason_required: false, context: 'context-1', reason: '第一组历史理由', active: false, historical: true }
    const comparison = { ...group, reason: '不可使用旧汇总理由', groups: [group, { ...group, rule_id: 'r2', context: 'context-2', reason: '第二组历史理由' }] }
    const reference: PerformanceReferenceTab = { key: 'reference', node_id: 'reference', node_name: '已提交参考', task_id: 146, employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: task.answers, comparison, final_result_locked: entry.startsWith('locked') }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), ...(entry === 'task' ? { comparison } : entry.includes('management') ? { management_tabs: [reference], default_active_tab: reference.key } : { reference_tabs: [reference] }) })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader, ...(entry.includes('reference') ? { activeTab: reference.key } : {}) } })
    await flushPromises()
    const reasons = document.body.querySelectorAll('.performance-comparison-notice__reason')
    expect([...reasons].map(reason => reason.textContent)).toEqual(['第一组历史理由', '第二组历史理由'])
    expect(document.body.querySelector('.performance-comparison-notice')?.textContent).not.toContain('不可使用旧汇总理由')
    expect(document.body.querySelector('.performance-comparison-notice .prompt-notice')).toBeNull()
    wrapper.unmount()
  })

  const activeComparison: PerformanceComparisonResult = {
    rule_id: 'active', matches: [{ content_id: 'value', item_id: 'rating', label: '年度综合评级', operator: 'gte', threshold: 2, difference: 3, first_task_id: 145, second_task_id: 146, first_version: 1, second_version: 2, first_value: 'a', second_value: 'd', first_node_name: '上级评估', second_node_name: '自评', first_reviewer: { display_name: '评估人甲' }, second_reviewer: { display_name: '评估人乙' }, first_rating: { label: '符合预期', code: '3星-', color: '#3370ff' }, second_rating: { label: '超出预期', code: '4星', color: '#34c724' } }],
    show_notice_in_review: true, fill_in_diff_reason: false, reason_required: false, context: 'active-context', reason: null, active: true,
  }

  it.each(['task', 'reference', 'locked-reference', 'management', 'locked-management'] as const)('keeps an active notice without a reason and opens authorized rating details in %s', async entry => {
    const reference: PerformanceReferenceTab = { key: 'reference', node_id: 'reference', node_name: '上级评估', task_id: 146, employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: task.answers, comparison: structuredClone(activeComparison), final_result_locked: entry.startsWith('locked') }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), ...(entry === 'task' ? { comparison: structuredClone(activeComparison) } : entry.includes('management') ? { management_tabs: [reference], default_active_tab: reference.key } : { reference_tabs: [reference] }) })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader, ...(entry.includes('reference') ? { activeTab: reference.key } : {}) } })
    await flushPromises()
    expect(document.body.querySelector('.prompt-notice')?.textContent).toContain('年度综合评级')
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '查看详情')!
    button.click()
    await flushPromises()
    const detail = document.body.querySelector<HTMLElement>('.comparison-detail-popover')!
    expect(detail.textContent).toContain('3星-')
    expect(detail.textContent).toContain('4星')
    expect(detail.textContent).toContain('评估人甲')
    expect(detail.textContent).toContain('评估人乙')
    expect(detail.textContent).not.toContain('实际相差')
    expect(detail.querySelector('input, textarea, button, h2')).toBeNull()
    expect(document.body.querySelector('.performance-dialog-overlay')).toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(document.body.querySelector('.comparison-detail-popover')).toBeNull()
    expect(detailLoader).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })

  it('deduplicates shared counterpart records and keeps unavailable reviewer identities explicit', async () => {
    const first = { ...structuredClone(activeComparison.matches[0]!), reference_node_name: '自评', first_reviewer: null }
    const comparison = { ...structuredClone(activeComparison), matches: [first, { ...first, first_task_id: 150, first_reviewer: { display_name: '另一评估人' } }] }
    const wrapper = mount(PerformanceComparisonNotice, { props: { comparison, readonly: true, taskId: 145 }, attachTo: document.body })
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(document.body.querySelectorAll('.comparison-detail__record')).toHaveLength(3)
    expect(document.body.querySelectorAll('.comparison-detail__item')).toHaveLength(3)
    expect(document.body.textContent).toContain('评估人信息不可用')
    expect(document.body.textContent).toContain('另一评估人')
  })

  it('toggles the anchored detail and closes it on an outside click', async () => {
    const wrapper = mount(PerformanceComparisonNotice, { props: { comparison: structuredClone(activeComparison), readonly: true, taskId: 145 }, attachTo: document.body })
    const button = wrapper.get('button')
    await button.trigger('click')
    expect(document.body.querySelector('.comparison-detail-popover')).not.toBeNull()
    expect(button.attributes('aria-expanded')).toBe('true')
    await button.trigger('click')
    expect(document.body.querySelector('.comparison-detail-popover')).toBeNull()
    await button.trigger('click')
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await flushPromises()
    expect(document.body.querySelector('.comparison-detail-popover')).toBeNull()
    expect(button.attributes('aria-expanded')).toBe('false')
  })

  it('isolates detail groups and dismisses stale details when the comparison changes', async () => {
    const comparison = { ...structuredClone(activeComparison), groups: [structuredClone(activeComparison), { ...structuredClone(activeComparison), rule_id: 'other', matches: [{ ...activeComparison.matches[0]!, label: '价值观', difference: 2, first_rating: { label: '第二组评级' } }] }] }
    const wrapper = mount(PerformanceComparisonNotice, { props: { comparison, readonly: true, taskId: 145 }, attachTo: document.body })
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(document.body.textContent).toContain('第二组评级')
    expect(document.body.textContent).not.toContain('符合预期')
    await wrapper.setProps({ comparison: { ...structuredClone(activeComparison), groups: [] } })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('retains reasons without resurrecting deleted or disabled notices and never displays raw rating IDs', async () => {
    const wrapper = mount(PerformanceComparisonNotice, { props: { comparison: { ...structuredClone(activeComparison), active: false, reason: '已提交理由' }, readonly: true }, attachTo: document.body })
    expect(wrapper.text()).toContain('已提交理由')
    expect(wrapper.find('.prompt-notice').exists()).toBe(false)
    await wrapper.setProps({ comparison: { ...structuredClone(activeComparison), show_notice_in_review: false } })
    expect(wrapper.find('button').exists()).toBe(false)
    await wrapper.setProps({ comparison: { ...structuredClone(activeComparison), matches: [{ ...activeComparison.matches[0]!, first_value: 'private-option-id', first_rating: null, second_rating: undefined }] } })
    await wrapper.get('button').trigger('click')
    expect(document.body.textContent).toContain('评级信息不可用')
    expect(document.body.textContent).not.toContain('private-option-id')
    await wrapper.setProps({ readonly: false })
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.text()).toContain('请注意充分进行沟通后评估')
  })

  it.each(['evaluation', 'calibration', 'result_communication', 'reviewer_360_confirm'])('forwards the loaded %s source and the specific stage task with the outline button', async taskKind => {
    const reference: PerformanceReferenceTab = { key: 'summary', node_id: 'summary', node_name: '工作总结', task_id: null, employee_no: '', status: 'pending', form_schema: [], answers: {}, can_remind: false }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), task_kind: taskKind, task_id: 42, management_tabs: [reference], default_active_tab: 'summary', stage_views: [{ node_id: 'summary', task_id: 77, can_fill: false, can_remind: true, reminder_target: null }] })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    await flushPromises()
    const button = wrapper.getComponent(PerformanceReminderButton)
    expect(button.props('variant')).toBe('outline')
    button.vm.$emit('click')
    expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ task_id: 77, employee_no: 'E001', can_remind: true }), 42]])
    wrapper.unmount()
  })

  it('renders grouped inline differences with shared rating colors and never executes rich-text markup', () => {
    const rich = { section_id: 'value', section_name: '价值贡献', field_id: 'good', field_label: '做得好的', field_type: 'rich_text' }
    const rating = { section_id: 'rating', section_name: '综合评级', field_id: 'grade', field_label: '绩效评级', field_type: 'rating' }
    const wrapper = mount(PerformanceReconsiderationAdjustments, { props: {
      adjustments: [{ ...rich, before: '<p>2</p>', after: '<p>4变更结果</p><script>bad()</script>' }, { ...rich, field_id: 'improve', before: '<p>3</p>', after: '<p>6变更结果</p>' }, { ...rating, before: 'old', after: 'new' }],
      sections: [{ id: 'rating', name: '综合评级', fields: [{ id: 'grade', type: 'rating', label: '绩效评级', options: [{ id: 'old', code: '5星', label: '卓越', color: 'rgb(205, 178, 250)' }, { id: 'new', code: '4星', label: '超出预期', color: 'rgb(183, 237, 177)' }] }] }],
    } })
    const groups = wrapper.findAll('.reconsideration-adjustments__group')
    expect(groups).toHaveLength(2)
    expect(groups[0].findAll('del').map(item => item.text())).toEqual(['3', '2'])
    expect(groups[0].findAll('ins').map(item => item.text())).toEqual(['6变更结果', '4变更结果'])
    expect(wrapper.findAll('.performance-rating-tag').map(item => item.text())).toEqual(['5星', '4星'])
    expect(wrapper.findAll('.performance-rating-tag')[0].attributes('style')).toContain('rgb(236, 226, 254)')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('bad()')
    expect(wrapper.text()).not.toContain('调整前')
  })

  it('preserves equal text, unicode and explicit clears in inline changes', () => {
    const wrapper = mount(PerformanceReconsiderationAdjustments, { props: { sections: [], adjustments: [
      { section_id: 'a', section_name: '工作', field_id: 'a1', field_label: '说明', field_type: 'rich_text', before: '<p>共同🙂旧句尾</p>', after: '<p>共同🙂新句尾</p>' },
      { section_id: 'a', section_name: '工作', field_id: 'a2', field_label: '清空', field_type: 'rich_text', before: '<p>已删除</p>', after: null },
    ] } })
    expect(wrapper.findAll('del').map(item => item.text())).toEqual(['已删除', '旧'])
    expect(wrapper.find('ins').text()).toBe('新')
    expect(wrapper.text()).toContain('共同🙂')
    expect(wrapper.text()).toContain('句尾')
  })

  it('opens history with creator and time on separate rows and shows ordered inline field changes', async () => {
    const changes = [{ section_id: 'value', section_name: '价值贡献', field_id: 'good', field_label: '做得好的', field_type: 'rich_text', before: '<p>2变更结果</p>', after: '<p>4变更结果</p>' }, { section_id: 'value', section_name: '价值贡献', field_id: 'improve', field_label: '待改进的', field_type: 'rich_text', before: '<p>3变更结果</p>', after: '<p>6变更结果</p>' }]
    const wrapper = mount(PerformanceChangeHistory, { props: { employeeNo: 'E001', nodeName: '模板复议处理', sections: [], history: [{ display_name: '实际提交人', submitted_at: '2026-09-22T07:29:00Z', adjustments: changes }, { display_name: '另一处理人', submitted_at: '2026-09-21T07:29:00Z', adjustments: [] }] } })
    await wrapper.get('.reconsideration-detail__history-link button').trigger('click')
    const dialog = document.body.querySelector<HTMLElement>('.reconsideration-history-dialog')!
    expect(dialog.style.width).toBe('800px')
    expect(dialog.querySelector('.reconsideration-detail__history-creator')?.textContent).toContain('实际提交人')
    expect(dialog.querySelector('.reconsideration-detail__history-time')?.textContent).toBe('2026-09-22 15:29（GMT+8）')
    expect(dialog.querySelectorAll('details')[0].open).toBe(true)
    expect(dialog.querySelectorAll('details')[1].open).toBe(false)
    expect([...dialog.querySelectorAll('.reconsideration-adjustments__field-label')].map(item => item.textContent)).toEqual(['做得好的', '待改进的'])
    expect([...dialog.querySelectorAll('del')].map(item => item.textContent)).toEqual(['2', '3'])
    expect([...dialog.querySelectorAll('ins')].map(item => item.textContent)).toEqual(['4', '6'])
    expect(dialog.textContent).not.toContain('变更前')
    ;(dialog.querySelector('.performance-dialog__footer button') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')).toBeNull()
  })

  it.each(['management', 'evaluation'] as const)('shows the same final and calibration history through the %s loader', async entry => {
    const detail: PerformanceManagementDetail = {
      ...structuredClone(task), opened_at: '2026-09-22T07:29:00Z', opened_by: '实际开通人',
      management_tabs: [{ key: 'final', node_id: 'final', node_name: '模板终评', employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: { good: '当前终评结果' }, result_history: [
        { id: 2, submitted_at: '2026-09-22T08:29:00Z', display_name: '校准人', node_name: '公司级校准', adjustments: [{ section_id: 'value', section_name: '价值贡献', field_id: 'good', field_label: '做得好的', field_type: 'rich_text', before: '原结果', after: '校准结果' }] },
        { id: 1, submitted_at: task.submitted_at, display_name: '终评人', node_name: '模板终评', adjustments: [] },
      ] }], default_active_tab: 'final',
    }
    const loader = vi.fn().mockResolvedValue(detail)
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue(detail as Awaited<ReturnType<typeof performanceReviewApi.templateTask>>)
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', ...(entry === 'management' ? { detailLoader: loader } : { taskId: 145 }) } })
    await flushPromises()
    const opening = document.body.querySelector('.performance-review-evaluation-drawer__opening')!
    expect(opening.classList.contains('prompt-notice--multiline')).toBe(true)
    expect(opening.textContent).toBe('本次绩效结果已由 实际开通人 在 2026-09-22 15:29（GMT+8） 开通。')
    expect(document.body.querySelector('.performance-review-evaluation-drawer__card-title .reconsideration-detail__history-link')?.textContent).toContain('变更记录（2）')
    expect(wrapper.getComponent(PerformanceChangeHistory).props('sections')).toEqual(task.form_schema)
    ;(document.body.querySelector('.reconsideration-detail__history-link button') as HTMLButtonElement).click()
    await flushPromises()
    const dialog = document.body.querySelector<HTMLElement>('.reconsideration-history-dialog')!
    expect(dialog.style.width).toBe('800px')
    expect([...dialog.querySelectorAll('.reconsideration-detail__history-node')].map(item => item.textContent)).toEqual(['公司级校准', '模板终评'])
    expect(dialog.querySelector('.reconsideration-detail__history-time')?.textContent).toBe('2026-09-22 16:29（GMT+8）')
    expect(dialog.textContent).toContain('校准人')
    expect(dialog.textContent).toContain('终评人')
    expect(dialog.querySelector('del')?.textContent).toBe('原')
    expect(dialog.querySelector('ins')?.textContent).toBe('校准')
    expect(document.body.querySelector('.performance-review-evaluation-drawer__card')?.textContent).toContain('当前终评结果')
    if (entry === 'management') expect(performanceReviewApi.templateTask).not.toHaveBeenCalled()
    else expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(145, 'E001', { view: 'drawer' })
  })

  it.each([undefined, []])('hides the history entry when final result history is %s', async resultHistory => {
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), management_tabs: [{ key: 'final', node_id: 'final', node_name: '终评', employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: task.answers, result_history: resultHistory }], default_active_tab: 'final' })
    mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-detail__history-link')).toBeNull()
    expect(document.body.querySelector('.reconsideration-history-dialog')).toBeNull()
  })

  it.each(['person', 'tab', 'identity', 'close'] as const)('closes open history when changing %s and does not reopen it with cached content', async change => {
    const tab = (key: string): PerformanceReferenceTab => ({ key, node_id: key, node_name: key, employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: task.answers, result_history: [{ submitted_at: task.submitted_at, display_name: '旧历史提交人', adjustments: [] }] })
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), management_tabs: [tab('first'), tab('second')], default_active_tab: 'first' })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', detailLoader } })
    await flushPromises()
    ;(document.body.querySelector('.reconsideration-detail__history-link button') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')?.textContent).toContain('旧历史提交人')
    if (change === 'person') await wrapper.setProps({ employeeNo: 'E002' })
    if (change === 'tab') await wrapper.setProps({ activeTab: 'second' })
    if (change === 'identity') employeeSwitchEpoch.value++
    if (change === 'close') await wrapper.setProps({ modelValue: false })
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')).toBeNull()
    if (change === 'tab') await wrapper.setProps({ activeTab: 'first' })
    if (change === 'close') await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')).toBeNull()
  })

  it.each([undefined, null, '', '   ', '系统'])('uses trusted opener metadata without inventing an actor: %s', async openedBy => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({ ...structuredClone(task), opened_at: '2026-09-22T07:29:00Z', opened_by: openedBy })
    mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145 } })
    await flushPromises()
    expect(document.body.querySelector('.performance-review-evaluation-drawer__opening')?.textContent).toBe(openedBy === '系统' ? '本次绩效结果已由 系统 在 2026-09-22 15:29（GMT+8） 开通。' : '本次绩效结果已于 2026-09-22 15:29（GMT+8） 开通。')
  })

  it('keeps reconsideration history and displayed results independent from final result changes', async () => {
    const reconsideration = { reason: '申请核对', status: 'submitted_editable' as const, handlers: [], adjustments: [], history: [{ submitted_at: task.submitted_at, display_name: '复议提交人', adjustments: [] }], form_schema: task.form_schema, answers: { good: '复议时的结果' }, submitted_at: task.submitted_at, submitted_by: '复议提交人', can_edit: false }
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), management_tabs: [
      { key: 'final', node_id: 'final', node_name: '终评', employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: { good: '复议后再次校准结果' }, result_history: [{ submitted_at: task.submitted_at, display_name: '后续校准人', node_name: '后续校准', adjustments: [] }] },
      { key: 'appeal', node_id: 'appeal', node_name: '自定义复议', employee_no: 'E001', status: 'completed', can_remind: false, form_schema: task.form_schema, answers: { good: '禁止替代的页签答案' }, reconsideration },
    ], default_active_tab: 'final' })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    await flushPromises()
    await wrapper.setProps({ activeTab: 'appeal' })
    await flushPromises()
    expect(document.body.querySelector('.performance-review-evaluation-drawer__card-title .reconsideration-detail__history-link')?.textContent).toContain('变更记录（1）')
    expect(document.body.querySelector('.reconsideration-detail .reconsideration-detail__history-link')).toBeNull()
    expect(document.body.textContent).toContain('复议时的结果')
    expect(document.body.textContent).not.toContain('复议后再次校准结果')
    expect(document.body.textContent).not.toContain('禁止替代的页签答案')
    ;(document.body.querySelector('.reconsideration-detail__history-link button') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')?.textContent).toContain('复议提交人')
    expect(document.body.querySelector('.reconsideration-history-dialog')?.textContent).not.toContain('后续校准人')
    expect(document.body.querySelector('.reconsideration-detail__history-node')?.textContent).toBe('自定义复议')
    await wrapper.setProps({ activeTab: 'final' })
    await flushPromises()
    expect(document.body.querySelector('.reconsideration-history-dialog')).toBeNull()
    expect(document.body.textContent).toContain('复议后再次校准结果')
  })

  it('shows template role labels and sends a reminder for the actual pending reconsideration task', async () => {
    const reconsideration = { reason: '<p>申请核对</p>', status: 'pending' as const, handlers: [{ task_id: 901, employee_no: 'E900', display_name: '真实HRBP', role_key: 'HRBP', role_label: 'HRBP', can_remind: true }, { task_id: 902, employee_no: 'E901', display_name: '实际指定人', role_key: 'SPECIFIED_PERSON', role_label: '指定人员', can_remind: false }], adjustments: [], history: [], form_schema: [], answers: {}, deadline_at: '2026-10-03T15:59:00Z', can_edit: false }
    const reference = { key: 'appeal', node_id: 'appeal', node_name: '模板自定义复议', employee_no: 'E001', task_id: 901, status: 'pending' as const, can_remind: true, form_schema: [], answers: {}, reconsideration }
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, detailLoader: vi.fn().mockResolvedValue({ ...structuredClone(task), management_tabs: [reference], default_active_tab: 'appeal' }) } })
    await flushPromises()
    expect(document.body.textContent).toContain('模板自定义复议')
    expect(document.body.textContent).toContain('HRBP 真实HRBP')
    expect(document.body.textContent).toContain('指定人员 实际指定人')
    const buttons = wrapper.findAllComponents(PerformanceReminderButton)
    expect(buttons).toHaveLength(1)
    buttons[0].vm.$emit('click')
    expect(wrapper.emitted('remind')?.[0]?.[0]).toMatchObject({ task_id: 901, employee_no: 'E001', node_id: 'appeal' })
  })

  it('offers pending reconsideration editing only to the authorized handler and keeps reminders beside other handlers', async () => {
    const detail = { reason: '申请核对', status: 'pending' as const, handlers: [{ task_id: 901, employee_no: 'E900', display_name: '处理人', role_key: 'HRBP', role_label: 'HRBP', can_remind: true }], adjustments: [], history: [], form_schema: [], answers: {}, deadline_at: '2026-10-03T15:59:00Z', can_edit: true, edit_task_id: 901 }
    const wrapper = mount(PerformanceReconsiderationDetail, { props: { employeeNo: 'E001', nodeName: '复议处理', detail } })
    const pending = wrapper.get('.reconsideration-detail__pending')
    expect(pending.get('.reconsideration-detail__heading').text()).toBe('复议处理中')
    expect(pending.text()).toContain('复议处理截止时间：2026-10-03 23:59（GMT+8）')
    expect(wrapper.findComponent(PerformanceReminderButton).exists()).toBe(false)
    await wrapper.get('[aria-label="编辑已提交内容"]').trigger('click')
    await flushPromises()
    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(901, 'E001')
    expect(wrapper.emitted('edit')).toHaveLength(1)
    await wrapper.setProps({ detail: { ...detail, can_edit: false, edit_task_id: null } })
    expect(wrapper.find('[aria-label="编辑已提交内容"]').exists()).toBe(false)
    const handlerRow = wrapper.get('.reconsideration-detail__handler')
    expect(handlerRow.getComponent(PerformanceReminderButton).props('variant')).toBe('text')
    await handlerRow.get('button').trigger('click')
    expect(wrapper.emitted('remind')).toEqual([[901]])
    await wrapper.setProps({ detail: { ...detail, can_edit: false, handlers: [{ ...detail.handlers[0], can_remind: false }] } })
    expect(wrapper.findComponent(PerformanceReminderButton).exists()).toBe(false)
  })

  it('edits reconsideration only through the server-authorized handler task and hides editing across the deadline', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date('2026-09-23T00:00:00Z'))
    const reconsideration = { reason: '申请核对', status: 'submitted_editable' as const, handlers: [], adjustments: [{ section_id: 'value', section_name: '价值贡献', field_id: 'good', field_label: '做得好的', field_type: 'rich_text', before: '<p>原结果</p>', after: '<p>调整结果</p>' }], history: [{ submitted_at: '2026-09-22T07:29:00Z', display_name: '真实提交人', adjustments: [] }], form_schema: task.form_schema, answers: { good: '调整结果' }, submitted_at: '2026-09-22T07:29:00Z', submitted_by: '真实提交人', deadline_at: '2026-09-23T00:00:02Z', can_edit: true, edit_task_id: 902 }
    const detail = { ...structuredClone(task), management_tabs: [{ key: 'appeal', node_id: 'appeal', node_name: '模板复议', employee_no: 'E001', task_id: 901, status: 'completed', can_remind: false, form_schema: [], answers: {}, reconsideration }], default_active_tab: 'appeal' }
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, readonly: true, detailLoader: vi.fn().mockResolvedValue(detail) } })
    vi.spyOn(performanceReviewApi, 'templateTask').mockResolvedValue({ ...structuredClone(task), task_id: 902 })
    await flushPromises()
    expect(document.body.textContent).toContain('真实提交人')
    expect(document.body.querySelector('[aria-label="结果调整"] del')?.textContent).toContain('原')
    expect(document.body.querySelector('[aria-label="结果调整"] ins')?.textContent).toContain('调整')
    const edit = document.body.querySelector<HTMLButtonElement>('[aria-label="编辑已提交内容"]')!
    edit.click()
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 902, employee_no: 'E001', node_id: 'appeal', node_name: '模板复议', task_kind: 'result_reconsideration', draft_choice: undefined }]])
    await vi.advanceTimersByTimeAsync(3000)
    expect(document.body.querySelector('[aria-label="编辑已提交内容"]')).toBeNull()
  })

  it('does not infer reminder permission from a target label', async () => {
    const detailLoader = vi.fn().mockResolvedValue({ ...structuredClone(task), management_tabs: [{ key: 'summary', node_id: 'summary', node_name: '工作总结', task_id: null, employee_no: 'E001', status: 'pending', form_schema: [], answers: {}, can_remind: false }], default_active_tab: 'summary', stage_views: [{ node_id: 'summary', task_id: 77, can_fill: false, can_remind: false, reminder_target: '某处理人' }] })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    await flushPromises()
    expect(wrapper.findComponent(PerformanceReminderButton).exists()).toBe(false)
    wrapper.unmount()
  })

  it('loads only selected tab content, merges pending revisits and keeps loaded tabs cached', async () => {
    const tab = (key: string, loaded: boolean): PerformanceReferenceTab => ({ key, node_id: key, node_name: key, employee_no: 'E001', status: 'completed', can_remind: false, content_loaded: loaded, form_schema: loaded ? task.form_schema : [], answers: loaded ? { good: key } : {} })
    const detail = (key: string): PerformanceManagementDetail => ({ ...structuredClone(task), management_tabs: [tab('first', key === 'first'), tab('second', key === 'second')], default_active_tab: 'first' })
    let resolveSecond!: (value: PerformanceManagementDetail) => void
    const loader = vi.fn((key?: string) => key === 'second' ? new Promise<PerformanceManagementDetail>(resolve => { resolveSecond = resolve }) : Promise.resolve(detail('first')))
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader: loader } })
    const select = async (index: number) => {
      ;(document.body.querySelectorAll('.performance-drawer .line-tab')[index] as HTMLButtonElement).click()
      await flushPromises()
    }
    try {
      await flushPromises()
      expect(loader).toHaveBeenCalledTimes(1)
      await select(1)
      expect(loader).toHaveBeenLastCalledWith('second')
      await select(0)
      expect(document.body.textContent).toContain('first')
      await select(1)
      expect(loader).toHaveBeenCalledTimes(2)
      resolveSecond(detail('second'))
      await flushPromises()
      expect(document.body.querySelector('.performance-review-evaluation-drawer__card')?.textContent).toContain('second')
      await select(0)
      await select(1)
      expect(loader).toHaveBeenCalledTimes(2)
    } finally { wrapper.unmount() }
  })

  it('discards pending drawer data when effective identity changes', async () => {
    let resolveOld!: (value: PerformanceManagementDetail) => void
    const loader = vi.fn().mockImplementationOnce(() => new Promise<PerformanceManagementDetail>(resolve => { resolveOld = resolve })).mockResolvedValue({ ...structuredClone(task), person: { employee_no: 'E002', display_name: '新身份可见人员' } })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader: loader } })
    try {
      employeeSwitchEpoch.value++
      await flushPromises()
      resolveOld({ ...structuredClone(task), person: { employee_no: 'E001', display_name: '旧身份敏感人员' } })
      await flushPromises()
      expect(document.body.textContent).toContain('新身份可见人员')
      expect(document.body.textContent).not.toContain('旧身份敏感人员')
    } finally { wrapper.unmount() }
  })

  it('keeps inline OKR visible while fetching periods and after a supplement failure', async () => {
    const okr = { source: 'feishu', okr_id: 'okr-1', period_id: 'period-1', period_label: '本期', objectives: [{ id: 'o-1', content: '已有目标', key_results: [] }] }
    let rejectRequest!: (error: Error) => void
    vi.spyOn(performanceOkrApi, 'taskOkr').mockImplementation(() => new Promise((_resolve, reject) => { rejectRequest = reject }))
    const reference: PerformanceReferenceTab = { key: 'reference-okr', kind: 'okr', node_id: '', node_name: 'OKR', task_id: 145, employee_no: 'E001', status: 'completed', can_remind: false, form_schema: [], answers: {}, okr }
    const wrapper = mount(PerformanceReferenceContent, { props: { reference } })
    try {
      expect(wrapper.text()).toContain('已有目标')
      expect(wrapper.text()).toContain('正在加载')
      rejectRequest(new Error('unavailable'))
      await flushPromises()
      expect(wrapper.text()).toContain('已有目标')
      expect(wrapper.text()).toContain('OKR 加载失败')
    } finally { wrapper.unmount() }
  })

  it('uses complete authorized drawer OKR periods without a generic task request', async () => {
    const request = vi.spyOn(performanceOkrApi, 'taskOkr')
    const wrapper = mount(PerformanceReferenceContent, { props: { reference: { key: 'management-okr', kind: 'okr', content_loaded: true, node_id: '', node_name: 'OKR', task_id: 145, employee_no: 'E001', status: 'not_started', can_remind: false, form_schema: [], answers: {}, okr: null, okrs: [] } } })
    try {
      await flushPromises()
      expect(request).not.toHaveBeenCalled()
    } finally { wrapper.unmount() }
  })

  it('loads the selected task and renders its readonly template content', async () => {
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', nodeName: '上级评估', person: task.person },
      global: { stubs: { PerformanceTemplateRenderer: { template: '<div class="readonly-template">{{ sections[0]?.name }} {{ answers.good }}</div>', props: ['sections', 'answers', 'mode'] } } },
    })
    await flushPromises()

    expect(performanceReviewApi.templateTask).toHaveBeenCalledWith(145, 'E001', { view: 'drawer' })
    expect(document.body.textContent).toContain('alice.xiao肖惠方')
    expect(document.body.textContent).toContain('价值贡献 11')
    expect(document.body.textContent).toContain('你可在 2026-10-03 23:59（GMT+8） 前继续编辑')
    expect(document.body.querySelector('.performance-drawer__panel')?.getAttribute('style')).toContain('width: 1000px')
    expect(document.body.querySelector('[role="separator"]')).not.toBeNull()
    wrapper.unmount()
  })

  it.each([
    [false, '2026-07-27T07:11:00Z', '2026-07-17T15:59:00Z', '以下内容由 gaby.liu刘琦 在 2026-07-27 15:11（GMT+8） 提交，该环节已在 2026-07-17 23:59（GMT+8） 截止'],
    [true, '2026-11-10T08:37:00Z', '2026-11-30T15:59:00Z', '以下内容由 gaby.liu刘琦 在 2026-11-10 16:37（GMT+8） 提交，你可在 2026-11-30 23:59（GMT+8） 前继续编辑'],
  ])('uses the current manager task submitter and times instead of the aggregate representative: editable=%s', async (editable, submittedAt, deadlineAt, message) => {
    vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task), node_id: 'manager', submitted_at: submittedAt, deadline_at: deadlineAt, editable, submit_allowed: editable,
      answer_submissions: [{ display_name: 'gaby.liu刘琦', submitted_at: submittedAt }],
      management_tabs: [{ key: 'management-manager', node_id: 'manager', node_name: '上级评估', task_id: 999, task_kind: 'evaluation', employee_no: 'E001', status: 'completed', submitted_by: '错误的代表人', submitted_at: '2026-01-01T00:00:00Z', deadline_at: '2026-02-01T00:00:00Z', form_schema: task.form_schema, answers: task.answers, can_remind: false }],
      default_active_tab: 'management-manager',
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    try {
      await flushPromises()
      expect(document.body.textContent).toContain(message)
      expect(document.body.textContent).not.toContain('错误的代表人')
      const edit = document.body.querySelector<HTMLButtonElement>('.performance-review-completion-notice__edit')
      expect(Boolean(edit)).toBe(editable)
      if (edit) {
        edit.click()
        await flushPromises()
        expect(wrapper.emitted('edit')?.[0]?.[0]).toMatchObject({ task_id: 145, employee_no: 'E001' })
      }
    } finally { wrapper.unmount() }
  })

  it.each([
    ['pending', true, '2026-11-18T12:00:00Z', '以下内容由 gaby.liu刘琦在 2026-11-10 16:37（GMT+8） 提交，你可以在 2026-11-18 20:00（GMT+8） 前继续编辑'],
    ['overdue', false, '2026-11-10T12:00:00Z', '以下内容由 gaby.liu刘琦在 2026-11-10 16:37（GMT+8） 提交，该环节已在 2026-11-10 20:00（GMT+8） 截止'],
  ])('opens calibration in readonly mode with the shared notice and %s edit policy', async (_status, editable, deadline, message) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T00:00:00Z'))
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task), task_kind: 'calibration', node_name: '绩效校准', submitted_at: null,
      editable, submit_allowed: editable, deadline_at: deadline,
      answer_submissions: [{ display_name: 'gaby.liu刘琦', submitted_at: '2026-11-10T08:37:00Z' }],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    try {
      await flushPromises()
      expect(document.body.textContent).toContain(message)
      expect(document.body.querySelector('[contenteditable="true"]')).toBeNull()
      expect(document.body.querySelector('.performance-review-completion-notice__icon')).not.toBeNull()
      const edit = document.body.querySelector<HTMLButtonElement>('.performance-review-completion-notice__edit')
      expect(Boolean(edit)).toBe(editable)
      if (edit) {
        edit.click()
        await flushPromises()
        expect(wrapper.emitted('edit')).toEqual([[{ task_id: 145, employee_no: 'E001', draft_choice: undefined }]])
      }
    } finally {
      wrapper.unmount()
      vi.useRealTimers()
    }
  })

  it('does not expose calibration editing after the effective deadline even if a stale response says editable', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({ ...structuredClone(task), task_kind: 'calibration', editable: true, submit_allowed: true, deadline_at: '2000-11-10T12:00:00Z', answer_submissions: [{ display_name: '终评人', submitted_at: '2000-11-10T08:37:00Z' }] })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    await flushPromises()
    expect(document.body.textContent).toContain('该环节已在 2000-11-10 20:00（GMT+8） 截止')
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    wrapper.unmount()
  })

  it.each(['calibration', 'evaluation'])('shows only the last trusted submitter and timestamp with one edit action: %s', async taskKind => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task), task_kind: taskKind, submitted_at: null, deadline_at: '2099-11-18T12:00:00Z',
      answer_submissions: [
        { display_name: '终评人甲', submitted_at: '2026-11-10T08:37:00Z' },
        { display_name: '终评人乙', submitted_at: '2026-11-10T09:00:00Z' },
      ],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    await flushPromises()
    const notices = document.body.querySelectorAll('.performance-review-completion-notice')
    expect(notices).toHaveLength(1)
    expect(notices[0].textContent).toContain('终评人乙')
    expect(notices[0].textContent).toContain('2026-11-10 17:00')
    expect(notices[0].textContent).not.toContain('终评人甲')
    expect(document.body.querySelectorAll('.performance-review-completion-notice__edit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('does not claim a calibration submission when metadata is unavailable or expose edit to readonly viewers', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({ ...structuredClone(task), task_kind: 'calibration', submitted_at: null, answer_submissions: [], deadline_at: '2099-11-18T12:00:00Z' })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001', readonly: true } })
    await flushPromises()
    expect(document.body.textContent).toContain('以下为当前绩效结果')
    expect(document.body.textContent).not.toContain('该评估内容已提交')
    expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    wrapper.unmount()
  })

  it('replaces completion messages with the exact lock notice and keeps current server answers readonly', async () => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({ ...structuredClone(task), final_result_locked: true, editable: true, submit_allowed: true, answers: { good: '当前生效校准结果' }, answer_submissions: [{ display_name: '原终评人', submitted_at: '2026-09-22T07:00:00Z' }, { display_name: '校准人', submitted_at: '2026-09-22T08:00:00Z' }] })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145 } })
    try {
      await flushPromises()
      expect(document.body.querySelector('.performance-review-completion-notice__description')?.textContent).toBe('当前结果已完成校准，你无法再次修改')
      expect(document.body.querySelectorAll('.performance-review-completion-notice')).toHaveLength(2)
      expect(document.body.textContent).toContain('以下内容由 校准人')
      expect(document.body.textContent).not.toContain('原终评人')
      expect(document.body.textContent).toContain('当前生效校准结果')
      expect(document.body.textContent).not.toContain('继续编辑')
      expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
      expect(document.body.querySelector('[contenteditable="true"]')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it.each(['pending', 'completed'] as const)('renders a %s locked management tab schema instead of an empty or fill state', async status => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task), task_id: null, final_result_locked: false,
      management_tabs: [{ key: 'final', node_id: 'final', node_name: '终评', status, employee_no: 'E001', final_result_locked: true, can_remind: false, form_schema: task.form_schema, answers: { good: '锁定页签当前答案' } }], default_active_tab: 'final',
      stage_views: [{ node_id: 'final', anonymous: false, can_fill: true, task_id: 12, final_result_locked: true }],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    try {
      await flushPromises()
      expect(document.body.textContent).toContain('当前结果已完成校准，你无法再次修改')
      expect(document.body.textContent).toContain('锁定页签当前答案')
      expect(document.body.textContent).not.toContain('暂未提交')
      expect(document.body.querySelector('.performance-stage-empty__fill')).toBeNull()
      expect(document.body.querySelector('.performance-review-completion-notice__edit')).toBeNull()
    } finally { wrapper.unmount() }
  })

  it.each([false, true])('uses each management tab audit pair without exposing anonymous names: anonymous=%s', async anonymous => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task), node_id: 'manager', answer_submissions: [{ display_name: '顶层旧提交人', submitted_at: task.submitted_at }],
      management_tabs: [
        { key: 'manager', node_id: 'manager', node_name: '上级评估', task_id: 145, status: 'completed', employee_no: 'E001', submitted_at: task.submitted_at, submitted_by: '错误处理人', answer_submissions: [{ display_name: '主页签较早提交人', submitted_at: '2026-09-22T07:00:00Z' }, { display_name: '主页签真实提交人', submitted_at: '2026-09-22T08:00:00Z' }], can_remind: false, form_schema: task.form_schema, answers: task.answers },
        { key: 'other', node_id: 'other', node_name: '其他评估', task_id: 999, status: 'completed', employee_no: 'E001', submitted_at: task.submitted_at, submitted_by: '其他错误处理人', answer_submissions: [{ display_name: '其他较早提交人', submitted_at: '2026-09-22T07:30:00Z' }, { display_name: '其他真实提交人', submitted_at: '2026-09-22T09:00:00Z' }], can_remind: false, form_schema: task.form_schema, answers: task.answers },
      ], default_active_tab: 'manager', stage_views: [{ node_id: 'other', anonymous }],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, detailLoader } })
    try {
      await flushPromises()
      expect(document.body.textContent).toContain('主页签真实提交人 在 2026-09-22 16:00')
      expect(document.body.textContent).not.toContain('顶层旧提交人')
      expect(document.body.textContent).not.toContain('主页签较早提交人')
      expect(document.body.querySelectorAll('.performance-review-completion-notice')).toHaveLength(1)
      expect(document.body.textContent).not.toContain('错误处理人')
      ;(document.body.querySelectorAll('.performance-drawer .line-tab')[1] as HTMLButtonElement).click()
      await flushPromises()
      if (anonymous) expect(document.body.textContent).not.toContain('其他真实提交人')
      else expect(document.body.textContent).toContain('其他真实提交人 在 2026-09-22 17:00')
      expect(document.body.textContent).not.toContain('其他错误处理人')
      expect(document.body.textContent).not.toContain('其他较早提交人')
      expect(document.body.querySelectorAll('.performance-review-completion-notice').length).toBeLessThanOrEqual(1)
    } finally { wrapper.unmount() }
  })

  it.each([false, true])('renders pending management 360 references with partial submissions or a permission empty state: empty=%s', async empty => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task), task_id: null, editable: false, submit_allowed: false,
      management_tabs: [{ key: 'management-feedback', kind: 'reviewer_360', node_id: 'feedback', node_name: '360°反馈', employee_no: 'E001', status: 'pending', form_schema: [], answers: {}, can_remind: false, expected_count: empty ? undefined : 3, reviewers: empty ? [] : [
        { task_id: 20, reviewer: { employee_no: 'E020', display_name: '真实评估人甲' }, form_schema: task.form_schema, answers: { good: '真实反馈甲' } },
        { task_id: 21, reviewer: { employee_no: 'E021', display_name: '真实评估人乙' }, form_schema: task.form_schema, answers: { good: '真实反馈乙' } },
      ] }],
      default_active_tab: 'management-feedback',
      stage_views: [{ node_id: 'feedback', node_type: 'evaluation', status: 'pending', can_fill: true, task_id: 99, anonymous: false }],
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', readonly: true, detailLoader } })
    try {
      await flushPromises()
      expect(document.body.querySelector('.r360-preview')).not.toBeNull()
      expect(document.body.querySelector('.performance-stage-empty')).toBeNull()
      expect(document.body.querySelector('.performance-stage-empty__fill')).toBeNull()
      expect(document.body.querySelector('[contenteditable="true"]')).toBeNull()
      if (empty) {
        expect(document.body.textContent).toContain('暂无可查看内容')
        expect(document.body.querySelector('.r360-runtime-card')).toBeNull()
        expect(document.body.textContent).not.toContain('评估人甲')
      } else {
        expect(document.body.textContent).toContain('已评估2/3')
        const cards = Array.from(document.body.querySelectorAll('.r360-runtime-card'))
        expect(cards).toHaveLength(2)
        expect(cards[0].textContent).toContain('真实评估人甲')
        expect(cards[0].textContent).toContain('真实反馈甲')
        expect(cards[0].textContent).not.toContain('真实反馈乙')
        expect(cards[1].textContent).toContain('真实评估人乙')
        expect(cards[1].textContent).toContain('真实反馈乙')
        expect(cards[1].textContent).not.toContain('真实反馈甲')
      }
      expect(wrapper.emitted('edit')).toBeUndefined()
    } finally { wrapper.unmount() }
  })

  it.each([false, true])('keeps the allowed 360 reminder inside the shared ratio popover: allowed=%s', async allowed => {
    vi.mocked(performanceReviewApi.templateTask).mockResolvedValue({
      ...structuredClone(task), task_kind: 'evaluation',
      management_tabs: [{ key: 'management-feedback', kind: 'reviewer_360', node_id: 'feedback', node_name: '360°反馈', employee_no: 'E001', task_id: null, status: 'pending', can_remind: allowed, form_schema: [], answers: {}, reviewers: [], expected_count: 2, evaluate_ratio: { completion: '0/2', evaluated: [], pending: [{ name: '未评估人甲', dimission: false }, { name: '未评估人乙', dimission: false }], dimission_count: 0, invite_stage: 'in_progress' } }],
      default_active_tab: 'management-feedback',
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, taskId: 145, employeeNo: 'E001' } })
    await flushPromises()
    expect(document.body.querySelector('.performance-remind-button--outline')).toBeNull()
    document.body.querySelector('.evaluate-ratio-anchor')!.dispatchEvent(new MouseEvent('mouseenter'))
    await flushPromises()
    const button = document.body.querySelector<HTMLButtonElement>('.evaluate-ratio-popover .performance-remind-button--text')
    expect(Boolean(button)).toBe(allowed)
    if (button) {
      button.click()
      await flushPromises()
      expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ kind: 'reviewer_360', node_id: 'feedback', task_id: null, employee_no: 'E001' }), 145]])
    }
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
    await flushPromises()
    expect(document.body.textContent).toContain('暂未提交')
    expect(document.body.querySelector('.performance-remind-button')).not.toBeNull()
    await (document.body.querySelector('.performance-remind-button') as HTMLButtonElement).click()
    await flushPromises()
    expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ node_id: 'work-summary-1', task_id: 201 }), 145]])
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

  it('allows the submitted current management tab to re-enter editing before its deadline', async () => {
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      deadline_at: '2026-12-03T15:59:00Z',
      management_tabs: [{
        key: 'management-manager-review',
        node_id: 'manager-review',
        node_name: '上级评估',
        kind: 'node',
        task_id: 145,
        task_kind: 'evaluation',
        employee_no: 'E001',
        status: 'completed',
        submitted_at: '2026-11-09T07:29:00Z',
        deadline_at: '2026-12-03T15:59:00Z',
        can_remind: false,
        form_schema: task.form_schema,
        answers: task.answers,
      }],
      default_active_tab: 'management-manager-review',
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, {
      props: { modelValue: true, taskId: 145, employeeNo: 'E001', detailLoader },
      global: { stubs: { PerformanceTemplateRenderer: true } },
    })
    await flushPromises()

    const edit = document.body.querySelector<HTMLButtonElement>('.performance-review-completion-notice__edit')
    expect(edit).not.toBeNull()
    edit!.click()
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 145, employee_no: 'E001', draft_choice: undefined }]])
    wrapper.unmount()
  })

  it('keeps management-only completed results readonly', async () => {
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
    await flushPromises()
    expect(wrapper.emitted('edit')).toEqual([[{ task_id: 145, employee_no: 'E001', draft_choice: undefined }]])

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
    const preview = { title: '绩效任务提醒', description: '请尽快前往绩效系统为@rita.tang唐洁完成自评。', stage_label: '自评', deadline_at: '2026-11-21T23:59:00Z', cycle_name: '测试绩效', cycle_start_at: '2026-01-01T00:00:00Z', cycle_end_at: '2026-12-31T23:59:00Z', reminder_name: 'gaby.liu刘琦', stage_type: '自评', assessee_name: 'rita.tang唐洁' }
    vi.spyOn(projectManagementApi, 'memberReminderPreview').mockResolvedValue(preview)
    const detailLoader = vi.fn().mockResolvedValue({
      ...structuredClone(task),
      task_id: null,
      editable: false,
      submit_allowed: false,
      node_name: '自评',
      management_tabs: [{ key: 'management-summary', node_id: 'summary', node_name: '自评', kind: 'node', status: 'pending', task_id: 12, task_kind: 'work_summary', employee_no: 'E001', can_remind: false, submitted_at: null, deadline_at: null, form_schema: [], answers: {} }],
      default_active_tab: 'management-summary',
      stage_views: [{ node_id: 'summary', node_type: 'work_summary', node_name: '自评', key: 'management-summary', status: 'pending', task_id: 12, task_kind: 'work_summary', deadline_at: null, submitted_at: null, empty: false, can_fill: false, can_remind: true, reminder_target: 'rita.tang唐洁', anonymous: false }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    const remind = document.body.querySelector<HTMLButtonElement>('.performance-stage-empty .performance-remind-button')!
    expect(remind).not.toBeNull()
    remind.click()
    await flushPromises()
    expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ node_id: 'summary', task_id: 12, employee_no: 'E001' }), undefined]])
    expect(document.body.querySelector('.performance-confirm-dialog')).toBeNull()
    expect(projectManagementApi.memberReminderPreview).not.toHaveBeenCalled()
    expect(previewCardSource).toContain(':deep(.reminder-preview-card__name){color:#3370ff;font-weight:600}')
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
      stage_views: [{ node_id: 'summary', node_type: 'work_summary', node_name: '自评', key: 'management-summary', status: 'pending', task_id: 12, task_kind: 'work_summary', deadline_at: null, submitted_at: null, empty: false, can_fill: false, can_remind: true, reminder_target: 'rita.tang唐洁', anonymous: false }],
      cycle: { name: '测试绩效', start_at: '2026-01-01T00:00:00Z', end_at: '2026-12-31T23:59:00Z' },
    })
    const wrapper = mount(PerformanceReviewEvaluationDrawer, { props: { modelValue: true, employeeNo: 'E001', projectId: 1, readonly: true, detailLoader } })
    await flushPromises()
    ;(document.body.querySelector<HTMLButtonElement>('.performance-stage-empty .performance-remind-button')!).click()
    await flushPromises()
    expect(wrapper.emitted('remind')).toEqual([[expect.objectContaining({ node_id: 'summary', employee_no: 'E001' }), undefined]])
    expect(projectManagementApi.memberRemind).not.toHaveBeenCalled()
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
