import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import IdentityManagement from './IdentityManagement.vue'

const mocks = vi.hoisted(() => ({ control: vi.fn(), updateControl: vi.fn(), list: vi.fn() }))
vi.mock('@/api/identitySwitch', () => ({ identitySwitchApi: mocks, switchRequestId: () => 'request-1' }))
vi.mock('@/api/users', () => ({ usersApi: { list: mocks.list } }))
vi.mock('@/components/PermissionButton.vue', () => ({ default: { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] } }))
const initial = { app_code: 'performance', system_name: '绩效系统', description: 'test', others_enabled: false, generation: 0, revision: 1, test_delivery_enabled: false, test_receiver_user_id: null }

describe('identity management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.control.mockResolvedValue({ ...initial })
    mocks.list.mockResolvedValue({ items: [] })
    mocks.updateControl.mockImplementation(async value => ({ ...initial, ...value, revision: 2 }))
  })
  it('shows one performance system with the four requested columns and explicit enable action', async () => {
    const wrapper = mount(IdentityManagement, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    for (const label of ['系统名称', '描述', '状态', '操作']) expect(wrapper.text()).toContain(label)
    expect(wrapper.text()).toContain('绩效系统')
    const enable = wrapper.findAll('button').find(button => button.text() === '启用')!
    await enable.trigger('click')
    await flushPromises()
    expect(mocks.updateControl).toHaveBeenCalledWith(expect.objectContaining({ others_enabled: true, expected_revision: 1 }))
    expect(wrapper.findAll('button').some(button => button.text() === '停用')).toBe(true)
    expect(wrapper.html()).toContain('始终禁止投递给原业务接收人')
    wrapper.unmount()
  })
  it('does not display configuration when the backend rejects the account', async () => {
    mocks.control.mockRejectedValue({ response: { data: { detail: '仅内置 admin 可以访问' } } })
    const wrapper = mount(IdentityManagement, { global: { plugins: [ElementPlus] } })
    await flushPromises()
    expect(wrapper.text()).toContain('无法访问身份管理')
    expect(wrapper.findAll('button').some(button => button.text() === '启用')).toBe(false)
    wrapper.unmount()
  })
})
