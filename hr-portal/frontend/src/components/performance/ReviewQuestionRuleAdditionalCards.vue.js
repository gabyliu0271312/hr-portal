/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import ReviewQuestionDisplayMethodCard from './ReviewQuestionDisplayMethodCard.vue';
import ReviewQuestionRatingMethodSection from './ReviewQuestionRatingMethodSection.vue';
import ReviewQuestionScoringMethodCard from './ReviewQuestionScoringMethodCard.vue';
import ReviewQuestionSubQuestionCreateModal from './ReviewQuestionSubQuestionCreateModal.vue';
import ReviewQuestionSubQuestionList from './ReviewQuestionSubQuestionList.vue';
import ReviewQuestionCalculationRuleSection from './ReviewQuestionCalculationRuleSection.vue';
const props = withDefaults(defineProps(), {
    subQuestionOptions: () => ({ none: [], condition: [] }),
    subQuestionOptionsLoading: false,
    ruleOptions: () => [],
    scoringMethod: '',
    subQuestions: () => [],
    validationMessage: '',
});
const emit = defineEmits();
function valueOf(source, camel, snake) {
    return source[camel] ?? source[snake];
}
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function normalizeMethod(value) {
    const text = String(value ?? '');
    if (text === 'sub_items' || text.includes('子评估项'))
        return 'sub_items';
    if (text === 'total_score' || text.includes('总分项'))
        return 'total_score';
    return 'direct';
}
function normalizeCalculationRule(value) {
    const text = String(value ?? '');
    if (text === 'weighted_sum' || text.includes('加权'))
        return 'weighted_sum';
    if (text === 'direct_sum' || text.includes('直接求和'))
        return 'direct_sum';
    if (text === 'average' || text.includes('平均'))
        return 'average';
    if (text === 'condition' || text.includes('条件'))
        return 'condition';
    return 'none';
}
const scoreConfig = computed(() => record(props.config.score ?? props.config));
const isFixedScore = computed(() => String(valueOf(scoreConfig.value, 'method', 'score_method') ?? '').includes('固定分值'));
const showAdditionalCards = computed(() => props.entryMode === 'regular_question');
const scoringVariant = computed(() => {
    if (props.ruleType === '评分映射等级型')
        return 'score_mapping';
    return isFixedScore.value ? 'score_fixed' : 'score_range';
});
const scoringMethod = ref(props.scoringMethod || normalizeMethod(valueOf(props.config, 'evaluationMethod', 'evaluation_method')));
function createRatingSubQuestions() {
    return [
        { id: 'sub-question-1', question_id: null },
        { id: 'sub-question-2', question_id: null },
    ];
}
const ratingSubQuestions = ref(props.subQuestions.length ? props.subQuestions : createRatingSubQuestions());
const scoreSubQuestions = ref(props.subQuestions.slice());
const calculationRule = ref(normalizeCalculationRule(valueOf(props.config, 'calculationRule', 'calculation_rule')));
const isRatingSubItems = computed(() => props.ruleType === '评级' && scoringMethod.value === 'sub_items');
const isTotalScore = computed(() => scoringMethod.value === 'total_score');
const isScoreSubItems = computed(() => props.ruleType === '评分' || props.ruleType === '评分映射等级型' ? (scoringVariant.value !== 'score_fixed' && scoringMethod.value === 'sub_items') : false);
const showOrder = computed(() => showAdditionalCards.value && (isRatingSubItems.value || isScoreSubItems.value));
const showDisplay = computed(() => showAdditionalCards.value && (props.ruleType === '评级' || isFixedScore.value || isScoreSubItems.value));
const showOptions = computed(() => (props.ruleType === '评级' && !isTotalScore.value) || isFixedScore.value);
const currentSubQuestionOptions = computed(() => calculationRule.value === 'condition' ? props.subQuestionOptions.condition : props.subQuestionOptions.none);
const scoreCalculationRuleOptions = [
    { value: 'none', label: '不设置计算规则' },
    { value: 'weighted_sum', label: '加权求和' },
    { value: 'direct_sum', label: '直接求和' },
    { value: 'average', label: '求平均分' },
];
const showCreateModal = ref(false);
watch(() => props.config, () => {
    scoringMethod.value = props.scoringMethod || normalizeMethod(valueOf(props.config, 'evaluationMethod', 'evaluation_method'));
    calculationRule.value = normalizeCalculationRule(valueOf(props.config, 'calculationRule', 'calculation_rule'));
}, { deep: true });
watch(() => props.scoringMethod, (value) => {
    if (value)
        scoringMethod.value = value;
});
watch(scoringMethod, (value) => {
    emit('update:scoringMethod', value);
});
watch(scoringMethod, (value) => {
    if (value !== 'sub_items') {
        calculationRule.value = 'none';
        emit('update:subQuestions', []);
    }
});
watch(() => props.subQuestions, (value) => {
    scoreSubQuestions.value = value.slice();
}, { deep: true });
function updateScoreSubQuestions(value) {
    scoreSubQuestions.value = value;
    emit('update:subQuestions', value);
}
function updateRatingSubQuestions(value) {
    ratingSubQuestions.value = value;
    emit('update:subQuestions', value);
}
function openCreateModal() {
    showCreateModal.value = true;
}
function handleCreateSubQuestion() {
    openCreateModal();
    emit('create-sub-question');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    subQuestionOptions: () => ({ none: [], condition: [] }),
    subQuestionOptionsLoading: false,
    ruleOptions: () => [],
    scoringMethod: '',
    subQuestions: () => [],
    validationMessage: '',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "rule-additional-cards" },
});
if (__VLS_ctx.showAdditionalCards && __VLS_ctx.ruleType === '评级') {
    /** @type {[typeof ReviewQuestionRatingMethodSection, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(ReviewQuestionRatingMethodSection, new ReviewQuestionRatingMethodSection({
        ...{ 'onUpdate:subQuestions': {} },
        modelValue: (__VLS_ctx.scoringMethod),
        calculationRule: (__VLS_ctx.calculationRule),
        subQuestions: (__VLS_ctx.ratingSubQuestions),
        subQuestionOptions: (__VLS_ctx.currentSubQuestionOptions),
        subQuestionOptionsLoading: (__VLS_ctx.subQuestionOptionsLoading),
        ...{ class: "evaluation-method-card" },
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onUpdate:subQuestions': {} },
        modelValue: (__VLS_ctx.scoringMethod),
        calculationRule: (__VLS_ctx.calculationRule),
        subQuestions: (__VLS_ctx.ratingSubQuestions),
        subQuestionOptions: (__VLS_ctx.currentSubQuestionOptions),
        subQuestionOptionsLoading: (__VLS_ctx.subQuestionOptionsLoading),
        ...{ class: "evaluation-method-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        'onUpdate:subQuestions': (__VLS_ctx.updateRatingSubQuestions)
    };
    var __VLS_2;
}
else if (__VLS_ctx.showAdditionalCards && (__VLS_ctx.ruleType === '评分' || __VLS_ctx.ruleType === '评分映射等级型')) {
    /** @type {[typeof ReviewQuestionScoringMethodCard, typeof ReviewQuestionScoringMethodCard, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(ReviewQuestionScoringMethodCard, new ReviewQuestionScoringMethodCard({
        modelValue: (__VLS_ctx.scoringMethod),
        variant: (__VLS_ctx.scoringVariant),
        config: (__VLS_ctx.config),
    }));
    const __VLS_8 = __VLS_7({
        modelValue: (__VLS_ctx.scoringMethod),
        variant: (__VLS_ctx.scoringVariant),
        config: (__VLS_ctx.config),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_9.slots.default;
    if (__VLS_ctx.isScoreSubItems) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "score-sub-items-section" },
        });
        /** @type {[typeof ReviewQuestionCalculationRuleSection, ]} */ ;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent(ReviewQuestionCalculationRuleSection, new ReviewQuestionCalculationRuleSection({
            modelValue: (__VLS_ctx.calculationRule),
            options: (__VLS_ctx.scoreCalculationRuleOptions),
        }));
        const __VLS_11 = __VLS_10({
            modelValue: (__VLS_ctx.calculationRule),
            options: (__VLS_ctx.scoreCalculationRuleOptions),
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        /** @type {[typeof ReviewQuestionSubQuestionList, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(ReviewQuestionSubQuestionList, new ReviewQuestionSubQuestionList({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onCreateSubQuestion': {} },
            modelValue: (__VLS_ctx.scoreSubQuestions),
            calculationRule: (__VLS_ctx.calculationRule),
            options: (__VLS_ctx.currentSubQuestionOptions),
            loading: (__VLS_ctx.subQuestionOptionsLoading),
            validationMessage: (__VLS_ctx.validationMessage),
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onCreateSubQuestion': {} },
            modelValue: (__VLS_ctx.scoreSubQuestions),
            calculationRule: (__VLS_ctx.calculationRule),
            options: (__VLS_ctx.currentSubQuestionOptions),
            loading: (__VLS_ctx.subQuestionOptionsLoading),
            validationMessage: (__VLS_ctx.validationMessage),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_16;
        let __VLS_17;
        let __VLS_18;
        const __VLS_19 = {
            'onUpdate:modelValue': (__VLS_ctx.updateScoreSubQuestions)
        };
        const __VLS_20 = {
            onCreateSubQuestion: (__VLS_ctx.handleCreateSubQuestion)
        };
        var __VLS_15;
    }
    var __VLS_9;
}
else if (__VLS_ctx.showAdditionalCards) {
    /** @type {[typeof ReviewQuestionScoringMethodCard, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(ReviewQuestionScoringMethodCard, new ReviewQuestionScoringMethodCard({
        variant: (__VLS_ctx.scoringVariant),
        config: (__VLS_ctx.config),
    }));
    const __VLS_22 = __VLS_21({
        variant: (__VLS_ctx.scoringVariant),
        config: (__VLS_ctx.config),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
if (__VLS_ctx.showDisplay) {
    /** @type {[typeof ReviewQuestionDisplayMethodCard, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(ReviewQuestionDisplayMethodCard, new ReviewQuestionDisplayMethodCard({
        ...{ 'onUpdate:displayMode': {} },
        ruleType: (__VLS_ctx.ruleType),
        config: (__VLS_ctx.config),
        displayMode: (__VLS_ctx.displayMode),
        showOptions: (__VLS_ctx.showOptions),
        showOrder: (__VLS_ctx.showOrder),
    }));
    const __VLS_25 = __VLS_24({
        ...{ 'onUpdate:displayMode': {} },
        ruleType: (__VLS_ctx.ruleType),
        config: (__VLS_ctx.config),
        displayMode: (__VLS_ctx.displayMode),
        showOptions: (__VLS_ctx.showOptions),
        showOrder: (__VLS_ctx.showOrder),
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    let __VLS_27;
    let __VLS_28;
    let __VLS_29;
    const __VLS_30 = {
        'onUpdate:displayMode': (...[$event]) => {
            if (!(__VLS_ctx.showDisplay))
                return;
            __VLS_ctx.emit('update:displayMode', $event);
        }
    };
    var __VLS_26;
}
/** @type {[typeof ReviewQuestionSubQuestionCreateModal, ]} */ ;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent(ReviewQuestionSubQuestionCreateModal, new ReviewQuestionSubQuestionCreateModal({
    open: (__VLS_ctx.showCreateModal),
    ruleOptions: (props.ruleOptions),
}));
const __VLS_32 = __VLS_31({
    open: (__VLS_ctx.showCreateModal),
    ruleOptions: (props.ruleOptions),
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
/** @type {__VLS_StyleScopedClasses['rule-additional-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['evaluation-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['score-sub-items-section']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReviewQuestionDisplayMethodCard: ReviewQuestionDisplayMethodCard,
            ReviewQuestionRatingMethodSection: ReviewQuestionRatingMethodSection,
            ReviewQuestionScoringMethodCard: ReviewQuestionScoringMethodCard,
            ReviewQuestionSubQuestionCreateModal: ReviewQuestionSubQuestionCreateModal,
            ReviewQuestionSubQuestionList: ReviewQuestionSubQuestionList,
            ReviewQuestionCalculationRuleSection: ReviewQuestionCalculationRuleSection,
            emit: emit,
            showAdditionalCards: showAdditionalCards,
            scoringVariant: scoringVariant,
            scoringMethod: scoringMethod,
            ratingSubQuestions: ratingSubQuestions,
            scoreSubQuestions: scoreSubQuestions,
            calculationRule: calculationRule,
            isScoreSubItems: isScoreSubItems,
            showOrder: showOrder,
            showDisplay: showDisplay,
            showOptions: showOptions,
            currentSubQuestionOptions: currentSubQuestionOptions,
            scoreCalculationRuleOptions: scoreCalculationRuleOptions,
            showCreateModal: showCreateModal,
            updateScoreSubQuestions: updateScoreSubQuestions,
            updateRatingSubQuestions: updateRatingSubQuestions,
            handleCreateSubQuestion: handleCreateSubQuestion,
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
