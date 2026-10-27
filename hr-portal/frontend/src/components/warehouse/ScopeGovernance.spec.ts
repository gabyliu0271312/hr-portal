import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, defineComponent, inject, provide, reactive, ref } from 'vue'
import StandardFieldBindingPanel from './StandardFieldBindingPanel.vue'
import StandardFieldDrawer from './StandardFieldDrawer.vue'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'
import { standardFieldsApi, type StandardFieldBindingCandidate, type StandardFieldDetail, type StandardFieldVersion } from '@/api/standardFields'
import ScopeGovernancePanel from './ScopeGovernancePanel.vue'
import ScopeClassificationDrawer from './ScopeClassificationDrawer.vue'
import ScopeHealthTable from './ScopeHealthTable.vue'
import { approveScopeClassification, type ScopeClassificationRecord, type ScopeHealth } from '@/api/scopeGovernance'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), prompt: vi.fn(), push: vi.fn() }))
vi.mock('@/api/client', () => ({ api: { get: mocks.get, put: mocks.put, post: mocks.post } }))
vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() }, ElMessageBox: { prompt: mocks.prompt } }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
const editable = ref(true)
const store = reactive({ menus: [{ code: 'warehouse.governance' }, { code: 'warehouse.assets' }], hasOp: () => editable.value })
vi.mock('@/stores/user', () => ({ useUserStore: () => store }))

function record(table = 'salary', version = 2): ScopeClassificationRecord {
  return { table_name: table, security_classification: 'controlled_fact', version, approved_by: null, approved_at: null, reason: null, runtime_filter_exemption: false }
}
const rows: ScopeHealth[] = [
  { table_name: 'salary', warehouse_layer: 'DWD', asset_status: 'published', scope_strategy: 'person_first', roster_join_configured: false, role_columns: [], dataset_count: 2, report_count: 3, issues: [{ code: 'SCOPE_NOT_RESOLVABLE', severity: 'error', message: '缺少权限锚点' }] },
  { table_name: 'org', warehouse_layer: 'DWD', asset_status: 'published', scope_strategy: 'cross_filter', roster_join_configured: false, role_columns: [], dataset_count: 1, report_count: 0, issues: [] },
]
const wrap = { template: '<div><slot /></div>' }
const stubs = {
  'el-button': { props: ['disabled', 'loading'], emits: ['click'], template: `<button :disabled="disabled" @click="$emit('click')"><slot /></button>` },
  'el-card': { template: '<section><slot name="header" /><slot /></section>' },
  'el-alert': { props: ['title'], template: '<p role="alert">{{ title }}</p>' },
  'el-empty': { props: ['description'], template: '<p>{{ description }}</p>' },
  'el-drawer': { props: ['modelValue', 'title', 'size'], template: '<aside v-if="modelValue"><h3>{{ title }}</h3><slot /><slot name="footer" /></aside>' },
  'el-input': { props: ['modelValue', 'disabled', 'type'], emits: ['update:modelValue'], template: '<textarea v-if="type === \'textarea\'" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><input v-else :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  'el-select': { props: ['modelValue', 'disabled'], emits: ['update:modelValue'], template: '<select :disabled="disabled" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>' },
  'el-option': { props: ['label', 'value'], template: '<option :value="value">{{ label }}</option>' },
  'el-form': wrap, 'el-form-item': wrap, 'el-descriptions': wrap,
  'el-descriptions-item': { props: ['label'], template: '<p>{{ label }}: <slot /></p>' },
}
const healthTableStub = { props: ['rows'], emits: ['review', 'repair'], template: '<ul><li v-for="row in rows" :key="row.table_name">{{ row.table_name }}<button @click="$emit(\'review\', row.table_name)">查看分类</button></li></ul>' }
function panel() {
  return mount(ScopeGovernancePanel, { global: { stubs: { ...stubs, ScopeHealthTable: healthTableStub }, directives: { loading: () => {} } } })
}
function drawer(table = 'salary') {
  return mount(ScopeClassificationDrawer, { props: { modelValue: true, tableName: table }, global: { stubs, directives: { loading: () => {} } } })
}
function button(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find(item => item.text() === text)!
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(finish => { resolve = finish })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  editable.value = true
  store.menus = [{ code: 'warehouse.governance' }, { code: 'warehouse.assets' }]
  mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('scope-health') ? rows : record(url.split('/').pop()) }))
  mocks.put.mockResolvedValue({ data: record('salary', 3) })
  mocks.post.mockResolvedValue({ data: {} })
  mocks.prompt.mockResolvedValue({ value: '已核对' })
})

describe('scope governance health panel', () => {
  it('loads and filters metadata without choosing a query strategy', async () => {
    const wrapper = panel()
    expect(wrapper.text()).toContain('正在扫描')
    await flushPromises()
    expect(mocks.get).toHaveBeenCalledWith('/warehouse/scope-health')
    expect(wrapper.text()).toContain('salary')
    await wrapper.find('input').setValue('salary')
    expect(wrapper.findAll('select option').map(option => option.text())).toEqual(['全部状态', '需修复', '待核对'])
    expect(wrapper.find('li').text()).toContain('salary')
    expect(wrapper.findAll('li')).toHaveLength(1)
    await wrapper.find('input').setValue('absent')
    expect(wrapper.text()).toContain('没有匹配')
    wrapper.unmount()
  })

  it('does not fetch metadata without governance view permission', async () => {
    store.menus = []
    const wrapper = panel()
    await flushPromises()
    expect(mocks.get).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('无权限查看')
    wrapper.unmount()
  })

  it('shows empty-state guidance rather than a false successful scan', async () => {
    mocks.get.mockResolvedValue({ data: [] })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain('暂无注册资产')
    wrapper.unmount()
  })

  it.each([403, 404, 500])('shows safe failure and allows explicit retry (%s)', async status => {
    mocks.get.mockRejectedValueOnce({ response: { status } })
    const wrapper = panel()
    await flushPromises()
    expect(wrapper.text()).toContain(status === 403 ? '无权限读取' : status === 404 ? '尚未可用' : '扫描失败')
    expect(wrapper.findAll('li')).toHaveLength(0)
    await button(wrapper, '刷新扫描').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('li')).toHaveLength(2)
    wrapper.unmount()
  })

  it('clears protected metadata when governance access is revoked', async () => {
    const wrapper = panel()
    await flushPromises()
    store.menus = []
    await flushPromises()
    expect(wrapper.text()).not.toContain('salary')
    expect(wrapper.text()).toContain('无权限查看')
    wrapper.unmount()
  })
})

describe('scope classification approval drawer', () => {
  it('keeps view-only roles read-only and hides approval controls', async () => {
    editable.value = false
    const wrapper = drawer()
    await flushPromises()
    expect(wrapper.text()).toContain('仅有查看权限')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(button(wrapper, '保存批准记录')).toBeUndefined()
    expect(mocks.put).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('requires a nonblank reason and posts the loaded version only once', async () => {
    const pending = deferred<{ data: ScopeClassificationRecord }>()
    mocks.put.mockReturnValue(pending.promise)
    const wrapper = drawer()
    await flushPromises()
    const save = button(wrapper, '保存批准记录')
    expect(save.attributes('disabled')).toBeDefined()
    await wrapper.find('textarea').setValue('  reviewed  ')
    await save.trigger('click')
    await save.trigger('click')
    expect(mocks.put).toHaveBeenCalledTimes(1)
    expect(mocks.put).toHaveBeenCalledWith('/warehouse/scope-classifications/salary', {
      security_classification: 'controlled_fact', reason: 'reviewed', expected_version: 2,
    })
    pending.resolve({ data: record('salary', 3) })
    await flushPromises()
    expect(wrapper.emitted('approved')).toEqual([['salary']])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it('does not silently retry or overwrite after a version conflict', async () => {
    mocks.put.mockRejectedValue({ response: { status: 409 } })
    const wrapper = drawer()
    await flushPromises()
    await wrapper.find('textarea').setValue('reviewed')
    await button(wrapper, '保存批准记录').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('版本已变更')
    expect(wrapper.text()).toContain('不会自动覆盖')
    expect(button(wrapper, '保存批准记录').attributes('disabled')).toBeDefined()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('reviewed')
    expect(mocks.get).toHaveBeenCalledTimes(1)
    expect(mocks.put).toHaveBeenCalledTimes(1)
    mocks.get.mockResolvedValue({ data: record('salary', 4) })
    await button(wrapper, '重新加载').trigger('click')
    await flushPromises()
    await wrapper.find('textarea').setValue('reviewed latest version')
    mocks.put.mockResolvedValue({ data: record('salary', 5) })
    await button(wrapper, '保存批准记录').trigger('click')
    await flushPromises()
    expect(mocks.put.mock.calls[1][1].expected_version).toBe(4)
    wrapper.unmount()
  })

  it.each([403, 404, 500])('handles detail fetch failure without showing old data (%s)', async status => {
    mocks.get.mockRejectedValue({ response: { status } })
    const wrapper = drawer()
    await flushPromises()
    expect(wrapper.text()).toContain(status === 403 ? '无权限查看' : status === 404 ? '接口或资产不存在' : '读取分类失败')
    expect(wrapper.find('textarea').exists()).toBe(false)
    expect(button(wrapper, '保存批准记录').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('ignores a stale fetch when another asset is selected', async () => {
    const old = deferred<{ data: ScopeClassificationRecord }>()
    mocks.get.mockImplementation((url: string) => url.endsWith('/salary') ? old.promise : Promise.resolve({ data: record('org', 7) }))
    const wrapper = drawer()
    await wrapper.setProps({ tableName: 'org' })
    await flushPromises()
    old.resolve({ data: record('salary', 2) })
    await flushPromises()
    expect(wrapper.text()).toContain('版本: 7')
    await wrapper.find('textarea').setValue('reviewed org')
    await button(wrapper, '保存批准记录').trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledWith('/warehouse/scope-classifications/org', expect.objectContaining({ expected_version: 7 }))
    wrapper.unmount()
  })

  it('does not restore data after closing during a pending fetch', async () => {
    const pending = deferred<{ data: ScopeClassificationRecord }>()
    mocks.get.mockReturnValue(pending.promise)
    const wrapper = drawer()
    await wrapper.setProps({ modelValue: false })
    pending.resolve({ data: record('salary', 2) })
    await flushPromises()
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(wrapper.emitted('approved')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not submit after update permission is revoked', async () => {
    const wrapper = drawer()
    await flushPromises()
    await wrapper.find('textarea').setValue('reviewed')
    editable.value = false
    await flushPromises()
    expect(button(wrapper, '保存批准记录')).toBeUndefined()
    expect(mocks.put).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

it('uses the shared API client and never sends a client-selected approver', async () => {
  await approveScopeClassification('salary', { security_classification: 'person_bridge', reason: ' reviewed ' }, 2)
  expect(mocks.put.mock.calls[0][1]).toEqual({ security_classification: 'person_bridge', reason: 'reviewed', expected_version: 2 })
})

it('filters diagnostics by severity and opens a classification record from the existing panel', async () => {
  const wrapper = panel()
  await flushPromises()
  await wrapper.find('select').setValue('error')
  expect(wrapper.findAll('li')).toHaveLength(1)
  await button(wrapper, '查看分类').trigger('click')
  await flushPromises()
  expect(mocks.get).toHaveBeenCalledWith('/warehouse/scope-classifications/salary')
  expect(wrapper.text()).toContain('安全分类 · salary')
  expect(wrapper.text()).toContain('不豁免当前范围过滤')
  await wrapper.find('textarea').setValue('reviewed')
  await button(wrapper, '保存批准记录').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('当前查询授权未改变')
  wrapper.unmount()
})

it('keeps the table five-part layout and enforces view permissions on its actions', async () => {
  const tableProbe = { name: 'TableProbe', props: ['data', 'stripe', 'maxHeight'], template: '<div><slot /></div>' }
  const columnProbe = {
    name: 'ColumnProbe', props: ['prop', 'label', 'minWidth', 'width', 'fixed'],
    data: () => ({ row: rows[0] }), template: '<div><slot :row="row" /></div>',
  }
  const wrapper = mount(ScopeHealthTable, {
    props: { rows },
    global: { stubs: { ...stubs, 'el-table': tableProbe, 'el-table-column': columnProbe } },
  })
  expect(wrapper.findComponent({ name: 'TableProbe' }).props('maxHeight')).toBe('600')
  const columns = wrapper.findAllComponents({ name: 'ColumnProbe' })
  const actions = columns.find(column => column.props('label') === '操作')!
  expect(actions.props('width')).toBe('280')
  expect(actions.props('fixed')).toBe('right')
  expect(columns.filter(column => column !== actions).every(column => column.props('minWidth'))).toBe(true)
  await button(wrapper, '查看分类').trigger('click')
  expect(wrapper.emitted('review')).toEqual([['salary']])
  await button(wrapper, '修复字段配置').trigger('click')
  expect(wrapper.emitted('repair')).toEqual([['salary']])
  store.menus = [{ code: 'warehouse.governance' }]
  await flushPromises()
  expect(button(wrapper, '修复字段配置')).toBeUndefined()
  wrapper.unmount()
})

it('does not accept a late approval response for a newly selected asset', async () => {
  const pending = deferred<{ data: ScopeClassificationRecord }>()
  mocks.put.mockReturnValue(pending.promise)
  const wrapper = drawer()
  await flushPromises()
  await wrapper.find('textarea').setValue('reviewed')
  await button(wrapper, '保存批准记录').trigger('click')
  await wrapper.setProps({ tableName: 'org' })
  await flushPromises()
  pending.resolve({ data: record('salary', 3) })
  await flushPromises()
  expect(wrapper.emitted('approved')).toBeUndefined()
  expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  expect(wrapper.text()).toContain('安全分类 · org')
  wrapper.unmount()
})

const standardTable = defineComponent({
  name: 'StandardTable', props: ['data', 'stripe', 'maxHeight'],
  setup(props) { provide('standardRows', computed(() => props.data || [])) },
  template: '<div><slot /></div>',
})
const standardColumn = defineComponent({
  name: 'StandardColumn', props: ['prop', 'label', 'minWidth', 'width', 'fixed'],
  setup() { return { tableRows: inject('standardRows') } },
  template: '<div><strong>{{ label }}</strong><div v-for="(row, index) in tableRows" :key="index"><slot :row="row" :$index="index">{{ row[prop] }}</slot></div></div>',
})
const standardStubs = {
  ...stubs, 'el-table': standardTable, 'el-table-column': standardColumn,
  'el-input-number': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />' },
  'el-switch': { props: ['modelValue'], emits: ['update:modelValue'], template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />' },
}
function version(overrides: Partial<StandardFieldVersion> = {}): StandardFieldVersion {
  return { id: 11, standard_field_id: 1, version: 1, revision: 4, field_name: '匹配类型', business_definition: '来源匹配字段类型', data_type: 'enum', grain_level: 'coarse', permission_domain: 'public', is_permission_anchor: false, owner_user_id: 1, category_ids: [], value_domain: { items: [{ code: 'org', name: '组织', enabled: true, sort_order: 0 }] }, status: 'draft', created_by: 1, approved_by: null, approved_at: null, approval_reason: null, status_reason: null, status_changed_by: null, status_changed_at: null, created_at: '', updated_at: '', ...overrides }
}
function standardDetail(item = version()): StandardFieldDetail {
  return { id: item.standard_field_id, field_code: 'field_type', current_active_version_id: item.status === 'active' ? item.id : null, latest_version: item, versions: [item], bindings: [] }
}
function candidate(overrides: Partial<StandardFieldBindingCandidate> = {}): StandardFieldBindingCandidate {
  return { target_kind: 'dataset_output_field', target_id: 647, table_name: null, dataset_id: 10, dataset_name: '费用分类', alias: 'current', column_code: 'field_type', display_name: '匹配类型', source_field_id: 'source-type', data_type: 'enum', is_sensitive: false, existing_binding_id: null, existing_binding_status: null, ...overrides }
}
function standardSetup(item = version()) {
  store.menus = [{ code: 'warehouse.standard_fields.catalog' }]
  mocks.get.mockImplementation((url: string) => Promise.resolve({ data:
    url === '/datasets' ? [{ id: 10, name: '费用分类' }, { id: 15, name: '分摊' }]
      : url.endsWith('_visible-tables') ? [{ table_name: 'emp_monthly_cost_class', label: '费用分类来源' }]
        : url.endsWith('binding-candidates') ? [candidate()]
          : url === '/field-categories' ? [] : standardDetail(item),
  }))
}
function standardDrawer(item = version()) {
  standardSetup(item)
  return mount(StandardFieldDrawer, { props: { modelValue: true, fieldId: item.standard_field_id, datasetId: 10, governanceMode: true }, global: { stubs: standardStubs, directives: { loading: () => {} } } })
}
function bindingPanel(datasetId?: number) {
  standardSetup()
  return mount(StandardFieldBindingPanel, { props: { fieldId: 1, activeVersionId: 11, bindings: [], datasetId }, global: { stubs: standardStubs, directives: { loading: () => {} } } })
}
const candidateCalls = () => mocks.get.mock.calls.filter(([url]) => String(url).endsWith('binding-candidates'))

describe('standard field scoped binding candidates', () => {
  it('never requests global candidates without a selected source, including the shared API', async () => {
    const wrapper = bindingPanel()
    await flushPromises()
    expect(candidateCalls()).toHaveLength(0)
    await standardFieldsApi.bindingCandidates(1, {})
    expect(candidateCalls()).toHaveLength(0)
    expect(button(wrapper, '查询').attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('passes dataset identity and filters unrelated and sensitive candidates', async () => {
    const wrapper = bindingPanel(10)
    mocks.get.mockResolvedValue({ data: [candidate(), candidate({ dataset_id: 15, display_name: '无关数据集' }), candidate({ is_sensitive: true, display_name: '敏感字段' }), candidate({ target_kind: 'table_column', table_name: 'other', display_name: '无关物理列' })] })
    await button(wrapper, '查询').trigger('click')
    await flushPromises()
    expect(candidateCalls().at(-1)).toEqual(['/warehouse/standard-fields/1/binding-candidates', { params: { dataset_id: 10, table_name: undefined, keyword: undefined } }])
    expect(wrapper.text()).toContain('匹配类型')
    for (const text of ['无关数据集', '敏感字段', '无关物理列']) expect(wrapper.text()).not.toContain(text)
    expect(wrapper.findComponent(standardTable).props('maxHeight')).toBe('600')
    const columns = wrapper.findAllComponents(standardColumn)
    expect(columns.find(column => column.props('label') === '操作')?.props()).toMatchObject({ width: '280', fixed: 'right' })
    expect(columns.filter(column => column.props('label') !== '操作').every(column => column.props('minWidth'))).toBe(true)
    wrapper.unmount()
  })

  it('loads only physical columns for the selected source table and clears when unselected', async () => {
    const wrapper = bindingPanel()
    await flushPromises()
    await wrapper.setProps({ tableName: 'emp_monthly_cost_class' })
    mocks.get.mockResolvedValue({ data: [candidate({ target_kind: 'table_column', table_name: 'emp_monthly_cost_class', display_name: '来源匹配类型' }), candidate({ display_name: '数据集输出不混入' })] })
    await button(wrapper, '查询').trigger('click')
    await flushPromises()
    expect(candidateCalls().at(-1)?.[1].params).toMatchObject({ table_name: 'emp_monthly_cost_class' })
    expect(wrapper.text()).toContain('来源匹配类型')
    expect(wrapper.text()).not.toContain('数据集输出不混入')
    const count = candidateCalls().length
    await wrapper.setProps({ tableName: null })
    await flushPromises()
    expect(candidateCalls()).toHaveLength(count)
    expect(wrapper.text()).not.toContain('来源匹配类型')
    wrapper.unmount()
  })

  it('discards late results when the dataset, field, permission or component lifetime changes', async () => {
    const wrapper = bindingPanel(10)
    await flushPromises()
    const pending = deferred<{ data: StandardFieldBindingCandidate[] }>()
    mocks.get.mockImplementation((url: string) => url.endsWith('/1/binding-candidates') ? pending.promise : Promise.resolve({ data: [candidate({ dataset_id: 15, display_name: '新范围' })] }))
    await button(wrapper, '查询').trigger('click')
    await wrapper.setProps({ datasetId: 15, fieldId: 2 })
    await flushPromises()
    pending.resolve({ data: [candidate({ display_name: '迟到旧结果' })] })
    await flushPromises()
    expect(wrapper.text()).toContain('新范围')
    expect(wrapper.text()).not.toContain('迟到旧结果')
    store.menus = []
    await flushPromises()
    expect(wrapper.text()).not.toContain('新范围')
    expect(wrapper.text()).toContain('无权读取')
    wrapper.unmount()
  })

  it('includes the selected dataset identity in the suggested-binding POST', async () => {
    const wrapper = bindingPanel(10)
    await flushPromises()
    await button(wrapper, '建议绑定').trigger('click')
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('/warehouse/standard-fields/1/bindings', { target_kind: 'dataset_output_field', target_id: 647, standard_field_version_id: 11, dataset_id: 10 })
    wrapper.unmount()
  })

  it('uses binding_version and suppresses a pending confirmation after the scope changes', async () => {
    const wrapper = bindingPanel(10)
    const suggested = candidate({ existing_binding_id: 71, existing_binding_status: 'suggested' })
    mocks.get.mockResolvedValue({ data: [suggested] })
    await wrapper.setProps({ bindings: [{ id: 71, binding_version: 8, status: 'suggested', standard_field_version_id: 11, table_column_id: null, dataset_output_field_id: 647 }] })
    await button(wrapper, '查询').trigger('click')
    await flushPromises()
    const pending = deferred<{ value: string }>()
    mocks.prompt.mockReturnValueOnce(pending.promise)
    await button(wrapper, '确认绑定').trigger('click')
    await wrapper.setProps({ datasetId: 15 })
    pending.resolve({ value: '已核对' })
    await flushPromises()
    expect(mocks.post).not.toHaveBeenCalled()
    await wrapper.setProps({ datasetId: 10 })
    await flushPromises()
    await button(wrapper, '确认绑定').trigger('click')
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('/warehouse/standard-fields/1/bindings/71/confirm', { expected_revision: 8, reason: '已核对' })
    wrapper.unmount()
  })

  it.each([403, 409, 500])('shows candidate errors without restoring old rows (%s)', async status => {
    const wrapper = bindingPanel(10)
    await flushPromises()
    mocks.get.mockRejectedValue({ response: { status, data: { detail: { message: '候选读取被拒绝' } } } })
    await button(wrapper, '查询').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(status === 403 ? '无权读取' : '候选读取被拒绝')
    expect(button(wrapper, '建议绑定')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('standard field enum value domain', () => {
  it('keeps the catalog drawer focused on definition, classification and references', async () => {
    standardSetup()
    const wrapper = mount(StandardFieldDrawer, { props: { modelValue: true, fieldId: 1, datasetId: 10 }, global: { stubs: standardStubs, directives: { loading: () => {} } } })
    await flushPromises()
    expect(wrapper.text()).toContain('引用关系')
    expect(wrapper.text()).toContain('敏感字段分类')
    expect(wrapper.text()).not.toContain('语义版本')
    expect(wrapper.findComponent(StandardFieldBindingPanel).exists()).toBe(false)
    wrapper.unmount()
  })

  it('does not restore retired version controls even in the former governance mode', async () => {
    for (const status of ['draft', 'active', 'deprecated', 'archived'] as const) {
      const wrapper = standardDrawer(version({ status }))
      await flushPromises()
      expect(wrapper.find('.standard-field-versions').exists()).toBe(false)
      for (const label of ['新建版本', '审核启用', '弃用', '归档']) {
        expect(button(wrapper, label)).toBeUndefined()
      }
      expect(mocks.post).not.toHaveBeenCalled()
      expect(mocks.prompt).not.toHaveBeenCalled()
      wrapper.unmount()
    }
    for (const method of ['approve', 'deprecate', 'archive']) {
      expect(standardFieldsApi).not.toHaveProperty(method)
    }
  })

  it('keeps legacy domain definitions readonly without creating empty replacement items', async () => {
    const legacy = { values: ['org', 'company'], description: '历史定义' }
    const wrapper = standardDrawer(version({ value_domain: legacy }))
    await flushPromises()
    expect(wrapper.text()).toContain('旧格式值域')
    expect(button(wrapper, '新建版本')).toBeUndefined()
    await button(wrapper, '编辑').trigger('click')
    expect(wrapper.text()).toContain('当前不能添加或覆盖枚举项')
    expect(button(wrapper, '添加枚举值')).toBeUndefined()
    expect(wrapper.find('input[aria-label="枚举编码"]').exists()).toBe(false)
    expect(button(wrapper, '保存草稿').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('请先完成值域格式迁移')
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put).not.toHaveBeenCalled()
    expect(mocks.post).not.toHaveBeenCalled()
    wrapper.unmount()
    const activeWrapper = standardDrawer(version({ status: 'active', value_domain: legacy }))
    await flushPromises()
    expect(button(activeWrapper, '新建版本')).toBeUndefined()
    await button(activeWrapper, '编辑').trigger('click')
    expect(button(activeWrapper, '保存草稿')).toBeUndefined()
    expect(mocks.post).not.toHaveBeenCalled()
    activeWrapper.unmount()
  })

  it('projects edited value domains onto the strict write schema without extra keys', async () => {
    const wrapper = standardDrawer(version({ value_domain: { note: '旧附加属性', items: [{ code: 'org', name: '组织', enabled: true, sort_order: 0, legacy_key: '旧项属性' }] } }))
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put.mock.calls[0][1].value_domain).toEqual({ items: [{ code: 'org', name: '组织', enabled: true, sort_order: 0 }] })
    wrapper.unmount()
  })

  it('discards unsaved input on update permission revocation even if permission later returns', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    await wrapper.find('input[aria-label="枚举名称"]').setValue('撤权前未保存内容')
    editable.value = false
    await flushPromises()
    expect(wrapper.text()).not.toContain('撤权前未保存内容')
    expect(button(wrapper, '保存草稿')).toBeUndefined()
    editable.value = true
    await flushPromises()
    expect(button(wrapper, '保存草稿')).toBeUndefined()
    await button(wrapper, '编辑').trigger('click')
    expect((wrapper.find('input[aria-label="枚举名称"]').element as HTMLInputElement).value).toBe('组织')
    wrapper.unmount()
  })

  it('renders only the message from serialized detail errors in the drawer and candidate panel', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    mocks.put.mockRejectedValueOnce({ response: { data: { detail: JSON.stringify({ code: 'revision_conflict', message: '请重新加载当前版本' }) } } })
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('请重新加载当前版本')
    expect(wrapper.text()).not.toContain('revision_conflict')
    wrapper.unmount()
    const panelWrapper = bindingPanel(10)
    await flushPromises()
    mocks.get.mockRejectedValueOnce({ response: { data: { detail: JSON.stringify({ code: 'scope_denied', message: '来源范围不可用' }) } } })
    await button(panelWrapper, '查询').trigger('click')
    await flushPromises()
    expect(panelWrapper.text()).toContain('来源范围不可用')
    expect(panelWrapper.text()).not.toContain('scope_denied')
    panelWrapper.unmount()
  })

  it('creates a new enum draft using manually entered domain items', async () => {
    standardSetup()
    const wrapper = mount(StandardFieldDrawer, { props: { modelValue: true, fieldId: null }, global: { stubs: standardStubs, directives: { loading: () => {} } } })
    await flushPromises()
    const inputs = wrapper.findAll('input')
    await inputs[0].setValue('cost_type')
    await inputs[1].setValue('费用类型')
    await wrapper.find('textarea').setValue('人工维护的费用归类')
    expect(wrapper.text()).not.toContain('权限锚点候选')
    expect(wrapper.text()).not.toContain('负责人用户 ID')
    await wrapper.findAll('select')[0].setValue('enum')
    await button(wrapper, '添加枚举值').trigger('click')
    await wrapper.find('input[aria-label="枚举编码"]').setValue(' direct ')
    await wrapper.find('input[aria-label="枚举名称"]').setValue(' 直接费用 ')
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('/warehouse/standard-fields', expect.objectContaining({ field_code: 'cost_type', data_type: 'enum', value_domain: { items: [{ code: 'direct', name: '直接费用', enabled: true, sort_order: 0 }] } }))
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('owner_user_id')
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('permission_domain')
    expect(mocks.post.mock.calls[0][1]).not.toHaveProperty('category_ids')
    expect(candidateCalls()).toHaveLength(0)
    wrapper.unmount()
  })

  it('edits draft items and persists the complete value domain with the loaded revision', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    expect(wrapper.findComponent(StandardFieldBindingPanel).props('datasetId')).toBe(10)
    await button(wrapper, '编辑').trigger('click')
    const domain = wrapper.findComponent(StandardFieldValueDomain)
    await domain.find('input[aria-label="枚举名称"]').setValue('组织编码')
    await domain.find('input[aria-label="枚举启用"]').setValue(false)
    await domain.find('input[aria-label="枚举排序"]').setValue(2)
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put).toHaveBeenCalledWith('/warehouse/standard-fields/1/versions/11', expect.objectContaining({ expected_revision: 4, value_domain: { items: [{ code: 'org', name: '组织编码', enabled: false, sort_order: 2 }] } }))
    wrapper.unmount()
  })

  it('preserves active field editing without exposing a version-management workflow', async () => {
    const item = version({ status: 'active' })
    const wrapper = standardDrawer(item)
    await flushPromises()
    expect(button(wrapper, '编辑草稿')).toBeUndefined()
    expect(wrapper.findComponent(StandardFieldValueDomain).props('readonly')).toBe(true)
    expect(wrapper.find('input[aria-label="枚举编码"]').exists()).toBe(false)
    expect(button(wrapper, '新建版本')).toBeUndefined()
    expect(button(wrapper, '审核启用')).toBeUndefined()
    await button(wrapper, '编辑').trigger('click')
    await wrapper.find('input[aria-label="枚举名称"]').setValue('新组织定义')
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.post).toHaveBeenCalledWith('/warehouse/standard-fields/1/versions', expect.objectContaining({ expected_version: 1, value_domain: { items: [{ code: 'org', name: '新组织定义', enabled: true, sort_order: 0 }] } }))
    expect(item.value_domain?.items?.[0]?.name).toBe('组织')
    expect(mocks.put).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('validates blank or duplicate codes and supports removing draft entries', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    await button(wrapper, '添加枚举值').trigger('click')
    await button(wrapper, '保存草稿').trigger('click')
    expect(mocks.put).not.toHaveBeenCalled()
    const codes = wrapper.findAll('input[aria-label="枚举编码"]')
    const names = wrapper.findAll('input[aria-label="枚举名称"]')
    await codes[1].setValue(' org ')
    await names[1].setValue('重复编码')
    await button(wrapper, '保存草稿').trigger('click')
    expect(mocks.put).not.toHaveBeenCalled()
    await codes[1].setValue('company')
    await button(wrapper, '移除').trigger('click')
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put.mock.calls[0][1].value_domain.items).toEqual([{ code: 'company', name: '重复编码', enabled: true, sort_order: 1 }])
    wrapper.unmount()
  })

  it('does not show enum controls for non-enum fields and clears enum items after a type change', async () => {
    const wrapper = standardDrawer(version({ data_type: 'number', value_domain: null }))
    await flushPromises()
    expect(wrapper.findComponent(StandardFieldValueDomain).exists()).toBe(false)
    await button(wrapper, '编辑').trigger('click')
    expect(wrapper.findComponent(StandardFieldValueDomain).exists()).toBe(false)
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put.mock.calls[0][1].value_domain).toBeNull()
    wrapper.unmount()
    const enumWrapper = standardDrawer()
    await flushPromises()
    await button(enumWrapper, '编辑').trigger('click')
    await enumWrapper.findAll('select')[0].setValue('string')
    await button(enumWrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(mocks.put.mock.calls.at(-1)?.[1].value_domain).toBeNull()
    enumWrapper.unmount()
  })

  it('keeps null enum domains empty rather than discovering business values', async () => {
    const wrapper = standardDrawer(version({ value_domain: null }))
    await flushPromises()
    expect(wrapper.text()).toContain('不读取业务数据')
    expect(wrapper.find('input[aria-label="枚举编码"]').exists()).toBe(false)
    expect(mocks.get.mock.calls.every(([url]) => !/distinct|preview|enum-options|rows/.test(url))).toBe(true)
    wrapper.unmount()
  })

  it('retains draft input after 409 and never retries or closes automatically', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    await wrapper.find('input[aria-label="枚举名称"]').setValue('待保存')
    mocks.put.mockRejectedValueOnce({ response: { status: 409, data: { detail: { message: '版本冲突，请重新加载' } } } })
    await button(wrapper, '保存草稿').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('版本冲突')
    expect((wrapper.find('input[aria-label="枚举名称"]').element as HTMLInputElement).value).toBe('待保存')
    expect(mocks.put).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    wrapper.unmount()
  })

  it('does not restore a closed or replaced field from late fetch/save responses', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    await button(wrapper, '编辑').trigger('click')
    const pendingSave = deferred<{ data: object }>()
    mocks.put.mockReturnValueOnce(pendingSave.promise)
    await button(wrapper, '保存草稿').trigger('click')
    mocks.get.mockImplementation((url: string) => Promise.resolve({ data: url.includes('/warehouse/standard-fields/') && !url.endsWith('binding-candidates') ? standardDetail(version({ id: 22, standard_field_id: 2, field_name: '新字段' })) : [] }))
    await wrapper.setProps({ fieldId: 2 })
    await flushPromises()
    pendingSave.resolve({ data: {} })
    await flushPromises()
    expect(wrapper.emitted('changed')).toBeUndefined()
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.text()).toContain('新字段')
    const pendingGet = deferred<{ data: StandardFieldDetail }>()
    mocks.get.mockReturnValue(pendingGet.promise)
    await wrapper.setProps({ fieldId: 3 })
    await wrapper.setProps({ modelValue: false })
    pendingGet.resolve({ data: standardDetail() })
    await flushPromises()
    expect(wrapper.find('aside').exists()).toBe(false)
    wrapper.unmount()
  })

  it('hides write controls for readonly users and clears metadata when catalog access is revoked', async () => {
    const wrapper = standardDrawer()
    await flushPromises()
    editable.value = false
    await flushPromises()
    expect(button(wrapper, '编辑草稿')).toBeUndefined()
    expect(button(wrapper, '新建版本')).toBeUndefined()
    store.menus = []
    await flushPromises()
    expect(wrapper.text()).not.toContain('匹配类型')
    expect(wrapper.text()).toContain('无权限查看标准字段目录')
    wrapper.unmount()
  })
})
