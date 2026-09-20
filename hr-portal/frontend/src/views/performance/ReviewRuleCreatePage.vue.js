/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { performanceReviewRuleApi } from '@/api/performance';
import FullScreenModal from '@/components/performance/FullScreenModal.vue';
import ReviewRuleForm from '@/components/performance/ReviewRuleForm.vue';
import ReviewRulePreviewModal from '@/components/performance/ReviewRulePreviewModal.vue';
const route = useRoute();
const router = useRouter();
const mode = computed(() => route.name === 'ReviewRuleEdit' ? 'edit' : 'create');
const title = computed(() => mode.value === 'create' ? '新建评估规则' : String(route.query.name || '编辑评估规则'));
const ruleId = computed(() => {
    const value = Number(route.params.id);
    return Number.isInteger(value) && value > 0 ? value : null;
});
const formRef = ref(null);
const formValue = ref({});
const isUsed = ref(false);
const ruleLoaded = ref(mode.value === 'create');
const previewPayload = ref(null);
const previewOpen = computed(() => previewPayload.value !== null);
const previewType = computed(() => {
    if (previewPayload.value?.reviewType === '评分')
        return 'score';
    if (previewPayload.value?.reviewType === '评分映射等级型')
        return 'mapping';
    return 'rating';
});
const submitting = ref(false);
function returnToRuleList() {
    void router.push({ name: 'ReviewQuestionManagement', query: { tab: 'rule' } });
}
function openPreview(value) {
    previewPayload.value = value;
}
function closePreview() {
    previewPayload.value = null;
}
function toPayload(value) {
    return {
        name: value.name.trim(),
        review_type: value.reviewType,
        config: {
            languages: value.languages,
            gradeParticipatesInCalculation: value.gradeParticipatesInCalculation,
            levels: value.levels,
            score: value.score,
            mapping: value.mapping,
        },
        remark: value.remark,
    };
}
async function handleSubmit(value) {
    if (submitting.value)
        return;
    submitting.value = true;
    try {
        if (mode.value === 'edit' && ruleId.value !== null) {
            await performanceReviewRuleApi.update(ruleId.value, toPayload(value));
        }
        else {
            await performanceReviewRuleApi.create(toPayload(value));
        }
        ElMessage.success(mode.value === 'create' ? '评估规则已创建' : '评估规则已保存');
        returnToRuleList();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail?.message || '评估规则保存失败，请稍后重试');
    }
    finally {
        submitting.value = false;
    }
}
async function loadRule() {
    if (mode.value !== 'edit' || ruleId.value === null)
        return;
    try {
        const detail = await performanceReviewRuleApi.get(ruleId.value);
        isUsed.value = detail.is_used;
        formValue.value = {
            name: detail.name,
            reviewType: detail.review_type,
            ...detail.config,
            remark: detail.remark,
        };
    }
    catch {
        ElMessage.error('评估规则加载失败，请稍后重试');
    }
    finally {
        ruleLoaded.value = true;
    }
}
onMounted(() => { void loadRule(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
    onBack: (__VLS_ctx.returnToRuleList)
};
const __VLS_7 = {
    onSubmit: (...[$event]) => {
        __VLS_ctx.formRef?.submit();
    }
};
const __VLS_8 = {
    onPreview: (...[$event]) => {
        __VLS_ctx.formRef?.preview();
    }
};
const __VLS_9 = {
    onCancel: (__VLS_ctx.returnToRuleList)
};
var __VLS_10 = {};
__VLS_2.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-rule-page-content" },
    'data-mode': (__VLS_ctx.mode),
});
if (__VLS_ctx.ruleLoaded) {
    /** @type {[typeof ReviewRuleForm, ]} */ ;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent(ReviewRuleForm, new ReviewRuleForm({
        ...{ 'onPreview': {} },
        ...{ 'onSubmit': {} },
        ref: "formRef",
        modelValue: (__VLS_ctx.formValue),
        mode: (__VLS_ctx.mode),
        isUsed: (__VLS_ctx.isUsed),
    }));
    const __VLS_12 = __VLS_11({
        ...{ 'onPreview': {} },
        ...{ 'onSubmit': {} },
        ref: "formRef",
        modelValue: (__VLS_ctx.formValue),
        mode: (__VLS_ctx.mode),
        isUsed: (__VLS_ctx.isUsed),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    let __VLS_14;
    let __VLS_15;
    let __VLS_16;
    const __VLS_17 = {
        onPreview: (__VLS_ctx.openPreview)
    };
    const __VLS_18 = {
        onSubmit: (__VLS_ctx.handleSubmit)
    };
    /** @type {typeof __VLS_ctx.formRef} */ ;
    var __VLS_19 = {};
    var __VLS_13;
}
if (__VLS_ctx.previewPayload) {
    /** @type {[typeof ReviewRulePreviewModal, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(ReviewRulePreviewModal, new ReviewRulePreviewModal({
        ...{ 'onClose': {} },
        open: (__VLS_ctx.previewOpen),
        reviewType: (__VLS_ctx.previewType),
        formValue: (__VLS_ctx.previewPayload),
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClose': {} },
        open: (__VLS_ctx.previewOpen),
        reviewType: (__VLS_ctx.previewType),
        formValue: (__VLS_ctx.previewPayload),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClose: (__VLS_ctx.closePreview)
    };
    var __VLS_23;
}
var __VLS_2;
/** @type {__VLS_StyleScopedClasses['review-rule-page-content']} */ ;
// @ts-ignore
var __VLS_20 = __VLS_19;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FullScreenModal: FullScreenModal,
            ReviewRuleForm: ReviewRuleForm,
            ReviewRulePreviewModal: ReviewRulePreviewModal,
            mode: mode,
            title: title,
            formRef: formRef,
            formValue: formValue,
            isUsed: isUsed,
            ruleLoaded: ruleLoaded,
            previewPayload: previewPayload,
            previewOpen: previewOpen,
            previewType: previewType,
            submitting: submitting,
            returnToRuleList: returnToRuleList,
            openPreview: openPreview,
            closePreview: closePreview,
            handleSubmit: handleSubmit,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
