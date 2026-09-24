import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import pageSource from './PerformanceMetricLibrary.vue?raw'
import PerformanceMetricLibrary from './PerformanceMetricLibrary.vue'

vi.mock('element-plus', () => ({
  ElMessage: { info: vi.fn() },
}))

const stubs = {
  PerformanceButton: {
    inheritAttrs: false,
    template: '<button class="performance-button" v-bind="$attrs"><slot /></button>',
  },
  PerformanceCreateButton: {
    props: ['label', 'variant'],
    template: '<button class="create-button" :aria-label="label"><slot /></button>',
  },
  PerformanceSearchInput: {
    props: ['modelValue', 'placeholder', 'ariaLabel'],
    emits: ['update:modelValue'],
    template: '<input :value="modelValue" :placeholder="placeholder" :aria-label="ariaLabel" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  PerformanceFilterButton: {
    props: ['label'],
    emits: ['click'],
    template: '<button class="filter-button" type="button" @click="$emit(\'click\')">{{ label }}</button>',
  },
  ProjectMemberColumnDrawer: {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="column-drawer" />',
  },
  ElIcon: { template: '<span class="el-icon"><slot /></span>' },
  DataAnalysis: { template: '<span />' },
  EditPen: { template: '<span />' },
  Tickets: { template: '<span />' },
}

describe('PerformanceMetricLibrary', () => {
  it('renders the captured metric library framework without fixture rows', async () => {
    const wrapper = mount(PerformanceMetricLibrary, { global: { stubs } })

    expect(wrapper.get('.list-page-title').text()).toBe('指标库')
    expect(wrapper.find('.list-page-title-actions [aria-label="指标库辅助入口"]').exists()).toBe(true)
    expect(wrapper.find('.list-page-content .metric-library-content').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="通过名称搜索"]').exists()).toBe(true)
    expect(wrapper.find('.create-button').attributes('aria-label')).toBe('新建指标')
    expect(wrapper.find('.filter-button').exists()).toBe(true)
    expect(wrapper.get('[aria-label="自定义列"]').text()).toBe('自定义列')
    expect(wrapper.find('[aria-label="自定义列"] [data-icon="ColumnsOutlined"]').exists()).toBe(true)
    expect(wrapper.find('.column-drawer').exists()).toBe(false)
    await wrapper.find('[aria-label="自定义列"]').trigger('click')
    expect(wrapper.find('.column-drawer').exists()).toBe(true)
    expect(wrapper.find('.metric-library-empty strong').text()).toBe('暂无内容')
    expect(wrapper.find('.metric-library-empty p').text()).toContain('指标库中的指标可以由管理员和被评估人在添加指标时选用')
    expect(pageSource).toContain('PerformanceCreateButton')
    expect(pageSource).toContain('PerformanceSearchInput')
    expect(pageSource).toContain('PerformanceFilterButton')
    expect(pageSource).toContain('PerformanceListPage')
    expect(pageSource).not.toContain('metric-library-heading h1')
  })
})
