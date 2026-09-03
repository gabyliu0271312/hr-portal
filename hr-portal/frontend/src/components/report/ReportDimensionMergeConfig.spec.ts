import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ReportDimensionMergeConfig from './ReportDimensionMergeConfig.vue'

vi.mock('@/api/reports', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@/api/reports')
  return {
    ...actual,
    reportsApi: { previewDimensionMerge: vi.fn() },
  }
})

const dimensions = [
  {
    code: 't.department',
    label: '部门',
    data_type: 'string',
    is_pk_part: false,
    is_sensitive: false,
    is_visible: true,
    display_order: 1,
    auto_discovered: false,
    enum_options: null,
    agg_role: 'dimension',
    is_computed: false,
    _instance_id: 't.department',
  },
]

const reportConfig = {
  columns: [
    { source_code: 't.department', instance_id: 't.department' },
    { source_code: 't.amount', instance_id: 't.amount' },
  ],
  filters: [],
  sorts: [],
  aggregate: true,
  aggregations: { 't.amount': 'sum' },
}

const stubs = {
  ElAlert: { template: '<div class="alert"><slot name="title" /><slot /></div>' },
  ElButton: { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElEmpty: { props: ['description'], template: '<div>{{ description }}</div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<div><slot /></div>' },
  ElInput: true,
  ElRadioGroup: { template: '<div><slot /></div>' },
  ElRadioButton: { template: '<button><slot /></button>' },
  ElSelect: { template: '<div><slot /></div>' },
  ElOption: { template: '<span><slot /></span>' },
  ReportDimensionMergeRuleList: {
    props: ['rules', 'selectedId', 'errorRuleIds'],
    emits: ['add', 'select', 'remove'],
    template: '<button class="add-rule" @click="$emit(\'add\')">新增</button>',
  },
  ReportDimensionCombinationPicker: true,
  ReportDimensionMergeTargetEditor: true,
}

describe('ReportDimensionMergeConfig', () => {
  it('creates a complete-signature rule draft without saving the report', async () => {
    const wrapper = mount(ReportDimensionMergeConfig, {
      props: {
        modelValue: [],
        dimensions,
        datasetId: 1,
        reportConfig,
        aggregate: true,
        structuralReshape: false,
      },
      global: { stubs },
    })

    await wrapper.get('.add-rule').trigger('click')

    const next = wrapper.emitted('update:modelValue')?.[0]?.[0] as any[]
    expect(next).toHaveLength(1)
    expect(next[0].dimension_signature).toEqual(['t.department'])
    expect(next[0].sources).toEqual([])
    expect(next[0].target.modes['t.department']).toBe('custom')
  })

  it('keeps the merge workspace reachable when detail mode still has rules', () => {
    const wrapper = mount(ReportDimensionMergeConfig, {
      props: {
        modelValue: [{
          id: 'r1',
          name: '部门归并',
          dimension_signature: ['t.department'],
          sources: [{ values: { 't.department': '销售' } }],
          target: { values: { 't.department': '研发' }, modes: { 't.department': 'custom' } },
        }],
        dimensions,
        datasetId: 1,
        reportConfig,
        aggregate: false,
        structuralReshape: false,
      },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('请删除全部归并规则后再保存为明细表')
    expect(wrapper.text()).toContain('编辑归并规则')
  })
})
