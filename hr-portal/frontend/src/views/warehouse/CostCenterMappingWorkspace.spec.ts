import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CostCenterMappingWorkspace from './CostCenterMappingWorkspace.vue'
import { costCenterMappingApi, mappingApi } from '@/api/mapping'

const api = costCenterMappingApi as any
const mapping = mappingApi as any

function stubApi() {
  for (const method of ['initialize', 'copyPrevious', 'getPeriod', 'getDwdGate', 'updateException', 'confirmDiff', 'publish', 'retryNotification']) {
    if (!vi.isMockFunction(api[method])) vi.spyOn(api, method)
    api[method].mockReset()
  }
  if (!vi.isMockFunction(mapping.resolvePolicy)) vi.spyOn(mapping, 'resolvePolicy')
  mapping.resolvePolicy.mockReset()
}

const trustedPolicy = () => ({
  caller: 'warehouse',
  allowedRuleTypes: ['identity_with_overrides', 'reference_lookup', 'field', 'value_map', 'type_convert', 'format', 'split_merge'],
  source: { assetId: 'cost_center_monthly', schemaHash: 'source-hash', allowedFieldIds: ['code', 'name', 'status'] },
  target: { assetId: 'dwd_cost_center_monthly', schemaHash: 'target-hash', allowedFieldIds: ['code', 'name', 'status'], readonlyFieldIds: [], protectedKeyFieldIds: ['code'] },
  referenceLookup: { allowedDatasetIds: ['cost_center_tree'], allowedFieldIds: ['code', 'name'], maxRules: 20 },
  effects: { allowPreview: true, allowSave: true, allowPublish: true, allowExecute: true, allowRebuild: true },
  legacy: { sourceFormat: 'standardization_rules', allowLegacyRead: true, allowLegacyWrite: false, allowMigration: false },
  metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: '2026-08-08T00:00:00Z' },
})

const baseState = () => ({
  id: 1,
  period: '202608',
  status: 'draft',
  version: 0,
  expectedVersion: 0,
  bindingId: 10,
  copiedFromPeriod: null,
  reviewRequired: true,
  publishAuditId: null,
  rebuildRunId: null,
  rebuildStatus: 'not_started',
  notificationStatus: 'not_started',
  sourceCount: 100,
  exceptionCount: 1,
  pendingDiffCount: 1,
  exceptions: [{ sourceCode: 'CC-001', targetCode: 'CC-900', attributes: {} }],
  diffs: [{ id: 7, sourceCode: 'CC-001', diffType: 'changed', status: 'pending', previousValue: {}, currentValue: {} }],
  notifications: [{ id: 8, notificationKey: 'cost-center-published:202608', status: 'exhausted', retryCount: 5, lastError: 'timeout' }],
})

const stubs = {
  MappingWorkspace: { name: 'MappingWorkspace', template: '<div data-testid="mapping-workspace">统一 MappingWorkspace</div>', props: ['modelValue', 'policy', 'sourceFields', 'targetFields'], emits: ['update:modelValue', 'dirty'] },
  'el-card': { template: '<section><slot name="header"/><slot /></section>' },
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<label><slot /></label>' },
  'el-input': { template: '<input />' },
  'el-button': { template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>', props: ['disabled', 'loading'] },
  'el-tag': { template: '<span><slot /></span>' },
  'el-alert': { template: '<div><slot /><span>{{ title }}</span></div>', props: ['title'] },
  'el-empty': { template: '<div>{{ description }}</div>', props: ['description'] },
}

describe('CostCenterMappingWorkspace', () => {
  it('uses the shared MappingWorkspace and renders lifecycle state', async () => {
    stubApi()
    api.initialize.mockReset()
    api.copyPrevious.mockReset()
    api.getPeriod.mockReset()
    api.getDwdGate.mockReset()
    api.updateException.mockReset()
    api.confirmDiff.mockReset()
    api.publish.mockReset()
    api.retryNotification.mockReset()
    mapping.resolvePolicy.mockReset()
    mapping.resolvePolicy.mockResolvedValue(trustedPolicy())
    api.getPeriod.mockResolvedValue(baseState())
    api.getDwdGate.mockResolvedValue({ status: 'review_required', reason: 'cost_center_mapping_not_published' })
    const wrapper = mount(CostCenterMappingWorkspace, { global: { stubs } })
    await flushPromises()

    expect(mapping.resolvePolicy).toHaveBeenCalledWith('warehouse', 'cost_center_monthly', 'dwd_cost_center_monthly')
    expect(api.getPeriod).toHaveBeenCalledWith(expect.stringMatching(/^\d{6}$/))
    expect(wrapper.findComponent({ name: 'MappingWorkspace' }).props('modelValue').ruleSet).toMatchObject({
      sourceSchemaHash: 'source-hash',
      targetSchemaHash: 'target-hash',
      rules: [
        expect.objectContaining({ sourceFields: ['code'], targetFields: ['code'] }),
        expect.objectContaining({ sourceFields: ['code'], targetFields: ['name'] }),
      ],
    })
    expect(wrapper.find('[data-testid="mapping-workspace"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('成本中心映射')
    expect(wrapper.text()).toContain('待确认')
    expect(wrapper.text()).toContain('人工重试')
    expect(wrapper.text()).toContain('默认自映射不展开保存')
  })

  it('confirms a diff and retries an exhausted notification', async () => {
    stubApi()
    api.initialize.mockReset()
    api.copyPrevious.mockReset()
    api.getPeriod.mockReset()
    api.getDwdGate.mockReset()
    api.updateException.mockReset()
    api.confirmDiff.mockReset()
    api.publish.mockReset()
    api.retryNotification.mockReset()
    mapping.resolvePolicy.mockReset()
    mapping.resolvePolicy.mockResolvedValue(trustedPolicy())
    const state = baseState()
    api.getPeriod.mockResolvedValue(state)
    api.getDwdGate.mockResolvedValue({ status: 'review_required' })
    api.confirmDiff.mockResolvedValue({ ...state, reviewRequired: false, pendingDiffCount: 0, diffs: [{ ...state.diffs[0], status: 'confirmed' }] })
    api.retryNotification.mockResolvedValue({ status: 'pending', id: 8, retryCount: 5 })
    const wrapper = mount(CostCenterMappingWorkspace, { global: { stubs } })
    await flushPromises()

    const buttons = wrapper.findAll('button')
    await buttons.find((button) => button.text().includes('确认'))?.trigger('click')
    await flushPromises()
    expect(api.confirmDiff).toHaveBeenCalledWith('202608', { diff_id: 7, expected_version: 0, actor: 'current-user' })

    await buttons.find((button) => button.text().includes('人工重试'))?.trigger('click')
    await flushPromises()
    expect(api.retryNotification).toHaveBeenCalledWith('202608', 8)
  })
})
