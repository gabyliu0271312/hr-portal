/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { DataAnalysis, ArrowRight } from '@element-plus/icons-vue';
import { getL4CascadeRule, updateL4CascadeRule, getL4Timeline, rollbackL4Metric, listL4Approvals } from '@/api/warehouse';
const props = defineProps();
const l4Approval = ref(null);
const l4Rule = ref(null);
const loading = ref(true);
const saving = ref(false);
const expanded = ref(false);
const timeline = ref(null);
const TRIGGERS = [
    { value: 'dwd_data_refreshed', label: 'DWD 数据刷新后' },
    { value: 'ods_table_data_changed', label: 'ODS 数据变更后' },
    { value: 'dwd_schema_changed', label: 'DWD 结构变更后' },
    { value: 'dwd_metadata_changed', label: 'DWD 元数据变更后' },
    { value: 'metric_saved', label: '指标保存/发布后' },
];
async function load() {
    if (!props.metricId)
        return;
    loading.value = true;
    try {
        const approvals = await listL4Approvals({ metric_id: props.metricId });
        l4Approval.value = approvals.find((a) => a.status === 'approved') || null;
        if (l4Approval.value) {
            l4Rule.value = await getL4CascadeRule(props.metricId);
            timeline.value = await getL4Timeline(props.metricId);
        }
    }
    catch {
        l4Approval.value = null;
        l4Rule.value = null;
    }
    finally {
        loading.value = false;
    }
}
function toggleTrigger(t) {
    if (!l4Rule.value)
        return;
    const idx = l4Rule.value.trigger_conditions.indexOf(t);
    if (idx >= 0)
        l4Rule.value.trigger_conditions.splice(idx, 1);
    else
        l4Rule.value.trigger_conditions.push(t);
}
async function saveRule() {
    if (!l4Rule.value)
        return;
    saving.value = true;
    try {
        await updateL4CascadeRule(props.metricId, {
            trigger_conditions: l4Rule.value.trigger_conditions,
            max_frequency: l4Rule.value.max_frequency,
            auto_rollback: l4Rule.value.auto_rollback,
            notify_on_success: l4Rule.value.notify_on_success,
            notify_on_block: l4Rule.value.notify_on_block,
            notify_on_fail: l4Rule.value.notify_on_fail,
        });
        ElMessage.success('L4 规则已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function doRollback() {
    try {
        const { ElMessageBox } = await import('element-plus');
        await ElMessageBox.confirm('确定回滚该指标最近一次 L4 自动发布？', '确认回滚', { type: 'warning' });
        const r = await rollbackL4Metric(props.metricId);
        ElMessage.success(r.message || '回滚完成');
        await load();
    }
    catch { /* cancelled */ }
}
const STATUS_LABELS = { pending: '审批中', approved: '已通过', rejected: '已驳回', revoked: '已撤销' };
watch(() => props.metricId, () => { if (props.metricId)
    load(); }, { immediate: false });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['l4-header']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (!__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "l4-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.loading))
                    return;
                __VLS_ctx.expanded = !__VLS_ctx.expanded;
                if (__VLS_ctx.expanded)
                    __VLS_ctx.load();
            } },
        ...{ class: "l4-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "l4-header-left" },
    });
    const __VLS_0 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    const __VLS_4 = {}.DataAnalysis;
    /** @type {[typeof __VLS_components.DataAnalysis, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.l4Approval) {
        const __VLS_8 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            type: "success",
            size: "small",
        }));
        const __VLS_10 = __VLS_9({
            type: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        var __VLS_11;
    }
    else {
        const __VLS_12 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            type: "info",
            size: "small",
        }));
        const __VLS_14 = __VLS_13({
            type: "info",
            size: "small",
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
        ...{ class: "l4-body" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.expanded) }, null, null);
    if (!__VLS_ctx.l4Approval) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_24 = {}.RouterLink;
        /** @type {[typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, typeof __VLS_components.RouterLink, typeof __VLS_components.routerLink, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            to: "/warehouse/automation",
        }));
        const __VLS_26 = __VLS_25({
            to: "/warehouse/automation",
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        var __VLS_27;
    }
    else if (__VLS_ctx.l4Rule) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_28 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            type: (__VLS_ctx.l4Approval.risk_level === 'low' ? 'success' : 'warning'),
            size: "small",
        }));
        const __VLS_30 = __VLS_29({
            type: (__VLS_ctx.l4Approval.risk_level === 'low' ? 'success' : 'warning'),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        (__VLS_ctx.l4Approval.risk_level === 'low' ? '低风险' : __VLS_ctx.l4Approval.risk_level === 'medium' ? '中风险' : '高风险');
        var __VLS_31;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.l4Approval.approved_by || '-');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.l4Approval.max_auto_frequency);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "rule-label" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.TRIGGERS))) {
            const __VLS_32 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
                ...{ 'onChange': {} },
                key: (t.value),
                modelValue: (__VLS_ctx.l4Rule.trigger_conditions.includes(t.value)),
                size: "small",
            }));
            const __VLS_34 = __VLS_33({
                ...{ 'onChange': {} },
                key: (t.value),
                modelValue: (__VLS_ctx.l4Rule.trigger_conditions.includes(t.value)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            let __VLS_36;
            let __VLS_37;
            let __VLS_38;
            const __VLS_39 = {
                onChange: (() => __VLS_ctx.toggleTrigger(t.value))
            };
            __VLS_35.slots.default;
            (t.label);
            var __VLS_35;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "rule-label" },
        });
        const __VLS_40 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            modelValue: (__VLS_ctx.l4Rule.max_frequency),
            min: (1),
            max: (100),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_42 = __VLS_41({
            modelValue: (__VLS_ctx.l4Rule.max_frequency),
            min: (1),
            max: (100),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "rule-label" },
        });
        const __VLS_44 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            modelValue: (__VLS_ctx.l4Rule.auto_rollback),
            size: "small",
        }));
        const __VLS_46 = __VLS_45({
            modelValue: (__VLS_ctx.l4Rule.auto_rollback),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "rule-label" },
        });
        const __VLS_48 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            modelValue: (__VLS_ctx.l4Rule.notify_on_success),
            size: "small",
        }));
        const __VLS_50 = __VLS_49({
            modelValue: (__VLS_ctx.l4Rule.notify_on_success),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        var __VLS_51;
        const __VLS_52 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            modelValue: (__VLS_ctx.l4Rule.notify_on_block),
            size: "small",
        }));
        const __VLS_54 = __VLS_53({
            modelValue: (__VLS_ctx.l4Rule.notify_on_block),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        var __VLS_55;
        const __VLS_56 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            modelValue: (__VLS_ctx.l4Rule.notify_on_fail),
            size: "small",
        }));
        const __VLS_58 = __VLS_57({
            modelValue: (__VLS_ctx.l4Rule.notify_on_fail),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        var __VLS_59;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-actions" },
        });
        const __VLS_60 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_62 = __VLS_61({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        let __VLS_64;
        let __VLS_65;
        let __VLS_66;
        const __VLS_67 = {
            onClick: (__VLS_ctx.saveRule)
        };
        __VLS_63.slots.default;
        var __VLS_63;
        const __VLS_68 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
        }));
        const __VLS_70 = __VLS_69({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        let __VLS_72;
        let __VLS_73;
        let __VLS_74;
        const __VLS_75 = {
            onClick: (__VLS_ctx.doRollback)
        };
        __VLS_71.slots.default;
        var __VLS_71;
    }
    if (__VLS_ctx.timeline?.events?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        for (const [e] of __VLS_getVForSourceType((__VLS_ctx.timeline.events.slice(0, 5)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (e.execution_id),
                ...{ style: {} },
            });
            const __VLS_76 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                size: "small",
                type: (e.status === 'success' ? 'success' : 'danger'),
            }));
            const __VLS_78 = __VLS_77({
                size: "small",
                type: (e.status === 'success' ? 'success' : 'danger'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
            __VLS_79.slots.default;
            (e.status);
            var __VLS_79;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (e.trigger_type);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.formatDateTime(e.started_at) || '-');
        }
    }
}
/** @type {__VLS_StyleScopedClasses['l4-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-header']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['l4-body']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-label']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            DataAnalysis: DataAnalysis,
            ArrowRight: ArrowRight,
            l4Approval: l4Approval,
            l4Rule: l4Rule,
            loading: loading,
            saving: saving,
            expanded: expanded,
            timeline: timeline,
            TRIGGERS: TRIGGERS,
            load: load,
            toggleTrigger: toggleTrigger,
            saveRule: saveRule,
            doRollback: doRollback,
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
