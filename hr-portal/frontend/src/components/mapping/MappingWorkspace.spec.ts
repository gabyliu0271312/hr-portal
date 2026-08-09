import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MappingWorkspace from './MappingWorkspace.vue'
import { mappingApi, type MappingCallerPolicy } from '@/api/mapping'

vi.mock('@/api/mapping', async () => {
  const actual = await vi.importActual<typeof import('@/api/mapping')>('@/api/mapping')
  return {
    ...actual,
    mappingApi: {
      ...actual.mappingApi,
      validate: vi.fn(),
      preview: vi.fn(),
    },
  }
})

const policy = (overrides: Record<string, any> = {}): MappingCallerPolicy => ({
  caller: 'warehouse',
  allowedRuleTypes: ['field', 'reference_lookup'],
  source: { assetId: 'ods_employee', schemaHash: 'source', allowedFieldIds: ['employee_no'] },
  target: { assetId: 'dwd_employee', schemaHash: 'target', allowedFieldIds: ['employee_no'], readonlyFieldIds: [], protectedKeyFieldIds: [] },
  referenceLookup: { allowedDatasetIds: ['ref_employee'], allowedFieldIds: ['employee_no'], maxRules: 20 },
  effects: { allowPreview: true, allowSave: true, allowPublish: true, allowExecute: true, allowRebuild: true, ...(overrides.effects || {}) },
  legacy: { sourceFormat: null, allowLegacyRead: true, allowLegacyWrite: true, allowMigration: true, ...(overrides.legacy || {}) },
  metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: '2026-08-08T00:00:00Z' },
  ...overrides,
})

const document = () => ({
  mappingSchemaVersion: 1 as const,
  ruleSet: {
    code: 'employee-map',
    name: '员工映射',
    sourceAsset: 'ods_employee',
    targetAsset: 'dwd_employee',
    sourceSchemaHash: 'source',
    targetSchemaHash: 'target',
    rules: [{
      id: 'r1', type: 'field' as const, enabled: true, displayOrder: 0,
      sourceFields: ['employee_no'], targetFields: ['employee_no'], config: { mode: 'rename' as const },
    }],
  },
})

const stubs = {
  'el-button': { props: ['disabled', 'loading', 'link', 'type', 'size'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  'el-switch': { props: ['disabled', 'modelValue', 'size'], template: '<input type="checkbox" :disabled="disabled" :checked="modelValue" @change="$emit(\'change\', !modelValue)" />' },
  'el-dropdown': { template: '<div><slot /><slot name="dropdown" /></div>' },
  'el-dropdown-menu': { template: '<div><slot /></div>' },
  'el-dropdown-item': { props: ['disabled', 'command'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
  'el-divider': { template: '<hr /><slot />' },
  'el-table': { template: '<div><slot /></div>' },
  'el-table-column': { template: '<div />' },
  'el-alert': { props: ['title'], template: '<div class="alert">{{ title }}<slot /></div>' },
  'el-tag': { template: '<span><slot /></span>' },
  FieldEditor: { template: '<div />' },
  ValueMapEditor: { template: '<div />' },
  ReferenceLookupEditor: { template: '<div />' },
  IdentityWithOverridesEditor: { template: '<div />' },
  TypeConvertEditor: { template: '<div />' },
  FormatEditor: { template: '<div />' },
  SplitMergeEditor: { template: '<div />' },
}

describe('MappingWorkspace effects contract', () => {
  it('allowPreview=false hides preview and blocks exposed preview call', async () => {
    const wrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy({ effects: { allowPreview: false } }), previewRows: [{ employee_no: 'E001' }] },
      global: { stubs },
    })
    expect(wrapper.findAll('button').some((button) => button.text() === '预览')).toBe(false)
    await (wrapper.vm as any).doPreview()
    expect(mappingApi.preview).not.toHaveBeenCalled()
  })

  it('allowSave=false makes workspace read-only and hides add rule', async () => {
    const wrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy({ effects: { allowSave: false } }) },
      global: { stubs },
    })
    const before = wrapper.props('modelValue').ruleSet.rules.length
    expect(wrapper.text()).not.toContain('+ 添加规则')
    expect(wrapper.findAll('button').filter((button) => button.text().includes('删除')).every((button) => button.attributes('disabled') !== undefined)).toBe(true)
    await (wrapper.vm as any).markDirty()
    expect(wrapper.emitted('dirty')).toBeUndefined()
    expect(wrapper.props('modelValue').ruleSet.rules).toHaveLength(before)
  })

  it('legacy read-only and lossy compatibility force edit controls off', () => {
    const wrapper = mount(MappingWorkspace, {
      props: {
        modelValue: document(),
        policy: policy({ legacy: { allowLegacyWrite: false } }),
        compatibility: { sourceFormat: 'standardization_rules', readable: true, writable: false, requiresMigration: true, lossyFields: ['regex'], unknownFields: {} },
      },
      global: { stubs },
    })
    expect(wrapper.find('.compat-blocked').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('+ 添加规则')
    expect(wrapper.findAll('button').filter((button) => ['↑', '↓', '复制', '删除'].includes(button.text())).every((button) => button.attributes('disabled') !== undefined)).toBe(true)
  })
  it('uses a separate labelled switch and disclosure button', () => {
    const wrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy() },
      global: { stubs },
    })
    const toggle = wrapper.get('.rule-toggle')
    const switchInput = wrapper.get('input[type="checkbox"]')
    expect(toggle.find('input').exists()).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe('mapping-rule-panel-r1')
    expect(switchInput.attributes('aria-label')).toContain('规则启用状态')
  })


  it('moves focus into the editor and returns it to the rule toggle', async () => {
    const wrapper = mount(MappingWorkspace, {
      attachTo: globalThis.document.body,
      props: { modelValue: document(), policy: policy() },
      global: { stubs },
    })
    const toggle = wrapper.find('.rule-toggle')
    await toggle.trigger('click')
    await flushPromises()
    expect((globalThis.document.activeElement as HTMLElement).id).toBe('mapping-rule-panel-r1')
    await toggle.trigger('click')
    await flushPromises()
    expect(globalThis.document.activeElement).toBe(toggle.element)
    wrapper.unmount()
  })

  it('reports whether an exposed rule focus succeeds', async () => {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    const wrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy() },
      global: { stubs },
    })
    expect(await (wrapper.vm as any).focusRule('r1')).toBe(true)
    expect(await (wrapper.vm as any).focusRule('missing')).toBe(false)

    const readonlyWrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy({ effects: { allowSave: false } }) },
      global: { stubs },
    })
    expect(await (readonlyWrapper.vm as any).focusRule('r1')).toBe(false)
  })

  it('exposes publish, execute and rebuild capability values to footer slot', async () => {
    const wrapper = mount(MappingWorkspace, {
      props: { modelValue: document(), policy: policy({ effects: { allowSave: false, allowPublish: true, allowExecute: true, allowRebuild: false } }) },
      slots: { 'footer-actions': (slotProps: any) => `save=${slotProps.canSave};publish=${slotProps.canPublish};execute=${slotProps.canExecute};rebuild=${slotProps.canRebuild}` },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('save=false;publish=false;execute=true;rebuild=false')
  })
})
