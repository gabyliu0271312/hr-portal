/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import FullScreenModal from '@/components/performance/FullScreenModal.vue';
import TagFillQuestionForm from '@/components/performance/TagFillQuestionForm.vue';
import { TAG_FILL_QUESTION_FIXTURES, cloneTagFillQuestion } from '@/components/performance/tagFillQuestionFixtures';
const route = useRoute();
const router = useRouter();
const mode = computed(() => route.name === 'TaggedFillQuestionEdit' ? 'edit' : 'create');
const recordId = computed(() => String(route.params.id || ''));
const title = computed(() => mode.value === 'edit' ? form.value.name || '编辑标签型填写题' : '新建标签型填写题');
const form = ref(mode.value === 'edit'
    ? cloneTagFillQuestion(TAG_FILL_QUESTION_FIXTURES.find((item) => item.id === recordId.value) || TAG_FILL_QUESTION_FIXTURES[0])
    : { id: `draft-${Date.now()}`, name: '', description: '', creator: '', createdAt: '', remark: '', tags: [{ id: 'draft-tag-1', name: '', description: '', prompt: '' }] });
const formRef = ref(null);
const preview = ref(null);
function back() {
    void router.push({ name: 'TaggedFillQuestionManagement' });
}
function showPreview(value) {
    preview.value = value;
}
function closePreview() {
    preview.value = null;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
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
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    ...{ 'onSubmit': {} },
    ...{ 'onPreview': {} },
    ...{ 'onCancel': {} },
    title: (__VLS_ctx.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (__VLS_ctx.back)
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
    onCancel: (__VLS_ctx.back)
};
__VLS_2.slots.default;
/** @type {[typeof TagFillQuestionForm, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(TagFillQuestionForm, new TagFillQuestionForm({
    ...{ 'onPreview': {} },
    ref: "formRef",
    modelValue: (__VLS_ctx.form),
    mode: (__VLS_ctx.mode),
}));
const __VLS_11 = __VLS_10({
    ...{ 'onPreview': {} },
    ref: "formRef",
    modelValue: (__VLS_ctx.form),
    mode: (__VLS_ctx.mode),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    onPreview: (__VLS_ctx.showPreview)
};
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_17 = {};
var __VLS_12;
var __VLS_2;
const __VLS_19 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.preview !== null),
    title: "预览",
    width: "600px",
    destroyOnClose: true,
}));
const __VLS_21 = __VLS_20({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.preview !== null),
    title: "预览",
    width: "600px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
let __VLS_23;
let __VLS_24;
let __VLS_25;
const __VLS_26 = {
    onClose: (__VLS_ctx.closePreview)
};
__VLS_22.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-content" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
(__VLS_ctx.preview?.name);
if (__VLS_ctx.preview?.description) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    (__VLS_ctx.preview.description);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-tags" },
});
for (const [tag] of __VLS_getVForSourceType((__VLS_ctx.preview?.tags))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        key: (tag.id),
        ...{ class: "preview-tag" },
    });
    (tag.name);
}
var __VLS_22;
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-tag']} */ ;
// @ts-ignore
var __VLS_18 = __VLS_17;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FullScreenModal: FullScreenModal,
            TagFillQuestionForm: TagFillQuestionForm,
            mode: mode,
            title: title,
            form: form,
            formRef: formRef,
            preview: preview,
            back: back,
            showPreview: showPreview,
            closePreview: closePreview,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
