import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import pageSource from './MetricTemplateManagement.vue?raw'
import MetricTemplateManagement from './MetricTemplateManagement.vue'

const stubs = {
  PerformanceListPage: { props: ['title'], template: '<section><h1>{{ title }}</h1><slot /></section>' },
  MetricTemplateEmptyIllustration: { template: '<svg class="metric-template-empty-illustration" width="250" height="125" />' },
  MetricTemplateActionButtons: {
    props: ['placement'],
    emits: ['create', 'import'],
    template: '<div class="metric-template-actions" :data-placement="placement"><button class="create-template" @click="$emit(\'create\')">＋ 新建模板</button><button class="import-template" @click="$emit(\'import\')">导入 通过导入新建</button></div>',
  },
  PerformanceListToolbar: {
    props: ['keyword', 'searchPlaceholder', 'searchAriaLabel'],
    emits: ['update:keyword', 'filter'],
    template: '<div class="toolbar"><slot name="left" /><input :value="keyword" :placeholder="searchPlaceholder" :aria-label="searchAriaLabel" @input="$emit(\'update:keyword\', $event.target.value)" /><button type="button" class="filter" @click="$emit(\'filter\')">筛选</button></div>',
  },
  PerformancePermissionButton: { emits: ['click'], template: '<button class="permission-button" :aria-label="$attrs[\'aria-label\']" @click="$emit(\'click\')"><slot /></button>' },
  PerformanceManagementTable: { props: ['rows'], template: '<div class="table"><slot /></div>' },
  ElTableColumn: { props: ['label'], template: '<div class="column">{{ label }}</div>' },
}

describe('MetricTemplateManagement', () => {
  it('renders the captured first-use empty state', () => {
    const wrapper = mount(MetricTemplateManagement, { global: { stubs } })

    expect(wrapper.get('h1').text()).toBe('指标模板')
    expect(wrapper.find('.metric-template-empty-state').exists()).toBe(true)
    expect(wrapper.get('.metric-template-empty-illustration').attributes('width')).toBe('250')
    expect(wrapper.get('.metric-template-empty-illustration').attributes('height')).toBe('125')
    expect(wrapper.get('.metric-template-empty-title').text()).toBe('暂无内容')
    expect(wrapper.get('.metric-template-empty-description').text()).toContain('可以使用指标模板中设置制定指标规则以及不同人群的指标')
    expect(wrapper.find('.metric-template-actions[data-placement="empty"]').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="搜索"]').exists()).toBe(false)
    expect(wrapper.find('.table').exists()).toBe(false)
    expect(pageSource).toContain('MetricTemplateActionButtons')
  })

  it('uses the shared empty-state actions for both create paths', async () => {
    const wrapper = mount(MetricTemplateManagement, { global: { stubs } })
    const actions = wrapper.get('.metric-template-actions')

    expect(actions.text()).toContain('新建模板')
    expect(actions.text()).toContain('通过导入新建')

    await wrapper.get('.create-template').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('新建指标模板')

    await wrapper.get('.import-template').trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('导入指标模板')
  })
})
