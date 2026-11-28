import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceAuthorizationDialog from './PerformanceAuthorizationDialog.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceAudienceRuleEditor from './PerformanceAudienceRuleEditor.vue'

const userApi = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn() }))
const ruleApi = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn(), resolveScope: vi.fn() }))
const identityApi = vi.hoisted(() => ({ people: vi.fn() }))
vi.mock('@/api/performance', () => ({ performanceUserAuthorizationApi: userApi, performanceAuthRuleApi: ruleApi }))
vi.mock('@/api/identitySwitch', () => ({ identitySwitchApi: identityApi }))

const stubs = {
  PerformanceDialogShell: { props: ['modelValue', 'title', 'width'], emits: ['update:modelValue'], template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
  PerformanceFormItem: { props: ['label', 'required'], template: '<div class="form-item"><label>{{ label }}</label><slot /></div>' },
  PerformanceSearchSelect: { props: ['modelValue', 'options', 'placeholder', 'disabled', 'multiple'], emits: ['update:modelValue'], template: '<div class="select" :aria-disabled="disabled">{{ placeholder }}</div>' },
  PerformanceAudienceRuleEditor: { props: ['modelValue', 'allowedFields'], emits: ['update:modelValue'], template: '<div class="rule-editor">{{ modelValue.length }} 组</div>' },
  UiButton: { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

function authRuleOptions() {
  return {
    fields: [
      { key: 'department', label: '部门', operators: ['include', 'exclude'], option_source: 'organization_tree' },
      { key: 'employee', label: '员工', operators: ['include', 'exclude'], option_source: 'people' },
      { key: 'superior', label: '上级', operators: ['include', 'exclude'], option_source: 'people' },
      { key: 'directLeader', label: '直属上级', operators: ['include', 'exclude'], option_source: 'people' },
      { key: 'job_family', label: '序列', operators: ['include', 'exclude'], option_source: 'job_families' },
      { key: 'position_level', label: '职级', operators: ['include', 'exclude'], option_source: 'position_levels' },
      { key: 'hire_date', label: '入职时间', operators: ['before', 'not_before', 'after', 'not_after'], option_source: 'hire_date_range' },
      { key: 'employee_type', label: '人员类型', operators: ['include', 'exclude'], option_source: 'employee_types' },
    ],
    organization_tree: [{ value: '研发', label: '研发', level: 1, children: [] }],
    people: [{ value: 'E8', label: '员工（E8）', department: '研发' }],
    roles: [{ id: 11, name: '测试管理角色', function_permission_keys: [] }],
    job_families: [], position_levels: [], hire_date_range: { min: null, max: null }, employee_types: [],
  }
}

describe('PerformanceAuthorizationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userApi.options.mockResolvedValue({ users: [{ value: '8', label: '员工（E8）', employee_no: 'E8' }], roles: [{ id: 11, name: '任务管理员', function_permission_keys: ['performance.frontend.authorize-evaluation-tasks'] }] })
    userApi.save.mockResolvedValue({ user_id: 8 })
    ruleApi.options.mockResolvedValue(authRuleOptions())
    ruleApi.resolveScope.mockResolvedValue({ count: 3, user_ids: ['E8'] })
    ruleApi.save.mockResolvedValue({ id: 1, role_id: 11, role_name: '测试管理角色', or_scope: [], updated_at: '2026-11-04T00:00:00Z' })
    identityApi.people.mockResolvedValue({ items: [] })
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
    expect(userApi.save).toHaveBeenCalledWith(8, [11], false)
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
    expect(userApi.save).toHaveBeenCalledWith(8, [11], true)
  })

  it('keeps the form open on failure and blocks empty assignments', async () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'users' }, global: { stubs } })
    await flushPromises()
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.get('[role="alert"]').text()).toContain('请选择用户')
    expect(userApi.save).not.toHaveBeenCalled()
    const selectors = wrapper.findAllComponents(PerformanceSearchSelect)
    selectors[0].vm.$emit('update:modelValue', '8')
    selectors[1].vm.$emit('update:modelValue', ['11'])
    userApi.save.mockRejectedValue({ response: { data: { detail: '角色已停用' } } })
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('角色已停用')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('loads rule options, counts scope and saves a real rule', async () => {
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'rules' }, global: { stubs } })
    await flushPromises()
    expect(ruleApi.options).toHaveBeenCalled()
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('添加规则')
    // 授权角色单选 + 范围条件编辑器
    const editor = wrapper.findComponent(PerformanceAudienceRuleEditor)
    expect(editor.props('allowedFields')).toContain('directLeader')
    expect(editor.props('allowedFields')).toContain('department')
    // 保存按钮可用（非禁用）
    expect(wrapper.findAll('button')[1].attributes('disabled')).toBeUndefined()
    // 提交真实保存
    editor.vm.$emit('update:modelValue', [{ conditions: [{ field: 'department', operator: 'include', values: ['研发'] }] }])
    wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', '11')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(ruleApi.save).toHaveBeenCalledWith(11, [{ conditions: [{ field: 'department', operator: 'include', values: ['研发'] }] }], false, undefined)
    expect(wrapper.emitted('saved')).toHaveLength(1)
  })

  it('reopens an existing rule for edit and uses the update endpoint', async () => {
    const rule = { id: 5, role_id: 11, role_name: '测试管理角色', or_scope: [{ conditions: [{ field: 'employee' as const, operator: 'include' as const, values: ['E8'] }] }], updated_at: '2026-11-04T00:00:00Z' }
    const wrapper = mount(PerformanceAuthorizationDialog, { props: { modelValue: true, mode: 'rules', rule }, global: { stubs } })
    await flushPromises()
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('编辑规则')
    const editor = wrapper.findComponent(PerformanceAudienceRuleEditor)
    expect(editor.props('modelValue')).toEqual([{ conditions: [{ field: 'employee', operator: 'include', values: ['E8'] }] }])
    wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', '11')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('button')[1].trigger('click')
    await flushPromises()
    expect(ruleApi.save).toHaveBeenCalledWith(11, [{ conditions: [{ field: 'employee', operator: 'include', values: ['E8'] }] }], true, 5)
  })
})
