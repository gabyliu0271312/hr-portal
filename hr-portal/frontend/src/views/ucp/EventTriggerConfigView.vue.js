/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import PermissionButton from '@/components/PermissionButton.vue';
const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC'];
const items = ref([]);
const loading = ref(false);
const pipelineOptions = ref([]);
// Phase 5-2: system / resource 二级下拉
const systems = ref([]);
const allResources = ref([]);
async function loadSystemsAndResources() {
    try {
        const [sysRes, resRes] = await Promise.all([
            ucpApi.systems(),
            ucpApi.resources({}),
        ]);
        systems.value = sysRes.items || [];
        allResources.value = resRes.items || [];
    }
    catch {
        // 静默失败
    }
}
function resourcesOf(systemCode) {
    if (!systemCode)
        return [];
    return allResources.value.filter((r) => r.system_code === systemCode);
}
function onSystemChange() {
    // 切换 system 时清空 resource
    form.source_resource_id = null;
}
const dialogVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const formRef = ref();
const form = reactive({
    trigger_code: '',
    trigger_name: '',
    event_source: 'FEISHU',
    source_system_code: '',
    source_resource_id: null,
    event_types: '',
    pipeline_code: '',
    filter_rule: null,
    signing_secret: '',
    signature_header: 'X-Signature',
    feishu_verification_token: '',
    feishu_encrypt_key: '',
    run_as_type: 'SERVICE_ACCOUNT',
    service_account_code: '',
    is_active: true,
    webhook_path: '',
    description: '',
});
const filterRuleText = ref('');
const rules = {
    trigger_code: [{ required: true, message: '必填' }],
    trigger_name: [{ required: true, message: '必填' }],
    event_source: [{ required: true, message: '必填' }],
    event_types: [{ required: true, message: '必填' }],
    pipeline_code: [{ required: true, message: '必填' }],
};
async function loadList() {
    loading.value = true;
    try {
        const res = await ucpApi.listEventTriggers({ limit: 200 });
        items.value = res.items || [];
    }
    finally {
        loading.value = false;
    }
}
async function loadPipelineOptions() {
    try {
        const res = await ucpApi.pipelines();
        pipelineOptions.value = res.items || [];
    }
    catch {
        // 静默失败
    }
}
function openCreate() {
    isEdit.value = false;
    resetForm();
    dialogVisible.value = true;
}
function openEdit(row) {
    isEdit.value = true;
    resetForm();
    Object.assign(form, {
        trigger_code: row.trigger_code,
        trigger_name: row.trigger_name,
        event_source: row.event_source,
        source_system_code: row.source_system_code || '',
        source_resource_id: row.source_resource_id || null,
        event_types: row.event_types,
        pipeline_code: row.pipeline_code,
        filter_rule: row.filter_rule,
        signing_secret: row.signing_secret || '',
        signature_header: row.signature_header || 'X-Signature',
        feishu_verification_token: row.feishu_verification_token || '',
        feishu_encrypt_key: row.feishu_encrypt_key || '',
        run_as_type: row.run_as_type || 'SERVICE_ACCOUNT',
        service_account_code: row.service_account_code || '',
        is_active: row.is_active,
        webhook_path: row.webhook_path || '',
        description: row.description || '',
    });
    filterRuleText.value = row.filter_rule ? JSON.stringify(row.filter_rule, null, 2) : '';
    dialogVisible.value = true;
}
function resetForm() {
    Object.assign(form, {
        trigger_code: '', trigger_name: '', event_source: 'FEISHU',
        source_system_code: '', source_resource_id: null,
        event_types: '', pipeline_code: '', filter_rule: null,
        signing_secret: '', signature_header: 'X-Signature',
        feishu_verification_token: '', feishu_encrypt_key: '',
        run_as_type: 'SERVICE_ACCOUNT', service_account_code: '',
        is_active: true, webhook_path: '', description: '',
    });
    filterRuleText.value = '';
}
async function onSubmit() {
    if (!formRef.value)
        return;
    await formRef.value.validate();
    let filterRule = null;
    if (filterRuleText.value.trim()) {
        try {
            filterRule = JSON.parse(filterRuleText.value);
        }
        catch {
            ElMessage.error('过滤规则必须是合法 JSON');
            return;
        }
    }
    submitting.value = true;
    try {
        const payload = { ...form, filter_rule: filterRule };
        if (isEdit.value) {
            await ucpApi.updateEventTrigger(form.trigger_code, payload);
            ElMessage.success('已更新');
        }
        else {
            await ucpApi.createEventTrigger(payload);
            ElMessage.success('已创建');
        }
        dialogVisible.value = false;
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        submitting.value = false;
    }
}
async function toggleActive(row, v) {
    try {
        await ucpApi.updateEventTrigger(row.trigger_code, { is_active: v });
        ElMessage.success(v ? '已启用' : '已停用');
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
async function onDelete(row) {
    await ElMessageBox.confirm(`确认删除触发器 ${row.trigger_code}？`, '删除确认', { type: 'warning' });
    try {
        await ucpApi.deleteEventTrigger(row.trigger_code);
        ElMessage.success('已删除');
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function testTrigger(row) {
    try {
        const { value: samplePayload } = await ElMessageBox.prompt('输入测试 payload（JSON 格式）', `测试触发器: ${row.trigger_code}`, {
            confirmButtonText: '测试',
            cancelButtonText: '取消',
            inputType: 'textarea',
            inputValue: JSON.stringify({ employee_id: 'TEST001', event_type: 'employee_onboarding' }, null, 2),
        });
        let payload = {};
        try {
            payload = JSON.parse(samplePayload || '{}');
        }
        catch { /* use empty */ }
        const result = await ucpApi.testTrigger(row.trigger_code, { payload });
        if (result.matched) {
            ElMessage.success(`匹配成功！将触发流水线: ${result.pipeline_code}`);
        }
        else {
            ElMessage.warning('未匹配 — 请检查事件类型/来源/过滤条件');
        }
    }
    catch { /* cancelled */ }
}
function sourceTagType(s) {
    if (s === 'FEISHU')
        return 'success';
    if (s === 'BEISEN')
        return 'warning';
    if (s === 'INTERNAL')
        return 'info';
    return '';
}
function formatTime(t) {
    if (!t)
        return '-';
    return formatDateTime(t);
}
onMounted(() => {
    loadList();
    loadPipelineOptions();
    loadSystemsAndResources();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "trigger-config" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_3.slots.default;
var __VLS_3;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    menu: "ucp.events",
    op: "C",
    type: "primary",
    icon: (__VLS_ctx.Plus),
}));
const __VLS_9 = __VLS_8({
    ...{ 'onClick': {} },
    menu: "ucp.events",
    op: "C",
    type: "primary",
    icon: (__VLS_ctx.Plus),
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
let __VLS_11;
let __VLS_12;
let __VLS_13;
const __VLS_14 = {
    onClick: (__VLS_ctx.openCreate)
};
__VLS_10.slots.default;
var __VLS_10;
const __VLS_15 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}));
const __VLS_17 = __VLS_16({
    data: (__VLS_ctx.items),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_18.slots.default;
const __VLS_19 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    prop: "id",
    label: "ID",
    width: "60",
}));
const __VLS_21 = __VLS_20({
    prop: "id",
    label: "ID",
    width: "60",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
const __VLS_23 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    prop: "trigger_code",
    label: "触发器代码",
    minWidth: "160",
}));
const __VLS_25 = __VLS_24({
    prop: "trigger_code",
    label: "触发器代码",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
const __VLS_27 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    prop: "trigger_name",
    label: "名称",
    minWidth: "160",
    showOverflowTooltip: true,
}));
const __VLS_29 = __VLS_28({
    prop: "trigger_name",
    label: "名称",
    minWidth: "160",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
const __VLS_31 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    prop: "event_source",
    label: "事件源",
    width: "100",
}));
const __VLS_33 = __VLS_32({
    prop: "event_source",
    label: "事件源",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_34.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_35 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        size: "small",
        type: (__VLS_ctx.sourceTagType(row.event_source)),
    }));
    const __VLS_37 = __VLS_36({
        size: "small",
        type: (__VLS_ctx.sourceTagType(row.event_source)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_38.slots.default;
    (row.event_source);
    var __VLS_38;
}
var __VLS_34;
const __VLS_39 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    prop: "event_types",
    label: "事件类型",
    minWidth: "200",
    showOverflowTooltip: true,
}));
const __VLS_41 = __VLS_40({
    prop: "event_types",
    label: "事件类型",
    minWidth: "200",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_42.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_42.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (row.event_types);
}
var __VLS_42;
const __VLS_43 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    prop: "pipeline_code",
    label: "目标 Pipeline",
    minWidth: "160",
}));
const __VLS_45 = __VLS_44({
    prop: "pipeline_code",
    label: "目标 Pipeline",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_46.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (row.pipeline_code);
}
var __VLS_46;
const __VLS_47 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    prop: "webhook_path",
    label: "Webhook Path",
    minWidth: "160",
    showOverflowTooltip: true,
}));
const __VLS_49 = __VLS_48({
    prop: "webhook_path",
    label: "Webhook Path",
    minWidth: "160",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_50.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.webhook_path) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.webhook_path);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
}
var __VLS_50;
const __VLS_51 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    prop: "run_as_type",
    label: "执行主体",
    width: "120",
}));
const __VLS_53 = __VLS_52({
    prop: "run_as_type",
    label: "执行主体",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
const __VLS_55 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    label: "启用",
    width: "80",
}));
const __VLS_57 = __VLS_56({
    label: "启用",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_58.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_59 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
        ...{ 'onChange': {} },
        modelValue: (row.is_active),
    }));
    const __VLS_61 = __VLS_60({
        ...{ 'onChange': {} },
        modelValue: (row.is_active),
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    let __VLS_63;
    let __VLS_64;
    let __VLS_65;
    const __VLS_66 = {
        onChange: ((v) => __VLS_ctx.toggleActive(row, v))
    };
    var __VLS_62;
}
var __VLS_58;
const __VLS_67 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    prop: "created_at",
    label: "创建时间",
    width: "170",
}));
const __VLS_69 = __VLS_68({
    prop: "created_at",
    label: "创建时间",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
__VLS_70.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_70.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.created_at));
}
var __VLS_70;
const __VLS_71 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    label: "操作",
    width: "240",
    fixed: "right",
}));
const __VLS_73 = __VLS_72({
    label: "操作",
    width: "240",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_74.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_75 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_77 = __VLS_76({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    let __VLS_79;
    let __VLS_80;
    let __VLS_81;
    const __VLS_82 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_78.slots.default;
    var __VLS_78;
    const __VLS_83 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "success",
    }));
    const __VLS_85 = __VLS_84({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "success",
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    let __VLS_87;
    let __VLS_88;
    let __VLS_89;
    const __VLS_90 = {
        onClick: (...[$event]) => {
            __VLS_ctx.testTrigger(row);
        }
    };
    __VLS_86.slots.default;
    var __VLS_86;
    const __VLS_91 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }));
    const __VLS_93 = __VLS_92({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_92));
    let __VLS_95;
    let __VLS_96;
    let __VLS_97;
    const __VLS_98 = {
        onClick: (...[$event]) => {
            __VLS_ctx.onDelete(row);
        }
    };
    __VLS_94.slots.default;
    var __VLS_94;
}
var __VLS_74;
var __VLS_18;
const __VLS_99 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEdit ? '编辑触发器' : '新建触发器'),
    width: "720px",
    closeOnClickModal: (false),
}));
const __VLS_101 = __VLS_100({
    modelValue: (__VLS_ctx.dialogVisible),
    title: (__VLS_ctx.isEdit ? '编辑触发器' : '新建触发器'),
    width: "720px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
const __VLS_103 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "120px",
    size: "small",
}));
const __VLS_105 = __VLS_104({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "120px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_104));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_107 = {};
__VLS_106.slots.default;
const __VLS_109 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
    label: "触发器代码",
    prop: "trigger_code",
}));
const __VLS_111 = __VLS_110({
    label: "触发器代码",
    prop: "trigger_code",
}, ...__VLS_functionalComponentArgsRest(__VLS_110));
__VLS_112.slots.default;
const __VLS_113 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
    modelValue: (__VLS_ctx.form.trigger_code),
    disabled: (__VLS_ctx.isEdit),
    placeholder: "trigger_offer_change",
}));
const __VLS_115 = __VLS_114({
    modelValue: (__VLS_ctx.form.trigger_code),
    disabled: (__VLS_ctx.isEdit),
    placeholder: "trigger_offer_change",
}, ...__VLS_functionalComponentArgsRest(__VLS_114));
var __VLS_112;
const __VLS_117 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
    label: "触发器名称",
    prop: "trigger_name",
}));
const __VLS_119 = __VLS_118({
    label: "触发器名称",
    prop: "trigger_name",
}, ...__VLS_functionalComponentArgsRest(__VLS_118));
__VLS_120.slots.default;
const __VLS_121 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
    modelValue: (__VLS_ctx.form.trigger_name),
}));
const __VLS_123 = __VLS_122({
    modelValue: (__VLS_ctx.form.trigger_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_122));
var __VLS_120;
const __VLS_125 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
    label: "事件源",
    prop: "event_source",
}));
const __VLS_127 = __VLS_126({
    label: "事件源",
    prop: "event_source",
}, ...__VLS_functionalComponentArgsRest(__VLS_126));
__VLS_128.slots.default;
const __VLS_129 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
    modelValue: (__VLS_ctx.form.event_source),
    ...{ style: {} },
}));
const __VLS_131 = __VLS_130({
    modelValue: (__VLS_ctx.form.event_source),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_130));
__VLS_132.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.SOURCES))) {
    const __VLS_133 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        key: (s),
        label: (s),
        value: (s),
    }));
    const __VLS_135 = __VLS_134({
        key: (s),
        label: (s),
        value: (s),
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
}
var __VLS_132;
var __VLS_128;
const __VLS_137 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
    label: "订阅系统",
}));
const __VLS_139 = __VLS_138({
    label: "订阅系统",
}, ...__VLS_functionalComponentArgsRest(__VLS_138));
__VLS_140.slots.default;
const __VLS_141 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_system_code),
    placeholder: "不选则监听全平台该 event_source 事件",
    filterable: true,
    clearable: true,
    ...{ style: {} },
}));
const __VLS_143 = __VLS_142({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_system_code),
    placeholder: "不选则监听全平台该 event_source 事件",
    filterable: true,
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_142));
let __VLS_145;
let __VLS_146;
let __VLS_147;
const __VLS_148 = {
    onChange: (__VLS_ctx.onSystemChange)
};
__VLS_144.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
    const __VLS_149 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        key: (s.system_code),
        label: (`${s.system_name} (${s.system_code})`),
        value: (s.system_code),
    }));
    const __VLS_151 = __VLS_150({
        key: (s.system_code),
        label: (`${s.system_name} (${s.system_code})`),
        value: (s.system_code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
}
var __VLS_144;
var __VLS_140;
const __VLS_153 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
    label: "订阅资源",
}));
const __VLS_155 = __VLS_154({
    label: "订阅资源",
}, ...__VLS_functionalComponentArgsRest(__VLS_154));
__VLS_156.slots.default;
const __VLS_157 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
    modelValue: (__VLS_ctx.form.source_resource_id),
    placeholder: "不选则订阅该系统下所有资源",
    filterable: true,
    clearable: true,
    disabled: (!__VLS_ctx.form.source_system_code),
    ...{ style: {} },
}));
const __VLS_159 = __VLS_158({
    modelValue: (__VLS_ctx.form.source_resource_id),
    placeholder: "不选则订阅该系统下所有资源",
    filterable: true,
    clearable: true,
    disabled: (!__VLS_ctx.form.source_system_code),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_158));
__VLS_160.slots.default;
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.resourcesOf(__VLS_ctx.form.source_system_code)))) {
    const __VLS_161 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        key: (r.id),
        label: (`${r.resource_name} (${r.resource_code})`),
        value: (r.id),
    }));
    const __VLS_163 = __VLS_162({
        key: (r.id),
        label: (`${r.resource_name} (${r.resource_code})`),
        value: (r.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
}
var __VLS_160;
if (__VLS_ctx.form.source_system_code && __VLS_ctx.resourcesOf(__VLS_ctx.form.source_system_code).length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "form-tip" },
    });
}
var __VLS_156;
const __VLS_165 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
    label: "事件类型",
    prop: "event_types",
}));
const __VLS_167 = __VLS_166({
    label: "事件类型",
    prop: "event_types",
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
__VLS_168.slots.default;
const __VLS_169 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    modelValue: (__VLS_ctx.form.event_types),
    placeholder: "EMPLOYEE_ONBOARDING,OFFER_STATUS_CHANGE,*（逗号分隔，* 表示全匹配）",
}));
const __VLS_171 = __VLS_170({
    modelValue: (__VLS_ctx.form.event_types),
    placeholder: "EMPLOYEE_ONBOARDING,OFFER_STATUS_CHANGE,*（逗号分隔，* 表示全匹配）",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
var __VLS_168;
const __VLS_173 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    label: "目标 Pipeline",
    prop: "pipeline_code",
}));
const __VLS_175 = __VLS_174({
    label: "目标 Pipeline",
    prop: "pipeline_code",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
__VLS_176.slots.default;
const __VLS_177 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
    modelValue: (__VLS_ctx.form.pipeline_code),
    filterable: true,
    placeholder: "选择 pipeline",
    ...{ style: {} },
}));
const __VLS_179 = __VLS_178({
    modelValue: (__VLS_ctx.form.pipeline_code),
    filterable: true,
    placeholder: "选择 pipeline",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_178));
__VLS_180.slots.default;
for (const [p] of __VLS_getVForSourceType((__VLS_ctx.pipelineOptions))) {
    const __VLS_181 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
        key: (p.pipeline_code),
        label: (`${p.pipeline_code} (${p.pipeline_name})`),
        value: (p.pipeline_code),
    }));
    const __VLS_183 = __VLS_182({
        key: (p.pipeline_code),
        label: (`${p.pipeline_code} (${p.pipeline_name})`),
        value: (p.pipeline_code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
}
var __VLS_180;
var __VLS_176;
const __VLS_185 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
    label: "Webhook Path",
}));
const __VLS_187 = __VLS_186({
    label: "Webhook Path",
}, ...__VLS_functionalComponentArgsRest(__VLS_186));
__VLS_188.slots.default;
const __VLS_189 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    modelValue: (__VLS_ctx.form.webhook_path),
    placeholder: "如 feishu/offer-status（外部系统回调路径，唯一）",
}));
const __VLS_191 = __VLS_190({
    modelValue: (__VLS_ctx.form.webhook_path),
    placeholder: "如 feishu/offer-status（外部系统回调路径，唯一）",
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
var __VLS_188;
const __VLS_193 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    label: "执行主体",
}));
const __VLS_195 = __VLS_194({
    label: "执行主体",
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
__VLS_196.slots.default;
const __VLS_197 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
    modelValue: (__VLS_ctx.form.run_as_type),
    ...{ style: {} },
}));
const __VLS_199 = __VLS_198({
    modelValue: (__VLS_ctx.form.run_as_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_198));
__VLS_200.slots.default;
const __VLS_201 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
    label: "SERVICE_ACCOUNT（系统服务账号）",
    value: "SERVICE_ACCOUNT",
}));
const __VLS_203 = __VLS_202({
    label: "SERVICE_ACCOUNT（系统服务账号）",
    value: "SERVICE_ACCOUNT",
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
const __VLS_205 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    label: "TRIGGER_USER（事件触发人）",
    value: "TRIGGER_USER",
}));
const __VLS_207 = __VLS_206({
    label: "TRIGGER_USER（事件触发人）",
    value: "TRIGGER_USER",
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
var __VLS_200;
var __VLS_196;
const __VLS_209 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    label: "服务账号代码",
}));
const __VLS_211 = __VLS_210({
    label: "服务账号代码",
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
__VLS_212.slots.default;
const __VLS_213 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    modelValue: (__VLS_ctx.form.service_account_code),
    placeholder: "可选，服务账号编码",
}));
const __VLS_215 = __VLS_214({
    modelValue: (__VLS_ctx.form.service_account_code),
    placeholder: "可选，服务账号编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
var __VLS_212;
const __VLS_217 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
    label: "签名密钥",
}));
const __VLS_219 = __VLS_218({
    label: "签名密钥",
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
__VLS_220.slots.default;
const __VLS_221 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
    modelValue: (__VLS_ctx.form.signing_secret),
    showPassword: true,
    placeholder: "HMAC-SHA256 签名密钥（可选）",
}));
const __VLS_223 = __VLS_222({
    modelValue: (__VLS_ctx.form.signing_secret),
    showPassword: true,
    placeholder: "HMAC-SHA256 签名密钥（可选）",
}, ...__VLS_functionalComponentArgsRest(__VLS_222));
var __VLS_220;
const __VLS_225 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
    label: "签名头",
}));
const __VLS_227 = __VLS_226({
    label: "签名头",
}, ...__VLS_functionalComponentArgsRest(__VLS_226));
__VLS_228.slots.default;
const __VLS_229 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
    modelValue: (__VLS_ctx.form.signature_header),
    placeholder: "X-Signature",
}));
const __VLS_231 = __VLS_230({
    modelValue: (__VLS_ctx.form.signature_header),
    placeholder: "X-Signature",
}, ...__VLS_functionalComponentArgsRest(__VLS_230));
var __VLS_228;
const __VLS_233 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
    label: "飞书 Token",
}));
const __VLS_235 = __VLS_234({
    label: "飞书 Token",
}, ...__VLS_functionalComponentArgsRest(__VLS_234));
__VLS_236.slots.default;
const __VLS_237 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
    modelValue: (__VLS_ctx.form.feishu_verification_token),
    showPassword: true,
    placeholder: "飞书 VerificationToken",
}));
const __VLS_239 = __VLS_238({
    modelValue: (__VLS_ctx.form.feishu_verification_token),
    showPassword: true,
    placeholder: "飞书 VerificationToken",
}, ...__VLS_functionalComponentArgsRest(__VLS_238));
var __VLS_236;
const __VLS_241 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
    label: "飞书 EncryptKey",
}));
const __VLS_243 = __VLS_242({
    label: "飞书 EncryptKey",
}, ...__VLS_functionalComponentArgsRest(__VLS_242));
__VLS_244.slots.default;
const __VLS_245 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
    modelValue: (__VLS_ctx.form.feishu_encrypt_key),
    showPassword: true,
    placeholder: "飞书 EncryptKey（可选）",
}));
const __VLS_247 = __VLS_246({
    modelValue: (__VLS_ctx.form.feishu_encrypt_key),
    showPassword: true,
    placeholder: "飞书 EncryptKey（可选）",
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
var __VLS_244;
const __VLS_249 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
    label: "过滤规则",
}));
const __VLS_251 = __VLS_250({
    label: "过滤规则",
}, ...__VLS_functionalComponentArgsRest(__VLS_250));
__VLS_252.slots.default;
const __VLS_253 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
    modelValue: (__VLS_ctx.filterRuleText),
    type: "textarea",
    rows: (4),
    placeholder: '{"path": "$.event_type", "op": "eq", "value": "x"}',
}));
const __VLS_255 = __VLS_254({
    modelValue: (__VLS_ctx.filterRuleText),
    type: "textarea",
    rows: (4),
    placeholder: '{"path": "$.event_type", "op": "eq", "value": "x"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_254));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "form-tip" },
});
var __VLS_252;
const __VLS_257 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
    label: "启用",
}));
const __VLS_259 = __VLS_258({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_258));
__VLS_260.slots.default;
const __VLS_261 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
    modelValue: (__VLS_ctx.form.is_active),
}));
const __VLS_263 = __VLS_262({
    modelValue: (__VLS_ctx.form.is_active),
}, ...__VLS_functionalComponentArgsRest(__VLS_262));
var __VLS_260;
const __VLS_265 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
    label: "描述",
}));
const __VLS_267 = __VLS_266({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_266));
__VLS_268.slots.default;
const __VLS_269 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_271 = __VLS_270({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_270));
var __VLS_268;
var __VLS_106;
{
    const { footer: __VLS_thisSlot } = __VLS_102.slots;
    const __VLS_273 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
        ...{ 'onClick': {} },
    }));
    const __VLS_275 = __VLS_274({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_274));
    let __VLS_277;
    let __VLS_278;
    let __VLS_279;
    const __VLS_280 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_276.slots.default;
    var __VLS_276;
    const __VLS_281 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_283 = __VLS_282({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_282));
    let __VLS_285;
    let __VLS_286;
    let __VLS_287;
    const __VLS_288 = {
        onClick: (__VLS_ctx.onSubmit)
    };
    __VLS_284.slots.default;
    var __VLS_284;
}
var __VLS_102;
/** @type {__VLS_StyleScopedClasses['trigger-config']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
// @ts-ignore
var __VLS_108 = __VLS_107;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            PermissionButton: PermissionButton,
            SOURCES: SOURCES,
            items: items,
            loading: loading,
            pipelineOptions: pipelineOptions,
            systems: systems,
            resourcesOf: resourcesOf,
            onSystemChange: onSystemChange,
            dialogVisible: dialogVisible,
            isEdit: isEdit,
            submitting: submitting,
            formRef: formRef,
            form: form,
            filterRuleText: filterRuleText,
            rules: rules,
            loadList: loadList,
            openCreate: openCreate,
            openEdit: openEdit,
            onSubmit: onSubmit,
            toggleActive: toggleActive,
            onDelete: onDelete,
            testTrigger: testTrigger,
            sourceTagType: sourceTagType,
            formatTime: formatTime,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
