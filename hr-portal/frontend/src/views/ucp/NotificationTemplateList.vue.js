/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
import PermissionButton from '@/components/PermissionButton.vue';
const templates = ref([]);
const loading = ref(false);
const saving = ref(false);
const filterKeyword = ref('');
const filterScene = ref('');
const filterActive = ref('');
const editDialogVisible = ref(false);
const editingId = ref(null);
const editFormRef = ref();
const editForm = ref({
    template_code: '',
    template_name: '',
    description: '',
    trigger_scene: 'on_success',
    channel: 'feishu',
    message_format: 'markdown',
    title_template: '',
    content_template: '',
    receivers: [],
    variable_schema: {},
    is_active: 1,
    is_active_bool: 1,
});
const receiversText = ref('');
const variableSchemaText = ref('');
const formRules = {
    template_code: [{ required: true, message: '请输入模板编码', trigger: 'blur' }],
    template_name: [{ required: true, message: '请输入模板名称', trigger: 'blur' }],
    trigger_scene: [{ required: true, message: '请选择触发场景', trigger: 'change' }],
    title_template: [{ required: true, message: '请输入标题模板', trigger: 'blur' }],
    content_template: [{ required: true, message: '请输入正文模板', trigger: 'blur' }],
};
const previewDialogVisible = ref(false);
const previewResult = ref(null);
const filteredTemplates = computed(() => {
    return templates.value;
});
async function loadTemplates() {
    loading.value = true;
    try {
        const res = await ucpApi.listNotificationTemplates({
            keyword: filterKeyword.value || undefined,
            trigger_scene: filterScene.value || undefined,
            is_active: filterActive.value === '' ? undefined : filterActive.value,
        });
        templates.value = res.items || [];
    }
    catch (e) {
        ElMessage.error(`加载模板列表失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
    finally {
        loading.value = false;
    }
}
function sceneTagType(scene) {
    if (scene === 'on_success')
        return 'success';
    if (scene === 'on_failure')
        return 'danger';
    if (scene === 'on_partial_success')
        return 'warning';
    return 'info';
}
function formatTime(iso) {
    if (!iso)
        return '-';
    return iso.replace('T', ' ').slice(0, 19);
}
function openCreateDialog() {
    editingId.value = null;
    editForm.value = {
        template_code: '',
        template_name: '',
        description: '',
        trigger_scene: 'on_success',
        channel: 'feishu',
        message_format: 'markdown',
        title_template: '',
        content_template: '',
        receivers: [],
        variable_schema: {},
        is_active: 1,
        is_active_bool: 1,
    };
    receiversText.value = '';
    variableSchemaText.value = '';
    editDialogVisible.value = true;
}
function openEditDialog(row) {
    editingId.value = row.id;
    editForm.value = {
        template_code: row.template_code,
        template_name: row.template_name,
        description: row.description || '',
        trigger_scene: row.trigger_scene,
        channel: row.channel,
        message_format: row.message_format,
        title_template: row.title_template,
        content_template: row.content_template,
        receivers: row.receivers || [],
        variable_schema: row.variable_schema || {},
        is_active: row.is_active,
        is_active_bool: row.is_active,
    };
    receiversText.value = (row.receivers || []).join('\n');
    variableSchemaText.value = Object.entries(row.variable_schema || {})
        .map(([k, v]) => `${k} = ${v}`)
        .join('\n');
    editDialogVisible.value = true;
}
function parseReceivers(text) {
    return text
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
}
function parseVariableSchema(text) {
    const out = {};
    text.split('\n').forEach((line) => {
        const m = line.match(/^\s*([\w_]+)\s*=\s*(.+)$/);
        if (m) {
            out[m[1]] = m[2].trim();
        }
    });
    return out;
}
async function handleSave() {
    try {
        await editFormRef.value.validate();
    }
    catch {
        return;
    }
    saving.value = true;
    try {
        const payload = {
            template_code: editForm.value.template_code,
            template_name: editForm.value.template_name,
            description: editForm.value.description || undefined,
            trigger_scene: editForm.value.trigger_scene,
            channel: editForm.value.channel,
            message_format: editForm.value.message_format,
            title_template: editForm.value.title_template,
            content_template: editForm.value.content_template,
            receivers: parseReceivers(receiversText.value),
            variable_schema: parseVariableSchema(variableSchemaText.value),
            is_active: editForm.value.is_active_bool,
        };
        if (editingId.value) {
            await ucpApi.updateNotificationTemplate(editingId.value, payload);
        }
        else {
            await ucpApi.createNotificationTemplate(payload);
        }
        ElMessage.success('保存成功');
        editDialogVisible.value = false;
        await loadTemplates();
    }
    catch (e) {
        ElMessage.error(`保存失败: ${e?.response?.data?.detail?.message || e?.response?.data?.detail || e?.message || e}`);
    }
    finally {
        saving.value = false;
    }
}
async function handleToggle(row) {
    try {
        await ucpApi.toggleNotificationTemplate(row.id);
        ElMessage.success(`已${row.is_active ? '停用' : '启用'}`);
        await loadTemplates();
    }
    catch (e) {
        ElMessage.error(`操作失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
async function handleDelete(row) {
    try {
        await ElMessageBox.confirm(`确认删除模板「${row.template_name}」？`, '删除确认', { type: 'warning' });
        await ucpApi.deleteNotificationTemplate(row.id);
        ElMessage.success('已删除');
        await loadTemplates();
    }
    catch (e) {
        if (e === 'cancel')
            return;
        ElMessage.error(`删除失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
async function openPreviewDialog(row) {
    try {
        const res = await ucpApi.previewNotificationTemplate(row.id);
        previewResult.value = res;
        previewDialogVisible.value = true;
    }
    catch (e) {
        ElMessage.error(`预览失败: ${e?.response?.data?.detail || e?.message || e}`);
    }
}
onMounted(() => {
    loadTemplates();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "notification-template-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
const __VLS_0 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "搜索模板编码/名称",
    clearable: true,
    ...{ style: {} },
    prefixIcon: (__VLS_ctx.Search),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.filterKeyword),
    placeholder: "搜索模板编码/名称",
    clearable: true,
    ...{ style: {} },
    prefixIcon: (__VLS_ctx.Search),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const __VLS_4 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    modelValue: (__VLS_ctx.filterScene),
    placeholder: "触发场景",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_6 = __VLS_5({
    modelValue: (__VLS_ctx.filterScene),
    placeholder: "触发场景",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
for (const [label, value] of __VLS_getVForSourceType((__VLS_ctx.ucpApi.NOTIFICATION_SCENE_LABELS))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (value),
        label: (label),
        value: (value),
    }));
    const __VLS_10 = __VLS_9({
        key: (value),
        label: (label),
        value: (value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
var __VLS_7;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    modelValue: (__VLS_ctx.filterActive),
    placeholder: "启用状态",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    modelValue: (__VLS_ctx.filterActive),
    placeholder: "启用状态",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "已启用",
    value: (1),
}));
const __VLS_18 = __VLS_17({
    label: "已启用",
    value: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "已停用",
    value: (0),
}));
const __VLS_22 = __VLS_21({
    label: "已停用",
    value: (0),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_15;
const __VLS_24 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}));
const __VLS_26 = __VLS_25({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Refresh),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
let __VLS_28;
let __VLS_29;
let __VLS_30;
const __VLS_31 = {
    onClick: (__VLS_ctx.loadTemplates)
};
__VLS_27.slots.default;
var __VLS_27;
/** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
    menu: "ucp.systems",
    op: "C",
}));
const __VLS_33 = __VLS_32({
    ...{ 'onClick': {} },
    type: "primary",
    icon: (__VLS_ctx.Plus),
    menu: "ucp.systems",
    op: "C",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
let __VLS_35;
let __VLS_36;
let __VLS_37;
const __VLS_38 = {
    onClick: (__VLS_ctx.openCreateDialog)
};
__VLS_34.slots.default;
var __VLS_34;
const __VLS_39 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    data: (__VLS_ctx.filteredTemplates),
    stripe: true,
    size: "small",
}));
const __VLS_41 = __VLS_40({
    data: (__VLS_ctx.filteredTemplates),
    stripe: true,
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_42.slots.default;
const __VLS_43 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    prop: "template_code",
    label: "模板编码",
    minWidth: "160",
}));
const __VLS_45 = __VLS_44({
    prop: "template_code",
    label: "模板编码",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
const __VLS_47 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    prop: "template_name",
    label: "模板名称",
    minWidth: "160",
}));
const __VLS_49 = __VLS_48({
    prop: "template_name",
    label: "模板名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
const __VLS_51 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    label: "触发场景",
    width: "120",
}));
const __VLS_53 = __VLS_52({
    label: "触发场景",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
__VLS_54.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_54.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_55 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
        size: "small",
        type: (__VLS_ctx.sceneTagType(row.trigger_scene)),
    }));
    const __VLS_57 = __VLS_56({
        size: "small",
        type: (__VLS_ctx.sceneTagType(row.trigger_scene)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_56));
    __VLS_58.slots.default;
    (row.trigger_scene_label || row.trigger_scene);
    var __VLS_58;
}
var __VLS_54;
const __VLS_59 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    label: "渠道",
    width: "100",
}));
const __VLS_61 = __VLS_60({
    label: "渠道",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_62.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_63 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
        size: "small",
        effect: "plain",
    }));
    const __VLS_65 = __VLS_64({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    __VLS_66.slots.default;
    (row.channel);
    var __VLS_66;
}
var __VLS_62;
const __VLS_67 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    prop: "title_template",
    label: "标题模板",
    minWidth: "200",
    showOverflowTooltip: true,
}));
const __VLS_69 = __VLS_68({
    prop: "title_template",
    label: "标题模板",
    minWidth: "200",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
const __VLS_71 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    label: "启用",
    width: "80",
    align: "center",
}));
const __VLS_73 = __VLS_72({
    label: "启用",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_74.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_75 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        type: (row.is_active ? 'success' : 'info'),
        size: "small",
    }));
    const __VLS_77 = __VLS_76({
        type: (row.is_active ? 'success' : 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    __VLS_78.slots.default;
    (row.is_active ? '已启用' : '已停用');
    var __VLS_78;
}
var __VLS_74;
const __VLS_79 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    prop: "updated_at",
    label: "更新时间",
    width: "180",
}));
const __VLS_81 = __VLS_80({
    prop: "updated_at",
    label: "更新时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_82.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatTime(row.updated_at));
}
var __VLS_82;
const __VLS_83 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    label: "操作",
    width: "280",
    fixed: "right",
}));
const __VLS_85 = __VLS_84({
    label: "操作",
    width: "280",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_86.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_87 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }));
    const __VLS_89 = __VLS_88({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_88));
    let __VLS_91;
    let __VLS_92;
    let __VLS_93;
    const __VLS_94 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openPreviewDialog(row);
        }
    };
    __VLS_90.slots.default;
    var __VLS_90;
    const __VLS_95 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }));
    const __VLS_97 = __VLS_96({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    let __VLS_99;
    let __VLS_100;
    let __VLS_101;
    const __VLS_102 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEditDialog(row);
        }
    };
    __VLS_98.slots.default;
    var __VLS_98;
    const __VLS_103 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onClick': {} },
        link: true,
        type: "warning",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleToggle(row);
        }
    };
    __VLS_106.slots.default;
    (row.is_active ? '停用' : '启用');
    var __VLS_106;
    const __VLS_111 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        size: "small",
    }));
    const __VLS_113 = __VLS_112({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_112));
    let __VLS_115;
    let __VLS_116;
    let __VLS_117;
    const __VLS_118 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleDelete(row);
        }
    };
    __VLS_114.slots.default;
    var __VLS_114;
}
var __VLS_86;
var __VLS_42;
const __VLS_119 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
    modelValue: (__VLS_ctx.editDialogVisible),
    title: (__VLS_ctx.editingId ? '编辑通知模板' : '新建通知模板'),
    width: "780",
    closeOnClickModal: (false),
}));
const __VLS_121 = __VLS_120({
    modelValue: (__VLS_ctx.editDialogVisible),
    title: (__VLS_ctx.editingId ? '编辑通知模板' : '新建通知模板'),
    width: "780",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_120));
__VLS_122.slots.default;
const __VLS_123 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
    model: (__VLS_ctx.editForm),
    rules: (__VLS_ctx.formRules),
    ref: "editFormRef",
    labelWidth: "120px",
    size: "default",
}));
const __VLS_125 = __VLS_124({
    model: (__VLS_ctx.editForm),
    rules: (__VLS_ctx.formRules),
    ref: "editFormRef",
    labelWidth: "120px",
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_124));
/** @type {typeof __VLS_ctx.editFormRef} */ ;
var __VLS_127 = {};
__VLS_126.slots.default;
const __VLS_129 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
    label: "模板编码",
    prop: "template_code",
    required: (!__VLS_ctx.editingId),
}));
const __VLS_131 = __VLS_130({
    label: "模板编码",
    prop: "template_code",
    required: (!__VLS_ctx.editingId),
}, ...__VLS_functionalComponentArgsRest(__VLS_130));
__VLS_132.slots.default;
const __VLS_133 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
    modelValue: (__VLS_ctx.editForm.template_code),
    disabled: (!!__VLS_ctx.editingId),
    placeholder: "例如：pipeline_success_default",
    maxlength: "64",
}));
const __VLS_135 = __VLS_134({
    modelValue: (__VLS_ctx.editForm.template_code),
    disabled: (!!__VLS_ctx.editingId),
    placeholder: "例如：pipeline_success_default",
    maxlength: "64",
}, ...__VLS_functionalComponentArgsRest(__VLS_134));
var __VLS_132;
const __VLS_137 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
    label: "模板名称",
    prop: "template_name",
    required: true,
}));
const __VLS_139 = __VLS_138({
    label: "模板名称",
    prop: "template_name",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_138));
__VLS_140.slots.default;
const __VLS_141 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
    modelValue: (__VLS_ctx.editForm.template_name),
    maxlength: "128",
}));
const __VLS_143 = __VLS_142({
    modelValue: (__VLS_ctx.editForm.template_name),
    maxlength: "128",
}, ...__VLS_functionalComponentArgsRest(__VLS_142));
var __VLS_140;
const __VLS_145 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
    label: "触发场景",
    prop: "trigger_scene",
    required: true,
}));
const __VLS_147 = __VLS_146({
    label: "触发场景",
    prop: "trigger_scene",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_146));
__VLS_148.slots.default;
const __VLS_149 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
    modelValue: (__VLS_ctx.editForm.trigger_scene),
    ...{ style: {} },
}));
const __VLS_151 = __VLS_150({
    modelValue: (__VLS_ctx.editForm.trigger_scene),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_150));
__VLS_152.slots.default;
for (const [label, value] of __VLS_getVForSourceType((__VLS_ctx.ucpApi.NOTIFICATION_SCENE_LABELS))) {
    const __VLS_153 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        key: (value),
        label: (label),
        value: (value),
    }));
    const __VLS_155 = __VLS_154({
        key: (value),
        label: (label),
        value: (value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
}
var __VLS_152;
var __VLS_148;
const __VLS_157 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
    label: "渠道",
    prop: "channel",
}));
const __VLS_159 = __VLS_158({
    label: "渠道",
    prop: "channel",
}, ...__VLS_functionalComponentArgsRest(__VLS_158));
__VLS_160.slots.default;
const __VLS_161 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
    modelValue: (__VLS_ctx.editForm.channel),
}));
const __VLS_163 = __VLS_162({
    modelValue: (__VLS_ctx.editForm.channel),
}, ...__VLS_functionalComponentArgsRest(__VLS_162));
__VLS_164.slots.default;
const __VLS_165 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
    value: "feishu",
}));
const __VLS_167 = __VLS_166({
    value: "feishu",
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
__VLS_168.slots.default;
var __VLS_168;
const __VLS_169 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    value: "email",
}));
const __VLS_171 = __VLS_170({
    value: "email",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
__VLS_172.slots.default;
var __VLS_172;
var __VLS_164;
var __VLS_160;
const __VLS_173 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    label: "消息格式",
    prop: "message_format",
}));
const __VLS_175 = __VLS_174({
    label: "消息格式",
    prop: "message_format",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
__VLS_176.slots.default;
const __VLS_177 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
    modelValue: (__VLS_ctx.editForm.message_format),
}));
const __VLS_179 = __VLS_178({
    modelValue: (__VLS_ctx.editForm.message_format),
}, ...__VLS_functionalComponentArgsRest(__VLS_178));
__VLS_180.slots.default;
const __VLS_181 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
    value: "markdown",
}));
const __VLS_183 = __VLS_182({
    value: "markdown",
}, ...__VLS_functionalComponentArgsRest(__VLS_182));
__VLS_184.slots.default;
var __VLS_184;
const __VLS_185 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
    value: "text",
}));
const __VLS_187 = __VLS_186({
    value: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_186));
__VLS_188.slots.default;
var __VLS_188;
var __VLS_180;
var __VLS_176;
const __VLS_189 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    label: "标题模板",
    prop: "title_template",
    required: true,
}));
const __VLS_191 = __VLS_190({
    label: "标题模板",
    prop: "title_template",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
__VLS_192.slots.default;
const __VLS_193 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    modelValue: (__VLS_ctx.editForm.title_template),
    placeholder: "支持 {{var}} 占位符",
    maxlength: "255",
}));
const __VLS_195 = __VLS_194({
    modelValue: (__VLS_ctx.editForm.title_template),
    placeholder: "支持 {{var}} 占位符",
    maxlength: "255",
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
var __VLS_192;
const __VLS_197 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
    label: "正文模板",
    prop: "content_template",
    required: true,
}));
const __VLS_199 = __VLS_198({
    label: "正文模板",
    prop: "content_template",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_198));
__VLS_200.slots.default;
const __VLS_201 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
    modelValue: (__VLS_ctx.editForm.content_template),
    type: "textarea",
    rows: (6),
    placeholder: "支持 {{var}} 占位符，可使用多行 markdown",
}));
const __VLS_203 = __VLS_202({
    modelValue: (__VLS_ctx.editForm.content_template),
    type: "textarea",
    rows: (6),
    placeholder: "支持 {{var}} 占位符，可使用多行 markdown",
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
var __VLS_200;
const __VLS_205 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    label: "接收人规则",
    prop: "receivers",
}));
const __VLS_207 = __VLS_206({
    label: "接收人规则",
    prop: "receivers",
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
__VLS_208.slots.default;
const __VLS_209 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    modelValue: (__VLS_ctx.receiversText),
    type: "textarea",
    rows: (3),
    placeholder: '每行一条，例如：config_owner、custom:open_id_xxx、pipeline_owner',
}));
const __VLS_211 = __VLS_210({
    modelValue: (__VLS_ctx.receiversText),
    type: "textarea",
    rows: (3),
    placeholder: '每行一条，例如：config_owner、custom:open_id_xxx、pipeline_owner',
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
var __VLS_208;
const __VLS_213 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    label: "是否启用",
}));
const __VLS_215 = __VLS_214({
    label: "是否启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
__VLS_216.slots.default;
const __VLS_217 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
    modelValue: (__VLS_ctx.editForm.is_active_bool),
    activeValue: (1),
    inactiveValue: (0),
}));
const __VLS_219 = __VLS_218({
    modelValue: (__VLS_ctx.editForm.is_active_bool),
    activeValue: (1),
    inactiveValue: (0),
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
var __VLS_216;
const __VLS_221 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
    label: "变量说明",
}));
const __VLS_223 = __VLS_222({
    label: "变量说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_222));
__VLS_224.slots.default;
const __VLS_225 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
    modelValue: (__VLS_ctx.variableSchemaText),
    type: "textarea",
    rows: (3),
    placeholder: "每行 key = 描述，例如：pending_count = 待入职人数",
}));
const __VLS_227 = __VLS_226({
    modelValue: (__VLS_ctx.variableSchemaText),
    type: "textarea",
    rows: (3),
    placeholder: "每行 key = 描述，例如：pending_count = 待入职人数",
}, ...__VLS_functionalComponentArgsRest(__VLS_226));
const __VLS_229 = {}.ElText;
/** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
// @ts-ignore
const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
    size: "small",
    type: "info",
}));
const __VLS_231 = __VLS_230({
    size: "small",
    type: "info",
}, ...__VLS_functionalComponentArgsRest(__VLS_230));
__VLS_232.slots.default;
var __VLS_232;
var __VLS_224;
var __VLS_126;
{
    const { footer: __VLS_thisSlot } = __VLS_122.slots;
    const __VLS_233 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
        ...{ 'onClick': {} },
    }));
    const __VLS_235 = __VLS_234({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_234));
    let __VLS_237;
    let __VLS_238;
    let __VLS_239;
    const __VLS_240 = {
        onClick: (...[$event]) => {
            __VLS_ctx.editDialogVisible = false;
        }
    };
    __VLS_236.slots.default;
    var __VLS_236;
    const __VLS_241 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_243 = __VLS_242({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    let __VLS_245;
    let __VLS_246;
    let __VLS_247;
    const __VLS_248 = {
        onClick: (__VLS_ctx.handleSave)
    };
    __VLS_244.slots.default;
    var __VLS_244;
}
var __VLS_122;
const __VLS_249 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
    modelValue: (__VLS_ctx.previewDialogVisible),
    title: (`模板预览 - ${__VLS_ctx.previewResult?.template_code || ''}`),
    width: "780",
    closeOnClickModal: (false),
}));
const __VLS_251 = __VLS_250({
    modelValue: (__VLS_ctx.previewDialogVisible),
    title: (`模板预览 - ${__VLS_ctx.previewResult?.template_code || ''}`),
    width: "780",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_250));
__VLS_252.slots.default;
if (__VLS_ctx.previewResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "preview-content" },
    });
    const __VLS_253 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
        title: (`渲染结果`),
        type: "info",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_255 = __VLS_254({
        title: (`渲染结果`),
        type: "info",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_254));
    const __VLS_257 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
        column: (1),
        border: true,
        size: "small",
        ...{ class: "mt-12" },
    }));
    const __VLS_259 = __VLS_258({
        column: (1),
        border: true,
        size: "small",
        ...{ class: "mt-12" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_258));
    __VLS_260.slots.default;
    const __VLS_261 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
        label: "标题（渲染后）",
    }));
    const __VLS_263 = __VLS_262({
        label: "标题（渲染后）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
    __VLS_264.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "rendered" },
    });
    (__VLS_ctx.previewResult.title_rendered);
    var __VLS_264;
    const __VLS_265 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
        label: "正文（渲染后）",
    }));
    const __VLS_267 = __VLS_266({
        label: "正文（渲染后）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_266));
    __VLS_268.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "rendered" },
    });
    (__VLS_ctx.previewResult.content_rendered);
    var __VLS_268;
    var __VLS_260;
    const __VLS_269 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
        contentPosition: "left",
    }));
    const __VLS_271 = __VLS_270({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_270));
    __VLS_272.slots.default;
    var __VLS_272;
    const __VLS_273 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
        column: (1),
        border: true,
        size: "small",
    }));
    const __VLS_275 = __VLS_274({
        column: (1),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_274));
    __VLS_276.slots.default;
    const __VLS_277 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
        label: "使用的变量",
    }));
    const __VLS_279 = __VLS_278({
        label: "使用的变量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_278));
    __VLS_280.slots.default;
    for (const [v] of __VLS_getVForSourceType((__VLS_ctx.previewResult.variables_used))) {
        const __VLS_281 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
            key: (v),
            size: "small",
            effect: "plain",
            ...{ class: "var-tag" },
        }));
        const __VLS_283 = __VLS_282({
            key: (v),
            size: "small",
            effect: "plain",
            ...{ class: "var-tag" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_282));
        __VLS_284.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (v);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        var __VLS_284;
    }
    if (__VLS_ctx.previewResult.variables_used.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty" },
        });
    }
    var __VLS_280;
    if (__VLS_ctx.previewResult.missing_variables.length) {
        const __VLS_285 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
            label: "未提供的变量",
        }));
        const __VLS_287 = __VLS_286({
            label: "未提供的变量",
        }, ...__VLS_functionalComponentArgsRest(__VLS_286));
        __VLS_288.slots.default;
        for (const [v] of __VLS_getVForSourceType((__VLS_ctx.previewResult.missing_variables))) {
            const __VLS_289 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
                key: (v),
                type: "warning",
                size: "small",
                effect: "plain",
                ...{ class: "var-tag" },
            }));
            const __VLS_291 = __VLS_290({
                key: (v),
                type: "warning",
                size: "small",
                effect: "plain",
                ...{ class: "var-tag" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_290));
            __VLS_292.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (v);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            var __VLS_292;
        }
        var __VLS_288;
    }
    var __VLS_276;
}
{
    const { footer: __VLS_thisSlot } = __VLS_252.slots;
    const __VLS_293 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
        ...{ 'onClick': {} },
    }));
    const __VLS_295 = __VLS_294({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_294));
    let __VLS_297;
    let __VLS_298;
    let __VLS_299;
    const __VLS_300 = {
        onClick: (...[$event]) => {
            __VLS_ctx.previewDialogVisible = false;
        }
    };
    __VLS_296.slots.default;
    var __VLS_296;
}
var __VLS_252;
/** @type {__VLS_StyleScopedClasses['notification-template-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['desc']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-12']} */ ;
/** @type {__VLS_StyleScopedClasses['rendered']} */ ;
/** @type {__VLS_StyleScopedClasses['rendered']} */ ;
/** @type {__VLS_StyleScopedClasses['var-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['var-tag']} */ ;
// @ts-ignore
var __VLS_128 = __VLS_127;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            Search: Search,
            ucpApi: ucpApi,
            PermissionButton: PermissionButton,
            loading: loading,
            saving: saving,
            filterKeyword: filterKeyword,
            filterScene: filterScene,
            filterActive: filterActive,
            editDialogVisible: editDialogVisible,
            editingId: editingId,
            editFormRef: editFormRef,
            editForm: editForm,
            receiversText: receiversText,
            variableSchemaText: variableSchemaText,
            formRules: formRules,
            previewDialogVisible: previewDialogVisible,
            previewResult: previewResult,
            filteredTemplates: filteredTemplates,
            loadTemplates: loadTemplates,
            sceneTagType: sceneTagType,
            formatTime: formatTime,
            openCreateDialog: openCreateDialog,
            openEditDialog: openEditDialog,
            handleSave: handleSave,
            handleToggle: handleToggle,
            handleDelete: handleDelete,
            openPreviewDialog: openPreviewDialog,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
