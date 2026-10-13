/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { performanceReviewQuestionApi, performanceReviewRuleApi } from '@/api/performance';
import FullScreenModal from '@/components/performance/FullScreenModal.vue';
import PerformanceRequiredLabel from '@/components/performance/PerformanceRequiredLabel.vue';
import ReviewQuestionFormBasic from '@/components/performance/ReviewQuestionFormBasic.vue';
import ReviewQuestionFormType from '@/components/performance/ReviewQuestionFormType.vue';
import ReviewQuestionRuleSelect from '@/components/performance/ReviewQuestionRuleSelect.vue';
import ReviewRuleConfigRenderer from '@/components/performance/ReviewRuleConfigRenderer.vue';
import ReviewQuestionRuleAdditionalCards from '@/components/performance/ReviewQuestionRuleAdditionalCards.vue';
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue';
const route = useRoute();
const router = useRouter();
const mode = computed(() => (route.name === 'ReviewQuestionEdit' ? 'edit' : 'create'));
const isSubQuestion = computed(() => route.query.isSub === '1' || route.query.isSub === 'true' || route.query.isSub === '' || route.query.isSub === null);
const entryMode = computed(() => isSubQuestion.value ? 'sub_question' : 'regular_question');
const title = computed(() => mode.value === 'edit' ? '编辑评估题' : isSubQuestion.value ? '新建子评估题' : '新建评估题');
const parentQuestionId = computed(() => {
    const value = Number(route.query.parent_question_id);
    return Number.isInteger(value) && value > 0 ? value : null;
});
const questionId = computed(() => {
    const value = Number(route.params.id);
    return Number.isInteger(value) && value > 0 ? value : null;
});
const form = reactive({
    language: '中文',
    name: String(route.query.name || ''),
    description: '',
    type: String(route.query.type || 'regular'),
    rule_id: null,
    remark: String(route.query.remark || ''),
});
const ruleOptions = ref([]);
const selectedRule = ref(null);
const displayMode = ref('标签样式');
const subQuestionOptions = ref({ none: [], condition: [] });
const subQuestions = ref([]);
const subQuestionValidation = ref('');
const scoringMethod = ref('direct');
const loadingSubQuestionOptions = ref(false);
const loadingRules = ref(false);
const loadingRule = ref(false);
const ruleError = ref('');
const submitting = ref(false);
const hydratingQuestion = ref(false);
let ruleLoadVersion = 0;
async function loadRules() {
    loadingRules.value = true;
    ruleError.value = '';
    try {
        ruleOptions.value = await performanceReviewRuleApi.list();
    }
    catch {
        ruleError.value = '评估规则加载失败，请稍后重试';
    }
    finally {
        loadingRules.value = false;
    }
}
async function loadSubQuestionOptions() {
    loadingSubQuestionOptions.value = true;
    try {
        const [none, condition] = await Promise.all([
            performanceReviewQuestionApi.listSubQuestionOptions('none'),
            performanceReviewQuestionApi.listSubQuestionOptions('condition'),
        ]);
        subQuestionOptions.value = { none, condition };
    }
    catch {
        subQuestionOptions.value = { none: [], condition: [] };
    }
    finally {
        loadingSubQuestionOptions.value = false;
    }
}
function normalizeScoringMethod(config) {
    const value = config.evaluationMethod ?? config.evaluation_method;
    const text = String(value ?? '');
    if (text === 'sub_items' || text.includes('子评估项'))
        return 'sub_items';
    if (text === 'total_score' || text.includes('总分项'))
        return 'total_score';
    return 'direct';
}
async function loadRule(id) {
    const requestVersion = ++ruleLoadVersion;
    selectedRule.value = null;
    displayMode.value = '标签样式';
    loadingRule.value = false;
    subQuestions.value = [];
    subQuestionValidation.value = '';
    scoringMethod.value = 'direct';
    if (id === null)
        return;
    loadingRule.value = true;
    ruleError.value = '';
    try {
        const rule = await performanceReviewRuleApi.get(id);
        if (requestVersion === ruleLoadVersion) {
            selectedRule.value = rule;
            scoringMethod.value = normalizeScoringMethod(rule.config);
            subQuestions.value = [];
            subQuestionValidation.value = '';
        }
    }
    catch {
        if (requestVersion === ruleLoadVersion)
            ruleError.value = '评估规则配置加载失败，请稍后重试';
    }
    finally {
        if (requestVersion === ruleLoadVersion)
            loadingRule.value = false;
    }
}
watch(() => form.rule_id, (id) => { void loadRule(id); });
watch(() => form.type, () => {
    if (mode.value !== 'create' || hydratingQuestion.value)
        return;
    ruleLoadVersion += 1;
    selectedRule.value = null;
    displayMode.value = '标签样式';
    loadingRule.value = false;
    ruleError.value = '';
    if (form.rule_id !== null)
        form.rule_id = null;
}, { flush: 'sync' });
async function loadQuestion() {
    if (mode.value !== 'edit' || questionId.value === null)
        return;
    hydratingQuestion.value = true;
    try {
        const question = await performanceReviewQuestionApi.get(questionId.value);
        form.language = question.language === 'zh-CN' ? '中文' : question.language;
        form.name = question.name;
        form.description = question.description;
        form.type = question.type;
        form.rule_id = question.rule_id;
        displayMode.value = question.display_mode || '标签样式';
        form.remark = question.remark;
    }
    catch {
        ElMessage.error('评估题加载失败，请稍后重试');
    }
    finally {
        hydratingQuestion.value = false;
    }
}
onMounted(async () => {
    await Promise.all([loadRules(), loadSubQuestionOptions()]);
    await loadQuestion();
});
function back() { void router.push({ name: 'ReviewQuestionManagement' }); }
function isScoreRangeSubItems() {
    const rule = selectedRule.value;
    if (entryMode.value !== 'regular_question' || !rule || !['评分', '评分映射等级型'].includes(rule.review_type) || scoringMethod.value !== 'sub_items')
        return false;
    if (rule.review_type === '评分映射等级型')
        return true;
    const config = rule.config.score && typeof rule.config.score === 'object'
        ? rule.config.score
        : rule.config;
    const method = config.method ?? config.score_method;
    return String(method ?? '').includes('分数上下限') || String(method ?? '').includes('score_range');
}
function updateDisplayMode(value) {
    displayMode.value = value;
}
async function submit() {
    subQuestionValidation.value = '';
    if (!form.name.trim()) {
        ElMessage.warning('请输入名称');
        return;
    }
    if (form.rule_id === null) {
        ElMessage.warning('请选择评估规则');
        return;
    }
    if (isScoreRangeSubItems() && !subQuestions.value.some((row) => row.question_id !== null)) {
        subQuestionValidation.value = '该字段是必填字段';
        return;
    }
    submitting.value = true;
    const payload = {
        language: 'zh-CN',
        name: form.name.trim(),
        description: form.description,
        type: form.type,
        is_sub_question: isSubQuestion.value,
        parent_question_id: parentQuestionId.value,
        rule_id: form.rule_id,
        display_mode: displayMode.value,
        remark: form.remark,
    };
    try {
        if (mode.value === 'edit' && questionId.value !== null)
            await performanceReviewQuestionApi.update(questionId.value, payload);
        else
            await performanceReviewQuestionApi.create(payload);
        ElMessage.success(mode.value === 'create' ? '已创建' : '已保存');
        back();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail?.message || '评估题保存失败，请稍后重试');
    }
    finally {
        submitting.value = false;
    }
}
function preview() { ElMessage.info('预览'); }
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-section-form']} */ ;
/** @type {__VLS_StyleScopedClasses['question-section-form']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
/** @type {[typeof FullScreenModal, typeof FullScreenModal, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(FullScreenModal, new FullScreenModal({
    ...{ 'onBack': {} },
    ...{ 'onSubmit': {} },
    ...{ 'onPreview': {} },
    ...{ 'onCancel': {} },
    title: (__VLS_ctx.title),
    submitting: (__VLS_ctx.submitting),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    ...{ 'onSubmit': {} },
    ...{ 'onPreview': {} },
    ...{ 'onCancel': {} },
    title: (__VLS_ctx.title),
    submitting: (__VLS_ctx.submitting),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (__VLS_ctx.back)
};
const __VLS_7 = {
    onSubmit: (__VLS_ctx.submit)
};
const __VLS_8 = {
    onPreview: (__VLS_ctx.preview)
};
const __VLS_9 = {
    onCancel: (__VLS_ctx.back)
};
var __VLS_10 = {};
__VLS_2.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "question-create-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
/** @type {[typeof ReviewQuestionFormBasic, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(ReviewQuestionFormBasic, new ReviewQuestionFormBasic({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form),
}));
const __VLS_12 = __VLS_11({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form),
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
let __VLS_14;
let __VLS_15;
let __VLS_16;
const __VLS_17 = {
    'onUpdate:modelValue': (...[$event]) => {
        Object.assign(__VLS_ctx.form, $event);
    }
};
var __VLS_13;
const __VLS_18 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent(__VLS_18, new __VLS_18({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}));
const __VLS_20 = __VLS_19({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
__VLS_21.slots.default;
const __VLS_22 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({}));
const __VLS_24 = __VLS_23({}, ...__VLS_functionalComponentArgsRest(__VLS_23));
__VLS_25.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_25.slots;
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "类型",
    }));
    const __VLS_27 = __VLS_26({
        label: "类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
}
/** @type {[typeof ReviewQuestionFormType, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(ReviewQuestionFormType, new ReviewQuestionFormType({
    modelValue: (__VLS_ctx.form.type),
    entryMode: (__VLS_ctx.entryMode),
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.form.type),
    entryMode: (__VLS_ctx.entryMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_25;
var __VLS_21;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card rule-card" },
    ...{ class: ({ 'is-loaded': __VLS_ctx.form.rule_id !== null, 'rating-rule-card': __VLS_ctx.selectedRule?.review_type === '评级' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
const __VLS_32 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}));
const __VLS_34 = __VLS_33({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_39.slots;
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "评估规则",
    }));
    const __VLS_41 = __VLS_40({
        label: "评估规则",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
}
/** @type {[typeof ReviewQuestionRuleSelect, ]} */ ;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent(ReviewQuestionRuleSelect, new ReviewQuestionRuleSelect({
    modelValue: (__VLS_ctx.form.rule_id),
    options: (__VLS_ctx.ruleOptions),
    loading: (__VLS_ctx.loadingRules),
    error: (__VLS_ctx.ruleError),
}));
const __VLS_44 = __VLS_43({
    modelValue: (__VLS_ctx.form.rule_id),
    options: (__VLS_ctx.ruleOptions),
    loading: (__VLS_ctx.loadingRules),
    error: (__VLS_ctx.ruleError),
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
var __VLS_39;
var __VLS_35;
if (__VLS_ctx.form.rule_id !== null) {
    /** @type {[typeof ReviewRuleConfigRenderer, ]} */ ;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent(ReviewRuleConfigRenderer, new ReviewRuleConfigRenderer({
        entryMode: (__VLS_ctx.entryMode),
        ruleType: (__VLS_ctx.selectedRule?.review_type || '评级'),
        config: (__VLS_ctx.selectedRule?.config || {}),
        loading: (__VLS_ctx.loadingRule),
        error: (__VLS_ctx.ruleError),
    }));
    const __VLS_47 = __VLS_46({
        entryMode: (__VLS_ctx.entryMode),
        ruleType: (__VLS_ctx.selectedRule?.review_type || '评级'),
        config: (__VLS_ctx.selectedRule?.config || {}),
        loading: (__VLS_ctx.loadingRule),
        error: (__VLS_ctx.ruleError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
}
if (__VLS_ctx.selectedRule) {
    /** @type {[typeof ReviewQuestionRuleAdditionalCards, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(ReviewQuestionRuleAdditionalCards, new ReviewQuestionRuleAdditionalCards({
        ...{ 'onUpdate:displayMode': {} },
        ...{ 'onUpdate:scoringMethod': {} },
        ...{ 'onUpdate:subQuestions': {} },
        entryMode: (__VLS_ctx.entryMode),
        ruleType: (__VLS_ctx.selectedRule.review_type),
        config: (__VLS_ctx.selectedRule.config),
        displayMode: (__VLS_ctx.displayMode),
        ruleOptions: (__VLS_ctx.ruleOptions),
        scoringMethod: (__VLS_ctx.scoringMethod),
        subQuestions: (__VLS_ctx.subQuestions),
        validationMessage: (__VLS_ctx.subQuestionValidation),
        subQuestionOptions: (__VLS_ctx.subQuestionOptions),
        subQuestionOptionsLoading: (__VLS_ctx.loadingSubQuestionOptions),
    }));
    const __VLS_50 = __VLS_49({
        ...{ 'onUpdate:displayMode': {} },
        ...{ 'onUpdate:scoringMethod': {} },
        ...{ 'onUpdate:subQuestions': {} },
        entryMode: (__VLS_ctx.entryMode),
        ruleType: (__VLS_ctx.selectedRule.review_type),
        config: (__VLS_ctx.selectedRule.config),
        displayMode: (__VLS_ctx.displayMode),
        ruleOptions: (__VLS_ctx.ruleOptions),
        scoringMethod: (__VLS_ctx.scoringMethod),
        subQuestions: (__VLS_ctx.subQuestions),
        validationMessage: (__VLS_ctx.subQuestionValidation),
        subQuestionOptions: (__VLS_ctx.subQuestionOptions),
        subQuestionOptionsLoading: (__VLS_ctx.loadingSubQuestionOptions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    let __VLS_52;
    let __VLS_53;
    let __VLS_54;
    const __VLS_55 = {
        'onUpdate:displayMode': (__VLS_ctx.updateDisplayMode)
    };
    const __VLS_56 = {
        'onUpdate:scoringMethod': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.scoringMethod = $event;
        }
    };
    const __VLS_57 = {
        'onUpdate:subQuestions': (...[$event]) => {
            if (!(__VLS_ctx.selectedRule))
                return;
            __VLS_ctx.subQuestions = $event;
        }
    };
    var __VLS_51;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card remark-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
const __VLS_58 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}));
const __VLS_60 = __VLS_59({
    labelPosition: "top",
    ...{ class: "question-section-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_59));
__VLS_61.slots.default;
const __VLS_62 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({}));
const __VLS_64 = __VLS_63({}, ...__VLS_functionalComponentArgsRest(__VLS_63));
__VLS_65.slots.default;
{
    const { label: __VLS_thisSlot } = __VLS_65.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
}
/** @type {[typeof PerformanceTextField, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
    modelValue: (__VLS_ctx.form.remark),
    type: "textarea",
    maxlength: (2000),
    showCount: true,
}));
const __VLS_67 = __VLS_66({
    modelValue: (__VLS_ctx.form.remark),
    type: "textarea",
    maxlength: (2000),
    showCount: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_66));
var __VLS_65;
var __VLS_61;
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['question-create-content']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-section-form']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-section-form']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-section-form']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FullScreenModal: FullScreenModal,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            ReviewQuestionFormBasic: ReviewQuestionFormBasic,
            ReviewQuestionFormType: ReviewQuestionFormType,
            ReviewQuestionRuleSelect: ReviewQuestionRuleSelect,
            ReviewRuleConfigRenderer: ReviewRuleConfigRenderer,
            ReviewQuestionRuleAdditionalCards: ReviewQuestionRuleAdditionalCards,
            PerformanceTextField: PerformanceTextField,
            entryMode: entryMode,
            title: title,
            form: form,
            ruleOptions: ruleOptions,
            selectedRule: selectedRule,
            displayMode: displayMode,
            subQuestionOptions: subQuestionOptions,
            subQuestions: subQuestions,
            subQuestionValidation: subQuestionValidation,
            scoringMethod: scoringMethod,
            loadingSubQuestionOptions: loadingSubQuestionOptions,
            loadingRules: loadingRules,
            loadingRule: loadingRule,
            ruleError: ruleError,
            submitting: submitting,
            back: back,
            updateDisplayMode: updateDisplayMode,
            submit: submit,
            preview: preview,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
