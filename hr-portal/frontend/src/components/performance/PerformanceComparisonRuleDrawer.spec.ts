import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceComparisonRuleDrawer from './PerformanceComparisonRuleDrawer.vue'
import PerformanceAssessmentSelect from './PerformanceAssessmentSelect.vue'
import PerformanceCheckbox from './PerformanceCheckbox.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import type { PerformanceComparisonCandidates, PerformanceComparisonRule } from '@/api/performance'
const mocks = vi.hoisted(() => ({ options: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceCycleApi: { comparisonOptions: mocks.options } }))
const candidates: PerformanceComparisonCandidates = {
  templates: [{ template_id: 101, name: '年度模板', stages: [{ node_id: 'self', name: '员工自评' }, { node_id: 'manager', name: '上级评价' }, { node_id: 'peer', name: '同事评价' }] }],
  items: [{ content_id: 'content', item_id: 'rating', label: '绩效等级', option_ids: ['a', 'b', 'c'] }], warnings: [],
}
const config: PerformanceComparisonRule = { id: 'rule-1', template_id: 101, first_node_id: 'self', second_node_id: 'manager', indicator_diff_rules: [{ content_id: 'content', item_id: 'rating', operator: 'gte', threshold: 2 }], show_notice_in_review: true, fill_in_diff_reason: true, diff_reason_required: false, send_notification: false }
const stubs = {
  UiDrawerShell: { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="drawer-shell"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
  PerformanceDrawerFooter: { props: ['confirmDisabled'], emits: ['confirm', 'cancel'], template: '<footer><button class="confirm" :disabled="confirmDisabled" @click="$emit(\'confirm\')">提交</button><button class="cancel" @click="$emit(\'cancel\')">取消</button></footer>' },
}
const wrappers: ReturnType<typeof mount>[] = []
async function mountDrawer(initialValue?: PerformanceComparisonRule) {
  const wrapper = mount(PerformanceComparisonRuleDrawer, { props: { modelValue: true, templateIds: [101], initialValue }, global: { stubs } })
  wrappers.push(wrapper)
  await flushPromises()
  return wrapper
}
async function selectStage(wrapper: Awaited<ReturnType<typeof mountDrawer>>, index: number, node: string, templateId = 101) {
  wrapper.findAllComponents(PerformanceAssessmentSelect)[index]!.vm.$emit('update:modelValue', JSON.stringify([templateId, node]))
  await flushPromises()
}
beforeEach(() => { mocks.options.mockReset(); mocks.options.mockResolvedValue(structuredClone(candidates)) })
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()) })
describe('PerformanceComparisonRuleDrawer', () => {
  it('loads real candidates only when open and never falls back to all items before a pair', async () => {
    const wrapper = await mountDrawer()
    expect(mocks.options).toHaveBeenCalledWith({ template_ids: [101] })
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('options')).toEqual([])
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('disabled')).toBe(false)
    await wrapper.get('[aria-label="评估项"]').trigger('click')
    expect(document.body.querySelector('[role="listbox"]')?.textContent).toContain('暂无可选选项')
    expect(wrapper.findAll('.comparison-rule-section__title').map(item => item.text())).toEqual(['需对比的评估环节*', '评估项差异规则*', '发生差异时的提示方式*'])
    expect(wrapper.get('[aria-label="删除第1条差异规则"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ modelValue: false })
    const calls = mocks.options.mock.calls.length
    await wrapper.setProps({ templateIds: [102] })
    expect(mocks.options).toHaveBeenCalledTimes(calls)
  })
  it('validates then emits canonical numeric rules and captured vertical reason settings', async () => {
    const wrapper = await mountDrawer()
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    expect(wrapper.findAll('.comparison-rule-error')).toHaveLength(3)
    await selectStage(wrapper, 0, 'self')
    await selectStage(wrapper, 1, 'manager')
    expect(mocks.options).toHaveBeenLastCalledWith({ template_ids: [101], template_id: 101, first_node_id: 'self', second_node_id: 'manager' })
    wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.vm.$emit('update:modelValue', JSON.stringify(['content', 'rating']))
    await wrapper.get('[aria-label="差异阈值"]').setValue('2')
    wrapper.findAllComponents(PerformanceCheckbox)[1]!.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(wrapper.getComponent(PerformanceRadioGroup).props()).toMatchObject({ direction: 'vertical', gap: 'var(--performance-comparison-rule-gap)', modelValue: 'required' })
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ template_id: 101, first_node_id: 'self', second_node_id: 'manager', indicator_diff_rules: [{ content_id: 'content', item_id: 'rating', operator: 'eq', threshold: 2 }], fill_in_diff_reason: true, diff_reason_required: true })
  })
  it('reopens an existing rule including optional reason and submits unchanged identity', async () => {
    const wrapper = await mountDrawer(config)
    expect(wrapper.getComponent(PerformanceRadioGroup).props('modelValue')).toBe('optional')
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('modelValue')).toBe(JSON.stringify(['content', 'rating']))
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual(config)
  })
  it('retains the draft after a failed request and supports retry with no item fallback', async () => {
    mocks.options.mockRejectedValueOnce(new Error('offline'))
    const wrapper = await mountDrawer(config)
    expect(wrapper.text()).toContain('可选项加载失败，请重试')
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('options')).toEqual([])
    await wrapper.findAll('button').find(button => button.text() === '重试')!.trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="差异阈值"]').element).toHaveProperty('value', '2')
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual(config)
  })
  it('discards stale pair responses and shows empty common items with directional warnings', async () => {
    const wrapper = await mountDrawer(config)
    let resolveOld!: (value: PerformanceComparisonCandidates) => void
    mocks.options.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    wrapper.findAllComponents(PerformanceAssessmentSelect)[1]!.vm.$emit('update:modelValue', JSON.stringify([101, 'peer']))
    await wrapper.vm.$nextTick()
    mocks.options.mockResolvedValueOnce({ ...candidates, items: [], warnings: [{ template_id: 101, stage_id: 'self', ref_stage_id: 'manager', content_id: 'content', item_id: 'rating', message: '该方向无查看权限' }] })
    await selectStage(wrapper, 1, 'manager')
    resolveOld(candidates)
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('options')).toEqual([])
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('emptyText')).toBe('暂无可选选项')
    expect(wrapper.text()).toContain('该方向无查看权限')
  })
  it('shows full directional warnings only for selected items and keeps rejected diagnostics', async () => {
    const warnings = [{ template_id: 101, stage_id: 'self', ref_stage_id: 'manager', content_id: 'content', item_id: 'rating', message: '该方向无权查看参考环节评估项，不会触发差异提示' }, { template_id: 101, stage_id: 'self', ref_stage_id: 'manager', content_id: 'repeated', item_id: 'ambiguous', message: '重复内容缺少稳定实例身份，不能配置' }]
    mocks.options.mockResolvedValue({ ...candidates, warnings })
    const wrapper = await mountDrawer()
    await selectStage(wrapper, 0, 'self')
    await selectStage(wrapper, 1, 'manager')
    expect(wrapper.text()).not.toContain('员工自评的环节执行人无法查看')
    expect(wrapper.text()).toContain('重复内容缺少稳定实例身份，不能配置')
    wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.vm.$emit('update:modelValue', JSON.stringify(['content', 'rating']))
    await flushPromises()
    expect(wrapper.text()).toContain('绩效模板「年度模板」中，员工自评的环节执行人无法查看上级评价的「绩效等级」评估项，不会触发对应评估项的差异提示。')
  })
  it('keeps selected items and the warning mounted while refreshing a pair', async () => {
    mocks.options.mockResolvedValue({ ...candidates, warnings: [{ template_id: 101, stage_id: 'self', ref_stage_id: 'manager', content_id: 'content', item_id: 'rating', message: '该方向无查看权限' }] })
    const wrapper = await mountDrawer(config)
    const warning = wrapper.get('.comparison-rule-warning').element
    let resolve!: (value: PerformanceComparisonCandidates) => void
    mocks.options.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    wrapper.findAllComponents(PerformanceAssessmentSelect)[1]!.vm.$emit('update:modelValue', JSON.stringify([101, 'peer']))
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.comparison-rule-warning').element).toBe(warning)
    expect(wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('options')).toEqual([{ id: JSON.stringify(['content', 'rating']), label: '绩效等级', disabled: true }])
    expect(wrapper.get('.comparison-rule-loading').text()).toBe('正在加载可选项...')
    expect(wrapper.get('.confirm').attributes('disabled')).toBeDefined()
    resolve(candidates)
    await flushPromises()
    expect(wrapper.find('.comparison-rule-loading').exists()).toBe(false)
    expect(wrapper.find('.comparison-rule-warning').exists()).toBe(false)
  })
  it('keeps template identities grouped and prevents pairing across templates or the same node', async () => {
    mocks.options.mockResolvedValue({ ...candidates, templates: [...candidates.templates, { template_id: 102, name: '第二模板', stages: candidates.templates[0]!.stages }] })
    const wrapper = await mountDrawer()
    await wrapper.setProps({ templateIds: [101, 102], cycleId: 7 })
    await flushPromises()
    await selectStage(wrapper, 0, 'self', 102)
    const selects = wrapper.findAllComponents(PerformanceAssessmentSelect)
    expect(selects[0]!.props('options')).toContainEqual(expect.objectContaining({ id: JSON.stringify([102, 'self']), description: '第二模板' }))
    expect(selects[1]!.props('options')).toEqual([{ id: JSON.stringify([102, 'manager']), label: '上级评价' }, { id: JSON.stringify([102, 'peer']), label: '同事评价' }])
  })
  it('disables used items for the same unordered stage pair and rejects a forged selection', async () => {
    const wrapper = await mountDrawer()
    await wrapper.setProps({ existingRules: [config] })
    await selectStage(wrapper, 0, 'self')
    await selectStage(wrapper, 1, 'manager')
    const itemSelect = () => wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!
    expect(itemSelect().props('options')).toContainEqual({ id: JSON.stringify(['content', 'rating']), label: '绩效等级', disabled: true, disabledReason: '已配置对比' })
    await wrapper.get('[aria-label="评估项"]').trigger('click')
    const option = document.body.querySelector<HTMLButtonElement>('[role="option"]')!
    expect(option.disabled).toBe(true)
    option.click()
    expect(itemSelect().props('modelValue')).toBe('')
    itemSelect().vm.$emit('update:modelValue', JSON.stringify(['content', 'rating']))
    await wrapper.get('[aria-label="差异阈值"]').setValue('2')
    wrapper.findAllComponents(PerformanceCheckbox)[0]!.vm.$emit('update:modelValue', true)
    await flushPromises()
    await wrapper.get('.confirm').trigger('click')
    expect(wrapper.emitted('submit')).toBeUndefined()
    await selectStage(wrapper, 1, 'peer')
    expect(itemSelect().props('options')?.[0]?.disabled).not.toBe(true)
    await selectStage(wrapper, 0, 'manager')
    await selectStage(wrapper, 1, 'self')
    expect(itemSelect().props('options')?.[0]?.disabled).toBe(true)
    expect(itemSelect().props('modelValue')).toBe('')
    await wrapper.setProps({ existingRules: [{ ...config, template_id: 102 }] })
    expect(itemSelect().props('options')?.[0]?.disabled).not.toBe(true)
  })
  it('keeps unused items selectable and releases them when an existing group is removed', async () => {
    mocks.options.mockResolvedValue({ ...candidates, items: [...candidates.items, { content_id: 'other', item_id: 'rating', label: '另一个评级项', option_ids: ['a', 'b'] }] })
    const wrapper = await mountDrawer()
    await wrapper.setProps({ existingRules: [config] })
    await selectStage(wrapper, 0, 'self')
    await selectStage(wrapper, 1, 'manager')
    const options = () => wrapper.findAllComponents(PerformanceAssessmentSelect)[2]!.props('options')
    expect(options()?.[0]?.disabled).toBe(true)
    expect(options()?.[1]?.disabled).not.toBe(true)
    await wrapper.setProps({ existingRules: [] })
    expect(options()?.[0]?.disabled).not.toBe(true)
  })
  it('keeps at least one condition and discards unsaved rows on reopen', async () => {
    const wrapper = await mountDrawer()
    await wrapper.get('.comparison-condition-add').trigger('click')
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(2)
    await wrapper.get('[aria-label="删除第2条差异规则"]').trigger('click')
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(1)
    await wrapper.get('.comparison-condition-add').trigger('click')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(wrapper.findAll('.comparison-condition-row')).toHaveLength(1)
  })
})
