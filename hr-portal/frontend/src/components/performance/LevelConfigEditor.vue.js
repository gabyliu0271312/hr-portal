/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import AddOutlinedIcon from './AddOutlinedIcon.vue';
import ColorPicker from './ColorPicker.vue';
import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions';
import PerformanceDragHandle from './PerformanceDragHandle.vue';
import PerformanceIconButton from './PerformanceIconButton.vue';
import PerformanceNumberInput from './PerformanceNumberInput.vue';
import PerformanceSortableList from './PerformanceSortableList.vue';
const props = withDefaults(defineProps(), {
    quantified: false,
    structureLocked: false,
    quantifiedScoreDisabled: false,
    errors: () => [],
    quantifiedErrors: () => [],
    minimumError: false,
});
const emit = defineEmits();
const colors = PERFORMANCE_LEVEL_COLORS.map((option) => option.value);
const levelErrors = computed(() => props.errors ?? []);
const stableLevels = computed(() => props.levels.map((level, index) => ({ ...level, id: level.id ?? `review-level-${index + 1}` })));
let generatedLevelId = 0;
const levelActionError = ref(false);
function updateLevel(index, patch) {
    emit('update:levels', stableLevels.value.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level));
}
function reorderLevels(from, to) {
    if (from === to)
        return;
    const levels = stableLevels.value.slice();
    const [level] = levels.splice(from, 1);
    levels.splice(to, 0, level);
    emit('reorder', from, to);
    emit('update:levels', levels);
}
function addLevel() {
    if (props.levels.length >= 10)
        return;
    levelActionError.value = false;
    emit('add');
    const level = {
        id: `review-level-new-${++generatedLevelId}`,
        color: colors[props.levels.length % colors.length],
        code: '',
        name: '',
        quantifiedScore: '',
        value: '',
    };
    emit('update:levels', [...stableLevels.value, level]);
}
function removeLevel(index) {
    if (props.levels.length <= 1) {
        levelActionError.value = true;
        return;
    }
    const nextLevels = stableLevels.value.filter((_, levelIndex) => levelIndex !== index);
    levelActionError.value = nextLevels.length < 2;
    emit('remove', index);
    emit('update:levels', nextLevels);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    quantified: false,
    structureLocked: false,
    quantifiedScoreDisabled: false,
    errors: () => [],
    quantifiedErrors: () => [],
    minimumError: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['add-level-button']} */ ;
/** @type {__VLS_StyleScopedClasses['add-level-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "level-config-editor" },
    ...{ class: ({ quantified: __VLS_ctx.quantified }) },
    'data-quantified': (__VLS_ctx.quantified),
    'aria-label': "等级编辑器",
});
/** @type {[typeof PerformanceSortableList, typeof PerformanceSortableList, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceSortableList, new PerformanceSortableList({
    ...{ 'onReorder': {} },
    items: (__VLS_ctx.stableLevels),
    itemKey: "id",
    disabled: (__VLS_ctx.structureLocked),
    gap: (8),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onReorder': {} },
    items: (__VLS_ctx.stableLevels),
    itemKey: "id",
    disabled: (__VLS_ctx.structureLocked),
    gap: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onReorder: (__VLS_ctx.reorderLevels)
};
__VLS_2.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_2.slots;
    const { item: level, index, dragging, itemStyle } = __VLS_getSlotParam(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-row" },
        ...{ class: ({ 'is-dragging': dragging, quantified: __VLS_ctx.quantified }) },
        ...{ style: (itemStyle) },
        'data-sortable-index': (index),
        'data-level-id': (level.id),
    });
    /** @type {[typeof PerformanceDragHandle, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceDragHandle, new PerformanceDragHandle({
        label: (`拖拽第${index + 1}个等级`),
        dragging: (dragging),
        disabled: (__VLS_ctx.structureLocked),
    }));
    const __VLS_8 = __VLS_7({
        label: (`拖拽第${index + 1}个等级`),
        dragging: (dragging),
        disabled: (__VLS_ctx.structureLocked),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-content-grid" },
        ...{ class: ({ quantified: __VLS_ctx.quantified }) },
    });
    /** @type {[typeof ColorPicker, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(ColorPicker, new ColorPicker({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (level.color),
        label: (`选择第${index + 1}个等级颜色`),
    }));
    const __VLS_11 = __VLS_10({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (level.color),
        label: (`选择第${index + 1}个等级颜色`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    let __VLS_13;
    let __VLS_14;
    let __VLS_15;
    const __VLS_16 = {
        'onUpdate:modelValue': ((color) => __VLS_ctx.updateLevel(index, { color }))
    };
    var __VLS_12;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-code-control" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                __VLS_ctx.updateLevel(index, { code: level.code });
            } },
        ...{ class: "native-input" },
        ...{ class: ({ error: __VLS_ctx.levelErrors[index] }) },
        placeholder: "请输入「中文」等级代号",
        maxlength: "12",
    });
    (level.code);
    if (__VLS_ctx.levelErrors[index]) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "error-text" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                __VLS_ctx.updateLevel(index, { name: level.name });
            } },
        ...{ class: "native-input level-name-input" },
        placeholder: "请输入等级名称",
        maxlength: "40",
    });
    (level.name);
    if (__VLS_ctx.quantified) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "quantified-score-control" },
        });
        /** @type {[typeof PerformanceNumberInput, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (level.quantifiedScore),
            placeholder: "请输入数字",
            'aria-label': (`第${index + 1}个等级量化分`),
            width: "112px",
            size: "compact",
            step: (0.1),
            precision: (1),
            min: (0),
            disabled: (__VLS_ctx.quantifiedScoreDisabled),
            required: true,
            invalid: (__VLS_ctx.quantifiedErrors[index]),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (level.quantifiedScore),
            placeholder: "请输入数字",
            'aria-label': (`第${index + 1}个等级量化分`),
            width: "112px",
            size: "compact",
            step: (0.1),
            precision: (1),
            min: (0),
            disabled: (__VLS_ctx.quantifiedScoreDisabled),
            required: true,
            invalid: (__VLS_ctx.quantifiedErrors[index]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            'onUpdate:modelValue': ((quantifiedScore) => __VLS_ctx.updateLevel(index, { quantifiedScore }))
        };
        var __VLS_19;
        if (__VLS_ctx.quantifiedErrors[index]) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "error-text" },
            });
        }
    }
    /** @type {[typeof PerformanceNumberInput, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (level.value),
        placeholder: "请输入数字",
        'aria-label': (`第${index + 1}个等级量化值`),
        width: (__VLS_ctx.quantified ? '112px' : '135px'),
        size: "compact",
        step: (0.1),
        precision: (1),
        min: (0),
    }));
    const __VLS_25 = __VLS_24({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (level.value),
        placeholder: "请输入数字",
        'aria-label': (`第${index + 1}个等级量化值`),
        width: (__VLS_ctx.quantified ? '112px' : '135px'),
        size: "compact",
        step: (0.1),
        precision: (1),
        min: (0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    let __VLS_27;
    let __VLS_28;
    let __VLS_29;
    const __VLS_30 = {
        'onUpdate:modelValue': ((value) => __VLS_ctx.updateLevel(index, { value }))
    };
    var __VLS_26;
    if (!__VLS_ctx.structureLocked) {
        /** @type {[typeof PerformanceIconButton, ]} */ ;
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个等级`),
            disabled: (__VLS_ctx.levels.length <= 1),
        }));
        const __VLS_32 = __VLS_31({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个等级`),
            disabled: (__VLS_ctx.levels.length <= 1),
        }, ...__VLS_functionalComponentArgsRest(__VLS_31));
        let __VLS_34;
        let __VLS_35;
        let __VLS_36;
        const __VLS_37 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.structureLocked))
                    return;
                __VLS_ctx.removeLevel(index);
            }
        };
        var __VLS_33;
    }
}
var __VLS_2;
if (!__VLS_ctx.structureLocked) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addLevel) },
        ...{ class: "add-level-button" },
        type: "button",
        disabled: (__VLS_ctx.levels.length >= 10),
    });
    /** @type {[typeof AddOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({}));
    const __VLS_39 = __VLS_38({}, ...__VLS_functionalComponentArgsRest(__VLS_38));
}
if (__VLS_ctx.levelActionError || __VLS_ctx.minimumError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mt-1 text-R-500 whitespace-pre-line" },
    });
}
/** @type {__VLS_StyleScopedClasses['level-config-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['level-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-content-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code-control']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['error-text']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['level-name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified-score-control']} */ ;
/** @type {__VLS_StyleScopedClasses['error-text']} */ ;
/** @type {__VLS_StyleScopedClasses['add-level-button']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-R-500']} */ ;
/** @type {__VLS_StyleScopedClasses['whitespace-pre-line']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AddOutlinedIcon: AddOutlinedIcon,
            ColorPicker: ColorPicker,
            PerformanceDragHandle: PerformanceDragHandle,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceNumberInput: PerformanceNumberInput,
            PerformanceSortableList: PerformanceSortableList,
            levelErrors: levelErrors,
            stableLevels: stableLevels,
            levelActionError: levelActionError,
            updateLevel: updateLevel,
            reorderLevels: reorderLevels,
            addLevel: addLevel,
            removeLevel: removeLevel,
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
