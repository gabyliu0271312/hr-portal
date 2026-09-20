/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import ScoreRangeSummary from './ScoreRangeSummary.vue';
const props = defineProps();
const intervals = computed(() => Array.isArray(props.mapping.intervals) ? props.mapping.intervals.map(record) : []);
const rule = computed(() => String(props.mapping.rule ?? 'a ≤ 分数 < b'));
const pillColors = [
    { background: 'rgb(253,226,226)', color: 'rgb(98,28,24)' },
    { background: 'rgb(250,241,209)', color: 'rgb(92,58,0)' },
    { background: 'rgb(217,245,214)', color: 'rgb(18,75,12)' },
    { background: 'rgb(236,226,254)', color: 'rgb(70,11,70)' },
];
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function display(value) {
    return value === undefined || value === null || value === '' ? '—' : String(value);
}
function displayName(value) {
    return value === undefined || value === null || value === '' ? '--' : String(value);
}
function lowerAt(index) {
    return index === 0 ? props.mapping.min : intervals.value[index - 1]?.upper;
}
function upperAt(index) {
    return index === intervals.value.length - 1 ? props.mapping.max : intervals.value[index]?.upper;
}
function intervalExpression(index) {
    const lowerOperator = rule.value.includes('a <') ? '<' : '≤';
    const upperOperator = index === intervals.value.length - 1 || rule.value.includes('≤ b') ? '≤' : '<';
    return `${display(lowerAt(index))} ${lowerOperator} 分数 ${upperOperator} ${display(upperAt(index))}`;
}
function pillStyle(index) {
    return pillColors[index % pillColors.length];
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-description-input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "score-mapping-summary" },
    'data-component': "score-mapping-summary",
    'aria-label': "评分映射等级型配置",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-grid mapping-header" },
    'aria-label': "映射表头",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mapping-rows" },
});
for (const [interval, index] of __VLS_getVForSourceType((__VLS_ctx.intervals))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (String(interval.id ?? interval.code ?? index)),
        ...{ class: "mapping-grid mapping-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mapping-range" },
    });
    (__VLS_ctx.intervalExpression(index));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mapping-code-pill" },
        ...{ style: (__VLS_ctx.pillStyle(index)) },
    });
    (__VLS_ctx.display(interval.code));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "mapping-name" },
    });
    (__VLS_ctx.displayName(interval.name));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "mapping-description-input" },
        value: (String(interval.description ?? interval.level_description ?? '')),
        'aria-label': "等级描述",
    });
}
/** @type {[typeof ScoreRangeSummary, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(ScoreRangeSummary, new ScoreRangeSummary({
    ...{ class: "mapping-range-summary" },
    minimum: (__VLS_ctx.mapping.min),
    maximum: (__VLS_ctx.mapping.max),
    precision: (__VLS_ctx.mapping.precision),
}));
const __VLS_1 = __VLS_0({
    ...{ class: "mapping-range-summary" },
    minimum: (__VLS_ctx.mapping.min),
    maximum: (__VLS_ctx.mapping.max),
    precision: (__VLS_ctx.mapping.precision),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
/** @type {__VLS_StyleScopedClasses['score-mapping-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-rows']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-range']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-code-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-description-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-range-summary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ScoreRangeSummary: ScoreRangeSummary,
            intervals: intervals,
            display: display,
            displayName: displayName,
            intervalExpression: intervalExpression,
            pillStyle: pillStyle,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
