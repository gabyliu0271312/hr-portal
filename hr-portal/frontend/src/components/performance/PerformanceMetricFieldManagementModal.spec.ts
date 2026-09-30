import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceMetricFieldManagementModal from './PerformanceMetricFieldManagementModal.vue'
import PerformanceMetricFieldCreateDialog from './PerformanceMetricFieldCreateDialog.vue'
import { performanceMetricFieldsApi } from '@/api/performanceMetricFields'
import { ElMessage } from 'element-plus'

vi.mock('@/api/performanceMetricFields', async importOriginal => ({
  ...await importOriginal<typeof import('@/api/performanceMetricFields')>(),
  performanceMetricFieldsApi: { list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('element-plus', async importOriginal => ({
  ...await importOriginal<typeof import('element-plus')>(),
  ElMessage: { success: vi.fn() },
}))
enableAutoUnmount(afterEach)
const seedFields = [
  { id: 1, name: '指标', field_type: 'text' }, { id: 2, name: '权重', field_type: 'percentage' },
  { id: 3, name: '指标单位', field_type: 'text' }, { id: 4, name: '目标值', field_type: 'number' },
  { id: 5, name: '完成值', field_type: 'number' }, { id: 6, name: '完成说明', field_type: 'text' },
  { id: 7, name: '指标评价人', field_type: 'person' },
].map(row => ({ ...row, display_id: row.id, is_system: true, in_use: false, updated_by: '', updated_at: '2026-09-30T00:00:00Z' }))
const customField = { id: 61, display_id: 8, name: '用户字段', field_type: 'text', is_system: false, in_use: false, updated_by: '管理员', updated_at: '2026-09-30T02:00:00Z' }
function listResult(items = seedFields, total = items.length) { return { items, total, limit: 10, offset: 0 } }
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult() as any)
})

const stubs = {
  Teleport: true,
  FullScreenModal: {
    props: ['title', 'showFooter'],
    emits: ['back'],
    template: '<div class="full-screen-modal-stub"><header>{{ title }}</header><button class="back" @click="$emit(\'back\')">back</button><slot /></div>',
  },
  PerformanceContentSurface: {
    template: '<section class="content-surface"><slot /></section>',
  },
  PerformanceMetricFieldsTable: {
    name: 'PerformanceMetricFieldsTable',
    props: ['rows', 'total', 'page', 'pageSize', 'loading', 'actionsDisabled'],
    emits: ['page-change', 'page-size-change', 'edit', 'remove'],
    template: `<div class="metric-fields-table"><table><thead><tr><th>ID</th><th>名称</th><th>类型</th><th>更新人</th><th>最近更新时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.displayId ?? row.id }}</td><td>{{ row.name }}</td><td>{{ row.type }}</td><td>--</td><td>--</td><td><button :disabled="actionsDisabled || row.isSystem" @click="$emit('edit', row)">编辑</button><button :disabled="actionsDisabled || row.isSystem || row.inUse" @click="$emit('remove', row)">删除</button></td></tr></tbody></table><div aria-label="分页">共 {{ rows.length }} 条</div></div>`,
  },
  PerformanceMetricTypesTable: {
    props: ['rows'],
    template: '<div class="metric-types-table"><table><thead><tr><th>名称</th><th>指标字段</th><th>更新人</th><th>最近更新时间</th><th>操作</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id"><td>{{ row.name }}</td><td>{{ row.fields }}</td><td>--</td><td>--</td><td><button>编辑</button><button>删除</button></td></tr></tbody></table></div>',
  },
}

describe('PerformanceMetricFieldManagementModal', () => {
  it('renders the captured metric type tab by default', async () => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, {
      props: { modelValue: true },
      global: { stubs },
    })

    expect(wrapper.get('header').text()).toBe('字段管理')
    expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(['指标类型', '指标字段'])
    expect(wrapper.find('.metric-types-table').exists()).toBe(true)
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(['名称', '指标字段', '更新人', '最近更新时间', '操作'])
    expect(wrapper.get('tbody tr').text()).toContain('定性指标')
    expect(wrapper.get('tbody tr').text()).toContain('指标、权重、完成说明')
    expect(wrapper.find('.metric-fields-table').exists()).toBe(false)

    const createTypeButton = wrapper.get('[aria-label="新建指标类型"]')
    expect(createTypeButton.text()).toBe('新建指标类型')
    expect(createTypeButton.classes()).toContain('is-wide-icon')
    expect(createTypeButton.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    await createTypeButton.trigger('click')
    expect(wrapper.emitted('create-type')).toHaveLength(1)
  })

  it('shows the seven captured fields when switching to the indicator fields tab and closes on back', async () => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, {
      props: { modelValue: true },
      global: { stubs },
    })

    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    expect(performanceMetricFieldsApi.list).toHaveBeenCalledWith({ keyword: '', offset: 0, limit: 10 })
    expect(wrapper.find('.metric-fields-table').exists()).toBe(true)
    expect(wrapper.find('.metric-types-table').exists()).toBe(false)
    expect(wrapper.findAll('th').map(cell => cell.text())).toEqual(['ID', '名称', '类型', '更新人', '最近更新时间', '操作'])
    expect(wrapper.findAll('tbody tr')).toHaveLength(7)
    expect(wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).props('rows').every((row: { isSystem: boolean }) => row.isSystem)).toBe(true)
    expect(wrapper.get('[aria-label="分页"]').text()).toContain('共 7 条')
    const filterButton = wrapper.get('[aria-label="筛选"]')
    expect(filterButton.text()).toBe('筛选')
    await filterButton.trigger('click')
    expect(wrapper.emitted('filter')).toHaveLength(1)
    const createFieldButton = wrapper.get('[aria-label="新建字段"]')
    expect(createFieldButton.text()).toBe('新建字段')
    expect(createFieldButton.classes()).toContain('is-wide-icon')
    expect(createFieldButton.find('[data-icon="AddOutlined"]').exists()).toBe(true)
    await createFieldButton.trigger('click')
    expect(wrapper.emitted('create')).toHaveLength(1)

    await wrapper.get('.back').trigger('click')
    expect(wrapper.emitted('back')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })

  it('creates through the API, resets search/page, refreshes rows and reloads on reopen', async () => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    const toolbar = wrapper.findComponent({ name: 'PerformanceListToolbar' })
    toolbar.vm.$emit('update:keyword', '旧搜索')
    await flushPromises()
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult(seedFields, 17) as any)
    wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).vm.$emit('page-change', 2)
    await flushPromises()
    expect(performanceMetricFieldsApi.list).toHaveBeenLastCalledWith({ keyword: '旧搜索', offset: 10, limit: 10 })
    await wrapper.get('[aria-label="新建字段"]').trigger('click')
    const dialog = wrapper.findComponent(PerformanceMetricFieldCreateDialog)
    expect(dialog.props('modelValue')).toBe(true)
    const created = { id: 9, display_id: 8, in_use: false, name: '完成质量', field_type: 'number', is_system: false, updated_by: '管理员', updated_at: '2026-09-30T02:00:00Z' }
    vi.mocked(performanceMetricFieldsApi.create).mockResolvedValueOnce(created as any)
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([...seedFields, created]) as any)
    await wrapper.get('#metric-field-name').setValue('完成质量')
    await wrapper.get('input[value="number"]').setValue(true)
    await wrapper.get('#metric-field-create-form').trigger('submit')
    await flushPromises()
    expect(performanceMetricFieldsApi.create).toHaveBeenCalledWith({ name: '完成质量', field_type: 'number' })
    expect(performanceMetricFieldsApi.list).toHaveBeenLastCalledWith({ keyword: '', offset: 0, limit: 10 })
    expect(dialog.props('modelValue')).toBe(false)
    expect(wrapper.get('tbody').text()).toContain('完成质量数字')
    expect(wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).props('rows').map((row: { id: number }) => row.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 9])
    expect(ElMessage.success).toHaveBeenCalledWith('字段已创建')
    const calls = vi.mocked(performanceMetricFieldsApi.list).mock.calls.length
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await flushPromises()
    expect(performanceMetricFieldsApi.list).toHaveBeenCalledTimes(calls + 1)
    expect(wrapper.get('tbody').text()).toContain('完成质量')
  })

  it.each([false, true])('locates a newly created field on the last ascending page (refresh failure: %s)', async failLastPage => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="新建字段"]').trigger('click')
    const created = { id: 12, display_id: 11, in_use: false, name: '跨页新增字段', field_type: 'text', is_system: false, updated_by: '管理员', updated_at: '2026-09-30T02:00:00Z' }
    const firstPage = [...seedFields, ...[9, 10, 11].map(id => ({ ...created, id, display_id: id - 1, name: `既有字段${id}` }))]
    const lastPage = { ...listResult([created], 11), offset: 10 }
    vi.mocked(performanceMetricFieldsApi.create).mockResolvedValueOnce(created as any)
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(listResult(firstPage, 11) as any)
    if (failLastPage) vi.mocked(performanceMetricFieldsApi.list).mockRejectedValueOnce(new Error('offline'))
    else vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(lastPage as any)
    await wrapper.get('#metric-field-name').setValue(created.name)
    await wrapper.get('#metric-field-create-form').trigger('submit')
    await flushPromises()
    expect(wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).props('page')).toBe(2)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    if (failLastPage) {
      expect(wrapper.get('[role="alert"]').text()).toContain('字段已保存，列表加载失败')
      vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(lastPage as any)
      await wrapper.get('[role="alert"] button').trigger('click')
      await flushPromises()
    }
    expect(performanceMetricFieldsApi.list).toHaveBeenLastCalledWith({ keyword: '', offset: 10, limit: 10 })
    expect(performanceMetricFieldsApi.list).toHaveBeenCalledTimes(failLastPage ? 4 : 3)
    expect(performanceMetricFieldsApi.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('tbody').text()).toContain('跨页新增字段')
    expect(wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).props('rows').map((row: { id: number }) => row.id)).toEqual([12])
  })

  it('displays business number 8 but reads and updates the internal field ID 61', async () => {
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([...seedFields, customField]) as any)
    vi.mocked(performanceMetricFieldsApi.get).mockResolvedValue({ ...customField, name: '最新名称' } as any)
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click'); await flushPromises()
    expect(wrapper.findAll('tbody tr').at(-1)!.get('td').text()).toBe('8')
    await wrapper.findAll('tbody tr').at(-1)!.findAll('button')[0].trigger('click'); await flushPromises()
    expect(performanceMetricFieldsApi.get).toHaveBeenCalledWith(61)
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('编辑字段')
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('最新名称')
    await wrapper.get('#metric-field-name').setValue('修改后名称')
    await wrapper.get('input[value="number"]').setValue(true)
    const changed = { ...customField, name: '修改后名称', field_type: 'number' }
    vi.mocked(performanceMetricFieldsApi.update).mockResolvedValueOnce(changed as any)
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(listResult([...seedFields, changed]) as any)
    await wrapper.get('#metric-field-create-form').trigger('submit'); await flushPromises()
    expect(performanceMetricFieldsApi.update).toHaveBeenCalledWith(61, { name: '修改后名称', field_type: 'number' })
    expect(performanceMetricFieldsApi.create).not.toHaveBeenCalled()
    expect(wrapper.findAll('tbody tr').at(-1)!.text()).toContain('8修改后名称数字')
  })

  it('keeps an edit draft on conflict and locks its type when a reference was added', async () => {
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([...seedFields, customField]) as any)
    vi.mocked(performanceMetricFieldsApi.get).mockResolvedValue(customField as any)
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click'); await flushPromises()
    await wrapper.findAll('tbody tr').at(-1)!.findAll('button')[0].trigger('click'); await flushPromises()
    await wrapper.get('#metric-field-name').setValue('保留输入')
    await wrapper.get('input[value="number"]').setValue(true)
    vi.mocked(performanceMetricFieldsApi.update).mockRejectedValueOnce({ isAxiosError: true, response: { status: 409, data: { detail: JSON.stringify({ code: 'PERFORMANCE_METRIC_FIELD_IN_USE' }) } } })
    await wrapper.get('#metric-field-create-form').trigger('submit'); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('不允许修改类型')
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('保留输入')
    expect(wrapper.findAll('input[type="radio"]').every(radio => radio.attributes('disabled') !== undefined)).toBe(true)
    expect((wrapper.get('input[value="text"]').element as HTMLInputElement).checked).toBe(true)
    expect(wrapper.get('#metric-field-name').attributes('disabled')).toBeUndefined()
  })

  it('confirms deletion by internal ID and leaves other business numbers unchanged', async () => {
    const remaining = { ...customField, id: 62, display_id: 9, name: '保留字段' }
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([...seedFields, customField, remaining]) as any)
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click'); await flushPromises()
    const target = wrapper.findAll('tbody tr')[7]
    await target.findAll('button')[1].trigger('click')
    expect(wrapper.get('[role="alertdialog"]').text()).toContain('用户字段')
    await wrapper.get('.performance-confirm-dialog__button--cancel').trigger('click')
    expect(performanceMetricFieldsApi.remove).not.toHaveBeenCalled()
    await target.findAll('button')[1].trigger('click')
    vi.mocked(performanceMetricFieldsApi.remove).mockResolvedValueOnce(undefined)
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(listResult([...seedFields, remaining]) as any)
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(performanceMetricFieldsApi.remove).toHaveBeenCalledWith(61)
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(wrapper.findAll('tbody tr').map(row => row.get('td').text())).toEqual(['1','2','3','4','5','6','7','9'])
  })

  it('returns to a valid page after deleting the last row on the final page', async () => {
    const first = [...seedFields, ...[61,62,63].map((id,index) => ({ ...customField, id, display_id: index + 8, name: `保留${id}` }))]
    const last = { ...customField, id: 64, display_id: 11, name: '末页字段' }
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(listResult(first, 11) as any)
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click'); await flushPromises()
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce({ ...listResult([last],11), offset:10 } as any)
    wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).vm.$emit('page-change',2); await flushPromises()
    await wrapper.get('tbody tr').findAll('button')[1].trigger('click')
    vi.mocked(performanceMetricFieldsApi.remove).mockResolvedValueOnce(undefined)
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce({ ...listResult([],10), offset:10 } as any).mockResolvedValueOnce(listResult(first,10) as any)
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(performanceMetricFieldsApi.remove).toHaveBeenCalledWith(64)
    expect(wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).props('page')).toBe(1)
    expect(performanceMetricFieldsApi.list).toHaveBeenLastCalledWith({ keyword:'', offset:0, limit:10 })
    expect(wrapper.findAll('tbody tr')).toHaveLength(10)
  })

  it('blocks a delete conflict while allowing the confirmation to be dismissed', async () => {
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([...seedFields, customField]) as any)
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click'); await flushPromises()
    await wrapper.findAll('tbody tr').at(-1)!.findAll('button')[1].trigger('click')
    vi.mocked(performanceMetricFieldsApi.remove).mockRejectedValueOnce({ isAxiosError:true, response:{status:409,data:{detail:{code:'PERFORMANCE_METRIC_FIELD_IN_USE'}}} })
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValueOnce(listResult([...seedFields,{...customField,in_use:true}]) as any)
    await wrapper.get('.performance-confirm-dialog__button--danger').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alertdialog"] [role="alert"]').text()).toContain('不允许删除')
    expect(wrapper.get('.performance-confirm-dialog__button--danger').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.performance-confirm-dialog__button--cancel').attributes('disabled')).toBeUndefined()
    await wrapper.get('.performance-confirm-dialog__button--cancel').trigger('click')
    expect(wrapper.findAll('tbody tr').at(-1)!.findAll('button')[1].attributes('disabled')).toBeDefined()
    expect(performanceMetricFieldsApi.remove).toHaveBeenCalledTimes(1)
  })

  it('keeps draft on save failure and distinguishes saved-but-refresh-failed', async () => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="新建字段"]').trigger('click')
    await wrapper.get('#metric-field-name').setValue('已有字段')
    vi.mocked(performanceMetricFieldsApi.create).mockRejectedValueOnce({ isAxiosError: true, response: { status: 409 } })
    await wrapper.get('#metric-field-create-form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('该字段名称已存在')
    expect((wrapper.get('#metric-field-name').element as HTMLInputElement).value).toBe('已有字段')
    expect(wrapper.findAll('tbody tr')).toHaveLength(7)
    expect(ElMessage.success).not.toHaveBeenCalled()
    vi.mocked(performanceMetricFieldsApi.create).mockResolvedValueOnce({ id: 9 } as any)
    vi.mocked(performanceMetricFieldsApi.list).mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('#metric-field-create-form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('[role="alert"]').text()).toContain('字段已保存，列表加载失败')
    expect(ElMessage.success).toHaveBeenCalledTimes(1)
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('shows forbidden without fixture rows and disables creation, then retries', async () => {
    vi.mocked(performanceMetricFieldsApi.list).mockRejectedValueOnce({ isAxiosError: true, response: { status: 403 } })
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('无权限管理指标字段')
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    expect(wrapper.get('[aria-label="新建字段"]').attributes('disabled')).toBeDefined()
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="新建字段"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.findAll('tbody tr')).toHaveLength(7)
  })

  it('does not send duplicate writes while pending and cancel never writes', async () => {
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    await flushPromises()
    await wrapper.get('[aria-label="新建字段"]').trigger('click')
    await wrapper.get('#metric-field-name').setValue('取消字段')
    await wrapper.get('.metric-field-footer .performance-button--secondary').trigger('click')
    expect(performanceMetricFieldsApi.create).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="新建字段"]').trigger('click')
    await wrapper.get('#metric-field-name').setValue('保存中的字段')
    let resolveSave!: (value: any) => void
    vi.mocked(performanceMetricFieldsApi.create).mockImplementationOnce(() => new Promise(resolve => { resolveSave = resolve }))
    await wrapper.get('#metric-field-create-form').trigger('submit')
    await wrapper.get('#metric-field-create-form').trigger('submit')
    expect(performanceMetricFieldsApi.create).toHaveBeenCalledTimes(1)
    expect(wrapper.get('#metric-field-name').attributes('disabled')).toBeDefined()
    await wrapper.get('.back').trigger('click')
    expect(wrapper.emitted('back')).toBeUndefined()
    resolveSave({ id: 9 })
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })

  it('ignores stale searches and requests a new page size from the server', async () => {
    let resolveOld!: (value: any) => void
    vi.mocked(performanceMetricFieldsApi.list).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve }))
    const wrapper = mount(PerformanceMetricFieldManagementModal, { props: { modelValue: true }, global: { stubs } })
    await wrapper.get('[role="tab"]:nth-child(2)').trigger('click')
    vi.mocked(performanceMetricFieldsApi.list).mockResolvedValue(listResult([], 0) as any)
    wrapper.findComponent({ name: 'PerformanceListToolbar' }).vm.$emit('update:keyword', '未找到')
    await flushPromises()
    resolveOld(listResult())
    await flushPromises()
    expect(wrapper.findAll('tbody tr')).toHaveLength(0)
    wrapper.findComponent({ name: 'PerformanceMetricFieldsTable' }).vm.$emit('page-size-change', 20)
    await flushPromises()
    expect(performanceMetricFieldsApi.list).toHaveBeenLastCalledWith({ keyword: '未找到', offset: 0, limit: 20 })
  })
})
