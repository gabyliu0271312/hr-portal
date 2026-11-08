import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusGroupMembersPanel from './FocusGroupMembersPanel.vue'
import { performanceFocusGroupApi, type PerformanceFocusGroupMember } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const managementTableStub = {
  props: ['rows', 'columns', 'loading', 'emptyText', 'selectable', 'scrollMode'],
  emits: [],
  template: `
    <div class="management-table-stub">
      <template v-for="row in rows" :key="row.value">
        <template v-for="column in columns" :key="column.key">
          <slot name="cell" :row="row" :column="column" :value="row[column.key]" />
        </template>
      </template>
      <span v-if="!loading && !rows.length">{{ emptyText }}</span>
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
  template: '<div v-if="modelValue" class="confirm-dialog-stub" :data-message="message"><slot name="check" /><button class="confirm-ok" @click="$emit(\'confirm\')">确认</button></div>',
}
const addDialogStub = {
  props: ['modelValue', 'cycleId', 'groupId', 'currentEmployeeNos'],
  emits: ['update:modelValue', 'added'],
  template: '<div v-if="modelValue" class="add-dialog-stub"><button class="add-ok" @click="$emit(\'added\'); $emit(\'update:modelValue\', false)">确定</button></div>',
}

function member(overrides: Partial<PerformanceFocusGroupMember> = {}): PerformanceFocusGroupMember {
  return {
    value: 'E001',
    label: '甲',
    sub_label: 'E001 · 部门A',
    department: '部门A',
    display_name: '甲',
    direct_supervisor_employee_no: null,
    direct_supervisor_name: null,
    department_2: '一级',
    department_5: '末级',
    job_family: '序列',
    added_by: null,
    added_at: null,
    ...overrides,
  }
}

describe('FocusGroupMembersPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads members, renders remove confirm with exact copy, removes on confirm', async () => {
    const membersSpy = vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 8, employee_nos: ['E001'], people: [member()] })
    const updateSpy = vi.spyOn(performanceFocusGroupApi, 'updateMembers').mockResolvedValue({ group_id: 8, employee_nos: [], people: [] })

    const wrapper = mount(FocusGroupMembersPanel, {
      props: { cycleId: 1, groupId: 8, groupName: '重点人员', maintainable: true },
      global: {
        stubs: {
          PerformanceManagementTable: managementTableStub,
          PerformanceSearchInput: searchInputStub,
          PerformanceConfirmDialog: confirmDialogStub,
          FocusGroupMemberAddDialog: addDialogStub,
          UiButton: { props: ['variant'], emits: ['click'], template: '<button class="ui-button" :data-variant="variant" @click="$emit(\'click\', $event)"><slot /></button>' },
        },
      },
    })
    await flushPromises()

    expect(membersSpy).toHaveBeenCalledWith(1, 8)
    expect(wrapper.text()).toContain('甲')

    // 移除确认弹窗：用户指定文案「确定要将 {displayname} 从人员组移除嘛」
    await wrapper.find('.focus-group-members-row-action').trigger('click')
    const dialog = wrapper.find('.confirm-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-message')).toBe('确定要将 甲 从人员组移除嘛')

    await dialog.find('.confirm-ok').trigger('click')
    await flushPromises()
    expect(updateSpy).toHaveBeenCalledWith(1, 8, [])
  })

  it('renders empty state 暂无人员', async () => {
    vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 8, employee_nos: [], people: [] })
    const wrapper = mount(FocusGroupMembersPanel, {
      props: { cycleId: 1, groupId: 8, groupName: '重点人员' },
      global: { stubs: { PerformanceManagementTable: managementTableStub, PerformanceSearchInput: searchInputStub, PerformanceConfirmDialog: confirmDialogStub, FocusGroupMemberAddDialog: addDialogStub, UiButton: { template: '<button class="ui-button"><slot /></button>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无人员')
  })

  it('renders 添加时间 -- 和 添加人 -- for legacy members', async () => {
    vi.spyOn(performanceFocusGroupApi, 'members').mockResolvedValue({ group_id: 8, employee_nos: ['E001'], people: [member({ added_by: null, added_at: null })] })
    const wrapper = mount(FocusGroupMembersPanel, {
      props: { cycleId: 1, groupId: 8, groupName: '重点人员' },
      global: { stubs: { PerformanceManagementTable: managementTableStub, PerformanceSearchInput: searchInputStub, PerformanceConfirmDialog: confirmDialogStub, FocusGroupMemberAddDialog: addDialogStub, UiButton: { template: '<button class="ui-button"><slot /></button>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('--')
  })
})
