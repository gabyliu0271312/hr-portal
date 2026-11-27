import { flushPromises, mount, enableAutoUnmount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { projectManagementApi, type PerformanceMemberFilterField as MemberFilterField } from '@/api/performance'
import PerformanceMemberFilter from './PerformanceMemberFilter.vue'
import PerformanceMemberFilterValue from './PerformanceMemberFilterValue.vue'
import PerformanceMemberFilterField from './PerformanceMemberFilterField.vue'
import PerformanceMemberFilterPresets from './PerformanceMemberFilterPresets.vue'
import ProjectMemberListPanel from './ProjectMemberListPanel.vue'
import PerformanceSearchSelect from './PerformanceSearchSelect.vue'
import PerformanceExportButton from './PerformanceExportButton.vue'
import PerformanceDateRangeField from './PerformanceDateRangeField.vue'
import dateRangeSource from './PerformanceDateRangeField.vue?raw'
import PerformanceOrganizationSelect from './PerformanceOrganizationSelect.vue'
import PerformanceSelectShell from './PerformanceSelectShell.vue'
import { ElDatePicker } from 'element-plus'
import { employeeSwitchEpoch } from '@/stores/identitySwitch'

enableAutoUnmount(afterEach)
vi.mock('@/api/performance', async () => {
  const actual = await vi.importActual<typeof import('@/api/performance')>('@/api/performance')
  return { ...actual, projectManagementApi: { ...actual.projectManagementApi, cycleMemberFilterOptions: vi.fn(), cycleMemberFilterPresets: vi.fn(), saveCycleMemberFilterPreset: vi.fn(), deleteCycleMemberFilterPreset: vi.fn(), cycleMembers: vi.fn(), cycleExportMembers: vi.fn() } }
})
const field: MemberFilterField = { key: 'rating:configured', label: '当前周期绩效结果/动态评级', kind: 'select', operators: [{ value: 'in', label: '包含' }, { value: 'not_in', label: '不包含' }], options: [{ value: 'option-id', label: '3星', subLabel: '符合预期' }] }
const applied = { logic: 'and' as const, conditions: [{ key: field.key, op: 'in' as const, values: ['option-id'] }] }
const Popover = defineComponent({ props: ['visible'], template: '<div v-if="visible"><slot /></div>' })
function mountFilter(modelValue = applied) {
  return mount(PerformanceMemberFilter, { props: { visible: true, anchor: document.body, cycleId: 1, modelValue, contextKey: 'role-a' }, global: { stubs: { PerformancePopover: Popover } } })
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockResolvedValue({ fields: [field] })
  vi.mocked(projectManagementApi.cycleMemberFilterPresets).mockResolvedValue({ items: [] })
  vi.mocked(projectManagementApi.cycleMembers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
  vi.mocked(projectManagementApi.cycleExportMembers).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 })
})

describe('cycle member advanced filters', () => {
  it('only exposes server-provided fields and cancels without applying drafts', async () => {
    const wrapper = mountFilter()
    await flushPromises()
    expect(wrapper.findComponent(PerformanceMemberFilterField).props('fields')).toEqual([field])
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
    wrapper.findAllComponents(PerformanceSearchSelect)[1].vm.$emit('update:modelValue', 'not_in')
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
  it('omits incomplete date ranges without blocking confirmation, matching captured behavior', async () => {
    const dateField: MemberFilterField = { ...field, key: 'hire_date', label: '入职日期', kind: 'date' }
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockResolvedValue({ fields: [dateField] })
    const wrapper = mountFilter({ logic: 'and', conditions: [{ key: 'hire_date', op: 'in', values: ['2026-01-01'] }] })
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ logic: 'and', conditions: [] }])
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('ignores a candidate response from the previous identity context', async () => {
    let resolve!: (value: { fields: MemberFilterField[] }) => void
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountFilter()
    await wrapper.setProps({ contextKey: 'role-b' })
    await flushPromises()
    resolve({ fields: [{ ...field, key: 'private-old-context', label: '旧范围字段' }] })
    await flushPromises()
    expect(wrapper.findComponent(PerformanceMemberFilterField).props('fields')).toEqual([field])
  })
  it('prefetches fields before opening and reuses them on reopen', async () => {
    const wrapper = mount(PerformanceMemberFilter, { props: { visible: false, anchor: document.body, cycleId: 1, modelValue: applied, contextKey: 'role-a' }, global: { stubs: { PerformancePopover: Popover } } })
    await flushPromises()
    expect(projectManagementApi.cycleMemberFilterOptions).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ visible: true })
    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    expect(projectManagementApi.cycleMemberFilterOptions).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(PerformanceMemberFilterField).props('modelValue')).toBe(field.key)
  })
  it('adds an empty row and automatically opens its field picker', async () => {
    const wrapper = mountFilter()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('添加条件'))!.trigger('click')
    await flushPromises()
    const controls = wrapper.findAllComponents(PerformanceMemberFilterField)
    expect(controls).toHaveLength(2)
    expect(controls[1].props('modelValue')).toBe('')
    expect(controls[1].findComponent(PerformanceSelectShell).vm.isOpen).toBe(true)
    expect(wrapper.findAll('button[aria-label^="删除条件"]')).toHaveLength(2)
  })
  it('closes outside without applying but keeps teleported child layers open', async () => {
    const anchor = document.createElement('button')
    document.body.append(anchor)
    const wrapper = mount(PerformanceMemberFilter, { attachTo: document.body, props: { visible: true, anchor, cycleId: 1, modelValue: applied, contextKey: 'role-a' }, global: { stubs: { PerformancePopover: Popover } } })
    await flushPromises()
    const child = document.createElement('div')
    child.setAttribute('data-member-filter-layer', '')
    document.body.append(child)
    child.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('close')).toBeUndefined()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('apply')).toBeUndefined()
    child.remove(); anchor.remove()
  })
  it('keeps stable sequence node IDs when switching include-descendant semantics', async () => {
    const fields: MemberFilterField[] = [
      { ...field, key: 'job_sequence_descendants', label: '序列（筛选结果含子序列）', kind: 'sequence' },
      { ...field, key: 'job_sequence', label: '序列（筛选结果不含子序列）', kind: 'sequence' },
    ]
    vi.mocked(projectManagementApi.cycleMemberFilterOptions).mockResolvedValue({ fields })
    const wrapper = mountFilter({ logic: 'and', conditions: [{ key: fields[0].key, op: 'in', values: ['node-id'] }] })
    await flushPromises()
    wrapper.findComponent(PerformanceMemberFilterField).vm.$emit('update:modelValue', fields[1].key)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ logic: 'and', conditions: [{ key: 'job_sequence', op: 'in', values: ['node-id'] }] }])
    expect(wrapper.findComponent(PerformanceOrganizationSelect).vm.$attrs['selection-indicator']).toBe('checkmark')
  })
  it('renders current/history and configured stages as cascading fields', async () => {
    const fields: MemberFilterField[] = [
      { ...field, label: '动态评级', group: ['当前周期绩效结果'] },
      { ...field, key: 'history_rating:2:configured', label: '年度综合评级', group: ['历史周期绩效结果', '上年度'] },
      { ...field, key: 'stage:abc', label: '配置自评', group: ['环节状态'] },
    ]
    const wrapper = mount(PerformanceMemberFilterField, { props: { modelValue: fields[0].key, fields, ariaLabel: '字段' } })
    wrapper.vm.open()
    await flushPromises()
    const shell = wrapper.findComponent(PerformanceSelectShell)
    expect(shell.props('selectedItems')).toEqual([{ value: field.key, label: '当前周期绩效结果/动态评级' }])
    const groups = document.querySelectorAll('.member-filter-field__option')
    const history = [...groups].find(button => button.textContent?.includes('历史周期绩效结果')) as HTMLElement
    history.click(); await flushPromises()
    const cycle = [...document.querySelectorAll('.member-filter-field__option')].find(button => button.textContent?.includes('上年度')) as HTMLElement
    cycle.click(); await flushPromises()
    const rating = [...document.querySelectorAll('.member-filter-field__option')].find(button => button.textContent?.includes('年度综合评级')) as HTMLElement
    rating.click(); await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['history_rating:2:configured'])
  })
  it('keeps the historical results entry visible when no authorized historical field is returned', async () => {
    const wrapper = mount(PerformanceMemberFilterField, { props: { modelValue: field.key, fields: [field], ariaLabel: '字段' } })
    wrapper.vm.open(); await flushPromises()
    const history = [...document.querySelectorAll<HTMLButtonElement>('.member-filter-field__option')].find(button => button.textContent?.includes('历史周期绩效结果'))!
    history.click(); await flushPromises()
    expect(document.querySelector('.member-filter-field__empty')?.textContent).toBe('暂无可用周期')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
  it('renders every configured rating option in server order and uses a solid SVG tick', async () => {
    const options = ['1星', '2星', '3星-', '3星', '3星+', '4星', '5星'].map((label, index) => ({ label, value: `option-${index}` }))
    const wrapper = mount(PerformanceMemberFilterValue, { props: { field: { ...field, options }, modelValue: ['option-3'], cycleId: 1 } })
    wrapper.findComponent(PerformanceSelectShell).vm.openMenu(); await flushPromises()
    const candidates = [...document.querySelectorAll<HTMLButtonElement>('.member-filter-value__option')]
    expect(candidates.map(button => button.textContent?.trim())).toEqual(options.map(option => option.label))
    expect(candidates[3].querySelector('svg[data-icon="ListCheckBoldOutlined"]')?.getAttribute('width')).toBe('12')
    expect(candidates[3].textContent).not.toContain('✓')
    expect(document.querySelector('.member-filter-value__footer input[type="checkbox"]')).not.toBeNull()
  })
  it('uses the same solid tick for department and sequence tree candidates, not boxed checkboxes', async () => {
    for (const kind of ['organization', 'sequence'] as const) {
      const wrapper = mount(PerformanceMemberFilterValue, { props: { field: { ...field, kind, options: [{ value: 'node', label: '节点' }] }, modelValue: ['node'], cycleId: 1 } })
      wrapper.findComponent(PerformanceSelectShell).vm.openMenu(); await flushPromises()
      const tree = document.querySelector('.performance-organization-tree-nodes')!
      expect(tree.querySelector('input[type="checkbox"]')).toBeNull()
      expect(tree.querySelector('svg[data-icon="ListCheckBoldOutlined"]')?.getAttribute('width')).toBe('12')
      wrapper.unmount()
    }
  })
  it('places the teleported date panel above the parent filter rather than sharing its layer', () => {
    expect(dateRangeSource).toMatch(/z-index:\s*calc\(var\(--performance-popover-z-index\)\s*\+\s*1\)\s*!important/)
    expect(dateRangeSource).toContain('data-member-filter-layer')
  })
  it('uses one dual-month range picker and clears invalid or pending ranges', async () => {
    const wrapper = mount(PerformanceDateRangeField, { props: { modelValue: ['2026-01-01', '2026-02-01'] } })
    const picker = wrapper.findComponent(ElDatePicker)
    expect(picker.props('type')).toBe('daterange')
    expect(picker.props('unlinkPanels')).toBe(false)
    ;(picker.vm.$attrs.onCalendarChange as (value: unknown[]) => void)([new Date('2026-03-01'), null])
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
    picker.vm.$emit('update:modelValue', ['2026-02-30', '2026-03-01'])
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
    picker.vm.$emit('update:modelValue', ['2026-03-01', '2026-02-01'])
    await flushPromises()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([[]])
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

describe('saved member filters', () => {
  const preset = { id: 7, name: '我的条件', filters: applied }
  function mountPresets() {
    return mount(PerformanceMemberFilterPresets, { props: { cycleId: 1, contextKey: 'role-a', visible: true, filters: applied }, global: { stubs: { PerformancePopover: Popover } } })
  }
  it('reuses the actual save and regular dropdown SVG icons instead of text characters', async () => {
    const wrapper = mountPresets()
    await flushPromises()
    const buttons = wrapper.findAll('button')
    expect(buttons.find(button => button.text().includes('保存条件'))!.find('svg[data-icon="FilelinkSaveOutlined"]').attributes('width')).toBe('12')
    expect(buttons.find(button => button.text().includes('已存条件'))!.find('svg[data-icon="DownOutlined"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('＋')
    expect(wrapper.text()).not.toContain('⌄')
    expect(wrapper.find('button button').exists()).toBe(false)
  })
  it('saves validated names and the actual filter IDs, and surfaces duplicate errors', async () => {
    vi.mocked(projectManagementApi.saveCycleMemberFilterPreset).mockRejectedValueOnce({ response: { status: 409 } }).mockResolvedValueOnce(preset)
    const wrapper = mountPresets()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('保存条件'))!.trigger('click')
    const save = () => wrapper.findAll('button').find(button => button.text() === '保存')!
    await save().trigger('click')
    expect(wrapper.find('[role="alert"]').text()).toContain('必填')
    expect(projectManagementApi.saveCycleMemberFilterPreset).not.toHaveBeenCalled()
    await wrapper.find('input').setValue(preset.name)
    await save().trigger('click'); await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('名称已存在')
    await save().trigger('click'); await flushPromises()
    expect(projectManagementApi.saveCycleMemberFilterPreset).toHaveBeenLastCalledWith(1, preset.name, applied)
    expect(wrapper.text()).toContain('已存条件 (1)')
  })
  it('restores a saved filter without applying and requires confirmation to delete it', async () => {
    vi.mocked(projectManagementApi.cycleMemberFilterPresets).mockResolvedValue({ items: [preset] })
    vi.mocked(projectManagementApi.deleteCycleMemberFilterPreset).mockResolvedValue()
    const wrapper = mountPresets()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('已存条件'))!.trigger('click')
    await wrapper.findAll('button').find(button => button.text() === preset.name)!.trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual([applied])
    await wrapper.findAll('button').find(button => button.text().includes('已存条件'))!.trigger('click')
    await wrapper.find(`[aria-label="删除已存条件${preset.name}"]`).trigger('click')
    expect(projectManagementApi.deleteCycleMemberFilterPreset).not.toHaveBeenCalled()
    expect(wrapper.find('[role="alertdialog"]').text()).toContain('确认删除')
    await wrapper.findAll('button').find(button => button.text() === '保留')!.trigger('click')
    expect(projectManagementApi.deleteCycleMemberFilterPreset).not.toHaveBeenCalled()
    await wrapper.find(`[aria-label="删除已存条件${preset.name}"]`).trigger('click')
    await wrapper.findAll('button').find(button => button.text() === '删除')!.trigger('click')
    await flushPromises()
    expect(projectManagementApi.deleteCycleMemberFilterPreset).toHaveBeenCalledWith(1, 7)
    expect(wrapper.text()).toContain('已存条件 (0)')
  })
  it('does not let a save response from the previous identity populate the new scope', async () => {
    let resolve!: (value: typeof preset) => void
    vi.mocked(projectManagementApi.saveCycleMemberFilterPreset).mockReturnValueOnce(new Promise(done => { resolve = done }))
    const wrapper = mountPresets()
    await flushPromises()
    await wrapper.findAll('button').find(button => button.text().includes('保存条件'))!.trigger('click')
    await wrapper.find('input').setValue(preset.name)
    await wrapper.findAll('button').find(button => button.text() === '保存')!.trigger('click')
    await wrapper.setProps({ contextKey: 'role-b' }); await flushPromises()
    resolve(preset); await flushPromises()
    expect(wrapper.text()).toContain('已存条件 (0)')
  })
})
