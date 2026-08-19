import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { User, ChatDotRound, Connection, Management, Bell, Plus, Delete, Iphone, ArrowDown } from '@element-plus/icons-vue';
import { feishuApi } from '@/api/feishu';
import { usersApi } from '@/api/users';
const props = defineProps();
const emit = defineEmits();
const userOptions = ref([]);
const chatOptions = ref([]);
const dataLoading = ref(false);
const mentionUserOptions = ref([]);
async function fetchUserOptions() {
    try {
        const resp = await usersApi.list({ page_size: 100 });
        const items = resp.items || [];
        userOptions.value = items.map((u) => ({
            label: `${u.display_name || u.login_name}`,
            value: u.id,
        }));
        // @ 提及专用列表（含 feishu_user_id）
        mentionUserOptions.value = items.map((u) => ({
            id: u.id,
            label: `${u.display_name || u.login_name}`,
            feishu_user_id: u.feishu_user_id || null,
        }));
    }
    catch (_e) {
    }
}
async function fetchChatOptions() {
    try {
        const targets = await feishuApi.listChatTargets();
        chatOptions.value = targets.map((t) => ({
            label: `${t.name} (${t.chat_id})`,
            value: t.chat_id,
        }));
    }
    catch (_e) {
    }
}
onMounted(async () => {
    dataLoading.value = true;
    await Promise.all([fetchUserOptions(), fetchChatOptions()]);
    dataLoading.value = false;
});
// ===== 接收人列表 =====
const receivers = computed({
    get: () => props.config.receivers || [],
    set: (val) => emit('update:config', { ...props.config, receivers: val }),
});
// ===== 消息配置 =====
const message = computed({
    get: () => props.config.message || {
        message_format: 'markdown',
        title_template: '',
        content_template: '',
        resources: [],
    },
    set: (val) => emit('update:config', { ...props.config, message: val }),
});
const titleTemplate = computed({
    get: () => message.value.title_template,
    set: (val) => emit('update:config', { ...props.config, message: { ...message.value, title_template: val } }),
});
const contentTemplate = computed({
    get: () => message.value.content_template,
    set: (val) => emit('update:config', { ...props.config, message: { ...message.value, content_template: val } }),
});
const messageFormat = computed({
    get: () => message.value.message_format || 'markdown',
    set: (val) => emit('update:config', { ...props.config, message: { ...message.value, message_format: val } }),
});
const requireCompletion = computed({
    get: () => props.config.require_completion ?? false,
    set: (val) => emit('update:config', { ...props.config, require_completion: val }),
});
// ===== 卡片跳转按钮 =====
const cardButtonEnabled = computed({
    get: () => props.config.card_button?.enabled ?? false,
    set: (val) => {
        const cb = { ...(props.config.card_button || {}), enabled: val };
        emit('update:config', { ...props.config, card_button: cb });
    },
});
const cardButtonText = computed({
    get: () => props.config.card_button?.text || '查看详情',
    set: (val) => {
        const cb = { ...(props.config.card_button || {}), text: val };
        emit('update:config', { ...props.config, card_button: cb });
    },
});
const cardButtonUrl = computed({
    get: () => props.config.card_button?.url || '',
    set: (val) => {
        const cb = { ...(props.config.card_button || {}), url: val };
        emit('update:config', { ...props.config, card_button: cb });
    },
});
// ===== 富文本编辑状态 =====
const textareaRef = ref(null);
const contentPreview = ref('');
const showPreviewDialog = ref(false);
const previewLoading = ref(false);
// ===== @ 提及功能 =====
const showMentionDropdown = ref(false);
const mentionSearch = ref('');
const mentionFilterOptions = ref([]);
const mentionDropdownStyle = ref({});
const mentionSearchInputRef = ref(null);
// 监听 @ 输入，定位下拉框
function handleContentInput(e) {
    const el = textareaRef.value;
    if (!el)
        return;
    const text = e.target.value;
    contentTemplate.value = text;
    // 检测是否刚输入了 @
    const cursorPos = el.selectionStart;
    const textBeforeCursor = text.slice(0, cursorPos);
    const lastChar = textBeforeCursor[textBeforeCursor.length - 1];
    if (lastChar === '@') {
        // 显示 @ 下拉框
        openMentionDropdown(cursorPos);
    }
    else {
        // 如果下拉框已显示，过滤选项
        if (showMentionDropdown.value) {
            const atIndex = textBeforeCursor.lastIndexOf('@');
            if (atIndex >= 0) {
                const query = textBeforeCursor.slice(atIndex + 1);
                mentionSearch.value = query;
                filterMentionOptions(query);
            }
            else {
                showMentionDropdown.value = false;
            }
        }
    }
}
function openMentionDropdown(cursorPos) {
    showMentionDropdown.value = true;
    mentionSearch.value = '';
    // 初始只显示已绑定飞书的用户
    mentionFilterOptions.value = mentionUserOptions.value
        .filter(u => u.feishu_user_id)
        .map(u => ({ label: u.label, value: u.feishu_user_id }));
    nextTick(() => {
        if (mentionSearchInputRef.value) {
            mentionSearchInputRef.value.focus();
        }
    });
}
function filterMentionOptions(query) {
    if (!query) {
        mentionFilterOptions.value = mentionUserOptions.value
            .filter(u => u.feishu_user_id) // 只显示已绑定飞书的用户
            .map(u => ({ label: u.label, value: u.feishu_user_id }));
    }
    else {
        const q = query.toLowerCase();
        mentionFilterOptions.value = mentionUserOptions.value
            .filter(u => u.feishu_user_id && u.label.toLowerCase().includes(q))
            .map(u => ({ label: u.label, value: u.feishu_user_id }));
    }
}
function selectMention(user) {
    if (!user.feishu_user_id) {
        ElMessage.warning('该用户未绑定飞书，无法 @ 提及');
        return;
    }
    const el = textareaRef.value;
    if (!el)
        return;
    const cursorPos = el.selectionStart;
    const text = contentTemplate.value;
    const textBeforeCursor = text.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    if (atIndex >= 0) {
        const before = text.slice(0, atIndex);
        const after = text.slice(cursorPos);
        const newText = `${before}<at user_id="${user.feishu_user_id}">@${user.label}</at>${after}`;
        contentTemplate.value = newText;
        showMentionDropdown.value = false;
        nextTick(() => {
            el.focus();
            const newPos = atIndex + `<at user_id="${user.feishu_user_id}">@${user.label}</at>`.length;
            el.selectionStart = newPos;
            el.selectionEnd = newPos;
        });
    }
}
// 变量列表
const availableVariables = [
    { name: 'trigger_event.event_type', desc: '触发事件类型' },
    { name: 'trigger_event.timestamp', desc: '触发时间' },
    { name: 'trigger_event.biz_id', desc: '业务 ID' },
    { name: 'trigger_event.biz_name', desc: '业务名称' },
    { name: 'rule.name', desc: '规则名称' },
];
const showVariables = ref(false);
// ===== 富文本工具栏操作 =====
function wrapSelection(wrapper) {
    const el = textareaRef.value;
    if (!el)
        return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = contentTemplate.value;
    const selected = text.slice(start, end);
    const newText = text.slice(0, start) + wrapper[0] + selected + wrapper[1] + text.slice(end);
    contentTemplate.value = newText;
    nextTick(() => {
        el.focus();
        el.selectionStart = start + wrapper[0].length;
        el.selectionEnd = start + wrapper[0].length + (selected.length || 0);
    });
}
import { nextTick } from 'vue';
function toolbarBold() { wrapSelection(['**', '**']); }
function toolbarItalic() { wrapSelection(['*', '*']); }
function toolbarCode() { wrapSelection(['`', '`']); }
function toolbarLink() {
    const url = prompt('输入链接地址：', 'https://');
    if (url)
        wrapSelection(['[', `](${url})`]);
}
function toolbarHr() {
    contentTemplate.value = contentTemplate.value + '\n\n---\n';
}
function toolbarBullet() {
    const el = textareaRef.value;
    if (!el) {
        contentTemplate.value = contentTemplate.value + '- ';
        return;
    }
    const lines = contentTemplate.value.split('\n');
    const cursorLine = contentTemplate.value.slice(0, el.selectionStart).split('\n').length - 1;
    lines[cursorLine] = '- ' + lines[cursorLine];
    contentTemplate.value = lines.join('\n');
}
function insertVariable(variable) {
    const el = textareaRef.value;
    if (el) {
        const start = el.selectionStart;
        const text = contentTemplate.value;
        contentTemplate.value = text.slice(0, start) + `{{${variable}}}` + text.slice(start);
        nextTick(() => {
            el.focus();
            el.selectionStart = el.selectionEnd = start + variable.length + 4;
        });
    }
    else {
        contentTemplate.value = contentTemplate.value + `{{${variable}}}`;
    }
    showVariables.value = false;
}
// 预览（手机样式）
function openPreview() {
    previewLoading.value = true;
    try {
        let preview = contentTemplate.value || '（空消息）';
        availableVariables.forEach((v) => {
            preview = preview.replaceAll(`{{${v.name}}}`, `[${v.desc}]`);
        });
        contentPreview.value = preview;
        showPreviewDialog.value = true;
    }
    finally {
        previewLoading.value = false;
    }
}
// 渲染预览内容（支持 @ 高亮）
function renderPreviewContent(content) {
    let html = content;
    // 变量高亮
    availableVariables.forEach((v) => {
        html = html.replaceAll(`{{${v.name}}}`, `<span class="preview-var">[${v.desc}]</span>`);
    });
    // @ 提及高亮
    html = html.replace(/<at\s+user_id=".+?">(.+?)<\/at>/g, '<span class="preview-mention">$1</span>');
    // 简单 markdown
    html = html
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/\*(.+?)\*/g, '<i>$1</i>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/^-\s/gm, '• ')
        .replace(/^#{1,6}\s/gm, '')
        .replace(/\n/g, '<br>');
    return html;
}
// ===== 接收人操作 =====
const receiverTypeOptions = [
    { value: 'fixed_users', label: '指定用户', desc: '选择系统中已有用户', icon: User },
    { value: 'fixed_chats', label: '指定群', desc: '选择飞书群聊', icon: ChatDotRound },
    { value: 'employee_field_user', label: '按员工字段', desc: '根据花名册字段匹配', icon: Connection },
    { value: 'employee_department_manager', label: '部门负责人', desc: '匹配员工所属部门负责人', icon: Management },
];
function addReceiver() {
    const newReceivers = [
        ...receivers.value,
        { type: 'fixed_users', user_ids: [] },
    ];
    emit('update:config', { ...props.config, receivers: newReceivers });
}
function removeReceiver(index) {
    const newReceivers = [...receivers.value];
    newReceivers.splice(index, 1);
    emit('update:config', { ...props.config, receivers: newReceivers });
}
function updateReceiver(index, receiver) {
    const newReceivers = [...receivers.value];
    newReceivers[index] = receiver;
    emit('update:config', { ...props.config, receivers: newReceivers });
}
function handleReceiverTypeChange(index, receiverType) {
    if (receiverType === 'fixed_users') {
        updateReceiver(index, { type: 'fixed_users', user_ids: [] });
    }
    else if (receiverType === 'fixed_chats') {
        updateReceiver(index, { type: 'fixed_chats', chat_ids: [] });
    }
    else if (receiverType === 'employee_field_user') {
        updateReceiver(index, { type: 'employee_field_user', target_field: '' });
    }
    else if (receiverType === 'employee_department_manager') {
        updateReceiver(index, { type: 'employee_department_manager', department_field: '' });
    }
}
function getReceiverType(receiver) {
    return receiver.type;
}
// ── 测试发送 ──────────────────────────────────────────
const testContextJson = ref('');
const testing = ref(false);
const testResult = ref(null);
async function handleTestSend() {
    // 构造完整 NotificationConfig
    const cfg = {
        enabled: true,
        receivers: receivers.value,
        message: {
            message_format: messageFormat.value,
            title_template: titleTemplate.value,
            content_template: contentTemplate.value,
            resources: [],
        },
        require_completion: requireCompletion.value,
        card_button: {
            enabled: cardButtonEnabled.value,
            text: cardButtonText.value || '查看详情',
            url: cardButtonUrl.value || '',
        },
    };
    // 解析测试上下文
    let context = {};
    if (testContextJson.value.trim()) {
        try {
            context = JSON.parse(testContextJson.value);
        }
        catch {
            ElMessage.warning('测试上下文 JSON 格式不正确，已忽略');
        }
    }
    testing.value = true;
    testResult.value = null;
    try {
        // 第一步：后端 preview 校验
        const preview = await feishuApi.previewMessage({
            message: cfg.message,
            context,
        });
        // 第二步：调用测试发送
        const result = await feishuApi.testSend({
            config: cfg,
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
        const detail = e?.response?.data?.detail || e?.message || '请求异常';
        testResult.value = {
            ok: false,
            success_count: 0,
            failed_count: 1,
            errors: [detail],
        };
        ElMessage.error('测试发送异常：' + detail);
    }
    finally {
        testing.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['phone-nav-item']} */ ;
/** @type {__VLS_StyleScopedClasses['type-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['type-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['type-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['tile-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['var-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['tb-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['fmt-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-option']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
/** @type {__VLS_StyleScopedClasses['card-btn-field']} */ ;
/** @type {__VLS_StyleScopedClasses['card-btn-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "feishu-layout" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "mobile-preview" },
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
const __VLS_0 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    size: (18),
}));
const __VLS_2 = __VLS_1({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Bell;
/** @type {[typeof __VLS_components.Bell, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "phone-msg-title" },
});
(__VLS_ctx.titleTemplate || '通知标题');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "phone-msg-body" },
});
(__VLS_ctx.contentPreview || '在这里编辑消息内容...');
if (__VLS_ctx.cardButtonEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "phone-card-btn" },
    });
    (__VLS_ctx.cardButtonText || '查看详情');
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        size: (12),
    }));
    const __VLS_10 = __VLS_9({
        size: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.ArrowDown;
    /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
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
    ...{ class: "config-form" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "block-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "block-title" },
});
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
    type: "primary",
    plain: true,
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Plus),
    type: "primary",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.addReceiver)
};
__VLS_19.slots.default;
(__VLS_ctx.receivers.length === 0 ? '添加发送对象' : '添加规则');
var __VLS_19;
if (__VLS_ctx.receivers.length === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "block-empty" },
    });
}
for (const [receiver, idx] of __VLS_getVForSourceType((__VLS_ctx.receivers))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (idx),
        ...{ class: "receiver-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "receiver-top" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "receiver-no" },
    });
    (idx + 1);
    const __VLS_24 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        ...{ 'onClick': {} },
        size: "small",
        type: "danger",
        text: true,
        icon: (__VLS_ctx.Delete),
    }));
    const __VLS_26 = __VLS_25({
        ...{ 'onClick': {} },
        size: "small",
        type: "danger",
        text: true,
        icon: (__VLS_ctx.Delete),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    let __VLS_28;
    let __VLS_29;
    let __VLS_30;
    const __VLS_31 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeReceiver(idx);
        }
    };
    var __VLS_27;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "type-grid" },
    });
    for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.receiverTypeOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            key: (opt.value),
            ...{ class: "type-tile" },
            ...{ class: ({ active: __VLS_ctx.getReceiverType(receiver) === opt.value }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (...[$event]) => {
                    __VLS_ctx.handleReceiverTypeChange(idx, opt.value);
                } },
            type: "radio",
            value: (opt.value),
            checked: (__VLS_ctx.getReceiverType(receiver) === opt.value),
            ...{ class: "type-input" },
        });
        const __VLS_32 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            ...{ class: "tile-icon" },
        }));
        const __VLS_34 = __VLS_33({
            ...{ class: "tile-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_35.slots.default;
        const __VLS_36 = ((opt.icon));
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
        const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
        var __VLS_35;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "tile-label" },
        });
        (opt.label);
    }
    if (receiver.type === 'fixed_users') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "receiver-input" },
        });
        const __VLS_40 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.user_ids || []),
            multiple: true,
            filterable: true,
            placeholder: "搜索并选择系统用户...",
            loading: (__VLS_ctx.dataLoading),
            ...{ style: {} },
        }));
        const __VLS_42 = __VLS_41({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.user_ids || []),
            multiple: true,
            filterable: true,
            placeholder: "搜索并选择系统用户...",
            loading: (__VLS_ctx.dataLoading),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        let __VLS_44;
        let __VLS_45;
        let __VLS_46;
        const __VLS_47 = {
            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiver(idx, { type: 'fixed_users', user_ids: val }))
        };
        __VLS_43.slots.default;
        for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.userOptions))) {
            const __VLS_48 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
                key: (opt.value),
                label: (opt.label),
                value: (opt.value),
            }));
            const __VLS_50 = __VLS_49({
                key: (opt.value),
                label: (opt.label),
                value: (opt.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        }
        var __VLS_43;
    }
    if (receiver.type === 'fixed_chats') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "receiver-input" },
        });
        const __VLS_52 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.chat_ids || []),
            multiple: true,
            filterable: true,
            placeholder: "搜索并选择飞书群...",
            loading: (__VLS_ctx.dataLoading),
            ...{ style: {} },
        }));
        const __VLS_54 = __VLS_53({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.chat_ids || []),
            multiple: true,
            filterable: true,
            placeholder: "搜索并选择飞书群...",
            loading: (__VLS_ctx.dataLoading),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        let __VLS_56;
        let __VLS_57;
        let __VLS_58;
        const __VLS_59 = {
            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiver(idx, { type: 'fixed_chats', chat_ids: val }))
        };
        __VLS_55.slots.default;
        for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.chatOptions))) {
            const __VLS_60 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                key: (opt.value),
                label: (opt.label),
                value: (opt.value),
            }));
            const __VLS_62 = __VLS_61({
                key: (opt.value),
                label: (opt.label),
                value: (opt.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        }
        var __VLS_55;
    }
    if (receiver.type === 'employee_field_user') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "receiver-input" },
        });
        const __VLS_64 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.target_field),
            placeholder: "花名册字段名，如 direct_supervisor",
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.target_field),
            placeholder: "花名册字段名，如 direct_supervisor",
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiver(idx, { ...receiver, target_field: val }))
        };
        var __VLS_67;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "input-note" },
        });
    }
    if (receiver.type === 'employee_department_manager') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "receiver-input" },
        });
        const __VLS_72 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.department_field),
            placeholder: "部门字段名，如 department",
        }));
        const __VLS_74 = __VLS_73({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (receiver.department_field),
            placeholder: "部门字段名，如 department",
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        let __VLS_76;
        let __VLS_77;
        let __VLS_78;
        const __VLS_79 = {
            'onUpdate:modelValue': ((val) => __VLS_ctx.updateReceiver(idx, { ...receiver, department_field: val }))
        };
        var __VLS_75;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "input-note" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "block-title" },
});
const __VLS_80 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    modelValue: (__VLS_ctx.titleTemplate),
    placeholder: "如：{{rule.name}} — 通知",
}));
const __VLS_82 = __VLS_81({
    modelValue: (__VLS_ctx.titleTemplate),
    placeholder: "如：{{rule.name}} — 通知",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "var-row" },
});
for (const [v] of __VLS_getVForSourceType((__VLS_ctx.availableVariables))) {
    const __VLS_84 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        ...{ 'onClick': {} },
        key: (v.name),
        size: "small",
        ...{ class: "var-tag" },
    }));
    const __VLS_86 = __VLS_85({
        ...{ 'onClick': {} },
        key: (v.name),
        size: "small",
        ...{ class: "var-tag" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    let __VLS_88;
    let __VLS_89;
    let __VLS_90;
    const __VLS_91 = {
        onClick: (...[$event]) => {
            __VLS_ctx.contentTemplate = __VLS_ctx.contentTemplate + `{{${v.name}}}`;
        }
    };
    __VLS_87.slots.default;
    (v.name);
    var __VLS_87;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "block-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "block-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-actions" },
});
const __VLS_92 = {}.ElDropdown;
/** @type {[typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, typeof __VLS_components.ElDropdown, typeof __VLS_components.elDropdown, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    trigger: "click",
}));
const __VLS_94 = __VLS_93({
    trigger: "click",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
const __VLS_96 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    size: "small",
    plain: true,
}));
const __VLS_98 = __VLS_97({
    size: "small",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
const __VLS_104 = {}.ArrowDown;
/** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({}));
const __VLS_106 = __VLS_105({}, ...__VLS_functionalComponentArgsRest(__VLS_105));
var __VLS_103;
var __VLS_99;
{
    const { dropdown: __VLS_thisSlot } = __VLS_95.slots;
    const __VLS_108 = {}.ElDropdownMenu;
    /** @type {[typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, typeof __VLS_components.ElDropdownMenu, typeof __VLS_components.elDropdownMenu, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({}));
    const __VLS_110 = __VLS_109({}, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    for (const [v] of __VLS_getVForSourceType((__VLS_ctx.availableVariables))) {
        const __VLS_112 = {}.ElDropdownItem;
        /** @type {[typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, typeof __VLS_components.ElDropdownItem, typeof __VLS_components.elDropdownItem, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            ...{ 'onClick': {} },
            key: (v.name),
        }));
        const __VLS_114 = __VLS_113({
            ...{ 'onClick': {} },
            key: (v.name),
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        let __VLS_116;
        let __VLS_117;
        let __VLS_118;
        const __VLS_119 = {
            onClick: (...[$event]) => {
                __VLS_ctx.insertVariable(v.name);
            }
        };
        __VLS_115.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (v.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (v.desc);
        var __VLS_115;
    }
    var __VLS_111;
}
var __VLS_95;
const __VLS_120 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.previewLoading),
}));
const __VLS_122 = __VLS_121({
    ...{ 'onClick': {} },
    size: "small",
    loading: (__VLS_ctx.previewLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
let __VLS_124;
let __VLS_125;
let __VLS_126;
const __VLS_127 = {
    onClick: (__VLS_ctx.openPreview)
};
__VLS_123.slots.default;
const __VLS_128 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    ...{ style: {} },
}));
const __VLS_130 = __VLS_129({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.Iphone;
/** @type {[typeof __VLS_components.Iphone, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
var __VLS_131;
var __VLS_123;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "richtext-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toolbarBold) },
    ...{ class: "tb-btn" },
    title: "加粗 (Ctrl+B)",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.toolbarItalic) },
    ...{ class: "tb-btn" },
    title: "斜体 (Ctrl+I)",
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
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.showMentionDropdown = true;
            __VLS_ctx.nextTick(() => { __VLS_ctx.mentionSearchInputRef?.focus(); });
        } },
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
            __VLS_ctx.messageFormat = 'text';
        } },
    ...{ class: "fmt-btn" },
    ...{ class: ({ active: __VLS_ctx.messageFormat === 'text' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.messageFormat = 'markdown';
        } },
    ...{ class: "fmt-btn" },
    ...{ class: ({ active: __VLS_ctx.messageFormat === 'markdown' }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "editor-wrap" },
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
        ...{ onInput: (...[$event]) => {
                if (!(__VLS_ctx.showMentionDropdown))
                    return;
                __VLS_ctx.filterMentionOptions(__VLS_ctx.mentionSearch);
            } },
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
                    if (!(__VLS_ctx.showMentionDropdown))
                        return;
                    __VLS_ctx.selectMention(__VLS_ctx.mentionUserOptions.find(u => u.feishu_user_id === opt.value));
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
    ...{ class: "form-block" },
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
const __VLS_136 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    modelValue: (__VLS_ctx.cardButtonEnabled),
}));
const __VLS_138 = __VLS_137({
    modelValue: (__VLS_ctx.cardButtonEnabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
if (__VLS_ctx.cardButtonEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-btn-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "field-label required" },
    });
    const __VLS_140 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        modelValue: (__VLS_ctx.cardButtonText),
        placeholder: "查看详情",
        maxlength: "20",
        showWordLimit: true,
        size: "default",
    }));
    const __VLS_142 = __VLS_141({
        modelValue: (__VLS_ctx.cardButtonText),
        placeholder: "查看详情",
        maxlength: "20",
        showWordLimit: true,
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-btn-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "field-label required" },
    });
    const __VLS_144 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        modelValue: (__VLS_ctx.cardButtonUrl),
        placeholder: "输入跳转链接",
        size: "default",
    }));
    const __VLS_146 = __VLS_145({
        modelValue: (__VLS_ctx.cardButtonUrl),
        placeholder: "输入跳转链接",
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    {
        const { prefix: __VLS_thisSlot } = __VLS_147.slots;
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
    var __VLS_147;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-block" },
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
const __VLS_148 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.requireCompletion),
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.requireCompletion),
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-block test-send-block" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "block-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
    ...{ class: "block-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "block-desc" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "test-context-hint" },
});
const __VLS_152 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    modelValue: (__VLS_ctx.testContextJson),
    type: "textarea",
    rows: (3),
    placeholder: '可选，如：{"employee_name":"张三","report_name":"月度报表"}',
    size: "small",
    ...{ style: {} },
}));
const __VLS_154 = __VLS_153({
    modelValue: (__VLS_ctx.testContextJson),
    type: "textarea",
    rows: (3),
    placeholder: '可选，如：{"employee_name":"张三","report_name":"月度报表"}',
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
const __VLS_156 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    size: "small",
    loading: (__VLS_ctx.testing),
}));
const __VLS_158 = __VLS_157({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    size: "small",
    loading: (__VLS_ctx.testing),
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
let __VLS_160;
let __VLS_161;
let __VLS_162;
const __VLS_163 = {
    onClick: (__VLS_ctx.handleTestSend)
};
__VLS_159.slots.default;
var __VLS_159;
if (__VLS_ctx.testResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "test-result" },
        ...{ class: (__VLS_ctx.testResult.ok ? 'result-ok' : 'result-err') },
    });
    if (__VLS_ctx.testResult.ok) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-summary" },
        });
        (__VLS_ctx.testResult.success_count);
        (__VLS_ctx.testResult.failed_count);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-summary" },
        });
    }
    if (__VLS_ctx.testResult.preview) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-preview" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-title" },
        });
        (__VLS_ctx.testResult.preview.rendered_title);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-content" },
        });
        (__VLS_ctx.testResult.preview.rendered_content);
        if (__VLS_ctx.testResult.preview.missing_variables?.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-warn" },
            });
            (__VLS_ctx.testResult.preview.missing_variables.join(', '));
        }
    }
    if (__VLS_ctx.testResult.errors?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "result-errors" },
        });
        for (const [err, i] of __VLS_getVForSourceType((__VLS_ctx.testResult.errors))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (i),
                ...{ class: "err-item" },
            });
            (err);
        }
    }
}
const __VLS_164 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    modelValue: (__VLS_ctx.showPreviewDialog),
    title: "消息预览",
    width: "420px",
    center: true,
}));
const __VLS_166 = __VLS_165({
    modelValue: (__VLS_ctx.showPreviewDialog),
    title: "消息预览",
    width: "420px",
    center: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "phone-frame" },
    ...{ style: {} },
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
const __VLS_168 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    size: (18),
}));
const __VLS_170 = __VLS_169({
    size: (18),
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
__VLS_171.slots.default;
const __VLS_172 = {}.Bell;
/** @type {[typeof __VLS_components.Bell, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({}));
const __VLS_174 = __VLS_173({}, ...__VLS_functionalComponentArgsRest(__VLS_173));
var __VLS_171;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "phone-msg-title" },
});
(__VLS_ctx.titleTemplate || '通知标题');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "phone-msg-body" },
});
__VLS_asFunctionalDirective(__VLS_directives.vHtml)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.renderPreviewContent(__VLS_ctx.contentPreview || '（空消息）')) }, null, null);
if (__VLS_ctx.cardButtonEnabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "phone-card-btn" },
    });
    (__VLS_ctx.cardButtonText || '查看详情');
    const __VLS_176 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        size: (12),
    }));
    const __VLS_178 = __VLS_177({
        size: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    const __VLS_180 = {}.ArrowDown;
    /** @type {[typeof __VLS_components.ArrowDown, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({}));
    const __VLS_182 = __VLS_181({}, ...__VLS_functionalComponentArgsRest(__VLS_181));
    var __VLS_179;
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
var __VLS_167;
/** @type {__VLS_StyleScopedClasses['feishu-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['mobile-preview']} */ ;
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
/** @type {__VLS_StyleScopedClasses['config-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['block-header']} */ ;
/** @type {__VLS_StyleScopedClasses['block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['block-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-block']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-top']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-no']} */ ;
/** @type {__VLS_StyleScopedClasses['type-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['type-tile']} */ ;
/** @type {__VLS_StyleScopedClasses['type-input']} */ ;
/** @type {__VLS_StyleScopedClasses['tile-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tile-label']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-input']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-input']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-input']} */ ;
/** @type {__VLS_StyleScopedClasses['input-note']} */ ;
/** @type {__VLS_StyleScopedClasses['receiver-input']} */ ;
/** @type {__VLS_StyleScopedClasses['input-note']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['var-row']} */ ;
/** @type {__VLS_StyleScopedClasses['var-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['block-header']} */ ;
/** @type {__VLS_StyleScopedClasses['block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
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
/** @type {__VLS_StyleScopedClasses['editor-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['richtext-area']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-search-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-options']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-option']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-avatar']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mention-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-row']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-info']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['card-btn-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['card-btn-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-row']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-info']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toggle-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['form-block']} */ ;
/** @type {__VLS_StyleScopedClasses['test-send-block']} */ ;
/** @type {__VLS_StyleScopedClasses['block-header']} */ ;
/** @type {__VLS_StyleScopedClasses['block-title']} */ ;
/** @type {__VLS_StyleScopedClasses['block-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['test-context-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['test-result']} */ ;
/** @type {__VLS_StyleScopedClasses['result-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['result-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['result-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-title']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-content']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['result-errors']} */ ;
/** @type {__VLS_StyleScopedClasses['err-item']} */ ;
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
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Bell: Bell,
            Plus: Plus,
            Delete: Delete,
            Iphone: Iphone,
            ArrowDown: ArrowDown,
            userOptions: userOptions,
            chatOptions: chatOptions,
            dataLoading: dataLoading,
            mentionUserOptions: mentionUserOptions,
            receivers: receivers,
            titleTemplate: titleTemplate,
            contentTemplate: contentTemplate,
            messageFormat: messageFormat,
            requireCompletion: requireCompletion,
            cardButtonEnabled: cardButtonEnabled,
            cardButtonText: cardButtonText,
            cardButtonUrl: cardButtonUrl,
            textareaRef: textareaRef,
            contentPreview: contentPreview,
            showPreviewDialog: showPreviewDialog,
            previewLoading: previewLoading,
            showMentionDropdown: showMentionDropdown,
            mentionSearch: mentionSearch,
            mentionFilterOptions: mentionFilterOptions,
            mentionSearchInputRef: mentionSearchInputRef,
            handleContentInput: handleContentInput,
            filterMentionOptions: filterMentionOptions,
            selectMention: selectMention,
            availableVariables: availableVariables,
            nextTick: nextTick,
            toolbarBold: toolbarBold,
            toolbarItalic: toolbarItalic,
            toolbarCode: toolbarCode,
            toolbarLink: toolbarLink,
            toolbarHr: toolbarHr,
            toolbarBullet: toolbarBullet,
            insertVariable: insertVariable,
            openPreview: openPreview,
            renderPreviewContent: renderPreviewContent,
            receiverTypeOptions: receiverTypeOptions,
            addReceiver: addReceiver,
            removeReceiver: removeReceiver,
            updateReceiver: updateReceiver,
            handleReceiverTypeChange: handleReceiverTypeChange,
            getReceiverType: getReceiverType,
            testContextJson: testContextJson,
            testing: testing,
            testResult: testResult,
            handleTestSend: handleTestSend,
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
