/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { Refresh, Search } from '@element-plus/icons-vue';
import { reportsApi, } from '@/api/reports';
const props = defineProps();
const emit = defineEmits();
const loading = ref(false);
const error = ref('');
const items = ref([]);
const total = ref(0);
const page = ref(1);
const pageSize = ref(50);
const filters = reactive({});
let requestId = 0;
function idOf(column) {
    return column._instance_id || column.code;
}
const signature = computed(() => props.dimensions.map(idOf));
const matchSignature = computed(() => signature.value.filter((field) => !props.expandBy?.includes(field)));
function valueKey(value) {
    return `${value === null ? 'null' : typeof value}:${String(value)}`;
}
function tupleKey(values) {
    return matchSignature.value.map((field) => `${field}=${valueKey(values[field] ?? null)}`).join('|');
}
const visibleDimensions = computed(() => props.dimensions.filter((column) => !props.expandBy?.includes(idOf(column))));
const selectedKeys = computed(() => new Set(props.modelValue.map((item) => tupleKey(item.values))));
function valueLabel(value) {
    if (value === null)
        return '（NULL）';
    if (value === '')
        return '（空字符串）';
    if (typeof value === 'string' && value.trim() === '')
        return '（空白文本）';
    if (typeof value === 'string' && value === '0')
        return '"0"';
    return String(value);
}
async function load() {
    if (!props.datasetId || !signature.value.length)
        return;
    const current = ++requestId;
    loading.value = true;
    error.value = '';
    try {
        const result = await reportsApi.searchDimensionCombinations({
            report_id: props.reportId,
            dataset_id: props.datasetId,
            scope_strategy: props.scopeStrategy,
            config: props.config,
            dimension_signature: signature.value,
            expand_by: props.expandBy || [],
            dimension_filters: Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '')),
            page: page.value,
            page_size: pageSize.value,
        });
        if (current !== requestId)
            return;
        items.value = result.items;
        total.value = result.total;
    }
    catch (e) {
        if (current !== requestId)
            return;
        items.value = [];
        total.value = 0;
        error.value = e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || '加载完整维度组合失败';
    }
    finally {
        if (current === requestId)
            loading.value = false;
    }
}
function toggle(item) {
    const key = tupleKey(item.values);
    if (selectedKeys.value.has(key)) {
        emit('update:modelValue', props.modelValue.filter((source) => tupleKey(source.values) !== key));
    }
    else if (!item.occupied_by || item.occupied_by === props.currentRuleName) {
        emit('update:modelValue', [...props.modelValue, { values: { ...item.values } }]);
    }
}
function reset() {
    for (const key of Object.keys(filters))
        delete filters[key];
    page.value = 1;
    void load();
}
watch(() => [props.datasetId, signature.value.join('|'), (props.expandBy || []).join('|')], () => {
    page.value = 1;
    void load();
});
onMounted(load);
const __VLS_exposed = { reload: load };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['picker-head']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-head']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "combination-picker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "picker-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
(__VLS_ctx.expandBy?.length ? '来源匹配组合' : '来源完整组合');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.modelValue.length);
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
    loading: (__VLS_ctx.loading),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.load)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.expandBy?.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "expand-note" },
    });
    (__VLS_ctx.expandBy.map((field) => __VLS_ctx.dimensions.find((column) => __VLS_ctx.idOf(column) === field)?.label || field).join('、'));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-bar" },
});
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.visibleDimensions))) {
    const __VLS_8 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onKeyup': {} },
        key: (__VLS_ctx.idOf(column)),
        modelValue: (__VLS_ctx.filters[__VLS_ctx.idOf(column)]),
        clearable: true,
        placeholder: (column.label || column.code),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onKeyup': {} },
        key: (__VLS_ctx.idOf(column)),
        modelValue: (__VLS_ctx.filters[__VLS_ctx.idOf(column)]),
        clearable: true,
        placeholder: (column.label || column.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onKeyup: (...[$event]) => {
            __VLS_ctx.page = 1;
            __VLS_ctx.load();
        }
    };
    var __VLS_11;
}
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Search),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (...[$event]) => {
        __VLS_ctx.page = 1;
        __VLS_ctx.load();
    }
};
__VLS_19.slots.default;
var __VLS_19;
const __VLS_24 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (__VLS_ctx.reset)
};
__VLS_27.slots.default;
var __VLS_27;
if (__VLS_ctx.error) {
    const __VLS_32 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        type: "error",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_34 = __VLS_33({
        type: "error",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_35.slots;
        (__VLS_ctx.error);
    }
    const __VLS_36 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_39.slots.default;
    var __VLS_39;
    var __VLS_35;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_44 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    data: (__VLS_ctx.items),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_46 = __VLS_45({
    data: (__VLS_ctx.items),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_47.slots.default;
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.visibleDimensions))) {
    const __VLS_48 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        key: (__VLS_ctx.idOf(column)),
        label: (column.label || column.code),
        minWidth: "140",
    }));
    const __VLS_50 = __VLS_49({
        key: (__VLS_ctx.idOf(column)),
        label: (column.label || column.code),
        minWidth: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_51.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.valueLabel(row.display_values[__VLS_ctx.idOf(column)]));
    }
    var __VLS_51;
}
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "状态",
    minWidth: "160",
}));
const __VLS_54 = __VLS_53({
    label: "状态",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.occupied_by && row.occupied_by !== __VLS_ctx.currentRuleName) {
        const __VLS_56 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            type: "warning",
            effect: "plain",
        }));
        const __VLS_58 = __VLS_57({
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        __VLS_59.slots.default;
        (row.occupied_by);
        var __VLS_59;
    }
    else if (__VLS_ctx.selectedKeys.has(__VLS_ctx.tupleKey(row.values))) {
        const __VLS_60 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            type: "primary",
            effect: "plain",
        }));
        const __VLS_62 = __VLS_61({
            type: "primary",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        __VLS_63.slots.default;
        var __VLS_63;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
}
var __VLS_55;
const __VLS_64 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "操作",
    width: "120",
    fixed: "right",
}));
const __VLS_66 = __VLS_65({
    label: "操作",
    width: "120",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_67.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_68 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        ...{ 'onClick': {} },
        link: true,
        type: (__VLS_ctx.selectedKeys.has(__VLS_ctx.tupleKey(row.values)) ? 'danger' : 'primary'),
        disabled: (!!row.occupied_by && row.occupied_by !== __VLS_ctx.currentRuleName),
    }));
    const __VLS_70 = __VLS_69({
        ...{ 'onClick': {} },
        link: true,
        type: (__VLS_ctx.selectedKeys.has(__VLS_ctx.tupleKey(row.values)) ? 'danger' : 'primary'),
        disabled: (!!row.occupied_by && row.occupied_by !== __VLS_ctx.currentRuleName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    let __VLS_72;
    let __VLS_73;
    let __VLS_74;
    const __VLS_75 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggle(row);
        }
    };
    __VLS_71.slots.default;
    (__VLS_ctx.selectedKeys.has(__VLS_ctx.tupleKey(row.values)) ? '移除' : '选择');
    var __VLS_71;
}
var __VLS_67;
var __VLS_47;
const __VLS_76 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next",
}));
const __VLS_78 = __VLS_77({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    currentPage: (__VLS_ctx.page),
    pageSize: (__VLS_ctx.pageSize),
    total: (__VLS_ctx.total),
    pageSizes: ([20, 50, 100]),
    layout: "total, sizes, prev, pager, next",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onCurrentChange: (__VLS_ctx.load)
};
const __VLS_84 = {
    onSizeChange: (...[$event]) => {
        __VLS_ctx.page = 1;
        __VLS_ctx.load();
    }
};
var __VLS_79;
/** @type {__VLS_StyleScopedClasses['combination-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-head']} */ ;
/** @type {__VLS_StyleScopedClasses['expand-note']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            Search: Search,
            loading: loading,
            error: error,
            items: items,
            total: total,
            page: page,
            pageSize: pageSize,
            filters: filters,
            idOf: idOf,
            tupleKey: tupleKey,
            visibleDimensions: visibleDimensions,
            selectedKeys: selectedKeys,
            valueLabel: valueLabel,
            load: load,
            toggle: toggle,
            reset: reset,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
