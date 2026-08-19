/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { nextTick, ref } from 'vue';
import { ElMessage } from 'element-plus';
import DocumentPaperPreview from '@/components/document/DocumentPaperPreview.vue';
import { toolsApi } from '@/api/tools';
import { printPdfBlob } from '@/utils/printPdf';
const open = ref(false);
const loading = ref(false);
const printing = ref(false);
const title = ref('文档预览');
const previewHtml = ref('');
const originalPreviewHtml = ref('');
const draftAdjusted = ref(false);
const previewRef = ref(null);
const agreement = ref(null);
function toNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
}
function currentDraft() {
    const html = previewRef.value?.getHtml() || previewHtml.value;
    return {
        draft_html: draftAdjusted.value ? html : null,
        manually_adjusted: draftAdjusted.value,
    };
}
async function prepareAgreement(action) {
    const query = action.query || {};
    const employeeId = toNumber(query.employee_id);
    if (!employeeId) {
        throw new Error('缺少员工信息，无法生成协议');
    }
    agreement.value = await toolsApi.prepareAgreement({
        employee_id: employeeId,
        leave_date: typeof query.leave_date === 'string' ? query.leave_date : null,
        plan: query.plan === 'N' ? 'N' : 'N+1',
        region: typeof query.region === 'string' ? query.region : null,
        template_code: typeof query.template_code === 'string' ? query.template_code : undefined,
    });
    previewHtml.value = await toolsApi.previewAgreement(agreement.value);
    originalPreviewHtml.value = previewHtml.value;
    draftAdjusted.value = false;
    title.value = `${action.type === 'document_print' ? '打印' : '预览'}解除协议`;
    await nextTick();
    previewRef.value?.setHtml(previewHtml.value);
}
async function printAgreement() {
    if (!agreement.value)
        return;
    printing.value = true;
    try {
        const resp = await toolsApi.downloadAgreementPdf(agreement.value, currentDraft());
        printPdfBlob(new Blob([resp.data], { type: 'application/pdf' }));
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '打印失败');
    }
    finally {
        printing.value = false;
    }
}
async function execute(action) {
    loading.value = true;
    open.value = action.type === 'document_preview';
    agreement.value = null;
    previewHtml.value = '';
    originalPreviewHtml.value = '';
    draftAdjusted.value = false;
    try {
        const businessType = action.query?.business_type;
        if (businessType !== 'agreement') {
            throw new Error('当前暂不支持该文档类型');
        }
        await prepareAgreement(action);
        if (action.type === 'document_print') {
            await printAgreement();
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || e?.message || '文档生成失败');
        open.value = false;
    }
    finally {
        loading.value = false;
    }
}
function resetDraft() {
    previewHtml.value = originalPreviewHtml.value;
    previewRef.value?.setHtml(originalPreviewHtml.value);
    draftAdjusted.value = false;
}
const __VLS_exposed = { execute };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.open),
    title: (__VLS_ctx.title),
    width: "76%",
    top: "4vh",
    closeOnClickModal: (false),
    appendToBody: true,
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.open),
    title: (__VLS_ctx.title),
    width: "76%",
    top: "4vh",
    closeOnClickModal: (false),
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "doc-action-preview" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-tip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-actions" },
});
const __VLS_5 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}));
const __VLS_7 = __VLS_6({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_8.slots.default;
(__VLS_ctx.draftAdjusted ? '已人工调整' : '标准生成');
var __VLS_8;
const __VLS_9 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}));
const __VLS_11 = __VLS_10({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    onClick: (__VLS_ctx.resetDraft)
};
__VLS_12.slots.default;
var __VLS_12;
/** @type {[typeof DocumentPaperPreview, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(DocumentPaperPreview, new DocumentPaperPreview({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.loading),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onDirty: (...[$event]) => {
        __VLS_ctx.draftAdjusted = $event;
    }
};
/** @type {typeof __VLS_ctx.previewRef} */ ;
var __VLS_24 = {};
var __VLS_19;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_26 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
        ...{ 'onClick': {} },
    }));
    const __VLS_28 = __VLS_27({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_27));
    let __VLS_30;
    let __VLS_31;
    let __VLS_32;
    const __VLS_33 = {
        onClick: (...[$event]) => {
            __VLS_ctx.open = false;
        }
    };
    __VLS_29.slots.default;
    var __VLS_29;
    const __VLS_34 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.printing),
        disabled: (!__VLS_ctx.agreement),
    }));
    const __VLS_36 = __VLS_35({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.printing),
        disabled: (!__VLS_ctx.agreement),
    }, ...__VLS_functionalComponentArgsRest(__VLS_35));
    let __VLS_38;
    let __VLS_39;
    let __VLS_40;
    const __VLS_41 = {
        onClick: (__VLS_ctx.printAgreement)
    };
    __VLS_37.slots.default;
    var __VLS_37;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['doc-action-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-head']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-actions']} */ ;
// @ts-ignore
var __VLS_25 = __VLS_24;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DocumentPaperPreview: DocumentPaperPreview,
            open: open,
            loading: loading,
            printing: printing,
            title: title,
            draftAdjusted: draftAdjusted,
            previewRef: previewRef,
            agreement: agreement,
            printAgreement: printAgreement,
            resetDraft: resetDraft,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
});
; /* PartiallyEnd: #4569/main.vue */
