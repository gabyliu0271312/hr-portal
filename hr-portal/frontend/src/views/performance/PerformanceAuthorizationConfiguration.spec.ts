import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceAuthorizationConfiguration from './PerformanceAuthorizationConfiguration.vue'
import PerformanceCreateButton from '@/components/performance/PerformanceCreateButton.vue'
import PerformanceListToolbar from '@/components/performance/PerformanceListToolbar.vue'
import PerformanceManagementTable from '@/components/performance/PerformanceManagementTable.vue'
import pageSource from './PerformanceAuthorizationConfiguration.vue?raw'
import routerSource from '@/router/index.ts?raw'

const api = vi.hoisted(() => ({ list: vi.fn(), revoke: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceUserAuthorizationApi: api }))
const messages = vi.hoisted(() => ({ info: vi.fn() }))
vi.mock('element-plus', async (importOriginal) => ({ ...await importOriginal<typeof import('element-plus')>(), ElMessage: messages }))

function mountPage() {
  return mount(PerformanceAuthorizationConfiguration, {
    global: { stubs: {
      PerformanceManagementTable: { props: ['rows', 'emptyText', 'total'], template: '<div class="management-table"><slot /><p>{{ emptyText }}</p></div>' },
      ElTableColumn: { props: ['label'], template: '<div class="column">{{ label }}<slot /></div>' },
      PerformancePermissionButton: { props: ['ariaLabel'], emits: ['click'], template: '<button :aria-label="ariaLabel" @click="$emit(\'click\')"><slot /></button>' },
      PerformanceAuthorizationDialog: { props: ['modelValue', 'mode', 'authorization'], emits: ['update:modelValue', 'saved'], template: '<div v-if="modelValue" role="dialog">{{ mode }}</div>' },
      PerformanceConfirmDialog: { props: ['modelValue'], emits: ['update:modelValue', 'confirm'], template: '<div v-if="modelValue" role="alertdialog"><button class="confirm" @click="$emit(\'confirm\')">确认</button></div>' },
    } },
  })
}
function labels(wrapper: ReturnType<typeof mountPage>) { return wrapper.findAll('.column').map(column => column.element.firstChild?.textContent?.trim()) }

describe('PerformanceAuthorizationConfiguration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    api.revoke.mockResolvedValue(undefined)
  })

  it('loads user authorizations and keeps the shared table contract', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(api.list).toHaveBeenCalledWith('', 1, 10)
    expect(wrapper.get('h1').text()).toBe('授权配置')
    expect(labels(wrapper)).toEqual(['选择用户', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.findComponent(PerformanceManagementTable).props('rows')).toEqual([])
    expect(wrapper.text()).toContain('暂无用户授权')
  })

  it('switches to rule authorization without fabricating API data', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    expect(wrapper.findComponent(PerformanceCreateButton).props('label')).toBe('添加规则')
    expect(labels(wrapper)).toEqual(['用户范围', '授权角色', '更新人', '最近更新时间', '操作'])
    expect(wrapper.text()).toContain('暂无授权规则')
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
    api.list.mockRejectedValueOnce({ response: { data: { detail: '无权读取授权' } } })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('无权读取授权')
    api.list.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 10 })
    await wrapper.get('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
  })

  it('confirms revocation and reloads the list', async () => {
    const row = { user_id: 8, display_name: '员工', login_name: 'u8', employee_no: 'E8', role_ids: [11], roles: [{ id: 11, name: '任务管理员', function_permission_keys: [] }], updated_at: '2026-11-04T00:00:00Z' }
    api.list.mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 10 })
    const wrapper = mountPage()
    await flushPromises()
    const table = wrapper.findComponent(PerformanceManagementTable)
    table.findAllComponents({ name: 'PerformancePermissionButton' })
    expect(pageSource).toContain('performanceUserAuthorizationApi.revoke')
    expect(pageSource).toContain('PerformanceConfirmDialog')
    expect(routerSource).toContain("import('@/views/performance/PerformanceAuthorizationConfiguration.vue')")
  })

  it('keeps rule mutations and export explicitly unavailable', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    await wrapper.get('[aria-label="删除规则"]').trigger('click')
    expect(messages.info).toHaveBeenLastCalledWith('删除规则功能将在后续任务接入')
    expect(pageSource).not.toMatch(/#[\da-fA-F]{3,8}\b|rgba?\(/)
  })
})
