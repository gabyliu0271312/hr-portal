import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceRoleCreate from './PerformanceRoleCreate.vue'
import roleCreateSource from './PerformanceRoleCreate.vue?raw'

const performanceRoleApi = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceRoleApi }))

const routerPush = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

const stubs = {
  PageHeader: {
    props: ['title'],
    emits: ['back'],
    template: '<header class="page-header"><span>{{ title }}</span><button class="back" @click="$emit(\'back\')">返回</button><slot name="actions" /></header>',
  },
  PermissionButton: {
    emits: ['click'],
    template: '<button class="save" @click="$emit(\'click\')"><slot /></button>',
  },
}

describe('PerformanceRoleCreate', () => {
  beforeEach(() => {
    routerPush.mockReset()
    performanceRoleApi.create.mockReset()
  })

  it('renders the public header and empty configuration shell', () => {
    const wrapper = mount(PerformanceRoleCreate, { global: { stubs } })

    expect(wrapper.find('.page-header').text()).toContain('新建角色')
    expect(wrapper.find('.save').text()).toBe('保存')
    expect(wrapper.find('[aria-label="角色名称"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="角色描述"]').exists()).toBe(true)
    expect(wrapper.find('.role-form-card').exists()).toBe(true)
    expect(wrapper.find('.language-tag').text()).toBe('中文')
    expect(roleCreateSource).toContain('.role-textarea-wrap :deep(.native-textarea) { height: 116px; min-height: 116px; }')
    expect(roleCreateSource).not.toContain('min-height: 349px')
  })

  it('returns to the role list from the public header', async () => {
    const wrapper = mount(PerformanceRoleCreate, { global: { stubs } })

    await wrapper.get('.back').trigger('click')

    expect(routerPush).toHaveBeenCalledWith({ name: 'PerformancePermissionRoles' })
  })

  it('saves the selected function permission keys with the role', async () => {
    performanceRoleApi.create.mockResolvedValue({ id: 10, name: '校准人', description: null, is_system: false, is_active: true, updated_at: '2026-09-23T00:00:00Z', function_permission_keys: [] })
    const wrapper = mount(PerformanceRoleCreate, { global: { stubs } })

    await wrapper.get('#performance-role-name').setValue('校准人')
    await wrapper.findAll('input[type="checkbox"]')[0].setValue(true)
    await wrapper.get('.save').trigger('click')
    await flushPromises()

    const payload = performanceRoleApi.create.mock.calls[0][0]
    expect(payload.function_permission_keys).toContain('performance.backend.cycles-projects')
  })

  it('saves the first role form container through the real API client', async () => {
    performanceRoleApi.create.mockResolvedValue({ id: 10, name: '校准人', description: '负责校准', is_system: false, is_active: true, updated_at: '2026-09-23T00:00:00Z' })
    const wrapper = mount(PerformanceRoleCreate, { global: { stubs } })

    await wrapper.get('#performance-role-name').setValue('校准人')
    await wrapper.get('#performance-role-description').setValue('负责校准')
    await wrapper.get('.save').trigger('click')
    await flushPromises()

    expect(performanceRoleApi.create).toHaveBeenCalledWith({ name: '校准人', description: '负责校准', function_permission_keys: [] })
    expect(routerPush).toHaveBeenCalledWith({ name: 'PerformancePermissionRoles' })
  })
})
