/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
const paths = {
    DownBoldOutlined: 'm5 9 7 7 7-7',
    UpBoldOutlined: 'm5 15 7-7 7 7',
    SpaceUpOutlined: 'M12.707 2.293a1 1 0 0 0-1.414 0l-7 7a1 1 0 0 0 1.414 1.414L11 5.414V22a1 1 0 1 0 2 0V5.414l5.293 5.293a1 1 0 0 0 1.414-1.414l-7-7Z',
    SpaceDownOutlined: 'M11.293 21.707a1 1 0 0 0 1.414 0l7-7a1 1 0 0 0-1.414-1.414L13 18.586V2a1 1 0 1 0-2 0v16.586l-5.293-5.293a1 1 0 0 0-1.414 1.414l7 7Z',
    EditOutlined: 'm17.57 7.244-.006-.006.37-.37a1 1 0 0 0 .001-1.412l-3.434-3.453-.002-.002a1 1 0 0 0-1.414 0l-.705.706.01.01L2 13.186V17a1 1 0 0 0 1 1h3.814L17.57 7.244Zm-3.273.389-2.015-2.015 1.487-1.515 2.023 2.034-1.495 1.496Zm-3.415-.587 2.002 2.002-6.913 6.92h-.004l-1.934-1.935v-.003l6.849-6.984ZM3 20a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Z',
    DeleteTrashOutlined: 'M8 4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2h5a1 1 0 1 1 0 2h-1v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6H3a1 1 0 0 1 0-2h5ZM6 6v14h12V6H6Zm4 3a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Zm4 0a1 1 0 1 1 1 1v6a1 1 0 1 1-2 0v-6a1 1 0 0 1 1-1Z',
    CloseOutlined: 'm6 6 12 12M18 6 6 18',
    DragOutlined: 'M8.25 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm0 7.25a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm1.75 5.5a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0ZM14.753 6.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5ZM16.5 12a1.75 1.75 0 1 1-3.5 0 1.75 1.75 0 0 1 3.5 0Zm-1.747 9a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
    more: 'M5 12h14',
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.$emit('click', $event);
        } },
    ...{ class: "performance-icon-button" },
    ...{ class: ({ 'is-active': __VLS_ctx.active, 'is-disabled': __VLS_ctx.disabled }) },
    type: "button",
    'aria-label': (__VLS_ctx.label),
    'aria-expanded': (__VLS_ctx.expanded === undefined ? undefined : __VLS_ctx.expanded),
    disabled: (__VLS_ctx.disabled),
    'data-icon': (__VLS_ctx.icon),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
    'data-icon': (__VLS_ctx.icon),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: (__VLS_ctx.paths[__VLS_ctx.icon] || __VLS_ctx.paths.more),
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            paths: paths,
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
