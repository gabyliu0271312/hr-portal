import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceComparisonRuleSettings from './PerformanceComparisonRuleSettings.vue'
import PerformanceComparisonRuleDrawer from './PerformanceComparisonRuleDrawer.vue'
import PerformanceConfirmDialog from './PerformanceConfirmDialog.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import type { PerformanceComparisonRule } from '@/api/performance'
const options = vi.hoisted(() => vi.fn())
vi.mock('@/api/performance', () => ({ performanceCycleApi: { comparisonOptions: options } }))
const rule: PerformanceComparisonRule = { id: 'r1', template_id: 101, first_node_id: 'self', second_node_id: 'manager', indicator_diff_rules: [{ content_id: 'content', item_id: 'rating', operator: 'eq', threshold: 1 }], show_notice_in_review: true, fill_in_diff_reason: false, diff_reason_required: true, send_notification: false }
const stubs = { PerformanceComparisonRuleDrawer: true, PerformanceConfirmDialog: true }
beforeEach(() => options.mockReset().mockResolvedValue({ templates: [{ template_id: 101, name: '年度模板', stages: [{ node_id: 'self', name: '员工自评' }, { node_id: 'manager', name: '上级评价' }] }], items: [{ content_id: 'content', item_id: 'rating', label: '绩效评级', option_ids: ['a', 'b'] }], warnings: [] }))
describe('PerformanceComparisonRuleSettings', () => {
  it('offers one group only and uses real names for edit/delete summary', async () => {
    const wrapper = mount(PerformanceComparisonRuleSettings, { props: { modelValue: [rule], templateIds: [101], cycleId: 3 }, global: { stubs } })
    await flushPromises()
    expect(wrapper.text()).toContain('员工自评')
    expect(wrapper.text()).toContain('与')
    expect(wrapper.text()).toContain('上级评价')
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(['对比环节', '评估项差异规则', '差异提示方式', '操作'])
    expect(wrapper.text()).toContain('绩效评级')
    expect(wrapper.text()).toContain('相差 =')
    expect(wrapper.text()).toContain('1 档')
    expect(wrapper.text()).toContain('评估过程中展示差异提示')
    expect(options).toHaveBeenCalledWith({ template_ids: [101], cycle_id: 3, template_id: 101, first_node_id: 'self', second_node_id: 'manager' })
    expect(wrapper.find('.evaluation-result-rule-add').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === '编辑')!.trigger('click')
    expect(wrapper.getComponent(PerformanceComparisonRuleDrawer).props()).toMatchObject({ modelValue: true, initialValue: rule, templateIds: [101], cycleId: 3 })
    wrapper.getComponent(PerformanceComparisonRuleDrawer).vm.$emit('submit', { ...rule, show_notice_in_review: false })
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([{ ...rule, show_notice_in_review: false }])
    wrapper.unmount()
  })
  it('uses the requested copy and requires exact confirmation before delete', async () => {
    const wrapper = mount(PerformanceComparisonRuleSettings, { props: { modelValue: [rule], templateIds: [101] }, global: { stubs } })
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    const confirm = wrapper.getComponent(PerformanceConfirmDialog)
    expect(confirm.props()).toMatchObject({ message: '确定删除此对比的环节？', description: '删除后将不再触发差异提示，若已产生的差异提示也会不再展示。确定删除吗？', requireConfirm: true, confirmLabel: '请输入「确认删除」以确认当前操作', cancelText: '保留', confirmText: '删除' })
    expect(confirm.props('modelValue')).toBe(true)
    wrapper.unmount()
  })


  it('locks add/edit from server capability, not dates, while retaining delete confirmation and failures', async () => {
    const wrapper = mount(PerformanceComparisonRuleSettings, { props: { modelValue: [rule], templateIds: [101], editable: false, editableReason: '已有项目启动' }, global: { stubs } })
    const buttons = wrapper.findAll('button')
    expect(buttons.find(button => button.text() === '编辑')!.attributes('disabled')).toBeDefined()
    await buttons.find(button => button.text() === '删除')!.trigger('click')
    const confirm = wrapper.getComponent(PerformanceConfirmDialog)
    expect(confirm.props('modelValue')).toBe(true)
    confirm.vm.$emit('confirm')
    expect(wrapper.emitted('remove')).toHaveLength(1)
    await wrapper.setProps({ deleteError: '版本冲突，请重新打开周期' })
    expect(confirm.props('errorMessage')).toBe('版本冲突，请重新打开周期')
    expect(confirm.props('modelValue')).toBe(true)
    await wrapper.setProps({ modelValue: [] })
    expect(wrapper.getComponent(PerformanceConfirmDialog).props('modelValue')).toBe(false)
    expect(wrapper.get('.evaluation-result-rule-add').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
  it('shows current-project lock copy for add and edit actions', async () => {
    const wrapper = mount(PerformanceComparisonRuleSettings, { props: { modelValue: [rule], templateIds: [101], editable: false }, global: { stubs } })
    await flushPromises()
    expect(wrapper.getComponent(PerformanceDisabledReason).props('reason')).toBe('已有启动项目，暂不支持修改')
    await wrapper.setProps({ modelValue: [] })
    expect(wrapper.getComponent(PerformanceDisabledReason).props('reason')).toBe('已有启动项目，不支持添加')
    wrapper.unmount()
  })


  it('does not load candidates for an empty draft and requires a selected template', async () => {
    const wrapper = mount(PerformanceComparisonRuleSettings, { props: { modelValue: [], templateIds: [] }, global: { stubs } })
    expect(options).not.toHaveBeenCalled()
    expect(wrapper.get('.evaluation-result-rule-add').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ templateIds: [101] })
    await wrapper.get('.evaluation-result-rule-add').trigger('click')
    expect(wrapper.getComponent(PerformanceComparisonRuleDrawer).props('modelValue')).toBe(true)
    wrapper.unmount()
  })
})
