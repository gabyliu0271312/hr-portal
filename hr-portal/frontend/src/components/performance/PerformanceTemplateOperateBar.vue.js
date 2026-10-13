const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['template-operate__item']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__item']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__button']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-operate" },
    'data-ui-flow-id': "TemplateOperate",
});
for (const [action] of __VLS_getVForSourceType((__VLS_ctx.actions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (action.key),
        ...{ class: "template-operate__item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.$emit('action', action.key);
            } },
        ...{ class: "template-operate__button" },
        type: "button",
        'aria-label': (action.label),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "template-operate__icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M12 2a1 1 0 0 0-1 1v8H3a1 1 0 0 0 0 2h8v8a1 1 0 0 0 2 0v-8h8a1 1 0 0 0 0-2h-8V3a1 1 0 0 0-1-1Z",
        fill: "currentColor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (action.label);
}
/** @type {__VLS_StyleScopedClasses['template-operate']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__item']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__button']} */ ;
/** @type {__VLS_StyleScopedClasses['template-operate__icon']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {};
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
