import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { performanceTemplateApi } from '@/api/performance'
import PerformanceTemplateCreate from './PerformanceTemplateCreate.vue'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push, currentRoute: { value: { query: {} } } }) }))

function mountView() {
  return mount(PerformanceTemplateCreate, {
    global: { stubs: { 'el-icon': { template: '<span><slot /></span>' } } },
  })
}

beforeEach(() => {
  push.mockReset()
  localStorage.clear()
  vi.spyOn(performanceTemplateApi, 'create').mockResolvedValue({ template_id: 901, name: '新的模板' })
})

describe('PerformanceTemplateCreate', () => {
  it('renders the reference header and body order', () => {
    const wrapper = mountView()
    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('新建绩效模板')
    expect(wrapper.find('.full-screen-modal-header-back').text()).toContain('返回')
    expect(wrapper.find('.full-screen-modal-header-back-icon path').attributes('d')).toContain('M1.293 11.293')
    expect(wrapper.findAll('.basic-info-form > .form-item').map(item => item.find('.field-label').exists() ? item.find('.field-label').text() : item.find('.calculation-heading').text())).toEqual(['模板语言', '名称*', '描述', '配置「计算规则」'])
    expect(wrapper.find('.full-screen-modal-header .step-flow').exists()).toBe(true)
    expect(wrapper.findAll('.language-options > .checkbox-row')).toHaveLength(2)
    expect(wrapper.find('.language-options .fixed-checkbox input').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.language-options .fixed-checkbox .checkbox-label').text()).toBe('中文')
    expect(wrapper.find('.calculation-options').exists()).toBe(false)
  })

  it('keeps workflow header actions right-aligned as shared 80px buttons', async () => {
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await wrapper.get('.next-button').trigger('click')

    expect(wrapper.find('.full-screen-modal-header-actions').exists()).toBe(true)
    expect(wrapper.find('.previous-button').text()).toBe('上一步')
    expect(wrapper.find('.next-button').text()).toBe('下一步')
    expect(wrapper.find('.full-screen-modal-header-actions').attributes('style')).toBeUndefined()
  })

  it('returns to the template list from the header back action and changes title after next', async () => {
    const wrapper = mountView()
    expect(wrapper.find('.full-screen-modal-header-title').text()).toBe('新建绩效模板')
    await wrapper.get('.full-screen-modal-header-back').trigger('click')
    expect(push).toHaveBeenCalledWith({ name: 'PerformanceTemplates' })

    const nextWrapper = mountView()
    await nextWrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await nextWrapper.get('.next-button').trigger('click')
    expect(nextWrapper.find('.full-screen-modal-header-title').text()).toBe('编辑绩效模板')
    expect(performanceTemplateApi.create).toHaveBeenCalledWith(expect.objectContaining({ name: '新的模板' }))
    expect(localStorage.getItem('performance-template-draft')).toContain('"templateId":901')
  })

  it('validates required and duplicate names', async () => {
    const wrapper = mountView()
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.text()).toContain('名称为必填')
    await wrapper.get('[aria-label="模板名称"]').setValue('全年度绩效评估')
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.text()).toContain('该模板名称已存在，请重新输入')
  })

  it('requires a rule after enabling calculation rules', async () => {
    const wrapper = mountView()
    await wrapper.get('[aria-label="模板名称"]').setValue('新的模板')
    await wrapper.get('[aria-label="配置计算规则"]').trigger('click')
    expect(wrapper.find('.step-flow').text()).toContain('计算规则')
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.text()).toContain('如果开启计算规则配置，则至少配置一个计算规则')
    await wrapper.get('.option-row input').setValue(true)
    await wrapper.get('.next-button').trigger('click')
    expect(wrapper.find('.basic-info-panel').exists()).toBe(false)
    expect(localStorage.getItem('performance-template-draft')).toContain('新的模板')
  })
})



