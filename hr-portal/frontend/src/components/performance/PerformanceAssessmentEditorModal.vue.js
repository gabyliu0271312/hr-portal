/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
const __VLS_props = withDefaults(defineProps(), { chrome: true });
const __VLS_emit = defineEmits();
const modalRef = ref(null);
const closeRef = ref(null);
const __VLS_exposed = { modalRef, closeRef };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ chrome: true });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal__header']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal__close']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: () => { } },
        ...{ class: "performance-editor-modal-layer modal-layer" },
        ...{ class: ({ 'is-sorting': __VLS_ctx.sorting }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onKeydown: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.$emit('keydown', $event);
            } },
        ref: "modalRef",
        ...{ class: "performance-editor-modal content-modal" },
        ...{ class: ([`performance-editor-modal--${__VLS_ctx.type}`, `content-modal--${__VLS_ctx.type}`]) },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': (`${__VLS_ctx.type}-title`),
    });
    /** @type {typeof __VLS_ctx.modalRef} */ ;
    if (__VLS_ctx.chrome) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "performance-editor-modal__header modal-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
            id: (`${__VLS_ctx.type}-title`),
        });
        (__VLS_ctx.mode === 'edit' ? '&#x7F16;&#x8F91;' : '&#x65B0;&#x5EFA;');
        (__VLS_ctx.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    if (!(__VLS_ctx.chrome))
                        return;
                    __VLS_ctx.$emit('close');
                } },
            ref: "closeRef",
            ...{ class: "performance-editor-modal__close icon-button" },
            type: "button",
            'aria-label': "Close editor",
        });
        /** @type {typeof __VLS_ctx.closeRef} */ ;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            'aria-hidden': "true",
        });
    }
    var __VLS_4 = {};
    if (__VLS_ctx.chrome) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
            ...{ class: "performance-editor-modal__footer modal-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    if (!(__VLS_ctx.chrome))
                        return;
                    __VLS_ctx.$emit('close');
                } },
            ...{ class: "button button--secondary" },
            type: "button",
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    if (!(__VLS_ctx.chrome))
                        return;
                    __VLS_ctx.$emit('confirm');
                } },
            ...{ class: "button button--primary" },
            type: "button",
        });
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['content-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal__header']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal__close']} */ ;
/** @type {__VLS_StyleScopedClasses['icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-editor-modal__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['button']} */ ;
/** @type {__VLS_StyleScopedClasses['button--primary']} */ ;
// @ts-ignore
var __VLS_5 = __VLS_4;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            modalRef: modalRef,
            closeRef: closeRef,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
