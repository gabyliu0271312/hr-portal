import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { projectManagementApi } from '@/api/performance'
import PerformancePersonFilterSelect from './PerformancePersonFilterSelect.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'

describe('PerformancePersonFilterSelect', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('searches after the debounce, merges the option and emits the selected item', async () => {
    const search = vi.spyOn(projectManagementApi, 'authorizationRecordEmployeeOptions').mockResolvedValue({ items: [{ value: 'E1', label: '邱晓玲', sub_label: 'HRBP组' }] })
    const wrapper = mount(PerformancePersonFilterSelect, { props: { modelValue: [], cycleId: 1, 'aria-label': '发起人' } })
    const select = wrapper.getComponent(PerformancePersonSelect)
    select.vm.$emit('search', 'qiu')
    expect(search).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    await flushPromises()
    await nextTick()
    expect(search).toHaveBeenCalledWith(1, 'qiu')
    expect(select.props('options')).toEqual([expect.objectContaining({ value: 'E1', label: '邱晓玲', subLabel: 'HRBP组' })])
    select.vm.$emit('update:modelValue', ['E1'])
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual([expect.objectContaining({ value: 'E1', label: '邱晓玲' })])
  })

  it('keeps the selected item label after reopening without a search', async () => {
    const wrapper = mount(PerformancePersonFilterSelect, {
      props: { modelValue: [{ value: 'E9', label: '历史人员', subLabel: '研发部' }], cycleId: 1, 'aria-label': '被授权人' },
    })
    const select = wrapper.getComponent(PerformancePersonSelect)
    expect(select.props('modelValue')).toEqual(['E9'])
    expect(select.props('options')).toEqual([expect.objectContaining({ value: 'E9', label: '历史人员' })])
  })
})
