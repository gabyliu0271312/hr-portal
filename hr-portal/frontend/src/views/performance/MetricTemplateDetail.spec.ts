import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { performanceTemplateApi } from '@/api/performance'
import MetricTemplateDetail from './MetricTemplateDetail.vue'

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { templateId: '901' } }),
  useRouter: () => ({ push: routerPush }),
}))

const stubs = {
  FullScreenModal: { props: ['title'], emits: ['back'], template: `<section class="full-screen-modal"><header><h1>{{ title }}</h1><button class="back" @click="$emit('back')">返回</button><slot name="actions" /></header><main><slot /></main></section>` },
  PerformanceButton: { props: ['ariaLabel', 'variant', 'disabled'], template: '<button :aria-label="ariaLabel" :disabled="disabled"><slot /></button>' },
  PerformanceSurfaceCard: { template: '<section class="surface-card"><slot /></section>' },
  PerformanceRadioGroup: { props: ['options'], template: '<div class="radio-group"><span v-for="option in options" :key="option.value">{{ option.label }}</span></div>' },
  AddOutlinedIcon: { template: '<svg data-icon="AddOutlined" />' },
}

describe('MetricTemplateDetail', () => {
  it('loads the saved template and renders the captured page sections', async () => {
    const getSpy = vi.spyOn(performanceTemplateApi, 'get').mockResolvedValue({
      template_id: 901,
      name: '季度目标',
      description: '季度描述',
      language: 'zh-CN',
      english_enabled: false,
      audience_settings_enabled: true,
      calculation_enabled: false,
      selected_rules: [],
      status: 'inactive',
      created_at: '2026-09-29T00:00:00Z',
      updated_at: '2026-09-29T00:00:00Z',
      score_method: 'dimension_weighted',
    })

    const wrapper = mount(MetricTemplateDetail, { global: { stubs } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('季度目标'))
    expect(wrapper.get('.metric-template-detail-card h1').text()).toBe('基本信息')
    expect(wrapper.text()).toContain('季度目标')
    expect(wrapper.text()).toContain('季度描述')
    expect(wrapper.text()).toContain('分人群设置指标内容')
    expect(wrapper.text()).toContain('是')
    expect(wrapper.text()).toContain('指标总分')
    expect(wrapper.text()).toContain('手动评估')
    expect(wrapper.text()).toContain('维度加和')
    expect(wrapper.text()).toContain('维度加权')
    expect(wrapper.text()).toContain('自定义公式')
    expect(wrapper.find('[aria-label="编辑基本信息"]').text()).toContain('编辑')
    expect(wrapper.text()).toContain('添加指标维度')
    expect(wrapper.text()).toContain('指标维度')
    expect(wrapper.find('[aria-label="启用指标模板"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('returns to the metric template list from the shared header', async () => {
    vi.spyOn(performanceTemplateApi, 'get').mockResolvedValue({
      template_id: 901,
      name: '季度目标',
      description: '',
      language: 'zh-CN',
      english_enabled: false,
      audience_settings_enabled: false,
      calculation_enabled: false,
      selected_rules: [],
      status: 'inactive',
      created_at: '',
      updated_at: '',
    })
    const wrapper = mount(MetricTemplateDetail, { global: { stubs } })
    await vi.waitFor(() => expect(wrapper.text()).toContain('基本信息'))
    await wrapper.get('.full-screen-modal .back').trigger('click')
    expect(routerPush).toHaveBeenCalledWith({ name: 'PerformanceMetricTemplates' })
    wrapper.unmount()
  })
})
