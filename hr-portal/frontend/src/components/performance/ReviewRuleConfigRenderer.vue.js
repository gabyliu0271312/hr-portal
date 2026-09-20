/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import FixedScoreOptionsSummary from './FixedScoreOptionsSummary.vue';
import PerformanceOptionNavigator from './PerformanceOptionNavigator.vue';
import ScoreMappingSummary from './ScoreMappingSummary.vue';
import ScoreRangeSummary from './ScoreRangeSummary.vue';
import { PERFORMANCE_LEVEL_COLORS } from './performanceColorOptions';
const props = defineProps();
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function valueOf(source, camel, snake) {
    return source[camel] ?? source[snake];
}
function display(value) {
    return value === undefined || value === null || value === '' ? '—' : String(value);
}
function displayLevelName(value) {
    return value === undefined || value === null || value === '' ? '--' : String(value);
}
function levelTriggerColor(value) {
    if (typeof value !== 'string')
        return 'transparent';
    const normalized = value.replace(/\s+/g, '').toLowerCase();
    return PERFORMANCE_LEVEL_COLORS.find((option) => option.value.replace(/\s+/g, '').toLowerCase() === normalized)?.trigger ?? value;
}
function booleanValue(source, camel, snake) {
    const value = valueOf(source, camel, snake);
    return value === true || value === 'true' || value === 1 || value === '1';
}
const levels = computed(() => Array.isArray(props.config.levels) ? props.config.levels.map(record) : []);
const ratingOptions = computed(() => levels.value.map((level, index) => ({
    id: String(level.id ?? level.code ?? `rating-level-${index + 1}`),
    label: display(level.code),
})));
const subRatingLayoutPolicy = {
    viewportWidth: 759,
    viewportHeight: 38,
    optionMinWidth: 42,
    optionHeight: 32,
    connectorMinWidth: 12,
    connectorMaxWidth: 88,
    overflowGap: 12,
    naturalMax: 5,
    distributedMax: 10,
};
const score = computed(() => record(props.config.score ?? props.config));
const isFixedScore = computed(() => String(valueOf(score.value, 'method', 'score_method') ?? '').includes('固定分值'));
const mapping = computed(() => record(props.config.mapping ?? props.config));
const gradeParticipatesInCalculation = computed(() => booleanValue(props.config, 'gradeParticipatesInCalculation', 'grade_participates_in_calculation'));
const fixedOptions = computed(() => {
    const options = valueOf(score.value, 'fixedOptions', 'fixed_options');
    return Array.isArray(options) ? options.map(record) : [];
});
const ratingSummary = computed(() => {
    if (!gradeParticipatesInCalculation.value)
        return '评级';
    const scores = levels.value.map((level) => Number(valueOf(level, 'quantifiedScore', 'quantified_score'))).filter(Number.isFinite);
    return scores.length ? `评级（量化分: ${Math.min(...scores)}-${Math.max(...scores)} 分）` : '评级';
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['rating-level-description']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-level-description']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-level-description']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-rating-tiers']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['level-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code-text']} */ ;
/** @type {__VLS_StyleScopedClasses['level-description-input']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-rule-config-renderer" },
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-config-state" },
        role: "status",
    });
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-config-state rule-config-error" },
        role: "alert",
    });
    (__VLS_ctx.error);
}
else if (__VLS_ctx.ruleType === '评级' && __VLS_ctx.entryMode === 'sub_question') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-rating-tiers" },
        'aria-label': "评级档位",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-field-label" },
    });
    /** @type {[typeof PerformanceOptionNavigator, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceOptionNavigator, new PerformanceOptionNavigator({
        ...{ class: "sub-rating-tier-navigator" },
        options: (__VLS_ctx.ratingOptions),
        label: "评级档位选项",
        appearanceVariant: "sub-question-rating",
        layoutPolicy: (__VLS_ctx.subRatingLayoutPolicy),
        fluid: true,
        interactive: (false),
    }));
    const __VLS_1 = __VLS_0({
        ...{ class: "sub-rating-tier-navigator" },
        options: (__VLS_ctx.ratingOptions),
        label: "评级档位选项",
        appearanceVariant: "sub-question-rating",
        layoutPolicy: (__VLS_ctx.subRatingLayoutPolicy),
        fluid: true,
        interactive: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
else if (__VLS_ctx.ruleType === '评级') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rating-level-description" },
        ...{ class: ({ quantified: __VLS_ctx.gradeParticipatesInCalculation }) },
        'aria-label': "配置等级描述",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-field-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-grid level-grid-header" },
        ...{ class: ({ quantified: __VLS_ctx.gradeParticipatesInCalculation }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.gradeParticipatesInCalculation) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "level-description-heading" },
    });
    for (const [level, index] of __VLS_getVForSourceType((__VLS_ctx.levels))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (String(level.id ?? index)),
            ...{ class: "level-grid level-grid-row" },
            ...{ class: ({ quantified: __VLS_ctx.gradeParticipatesInCalculation }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "level-code" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "level-code-pill" },
            ...{ style: ({ backgroundColor: __VLS_ctx.levelTriggerColor(level.color) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "level-code-text" },
        });
        (__VLS_ctx.display(level.code));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "level-name" },
        });
        (__VLS_ctx.displayLevelName(level.name));
        if (__VLS_ctx.gradeParticipatesInCalculation) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "quantified-score" },
            });
            (__VLS_ctx.display(__VLS_ctx.valueOf(level, 'quantifiedScore', 'quantified_score')));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ class: "level-description-input" },
            value: (__VLS_ctx.display(__VLS_ctx.valueOf(level, 'description', 'level_description')) === '—' ? '' : __VLS_ctx.display(__VLS_ctx.valueOf(level, 'description', 'level_description'))),
            'aria-label': "等级描述",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "sr-only" },
    });
    (__VLS_ctx.ratingSummary);
}
else if (__VLS_ctx.ruleType === '评分') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "score-config" },
        'aria-label': (__VLS_ctx.isFixedScore ? '分值选项' : '评分上下限'),
    });
    if (__VLS_ctx.isFixedScore) {
        /** @type {[typeof FixedScoreOptionsSummary, ]} */ ;
        // @ts-ignore
        const __VLS_3 = __VLS_asFunctionalComponent(FixedScoreOptionsSummary, new FixedScoreOptionsSummary({
            options: (__VLS_ctx.fixedOptions),
        }));
        const __VLS_4 = __VLS_3({
            options: (__VLS_ctx.fixedOptions),
        }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    }
    else {
        /** @type {[typeof ScoreRangeSummary, ]} */ ;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent(ScoreRangeSummary, new ScoreRangeSummary({
            minimum: (__VLS_ctx.score.min),
            maximum: (__VLS_ctx.score.max),
            precision: (__VLS_ctx.score.precision),
        }));
        const __VLS_7 = __VLS_6({
            minimum: (__VLS_ctx.score.min),
            maximum: (__VLS_ctx.score.max),
            precision: (__VLS_ctx.score.precision),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "mapping-config" },
    });
    /** @type {[typeof ScoreMappingSummary, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(ScoreMappingSummary, new ScoreMappingSummary({
        mapping: (__VLS_ctx.mapping),
    }));
    const __VLS_10 = __VLS_9({
        mapping: (__VLS_ctx.mapping),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
/** @type {__VLS_StyleScopedClasses['review-rule-config-renderer']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-config-state']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-config-state']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-config-error']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-rating-tiers']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-rating-tier-navigator']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-level-description']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['level-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['level-grid-header']} */ ;
/** @type {__VLS_StyleScopedClasses['level-description-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['level-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['level-grid-row']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['level-code-text']} */ ;
/** @type {__VLS_StyleScopedClasses['level-name']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified-score']} */ ;
/** @type {__VLS_StyleScopedClasses['level-description-input']} */ ;
/** @type {__VLS_StyleScopedClasses['sr-only']} */ ;
/** @type {__VLS_StyleScopedClasses['score-config']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-config']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FixedScoreOptionsSummary: FixedScoreOptionsSummary,
            PerformanceOptionNavigator: PerformanceOptionNavigator,
            ScoreMappingSummary: ScoreMappingSummary,
            ScoreRangeSummary: ScoreRangeSummary,
            valueOf: valueOf,
            display: display,
            displayLevelName: displayLevelName,
            levelTriggerColor: levelTriggerColor,
            levels: levels,
            ratingOptions: ratingOptions,
            subRatingLayoutPolicy: subRatingLayoutPolicy,
            score: score,
            isFixedScore: isFixedScore,
            mapping: mapping,
            gradeParticipatesInCalculation: gradeParticipatesInCalculation,
            fixedOptions: fixedOptions,
            ratingSummary: ratingSummary,
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
