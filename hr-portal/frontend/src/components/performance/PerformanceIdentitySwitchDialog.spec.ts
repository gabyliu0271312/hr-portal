import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import PerformanceIdentitySwitchDialog from './PerformanceIdentitySwitchDialog.vue'
import { clearEmployeeSwitch, employeeSwitchSession } from '@/stores/identitySwitch'

const mocks = vi.hoisted(() => ({ people: vi.fn(), favorites: vi.fn(), addFavorite: vi.fn(), removeFavorite: vi.fn(), capability: vi.fn(), create: vi.fn(), end: vi.fn(), replace: vi.fn() }))
vi.mock('@/api/identitySwitch', () => ({ identitySwitchApi: mocks }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('./PerformancePersonSelect.vue', () => ({ default: {
  props: ['options', 'modelValue'], emits: ['update:modelValue'],
  template: '<button data-pick @click="$emit(\'update:modelValue\', options[0].value)">选择员工</button>',
} }))

const saved = { employee_no: 'E-NO-PORTAL', display_name: 'Employee', organization_label: '研发部' }

function mountDialog() {
  return mount(PerformanceIdentitySwitchDialog, { props: { modelValue: true }, global: { plugins: [ElementPlus], stubs: { teleport: true } } })
}

describe('performance employee switch dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearEmployeeSwitch()
    mocks.favorites.mockResolvedValue([])
    mocks.people.mockResolvedValue({ items: [saved], total: 1 })
    mocks.addFavorite.mockResolvedValue(saved)
    mocks.removeFavorite.mockResolvedValue(undefined)
    mocks.capability.mockResolvedValue({ generation: 7, can_switch: true })
    mocks.create.mockResolvedValue({ session_id: 's', session_token: 'secret', expires_at: '2099-01-01', mode: 'TARGET_POLICY', effective_identity: saved })
    mocks.replace.mockResolvedValue(undefined)
  })

  it('switches to a saved person by clicking it, without creating a Portal account or assigning a role', async () => {
    mocks.favorites.mockResolvedValue([saved])
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.get('.performance-dialog__header').text()).toContain('切换绩效用户')
    await wrapper.get('.favorite-person').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith('E-NO-PORTAL', 7)
    expect(employeeSwitchSession.value?.effective_identity.employee_no).toBe('E-NO-PORTAL')
    expect(mocks.replace).toHaveBeenCalledWith('/performance/workbench')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
    wrapper.unmount()
  })

  it('adds a person only after clicking the add button, then shows it as a switch entry', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    expect(wrapper.find('[data-pick]').exists()).toBe(false)
    await wrapper.findAll('button').find(button => button.text() === '添加人员')!.trigger('click')
    await flushPromises()
    await wrapper.get('[data-pick]').trigger('click')
    await flushPromises()
    expect(mocks.addFavorite).toHaveBeenCalledWith('E-NO-PORTAL')
    expect(wrapper.find('[data-pick]').exists()).toBe(false)
    expect(wrapper.get('.favorite-person').text()).toContain('Employee')
    await wrapper.get('.favorite-person').trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith('E-NO-PORTAL', 7)
    wrapper.unmount()
  })

  it('removes a saved person without switching', async () => {
    mocks.favorites.mockResolvedValue([saved])
    const wrapper = mountDialog()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await flushPromises()
    expect(mocks.removeFavorite).toHaveBeenCalledWith('E-NO-PORTAL')
    expect(wrapper.find('.favorite-person').exists()).toBe(false)
    expect(mocks.create).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
