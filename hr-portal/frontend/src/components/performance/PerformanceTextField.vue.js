const props = withDefaults(defineProps(), {
    type: 'input',
    width: '100%',
    maxlength: undefined,
    inputId: undefined,
    placeholder: '',
    showCount: false,
    disabled: false,
    invalid: false,
    variant: 'default',
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    type: 'input',
    width: '100%',
    maxlength: undefined,
    inputId: undefined,
    placeholder: '',
    showCount: false,
    disabled: false,
    invalid: false,
    variant: 'default',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-text-field" },
    ...{ class: ({ 'is-textarea': __VLS_ctx.type === 'textarea', 'is-feishu-input': __VLS_ctx.variant === 'feishu-input', 'is-fixed-score': __VLS_ctx.variant === 'fixed-score' }) },
    ...{ style: ({ width: __VLS_ctx.width }) },
});
if (__VLS_ctx.type === 'input' && __VLS_ctx.variant === 'feishu-input') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "feishu-input-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "feishu-input-placeholder-wrapper" },
    });
    if (!__VLS_ctx.modelValue && __VLS_ctx.placeholder) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "feishu-input-placeholder" },
        });
        (__VLS_ctx.placeholder);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                if (!(__VLS_ctx.type === 'input' && __VLS_ctx.variant === 'feishu-input'))
                    return;
                __VLS_ctx.emit('update:modelValue', $event.target.value);
            } },
        ...{ class: "native-input" },
        ...{ class: ({ error: __VLS_ctx.invalid }) },
        id: (__VLS_ctx.inputId),
        value: (__VLS_ctx.modelValue),
        maxlength: (__VLS_ctx.maxlength),
        disabled: (__VLS_ctx.disabled),
        'aria-invalid': (__VLS_ctx.invalid || undefined),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "feishu-input-suffix" },
        'aria-hidden': "true",
    });
}
else if (__VLS_ctx.type === 'input') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                if (!!(__VLS_ctx.type === 'input' && __VLS_ctx.variant === 'feishu-input'))
                    return;
                if (!(__VLS_ctx.type === 'input'))
                    return;
                __VLS_ctx.emit('update:modelValue', $event.target.value);
            } },
        ...{ class: "native-input" },
        ...{ class: ({ error: __VLS_ctx.invalid }) },
        id: (__VLS_ctx.inputId),
        value: (__VLS_ctx.modelValue),
        maxlength: (__VLS_ctx.maxlength),
        placeholder: (__VLS_ctx.placeholder),
        disabled: (__VLS_ctx.disabled),
        'aria-invalid': (__VLS_ctx.invalid || undefined),
    });
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        ...{ onInput: (...[$event]) => {
                if (!!(__VLS_ctx.type === 'input' && __VLS_ctx.variant === 'feishu-input'))
                    return;
                if (!!(__VLS_ctx.type === 'input'))
                    return;
                __VLS_ctx.emit('update:modelValue', $event.target.value);
            } },
        ...{ class: "native-textarea" },
        ...{ class: ({ error: __VLS_ctx.invalid }) },
        id: (__VLS_ctx.inputId),
        value: (__VLS_ctx.modelValue),
        maxlength: (__VLS_ctx.maxlength),
        placeholder: (__VLS_ctx.placeholder),
        disabled: (__VLS_ctx.disabled),
        'aria-invalid': (__VLS_ctx.invalid || undefined),
    });
}
if (__VLS_ctx.type === 'textarea' && __VLS_ctx.showCount && __VLS_ctx.maxlength) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "count" },
    });
    (__VLS_ctx.modelValue.length);
    (__VLS_ctx.maxlength);
}
/** @type {__VLS_StyleScopedClasses['performance-text-field']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-placeholder-wrapper']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['feishu-input-suffix']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['count']} */ ;
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
