/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, reactive, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { apiTemplateApi } from '@/api/ucp';
const rows = ref([]);
const total = ref(0);
const loading = ref(false);
const pageSize = 20;
let page = 1;
const selected = ref(null);
const versions = ref([]);
const versionLoading = ref(false);
const latestVersionId = ref(0);
const formTab = ref('basic');
const filters = reactive({ category: '', keyword: '' });
const categories = ['HR', 'FINANCE', 'OA', 'IM', 'CAR', 'CUSTOM'];
const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const paginationTypes = ['NONE', 'PAGE', 'OFFSET', 'CURSOR'];
const authTypes = ['API_KEY', 'BEARER', 'BASIC', 'OAUTH2', 'NONE'];
const transforms = ['upper', 'lower', 'trim', 'int', 'float', 'bool'];
const dialogVisible = ref(false);
const editingId = ref(null);
const saving = ref(false);
const form = reactive({
    template_code: '', template_name: '', category: 'CUSTOM', method: 'GET',
    pagination_type: 'NONE', base_url: '', path: '', auth_type: '',
    data_path: '', total_path: '', next_cursor_path: '',
    rate_limit_qps: null, rate_limit_concurrency: null,
    retry_max: 3, retry_backoff: 'exponential', content_type: 'application/json',
    timeout_seconds: 30, description: '', allowed_domains: [],
    headers_config: [], query_config: [],
    field_mappings: [], error_code_map: {},
});
const bodyTemplateStr = computed({
    get: () => form.body_template ? JSON.stringify(form.body_template, null, 2) : '',
    set: (v) => { try {
        form.body_template = v ? JSON.parse(v) : null;
    }
    catch {
        form.body_template = v;
    } },
});
const errorCodePairs = computed({
    get: () => Object.entries(form.error_code_map || {}).map(([k, v]) => ({ external: k, ucp: v })),
    set: (pairs) => { form.error_code_map = Object.fromEntries(pairs.filter((p) => p.external).map((p) => [p.external, p.ucp])); },
});
const allowedDomainsStr = computed({
    get: () => (form.allowed_domains || []).join(','),
    set: (v) => { form.allowed_domains = v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []; },
});
const showImport = ref(false);
const importJson = ref('');
const openApiDomains = ref('');
const openApiPreview = ref(null);
const selectedOperationIds = ref([]);
const testVisible = ref(false);
const testLoading = ref(false);
const testResult = ref(null);
const testError = ref('');
const testContextStr = ref('{}');
const savingSample = ref(false);
let testCode = '';
function methodColor(m) {
    return { GET: 'success', POST: 'primary', PUT: 'warning', PATCH: 'info', DELETE: 'danger' }[m] || 'info';
}
async function load() {
    loading.value = true;
    try {
        const res = await apiTemplateApi.list({ category: filters.category || undefined, keyword: filters.keyword || undefined, limit: pageSize, offset: (page - 1) * pageSize });
        rows.value = res.items;
        total.value = res.total;
    }
    catch (e) {
        ElMessage.error('加载失败: ' + (e?.response?.data?.detail || e?.message));
    }
    finally {
        loading.value = false;
    }
}
async function loadVersions() {
    if (!selected.value)
        return;
    versionLoading.value = true;
    try {
        const res = await apiTemplateApi.versions(selected.value.template_code);
        const items = res.items || (Array.isArray(res) ? res : []);
        versions.value = items;
        if (items.length)
            latestVersionId.value = items[0].id;
    }
    catch {
        versions.value = [];
    }
    finally {
        versionLoading.value = false;
    }
}
function pageChange(p) { page = p; load(); }
function openCreateDialog() {
    editingId.value = null;
    formTab.value = 'basic';
    Object.keys(form).forEach(k => {
        if (Array.isArray(form[k]))
            form[k] = [];
        else if (k === 'error_code_map')
            form[k] = {};
        else if (typeof form[k] === 'number')
            form[k] = k === 'retry_max' ? 3 : k === 'timeout_seconds' ? 30 : null;
        else
            form[k] = k === 'category' ? 'CUSTOM' : k === 'method' ? 'GET' : k === 'pagination_type' ? 'NONE' : k === 'content_type' ? 'application/json' : '';
    });
    dialogVisible.value = true;
}
function openEdit(row) {
    editingId.value = row.template_code;
    formTab.value = 'basic';
    Object.keys(form).forEach(k => {
        if (row[k] !== undefined)
            form[k] = row[k];
        else if (Array.isArray(form[k]))
            form[k] = [];
        else if (k === 'error_code_map')
            form[k] = {};
    });
    dialogVisible.value = true;
}
async function openDetail(row) {
    selected.value = row;
    await loadVersions();
}
function openTest(row) {
    testCode = row.template_code;
    testContextStr.value = '{}';
    testResult.value = null;
    testError.value = '';
    testVisible.value = true;
}
async function runTest() {
    testLoading.value = true;
    testError.value = '';
    testResult.value = null;
    try {
        let ctx = {};
        try {
            ctx = JSON.parse(testContextStr.value);
        }
        catch {
            ctx = {};
        }
        const tpl = editingId.value ? { ...form } : rows.value.find((r) => r.template_code === testCode) || {};
        const res = await apiTemplateApi.testApiTemplate({ template: tpl, context: ctx });
        testResult.value = res;
    }
    catch (e) {
        testError.value = e?.response?.data?.detail || e?.message || '测试失败';
    }
    finally {
        testLoading.value = false;
    }
}
async function saveSample() {
    if (!testResult.value)
        return;
    savingSample.value = true;
    try {
        const tpl = editingId.value ? { ...form } : rows.value.find((r) => r.template_code === testCode) || {};
        await apiTemplateApi.testApiTemplate({ template: tpl, context: JSON.parse(testContextStr.value || '{}'), save_sample: true });
        ElMessage.success('样例已保存');
    }
    catch (e) {
        ElMessage.error('保存失败: ' + (e?.response?.data?.detail || e?.message));
    }
    finally {
        savingSample.value = false;
    }
}
async function save() {
    saving.value = true;
    try {
        const payload = { ...form };
        // auto-save error_code_map from pairs
        payload.error_code_map = Object.fromEntries(errorCodePairs.value.filter((p) => p.external).map((p) => [p.external, p.ucp]));
        if (editingId.value)
            await apiTemplateApi.update(editingId.value, { ...payload, change_note: '手动编辑' });
        else
            await apiTemplateApi.create({ ...payload });
        ElMessage.success(editingId.value ? '更新成功' : '创建成功');
        dialogVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error('保存失败: ' + (e?.response?.data?.detail || e?.message));
    }
    finally {
        saving.value = false;
    }
}
async function copyTemplate(row) {
    try {
        await apiTemplateApi.copy(row.template_code, `${row.template_code}_copy`, `${row.template_name} (副本)`);
        ElMessage.success('复制成功');
        load();
    }
    catch (e) {
        ElMessage.error('复制失败: ' + (e?.response?.data?.detail || e?.message));
    }
}
async function confirmDelete(row) {
    try {
        await ElMessageBox.confirm(`确认删除模板 "${row.template_code}"？`, '提示', { type: 'warning' });
        await apiTemplateApi.delete(row.template_code);
        ElMessage.success('已删除');
        load();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('删除失败');
    }
}
async function exportTemplate(row) {
    try {
        const res = await apiTemplateApi.exportTemplate(row.template_code);
        const blob = new Blob([JSON.stringify(res.content, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${row.template_code}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    catch (e) {
        ElMessage.error('导出失败');
    }
}
async function doImport() {
    try {
        const document = JSON.parse(importJson.value);
        const allowed_domains = openApiDomains.value.split(',').map((item) => item.trim()).filter(Boolean);
        if (!openApiPreview.value) {
            openApiPreview.value = await apiTemplateApi.previewOpenApi({ document, allowed_domains });
            selectedOperationIds.value = openApiPreview.value.operations.map((item) => item.operation_id);
            if (!selectedOperationIds.value.length)
                ElMessage.warning('未发现可安全导入的只读操作');
            return;
        }
        await apiTemplateApi.importOpenApi({ document, allowed_domains, selected_operation_ids: selectedOperationIds.value });
        ElMessage.success('已创建草稿，测试通过后可审批发布');
        showImport.value = false;
        openApiPreview.value = null;
        load();
    }
    catch (e) {
        ElMessage.error('导入失败: ' + (e?.response?.data?.detail || e?.message));
    }
}
async function approvePublish(row) {
    try {
        await ElMessageBox.confirm(`确认审批发布草稿 ${row.template_code}？`, '审批发布', { type: 'warning' });
        await apiTemplateApi.approvePublish(row.template_code);
        ElMessage.success('已发布');
        load();
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('发布失败: ' + (e?.response?.data?.detail || e?.message));
    }
}
async function rollbackVersion(versionId) {
    if (!selected.value)
        return;
    try {
        await ElMessageBox.confirm('确认回滚到该版本？', '提示', { type: 'warning' });
        await apiTemplateApi.rollback(selected.value.template_code, versionId);
        ElMessage.success('已回滚');
        await loadVersions();
        // refresh selected detail
        const updated = await apiTemplateApi.get(selected.value.template_code);
        if (updated)
            selected.value = updated;
    }
    catch (e) {
        if (e !== 'cancel')
            ElMessage.error('回滚失败');
    }
}
onMounted(() => load());
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "api-template-library" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "header-actions" },
    });
    if (__VLS_ctx.selected) {
        const __VLS_4 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            ...{ 'onClick': {} },
        }));
        const __VLS_6 = __VLS_5({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        let __VLS_8;
        let __VLS_9;
        let __VLS_10;
        const __VLS_11 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.selected))
                    return;
                __VLS_ctx.selected = null;
            }
        };
        __VLS_7.slots.default;
        var __VLS_7;
    }
    const __VLS_12 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onClick: (__VLS_ctx.openCreateDialog)
    };
    __VLS_15.slots.default;
    var __VLS_15;
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showImport = true;
        }
    };
    __VLS_23.slots.default;
    var __VLS_23;
}
if (!__VLS_ctx.selected) {
    const __VLS_28 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        inline: true,
        model: (__VLS_ctx.filters),
        ...{ class: "filter-bar" },
    }));
    const __VLS_30 = __VLS_29({
        inline: true,
        model: (__VLS_ctx.filters),
        ...{ class: "filter-bar" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        label: "分类",
    }));
    const __VLS_34 = __VLS_33({
        label: "分类",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        modelValue: (__VLS_ctx.filters.category),
        clearable: true,
        placeholder: "全部",
        ...{ style: {} },
    }));
    const __VLS_38 = __VLS_37({
        modelValue: (__VLS_ctx.filters.category),
        clearable: true,
        placeholder: "全部",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
        const __VLS_40 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            key: (c),
            label: (c),
            value: (c),
        }));
        const __VLS_42 = __VLS_41({
            key: (c),
            label: (c),
            value: (c),
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    }
    var __VLS_39;
    var __VLS_35;
    const __VLS_44 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "关键字",
    }));
    const __VLS_46 = __VLS_45({
        label: "关键字",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    const __VLS_48 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.filters.keyword),
        clearable: true,
        placeholder: "搜索",
        ...{ style: {} },
    }));
    const __VLS_50 = __VLS_49({
        ...{ 'onKeyup': {} },
        modelValue: (__VLS_ctx.filters.keyword),
        clearable: true,
        placeholder: "搜索",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    let __VLS_52;
    let __VLS_53;
    let __VLS_54;
    const __VLS_55 = {
        onKeyup: (__VLS_ctx.load)
    };
    var __VLS_51;
    var __VLS_47;
    const __VLS_56 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_63.slots.default;
    var __VLS_63;
    var __VLS_59;
    var __VLS_31;
    const __VLS_68 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        data: (__VLS_ctx.rows),
        stripe: true,
        border: true,
    }));
    const __VLS_70 = __VLS_69({
        data: (__VLS_ctx.rows),
        stripe: true,
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_71.slots.default;
    const __VLS_72 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        prop: "template_code",
        label: "编码",
        width: "180",
    }));
    const __VLS_74 = __VLS_73({
        prop: "template_code",
        label: "编码",
        width: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_75.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.template_code);
    }
    var __VLS_75;
    const __VLS_76 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        prop: "template_name",
        label: "名称",
        minWidth: "160",
    }));
    const __VLS_78 = __VLS_77({
        prop: "template_name",
        label: "名称",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    const __VLS_80 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        prop: "category",
        label: "分类",
        width: "100",
    }));
    const __VLS_82 = __VLS_81({
        prop: "category",
        label: "分类",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_83.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_84 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            size: "small",
        }));
        const __VLS_86 = __VLS_85({
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        (row.category);
        var __VLS_87;
    }
    var __VLS_83;
    const __VLS_88 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        prop: "method",
        label: "方法",
        width: "80",
    }));
    const __VLS_90 = __VLS_89({
        prop: "method",
        label: "方法",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_91.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_92 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
            size: "small",
            type: (__VLS_ctx.methodColor(row.method)),
        }));
        const __VLS_94 = __VLS_93({
            size: "small",
            type: (__VLS_ctx.methodColor(row.method)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        (row.method);
        var __VLS_95;
    }
    var __VLS_91;
    const __VLS_96 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        prop: "pagination_type",
        label: "分页",
        width: "80",
    }));
    const __VLS_98 = __VLS_97({
        prop: "pagination_type",
        label: "分页",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    const __VLS_100 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        prop: "auth_type",
        label: "认证",
        width: "90",
    }));
    const __VLS_102 = __VLS_101({
        prop: "auth_type",
        label: "认证",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    const __VLS_104 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        prop: "version",
        label: "版本",
        width: "80",
    }));
    const __VLS_106 = __VLS_105({
        prop: "version",
        label: "版本",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    const __VLS_108 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        label: "状态",
        width: "80",
    }));
    const __VLS_110 = __VLS_109({
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_111.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_112 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            type: (row.is_published ? 'success' : 'info'),
            size: "small",
        }));
        const __VLS_114 = __VLS_113({
            type: (row.is_published ? 'success' : 'info'),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        __VLS_115.slots.default;
        (row.is_published ? '已发布' : '草稿');
        var __VLS_115;
    }
    var __VLS_111;
    const __VLS_116 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        label: "操作",
        width: "340",
        fixed: "right",
    }));
    const __VLS_118 = __VLS_117({
        label: "操作",
        width: "340",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_119.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_120 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        let __VLS_126;
        const __VLS_127 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.selected))
                    return;
                __VLS_ctx.openDetail(row);
            }
        };
        __VLS_123.slots.default;
        var __VLS_123;
        const __VLS_128 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_130 = __VLS_129({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        let __VLS_132;
        let __VLS_133;
        let __VLS_134;
        const __VLS_135 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.selected))
                    return;
                __VLS_ctx.openEdit(row);
            }
        };
        __VLS_131.slots.default;
        var __VLS_131;
        const __VLS_136 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            ...{ 'onClick': {} },
            size: "small",
            type: "primary",
        }));
        const __VLS_138 = __VLS_137({
            ...{ 'onClick': {} },
            size: "small",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        let __VLS_140;
        let __VLS_141;
        let __VLS_142;
        const __VLS_143 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.selected))
                    return;
                __VLS_ctx.openTest(row);
            }
        };
        __VLS_139.slots.default;
        var __VLS_139;
        if (!row.is_published) {
            const __VLS_144 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                ...{ 'onClick': {} },
                size: "small",
                type: "success",
            }));
            const __VLS_146 = __VLS_145({
                ...{ 'onClick': {} },
                size: "small",
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            let __VLS_148;
            let __VLS_149;
            let __VLS_150;
            const __VLS_151 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.selected))
                        return;
                    if (!(!row.is_published))
                        return;
                    __VLS_ctx.approvePublish(row);
                }
            };
            __VLS_147.slots.default;
            var __VLS_147;
        }
        const __VLS_152 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_154 = __VLS_153({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        let __VLS_156;
        let __VLS_157;
        let __VLS_158;
        const __VLS_159 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.selected))
                    return;
                __VLS_ctx.copyTemplate(row);
            }
        };
        __VLS_155.slots.default;
        var __VLS_155;
    }
    var __VLS_119;
    var __VLS_71;
    if (__VLS_ctx.total > __VLS_ctx.pageSize) {
        const __VLS_160 = {}.ElPagination;
        /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            ...{ 'onCurrentChange': {} },
            total: (__VLS_ctx.total),
            pageSize: (__VLS_ctx.pageSize),
            layout: "prev,next",
            ...{ style: {} },
        }));
        const __VLS_162 = __VLS_161({
            ...{ 'onCurrentChange': {} },
            total: (__VLS_ctx.total),
            pageSize: (__VLS_ctx.pageSize),
            layout: "prev,next",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
        let __VLS_164;
        let __VLS_165;
        let __VLS_166;
        const __VLS_167 = {
            onCurrentChange: (__VLS_ctx.pageChange)
        };
        var __VLS_163;
    }
}
else {
    const __VLS_168 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        column: (2),
        border: true,
    }));
    const __VLS_170 = __VLS_169({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    __VLS_171.slots.default;
    const __VLS_172 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "编码",
    }));
    const __VLS_174 = __VLS_173({
        label: "编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    (__VLS_ctx.selected.template_code);
    var __VLS_175;
    const __VLS_176 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        label: "名称",
    }));
    const __VLS_178 = __VLS_177({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    (__VLS_ctx.selected.template_name);
    var __VLS_179;
    const __VLS_180 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        label: "方法",
    }));
    const __VLS_182 = __VLS_181({
        label: "方法",
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    __VLS_183.slots.default;
    (__VLS_ctx.selected.method);
    var __VLS_183;
    const __VLS_184 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        label: "URL",
    }));
    const __VLS_186 = __VLS_185({
        label: "URL",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    (__VLS_ctx.selected.base_url);
    (__VLS_ctx.selected.path);
    var __VLS_187;
    const __VLS_188 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        label: "认证",
    }));
    const __VLS_190 = __VLS_189({
        label: "认证",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    (__VLS_ctx.selected.auth_type || '无');
    var __VLS_191;
    const __VLS_192 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        label: "分页",
    }));
    const __VLS_194 = __VLS_193({
        label: "分页",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    (__VLS_ctx.selected.pagination_type);
    var __VLS_195;
    const __VLS_196 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        label: "版本",
    }));
    const __VLS_198 = __VLS_197({
        label: "版本",
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_199.slots.default;
    (__VLS_ctx.selected.version);
    var __VLS_199;
    const __VLS_200 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        label: "QPS限流",
    }));
    const __VLS_202 = __VLS_201({
        label: "QPS限流",
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    __VLS_203.slots.default;
    (__VLS_ctx.selected.rate_limit_qps || '-');
    (__VLS_ctx.selected.rate_limit_concurrency || '-');
    var __VLS_203;
    const __VLS_204 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        label: "重试",
    }));
    const __VLS_206 = __VLS_205({
        label: "重试",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    (__VLS_ctx.selected.retry_max || 0);
    (__VLS_ctx.selected.retry_backoff || '-');
    var __VLS_207;
    const __VLS_208 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        label: "域名白名单",
    }));
    const __VLS_210 = __VLS_209({
        label: "域名白名单",
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    ((__VLS_ctx.selected.allowed_domains || []).join(', ') || '-');
    var __VLS_211;
    const __VLS_212 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        label: "描述",
    }));
    const __VLS_214 = __VLS_213({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    __VLS_215.slots.default;
    (__VLS_ctx.selected.description || '-');
    var __VLS_215;
    var __VLS_171;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ style: {} },
    });
    if ((__VLS_ctx.selected.headers_config || []).length) {
        const __VLS_216 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            data: ((__VLS_ctx.selected.headers_config || [])),
            size: "small",
        }));
        const __VLS_218 = __VLS_217({
            data: ((__VLS_ctx.selected.headers_config || [])),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        const __VLS_220 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            prop: "key",
            label: "Key",
        }));
        const __VLS_222 = __VLS_221({
            prop: "key",
            label: "Key",
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        const __VLS_224 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
            prop: "value",
            label: "Value",
        }));
        const __VLS_226 = __VLS_225({
            prop: "value",
            label: "Value",
        }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        const __VLS_228 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
            prop: "type",
            label: "类型",
            width: "100",
        }));
        const __VLS_230 = __VLS_229({
            prop: "type",
            label: "类型",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
        var __VLS_219;
    }
    else {
        const __VLS_232 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            type: "info",
            size: "small",
        }));
        const __VLS_234 = __VLS_233({
            type: "info",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
        __VLS_235.slots.default;
        var __VLS_235;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ style: {} },
    });
    if ((__VLS_ctx.selected.query_config || []).length) {
        const __VLS_236 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
            data: ((__VLS_ctx.selected.query_config || [])),
            size: "small",
        }));
        const __VLS_238 = __VLS_237({
            data: ((__VLS_ctx.selected.query_config || [])),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_237));
        __VLS_239.slots.default;
        const __VLS_240 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
            prop: "key",
            label: "Key",
        }));
        const __VLS_242 = __VLS_241({
            prop: "key",
            label: "Key",
        }, ...__VLS_functionalComponentArgsRest(__VLS_241));
        const __VLS_244 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
            prop: "value",
            label: "Value",
        }));
        const __VLS_246 = __VLS_245({
            prop: "value",
            label: "Value",
        }, ...__VLS_functionalComponentArgsRest(__VLS_245));
        const __VLS_248 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
            prop: "required",
            label: "必填",
            width: "80",
        }));
        const __VLS_250 = __VLS_249({
            prop: "required",
            label: "必填",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_249));
        var __VLS_239;
    }
    else {
        const __VLS_252 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
            type: "info",
            size: "small",
        }));
        const __VLS_254 = __VLS_253({
            type: "info",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        __VLS_255.slots.default;
        var __VLS_255;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ style: {} },
    });
    if ((__VLS_ctx.selected.field_mappings || []).length) {
        const __VLS_256 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
            data: ((__VLS_ctx.selected.field_mappings || [])),
            size: "small",
        }));
        const __VLS_258 = __VLS_257({
            data: ((__VLS_ctx.selected.field_mappings || [])),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_257));
        __VLS_259.slots.default;
        const __VLS_260 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
            prop: "source",
            label: "源字段",
        }));
        const __VLS_262 = __VLS_261({
            prop: "source",
            label: "源字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
        const __VLS_264 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
            prop: "target",
            label: "目标字段",
        }));
        const __VLS_266 = __VLS_265({
            prop: "target",
            label: "目标字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_265));
        const __VLS_268 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
            prop: "transform",
            label: "转换",
            width: "100",
        }));
        const __VLS_270 = __VLS_269({
            prop: "transform",
            label: "转换",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_269));
        var __VLS_259;
    }
    else {
        const __VLS_272 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
            type: "info",
            size: "small",
        }));
        const __VLS_274 = __VLS_273({
            type: "info",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
        __VLS_275.slots.default;
        var __VLS_275;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ style: {} },
    });
    const __VLS_276 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        data: (__VLS_ctx.versions),
        size: "small",
    }));
    const __VLS_278 = __VLS_277({
        data: (__VLS_ctx.versions),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.versionLoading) }, null, null);
    __VLS_279.slots.default;
    const __VLS_280 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        prop: "version",
        label: "版本",
        width: "100",
    }));
    const __VLS_282 = __VLS_281({
        prop: "version",
        label: "版本",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    const __VLS_284 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        prop: "change_note",
        label: "变更说明",
        minWidth: "200",
    }));
    const __VLS_286 = __VLS_285({
        prop: "change_note",
        label: "变更说明",
        minWidth: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    const __VLS_288 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        prop: "created_by",
        label: "操作人",
        width: "120",
    }));
    const __VLS_290 = __VLS_289({
        prop: "created_by",
        label: "操作人",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    const __VLS_292 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
        prop: "created_at",
        label: "时间",
        width: "180",
    }));
    const __VLS_294 = __VLS_293({
        prop: "created_at",
        label: "时间",
        width: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_293));
    __VLS_295.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_295.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.created_at));
    }
    var __VLS_295;
    const __VLS_296 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        label: "操作",
        width: "120",
    }));
    const __VLS_298 = __VLS_297({
        label: "操作",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
    __VLS_299.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_299.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_300 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            disabled: (row.id === __VLS_ctx.latestVersionId),
        }));
        const __VLS_302 = __VLS_301({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            disabled: (row.id === __VLS_ctx.latestVersionId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_301));
        let __VLS_304;
        let __VLS_305;
        let __VLS_306;
        const __VLS_307 = {
            onClick: (...[$event]) => {
                if (!!(!__VLS_ctx.selected))
                    return;
                __VLS_ctx.rollbackVersion(row.id);
            }
        };
        __VLS_303.slots.default;
        var __VLS_303;
    }
    var __VLS_299;
    var __VLS_279;
}
var __VLS_3;
const __VLS_308 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editingId ? '编辑模板' : '新建模板'),
    width: "800px",
    destroyOnClose: true,
}));
const __VLS_310 = __VLS_309({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.editingId ? '编辑模板' : '新建模板'),
    width: "800px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_309));
__VLS_311.slots.default;
const __VLS_312 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
    modelValue: (__VLS_ctx.formTab),
}));
const __VLS_314 = __VLS_313({
    modelValue: (__VLS_ctx.formTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_313));
__VLS_315.slots.default;
const __VLS_316 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
    label: "基础",
    name: "basic",
}));
const __VLS_318 = __VLS_317({
    label: "基础",
    name: "basic",
}, ...__VLS_functionalComponentArgsRest(__VLS_317));
__VLS_319.slots.default;
const __VLS_320 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
    model: (__VLS_ctx.form),
    labelWidth: "110px",
}));
const __VLS_322 = __VLS_321({
    model: (__VLS_ctx.form),
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_321));
__VLS_323.slots.default;
const __VLS_324 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
    gutter: (12),
}));
const __VLS_326 = __VLS_325({
    gutter: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_325));
__VLS_327.slots.default;
const __VLS_328 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
    span: (12),
}));
const __VLS_330 = __VLS_329({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_329));
__VLS_331.slots.default;
const __VLS_332 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
    label: "编码",
}));
const __VLS_334 = __VLS_333({
    label: "编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_333));
__VLS_335.slots.default;
const __VLS_336 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
    modelValue: (__VLS_ctx.form.template_code),
    disabled: (!!__VLS_ctx.editingId),
}));
const __VLS_338 = __VLS_337({
    modelValue: (__VLS_ctx.form.template_code),
    disabled: (!!__VLS_ctx.editingId),
}, ...__VLS_functionalComponentArgsRest(__VLS_337));
var __VLS_335;
var __VLS_331;
const __VLS_340 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
    span: (12),
}));
const __VLS_342 = __VLS_341({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_341));
__VLS_343.slots.default;
const __VLS_344 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
    label: "名称",
}));
const __VLS_346 = __VLS_345({
    label: "名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_345));
__VLS_347.slots.default;
const __VLS_348 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
    modelValue: (__VLS_ctx.form.template_name),
}));
const __VLS_350 = __VLS_349({
    modelValue: (__VLS_ctx.form.template_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_349));
var __VLS_347;
var __VLS_343;
var __VLS_327;
const __VLS_352 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
    gutter: (12),
}));
const __VLS_354 = __VLS_353({
    gutter: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_353));
__VLS_355.slots.default;
const __VLS_356 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
    span: (8),
}));
const __VLS_358 = __VLS_357({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_357));
__VLS_359.slots.default;
const __VLS_360 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
    label: "分类",
}));
const __VLS_362 = __VLS_361({
    label: "分类",
}, ...__VLS_functionalComponentArgsRest(__VLS_361));
__VLS_363.slots.default;
const __VLS_364 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
    modelValue: (__VLS_ctx.form.category),
}));
const __VLS_366 = __VLS_365({
    modelValue: (__VLS_ctx.form.category),
}, ...__VLS_functionalComponentArgsRest(__VLS_365));
__VLS_367.slots.default;
for (const [c] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
    const __VLS_368 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
        key: (c),
        label: (c),
        value: (c),
    }));
    const __VLS_370 = __VLS_369({
        key: (c),
        label: (c),
        value: (c),
    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
}
var __VLS_367;
var __VLS_363;
var __VLS_359;
const __VLS_372 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
    span: (8),
}));
const __VLS_374 = __VLS_373({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_373));
__VLS_375.slots.default;
const __VLS_376 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
    label: "方法",
}));
const __VLS_378 = __VLS_377({
    label: "方法",
}, ...__VLS_functionalComponentArgsRest(__VLS_377));
__VLS_379.slots.default;
const __VLS_380 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
    modelValue: (__VLS_ctx.form.method),
}));
const __VLS_382 = __VLS_381({
    modelValue: (__VLS_ctx.form.method),
}, ...__VLS_functionalComponentArgsRest(__VLS_381));
__VLS_383.slots.default;
for (const [m] of __VLS_getVForSourceType((__VLS_ctx.methods))) {
    const __VLS_384 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
        key: (m),
        label: (m),
        value: (m),
    }));
    const __VLS_386 = __VLS_385({
        key: (m),
        label: (m),
        value: (m),
    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
}
var __VLS_383;
var __VLS_379;
var __VLS_375;
const __VLS_388 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
    span: (8),
}));
const __VLS_390 = __VLS_389({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_389));
__VLS_391.slots.default;
const __VLS_392 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
    label: "Content-Type",
}));
const __VLS_394 = __VLS_393({
    label: "Content-Type",
}, ...__VLS_functionalComponentArgsRest(__VLS_393));
__VLS_395.slots.default;
const __VLS_396 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
    modelValue: (__VLS_ctx.form.content_type),
    placeholder: "application/json",
}));
const __VLS_398 = __VLS_397({
    modelValue: (__VLS_ctx.form.content_type),
    placeholder: "application/json",
}, ...__VLS_functionalComponentArgsRest(__VLS_397));
var __VLS_395;
var __VLS_391;
var __VLS_355;
const __VLS_400 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
    label: "Base URL",
}));
const __VLS_402 = __VLS_401({
    label: "Base URL",
}, ...__VLS_functionalComponentArgsRest(__VLS_401));
__VLS_403.slots.default;
const __VLS_404 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_405 = __VLS_asFunctionalComponent(__VLS_404, new __VLS_404({
    modelValue: (__VLS_ctx.form.base_url),
    placeholder: "https://api.example.com",
}));
const __VLS_406 = __VLS_405({
    modelValue: (__VLS_ctx.form.base_url),
    placeholder: "https://api.example.com",
}, ...__VLS_functionalComponentArgsRest(__VLS_405));
var __VLS_403;
const __VLS_408 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
    label: "Path",
}));
const __VLS_410 = __VLS_409({
    label: "Path",
}, ...__VLS_functionalComponentArgsRest(__VLS_409));
__VLS_411.slots.default;
const __VLS_412 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_413 = __VLS_asFunctionalComponent(__VLS_412, new __VLS_412({
    modelValue: (__VLS_ctx.form.path),
    placeholder: "/v1/employees",
}));
const __VLS_414 = __VLS_413({
    modelValue: (__VLS_ctx.form.path),
    placeholder: "/v1/employees",
}, ...__VLS_functionalComponentArgsRest(__VLS_413));
var __VLS_411;
const __VLS_416 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
    gutter: (12),
}));
const __VLS_418 = __VLS_417({
    gutter: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_417));
__VLS_419.slots.default;
const __VLS_420 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
    span: (8),
}));
const __VLS_422 = __VLS_421({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_421));
__VLS_423.slots.default;
const __VLS_424 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
    label: "认证方式",
}));
const __VLS_426 = __VLS_425({
    label: "认证方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_425));
__VLS_427.slots.default;
const __VLS_428 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
    modelValue: (__VLS_ctx.form.auth_type),
    clearable: true,
}));
const __VLS_430 = __VLS_429({
    modelValue: (__VLS_ctx.form.auth_type),
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_429));
__VLS_431.slots.default;
for (const [a] of __VLS_getVForSourceType((__VLS_ctx.authTypes))) {
    const __VLS_432 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
        key: (a),
        label: (a),
        value: (a),
    }));
    const __VLS_434 = __VLS_433({
        key: (a),
        label: (a),
        value: (a),
    }, ...__VLS_functionalComponentArgsRest(__VLS_433));
}
var __VLS_431;
var __VLS_427;
var __VLS_423;
const __VLS_436 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_437 = __VLS_asFunctionalComponent(__VLS_436, new __VLS_436({
    span: (8),
}));
const __VLS_438 = __VLS_437({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_437));
__VLS_439.slots.default;
const __VLS_440 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
    label: "分页策略",
}));
const __VLS_442 = __VLS_441({
    label: "分页策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_441));
__VLS_443.slots.default;
const __VLS_444 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
    modelValue: (__VLS_ctx.form.pagination_type),
}));
const __VLS_446 = __VLS_445({
    modelValue: (__VLS_ctx.form.pagination_type),
}, ...__VLS_functionalComponentArgsRest(__VLS_445));
__VLS_447.slots.default;
for (const [p] of __VLS_getVForSourceType((__VLS_ctx.paginationTypes))) {
    const __VLS_448 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({
        key: (p),
        label: (p),
        value: (p),
    }));
    const __VLS_450 = __VLS_449({
        key: (p),
        label: (p),
        value: (p),
    }, ...__VLS_functionalComponentArgsRest(__VLS_449));
}
var __VLS_447;
var __VLS_443;
var __VLS_439;
const __VLS_452 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
    span: (8),
}));
const __VLS_454 = __VLS_453({
    span: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_453));
__VLS_455.slots.default;
const __VLS_456 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_457 = __VLS_asFunctionalComponent(__VLS_456, new __VLS_456({
    label: "超时(秒)",
}));
const __VLS_458 = __VLS_457({
    label: "超时(秒)",
}, ...__VLS_functionalComponentArgsRest(__VLS_457));
__VLS_459.slots.default;
const __VLS_460 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_461 = __VLS_asFunctionalComponent(__VLS_460, new __VLS_460({
    modelValue: (__VLS_ctx.form.timeout_seconds),
    min: (1),
    max: (300),
}));
const __VLS_462 = __VLS_461({
    modelValue: (__VLS_ctx.form.timeout_seconds),
    min: (1),
    max: (300),
}, ...__VLS_functionalComponentArgsRest(__VLS_461));
var __VLS_459;
var __VLS_455;
var __VLS_419;
const __VLS_464 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_465 = __VLS_asFunctionalComponent(__VLS_464, new __VLS_464({
    label: "Data Path",
}));
const __VLS_466 = __VLS_465({
    label: "Data Path",
}, ...__VLS_functionalComponentArgsRest(__VLS_465));
__VLS_467.slots.default;
const __VLS_468 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_469 = __VLS_asFunctionalComponent(__VLS_468, new __VLS_468({
    modelValue: (__VLS_ctx.form.data_path),
    placeholder: "$.data.items",
}));
const __VLS_470 = __VLS_469({
    modelValue: (__VLS_ctx.form.data_path),
    placeholder: "$.data.items",
}, ...__VLS_functionalComponentArgsRest(__VLS_469));
var __VLS_467;
const __VLS_472 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_473 = __VLS_asFunctionalComponent(__VLS_472, new __VLS_472({
    label: "Total Path",
}));
const __VLS_474 = __VLS_473({
    label: "Total Path",
}, ...__VLS_functionalComponentArgsRest(__VLS_473));
__VLS_475.slots.default;
const __VLS_476 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_477 = __VLS_asFunctionalComponent(__VLS_476, new __VLS_476({
    modelValue: (__VLS_ctx.form.total_path),
    placeholder: "$.data.total",
}));
const __VLS_478 = __VLS_477({
    modelValue: (__VLS_ctx.form.total_path),
    placeholder: "$.data.total",
}, ...__VLS_functionalComponentArgsRest(__VLS_477));
var __VLS_475;
const __VLS_480 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_481 = __VLS_asFunctionalComponent(__VLS_480, new __VLS_480({
    label: "Cursor Path",
}));
const __VLS_482 = __VLS_481({
    label: "Cursor Path",
}, ...__VLS_functionalComponentArgsRest(__VLS_481));
__VLS_483.slots.default;
const __VLS_484 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_485 = __VLS_asFunctionalComponent(__VLS_484, new __VLS_484({
    modelValue: (__VLS_ctx.form.next_cursor_path),
    placeholder: "$.data.next_cursor",
}));
const __VLS_486 = __VLS_485({
    modelValue: (__VLS_ctx.form.next_cursor_path),
    placeholder: "$.data.next_cursor",
}, ...__VLS_functionalComponentArgsRest(__VLS_485));
var __VLS_483;
var __VLS_323;
var __VLS_319;
const __VLS_488 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_489 = __VLS_asFunctionalComponent(__VLS_488, new __VLS_488({
    label: "协议",
    name: "protocol",
}));
const __VLS_490 = __VLS_489({
    label: "协议",
    name: "protocol",
}, ...__VLS_functionalComponentArgsRest(__VLS_489));
__VLS_491.slots.default;
const __VLS_492 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_493 = __VLS_asFunctionalComponent(__VLS_492, new __VLS_492({
    labelWidth: "110px",
}));
const __VLS_494 = __VLS_493({
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_493));
__VLS_495.slots.default;
const __VLS_496 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_497 = __VLS_asFunctionalComponent(__VLS_496, new __VLS_496({
    label: "Headers",
}));
const __VLS_498 = __VLS_497({
    label: "Headers",
}, ...__VLS_functionalComponentArgsRest(__VLS_497));
__VLS_499.slots.default;
for (const [h, i] of __VLS_getVForSourceType((__VLS_ctx.form.headers_config))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_500 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_501 = __VLS_asFunctionalComponent(__VLS_500, new __VLS_500({
        modelValue: (h.key),
        placeholder: "Key",
        ...{ style: {} },
    }));
    const __VLS_502 = __VLS_501({
        modelValue: (h.key),
        placeholder: "Key",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_501));
    const __VLS_504 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_505 = __VLS_asFunctionalComponent(__VLS_504, new __VLS_504({
        modelValue: (h.value),
        placeholder: "Value (支持 {{var}})",
        ...{ style: {} },
    }));
    const __VLS_506 = __VLS_505({
        modelValue: (h.value),
        placeholder: "Value (支持 {{var}})",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_505));
    const __VLS_508 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_509 = __VLS_asFunctionalComponent(__VLS_508, new __VLS_508({
        modelValue: (h.type),
        ...{ style: {} },
    }));
    const __VLS_510 = __VLS_509({
        modelValue: (h.type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_509));
    __VLS_511.slots.default;
    const __VLS_512 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_513 = __VLS_asFunctionalComponent(__VLS_512, new __VLS_512({
        label: "静态",
        value: "static",
    }));
    const __VLS_514 = __VLS_513({
        label: "静态",
        value: "static",
    }, ...__VLS_functionalComponentArgsRest(__VLS_513));
    const __VLS_516 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_517 = __VLS_asFunctionalComponent(__VLS_516, new __VLS_516({
        label: "凭证",
        value: "credential",
    }));
    const __VLS_518 = __VLS_517({
        label: "凭证",
        value: "credential",
    }, ...__VLS_functionalComponentArgsRest(__VLS_517));
    const __VLS_520 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_521 = __VLS_asFunctionalComponent(__VLS_520, new __VLS_520({
        label: "变量",
        value: "variable",
    }));
    const __VLS_522 = __VLS_521({
        label: "变量",
        value: "variable",
    }, ...__VLS_functionalComponentArgsRest(__VLS_521));
    var __VLS_511;
    const __VLS_524 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_525 = __VLS_asFunctionalComponent(__VLS_524, new __VLS_524({
        ...{ 'onClick': {} },
        type: "danger",
        icon: ('Delete'),
    }));
    const __VLS_526 = __VLS_525({
        ...{ 'onClick': {} },
        type: "danger",
        icon: ('Delete'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_525));
    let __VLS_528;
    let __VLS_529;
    let __VLS_530;
    const __VLS_531 = {
        onClick: (...[$event]) => {
            __VLS_ctx.form.headers_config.splice(i, 1);
        }
    };
    var __VLS_527;
}
const __VLS_532 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_533 = __VLS_asFunctionalComponent(__VLS_532, new __VLS_532({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_534 = __VLS_533({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_533));
let __VLS_536;
let __VLS_537;
let __VLS_538;
const __VLS_539 = {
    onClick: (...[$event]) => {
        __VLS_ctx.form.headers_config.push({ key: '', value: '', type: 'static' });
    }
};
__VLS_535.slots.default;
var __VLS_535;
var __VLS_499;
const __VLS_540 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_541 = __VLS_asFunctionalComponent(__VLS_540, new __VLS_540({
    label: "Query Params",
}));
const __VLS_542 = __VLS_541({
    label: "Query Params",
}, ...__VLS_functionalComponentArgsRest(__VLS_541));
__VLS_543.slots.default;
for (const [q, i] of __VLS_getVForSourceType((__VLS_ctx.form.query_config))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_544 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_545 = __VLS_asFunctionalComponent(__VLS_544, new __VLS_544({
        modelValue: (q.key),
        placeholder: "Key",
        ...{ style: {} },
    }));
    const __VLS_546 = __VLS_545({
        modelValue: (q.key),
        placeholder: "Key",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_545));
    const __VLS_548 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_549 = __VLS_asFunctionalComponent(__VLS_548, new __VLS_548({
        modelValue: (q.value),
        placeholder: "Value",
        ...{ style: {} },
    }));
    const __VLS_550 = __VLS_549({
        modelValue: (q.value),
        placeholder: "Value",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_549));
    const __VLS_552 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_553 = __VLS_asFunctionalComponent(__VLS_552, new __VLS_552({
        modelValue: (q.required),
        ...{ style: {} },
    }));
    const __VLS_554 = __VLS_553({
        modelValue: (q.required),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_553));
    __VLS_555.slots.default;
    var __VLS_555;
    const __VLS_556 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_557 = __VLS_asFunctionalComponent(__VLS_556, new __VLS_556({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_558 = __VLS_557({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_557));
    let __VLS_560;
    let __VLS_561;
    let __VLS_562;
    const __VLS_563 = {
        onClick: (...[$event]) => {
            __VLS_ctx.form.query_config.splice(i, 1);
        }
    };
    var __VLS_559;
}
const __VLS_564 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_565 = __VLS_asFunctionalComponent(__VLS_564, new __VLS_564({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_566 = __VLS_565({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_565));
let __VLS_568;
let __VLS_569;
let __VLS_570;
const __VLS_571 = {
    onClick: (...[$event]) => {
        __VLS_ctx.form.query_config.push({ key: '', value: '', required: false });
    }
};
__VLS_567.slots.default;
var __VLS_567;
var __VLS_543;
const __VLS_572 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_573 = __VLS_asFunctionalComponent(__VLS_572, new __VLS_572({
    label: "Body Template",
}));
const __VLS_574 = __VLS_573({
    label: "Body Template",
}, ...__VLS_functionalComponentArgsRest(__VLS_573));
__VLS_575.slots.default;
const __VLS_576 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_577 = __VLS_asFunctionalComponent(__VLS_576, new __VLS_576({
    modelValue: (__VLS_ctx.bodyTemplateStr),
    type: "textarea",
    rows: (6),
    placeholder: '{"query":"{{keyword}}","page":{{page}}}',
}));
const __VLS_578 = __VLS_577({
    modelValue: (__VLS_ctx.bodyTemplateStr),
    type: "textarea",
    rows: (6),
    placeholder: '{"query":"{{keyword}}","page":{{page}}}',
}, ...__VLS_functionalComponentArgsRest(__VLS_577));
var __VLS_575;
var __VLS_495;
var __VLS_491;
const __VLS_580 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_581 = __VLS_asFunctionalComponent(__VLS_580, new __VLS_580({
    label: "映射",
    name: "mapping",
}));
const __VLS_582 = __VLS_581({
    label: "映射",
    name: "mapping",
}, ...__VLS_functionalComponentArgsRest(__VLS_581));
__VLS_583.slots.default;
const __VLS_584 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_585 = __VLS_asFunctionalComponent(__VLS_584, new __VLS_584({
    labelWidth: "110px",
}));
const __VLS_586 = __VLS_585({
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_585));
__VLS_587.slots.default;
const __VLS_588 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_589 = __VLS_asFunctionalComponent(__VLS_588, new __VLS_588({
    label: "字段映射",
}));
const __VLS_590 = __VLS_589({
    label: "字段映射",
}, ...__VLS_functionalComponentArgsRest(__VLS_589));
__VLS_591.slots.default;
for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.form.field_mappings))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_592 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_593 = __VLS_asFunctionalComponent(__VLS_592, new __VLS_592({
        modelValue: (f.source),
        placeholder: "源字段",
        ...{ style: {} },
    }));
    const __VLS_594 = __VLS_593({
        modelValue: (f.source),
        placeholder: "源字段",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_593));
    const __VLS_596 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_597 = __VLS_asFunctionalComponent(__VLS_596, new __VLS_596({
        modelValue: (f.target),
        placeholder: "目标字段",
        ...{ style: {} },
    }));
    const __VLS_598 = __VLS_597({
        modelValue: (f.target),
        placeholder: "目标字段",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_597));
    const __VLS_600 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_601 = __VLS_asFunctionalComponent(__VLS_600, new __VLS_600({
        modelValue: (f.transform),
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_602 = __VLS_601({
        modelValue: (f.transform),
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_601));
    __VLS_603.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.transforms))) {
        const __VLS_604 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_605 = __VLS_asFunctionalComponent(__VLS_604, new __VLS_604({
            key: (t),
            label: (t),
            value: (t),
        }));
        const __VLS_606 = __VLS_605({
            key: (t),
            label: (t),
            value: (t),
        }, ...__VLS_functionalComponentArgsRest(__VLS_605));
    }
    var __VLS_603;
    const __VLS_608 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_609 = __VLS_asFunctionalComponent(__VLS_608, new __VLS_608({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_610 = __VLS_609({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_609));
    let __VLS_612;
    let __VLS_613;
    let __VLS_614;
    const __VLS_615 = {
        onClick: (...[$event]) => {
            __VLS_ctx.form.field_mappings.splice(i, 1);
        }
    };
    var __VLS_611;
}
const __VLS_616 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_617 = __VLS_asFunctionalComponent(__VLS_616, new __VLS_616({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_618 = __VLS_617({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_617));
let __VLS_620;
let __VLS_621;
let __VLS_622;
const __VLS_623 = {
    onClick: (...[$event]) => {
        __VLS_ctx.form.field_mappings.push({ source: '', target: '', transform: '' });
    }
};
__VLS_619.slots.default;
var __VLS_619;
var __VLS_591;
const __VLS_624 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_625 = __VLS_asFunctionalComponent(__VLS_624, new __VLS_624({
    label: "错误码映射",
}));
const __VLS_626 = __VLS_625({
    label: "错误码映射",
}, ...__VLS_functionalComponentArgsRest(__VLS_625));
__VLS_627.slots.default;
for (const [e, i] of __VLS_getVForSourceType((__VLS_ctx.errorCodePairs))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ style: {} },
    });
    const __VLS_628 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_629 = __VLS_asFunctionalComponent(__VLS_628, new __VLS_628({
        modelValue: (e.external),
        placeholder: "外部码",
        ...{ style: {} },
    }));
    const __VLS_630 = __VLS_629({
        modelValue: (e.external),
        placeholder: "外部码",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_629));
    const __VLS_632 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_633 = __VLS_asFunctionalComponent(__VLS_632, new __VLS_632({
        modelValue: (e.ucp),
        placeholder: "UCP码",
        ...{ style: {} },
    }));
    const __VLS_634 = __VLS_633({
        modelValue: (e.ucp),
        placeholder: "UCP码",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_633));
    const __VLS_636 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_637 = __VLS_asFunctionalComponent(__VLS_636, new __VLS_636({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_638 = __VLS_637({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_637));
    let __VLS_640;
    let __VLS_641;
    let __VLS_642;
    const __VLS_643 = {
        onClick: (...[$event]) => {
            __VLS_ctx.errorCodePairs.splice(i, 1);
        }
    };
    var __VLS_639;
}
const __VLS_644 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_645 = __VLS_asFunctionalComponent(__VLS_644, new __VLS_644({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_646 = __VLS_645({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_645));
let __VLS_648;
let __VLS_649;
let __VLS_650;
const __VLS_651 = {
    onClick: (...[$event]) => {
        __VLS_ctx.errorCodePairs.push({ external: '', ucp: '' });
    }
};
__VLS_647.slots.default;
var __VLS_647;
var __VLS_627;
var __VLS_587;
var __VLS_583;
const __VLS_652 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_653 = __VLS_asFunctionalComponent(__VLS_652, new __VLS_652({
    label: "限制",
    name: "limits",
}));
const __VLS_654 = __VLS_653({
    label: "限制",
    name: "limits",
}, ...__VLS_functionalComponentArgsRest(__VLS_653));
__VLS_655.slots.default;
const __VLS_656 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_657 = __VLS_asFunctionalComponent(__VLS_656, new __VLS_656({
    labelWidth: "120px",
}));
const __VLS_658 = __VLS_657({
    labelWidth: "120px",
}, ...__VLS_functionalComponentArgsRest(__VLS_657));
__VLS_659.slots.default;
const __VLS_660 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_661 = __VLS_asFunctionalComponent(__VLS_660, new __VLS_660({
    gutter: (12),
}));
const __VLS_662 = __VLS_661({
    gutter: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_661));
__VLS_663.slots.default;
const __VLS_664 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_665 = __VLS_asFunctionalComponent(__VLS_664, new __VLS_664({
    span: (12),
}));
const __VLS_666 = __VLS_665({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_665));
__VLS_667.slots.default;
const __VLS_668 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_669 = __VLS_asFunctionalComponent(__VLS_668, new __VLS_668({
    label: "限流 QPS",
}));
const __VLS_670 = __VLS_669({
    label: "限流 QPS",
}, ...__VLS_functionalComponentArgsRest(__VLS_669));
__VLS_671.slots.default;
const __VLS_672 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_673 = __VLS_asFunctionalComponent(__VLS_672, new __VLS_672({
    modelValue: (__VLS_ctx.form.rate_limit_qps),
    min: (1),
}));
const __VLS_674 = __VLS_673({
    modelValue: (__VLS_ctx.form.rate_limit_qps),
    min: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_673));
var __VLS_671;
var __VLS_667;
const __VLS_676 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_677 = __VLS_asFunctionalComponent(__VLS_676, new __VLS_676({
    span: (12),
}));
const __VLS_678 = __VLS_677({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_677));
__VLS_679.slots.default;
const __VLS_680 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_681 = __VLS_asFunctionalComponent(__VLS_680, new __VLS_680({
    label: "并发数",
}));
const __VLS_682 = __VLS_681({
    label: "并发数",
}, ...__VLS_functionalComponentArgsRest(__VLS_681));
__VLS_683.slots.default;
const __VLS_684 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_685 = __VLS_asFunctionalComponent(__VLS_684, new __VLS_684({
    modelValue: (__VLS_ctx.form.rate_limit_concurrency),
    min: (1),
}));
const __VLS_686 = __VLS_685({
    modelValue: (__VLS_ctx.form.rate_limit_concurrency),
    min: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_685));
var __VLS_683;
var __VLS_679;
var __VLS_663;
const __VLS_688 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_689 = __VLS_asFunctionalComponent(__VLS_688, new __VLS_688({
    gutter: (12),
}));
const __VLS_690 = __VLS_689({
    gutter: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_689));
__VLS_691.slots.default;
const __VLS_692 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_693 = __VLS_asFunctionalComponent(__VLS_692, new __VLS_692({
    span: (12),
}));
const __VLS_694 = __VLS_693({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_693));
__VLS_695.slots.default;
const __VLS_696 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_697 = __VLS_asFunctionalComponent(__VLS_696, new __VLS_696({
    label: "重试次数",
}));
const __VLS_698 = __VLS_697({
    label: "重试次数",
}, ...__VLS_functionalComponentArgsRest(__VLS_697));
__VLS_699.slots.default;
const __VLS_700 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_701 = __VLS_asFunctionalComponent(__VLS_700, new __VLS_700({
    modelValue: (__VLS_ctx.form.retry_max),
    min: (0),
    max: (10),
}));
const __VLS_702 = __VLS_701({
    modelValue: (__VLS_ctx.form.retry_max),
    min: (0),
    max: (10),
}, ...__VLS_functionalComponentArgsRest(__VLS_701));
var __VLS_699;
var __VLS_695;
const __VLS_704 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_705 = __VLS_asFunctionalComponent(__VLS_704, new __VLS_704({
    span: (12),
}));
const __VLS_706 = __VLS_705({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_705));
__VLS_707.slots.default;
const __VLS_708 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_709 = __VLS_asFunctionalComponent(__VLS_708, new __VLS_708({
    label: "退避策略",
}));
const __VLS_710 = __VLS_709({
    label: "退避策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_709));
__VLS_711.slots.default;
const __VLS_712 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_713 = __VLS_asFunctionalComponent(__VLS_712, new __VLS_712({
    modelValue: (__VLS_ctx.form.retry_backoff),
}));
const __VLS_714 = __VLS_713({
    modelValue: (__VLS_ctx.form.retry_backoff),
}, ...__VLS_functionalComponentArgsRest(__VLS_713));
__VLS_715.slots.default;
const __VLS_716 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_717 = __VLS_asFunctionalComponent(__VLS_716, new __VLS_716({
    label: "固定",
    value: "fixed",
}));
const __VLS_718 = __VLS_717({
    label: "固定",
    value: "fixed",
}, ...__VLS_functionalComponentArgsRest(__VLS_717));
const __VLS_720 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_721 = __VLS_asFunctionalComponent(__VLS_720, new __VLS_720({
    label: "指数",
    value: "exponential",
}));
const __VLS_722 = __VLS_721({
    label: "指数",
    value: "exponential",
}, ...__VLS_functionalComponentArgsRest(__VLS_721));
const __VLS_724 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_725 = __VLS_asFunctionalComponent(__VLS_724, new __VLS_724({
    label: "线性",
    value: "linear",
}));
const __VLS_726 = __VLS_725({
    label: "线性",
    value: "linear",
}, ...__VLS_functionalComponentArgsRest(__VLS_725));
var __VLS_715;
var __VLS_711;
var __VLS_707;
var __VLS_691;
const __VLS_728 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_729 = __VLS_asFunctionalComponent(__VLS_728, new __VLS_728({
    label: "域名白名单",
}));
const __VLS_730 = __VLS_729({
    label: "域名白名单",
}, ...__VLS_functionalComponentArgsRest(__VLS_729));
__VLS_731.slots.default;
const __VLS_732 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_733 = __VLS_asFunctionalComponent(__VLS_732, new __VLS_732({
    modelValue: (__VLS_ctx.allowedDomainsStr),
    placeholder: "用逗号分隔, * 表示全部, 如: *.example.com,api.com",
}));
const __VLS_734 = __VLS_733({
    modelValue: (__VLS_ctx.allowedDomainsStr),
    placeholder: "用逗号分隔, * 表示全部, 如: *.example.com,api.com",
}, ...__VLS_functionalComponentArgsRest(__VLS_733));
var __VLS_731;
const __VLS_736 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_737 = __VLS_asFunctionalComponent(__VLS_736, new __VLS_736({
    label: "描述",
}));
const __VLS_738 = __VLS_737({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_737));
__VLS_739.slots.default;
const __VLS_740 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_741 = __VLS_asFunctionalComponent(__VLS_740, new __VLS_740({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_742 = __VLS_741({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_741));
var __VLS_739;
var __VLS_659;
var __VLS_655;
var __VLS_315;
{
    const { footer: __VLS_thisSlot } = __VLS_311.slots;
    const __VLS_744 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_745 = __VLS_asFunctionalComponent(__VLS_744, new __VLS_744({
        ...{ 'onClick': {} },
    }));
    const __VLS_746 = __VLS_745({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_745));
    let __VLS_748;
    let __VLS_749;
    let __VLS_750;
    const __VLS_751 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_747.slots.default;
    var __VLS_747;
    const __VLS_752 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_753 = __VLS_asFunctionalComponent(__VLS_752, new __VLS_752({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_754 = __VLS_753({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_753));
    let __VLS_756;
    let __VLS_757;
    let __VLS_758;
    const __VLS_759 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_755.slots.default;
    (__VLS_ctx.editingId ? '更新' : '创建');
    var __VLS_755;
}
var __VLS_311;
const __VLS_760 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_761 = __VLS_asFunctionalComponent(__VLS_760, new __VLS_760({
    ...{ 'onOpened': {} },
    modelValue: (__VLS_ctx.testVisible),
    title: "测试 API",
    width: "700px",
    destroyOnClose: true,
}));
const __VLS_762 = __VLS_761({
    ...{ 'onOpened': {} },
    modelValue: (__VLS_ctx.testVisible),
    title: "测试 API",
    width: "700px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_761));
let __VLS_764;
let __VLS_765;
let __VLS_766;
const __VLS_767 = {
    onOpened: (__VLS_ctx.runTest)
};
__VLS_763.slots.default;
const __VLS_768 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_769 = __VLS_asFunctionalComponent(__VLS_768, new __VLS_768({
    labelWidth: "100px",
}));
const __VLS_770 = __VLS_769({
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_769));
__VLS_771.slots.default;
const __VLS_772 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_773 = __VLS_asFunctionalComponent(__VLS_772, new __VLS_772({
    label: "变量上下文",
}));
const __VLS_774 = __VLS_773({
    label: "变量上下文",
}, ...__VLS_functionalComponentArgsRest(__VLS_773));
__VLS_775.slots.default;
const __VLS_776 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_777 = __VLS_asFunctionalComponent(__VLS_776, new __VLS_776({
    modelValue: (__VLS_ctx.testContextStr),
    type: "textarea",
    rows: (3),
    placeholder: '{"keyword":"HR","page":1}',
}));
const __VLS_778 = __VLS_777({
    modelValue: (__VLS_ctx.testContextStr),
    type: "textarea",
    rows: (3),
    placeholder: '{"keyword":"HR","page":1}',
}, ...__VLS_functionalComponentArgsRest(__VLS_777));
var __VLS_775;
var __VLS_771;
const __VLS_780 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_781 = __VLS_asFunctionalComponent(__VLS_780, new __VLS_780({}));
const __VLS_782 = __VLS_781({}, ...__VLS_functionalComponentArgsRest(__VLS_781));
if (__VLS_ctx.testLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_784 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_785 = __VLS_asFunctionalComponent(__VLS_784, new __VLS_784({}));
    const __VLS_786 = __VLS_785({}, ...__VLS_functionalComponentArgsRest(__VLS_785));
    __VLS_787.slots.default;
    var __VLS_787;
}
else if (__VLS_ctx.testResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
    const __VLS_788 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_789 = __VLS_asFunctionalComponent(__VLS_788, new __VLS_788({
        column: (2),
        border: true,
        size: "small",
    }));
    const __VLS_790 = __VLS_789({
        column: (2),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_789));
    __VLS_791.slots.default;
    const __VLS_792 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_793 = __VLS_asFunctionalComponent(__VLS_792, new __VLS_792({
        label: "方法",
    }));
    const __VLS_794 = __VLS_793({
        label: "方法",
    }, ...__VLS_functionalComponentArgsRest(__VLS_793));
    __VLS_795.slots.default;
    (__VLS_ctx.testResult.request?.method);
    var __VLS_795;
    const __VLS_796 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_797 = __VLS_asFunctionalComponent(__VLS_796, new __VLS_796({
        label: "URL",
    }));
    const __VLS_798 = __VLS_797({
        label: "URL",
    }, ...__VLS_functionalComponentArgsRest(__VLS_797));
    __VLS_799.slots.default;
    (__VLS_ctx.testResult.request?.url);
    var __VLS_799;
    const __VLS_800 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_801 = __VLS_asFunctionalComponent(__VLS_800, new __VLS_800({
        label: "Headers",
    }));
    const __VLS_802 = __VLS_801({
        label: "Headers",
    }, ...__VLS_functionalComponentArgsRest(__VLS_801));
    __VLS_803.slots.default;
    ((__VLS_ctx.testResult.request?.headers_keys || []).join(', '));
    var __VLS_803;
    const __VLS_804 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_805 = __VLS_asFunctionalComponent(__VLS_804, new __VLS_804({
        label: "有Body",
    }));
    const __VLS_806 = __VLS_805({
        label: "有Body",
    }, ...__VLS_functionalComponentArgsRest(__VLS_805));
    __VLS_807.slots.default;
    (__VLS_ctx.testResult.request?.has_body ? '是' : '否');
    var __VLS_807;
    const __VLS_808 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_809 = __VLS_asFunctionalComponent(__VLS_808, new __VLS_808({
        label: "提取行数",
    }));
    const __VLS_810 = __VLS_809({
        label: "提取行数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_809));
    __VLS_811.slots.default;
    (__VLS_ctx.testResult.total);
    var __VLS_811;
    var __VLS_791;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ style: {} },
    });
    (JSON.stringify(__VLS_ctx.testResult.response_sample, null, 2));
}
else if (__VLS_ctx.testError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_812 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_813 = __VLS_asFunctionalComponent(__VLS_812, new __VLS_812({
        title: (__VLS_ctx.testError),
        type: "error",
    }));
    const __VLS_814 = __VLS_813({
        title: (__VLS_ctx.testError),
        type: "error",
    }, ...__VLS_functionalComponentArgsRest(__VLS_813));
}
{
    const { footer: __VLS_thisSlot } = __VLS_763.slots;
    const __VLS_816 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_817 = __VLS_asFunctionalComponent(__VLS_816, new __VLS_816({
        ...{ 'onClick': {} },
    }));
    const __VLS_818 = __VLS_817({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_817));
    let __VLS_820;
    let __VLS_821;
    let __VLS_822;
    const __VLS_823 = {
        onClick: (...[$event]) => {
            __VLS_ctx.testVisible = false;
        }
    };
    __VLS_819.slots.default;
    var __VLS_819;
    const __VLS_824 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_825 = __VLS_asFunctionalComponent(__VLS_824, new __VLS_824({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_826 = __VLS_825({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_825));
    let __VLS_828;
    let __VLS_829;
    let __VLS_830;
    const __VLS_831 = {
        onClick: (__VLS_ctx.runTest)
    };
    __VLS_827.slots.default;
    var __VLS_827;
    if (__VLS_ctx.testResult) {
        const __VLS_832 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_833 = __VLS_asFunctionalComponent(__VLS_832, new __VLS_832({
            ...{ 'onClick': {} },
            type: "success",
            loading: (__VLS_ctx.savingSample),
        }));
        const __VLS_834 = __VLS_833({
            ...{ 'onClick': {} },
            type: "success",
            loading: (__VLS_ctx.savingSample),
        }, ...__VLS_functionalComponentArgsRest(__VLS_833));
        let __VLS_836;
        let __VLS_837;
        let __VLS_838;
        const __VLS_839 = {
            onClick: (__VLS_ctx.saveSample)
        };
        __VLS_835.slots.default;
        var __VLS_835;
    }
}
var __VLS_763;
const __VLS_840 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_841 = __VLS_asFunctionalComponent(__VLS_840, new __VLS_840({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.showImport),
    title: "导入 OpenAPI 3.x",
    width: "640px",
}));
const __VLS_842 = __VLS_841({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.showImport),
    title: "导入 OpenAPI 3.x",
    width: "640px",
}, ...__VLS_functionalComponentArgsRest(__VLS_841));
let __VLS_844;
let __VLS_845;
let __VLS_846;
const __VLS_847 = {
    onClosed: (...[$event]) => {
        __VLS_ctx.openApiPreview = null;
    }
};
__VLS_843.slots.default;
const __VLS_848 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_849 = __VLS_asFunctionalComponent(__VLS_848, new __VLS_848({
    title: "仅导入白名单 HTTPS 的 GET 或查询型 POST；写操作、外部引用和未知认证会被拒绝。",
    type: "info",
    closable: (false),
    ...{ style: {} },
}));
const __VLS_850 = __VLS_849({
    title: "仅导入白名单 HTTPS 的 GET 或查询型 POST；写操作、外部引用和未知认证会被拒绝。",
    type: "info",
    closable: (false),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_849));
const __VLS_852 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_853 = __VLS_asFunctionalComponent(__VLS_852, new __VLS_852({
    labelWidth: "100px",
}));
const __VLS_854 = __VLS_853({
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_853));
__VLS_855.slots.default;
const __VLS_856 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_857 = __VLS_asFunctionalComponent(__VLS_856, new __VLS_856({
    label: "允许域名",
}));
const __VLS_858 = __VLS_857({
    label: "允许域名",
}, ...__VLS_functionalComponentArgsRest(__VLS_857));
__VLS_859.slots.default;
const __VLS_860 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_861 = __VLS_asFunctionalComponent(__VLS_860, new __VLS_860({
    modelValue: (__VLS_ctx.openApiDomains),
    placeholder: "api.example.com, *.example.com",
}));
const __VLS_862 = __VLS_861({
    modelValue: (__VLS_ctx.openApiDomains),
    placeholder: "api.example.com, *.example.com",
}, ...__VLS_functionalComponentArgsRest(__VLS_861));
var __VLS_859;
var __VLS_855;
const __VLS_864 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_865 = __VLS_asFunctionalComponent(__VLS_864, new __VLS_864({
    modelValue: (__VLS_ctx.importJson),
    type: "textarea",
    rows: (10),
    placeholder: "粘贴 OpenAPI 3.x JSON 规范",
}));
const __VLS_866 = __VLS_865({
    modelValue: (__VLS_ctx.importJson),
    type: "textarea",
    rows: (10),
    placeholder: "粘贴 OpenAPI 3.x JSON 规范",
}, ...__VLS_functionalComponentArgsRest(__VLS_865));
if (__VLS_ctx.openApiPreview) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "openapi-preview" },
    });
    const __VLS_868 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_869 = __VLS_asFunctionalComponent(__VLS_868, new __VLS_868({}));
    const __VLS_870 = __VLS_869({}, ...__VLS_functionalComponentArgsRest(__VLS_869));
    __VLS_871.slots.default;
    var __VLS_871;
    const __VLS_872 = {}.ElCheckboxGroup;
    /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
    // @ts-ignore
    const __VLS_873 = __VLS_asFunctionalComponent(__VLS_872, new __VLS_872({
        modelValue: (__VLS_ctx.selectedOperationIds),
    }));
    const __VLS_874 = __VLS_873({
        modelValue: (__VLS_ctx.selectedOperationIds),
    }, ...__VLS_functionalComponentArgsRest(__VLS_873));
    __VLS_875.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.openApiPreview.operations))) {
        const __VLS_876 = {}.ElCheckbox;
        /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
        // @ts-ignore
        const __VLS_877 = __VLS_asFunctionalComponent(__VLS_876, new __VLS_876({
            key: (item.operation_id),
            label: (item.operation_id),
        }));
        const __VLS_878 = __VLS_877({
            key: (item.operation_id),
            label: (item.operation_id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_877));
        __VLS_879.slots.default;
        (item.method);
        (item.path);
        (item.template_name);
        var __VLS_879;
    }
    var __VLS_875;
    if (__VLS_ctx.openApiPreview.rejected?.length) {
        const __VLS_880 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_881 = __VLS_asFunctionalComponent(__VLS_880, new __VLS_880({
            title: (`已拒绝 ${__VLS_ctx.openApiPreview.rejected.length} 个不安全操作`),
            type: "warning",
            closable: (false),
            ...{ style: {} },
        }));
        const __VLS_882 = __VLS_881({
            title: (`已拒绝 ${__VLS_ctx.openApiPreview.rejected.length} 个不安全操作`),
            type: "warning",
            closable: (false),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_881));
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_843.slots;
    const __VLS_884 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_885 = __VLS_asFunctionalComponent(__VLS_884, new __VLS_884({
        ...{ 'onClick': {} },
    }));
    const __VLS_886 = __VLS_885({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_885));
    let __VLS_888;
    let __VLS_889;
    let __VLS_890;
    const __VLS_891 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showImport = false;
        }
    };
    __VLS_887.slots.default;
    var __VLS_887;
    const __VLS_892 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_893 = __VLS_asFunctionalComponent(__VLS_892, new __VLS_892({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_894 = __VLS_893({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_893));
    let __VLS_896;
    let __VLS_897;
    let __VLS_898;
    const __VLS_899 = {
        onClick: (__VLS_ctx.doImport)
    };
    __VLS_895.slots.default;
    (__VLS_ctx.openApiPreview ? '确认导入草稿' : '解析规范');
    var __VLS_895;
}
var __VLS_843;
/** @type {__VLS_StyleScopedClasses['api-template-library']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['openapi-preview']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            rows: rows,
            total: total,
            loading: loading,
            pageSize: pageSize,
            selected: selected,
            versions: versions,
            versionLoading: versionLoading,
            latestVersionId: latestVersionId,
            formTab: formTab,
            filters: filters,
            categories: categories,
            methods: methods,
            paginationTypes: paginationTypes,
            authTypes: authTypes,
            transforms: transforms,
            dialogVisible: dialogVisible,
            editingId: editingId,
            saving: saving,
            form: form,
            bodyTemplateStr: bodyTemplateStr,
            errorCodePairs: errorCodePairs,
            allowedDomainsStr: allowedDomainsStr,
            showImport: showImport,
            importJson: importJson,
            openApiDomains: openApiDomains,
            openApiPreview: openApiPreview,
            selectedOperationIds: selectedOperationIds,
            testVisible: testVisible,
            testLoading: testLoading,
            testResult: testResult,
            testError: testError,
            testContextStr: testContextStr,
            savingSample: savingSample,
            methodColor: methodColor,
            load: load,
            pageChange: pageChange,
            openCreateDialog: openCreateDialog,
            openEdit: openEdit,
            openDetail: openDetail,
            openTest: openTest,
            runTest: runTest,
            saveSample: saveSample,
            save: save,
            copyTemplate: copyTemplate,
            doImport: doImport,
            approvePublish: approvePublish,
            rollbackVersion: rollbackVersion,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
