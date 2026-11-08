import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformanceScopeCount from './PerformanceScopeCount.vue'
import { performanceFocusGroupApi } from '@/api/performance'

vi.mock('@/api/performance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/performance')>()
  return {
    ...actual,
    performanceFocusGroupApi: {
      resolveScope: vi.fn(),
    },
  }
})

const peopleDialogStub = {
  props: ['modelValue', 'title', 'subtitle', 'rows', 'total', 'loading', 'error'],
  emits: ['update:modelValue'],
  template: '<div v-if="modelValue" class="people-dialog-stub" :data-title="title" :data-subtitle="subtitle" :data-rows="rows.length">{{ title }} {{ subtitle }} {{ rows.length }}</div>',
}

const defaultSlot = `
  <template #default="{ counts, loading, open }">
    <div class="slot-capture">
      counts={{ counts.join(',') }} loading={{ loading }}
      <button class="group-open" type="button" @click="open(0)">open</button>
    </div>
  </template>`

const groupRow = {
  employee_no: 'E001', display_name: '张三', direct_supervisor_name: '李四',
  organization_ref: '/技术中台/研发部', department_2: '技术中台', job_family: '研发',
}

const resolvedOnce = {
  task_id: 'task-1', status: 2, selected_count: 3, group_counts: [2], group_peoples: [[groupRow]],
}

function mountCount(props = {}) {
  return mount(PerformanceScopeCount, {
    props: {
      cycleId: 1,
      groups: [{ conditions: [{ field: 'department', operator: 'include', values: ['D1'] }] }],
      enabled: true,
      ...props,
    },
    slots: { default: defaultSlot },
    global: { stubs: { FocusGroupPeopleDialog: peopleDialogStub } },
  })
}

/** 推进 debounce(200) + 首轮 poll(250)，让轮询完成 */
async function settle() {
  await vi.advanceTimersByTimeAsync(200)
  await flushPromises()
  await vi.advanceTimersByTimeAsync(250)
  await flushPromises()
}

describe('PerformanceScopeCount', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.useFakeTimers()
    vi.mocked(performanceFocusGroupApi.resolveScope)
      .mockReset()
      .mockResolvedValueOnce({ task_id: 'task-1', status: 1 } as any)
      .mockResolvedValueOnce(resolvedOnce as any)
  })

  it('renders total count line and exposes group counts via default slot', async () => {
    const wrapper = mountCount()
    await settle()
    expect(wrapper.text()).toContain('符合条件的人员，共 3 人')
    expect(wrapper.find('.slot-capture').text()).toContain('counts=2')
  })

  it('total count number greyed when zero while label stays normal', async () => {
    vi.mocked(performanceFocusGroupApi.resolveScope)
      .mockReset()
      .mockResolvedValueOnce({ task_id: 'task-1', status: 1 } as any)
      .mockResolvedValueOnce({ task_id: 'task-1', status: 2, selected_count: 0, group_counts: [0], group_peoples: [[]] } as any)
    const wrapper = mountCount()
    await settle()
    expect(wrapper.text()).toContain('符合条件的人员，共 0 人')
    expect(wrapper.find('.performance-scope-count__num').classes()).not.toContain('performance-scope-count__num--active')
  })

  it('does not trigger resolve when disabled', async () => {
    const wrapper = mountCount({ enabled: false })
    await settle()
    expect(performanceFocusGroupApi.resolveScope).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('符合条件的人员，共 0 人')
    expect(wrapper.find('.performance-scope-count__num').classes()).not.toContain('performance-scope-count__num--active')
  })

  it('opens group people dialog with resolved rows on group count click', async () => {
    const wrapper = mountCount()
    await settle()
    await wrapper.find('.group-open').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('.people-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-title')).toBe('人员列表')
    expect(dialog.attributes('data-subtitle')).toBe('条件组 1')
    expect(dialog.attributes('data-rows')).toBe('1')
  })

  it('opens total people dialog with employee count description', async () => {
    const wrapper = mountCount()
    await settle()
    await wrapper.find('.performance-scope-count__total').trigger('click')
    await flushPromises()
    const dialog = wrapper.find('.people-dialog-stub')
    expect(dialog.exists()).toBe(true)
    expect(dialog.attributes('data-subtitle')).toBe('符合条件的员工，共计 3 人')
  })
})
