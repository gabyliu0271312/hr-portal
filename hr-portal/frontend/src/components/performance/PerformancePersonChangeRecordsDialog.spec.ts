import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PerformancePersonChangeRecordsDialog from './PerformancePersonChangeRecordsDialog.vue'

const listPersonChangeRecords = vi.fn()

vi.mock('@/api/performance', () => ({
  performanceCycleApi: { listPersonChangeRecords: (...args: unknown[]) => listPersonChangeRecords(...args) },
}))

const stubs = {
  'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" role="dialog"><h2>{{ title }}</h2><slot /><slot name="footer" /></div>' },
  'el-empty': { props: ['description'], template: '<div class="empty">{{ description }}</div>' },
  'el-timeline': { template: '<div class="timeline"><slot /></div>' },
  'el-timeline-item': { props: ['timestamp', 'type', 'placement'], template: '<div class="timeline-item"><span class="ts">{{ timestamp }}</span><slot /></div>' },
  'el-button': { emits: ['click'], template: '<button @click="$emit(\'click\')"><slot /></button>' },
}

function mountDialog() {
  return mount(PerformancePersonChangeRecordsDialog, {
    props: { modelValue: false, cycleId: 1, employeeNo: 'E001', employeeName: '张三' },
    global: { stubs, directives: { loading: {} } },
  })
}

describe('PerformancePersonChangeRecordsDialog', () => {
  beforeEach(() => {
    listPersonChangeRecords.mockReset()
  })

  it('loads records when opened and renders before → after per changed field', async () => {
    listPersonChangeRecords.mockResolvedValue([
      {
        event_id: 7,
        event_at: '2026-11-04T02:10:00+00:00',
        event_type: 'PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED',
        actor_type: 'PORTAL_USER',
        actor_ref: '12',
        changes: [
          { employee_no: 'E001', field: 'job_family', label: '职类（序列）', before: '技术', after: '产品' },
          { employee_no: 'E001', field: 'position_level', label: '职位层级（职级）', before: null, after: 'P6' },
        ],
      },
    ])
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(listPersonChangeRecords).toHaveBeenCalledWith(1, 'E001')
    const text = wrapper.text()
    expect(text).toContain('人员变更记录')
    expect(text).toContain('更新人员信息')
    expect(text).toContain('职类（序列）')
    expect(text).toContain('技术 → 产品')
    expect(text).toContain('（空） → P6')
  })

  it('shows the empty state when the person has no change records', async () => {
    listPersonChangeRecords.mockResolvedValue([])
    const wrapper = mountDialog()
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()
    await Promise.resolve()

    expect(wrapper.text()).toContain('暂无更新记录')
  })
})
