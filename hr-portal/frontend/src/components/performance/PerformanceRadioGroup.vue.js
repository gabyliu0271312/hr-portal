/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = withDefaults(defineProps(), {
    name: 'performance-radio',
    disabled: false,
    gap: 24,
    ariaLabel: '',
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    name: 'performance-radio',
    disabled: false,
    gap: 24,
    ariaLabel: '',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['disabled']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-radio-group" },
    role: "radiogroup",
    'aria-label': (__VLS_ctx.ariaLabel),
    ...{ style: ({ gap: `${__VLS_ctx.gap}px` }) },
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        key: (option.value),
        ...{ class: "performance-radio-option" },
        ...{ class: ({ checked: __VLS_ctx.modelValue === option.value, disabled: __VLS_ctx.disabled }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.emit('update:modelValue', option.value);
            } },
        type: "radio",
        name: (__VLS_ctx.name),
        value: (option.value),
        checked: (__VLS_ctx.modelValue === option.value),
        disabled: (__VLS_ctx.disabled),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "radio-wallpaper" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "radio-label" },
    });
    (option.label);
    if (option.showInfo) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
            ...{ class: "info-icon" },
            width: "16",
            height: "16",
            viewBox: "0 0 24 24",
            fill: "none",
            xmlns: "http://www.w3.org/2000/svg",
            'data-icon': "InfoOutlined",
            'aria-hidden': "true",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
            d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 2C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm-1-7.5v-4a1 1 0 1 1 0-2h1.004c.55 0 .998.445.998.996.003 1.668-.002 3.336-.002 5.004h.5a1 1 0 1 1 0 2h-3a1 1 0 1 1 0-2h.5Zm1-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z",
            fill: "currentColor",
        });
    }
}
/** @type {__VLS_StyleScopedClasses['performance-radio-group']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-radio-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-wallpaper']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-label']} */ ;
/** @type {__VLS_StyleScopedClasses['info-icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
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
