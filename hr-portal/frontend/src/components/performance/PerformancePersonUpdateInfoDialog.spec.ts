import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformancePersonUpdateInfoDialog from './PerformancePersonUpdateInfoDialog.vue'

const updatePersonInfo = vi.fn()

vi.mock('@/api/performance', () => ({
  performanceCycleApi: { updatePersonInfo: (...args: unknown[]) => updatePersonInfo(...args) },
}))

vi.mock('element-plus', () => ({
  ElMessage: { success: vi.fn(), info: vi.fn() },
}))

const stubs = {
  'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
  'el-alert': { props: ['title', 'description'], template: '<div class="alert">{{ title }} {{ description }}</div>' },
  'el-checkbox': { props: ['modelValue', 'value', 'indeterminate'], emits: ['update:modelValue', 'change'], template: '<label class="cb"><slot /></label>' },
  'el-checkbox-group': { props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="cb-group" @click="$emit(\'update:modelValue\', [\'job_family\', \'department\'])"><slot /></div>' },
  'el-button': { props: ['disabled', 'loading'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

function mountDialog() {
  return mount(PerformancePersonUpdateInfoDialog, {
    props: { modelValue: true, cycleId: 1, employeeNo: 'E001', employeeName: '张三' },
    global: { stubs },
  })
}

describe('PerformancePersonUpdateInfoDialog', () => {
  beforeEach(() => {
    updatePersonInfo.mockReset()
  })

  it('renders the four update dimensions from the REA spec', () => {
    const wrapper = mountDialog()
    expect(wrapper.get('[role="dialog"] h2').text()).toBe('更新人员信息')
    const text = wrapper.text()
    expect(text).toContain('序列（职类）')
    expect(text).toContain('职级（职位层级）')
    expect(text).toContain('直属上级')
    expect(text).toContain('部门')
    expect(text).toContain('更新信息内容')
  })

  it('keeps confirm disabled until a dimension is selected, then submits update_fields', async () => {
    updatePersonInfo.mockResolvedValue({
      changed: [{ employee_no: 'E001', field: 'job_family', label: '职类（序列）', before: '技术', after: '产品' }],
      person: { employee_no: 'E001' },
    })
    const wrapper = mountDialog()
    const confirm = wrapper.findAll('button').at(-1)!
    expect(confirm.attributes('disabled')).toBeDefined()

    await wrapper.get('.cb-group').trigger('click')
    await wrapper.vm.$nextTick()
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')
    await wrapper.vm.$nextTick()

    expect(updatePersonInfo).toHaveBeenCalledTimes(1)
    expect(updatePersonInfo).toHaveBeenCalledWith(1, 'E001', ['job_family', 'department'])
    expect(wrapper.emitted('updated')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
