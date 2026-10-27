import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceProjectTemplateField from './PerformanceProjectTemplateField.vue'
import PerformanceTemplatePickerDialog from './PerformanceTemplatePickerDialog.vue'
import PerformanceTemplatePreviewButton from './PerformanceTemplatePreviewButton.vue'

const templates = [
  { template_id: 11, name: '半年度绩效评估', description: '半年度评估-360自愿评估', status: 'active' as const },
  { template_id: 12, name: '全年度绩效评估', description: '全年度评估-360自愿评估', status: 'active' as const },
]
function field(extra = {}) {
  return mount(PerformanceProjectTemplateField, { props: { modelValue: null, templates, ...extra }, global: { stubs: { teleport: true } } })
}
function action(wrapper: ReturnType<typeof field>, text: string) { return wrapper.findAll('button').find(item => item.text() === text)! }

describe('project template selection', () => {
  it('opens the shared dialog from the centered text button and commits only on confirm', async () => {
    const wrapper = field()
    await action(wrapper, '选择绩效模板').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(action(wrapper, '确定').attributes('disabled')).toBeDefined()
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    await action(wrapper, '确定').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[12]])
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows the saved template card and reopens the same picker with its current selection', async () => {
    const wrapper = field({ modelValue: 11 })
    const picker = (wrapper.getComponent(PerformanceTemplatePickerDialog).vm as any).$.uid
    expect(wrapper.get('.selected-template').text()).toContain(templates[0].description)
    expect(wrapper.get('.template-tag').text()).toBe('绩效评估')
    await wrapper.get('[aria-label="切换绩效模板"]').trigger('click')
    expect((wrapper.getComponent(PerformanceTemplatePickerDialog).vm as any).$.uid).toBe(picker)
    expect((wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    await action(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.selected-template').text()).toContain(templates[0].name)
    await wrapper.get('[aria-label="切换绩效模板"]').trigger('click')
    expect((wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    await action(wrapper, '确定').trigger('click')
    await wrapper.setProps({ modelValue: 12 })
    expect(wrapper.get('.selected-template').text()).toContain(templates[1].name)
    wrapper.unmount()
  })

  it('reuses the disabled preview button in the card and every candidate', async () => {
    const wrapper = field({ modelValue: 11 })
    await wrapper.get('[aria-label="切换绩效模板"]').trigger('click')
    expect(wrapper.findAllComponents(PerformanceTemplatePreviewButton)).toHaveLength(3)
    const previews = wrapper.findAll('button').filter(item => item.attributes('aria-label')?.startsWith('预览'))
    expect(previews).toHaveLength(3)
    expect(previews.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it.each(['取消', '关闭'])('does not save a tentative selection when using %s', async label => {
    const wrapper = field({ modelValue: 11 })
    await wrapper.get('[aria-label="切换绩效模板"]').trigger('click')
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    if (label === '关闭') await wrapper.get('[aria-label="关闭"]').trigger('click')
    else await action(wrapper, label).trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('distinguishes empty, loading and failed states without global-library fallback', async () => {
    const wrapper = field({ templates: [] })
    await action(wrapper, '选择绩效模板').trigger('click')
    expect(wrapper.text()).toContain('当前周期尚未配置绩效模板')
    expect(action(wrapper, '确定').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ loading: true })
    expect(wrapper.text()).toContain('正在加载绩效模板')
    await wrapper.setProps({ loading: false, error: '加载失败' })
    expect(wrapper.find('[role="dialog"] [role="alert"]').text()).toContain('加载失败')
    await wrapper.find('[role="dialog"]').findAll('button').find(button => button.text() === '重试')!.trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
    wrapper.unmount()
  })

  it('prevents switching a locked project and selecting an inactive candidate', async () => {
    const wrapper = field({ modelValue: 11, disabled: true })
    expect(wrapper.get('[aria-label="切换绩效模板"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ disabled: false, templates: [{ ...templates[0], status: 'inactive' }, templates[1]] })
    await wrapper.get('[aria-label="切换绩效模板"]').trigger('click')
    expect(wrapper.findAll('input')[0].attributes('disabled')).toBeDefined()
    expect(action(wrapper, '确定').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
