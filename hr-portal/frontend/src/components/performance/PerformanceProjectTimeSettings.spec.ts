import { defineComponent, h, ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PerformanceProjectFlowSettings, PerformanceWorkflowNode } from '@/api/performance'
import PerformanceProjectFlowSettingsComponent from './PerformanceProjectFlowSettings.vue'
import PerformanceProjectTimeSettings from './PerformanceProjectTimeSettings.vue'
import PerformanceDateTimeField from './PerformanceDateTimeField.vue'
import { createCalibrationPhaseId, initializeCalibrationNodes, ensureCalibrationPhaseIds, projectNodeTimeError, syncCalibrationPhaseTimes } from './performanceProjectCalibration'

const node = { node_id: 'calibration', node_type: 'calibration', name: '校准环节', order: 1 } as PerformanceWorkflowNode
const first = { start_at: '2026-10-01T09:00', end_at: '2026-10-05T18:00' }
const second = { start_at: '2026-10-06T09:00', end_at: '2026-10-10T18:00' }
function settings(): PerformanceProjectFlowSettings {
  return {
    node_settings: { calibration: { calibration: { force_distribution_enabled: false, phases: [
      { phase_id: 'first', rules: [] }, { phase_id: 'second', rules: [] },
    ] } } },
    node_times: { calibration: { start_at: first.start_at, end_at: second.end_at, phase_times: { first: { ...first }, second: { ...second } } } },
  }
}
function timeComponent(value = settings()) {
  return mount(PerformanceProjectTimeSettings, { props: { nodes: [node], nodeSettings: value.node_settings, modelValue: value.node_times } })
}

describe('calibration phase time linkage', () => {
  it('creates stable IDs without requiring crypto.randomUUID', () => {
    expect(createCalibrationPhaseId(() => 'native-id')).toBe('native-id')
    expect(createCalibrationPhaseId(null)).toMatch(/^phase-[a-z0-9]+-[a-z0-9]+$/)
  })

  it('initializes one phase for an unconfigured project without changing unrelated nodes', () => {
    const value: PerformanceProjectFlowSettings = { node_settings: {}, node_times: {} }
    initializeCalibrationNodes([node, { ...node, node_id: 'invite', node_type: 'reviewer_360_invite' }], value)
    expect(value.node_settings.calibration.calibration!.phases).toHaveLength(1)
    expect(value.node_times.calibration.phase_times).toEqual({ 'phase-1': { start_at: '', end_at: '' } })
    expect(value.node_settings.invite).toBeUndefined()
    const wrapper = timeComponent(value)
    expect(wrapper.findAllComponents(PerformanceDateTimeField)).toHaveLength(2)
    wrapper.unmount()
  })

  it('renders one date pair per phase, not per rule', () => {
    const value = settings()
    value.node_settings.calibration.calibration!.phases[0].rules = [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }]
    const wrapper = timeComponent(value)
    expect(wrapper.findAll('.calibration-time-phase h3').map(item => item.text())).toEqual(['第 1 阶段', '第 2 阶段'])
    expect(wrapper.findAllComponents(PerformanceDateTimeField)).toHaveLength(4)
    expect(wrapper.getComponent(PerformanceDateTimeField).props('modelValue')).toBe(first.start_at)
    wrapper.unmount()
  })

  it('emits phase dates and derives the enclosing node range', async () => {
    const value = settings()
    const wrapper = timeComponent(value)
    wrapper.findAllComponents(PerformanceDateTimeField)[3].vm.$emit('update:modelValue', '2026-10-12T18:00')
    await flushPromises()
    const emitted = wrapper.emitted('update:modelValue')!.at(-1)![0] as PerformanceProjectFlowSettings['node_times']
    expect(emitted.calibration.phase_times!.second.end_at).toBe('2026-10-12T18:00')
    expect(emitted.calibration.start_at).toBe(first.start_at)
    expect(emitted.calibration.end_at).toBe('2026-10-12T18:00')
    expect(value.node_times.calibration.phase_times!.second.end_at).toBe(second.end_at)
    wrapper.unmount()
  })

  it('retains surviving dates after deleting the first phase and reopens correctly', async () => {
    const value = settings()
    const wrapper = timeComponent(value)
    const next = structuredClone(value)
    next.node_settings.calibration.calibration!.phases.splice(0, 1)
    await wrapper.setProps({ nodeSettings: next.node_settings })
    expect(wrapper.findAll('.calibration-time-phase')).toHaveLength(1)
    expect(wrapper.findAllComponents(PerformanceDateTimeField)[0].props('modelValue')).toBe(second.start_at)
    const times = wrapper.emitted('update:modelValue')!.at(-1)![0] as PerformanceProjectFlowSettings['node_times']
    expect(Object.keys(times.calibration.phase_times!)).toEqual(['second'])
    expect(times.calibration.start_at).toBe(second.start_at)
    const reopened = timeComponent({ node_settings: next.node_settings, node_times: JSON.parse(JSON.stringify(times)) })
    expect(reopened.findAllComponents(PerformanceDateTimeField)[1].props('modelValue')).toBe(second.end_at)
    wrapper.unmount()
    reopened.unmount()
  })

  it('adds an empty time pair without copying dates from another phase', async () => {
    const value = settings()
    const wrapper = timeComponent(value)
    const next = structuredClone(value.node_settings)
    next.calibration.calibration!.phases.push({ phase_id: 'third', rules: [] })
    await wrapper.setProps({ nodeSettings: next })
    expect(wrapper.findAllComponents(PerformanceDateTimeField)).toHaveLength(6)
    expect(wrapper.findAllComponents(PerformanceDateTimeField)[4].props('modelValue')).toBe('')
    const times = wrapper.emitted('update:modelValue')!.at(-1)![0] as PerformanceProjectFlowSettings['node_times']
    expect(times.calibration.phase_times!.first).toEqual(first)
    expect(times.calibration.start_at).toBe('')
    wrapper.unmount()
  })

  it('migrates legacy dates only into the first phase and persists stable phase keys', () => {
    const value = settings()
    value.node_settings.calibration.calibration!.phases.forEach(phase => { delete phase.phase_id })
    value.node_times.calibration = { ...first }
    ensureCalibrationPhaseIds(value.node_settings)
    syncCalibrationPhaseTimes(value.node_settings, value.node_times)
    expect(value.node_times.calibration.phase_times).toEqual({ 'phase-1': first, 'phase-2': { start_at: '', end_at: '' } })
    value.node_settings.calibration.calibration!.phases.splice(0, 1)
    syncCalibrationPhaseTimes(value.node_settings, value.node_times)
    expect(Object.keys(value.node_times.calibration.phase_times!)).toEqual(['phase-2'])
  })

  it('links actual flow and time components through the same parent state', async () => {
    const state = ref(settings())
    const wrapper = mount(defineComponent({ setup: () => () => [
      h(PerformanceProjectFlowSettingsComponent, { nodes: [node], modelValue: state.value, 'onUpdate:modelValue': value => { state.value = value } }),
      h(PerformanceProjectTimeSettings, { nodes: [node], nodeSettings: state.value.node_settings, modelValue: state.value.node_times, 'onUpdate:modelValue': value => { state.value.node_times = value } }),
    ] }))
    await wrapper.get('.add-phase').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.calibration-time-phase')).toHaveLength(3)
    const addedId = state.value.node_settings.calibration.calibration!.phases[2].phase_id!
    expect(state.value.node_times.calibration.phase_times![addedId]).toEqual({ start_at: '', end_at: '' })
    await wrapper.findAll('.phase-heading .performance-icon-button')[0].trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.calibration-time-phase')).toHaveLength(2)
    expect(state.value.node_times.calibration.phase_times!.second).toEqual(second)
    expect(state.value.node_times.calibration.phase_times!.first).toBeUndefined()
    wrapper.unmount()
  })

  it('rejects incomplete or reversed phases and labels the offending phase', () => {
    const value = settings()
    expect(projectNodeTimeError([node], value)).toBe('')
    value.node_times.calibration.phase_times!.second.end_at = ''
    expect(projectNodeTimeError([node], value)).toContain('第 2 阶段')
    value.node_times.calibration.phase_times!.second.end_at = second.start_at
    expect(projectNodeTimeError([node], value)).toContain('截止时间必须晚于开始时间')
    const wrapper = timeComponent(value)
    expect(wrapper.get('.phase-time-error').text()).toBe('截止时间必须晚于开始时间')
    expect(wrapper.findAllComponents(PerformanceDateTimeField)[3].props('invalid')).toBe(true)
    wrapper.unmount()
  })

  it('compares timestamps instead of mixing local and UTC string order', () => {
    const value = settings()
    value.node_times.calibration.phase_times!.second = { start_at: '2026-10-06T09:00+08:00', end_at: '2026-10-06T02:00Z' }
    expect(projectNodeTimeError([node], value)).toBe('')
    syncCalibrationPhaseTimes(value.node_settings, value.node_times)
    expect(value.node_times.calibration.end_at).toBe('2026-10-06T02:00Z')
  })

  it('preserves phase dates when phases are reordered', () => {
    const value = settings()
    value.node_settings.calibration.calibration!.phases.reverse()
    syncCalibrationPhaseTimes(value.node_settings, value.node_times)
    const wrapper = timeComponent(value)
    expect(wrapper.findAllComponents(PerformanceDateTimeField)[0].props('modelValue')).toBe(second.start_at)
    expect(wrapper.findAllComponents(PerformanceDateTimeField)[2].props('modelValue')).toBe(first.start_at)
    wrapper.unmount()
  })

  it('retains loading, error, and empty states', async () => {
    const wrapper = mount(PerformanceProjectTimeSettings, { props: { nodes: [], loading: true } })
    expect(wrapper.text()).toContain('正在加载流程节点')
    await wrapper.setProps({ loading: false, error: '加载失败' })
    expect(wrapper.get('[role=alert]').text()).toBe('加载失败')
    await wrapper.setProps({ error: '' })
    expect(wrapper.text()).toContain('当前绩效模板暂无流程环节')
    wrapper.unmount()
  })

  it('preserves ordinary nodes and result-view date controls', () => {
    const nodes = ['evaluation', 'result_view', 'result_reconsideration'].map((type, index) => ({ ...node, node_id: type, node_type: type, order: index + 1 }))
    const wrapper = mount(PerformanceProjectTimeSettings, { props: { nodes } })
    expect(wrapper.findAllComponents(PerformanceDateTimeField)).toHaveLength(5)
    expect(wrapper.find('.calibration-time-phase').exists()).toBe(false)
    wrapper.unmount()
  })
})
