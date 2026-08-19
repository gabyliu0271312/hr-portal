/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Notification, Edit, Delete } from '@element-plus/icons-vue';
import { automationApi } from '@/api/automation';
import { useUserStore } from '@/stores/user';
const router = useRouter();
const userStore = useUserStore();
const rules = ref([]);
const loading = ref(false);
const triggerTypeLabels = {
    scheduled_job_success: '定时任务执行成功',
    scheduled_job_failed: '定时任务执行失败',
    scheduled_job_finished: '定时任务执行完成',
    report_run_success: '报表运行成功',
    report_run_failed: '报表运行失败',
    scheduled_report_success: '定时报表生成成功',
    scheduled_report_failed: '定时报表生成失败',
};
const actionTypeLabels = {
    feishu_send_message: '飞书消息',
};
function hasOp(code, op) {
    const fieldMap = { C: 'can_create', U: 'can_update', D: 'can_delete', E: 'can_export' };
    const field = fieldMap[op] || `can_${op}`;
    return userStore.menus.some(m => m.code === code && m[field] === true);
}
async function loadRules() {
    loading.value = true;
    try {
        rules.value = await automationApi.listRules();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
function getActionSummary(rule) {
    const types = (rule.actions_config || []).map(a => actionTypeLabels[a.type] || a.type);
    return types.join(', ') || '无动作';
}
/** 判断规则配置是否完整（满足启用条件） */
function isRuleConfigComplete(rule) {
    if (!rule.trigger_type)
        return false;
    const actions = rule.actions_config || [];
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
}
function getTriggerLabel(triggerType) {
    return triggerTypeLabels[triggerType] || triggerType;
}
async function handleToggle(rule) {
    // 启用前校验配置完整度（前端兜底，后端也会校验）
    if (!rule.enabled && !isRuleConfigComplete(rule)) {
        ElMessage.warning('请先完善触发器和通知动作配置后再启用');
        return;
    }
    try {
        if (rule.enabled) {
            await automationApi.disableRule(rule.id);
            rule.enabled = false;
            ElMessage.success('已停用');
        }
        else {
            await automationApi.enableRule(rule.id);
            rule.enabled = true;
            ElMessage.success('已启用');
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '操作失败');
    }
}
function handleEdit(rule) {
    router.push({ name: 'AutomationRuleEdit', params: { id: rule.id } });
}
function handleCreate() {
    router.push({ name: 'AutomationRuleCreate' });
}
async function handleDelete(rule) {
    try {
        await ElMessageBox.confirm(`确定要删除通知规则「${rule.name}」吗？删除后不可恢复。`, '确认删除', { confirmButtonText: '确定删除', cancelButtonText: '取消', type: 'warning' });
        await automationApi.deleteRule(rule.id);
        ElMessage.success('已删除');
        await loadRules();
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close') {
            ElMessage.error(e?.response?.data?.detail || '删除失败');
        }
    }
}
onMounted(() => {
    loadRules();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ar-root" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "page-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "page-desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-actions" },
});
if (__VLS_ctx.hasOp('automation.rules', 'C')) {
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.handleCreate)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "list-loading" },
    });
    for (const [i] of __VLS_getVForSourceType((3))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "skeleton" },
            key: (i),
        });
    }
}
else if (!__VLS_ctx.rules.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-state" },
    });
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ class: "empty-icon" },
    }));
    const __VLS_10 = __VLS_9({
        ...{ class: "empty-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.Notification;
    /** @type {[typeof __VLS_components.Notification, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "empty-hint" },
    });
    if (__VLS_ctx.hasOp('automation.rules', 'C')) {
        const __VLS_16 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (__VLS_ctx.handleCreate)
        };
        __VLS_19.slots.default;
        var __VLS_19;
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rule-grid" },
    });
    for (const [rule] of __VLS_getVForSourceType((__VLS_ctx.rules))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card" },
            key: (rule.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card-icon" },
        });
        const __VLS_24 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
        const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        const __VLS_28 = {}.Notification;
        /** @type {[typeof __VLS_components.Notification, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
        const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
        var __VLS_27;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-name" },
        });
        (rule.name);
        if (rule.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "rule-desc" },
            });
            (rule.description);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-tag trigger" },
        });
        (__VLS_ctx.getTriggerLabel(rule.trigger_type));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-dot" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "meta-text" },
        });
        (__VLS_ctx.getActionSummary(rule));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card-footer" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-tags" },
        });
        const __VLS_32 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            type: (rule.enabled ? 'success' : 'info'),
            size: "small",
            effect: "plain",
        }));
        const __VLS_34 = __VLS_33({
            type: (rule.enabled ? 'success' : 'info'),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        (rule.enabled ? '已启用' : '已停用');
        var __VLS_35;
        if (rule.source === 'ai_generated') {
            const __VLS_36 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                type: "warning",
                size: "small",
                effect: "plain",
            }));
            const __VLS_38 = __VLS_37({
                type: "warning",
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_37));
            __VLS_39.slots.default;
            var __VLS_39;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-card-actions" },
        });
        const __VLS_40 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            ...{ 'onClick': {} },
            size: "small",
            icon: (__VLS_ctx.Edit),
        }));
        const __VLS_42 = __VLS_41({
            ...{ 'onClick': {} },
            size: "small",
            icon: (__VLS_ctx.Edit),
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        let __VLS_44;
        let __VLS_45;
        let __VLS_46;
        const __VLS_47 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(!__VLS_ctx.rules.length))
                    return;
                __VLS_ctx.handleEdit(rule);
            }
        };
        __VLS_43.slots.default;
        var __VLS_43;
        const __VLS_48 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            content: ('请先完善触发器和通知动作配置后再启用'),
            disabled: (rule.enabled || __VLS_ctx.isRuleConfigComplete(rule)),
            placement: "top",
        }));
        const __VLS_50 = __VLS_49({
            content: ('请先完善触发器和通知动作配置后再启用'),
            disabled: (rule.enabled || __VLS_ctx.isRuleConfigComplete(rule)),
            placement: "top",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        __VLS_51.slots.default;
        const __VLS_52 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ 'onClick': {} },
            size: "small",
            type: (rule.enabled ? 'warning' : 'success'),
            disabled: (!rule.enabled && !__VLS_ctx.isRuleConfigComplete(rule)),
        }));
        const __VLS_54 = __VLS_53({
            ...{ 'onClick': {} },
            size: "small",
            type: (rule.enabled ? 'warning' : 'success'),
            disabled: (!rule.enabled && !__VLS_ctx.isRuleConfigComplete(rule)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        let __VLS_56;
        let __VLS_57;
        let __VLS_58;
        const __VLS_59 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(!__VLS_ctx.rules.length))
                    return;
                __VLS_ctx.handleToggle(rule);
            }
        };
        __VLS_55.slots.default;
        (rule.enabled ? '停用' : '启用');
        var __VLS_55;
        var __VLS_51;
        if (__VLS_ctx.hasOp('automation.rules', 'D')) {
            const __VLS_60 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }));
            const __VLS_62 = __VLS_61({
                ...{ 'onClick': {} },
                size: "small",
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
            let __VLS_64;
            let __VLS_65;
            let __VLS_66;
            const __VLS_67 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(!__VLS_ctx.rules.length))
                        return;
                    if (!(__VLS_ctx.hasOp('automation.rules', 'D')))
                        return;
                    __VLS_ctx.handleDelete(rule);
                }
            };
            __VLS_63.slots.default;
            var __VLS_63;
        }
    }
}
/** @type {__VLS_StyleScopedClasses['ar-root']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['list-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card-info']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-name']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['meta-text']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-card-actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Notification: Notification,
            Edit: Edit,
            Delete: Delete,
            rules: rules,
            loading: loading,
            hasOp: hasOp,
            getActionSummary: getActionSummary,
            isRuleConfigComplete: isRuleConfigComplete,
            getTriggerLabel: getTriggerLabel,
            handleToggle: handleToggle,
            handleEdit: handleEdit,
            handleCreate: handleCreate,
            handleDelete: handleDelete,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
