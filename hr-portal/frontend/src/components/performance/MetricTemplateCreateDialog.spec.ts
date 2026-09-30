import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import MetricTemplateCreateDialog from './MetricTemplateCreateDialog.vue'

const stubs = {
  PerformanceDialogShell: {
    props: ['modelValue', 'title', 'width'],
    emits: ['update:modelValue', 'close'],
    template: '<section v-if="modelValue" role="dialog" :data-width="width"><h2>{{ title }}</h2><button class="close-dialog" @click="$emit(\'close\'); $emit(\'update:modelValue\', false)">关闭</button><slot /><footer><slot name="footer" /></footer></section>',
  },
}

describe('MetricTemplateCreateDialog', () => {
  it('renders captured fields and keeps invalid name in place', async () => {
    const wrapper = mount(MetricTemplateCreateDialog, { props: { modelValue: true }, global: { stubs } })
    expect(wrapper.get('[role="dialog"]').attributes('data-width')).toBe('600px')
    expect(wrapper.get('h2').text()).toBe('新建指标模板')
    expect(wrapper.get('#metric-template-name').attributes('placeholder')).toBe('请输入名称')
    expect(wrapper.get('#metric-template-description').attributes('placeholder')).toBe('请输入')
    expect(wrapper.findAll('.localized-input-language').map(tag => tag.text())).toEqual(['中文', '中文'])
    expect(wrapper.findAll('.localized-input-add').map(button => button.text())).toEqual(['添加英文', '添加英文'])
    expect(wrapper.get('.localized-input-shell').element.nextElementSibling?.textContent).toContain('添加英文')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('false')
    await wrapper.get('.metric-template-dialog-footer .performance-button--primary').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入名称')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    wrapper.unmount()
  })

  it('emits trimmed draft without claiming it has been saved', async () => {
    const wrapper = mount(MetricTemplateCreateDialog, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('#metric-template-name').setValue('  季度指标  ')
    await wrapper.get('#metric-template-description').setValue('  目标  ')
    await wrapper.get('[role="switch"]').trigger('click')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    await wrapper.get('.metric-template-dialog-footer .performance-button--primary').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]).toEqual([{ name: '季度指标', description: '目标', byAudience: true }])
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    await wrapper.get('.metric-template-dialog-footer .performance-button--secondary').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('shows the English entry below each field and clears form on reopen', async () => {
    const wrapper = mount(MetricTemplateCreateDialog, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('#metric-template-name').setValue('临时名称')
    await wrapper.get('[aria-label="添加英文"]').trigger('click')
    expect(wrapper.get('[role="status"]').text()).toContain('添加英文功能暂未接入')
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    expect((wrapper.get('#metric-template-name').element as HTMLInputElement).value).toBe('')
    expect(wrapper.find('[role="status"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('uses the shared dialog close button to dismiss the form', async () => {
    const wrapper = mount(MetricTemplateCreateDialog, { props: { modelValue: true }, attachTo: document.body })
    expect(document.querySelector('.performance-dialog')?.getAttribute('role')).toBe('dialog')
    ;(document.querySelector('.performance-dialog__close') as HTMLButtonElement).click()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    await wrapper.setProps({ modelValue: false })
    expect(document.querySelector('.performance-dialog')).toBeNull()
    wrapper.unmount()
  })

  it('reuses the dialog for edit mode with initial values', async () => {
    const wrapper = mount(MetricTemplateCreateDialog, {
      props: { modelValue: true, mode: 'edit', initialValue: { name: '已有模板', description: '已有描述', byAudience: true } },
      global: { stubs },
    })
    expect(wrapper.get('h2').text()).toBe('编辑指标模板')
    expect((wrapper.get('#metric-template-name').element as HTMLInputElement).value).toBe('已有模板')
    expect((wrapper.get('#metric-template-description').element as HTMLInputElement).value).toBe('已有描述')
    expect(wrapper.get('[role="switch"]').attributes('aria-checked')).toBe('true')
    wrapper.unmount()
  })

})
