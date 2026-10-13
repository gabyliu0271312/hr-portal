import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PerformanceMetricFormulaManagementModal from './PerformanceMetricFormulaManagementModal.vue'

const stubs = {
  FullScreenModal: {
    props: ['title', 'showFooter'],
    emits: ['back'],
    template: '<div class="full-screen-modal-stub"><header>{{ title }}</header><button class="back" @click="$emit(\'back\')">back</button><slot /></div>',
  },
  PerformanceContentSurface: {
    template: '<section class="surface-stub"><slot /></section>',
  },
  PerformanceButton: {
    props: ['variant', 'size', 'disabled'],
    emits: ['click'],
    template: '<button class="performance-button" :disabled="disabled" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
  },
  PerformanceCreateButton: {
    props: ['label', 'variant'],
    emits: ['click'],
    template: '<button class="performance-create-button" @click="$emit(\'click\')">{{ label }}</button>',
  },
  PerformanceSearchInput: {
    props: ['modelValue', 'placeholder', 'ariaLabel', 'width'],
    emits: ['update:modelValue', 'search'],
    template: '<input :value="modelValue" :placeholder="placeholder" :aria-label="ariaLabel" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'search\')" />',
  },
  PerformanceFilterButton: {
    props: ['label', 'variant'],
    emits: ['click'],
    template: '<button class="filter-button" :aria-label="label" @click="$emit(\'click\')">{{ label }}</button>',
  },
  PerformanceManagementTable: {
    template: '<div class="management-table"><slot /><slot name="empty" /></div>',
  },
  PerformanceMetricFormulaCreateDialog: {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="formula-create-dialog-stub" />',
  },
  ElTableColumn: {
    props: ['label'],
    template: '<span class="table-column">{{ label }}</span>',
  },
}

describe('PerformanceMetricFormulaManagementModal', () => {
  it('renders the captured header, toolbar, table columns and template empty illustration', () => {
    const wrapper = mount(PerformanceMetricFormulaManagementModal, {
      props: { modelValue: true },
      global: { stubs },
    })

    expect(wrapper.get('header').text()).toBe('评分公式管理')
    expect(wrapper.get('.performance-create-button').text()).toBe('新建评分公式')
    expect(wrapper.find('input[placeholder="搜索"]').exists()).toBe(true)
    expect(wrapper.get('[aria-label="筛选评分公式"]').text()).toBe('筛选')
    expect(wrapper.findAll('.table-column').map(column => column.text())).toEqual([
      '名称',
      '使用此公式的指标库指标',
      '更新人',
      '最近更新时间',
      '操作',
    ])
    expect(wrapper.find('.metric-template-empty-illustration').exists()).toBe(true)
    expect(wrapper.get('.formula-management-empty').text()).toContain('暂无数据')
  })

  it('emits actions and closes from the shared full-screen header', async () => {
    const wrapper = mount(PerformanceMetricFormulaManagementModal, {
      props: { modelValue: true },
      global: { stubs },
    })

    await wrapper.get('.performance-create-button').trigger('click')
    expect(wrapper.find('.formula-create-dialog-stub').exists()).toBe(true)
    await wrapper.get('[aria-label="筛选评分公式"]').trigger('click')
    await wrapper.get('.back').trigger('click')

    expect(wrapper.emitted('create')).toHaveLength(1)
    expect(wrapper.emitted('filter')).toHaveLength(1)
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
