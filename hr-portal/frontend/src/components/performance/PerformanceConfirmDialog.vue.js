import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
const props = withDefaults(defineProps(), {
    message: '后续配置项目将无法使用该模板，确定删除吗？',
    loading: false,
});
const emit = defineEmits();
const cancelRef = ref(null);
const confirmRef = ref(null);
let returnFocus = null;
let previousOverflow = '';
function restorePage() {
    document.body.style.overflow = previousOverflow;
    void nextTick(() => returnFocus?.focus());
}
function cancel() {
    if (props.loading)
        return;
    emit('update:modelValue', false);
}
function onKeydown(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        cancel();
        return;
    }
    if (event.key !== 'Tab')
        return;
    const first = cancelRef.value;
    const last = confirmRef.value;
    if (!first || !last)
        return;
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    }
    else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}
watch(() => props.modelValue, (visible) => {
    if (visible) {
        returnFocus = document.activeElement;
        previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        void nextTick(() => cancelRef.value?.focus());
    }
    else {
        restorePage();
    }
}, { immediate: true });
onBeforeUnmount(() => {
    if (props.modelValue)
        restorePage();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    message: '后续配置项目将无法使用该模板，确定删除吗？',
    loading: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button--cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button--danger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button']} */ ;
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
if (__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (__VLS_ctx.cancel) },
        ...{ class: "performance-confirm-overlay" },
        'data-source-state-id': "user-snapspec-20260831-template-delete-confirm",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ onKeydown: (__VLS_ctx.onKeydown) },
        ...{ class: "performance-confirm-dialog" },
        role: "alertdialog",
        'aria-modal': "true",
        'aria-labelledby': "performance-confirm-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "performance-confirm-dialog__header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        id: "performance-confirm-title",
        ...{ class: "performance-confirm-dialog__title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "performance-confirm-dialog__icon" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "24",
        height: "24",
        viewBox: "0 0 24 24",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        'data-icon': "WarningFilled",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M23 12c0 6.075-4.925 11-11 11S1 18.075 1 12 5.925 1 12 1s11 4.925 11 11ZM12 7a1 1 0 0 0-1 1v5a1 1 0 1 0 2 0V8a1 1 0 0 0-1-1Zm0 8a1 1 0 1 0 0 2 1 1 0 0 0 0-2Z",
        fill: "currentColor",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "performance-confirm-dialog__title-content" },
    });
    (__VLS_ctx.message);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "performance-confirm-dialog__footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.cancel) },
        ref: "cancelRef",
        ...{ class: "performance-confirm-dialog__button performance-confirm-dialog__button--cancel" },
        type: "button",
        disabled: (__VLS_ctx.loading),
    });
    /** @type {typeof __VLS_ctx.cancelRef} */ ;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.modelValue))
                    return;
                __VLS_ctx.$emit('confirm');
            } },
        ref: "confirmRef",
        ...{ class: "performance-confirm-dialog__button performance-confirm-dialog__button--danger" },
        type: "button",
        disabled: (__VLS_ctx.loading),
        'aria-busy': (__VLS_ctx.loading),
    });
    /** @type {typeof __VLS_ctx.confirmRef} */ ;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['performance-confirm-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__header']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__title']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__title-content']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__footer']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button--cancel']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-confirm-dialog__button--danger']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            cancelRef: cancelRef,
            confirmRef: confirmRef,
            cancel: cancel,
            onKeydown: onKeydown,
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
