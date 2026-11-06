import type { PerformanceCalibrationOperation, PerformanceProjectEditingPolicy, PerformanceProjectPatch, PerformanceProject, PerformanceProjectPayload, PerformanceProjectFlowSettings, PerformanceProjectNodeTime, PerformanceWorkflowNode } from '@/api/performance'
import { isReviewer360Node } from './performanceExecutorOptions'
import { shanghaiLocalToUtcIso, utcToShanghaiLocal } from '@/utils/datetime'

export type ProjectEditingPolicy = PerformanceProjectEditingPolicy
export type CalibrationOperation = PerformanceCalibrationOperation
export type ProjectSettingsResponse = PerformanceProject
export type ProjectSettingsPatch = PerformanceProjectPatch

export function projectSettingsEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => projectSettingsEqual(value, b[index]))
  const left = Object.keys(a).filter(key => (a as any)[key] !== undefined)
  const right = Object.keys(b).filter(key => (b as any)[key] !== undefined)
  return left.length === right.length && left.every(key => right.includes(key) && projectSettingsEqual((a as any)[key], (b as any)[key]))
}

export function mergeProjectDisplayChanges<T>(raw: T, baseline: any, current: any): T {
  if (projectSettingsEqual(baseline, current)) return raw
  if (!current || typeof current !== 'object' || Array.isArray(current) || !baseline || typeof baseline !== 'object' || Array.isArray(baseline)) return current
  const merged: Record<string, any> = { ...(raw as any || {}) }
  for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
    if (projectSettingsEqual(baseline[key], current[key])) continue
    if (!(key in current)) delete merged[key]
    else merged[key] = mergeProjectDisplayChanges((raw as any)?.[key], baseline[key], current[key])
  }
  return merged as T
}

export function changedProjectSettings(raw: PerformanceProjectPayload, baseline: PerformanceProjectPayload, current: PerformanceProjectPayload): ProjectSettingsPatch {
  const patch: ProjectSettingsPatch = {}
  for (const key of Object.keys(current) as Array<keyof PerformanceProjectPayload>) {
    if (!projectSettingsEqual(baseline[key], current[key])) (patch as any)[key] = mergeProjectDisplayChanges(raw[key], baseline[key], current[key])
  }
  return patch
}

export function projectFlowWithUtcTimes(settings: PerformanceProjectFlowSettings): PerformanceProjectFlowSettings {
  const value = JSON.parse(JSON.stringify(settings)) as PerformanceProjectFlowSettings
  for (const time of Object.values(value.node_times)) {
    for (const field of ['start_at', 'end_at', 'appeal_deadline'] as const) if (time[field]) time[field] = /[zZ]|[+-]\d{2}:?\d{2}$/.test(time[field]!) ? time[field] : shanghaiLocalToUtcIso(time[field]) || time[field]
    for (const phase of Object.values(time.phase_times || {})) for (const field of ['start_at', 'end_at'] as const) if (phase[field]) phase[field] = /[zZ]|[+-]\d{2}:?\d{2}$/.test(phase[field]) ? phase[field] : shanghaiLocalToUtcIso(phase[field]) || phase[field]
  }
  return value
}

export function projectFlowWithLocalTimes(settings: PerformanceProjectFlowSettings): PerformanceProjectFlowSettings {
  const value = JSON.parse(JSON.stringify(settings)) as PerformanceProjectFlowSettings
  for (const time of Object.values(value.node_times)) {
    for (const field of ['start_at', 'end_at', 'appeal_deadline'] as const) if (time[field]) time[field] = utcToShanghaiLocal(time[field]) || time[field]
    for (const phase of Object.values(time.phase_times || {})) for (const field of ['start_at', 'end_at'] as const) if (phase[field]) phase[field] = utcToShanghaiLocal(phase[field]) || phase[field]
  }
  return value
}

export function initializeProjectFlow(nodes: PerformanceWorkflowNode[], settings: PerformanceProjectFlowSettings) {
  initializeCalibrationNodes(nodes, settings)
  const first360 = nodes.find(isReviewer360Node)
  for (const node of nodes) {
    const key = node.node_id || `${node.node_type}-${node.order}`
    const setting = settings.node_settings[key] ||= {}
    if (node === first360) setting.invite ||= { default_invite: 'DIRECT_SUBORDINATES', minimum_invited_count: 5, exclude_default_invite_from_limit: true, recommended_invite: [], allow_voluntary_evaluation: false }
    if (node.node_type === 'result_view') setting.result_view ||= { automatic_enabled: false, manual_enabled: false, automatic_rule: 'PREVIOUS_AND_START' }
    if (node.node_type === 'result_reconsideration') {
      const saved = setting.result_reconsideration as { handler?: string; handler_employee_nos?: string[] } | undefined
      setting.result_reconsideration = { ...saved, handler_employee_nos: saved?.handler_employee_nos || (saved?.handler ? [saved.handler] : []) }
      delete (setting.result_reconsideration as any).handler
    }
    settings.node_times[key] ||= { start_at: '', end_at: '', ...(node.node_type === 'result_view' ? { appeal_deadline: '' } : {}) }
    if (node.node_type === 'result_view') settings.node_times[key].appeal_deadline ??= ''
  }
}

export function calibrationOperations(baseline: PerformanceProjectFlowSettings, current: PerformanceProjectFlowSettings): CalibrationOperation[] {
  const operations: CalibrationOperation[] = []
  for (const nodeId of new Set([...Object.keys(baseline.node_settings), ...Object.keys(current.node_settings)])) {
    const oldPhases = baseline.node_settings[nodeId]?.calibration?.phases || []
    const phases = current.node_settings[nodeId]?.calibration?.phases || []
    const oldIds = oldPhases.map(calibrationPhaseKey)
    const ids = phases.map(calibrationPhaseKey)
    oldPhases.forEach((phase, index) => { if (!ids.includes(oldIds[index])) operations.push({ operation: 'delete_phase', node_id: nodeId, phase_id: oldIds[index] }) })
    phases.forEach((phase, index) => {
      const phaseId = ids[index]
      const oldIndex = oldIds.indexOf(phaseId)
      if (oldIndex === -1) { operations.push({ operation: 'add_phase', node_id: nodeId, phase_id: phaseId }); return }
      const oldRules = oldPhases[oldIndex].rules as Array<{ rule_id?: string }>
      const rules = phase.rules as Array<{ rule_id?: string }>
      oldRules.forEach(rule => { if (rule.rule_id && !rules.some(item => item.rule_id === rule.rule_id)) operations.push({ operation: 'delete_rule', node_id: nodeId, phase_id: phaseId, rule_id: rule.rule_id }) })
      rules.forEach(rule => { if (rule.rule_id && !oldRules.some(item => item.rule_id === rule.rule_id)) operations.push({ operation: 'add_rule', node_id: nodeId, phase_id: phaseId, rule_id: rule.rule_id }) })
    })
  }
  return operations
}

export function calibrationHasNewPhases(baseline: PerformanceProjectFlowSettings, current: PerformanceProjectFlowSettings) {
  return calibrationOperations(baseline, current).some(operation => operation.operation === 'add_phase')
}

export function calibrationSavedTimestamp(value?: string) {
  return value ? Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`) : NaN
}


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
    setting.calibration.phases.forEach(phase => { if (!phase.rules?.length) phase.rules = [{ subject_type: 'PERSON', operator: 'INCLUDE', scope: 'PROJECT_ALL', allow_authorize: false }] })
  }
  ensureCalibrationPhaseIds(settings.node_settings)
  syncCalibrationPhaseTimes(settings.node_settings, settings.node_times)
}

export function ensureCalibrationPhaseIds(settings: NodeSettings) {
  Object.values(settings).forEach(setting => setting.calibration?.phases.forEach((phase, index) => { phase.phase_id ||= calibrationPhaseKey(phase, index) }))
}

export function createCalibrationRuleId() {
  return globalThis.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, value => {
    const random = Math.floor(Math.random() * 16)
    return (value === 'x' ? random : (random & 3) | 8).toString(16)
  })
}

export function syncCalibrationPhaseTimes(settings: NodeSettings, times: Record<string, PerformanceProjectNodeTime>) {
  const calibrationIds = new Set(Object.entries(settings).filter(([, setting]) => setting.calibration?.phases?.length).map(([nodeId]) => nodeId))
  // 清理不属于任何校准节点的孤儿 phase_times（历史残留：旧版同步不清理，会让保存被后端拒绝）
  for (const nodeId of Object.keys(times)) {
    if (calibrationIds.has(nodeId) || !times[nodeId]?.phase_times) continue
    delete times[nodeId].phase_times
  }
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
