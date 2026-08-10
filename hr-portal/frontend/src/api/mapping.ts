/**
 * Mapping 公共 API (017)
 */

import { api } from './client'

// -- 类型定义 ---------------------------------------------------------------

export type MappingRuleType =
  | 'field'
  | 'value_map'
  | 'reference_lookup'
  | 'identity_with_overrides'
  | 'type_convert'
  | 'format'
  | 'split_merge'

export type MappingCaller =
  | 'warehouse'
  | 'workflow'
  | 'ucp_transform'
  | 'warehouse_sink'
  | 'push_target'

export interface MappingRuleBase {
  id: string
  type: MappingRuleType
  enabled: boolean
  displayOrder: number
  sourceFields: string[]
  targetFields: string[]
}

export interface FieldRuleConfig {
  mode: 'rename' | 'copy'
}

export interface ValueMapRuleConfig {
  mappings: Record<string, string>
  unmatched: 'keep' | 'set_default' | 'set_null' | 'flag' | 'reject'
  defaultValue?: string | null
}

export interface MatchRule {
  id: string
  priority: number
  sourceField: string
  referenceField: string
  conditions: Record<string, any>
  onMatch: 'use_and_stop' | 'continue' | 'only_fill_empty'
}

export interface LookupConfig {
  id: string
  priority: number
  referenceDatasetId: string
  sourceField: string
  referenceMatchField: string
  referenceReturnField: string
  targetField: string
  conditions: Record<string, any>
}

export interface ReferenceLookupRuleConfig {
  lookupConfigs?: LookupConfig[]
  unmatched: 'keep' | 'set_default' | 'set_null' | 'flag' | 'reject'
  defaultValue?: string | null
  // Legacy read compatibility only.
  referenceDatasetId?: string
  outputMap?: Record<string, string>
  matchRules?: MatchRule[]
}

export interface IdentityWithOverridesRuleConfig {
  defaultBehavior: 'keep_source'
  overrides: Record<string, string>
  unmatched: 'keep' | 'set_default' | 'set_null' | 'flag' | 'reject'
}

export interface TypeConvertRuleConfig {
  targetType: string
  onError: 'keep' | 'set_null' | 'flag' | 'reject'
}

export interface FormatRuleConfig {
  formatType: string
  options: Record<string, any>
  onError: 'keep' | 'set_null' | 'flag' | 'reject'
}

export interface SplitMergeRuleConfig {
  action: 'split' | 'merge'
  delimiter: string
  nullBehavior: string
}

export type MappingRule = MappingRuleBase & {
  config:
    | FieldRuleConfig
    | ValueMapRuleConfig
    | ReferenceLookupRuleConfig
    | IdentityWithOverridesRuleConfig
    | TypeConvertRuleConfig
    | FormatRuleConfig
    | SplitMergeRuleConfig
}

export interface MappingRuleSet {
  code: string
  name: string
  sourceAsset?: string | null
  targetAsset?: string | null
  sourceSchemaHash: string
  targetSchemaHash: string
  rules: MappingRule[]
}

export interface MappingDocument {
  mappingSchemaVersion: 1
  ruleSet: MappingRuleSet
}

export interface MappingCompatibility {
  sourceFormat: string
  readable: boolean
  writable: boolean
  requiresMigration: boolean
  lossyFields: string[]
  unknownFields: Record<string, any>
}

export interface MappingCallerPolicy {
  caller: MappingCaller
  allowedRuleTypes: MappingRuleType[]
  source: {
    assetId?: string | null
    schemaHash: string
    allowedFieldIds: string[]
  }
  target: {
    assetId?: string | null
    schemaHash: string
    allowedFieldIds: string[]
    readonlyFieldIds: string[]
    protectedKeyFieldIds: string[]
  }
  referenceLookup: {
    allowedDatasetIds: string[]
    allowedFieldIds: string[]
    datasetFields?: Record<string, string[]>
    datasetLabels?: Record<string, string>
    maxRules: number
  }
  effects: {
    allowPreview: boolean
    allowSave: boolean
    allowPublish: boolean
    allowExecute: boolean
    allowRebuild: boolean
  }
  legacy: {
    sourceFormat?: string | null
    allowLegacyRead: boolean
    allowLegacyWrite: boolean
    allowMigration: boolean
  }
  metadata: {
    policyVersion: 1
    permissionScope: string
    issuedAt: string
  }
}

export interface MappingResult {
  outputRows: Record<string, any>[]
  trace: Array<{
    rowIndex: number
    ruleId: string
    outcome: 'matched' | 'unmatched' | 'skipped' | 'error'
    referenceKey?: any
    before?: any
    after?: any
    errorCode?: string
  }>
  stats: {
    input: number
    output: number
    matched: number
    unmatched: number
    errors: number
  }
  errors: Array<{
    code: string
    message: string
    rowIndex?: number
    ruleId?: string
    field?: string
  }>
}

// -- 七类规则常量 -----------------------------------------------------------

export const RULE_TYPES: MappingRuleType[] = [
  'field',
  'value_map',
  'reference_lookup',
  'identity_with_overrides',
  'type_convert',
  'format',
  'split_merge',
]

export const RULE_LABELS: Record<MappingRuleType, string> = {
  field: '字段映射',
  value_map: '枚举/值映射',
  reference_lookup: '参考 Lookup',
  identity_with_overrides: '默认自映射+例外',
  type_convert: '类型转换',
  format: '格式转换',
  split_merge: '拆分/合并',
}

// -- API --------------------------------------------------------------------

export const mappingApi = {
  resolvePolicy(
    caller: MappingCaller,
    sourceAssetId?: string | null,
    targetAssetId?: string | null,
  ) {
    return api
      .post('/data-mappings/policy', {
        caller,
        sourceAssetId,
        targetAssetId,
      })
      .then((r) => r.data as MappingCallerPolicy)
  },

  validate(document: MappingDocument, policy: MappingCallerPolicy) {
    return api.post('/data-mappings/validate', {
      document,
      caller: policy.caller,
      sourceAssetId: policy.source.assetId,
      targetAssetId: policy.target.assetId,
    })
  },

  preview(
    document: MappingDocument,
    rows: Record<string, any>[],
    referenceSnapshot?: Record<string, any>,
    policy?: MappingCallerPolicy,
  ) {
    return api
      .post('/data-mappings/preview', {
        document,
        rows,
        reference_snapshot: referenceSnapshot,
        caller: policy?.caller || 'warehouse',
        sourceAssetId: policy?.source.assetId,
        targetAssetId: policy?.target.assetId,
      })
      .then((r) => r.data as MappingResult)
  },

  getDependencies(bindingId: number) {
    return api.get(`/data-mappings/dependencies/${bindingId}`).then((r) => r.data)
  },

  publish(
    bindingId: number,
    expectedVersion: number,
    caller: MappingCaller,
    actor?: string,
  ) {
    return api
      .post(`/data-mappings/bindings/${bindingId}/publish`, {
        expectedVersion,
        caller,
        actor,
      })
      .then((r) => r.data)
  },

  rebuildDependencies(
    bindingId: number,
    caller: MappingCaller,
    targetType?: string,
    targetId?: string,
  ) {
    return api
      .post(`/data-mappings/bindings/${bindingId}/rebuild-dependencies`, {
        caller,
        target_type: targetType,
        target_id: targetId,
      })
      .then((r) => r.data)
  },
}

// -- 成本中心生命周期 API ----------------------------------------------------

export interface CostCenterException {
  sourceCode: string
  targetCode: string
  attributes: Record<string, any>
}

export interface CostCenterDiff {
  id: number
  sourceCode: string
  diffType: 'added' | 'changed' | 'invalid' | 'inactive' | 'removed'
  status: 'pending' | 'confirmed'
  previousValue?: Record<string, any> | null
  currentValue?: Record<string, any> | null
}

export interface CostCenterNotification {
  id: number
  notificationKey: string
  status: 'pending' | 'retrying' | 'sent' | 'exhausted'
  retryCount: number
  lastError?: string | null
}

export interface CostCenterPeriodState {
  id: number
  period: string
  status: 'draft' | 'published'
  version: number
  expectedVersion: number
  bindingId: number
  copiedFromPeriod?: string | null
  reviewRequired: boolean
  publishAuditId?: number | null
  rebuildRunId?: number | null
  rebuildStatus: 'not_started' | 'pending' | 'running' | 'success' | 'failed'
  notificationStatus: 'not_started' | 'pending' | 'retrying' | 'sent' | 'exhausted'
  sourceCount: number
  exceptionCount: number
  pendingDiffCount: number
  exceptions: CostCenterException[]
  diffs: CostCenterDiff[]
  notifications: CostCenterNotification[]
}

export interface CostCenterSnapshotPayload {
  source_snapshot: Record<string, Record<string, any>>
  actor?: string
}

export interface CostCenterVersionPayload {
  expected_version: number
  actor?: string
  source_snapshot?: Record<string, Record<string, any>>
}

export const costCenterMappingApi = {
  initialize(period: string, payload: CostCenterSnapshotPayload) {
    return api.post(`/cost-center-mappings/${period}/initialize`, payload).then((r) => r.data as CostCenterPeriodState)
  },
  copyPrevious(period: string, payload: CostCenterVersionPayload) {
    return api.post(`/cost-center-mappings/${period}/copy-previous`, payload).then((r) => r.data as CostCenterPeriodState)
  },
  getPeriod(period: string) {
    return api.get(`/cost-center-mappings/${period}`).then((r) => r.data as CostCenterPeriodState)
  },
  updateException(period: string, payload: CostCenterVersionPayload & { source_code: string; target_code: string; attributes?: Record<string, any> }) {
    return api.put(`/cost-center-mappings/${period}/exceptions`, payload).then((r) => r.data as CostCenterPeriodState)
  },
  confirmDiff(period: string, payload: { diff_id: number; expected_version: number; actor: string }) {
    return api.post(`/cost-center-mappings/${period}/diffs/confirm`, payload).then((r) => r.data as CostCenterPeriodState)
  },
  publish(period: string, payload: { expected_version: number; actor?: string }) {
    return api.post(`/cost-center-mappings/${period}/publish`, payload).then((r) => r.data)
  },
  getDwdGate(period: string) {
    return api.get(`/cost-center-mappings/${period}/dwd-gate`).then((r) => r.data as { status: 'allowed' | 'review_required'; period: string; version: number; reason?: string })
  },
  ensureNotification(period: string, notificationKey: string, eventId?: string) {
    return api.post(`/cost-center-mappings/${period}/notifications`, null, { params: { notification_key: notificationKey, event_id: eventId } }).then((r) => r.data)
  },
  markRebuildResult(period: string, payload: { success: boolean; error?: string }) {
    return api.post(`/cost-center-mappings/${period}/rebuild-result`, payload).then((r) => r.data)
  },
  markNotificationResult(period: string, notificationId: number, payload: { success: boolean; error?: string }) {
    return api.post(`/cost-center-mappings/${period}/notifications/${notificationId}/result`, payload).then((r) => r.data)
  },
  retryNotification(period: string, notificationId: number) {
    return api.post(`/cost-center-mappings/${period}/notifications/${notificationId}/retry`).then((r) => r.data)
  },
}

// -- 工厂函数 ---------------------------------------------------------------

export function createEmptyRule(type: MappingRuleType): MappingRule {
  const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const base: MappingRuleBase = {
    id,
    type,
    enabled: true,
    displayOrder: 0,
    sourceFields: [],
    targetFields: [],
  }

  const configs: Record<MappingRuleType, any> = {
    field: { mode: 'rename' },
    value_map: { mappings: {}, unmatched: 'keep' },
    reference_lookup: {
      lookupConfigs: [],
      unmatched: 'keep',
    },
    identity_with_overrides: {
      defaultBehavior: 'keep_source',
      overrides: {},
      unmatched: 'keep',
    },
    type_convert: { targetType: 'string', onError: 'reject' },
    format: { formatType: 'trim', options: {}, onError: 'reject' },
    split_merge: { action: 'merge', delimiter: '', nullBehavior: 'keep_null' },
  }

  return { ...base, config: configs[type] } as MappingRule
}

export function createEmptyDocument(
  code: string = '',
  name: string = '',
): MappingDocument {
  return {
    mappingSchemaVersion: 1,
    ruleSet: {
      code,
      name,
      sourceAsset: null,
      targetAsset: null,
      sourceSchemaHash: '',
      targetSchemaHash: '',
      rules: [],
    },
  }
}
