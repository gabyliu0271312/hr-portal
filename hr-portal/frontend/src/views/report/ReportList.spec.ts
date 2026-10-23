import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ReportList from './ReportList.vue'
import { reportErrorMessage } from '@/api/reports'
import { reactive } from 'vue'
import ReportExecutionAuthorization from '@/components/report/ReportExecutionAuthorization.vue'
import ReportViewerPanel from '@/components/report/ReportViewerPanel.vue'
import { ElMessage } from 'element-plus'

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  run: vi.fn(),
  binding: vi.fn(),
  readiness: vi.fn(),
  bind: vi.fn(),
  permission: null as any,
  list: vi.fn(),
  datasets: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
}))

vi.mock('@/api/reports', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/api/reports')>(),
  reportsApi: {
    list: mocks.list,
    get: mocks.get,
    run: mocks.run,
    executionBinding: mocks.binding,
    executionReadiness: mocks.readiness,
    bindExecution: mocks.bind,
    create: vi.fn(),
    remove: vi.fn(),
    push: vi.fn(),
  },
  REPORT_VISIBILITY_LABELS: { private: '私密', scoped: '指定范围', public: '公开' },
}))
vi.mock('@/api/datasets', () => ({ datasetsApi: { list: mocks.datasets } }))
vi.mock('@/stores/user', () => ({
  useUserStore: () => mocks.permission || {
    menus: [{ code: 'report.list' }],
    hasOp: () => true,
  },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {}, fullPath: '/report/list' }),
  useRouter: () => ({ replace: mocks.replace, push: mocks.push }),
}))

const stubs = {
  ElIcon: { template: '<span><slot /></span>' },
  ElSelect: { props: ['modelValue'], emits: ['update:modelValue'], template: '<select class="dataset-select" :value="modelValue ?? \'\'" @change="$emit(\'update:modelValue\', $event.target.value ? Number($event.target.value) : null)"><slot /></select>' },
  ElOption: { props: ['value', 'label'], template: '<option :value="value">{{ label }}</option>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<label><input class="name-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><slot name="prefix" /></label>' },
  ElButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  ElTooltip: { template: '<span><slot /></span>' },
  ElTable: { template: '<div><slot /><slot name="empty" /></div>' },
  ElTableColumn: true, ElTag: true, ElDropdown: true, ElDropdownMenu: true, ElDropdownItem: true, ElPagination: true,
  ElEmpty: { props: ['description'], template: '<div>{{ description }}<slot /></div>' },
}
const authorizationStubs = {
  ...stubs,
  PermissionButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
  ElDrawer: { props: ['modelValue'], template: '<div v-if="modelValue"><slot /></div>' },
  'el-alert': { props: ['title', 'description'], template: '<div>{{ title }}{{ description }}<slot /></div>' },
  ElAlert: { props: ['title', 'description'], template: '<div>{{ title }}{{ description }}<slot /></div>' },
  ElForm: { template: '<form><slot /></form>' },
  ElFormItem: { template: '<label><slot /></label>' },
  ElInput: { props: ['modelValue'], emits: ['update:modelValue'], template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' },
  ElCheckbox: { props: ['modelValue'], emits: ['update:modelValue'], template: '<label><input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" /><slot /></label>' },
  FullscreenWorkspaceShell: { template: '<main><slot name="actions" /><slot name="title-extra" /><slot /></main>' },
  ReportPreviewTable: { props: ['items'], template: '<div class="result-items">{{ items }}</div>' },
  ReportRuntimeFilters: { template: '<div class="runtime-filters" />' },
}
const fixture = (id = 1) => ({ id, name: `报表${id}`, dataset_id: id + 10, can_edit: true,
  execution_version: 'authorized_v1', config: { columns: [], filters: [] }, visibility: 'private', run_count: 0 } as any)
const ready = (datasetId = 11) => ({ dataset_id: datasetId, eligible: true, runtime_enabled: true, contract_id: 8, contract_version: 2, issues: [] })
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const button = (wrapper: any, text: string) => wrapper.findAll('button').find((node: any) => node.text() === text)!

describe('021 report execution authorization', () => {
  beforeEach(() => {
    vi.useRealTimers()
    mocks.permission = reactive({ user: { id: 7 }, roles: [], menus: [{ code: 'report.list' }, { code: 'warehouse.assets' }],
      reportUpdate: true, warehouseUpdate: true,
      hasOp(code: string, op: string) { return code === 'report.list' ? (op === 'U' ? this.reportUpdate : true) : this.warehouseUpdate },
    })
    mocks.binding.mockReset().mockResolvedValue({ execution_version: 'legacy_v1', fingerprint: 'a'.repeat(64) })
    mocks.readiness.mockReset().mockResolvedValue(ready())
    mocks.bind.mockReset().mockResolvedValue({ execution_version: 'authorized_v1', fingerprint: 'a'.repeat(64) })
    mocks.get.mockReset().mockResolvedValue(fixture())
    mocks.run.mockReset().mockResolvedValue({ columns: [], items: [{ amount: 600 }], total: 1, page: 1, page_size: 50 })
  })
  afterEach(() => { mocks.permission = null; vi.restoreAllMocks() })
  const mountAuthorization = () => mount(ReportExecutionAuthorization, { props: { report: fixture() }, global: { stubs: authorizationStubs, directives: { loading: {} } } })
  async function prepare(wrapper: any) {
    await button(wrapper, '执行授权').trigger('click'); await flushPromises()
    await wrapper.get('textarea').setValue('批准无出口试点')
    await wrapper.get('input[type="checkbox"]').setValue(true)
  }
  it('requires both U permissions and can_edit before any metadata request', async () => {
    mocks.permission.warehouseUpdate = false
    const wrapper = mountAuthorization()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(mocks.binding).not.toHaveBeenCalled()
    mocks.permission.warehouseUpdate = true
    await wrapper.setProps({ report: { ...fixture(), can_edit: false } })
    expect(wrapper.find('button').exists()).toBe(false)
    wrapper.unmount()
  })
  it('requires warehouse view access even when update is allowed', () => {
    mocks.permission.menus = [{ code: 'report.list' }]
    const wrapper = mountAuthorization()
    expect(wrapper.find('button').exists()).toBe(false)
    expect(mocks.readiness).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('extracts safe messages after the shared interceptor stringifies details', () => {
    expect(reportErrorMessage({ response: { data: { detail: JSON.stringify({ code: 'execution_binding_stale', message: '请重新批准' }) } } }, '失败')).toBe('请重新批准')
    expect(reportErrorMessage({ detail: '网络异常' }, '失败')).toBe('网络异常')
  })
  it('rechecks current readiness and posts only fingerprint, contract version and explicit reason', async () => {
    const wrapper = mountAuthorization()
    await prepare(wrapper)
    expect(wrapper.text()).toContain('无明细下钻、复杂过滤或对外出口')
    await button(wrapper, '批准执行授权').trigger('click'); await flushPromises()
    expect(mocks.readiness).toHaveBeenCalledTimes(2)
    expect(mocks.bind).toHaveBeenCalledWith(1, { expected_fingerprint: 'a'.repeat(64), contract_id: 8, contract_version: 2, reason: '批准无出口试点' })
    expect(wrapper.emitted('approved')).toHaveLength(1)
    wrapper.unmount()
  })
  it('blocks approval when the fresh readiness no longer passes', async () => {
    const wrapper = mountAuthorization(); await prepare(wrapper)
    mocks.readiness.mockResolvedValueOnce({ ...ready(), runtime_enabled: false })
    await button(wrapper, '批准执行授权').trigger('click'); await flushPromises()
    expect(mocks.bind).not.toHaveBeenCalled()
    expect(wrapper.get('textarea').element.value).toBe('批准无出口试点')
    expect(wrapper.text()).toContain('主动重新加载')
    wrapper.unmount()
  })
  it('preserves the reason on 409 and requires an explicit reload and confirmation', async () => {
    mocks.bind.mockRejectedValueOnce({ response: { status: 409, data: { detail: { message: '报表已变化' } } } })
    const wrapper = mountAuthorization(); await prepare(wrapper)
    await button(wrapper, '批准执行授权').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('报表已变化')
    expect(wrapper.text()).not.toContain('[object Object]')
    expect(wrapper.get('textarea').element.value).toBe('批准无出口试点')
    expect(button(wrapper, '批准执行授权').attributes('disabled')).toBeDefined()
    await button(wrapper, '重新加载').trigger('click'); await flushPromises()
    expect(wrapper.get('textarea').element.value).toBe('批准无出口试点')
    expect((wrapper.get('input[type="checkbox"]').element as HTMLInputElement).checked).toBe(false)
    wrapper.unmount()
  })
  it.each(['object', 'permission'])('ignores pending approval after %s changes, without success feedback', async (kind) => {
    const pending = deferred(); mocks.bind.mockReturnValue(pending.promise)
    const success = vi.spyOn(ElMessage, 'success')
    const wrapper = mountAuthorization(); await prepare(wrapper)
    await button(wrapper, '批准执行授权').trigger('click'); await flushPromises()
    if (kind === 'object') await wrapper.setProps({ report: fixture(2) })
    else mocks.permission.warehouseUpdate = false
    await flushPromises(); pending.resolve({ execution_version: 'authorized_v1', fingerprint: 'a'.repeat(64) }); await flushPromises()
    expect(success).not.toHaveBeenCalled(); expect(wrapper.emitted('approved')).toBeUndefined()
    wrapper.unmount()
  })
  it('renders authorized range, hides unsupported channels and clears old rows on authorization failure', async () => {
    const wrapper = mount(ReportViewerPanel, { props: { reportId: 1 }, global: { stubs: authorizationStubs, directives: { loading: {} } } })
    await flushPromises()
    expect(wrapper.text()).toContain('当前授权范围内汇总')
    expect(wrapper.find('.runtime-filters').exists()).toBe(false)
    expect(wrapper.find('.result-items').text()).toContain('600')
    mocks.run.mockRejectedValueOnce({ response: { data: { detail: { message: '授权已失效' } } } })
    await (wrapper.vm as any).run(); await flushPromises()
    expect(wrapper.text()).toContain('授权已失效')
    expect(wrapper.text()).not.toContain('[object Object]')
    expect(wrapper.find('.result-items').exists()).toBe(false)
    wrapper.unmount()
  })
  it('discards late readiness after switching the report', async () => {
    const pending = deferred(); mocks.readiness.mockReturnValueOnce(pending.promise)
    const wrapper = mountAuthorization()
    await button(wrapper, '执行授权').trigger('click'); await flushPromises()
    await wrapper.setProps({ report: fixture(2) })
    mocks.readiness.mockResolvedValueOnce(ready(12))
    await button(wrapper, '执行授权').trigger('click'); await flushPromises()
    pending.resolve({ ...ready(), contract_id: 999 }); await flushPromises()
    expect(wrapper.text()).toContain('报表2')
    expect(wrapper.text()).not.toContain('999')
    wrapper.unmount()
  })
  it('discards a late run response after switching the report', async () => {
    const pending = deferred(); mocks.run.mockReturnValueOnce(pending.promise)
    const wrapper = mount(ReportViewerPanel, { props: { reportId: 1 }, global: { stubs: authorizationStubs, directives: { loading: {} } } })
    await flushPromises()
    mocks.get.mockResolvedValueOnce(fixture(2))
    mocks.run.mockResolvedValueOnce({ columns: [], items: [{ amount: 300 }], total: 1 })
    await wrapper.setProps({ reportId: 2 }); await flushPromises()
    pending.resolve({ columns: [], items: [{ amount: 999 }], total: 1 }); await flushPromises()
    expect(wrapper.find('.result-items').text()).toContain('300')
    expect(wrapper.text()).not.toContain('999')
    wrapper.unmount()
  })
  it('discards a late run response after permission revocation', async () => {
    const pending = deferred(); mocks.run.mockReturnValueOnce(pending.promise)
    const wrapper = mount(ReportViewerPanel, { props: { reportId: 1 }, global: { stubs: authorizationStubs, directives: { loading: {} } } })
    await flushPromises(); mocks.permission.menus = []; await flushPromises()
    pending.resolve({ columns: [], items: [{ amount: 999 }], total: 1 }); await flushPromises()
    expect(wrapper.text()).not.toContain('999')
    expect(wrapper.text()).toContain('权限已变更')
    wrapper.unmount()
  })
})

describe('ReportList', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.list.mockReset().mockResolvedValue([])
    mocks.datasets.mockReset().mockResolvedValue([{ id: 8, name: '工资数据集' }])
    mocks.replace.mockReset().mockResolvedValue(undefined)
    mocks.push.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('filters automatically without query or reset buttons', async () => {
    const wrapper = mount(ReportList, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()
    expect(mocks.list).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).not.toContain('查询')
    expect(wrapper.text()).not.toContain('重置')
    expect(wrapper.html()).not.toContain('label="运行次数"')
    expect(wrapper.html()).not.toContain('label="上次运行"')
    expect(wrapper.html()).not.toContain('label="更新时间"')

    await wrapper.get('.name-input').setValue('薪酬')
    await vi.advanceTimersByTimeAsync(299)
    expect(mocks.list).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: undefined, keyword: '薪酬' })
    expect(mocks.replace).toHaveBeenLastCalledWith({ query: { keyword: '薪酬' } })

    await wrapper.get('.name-input').setValue('')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: undefined, keyword: undefined })

    await wrapper.get('.dataset-select').setValue('8')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith({ dataset_id: 8, keyword: undefined })
  })

  it('shows an inline retry state when loading fails', async () => {
    mocks.list.mockRejectedValueOnce({ response: { data: { detail: '服务暂不可用' } } })
    const wrapper = mount(ReportList, {
      global: { stubs, directives: { loading: {} } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('服务暂不可用')
    expect(wrapper.text()).toContain('重新加载')
  })
})
