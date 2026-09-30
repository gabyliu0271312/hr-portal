import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricFieldCreateDialog from './PerformanceMetricFieldCreateDialog.vue'
import PerformanceDialogShell from './PerformanceDialogShell.vue'
import PerformanceLocalizedInput from './PerformanceLocalizedInput.vue'
import PerformanceRadioGroup from './PerformanceRadioGroup.vue'
import PerformanceButton from './PerformanceButton.vue'

function render(props = {}) {
  return mount(PerformanceMetricFieldCreateDialog, { props: { modelValue: true, ...props }, global: { stubs: { Teleport: true } } })
}

describe('PM-T017-T04 metric field create dialog', () => {
  it('reuses shared controls with the captured order and only three allowed types', () => {
    const wrapper = render()
    expect(wrapper.findComponent(PerformanceDialogShell).props('width')).toBe('600px')
    expect(wrapper.findComponent(PerformanceLocalizedInput).exists()).toBe(true)
    expect(wrapper.findComponent(PerformanceRadioGroup).exists()).toBe(true)
    expect(wrapper.get('h2').text()).toBe('新建字段')
    expect(wrapper.get('#metric-field-name').attributes('placeholder')).toBe('请输入')
    expect(wrapper.get('#metric-field-name').attributes('maxlength')).toBe('128')
    expect(wrapper.get('.localized-input-language').text()).toBe('中文')
    expect(wrapper.findAll('.performance-form-item__label').map(item => item.text())).toEqual(['名称*', '字段类型*'])
    expect(wrapper.findAll('.radio-label').map(item => item.text())).toEqual(['文本', '数字', '百分比'])
    expect((wrapper.get('input[value="text"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.findAllComponents(PerformanceButton).map(button => button.text())).toEqual(['取消', '确定'])
    expect(wrapper.text()).not.toContain('人员单选')
    expect(wrapper.text()).not.toContain('字段编码')
    expect(wrapper.text()).not.toContain('描述')
    wrapper.unmount()
  })

  it('reuses the add-English text button without adding a field or submitting', async () => {
    const wrapper = render()
    const button = wrapper.get('button[aria-label="添加英文"]')
    expect(button.text()).toBe('添加英文')
    expect(button.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    expect(button.classes()).toContain('text-button')
    await button.trigger('click')
    expect(wrapper.get('[role="status"]').text()).toBe('添加英文功能暂未接入')
    expect(wrapper.findAll('input:not([type="radio"])')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('rejects blank names and emits trimmed names and the selected type', async () => {
    const wrapper = render()
    await wrapper.get('#metric-field-name').setValue('  ')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入名称')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    await wrapper.get('#metric-field-name').setValue('  达成率  ')
    await wrapper.get('input[value="percentage"]').setValue(true)
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toEqual([[{ name: '达成率', field_type: 'percentage' }]])
    wrapper.unmount()
  })

  it('cancels without submitting, resets on reopen and preserves values on errors', async () => {
    const wrapper = render()
    await wrapper.get('#metric-field-name').setValue('待保存字段')
    await wrapper.get('input[value="number"]').setValue(true)
    await wrapper.setProps({ errorMessage: '字段保存失败，请重试' })
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('待保存字段')
    expect(wrapper.get('[role="alert"]').text()).toContain('保存失败')
    await wrapper.findAllComponents(PerformanceButton)[0].trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true, errorMessage: '' })
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('input[value="text"]').element as HTMLInputElement).checked).toBe(true)
    wrapper.unmount()
  })

  it('reuses the create form to edit an existing field and locks only a referenced type', async () => {
    const wrapper = render({ mode: 'edit', initialValue: { name: '已有字段', field_type: 'percentage' }, typeLocked: true })
    expect(wrapper.get('h2').text()).toBe('编辑字段')
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('已有字段')
    expect(wrapper.get('#metric-field-name').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('input[type="radio"]').every(input => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.text()).toContain('不允许修改类型')
    await wrapper.get('#metric-field-name').setValue('重命名')
    wrapper.getComponent(PerformanceRadioGroup).vm.$emit('update:modelValue', 'number')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('confirm')).toEqual([[{ name: '重命名', field_type: 'percentage' }]])
    wrapper.unmount()
  })

  it('disables inputs, cancellation and duplicate submission while saving', async () => {
    const wrapper = render({ saving: true })
    expect(wrapper.get('#metric-field-name').attributes('disabled')).toBeDefined()
    expect(wrapper.findAll('input[type="radio"]').every(input => input.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.findAllComponents(PerformanceButton).every(button => button.attributes('disabled') !== undefined)).toBe(true)
    await wrapper.get('form').trigger('submit')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })
})
