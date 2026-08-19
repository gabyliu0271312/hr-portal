/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, reactive, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { changeApi, migrationApi } from '@/api/ucp';
const rows = ref([]);
const loading = ref(false);
const changeTypes = ['RESOURCE', 'CREDENTIAL', 'PIPELINE', 'SYSTEM'];
const changeStatuses = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ROLLED_BACK'];
const riskLevels = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const filters = reactive({ change_type: '', status: '' });
const dialogVisible = ref(false);
const form = reactive({ change_type: 'RESOURCE', change_target_id: 1, change_target_code: '', change_summary: '', risk_level: 'LOW', reason: '' });
const migrationVisible = ref(false);
const migrationLoading = ref(false);
const confirmingResourceId = ref(null);
const migrationPreview = ref(null);
const migrationForm = reactive({ legacyCodes: '', targetCode: '' });
function statusColor(s) { return { DRAFT: 'info', PENDING_APPROVAL: 'warning', APPROVED: 'success', PUBLISHED: 'primary', ROLLED_BACK: 'danger', REJECTED: 'danger' }[s] || 'info'; }
async function load() {
    loading.value = true;
    try {
        const res = await changeApi.list({ change_type: filters.change_type || undefined, status: filters.status || undefined });
        rows.value = res.items;
    }
    catch (e) {
        ElMessage.error('加载失败');
    }
    finally {
        loading.value = false;
    }
}
function openCreate() { Object.assign(form, { change_type: 'RESOURCE', change_target_id: 1, change_target_code: '', change_summary: '', risk_level: 'LOW', reason: '' }); dialogVisible.value = true; }
async function previewMigration() {
    const legacy_adapter_codes = migrationForm.legacyCodes.split(',').map((code) => code.trim()).filter(Boolean);
    if (!legacy_adapter_codes.length || !migrationForm.targetCode.trim()) {
        ElMessage.warning('Enter legacy and target adapter codes');
        return;
    }
    migrationLoading.value = true;
    try {
        migrationPreview.value = await migrationApi.preview({ legacy_adapter_codes, target_adapter_code: migrationForm.targetCode.trim() });
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || 'Migration preview failed');
    }
    finally {
        migrationLoading.value = false;
    }
}
async function confirmMigration(row) {
    confirmingResourceId.value = row.resource_id;
    try {
        await migrationApi.confirm({ resource_id: row.resource_id, target_adapter_code: row.target_adapter_code });
        ElMessage.success('Migration change created; it has not been published');
        await load();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || 'Migration confirmation failed');
    }
    finally {
        confirmingResourceId.value = null;
    }
}
function isMigration(row) { return row.change_type === 'RESOURCE' && String(row.change_summary || '').includes('Adapter') && Boolean(row.after_snapshot?.adapter_code); }
async function publishMigration(changeId) {
    try {
        await migrationApi.publish(changeId);
        ElMessage.success('Migration published');
        await load();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || 'Migration publish failed');
    }
}
async function save() {
    try {
        await changeApi.create({ ...form });
        ElMessage.success('创建成功');
        dialogVisible.value = false;
        load();
    }
    catch (e) {
        ElMessage.error('创建失败');
    }
}
async function publish(row) { if (isMigration(row))
    return publishMigration(row.id); try {
    await changeApi.publish(row.id);
    ElMessage.success('已发布');
    load();
}
catch (e) {
    ElMessage.error('发布失败');
} }
async function rollback(row) { try {
    await changeApi.rollback(row.id);
    ElMessage.success('已回滚');
    load();
}
catch (e) {
    ElMessage.error('回滚失败');
} }
onMounted(() => load());
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "change-page" },
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_7.slots.default;
    var __VLS_7;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "migration-toolbar" },
});
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    type: "warning",
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    type: "warning",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (...[$event]) => {
        __VLS_ctx.migrationVisible = true;
    }
};
__VLS_15.slots.default;
var __VLS_15;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_20 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    inline: true,
    ...{ class: "filter-bar" },
}));
const __VLS_22 = __VLS_21({
    inline: true,
    ...{ class: "filter-bar" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "类型",
}));
const __VLS_26 = __VLS_25({
    label: "类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.filters.change_type),
    clearable: true,
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.filters.change_type),
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.changeTypes))) {
    const __VLS_32 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        key: (t),
        label: (t),
        value: (t),
    }));
    const __VLS_34 = __VLS_33({
        key: (t),
        label: (t),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
}
var __VLS_31;
var __VLS_27;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "状态",
}));
const __VLS_38 = __VLS_37({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
}));
const __VLS_42 = __VLS_41({
    modelValue: (__VLS_ctx.filters.status),
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.changeStatuses))) {
    const __VLS_44 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        key: (s),
        label: (s),
        value: (s),
    }));
    const __VLS_46 = __VLS_45({
        key: (s),
        label: (s),
        value: (s),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
}
var __VLS_43;
var __VLS_39;
const __VLS_48 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ 'onClick': {} },
}));
const __VLS_54 = __VLS_53({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
let __VLS_56;
let __VLS_57;
let __VLS_58;
const __VLS_59 = {
    onClick: (__VLS_ctx.load)
};
__VLS_55.slots.default;
var __VLS_55;
var __VLS_51;
var __VLS_23;
const __VLS_60 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
}));
const __VLS_62 = __VLS_61({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_63.slots.default;
const __VLS_64 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    prop: "change_code",
    label: "编号",
    width: "170",
}));
const __VLS_66 = __VLS_65({
    prop: "change_code",
    label: "编号",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const __VLS_68 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    prop: "change_type",
    label: "类型",
    width: "100",
}));
const __VLS_70 = __VLS_69({
    prop: "change_type",
    label: "类型",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
const __VLS_72 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    prop: "change_target_code",
    label: "目标",
    width: "140",
}));
const __VLS_74 = __VLS_73({
    prop: "change_target_code",
    label: "目标",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
const __VLS_76 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    prop: "change_summary",
    label: "摘要",
    minWidth: "160",
}));
const __VLS_78 = __VLS_77({
    prop: "change_summary",
    label: "摘要",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    prop: "risk_level",
    label: "风险",
    width: "80",
}));
const __VLS_82 = __VLS_81({
    prop: "risk_level",
    label: "风险",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_84 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        type: (row.risk_level === 'HIGH' || row.risk_level === 'CRITICAL' ? 'danger' : row.risk_level === 'MEDIUM' ? 'warning' : 'info'),
        size: "small",
    }));
    const __VLS_86 = __VLS_85({
        type: (row.risk_level === 'HIGH' || row.risk_level === 'CRITICAL' ? 'danger' : row.risk_level === 'MEDIUM' ? 'warning' : 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    (row.risk_level);
    var __VLS_87;
}
var __VLS_83;
const __VLS_88 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    prop: "status",
    label: "状态",
    width: "100",
}));
const __VLS_90 = __VLS_89({
    prop: "status",
    label: "状态",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
__VLS_91.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_91.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_92 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        type: (__VLS_ctx.statusColor(row.status)),
        size: "small",
    }));
    const __VLS_94 = __VLS_93({
        type: (__VLS_ctx.statusColor(row.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    (row.status);
    var __VLS_95;
}
var __VLS_91;
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "操作",
    width: "200",
}));
const __VLS_98 = __VLS_97({
    label: "操作",
    width: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_99.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.status === 'DRAFT' || row.status === 'APPROVED') {
        const __VLS_100 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onClick': {} },
            size: "small",
            type: "success",
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onClick': {} },
            size: "small",
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'DRAFT' || row.status === 'APPROVED'))
                    return;
                __VLS_ctx.publish(row);
            }
        };
        __VLS_103.slots.default;
        var __VLS_103;
    }
    if (row.status === 'PUBLISHED') {
        const __VLS_108 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'PUBLISHED'))
                    return;
                __VLS_ctx.rollback(row);
            }
        };
        __VLS_111.slots.default;
        var __VLS_111;
    }
}
var __VLS_99;
var __VLS_63;
var __VLS_3;
const __VLS_116 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    modelValue: (__VLS_ctx.migrationVisible),
    title: "Adapter migration preview",
    width: "860px",
}));
const __VLS_118 = __VLS_117({
    modelValue: (__VLS_ctx.migrationVisible),
    title: "Adapter migration preview",
    width: "860px",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    type: "warning",
    closable: (false),
    showIcon: true,
}));
const __VLS_122 = __VLS_121({
    type: "warning",
    closable: (false),
    showIcon: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
var __VLS_123;
const __VLS_124 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    model: (__VLS_ctx.migrationForm),
    inline: true,
    ...{ style: {} },
}));
const __VLS_126 = __VLS_125({
    model: (__VLS_ctx.migrationForm),
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "Legacy adapters",
}));
const __VLS_130 = __VLS_129({
    label: "Legacy adapters",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    modelValue: (__VLS_ctx.migrationForm.legacyCodes),
    placeholder: "LEGACY_A, LEGACY_B",
    ...{ style: {} },
}));
const __VLS_134 = __VLS_133({
    modelValue: (__VLS_ctx.migrationForm.legacyCodes),
    placeholder: "LEGACY_A, LEGACY_B",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
var __VLS_131;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "Target adapter",
}));
const __VLS_138 = __VLS_137({
    label: "Target adapter",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.migrationForm.targetCode),
    placeholder: "TARGET_ADAPTER",
    ...{ style: {} },
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.migrationForm.targetCode),
    placeholder: "TARGET_ADAPTER",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_139;
const __VLS_144 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.migrationLoading),
}));
const __VLS_146 = __VLS_145({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.migrationLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
let __VLS_148;
let __VLS_149;
let __VLS_150;
const __VLS_151 = {
    onClick: (__VLS_ctx.previewMigration)
};
__VLS_147.slots.default;
var __VLS_147;
var __VLS_127;
if (__VLS_ctx.migrationPreview && !__VLS_ctx.migrationPreview.items.length) {
    const __VLS_152 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        description: "No matching resources",
    }));
    const __VLS_154 = __VLS_153({
        description: "No matching resources",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
}
if (__VLS_ctx.migrationPreview?.items.length) {
    const __VLS_156 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        data: (__VLS_ctx.migrationPreview.items),
        size: "small",
        border: true,
    }));
    const __VLS_158 = __VLS_157({
        data: (__VLS_ctx.migrationPreview.items),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    const __VLS_160 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        prop: "resource_code",
        label: "Resource",
        minWidth: "150",
    }));
    const __VLS_162 = __VLS_161({
        prop: "resource_code",
        label: "Resource",
        minWidth: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    const __VLS_164 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        prop: "current_adapter_code",
        label: "Current",
        minWidth: "150",
    }));
    const __VLS_166 = __VLS_165({
        prop: "current_adapter_code",
        label: "Current",
        minWidth: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    const __VLS_168 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        prop: "target_adapter_code",
        label: "Target",
        minWidth: "150",
    }));
    const __VLS_170 = __VLS_169({
        prop: "target_adapter_code",
        label: "Target",
        minWidth: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    const __VLS_172 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        label: "Impacted pipelines",
        minWidth: "200",
    }));
    const __VLS_174 = __VLS_173({
        label: "Impacted pipelines",
        minWidth: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    __VLS_175.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_175.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.impacted_pipelines.join(', ') || '-');
    }
    var __VLS_175;
    const __VLS_176 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        label: "Action",
        width: "120",
    }));
    const __VLS_178 = __VLS_177({
        label: "Action",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_179.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_180 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            loading: (__VLS_ctx.confirmingResourceId === row.resource_id),
        }));
        const __VLS_182 = __VLS_181({
            ...{ 'onClick': {} },
            size: "small",
            type: "warning",
            loading: (__VLS_ctx.confirmingResourceId === row.resource_id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        let __VLS_184;
        let __VLS_185;
        let __VLS_186;
        const __VLS_187 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.migrationPreview?.items.length))
                    return;
                __VLS_ctx.confirmMigration(row);
            }
        };
        __VLS_183.slots.default;
        var __VLS_183;
    }
    var __VLS_179;
    var __VLS_159;
}
{
    const { footer: __VLS_thisSlot } = __VLS_119.slots;
    const __VLS_188 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        ...{ 'onClick': {} },
    }));
    const __VLS_190 = __VLS_189({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    let __VLS_192;
    let __VLS_193;
    let __VLS_194;
    const __VLS_195 = {
        onClick: (...[$event]) => {
            __VLS_ctx.migrationVisible = false;
        }
    };
    __VLS_191.slots.default;
    var __VLS_191;
}
var __VLS_119;
const __VLS_196 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
    modelValue: (__VLS_ctx.dialogVisible),
    title: "新建变更单",
    width: "450px",
}));
const __VLS_198 = __VLS_197({
    modelValue: (__VLS_ctx.dialogVisible),
    title: "新建变更单",
    width: "450px",
}, ...__VLS_functionalComponentArgsRest(__VLS_197));
__VLS_199.slots.default;
const __VLS_200 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    model: (__VLS_ctx.form),
    labelWidth: "80px",
}));
const __VLS_202 = __VLS_201({
    model: (__VLS_ctx.form),
    labelWidth: "80px",
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
const __VLS_204 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    label: "类型",
}));
const __VLS_206 = __VLS_205({
    label: "类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
__VLS_207.slots.default;
const __VLS_208 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    modelValue: (__VLS_ctx.form.change_type),
}));
const __VLS_210 = __VLS_209({
    modelValue: (__VLS_ctx.form.change_type),
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
__VLS_211.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.changeTypes))) {
    const __VLS_212 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        key: (t),
        label: (t),
        value: (t),
    }));
    const __VLS_214 = __VLS_213({
        key: (t),
        label: (t),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
}
var __VLS_211;
var __VLS_207;
const __VLS_216 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    label: "目标 ID",
}));
const __VLS_218 = __VLS_217({
    label: "目标 ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
__VLS_219.slots.default;
const __VLS_220 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    modelValue: (__VLS_ctx.form.change_target_id),
    min: (1),
}));
const __VLS_222 = __VLS_221({
    modelValue: (__VLS_ctx.form.change_target_id),
    min: (1),
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
var __VLS_219;
const __VLS_224 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
    label: "目标编码",
}));
const __VLS_226 = __VLS_225({
    label: "目标编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_225));
__VLS_227.slots.default;
const __VLS_228 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    modelValue: (__VLS_ctx.form.change_target_code),
}));
const __VLS_230 = __VLS_229({
    modelValue: (__VLS_ctx.form.change_target_code),
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
var __VLS_227;
const __VLS_232 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    label: "摘要",
}));
const __VLS_234 = __VLS_233({
    label: "摘要",
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
__VLS_235.slots.default;
const __VLS_236 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
    modelValue: (__VLS_ctx.form.change_summary),
}));
const __VLS_238 = __VLS_237({
    modelValue: (__VLS_ctx.form.change_summary),
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
var __VLS_235;
const __VLS_240 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    label: "风险",
}));
const __VLS_242 = __VLS_241({
    label: "风险",
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_243.slots.default;
const __VLS_244 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
    modelValue: (__VLS_ctx.form.risk_level),
}));
const __VLS_246 = __VLS_245({
    modelValue: (__VLS_ctx.form.risk_level),
}, ...__VLS_functionalComponentArgsRest(__VLS_245));
__VLS_247.slots.default;
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.riskLevels))) {
    const __VLS_248 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        key: (r),
        label: (r),
        value: (r),
    }));
    const __VLS_250 = __VLS_249({
        key: (r),
        label: (r),
        value: (r),
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
}
var __VLS_247;
var __VLS_243;
const __VLS_252 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
    label: "原因",
}));
const __VLS_254 = __VLS_253({
    label: "原因",
}, ...__VLS_functionalComponentArgsRest(__VLS_253));
__VLS_255.slots.default;
const __VLS_256 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
    modelValue: (__VLS_ctx.form.reason),
    type: "textarea",
}));
const __VLS_258 = __VLS_257({
    modelValue: (__VLS_ctx.form.reason),
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_257));
var __VLS_255;
var __VLS_203;
{
    const { footer: __VLS_thisSlot } = __VLS_199.slots;
    const __VLS_260 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        ...{ 'onClick': {} },
    }));
    const __VLS_262 = __VLS_261({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    let __VLS_264;
    let __VLS_265;
    let __VLS_266;
    const __VLS_267 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_263.slots.default;
    var __VLS_263;
    const __VLS_268 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_270 = __VLS_269({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
    let __VLS_272;
    let __VLS_273;
    let __VLS_274;
    const __VLS_275 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_271.slots.default;
    var __VLS_271;
}
var __VLS_199;
/** @type {__VLS_StyleScopedClasses['change-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['migration-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            rows: rows,
            loading: loading,
            changeTypes: changeTypes,
            changeStatuses: changeStatuses,
            riskLevels: riskLevels,
            filters: filters,
            dialogVisible: dialogVisible,
            form: form,
            migrationVisible: migrationVisible,
            migrationLoading: migrationLoading,
            confirmingResourceId: confirmingResourceId,
            migrationPreview: migrationPreview,
            migrationForm: migrationForm,
            statusColor: statusColor,
            load: load,
            openCreate: openCreate,
            previewMigration: previewMigration,
            confirmMigration: confirmMigration,
            save: save,
            publish: publish,
            rollback: rollback,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
