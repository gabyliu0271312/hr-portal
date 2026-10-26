import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus, { ElCheckbox, ElSelect, ElSwitch } from 'element-plus'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WarehouseAuthorizationContractForm from './WarehouseAuthorizationContractForm.vue'

const api = vi.hoisted(() => ({ create: vi.fn() }))
vi.mock('@/api/warehouse', () => ({ createAuthorizationContract: api.create }))
const tables = [
  { id: 1, alias: 'salary', table_name: 'salary_fact' },
  { id: 2, alias: 'allocation', table_name: 'allocation_fact' },
]
function form(source = tables) {
  return mount(WarehouseAuthorizationContractForm, {
    props: { modelId: 7, tables: source, outputs: [], latestVersion: 2 },
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-alert': { props: ['title'], template: '<div role="alert">{{ title }}</div>' },
        PermissionButton: { props: ['disabled'], template: '<button :disabled="disabled"><slot /></button>' },
      },
    },
  })
}
async function fill(wrapper: ReturnType<typeof form>) {
  for (const alias of tables.map(table => table.alias)) {
    await wrapper.get(`input[aria-label="${alias}事实键"]`).setValue('fact_id')
    await wrapper.get(`input[aria-label="${alias}人员键"]`).setValue('employee_no')
  }
}
beforeEach(() => { vi.clearAllMocks(); api.create.mockResolvedValue({ id: 12 }) })

describe('WarehouseAuthorizationContractForm', () => {
  it('requires each model fact to have its own identity and personnel path', async () => {
    const wrapper = form()
    expect(wrapper.findAll('.contract-form__fact')).toHaveLength(2)
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('input[aria-label="salary事实键"]').setValue('fact_id')
    await wrapper.get('input[aria-label="salary人员键"]').setValue('employee_no')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await fill(wrapper)
    expect(wrapper.get('button').attributes('disabled')).toBeUndefined()
  })
  it('submits all source aliases and grants center summary only to the selected allocation fact', async () => {
    const wrapper = form()
    await fill(wrapper)
    const role = wrapper.findAllComponents(ElSelect)[1]
    role.vm.$emit('update:modelValue', 'allocation_fact')
    role.vm.$emit('change', 'allocation_fact')
    await flushPromises()
    const center = wrapper.findAllComponents(ElCheckbox).find(item => item.text() === '批准中心汇总')!
    center.vm.$emit('update:modelValue', true)
    await flushPromises()
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    await wrapper.get('input[aria-label="allocation中心键"]').setValue('cc_code')
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.create).toHaveBeenCalledWith(7, {
      schema_version: 3, expected_version: 2,
      facts: [
        { alias: 'salary', table_name: 'salary_fact', fact_key: 'fact_id', employee_key: 'employee_no', cost_center_key: null, role: 'person_fact', allow_cost_center_summary: false, allow_employee_count: false, missing_assignment: 'reject' },
        { alias: 'allocation', table_name: 'allocation_fact', fact_key: 'fact_id', employee_key: 'employee_no', cost_center_key: 'cc_code', role: 'allocation_fact', allow_cost_center_summary: true, allow_employee_count: false, missing_assignment: 'reject' },
      ],
    })
    expect(wrapper.emitted('created')).toHaveLength(1)
  })
  it('clears center authority when changing a fact back to personnel role', async () => {
    const wrapper = form()
    await fill(wrapper)
    const role = wrapper.findAllComponents(ElSelect)[1]
    role.vm.$emit('update:modelValue', 'allocation_fact')
    role.vm.$emit('change', 'allocation_fact')
    await flushPromises()
    wrapper.findAllComponents(ElCheckbox).find(item => item.text() === '批准中心汇总')!.vm.$emit('update:modelValue', true)
    await flushPromises()
    await wrapper.get('input[aria-label="allocation中心键"]').setValue('cc_code')
    role.vm.$emit('update:modelValue', 'person_fact')
    role.vm.$emit('change', 'person_fact')
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(api.create.mock.calls[0][1].facts[1]).toMatchObject({ role: 'person_fact', cost_center_key: null, allow_cost_center_summary: false })
  })
  it('does not permit multifactor legacy contracts and does not silently remove sources', async () => {
    const wrapper = form()
    await fill(wrapper)
    wrapper.getComponent(ElSwitch).vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(wrapper.text()).toContain('旧合同模式不支持多事实')
    expect(wrapper.get('button').attributes('disabled')).toBeDefined()
    expect(api.create).not.toHaveBeenCalled()
  })
  it('shows a stable server refusal without emitting success', async () => {
    api.create.mockRejectedValue({ response: { data: { detail: { code: 'contract_version_conflict', message: '合同版本已变化' } } } })
    const wrapper = form()
    await fill(wrapper)
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('合同版本已变化')
    expect(wrapper.emitted('created')).toBeUndefined()
  })
})
