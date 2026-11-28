import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceAuthorizationConfiguration from './PerformanceAuthorizationConfiguration.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import pageSource from './PerformanceAuthorizationConfiguration.vue?raw'
import routerSource from '@/router/index.ts?raw'

const userApi = vi.hoisted(() => ({ list: vi.fn(), exportAll: vi.fn(), revoke: vi.fn() }))
const ruleApi = vi.hoisted(() => ({ list: vi.fn(), exportAll: vi.fn(), remove: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceUserAuthorizationApi: userApi, performanceAuthRuleApi: ruleApi }))
const messages = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => ({ ...await importOriginal<typeof import('element-plus')>(), ElMessage: messages }))

function mountPage() {
  return mount(PerformanceAuthorizationConfiguration, {
    global: { stubs: {
      PerformanceManagementTable: { props: ['rows', 'emptyText', 'total'], template: '<div class="management-table"><div v-for="row in rows" :key="row.id || row.user_id" class="management-row">{{ row.role_name || (row.roles || []).map(r => r.name).join() }}</div><slot /><slot name="empty" :loading="false" :text="emptyText" /><p>{{ emptyText }}</p></div>' },
      ElTableColumn: { props: ['label'], template: '<div class="column">{{ label }}<slot /></div>' },
      PerformancePermissionButton: { props: ['ariaLabel'], emits: ['click'], template: '<button :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>' },
      PerformanceAuthorizationDialog: { props: ['modelValue', 'mode', 'authorization', 'rule'], emits: ['update:modelValue', 'saved'], template: '<div v-if="modelValue" role="dialog">{{ mode }}</div>' },
      PerformanceConfirmDialog: { props: ['modelValue'], emits: ['update:modelValue', 'confirm'], template: '<div v-if="modelValue" role="alertdialog"><button class="confirm" @click="$emit(\'confirm\')">确认</button></div>' },
      MetricTemplateEmptyIllustration: { template: '<svg class="empty-illustration" />' },
    } },
  })
}
function labels(wrapper: ReturnType<typeof mountPage>) { return wrapper.findAll('.column').map(column => column.element.firstChild?.textContent?.trim()) }

describe('PerformanceAuthorizationConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    userApi.revoke.mockResolvedValue(undefined)
    ruleApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    ruleApi.remove.mockResolvedValue(undefined)
  })

  it('loads user authorizations and keeps the shared table contract', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(userApi.list).toHaveBeenCalledWith('', 1, 10)
    expect(wrapper.get('h1').text()).toBe('授权配置')
    expect(labels(wrapper)).toEqual(['选择用户', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.findComponent(PerformanceManagementTable).props('rows')).toEqual([])
    expect(wrapper.text()).toContain('暂无用户授权')
  })

  it('switches to rule authorization and loads the real rule list', async () => {
    const rule = { id: 5, role_id: 11, role_name: '测试管理角色', or_scope: [{ conditions: [{ field: 'department', operator: 'include', values: ['研发'] }] }], updated_at: '2026-11-04T00:00:00Z', updated_by: '管理员' }
    ruleApi.list.mockResolvedValue({ items: [rule], total: 1, page: 1, page_size: 10 })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()
    expect(ruleApi.list).toHaveBeenCalledWith('', 1, 10)
    expect(wrapper.findComponent(PerformanceCreateButton).props('label')).toBe('添加规则')
    expect(labels(wrapper)).toEqual(['用户范围', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.text()).toContain('测试管理角色')
    expect(wrapper.find('[aria-label="删除规则"]').exists()).toBe(true)
  })

  it('opens the real user dialog and keeps tab searches separate', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findComponent(PerformanceCreateButton).trigger('click')
    expect(wrapper.get('[role="dialog"]').text()).toContain('users')
    wrapper.findComponent(PerformanceListToolbar).vm.$emit('update:keyword', '管理员')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.findComponent(PerformanceListToolbar).props('keyword')).toBe('')
  })

  it('shows load failure and retries instead of treating it as empty', async () => {
    userApi.list.mockRejectedValueOnce({ response: { data: { detail: '无权读取授权' } } })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('无权读取授权')
    userApi.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(userApi.list).toHaveBeenCalledTimes(2)
  })

  it('confirms revocation and reloads the list', async () => {
    const row = { user_id: 8, display_name: '员工', login_name: 'u8', employee_no: 'E8', role_ids: [11], roles: [{ id: 11, name: '任务管理员', function_permission_keys: [] }], updated_at: '2026-11-04T00:00:00Z' }
    userApi.list.mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 10 })
    const wrapper = mountPage()
    await flushPromises()
    const table = wrapper.findComponent(PerformanceManagementTable)
    table.findAllComponents({ name: 'PerformancePermissionButton' })
    expect(pageSource).toContain('performanceUserAuthorizationApi.revoke')
    expect(pageSource).toContain('PerformanceConfirmDialog')
    expect(routerSource).toContain("import('@/views/performance/PerformanceAuthorizationConfiguration.vue')")
  })

  it('exports all authorizations through the full-result API with the current search', async () => {
    const all = Array.from({ length: 151 }, (_, index) => ({ user_id: index + 1, display_name: `员工${index}`, employee_no: `E${index}`, roles: [{ name: '管理员' }], updated_at: '2026-11-04T00:00:00Z' }))
    userApi.exportAll.mockResolvedValue({ items: all, total: all.length })
    const wrapper = mountPage()
    await flushPromises()
    wrapper.getComponent(PerformanceListToolbar).vm.$emit('update:keyword', '管理员')
    await flushPromises()
    const loadRows = wrapper.getComponent({ name: 'PerformanceExportButton' }).props('loadRows') as () => Promise<string[][]>
    const rows = await loadRows()
    expect(rows).toHaveLength(152)
    expect(rows.at(-1)?.[0]).toBe('员工150（E150）')
    expect(userApi.exportAll).toHaveBeenCalledWith('管理员')
    userApi.exportAll.mockRejectedValueOnce(new Error('denied'))
    await expect(loadRows()).rejects.toThrow('denied')
    wrapper.unmount()
  })

  it('shows the empty illustration on the rule tab and exports real rule rows', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()
    expect(wrapper.find('.empty-illustration').exists()).toBe(true)
    expect(wrapper.findComponent({ name: 'PerformanceExportButton' }).exists()).toBe(true)
    const rule = { id: 1, role_id: 11, role_name: '测试管理角色', or_scope: [{ conditions: [{ field: 'department', operator: 'include', values: ['研发'] }] }], updated_at: '2026-11-04T00:00:00Z', updated_by: '管理员' }
    ruleApi.exportAll.mockResolvedValue({ items: [rule], total: 1 })
    const loadRows = wrapper.getComponent({ name: 'PerformanceExportButton' }).props('loadRows') as () => Promise<string[][]>
    const rows = await loadRows()
    expect(ruleApi.exportAll).toHaveBeenCalledWith('')
    expect(rows).toHaveLength(2)
    expect(rows[1][1]).toBe('测试管理角色')
    expect(pageSource).not.toMatch(/#[\da-fA-F]{3,8}\b|rgba?\(/)
  })

  it('deletes a rule after confirmation and reloads', async () => {
    const rule = { id: 5, role_id: 11, role_name: '测试管理角色', or_scope: [{ conditions: [{ field: 'department', operator: 'include', values: ['研发'] }] }], updated_at: '2026-11-04T00:00:00Z' }
    ruleApi.list.mockResolvedValue({ items: [rule], total: 1, page: 1, page_size: 10 })
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await flushPromises()
    expect(pageSource).toContain('performanceAuthRuleApi.remove')
    expect(pageSource).toContain('deleteRuleVisible')
    expect(wrapper.find('[aria-label="删除规则"]').exists()).toBe(true)
  })
})
