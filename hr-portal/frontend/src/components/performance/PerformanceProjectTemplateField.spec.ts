import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceProjectTemplateField from './PerformanceProjectTemplateField.vue'
import PerformanceTemplatePickerDialog from './PerformanceTemplatePickerDialog.vue'
import PerformanceTemplatePreviewButton from './PerformanceTemplatePreviewButton.vue'
import fieldSource from './PerformanceProjectTemplateField.vue?raw'
import { readFileSync } from 'node:fs'

const templates = [
  { template_id: 11, name: '半年度绩效评估', description: '半年度评估-360自愿评估', status: 'active' as const },
  { template_id: 12, name: '全年度绩效评估', description: '全年度评估-360自愿评估', status: 'active' as const },
]
function field(extra = {}) {
  return mount(PerformanceProjectTemplateField, { props: { modelValue: null, templates, ...extra }, global: { stubs: { teleport: true } } })
}
function action(wrapper: ReturnType<typeof field>, text: string) { return wrapper.findAll('button').find(item => item.text() === text)! }

describe('project template selection', () => {
  it('uses the captured 36px SVG before the selected template only', async () => {
    const wrapper = field()
    expect(wrapper.find('.selected-template').exists()).toBe(false)
    await wrapper.setProps({ modelValue: 11 })
    expect(wrapper.find('.selected-template').exists()).toBe(true)
    const iconStyle = fieldSource.match(/\.selected-template::before\s*\{([^}]+)\}/)?.[1]
    expect(iconStyle).toContain('width: var(--performance-template-icon-size)')
    expect(iconStyle).toContain('height: var(--performance-template-icon-size)')
    expect(iconStyle).toContain('margin-right: var(--performance-template-icon-gap)')
    const tokenSource = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokenSource).toContain('--performance-template-icon-size: 36px;')
    expect(tokenSource).toContain('--performance-template-icon-gap: var(--spacing-3);')
    const image = tokenSource.match(/--performance-template-icon-image:\s*url\("data:image\/svg\+xml;base64,([^"\)]+)"\)/)?.[1]
    expect(image).toBeTruthy()
    const svg = Buffer.from(image!, 'base64').toString('utf8')
    expect(svg).toContain('viewBox="0 0 32 32"')
    expect(svg).toContain('M5.3335 3.33333C5.3335 2.59695')
    expect(svg).toContain('fill="#3370FF"')
    expect(svg).toContain('fill="#245BDB"')
    expect((svg.match(/<path /g) || []).length).toBe(5)
    wrapper.unmount()
  })

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
    expect(wrapper.get('[aria-label="切换模板"]').text()).toBe('切换模板')
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
    expect((wrapper.getComponent(PerformanceTemplatePickerDialog).vm as any).$.uid).toBe(picker)
    expect((wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    await action(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.get('.selected-template').text()).toContain(templates[0].name)
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
    expect((wrapper.findAll('input[type="radio"]')[0].element as HTMLInputElement).checked).toBe(true)
    await wrapper.findAll('input[type="radio"]')[1].setValue()
    await action(wrapper, '确定').trigger('click')
    await wrapper.setProps({ modelValue: 12 })
    expect(wrapper.get('.selected-template').text()).toContain(templates[1].name)
    wrapper.unmount()
  })

  it('reuses the disabled preview button in the card and every candidate', async () => {
    const wrapper = field({ modelValue: 11 })
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
    expect(wrapper.findAllComponents(PerformanceTemplatePreviewButton)).toHaveLength(3)
    const previews = wrapper.findAll('button').filter(item => item.attributes('aria-label')?.startsWith('预览'))
    expect(previews).toHaveLength(3)
    expect(previews.every(button => button.text() === '预览')).toBe(true)
    expect(previews.every(button => button.attributes('disabled') !== undefined)).toBe(true)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it.each(['取消', '关闭'])('does not save a tentative selection when using %s', async label => {
    const wrapper = field({ modelValue: 11 })
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
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
    expect(wrapper.get('[aria-label="切换模板"]').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ disabled: false, templates: [{ ...templates[0], status: 'inactive' }, templates[1]] })
    await wrapper.get('[aria-label="切换模板"]').trigger('click')
    expect(wrapper.findAll('input')[0].attributes('disabled')).toBeDefined()
    expect(action(wrapper, '确定').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })
})
