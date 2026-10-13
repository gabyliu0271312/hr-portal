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
    emits: ['click'],
    template: '<button class="create-button" :aria-label="label" @click="$emit(\'click\')"><slot /></button>',
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
  PerformanceMetricCreateDrawer: {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="metric-create-drawer" />',
  },
  PerformanceMetricFieldManagementModal: {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="metric-field-management-modal" />',
  },
  PerformanceMetricFormulaManagementModal: {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="metric-formula-management-modal" />',
  },
  ElIcon: { template: '<span class="el-icon"><slot /></span>' },
  EditPen: { template: '<span />' },
}

describe('PerformanceMetricLibrary', () => {
  it('renders the captured metric library framework without fixture rows', async () => {
    const wrapper = mount(PerformanceMetricLibrary, { global: { stubs } })

    expect(wrapper.get('.list-page-title').text()).toBe('指标库')
    expect(wrapper.find('.list-page-title-actions [aria-label="指标库辅助入口"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="字段管理"]').text()).toBe('字段管理')
    expect(wrapper.find('[aria-label="字段管理"] [data-icon="StyleOutlined"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="字段管理"]').classes()).toContain('metric-fields-button')
    expect(wrapper.get('[aria-label="公式管理"]').text()).toBe('公式管理')
    expect(wrapper.find('[aria-label="公式管理"] [data-icon="FormulaOutlined"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="公式管理"]').classes()).toContain('metric-formula-button')
    expect(wrapper.find('.metric-field-management-modal').exists()).toBe(false)
    expect(wrapper.find('.metric-formula-management-modal').exists()).toBe(false)
    await wrapper.get('[aria-label="字段管理"]').trigger('click')
    expect(wrapper.find('.metric-field-management-modal').exists()).toBe(true)
    await wrapper.get('[aria-label="公式管理"]').trigger('click')
    expect(wrapper.find('.metric-formula-management-modal').exists()).toBe(true)
    expect(wrapper.find('.list-page-content .metric-library-content').exists()).toBe(true)
    expect(wrapper.find('input[placeholder="通过名称搜索"]').exists()).toBe(true)
    expect(wrapper.find('.create-button').attributes('aria-label')).toBe('新建指标')
    await wrapper.find('.create-button').trigger('click')
    expect(wrapper.find('.metric-create-drawer').exists()).toBe(true)
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
