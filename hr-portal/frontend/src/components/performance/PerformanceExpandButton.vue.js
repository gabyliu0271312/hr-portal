/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = withDefaults(defineProps(), {
    disabled: false,
    iconVariant: 'bold',
    variant: 'button',
});
const emit = defineEmits();
const renderTag = computed(() => props.variant === 'navigation' ? 'span' : 'button');
const iconName = computed(() => {
    if (props.variant === 'navigation')
        return 'DownOutlined';
    return props.iconVariant === 'regular' ? (props.expanded ? 'UpOutlined' : 'DownOutlined') : (props.expanded ? 'UpBoldOutlined' : 'DownBoldOutlined');
});
const collapsedPath = computed(() => props.iconVariant === 'regular'
    ? 'M2.293 7.707a1 1 0 0 1 1.414 0L12 16l8.293-8.293a1 1 0 1 1 1.414 1.414l-8.293 8.293a2 2 0 0 1-2.828 0L2.293 9.121a1 1 0 0 1 0-1.414Z'
    : 'm3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z');
const expandedPath = computed(() => props.iconVariant === 'regular'
    ? 'M2.293 16.293a1 1 0 0 1 1.414 0L12 8l8.293 8.293a1 1 0 1 1 1.414-1.414L13.414 6.586a2 2 0 0 0-2.828 0l-8.293 8.293a1 1 0 0 0 0 1.414Z'
    : 'm3.414 16.914-.707-.707a1 1 0 0 1 0-1.414l7.778-7.778a2 2 0 0 1 2.829 0l7.778 7.778a1 1 0 0 1 0 1.414l-.707.707a1 1 0 0 1-1.415 0l-7.07-7.07-7.072 7.07a1 1 0 0 1-1.414 0Z');
const iconPath = computed(() => props.variant === 'navigation' ? collapsedPath.value : (props.expanded ? expandedPath.value : collapsedPath.value));
const iconStyle = computed(() => props.variant === 'navigation' ? { transform: props.expanded ? 'rotate(180deg)' : 'none' } : undefined);
function handleClick() {
    if (!props.disabled)
        emit('toggle');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    disabled: false,
    iconVariant: 'bold',
    variant: 'button',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-navigation']} */ ;
/** @type {__VLS_StyleScopedClasses['is-active']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
/** @type {__VLS_StyleScopedClasses['is-navigation']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = ((__VLS_ctx.renderTag));
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ 'onKeydown': {} },
    ...{ 'onKeydown': {} },
    ...{ class: "performance-icon-button performance-expand-button" },
    ...{ class: ({ 'is-active': __VLS_ctx.expanded, 'is-navigation': __VLS_ctx.variant === 'navigation' }) },
    type: (__VLS_ctx.renderTag === 'button' ? 'button' : undefined),
    'aria-label': (__VLS_ctx.label),
    'aria-expanded': (__VLS_ctx.expanded),
    'aria-disabled': (__VLS_ctx.disabled || undefined),
    tabindex: (__VLS_ctx.renderTag === 'span' ? (__VLS_ctx.disabled ? -1 : 0) : undefined),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ 'onKeydown': {} },
    ...{ 'onKeydown': {} },
    ...{ class: "performance-icon-button performance-expand-button" },
    ...{ class: ({ 'is-active': __VLS_ctx.expanded, 'is-navigation': __VLS_ctx.variant === 'navigation' }) },
    type: (__VLS_ctx.renderTag === 'button' ? 'button' : undefined),
    'aria-label': (__VLS_ctx.label),
    'aria-expanded': (__VLS_ctx.expanded),
    'aria-disabled': (__VLS_ctx.disabled || undefined),
    tabindex: (__VLS_ctx.renderTag === 'span' ? (__VLS_ctx.disabled ? -1 : 0) : undefined),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.handleClick)
};
const __VLS_8 = {
    onKeydown: (__VLS_ctx.handleClick)
};
const __VLS_9 = {
    onKeydown: (__VLS_ctx.handleClick)
};
var __VLS_10 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
    'data-icon': (__VLS_ctx.iconName),
    ...{ style: (__VLS_ctx.iconStyle) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.iconPath),
    fill: "currentColor",
});
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-expand-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            renderTag: renderTag,
            iconName: iconName,
            iconPath: iconPath,
            iconStyle: iconStyle,
            handleClick: handleClick,
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
