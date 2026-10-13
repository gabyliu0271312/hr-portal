import { ref } from 'vue';
const __VLS_props = withDefaults(defineProps(), { inputId: undefined, placeholder: 'YYYY-MM-DD HH:MM', required: false, disabled: false, ariaLabel: '', invalid: false, describedBy: '' });
const emit = defineEmits();
const input = ref(null);
function openPicker() {
    if (!input.value)
        return;
    const picker = input.value;
    if (picker.showPicker)
        picker.showPicker();
    else
        input.value.focus();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ inputId: undefined, placeholder: 'YYYY-MM-DD HH:MM', required: false, disabled: false, ariaLabel: '', invalid: false, describedBy: '' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__trigger']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "performance-date-time-field" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (...[$event]) => {
            __VLS_ctx.emit('update:modelValue', $event.target.value);
        } },
    ref: "input",
    id: (__VLS_ctx.inputId),
    ...{ class: "performance-date-time-field__input" },
    type: "datetime-local",
    value: (__VLS_ctx.modelValue),
    placeholder: (__VLS_ctx.placeholder),
    required: (__VLS_ctx.required),
    disabled: (__VLS_ctx.disabled),
    'aria-label': (__VLS_ctx.ariaLabel || undefined),
    'aria-invalid': (__VLS_ctx.invalid || undefined),
    'aria-describedby': (__VLS_ctx.describedBy || undefined),
});
/** @type {typeof __VLS_ctx.input} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openPicker) },
    ...{ class: "performance-date-time-field__trigger" },
    type: "button",
    disabled: (__VLS_ctx.disabled),
    'aria-label': (__VLS_ctx.ariaLabel || '打开日期时间选择器'),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M7 2a1 1 0 0 1 1 1h8a1 1 0 1 1 2 0h2a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2a1 1 0 0 1 1 1Zm9 3H8a1 1 0 1 1-2 0H4v15h16V5h-2a1 1 0 0 1-2 0ZM7 9h10v2H7V9Zm0 4h7v2H7v-2Z",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['performance-date-time-field']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__input']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-date-time-field__trigger']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            input: input,
            openPicker: openPicker,
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
