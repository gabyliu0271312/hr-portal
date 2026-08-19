import { ref, computed, watch, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import { Promotion, Bell, ChatDotRound, User, Connection, ArrowLeft, ArrowRight, Close, Check, ArrowDown } from '@element-plus/icons-vue';
import { feishuApi } from '@/api/feishu';
import { usersApi } from '@/api/users';
const actionTypeDefs = [
    {
        value: 'feishu_send_message',
        label: '发送飞书消息',
        desc: '向指定用户或群聊发送飞书通知消息',
        icon: Promotion,
    },
];
const props = defineProps();
const emit = defineEmits();
const currentStep = ref('select');
const selectedType = ref('feishu_send_message');
const isVisible = ref(false);
const isClosing = ref(false);
const receiverCheckOptions = [
    { key: 'fixed_users', label: '指定成员或部门', desc: '选择系统用户', icon: User, inputType: 'users', placeholder: '搜索并选择系统用户...' },
    { key: 'fixed_chats', label: '群消息', desc: '选择飞书群聊发送消息', icon: ChatDotRound, inputType: 'chats', placeholder: '搜索并选择飞书群...' },
    { key: 'employee_field_user', label: '私信每个群成员', desc: '根据花名册字段匹配用户后逐个私信', icon: Connection, inputType: 'text', placeholder: '花名册字段名，如 direct_supervisor' },
];
// 已勾选的类型集合
const checkedReceiverKeys = ref(new Set());
// 每个类型的输入值
const receiverInputValues = ref({});
function toggleReceiverKey(key) {
    const newSet = new Set(checkedReceiverKeys.value);
    if (newSet.has(key)) {
        newSet.delete(key);
        delete receiverInputValues.value[key];
    }
    else {
        newSet.add(key);
        // 初始化默认值
        const opt = receiverCheckOptions.find(o => o.key === key);
        if (opt?.inputType === 'users' || opt?.inputType === 'chats') {
            receiverInputValues.value[key] = [];
        }
        else {
            receiverInputValues.value[key] = '';
        }
    }
    checkedReceiverKeys.value = newSet;
}
function updateReceiverValue(key, val) {
    receiverInputValues.value[key] = val;
}
// 消息
const messageFormat = ref('markdown');
const titleTemplate = ref('');
const contentTemplate = ref('{{trigger_event.event_type}} 事件触发');
const hasCardButton = ref(false);
const cardButtonText = ref('查看详情');
const cardButtonUrl = ref('');
const requireCompletion = ref(false);
const testContextJson = ref('');
const testing = ref(false);
const testResult = ref(null);
const actionName = ref('');
const userOptions = ref([]);
const chatOptions = ref([]);
const dataLoading = ref(false);
const mentionUserOptions = ref([]);
const showMentionDropdown = ref(false);
const mentionSearch = ref('');
const mentionFilterOptions = ref([]);
const mentionDropdownStyle = ref({});
const mentionSearchInputRef = ref(null);
// 监听 textarea 输入，检测 @ 触发
function handleContentInput(e) {
    const el = e.target;
    contentTemplate.value = el.value;
    const cursorPos = el.selectionStart ?? 0;
    const textBeforeCursor = el.value.slice(0, cursorPos);
    const lastChar = textBeforeCursor.slice(-1);
    if (lastChar === '@') {
        showMentionDropdown.value = true;
        mentionSearch.value = '';
        mentionFilterOptions.value = mentionUserOptions.value
            .filter(u => u.feishu_user_id)
            .map(u => ({ label: u.label, value: u.feishu_user_id }));
        nextTick(() => { mentionSearchInputRef.value?.focus(); });
    }
}
function openMentionDropdown() {
    showMentionDropdown.value = true;
    mentionSearch.value = '';
    mentionFilterOptions.value = mentionUserOptions.value
        .filter(u => u.feishu_user_id)
        .map(u => ({ label: u.label, value: u.feishu_user_id }));
    nextTick(() => { mentionSearchInputRef.value?.focus(); });
}
function filterMentionOptions() {
    const q = mentionSearch.value.toLowerCase();
    mentionFilterOptions.value = mentionUserOptions.value
        .filter(u => u.feishu_user_id && u.label.toLowerCase().includes(q))
        .map(u => ({ label: u.label, value: u.feishu_user_id }));
}
function selectMention(feishuUserId, label) {
    const el = textareaRef.value;
    if (!el)
        return;
    const cursorPos = el.selectionStart ?? 0;
    const text = contentTemplate.value;
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
        const before = text.slice(0, atIndex);
        const after = text.slice(cursorPos);
        const newText = `${before}<at user_id="${feishuUserId}">@${label}</at>${after}`;
        contentTemplate.value = newText;
        showMentionDropdown.value = false;
        nextTick(() => {
            el.focus();
            const newPos = atIndex + `<at user_id="${feishuUserId}">@${label}</at>`.length;
            el.selectionStart = newPos;
            el.selectionEnd = newPos;
        });
    }
}
// 修改 fetchOptions 获取 feishu_user_id
async function fetchOptions() {
    dataLoading.value = true;
    try {
        const [usersResp, targets] = await Promise.all([
            usersApi.list({ page_size: 100 }),
            feishuApi.listChatTargets().catch(() => []),
        ]);
        const items = (usersResp.items || []);
        userOptions.value = items.map((u) => ({
            label: `${u.display_name || u.login_name}`,
            value: u.id,
        }));
        // 为 @ 提及单独存一份含 feishu_user_id 的列表
        mentionUserOptions.value = items.map((u) => ({
            label: `${u.display_name || u.login_name}`,
            value: String(u.id),
            feishu_user_id: u.feishu_user_id || null,
        }));
        chatOptions.value = targets.map((t) => ({
            label: `${t.name} (${t.chat_id})`,
            value: t.chat_id,
        }));
    }
    catch (_e) {
    }
    finally {
        dataLoading.value = false;
    }
}
// ── 富文本工具栏 ─────────────────────────────────────
const textareaRef = ref(null);
const availableVariables = [
    { name: 'trigger_event.event_type', desc: '触发事件类型' },
    { name: 'trigger_event.timestamp', desc: '触发时间' },
    { name: 'trigger_event.biz_id', desc: '业务 ID' },
    { name: 'trigger_event.biz_name', desc: '业务名称' },
    { name: 'rule.name', desc: '规则名称' },
];
function wrapSelection(wrapper) {
    const el = textareaRef.value;
    if (!el)
        return;
    const start = el.selectionStart, end = el.selectionEnd;
    const text = contentTemplate.value;
    const selected = text.slice(start, end);
    const mid = wrapper[0] + selected + wrapper[1];
    contentTemplate.value = text.slice(0, start) + mid + text.slice(end);
    nextTick(() => { el.focus(); el.selectionStart = el.selectionEnd = start + mid.length; });
}
function toolbarBold() { wrapSelection(['**', '**']); }
function toolbarItalic() { wrapSelection(['*', '*']); }
function toolbarCode() { wrapSelection(['`', '`']); }
function toolbarLink() {
    const url = prompt('输入链接地址：', 'https://');
    if (url)
        wrapSelection(['[', `](${url})`]);
}
function toolbarHr() { contentTemplate.value += '\n\n---\n'; }
function toolbarBullet() {
    const el = textareaRef.value;
    if (!el) {
        contentTemplate.value += '- ';
        return;
    }
    const lines = contentTemplate.value.split('\n');
    const idx = contentTemplate.value.slice(0, el.selectionStart).split('\n').length - 1;
    lines[idx] = '- ' + lines[idx];
    contentTemplate.value = lines.join('\n');
}
function insertVariable(variable) {
    contentTemplate.value += `{{${variable}}}`;
}
// ── 手机预览 ─────────────────────────────────────────
const contentPreview = computed(() => {
    let text = contentTemplate.value || '（空消息）';
    availableVariables.forEach(v => { text = text.replaceAll(`{{${v.name}}}`, `[${v.desc}]`); });
    return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
        .replace(/`(.+?)`/g, '$1').replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/^-\s/gm, '• ').replace(/^#{1,6}\s/gm, '');
});
// ── 向导状态管理 ─────────────────────────────────────
watch(() => props.modelValue, (val) => {
    if (val) {
        isVisible.value = true;
        isClosing.value = false;
        if (props.editConfig) {
            selectedType.value = props.editConfig.type || 'feishu_send_message';
            currentStep.value = 'configure';
            // 回填配置
            const cfg = props.editConfig.config || {};
            // 回填接收人：从 receivers 数组转为 checkbox 模式
            const savedReceivers = (cfg.receivers || []);
            const keys = new Set();
            const inputs = {};
            for (const rcv of savedReceivers) {
                const rtype = rcv.type;
                keys.add(rtype);
                if (rtype === 'fixed_users')
                    inputs[rtype] = rcv.user_ids || [];
                else if (rtype === 'fixed_chats')
                    inputs[rtype] = rcv.chat_ids || [];
                else if (rtype === 'employee_field_user')
                    inputs[rtype] = rcv.target_field || '';
                else if (rtype === 'employee_department_manager')
                    inputs[rtype] = rcv.department_field || '';
                else
                    inputs[rtype] = rcv;
            }
            checkedReceiverKeys.value = keys;
            receiverInputValues.value = inputs;
            const msg = cfg.message || {};
            messageFormat.value = msg.message_format || 'markdown';
            titleTemplate.value = msg.title_template || '';
            contentTemplate.value = msg.content_template || '{{trigger_event.event_type}} 事件触发';
            hasCardButton.value = cfg.card_button?.enabled ?? false;
            cardButtonText.value = cfg.card_button?.text || '查看详情';
            cardButtonUrl.value = cfg.card_button?.url || '';
            requireCompletion.value = cfg.require_completion ?? false;
            // 回填动作名称（兼容旧数据）
            actionName.value = props.editConfig?.name || '';
        }
        else {
            selectedType.value = 'feishu_send_message';
            currentStep.value = 'select';
            resetConfig();
        }
        fetchOptions();
        nextTick(() => { isVisible.value = true; });
    }
    else {
        closeWizard();
    }
});
function resetConfig() {
    checkedReceiverKeys.value = new Set();
    receiverInputValues.value = {};
    messageFormat.value = 'markdown';
    titleTemplate.value = '';
    contentTemplate.value = '{{trigger_event.event_type}} 事件触发';
    hasCardButton.value = false;
    cardButtonText.value = '查看详情';
    cardButtonUrl.value = '';
    requireCompletion.value = false;
    // actionName/actionEnabled 不再重置（用默认值）
}
function closeWizard() {
    isClosing.value = true;
    setTimeout(() => {
        isVisible.value = false;
        isClosing.value = false;
        emit('update:modelValue', false);
    }, 280);
}
function goToConfigure() {
    if (!selectedType.value)
        return;
    currentStep.value = 'configure';
}
function goBackToSelect() { currentStep.value = 'select'; }
function buildReceiversFromForm() {
    const builtReceivers = [];
    for (const key of checkedReceiverKeys.value) {
        const val = receiverInputValues.value[key];
        if (key === 'fixed_users')
            builtReceivers.push({ type: 'fixed_users', user_ids: val || [] });
        else if (key === 'fixed_chats')
            builtReceivers.push({ type: 'fixed_chats', chat_ids: val || [] });
        else if (key === 'employee_field_user')
            builtReceivers.push({ type: 'employee_field_user', target_field: val || '' });
        else if (key === 'employee_department_manager')
            builtReceivers.push({ type: 'employee_department_manager', department_field: val || '' });
    }
    return builtReceivers;
}
function buildMessageConfig() {
    return {
        message_format: messageFormat.value,
        title_template: titleTemplate.value,
        content_template: contentTemplate.value,
        resources: [],
    };
}
function buildNotificationConfig() {
    return {
        enabled: true,
        receivers: buildReceiversFromForm(),
        message: buildMessageConfig(),
        require_completion: requireCompletion.value,
        card_button: {
            enabled: hasCardButton.value,
            text: cardButtonText.value || '查看详情',
            url: cardButtonUrl.value || '',
        },
    };
}
async function handleTestSend() {
    testing.value = true;
    testResult.value = null;
    try {
        let context = {};
        if (testContextJson.value.trim()) {
            try {
                context = JSON.parse(testContextJson.value);
            }
            catch {
                ElMessage.warning('测试上下文 JSON 格式不正确，已忽略');
            }
        }
        const preview = await feishuApi.previewMessage({
            message: buildMessageConfig(),
            context,
        });
        const result = await feishuApi.testSend({
            config: buildNotificationConfig(),
            context,
        });
        testResult.value = {
            ...result,
            preview: {
                rendered_title: preview.rendered_title,
                rendered_content: preview.rendered_content,
                missing_variables: preview.missing_variables || [],
            },
        };
        if (result.ok) {
            ElMessage.success(`测试发送完成：${result.success_count} 成功${result.failed_count > 0 ? `，${result.failed_count} 失败` : ''}`);
        }
        else {
            ElMessage.error('测试发送失败：' + (result.errors?.[0] || '未知错误'));
        }
    }
    catch (e) {
        const detail = e?.response?.data?.detail || e?.message || '未知错误';
        ElMessage.error('测试发送异常：' + detail);
    }
    finally {
        testing.value = false;
    }
}
async function handleConfirm() {
    // ── 动作名称：使用类型标签作默认名称（规则级名称已在首页编辑）────────────────────
    const actionTypeDef = actionTypeDefs.find(d => d.value === selectedType.value);
    const defaultName = actionTypeDef?.label || selectedType.value;
    const trimmedName = (actionName.value || "").trim() || defaultName;
    // ── 完整校验（动作始终由规则级启用控制，无需动作级开关）────────────────────
    // 从 checkbox 模型构建 receivers 数组
    const builtReceivers = [];
    for (const key of checkedReceiverKeys.value) {
        const val = receiverInputValues.value[key];
        if (key === 'fixed_users')
            builtReceivers.push({ type: 'fixed_users', user_ids: val || [] });
        else if (key === 'fixed_chats')
            builtReceivers.push({ type: 'fixed_chats', chat_ids: val || [] });
        else if (key === 'employee_field_user')
            builtReceivers.push({ type: 'employee_field_user', target_field: val || '' });
        else if (key === 'employee_department_manager')
            builtReceivers.push({ type: 'employee_department_manager', department_field: val || '' });
    }
    const messageConfig = {
        message_format: messageFormat.value,
        title_template: titleTemplate.value,
        content_template: contentTemplate.value,
        resources: [],
    };
    // 保存前强制走后端 preview 校验（仅飞书消息动作）
    if (selectedType.value === 'feishu_send_message') {
        try {
            const preview = await feishuApi.previewMessage({
                message: messageConfig,
                context: {},
            });
            if (preview.missing_variables && preview.missing_variables.length > 0) {
                const warn = `消息模板包含未知变量：${preview.missing_variables.join(', ')}，请确认变量名是否正确`;
                if (!confirm(warn + '\n\n是否仍要保存？'))
                    return;
            }
        }
        catch (e) {
            const detail = e?.response?.data?.detail || '后端预览接口异常';
            if (!confirm(`消息预览校验失败：${detail}\n\n是否仍要保存？`))
                return;
        }
    }
    const config = {
        receivers: builtReceivers,
        message: messageConfig,
        require_completion: requireCompletion.value,
        card_button: {
            enabled: hasCardButton.value,
            text: cardButtonText.value || '查看详情',
            url: cardButtonUrl.value || '',
        },
    };
    emit('confirm', {
        type: selectedType.value,
        name: trimmedName,
        enabled: true,
        config,
    });
    closeWizard();
}
// ── 步骤指示器 ───────────────────────────────────────
const steps = [
    { key: 'select', label: '选择动作类型' },
    { key: 'configure', label: '配置通知详情' },
];
const currentStepIndex = computed(() => steps.findIndex(s => s.key === currentStep.value));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['wizard-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-line']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-body']} */ ;
/** @type {__VLS_StyleScopedClasses['action-type-card']} */ ;
/** @type {__VLS_StyleScopedClasses['action-type-card']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['check-box']} */ ;
/** @type {__VLS_StyleScopedClasses['checked']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['checked']} */ ;
/** @type {__VLS_StyleScopedClasses['check-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-option']} */ ;
/** @type {__VLS_StyleScopedClasses['fmt-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "wizard-fade",
}));
const __VLS_6 = __VLS_5({
    name: "wizard-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
if (__VLS_ctx.isVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "wizard-overlay" },
        ...{ class: ({ closing: __VLS_ctx.isClosing }) },
    });
    const __VLS_8 = {}.Transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        name: "wizard-slide",
    }));
    const __VLS_10 = __VLS_9({
        name: "wizard-slide",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    if (__VLS_ctx.isVisible && !__VLS_ctx.isClosing) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-panel wide" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-header-left" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.closeWizard) },
            ...{ class: "wizard-back-btn" },
        });
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            size: (20),
        }));
        const __VLS_14 = __VLS_13({
            size: (20),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = {}.Close;
        /** @type {[typeof __VLS_components.Close, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-title" },
        });
        (props.editConfig ? '编辑通知动作' : '添加通知动作');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "step-indicator" },
        });
        for (const [step, i] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (step.key),
                ...{ class: "step-dot" },
                ...{ class: ({ active: i <= __VLS_ctx.currentStepIndex, current: i === __VLS_ctx.currentStepIndex }) },
            });
            if (i < __VLS_ctx.currentStepIndex) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "step-check" },
                });
                const __VLS_20 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                    size: (12),
                }));
                const __VLS_22 = __VLS_21({
                    size: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_21));
                __VLS_23.slots.default;
                const __VLS_24 = {}.Check;
                /** @type {[typeof __VLS_components.Check, ]} */ ;
                // @ts-ignore
                const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
                const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
                var __VLS_23;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "step-num" },
                });
                (i + 1);
            }
        }
        for (const [i] of __VLS_getVForSourceType((__VLS_ctx.steps.length - 1))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: ('line-' + i),
                ...{ class: "step-line" },
                ...{ class: ({ filled: i <= __VLS_ctx.currentStepIndex }) },
            });
        }
        if (__VLS_ctx.currentStep === 'select') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wizard-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "wizard-desc" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "action-type-grid" },
            });
            for (const [def] of __VLS_getVForSourceType((__VLS_ctx.actionTypeDefs))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.isVisible))
                                return;
                            if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                                return;
                            if (!(__VLS_ctx.currentStep === 'select'))
                                return;
                            __VLS_ctx.selectedType = def.value;
                            __VLS_ctx.goToConfigure();
                        } },
                    key: (def.value),
                    ...{ class: "action-type-card" },
                    ...{ class: ({ active: __VLS_ctx.selectedType === def.value }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "atc-icon" },
                    ...{ class: ({ highlight: __VLS_ctx.selectedType === def.value }) },
                });
                const __VLS_28 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                    size: (28),
                }));
                const __VLS_30 = __VLS_29({
                    size: (28),
                }, ...__VLS_functionalComponentArgsRest(__VLS_29));
                __VLS_31.slots.default;
                const __VLS_32 = ((def.icon));
                // @ts-ignore
                const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
                const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
                var __VLS_31;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "atc-body" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "atc-title" },
                });
                (def.label);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "atc-desc" },
                });
                (def.desc);
                if (__VLS_ctx.selectedType === def.value) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "atc-check" },
                    });
                    const __VLS_36 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                        size: (14),
                    }));
                    const __VLS_38 = __VLS_37({
                        size: (14),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
                    __VLS_39.slots.default;
                    const __VLS_40 = {}.Check;
                    /** @type {[typeof __VLS_components.Check, ]} */ ;
                    // @ts-ignore
                    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
                    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
                    var __VLS_39;
                }
            }
        }
        if (__VLS_ctx.currentStep === 'configure') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wizard-body config-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-dual-layout" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-col" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-sticky" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-label" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-frame" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-topbar" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-time" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-content" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-msg" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-msg-icon" },
            });
            const __VLS_44 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                size: (18),
            }));
            const __VLS_46 = __VLS_45({
                size: (18),
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            __VLS_47.slots.default;
            const __VLS_48 = {}.Bell;
            /** @type {[typeof __VLS_components.Bell, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
            const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
            var __VLS_47;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-msg-title" },
            });
            (__VLS_ctx.titleTemplate || '通知标题');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-msg-body" },
                ...{ style: {} },
            });
            (__VLS_ctx.contentPreview);
            if (__VLS_ctx.hasCardButton) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "phone-card-btn" },
                });
                (__VLS_ctx.cardButtonText || '查看详情');
                const __VLS_52 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
                    size: (12),
                }));
                const __VLS_54 = __VLS_53({
                    size: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_53));
                __VLS_55.slots.default;
                const __VLS_56 = {}.ArrowDown;
                /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
                // @ts-ignore
                const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
                const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
                var __VLS_55;
            }
            if (__VLS_ctx.requireCompletion) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "phone-completion-btn" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-msg-time" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-bottombar" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-nav-item active" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-nav-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "phone-nav-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "form-col" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "wiz-section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "required-star" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "receiver-check-list" },
            });
            for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.receiverCheckOptions))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (opt.key),
                    ...{ class: "receiver-check-row" },
                    ...{ class: ({ expanded: __VLS_ctx.checkedReceiverKeys.has(opt.key) }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "receiver-check-item" },
                    ...{ class: ({ checked: __VLS_ctx.checkedReceiverKeys.has(opt.key) }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "check-box" },
                    ...{ class: ({ checked: __VLS_ctx.checkedReceiverKeys.has(opt.key) }) },
                });
                if (__VLS_ctx.checkedReceiverKeys.has(opt.key)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ class: "check-icon" },
                        viewBox: "0 0 12 12",
                        width: "10",
                        height: "10",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "M2 6l3 3 5-5",
                        stroke: "#fff",
                        'stroke-width': "1.8",
                        fill: "none",
                        'stroke-linecap': "round",
                        'stroke-linejoin': "round",
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "check-label" },
                });
                (opt.label);
                if (opt.desc) {
                    const __VLS_60 = {}.ElTooltip;
                    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
                    // @ts-ignore
                    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                        content: (opt.desc),
                        placement: "top",
                    }));
                    const __VLS_62 = __VLS_61({
                        content: (opt.desc),
                        placement: "top",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
                    __VLS_63.slots.default;
                    const __VLS_64 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
                        ...{ class: "check-info" },
                    }));
                    const __VLS_66 = __VLS_65({
                        ...{ class: "check-info" },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
                    __VLS_67.slots.default;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({
                        ...{ style: {} },
                    });
                    var __VLS_67;
                    var __VLS_63;
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    ...{ onChange: (...[$event]) => {
                            if (!(__VLS_ctx.isVisible))
                                return;
                            if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                                return;
                            if (!(__VLS_ctx.currentStep === 'configure'))
                                return;
                            __VLS_ctx.toggleReceiverKey(opt.key);
                        } },
                    type: "checkbox",
                    checked: (__VLS_ctx.checkedReceiverKeys.has(opt.key)),
                    ...{ class: "check-input" },
                });
                if (__VLS_ctx.checkedReceiverKeys.has(opt.key)) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "receiver-field-inline" },
                    });
                    if (opt.inputType === 'users') {
                        const __VLS_68 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || []),
                            multiple: true,
                            filterable: true,
                            placeholder: (opt.placeholder),
                            loading: (__VLS_ctx.dataLoading),
                            ...{ style: {} },
                        }));
                        const __VLS_70 = __VLS_69({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || []),
                            multiple: true,
                            filterable: true,
                            placeholder: (opt.placeholder),
                            loading: (__VLS_ctx.dataLoading),
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
                        let __VLS_72;
                        let __VLS_73;
                        let __VLS_74;
                        const __VLS_75 = {
                            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiverValue(opt.key, val))
                        };
                        __VLS_71.slots.default;
                        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.userOptions))) {
                            const __VLS_76 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
                                key: (o.value),
                                label: (o.label),
                                value: (o.value),
                            }));
                            const __VLS_78 = __VLS_77({
                                key: (o.value),
                                label: (o.label),
                                value: (o.value),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_77));
                        }
                        var __VLS_71;
                    }
                    else if (opt.inputType === 'chats') {
                        const __VLS_80 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || []),
                            multiple: true,
                            filterable: true,
                            placeholder: (opt.placeholder),
                            loading: (__VLS_ctx.dataLoading),
                            ...{ style: {} },
                        }));
                        const __VLS_82 = __VLS_81({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || []),
                            multiple: true,
                            filterable: true,
                            placeholder: (opt.placeholder),
                            loading: (__VLS_ctx.dataLoading),
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
                        let __VLS_84;
                        let __VLS_85;
                        let __VLS_86;
                        const __VLS_87 = {
                            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiverValue(opt.key, val))
                        };
                        __VLS_83.slots.default;
                        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.chatOptions))) {
                            const __VLS_88 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                                key: (o.value),
                                label: (o.label),
                                value: (o.value),
                            }));
                            const __VLS_90 = __VLS_89({
                                key: (o.value),
                                label: (o.label),
                                value: (o.value),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
                        }
                        var __VLS_83;
                    }
                    else {
                        const __VLS_92 = {}.ElInput;
                        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                        // @ts-ignore
                        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || ''),
                            placeholder: (opt.placeholder),
                            size: "default",
                        }));
                        const __VLS_94 = __VLS_93({
                            ...{ 'onUpdate:modelValue': {} },
                            modelValue: (__VLS_ctx.receiverInputValues[opt.key] || ''),
                            placeholder: (opt.placeholder),
                            size: "default",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_93));
                        let __VLS_96;
                        let __VLS_97;
                        let __VLS_98;
                        const __VLS_99 = {
                            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiverValue(opt.key, val))
                        };
                        var __VLS_95;
                    }
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "wiz-section-title" },
            });
            const __VLS_100 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                modelValue: (__VLS_ctx.titleTemplate),
                placeholder: "如：{{rule.name}} — 通知",
                size: "small",
            }));
            const __VLS_102 = __VLS_101({
                modelValue: (__VLS_ctx.titleTemplate),
                placeholder: "如：{{rule.name}} — 通知",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_101));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "wiz-section-title" },
            });
            const __VLS_104 = {}.ElDropdown;
            /** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                trigger: "click",
            }));
            const __VLS_106 = __VLS_105({
                trigger: "click",
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
            __VLS_107.slots.default;
            const __VLS_108 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                size: "small",
                plain: true,
            }));
            const __VLS_110 = __VLS_109({
                size: "small",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            const __VLS_112 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
            const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
            __VLS_115.slots.default;
            const __VLS_116 = {}.ArrowDown;
            /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
            const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
            var __VLS_115;
            var __VLS_111;
            {
                const { dropdown: __VLS_thisSlot } = __VLS_107.slots;
                const __VLS_120 = {}.ElDropdownMenu;
                /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
                // @ts-ignore
                const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
                const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
                __VLS_123.slots.default;
                for (const [v] of __VLS_getVForSourceType((__VLS_ctx.availableVariables))) {
                    const __VLS_124 = {}.ElDropdownItem;
                    /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
                    // @ts-ignore
                    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                        ...{ 'onClick': {} },
                        key: (v.name),
                    }));
                    const __VLS_126 = __VLS_125({
                        ...{ 'onClick': {} },
                        key: (v.name),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
                    let __VLS_128;
                    let __VLS_129;
                    let __VLS_130;
                    const __VLS_131 = {
                        onClick: (...[$event]) => {
                            if (!(__VLS_ctx.isVisible))
                                return;
                            if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                                return;
                            if (!(__VLS_ctx.currentStep === 'configure'))
                                return;
                            __VLS_ctx.insertVariable(v.name);
                        }
                    };
                    __VLS_127.slots.default;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
                    (v.name);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ style: {} },
                    });
                    (v.desc);
                    var __VLS_127;
                }
                var __VLS_123;
            }
            var __VLS_107;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "richtext-toolbar" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarBold) },
                ...{ class: "tb-btn" },
                title: "加粗",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarItalic) },
                ...{ class: "tb-btn" },
                title: "斜体",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarCode) },
                ...{ class: "tb-btn" },
                title: "行内代码",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "tb-divider" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarLink) },
                ...{ class: "tb-btn" },
                title: "链接",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "2",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                d: "M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarHr) },
                ...{ class: "tb-btn" },
                title: "分割线",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.toolbarBullet) },
                ...{ class: "tb-btn" },
                title: "无序列表",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                'stroke-width': "2",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
                x1: "8",
                y1: "6",
                x2: "21",
                y2: "6",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
                x1: "8",
                y1: "12",
                x2: "21",
                y2: "12",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.line)({
                x1: "8",
                y1: "18",
                x2: "21",
                y2: "18",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                cx: "4",
                cy: "6",
                r: "1.5",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                cx: "4",
                cy: "12",
                r: "1.5",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
                cx: "4",
                cy: "18",
                r: "1.5",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "tb-divider" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (__VLS_ctx.openMentionDropdown) },
                ...{ class: "tb-btn" },
                title: "提及人员（@）",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "tb-divider" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "format-switch" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isVisible))
                            return;
                        if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                            return;
                        if (!(__VLS_ctx.currentStep === 'configure'))
                            return;
                        __VLS_ctx.messageFormat = 'text';
                    } },
                ...{ class: "fmt-btn" },
                ...{ class: ({ active: __VLS_ctx.messageFormat === 'text' }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.isVisible))
                            return;
                        if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                            return;
                        if (!(__VLS_ctx.currentStep === 'configure'))
                            return;
                        __VLS_ctx.messageFormat = 'markdown';
                    } },
                ...{ class: "fmt-btn" },
                ...{ class: ({ active: __VLS_ctx.messageFormat === 'markdown' }) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea, __VLS_intrinsicElements.textarea)({
                ...{ onInput: (__VLS_ctx.handleContentInput) },
                ref: "textareaRef",
                value: (__VLS_ctx.contentTemplate),
                ...{ class: "richtext-area" },
                ...{ class: ({ 'mode-markdown': __VLS_ctx.messageFormat === 'markdown' }) },
                placeholder: "输入消息内容，支持 Markdown 格式。输入 @ 可提及人员...",
                rows: "6",
            });
            /** @type {typeof __VLS_ctx.textareaRef} */ ;
            if (__VLS_ctx.showMentionDropdown) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mention-dropdown" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mention-search" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                    ...{ onInput: (__VLS_ctx.filterMentionOptions) },
                    ref: "mentionSearchInputRef",
                    placeholder: "搜索人员...",
                    ...{ class: "mention-search-input" },
                });
                (__VLS_ctx.mentionSearch);
                /** @type {typeof __VLS_ctx.mentionSearchInputRef} */ ;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mention-options" },
                });
                for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.mentionFilterOptions))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.isVisible))
                                    return;
                                if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                                    return;
                                if (!(__VLS_ctx.currentStep === 'configure'))
                                    return;
                                if (!(__VLS_ctx.showMentionDropdown))
                                    return;
                                __VLS_ctx.selectMention(opt.value, opt.label);
                            } },
                        key: (opt.value),
                        ...{ class: "mention-option" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "mention-avatar" },
                    });
                    (opt.label.charAt(0));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "mention-name" },
                    });
                    (opt.label);
                }
                if (__VLS_ctx.mentionFilterOptions.length === 0) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "mention-empty" },
                    });
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-desc" },
            });
            const __VLS_132 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                modelValue: (__VLS_ctx.hasCardButton),
                size: "small",
            }));
            const __VLS_134 = __VLS_133({
                modelValue: (__VLS_ctx.hasCardButton),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            if (__VLS_ctx.hasCardButton) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-label required" },
                    ...{ style: {} },
                });
                const __VLS_136 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                    modelValue: (__VLS_ctx.cardButtonText),
                    placeholder: "查看详情",
                    maxlength: "20",
                    showWordLimit: true,
                    size: "small",
                }));
                const __VLS_138 = __VLS_137({
                    modelValue: (__VLS_ctx.cardButtonText),
                    placeholder: "查看详情",
                    maxlength: "20",
                    showWordLimit: true,
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_137));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-label required" },
                    ...{ style: {} },
                });
                const __VLS_140 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                    modelValue: (__VLS_ctx.cardButtonUrl),
                    placeholder: "输入跳转链接",
                    size: "small",
                }));
                const __VLS_142 = __VLS_141({
                    modelValue: (__VLS_ctx.cardButtonUrl),
                    placeholder: "输入跳转链接",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_141));
                __VLS_143.slots.default;
                {
                    const { prefix: __VLS_thisSlot } = __VLS_143.slots;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
                        ...{ style: {} },
                        viewBox: "0 0 24 24",
                        fill: "none",
                        stroke: "currentColor",
                        'stroke-width': "2",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71",
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
                        d: "M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71",
                    });
                }
                var __VLS_143;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "toggle-desc" },
            });
            const __VLS_144 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                modelValue: (__VLS_ctx.requireCompletion),
                size: "small",
            }));
            const __VLS_146 = __VLS_145({
                modelValue: (__VLS_ctx.requireCompletion),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section test-send-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wiz-section-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
                ...{ class: "wiz-section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "test-desc" },
            });
            const __VLS_148 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                modelValue: (__VLS_ctx.testContextJson),
                type: "textarea",
                rows: (3),
                placeholder: '可选测试上下文 JSON，如：{"employee_name":"张三","report_name":"月度报表"}',
                size: "small",
                ...{ style: {} },
            }));
            const __VLS_150 = __VLS_149({
                modelValue: (__VLS_ctx.testContextJson),
                type: "textarea",
                rows: (3),
                placeholder: '可选测试上下文 JSON，如：{"employee_name":"张三","report_name":"月度报表"}',
                size: "small",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_149));
            const __VLS_152 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                size: "small",
                loading: (__VLS_ctx.testing),
            }));
            const __VLS_154 = __VLS_153({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                size: "small",
                loading: (__VLS_ctx.testing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_153));
            let __VLS_156;
            let __VLS_157;
            let __VLS_158;
            const __VLS_159 = {
                onClick: (__VLS_ctx.handleTestSend)
            };
            __VLS_155.slots.default;
            var __VLS_155;
            if (__VLS_ctx.testResult) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "test-result" },
                    ...{ class: (__VLS_ctx.testResult.ok ? 'result-ok' : 'result-err') },
                });
                if (__VLS_ctx.testResult.ok) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                    (__VLS_ctx.testResult.success_count);
                    (__VLS_ctx.testResult.failed_count);
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                }
                if (__VLS_ctx.testResult.preview) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "test-preview" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "test-preview-title" },
                    });
                    (__VLS_ctx.testResult.preview.rendered_title);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "test-preview-content" },
                    });
                    (__VLS_ctx.testResult.preview.rendered_content);
                    if (__VLS_ctx.testResult.preview.missing_variables?.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "test-preview-warn" },
                        });
                        (__VLS_ctx.testResult.preview.missing_variables.join(', '));
                    }
                }
                if (__VLS_ctx.testResult.errors?.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "test-errors" },
                    });
                    for (const [err] of __VLS_getVForSourceType((__VLS_ctx.testResult.errors))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            key: (err),
                        });
                        (err);
                    }
                }
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-footer" },
        });
        if (__VLS_ctx.currentStep === 'select') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            const __VLS_160 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                ...{ 'onClick': {} },
                type: "primary",
                disabled: (!__VLS_ctx.selectedType),
            }));
            const __VLS_162 = __VLS_161({
                ...{ 'onClick': {} },
                type: "primary",
                disabled: (!__VLS_ctx.selectedType),
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            let __VLS_164;
            let __VLS_165;
            let __VLS_166;
            const __VLS_167 = {
                onClick: (__VLS_ctx.goToConfigure)
            };
            __VLS_163.slots.default;
            const __VLS_168 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                ...{ class: "btn-icon-right" },
            }));
            const __VLS_170 = __VLS_169({
                ...{ class: "btn-icon-right" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
            __VLS_171.slots.default;
            const __VLS_172 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({}));
            const __VLS_174 = __VLS_173({}, ...__VLS_functionalComponentArgsRest(__VLS_173));
            var __VLS_171;
            var __VLS_163;
        }
        if (__VLS_ctx.currentStep === 'configure') {
            const __VLS_176 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.ArrowLeft),
            }));
            const __VLS_178 = __VLS_177({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.ArrowLeft),
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            let __VLS_180;
            let __VLS_181;
            let __VLS_182;
            const __VLS_183 = {
                onClick: (__VLS_ctx.goBackToSelect)
            };
            __VLS_179.slots.default;
            var __VLS_179;
            const __VLS_184 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.Check),
            }));
            const __VLS_186 = __VLS_185({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.Check),
            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
            let __VLS_188;
            let __VLS_189;
            let __VLS_190;
            const __VLS_191 = {
                onClick: (__VLS_ctx.handleConfirm)
            };
            __VLS_187.slots.default;
            (props.editConfig ? '保存修改' : '确认添加');
            var __VLS_187;
        }
    }
    var __VLS_11;
}
var __VLS_7;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['wizard-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-header']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-title']} */ ;
/** @type {__VLS_StyleScopedClasses['step-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-check']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-line']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-body']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['action-type-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['action-type-card']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-body']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-title']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['atc-check']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-body']} */ ;
/** @type {__VLS_StyleScopedClasses['config-body']} */ ;
/** @type {__VLS_StyleScopedClasses['config-dual-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-col']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-frame']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-topbar']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-time']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-content']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-msg']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-msg-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-msg-title']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-msg-body']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-card-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-completion-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-msg-time']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-bottombar']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['phone-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['form-col']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['required-star']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-list']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-row']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['check-box']} */ ;
/** @type {__VLS_StyleScopedClasses['check-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['check-label']} */ ;
/** @type {__VLS_StyleScopedClasses['check-info']} */ ;
/** @type {__VLS_StyleScopedClasses['check-input']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-field-inline']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['format-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['fmt-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['fmt-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-options']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-option']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-row']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-info']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-row']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-info']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section']} */ ;
/** @type {__VLS_StyleScopedClasses['test-send-section']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['test-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['test-result']} */ ;
/** @type {__VLS_StyleScopedClasses['test-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['test-preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['test-preview-content']} */ ;
/** @type {__VLS_StyleScopedClasses['test-preview-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['test-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-right']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Bell: Bell,
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Close: Close,
            Check: Check,
            ArrowDown: ArrowDown,
            actionTypeDefs: actionTypeDefs,
            currentStep: currentStep,
            selectedType: selectedType,
            isVisible: isVisible,
            isClosing: isClosing,
            receiverCheckOptions: receiverCheckOptions,
            checkedReceiverKeys: checkedReceiverKeys,
            receiverInputValues: receiverInputValues,
            toggleReceiverKey: toggleReceiverKey,
            updateReceiverValue: updateReceiverValue,
            messageFormat: messageFormat,
            titleTemplate: titleTemplate,
            contentTemplate: contentTemplate,
            hasCardButton: hasCardButton,
            cardButtonText: cardButtonText,
            cardButtonUrl: cardButtonUrl,
            requireCompletion: requireCompletion,
            testContextJson: testContextJson,
            testing: testing,
            testResult: testResult,
            userOptions: userOptions,
            chatOptions: chatOptions,
            dataLoading: dataLoading,
            showMentionDropdown: showMentionDropdown,
            mentionSearch: mentionSearch,
            mentionFilterOptions: mentionFilterOptions,
            mentionSearchInputRef: mentionSearchInputRef,
            handleContentInput: handleContentInput,
            openMentionDropdown: openMentionDropdown,
            filterMentionOptions: filterMentionOptions,
            selectMention: selectMention,
            textareaRef: textareaRef,
            availableVariables: availableVariables,
            toolbarBold: toolbarBold,
            toolbarItalic: toolbarItalic,
            toolbarCode: toolbarCode,
            toolbarLink: toolbarLink,
            toolbarHr: toolbarHr,
            toolbarBullet: toolbarBullet,
            insertVariable: insertVariable,
            contentPreview: contentPreview,
            closeWizard: closeWizard,
            goToConfigure: goToConfigure,
            goBackToSelect: goBackToSelect,
            handleTestSend: handleTestSend,
            handleConfirm: handleConfirm,
            steps: steps,
            currentStepIndex: currentStepIndex,
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
