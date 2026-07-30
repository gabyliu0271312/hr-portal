import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import WarehouseAssetSinkConfig from './WarehouseAssetSinkConfig.vue'

const api = vi.hoisted(() => ({ assets: vi.fn(), columns: vi.fn() }))
vi.mock('@/api/warehouse', () => ({ listAssets: api.assets, listAssetColumns: api.columns, getAsset: vi.fn().mockResolvedValue({ is_period: true, period_col: 'cost_period' }) }))

const stubs = {
  'el-form-item': { template: '<div><slot /></div>' }, 'el-select': true, 'el-option': true, 'el-tag': true, 'el-divider': true,
  'el-input': true, 'el-input-number': true, 'el-checkbox': true, 'el-button': true, 'el-tooltip': true, 'el-icon': true,
}

describe('WarehouseAssetSinkConfig', () => {
  it('renders snapshot mode, readonly asset keys, mappings and validations', async () => {
    api.assets.mockResolvedValue({ items: [{ table_name: 'emp_monthly_allocation', table_label: '员工分摊', asset_status: 'published' }] })
    api.columns.mockResolvedValue({ columns: [{ column_code: 'cost_period', column_label: '期间', is_pk_part: true }] })
    const config = { target_asset: 'emp_monthly_allocation', write_mode: 'period_full_snapshot', period_field: 'cost_period', event_fields: ['period'], field_whitelist: ['cost_period'], mapping: [{ source: 'period', target: 'cost_period', transform: 'yyyy_mm_to_yyyymm', required: true, minimum: 0, maximum: 1 }], validations: [{ type: 'group_sum_equals', group_by_text: 'cost_period,employee_no', sum_field: 'headcount', expected: 1, tolerance: 0.0001 }] }
    const wrapper = mount(WarehouseAssetSinkConfig, { props: { modelValue: config }, global: { stubs } })
    await Promise.resolve()
    expect(wrapper.findAll('.mapping-row')).toHaveLength(2)
  })
})
