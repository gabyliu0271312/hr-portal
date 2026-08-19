/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Document, Printer } from '@element-plus/icons-vue';
import { toolsApi, } from '@/api/tools';
import DocumentPaperPreview from '@/components/document/DocumentPaperPreview.vue';
import { printPdfBlob } from '@/utils/printPdf';
const keyword = ref('');
const searching = ref(false);
const preparing = ref(false);
const printing = ref(false);
const employees = ref([]);
const selected = ref(null);
const templates = ref([]);
const templateCode = ref('annual_income');
const certData = ref(null);
const previewOpen = ref(false);
const previewing = ref(false);
const downloading = ref(false);
const previewHtml = ref('');
const originalPreviewHtml = ref('');
const previewRef = ref(null);
const draftAdjusted = ref(false);
const busy = computed(() => searching.value || preparing.value);
const currentTemplate = computed(() => templates.value.find((item) => item.code === templateCode.value));
const currentManualVariables = computed(() => currentTemplate.value?.manual_variables || []);
const previewManualVariables = computed(() => {
    if (!certData.value)
        return [];
    return templates.value.find((item) => item.code === certData.value?.template_code)?.manual_variables || [];
});
const mainManualVariables = computed(() => {
    if (!certData.value || previewOpen.value)
        return [];
    return previewManualVariables.value;
});
function money(v) {
    if (v === null || v === undefined)
        return '—';
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
async function loadTemplates() {
    try {
        templates.value = await toolsApi.listIncomeCertificateTemplates();
        if (templates.value.length && !templates.value.some((item) => item.code === templateCode.value)) {
            templateCode.value = templates.value[0].code;
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载模板失败');
    }
}
async function searchAndPrepare() {
    if (!keyword.value.trim()) {
        ElMessage.warning('请输入工号、中文名或英文名');
        return;
    }
    searching.value = true;
    selected.value = null;
    certData.value = null;
    try {
        employees.value = await toolsApi.searchIncomeCertificateEmployees({ keyword: keyword.value.trim(), limit: 30 });
        if (!employees.value.length) {
            ElMessage.info('未找到有权限查看的员工');
        }
        else if (employees.value.length === 1) {
            pickEmployee(employees.value[0]);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '查询员工失败');
    }
    finally {
        searching.value = false;
    }
}
function pickEmployee(row) {
    selected.value = row;
    employees.value = [];
    prepareCertificate();
}
function rowClassName({ row }) {
    return selected.value && row.id === selected.value.id ? 'is-selected-row' : '';
}
async function prepareCertificate() {
    if (!selected.value || !templateCode.value)
        return;
    preparing.value = true;
    try {
        certData.value = await toolsApi.prepareIncomeCertificate({
            employee_id: selected.value.id,
            template_code: templateCode.value,
        });
        ensureManualValues(certData.value, currentManualVariables.value);
    }
    catch (e) {
        certData.value = null;
        ElMessage.error(`已找到「${selected.value.name || ''}」，但${e?.response?.data?.detail || '开具失败'}`);
    }
    finally {
        preparing.value = false;
    }
}
watch(templateCode, () => {
    if (selected.value)
        prepareCertificate();
});
function ensureManualValues(data, variables) {
    data.manual_values = data.manual_values || {};
    variables.forEach((variable) => {
        if (!(variable.variable_code in data.manual_values)) {
            data.manual_values[variable.variable_code] = variable.default_value || fieldDefaultValue(data, variable.variable_code);
        }
    });
}
function fieldDefaultValue(data, code) {
    const value = data[code];
    if (value === null || value === undefined || typeof value === 'object')
        return '';
    return String(value);
}
function manualValue(variable) {
    if (!certData.value)
        return '';
    ensureManualValues(certData.value, previewManualVariables.value);
    return String(certData.value.manual_values[variable.variable_code] ?? '');
}
function setManualValue(variable, value) {
    if (!certData.value)
        return;
    ensureManualValues(certData.value, previewManualVariables.value);
    certData.value.manual_values[variable.variable_code] = value;
    if (variable.variable_code in certData.value) {
        ;
        certData.value[variable.variable_code] = value;
    }
}
function validateManualValues() {
    if (!certData.value)
        return false;
    ensureManualValues(certData.value, previewManualVariables.value);
    const missing = previewManualVariables.value
        .filter((variable) => variable.required && !String(certData.value?.manual_values?.[variable.variable_code] ?? '').trim())
        .map((variable) => variable.variable_name);
    if (missing.length) {
        ElMessage.warning(`请先填写：${missing.join('、')}`);
        return false;
    }
    return true;
}
function resetAll() {
    keyword.value = '';
    employees.value = [];
    selected.value = null;
    certData.value = null;
    previewHtml.value = '';
    originalPreviewHtml.value = '';
    draftAdjusted.value = false;
    previewOpen.value = false;
}
async function openPreview() {
    if (!certData.value)
        return;
    previewOpen.value = true;
    await refreshPreview();
}
async function refreshPreview() {
    if (!certData.value)
        return;
    ensureManualValues(certData.value, previewManualVariables.value);
    if (!validateManualValues())
        return;
    if (draftAdjusted.value) {
        try {
            await ElMessageBox.confirm('重新生成会覆盖当前预览中的人工修改，是否继续？', '确认重新生成', {
                confirmButtonText: '继续',
                cancelButtonText: '取消',
                type: 'warning',
            });
        }
        catch {
            return;
        }
    }
    previewing.value = true;
    try {
        previewHtml.value = await toolsApi.previewIncomeCertificate(certData.value);
        originalPreviewHtml.value = previewHtml.value;
        draftAdjusted.value = false;
        await nextTick();
        previewRef.value?.setHtml(previewHtml.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
function resetPreviewDraft() {
    previewHtml.value = originalPreviewHtml.value;
    previewRef.value?.setHtml(originalPreviewHtml.value);
}
function currentDraft() {
    const html = previewRef.value?.getHtml() || previewHtml.value;
    return {
        draft_html: draftAdjusted.value ? html : null,
        manually_adjusted: draftAdjusted.value,
    };
}
async function downloadDocx() {
    if (!certData.value)
        return;
    if (!validateManualValues())
        return;
    downloading.value = true;
    try {
        const resp = await toolsApi.downloadIncomeCertificate(certData.value, currentDraft());
        const blob = new Blob([resp.data], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `收入证明_${certData.value.name || '员工'}.docx`;
        a.click();
        URL.revokeObjectURL(url);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载失败');
    }
    finally {
        downloading.value = false;
    }
}
async function printDirect() {
    if (!certData.value)
        return;
    if (!validateManualValues())
        return;
    printing.value = true;
    try {
        if (!previewOpen.value || !previewHtml.value) {
            previewHtml.value = await toolsApi.previewIncomeCertificate(certData.value);
            originalPreviewHtml.value = previewHtml.value;
            draftAdjusted.value = false;
            await nextTick();
            previewRef.value?.setHtml(previewHtml.value);
        }
        const resp = await toolsApi.downloadIncomeCertificatePdf(certData.value, currentDraft());
        printPdfBlob(new Blob([resp.data], { type: 'application/pdf' }));
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '打印失败');
    }
    finally {
        printing.value = false;
    }
}
onMounted(loadTemplates);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['manual-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "income-cert" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    bodyStyle: "padding: 16px",
}));
const __VLS_2 = __VLS_1({
    bodyStyle: "padding: 16px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.certData) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_4 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            loading: (__VLS_ctx.previewing),
        }));
        const __VLS_6 = __VLS_5({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            loading: (__VLS_ctx.previewing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        let __VLS_8;
        let __VLS_9;
        let __VLS_10;
        const __VLS_11 = {
            onClick: (__VLS_ctx.openPreview)
        };
        __VLS_7.slots.default;
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            ...{ style: {} },
        }));
        const __VLS_14 = __VLS_13({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = {}.Document;
        /** @type {[typeof __VLS_components.Document, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        var __VLS_7;
        const __VLS_20 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.printing),
        }));
        const __VLS_22 = __VLS_21({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.printing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        let __VLS_24;
        let __VLS_25;
        let __VLS_26;
        const __VLS_27 = {
            onClick: (__VLS_ctx.printDirect)
        };
        __VLS_23.slots.default;
        const __VLS_28 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            ...{ style: {} },
        }));
        const __VLS_30 = __VLS_29({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        const __VLS_32 = {}.Printer;
        /** @type {[typeof __VLS_components.Printer, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
        const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
        var __VLS_31;
        var __VLS_23;
    }
}
const __VLS_36 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ class: "op-bar" },
}));
const __VLS_38 = __VLS_37({
    ...{ class: "op-bar" },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "op-row" },
});
const __VLS_40 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
const __VLS_44 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "工号 / 中文名 / 英文名",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_46 = __VLS_45({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "工号 / 中文名 / 英文名",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onKeyup: (__VLS_ctx.searchAndPrepare)
};
__VLS_47.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_47.slots;
    const __VLS_52 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
    const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    var __VLS_55;
}
var __VLS_47;
var __VLS_43;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "模板",
}));
const __VLS_62 = __VLS_61({
    label: "模板",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    modelValue: (__VLS_ctx.templateCode),
    ...{ style: {} },
    placeholder: "请选择模板",
}));
const __VLS_66 = __VLS_65({
    modelValue: (__VLS_ctx.templateCode),
    ...{ style: {} },
    placeholder: "请选择模板",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.templates))) {
    const __VLS_68 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        key: (t.code),
        label: (t.name),
        value: (t.code),
    }));
    const __VLS_70 = __VLS_69({
        key: (t.code),
        label: (t.name),
        value: (t.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
}
var __VLS_67;
var __VLS_63;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "op-row" },
});
const __VLS_72 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.busy),
}));
const __VLS_78 = __VLS_77({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.busy),
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onClick: (__VLS_ctx.searchAndPrepare)
};
__VLS_79.slots.default;
const __VLS_84 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    ...{ style: {} },
}));
const __VLS_86 = __VLS_85({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
var __VLS_87;
var __VLS_79;
const __VLS_92 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    ...{ 'onClick': {} },
    link: true,
}));
const __VLS_94 = __VLS_93({
    ...{ 'onClick': {} },
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
let __VLS_96;
let __VLS_97;
let __VLS_98;
const __VLS_99 = {
    onClick: (__VLS_ctx.resetAll)
};
__VLS_95.slots.default;
var __VLS_95;
var __VLS_75;
var __VLS_39;
if (__VLS_ctx.employees.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    (__VLS_ctx.employees.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_100 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.employees),
        stripe: true,
        highlightCurrentRow: true,
        size: "small",
        maxHeight: "220",
        ...{ style: {} },
        rowClassName: (__VLS_ctx.rowClassName),
    }));
    const __VLS_102 = __VLS_101({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.employees),
        stripe: true,
        highlightCurrentRow: true,
        size: "small",
        maxHeight: "220",
        ...{ style: {} },
        rowClassName: (__VLS_ctx.rowClassName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    let __VLS_104;
    let __VLS_105;
    let __VLS_106;
    const __VLS_107 = {
        onRowClick: (__VLS_ctx.pickEmployee)
    };
    __VLS_103.slots.default;
    const __VLS_108 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }));
    const __VLS_110 = __VLS_109({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    const __VLS_112 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }));
    const __VLS_114 = __VLS_113({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    const __VLS_116 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        prop: "company",
        label: "公司",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }));
    const __VLS_118 = __VLS_117({
        prop: "company",
        label: "公司",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    const __VLS_120 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        prop: "department",
        label: "部门",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }));
    const __VLS_122 = __VLS_121({
        prop: "department",
        label: "部门",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    const __VLS_124 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        prop: "work_region",
        label: "工作地",
        align: "left",
        minWidth: "90",
    }));
    const __VLS_126 = __VLS_125({
        prop: "work_region",
        label: "工作地",
        align: "left",
        minWidth: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    __VLS_127.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_127.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.work_region || '—');
    }
    var __VLS_127;
    const __VLS_128 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_130 = __VLS_129({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_129));
    __VLS_131.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_131.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.hire_date || '—');
    }
    var __VLS_131;
    var __VLS_103;
}
if (__VLS_ctx.certData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_132 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        data: ([__VLS_ctx.certData]),
        border: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_134 = __VLS_133({
        data: ([__VLS_ctx.certData]),
        border: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    const __VLS_136 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
    }));
    const __VLS_138 = __VLS_137({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    const __VLS_140 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        prop: "id_card",
        label: "身份证号",
        align: "left",
        minWidth: "150",
        showOverflowTooltip: true,
    }));
    const __VLS_142 = __VLS_141({
        prop: "id_card",
        label: "身份证号",
        align: "left",
        minWidth: "150",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    const __VLS_144 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        prop: "position",
        label: "职位",
        align: "left",
        minWidth: "110",
        showOverflowTooltip: true,
    }));
    const __VLS_146 = __VLS_145({
        prop: "position",
        label: "职位",
        align: "left",
        minWidth: "110",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    const __VLS_148 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_150 = __VLS_149({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    const __VLS_152 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        label: "月基本工资",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_154 = __VLS_153({
        label: "月基本工资",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_155.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.money(row.basic_salary));
    }
    var __VLS_155;
    const __VLS_156 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        label: "目标年终奖",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_158 = __VLS_157({
        label: "目标年终奖",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_159.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.money(row.target_bonus));
    }
    var __VLS_159;
    const __VLS_160 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        label: "年薪预算总包",
        align: "left",
        minWidth: "120",
    }));
    const __VLS_162 = __VLS_161({
        label: "年薪预算总包",
        align: "left",
        minWidth: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_163.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "result-highlight" },
        });
        (__VLS_ctx.money(row.annual_package));
    }
    var __VLS_163;
    const __VLS_164 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        prop: "template_name",
        label: "模板",
        align: "left",
        minWidth: "120",
    }));
    const __VLS_166 = __VLS_165({
        prop: "template_name",
        label: "模板",
        align: "left",
        minWidth: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    var __VLS_135;
    if (__VLS_ctx.mainManualVariables.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "inline-manual-fields" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-title" },
        });
        const __VLS_168 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
            labelPosition: "top",
            size: "small",
        }));
        const __VLS_170 = __VLS_169({
            labelPosition: "top",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_169));
        __VLS_171.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "manual-grid" },
        });
        for (const [variable] of __VLS_getVForSourceType((__VLS_ctx.mainManualVariables))) {
            const __VLS_172 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                key: (variable.variable_code),
                label: (`${variable.variable_name}${variable.required ? ' *' : ''}`),
            }));
            const __VLS_174 = __VLS_173({
                key: (variable.variable_code),
                label: (`${variable.variable_name}${variable.required ? ' *' : ''}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
            __VLS_175.slots.default;
            const __VLS_176 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.manualValue(variable)),
                placeholder: (variable.default_value || `请输入${variable.variable_name}`),
                clearable: true,
            }));
            const __VLS_178 = __VLS_177({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.manualValue(variable)),
                placeholder: (variable.default_value || `请输入${variable.variable_name}`),
                clearable: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            let __VLS_180;
            let __VLS_181;
            let __VLS_182;
            const __VLS_183 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!(__VLS_ctx.certData))
                        return;
                    if (!(__VLS_ctx.mainManualVariables.length))
                        return;
                    __VLS_ctx.setManualValue(variable, $event);
                }
            };
            var __VLS_179;
            var __VLS_175;
        }
        var __VLS_171;
    }
}
var __VLS_3;
const __VLS_184 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    modelValue: (__VLS_ctx.previewOpen),
    title: "收入证明预览",
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}));
const __VLS_186 = __VLS_185({
    modelValue: (__VLS_ctx.previewOpen),
    title: "收入证明预览",
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-form-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-pane-title" },
});
if (__VLS_ctx.certData) {
    const __VLS_188 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        labelPosition: "top",
        size: "small",
    }));
    const __VLS_190 = __VLS_189({
        labelPosition: "top",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    const __VLS_192 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        label: "模板",
    }));
    const __VLS_194 = __VLS_193({
        label: "模板",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    const __VLS_196 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        modelValue: (__VLS_ctx.certData.template_code),
        ...{ style: {} },
    }));
    const __VLS_198 = __VLS_197({
        modelValue: (__VLS_ctx.certData.template_code),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_199.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.templates))) {
        const __VLS_200 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            key: (t.code),
            label: (t.name),
            value: (t.code),
        }));
        const __VLS_202 = __VLS_201({
            key: (t.code),
            label: (t.name),
            value: (t.code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    }
    var __VLS_199;
    var __VLS_195;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cert-row2" },
    });
    const __VLS_204 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        label: "姓名",
    }));
    const __VLS_206 = __VLS_205({
        label: "姓名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    const __VLS_208 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        modelValue: (__VLS_ctx.certData.name),
    }));
    const __VLS_210 = __VLS_209({
        modelValue: (__VLS_ctx.certData.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    var __VLS_207;
    const __VLS_212 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        label: "身份证号",
    }));
    const __VLS_214 = __VLS_213({
        label: "身份证号",
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    __VLS_215.slots.default;
    const __VLS_216 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        modelValue: (__VLS_ctx.certData.id_card),
    }));
    const __VLS_218 = __VLS_217({
        modelValue: (__VLS_ctx.certData.id_card),
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    var __VLS_215;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cert-row2" },
    });
    const __VLS_220 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        label: "公司",
    }));
    const __VLS_222 = __VLS_221({
        label: "公司",
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    __VLS_223.slots.default;
    const __VLS_224 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        modelValue: (__VLS_ctx.certData.company),
    }));
    const __VLS_226 = __VLS_225({
        modelValue: (__VLS_ctx.certData.company),
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    var __VLS_223;
    const __VLS_228 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        label: "职位",
    }));
    const __VLS_230 = __VLS_229({
        label: "职位",
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    const __VLS_232 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        modelValue: (__VLS_ctx.certData.position),
    }));
    const __VLS_234 = __VLS_233({
        modelValue: (__VLS_ctx.certData.position),
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    var __VLS_231;
    const __VLS_236 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        label: "入职日期",
    }));
    const __VLS_238 = __VLS_237({
        label: "入职日期",
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    const __VLS_240 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        modelValue: (__VLS_ctx.certData.hire_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }));
    const __VLS_242 = __VLS_241({
        modelValue: (__VLS_ctx.certData.hire_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    var __VLS_239;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cert-row2" },
    });
    const __VLS_244 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        label: "月基本工资",
    }));
    const __VLS_246 = __VLS_245({
        label: "月基本工资",
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    __VLS_247.slots.default;
    const __VLS_248 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        modelValue: (__VLS_ctx.certData.basic_salary),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }));
    const __VLS_250 = __VLS_249({
        modelValue: (__VLS_ctx.certData.basic_salary),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    var __VLS_247;
    const __VLS_252 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        label: "目标年终奖",
    }));
    const __VLS_254 = __VLS_253({
        label: "目标年终奖",
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    __VLS_255.slots.default;
    const __VLS_256 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
        modelValue: (__VLS_ctx.certData.target_bonus),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }));
    const __VLS_258 = __VLS_257({
        modelValue: (__VLS_ctx.certData.target_bonus),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
    var __VLS_255;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cert-row2" },
    });
    const __VLS_260 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        label: "年薪预算总包",
    }));
    const __VLS_262 = __VLS_261({
        label: "年薪预算总包",
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    __VLS_263.slots.default;
    const __VLS_264 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
        modelValue: (__VLS_ctx.certData.annual_package),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }));
    const __VLS_266 = __VLS_265({
        modelValue: (__VLS_ctx.certData.annual_package),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_265));
    var __VLS_263;
    const __VLS_268 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        label: "开具日期",
    }));
    const __VLS_270 = __VLS_269({
        label: "开具日期",
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
    __VLS_271.slots.default;
    const __VLS_272 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
        modelValue: (__VLS_ctx.certData.issue_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }));
    const __VLS_274 = __VLS_273({
        modelValue: (__VLS_ctx.certData.issue_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
    var __VLS_271;
    if (__VLS_ctx.previewManualVariables.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cert-pane-title manual-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cert-row2" },
        });
        for (const [variable] of __VLS_getVForSourceType((__VLS_ctx.previewManualVariables))) {
            const __VLS_276 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
                key: (variable.variable_code),
                label: (`${variable.variable_name}${variable.required ? ' *' : ''}`),
            }));
            const __VLS_278 = __VLS_277({
                key: (variable.variable_code),
                label: (`${variable.variable_name}${variable.required ? ' *' : ''}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_277));
            __VLS_279.slots.default;
            const __VLS_280 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.manualValue(variable)),
                placeholder: (variable.default_value || `请输入${variable.variable_name}`),
                clearable: true,
            }));
            const __VLS_282 = __VLS_281({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.manualValue(variable)),
                placeholder: (variable.default_value || `请输入${variable.variable_name}`),
                clearable: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
            let __VLS_284;
            let __VLS_285;
            let __VLS_286;
            const __VLS_287 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!(__VLS_ctx.certData))
                        return;
                    if (!(__VLS_ctx.previewManualVariables.length))
                        return;
                    __VLS_ctx.setManualValue(variable, $event);
                }
            };
            var __VLS_283;
            var __VLS_279;
        }
    }
    const __VLS_288 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        ...{ style: {} },
        loading: (__VLS_ctx.previewing),
    }));
    const __VLS_290 = __VLS_289({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        ...{ style: {} },
        loading: (__VLS_ctx.previewing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    let __VLS_292;
    let __VLS_293;
    let __VLS_294;
    const __VLS_295 = {
        onClick: (__VLS_ctx.refreshPreview)
    };
    __VLS_291.slots.default;
    var __VLS_291;
    var __VLS_191;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-preview-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-preview-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "cert-pane-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "draft-tip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "draft-actions" },
});
const __VLS_296 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}));
const __VLS_298 = __VLS_297({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_297));
__VLS_299.slots.default;
(__VLS_ctx.draftAdjusted ? '已人工调整' : '标准生成');
var __VLS_299;
const __VLS_300 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}));
const __VLS_302 = __VLS_301({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}, ...__VLS_functionalComponentArgsRest(__VLS_301));
let __VLS_304;
let __VLS_305;
let __VLS_306;
const __VLS_307 = {
    onClick: (__VLS_ctx.resetPreviewDraft)
};
__VLS_303.slots.default;
var __VLS_303;
/** @type {[typeof DocumentPaperPreview, ]} */ ;
// @ts-ignore
const __VLS_308 = __VLS_asFunctionalComponent(DocumentPaperPreview, new DocumentPaperPreview({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.previewing),
}));
const __VLS_309 = __VLS_308({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.previewing),
}, ...__VLS_functionalComponentArgsRest(__VLS_308));
let __VLS_311;
let __VLS_312;
let __VLS_313;
const __VLS_314 = {
    onDirty: (...[$event]) => {
        __VLS_ctx.draftAdjusted = $event;
    }
};
/** @type {typeof __VLS_ctx.previewRef} */ ;
var __VLS_315 = {};
var __VLS_310;
{
    const { footer: __VLS_thisSlot } = __VLS_187.slots;
    const __VLS_317 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
        ...{ 'onClick': {} },
    }));
    const __VLS_319 = __VLS_318({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_318));
    let __VLS_321;
    let __VLS_322;
    let __VLS_323;
    const __VLS_324 = {
        onClick: (...[$event]) => {
            __VLS_ctx.previewOpen = false;
        }
    };
    __VLS_320.slots.default;
    var __VLS_320;
    const __VLS_325 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.downloading),
    }));
    const __VLS_327 = __VLS_326({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.downloading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_326));
    let __VLS_329;
    let __VLS_330;
    let __VLS_331;
    const __VLS_332 = {
        onClick: (__VLS_ctx.downloadDocx)
    };
    __VLS_328.slots.default;
    var __VLS_328;
    const __VLS_333 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_335 = __VLS_334({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_334));
    let __VLS_337;
    let __VLS_338;
    let __VLS_339;
    const __VLS_340 = {
        onClick: (__VLS_ctx.printDirect)
    };
    __VLS_336.slots.default;
    var __VLS_336;
}
var __VLS_187;
/** @type {__VLS_StyleScopedClasses['income-cert']} */ ;
/** @type {__VLS_StyleScopedClasses['op-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['op-row']} */ ;
/** @type {__VLS_StyleScopedClasses['op-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['result-highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['inline-manual-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['manual-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-form-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['manual-title']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-preview-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-preview-head']} */ ;
/** @type {__VLS_StyleScopedClasses['cert-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-actions']} */ ;
// @ts-ignore
var __VLS_316 = __VLS_315;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            Document: Document,
            Printer: Printer,
            DocumentPaperPreview: DocumentPaperPreview,
            keyword: keyword,
            printing: printing,
            employees: employees,
            templates: templates,
            templateCode: templateCode,
            certData: certData,
            previewOpen: previewOpen,
            previewing: previewing,
            downloading: downloading,
            previewRef: previewRef,
            draftAdjusted: draftAdjusted,
            busy: busy,
            previewManualVariables: previewManualVariables,
            mainManualVariables: mainManualVariables,
            money: money,
            searchAndPrepare: searchAndPrepare,
            pickEmployee: pickEmployee,
            rowClassName: rowClassName,
            manualValue: manualValue,
            setManualValue: setManualValue,
            resetAll: resetAll,
            openPreview: openPreview,
            refreshPreview: refreshPreview,
            resetPreviewDraft: resetPreviewDraft,
            downloadDocx: downloadDocx,
            printDirect: printDirect,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
