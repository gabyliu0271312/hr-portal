import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive, ref } from 'vue'
import ScopeGovernancePanel from './ScopeGovernancePanel.vue'
import ScopeClassificationDrawer from './ScopeClassificationDrawer.vue'
import ScopeHealthTable from './ScopeHealthTable.vue'
import { approveScopeClassification, type ScopeClassificationRecord, type ScopeHealth } from '@/api/scopeGovernance'

const mocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), push: vi.fn() }))
vi.mock('@/api/client', () => ({ api: { get: mocks.get, put: mocks.put } }))
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
