import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Bell, Promotion, CircleCheck, Close } from '@element-plus/icons-vue';
import { automationApi } from '@/api/automation';
const props = defineProps();
const emit = defineEmits();
const saving = ref(false);
const triggerTypeLabels = {
    scheduled_job_success: '定时任务执行成功',
    scheduled_job_failed: '定时任务执行失败',
    scheduled_job_finished: '定时任务执行完成',
    report_run_success: '报表运行成功',
    report_run_failed: '报表运行失败',
    scheduled_report_success: '定时报表生成成功',
    scheduled_report_failed: '定时报表生成失败',
};
async function handleSave() {
    if (!props.artifact)
        return;
    saving.value = true;
    try {
        const draft = props.artifact.rule_draft;
        if (!draft)
            return;
        const payload = {
            name: draft.name,
            description: draft.description,
            biz_type: draft.biz_type,
            trigger_type: draft.trigger_type,
            trigger_config: draft.trigger_config,
            condition_config: draft.condition_config || [],
            actions_config: draft.actions_config,
            enabled: false,
            source: 'ai_generated',
        };
        const result = await automationApi.createRule(payload);
        ElMessage.success(`通知「${result.name}」已保存，请手动启用`);
        emit('saved');
    }
    catch (e) {
        const detail = e?.response?.data?.detail || '保存失败';
        ElMessage.error(detail);
    }
    finally {
        saving.value = false;
    }
}
function handleDismiss() {
    emit('dismissed');
}
function getActionSummary(action) {
    if (action.type === 'feishu_send_message') {
        const config = action.config || {};
        const receivers = config.receivers || [];
        return receivers.length > 0
            ? `${receivers.length} 个接收规则`
            : '未配置接收人';
    }
    return action.type;
}
function getReceiverSummary(receiver) {
    if (receiver.type === 'fixed_users') {
        return receiver.user_ids?.length ? `指定用户 (${receiver.user_ids.length}人)` : '指定用户（待选择）';
    }
    if (receiver.type === 'fixed_chats') {
        return receiver.chat_ids?.length ? `指定群聊 (${receiver.chat_ids.length}个)` : '指定群聊（待选择）';
    }
    if (receiver.type === 'employee_field_user') {
        return `员工字段 ${receiver.target_field}`;
    }
    if (receiver.type === 'employee_department_manager') {
        return `部门负责人 (${receiver.department_field})`;
    }
    return JSON.stringify(receiver);
}
function getMessagePreview(config) {
    return config?.message?.content_template || '（使用默认模板）';
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['validation-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['needs-config']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.artifact?.artifact_type === 'automation_rule') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "artifact-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "artifact-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "artifact-header-left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "artifact-badge" },
    });
    const __VLS_0 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    const __VLS_4 = {}.Bell;
    /** @type {[typeof __VLS_components.Bell, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
    var __VLS_3;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
        ...{ class: "artifact-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "artifact-subtitle" },
    });
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        icon: (__VLS_ctx.Close),
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        size: "small",
        text: true,
        icon: (__VLS_ctx.Close),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (__VLS_ctx.handleDismiss)
    };
    var __VLS_11;
    if (__VLS_ctx.artifact.validation_errors?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "validation-errors" },
        });
        const __VLS_16 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "配置有误，请修改后保存",
        }));
        const __VLS_18 = __VLS_17({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "配置有误，请修改后保存",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [err, idx] of __VLS_getVForSourceType((__VLS_ctx.artifact.validation_errors))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (idx),
            });
            (err);
        }
        var __VLS_19;
    }
    if (__VLS_ctx.artifact.needs_config?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "needs-config" },
        });
        const __VLS_20 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "以下信息待配置，保存后可在编辑器中补充",
        }));
        const __VLS_22 = __VLS_21({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "以下信息待配置，保存后可在编辑器中补充",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        __VLS_23.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({});
        for (const [item, idx] of __VLS_getVForSourceType((__VLS_ctx.artifact.needs_config))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
                key: (idx),
            });
            (item);
        }
        var __VLS_23;
    }
    if (__VLS_ctx.artifact.rule_draft) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "artifact-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-name" },
        });
        (__VLS_ctx.artifact.rule_draft.name);
        if (__VLS_ctx.artifact.rule_draft.description) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "rule-desc" },
            });
            (__VLS_ctx.artifact.rule_draft.description);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-grid" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card-value" },
        });
        const __VLS_24 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            type: "",
            size: "small",
        }));
        const __VLS_26 = __VLS_25({
            type: "",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        (__VLS_ctx.triggerTypeLabels[__VLS_ctx.artifact.rule_draft.trigger_type] || __VLS_ctx.artifact.rule_draft.trigger_type);
        var __VLS_27;
        if (__VLS_ctx.artifact.rule_draft.trigger_config?.biz_id) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "biz-id" },
            });
            (__VLS_ctx.artifact.rule_draft.trigger_config.biz_id);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "draft-card-value" },
        });
        for (const [action, idx] of __VLS_getVForSourceType((__VLS_ctx.artifact.rule_draft.actions_config))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (idx),
                ...{ class: "action-summary-item" },
            });
            const __VLS_28 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
            const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
            __VLS_31.slots.default;
            const __VLS_32 = {}.Promotion;
            /** @type {[typeof __VLS_components.Promotion, ]} */ ;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
            const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
            var __VLS_31;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.getActionSummary(action));
        }
        for (const [action, idx] of __VLS_getVForSourceType((__VLS_ctx.artifact.rule_draft.actions_config?.filter(a => a.type === 'feishu_send_message')))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: ('msg-' + idx),
                ...{ class: "draft-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "draft-card-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "draft-card-value" },
            });
            if ((action.config?.receivers || []).length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "msg-receivers" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "msg-kv-label" },
                });
                for (const [receiver, rIdx] of __VLS_getVForSourceType(((action.config?.receivers || [])))) {
                    const __VLS_36 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                        key: (rIdx),
                        size: "small",
                    }));
                    const __VLS_38 = __VLS_37({
                        key: (rIdx),
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
                    __VLS_39.slots.default;
                    (__VLS_ctx.getReceiverSummary(receiver));
                    var __VLS_39;
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "msg-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "msg-kv-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "msg-body-text" },
            });
            (__VLS_ctx.getMessagePreview(action.config));
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "no-draft" },
        });
        const __VLS_40 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "信息不足，无法生成完整规则草稿",
        }));
        const __VLS_42 = __VLS_41({
            type: "info",
            closable: (false),
            showIcon: true,
            title: "信息不足，无法生成完整规则草稿",
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "artifact-actions" },
    });
    const __VLS_44 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (__VLS_ctx.handleDismiss)
    };
    __VLS_47.slots.default;
    var __VLS_47;
    const __VLS_52 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
        icon: (__VLS_ctx.CircleCheck),
        loading: (__VLS_ctx.saving),
        disabled: (!__VLS_ctx.artifact.rule_draft || (__VLS_ctx.artifact.validation_errors?.length ?? 0) > 0),
    }));
    const __VLS_54 = __VLS_53({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
        icon: (__VLS_ctx.CircleCheck),
        loading: (__VLS_ctx.saving),
        disabled: (!__VLS_ctx.artifact.rule_draft || (__VLS_ctx.artifact.validation_errors?.length ?? 0) > 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    let __VLS_56;
    let __VLS_57;
    let __VLS_58;
    const __VLS_59 = {
        onClick: (__VLS_ctx.handleSave)
    };
    __VLS_55.slots.default;
    var __VLS_55;
    if (__VLS_ctx.artifact.follow_up_question) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "follow-up" },
        });
        const __VLS_60 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            type: "info",
            closable: (false),
            showIcon: true,
            title: (__VLS_ctx.artifact.follow_up_question),
        }));
        const __VLS_62 = __VLS_61({
            type: "info",
            closable: (false),
            showIcon: true,
            title: (__VLS_ctx.artifact.follow_up_question),
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    }
}
/** @type {__VLS_StyleScopedClasses['artifact-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-header']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-title']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['validation-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['needs-config']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-body']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-name']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-label']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-value']} */ ;
/** @type {__VLS_StyleScopedClasses['biz-id']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-label']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-value']} */ ;
/** @type {__VLS_StyleScopedClasses['action-summary-item']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-label']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-card-value']} */ ;
/** @type {__VLS_StyleScopedClasses['msg-receivers']} */ ;
/** @type {__VLS_StyleScopedClasses['msg-kv-label']} */ ;
/** @type {__VLS_StyleScopedClasses['msg-body']} */ ;
/** @type {__VLS_StyleScopedClasses['msg-kv-label']} */ ;
/** @type {__VLS_StyleScopedClasses['msg-body-text']} */ ;
/** @type {__VLS_StyleScopedClasses['no-draft']} */ ;
/** @type {__VLS_StyleScopedClasses['artifact-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['follow-up']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Bell: Bell,
            Promotion: Promotion,
            CircleCheck: CircleCheck,
            Close: Close,
            saving: saving,
            triggerTypeLabels: triggerTypeLabels,
            handleSave: handleSave,
            handleDismiss: handleDismiss,
            getActionSummary: getActionSummary,
            getReceiverSummary: getReceiverSummary,
            getMessagePreview: getMessagePreview,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
