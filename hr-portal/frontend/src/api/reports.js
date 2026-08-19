import { api } from './client';
const AI_REPORT_EXPLAIN_TIMEOUT_MS = 130_000;
const REPORT_RUN_MAX_PAGE_SIZE = 100;
/**
 * 从界面可见状态(每列拆分设置 + 默认拆分规则)派生数值拆分规则。
 *
 * 这是报表设计器与成本分摊方案设计器共用的「所见即所得」拆分派生逻辑:
 * value_rules 不再独立持久化回写,只由 column_settings + default_split_rule
 * 重新计算,避免历史脏规则反复复活(界面看不到却删不掉)。
 *
 * @param columnSettings 每列设置(含 split_mode / split_factors)
 * @param defaultSplitRule 默认拆分规则
 * @param measureCodes 参与拆分的指标列 code(物理指标,排除维度/计数指标)
 */
export function deriveValueRules(columnSettings, defaultSplitRule, measureCodes) {
    const factorsOf = (s) => (s.split_factors ?? (s.split_factor ? [s.split_factor] : [])).filter(Boolean);
    const byTarget = new Map();
    const defaultFactors = (defaultSplitRule.factors ?? []).filter(Boolean);
    if (defaultSplitRule.enabled && defaultFactors.length) {
        for (const measure of measureCodes) {
            const setting = columnSettings[measure] || {};
            if (setting.split_mode === 'none')
                continue;
            const customFactors = factorsOf(setting);
            if (setting.split_mode === 'custom' && customFactors.length) {
                byTarget.set(measure, customFactors);
            }
            else {
                byTarget.set(measure, defaultFactors);
            }
        }
    }
    for (const measure of measureCodes) {
        const setting = columnSettings[measure] || {};
        if (setting.split_mode === 'none')
            byTarget.delete(measure);
        const customFactors = factorsOf(setting);
        if (setting.split_mode === 'custom' && customFactors.length)
            byTarget.set(measure, customFactors);
    }
    return [...byTarget.entries()].map(([target, factors]) => ({ target, factors }));
}
export const REPORT_VISIBILITY_LABELS = {
    private: '私密',
    scoped: '指定范围',
    public: '公开',
};
export const reportsApi = {
    list: (params = {}) => api.get('/reports', { params }).then((r) => r.data),
    aclOptions: (dataset_id) => api
        .get('/reports/_acl-options', { params: { dataset_id } })
        .then((r) => r.data),
    get: (id) => api.get(`/reports/${id}`).then((r) => r.data),
    create: (body) => api.post('/reports', body).then((r) => r.data),
    update: (id, body) => api.put(`/reports/${id}`, body).then((r) => r.data),
    remove: (id) => api.delete(`/reports/${id}`).then((r) => r.data),
    push: (id) => api.post(`/reports/${id}/push`).then((r) => r.data),
    pushColumns: (id) => api.get(`/reports/${id}/push-columns`).then((r) => r.data),
    run: (id, page = 1, page_size = 50, filters = []) => {
        const safePageSize = Math.min(Math.max(Number(page_size) || 50, 1), REPORT_RUN_MAX_PAGE_SIZE);
        return api
            .post(`/reports/${id}/run`, { filters }, { params: { page, page_size: safePageSize } })
            .then((r) => r.data);
    },
    explainConfig: (body) => api
        .post('/ai/capabilities/report.explain_config/answer', body, {
        timeout: AI_REPORT_EXPLAIN_TIMEOUT_MS,
    })
        .then((r) => r.data),
    exportCsvUrl: (id, filters = []) => {
        const qs = filters.length ? `?runtime_filters=${encodeURIComponent(JSON.stringify(filters))}` : '';
        return `/api/v1/reports/${id}/export.csv${qs}`;
    },
    exportXlsxUrl: (id, filters = []) => {
        const qs = filters.length ? `?runtime_filters=${encodeURIComponent(JSON.stringify(filters))}` : '';
        return `/api/v1/reports/${id}/export.xlsx${qs}`;
    },
};
