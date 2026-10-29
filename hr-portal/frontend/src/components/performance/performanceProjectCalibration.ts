import type { PerformanceProjectFlowSettings, PerformanceProjectNodeTime, PerformanceWorkflowNode } from '@/api/performance'

type NodeSettings = PerformanceProjectFlowSettings['node_settings']
type Phase = NonNullable<NodeSettings[string]['calibration']>['phases'][number]

export function createCalibrationPhaseId(randomUUID: (() => string) | null = globalThis.crypto?.randomUUID?.bind(globalThis.crypto) ?? null) {
  return randomUUID ? randomUUID() : `phase-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function calibrationPhaseKey(phase: Phase, index: number) { return phase.phase_id || `phase-${index + 1}` }

export function initializeCalibrationNodes(nodes: PerformanceWorkflowNode[], settings: PerformanceProjectFlowSettings) {
  for (const node of nodes) {
    if (node.node_type !== 'calibration') continue
    const key = node.node_id || `${node.node_type}-${node.order}`
    const setting = settings.node_settings[key] ||= {}
    setting.calibration ||= { force_distribution_enabled: false, distribution: { mode: 'UNIFIED', rules: [], scope_configured: false }, phases: [] }
    setting.calibration.distribution ||= { mode: 'UNIFIED', rules: [], scope_configured: false }
    if (!setting.calibration.phases.length) setting.calibration.phases.push({ rules: [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] })
  }
  ensureCalibrationPhaseIds(settings.node_settings)
  syncCalibrationPhaseTimes(settings.node_settings, settings.node_times)
}

export function ensureCalibrationPhaseIds(settings: NodeSettings) {
  Object.values(settings).forEach(setting => setting.calibration?.phases.forEach((phase, index) => { phase.phase_id ||= calibrationPhaseKey(phase, index) }))
}

export function syncCalibrationPhaseTimes(settings: NodeSettings, times: Record<string, PerformanceProjectNodeTime>) {
  for (const [nodeId, setting] of Object.entries(settings)) {
    const phases = setting.calibration?.phases
    if (!phases?.length) continue
    const time = times[nodeId] ||= { start_at: '', end_at: '' }
    const legacy = !time.phase_times
    const phaseTimes = time.phase_times ||= {}
    const ids = phases.map(calibrationPhaseKey)
    for (const id of Object.keys(phaseTimes)) { if (!ids.includes(id)) delete phaseTimes[id] }
    ids.forEach((id, index) => {
      phaseTimes[id] ||= { start_at: legacy && index === 0 ? time.start_at : '', end_at: legacy && index === 0 ? time.end_at : '' }
    })
    const ranges = ids.map(id => phaseTimes[id])
    const complete = ranges.every(range => range.start_at && range.end_at && Number.isFinite(Date.parse(range.start_at)) && Number.isFinite(Date.parse(range.end_at)))
    time.start_at = complete ? ranges.reduce((first, range) => Date.parse(range.start_at) < Date.parse(first) ? range.start_at : first, ranges[0].start_at) : ''
    time.end_at = complete ? ranges.reduce((last, range) => Date.parse(range.end_at) > Date.parse(last) ? range.end_at : last, ranges[0].end_at) : ''
  }
}

export function projectNodeTimeError(nodes: PerformanceWorkflowNode[], settings: PerformanceProjectFlowSettings) {
  for (const node of nodes) {
    const key = node.node_id || `${node.node_type}-${node.order}`
    const time = settings.node_times[key]
    const phases = settings.node_settings[key]?.calibration?.phases
    if (node.node_type === 'calibration' && phases?.length) {
      for (const [index, phase] of phases.entries()) {
        const range = time?.phase_times?.[calibrationPhaseKey(phase, index)]
        const error = rangeError(range?.start_at, range?.end_at, `${node.name}第 ${index + 1} 阶段`)
        if (error) return error
      }
    } else if (node.node_type === 'result_view') {
      const error = rangeError(time?.start_at, time?.appeal_deadline, node.name, '发起复议截止时间')
      if (error) return error
    } else if (node.node_type === 'result_reconsideration') {
      if (!time?.end_at) return `${node.name}的处理复议截止时间不能为空`
      if (!Number.isFinite(Date.parse(time.end_at))) return `${node.name}的处理复议截止时间格式不正确`
    } else {
      const error = rangeError(time?.start_at, time?.end_at, node.name)
      if (error) return error
    }
  }
  return ''
}

function rangeError(start: string | undefined, end: string | undefined, label: string, endLabel = '截止时间') {
  if (!start || !end) return `${label}的开始时间和${endLabel}不能为空`
  if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) return `${label}的时间格式不正确`
  if (Date.parse(end) <= Date.parse(start)) return `${label}的${endLabel}必须晚于开始时间`
  return ''
}
