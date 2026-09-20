import { ElButton } from 'element-plus';
import FilterOutlinedIcon from './FilterOutlinedIcon.vue';
import PerformanceSearchInput from './PerformanceSearchInput.vue';
const __VLS_props = defineProps();
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "list-toolbar" },
});
var __VLS_0 = {};
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-spacer" },
});
/** @type {[typeof PerformanceSearchInput, ]} */ ;
// @ts-ignore
const __VLS_2 = __VLS_asFunctionalComponent(PerformanceSearchInput, new PerformanceSearchInput({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.keyword),
    ...{ class: "search-input" },
    placeholder: (__VLS_ctx.searchPlaceholder || '通过名称、备注搜索'),
    'aria-label': (__VLS_ctx.searchPlaceholder || '通过名称、备注搜索'),
}));
const __VLS_3 = __VLS_2({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.keyword),
    ...{ class: "search-input" },
    placeholder: (__VLS_ctx.searchPlaceholder || '通过名称、备注搜索'),
    'aria-label': (__VLS_ctx.searchPlaceholder || '通过名称、备注搜索'),
}, ...__VLS_functionalComponentArgsRest(__VLS_2));
let __VLS_5;
let __VLS_6;
let __VLS_7;
const __VLS_8 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:keyword', $event);
    }
};
var __VLS_4;
const __VLS_9 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    ...{ 'onClick': {} },
    ...{ class: "filter-button" },
    'aria-label': "筛选",
}));
const __VLS_11 = __VLS_10({
    ...{ 'onClick': {} },
    ...{ class: "filter-button" },
    'aria-label': "筛选",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    onClick: (...[$event]) => {
        __VLS_ctx.emit('filter');
    }
};
__VLS_12.slots.default;
/** @type {[typeof FilterOutlinedIcon, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(FilterOutlinedIcon, new FilterOutlinedIcon({
    ...{ class: "filter-icon" },
}));
const __VLS_18 = __VLS_17({
    ...{ class: "filter-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
var __VLS_12;
/** @type {__VLS_StyleScopedClasses['list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-spacer']} */ ;
/** @type {__VLS_StyleScopedClasses['search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-button']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-icon']} */ ;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElButton: ElButton,
            FilterOutlinedIcon: FilterOutlinedIcon,
            PerformanceSearchInput: PerformanceSearchInput,
            emit: emit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
