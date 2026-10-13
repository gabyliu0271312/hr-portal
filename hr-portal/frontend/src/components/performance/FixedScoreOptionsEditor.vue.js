import { computed } from 'vue';
import PerformanceDragHandle from './PerformanceDragHandle.vue';
import PerformanceIconButton from './PerformanceIconButton.vue';
import PerformanceSortableList from './PerformanceSortableList.vue';
import PerformanceTextField from './PerformanceTextField.vue';
import { fixedScoreErrorMessage, getFixedScoreError } from './fixedScoreValidation';
const props = withDefaults(defineProps(), {
    errors: () => [],
    requiredErrors: () => [],
    disabled: false,
});
const emit = defineEmits();
const canAddOption = computed(() => props.options.length < 20);
let optionId = 0;
function errorAt(index) {
    if (props.requiredErrors[index])
        return 'required';
    return props.errors[index] ?? (() => {
        const error = getFixedScoreError(props.options[index].value, props.options, index);
        return error === 'required' ? undefined : error;
    })();
}
function updateOption(index, value) {
    emit('update:options', props.options.map((option, optionIndex) => optionIndex === index ? { ...option, value } : option));
}
function addOption() {
    if (!canAddOption.value)
        return;
    emit('add');
    emit('update:options', [...props.options, { id: `fixed-score-new-${++optionId}`, value: '' }]);
}
function removeOption(index) {
    if (props.options.length <= 2)
        return;
    emit('remove', index);
    emit('update:options', props.options.filter((_, optionIndex) => optionIndex !== index));
}
function reorderOptions(from, to) {
    if (from === to)
        return;
    const next = props.options.slice();
    const [moved] = next.splice(from, 1);
    if (!moved)
        return;
    next.splice(to, 0, moved);
    emit('reorder', from, to);
    emit('update:options', next);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    errors: () => [],
    requiredErrors: () => [],
    disabled: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['fixed-score-option-row']} */ ;
/** @type {__VLS_StyleScopedClasses['add-fixed-score-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "fixed-score-options-editor" },
    'aria-label': "固定分值选项",
});
/** @type {[typeof PerformanceSortableList, typeof PerformanceSortableList, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceSortableList, new PerformanceSortableList({
    ...{ 'onReorder': {} },
    items: (__VLS_ctx.options),
    itemKey: "id",
    disabled: (__VLS_ctx.disabled),
    gap: (8),
    ...{ class: "fixed-score-options-list" },
}));
const __VLS_1 = __VLS_0({
    ...{ 'onReorder': {} },
    items: (__VLS_ctx.options),
    itemKey: "id",
    disabled: (__VLS_ctx.disabled),
    gap: (8),
    ...{ class: "fixed-score-options-list" },
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onReorder: (__VLS_ctx.reorderOptions)
};
__VLS_2.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_2.slots;
    const { item: option, index, dragging, itemStyle } = __VLS_getSlotParam(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed-score-option-row" },
        ...{ class: ({ 'is-dragging': dragging }) },
        ...{ style: (itemStyle) },
        'data-sortable-index': (index),
    });
    /** @type {[typeof PerformanceDragHandle, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceDragHandle, new PerformanceDragHandle({
        label: (`拖拽第${index + 1}个固定分值`),
        dragging: (dragging),
        disabled: (__VLS_ctx.disabled),
    }));
    const __VLS_8 = __VLS_7({
        label: (`拖拽第${index + 1}个固定分值`),
        dragging: (dragging),
        disabled: (__VLS_ctx.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "fixed-score-option-field" },
    });
    /** @type {[typeof PerformanceTextField, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (option.value),
        variant: "fixed-score",
        width: "360px",
        placeholder: "请输入分值",
        invalid: (Boolean(__VLS_ctx.errorAt(index))),
        disabled: (__VLS_ctx.disabled),
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (option.value),
        variant: "fixed-score",
        width: "360px",
        placeholder: "请输入分值",
        invalid: (Boolean(__VLS_ctx.errorAt(index))),
        disabled: (__VLS_ctx.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_13;
    let __VLS_14;
    let __VLS_15;
    const __VLS_16 = {
        'onUpdate:modelValue': (...[$event]) => {
            __VLS_ctx.updateOption(index, $event);
        }
    };
    var __VLS_12;
    if (__VLS_ctx.errorAt(index)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "fixed-score-option-error" },
        });
        (__VLS_ctx.fixedScoreErrorMessage(__VLS_ctx.errorAt(index)));
    }
    if (!__VLS_ctx.disabled && __VLS_ctx.options.length > 2) {
        /** @type {[typeof PerformanceIconButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个固定分值`),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个固定分值`),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.disabled && __VLS_ctx.options.length > 2))
                    return;
                __VLS_ctx.removeOption(index);
            }
        };
        var __VLS_19;
    }
}
var __VLS_2;
if (!__VLS_ctx.disabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addOption) },
        ...{ class: "add-fixed-score-button" },
        ...{ class: ({ 'is-disabled': !__VLS_ctx.canAddOption }) },
        type: "button",
        disabled: (!__VLS_ctx.canAddOption),
    });
}
/** @type {__VLS_StyleScopedClasses['fixed-score-options-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-options-list']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-option-row']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-option-field']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-score-option-error']} */ ;
/** @type {__VLS_StyleScopedClasses['add-fixed-score-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceDragHandle: PerformanceDragHandle,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceSortableList: PerformanceSortableList,
            PerformanceTextField: PerformanceTextField,
            fixedScoreErrorMessage: fixedScoreErrorMessage,
            canAddOption: canAddOption,
            errorAt: errorAt,
            updateOption: updateOption,
            addOption: addOption,
            removeOption: removeOption,
            reorderOptions: reorderOptions,
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
