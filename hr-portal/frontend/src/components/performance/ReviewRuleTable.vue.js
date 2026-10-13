/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceManagementTable from './PerformanceManagementTable.vue';
import PerformanceDisabledReason from './PerformanceDisabledReason.vue';
import { REVIEW_RULE_METHOD_LABELS } from './reviewRuleTypes';
const __VLS_props = withDefaults(defineProps(), {
    page: 1,
    pageSize: 10,
});
const emit = defineEmits();
function handleRemove(rule) {
    if (rule.deletable)
        emit('remove', rule);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    page: 1,
    pageSize: 10,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['creator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['creator-avatar']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceManagementTable, typeof PerformanceManagementTable, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceManagementTable, new PerformanceManagementTable({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rows: (__VLS_ctx.rules),
    loading: (__VLS_ctx.loading),
    loadingText: "正在加载评估规则...",
    emptyText: "暂无评估规则",
    tableAriaLabel: "评估规则表格",
    paginationAriaLabel: "评估规则分页",
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rows: (__VLS_ctx.rules),
    loading: (__VLS_ctx.loading),
    loadingText: "正在加载评估规则...",
    emptyText: "暂无评估规则",
    tableAriaLabel: "评估规则表格",
    paginationAriaLabel: "评估规则分页",
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onPageChange: (...[$event]) => {
        __VLS_ctx.emit('page-change', $event);
    }
};
const __VLS_7 = {
    onPageSizeChange: (...[$event]) => {
        __VLS_ctx.emit('page-size-change', $event);
    }
};
var __VLS_8 = {};
__VLS_2.slots.default;
const __VLS_9 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    prop: "name",
    label: "名称",
    minWidth: "120",
    showOverflowTooltip: true,
}));
const __VLS_11 = __VLS_10({
    prop: "name",
    label: "名称",
    minWidth: "120",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
const __VLS_13 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    label: "评估方式",
    minWidth: "120",
}));
const __VLS_15 = __VLS_14({
    label: "评估方式",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_16.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.REVIEW_RULE_METHOD_LABELS[row.method]);
}
var __VLS_16;
const __VLS_17 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    label: "创建人",
    minWidth: "160",
}));
const __VLS_19 = __VLS_18({
    label: "创建人",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_20.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "creator-chip" },
    });
    if (row.creatorAvatar) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.img)({
            src: (row.creatorAvatar),
            alt: "",
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "creator-avatar" },
            'aria-hidden': "true",
        });
        (row.creator.slice(0, 1));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "creator-name" },
    });
    (row.creator);
}
var __VLS_20;
const __VLS_21 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    prop: "createdAt",
    label: "创建时间",
    minWidth: "160",
}));
const __VLS_23 = __VLS_22({
    prop: "createdAt",
    label: "创建时间",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
const __VLS_25 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    prop: "remark",
    label: "备注",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_27 = __VLS_26({
    prop: "remark",
    label: "备注",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
const __VLS_29 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    label: "操作",
    minWidth: "128",
    fixed: "right",
}));
const __VLS_31 = __VLS_30({
    label: "操作",
    minWidth: "128",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_32.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_32.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "row-actions" },
    });
    const __VLS_33 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_35 = __VLS_34({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    let __VLS_37;
    let __VLS_38;
    let __VLS_39;
    const __VLS_40 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('edit', row);
        }
    };
    __VLS_36.slots.default;
    var __VLS_36;
    /** @type {[typeof PerformanceDisabledReason, typeof PerformanceDisabledReason, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(PerformanceDisabledReason, new PerformanceDisabledReason({
        disabled: (!row.deletable),
        reason: "此评估规则已被使用，不允许删除",
    }));
    const __VLS_42 = __VLS_41({
        disabled: (!row.deletable),
        reason: "此评估规则已被使用，不允许删除",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    __VLS_43.slots.default;
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "delete-button" },
        disabled: (!row.deletable),
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "delete-button" },
        disabled: (!row.deletable),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleRemove(row);
        }
    };
    __VLS_47.slots.default;
    var __VLS_47;
    var __VLS_43;
}
var __VLS_32;
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['creator-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['creator-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['creator-name']} */ ;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceManagementTable: PerformanceManagementTable,
            PerformanceDisabledReason: PerformanceDisabledReason,
            REVIEW_RULE_METHOD_LABELS: REVIEW_RULE_METHOD_LABELS,
            emit: emit,
            handleRemove: handleRemove,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
