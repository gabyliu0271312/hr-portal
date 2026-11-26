import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { projectManagementApi, type PerformanceMemberFilterField } from '@/api/performance'
import PerformanceMemberFilter from './PerformanceMemberFilter.vue'
import PerformanceMemberFilterValue from './PerformanceMemberFilterValue.vue'
import ProjectMemberListPanel from './ProjectMemberListPanel.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'

enableAutoUnmount(afterEach)
vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, cycleMemberFilterOptions: vi.fn(), cycleMembers: vi.fn(), cycleExportMembers: vi.fn() } }
})
const field: PerformanceMemberFilterField = { key: 'rating:configured', label: '当前周期绩效结果/动态评级', kind: 'select', operators: [{ value: 'in', label: '包含' }, { value: 'not_in', label: '不包含' }], options: [{ value: 'option-id', label: '3星', subLabel: '符合预期' }] }
const applied = { logic: 'and' as const, conditions: [{ key: field.key, op: 'in' as const, values: ['option-id'] }] }
const Popover = defineComponent({ props: ['visible'], template: '<div v-if="visible"><slot /></div>' })
function mountFilter(modelValue = applied) {
  return mount(PerformanceMemberFilter, { props: { visible: true, anchor: document.body, cycleId: 1, modelValue, contextKey: 'role-a' }, global: { stubs: { PerformancePopover: Popover } } })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockResolvedValue({ fields: [field] })
  vi.mocked(projectManagementApi.cycleMembers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
  vi.mocked(projectManagementApi.cycleExportMembers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
})

describe('cycle member advanced filters', () => {
  it('only exposes server-provided fields and cancels without applying drafts', async () => {
    const wrapper = mountFilter()
    await flushPromises()
    const selects = wrapper.findAllComponents(PerformanceSearchSelect)
    expect(selects[1].props('options')).toEqual([{ value: field.key, label: field.label }])
    expect(wrapper.text()).not.toContain('历史周期绩效结果')
    wrapper.findComponent(PerformanceMemberFilterValue).vm.$emit('update:modelValue', [])
    await wrapper.findAll('button').find(button => button.text() === '取消')!.trigger('click')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(applied.conditions[0].values).toEqual(['option-id'])
  })
  it('applies option IDs, relation and exclusion rather than displayed names', async () => {
    const wrapper = mountFilter()
    await flushPromises()
    wrapper.findAllComponents(PerformanceSearchSelect)[0].vm.$emit('update:modelValue', 'or')
    wrapper.findAllComponents(PerformanceSearchSelect)[2].vm.$emit('update:modelValue', 'not_in')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ logic: 'or', conditions: [{ key: field.key, op: 'not_in', values: ['option-id'] }] }])
  })
  it('clears all values and confirms an unfiltered request', async () => {
    const wrapper = mountFilter()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text() === '清除已选内容')!.trigger('click')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ logic: 'and', conditions: [] }])
  })
  it('shows loading failure and does not silently apply it', async () => {
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockRejectedValueOnce(new Error('offline'))
    const wrapper = mountFilter()
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('加载失败')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })
  it('rejects incomplete date ranges', async () => {
    const dateField: PerformanceMemberFilterField = { ...field, key: 'hire_date', label: '入职日期', kind: 'date' }
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockResolvedValue({ fields: [dateField] })
    const wrapper = mountFilter({ logic: 'and', conditions: [{ key: 'hire_date', op: 'in', values: ['2026-01-01'] }] })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').text()).toContain('开始和结束日期')
  })
  it('ignores a candidate response from the previous identity context', async () => {
    let resolve!: (value: { fields: PerformanceMemberFilterField[] }) => void
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountFilter()
    await wrapper.setProps({ contextKey: 'role-b' })
    await flushPromises()
    resolve({ fields: [{ ...field, key: 'private-old-context', label: '旧范围字段' }] })
    await flushPromises()
    expect(wrapper.findAllComponents(PerformanceSearchSelect)[1].props('options')).toEqual([{ value: field.key, label: field.label }])
  })
  it('applies the same filters to list and export and clears them on identity changes', async () => {
    const wrapper = mount(ProjectMemberListPanel, { props: { projectId: 0, cycleId: 1, showExport: true }, global: { stubs: { PerformanceMemberFilter: true, PerformanceManagementTable: true } } })
    await flushPromises()
    wrapper.findComponent(PerformanceMemberFilter).vm.$emit('apply', applied)
    await flushPromises()
    expect(projectManagementApi.cycleMembers).toHaveBeenLastCalledWith(1, undefined, 1, 50, undefined, undefined, applied)
    expect(wrapper.text()).toContain('筛选 (1)')
    await wrapper.findComponent(PerformanceExportButton).props('loadRows')()
    expect(projectManagementApi.cycleExportMembers).toHaveBeenLastCalledWith(1, undefined, undefined, undefined, applied)
    employeeSwitchEpoch.value++
    await flushPromises()
    expect(projectManagementApi.cycleMembers).toHaveBeenLastCalledWith(1, undefined, 1, 50, undefined, undefined)
    expect(wrapper.text()).not.toContain('筛选 (1)')
  })
})
