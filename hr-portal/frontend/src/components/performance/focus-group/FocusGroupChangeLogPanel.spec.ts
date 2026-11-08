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
      <span class="stub-total">{{ total }}</span>
    </div>`,
}
const peopleDialogStub = {
  props: ['modelValue', 'title', 'subtitle', 'rows', 'total', 'loading', 'error', 'loadFn'],
  emits: ['update:modelValue'],
  template: `<div v-if="modelValue" class="people-dialog-stub" :data-title="title" :data-subtitle="subtitle"><span class="stub-person" v-for="row in rows" :key="row.employee_no">{{ row.display_name }}</span><span class="stub-total">{{ total }}</span></div>`,
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
    const peopleSpy = vi.spyOn(performanceFocusGroupApi, 'changePeople').mockResolvedValue({
      total: 1,
      items: [{ employee_no: 'E001', display_name: '甲', direct_supervisor_name: '管理员', department_2: '一级', department_5: '末级', job_family: '序列' }],
    })

    const wrapper = mount(FocusGroupChangeLogPanel, {
      props: { cycleId: 1, groupId: 8 },
      global: {
        stubs: {
          PerformanceManagementTable: managementTableStub,
          FocusGroupPeopleDialog: peopleDialogStub,
        },
      },
    })
    await flushPromises()

    expect(logSpy).toHaveBeenCalledWith(1, 8, 1, 10)
    expect(wrapper.findAll('.focus-group-changelog-count').length).toBe(2)
    expect(wrapper.text()).toContain('张三、李四')

    // 点变更人员数 → 弹窗请求 people（分页参数）
    await wrapper.find('.focus-group-changelog-count').trigger('click')
    await flushPromises()
    expect(peopleSpy).toHaveBeenCalledWith(1, 8, 1, ['E001'], 1, 10, '')
    const dialog = wrapper.find('.people-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-title')).toBe('人员列表')
    expect(wrapper.text()).toContain('甲')
  })

  it('renders empty state when no records', async () => {
    vi.spyOn(performanceFocusGroupApi, 'changeLog').mockResolvedValue({ total: 0, items: [] })
    const wrapper = mount(FocusGroupChangeLogPanel, {
      props: { cycleId: 1, groupId: 8 },
      global: { stubs: { PerformanceManagementTable: managementTableStub, FocusGroupPeopleDialog: peopleDialogStub } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('暂无变更记录')
  })
})
