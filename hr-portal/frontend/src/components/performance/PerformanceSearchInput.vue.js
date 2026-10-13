/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import SearchOutlinedIcon from './SearchOutlinedIcon.vue';
const __VLS_props = withDefaults(defineProps(), {
    width: '224px',
    ariaLabel: '搜索',
    disabled: false,
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    width: '224px',
    ariaLabel: '搜索',
    disabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "performance-search-input" },
    ...{ style: ({ width: __VLS_ctx.width }) },
});
/** @type {[typeof SearchOutlinedIcon, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(SearchOutlinedIcon, new SearchOutlinedIcon({
    ...{ class: "search-icon" },
}));
const __VLS_1 = __VLS_0({
    ...{ class: "search-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.emit('update:modelValue', $event.target.value);
        } },
    ...{ onKeyup: (...[$event]) => {
            __VLS_ctx.emit('search');
        } },
    value: (__VLS_ctx.modelValue),
    placeholder: (__VLS_ctx.placeholder),
    'aria-label': (__VLS_ctx.ariaLabel),
    disabled: (__VLS_ctx.disabled),
});
if (__VLS_ctx.modelValue && !__VLS_ctx.disabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.modelValue && !__VLS_ctx.disabled))
                    return;
                __VLS_ctx.emit('update:modelValue', '');
                __VLS_ctx.emit('clear');
            } },
        type: "button",
        'aria-label': "清除搜索",
    });
}
/** @type {__VLS_StyleScopedClasses['performance-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['search-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SearchOutlinedIcon: SearchOutlinedIcon,
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
