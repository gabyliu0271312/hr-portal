/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { dataCompareApi } from '@/api/data-compare';
const route = useRoute();
const runId = computed(() => Number(route.params.runId));
const loading = ref(false);
const run = ref(null);
const detailColumns = computed(() => {
    if (!run.value?.detail?.details?.length)
        return [];
    return Object.keys(run.value.detail.details[0]);
});
function triggerTypeLabel(t) {
    const map = { manual: '手动', scheduled: '定时', ai_chat: 'AI对话' };
    return map[t] || t;
}
function triggerTypeTag(t) {
    const map = {
        manual: '', scheduled: 'success', ai_chat: 'info',
    };
    return map[t] || 'info';
}
function statusLabel(s) {
    const map = { success: '成功', partial_diff: '有差异', failed: '失败' };
    return map[s] || s;
}
function statusTag(s) {
    const map = {
        success: 'success', partial_diff: 'warning', failed: 'danger',
    };
    return map[s] || '';
}
async function loadRun() {
    loading.value = true;
    try {
        run.value = await dataCompareApi.getRun(runId.value);
    }
    finally {
        loading.value = false;
    }
}
onMounted(loadRun);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "run-detail" },
});
const __VLS_0 = {}.ElPageHeader;
/** @type {[typeof __VLS_components.ElPageHeader, typeof __VLS_components.elPageHeader, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onBack': {} },
    content: (`执行记录 #${__VLS_ctx.runId}`),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onBack': {} },
    content: (`执行记录 #${__VLS_ctx.runId}`),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onBack: (...[$event]) => {
        __VLS_ctx.$router.back();
    }
};
var __VLS_3;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "mt-16" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "mt-16" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_11.slots.default;
if (__VLS_ctx.run) {
    const __VLS_12 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        column: (2),
        border: true,
    }));
    const __VLS_14 = __VLS_13({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        label: "任务ID",
    }));
    const __VLS_18 = __VLS_17({
        label: "任务ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    (__VLS_ctx.run.task_id);
    var __VLS_19;
    const __VLS_20 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        label: "执行ID",
    }));
    const __VLS_22 = __VLS_21({
        label: "执行ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    (__VLS_ctx.run.id);
    var __VLS_23;
    const __VLS_24 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        label: "触发方式",
    }));
    const __VLS_26 = __VLS_25({
        label: "触发方式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    const __VLS_28 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        type: (__VLS_ctx.triggerTypeTag(__VLS_ctx.run.trigger_type)),
    }));
    const __VLS_30 = __VLS_29({
        type: (__VLS_ctx.triggerTypeTag(__VLS_ctx.run.trigger_type)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    (__VLS_ctx.triggerTypeLabel(__VLS_ctx.run.trigger_type));
    var __VLS_31;
    var __VLS_27;
    const __VLS_32 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        label: "状态",
    }));
    const __VLS_34 = __VLS_33({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        type: (__VLS_ctx.statusTag(__VLS_ctx.run.status)),
    }));
    const __VLS_38 = __VLS_37({
        type: (__VLS_ctx.statusTag(__VLS_ctx.run.status)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    (__VLS_ctx.statusLabel(__VLS_ctx.run.status));
    var __VLS_39;
    var __VLS_35;
    const __VLS_40 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        label: "差异数量",
    }));
    const __VLS_42 = __VLS_41({
        label: "差异数量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    (__VLS_ctx.run.diff_count);
    var __VLS_43;
    const __VLS_44 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "执行时长",
    }));
    const __VLS_46 = __VLS_45({
        label: "执行时长",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    (__VLS_ctx.run.duration_ms ? `${__VLS_ctx.run.duration_ms}ms` : '-');
    var __VLS_47;
    const __VLS_48 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        label: "开始时间",
    }));
    const __VLS_50 = __VLS_49({
        label: "开始时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (__VLS_ctx.run.started_at);
    var __VLS_51;
    const __VLS_52 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        label: "结束时间",
    }));
    const __VLS_54 = __VLS_53({
        label: "结束时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    (__VLS_ctx.run.finished_at || '-');
    var __VLS_55;
    var __VLS_15;
    if (__VLS_ctx.run.error_message) {
        const __VLS_56 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
        const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    }
    if (__VLS_ctx.run.error_message) {
        const __VLS_60 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            title: ('执行错误'),
            type: "error",
            description: (__VLS_ctx.run.error_message),
            closable: (false),
            showIcon: true,
        }));
        const __VLS_62 = __VLS_61({
            title: ('执行错误'),
            type: "error",
            description: (__VLS_ctx.run.error_message),
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    }
    if (__VLS_ctx.run.summary) {
        const __VLS_64 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            contentPosition: "left",
        }));
        const __VLS_66 = __VLS_65({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        __VLS_67.slots.default;
        var __VLS_67;
    }
    if (__VLS_ctx.run.summary) {
        const __VLS_68 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            column: (2),
            border: true,
        }));
        const __VLS_70 = __VLS_69({
            column: (2),
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
        __VLS_71.slots.default;
        const __VLS_72 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            label: "总对比数",
        }));
        const __VLS_74 = __VLS_73({
            label: "总对比数",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        (__VLS_ctx.run.summary.total_compared ?? '-');
        var __VLS_75;
        const __VLS_76 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            label: "一致数",
        }));
        const __VLS_78 = __VLS_77({
            label: "一致数",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        (__VLS_ctx.run.summary.matched_count ?? '-');
        var __VLS_79;
        const __VLS_80 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            label: "差异数",
        }));
        const __VLS_82 = __VLS_81({
            label: "差异数",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        (__VLS_ctx.run.summary.diff_count ?? '-');
        var __VLS_83;
        const __VLS_84 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            label: "仅A侧",
        }));
        const __VLS_86 = __VLS_85({
            label: "仅A侧",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        (__VLS_ctx.run.summary.only_in_a_count ?? '-');
        var __VLS_87;
        const __VLS_88 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            label: "仅B侧",
        }));
        const __VLS_90 = __VLS_89({
            label: "仅B侧",
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        (__VLS_ctx.run.summary.only_in_b_count ?? '-');
        var __VLS_91;
        const __VLS_92 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            label: "状态",
        }));
        const __VLS_94 = __VLS_93({
            label: "状态",
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        (__VLS_ctx.run.summary.status ?? '-');
        var __VLS_95;
        var __VLS_71;
    }
    if (__VLS_ctx.run.detail?.details?.length) {
        const __VLS_96 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            contentPosition: "left",
        }));
        const __VLS_98 = __VLS_97({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_99.slots.default;
        (__VLS_ctx.run.detail.details.length);
        var __VLS_99;
    }
    if (__VLS_ctx.run.detail?.details?.length) {
        const __VLS_100 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            data: (__VLS_ctx.run.detail.details),
            border: true,
            maxHeight: "400",
            size: "small",
        }));
        const __VLS_102 = __VLS_101({
            data: (__VLS_ctx.run.detail.details),
            border: true,
            maxHeight: "400",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.detailColumns))) {
            const __VLS_104 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                key: (col),
                prop: (col),
                label: (col),
                minWidth: "120",
            }));
            const __VLS_106 = __VLS_105({
                key: (col),
                prop: (col),
                label: (col),
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        }
        var __VLS_103;
    }
}
else if (!__VLS_ctx.loading) {
    const __VLS_108 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        description: "未找到执行记录",
    }));
    const __VLS_110 = __VLS_109({
        description: "未找到执行记录",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
}
var __VLS_11;
/** @type {__VLS_StyleScopedClasses['run-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-16']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            runId: runId,
            loading: loading,
            run: run,
            detailColumns: detailColumns,
            triggerTypeLabel: triggerTypeLabel,
            triggerTypeTag: triggerTypeTag,
            statusLabel: statusLabel,
            statusTag: statusTag,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
