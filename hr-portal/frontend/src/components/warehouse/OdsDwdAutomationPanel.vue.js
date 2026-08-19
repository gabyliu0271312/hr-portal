/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, watch, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Setting, CircleCheck, CircleClose, Loading, Clock, ArrowRight, VideoPause, VideoPlay, InfoFilled } from '@element-plus/icons-vue';
import { getOdsDwdAutomationConfig, updateOdsDwdAutomationConfig, listOdsDwdAutomationExecutions, getWarehouseFeatures, detectOdsSyncSemantics, } from '@/api/warehouse';
const props = defineProps();
const featureEnabled = ref(false);
const loadingFeature = ref(true);
const config = ref(null);
const loading = ref(false);
const toggling = ref(false);
const expanded = ref(false);
const executions = ref([]);
const loadingExecs = ref(false);
const detectedSemantics = ref({ ods_sync_semantics: '', dwd_write_strategy: '', missing_row_strategy: '', business_key_fields: [] });
async function loadFeatureFlag() {
    try {
        const f = await getWarehouseFeatures();
        featureEnabled.value = f.ods_dwd_automation;
    }
    catch {
        featureEnabled.value = false;
    }
    finally {
        loadingFeature.value = false;
    }
}
async function loadConfig() {
    if (!props.odsTableName)
        return;
    loading.value = true;
    try {
        config.value = await getOdsDwdAutomationConfig(props.odsTableName);
        hasRules.value = config.value.update_mode === 'cleaning_rule';
        await loadExecutions();
        await refreshDetectedMode();
    }
    catch {
        config.value = null;
        try {
            detectedSemantics.value = await detectOdsSyncSemantics(props.odsTableName);
        }
        catch { /* keep default */ }
        await refreshDetectedMode();
    }
    finally {
        loading.value = false;
    }
}
async function loadExecutions() {
    if (!props.odsTableName)
        return;
    loadingExecs.value = true;
    try {
        executions.value = await listOdsDwdAutomationExecutions(props.odsTableName, 5);
    }
    catch {
        executions.value = [];
    }
    finally {
        loadingExecs.value = false;
    }
}
async function toggle() {
    toggling.value = true;
    const enabling = !config.value?.enabled;
    try {
        if (!enabling) {
            await ElMessageBox.confirm('暂停后 ODS 变更将不再自动更新 DWD。确定？', '确认暂停', { confirmButtonText: '确定暂停', cancelButtonText: '取消', type: 'warning' });
        }
        if (config.value) {
            await updateOdsDwdAutomationConfig(props.odsTableName, { enabled: enabling });
        }
        ElMessage.success(enabling ? '已启用自动同步' : '已暂停自动同步');
        await loadConfig();
    }
    catch { /* cancelled */ }
    finally {
        toggling.value = false;
    }
}
const hasRules = ref(false);
const detectedMode = ref('');
function businessKeys(value) {
    return value?.effective_business_key_fields?.length
        ? value.effective_business_key_fields
        : (value?.business_key_fields || []);
}
function strategyLabel(value) {
    const mode = value?.effective_ingestion_mode;
    if (mode === 'period_full_snapshot')
        return '按期间全量快照 → 当前期间同步';
    if (mode === 'current_snapshot')
        return '当前状态全量快照 → 当前状态同步';
    if (mode === 'incremental_upsert')
        return '增量更新 → 增量更新';
    if (mode === 'append')
        return '增量追加 → 追加';
    return `${value?.ods_sync_semantics || '-'} → ${value?.dwd_write_strategy || '-'}`;
}
async function refreshDetectedMode() {
    if (!props.odsTableName)
        return;
    try {
        const d = await detectOdsSyncSemantics(props.odsTableName);
        detectedMode.value = strategyLabel(d);
    }
    catch {
        detectedMode.value = '自动检测';
    }
}
function statusIcon(status) { if (status === 'success')
    return CircleCheck; if (status === 'failed')
    return CircleClose; if (status === 'running')
    return Loading; return Clock; }
function statusColor(status) { if (status === 'success')
    return '#67C23A'; if (status === 'failed')
    return '#F56C6C'; if (status === 'running')
    return '#409EFF'; return '#909399'; }
// 展开面板时重新检测
watch(expanded, (val) => { if (val)
    refreshDetectedMode(); });
watch(() => props.odsTableName, () => { if (props.odsTableName) {
    loadConfig();
    refreshDetectedMode();
} });
onMounted(() => { loadFeatureFlag(); if (props.odsTableName) {
    loadConfig();
    refreshDetectedMode();
} });
const __VLS_exposed = { refreshDetectedMode };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.loadingFeature) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "automation-panel" },
    });
    if (!__VLS_ctx.featureEnabled) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flag-disabled-card" },
        });
        const __VLS_0 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "ODS→DWD 自动化未启用",
        }));
        const __VLS_2 = __VLS_1({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "ODS→DWD 自动化未启用",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    }
    else if (__VLS_ctx.odsTableName) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.loadingFeature))
                        return;
                    if (!!(!__VLS_ctx.featureEnabled))
                        return;
                    if (!(__VLS_ctx.odsTableName))
                        return;
                    __VLS_ctx.expanded = !__VLS_ctx.expanded;
                } },
            ...{ class: "panel-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-title" },
        });
        const __VLS_4 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        const __VLS_8 = {}.Setting;
        /** @type {[typeof __VLS_components.Setting, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
        const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
        var __VLS_7;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        if (__VLS_ctx.config?.enabled !== false) {
            const __VLS_12 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
                size: "small",
                type: "success",
                effect: "dark",
            }));
            const __VLS_14 = __VLS_13({
                size: "small",
                type: "success",
                effect: "dark",
            }, ...__VLS_functionalComponentArgsRest(__VLS_13));
            __VLS_15.slots.default;
            var __VLS_15;
        }
        else if (__VLS_ctx.config) {
            const __VLS_16 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
                size: "small",
                type: "warning",
            }));
            const __VLS_18 = __VLS_17({
                size: "small",
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            __VLS_19.slots.default;
            var __VLS_19;
        }
        if (__VLS_ctx.config?.auto_created) {
            const __VLS_20 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                size: "small",
                type: "info",
                effect: "plain",
                ...{ style: {} },
            }));
            const __VLS_22 = __VLS_21({
                size: "small",
                type: "info",
                effect: "plain",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
            __VLS_23.slots.default;
            var __VLS_23;
        }
        if (__VLS_ctx.config?.configuration_drift) {
            const __VLS_24 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
                size: "small",
                type: "danger",
            }));
            const __VLS_26 = __VLS_25({
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_25));
            __VLS_27.slots.default;
            var __VLS_27;
        }
        if (__VLS_ctx.config?.effective_ingestion_mode === 'period_full_snapshot') {
            const __VLS_28 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                size: "small",
                type: "info",
            }));
            const __VLS_30 = __VLS_29({
                size: "small",
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            __VLS_31.slots.default;
            var __VLS_31;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        if (__VLS_ctx.config?.enabled !== false) {
            const __VLS_32 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                ...{ 'onClick': {} },
                size: "small",
                type: "warning",
                plain: true,
                loading: (__VLS_ctx.toggling),
            }));
            const __VLS_34 = __VLS_33({
                ...{ 'onClick': {} },
                size: "small",
                type: "warning",
                plain: true,
                loading: (__VLS_ctx.toggling),
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            let __VLS_36;
            let __VLS_37;
            let __VLS_38;
            const __VLS_39 = {
                onClick: (__VLS_ctx.toggle)
            };
            __VLS_35.slots.default;
            const __VLS_40 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
            const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
            __VLS_43.slots.default;
            const __VLS_44 = {}.VideoPause;
            /** @type {[typeof __VLS_components.VideoPause, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
            const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
            var __VLS_43;
            var __VLS_35;
        }
        else if (__VLS_ctx.config && !__VLS_ctx.config.configuration_drift) {
            const __VLS_48 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                ...{ 'onClick': {} },
                size: "small",
                type: "success",
                plain: true,
                loading: (__VLS_ctx.toggling),
            }));
            const __VLS_50 = __VLS_49({
                ...{ 'onClick': {} },
                size: "small",
                type: "success",
                plain: true,
                loading: (__VLS_ctx.toggling),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            let __VLS_52;
            let __VLS_53;
            let __VLS_54;
            const __VLS_55 = {
                onClick: (__VLS_ctx.toggle)
            };
            __VLS_51.slots.default;
            const __VLS_56 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
            const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
            __VLS_59.slots.default;
            const __VLS_60 = {}.VideoPlay;
            /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
            const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
            var __VLS_59;
            var __VLS_51;
        }
        const __VLS_64 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ class: "expand-icon" },
            ...{ class: ({ rotated: __VLS_ctx.expanded }) },
        }));
        const __VLS_66 = __VLS_65({
            ...{ class: "expand-icon" },
            ...{ class: ({ rotated: __VLS_ctx.expanded }) },
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        const __VLS_68 = {}.ArrowRight;
        /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
        const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
        var __VLS_67;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "panel-body" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
        if (__VLS_ctx.config?.auto_created) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_72 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
            const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
            __VLS_75.slots.default;
            const __VLS_76 = {}.InfoFilled;
            /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
            const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
            var __VLS_75;
            (__VLS_ctx.strategyLabel(__VLS_ctx.config));
            if (__VLS_ctx.config.risk_decision === 'warn') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "status-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-label" },
        });
        const __VLS_80 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            type: (__VLS_ctx.hasRules ? 'success' : ''),
            size: "default",
        }));
        const __VLS_82 = __VLS_81({
            type: (__VLS_ctx.hasRules ? 'success' : ''),
            size: "default",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        (__VLS_ctx.hasRules ? '清洗规则' : '直通更新');
        var __VLS_83;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "status-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "status-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.detectedMode || '自动检测中...');
        if (__VLS_ctx.businessKeys(__VLS_ctx.config).length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.businessKeys(__VLS_ctx.config).join(' + '));
        }
        if (__VLS_ctx.config?.effective_ingestion_mode === 'current_snapshot') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        if (__VLS_ctx.config?.effective_ingestion_mode === 'period_full_snapshot') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.config.period_field || '未登记');
        }
        if (__VLS_ctx.config?.effective_ingestion_mode === 'period_full_snapshot') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        if (__VLS_ctx.config?.configuration_drift) {
            const __VLS_84 = {}.ElAlert;
            /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }));
            const __VLS_86 = __VLS_85({
                type: "warning",
                closable: (false),
                showIcon: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_85));
            __VLS_87.slots.default;
            {
                const { title: __VLS_thisSlot } = __VLS_87.slots;
            }
            ((__VLS_ctx.config.drift_reasons || []).join('；'));
            var __VLS_87;
        }
        if (__VLS_ctx.config?.last_execution_at) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "status-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "status-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.formatDateTime(__VLS_ctx.config.last_execution_at));
            (__VLS_ctx.config.last_execution_rows ?? '-');
            if (__VLS_ctx.config.last_execution_status) {
                const __VLS_88 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                    size: "small",
                    type: (__VLS_ctx.config.last_execution_status === 'success' ? 'success' : 'danger'),
                }));
                const __VLS_90 = __VLS_89({
                    size: "small",
                    type: (__VLS_ctx.config.last_execution_status === 'success' ? 'success' : 'danger'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_89));
                __VLS_91.slots.default;
                (__VLS_ctx.config.last_execution_status);
                var __VLS_91;
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "execution-records" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "exec-title" },
        });
        if (__VLS_ctx.loadingExecs) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_92 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                ...{ class: "is-loading" },
            }));
            const __VLS_94 = __VLS_93({
                ...{ class: "is-loading" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            __VLS_95.slots.default;
            const __VLS_96 = {}.Loading;
            /** @type {[typeof __VLS_components.Loading, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
            const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
            var __VLS_95;
        }
        else if (__VLS_ctx.executions.length === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "exec-empty" },
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "exec-list" },
            });
            for (const [e] of __VLS_getVForSourceType((__VLS_ctx.executions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (e.id),
                    ...{ class: "exec-item" },
                });
                const __VLS_100 = ((__VLS_ctx.statusIcon(e.status)));
                // @ts-ignore
                const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                    ...{ style: ({ color: __VLS_ctx.statusColor(e.status), fontSize: '16px' }) },
                }));
                const __VLS_102 = __VLS_101({
                    ...{ style: ({ color: __VLS_ctx.statusColor(e.status), fontSize: '16px' }) },
                }, ...__VLS_functionalComponentArgsRest(__VLS_101));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "exec-time" },
                });
                (__VLS_ctx.formatDateTime(e.started_at) || '-');
                const __VLS_104 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                    type: (e.status === 'success' ? 'success' : 'danger'),
                    size: "small",
                }));
                const __VLS_106 = __VLS_105({
                    type: (e.status === 'success' ? 'success' : 'danger'),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_105));
                __VLS_107.slots.default;
                (e.status);
                var __VLS_107;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "exec-mode" },
                });
                (e.mode ? e.mode : e.trigger_label);
                if (e.rows) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "exec-rows" },
                    });
                    (e.rows);
                }
                if (e.status === 'failed' && (e.error_message || e.actions?.[0]?.output?.detail || e.actions?.[0]?.error)) {
                    const __VLS_108 = {}.ElTooltip;
                    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
                    // @ts-ignore
                    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                        content: (e.error_message || e.actions?.[0]?.output?.detail || e.actions?.[0]?.error),
                        placement: "top",
                        showAfter: (300),
                    }));
                    const __VLS_110 = __VLS_109({
                        content: (e.error_message || e.actions?.[0]?.output?.detail || e.actions?.[0]?.error),
                        placement: "top",
                        showAfter: (300),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
                    __VLS_111.slots.default;
                    const __VLS_112 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
                        ...{ class: "exec-error" },
                    }));
                    const __VLS_114 = __VLS_113({
                        ...{ class: "exec-error" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
                    __VLS_115.slots.default;
                    const __VLS_116 = {}.InfoFilled;
                    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
                    // @ts-ignore
                    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
                    const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
                    var __VLS_115;
                    var __VLS_111;
                }
            }
        }
    }
}
/** @type {__VLS_StyleScopedClasses['automation-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['flag-disabled-card']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-header']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-body']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-row']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['execution-records']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-title']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-list']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-item']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-time']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-mode']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-rows']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Setting: Setting,
            Loading: Loading,
            ArrowRight: ArrowRight,
            VideoPause: VideoPause,
            VideoPlay: VideoPlay,
            InfoFilled: InfoFilled,
            featureEnabled: featureEnabled,
            loadingFeature: loadingFeature,
            config: config,
            toggling: toggling,
            expanded: expanded,
            executions: executions,
            loadingExecs: loadingExecs,
            toggle: toggle,
            hasRules: hasRules,
            detectedMode: detectedMode,
            businessKeys: businessKeys,
            strategyLabel: strategyLabel,
            statusIcon: statusIcon,
            statusColor: statusColor,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
