/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DataAnalysis, Refresh, View, Check, CircleClose, Warning, ArrowRight, } from '@element-plus/icons-vue';
import { diagnoseMetric, generateDwsDraft, previewMetricDraft, publishMetricDraft, rollbackMetricDraft, generateAdsDraft, getMetricAutomationTimeline, getWarehouseFeatures, getL4CascadeRule, updateL4CascadeRule, listL4Approvals, } from '@/api/warehouse';
const props = defineProps();
const featureEnabled = ref(false);
const loadingFeature = ref(true);
const expanded = ref(false);
const diagnosis = ref(null);
const diagnosing = ref(false);
const dwsDraft = ref(null);
const generating = ref(false);
const preview = ref(null);
const previewing = ref(false);
const publishing = ref(false);
const publishedResult = ref(null);
const adsDraft = ref(null);
const generatingAds = ref(false);
const timeline = ref([]);
const timelineSummary = ref({});
const loadingTimeline = ref(false);
// ---- L4 全自动级联规则配置 ----
const l4FeatureEnabled = ref(false);
const l4Approval = ref(null);
const l4Rule = ref(null);
const l4RuleLoading = ref(false);
const l4RuleSaving = ref(false);
const l4RuleExpanded = ref(false);
const TRIGGER_OPTIONS = [
    { value: 'dwd_data_refreshed', label: 'DWD 数据刷新后' },
    { value: 'ods_table_data_changed', label: 'ODS 数据变更后' },
    { value: 'dwd_schema_changed', label: 'DWD 结构变更后' },
    { value: 'dwd_metadata_changed', label: 'DWD 元数据变更后' },
    { value: 'metric_saved', label: '指标保存/发布后' },
];
async function loadL4Config() {
    if (!props.metricId)
        return;
    try {
        const f = await getWarehouseFeatures();
        l4FeatureEnabled.value = f.l4_full_auto;
        if (!l4FeatureEnabled.value)
            return;
        // 查审批状态
        const approvals = await listL4Approvals({ metric_id: props.metricId });
        l4Approval.value = approvals.find((a) => a.status === 'approved') || null;
        if (l4Approval.value) {
            l4Rule.value = await getL4CascadeRule(props.metricId);
            // 确保默认值
            if (!l4Rule.value.trigger_conditions)
                l4Rule.value.trigger_conditions = [];
            if (!l4Rule.value.risk_strategies)
                l4Rule.value.risk_strategies = {};
            if (!l4Rule.value.max_frequency)
                l4Rule.value.max_frequency = 1;
        }
    }
    catch {
        l4FeatureEnabled.value = false;
    }
}
function toggleTrigger(trigger) {
    if (!l4Rule.value)
        return;
    const idx = l4Rule.value.trigger_conditions.indexOf(trigger);
    if (idx >= 0) {
        l4Rule.value.trigger_conditions.splice(idx, 1);
    }
    else {
        l4Rule.value.trigger_conditions.push(trigger);
    }
}
async function saveL4Rule() {
    if (!props.metricId || !l4Rule.value)
        return;
    l4RuleSaving.value = true;
    try {
        await updateL4CascadeRule(props.metricId, {
            trigger_conditions: l4Rule.value.trigger_conditions,
            risk_strategies: l4Rule.value.risk_strategies,
            max_frequency: l4Rule.value.max_frequency,
            auto_rollback: l4Rule.value.auto_rollback,
            notify_on_success: l4Rule.value.notify_on_success,
            notify_on_block: l4Rule.value.notify_on_block,
            notify_on_fail: l4Rule.value.notify_on_fail,
        });
        ElMessage.success('L4 级联规则已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        l4RuleSaving.value = false;
    }
}
const ACTION_LABELS = {
    diagnose: '解析诊断', generate_dws_draft: '生成 DWS 草稿', preview: '预览门禁',
    quality_gate: '质量门禁', publish_dws: '发布 DWS', rollback_dws: '回滚 DWS',
    generate_ads_draft: '生成 ADS 草稿', publish_ads: '发布 ADS',
    impact_analysis: '影响分析', generate_bi_contract: '生成 BI 契约',
    set_refresh_policy: '设置刷新策略', rollback_ads: '回滚 ADS',
};
function actionLabel(action) { return ACTION_LABELS[action] || action; }
function statusTag(status) { return status === 'success' ? 'success' : status === 'failed' ? 'danger' : status === 'blocked' ? 'warning' : 'info'; }
const currentStep = ref('diagnose');
async function loadFeatureFlag() {
    try {
        const f = await getWarehouseFeatures();
        featureEnabled.value = f.metric_automation;
    }
    catch {
        featureEnabled.value = false;
    }
    finally {
        loadingFeature.value = false;
    }
}
async function doDiagnose() {
    if (!props.metricId)
        return;
    diagnosing.value = true;
    diagnosis.value = null;
    try {
        diagnosis.value = await diagnoseMetric(props.metricId);
        if (diagnosis.value.automatable) {
            currentStep.value = 'dws_draft';
            ElMessage.success('指标可自动化生成 DWS/ADS 草稿');
        }
        else {
            ElMessage.warning('该指标暂不支持自动化：' + (diagnosis.value.errors?.[0] || '未知原因'));
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '诊断失败');
    }
    finally {
        diagnosing.value = false;
    }
}
async function doGenerateDws() {
    if (!props.metricId)
        return;
    generating.value = true;
    try {
        dwsDraft.value = await generateDwsDraft({ metric_id: props.metricId });
        currentStep.value = 'preview';
        ElMessage.success('DWS 草稿已生成');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '生成失败');
    }
    finally {
        generating.value = false;
    }
}
async function doPreview() {
    if (!dwsDraft.value)
        return;
    previewing.value = true;
    try {
        preview.value = await previewMetricDraft({ draft_id: dwsDraft.value.draft_id, draft_type: 'dws' });
        currentStep.value = 'publish';
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
async function doPublish() {
    if (!dwsDraft.value)
        return;
    try {
        await ElMessageBox.confirm(`确认发布 DWS View "${preview.value?.view_name || dwsDraft.value.aggregate_name}"？发布后将对下游可见。`, '确认发布', { confirmButtonText: '确定发布', cancelButtonText: '取消', type: 'warning' });
        publishing.value = true;
        publishedResult.value = await publishMetricDraft({
            draft_id: dwsDraft.value.draft_id,
            draft_type: 'dws',
            confirmed: true,
        });
        currentStep.value = 'ads_draft';
        ElMessage.success('DWS 已发布');
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(e?.response?.data?.detail || '发布失败');
    }
    finally {
        publishing.value = false;
    }
}
async function doRollback() {
    if (!dwsDraft.value)
        return;
    try {
        await ElMessageBox.confirm('确定回滚到上一版本？DWS View 将被删除。', '确认回滚', { type: 'warning' });
        await rollbackMetricDraft({ draft_id: dwsDraft.value.draft_id, draft_type: 'dws', target_version: 1 });
        currentStep.value = 'dws_draft';
        publishedResult.value = null;
        ElMessage.success('已回滚');
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error(e?.response?.data?.detail || '回滚失败');
    }
}
async function doGenerateAds() {
    if (!dwsDraft.value)
        return;
    generatingAds.value = true;
    try {
        adsDraft.value = await generateAdsDraft({
            source_type: 'dws_aggregate',
            source_id: dwsDraft.value.draft_id,
        });
        currentStep.value = 'done';
        ElMessage.success('ADS 草稿已生成');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || 'ADS 生成失败');
    }
    finally {
        generatingAds.value = false;
    }
}
async function loadTimeline() {
    if (!props.metricId)
        return;
    loadingTimeline.value = true;
    try {
        const r = await getMetricAutomationTimeline(props.metricId);
        timeline.value = r.events || [];
        timelineSummary.value = r.summary?.by_status || {};
    }
    catch {
        timeline.value = [];
        timelineSummary.value = {};
    }
    finally {
        loadingTimeline.value = false;
    }
}
watch(() => props.metricId, () => {
    if (props.metricId) {
        currentStep.value = 'diagnose';
        diagnosis.value = null;
        dwsDraft.value = null;
        preview.value = null;
        publishedResult.value = null;
    }
});
watch(expanded, (val) => { if (val && props.metricId) {
    doDiagnose();
    loadTimeline();
    loadL4Config();
} });
onMounted(() => { loadFeatureFlag(); });
function stepClass(step) {
    const order = ['diagnose', 'dws_draft', 'preview', 'publish', 'ads_draft', 'done'];
    const cur = order.indexOf(currentStep.value);
    const s = order.indexOf(step);
    if (s < cur)
        return 'step-done';
    if (s === cur)
        return 'step-active';
    return 'step-pending';
}
function riskTagType(risk) { return risk === 'high' ? 'danger' : risk === 'medium' ? 'warning' : 'success'; }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ma-header']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['step-done']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-active']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['sql-box']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.loadingFeature) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ma-panel" },
    });
    if (!__VLS_ctx.featureEnabled) {
        const __VLS_0 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "指标自动化生成未启用",
        }));
        const __VLS_2 = __VLS_1({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "指标自动化生成未启用",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    else if (__VLS_ctx.metricId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loadingFeature))
                        return;
                    if (!!(!__VLS_ctx.featureEnabled))
                        return;
                    if (!(__VLS_ctx.metricId))
                        return;
                    __VLS_ctx.expanded = !__VLS_ctx.expanded;
                } },
            ...{ class: "ma-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ma-title" },
        });
        const __VLS_4 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        const __VLS_8 = {}.DataAnalysis;
        /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        var __VLS_7;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        if (__VLS_ctx.currentStep !== 'diagnose') {
            const __VLS_12 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
                size: "small",
                type: "warning",
                effect: "dark",
            }));
            const __VLS_14 = __VLS_13({
                size: "small",
                type: "warning",
                effect: "dark",
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
            __VLS_15.slots.default;
            var __VLS_15;
        }
        const __VLS_16 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ class: "expand-icon" },
            ...{ class: ({ rotated: __VLS_ctx.expanded }) },
        }));
        const __VLS_18 = __VLS_17({
            ...{ class: "expand-icon" },
            ...{ class: ({ rotated: __VLS_ctx.expanded }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        const __VLS_20 = {}.ArrowRight;
        /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
        const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
        var __VLS_19;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ma-body" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
        if (__VLS_ctx.l4FeatureEnabled && __VLS_ctx.l4Approval) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "l4-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: (...[$event]) => {
                        if (!(!__VLS_ctx.loadingFeature))
                            return;
                        if (!!(!__VLS_ctx.featureEnabled))
                            return;
                        if (!(__VLS_ctx.metricId))
                            return;
                        if (!(__VLS_ctx.l4FeatureEnabled && __VLS_ctx.l4Approval))
                            return;
                        __VLS_ctx.l4RuleExpanded = !__VLS_ctx.l4RuleExpanded;
                    } },
                ...{ class: "l4-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "l4-header-left" },
            });
            const __VLS_24 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
            const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
            __VLS_27.slots.default;
            const __VLS_28 = {}.DataAnalysis;
            /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
            const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
            var __VLS_27;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_32 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                type: "success",
                size: "small",
                effect: "dark",
            }));
            const __VLS_34 = __VLS_33({
                type: "success",
                size: "small",
                effect: "dark",
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            __VLS_35.slots.default;
            var __VLS_35;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.l4Approval.risk_level);
            (__VLS_ctx.l4Approval.max_auto_frequency);
            const __VLS_36 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                ...{ class: "expand-icon" },
                ...{ class: ({ rotated: __VLS_ctx.l4RuleExpanded }) },
            }));
            const __VLS_38 = __VLS_37({
                ...{ class: "expand-icon" },
                ...{ class: ({ rotated: __VLS_ctx.l4RuleExpanded }) },
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            __VLS_39.slots.default;
            const __VLS_40 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
            const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
            var __VLS_39;
            if (__VLS_ctx.l4Rule) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-body" },
                });
                __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.l4RuleExpanded) }, null, null);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "l4-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-checks" },
                });
                for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TRIGGER_OPTIONS))) {
                    const __VLS_44 = {}.ElCheckbox;
                    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
                    // @ts-ignore
                    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                        ...{ 'onChange': {} },
                        key: (t.value),
                        modelValue: (__VLS_ctx.l4Rule.trigger_conditions.includes(t.value)),
                    }));
                    const __VLS_46 = __VLS_45({
                        ...{ 'onChange': {} },
                        key: (t.value),
                        modelValue: (__VLS_ctx.l4Rule.trigger_conditions.includes(t.value)),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
                    let __VLS_48;
                    let __VLS_49;
                    let __VLS_50;
                    const __VLS_51 = {
                        onChange: (...[$event]) => {
                            if (!(!__VLS_ctx.loadingFeature))
                                return;
                            if (!!(!__VLS_ctx.featureEnabled))
                                return;
                            if (!(__VLS_ctx.metricId))
                                return;
                            if (!(__VLS_ctx.l4FeatureEnabled && __VLS_ctx.l4Approval))
                                return;
                            if (!(__VLS_ctx.l4Rule))
                                return;
                            __VLS_ctx.toggleTrigger(t.value);
                        }
                    };
                    __VLS_47.slots.default;
                    (t.label);
                    var __VLS_47;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "l4-label" },
                });
                const __VLS_52 = {}.ElInputNumber;
                /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                    modelValue: (__VLS_ctx.l4Rule.max_frequency),
                    min: (1),
                    max: (100),
                    size: "small",
                    ...{ style: {} },
                }));
                const __VLS_54 = __VLS_53({
                    modelValue: (__VLS_ctx.l4Rule.max_frequency),
                    min: (1),
                    max: (100),
                    size: "small",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "l4-label" },
                });
                const __VLS_56 = {}.ElSwitch;
                /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
                // @ts-ignore
                const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                    modelValue: (__VLS_ctx.l4Rule.auto_rollback),
                    size: "small",
                }));
                const __VLS_58 = __VLS_57({
                    modelValue: (__VLS_ctx.l4Rule.auto_rollback),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_57));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "l4-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-checks" },
                });
                const __VLS_60 = {}.ElCheckbox;
                /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
                // @ts-ignore
                const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_success),
                }));
                const __VLS_62 = __VLS_61({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_success),
                }, ...__VLS_functionalComponentArgsRest(__VLS_61));
                __VLS_63.slots.default;
                var __VLS_63;
                const __VLS_64 = {}.ElCheckbox;
                /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
                // @ts-ignore
                const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_block),
                }));
                const __VLS_66 = __VLS_65({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_block),
                }, ...__VLS_functionalComponentArgsRest(__VLS_65));
                __VLS_67.slots.default;
                var __VLS_67;
                const __VLS_68 = {}.ElCheckbox;
                /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
                // @ts-ignore
                const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_fail),
                }));
                const __VLS_70 = __VLS_69({
                    modelValue: (__VLS_ctx.l4Rule.notify_on_fail),
                }, ...__VLS_functionalComponentArgsRest(__VLS_69));
                __VLS_71.slots.default;
                var __VLS_71;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "l4-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "l4-actions" },
                });
                const __VLS_72 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                    loading: (__VLS_ctx.l4RuleSaving),
                }));
                const __VLS_74 = __VLS_73({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                    loading: (__VLS_ctx.l4RuleSaving),
                }, ...__VLS_functionalComponentArgsRest(__VLS_73));
                let __VLS_76;
                let __VLS_77;
                let __VLS_78;
                const __VLS_79 = {
                    onClick: (__VLS_ctx.saveL4Rule)
                };
                __VLS_75.slots.default;
                var __VLS_75;
            }
        }
        else if (__VLS_ctx.l4FeatureEnabled && !__VLS_ctx.l4Approval) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "l4-section" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_80 = {}.ElLink;
            /** @type {[typeof __VLS_components.ElLink, typeof __VLS_components.elLink, typeof __VLS_components.ElLink, typeof __VLS_components.elLink, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                ...{ 'onClick': {} },
                type: "primary",
                underline: "never",
                href: "/warehouse/automation",
                ...{ style: {} },
            }));
            const __VLS_82 = __VLS_81({
                ...{ 'onClick': {} },
                type: "primary",
                underline: "never",
                href: "/warehouse/automation",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_81));
            let __VLS_84;
            let __VLS_85;
            let __VLS_86;
            const __VLS_87 = {
                onClick: () => { }
            };
            __VLS_83.slots.default;
            var __VLS_83;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ma-steps" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('diagnose')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('dws_draft')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('preview')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('publish')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('ads_draft')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: (['step', __VLS_ctx.stepClass('done')]) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-dot" },
        });
        if (__VLS_ctx.diagnosis) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ma-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-grid" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label" },
            });
            const __VLS_88 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                type: (__VLS_ctx.diagnosis.automatable ? 'success' : 'danger'),
                size: "small",
            }));
            const __VLS_90 = __VLS_89({
                type: (__VLS_ctx.diagnosis.automatable ? 'success' : 'danger'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            __VLS_91.slots.default;
            (__VLS_ctx.diagnosis.automatable ? '是' : '否');
            var __VLS_91;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.diagnosis.source_dataset_name || '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.diagnosis.dimension_fields?.join(', ') || '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.diagnosis.measure_fields?.join(', ') || '-');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "diag-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.diagnosis.aggregation_functions?.join(', ') || '-');
            if (__VLS_ctx.diagnosis.errors?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "diag-errors" },
                });
                for (const [e] of __VLS_getVForSourceType((__VLS_ctx.diagnosis.errors))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        key: (e),
                        ...{ class: "err-item" },
                    });
                    const __VLS_92 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
                    const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
                    __VLS_95.slots.default;
                    const __VLS_96 = {}.CircleClose;
                    /** @type {[typeof __VLS_components.CircleClose, ]} */ ;
                    // @ts-ignore
                    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
                    const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
                    var __VLS_95;
                    (e);
                }
            }
            if (__VLS_ctx.diagnosis.warnings?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "diag-warns" },
                });
                for (const [w] of __VLS_getVForSourceType((__VLS_ctx.diagnosis.warnings))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        key: (w),
                        ...{ class: "warn-item" },
                    });
                    const __VLS_100 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
                    const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
                    __VLS_103.slots.default;
                    const __VLS_104 = {}.Warning;
                    /** @type {[typeof __VLS_components.Warning, ]} */ ;
                    // @ts-ignore
                    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
                    const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
                    var __VLS_103;
                    (w);
                }
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ma-actions" },
        });
        const __VLS_108 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            size: "default",
            loading: (__VLS_ctx.diagnosing),
            disabled: (!__VLS_ctx.diagnosis),
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            size: "default",
            loading: (__VLS_ctx.diagnosing),
            disabled: (!__VLS_ctx.diagnosis),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (__VLS_ctx.doDiagnose)
        };
        __VLS_111.slots.default;
        const __VLS_116 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
        const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        const __VLS_120 = {}.Refresh;
        /** @type {[typeof __VLS_components.Refresh, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
        const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
        var __VLS_119;
        var __VLS_111;
        if (__VLS_ctx.diagnosis?.automatable) {
            const __VLS_124 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.generating),
                disabled: (!!__VLS_ctx.dwsDraft),
            }));
            const __VLS_126 = __VLS_125({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.generating),
                disabled: (!!__VLS_ctx.dwsDraft),
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            let __VLS_128;
            let __VLS_129;
            let __VLS_130;
            const __VLS_131 = {
                onClick: (__VLS_ctx.doGenerateDws)
            };
            __VLS_127.slots.default;
            const __VLS_132 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
            const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
            __VLS_135.slots.default;
            const __VLS_136 = {}.DataAnalysis;
            /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
            const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
            var __VLS_135;
            var __VLS_127;
        }
        if (__VLS_ctx.dwsDraft && !__VLS_ctx.preview) {
            const __VLS_140 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.previewing),
            }));
            const __VLS_142 = __VLS_141({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.previewing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            let __VLS_144;
            let __VLS_145;
            let __VLS_146;
            const __VLS_147 = {
                onClick: (__VLS_ctx.doPreview)
            };
            __VLS_143.slots.default;
            const __VLS_148 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({}));
            const __VLS_150 = __VLS_149({}, ...__VLS_functionalComponentArgsRest(__VLS_149));
            __VLS_151.slots.default;
            const __VLS_152 = {}.View;
            /** @type {[typeof __VLS_components.View, ]} */ ;
            // @ts-ignore
            const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({}));
            const __VLS_154 = __VLS_153({}, ...__VLS_functionalComponentArgsRest(__VLS_153));
            var __VLS_151;
            var __VLS_143;
        }
        if (__VLS_ctx.preview && !__VLS_ctx.preview.blocked && !__VLS_ctx.publishedResult) {
            const __VLS_156 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                ...{ 'onClick': {} },
                size: "default",
                type: "success",
                loading: (__VLS_ctx.publishing),
            }));
            const __VLS_158 = __VLS_157({
                ...{ 'onClick': {} },
                size: "default",
                type: "success",
                loading: (__VLS_ctx.publishing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_157));
            let __VLS_160;
            let __VLS_161;
            let __VLS_162;
            const __VLS_163 = {
                onClick: (__VLS_ctx.doPublish)
            };
            __VLS_159.slots.default;
            const __VLS_164 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({}));
            const __VLS_166 = __VLS_165({}, ...__VLS_functionalComponentArgsRest(__VLS_165));
            __VLS_167.slots.default;
            const __VLS_168 = {}.Check;
            /** @type {[typeof __VLS_components.Check, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({}));
            const __VLS_170 = __VLS_169({}, ...__VLS_functionalComponentArgsRest(__VLS_169));
            var __VLS_167;
            var __VLS_159;
        }
        if (__VLS_ctx.publishedResult) {
            const __VLS_172 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                ...{ 'onClick': {} },
                size: "default",
                type: "warning",
            }));
            const __VLS_174 = __VLS_173({
                ...{ 'onClick': {} },
                size: "default",
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            let __VLS_176;
            let __VLS_177;
            let __VLS_178;
            const __VLS_179 = {
                onClick: (__VLS_ctx.doRollback)
            };
            __VLS_175.slots.default;
            var __VLS_175;
        }
        if (__VLS_ctx.publishedResult && !__VLS_ctx.adsDraft) {
            const __VLS_180 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.generatingAds),
            }));
            const __VLS_182 = __VLS_181({
                ...{ 'onClick': {} },
                size: "default",
                type: "primary",
                loading: (__VLS_ctx.generatingAds),
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
            let __VLS_184;
            let __VLS_185;
            let __VLS_186;
            const __VLS_187 = {
                onClick: (__VLS_ctx.doGenerateAds)
            };
            __VLS_183.slots.default;
            var __VLS_183;
        }
        if (__VLS_ctx.preview) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ma-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-info" },
            });
            const __VLS_188 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                type: (__VLS_ctx.riskTagType(__VLS_ctx.preview.risk_level)),
                size: "small",
            }));
            const __VLS_190 = __VLS_189({
                type: (__VLS_ctx.riskTagType(__VLS_ctx.preview.risk_level)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            __VLS_191.slots.default;
            (__VLS_ctx.preview.risk_level);
            var __VLS_191;
            const __VLS_192 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                type: (__VLS_ctx.preview.quality_status === 'pass' ? 'success' : __VLS_ctx.preview.quality_status === 'fail' ? 'danger' : 'warning'),
                size: "small",
            }));
            const __VLS_194 = __VLS_193({
                type: (__VLS_ctx.preview.quality_status === 'pass' ? 'success' : __VLS_ctx.preview.quality_status === 'fail' ? 'danger' : 'warning'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_193));
            __VLS_195.slots.default;
            (__VLS_ctx.preview.quality_status);
            var __VLS_195;
            const __VLS_196 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                type: (__VLS_ctx.preview.small_sample_risk === 'low' ? 'success' : __VLS_ctx.preview.small_sample_risk === 'block' ? 'danger' : 'warning'),
                size: "small",
            }));
            const __VLS_198 = __VLS_197({
                type: (__VLS_ctx.preview.small_sample_risk === 'low' ? 'success' : __VLS_ctx.preview.small_sample_risk === 'block' ? 'danger' : 'warning'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
            __VLS_199.slots.default;
            (__VLS_ctx.preview.small_sample_risk);
            var __VLS_199;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.preview.output_fields?.length || 0);
            if (__VLS_ctx.preview.blocked) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "blocked-box" },
                });
                const __VLS_200 = {}.ElAlert;
                /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
                // @ts-ignore
                const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                    type: "error",
                    closable: (false),
                    title: "发布已阻断",
                }));
                const __VLS_202 = __VLS_201({
                    type: "error",
                    closable: (false),
                    title: "发布已阻断",
                }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                __VLS_203.slots.default;
                {
                    const { default: __VLS_thisSlot } = __VLS_203.slots;
                    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.preview.blocked_reasons))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (r),
                        });
                        (r);
                    }
                }
                var __VLS_203;
            }
            if (__VLS_ctx.preview.sql_summary) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sql-box" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sql-label" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
                (__VLS_ctx.preview.sql_summary);
            }
            if (__VLS_ctx.preview.sample_rows?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sample-box" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "sql-label" },
                });
                (__VLS_ctx.preview.sample_rows.length);
                const __VLS_204 = {}.ElTable;
                /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
                // @ts-ignore
                const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
                    data: (__VLS_ctx.preview.sample_rows.slice(0, 5)),
                    size: "small",
                    stripe: true,
                    maxHeight: "200",
                }));
                const __VLS_206 = __VLS_205({
                    data: (__VLS_ctx.preview.sample_rows.slice(0, 5)),
                    size: "small",
                    stripe: true,
                    maxHeight: "200",
                }, ...__VLS_functionalComponentArgsRest(__VLS_205));
                __VLS_207.slots.default;
                for (const [c] of __VLS_getVForSourceType((__VLS_ctx.preview.sample_columns.slice(0, 6)))) {
                    const __VLS_208 = {}.ElTableColumn;
                    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
                    // @ts-ignore
                    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                        key: (c),
                        prop: (c),
                        label: (c),
                        minWidth: "100",
                    }));
                    const __VLS_210 = __VLS_209({
                        key: (c),
                        prop: (c),
                        label: (c),
                        minWidth: "100",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
                }
                var __VLS_207;
            }
        }
        if (__VLS_ctx.publishedResult) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ma-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "publish-result" },
            });
            const __VLS_212 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                type: "success",
            }));
            const __VLS_214 = __VLS_213({
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_213));
            __VLS_215.slots.default;
            (__VLS_ctx.publishedResult.view_name);
            var __VLS_215;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.publishedResult.output_fields_count);
        }
        if (__VLS_ctx.timeline.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ma-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            if (__VLS_ctx.timelineSummary.success) {
                (__VLS_ctx.timelineSummary.success);
            }
            if (__VLS_ctx.timelineSummary.failed) {
                (__VLS_ctx.timelineSummary.failed);
            }
            if (__VLS_ctx.timelineSummary.blocked) {
                (__VLS_ctx.timelineSummary.blocked);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "timeline-list" },
            });
            for (const [e] of __VLS_getVForSourceType((__VLS_ctx.timeline.slice(0, 10)))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (e.id),
                    ...{ class: "tl-item" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "tl-time" },
                });
                (__VLS_ctx.formatDateTime(e.created_at) || '-');
                const __VLS_216 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
                    size: "small",
                    type: (__VLS_ctx.statusTag(e.status)),
                }));
                const __VLS_218 = __VLS_217({
                    size: "small",
                    type: (__VLS_ctx.statusTag(e.status)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_217));
                __VLS_219.slots.default;
                (e.status);
                var __VLS_219;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "tl-act" },
                });
                (__VLS_ctx.actionLabel(e.action));
                if (e.message) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "tl-msg" },
                    });
                    (e.message?.substring(0, 80));
                }
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['ma-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-header']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-title']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-body']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-section']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-header']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-body']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-row']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-label']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-checks']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-row']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-label']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-row']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-label']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-row']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-label']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-checks']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-row']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-label']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-item']} */ ;
/** @type {__VLS_StyleScopedClasses['label']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['err-item']} */ ;
/** @type {__VLS_StyleScopedClasses['diag-warns']} */ ;
/** @type {__VLS_StyleScopedClasses['warn-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-info']} */ ;
/** @type {__VLS_StyleScopedClasses['blocked-box']} */ ;
/** @type {__VLS_StyleScopedClasses['sql-box']} */ ;
/** @type {__VLS_StyleScopedClasses['sql-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sample-box']} */ ;
/** @type {__VLS_StyleScopedClasses['sql-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['publish-result']} */ ;
/** @type {__VLS_StyleScopedClasses['ma-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['timeline-list']} */ ;
/** @type {__VLS_StyleScopedClasses['tl-item']} */ ;
/** @type {__VLS_StyleScopedClasses['tl-time']} */ ;
/** @type {__VLS_StyleScopedClasses['tl-act']} */ ;
/** @type {__VLS_StyleScopedClasses['tl-msg']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            DataAnalysis: DataAnalysis,
            Refresh: Refresh,
            View: View,
            Check: Check,
            CircleClose: CircleClose,
            Warning: Warning,
            ArrowRight: ArrowRight,
            featureEnabled: featureEnabled,
            loadingFeature: loadingFeature,
            expanded: expanded,
            diagnosis: diagnosis,
            diagnosing: diagnosing,
            dwsDraft: dwsDraft,
            generating: generating,
            preview: preview,
            previewing: previewing,
            publishing: publishing,
            publishedResult: publishedResult,
            adsDraft: adsDraft,
            generatingAds: generatingAds,
            timeline: timeline,
            timelineSummary: timelineSummary,
            l4FeatureEnabled: l4FeatureEnabled,
            l4Approval: l4Approval,
            l4Rule: l4Rule,
            l4RuleSaving: l4RuleSaving,
            l4RuleExpanded: l4RuleExpanded,
            TRIGGER_OPTIONS: TRIGGER_OPTIONS,
            toggleTrigger: toggleTrigger,
            saveL4Rule: saveL4Rule,
            actionLabel: actionLabel,
            statusTag: statusTag,
            currentStep: currentStep,
            doDiagnose: doDiagnose,
            doGenerateDws: doGenerateDws,
            doPreview: doPreview,
            doPublish: doPublish,
            doRollback: doRollback,
            doGenerateAds: doGenerateAds,
            stepClass: stepClass,
            riskTagType: riskTagType,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
