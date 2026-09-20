const __VLS_props = withDefaults(defineProps(), {
    dragging: false,
    disabled: false,
    variant: 'compact',
});
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    dragging: false,
    disabled: false,
    variant: 'compact',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['universe-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onPointerdown: (...[$event]) => {
            __VLS_ctx.$emit('pointerdown', $event);
        } },
    ...{ class: "performance-drag-handle" },
    ...{ class: ([`is-${__VLS_ctx.variant}`, { 'is-dragging': __VLS_ctx.dragging, 'is-disabled': __VLS_ctx.disabled }]) },
    role: "button",
    tabindex: (__VLS_ctx.disabled ? -1 : 0),
    'aria-label': (__VLS_ctx.label),
    'aria-disabled': (__VLS_ctx.disabled || undefined),
    'data-drag-state': (__VLS_ctx.dragging ? 'grabbing' : 'grab'),
    'data-drag-handle': true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "universe-icon align-top text-16 text-N-600" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "1em",
    height: "1em",
    viewBox: "0 0 24 24",
    fill: "none",
    'data-icon': "DragOutlined",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M10 4.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 4.75a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM10 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM10 19.25a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0ZM18.25 19.25a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 1 1 3.5 0Z",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['performance-drag-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['universe-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['align-top']} */ ;
/** @type {__VLS_StyleScopedClasses['text-16']} */ ;
/** @type {__VLS_StyleScopedClasses['text-N-600']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
