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

function mountDialog() {
  return mount(PerformancePersonUpdateInfoDialog, {
    props: { modelValue: true, cycleId: 1, employeeNo: 'E001', employeeName: '张三' },
  })
}

function checkOption(wrapper: ReturnType<typeof mountDialog>, label: string) {
  const input = wrapper.findAll('.ufd__option').find(option => option.text().includes(label))!.get('input')
  input.setValue(true)
}

describe('PerformancePersonUpdateInfoDialog', () => {
  beforeEach(() => {
    updatePersonInfo.mockReset()
  })

  it('renders the four update dimensions from the REA spec', () => {
    const wrapper = mountDialog()
    expect(wrapper.get('.ufd__title').text()).toBe('更新人员信息')
    const text = wrapper.text()
    expect(text).toContain('序列')
    expect(text).toContain('职级')
    expect(text).toContain('直属上级')
    expect(text).toContain('部门')
    expect(text).toContain('更新信息内容')
    expect(text).toContain('仅支持人员在原有序列/职级/直属上级/部门范围内的变更（不支持新增及名称修改）')
    expect(text).toContain('更新后将影响信息展示、报表统计范围、任务执行人、角色权限和校准范围等')
    expect(text).toContain('查看详情')
  })

  it('keeps confirm disabled until a dimension is selected, then submits update_fields', async () => {
    updatePersonInfo.mockResolvedValue({
      changed: [{ employee_no: 'E001', field: 'job_family', label: '职类（序列）', before: '技术', after: '产品' }],
      person: { employee_no: 'E001' },
    })
    const wrapper = mountDialog()
    const confirm = wrapper.get('.ufd__btn--confirm')
    expect(confirm.attributes('disabled')).toBeDefined()

    checkOption(wrapper, '序列')
    await wrapper.vm.$nextTick()
    expect(confirm.attributes('disabled')).toBeUndefined()
    await confirm.trigger('click')
    await wrapper.vm.$nextTick()

    expect(updatePersonInfo).toHaveBeenCalledTimes(1)
    expect(updatePersonInfo).toHaveBeenCalledWith(1, 'E001', ['job_family'])
    expect(wrapper.emitted('updated')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([false])
  })
})
