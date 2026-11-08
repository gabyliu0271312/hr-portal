import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FrontFocusGroupManagementDialog from './FrontFocusGroupManagementDialog.vue'
import { performanceFocusGroupApi, type PerformanceFocusGroupMember, type PerformanceFocusGroupOverview } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const lineTabsStub = {
  props: ['modelValue', 'tabs'],
  emits: ['update:modelValue'],
  template: `
    <div class="line-tabs-stub">
      <button v-for="tab in tabs" :key="tab.key" class="line-tab" :class="{ active: tab.key === modelValue }" @click="$emit('update:modelValue', tab.key)">{{ tab.label }}</button>
      <slot />
    </div>`,
}
const managementTableStub = {
  props: ['rows', 'columns', 'loading', 'emptyText', 'total', 'page', 'pageSize'],
  emits: ['page-change', 'page-size-change'],
  template: `
    <div class="management-table-stub">
      <template v-for="row in rows" :key="row.value">
        <template v-for="column in columns" :key="column.key">
          <slot name="cell" :row="row" :column="column" :value="row[column.key]" />
        </template>
      </template>
      <span class="table-total">{{ total }}</span>
      <span v-if="!loading && !rows.length"><slot name="empty" :loading="loading" :text="emptyText" /></span>
      <button class="page-next" @click="$emit('page-change', page + 1)">下一页</button>
    </div>`,
}
const searchInputStub = {
  props: ['modelValue'],
  emits: ['update:modelValue', 'search', 'clear'],
  template: '<input class="search-input" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'search\')" />',
}
const confirmDialogStub = {
  props: ['modelValue', 'message', 'loading'],
  emits: ['update:modelValue', 'confirm'],
  template: '<div v-if="modelValue" class="confirm-dialog-stub" :data-message="message"><button class="confirm-ok" @click="$emit(\'confirm\')">确认</button></div>',
}
const addDialogStub = {
  props: ['modelValue', 'cycleId', 'groupId', 'currentEmployeeNos'],
  emits: ['update:modelValue', 'added'],
  template: '<div v-if="modelValue" class="add-dialog-stub"><button class="add-ok" @click="$emit(\'added\'); $emit(\'update:modelValue\', false)">确定</button></div>',
}

function member(overrides: Partial<PerformanceFocusGroupMember> = {}): PerformanceFocusGroupMember {
  return {
    value: 'E001', label: '甲', sub_label: 'E001 · 部门A', department: '部门A', display_name: '甲',
    direct_supervisor_employee_no: null, direct_supervisor_name: null, department_2: '二级', department_5: '末级',
    job_family: '序列', job_category: '研发', job_sequence: '序列-研发', added_by: null, added_at: null, ...overrides,
  }
}

const overview: PerformanceFocusGroupOverview = {
  can_show: true,
  groups: [
    { id: 1, name: '核心管理干部', tab: 'semester', count: 2, scope_setting_mode: 1, activity_names: [] },
    { id: 2, name: '12', tab: 'project', count: 1, scope_setting_mode: 1, activity_names: ['2026年半年度绩效评估'] },
  ],
}

const stubs = {
  PerformanceLineTabs: lineTabsStub,
  PerformanceManagementTable: managementTableStub,
  PerformanceSearchInput: searchInputStub,
  PerformanceConfirmDialog: confirmDialogStub,
  FocusGroupFrontMemberAddDialog: addDialogStub,
  MetricTemplateEmptyIllustration: { template: '<svg class="empty-illustration" />' },
  UiButton: { props: ['variant'], emits: ['click'], template: '<button class="ui-button" :data-variant="variant" @click="$emit(\'click\', $event)"><slot /></button>' },
}

describe('FrontFocusGroupManagementDialog', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads overview + members, renders group tabs, pagination total, and remove', async () => {
    const overviewSpy = vi.spyOn(performanceFocusGroupApi, 'overview').mockResolvedValue(overview)
    const membersSpy = vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 1, employee_nos: ['E001'], people: [member()], total: 1 })

    const wrapper = mount(FrontFocusGroupManagementDialog, {
      props: { modelValue: true, cycleId: 7, teleport: false },
      global: { stubs },
    })
    await flushPromises()

    expect(overviewSpy).toHaveBeenCalledWith(7)
    // Tab = 人员组列表（组名）
    expect(wrapper.findAll('.line-tab').map(tab => tab.text())).toEqual(['核心管理干部', '12'])
    expect(membersSpy).toHaveBeenCalledWith(7, 1, { current: 1, size: 10, keyword: undefined })
    expect(wrapper.text()).toContain('甲')
    expect(wrapper.find('.table-total').text()).toBe('1')
    // 手动组（scope_setting_mode=1）：可添加可移除
    expect(wrapper.find('.ui-button[data-variant="primary"]').text()).toBe('添加')
  })

  it('switches tab → loads that group members with pagination params', async () => {
    vi.spyOn(performanceFocusGroupApi, 'overview').mockResolvedValue(overview)
    const membersSpy = vi.spyOn(performanceFocusGroupApi, 'members')
      .mockResolvedValueOnce({ group_id: 1, employee_nos: ['E001'], people: [member()], total: 1 })
      .mockResolvedValueOnce({ group_id: 2, employee_nos: ['E002'], people: [member({ value: 'E002', label: '乙', display_name: '乙' })], total: 1 })

    const wrapper = mount(FrontFocusGroupManagementDialog, {
      props: { modelValue: true, cycleId: 7, teleport: false },
      global: { stubs },
    })
    await flushPromises()
    await wrapper.findAll('.line-tab')[1].trigger('click')
    await flushPromises()

    expect(membersSpy).toHaveBeenLastCalledWith(7, 2, { current: 1, size: 10, keyword: undefined })
    expect(wrapper.text()).toContain('乙')
  })

  it('renders project hint with activity names and hides 添加 for non-manual groups', async () => {
    vi.spyOn(performanceFocusGroupApi, 'overview').mockResolvedValue(overview)
    vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 1, employee_nos: [], people: [], total: 0 })

    const wrapper = mount(FrontFocusGroupManagementDialog, {
      props: { modelValue: true, cycleId: 7, teleport: false },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.find('.front-fg-dialog__hint').text()).toContain('仅可查看你有权限的人员组成员')
    expect(wrapper.find('.front-fg-dialog__hint--project').exists()).toBe(false)
  })

  it('renders empty state 暂无人员 via empty illustration', async () => {
    vi.spyOn(performanceFocusGroupApi, 'overview').mockResolvedValue(overview)
    vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 1, employee_nos: [], people: [], total: 0 })
    const wrapper = mount(FrontFocusGroupManagementDialog, {
      props: { modelValue: true, cycleId: 7, teleport: false },
      global: { stubs },
    })
    await flushPromises()
    expect(wrapper.find('.empty-illustration').exists()).toBe(true)
    expect(wrapper.text()).toContain('暂无人员')
  })

  it('adds member via add dialog and reloads', async () => {
    vi.spyOn(performanceFocusGroupApi, 'overview').mockResolvedValue(overview)
    const membersSpy = vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 1, employee_nos: ['E001'], people: [member()], total: 1 })
    const wrapper = mount(FrontFocusGroupManagementDialog, {
      props: { modelValue: true, cycleId: 7, teleport: false },
      global: { stubs },
    })
    await flushPromises()
    await wrapper.find('.ui-button[data-variant="primary"]').trigger('click')
    expect(wrapper.find('.add-dialog-stub').exists()).toBe(true)
    await wrapper.find('.add-dialog-stub .add-ok').trigger('click')
    await flushPromises()
    expect(membersSpy).toHaveBeenCalledTimes(2)
  })
})
