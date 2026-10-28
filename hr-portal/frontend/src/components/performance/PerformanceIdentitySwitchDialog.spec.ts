import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ElementPlus from 'element-plus'
import PerformanceIdentitySwitchDialog from './PerformanceIdentitySwitchDialog.vue'
import { clearEmployeeSwitch, employeeSwitchSession } from '@/stores/identitySwitch'

const mocks = vi.hoisted(() => ({ people: vi.fn(), capability: vi.fn(), create: vi.fn(), end: vi.fn(), replace: vi.fn() }))
vi.mock('@/api/identitySwitch', () => ({ identitySwitchApi: mocks }))
vi.mock('vue-router', () => ({ useRouter: () => ({ replace: mocks.replace }) }))
vi.mock('./PerformancePersonSelect.vue', () => ({ default: {
  props: ['options', 'modelValue'], emits: ['update:modelValue'],
  template: '<button data-pick @click="$emit(\'update:modelValue\', options[0].value)">选择员工</button>',
} }))

describe('performance employee switch dialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearEmployeeSwitch()
    mocks.people.mockResolvedValue({ items: [{ employee_no: 'E-NO-PORTAL', display_name: 'Employee' }], total: 1 })
    mocks.capability.mockResolvedValue({ generation: 7, can_switch: true })
    mocks.create.mockResolvedValue({ session_id: 's', session_token: 'secret', expires_at: '2099-01-01', mode: 'TARGET_POLICY', effective_identity: { employee_no: 'E-NO-PORTAL', display_name: 'Employee' } })
    mocks.replace.mockResolvedValue(undefined)
  })
  it('creates a session by employee number, without creating a Portal account or assigning a role', async () => {
    const wrapper = mount(PerformanceIdentitySwitchDialog, { props: { modelValue: true }, global: { plugins: [ElementPlus], stubs: { teleport: true } } })
    await flushPromises()
    if (!mocks.people.mock.calls.length) await (wrapper.vm as any).loadPeople()
    await flushPromises()
    await wrapper.find('[data-pick]').trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '确认切换')!.trigger('click')
    await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith('E-NO-PORTAL', 7)
    expect(employeeSwitchSession.value?.effective_identity.employee_no).toBe('E-NO-PORTAL')
    expect(mocks.replace).toHaveBeenCalledWith('/performance/workbench')
    wrapper.unmount()
  })
})
