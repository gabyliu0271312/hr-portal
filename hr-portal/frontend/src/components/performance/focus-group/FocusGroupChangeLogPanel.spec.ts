import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FocusGroupChangeLogPanel from './FocusGroupChangeLogPanel.vue'
import { performanceFocusGroupApi, type PerformanceFocusGroupChangeLogItem } from '@/api/performance'

vi.mock('element-plus', () => ({ ElMessage: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const managementTableStub = {
  props: ['rows', 'columns', 'loading', 'emptyText', 'page', 'pageSize', 'total', 'showPagination', 'scrollMode'],
  emits: ['page-change', 'page-size-change'],
  template: `
    <div class="management-table-stub">
      <template v-for="row in rows" :key="row.id">
        <template v-for="column in columns" :key="column.key">
          <slot name="cell" :row="row" :column="column" :value="row[column.key]" />
        </template>
      </template>
      <span v-if="!loading && !rows.length">{{ emptyText }}</span>
      <button class="stub-page" type="button" @click="$emit('page-change', 2)">next</button>
    </div>`,
}
const dialogShellStub = {
  props: ['modelValue', 'title', 'width'],
  emits: ['update:modelValue', 'close'],
  template: `<div v-if="modelValue" class="dialog-shell-stub" :data-title="title"><slot /><slot name="footer" /></div>`,
}
const uiTableStub = {
  props: ['columns', 'rows', 'loading', 'emptyText'],
  template: `<div class="ui-table-stub"><template v-for="row in rows" :key="row.employee_no"><span class="stub-person">{{ row.display_name }}</span></template></div>`,
}

function changeLogItem(overrides: Partial<PerformanceFocusGroupChangeLogItem> = {}): PerformanceFocusGroupChangeLogItem {
  return {
    id: '1-add',
    event_id: 1,
    operator: 'alice.xiao肖惠方',
    change_type: '新增',
    condition: '',
    user_ids: ['E001'],
    count: 1,
    changed_at: '2026-08-04T10:54:00',
    ...overrides,
  }
}

describe('FocusGroupChangeLogPanel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('loads change log, renders rows, and opens count detail dialog', async () => {
    const logSpy = vi.spyOn(performanceFocusGroupApi, 'changeLog').mockResolvedValue({
      total: 2,
      items: [changeLogItem(), changeLogItem({ id: '2-remove', event_id: 2, change_type: '移除', condition: '张三、李四', user_ids: ['E002', 'E003'], count: 2, changed_at: '2026-08-05T09:30:00' })],
    })
    const peopleSpy = vi.spyOn(performanceFocusGroupApi, 'changePeople').mockResolvedValue([
      { employee_no: 'E001', display_name: '甲', direct_supervisor_name: '管理员', department_2: '一级', department_5: '末级', job_family: '序列' },
    ])

    const wrapper = mount(FocusGroupChangeLogPanel, {
      props: { cycleId: 1, groupId: 8 },
      global: {
        stubs: {
          PerformanceManagementTable: managementTableStub,
          PerformanceDialogShell: dialogShellStub,
          UiTable: uiTableStub,
        },
      },
    })
    await flushPromises()

    expect(logSpy).toHaveBeenCalledWith(1, 8, 1, 10)
    expect(wrapper.findAll('.focus-group-changelog-count').length).toBe(2)
    expect(wrapper.text()).toContain('张三、李四')

    // 点变更人员数 → 弹窗请求 people
    await wrapper.find('.focus-group-changelog-count').trigger('click')
    await flushPromises()
    expect(peopleSpy).toHaveBeenCalledWith(1, 8, 1, ['E001'])
    expect(wrapper.find('.dialog-shell-stub').exists()).toBe(true)
    expect(wrapper.find('.dialog-shell-stub').attributes('data-title')).toBe('人员列表（共 1 人）')
    expect(wrapper.text()).toContain('甲')
  })

  it('renders empty state when no records', async () => {
    vi.spyOn(performanceFocusGroupApi, 'changeLog').mockResolvedValue({ total: 0, items: [] })
    const wrapper = mount(FocusGroupChangeLogPanel, {
      props: { cycleId: 1, groupId: 8 },
      global: { stubs: { PerformanceManagementTable: managementTableStub, PerformanceDialogShell: dialogShellStub, UiTable: uiTableStub } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无变更记录')
  })
})
