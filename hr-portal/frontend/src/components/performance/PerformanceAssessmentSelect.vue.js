import { computed, ref } from 'vue';
import { ArrowDown, ArrowUp, Check } from '@element-plus/icons-vue';
const props = withDefaults(defineProps(), {
    modelValue: '',
    required: false,
    placeholder: '',
    options: () => [],
    invalid: false,
    emptyText: '暂无数据',
});
const emit = defineEmits();
const open = ref(false);
const defaultDisabledReason = '模板中已存在该评估项';
const selected = computed(() => props.options.find((option) => option.id === props.modelValue));
function select(option) {
    if (option.disabled)
        return;
    emit('update:modelValue', option.id);
    open.value = false;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: '',
    required: false,
    placeholder: '',
    options: () => [],
    invalid: false,
    emptyText: '暂无数据',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['performance-assessment-select']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['select-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "performance-assessment-select" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "field-label" },
});
(__VLS_ctx.label);
if (__VLS_ctx.required) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: (['select-shell', { invalid: __VLS_ctx.invalid, open: __VLS_ctx.open }]) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.open = !__VLS_ctx.open;
        } },
    type: "button",
    role: "combobox",
    'aria-expanded': (__VLS_ctx.open),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: ({ placeholder: !__VLS_ctx.selected }) },
});
(__VLS_ctx.selected?.label || __VLS_ctx.placeholder);
if (__VLS_ctx.open) {
    const __VLS_0 = {}.ArrowUp;
    /** @type {[typeof __VLS_components.ArrowUp, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else {
    const __VLS_4 = {}.ArrowDown;
    /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "option-menu" },
        role: "listbox",
    });
    if (__VLS_ctx.options.length) {
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.open))
                            return;
                        if (!(__VLS_ctx.options.length))
                            return;
                        __VLS_ctx.select(option);
                    } },
                key: (option.id),
                type: "button",
                role: "option",
                'aria-selected': (option.id === __VLS_ctx.modelValue),
                ...{ class: ({ selected: option.id === __VLS_ctx.modelValue }) },
                'aria-disabled': (option.disabled ? true : undefined),
                disabled: (option.disabled),
                title: (option.disabled ? (option.disabledReason || __VLS_ctx.defaultDisabledReason) : undefined),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (option.label);
            if (option.description) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
                (option.description);
            }
            if (option.disabled) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
                (option.disabledReason || __VLS_ctx.defaultDisabledReason);
            }
            if (option.id === __VLS_ctx.modelValue) {
                const __VLS_8 = {}.Check;
                /** @type {[typeof __VLS_components.Check, ]} */ ;
                // @ts-ignore
                const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                    ...{ class: "option-check" },
                    'aria-hidden': "true",
                }));
                const __VLS_10 = __VLS_9({
                    ...{ class: "option-check" },
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_9));
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "option-empty" },
        });
        (__VLS_ctx.emptyText);
    }
}
if (__VLS_ctx.invalid) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-error" },
    });
    (__VLS_ctx.label === '评估项' ? '评估项为必填' : '此项为必填');
}
/** @type {__VLS_StyleScopedClasses['performance-assessment-select']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['option-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['option-check']} */ ;
/** @type {__VLS_StyleScopedClasses['option-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowDown: ArrowDown,
            ArrowUp: ArrowUp,
            Check: Check,
            open: open,
            defaultDisabledReason: defaultDisabledReason,
            selected: selected,
            select: select,
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
