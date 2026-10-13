import { computed, watch } from 'vue';
import PerformanceRadioGroup from './PerformanceRadioGroup.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
import IntervalHeader from './IntervalHeader.vue';
import ScoreBoundsField from './ScoreBoundsField.vue';
import ScoreIntervalEditor from './ScoreIntervalEditor.vue';
const props = withDefaults(defineProps(), {
    modelValue: () => ({
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        rule: 'a ≤ 分数 < b',
        intervals: [
            { lower: '', upper: '', code: '', name: '' },
            { lower: '', upper: '', code: '', name: '' },
        ],
        precision: '不保留小数',
    }),
    errors: () => ({}),
    boundsDisabled: false,
    structureLocked: false,
});
const emit = defineEmits();
const value = computed(() => props.modelValue);
const methodOptions = [{ value: '在分数上下限内输入评分', label: '在分数上下限内输入评分' }];
const ruleOptions = ['a ≤ 分数 < b', 'a < 分数 ≤ b'];
const precisionOptions = ['不保留小数', '保留 1 位小数', '保留 2 位小数'];
const precisionDigits = computed(() => value.value.precision === '保留 1 位小数' ? 1 : value.value.precision === '保留 2 位小数' ? 2 : 0);
function normalizeIntervals(intervals) {
    return intervals.map((interval, index) => ({
        ...interval,
        lower: index === 0 ? value.value.min : intervals[index - 1].upper,
        upper: index === intervals.length - 1 ? value.value.max : interval.upper,
    }));
}
watch(() => [value.value.min, value.value.max, JSON.stringify(value.value.intervals)], () => {
    const intervals = normalizeIntervals(value.value.intervals);
    if (JSON.stringify(intervals) !== JSON.stringify(value.value.intervals))
        update({ intervals });
}, { immediate: true });
function update(patch) {
    emit('update:modelValue', { ...value.value, ...patch });
}
function formatValue(raw, digits) {
    if (raw === '' || raw === '.')
        return raw;
    const numericValue = Number(raw);
    if (!Number.isFinite(numericValue))
        return raw;
    return digits > 0 ? numericValue.toFixed(digits) : String(Math.round(numericValue));
}
function updatePrecision(precision) {
    const digits = precision === '保留 1 位小数' ? 1 : precision === '保留 2 位小数' ? 2 : 0;
    const intervals = value.value.intervals.map((interval) => ({ ...interval, upper: formatValue(interval.upper, digits) }));
    update({
        precision,
        min: formatValue(value.value.min, digits),
        max: formatValue(value.value.max, digits),
        intervals,
    });
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    modelValue: () => ({
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        rule: 'a ≤ 分数 < b',
        intervals: [
            { lower: '', upper: '', code: '', name: '' },
            { lower: '', upper: '', code: '', name: '' },
        ],
        precision: '不保留小数',
    }),
    errors: () => ({}),
    boundsDisabled: false,
    structureLocked: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['mapping-config']} */ ;
/** @type {__VLS_StyleScopedClasses['solid-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "mapping-config" },
    'aria-label': "评分映射等级型设置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
/** @type {[typeof PerformanceRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRadioGroup, new PerformanceRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.method),
    options: (__VLS_ctx.methodOptions),
    name: "mapping-method",
    'aria-label': "评分方式",
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.value.method),
    options: (__VLS_ctx.methodOptions),
    name: "mapping-method",
    'aria-label': "评分方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': ((method) => __VLS_ctx.update({ method }))
};
var __VLS_2;
/** @type {[typeof ScoreBoundsField, ]} */ ;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(ScoreBoundsField, new ScoreBoundsField({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: ({ min: __VLS_ctx.value.min, max: __VLS_ctx.value.max }),
    precision: (__VLS_ctx.precisionDigits),
    invalid: (!!__VLS_ctx.errors?.bounds),
    disabled: (__VLS_ctx.boundsDisabled),
}));
const __VLS_8 = __VLS_7({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: ({ min: __VLS_ctx.value.min, max: __VLS_ctx.value.max }),
    precision: (__VLS_ctx.precisionDigits),
    invalid: (!!__VLS_ctx.errors?.bounds),
    disabled: (__VLS_ctx.boundsDisabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
let __VLS_10;
let __VLS_11;
let __VLS_12;
const __VLS_13 = {
    'onUpdate:modelValue': (__VLS_ctx.update)
};
var __VLS_9;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "分数子区间规则",
}));
const __VLS_15 = __VLS_14({
    label: "分数子区间规则",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.ruleOptions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        key: (option),
        ...{ class: "solid-radio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.update({ rule: option });
            } },
        type: "radio",
        name: "mapping-rule",
        checked: (__VLS_ctx.value.rule === option),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row interval-preview-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control interval-preview" },
});
/** @type {[typeof IntervalHeader, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(IntervalHeader, new IntervalHeader({
    showDelete: (__VLS_ctx.value.intervals.length > 2),
}));
const __VLS_18 = __VLS_17({
    showDelete: (__VLS_ctx.value.intervals.length > 2),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
/** @type {[typeof ScoreIntervalEditor, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(ScoreIntervalEditor, new ScoreIntervalEditor({
    ...{ 'onUpdate:intervals': {} },
    intervals: (__VLS_ctx.value.intervals),
    rule: (__VLS_ctx.value.rule),
    lowerBound: (__VLS_ctx.value.min),
    upperBound: (__VLS_ctx.value.max),
    precision: (__VLS_ctx.precisionDigits),
    structureLocked: (__VLS_ctx.structureLocked),
    boundaryErrors: (__VLS_ctx.errors?.intervalBounds),
    codeErrors: (__VLS_ctx.errors?.intervalCodes),
}));
const __VLS_21 = __VLS_20({
    ...{ 'onUpdate:intervals': {} },
    intervals: (__VLS_ctx.value.intervals),
    rule: (__VLS_ctx.value.rule),
    lowerBound: (__VLS_ctx.value.min),
    upperBound: (__VLS_ctx.value.max),
    precision: (__VLS_ctx.precisionDigits),
    structureLocked: (__VLS_ctx.structureLocked),
    boundaryErrors: (__VLS_ctx.errors?.intervalBounds),
    codeErrors: (__VLS_ctx.errors?.intervalCodes),
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_23;
let __VLS_24;
let __VLS_25;
const __VLS_26 = {
    'onUpdate:intervals': ((intervals) => __VLS_ctx.update({ intervals }))
};
var __VLS_22;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "小数位数设置",
}));
const __VLS_28 = __VLS_27({
    label: "小数位数设置",
}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.precisionOptions))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        key: (option),
        ...{ class: "solid-radio" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ onChange: (...[$event]) => {
                __VLS_ctx.updatePrecision(option);
            } },
        type: "radio",
        name: "mapping-precision",
        checked: (__VLS_ctx.value.precision === option),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (option);
}
/** @type {__VLS_StyleScopedClasses['mapping-config']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['solid-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-preview-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['interval-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['solid-radio']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceRadioGroup: PerformanceRadioGroup,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            IntervalHeader: IntervalHeader,
            ScoreBoundsField: ScoreBoundsField,
            ScoreIntervalEditor: ScoreIntervalEditor,
            value: value,
            methodOptions: methodOptions,
            ruleOptions: ruleOptions,
            precisionOptions: precisionOptions,
            precisionDigits: precisionDigits,
            update: update,
            updatePrecision: updatePrecision,
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
