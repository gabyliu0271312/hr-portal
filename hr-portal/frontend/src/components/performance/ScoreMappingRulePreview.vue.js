/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import PerformanceNumberInput from './PerformanceNumberInput.vue';
const props = withDefaults(defineProps(), { precision: 0 });
const __VLS_emit = defineEmits();
const normalizedIntervals = computed(() => {
    const min = Number(props.minimum);
    const max = Number(props.maximum);
    return props.intervals.map((interval, index) => {
        const lower = index === 0 ? min : Number(props.intervals[index - 1].upper);
        const upper = index === props.intervals.length - 1 ? max : Number(interval.upper);
        return { ...interval, lower, upper };
    });
});
const activeInterval = computed(() => {
    if (props.modelValue === '')
        return null;
    const value = Number(props.modelValue);
    return normalizedIntervals.value.find((interval, index) => value >= interval.lower && (index === normalizedIntervals.value.length - 1 ? value <= interval.upper : value < interval.upper)) || null;
});
const activeIntervalIndex = computed(() => activeInterval.value ? normalizedIntervals.value.indexOf(activeInterval.value) : -1);
const isAtMinimum = computed(() => props.modelValue !== '' && Number(props.modelValue) <= Number(props.minimum));
const isAtMaximum = computed(() => props.modelValue !== '' && Number(props.modelValue) >= Number(props.maximum));
const cursorStyle = computed(() => {
    const interval = activeInterval.value;
    const intervalCount = normalizedIntervals.value.length;
    if (!interval || intervalCount === 0)
        return undefined;
    const segmentWidth = (552 - Math.max(0, intervalCount - 1) * 2) / intervalCount;
    const intervalRange = interval.upper - interval.lower;
    const intervalRatio = intervalRange > 0 ? Math.max(0, Math.min(1, (Number(props.modelValue) - interval.lower) / intervalRange)) : 0;
    const position = activeIntervalIndex.value * (segmentWidth + 2) + intervalRatio * segmentWidth;
    return { left: `${position}px` };
});
function formatValue(value) {
    if (value === '' || value === '.')
        return String(value);
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue))
        return String(value);
    return props.precision > 0 ? numericValue.toFixed(props.precision) : String(Math.round(numericValue));
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ precision: 0 });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['score-mapping-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['score-mapping-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['score-mapping-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['score-mapping-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-number-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['is-min']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['is-max']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__segment']} */ ;
/** @type {__VLS_StyleScopedClasses['is-red']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__segment']} */ ;
/** @type {__VLS_StyleScopedClasses['is-purple']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-code']} */ ;
/** @type {__VLS_StyleScopedClasses['is-red']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-code']} */ ;
/** @type {__VLS_StyleScopedClasses['is-purple']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-mapping-rule-preview" },
});
/** @type {[typeof PerformanceNumberInput, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceNumberInput, new PerformanceNumberInput({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: (`${__VLS_ctx.formatValue(__VLS_ctx.minimum)} - ${__VLS_ctx.formatValue(__VLS_ctx.maximum)}`),
    width: "240px",
    precision: (__VLS_ctx.precision),
    min: (Number(__VLS_ctx.minimum) || 0),
    max: (Number(__VLS_ctx.maximum) || undefined),
    'aria-label': "预览分数",
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    placeholder: (`${__VLS_ctx.formatValue(__VLS_ctx.minimum)} - ${__VLS_ctx.formatValue(__VLS_ctx.maximum)}`),
    width: "240px",
    precision: (__VLS_ctx.precision),
    min: (Number(__VLS_ctx.minimum) || 0),
    max: (Number(__VLS_ctx.maximum) || undefined),
    'aria-label': "预览分数",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.$emit('update:modelValue', $event);
    }
};
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-scale" },
});
if (__VLS_ctx.activeInterval) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-scale__cursor" },
        ...{ class: ({ 'is-min': __VLS_ctx.isAtMinimum, 'is-max': __VLS_ctx.isAtMaximum }) },
        ...{ style: (__VLS_ctx.cursorStyle) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-scale__bubble" },
        ...{ class: (`is-${__VLS_ctx.activeIntervalIndex % 2 ? 'purple' : 'red'}`) },
    });
    (__VLS_ctx.formatValue(__VLS_ctx.modelValue));
    (__VLS_ctx.activeInterval.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "7",
        height: "28",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        fill: "#373C43",
        d: "M3 4h1v24H3z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        fill: "#fff",
        d: "M4 4h1v24H4zM2 4h1v24H2z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M0 0h7L4 4H3L0 0z",
        fill: "#373C43",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-scale__bar" },
});
for (const [interval, index] of __VLS_getVForSourceType((__VLS_ctx.normalizedIntervals))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`${interval.code}-${index}`),
        ...{ class: "mapping-scale__segment" },
        ...{ class: (`is-${index % 2 ? 'purple' : 'red'}`) },
    });
    (interval.code);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-scale__ticks" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.formatValue(__VLS_ctx.minimum));
for (const [interval] of __VLS_getVForSourceType((__VLS_ctx.normalizedIntervals.slice(0, -1)))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (interval.upper),
    });
    (__VLS_ctx.formatValue(interval.upper));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.formatValue(__VLS_ctx.maximum));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-level-list" },
});
for (const [interval, index] of __VLS_getVForSourceType((__VLS_ctx.normalizedIntervals))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
        key: (`detail-${interval.code}-${index}`),
        ...{ class: "mapping-level-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mapping-level-code" },
        ...{ class: (`is-${index % 2 ? 'purple' : 'red'}`) },
    });
    (interval.code);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (interval.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
/** @type {__VLS_StyleScopedClasses['score-mapping-rule-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__cursor']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__bar']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__segment']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-scale__ticks']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-level-code']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceNumberInput: PerformanceNumberInput,
            normalizedIntervals: normalizedIntervals,
            activeInterval: activeInterval,
            activeIntervalIndex: activeIntervalIndex,
            isAtMinimum: isAtMinimum,
            isAtMaximum: isAtMaximum,
            cursorStyle: cursorStyle,
            formatValue: formatValue,
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
