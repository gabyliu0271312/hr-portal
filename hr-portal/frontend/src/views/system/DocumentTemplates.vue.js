/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Download, Plus, Refresh, Upload, View } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import DocumentPaperPreview from '@/components/document/DocumentPaperPreview.vue';
import { toolsApi, } from '@/api/tools';
const MENU = 'system.document_templates';
const loading = ref(false);
const saving = ref(false);
const uploading = ref(false);
const previewing = ref(false);
const list = ref([]);
const keyword = ref('');
const businessTypeFilter = ref('');
const dialogOpen = ref(false);
const previewOpen = ref(false);
const previewHtml = ref('');
const previewTarget = ref(null);
const previewPaperRef = ref(null);
const previewDirty = ref(false);
const savingPreview = ref(false);
const editing = ref(null);
const fileInput = ref(null);
const businessTypeOptions = [
    { label: '解除协议', value: 'agreement' },
    { label: '收入证明', value: 'income_certificate' },
];
const sourceTypeOptions = [
    { label: '员工字段', value: 'employee_field' },
    { label: '系统计算', value: 'computed' },
    { label: '手工录入', value: 'manual' },
    { label: '固定值', value: 'fixed' },
    { label: '系统参数', value: 'system' },
];
const form = reactive({
    code: '',
    name: '',
    business_type: 'income_certificate',
    description: '',
    is_active: true,
    version: '1.0',
    effective_start: null,
    effective_end: null,
    layout_config: {},
    blocks: [],
    variables: [],
});
const businessTypeName = (value) => businessTypeOptions.find((item) => item.value === value)?.label || value;
function fileSize(size) {
    if (!size)
        return '—';
    if (size < 1024)
        return `${size} B`;
    if (size < 1024 * 1024)
        return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
function newVariable(code = '') {
    return {
        variable_code: code,
        variable_name: code,
        source_type: 'manual',
        source_key: '',
        default_value: '',
        required: false,
        formatter: '',
    };
}
function clonePayload(row) {
    return {
        code: row.code,
        name: row.name,
        business_type: row.business_type,
        description: row.description || '',
        is_active: row.is_active,
        version: row.version || '1.0',
        effective_start: row.effective_start,
        effective_end: row.effective_end,
        layout_config: row.layout_config || {},
        blocks: row.blocks.map((block) => ({ ...block })),
        variables: row.variables.map((variable) => ({ ...variable })),
    };
}
function resetForm() {
    Object.assign(form, {
        code: '',
        name: '',
        business_type: 'income_certificate',
        description: '',
        is_active: true,
        version: '1.0',
        effective_start: null,
        effective_end: null,
        layout_config: {},
        blocks: [],
        variables: [],
    });
}
async function load() {
    loading.value = true;
    try {
        list.value = await toolsApi.listDocumentTemplates({
            business_type: businessTypeFilter.value || undefined,
            keyword: keyword.value || undefined,
        });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载模板失败');
    }
    finally {
        loading.value = false;
    }
}
function openCreate() {
    editing.value = null;
    resetForm();
    dialogOpen.value = true;
}
function openEdit(row) {
    editing.value = row;
    Object.assign(form, clonePayload(row));
    dialogOpen.value = true;
}
function addVariable(code = '') {
    form.variables.push(newVariable(code));
}
function removeVariable(index) {
    form.variables.splice(index, 1);
}
function addMissingParsedVariables() {
    if (!editing.value?.parsed_variables?.length)
        return;
    const existing = new Set(form.variables.map((item) => item.variable_code));
    editing.value.parsed_variables.forEach((code) => {
        if (!existing.has(code))
            addVariable(code);
    });
}
function normalizePayload() {
    return {
        ...form,
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description?.trim() || null,
        effective_start: form.effective_start || null,
        effective_end: form.effective_end || null,
        layout_config: form.layout_config || {},
        blocks: form.blocks.map((block) => ({
            ...block,
            content: block.content || '',
            style_config: block.style_config || {},
        })),
        variables: form.variables.map((variable) => ({
            ...variable,
            variable_code: variable.variable_code.trim(),
            variable_name: variable.variable_name.trim(),
            source_key: variable.source_key?.trim() || null,
            default_value: variable.default_value?.trim() || null,
            formatter: variable.formatter?.trim() || null,
        })),
    };
}
function validate() {
    if (!form.code.trim() || !form.name.trim()) {
        ElMessage.warning('模板编码和模板名称必填');
        return false;
    }
    const codes = form.variables.map((item) => item.variable_code.trim()).filter(Boolean);
    if (codes.length !== new Set(codes).size) {
        ElMessage.warning('变量编码不能重复');
        return false;
    }
    if (form.variables.some((item) => !item.variable_code.trim() || !item.variable_name.trim())) {
        ElMessage.warning('变量编码和变量名称必填');
        return false;
    }
    return true;
}
async function save() {
    if (!validate())
        return;
    saving.value = true;
    try {
        const payload = normalizePayload();
        const saved = editing.value
            ? await toolsApi.updateDocumentTemplate(editing.value.id, payload)
            : await toolsApi.createDocumentTemplate(payload);
        editing.value = saved;
        Object.assign(form, clonePayload(saved));
        ElMessage.success('已保存');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function remove(row) {
    try {
        await ElMessageBox.confirm(`删除模板「${row.name}」？`, '提示', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        await toolsApi.removeDocumentTemplate(row.id);
        ElMessage.success('已删除');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
function chooseFile(row) {
    editing.value = row;
    Object.assign(form, clonePayload(row));
    fileInput.value?.click();
}
async function onFilePicked(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !editing.value)
        return;
    uploading.value = true;
    try {
        const result = await toolsApi.uploadDocumentTemplateWord(editing.value.id, file);
        ElMessage.success(`已上传并解析 ${result.parsed_variables.length} 个变量`);
        await load();
        const fresh = await toolsApi.getDocumentTemplate(editing.value.id);
        editing.value = fresh;
        Object.assign(form, clonePayload(fresh));
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '上传失败');
    }
    finally {
        uploading.value = false;
    }
}
async function downloadWord(row) {
    try {
        const resp = await toolsApi.downloadDocumentTemplateWord(row.id);
        const blob = new Blob([resp.data], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = row.template_file_name || `${row.code}.docx`;
        a.click();
        URL.revokeObjectURL(url);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载失败');
    }
}
function placeholderSampleData(row) {
    const codes = new Set();
    row.parsed_variables.forEach((code) => codes.add(code));
    row.variables.forEach((variable) => codes.add(variable.variable_code));
    return Object.fromEntries([...codes].map((code) => [code, `{{${code}}}`]));
}
async function preview(row) {
    previewTarget.value = row;
    previewOpen.value = true;
    previewing.value = true;
    previewHtml.value = '';
    previewDirty.value = false;
    try {
        const result = await toolsApi.previewDocumentTemplate(row.id, placeholderSampleData(row));
        previewHtml.value = result.html;
        await nextTick();
        previewPaperRef.value?.setHtml(previewHtml.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
async function saveTemplatePreview() {
    if (!previewTarget.value)
        return;
    const html = previewPaperRef.value?.getHtml() || previewHtml.value;
    savingPreview.value = true;
    try {
        const saved = await toolsApi.saveDocumentTemplatePreview(previewTarget.value.id, html);
        previewTarget.value = saved;
        if (editing.value?.id === saved.id) {
            editing.value = saved;
            Object.assign(form, clonePayload(saved));
        }
        previewDirty.value = false;
        ElMessage.success('已保存预览内容');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存预览失败');
    }
    finally {
        savingPreview.value = false;
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "template-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onChange: (__VLS_ctx.onFilePicked) },
    ref: "fileInput",
    ...{ class: "hidden-file" },
    type: "file",
    accept: ".docx",
});
/** @type {typeof __VLS_ctx.fileInput} */ ;
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-subtitle" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vText)(null, { ...__VLS_directiveBindingRestFields, value: ('上传 Word 模板，系统解析 {{variable_code}} 占位符并用于文档生成。') }, null, null);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-actions" },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_7.slots.default;
    var __VLS_7;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "C",
        type: "primary",
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_14.slots.default;
    const __VLS_19 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({}));
    const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_22.slots.default;
    const __VLS_23 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
    const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
    var __VLS_22;
    var __VLS_14;
}
const __VLS_27 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    ...{ class: "filter-bar" },
    inline: true,
}));
const __VLS_29 = __VLS_28({
    ...{ class: "filter-bar" },
    inline: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
const __VLS_31 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
const __VLS_35 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    ...{ 'onKeyup': {} },
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "模板名称 / 编码",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_37 = __VLS_36({
    ...{ 'onKeyup': {} },
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "模板名称 / 编码",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
let __VLS_39;
let __VLS_40;
let __VLS_41;
const __VLS_42 = {
    onKeyup: (__VLS_ctx.load)
};
const __VLS_43 = {
    onChange: (__VLS_ctx.load)
};
var __VLS_38;
var __VLS_34;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.businessTypeFilter),
    clearable: true,
    placeholder: "业务类型",
    ...{ style: {} },
}));
const __VLS_50 = __VLS_49({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.businessTypeFilter),
    clearable: true,
    placeholder: "业务类型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onChange: (__VLS_ctx.load)
};
__VLS_51.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.businessTypeOptions))) {
    const __VLS_56 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_58 = __VLS_57({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
}
var __VLS_51;
var __VLS_47;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
}));
const __VLS_66 = __VLS_65({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
let __VLS_68;
let __VLS_69;
let __VLS_70;
const __VLS_71 = {
    onClick: (__VLS_ctx.load)
};
__VLS_67.slots.default;
var __VLS_67;
const __VLS_72 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    ...{ 'onClick': {} },
    link: true,
}));
const __VLS_74 = __VLS_73({
    ...{ 'onClick': {} },
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
let __VLS_76;
let __VLS_77;
let __VLS_78;
const __VLS_79 = {
    onClick: (...[$event]) => {
        __VLS_ctx.keyword = '';
        __VLS_ctx.businessTypeFilter = '';
        __VLS_ctx.load();
    }
};
__VLS_75.slots.default;
var __VLS_75;
var __VLS_63;
var __VLS_30;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "table-wrap" },
});
const __VLS_80 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "620",
}));
const __VLS_82 = __VLS_81({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "620",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_83.slots.default;
const __VLS_84 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    prop: "name",
    label: "模板名称",
    minWidth: "160",
    showOverflowTooltip: true,
}));
const __VLS_86 = __VLS_85({
    prop: "name",
    label: "模板名称",
    minWidth: "160",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    prop: "code",
    label: "编码",
    minWidth: "150",
    showOverflowTooltip: true,
}));
const __VLS_90 = __VLS_89({
    prop: "code",
    label: "编码",
    minWidth: "150",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    label: "业务类型",
    minWidth: "110",
}));
const __VLS_94 = __VLS_93({
    label: "业务类型",
    minWidth: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_95.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.businessTypeName(row.business_type));
}
var __VLS_95;
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "Word 模板",
    minWidth: "190",
    showOverflowTooltip: true,
}));
const __VLS_98 = __VLS_97({
    label: "Word 模板",
    minWidth: "190",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_99.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.template_file_name) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.template_file_name);
        (__VLS_ctx.fileSize(row.template_file_size));
    }
    else {
        const __VLS_100 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            size: "small",
            type: "warning",
            effect: "plain",
        }));
        const __VLS_102 = __VLS_101({
            size: "small",
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        __VLS_103.slots.default;
        var __VLS_103;
    }
}
var __VLS_99;
const __VLS_104 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "变量",
    minWidth: "90",
}));
const __VLS_106 = __VLS_105({
    label: "变量",
    minWidth: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_107.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.parsed_variables.length);
    (row.variables.length);
}
var __VLS_107;
const __VLS_108 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "状态",
    minWidth: "80",
}));
const __VLS_110 = __VLS_109({
    label: "状态",
    minWidth: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_111.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_112 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        type: (row.is_active ? 'success' : 'info'),
        effect: "plain",
    }));
    const __VLS_114 = __VLS_113({
        type: (row.is_active ? 'success' : 'info'),
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    (row.is_active ? '启用' : '停用');
    var __VLS_115;
}
var __VLS_111;
const __VLS_116 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    prop: "updated_at",
    label: "更新时间",
    minWidth: "170",
    showOverflowTooltip: true,
}));
const __VLS_118 = __VLS_117({
    prop: "updated_at",
    label: "更新时间",
    minWidth: "170",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "操作",
    width: "330",
    fixed: "right",
}));
const __VLS_122 = __VLS_121({
    label: "操作",
    width: "330",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_123.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_124 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
        disabled: (__VLS_ctx.uploading),
    }));
    const __VLS_125 = __VLS_124({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
        disabled: (__VLS_ctx.uploading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_124));
    let __VLS_127;
    let __VLS_128;
    let __VLS_129;
    const __VLS_130 = {
        onClick: (...[$event]) => {
            __VLS_ctx.chooseFile(row);
        }
    };
    __VLS_126.slots.default;
    const __VLS_131 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_132 = __VLS_asFunctionalComponent(__VLS_131, new __VLS_131({}));
    const __VLS_133 = __VLS_132({}, ...__VLS_functionalComponentArgsRest(__VLS_132));
    __VLS_134.slots.default;
    const __VLS_135 = {}.Upload;
    /** @type {[typeof __VLS_components.Upload, ]} */ ;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({}));
    const __VLS_137 = __VLS_136({}, ...__VLS_functionalComponentArgsRest(__VLS_136));
    var __VLS_134;
    var __VLS_126;
    const __VLS_139 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }));
    const __VLS_141 = __VLS_140({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_140));
    let __VLS_143;
    let __VLS_144;
    let __VLS_145;
    const __VLS_146 = {
        onClick: (...[$event]) => {
            __VLS_ctx.downloadWord(row);
        }
    };
    __VLS_142.slots.default;
    const __VLS_147 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({}));
    const __VLS_149 = __VLS_148({}, ...__VLS_functionalComponentArgsRest(__VLS_148));
    __VLS_150.slots.default;
    const __VLS_151 = {}.Download;
    /** @type {[typeof __VLS_components.Download, ]} */ ;
    // @ts-ignore
    const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({}));
    const __VLS_153 = __VLS_152({}, ...__VLS_functionalComponentArgsRest(__VLS_152));
    var __VLS_150;
    var __VLS_142;
    const __VLS_155 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }));
    const __VLS_157 = __VLS_156({
        ...{ 'onClick': {} },
        size: "small",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    let __VLS_159;
    let __VLS_160;
    let __VLS_161;
    const __VLS_162 = {
        onClick: (...[$event]) => {
            __VLS_ctx.preview(row);
        }
    };
    __VLS_158.slots.default;
    const __VLS_163 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({}));
    const __VLS_165 = __VLS_164({}, ...__VLS_functionalComponentArgsRest(__VLS_164));
    __VLS_166.slots.default;
    const __VLS_167 = {}.View;
    /** @type {[typeof __VLS_components.View, ]} */ ;
    // @ts-ignore
    const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({}));
    const __VLS_169 = __VLS_168({}, ...__VLS_functionalComponentArgsRest(__VLS_168));
    var __VLS_166;
    var __VLS_158;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_171 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
    }));
    const __VLS_172 = __VLS_171({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_171));
    let __VLS_174;
    let __VLS_175;
    let __VLS_176;
    const __VLS_177 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_173.slots.default;
    var __VLS_173;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_178 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "D",
        size: "small",
        type: "danger",
    }));
    const __VLS_179 = __VLS_178({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "D",
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_178));
    let __VLS_181;
    let __VLS_182;
    let __VLS_183;
    const __VLS_184 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(row);
        }
    };
    __VLS_180.slots.default;
    var __VLS_180;
}
var __VLS_123;
var __VLS_83;
var __VLS_3;
const __VLS_185 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑模板' : '新增模板'),
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}));
const __VLS_187 = __VLS_186({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑模板' : '新增模板'),
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_186));
__VLS_188.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "editor-layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "editor-main" },
});
const __VLS_189 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    labelPosition: "top",
}));
const __VLS_191 = __VLS_190({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
__VLS_192.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-grid" },
});
const __VLS_193 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    label: "模板编码",
    required: true,
}));
const __VLS_195 = __VLS_194({
    label: "模板编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
__VLS_196.slots.default;
const __VLS_197 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
    modelValue: (__VLS_ctx.form.code),
    placeholder: "如 annual_income",
    disabled: (Boolean(__VLS_ctx.editing)),
}));
const __VLS_199 = __VLS_198({
    modelValue: (__VLS_ctx.form.code),
    placeholder: "如 annual_income",
    disabled: (Boolean(__VLS_ctx.editing)),
}, ...__VLS_functionalComponentArgsRest(__VLS_198));
var __VLS_196;
const __VLS_201 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
    label: "模板名称",
    required: true,
}));
const __VLS_203 = __VLS_202({
    label: "模板名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
__VLS_204.slots.default;
const __VLS_205 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如 年包收入证明",
}));
const __VLS_207 = __VLS_206({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如 年包收入证明",
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
var __VLS_204;
const __VLS_209 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    label: "业务类型",
    required: true,
}));
const __VLS_211 = __VLS_210({
    label: "业务类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
__VLS_212.slots.default;
const __VLS_213 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    modelValue: (__VLS_ctx.form.business_type),
    ...{ style: {} },
}));
const __VLS_215 = __VLS_214({
    modelValue: (__VLS_ctx.form.business_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
__VLS_216.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.businessTypeOptions))) {
    const __VLS_217 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_219 = __VLS_218({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_218));
}
var __VLS_216;
var __VLS_212;
const __VLS_221 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
    label: "版本",
}));
const __VLS_223 = __VLS_222({
    label: "版本",
}, ...__VLS_functionalComponentArgsRest(__VLS_222));
__VLS_224.slots.default;
const __VLS_225 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
    modelValue: (__VLS_ctx.form.version),
}));
const __VLS_227 = __VLS_226({
    modelValue: (__VLS_ctx.form.version),
}, ...__VLS_functionalComponentArgsRest(__VLS_226));
var __VLS_224;
const __VLS_229 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
    label: "生效开始",
}));
const __VLS_231 = __VLS_230({
    label: "生效开始",
}, ...__VLS_functionalComponentArgsRest(__VLS_230));
__VLS_232.slots.default;
const __VLS_233 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
    modelValue: (__VLS_ctx.form.effective_start),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}));
const __VLS_235 = __VLS_234({
    modelValue: (__VLS_ctx.form.effective_start),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_234));
var __VLS_232;
const __VLS_237 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
    label: "生效结束",
}));
const __VLS_239 = __VLS_238({
    label: "生效结束",
}, ...__VLS_functionalComponentArgsRest(__VLS_238));
__VLS_240.slots.default;
const __VLS_241 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
    modelValue: (__VLS_ctx.form.effective_end),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}));
const __VLS_243 = __VLS_242({
    modelValue: (__VLS_ctx.form.effective_end),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_242));
var __VLS_240;
const __VLS_245 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
    label: "描述",
}));
const __VLS_247 = __VLS_246({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
__VLS_248.slots.default;
const __VLS_249 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}));
const __VLS_251 = __VLS_250({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "可选",
}, ...__VLS_functionalComponentArgsRest(__VLS_250));
var __VLS_248;
const __VLS_253 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({}));
const __VLS_255 = __VLS_254({}, ...__VLS_functionalComponentArgsRest(__VLS_254));
__VLS_256.slots.default;
const __VLS_257 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_259 = __VLS_258({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_258));
var __VLS_256;
var __VLS_192;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-subtitle" },
});
__VLS_asFunctionalDirective(__VLS_directives.vText)(null, { ...__VLS_directiveBindingRestFields, value: ('Word 里使用 {{name}} 这样的占位符；上传后会自动解析并补充变量。') }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-actions" },
});
if (__VLS_ctx.editing?.parsed_variables?.length) {
    const __VLS_261 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_263 = __VLS_262({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
    let __VLS_265;
    let __VLS_266;
    let __VLS_267;
    const __VLS_268 = {
        onClick: (__VLS_ctx.addMissingParsedVariables)
    };
    __VLS_264.slots.default;
    var __VLS_264;
}
const __VLS_269 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_271 = __VLS_270({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_270));
let __VLS_273;
let __VLS_274;
let __VLS_275;
const __VLS_276 = {
    onClick: (...[$event]) => {
        __VLS_ctx.addVariable();
    }
};
__VLS_272.slots.default;
const __VLS_277 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({}));
const __VLS_279 = __VLS_278({}, ...__VLS_functionalComponentArgsRest(__VLS_278));
__VLS_280.slots.default;
const __VLS_281 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({}));
const __VLS_283 = __VLS_282({}, ...__VLS_functionalComponentArgsRest(__VLS_282));
var __VLS_280;
var __VLS_272;
const __VLS_285 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
    data: (__VLS_ctx.form.variables),
    border: true,
    size: "small",
    ...{ class: "editor-table" },
}));
const __VLS_287 = __VLS_286({
    data: (__VLS_ctx.form.variables),
    border: true,
    size: "small",
    ...{ class: "editor-table" },
}, ...__VLS_functionalComponentArgsRest(__VLS_286));
__VLS_288.slots.default;
const __VLS_289 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
    label: "编码",
    minWidth: "150",
}));
const __VLS_291 = __VLS_290({
    label: "编码",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_290));
__VLS_292.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_292.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_293 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
        modelValue: (row.variable_code),
        size: "small",
    }));
    const __VLS_295 = __VLS_294({
        modelValue: (row.variable_code),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_294));
}
var __VLS_292;
const __VLS_297 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
    label: "名称",
    minWidth: "150",
}));
const __VLS_299 = __VLS_298({
    label: "名称",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_298));
__VLS_300.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_300.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_301 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
        modelValue: (row.variable_name),
        size: "small",
    }));
    const __VLS_303 = __VLS_302({
        modelValue: (row.variable_name),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_302));
}
var __VLS_300;
const __VLS_305 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
    label: "来源",
    width: "130",
}));
const __VLS_307 = __VLS_306({
    label: "来源",
    width: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_306));
__VLS_308.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_308.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_309 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_310 = __VLS_asFunctionalComponent(__VLS_309, new __VLS_309({
        modelValue: (row.source_type),
        size: "small",
    }));
    const __VLS_311 = __VLS_310({
        modelValue: (row.source_type),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_310));
    __VLS_312.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.sourceTypeOptions))) {
        const __VLS_313 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }));
        const __VLS_315 = __VLS_314({
            key: (item.value),
            label: (item.label),
            value: (item.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_314));
    }
    var __VLS_312;
}
var __VLS_308;
const __VLS_317 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
    label: "来源键",
    minWidth: "150",
}));
const __VLS_319 = __VLS_318({
    label: "来源键",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_318));
__VLS_320.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_320.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_321 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
        modelValue: (row.source_key),
        size: "small",
        placeholder: "员工字段名或系统键",
    }));
    const __VLS_323 = __VLS_322({
        modelValue: (row.source_key),
        size: "small",
        placeholder: "员工字段名或系统键",
    }, ...__VLS_functionalComponentArgsRest(__VLS_322));
}
var __VLS_320;
const __VLS_325 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
    label: "默认值",
    minWidth: "150",
}));
const __VLS_327 = __VLS_326({
    label: "默认值",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_326));
__VLS_328.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_328.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_329 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_330 = __VLS_asFunctionalComponent(__VLS_329, new __VLS_329({
        modelValue: (row.default_value),
        size: "small",
    }));
    const __VLS_331 = __VLS_330({
        modelValue: (row.default_value),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_330));
}
var __VLS_328;
const __VLS_333 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
    label: "必填",
    width: "80",
}));
const __VLS_335 = __VLS_334({
    label: "必填",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_334));
__VLS_336.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_336.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_337 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
        modelValue: (row.required),
    }));
    const __VLS_339 = __VLS_338({
        modelValue: (row.required),
    }, ...__VLS_functionalComponentArgsRest(__VLS_338));
}
var __VLS_336;
const __VLS_341 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
    label: "操作",
    width: "70",
}));
const __VLS_343 = __VLS_342({
    label: "操作",
    width: "70",
}, ...__VLS_functionalComponentArgsRest(__VLS_342));
__VLS_344.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_344.slots;
    const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_345 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
        ...{ 'onClick': {} },
        type: "danger",
        link: true,
        size: "small",
    }));
    const __VLS_347 = __VLS_346({
        ...{ 'onClick': {} },
        type: "danger",
        link: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_346));
    let __VLS_349;
    let __VLS_350;
    let __VLS_351;
    const __VLS_352 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeVariable($index);
        }
    };
    __VLS_348.slots.default;
    var __VLS_348;
}
var __VLS_344;
var __VLS_288;
__VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
    ...{ class: "editor-aside" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "aside-title" },
});
if (__VLS_ctx.editing) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "file-box" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "file-name" },
    });
    (__VLS_ctx.editing.template_file_name || '尚未上传 Word 模板');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "file-meta" },
    });
    (__VLS_ctx.fileSize(__VLS_ctx.editing.template_file_size));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "file-meta" },
    });
    (__VLS_ctx.editing.parsed_variables.length);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_353 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        ...{ style: {} },
        disabled: (__VLS_ctx.uploading),
    }));
    const __VLS_354 = __VLS_353({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        ...{ style: {} },
        disabled: (__VLS_ctx.uploading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_353));
    let __VLS_356;
    let __VLS_357;
    let __VLS_358;
    const __VLS_359 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.editing))
                return;
            __VLS_ctx.chooseFile(__VLS_ctx.editing);
        }
    };
    __VLS_355.slots.default;
    const __VLS_360 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({}));
    const __VLS_362 = __VLS_361({}, ...__VLS_functionalComponentArgsRest(__VLS_361));
    __VLS_363.slots.default;
    const __VLS_364 = {}.Upload;
    /** @type {[typeof __VLS_components.Upload, ]} */ ;
    // @ts-ignore
    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({}));
    const __VLS_366 = __VLS_365({}, ...__VLS_functionalComponentArgsRest(__VLS_365));
    var __VLS_363;
    var __VLS_355;
    const __VLS_368 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        ...{ 'onClick': {} },
        ...{ style: {} },
    }));
    const __VLS_370 = __VLS_369({
        ...{ 'onClick': {} },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
    let __VLS_372;
    let __VLS_373;
    let __VLS_374;
    const __VLS_375 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.editing))
                return;
            __VLS_ctx.downloadWord(__VLS_ctx.editing);
        }
    };
    __VLS_371.slots.default;
    const __VLS_376 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({}));
    const __VLS_378 = __VLS_377({}, ...__VLS_functionalComponentArgsRest(__VLS_377));
    __VLS_379.slots.default;
    const __VLS_380 = {}.Download;
    /** @type {[typeof __VLS_components.Download, ]} */ ;
    // @ts-ignore
    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({}));
    const __VLS_382 = __VLS_381({}, ...__VLS_functionalComponentArgsRest(__VLS_381));
    var __VLS_379;
    var __VLS_371;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "parsed-list" },
    });
    for (const [code] of __VLS_getVForSourceType((__VLS_ctx.editing.parsed_variables))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (code),
            ...{ class: "parsed-item" },
        });
        (code);
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-aside" },
    });
}
{
    const { footer: __VLS_thisSlot } = __VLS_188.slots;
    const __VLS_384 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
        ...{ 'onClick': {} },
    }));
    const __VLS_386 = __VLS_385({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
    let __VLS_388;
    let __VLS_389;
    let __VLS_390;
    const __VLS_391 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogOpen = false;
        }
    };
    __VLS_387.slots.default;
    var __VLS_387;
    const __VLS_392 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_394 = __VLS_393({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
    let __VLS_396;
    let __VLS_397;
    let __VLS_398;
    const __VLS_399 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_395.slots.default;
    var __VLS_395;
}
var __VLS_188;
const __VLS_400 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
    modelValue: (__VLS_ctx.previewOpen),
    title: "模板预览 / 编辑",
    width: "96%",
    top: "2vh",
}));
const __VLS_402 = __VLS_401({
    modelValue: (__VLS_ctx.previewOpen),
    title: "模板预览 / 编辑",
    width: "96%",
    top: "2vh",
}, ...__VLS_functionalComponentArgsRest(__VLS_401));
__VLS_403.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "preview-scroll" },
});
/** @type {[typeof DocumentPaperPreview, ]} */ ;
// @ts-ignore
const __VLS_404 = __VLS_asFunctionalComponent(DocumentPaperPreview, new DocumentPaperPreview({
    ...{ 'onDirty': {} },
    ref: "previewPaperRef",
    loading: (__VLS_ctx.previewing),
}));
const __VLS_405 = __VLS_404({
    ...{ 'onDirty': {} },
    ref: "previewPaperRef",
    loading: (__VLS_ctx.previewing),
}, ...__VLS_functionalComponentArgsRest(__VLS_404));
let __VLS_407;
let __VLS_408;
let __VLS_409;
const __VLS_410 = {
    onDirty: (...[$event]) => {
        __VLS_ctx.previewDirty = $event;
    }
};
/** @type {typeof __VLS_ctx.previewPaperRef} */ ;
var __VLS_411 = {};
var __VLS_406;
{
    const { footer: __VLS_thisSlot } = __VLS_403.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "save-hint" },
    });
    __VLS_asFunctionalDirective(__VLS_directives.vText)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.previewDirty ? '预览内容已修改，保存后会作为系统标准模板使用。' : '预览内容可直接编辑，变量请保留 {{变量编码}} 格式。') }, null, null);
    const __VLS_413 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_414 = __VLS_asFunctionalComponent(__VLS_413, new __VLS_413({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.savingPreview),
        disabled: (!__VLS_ctx.previewDirty),
        type: "primary",
    }));
    const __VLS_415 = __VLS_414({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.savingPreview),
        disabled: (!__VLS_ctx.previewDirty),
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_414));
    let __VLS_417;
    let __VLS_418;
    let __VLS_419;
    const __VLS_420 = {
        onClick: (__VLS_ctx.saveTemplatePreview)
    };
    __VLS_416.slots.default;
    var __VLS_416;
    const __VLS_421 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_422 = __VLS_asFunctionalComponent(__VLS_421, new __VLS_421({
        ...{ 'onClick': {} },
    }));
    const __VLS_423 = __VLS_422({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_422));
    let __VLS_425;
    let __VLS_426;
    let __VLS_427;
    const __VLS_428 = {
        onClick: (...[$event]) => {
            __VLS_ctx.previewOpen = false;
        }
    };
    __VLS_424.slots.default;
    var __VLS_424;
}
var __VLS_403;
/** @type {__VLS_StyleScopedClasses['template-page']} */ ;
/** @type {__VLS_StyleScopedClasses['hidden-file']} */ ;
/** @type {__VLS_StyleScopedClasses['page-head']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['page-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-main']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['section-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-table']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['aside-title']} */ ;
/** @type {__VLS_StyleScopedClasses['file-box']} */ ;
/** @type {__VLS_StyleScopedClasses['file-name']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['file-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['parsed-list']} */ ;
/** @type {__VLS_StyleScopedClasses['parsed-item']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-aside']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-scroll']} */ ;
/** @type {__VLS_StyleScopedClasses['save-hint']} */ ;
// @ts-ignore
var __VLS_412 = __VLS_411;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Download: Download,
            Plus: Plus,
            Refresh: Refresh,
            Upload: Upload,
            View: View,
            PermissionButton: PermissionButton,
            DocumentPaperPreview: DocumentPaperPreview,
            MENU: MENU,
            loading: loading,
            saving: saving,
            uploading: uploading,
            previewing: previewing,
            list: list,
            keyword: keyword,
            businessTypeFilter: businessTypeFilter,
            dialogOpen: dialogOpen,
            previewOpen: previewOpen,
            previewPaperRef: previewPaperRef,
            previewDirty: previewDirty,
            savingPreview: savingPreview,
            editing: editing,
            fileInput: fileInput,
            businessTypeOptions: businessTypeOptions,
            sourceTypeOptions: sourceTypeOptions,
            form: form,
            businessTypeName: businessTypeName,
            fileSize: fileSize,
            load: load,
            openCreate: openCreate,
            openEdit: openEdit,
            addVariable: addVariable,
            removeVariable: removeVariable,
            addMissingParsedVariables: addMissingParsedVariables,
            save: save,
            remove: remove,
            chooseFile: chooseFile,
            onFilePicked: onFilePicked,
            downloadWord: downloadWord,
            preview: preview,
            saveTemplatePreview: saveTemplatePreview,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
