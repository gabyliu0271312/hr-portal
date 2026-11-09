import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import RevieweeAddDialog from './RevieweeAddDialog.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'

const mocks = vi.hoisted(() => ({ revieweeSearch: vi.fn(), revieweeConflictCheck: vi.fn(), addReviewee: vi.fn(), success: vi.fn() }))
vi.mock('@/api/performance', () => ({ projectManagementApi: mocks }))
vi.mock('element-plus', () => ({ ElMessage: { success: mocks.success } }))
const projects = [1, 2].map(id => ({ project_id: id, project_name: `项目${id}`, project_ref: `P${id}`, status: 'STARTED' }))
function dialog(realPeople = false) {
  return mount(RevieweeAddDialog, {
    props: { modelValue: true, projectId: 1, projects },
    global: { stubs: { teleport: true, ...(realPeople ? {} : { PerformancePersonSelect: { props: ['modelValue', 'options', 'disabled'], emits: ['search', 'update:modelValue'], template: '<div data-testid="people" />' } }) } },
  })
}
function confirm(wrapper: ReturnType<typeof dialog>) { return wrapper.findAll('button').find(button => button.text() === '确定')! }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done }); return { promise, resolve } }
const option = (value: string) => ({ value, label: value, is_permitted: true })
beforeEach(() => {
  Object.values(mocks).forEach(mock => mock.mockReset())
  mocks.revieweeSearch.mockResolvedValue({ items: [] })
  mocks.revieweeConflictCheck.mockResolvedValue({ conflicts: [] })
  mocks.addReviewee.mockResolvedValue(option('E1'))
})
afterEach(() => { document.body.innerHTML = '' })

describe('RevieweeAddDialog', () => {
  it('invalidates searches when the real person input is cleared', async () => {
    const old = deferred<{ items: ReturnType<typeof option>[] }>()
    mocks.revieweeSearch.mockReturnValueOnce(old.promise)
    const wrapper = dialog(true)
    await wrapper.get('input[aria-label="选择被评估人"]').setValue('旧搜索')
    await flushPromises()
    expect(mocks.revieweeSearch).toHaveBeenCalledOnce()
    await wrapper.get('input[aria-label="选择被评估人"]').setValue('')
    await flushPromises()
    old.resolve({ items: [option('旧人员')] })
    await flushPromises()
    expect(wrapper.getComponent(PerformancePersonSelect).props('options')).toEqual([])
    expect(mocks.revieweeSearch).toHaveBeenCalledOnce()
    wrapper.unmount()
  })

  it('refreshes partial success after a structured error and retries only failed and unprocessed people', async () => {
    mocks.addReviewee.mockResolvedValueOnce(option('E1')).mockRejectedValueOnce({ response: { data: { detail: { message: '范围外人员' } } } })
    const wrapper = dialog()
    const people = wrapper.getComponent(PerformancePersonSelect)
    people.vm.$emit('update:modelValue', ['E1', 'E2', 'E3'])
    await confirm(wrapper).trigger('click'); await flushPromises()
    expect(wrapper.emitted('added')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect(wrapper.getComponent(PerformancePersonSelect).props('modelValue')).toEqual(['E2', 'E3'])
    expect(wrapper.get('.reviewee-add-error').text()).toContain('部分成功')
    expect(wrapper.get('.reviewee-add-error').text()).toContain('范围外人员')
    expect(mocks.addReviewee.mock.calls.map(call => call[1])).toEqual(['E1', 'E2'])
    await confirm(wrapper).trigger('click'); await flushPromises()
    expect(mocks.addReviewee.mock.calls.map(call => call[1])).toEqual(['E1', 'E2', 'E2', 'E3'])
    expect(wrapper.emitted('added')).toHaveLength(2)
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    expect(wrapper.getComponent(PerformancePersonSelect).props('modelValue')).toEqual([])
    wrapper.unmount()
  })

  it('refreshes in finally when a conflict stops a batch after one success', async () => {
    mocks.revieweeConflictCheck.mockResolvedValueOnce({ conflicts: [] }).mockResolvedValueOnce({ conflicts: [{ stage_label: '已加入其他项目' }] })
    const wrapper = dialog()
    const people = wrapper.getComponent(PerformancePersonSelect)
    people.vm.$emit('update:modelValue', ['E1', 'E2', 'E3'])
    await confirm(wrapper).trigger('click'); await flushPromises()
    expect(wrapper.emitted('added')).toEqual([[]])
    expect(mocks.addReviewee).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent(PerformancePersonSelect).props('modelValue')).toEqual(['E2', 'E3'])
    expect(wrapper.get('.reviewee-add-error').text()).toContain('已加入其他项目')
    expect(confirm(wrapper).attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('retains the full selection without emitting added when nothing succeeded', async () => {
    mocks.addReviewee.mockRejectedValueOnce({ response: { data: { detail: '添加失败' } } })
    const wrapper = dialog()
    const people = wrapper.getComponent(PerformancePersonSelect)
    people.vm.$emit('update:modelValue', ['E1', 'E2'])
    await confirm(wrapper).trigger('click'); await flushPromises()
    expect(wrapper.emitted('added')).toBeUndefined()
    expect(wrapper.getComponent(PerformancePersonSelect).props('modelValue')).toEqual(['E1', 'E2'])
    expect(wrapper.get('.reviewee-add-error').text()).toBe('添加失败')
    wrapper.unmount()
  })

  it('prevents duplicate submissions while adding and emits one refresh for full success', async () => {
    const pending = deferred<ReturnType<typeof option>>()
    mocks.addReviewee.mockReturnValueOnce(pending.promise)
    const wrapper = dialog()
    wrapper.getComponent(PerformancePersonSelect).vm.$emit('update:modelValue', ['E1'])
    await confirm(wrapper).trigger('click'); await flushPromises()
    confirm(wrapper).element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(mocks.addReviewee).toHaveBeenCalledTimes(1)
    pending.resolve(option('E1')); await flushPromises()
    expect(wrapper.emitted('added')).toEqual([[]])
    expect(wrapper.emitted('update:modelValue')).toEqual([[false]])
    wrapper.unmount()
  })

  it.each(['project', 'close', 'clear'] as const)('invalidates pending searches on %s', async action => {
    const old = deferred<{ items: ReturnType<typeof option>[] }>()
    mocks.revieweeSearch.mockReturnValueOnce(old.promise)
    const wrapper = dialog()
    const people = wrapper.getComponent(PerformancePersonSelect)
    people.vm.$emit('search', '旧搜索'); await flushPromises()
    expect(mocks.revieweeSearch).toHaveBeenCalledWith(1, '旧搜索')
    if (action === 'project') wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', '2')
    else if (action === 'close') { await wrapper.setProps({ modelValue: false }); await wrapper.setProps({ modelValue: true }) }
    else people.vm.$emit('search', '')
    await flushPromises()
    expect(wrapper.getComponent(PerformancePersonSelect).vm.$attrs.loading).toBe(false)
    if (action !== 'clear') {
      mocks.revieweeSearch.mockResolvedValueOnce({ items: [option('新人员')] })
      wrapper.getComponent(PerformancePersonSelect).vm.$emit('search', '新搜索'); await flushPromises()
    }
    old.resolve({ items: [option('旧人员')] }); await flushPromises()
    expect(wrapper.getComponent(PerformancePersonSelect).props('options')!.map(item => item.value)).toEqual(action === 'clear' ? [] : ['新人员'])
    if (action === 'project') expect(mocks.revieweeSearch).toHaveBeenLastCalledWith(2, '新搜索')
    wrapper.unmount()
  })
})
