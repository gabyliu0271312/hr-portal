/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Notification, Clock, Promotion, Edit, Plus, Delete, SetUp, Timer, CircleCheck, CircleClose, Finished, DocumentChecked } from '@element-plus/icons-vue';
import { automationApi } from '@/api/automation';
import TriggerWizard from '@/components/automation/TriggerWizard.vue';
import ActionWizard from '@/components/automation/ActionWizard.vue';
import { useUserStore } from '@/stores/user';
const router = useRouter();
const route = useRoute();
const userStore = useUserStore();
const isEdit = computed(() => !!route.params.id);
const ruleId = computed(() => Number(route.params.id));
const form = ref({
    name: '',
    description: null,
    biz_type: null,
    trigger_type: '',
    trigger_config: {},
    condition_config: [],
    actions_config: [],
    enabled: false,
    source: 'manual',
});
const saving = ref(false);
const loading = ref(false);
// ── 向导状态 ──────────────────────────────────────────
const showTriggerWizard = ref(false);
const showActionWizard = ref(false);
const editingActionIndex = ref(null);
const editingActionConfig = ref(null);
// ── 触发器摘要 ────────────────────────────────────────
const triggerDefs = {
    schedule: { label: '定时通知', icon: Clock, category: '系统内置' },
    scheduled_job_success: { label: '定时任务执行成功', icon: CircleCheck, category: '门户继承' },
    scheduled_job_failed: { label: '定时任务执行失败', icon: CircleClose, category: '门户继承' },
    scheduled_job_finished: { label: '定时任务执行完成', icon: Finished, category: '门户继承' },
    report_run_success: { label: '报表运行成功', icon: CircleCheck, category: '报表系统' },
    report_run_failed: { label: '报表运行失败', icon: CircleClose, category: '报表系统' },
    scheduled_report_success: { label: '定时报表生成成功', icon: DocumentChecked, category: '报表系统' },
    scheduled_report_failed: { label: '定时报表生成失败', icon: Timer, category: '报表系统' },
};
const triggerSummary = computed(() => {
    if (!form.value.trigger_type)
        return null;
    const def = triggerDefs[form.value.trigger_type];
    if (!def)
        return { label: form.value.trigger_type, icon: SetUp, category: '', detail: '' };
    let detail = '';
    const cfg = form.value.trigger_config || {};
    if (form.value.trigger_type === 'schedule') {
        const presets = {
            'FREQ=DAILY;INTERVAL=1': '每天',
            'FREQ=WEEKLY;BYDAY=MO': '每周一',
            'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': '每周一至周五',
            'FREQ=MONTHLY;BYMONTHDAY=1': '每月1日',
        };
        detail = presets[cfg.rrule] || cfg.rrule || '自定义';
    }
    else if (cfg.biz_id) {
        detail = `关联 ID: ${cfg.biz_id}`;
    }
    return { ...def, detail };
});
// ── 动作摘要 ──────────────────────────────────────────
const actionSummaries = computed(() => {
    return (form.value.actions_config || []).map((action, idx) => {
        const cfg = action.config || {};
        const receiverCount = (cfg.receivers || []).length;
        const format = cfg.message?.message_format || 'markdown';
        return {
            index: idx,
            type: action.type,
            name: action.name || '通知动作',
            enabled: action.enabled !== false,
            receiverCount,
            format,
            hasCard: cfg.card_button?.enabled || false,
        };
    });
});
// ── 表单完整度判断（用于控制启用开关是否可操作）──────
const isFormComplete = computed(() => {
    if (!form.value.trigger_type)
        return false;
    const actions = form.value.actions_config || [];
    if (actions.length === 0)
        return false;
    for (const action of actions) {
        if (action.type === 'feishu_send_message') {
            const receivers = action.config?.receivers || [];
            if (receivers.length === 0)
                return false;
        }
    }
    return true;
});
// ── 加载/保存 ─────────────────────────────────────────
async function loadRule() {
    if (!isEdit.value)
        return;
    loading.value = true;
    try {
        const rule = await automationApi.getRule(ruleId.value);
        form.value = {
            name: rule.name,
            description: rule.description,
            biz_type: rule.biz_type,
            trigger_type: rule.trigger_type,
            trigger_config: rule.trigger_config,
            condition_config: rule.condition_config || [],
            actions_config: rule.actions_config || [],
            enabled: rule.enabled,
            source: rule.source || 'manual',
        };
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
        router.push({ name: 'AutomationRuleList' });
    }
    finally {
        loading.value = false;
    }
}
function validate() {
    if (!form.value.name?.trim())
        return '请输入通知名称';
    // 未启用时只校验名称，跳过其余所有校验（允许存草稿）
    if (!form.value.enabled)
        return null;
    if (!form.value.trigger_type)
        return '请选择触发器';
    if (!form.value.actions_config || form.value.actions_config.length === 0)
        return '请至少添加一个通知动作';
    return null;
}
async function handleSave() {
    const err = validate();
    if (err) {
        ElMessage.warning(err);
        return;
    }
    saving.value = true;
    try {
        if (isEdit.value) {
            await automationApi.updateRule(ruleId.value, form.value);
            ElMessage.success('通知已更新');
        }
        else {
            await automationApi.createRule(form.value);
            ElMessage.success('通知已创建');
        }
        router.push({ name: 'AutomationRuleList' });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
// ── 触发器操作 ────────────────────────────────────────
function openTriggerWizard() {
    showTriggerWizard.value = true;
}
function onTriggerConfirm(payload) {
    form.value.trigger_type = payload.triggerType;
    form.value.trigger_config = payload.triggerConfig;
}
// ── 动作操作 ──────────────────────────────────────────
function openAddAction() {
    editingActionIndex.value = null;
    editingActionConfig.value = null;
    showActionWizard.value = true;
}
function openEditAction(index) {
    const action = form.value.actions_config[index];
    editingActionIndex.value = index;
    editingActionConfig.value = { type: action.type, config: { ...(action.config || {}) } };
    showActionWizard.value = true;
}
function onActionConfirm(payload) {
    const actions = [...(form.value.actions_config || [])];
    const newAction = { type: payload.type, name: payload.name, enabled: payload.enabled, config: payload.config };
    if (editingActionIndex.value !== null) {
        actions[editingActionIndex.value] = newAction;
    }
    else {
        actions.push(newAction);
    }
    form.value.actions_config = actions;
}
async function removeAction(index) {
    try {
        await ElMessageBox.confirm('确定要删除这个通知动作吗？', '删除确认', {
            confirmButtonText: '确定',
            cancelButtonText: '取消',
            type: 'warning',
        });
    }
    catch {
        return;
    }
    const actions = [...(form.value.actions_config || [])];
    actions.splice(index, 1);
    form.value.actions_config = actions;
}
function handleBack() {
    router.push({ name: 'AutomationRuleList' });
}
async function handleDeleteRule() {
    if (!isEdit.value)
        return;
    try {
        await ElMessageBox.confirm(`确定要删除通知规则「${form.value.name || '未命名'}」吗？删除后不可恢复。`, '确认删除', { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' });
        await automationApi.deleteRule(ruleId.value);
        ElMessage.success('已删除');
        router.push({ name: 'AutomationRuleList' });
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close') {
            ElMessage.error(e?.response?.data?.detail || '删除失败');
        }
    }
}
function hasOp(code, op) {
    const fieldMap = { C: 'can_create', U: 'can_update', D: 'can_delete', E: 'can_export' };
    const field = fieldMap[op] || `can_${op}`;
    return userStore.menus.some(m => m.code === code && m[field] === true);
}
onMounted(() => { loadRule(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-block']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "are-root" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleBack) },
    ...{ class: "back-btn" },
});
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ArrowLeft;
/** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-center" },
});
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ class: "topbar-icon" },
}));
const __VLS_10 = __VLS_9({
    ...{ class: "topbar-icon" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.Notification;
/** @type {[typeof __VLS_components.Notification, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "topbar-title" },
});
(__VLS_ctx.isEdit ? '编辑通知' : '新建通知');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "topbar-actions" },
});
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.handleBack)
};
__VLS_19.slots.default;
var __VLS_19;
if (__VLS_ctx.isEdit && __VLS_ctx.hasOp('automation.rules', 'D')) {
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        type: "danger",
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (__VLS_ctx.handleDeleteRule)
    };
    __VLS_27.slots.default;
    var __VLS_27;
}
const __VLS_32 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.saving),
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.saving),
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (__VLS_ctx.handleSave)
};
__VLS_35.slots.default;
(__VLS_ctx.isEdit ? '保存修改' : '创建通知');
var __VLS_35;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "overview-layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "ov-card-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "field-label required" },
});
const __VLS_40 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：月度报表生成通知",
    maxlength: "100",
    showWordLimit: true,
}));
const __VLS_42 = __VLS_41({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：月度报表生成通知",
    maxlength: "100",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "field-label" },
});
const __VLS_44 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    autosize: ({ minRows: 2, maxRows: 4 }),
    placeholder: "描述通知的用途和场景（可选）",
}));
const __VLS_46 = __VLS_45({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    autosize: ({ minRows: 2, maxRows: 4 }),
    placeholder: "描述通知的用途和场景（可选）",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "switch-row" },
});
const __VLS_48 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.form.enabled),
    size: "small",
    disabled: (!__VLS_ctx.form.enabled && !__VLS_ctx.isFormComplete),
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.form.enabled),
    size: "small",
    disabled: (!__VLS_ctx.form.enabled && !__VLS_ctx.isFormComplete),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "switch-hint" },
});
(__VLS_ctx.form.enabled ? '事件触发时自动执行通知' : '仅保存配置，暂不执行');
if (!__VLS_ctx.form.enabled && !__VLS_ctx.isFormComplete) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "switch-warn" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "ov-card-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ov-badge required-badge" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-body" },
});
if (__VLS_ctx.triggerSummary) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-icon" },
    });
    const __VLS_52 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        size: (22),
    }));
    const __VLS_54 = __VLS_53({
        size: (22),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = ((__VLS_ctx.triggerSummary.icon));
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    var __VLS_55;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-info" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-label" },
    });
    (__VLS_ctx.triggerSummary.label);
    if (__VLS_ctx.triggerSummary.detail) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "summary-detail" },
        });
        (__VLS_ctx.triggerSummary.detail);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-meta" },
    });
    (__VLS_ctx.triggerSummary.category);
    const __VLS_60 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Edit),
        size: "small",
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Edit),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onClick: (__VLS_ctx.openTriggerWizard)
    };
    __VLS_63.slots.default;
    var __VLS_63;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.openTriggerWizard) },
        ...{ class: "empty-state" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-icon" },
    });
    const __VLS_68 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        size: (28),
    }));
    const __VLS_70 = __VLS_69({
        size: (28),
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    const __VLS_72 = {}.SetUp;
    /** @type {[typeof __VLS_components.SetUp, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    var __VLS_71;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-hint" },
    });
    const __VLS_76 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        icon: (__VLS_ctx.Plus),
        type: "primary",
        size: "small",
        ...{ class: "empty-btn" },
    }));
    const __VLS_78 = __VLS_77({
        icon: (__VLS_ctx.Plus),
        type: "primary",
        size: "small",
        ...{ class: "empty-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    var __VLS_79;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ class: "ov-card-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "ov-badge" },
});
(__VLS_ctx.actionSummaries.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ov-card-body" },
});
for (const [summary] of __VLS_getVForSourceType((__VLS_ctx.actionSummaries))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (summary.index),
        ...{ class: "summary-block action-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-icon action-icon" },
    });
    const __VLS_80 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        size: (20),
    }));
    const __VLS_82 = __VLS_81({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    const __VLS_84 = {}.Promotion;
    /** @type {[typeof __VLS_components.Promotion, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
    const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
    var __VLS_83;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-info" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-label" },
    });
    (summary.index + 1);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-detail" },
    });
    (summary.receiverCount);
    (summary.format === 'markdown' ? 'Markdown' : '纯文本');
    if (summary.hasCard) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "summary-meta" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "summary-actions" },
    });
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Edit),
        size: "small",
        text: true,
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Edit),
        size: "small",
        text: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEditAction(summary.index);
        }
    };
    __VLS_91.slots.default;
    var __VLS_91;
    const __VLS_96 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Delete),
        size: "small",
        text: true,
        type: "danger",
    }));
    const __VLS_98 = __VLS_97({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Delete),
        size: "small",
        text: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    let __VLS_100;
    let __VLS_101;
    let __VLS_102;
    const __VLS_103 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeAction(summary.index);
        }
    };
    __VLS_99.slots.default;
    var __VLS_99;
}
if (__VLS_ctx.actionSummaries.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.openAddAction) },
        ...{ class: "empty-state small" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-icon small-icon" },
    });
    const __VLS_104 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        size: (24),
    }));
    const __VLS_106 = __VLS_105({
        size: (24),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    __VLS_107.slots.default;
    const __VLS_108 = {}.Promotion;
    /** @type {[typeof __VLS_components.Promotion, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
    const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
    var __VLS_107;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-hint" },
    });
}
const __VLS_112 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    type: "primary",
    plain: true,
    ...{ class: "add-action-btn" },
}));
const __VLS_114 = __VLS_113({
    ...{ 'onClick': {} },
    icon: (__VLS_ctx.Plus),
    type: "primary",
    plain: true,
    ...{ class: "add-action-btn" },
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
let __VLS_116;
let __VLS_117;
let __VLS_118;
const __VLS_119 = {
    onClick: (__VLS_ctx.openAddAction)
};
__VLS_115.slots.default;
var __VLS_115;
/** @type {[typeof TriggerWizard, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(TriggerWizard, new TriggerWizard({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.showTriggerWizard),
    triggerType: (__VLS_ctx.form.trigger_type),
    triggerConfig: (__VLS_ctx.form.trigger_config),
}));
const __VLS_121 = __VLS_120({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.showTriggerWizard),
    triggerType: (__VLS_ctx.form.trigger_type),
    triggerConfig: (__VLS_ctx.form.trigger_config),
}, ...__VLS_functionalComponentArgsRest(__VLS_120));
let __VLS_123;
let __VLS_124;
let __VLS_125;
const __VLS_126 = {
    onConfirm: (__VLS_ctx.onTriggerConfirm)
};
var __VLS_122;
/** @type {[typeof ActionWizard, ]} */ ;
// @ts-ignore
const __VLS_127 = __VLS_asFunctionalComponent(ActionWizard, new ActionWizard({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.showActionWizard),
    editConfig: (__VLS_ctx.editingActionConfig),
}));
const __VLS_128 = __VLS_127({
    ...{ 'onConfirm': {} },
    modelValue: (__VLS_ctx.showActionWizard),
    editConfig: (__VLS_ctx.editingActionConfig),
}, ...__VLS_functionalComponentArgsRest(__VLS_127));
let __VLS_130;
let __VLS_131;
let __VLS_132;
const __VLS_133 = {
    onConfirm: (__VLS_ctx.onActionConfirm)
};
var __VLS_129;
/** @type {__VLS_StyleScopedClasses['are-root']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-center']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-title']} */ ;
/** @type {__VLS_StyleScopedClasses['topbar-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['overview-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['required-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-block']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-info']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-header']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['ov-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-block']} */ ;
/** @type {__VLS_StyleScopedClasses['action-block']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-row']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['action-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-info']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-label']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['summary-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['small']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['small-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['add-action-btn']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Notification: Notification,
            Promotion: Promotion,
            Edit: Edit,
            Plus: Plus,
            Delete: Delete,
            SetUp: SetUp,
            TriggerWizard: TriggerWizard,
            ActionWizard: ActionWizard,
            isEdit: isEdit,
            form: form,
            saving: saving,
            loading: loading,
            showTriggerWizard: showTriggerWizard,
            showActionWizard: showActionWizard,
            editingActionConfig: editingActionConfig,
            triggerSummary: triggerSummary,
            actionSummaries: actionSummaries,
            isFormComplete: isFormComplete,
            handleSave: handleSave,
            openTriggerWizard: openTriggerWizard,
            onTriggerConfirm: onTriggerConfirm,
            openAddAction: openAddAction,
            openEditAction: openEditAction,
            onActionConfirm: onActionConfirm,
            removeAction: removeAction,
            handleBack: handleBack,
            handleDeleteRule: handleDeleteRule,
            hasOp: hasOp,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
