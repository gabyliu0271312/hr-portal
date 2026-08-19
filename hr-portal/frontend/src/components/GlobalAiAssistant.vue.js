/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { nextTick, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { MagicStick, Position } from '@element-plus/icons-vue';
import { aiApi } from '@/api/ai';
import DocumentActionPreview from '@/components/document/DocumentActionPreview.vue';
import AutomationRuleArtifactPreview from '@/components/automation/AutomationRuleArtifactPreview.vue';
import CompareResultCard from '@/components/ai/CompareResultCard.vue';
import CompensationComparisonCard from '@/components/ai/CompensationComparisonCard.vue';
import EmployeeProfileResultCard from '@/components/ai/EmployeeProfileResultCard.vue';
const route = useRoute();
const router = useRouter();
const open = ref(false);
const input = ref('');
const sending = ref(false);
const threadRef = ref(null);
const documentActionRef = ref(null);
const messages = ref([]);
// 多轮会话:前端只持有后端发的 conversation_id,任务状态/槽位由后端 PG 持久化。
const conversationId = ref(null);
const selectingEmployeeProfileMessageId = ref(null);
let messageId = 0;
function messageCandidates(item) {
    if (!item.result || (item.result.type !== 'compensation_input' && item.result.type !== 'compensation_preview')) {
        return [];
    }
    return item.result.data.candidates;
}
function chatHistory() {
    return messages.value.slice(-8).map((item) => ({
        role: item.role,
        content: item.content,
    }));
}
function scrollToBottom() {
    nextTick(() => {
        const el = threadRef.value;
        if (el)
            el.scrollTop = el.scrollHeight;
    });
}
function openAssistant() {
    open.value = true;
    scrollToBottom();
}
function formatMoney(value) {
    if (value === null || value === undefined)
        return '--';
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
function employeeTitle(item) {
    const name = item.name || item.chinese_name || item.english_name || '未命名员工';
    return `${name}${item.employee_no ? ` · ${item.employee_no}` : ''}`;
}
function runAction(action) {
    if (action.type === 'navigate') {
        if (!action.route)
            return;
        router.push({ path: action.route, query: action.query || {} });
        open.value = false;
        return;
    }
    if (action.type === 'document_preview' || action.type === 'document_print') {
        documentActionRef.value?.execute(action);
    }
}
function runAutoActions(actions) {
    const documentAction = actions.find((action) => action.type === 'document_preview' || action.type === 'document_print');
    if (documentAction) {
        nextTick(() => documentActionRef.value?.execute(documentAction));
    }
}
async function chooseCandidate(candidate) {
    const text = `选择 ${employeeTitle(candidate)}`;
    messages.value.push({ id: ++messageId, role: 'user', content: text });
    scrollToBottom();
    await sendMessage(`计算 ${employeeTitle(candidate)} 的补偿金`, candidate.id, false);
}
function controlledActionErrorDetail(error) {
    if (error?.response?.status === 410)
        return '\u5458\u5de5\u5019\u9009\u9879\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u67e5\u8be2\u3002';
    return error?.response?.data?.detail || '\u5458\u5de5\u4fe1\u606f\u67e5\u8be2\u5931\u8d25\u3002';
}
function isEmployeeProfileCard(item) {
    return item.result?.type === 'employee_profile_result' || item.result?.type === 'employee_profile_candidates';
}
async function chooseEmployeeProfileCandidate(item, selectionHandle) {
    if (!conversationId.value || item.result?.type !== 'employee_profile_candidates') {
        item.result = undefined;
        item.content = '\u5458\u5de5\u5019\u9009\u9879\u5df2\u8fc7\u671f\uff0c\u8bf7\u91cd\u65b0\u67e5\u8be2\u3002';
        return;
    }
    selectingEmployeeProfileMessageId.value = item.id;
    try {
        const result = await aiApi.consumeControlledAction(conversationId.value, {
            action_type: 'employee.profile.select_candidate',
            selection_handle: selectionHandle,
        });
        if (result.conversation_id)
            conversationId.value = result.conversation_id;
        item.content = result.answer;
        item.traceId = result.trace_id;
        item.result = result.result;
    }
    catch (error) {
        const detail = controlledActionErrorDetail(error);
        item.result = undefined;
        item.content = detail;
        ElMessage.warning(detail);
    }
    finally {
        selectingEmployeeProfileMessageId.value = null;
        scrollToBottom();
    }
}
async function sendMessage(text = input.value, selectedEmployeeId = null, showUserMessage = true) {
    if (sending.value)
        return;
    const message = text.trim();
    if (!message) {
        ElMessage.warning('请先输入要让 AI 处理的事情');
        return;
    }
    if (showUserMessage) {
        messages.value.push({ id: ++messageId, role: 'user', content: message });
    }
    input.value = '';
    sending.value = true;
    scrollToBottom();
    try {
        const result = await aiApi.chat({
            message,
            page_path: route.fullPath,
            conversation_id: conversationId.value,
            history: chatHistory(),
            selected_employee_id: selectedEmployeeId,
        });
        if (result.conversation_id) {
            conversationId.value = result.conversation_id;
        }
        const actions = result.result.actions;
        messages.value.push({
            id: ++messageId,
            role: 'assistant',
            content: result.answer,
            traceId: result.trace_id,
            result: result.result,
        });
        runAutoActions(actions);
        scrollToBottom();
    }
    catch (e) {
        const detail = e?.code === 'ECONNABORTED'
            ? '模型响应超时，请稍后重试。'
            : e?.response?.data?.detail || 'AI 处理失败';
        messages.value.push({ id: ++messageId, role: 'assistant', content: detail });
        ElMessage.error(detail);
        scrollToBottom();
    }
    finally {
        sending.value = false;
    }
}
function clearAutomationRuleDraft(item) {
    if (item.result?.type === 'automation_rule_draft') {
        item.result = undefined;
    }
}
function handleArtifactSaved(item) {
    ElMessage.success('自动化规则已保存，请在自动化规则页面查看');
    clearAutomationRuleDraft(item);
}
function handleArtifactDismissed(item) {
    clearAutomationRuleDraft(item);
}
function handleKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['user']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    ...{ class: "global-ai-trigger" },
    type: "primary",
    circle: true,
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    ...{ class: "global-ai-trigger" },
    type: "primary",
    circle: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.openAssistant)
};
__VLS_3.slots.default;
const __VLS_8 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.MagicStick;
/** @type {[typeof __VLS_components.MagicStick, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
var __VLS_11;
var __VLS_3;
const __VLS_16 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    modelValue: (__VLS_ctx.open),
    title: "全局 AI 助手",
    size: "620px",
    appendToBody: true,
    ...{ class: "global-ai-drawer" },
}));
const __VLS_18 = __VLS_17({
    modelValue: (__VLS_ctx.open),
    title: "全局 AI 助手",
    size: "620px",
    appendToBody: true,
    ...{ class: "global-ai-drawer" },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-chat" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ref: "threadRef",
    ...{ class: "chat-thread" },
});
/** @type {typeof __VLS_ctx.threadRef} */ ;
if (!__VLS_ctx.messages.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-empty" },
    });
}
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.messages))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (item.id),
        ...{ class: "chat-message" },
        ...{ class: ([item.role, { 'employee-profile-message': __VLS_ctx.isEmployeeProfileCard(item) }]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-bubble" },
    });
    if (!__VLS_ctx.isEmployeeProfileCard(item)) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-content" },
        });
        (item.content);
    }
    if (item.result?.type === 'compensation_preview') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.result.data.compensation.employee.name || item.result.data.compensation.employee.employee_no);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.result.data.compensation.leave_date || '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.result.data.compensation.plan);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (__VLS_ctx.formatMoney(item.result.data.compensation.total_amount));
    }
    if (__VLS_ctx.messageCandidates(item).length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "candidate-list" },
        });
        for (const [candidate] of __VLS_getVForSourceType((__VLS_ctx.messageCandidates(item)))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.messageCandidates(item).length))
                            return;
                        __VLS_ctx.chooseCandidate(candidate);
                    } },
                key: (candidate.id),
                type: "button",
                ...{ class: "candidate-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.employeeTitle(candidate));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (candidate.company || '--');
            (candidate.department || '--');
        }
    }
    if (item.result?.actions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-list" },
        });
        for (const [action] of __VLS_getVForSourceType((item.result.actions))) {
            const __VLS_20 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                ...{ 'onClick': {} },
                key: (`${action.type}-${action.route || action.label}`),
                size: "small",
                type: "primary",
                plain: true,
            }));
            const __VLS_22 = __VLS_21({
                ...{ 'onClick': {} },
                key: (`${action.type}-${action.route || action.label}`),
                size: "small",
                type: "primary",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
            let __VLS_24;
            let __VLS_25;
            let __VLS_26;
            const __VLS_27 = {
                onClick: (...[$event]) => {
                    if (!(item.result?.actions.length))
                        return;
                    __VLS_ctx.runAction(action);
                }
            };
            __VLS_23.slots.default;
            (action.label);
            var __VLS_23;
        }
    }
    if (item.result?.type === 'automation_rule_draft') {
        /** @type {[typeof AutomationRuleArtifactPreview, ]} */ ;
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent(AutomationRuleArtifactPreview, new AutomationRuleArtifactPreview({
            ...{ 'onSaved': {} },
            ...{ 'onDismissed': {} },
            artifact: (item.result.data),
        }));
        const __VLS_29 = __VLS_28({
            ...{ 'onSaved': {} },
            ...{ 'onDismissed': {} },
            artifact: (item.result.data),
        }, ...__VLS_functionalComponentArgsRest(__VLS_28));
        let __VLS_31;
        let __VLS_32;
        let __VLS_33;
        const __VLS_34 = {
            onSaved: (...[$event]) => {
                if (!(item.result?.type === 'automation_rule_draft'))
                    return;
                __VLS_ctx.handleArtifactSaved(item);
            }
        };
        const __VLS_35 = {
            onDismissed: (...[$event]) => {
                if (!(item.result?.type === 'automation_rule_draft'))
                    return;
                __VLS_ctx.handleArtifactDismissed(item);
            }
        };
        var __VLS_30;
    }
    if (item.result?.type === 'compensation_comparison') {
        /** @type {[typeof CompensationComparisonCard, ]} */ ;
        // @ts-ignore
        const __VLS_36 = __VLS_asFunctionalComponent(CompensationComparisonCard, new CompensationComparisonCard({
            result: (item.result.data),
        }));
        const __VLS_37 = __VLS_36({
            result: (item.result.data),
        }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    }
    if (item.result?.type === 'data_compare_result') {
        /** @type {[typeof CompareResultCard, ]} */ ;
        // @ts-ignore
        const __VLS_39 = __VLS_asFunctionalComponent(CompareResultCard, new CompareResultCard({
            result: (item.result.data),
        }));
        const __VLS_40 = __VLS_39({
            result: (item.result.data),
        }, ...__VLS_functionalComponentArgsRest(__VLS_39));
    }
    if (item.result?.type === 'employee_profile_result' || item.result?.type === 'employee_profile_candidates') {
        /** @type {[typeof EmployeeProfileResultCard, ]} */ ;
        // @ts-ignore
        const __VLS_42 = __VLS_asFunctionalComponent(EmployeeProfileResultCard, new EmployeeProfileResultCard({
            ...{ 'onSelect': {} },
            result: (item.result),
            loading: (__VLS_ctx.selectingEmployeeProfileMessageId === item.id),
        }));
        const __VLS_43 = __VLS_42({
            ...{ 'onSelect': {} },
            result: (item.result),
            loading: (__VLS_ctx.selectingEmployeeProfileMessageId === item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_42));
        let __VLS_45;
        let __VLS_46;
        let __VLS_47;
        const __VLS_48 = {
            onSelect: (...[$event]) => {
                if (!(item.result?.type === 'employee_profile_result' || item.result?.type === 'employee_profile_candidates'))
                    return;
                __VLS_ctx.chooseEmployeeProfileCandidate(item, $event);
            }
        };
        var __VLS_44;
    }
}
if (__VLS_ctx.sending) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-message assistant" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "chat-bubble" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-send-box" },
});
const __VLS_49 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.input),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "例如：帮我计算张三 2026-06-30 N+1 补偿金",
}));
const __VLS_51 = __VLS_50({
    ...{ 'onKeydown': {} },
    modelValue: (__VLS_ctx.input),
    ...{ class: "ai-send-input" },
    type: "textarea",
    autosize: ({ minRows: 1, maxRows: 3 }),
    resize: "none",
    placeholder: "例如：帮我计算张三 2026-06-30 N+1 补偿金",
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
let __VLS_53;
let __VLS_54;
let __VLS_55;
const __VLS_56 = {
    onKeydown: (__VLS_ctx.handleKeydown)
};
var __VLS_52;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ai-send-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_57 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    ...{ 'onClick': {} },
    ...{ class: "send-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.sending),
}));
const __VLS_59 = __VLS_58({
    ...{ 'onClick': {} },
    ...{ class: "send-button" },
    type: "primary",
    circle: true,
    loading: (__VLS_ctx.sending),
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
let __VLS_61;
let __VLS_62;
let __VLS_63;
const __VLS_64 = {
    onClick: (...[$event]) => {
        __VLS_ctx.sendMessage();
    }
};
__VLS_60.slots.default;
const __VLS_65 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({}));
const __VLS_67 = __VLS_66({}, ...__VLS_functionalComponentArgsRest(__VLS_66));
__VLS_68.slots.default;
const __VLS_69 = {}.Position;
/** @type {[typeof __VLS_components.Position, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({}));
const __VLS_71 = __VLS_70({}, ...__VLS_functionalComponentArgsRest(__VLS_70));
var __VLS_68;
var __VLS_60;
var __VLS_19;
/** @type {[typeof DocumentActionPreview, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(DocumentActionPreview, new DocumentActionPreview({
    ref: "documentActionRef",
}));
const __VLS_74 = __VLS_73({
    ref: "documentActionRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
/** @type {typeof __VLS_ctx.documentActionRef} */ ;
var __VLS_76 = {};
var __VLS_75;
/** @type {__VLS_StyleScopedClasses['global-ai-trigger']} */ ;
/** @type {__VLS_StyleScopedClasses['global-ai-drawer']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-chat']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-content']} */ ;
/** @type {__VLS_StyleScopedClasses['result-card']} */ ;
/** @type {__VLS_StyleScopedClasses['result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['result-row']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-list']} */ ;
/** @type {__VLS_StyleScopedClasses['candidate-item']} */ ;
/** @type {__VLS_StyleScopedClasses['action-list']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-box']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['send-button']} */ ;
// @ts-ignore
var __VLS_77 = __VLS_76;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MagicStick: MagicStick,
            Position: Position,
            DocumentActionPreview: DocumentActionPreview,
            AutomationRuleArtifactPreview: AutomationRuleArtifactPreview,
            CompareResultCard: CompareResultCard,
            CompensationComparisonCard: CompensationComparisonCard,
            EmployeeProfileResultCard: EmployeeProfileResultCard,
            open: open,
            input: input,
            sending: sending,
            threadRef: threadRef,
            documentActionRef: documentActionRef,
            messages: messages,
            selectingEmployeeProfileMessageId: selectingEmployeeProfileMessageId,
            messageCandidates: messageCandidates,
            openAssistant: openAssistant,
            formatMoney: formatMoney,
            employeeTitle: employeeTitle,
            runAction: runAction,
            chooseCandidate: chooseCandidate,
            isEmployeeProfileCard: isEmployeeProfileCard,
            chooseEmployeeProfileCandidate: chooseEmployeeProfileCandidate,
            sendMessage: sendMessage,
            handleArtifactSaved: handleArtifactSaved,
            handleArtifactDismissed: handleArtifactDismissed,
            handleKeydown: handleKeydown,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
