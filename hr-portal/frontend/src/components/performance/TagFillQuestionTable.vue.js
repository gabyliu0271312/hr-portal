import PerformanceManagementTable from './PerformanceManagementTable.vue';
const __VLS_props = withDefaults(defineProps(), {
    loading: false,
    page: 1,
    pageSize: 10,
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    loading: false,
    page: 1,
    pageSize: 10,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof PerformanceManagementTable, typeof PerformanceManagementTable, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceManagementTable, new PerformanceManagementTable({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rows: (__VLS_ctx.questions),
    loading: (__VLS_ctx.loading),
    loadingText: "正在加载标签型填写题...",
    emptyText: "暂无标签型填写题",
    tableAriaLabel: "标签型填写题表格",
    paginationAriaLabel: "标签型填写题分页",
    page: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onPageChange': {} },
    ...{ 'onPageSizeChange': {} },
    rows: (__VLS_ctx.questions),
    loading: (__VLS_ctx.loading),
    loadingText: "正在加载标签型填写题...",
    emptyText: "暂无标签型填写题",
    tableAriaLabel: "标签型填写题表格",
    paginationAriaLabel: "标签型填写题分页",
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
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_11 = __VLS_10({
    prop: "name",
    label: "名称",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
const __VLS_13 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    prop: "creator",
    label: "创建人",
    minWidth: "320",
    showOverflowTooltip: true,
}));
const __VLS_15 = __VLS_14({
    prop: "creator",
    label: "创建人",
    minWidth: "320",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
const __VLS_17 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    prop: "createdAt",
    label: "创建时间",
    minWidth: "320",
}));
const __VLS_19 = __VLS_18({
    prop: "createdAt",
    label: "创建时间",
    minWidth: "320",
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
const __VLS_21 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    prop: "remark",
    label: "备注",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_23 = __VLS_22({
    prop: "remark",
    label: "备注",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
const __VLS_25 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    label: "操作",
    minWidth: "160",
    fixed: "right",
}));
const __VLS_27 = __VLS_26({
    label: "操作",
    minWidth: "160",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_28.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_28.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "row-actions" },
    });
    const __VLS_29 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_31 = __VLS_30({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    let __VLS_33;
    let __VLS_34;
    let __VLS_35;
    const __VLS_36 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('edit', row);
        }
    };
    __VLS_32.slots.default;
    var __VLS_32;
    const __VLS_37 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "delete-button" },
    }));
    const __VLS_39 = __VLS_38({
        ...{ 'onClick': {} },
        link: true,
        ...{ class: "delete-button" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    let __VLS_41;
    let __VLS_42;
    let __VLS_43;
    const __VLS_44 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('remove', row);
        }
    };
    __VLS_40.slots.default;
    var __VLS_40;
}
var __VLS_28;
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['row-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceManagementTable: PerformanceManagementTable,
            emit: emit,
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
