/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import AddOutlinedIcon from './AddOutlinedIcon.vue';
import PerformanceIconButton from './PerformanceIconButton.vue';
import PerformanceNumberInput from './PerformanceNumberInput.vue';
const props = withDefaults(defineProps(), {
    intervals: () => [
        { lower: '', upper: '', code: '', name: '' },
        { lower: '', upper: '', code: '', name: '' },
    ],
    rule: 'a ≤ 分数 < b',
    lowerBound: '',
    upperBound: '',
    precision: 0,
    boundaryErrors: () => [],
    codeErrors: () => [],
    structureLocked: false,
});
const emit = defineEmits();
const selectedOperator = computed(() => props.rule.startsWith('a ≤')
    ? { left: '≤', right: '<' }
    : { left: '<', right: '≤' });
const visibleIntervals = computed(() => normalizeIntervals(props.intervals));
const hasDelete = computed(() => props.intervals.length > 2);
function operatorParts(index) {
    return {
        left: index === 0 ? '≤' : selectedOperator.value.left,
        right: index === visibleIntervals.value.length - 1 ? '≤' : selectedOperator.value.right,
    };
}
function normalizeIntervals(intervals) {
    return intervals.map((interval, index) => ({
        ...interval,
        lower: index === 0 ? props.lowerBound : intervals[index - 1].upper,
        upper: index === intervals.length - 1 ? props.upperBound : interval.upper,
    }));
}
function updateInterval(index, patch) {
    const intervals = props.intervals.map((interval, intervalIndex) => intervalIndex === index ? { ...interval, ...patch } : interval);
    emit('update:intervals', normalizeIntervals(intervals));
}
function addInterval() {
    emit('add');
    const index = Math.max(1, props.intervals.length - 1);
    const intervals = [...props.intervals];
    intervals.splice(index, 0, { lower: '', upper: '', code: '', name: '' });
    emit('update:intervals', normalizeIntervals(intervals));
}
function removeInterval(index) {
    if (props.intervals.length <= 2)
        return;
    emit('remove', index);
    emit('update:intervals', normalizeIntervals(props.intervals.filter((_, intervalIndex) => intervalIndex !== index)));
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    intervals: () => [
        { lower: '', upper: '', code: '', name: '' },
        { lower: '', upper: '', code: '', name: '' },
    ],
    rule: 'a ≤ 分数 < b',
    lowerBound: '',
    upperBound: '',
    precision: 0,
    boundaryErrors: () => [],
    codeErrors: () => [],
    structureLocked: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-operator']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['add-interval-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-interval-editor" },
    'aria-label': "分数子区间编辑器",
});
for (const [interval, index] of __VLS_getVForSourceType((__VLS_ctx.visibleIntervals))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (index),
        ...{ class: "interval-row" },
        ...{ class: ({ 'has-delete': __VLS_ctx.hasDelete }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "interval-bounds" },
    });
    /** @type {[typeof PerformanceNumberInput, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (interval.lower),
        disabled: (index === 0),
        readonly: true,
        placeholder: "请输入分数下限",
        'aria-label': (`第${index + 1}个区间分数下限`),
        size: "interval",
        precision: (__VLS_ctx.precision),
        min: (0),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (interval.lower),
        disabled: (index === 0),
        readonly: true,
        placeholder: "请输入分数下限",
        'aria-label': (`第${index + 1}个区间分数下限`),
        size: "interval",
        precision: (__VLS_ctx.precision),
        min: (0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        'onUpdate:modelValue': ((lower) => __VLS_ctx.updateInterval(index, { lower }))
    };
    var __VLS_2;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "interval-operator" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "interval-operator__sign" },
    });
    (__VLS_ctx.operatorParts(index).left);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "interval-operator__score" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "interval-operator__sign" },
    });
    (__VLS_ctx.operatorParts(index).right);
    /** @type {[typeof PerformanceNumberInput, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (interval.upper),
        disabled: (index === __VLS_ctx.visibleIntervals.length - 1),
        placeholder: "请输入分数上限",
        'aria-label': (`第${index + 1}个区间分数上限`),
        size: "interval",
        precision: (__VLS_ctx.precision),
        min: (0),
        invalid: (__VLS_ctx.boundaryErrors[index] && index < __VLS_ctx.visibleIntervals.length - 1),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (interval.upper),
        disabled: (index === __VLS_ctx.visibleIntervals.length - 1),
        placeholder: "请输入分数上限",
        'aria-label': (`第${index + 1}个区间分数上限`),
        size: "interval",
        precision: (__VLS_ctx.precision),
        min: (0),
        invalid: (__VLS_ctx.boundaryErrors[index] && index < __VLS_ctx.visibleIntervals.length - 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        'onUpdate:modelValue': ((upper) => __VLS_ctx.updateInterval(index, { upper }))
    };
    var __VLS_9;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                __VLS_ctx.updateInterval(index, { code: $event.target.value });
            } },
        ...{ class: "interval-code-input" },
        ...{ class: ({ error: __VLS_ctx.codeErrors[index] }) },
        value: (interval.code),
        placeholder: "请输入等级代号",
        maxlength: "12",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onInput: (...[$event]) => {
                __VLS_ctx.updateInterval(index, { name: $event.target.value });
            } },
        ...{ class: "interval-name-input" },
        value: (interval.name),
        placeholder: "请输入等级名称",
        maxlength: "40",
    });
    if (__VLS_ctx.hasDelete && !__VLS_ctx.structureLocked) {
        /** @type {[typeof PerformanceIconButton, ]} */ ;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个分数子区间`),
        }));
        const __VLS_15 = __VLS_14({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个分数子区间`),
        }, ...__VLS_functionalComponentArgsRest(__VLS_14));
        let __VLS_17;
        let __VLS_18;
        let __VLS_19;
        const __VLS_20 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.hasDelete && !__VLS_ctx.structureLocked))
                    return;
                __VLS_ctx.removeInterval(index);
            }
        };
        var __VLS_16;
    }
    if (__VLS_ctx.boundaryErrors[index]) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "interval-error interval-boundary-error" },
        });
    }
    if (__VLS_ctx.codeErrors[index]) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "interval-error interval-code-error" },
        });
    }
}
if (!__VLS_ctx.structureLocked) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addInterval) },
        ...{ class: "add-interval-button" },
        type: "button",
    });
    /** @type {[typeof AddOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(AddOutlinedIcon, new AddOutlinedIcon({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
/** @type {__VLS_StyleScopedClasses['score-interval-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-bounds']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-operator']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-operator__sign']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-operator__score']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-operator__sign']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-code-input']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-name-input']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-error']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-boundary-error']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-error']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-code-error']} */ ;
/** @type {__VLS_StyleScopedClasses['add-interval-button']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AddOutlinedIcon: AddOutlinedIcon,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceNumberInput: PerformanceNumberInput,
            visibleIntervals: visibleIntervals,
            hasDelete: hasDelete,
            operatorParts: operatorParts,
            updateInterval: updateInterval,
            addInterval: addInterval,
            removeInterval: removeInterval,
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
