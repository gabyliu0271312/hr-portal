/**
 * Mapping 公共 API (017)
 */
import { api } from './client';
// -- 七类规则常量 -----------------------------------------------------------
export const RULE_TYPES = [
    'field',
    'value_map',
    'reference_lookup',
    'identity_with_overrides',
    'type_convert',
    'format',
    'split_merge',
];
export const RULE_LABELS = {
    field: '字段映射',
    value_map: '枚举/值映射',
    reference_lookup: '参考 Lookup',
    identity_with_overrides: '默认自映射+例外',
    type_convert: '类型转换',
    format: '格式转换',
    split_merge: '拆分/合并',
};
// -- API --------------------------------------------------------------------
export const mappingApi = {
    resolvePolicy(caller, sourceAssetId, targetAssetId) {
        return api
            .post('/data-mappings/policy', {
            caller,
            sourceAssetId,
            targetAssetId,
        })
            .then((r) => r.data);
    },
    validate(document, policy) {
        return api.post('/data-mappings/validate', {
            document,
            caller: policy.caller,
            sourceAssetId: policy.source.assetId,
            targetAssetId: policy.target.assetId,
        });
    },
    preview(document, rows, referenceSnapshot, policy) {
        return api
            .post('/data-mappings/preview', {
            document,
            rows,
            reference_snapshot: referenceSnapshot,
            caller: policy?.caller || 'warehouse',
            sourceAssetId: policy?.source.assetId,
            targetAssetId: policy?.target.assetId,
        })
            .then((r) => r.data);
    },
    getDependencies(bindingId) {
        return api.get(`/data-mappings/dependencies/${bindingId}`).then((r) => r.data);
    },
    publish(bindingId, expectedVersion, caller, actor) {
        return api
            .post(`/data-mappings/bindings/${bindingId}/publish`, {
            expectedVersion,
            caller,
            actor,
        })
            .then((r) => r.data);
    },
    rebuildDependencies(bindingId, caller, targetType, targetId) {
        return api
            .post(`/data-mappings/bindings/${bindingId}/rebuild-dependencies`, {
            caller,
            target_type: targetType,
            target_id: targetId,
        })
            .then((r) => r.data);
    },
};
export const costCenterMappingApi = {
    initialize(period, payload) {
        return api.post(`/cost-center-mappings/${period}/initialize`, payload).then((r) => r.data);
    },
    copyPrevious(period, payload) {
        return api.post(`/cost-center-mappings/${period}/copy-previous`, payload).then((r) => r.data);
    },
    getPeriod(period) {
        return api.get(`/cost-center-mappings/${period}`).then((r) => r.data);
    },
    updateException(period, payload) {
        return api.put(`/cost-center-mappings/${period}/exceptions`, payload).then((r) => r.data);
    },
    confirmDiff(period, payload) {
        return api.post(`/cost-center-mappings/${period}/diffs/confirm`, payload).then((r) => r.data);
    },
    publish(period, payload) {
        return api.post(`/cost-center-mappings/${period}/publish`, payload).then((r) => r.data);
    },
    getDwdGate(period) {
        return api.get(`/cost-center-mappings/${period}/dwd-gate`).then((r) => r.data);
    },
    ensureNotification(period, notificationKey, eventId) {
        return api.post(`/cost-center-mappings/${period}/notifications`, null, { params: { notification_key: notificationKey, event_id: eventId } }).then((r) => r.data);
    },
    markRebuildResult(period, payload) {
        return api.post(`/cost-center-mappings/${period}/rebuild-result`, payload).then((r) => r.data);
    },
    markNotificationResult(period, notificationId, payload) {
        return api.post(`/cost-center-mappings/${period}/notifications/${notificationId}/result`, payload).then((r) => r.data);
    },
    retryNotification(period, notificationId) {
        return api.post(`/cost-center-mappings/${period}/notifications/${notificationId}/retry`).then((r) => r.data);
    },
};
// -- 工厂函数 ---------------------------------------------------------------
export function createEmptyRule(type) {
    const id = `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const base = {
        id,
        type,
        enabled: true,
        displayOrder: 0,
        sourceFields: [],
        targetFields: [],
    };
    const configs = {
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
    };
    return { ...base, config: configs[type] };
}
export function createEmptyDocument(code = '', name = '') {
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
    };
}
