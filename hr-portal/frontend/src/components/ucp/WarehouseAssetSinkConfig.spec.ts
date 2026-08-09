import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WarehouseAssetSinkConfig from './WarehouseAssetSinkConfig.vue'

const api = vi.hoisted(() => ({ assets: vi.fn(), columns: vi.fn(), asset: vi.fn() }))
vi.mock('@/api/warehouse', () => ({ listAssets: api.assets, listAssetColumns: api.columns, getAsset: api.asset }))

const MappingWorkspaceStub = {
  name: 'MappingWorkspace',
  props: ['modelValue', 'policy', 'compatibility', 'sourceFields', 'targetFields'],
  emits: ['update:modelValue', 'dirty'],
  template: '<div class="mapping-workspace-stub" />',
}
const stubs = {
  MappingWorkspace: MappingWorkspaceStub,
  IngestionModeSelect: true,
  'el-alert': { template: '<div class="el-alert"><slot name="title" /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-tag': true,
  'el-divider': true,
  'el-input': true,
  'el-input-number': true,
  'el-button': true,
}

function sinkConfig(overrides: Record<string, any> = {}) {
  return {
    target_asset: 'emp_monthly_allocation',
    write_mode: 'period_full_snapshot',
    primary_key: ['cost_period', 'employee_no'],
    field_whitelist: ['cost_period', 'employee_no', 'headcount'],
    batch_key: 'request_id',
    period_field: 'cost_period',
    event_fields: ['period', 'employee_no', 'allocation_percentage'],
    mapping: [
      { source: 'period', target: 'cost_period', transform: 'yyyy_mm_to_yyyymm', required: true, future_rule_option: 'keep' },
      { source: 'allocation_percentage', target: 'headcount', transform: 'decimal_divide_100', required: true, minimum: 0, maximum: 1 },
    ],
    validations: [{ type: 'group_sum_equals', group_by_text: 'cost_period,employee_no', group_by: ['cost_period', 'employee_no'], sum_field: 'headcount', expected: 1, tolerance: 0.0001, future_validation_option: 'strict' }],
    future_sink_option: { enabled: true },
    ...overrides,
  }
}

function mountConfig(config: Record<string, any>) {
  return mount(WarehouseAssetSinkConfig, { props: { modelValue: config }, global: { stubs } })
}

describe('WarehouseAssetSinkConfig', () => {
  beforeEach(() => {
    api.assets.mockResolvedValue({ items: [{ table_name: 'emp_monthly_allocation', table_label: '员工分摊', asset_status: 'published' }] })
    api.columns.mockResolvedValue({ columns: [
      { column_code: 'cost_period', column_label: '期间', data_type: 'string', is_pk_part: true, is_computed: false },
      { column_code: 'employee_no', column_label: '工号', data_type: 'string', is_pk_part: true, is_computed: false },
      { column_code: 'headcount', column_label: '人数', data_type: 'decimal', is_pk_part: false, is_computed: false },
      { column_code: 'computed_total', column_label: '计算值', data_type: 'decimal', is_pk_part: false, is_computed: true },
    ] })
    api.asset.mockResolvedValue({ is_period: false, period_col: null })
  })

  it('仅用统一 MappingWorkspace 替换 mapping 编辑区并保留 Sink 自有 validations 表单', async () => {
    const wrapper = mountConfig(sinkConfig())
    await flushPromises()

    expect(wrapper.findComponent(MappingWorkspaceStub).exists()).toBe(true)
    expect(wrapper.findAll('.mapping-row')).toHaveLength(1)
    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    expect(workspace.props('policy')).toMatchObject({
      caller: 'warehouse_sink',
      target: {
        allowedFieldIds: ['cost_period', 'employee_no', 'headcount'],
        protectedKeyFieldIds: ['cost_period', 'employee_no'],
        readonlyFieldIds: ['computed_total'],
      },
      effects: { allowPublish: false, allowExecute: false, allowRebuild: false },
    })
  })

  it('将 legacy mapping 转为 MappingDocument 并保留 unknown、validations 和 Sink 强合同', async () => {
    const config: Record<string, any> = sinkConfig()
    const originalContract = Object.fromEntries(['target_asset', 'write_mode', 'primary_key', 'field_whitelist', 'batch_key', 'period_field', 'validations', 'future_sink_option'].map(key => [key, structuredClone(config[key])]))
    const wrapper = mountConfig(config)
    await flushPromises()

    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    const document = JSON.parse(JSON.stringify(workspace.props('modelValue')))
    expect(document.ruleSet.rules).toMatchObject([
      { id: '0', type: 'format', sourceFields: ['period'], targetFields: ['cost_period'], config: { formatType: 'yyyy_mm_to_yyyymm', options: {}, onError: 'reject' } },
      { id: '1', type: 'format', sourceFields: ['allocation_percentage'], targetFields: ['headcount'], config: { formatType: 'unit_convert', options: { multiplier: 0.01 }, onError: 'reject' } },
    ])
    expect(workspace.props('compatibility').unknownFields).toMatchObject({
      validations: originalContract.validations,
      future_sink_option: { enabled: true },
      'mapping[0].required': true,
      'mapping[0].future_rule_option': 'keep',
      'mapping[1].minimum': 0,
      'mapping[1].maximum': 1,
    })

    document.ruleSet.rules[1].sourceFields = ['allocation_ratio']
    await workspace.vm.$emit('update:modelValue', document)
    await workspace.vm.$emit('dirty', true)
    await flushPromises()

    expect(config.mapping[1]).toEqual({ source: 'allocation_ratio', target: 'headcount', transform: 'decimal_divide_100', required: true, minimum: 0, maximum: 1 })
    expect(Object.fromEntries(Object.keys(originalContract).map(key => [key, config[key]]))).toEqual(originalContract)
    expect((wrapper.vm as any).canSave).toBe(true)
  })

  it('不能表达或试图覆盖 PK 时暴露 lossy_write_blocked 并禁止保存', async () => {
    const config = sinkConfig()
    const wrapper = mountConfig(config)
    await flushPromises()

    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    const document = JSON.parse(JSON.stringify(workspace.props('modelValue')))
    document.ruleSet.rules[0].sourceFields = ['changed_period']
    await workspace.vm.$emit('update:modelValue', document)
    await workspace.vm.$emit('dirty', true)
    await flushPromises()

    expect(config.mapping[0].source).toBe('period')
    expect((wrapper.vm as any).canSave).toBe(false)
    expect((wrapper.vm as any).lossyWriteBlocked).toBe(true)
    expect((wrapper.vm as any).mappingSaveState).toMatchObject({ code: 'lossy_write_blocked', canSave: false })
    expect(wrapper.emitted('lossy-write-blocked')?.at(-1)?.[0]).toMatchObject({ code: 'lossy_write_blocked', canSave: false })
    expect(wrapper.find('.lossy-write-blocked').text()).toContain('lossy_write_blocked')
    expect(workspace.props('policy').effects.allowSave).toBe(false)
  })

  it('unsupported legacy transform 初次读取即阻断无损写回且不丢原 mapping', async () => {
    const config = sinkConfig({ mapping: [{ source: 'period', target: 'cost_period', transform: 'custom_script', required: true }] })
    const wrapper = mountConfig(config)
    await flushPromises()

    expect(config.mapping).toEqual([{ source: 'period', target: 'cost_period', transform: 'custom_script', required: true }])
    expect((wrapper.vm as any).mappingSaveState).toMatchObject({
      code: 'lossy_write_blocked',
      canSave: false,
      lossyFields: ['mapping[0]'],
    })
  })
})
