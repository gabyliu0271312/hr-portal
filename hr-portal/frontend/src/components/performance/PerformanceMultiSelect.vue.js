/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
const props = withDefaults(defineProps(), { placeholder: '请选择', disabled: false });
const emit = defineEmits();
const open = ref(false);
const root = ref(null);
const label = computed(() => {
    if (!props.modelValue.length)
        return props.placeholder;
    const selected = props.options.filter(option => props.modelValue.includes(option.value));
    if (selected.length <= 2)
        return selected.map(option => option.label).join('、');
    return `${selected[0]?.label} 等 ${selected.length} 项`;
});
function toggle(value) {
    const values = new Set(props.modelValue);
    if (values.has(value))
        values.delete(value);
    else
        values.add(value);
    emit('update:modelValue', [...values]);
}
function clear() { emit('update:modelValue', []); }
function onOutside(event) {
    if (open.value && root.value && !root.value.contains(event.target))
        open.value = false;
}
onMounted(() => document.addEventListener('pointerdown', onOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutside));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ placeholder: '请选择', disabled: false });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-multi-select__trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-multi-select__option']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-multi-select']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "root",
    ...{ class: "performance-multi-select" },
    ...{ class: ({ open: __VLS_ctx.open, disabled: __VLS_ctx.disabled }) },
});
/** @type {typeof __VLS_ctx.root} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.open = !__VLS_ctx.open;
        } },
    type: "button",
    ...{ class: "performance-multi-select__trigger" },
    disabled: (__VLS_ctx.disabled),
    'aria-expanded': (__VLS_ctx.open),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: ({ placeholder: !__VLS_ctx.modelValue.length }) },
});
(__VLS_ctx.label);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "arrow" },
});
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "performance-multi-select__menu" },
        role: "listbox",
        'aria-multiselectable': "true",
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.open))
                        return;
                    __VLS_ctx.toggle(option.value);
                } },
            key: (option.value),
            type: "button",
            ...{ class: "performance-multi-select__option" },
            role: "option",
            'aria-selected': (__VLS_ctx.modelValue.includes(option.value)),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "checkbox" },
            ...{ class: ({ checked: __VLS_ctx.modelValue.includes(option.value) }) },
        });
        (__VLS_ctx.modelValue.includes(option.value) ? '✓' : '');
        (option.label);
    }
    if (!__VLS_ctx.options.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty" },
        });
    }
    if (__VLS_ctx.modelValue.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.clear) },
            type: "button",
            ...{ class: "clear" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['performance-multi-select']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-multi-select__trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-multi-select__menu']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-multi-select__option']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['clear']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            open: open,
            root: root,
            label: label,
            toggle: toggle,
            clear: clear,
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
