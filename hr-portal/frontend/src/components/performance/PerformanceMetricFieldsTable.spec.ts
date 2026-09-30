import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { ElTableColumn } from 'element-plus'
import PerformanceButton from './PerformanceButton.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import PerformanceInfoPopover from './PerformanceInfoPopover.vue'
import PerformanceMetricFieldsTable from './PerformanceMetricFieldsTable.vue'

enableAutoUnmount(afterEach)
const systemRows = [
  { id: 1, name: '指标', type: '文本' }, { id: 2, name: '权重', type: '百分比' },
  { id: 3, name: '指标单位', type: '文本' }, { id: 4, name: '目标值', type: '数字' },
  { id: 5, name: '完成值', type: '数字' }, { id: 6, name: '完成说明', type: '文本' },
  { id: 7, name: '指标评价人', type: '人员单选' },
].map(row => ({ ...row, isSystem: true }))
const customRow = { id: 101, name: '自定义字段', type: '文本', isSystem: false }

async function render(props = {}) {
  const wrapper = mount(PerformanceMetricFieldsTable, {
    props: { rows: systemRows, ...props },
    global: { components: { ElTableColumn } },
  })
  await flushPromises()
  return wrapper
}

describe('PM-T017-T04 protected system field actions', () => {
  it('disables all fourteen actions on seven system rows even when other actions are enabled', async () => {
    const wrapper = await render({ actionsDisabled: false })
    const buttons = wrapper.findAll('.metric-field-actions button')
    expect(buttons).toHaveLength(14)
    for (const button of buttons) {
      expect(button.classes()).toContain('performance-button--link')
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
    }
    const reasons = wrapper.findAllComponents(PerformanceDisabledReason)
    expect(reasons).toHaveLength(14)
    expect(reasons.every(reason => reason.props('disabled') && reason.props('variant') === 'popover')).toBe(true)
    expect(reasons.filter(reason => reason.props('reason') === '系统预置字段，不允许编辑')).toHaveLength(7)
    expect(reasons.filter(reason => reason.props('reason') === '系统预置字段，不允许删除')).toHaveLength(7)
    for (const button of wrapper.findAllComponents(PerformanceButton)) {
      button.vm.$emit('click', new MouseEvent('click'))
    }
    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('keeps custom field actions disabled by default until their workflow is connected', async () => {
    const wrapper = await render({ rows: [customRow] })
    expect(wrapper.findComponent(PerformanceInfoPopover).exists()).toBe(false)
    expect(wrapper.findAll('.metric-field-actions button')).toHaveLength(2)
    for (const button of wrapper.findAll('.metric-field-actions button')) {
      expect(button.attributes('disabled')).toBeDefined()
      await button.trigger('click')
    }
    expect(wrapper.emitted('edit')).toBeUndefined()
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('shows the stable business number but emits the internal ID for edits', async () => {
    const row = { ...customRow, id: 61, displayId: 8 }
    const wrapper = await render({ rows: [row], actionsDisabled: false })
    expect(wrapper.get('.el-table__body tbody tr td:first-child').text()).toBe('8')
    await wrapper.findAll('.metric-field-actions button')[0].trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[row]])
    expect((wrapper.emitted('edit')![0][0] as typeof row).id).toBe(61)
  })

  it('allows renaming a referenced custom field but disables its delete action', async () => {
    const wrapper = await render({ rows: [{ ...customRow, inUse: true }], actionsDisabled: false })
    const buttons = wrapper.findAll('.metric-field-actions button')
    expect(buttons[0].attributes('disabled')).toBeUndefined()
    expect(buttons[1].attributes('disabled')).toBeDefined()
    expect(wrapper.findAllComponents(PerformanceDisabledReason)[1].props('reason')).toBe('该字段已被指标类型使用，不允许删除')
    wrapper.findAllComponents(PerformanceButton)[1].vm.$emit('click', new MouseEvent('click'))
    expect(wrapper.emitted('remove')).toBeUndefined()
  })

  it('only emits custom row actions when explicitly enabled', async () => {
    const wrapper = await render({ rows: [customRow], actionsDisabled: false })
    const buttons = wrapper.findAll('.metric-field-actions button')
    expect(buttons.every(button => button.attributes('disabled') === undefined)).toBe(true)
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(wrapper.emitted('edit')).toEqual([[customRow]])
    expect(wrapper.emitted('remove')).toEqual([[customRow]])
  })
})
