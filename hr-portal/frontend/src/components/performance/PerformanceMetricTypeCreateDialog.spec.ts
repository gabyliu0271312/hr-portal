import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricTypeCreateDialog from './PerformanceMetricTypeCreateDialog.vue'

const fieldOptions = [
  { id: 1, name: '指标', field_type: 'text' as const, is_system: true },
  { id: 2, name: '权重', field_type: 'percentage' as const, is_system: true },
]

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title', 'loading'],
    template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><footer><slot name="footer" /></footer></div>',
  },
}

describe('PerformanceMetricTypeCreateDialog', () => {
  it('validates name and at least one field', async () => {
    const wrapper = mount(PerformanceMetricTypeCreateDialog, {
      props: { modelValue: true, fieldOptions },
      global: { stubs },
    })

    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('请输入名称')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('keeps the shared plus-label picker visible and restores a removed field', async () => {
    const wrapper = mount(PerformanceMetricTypeCreateDialog, {
      props: { modelValue: true, fieldOptions },
      global: { stubs },
    })
    const picker = wrapper.get('.metric-type-fields__picker .text-button')
    expect(picker.text()).toBe('选择字段')
    expect(picker.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    expect(picker.attributes('aria-expanded')).toBe('false')
    await picker.trigger('click')
    expect(picker.attributes('aria-expanded')).toBe('true')
    expect(document.body.querySelector('[aria-label="可添加指标字段"]')?.textContent).toContain('暂无可添加字段')
    await wrapper.get('.performance-metric-field-row__remove').trigger('click')
    expect(wrapper.findAll('.performance-metric-field-row')).toHaveLength(1)
    expect(document.body.querySelector('[aria-label="可添加指标字段"]')?.textContent).toContain('权重')
    const pickerCheckbox = document.body.querySelector<HTMLInputElement>('[aria-label="可添加指标字段"] input[type="checkbox"]')
    expect(pickerCheckbox).not.toBeNull()
    pickerCheckbox!.checked = true
    pickerCheckbox!.dispatchEvent(new Event('change', { bubbles: true }))
    document.body.querySelector<HTMLButtonElement>('.metric-type-field-picker__footer .performance-button--primary')?.click()
    await flushPromises()
    expect(wrapper.findAll('.performance-metric-field-row')).toHaveLength(2)
    expect(picker.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    await wrapper.setProps({ saving: true })
    expect(picker.attributes('disabled')).toBeDefined()
  })

  it('emits the ordered field IDs after selecting and dragging fields', async () => {
    const wrapper = mount(PerformanceMetricTypeCreateDialog, {
      props: { modelValue: true, fieldOptions },
      global: { stubs },
    })

    await wrapper.get('#metric-type-name').setValue('定量指标')
    await flushPromises()
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
    expect(wrapper.findAll('.performance-metric-field-row')).toHaveLength(2)
    expect(wrapper.findAll('[data-icon="StyleOutlined"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-icon="SheetPercentOutlined"]')).toHaveLength(1)
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('confirm')).toEqual([[{ name: '定量指标', field_ids: [1, 2] }]])
  })
})
