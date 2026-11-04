import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceAuthorizationDialog from './PerformanceAuthorizationDialog.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'

const api = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceUserAuthorizationApi: api }))

const stubs = {
  PerformanceDialogShell: { props: ['modelValue', 'title'], emits: ['update:modelValue'], template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
  PerformanceFormItem: { props: ['label'], template: '<div class="form-item"><label>{{ label }}</label><slot /></div>' },
  PerformanceSearchSelect: { props: ['modelValue', 'options', 'placeholder', 'disabled'], template: '<div class="select" :aria-disabled="disabled">{{ placeholder }}</div>' },
  UiButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

describe('PerformanceAuthorizationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.options.mockResolvedValue({ users: [{ value: '8', label: '员工（E8）', employee_no: 'E8' }], roles: [{ id: 11, name: '任务管理员', function_permission_keys: ['performance.frontend.authorize-evaluation-tasks'] }] })
    api.save.mockResolvedValue({ user_id: 8 })
  })

  it('saves real user and role IDs, then notifies the list', async () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'users' }, global: { stubs } })
    await flushPromises()
    const selectors = wrapper.findAllComponents(PerformanceSearchSelect)
    selectors[0].vm.$emit('update:modelValue', '8')
    selectors[1].vm.$emit('update:modelValue', ['11'])
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith(8, [11], false)
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
  })

  it('reopens an existing authorization and uses the replace endpoint', async () => {
    const authorization = { user_id: 8, display_name: '员工', login_name: 'u8', employee_no: 'E8', role_ids: [11], roles: [{ id: 11, name: '任务管理员', function_permission_keys: [] }], updated_at: '2026-11-04T00:00:00Z' }
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'users', authorization }, global: { stubs } })
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[0].props('disabled')).toBe(true)
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[1].props('modelValue')).toEqual(['11'])
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(api.save).toHaveBeenCalledWith(8, [11], true)
  })

  it('keeps the form open on failure and blocks empty assignments', async () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'users' }, global: { stubs } })
    await flushPromises()
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('请选择用户')
    expect(api.save).not.toHaveBeenCalled()
    const selectors = wrapper.findAllComponents(PerformanceSearchSelect)
    selectors[0].vm.$emit('update:modelValue', '8')
    selectors[1].vm.$emit('update:modelValue', ['11'])
    api.save.mockRejectedValue({ response: { data: { detail: '角色已停用' } } })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('角色已停用')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('keeps rule authorization explicitly unavailable', () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'rules' }, global: { stubs } })
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('添加规则')
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeDefined()
  })
})
