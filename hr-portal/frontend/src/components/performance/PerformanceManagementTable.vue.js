/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ElOption, ElSelect, ElTable } from 'element-plus';
import { computed } from 'vue';
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue';
const props = withDefaults(defineProps(), {
    page: 1,
    pageSize: 10,
});
const emit = defineEmits();
const totalCount = computed(() => props.total ?? props.rows.length);
const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / props.pageSize)));
const tableRows = computed(() => props.rows);
function changePage(page) {
    if (page >= 1 && page <= pageCount.value && page !== props.page)
        emit('page-change', page);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    page: 1,
    pageSize: 10,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['pagination-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['page-current']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table__cell']} */ ;
/** @type {__VLS_StyleScopedClasses['el-table__cell']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-management-table" },
    'aria-label': (__VLS_ctx.tableAriaLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table-scroll" },
});
const __VLS_0 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    data: (__VLS_ctx.tableRows),
    ...{ style: {} },
    rowKey: "id",
    tableLayout: "fixed",
}));
const __VLS_2 = __VLS_1({
    data: (__VLS_ctx.tableRows),
    ...{ style: {} },
    rowKey: "id",
    tableLayout: "fixed",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
var __VLS_4 = {};
{
    const { empty: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "table-state" },
        role: (__VLS_ctx.loading ? 'status' : undefined),
    });
    (__VLS_ctx.loading ? __VLS_ctx.loadingText : __VLS_ctx.emptyText);
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table-pagination" },
    'aria-label': (__VLS_ctx.paginationAriaLabel),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "pagination-total" },
});
(__VLS_ctx.totalCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.changePage(__VLS_ctx.page - 1);
        } },
    ...{ class: "pagination-arrow" },
    type: "button",
    'aria-label': "上一页",
    disabled: (__VLS_ctx.page <= 1),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
    'data-icon': "LeftBoldOutlined",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m16.314 3.515-.707-.707a1 1 0 0 0-1.414 0l-7.779 7.778a2 2 0 0 0 0 2.829l7.779 7.778a1 1 0 0 0 1.414 0l.707-.707a1 1 0 0 0 0-1.414L9.243 12l7.07-7.072a1 1 0 0 0 0-1.414Z",
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ class: "page-current" },
    type: "button",
    'aria-current': "page",
});
(__VLS_ctx.page);
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.changePage(__VLS_ctx.page + 1);
        } },
    ...{ class: "pagination-arrow" },
    type: "button",
    'aria-label': "下一页",
    disabled: (__VLS_ctx.page >= __VLS_ctx.pageCount),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    viewBox: "0 0 24 24",
    'aria-hidden': "true",
    'data-icon': "RightBoldOutlined",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "m7.586 20.486.707.707a1 1 0 0 0 1.414 0l7.778-7.778a2 2 0 0 0 0-2.829L9.707 2.808a1 1 0 0 0-1.414 0l-.707.707a1 1 0 0 0 0 1.414l7.07 7.072-7.07 7.07a1 1 0 0 0 0 1.415Z",
    fill: "currentColor",
});
const __VLS_6 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
    ...{ 'onChange': {} },
    ...{ class: "page-size-select" },
    modelValue: (__VLS_ctx.pageSize),
    suffixIcon: (__VLS_ctx.DownBoldOutlinedIcon),
    size: "small",
    'aria-label': "每页条数",
}));
const __VLS_8 = __VLS_7({
    ...{ 'onChange': {} },
    ...{ class: "page-size-select" },
    modelValue: (__VLS_ctx.pageSize),
    suffixIcon: (__VLS_ctx.DownBoldOutlinedIcon),
    size: "small",
    'aria-label': "每页条数",
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_10;
let __VLS_11;
let __VLS_12;
const __VLS_13 = {
    onChange: (...[$event]) => {
        __VLS_ctx.emit('page-size-change', $event);
    }
};
__VLS_9.slots.default;
for (const [size] of __VLS_getVForSourceType(([10, 20, 50, 100]))) {
    const __VLS_14 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
        key: (size),
        label: (`${size} 条/页`),
        value: (size),
    }));
    const __VLS_16 = __VLS_15({
        key: (size),
        label: (`${size} 条/页`),
        value: (size),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
}
var __VLS_9;
/** @type {__VLS_StyleScopedClasses['performance-management-table']} */ ;
/** @type {__VLS_StyleScopedClasses['table-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['table-state']} */ ;
/** @type {__VLS_StyleScopedClasses['table-pagination']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-total']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['page-current']} */ ;
/** @type {__VLS_StyleScopedClasses['pagination-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['page-size-select']} */ ;
// @ts-ignore
var __VLS_5 = __VLS_4;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElOption: ElOption,
            ElSelect: ElSelect,
            ElTable: ElTable,
            DownBoldOutlinedIcon: DownBoldOutlinedIcon,
            emit: emit,
            totalCount: totalCount,
            pageCount: pageCount,
            tableRows: tableRows,
            changePage: changePage,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
