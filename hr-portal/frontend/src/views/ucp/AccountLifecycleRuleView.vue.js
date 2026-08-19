/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PermissionButton from '@/components/PermissionButton.vue';
import { accountLifecycleApi } from '@/api/ucp';
const rules = ref([]), jobs = ref([]), loading = ref(false), visible = ref(false);
const form = ref({ rule_code: '', rule_name: '', internal_event_type: 'EMPLOYEE_OFFBOARD', target_system_code: 'DIDI', target_resource_code: 'DIDI_ACCOUNT', lifecycle_action: 'DISABLE', retention_days: 30, approval_required: false, employeePath: '$.employee.employee_id' });
async function load() { loading.value = true; try {
    const [r, j] = await Promise.all([accountLifecycleApi.listRules(), accountLifecycleApi.listJobs()]);
    rules.value = r.items;
    jobs.value = j.items;
}
catch (e) {
    ElMessage.error(e?.response?.data?.detail || '加载失败');
}
finally {
    loading.value = false;
} }
function openCreate() { form.value = { ...form.value, rule_code: '', rule_name: '' }; visible.value = true; }
async function create() { try {
    await accountLifecycleApi.createRule({ ...form.value, field_mapping: { employee_id: form.value.employeePath } });
    visible.value = false;
    ElMessage.success('已保存');
    load();
}
catch (e) {
    ElMessage.error(e?.response?.data?.detail || '保存失败');
} }
async function toggle(row) { await accountLifecycleApi.setRuleEnabled(row.rule_code, !row.status); ElMessage.success('状态已更新'); load(); }
async function retry(row) { await accountLifecycleApi.retryJob(row.job_code); ElMessage.success('已重试'); load(); }
async function cancel(row) { try {
    await ElMessageBox.confirm('Cancel this unexecuted lifecycle task?', 'Cancel task', { type: 'warning' });
    await accountLifecycleApi.cancelJob(row.job_code);
    ElMessage.success('Task cancelled');
    load();
}
catch (e) {
    if (e !== 'cancel')
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Cancel failed');
} }
async function reschedule(row) { try {
    const r = await ElMessageBox.prompt('New execution time (ISO-8601, e.g. 2026-07-30T09:00:00+08:00)', 'Reschedule task', { inputValue: row.scheduled_at || '', inputPattern: /^\d{4}-\d{2}-\d{2}T/, inputErrorMessage: 'Enter an ISO-8601 datetime' });
    await accountLifecycleApi.rescheduleJob(row.job_code, r.value);
    ElMessage.success('Task rescheduled');
    load();
}
catch (e) {
    if (e !== 'cancel')
        ElMessage.error(e?.response?.data?.detail?.message || e?.response?.data?.detail || 'Reschedule failed');
} }
async function runDry(row) { try {
    const r = await accountLifecycleApi.dryRun(row.rule_code, { employee: { employee_id: 'DRY-RUN-001' } });
    ElMessage.success(r.matched ? '规则匹配成功' : '规则未匹配');
}
catch (e) {
    ElMessage.error(e?.response?.data?.detail || '模拟失败');
} }
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "lifecycle-page" },
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
        ...{ class: "header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_6.slots.default;
    var __VLS_6;
}
const __VLS_11 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
    data: (__VLS_ctx.rules),
    stripe: true,
}));
const __VLS_13 = __VLS_12({
    data: (__VLS_ctx.rules),
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_12));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_14.slots.default;
const __VLS_15 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    prop: "rule_name",
    label: "规则名称",
    minWidth: "160",
}));
const __VLS_17 = __VLS_16({
    prop: "rule_name",
    label: "规则名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
const __VLS_19 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    prop: "internal_event_type",
    label: "事件",
    width: "170",
}));
const __VLS_21 = __VLS_20({
    prop: "internal_event_type",
    label: "事件",
    width: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
const __VLS_23 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    prop: "target_resource_code",
    label: "目标资源",
    width: "150",
}));
const __VLS_25 = __VLS_24({
    prop: "target_resource_code",
    label: "目标资源",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
const __VLS_27 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    prop: "lifecycle_action",
    label: "动作",
    width: "110",
}));
const __VLS_29 = __VLS_28({
    prop: "lifecycle_action",
    label: "动作",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
const __VLS_31 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    label: "删除策略",
    minWidth: "150",
}));
const __VLS_33 = __VLS_32({
    label: "删除策略",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_34.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.approval_required ? '需审批；' : '');
    (row.retention_days);
}
var __VLS_34;
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    label: "状态",
    width: "90",
}));
const __VLS_37 = __VLS_36({
    label: "状态",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_38.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_39 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        type: (row.status ? 'success' : 'info'),
    }));
    const __VLS_41 = __VLS_40({
        type: (row.status ? 'success' : 'info'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    (row.status ? '启用' : '停用');
    var __VLS_42;
}
var __VLS_38;
const __VLS_43 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    label: "操作",
    width: "210",
}));
const __VLS_45 = __VLS_44({
    label: "操作",
    width: "210",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_46.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "V",
        link: true,
    }));
    const __VLS_48 = __VLS_47({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "V",
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
    let __VLS_50;
    let __VLS_51;
    let __VLS_52;
    const __VLS_53 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runDry(row);
        }
    };
    __VLS_49.slots.default;
    var __VLS_49;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "U",
        link: true,
    }));
    const __VLS_55 = __VLS_54({
        ...{ 'onClick': {} },
        menu: "ucp.external_accounts",
        op: "U",
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    let __VLS_57;
    let __VLS_58;
    let __VLS_59;
    const __VLS_60 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggle(row);
        }
    };
    __VLS_56.slots.default;
    (row.status ? '停用' : '启用');
    var __VLS_56;
}
var __VLS_46;
var __VLS_14;
var __VLS_3;
const __VLS_61 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
    ...{ class: "jobs" },
}));
const __VLS_63 = __VLS_62({
    ...{ class: "jobs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_62));
__VLS_64.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_64.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
}
const __VLS_65 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
    data: (__VLS_ctx.jobs),
    stripe: true,
}));
const __VLS_67 = __VLS_66({
    data: (__VLS_ctx.jobs),
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_66));
__VLS_68.slots.default;
const __VLS_69 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    prop: "job_code",
    label: "任务",
    minWidth: "180",
}));
const __VLS_71 = __VLS_70({
    prop: "job_code",
    label: "任务",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
const __VLS_73 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
    prop: "action",
    label: "动作",
    width: "100",
}));
const __VLS_75 = __VLS_74({
    prop: "action",
    label: "动作",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_74));
const __VLS_77 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
    prop: "status",
    label: "状态",
    width: "150",
}));
const __VLS_79 = __VLS_78({
    prop: "status",
    label: "状态",
    width: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_78));
const __VLS_81 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
    prop: "scheduled_at",
    label: "计划执行",
    minWidth: "170",
}));
const __VLS_83 = __VLS_82({
    prop: "scheduled_at",
    label: "计划执行",
    minWidth: "170",
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
const __VLS_85 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
    prop: "last_error_message",
    label: "最近错误",
    minWidth: "180",
}));
const __VLS_87 = __VLS_86({
    prop: "last_error_message",
    label: "最近错误",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_86));
const __VLS_89 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
    label: "操作",
    width: "100",
}));
const __VLS_91 = __VLS_90({
    label: "操作",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_90));
__VLS_92.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_92.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.status === 'FAILED') {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "ucp.external_accounts",
            op: "U",
            link: true,
        }));
        const __VLS_94 = __VLS_93({
            ...{ 'onClick': {} },
            menu: "ucp.external_accounts",
            op: "U",
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
        let __VLS_96;
        let __VLS_97;
        let __VLS_98;
        const __VLS_99 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'FAILED'))
                    return;
                __VLS_ctx.retry(row);
            }
        };
        __VLS_95.slots.default;
        var __VLS_95;
    }
}
var __VLS_92;
var __VLS_68;
var __VLS_64;
const __VLS_100 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    modelValue: (__VLS_ctx.visible),
    title: "新建生命周期规则",
    width: "680px",
}));
const __VLS_102 = __VLS_101({
    modelValue: (__VLS_ctx.visible),
    title: "新建生命周期规则",
    width: "680px",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
const __VLS_104 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    labelWidth: "120px",
}));
const __VLS_106 = __VLS_105({
    labelWidth: "120px",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "规则编码",
}));
const __VLS_110 = __VLS_109({
    label: "规则编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    modelValue: (__VLS_ctx.form.rule_code),
    placeholder: "FEISHU_DIDI_OFFBOARD",
}));
const __VLS_114 = __VLS_113({
    modelValue: (__VLS_ctx.form.rule_code),
    placeholder: "FEISHU_DIDI_OFFBOARD",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
var __VLS_111;
const __VLS_116 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    label: "规则名称",
}));
const __VLS_118 = __VLS_117({
    label: "规则名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    modelValue: (__VLS_ctx.form.rule_name),
}));
const __VLS_122 = __VLS_121({
    modelValue: (__VLS_ctx.form.rule_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_119;
const __VLS_124 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "内部事件",
}));
const __VLS_126 = __VLS_125({
    label: "内部事件",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    modelValue: (__VLS_ctx.form.internal_event_type),
}));
const __VLS_130 = __VLS_129({
    modelValue: (__VLS_ctx.form.internal_event_type),
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "员工入职",
    value: "EMPLOYEE_ONBOARD",
}));
const __VLS_134 = __VLS_133({
    label: "员工入职",
    value: "EMPLOYEE_ONBOARD",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
const __VLS_136 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "员工离职",
    value: "EMPLOYEE_OFFBOARD",
}));
const __VLS_138 = __VLS_137({
    label: "员工离职",
    value: "EMPLOYEE_OFFBOARD",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
var __VLS_131;
var __VLS_127;
const __VLS_140 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "目标资源",
}));
const __VLS_142 = __VLS_141({
    label: "目标资源",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    modelValue: (__VLS_ctx.form.target_resource_code),
    placeholder: "DIDI_ACCOUNT",
}));
const __VLS_146 = __VLS_145({
    modelValue: (__VLS_ctx.form.target_resource_code),
    placeholder: "DIDI_ACCOUNT",
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_143;
const __VLS_148 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "动作",
}));
const __VLS_150 = __VLS_149({
    label: "动作",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    modelValue: (__VLS_ctx.form.lifecycle_action),
}));
const __VLS_154 = __VLS_153({
    modelValue: (__VLS_ctx.form.lifecycle_action),
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
const __VLS_156 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    value: "CREATE",
}));
const __VLS_158 = __VLS_157({
    value: "CREATE",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
const __VLS_160 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    value: "DISABLE",
}));
const __VLS_162 = __VLS_161({
    value: "DISABLE",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
const __VLS_164 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    value: "DELETE",
}));
const __VLS_166 = __VLS_165({
    value: "DELETE",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
var __VLS_155;
var __VLS_151;
const __VLS_168 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "保留天数",
}));
const __VLS_170 = __VLS_169({
    label: "保留天数",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
const __VLS_172 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    modelValue: (__VLS_ctx.form.retention_days),
    min: (0),
}));
const __VLS_174 = __VLS_173({
    modelValue: (__VLS_ctx.form.retention_days),
    min: (0),
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
var __VLS_171;
const __VLS_176 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "需要审批",
}));
const __VLS_178 = __VLS_177({
    label: "需要审批",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
const __VLS_180 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    modelValue: (__VLS_ctx.form.approval_required),
}));
const __VLS_182 = __VLS_181({
    modelValue: (__VLS_ctx.form.approval_required),
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
var __VLS_179;
const __VLS_184 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    label: "员工编号路径",
}));
const __VLS_186 = __VLS_185({
    label: "员工编号路径",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
const __VLS_188 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    modelValue: (__VLS_ctx.form.employeePath),
    placeholder: "$.employee.employee_id",
}));
const __VLS_190 = __VLS_189({
    modelValue: (__VLS_ctx.form.employeePath),
    placeholder: "$.employee.employee_id",
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_187;
var __VLS_107;
{
    const { footer: __VLS_thisSlot } = __VLS_103.slots;
    const __VLS_192 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        ...{ 'onClick': {} },
    }));
    const __VLS_194 = __VLS_193({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    let __VLS_196;
    let __VLS_197;
    let __VLS_198;
    const __VLS_199 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_195.slots.default;
    var __VLS_195;
    const __VLS_200 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_202 = __VLS_201({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    let __VLS_204;
    let __VLS_205;
    let __VLS_206;
    const __VLS_207 = {
        onClick: (__VLS_ctx.create)
    };
    __VLS_203.slots.default;
    var __VLS_203;
}
var __VLS_103;
/** @type {__VLS_StyleScopedClasses['lifecycle-page']} */ ;
/** @type {__VLS_StyleScopedClasses['header']} */ ;
/** @type {__VLS_StyleScopedClasses['jobs']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PermissionButton: PermissionButton,
            rules: rules,
            jobs: jobs,
            loading: loading,
            visible: visible,
            form: form,
            openCreate: openCreate,
            create: create,
            toggle: toggle,
            retry: retry,
            runDry: runDry,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
