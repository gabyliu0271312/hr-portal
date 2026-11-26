import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WarehouseAssetSinkConfig from './WarehouseAssetSinkConfig.vue'
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue'
import { createEmptyDocument, createEmptyRule, RULE_TYPES, sinkMappingDraftProblems } from '@/api/mapping'

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
  UiFullScreenModal: { template: '<div class="full-screen-modal-stub"><slot /></div>' },
  UiStepFlow: true,
  'el-icon': true,
  'el-alert': { template: '<div class="el-alert"><slot name="title" /></div>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': true,
  'el-option': true,
  'el-empty': true,
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
  const wrapper = mount(WarehouseAssetSinkConfig, { props: { modelValue: config }, global: { stubs } })
  ;(wrapper.vm as any).openDialog()
  return wrapper
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
    expect(wrapper.findAll('.validation-row')).toHaveLength(1)
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
    expect(wrapper.find('.lossy-write-blocked').text()).toContain('暂不能保存')
    expect(workspace.props('policy').effects.allowSave).toBe(true)
    expect(workspace.props('compatibility').writable).toBe(true)
    document.ruleSet.rules[0].sourceFields = ['period']
    await workspace.vm.$emit('update:modelValue', document)
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(true)
  })

  it.each(RULE_TYPES)('%s 空草稿阻止提交且禁用后不参与必填校验', (type) => {
    const document = createEmptyDocument()
    const complete = createEmptyRule('field')
    complete.sourceFields = ['period']
    complete.targetFields = ['cost_period']
    const draft = createEmptyRule(type)
    document.ruleSet.rules = [complete, draft]
    const config = { storageMode: 'component_v1', mapping_component: document }
    expect(sinkMappingDraftProblems(config)).toEqual(['第 2 条映射缺少源字段和目标字段，请补全或删除该规则'])
    draft.enabled = false
    expect(sinkMappingDraftProblems(config)).toEqual([])
  })

  it.each(['split', 'merge'])('保留 %s 的多字段映射', (action) => {
    const document = createEmptyDocument()
    const rule = createEmptyRule('split_merge')
    rule.sourceFields = action === 'split' ? ['name'] : ['first_name', 'last_name']
    rule.targetFields = action === 'split' ? ['first_name', 'last_name'] : ['name']
    rule.config = { action: action as 'split' | 'merge', delimiter: ' ', nullBehavior: 'keep_null' }
    document.ruleSet.rules = [rule]
    expect(sinkMappingDraftProblems({ mapping_component: document })).toEqual([])
  })

  it('首次建立业务主键映射时允许保存为 component_v1', async () => {
    const config: Record<string, any> = sinkConfig({ mapping: [] })
    const wrapper = mountConfig(config)
    await flushPromises()

    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    const document = JSON.parse(JSON.stringify(workspace.props('modelValue')))
    document.ruleSet.rules.push({
      id: 'new-key', type: 'field', enabled: true, displayOrder: 0,
      sourceFields: ['period'], targetFields: ['cost_period'], config: { mode: 'rename' },
    })
    await workspace.vm.$emit('update:modelValue', document)
    await flushPromises()

    expect((wrapper.vm as any).canSave).toBe(true)
    expect(config.storageMode).toBe('component_v1')
    expect(config.mapping_component.ruleSet.rules[0]).toMatchObject({ sourceFields: ['period'], targetFields: ['cost_period'] })
  })

  it('component_v1 完整保存 value_map 且不覆盖 legacy 快照', async () => {
    const config: Record<string, any> = sinkConfig()
    const legacySnapshot = structuredClone(config.mapping)
    const wrapper = mountConfig(config)
    await flushPromises()

    const workspace = wrapper.findComponent(MappingWorkspaceStub)
    const document = JSON.parse(JSON.stringify(workspace.props('modelValue')))
    document.ruleSet.rules[1] = {
      id: '1', type: 'value_map', enabled: true, displayOrder: 1,
      sourceFields: ['allocation_percentage'], targetFields: ['headcount'],
      config: { mappings: { '100': '1' }, unmatched: 'reject' },
    }
    await workspace.vm.$emit('update:modelValue', document)
    await flushPromises()

    expect((wrapper.vm as any).canSave).toBe(true)
    expect(config.storageMode).toBe('component_v1')
    expect(config.mapping_component.ruleSet.rules[1]).toMatchObject({ type: 'value_map', config: { mappings: { '100': '1' } } })
    expect(config.mapping).toEqual(legacySnapshot)
  })

  it('真实工作区新增空草稿后仍可逐字段补全、清空与删除，重挂载不锁定', async () => {
    const config: Record<string, any> = sinkConfig({ mapping: [] })
    const liveStubs = {
      ...stubs,
      MappingWorkspace: false,
      'el-button': { props: ['disabled'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
      'el-dropdown': { name: 'ElDropdown', emits: ['command'], template: '<div><slot /><slot name="dropdown" /></div>' },
      'el-dropdown-menu': { template: '<div><slot /></div>' },
      'el-dropdown-item': true,
      'el-switch': true,
      'el-select': { props: ['modelValue'], template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option value="" /><slot /></select>' },
      'el-option': { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
      'el-radio-group': true,
      'el-radio-button': true,
    }
    let wrapper = mount(WarehouseAssetSinkConfig, { props: { modelValue: config, upstreamFields: [{ code: 'period', label: '期间' }] }, global: { stubs: liveStubs } })
    ;(wrapper.vm as any).openDialog()
    await flushPromises()
    let workspace = wrapper.getComponent(MappingWorkspace)
    await workspace.getComponent({ name: 'ElDropdown' }).vm.$emit('command', 'field')
    await flushPromises()
    expect((wrapper.vm as any).mappingSaveState.code).toBe('mapping_incomplete')
    expect((workspace.vm as any).canEdit).toBe(true)
    let selects = workspace.findAll('select')
    await selects[0].setValue('period')
    expect((wrapper.vm as any).canSave).toBe(false)
    await selects[1].setValue('headcount')
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(true)
    await selects[0].setValue('')
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(false)
    wrapper.unmount()
    wrapper = mount(WarehouseAssetSinkConfig, { props: { modelValue: config }, global: { stubs: liveStubs } })
    await flushPromises()
    expect((wrapper.vm as any).mappingSaveState.code).toBe('mapping_incomplete')
    ;(wrapper.vm as any).openDialog()
    await flushPromises()
    workspace = wrapper.getComponent(MappingWorkspace)
    expect((workspace.vm as any).canEdit).toBe(true)
    await workspace.get('.rule-toggle').trigger('click')
    selects = workspace.findAll('select')
    await selects[0].setValue('period')
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(true)
    await workspace.getComponent({ name: 'ElDropdown' }).vm.$emit('command', 'field')
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(false)
    const deleteButtons = workspace.findAll('button').filter(button => button.text() === '删除')
    await deleteButtons[1].trigger('click')
    await flushPromises()
    expect((wrapper.vm as any).canSave).toBe(true)
    expect(config.mapping_component.ruleSet.rules).toHaveLength(1)
    wrapper.unmount()
  })

  it('component_v1 标记缺文档时从无损 legacy 恢复，已有 component 文档不受弹窗开关影响', async () => {
    const config: Record<string, any> = sinkConfig({ storageMode: 'component_v1' })
    const wrapper = mountConfig(config)
    await flushPromises()
    expect(config.mapping_component).toBeTruthy()
    expect((wrapper.vm as any).canSave).toBe(true)
    wrapper.unmount()
    const document = createEmptyDocument()
    document.ruleSet.targetAsset = config.target_asset
    document.ruleSet.rules = [createEmptyRule('field')]
    config.mapping_component = document
    const reopened = mount(WarehouseAssetSinkConfig, { props: { modelValue: config }, global: { stubs } })
    await flushPromises()
    expect((reopened.vm as any).mappingSaveState.code).toBe('mapping_incomplete')
    ;(reopened.vm as any).openDialog()
    await flushPromises()
    expect(reopened.getComponent(MappingWorkspaceStub).props('compatibility').writable).toBe(true)
    reopened.unmount()
  })

  it('上游字段加载失败时显示原因并提供重试，而非空目录提示', async () => {
    const wrapper = mount(WarehouseAssetSinkConfig, {
      props: { modelValue: sinkConfig(), upstreamFields: [], upstreamError: '上游字段加载失败：无权限执行 V 操作 (ucp.admin)' },
      global: { stubs: { ...stubs, 'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' } } },
    })
    ;(wrapper.vm as any).openDialog()
    await flushPromises()

    const banner = wrapper.get('.upstream-banner')
    expect(banner.text()).toContain('上游字段加载失败：无权限执行 V 操作 (ucp.admin)')
    expect(banner.text()).not.toContain('事件补充字段手动添加')
    await banner.get('button').trigger('click')
    expect(wrapper.emitted('retry-upstream')).toHaveLength(1)
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
