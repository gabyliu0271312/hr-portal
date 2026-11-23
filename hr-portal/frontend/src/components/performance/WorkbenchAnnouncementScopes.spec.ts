import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WorkbenchAnnouncementScopes from './WorkbenchAnnouncementScopes.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
const api = vi.hoisted(() => ({ list: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceCycleApi: api }))
function scopes() {
  const wrapper = mount(WorkbenchAnnouncementScopes, { global: { stubs: { teleport: true } }, props: { cycleScope: '指定周期', cycleRef: 'cycle:1', visibility: '指定角色', roles: [] } })
  wrapper.setProps({ 'onUpdate:roles': value => wrapper.setProps({ roles: value }) })
  return wrapper
}
describe('WorkbenchAnnouncementScopes', () => {
  beforeEach(() => { vi.clearAllMocks(); api.list.mockResolvedValue({ items: [{ cycle_ref: 'cycle:1', name: '年度绩效' }] }) })
  it('supports real role multiselect and retains both roles in the parent model', async () => {
    const wrapper = scopes()
    const roleSelect = wrapper.findAllComponents(PerformanceSearchSelect)[1]
    expect(roleSelect.props('multiple')).toBe(true)
    await roleSelect.get('[role="combobox"]').trigger('click')
    const options = () => roleSelect.findAll('[role="option"]')
    await options()[0].trigger('click')
    await options()[1].trigger('click')
    expect(wrapper.props('roles')).toEqual(['HRBP', 'REAL_LINE_MANAGER'])
    expect(wrapper.text()).toContain('管理范围内有人参评的 HRBP')
    wrapper.unmount()
  })
  it('keeps single-cycle selection and retries failed cycle loading', async () => {
    api.list.mockRejectedValueOnce(new Error('failed'))
    const wrapper = scopes()
    const cycleSelect = wrapper.findAllComponents(PerformanceSearchSelect)[0]
    expect(cycleSelect.props('multiple')).toBe(false)
    cycleSelect.vm.$emit('open')
    await flushPromises()
    cycleSelect.vm.$emit('open')
    await flushPromises()
    expect(api.list).toHaveBeenCalledTimes(2)
    expect(cycleSelect.props('options')).toEqual([{ value: 'cycle:1', label: '年度绩效' }])
    wrapper.unmount()
  })
})
