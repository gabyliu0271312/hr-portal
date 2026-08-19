/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatReportValue } from '@/utils/reportNumberFormat';
const props = defineProps();
const emit = defineEmits();
const NUMERIC_TYPES = new Set(['integer', 'number', 'decimal', 'float', 'double', 'numeric']);
function formatCell(row, col) {
    const v = row[col.code];
    if (v === null || v === undefined || v === '') {
        return NUMERIC_TYPES.has(col.data_type) ? formatReportValue(0, props.columnSettings?.[col.code]?.display_format) : '—';
    }
    if (NUMERIC_TYPES.has(col.data_type)) {
        return formatReportValue(v, props.columnSettings?.[col.code]?.display_format);
    }
    return String(v);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['report-preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['is-fill-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['report-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['report-result-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-result-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-result-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['is-fill-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['report-table-pagination']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-preview-table" },
    ...{ class: ({ 'is-fill-viewport': __VLS_ctx.fillViewport }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "report-table-shell" },
});
const __VLS_0 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
    ...{ class: "report-result-table" },
    ...{ style: {} },
    height: (__VLS_ctx.height ?? (__VLS_ctx.fillViewport ? '100%' : undefined)),
    maxHeight: (__VLS_ctx.height || __VLS_ctx.fillViewport ? undefined : (__VLS_ctx.maxHeight ?? 400)),
}));
const __VLS_2 = __VLS_1({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
    ...{ class: "report-result-table" },
    ...{ style: {} },
    height: (__VLS_ctx.height ?? (__VLS_ctx.fillViewport ? '100%' : undefined)),
    maxHeight: (__VLS_ctx.height || __VLS_ctx.fillViewport ? undefined : (__VLS_ctx.maxHeight ?? 400)),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_3.slots.default;
for (const [col] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
    const __VLS_4 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (col.code),
        label: (col.label),
        prop: (col.code),
        minWidth: "140",
    }));
    const __VLS_6 = __VLS_5({
        key: (col.code),
        label: (col.label),
        prop: (col.code),
        minWidth: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_7.slots;
        (col.label);
        if (col.is_sensitive) {
            const __VLS_8 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                size: "small",
                type: "danger",
                effect: "plain",
                ...{ style: {} },
            }));
            const __VLS_10 = __VLS_9({
                size: "small",
                type: "danger",
                effect: "plain",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_9));
            __VLS_11.slots.default;
            var __VLS_11;
        }
    }
    {
        const { default: __VLS_thisSlot } = __VLS_7.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (col.is_sensitive) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.formatCell(row, col));
        }
    }
    var __VLS_7;
}
{
    const { empty: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
var __VLS_3;
const __VLS_12 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "report-table-pagination" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: (__VLS_ctx.pageSizes ?? [20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ class: "report-table-pagination" },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: (__VLS_ctx.pageSizes ?? [20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onCurrentChange: ((v) => { __VLS_ctx.emit('update:page', v); __VLS_ctx.emit('page-change'); })
};
const __VLS_20 = {
    onSizeChange: ((v) => { __VLS_ctx.emit('update:pageSize', v); __VLS_ctx.emit('page-change'); })
};
var __VLS_15;
/** @type {__VLS_StyleScopedClasses['report-preview-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-table-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['report-result-table']} */ ;
/** @type {__VLS_StyleScopedClasses['report-table-pagination']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            formatCell: formatCell,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
