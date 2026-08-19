/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { pushTargetsApi } from '@/api/push_targets';
const props = defineProps();
const emit = defineEmits();
const filters = ref([]);
const loading = ref(false);
watch(() => props.sourceTable, async (sourceTable) => {
    if (!sourceTable) {
        filters.value = [];
        return;
    }
    loading.value = true;
    try {
        filters.value = await pushTargetsApi.queryParameterMetadata(sourceTable);
    }
    catch {
        filters.value = [];
    }
    finally {
        loading.value = false;
    }
}, { immediate: true });
const selectedColumns = computed(() => new Set(props.modelValue.map((item) => item.column)));
function update(value) {
    emit('update:modelValue', value);
}
function addParameter() {
    const filter = filters.value.find((item) => !selectedColumns.value.has(item.column));
    if (!filter) {
        ElMessage.warning('没有可新增的筛选字段');
        return;
    }
    update([...props.modelValue, { column: filter.column, required: false }]);
}
function removeParameter(index) {
    update(props.modelValue.filter((_, current) => current !== index));
}
function optionsFor(currentColumn) {
    return filters.value.filter((item) => item.column === currentColumn || !selectedColumns.value.has(item.column));
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_0 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
var __VLS_3;
for (const [item, index] of __VLS_getVForSourceType((__VLS_ctx.modelValue))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.column),
        ...{ class: "parameter-row" },
    });
    const __VLS_4 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        modelValue: (item.column),
        placeholder: "选择筛选字段",
        ...{ style: {} },
    }));
    const __VLS_6 = __VLS_5({
        modelValue: (item.column),
        placeholder: "选择筛选字段",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    for (const [filter] of __VLS_getVForSourceType((__VLS_ctx.optionsFor(item.column)))) {
        const __VLS_8 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            key: (filter.column),
            label: (filter.label),
            value: (filter.column),
        }));
        const __VLS_10 = __VLS_9({
            key: (filter.column),
            label: (filter.label),
            value: (filter.column),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    }
    var __VLS_7;
    const __VLS_12 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        modelValue: (item.required),
        activeText: "必填",
        inactiveText: "可选",
    }));
    const __VLS_14 = __VLS_13({
        modelValue: (item.required),
        activeText: "必填",
        inactiveText: "可选",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    const __VLS_16 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeParameter(index);
        }
    };
    __VLS_19.slots.default;
    var __VLS_19;
}
const __VLS_24 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.loading),
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (__VLS_ctx.addParameter)
};
__VLS_27.slots.default;
var __VLS_27;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['parameter-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            loading: loading,
            addParameter: addParameter,
            removeParameter: removeParameter,
            optionsFor: optionsFor,
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
