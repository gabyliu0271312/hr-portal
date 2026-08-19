/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Check, Close, Plus, Search, Position, Delete } from '@element-plus/icons-vue';
import SmartCodeInput from '@/components/common/SmartCodeInput.vue';
import { aiFormulaApi } from '@/api/aiFormula';
import { datasetsApi } from '@/api/datasets';
import { functionLibraryApi } from '@/api/functionLibrary';
import { useUserStore } from '@/stores/user';
const props = defineProps();
const emit = defineEmits();
const form = reactive({
    label: '',
    code: '',
    description: '',
    formula: '',
    formula_display: '',
    data_type: 'number',
    is_sensitive: false,
});
const generating = ref(false);
const validating = ref(false);
const saving = ref(false);
const deleting = ref(false);
const userStore = useUserStore();
const canDeleteField = computed(() => userStore.hasOp('datasource.datasets', 'D'));
const validation = ref(null);
const functions = ref([]);
const fieldKeyword = ref('');
const formulaInputRef = ref(null);
const formulaCursor = ref(null);
const chatInput = ref('');
const chatScrollRef = ref(null);
const dirty = ref(false);
const activePickerTab = ref('fields');
let chatId = 0;
const chatMessages = ref([]);
const formulaOperators = [
    { label: '=', text: '=' },
    { label: '<>', text: '<>' },
    { label: '<', text: '<' },
    { label: '>', text: '>' },
    { label: '<=', text: '<=' },
    { label: '>=', text: '>=' },
    { label: '+', text: '+' },
    { label: '-', text: '-' },
    { label: '*', text: '*' },
    { label: '/', text: '/' },
    { label: '(', text: '(' },
    { label: ')', text: ')' },
    { label: '""', text: '""', cursorOffset: 1 },
    { label: ',', text: ',' },
];
const formulaConstants = [
    { label: '空文本', code: '""', text: '""', hint: '文本为空', category: '文本常量' },
    { label: '是', code: 'TRUE', text: 'TRUE', hint: '布尔真', category: '布尔常量' },
    { label: '否', code: 'FALSE', text: 'FALSE', hint: '布尔假', category: '布尔常量' },
    { label: '零', code: '0', text: '0', hint: '数值 0', category: '数值常量' },
    { label: '一', code: '1', text: '1', hint: '数值 1', category: '数值常量' },
    { label: '今天', code: 'TODAY()', text: 'TODAY()', hint: '当前日期', category: '日期常量' },
];
const activeResourceGroup = ref('');
const open = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value),
});
const filteredFields = computed(() => {
    const kw = fieldKeyword.value.trim().toLowerCase();
    if (!kw)
        return props.fields;
    return props.fields.filter((field) => `${field.label} ${field.code}`.toLowerCase().includes(kw));
});
const baseFunctions = computed(() => functions.value.filter((item) => (item.source === 'base_excel' || item.function_type === 'base_excel') &&
    item.is_executable !== false));
const managedFunctions = computed(() => functions.value.filter((item) => item.source !== 'base_excel' && item.function_type !== 'base_excel'));
const existingCalculatedCodes = computed(() => props.fields
    .filter((field) => field.code.startsWith('calc.'))
    .map((field) => field.code.slice('calc.'.length)));
function keywordMatch(...parts) {
    const kw = fieldKeyword.value.trim().toLowerCase();
    if (!kw)
        return true;
    return parts.join(' ').toLowerCase().includes(kw);
}
const filteredBaseFunctions = computed(() => baseFunctions.value.filter((fn) => keywordMatch(fn.code, fn.name, fn.description)));
const filteredManagedFunctions = computed(() => managedFunctions.value.filter((fn) => keywordMatch(fn.code, fn.name, fn.description)));
const filteredFormulaConstants = computed(() => formulaConstants.filter((item) => keywordMatch(item.label, item.code, item.hint)));
function fieldSourceKey(code) {
    if (code.startsWith('calc.'))
        return 'calc';
    return code.includes('.') ? code.slice(0, code.indexOf('.')) : 'current';
}
function fieldSourceLabel(code) {
    const key = fieldSourceKey(code);
    if (key === 'calc')
        return '计算字段';
    if (key === 'current')
        return '当前数据表';
    return props.sourceGroups?.find((item) => item.key === key)?.label || key;
}
function stripKnownPrefix(value, prefixes) {
    for (const prefix of prefixes.filter(Boolean)) {
        if (value.startsWith(`${prefix}.`))
            return value.slice(prefix.length + 1);
    }
    return value;
}
function cleanFieldCode(field) {
    const key = fieldSourceKey(field.code);
    return stripKnownPrefix(field.code, [key]);
}
function cleanFieldLabel(field) {
    const key = fieldSourceKey(field.code);
    const sourceLabel = props.sourceGroups?.find((item) => item.key === key)?.label || '';
    const stripped = stripKnownPrefix(field.label, [key, sourceLabel]);
    const dot = stripped.lastIndexOf('.');
    return dot >= 0 ? stripped.slice(dot + 1) : stripped;
}
function groupedBy(items, keyOf, labelOf) {
    const groups = new Map();
    for (const item of items) {
        const key = keyOf(item);
        if (!groups.has(key))
            groups.set(key, { key, label: labelOf(item), items: [] });
        groups.get(key).items.push(item);
    }
    return [...groups.values()];
}
const fieldGroups = computed(() => groupedBy(filteredFields.value, (field) => fieldSourceKey(field.code), (field) => fieldSourceLabel(field.code)));
function functionGroupKey(fn) {
    if (fn.source !== 'base_excel' && fn.function_type !== 'base_excel')
        return 'managed';
    return fn.category || fn.category_label || 'other';
}
function functionGroupLabel(fn) {
    if (fn.source !== 'base_excel' && fn.function_type !== 'base_excel')
        return '业务/自定义函数';
    return fn.category_label || fn.category || '其他函数';
}
const functionGroups = computed(() => groupedBy([...filteredBaseFunctions.value, ...filteredManagedFunctions.value], functionGroupKey, functionGroupLabel));
const constantGroups = computed(() => groupedBy(filteredFormulaConstants.value, (item) => item.category, (item) => item.category));
const resourceGroups = computed(() => {
    if (activePickerTab.value === 'functions')
        return functionGroups.value;
    if (activePickerTab.value === 'constants')
        return constantGroups.value;
    return fieldGroups.value;
});
const activeResourceItems = computed(() => {
    const groups = resourceGroups.value;
    return groups.find((group) => group.key === activeResourceGroup.value)?.items || groups[0]?.items || [];
});
function selectedGroupItems(groups) {
    return groups.find((group) => group.key === activeResourceGroup.value)?.items || groups[0]?.items || [];
}
const activeFieldItems = computed(() => selectedGroupItems(fieldGroups.value));
const activeFunctionItems = computed(() => selectedGroupItems(functionGroups.value));
const activeConstantItems = computed(() => selectedGroupItems(constantGroups.value));
watch(resourceGroups, (groups) => {
    if (!groups.some((group) => group.key === activeResourceGroup.value)) {
        activeResourceGroup.value = groups[0]?.key || '';
    }
}, { immediate: true });
function reset() {
    Object.assign(form, {
        label: '',
        code: '',
        description: '',
        formula: '',
        formula_display: '',
        data_type: 'number',
        is_sensitive: false,
    });
    validation.value = null;
    fieldKeyword.value = '';
    chatInput.value = '';
    chatMessages.value = [];
    activePickerTab.value = 'fields';
    dirty.value = false;
}
async function loadFunctions() {
    try {
        functions.value = await functionLibraryApi.list(true);
    }
    catch {
        functions.value = [];
    }
}
watch(() => props.visible, (value) => {
    if (value) {
        reset();
        if (props.editField) {
            const f = props.editField;
            Object.assign(form, {
                label: f.label,
                code: f.code,
                description: f.description || '',
                formula: normalizeDisplayFormula(internalFormulaToDisplay(f.formula)),
                formula_display: '',
                data_type: f.data_type,
                is_sensitive: f.is_sensitive,
            });
        }
        loadFunctions();
    }
}, { immediate: true });
// 初始化公式值（inline 和 dialog 模式均适用）
watch(() => props.initialFormula, (val) => {
    if (val !== undefined && val !== null) {
        form.formula = normalizeDisplayFormula(internalFormulaToDisplay(val));
    }
}, { immediate: true });
// 实时通知父组件公式变化（inline 和 dialog 模式均适用）
watch(() => form.formula, (val) => {
    emit('formula-change', val);
});
function markDirty() {
    dirty.value = true;
}
async function requestClose(done) {
    if (!dirty.value && !form.label && !form.formula && !chatMessages.value.length) {
        if (done)
            done();
        else
            open.value = false;
        return;
    }
    try {
        await ElMessageBox.confirm('当前字段尚未保存，确认关闭？', '提示', {
            type: 'warning',
            confirmButtonText: '关闭',
            cancelButtonText: '继续编辑',
        });
        dirty.value = false;
        if (done)
            done();
        else
            open.value = false;
    }
    catch {
        // keep editing
    }
}
function scrollChatToBottom() {
    nextTick(() => {
        const el = chatScrollRef.value;
        if (el)
            el.scrollTop = el.scrollHeight;
    });
}
function formulaTextarea() {
    return formulaInputRef.value?.textarea || formulaInputRef.value?.$el?.querySelector?.('textarea') || null;
}
function rememberFormulaCursor() {
    const el = formulaTextarea();
    if (!el)
        return;
    formulaCursor.value = el.selectionStart ?? form.formula.length;
}
function focusFormulaAt(position) {
    formulaCursor.value = position;
    nextTick(() => {
        const el = formulaTextarea();
        if (!el)
            return;
        el.focus();
        el.setSelectionRange(position, position);
    });
}
function insertionRange(current) {
    const el = formulaTextarea();
    const fallback = formulaCursor.value ?? current.length;
    const start = el?.selectionStart ?? fallback;
    const end = el?.selectionEnd ?? start;
    return {
        start: Math.max(0, Math.min(start, current.length)),
        end: Math.max(0, Math.min(end, current.length)),
    };
}
function shouldPrefixSpace(current, start, text) {
    const prev = current[start - 1] || '';
    if (!prev || prev === '=' || prev === '(' || prev === ',' || /\s/.test(prev))
        return false;
    if ('+-*/<>'.includes(prev) || text.startsWith(')') || text.startsWith(','))
        return false;
    return true;
}
function aliasFieldRef(field) {
    const alias = field.code.includes('.') ? field.code.slice(0, field.code.indexOf('.')) : '';
    const name = cleanFieldLabel(field);
    return alias ? `${alias}.${name}` : name;
}
function displayFieldRef(field) {
    return aliasFieldRef(field);
}
function fieldCodeToLabel(code) {
    return props.fields.find((field) => field.code === code)?.label || code;
}
function internalFormulaToDisplay(formula) {
    return (formula || '').replace(/FIELD\(\s*["']([^"']+)["']\s*\)/gi, (_match, code) => {
        const field = props.fields.find((f) => f.code === code);
        return field ? aliasFieldRef(field) : code;
    });
}
function normalizeDisplayFormula(formula) {
    const trimmed = (formula || '').trimStart();
    if (!trimmed)
        return '';
    return `=${trimmed.replace(/^=+/, '')}`;
}
function insertText(text, cursorOffset = text.length) {
    const current = form.formula || '';
    const { start, end } = insertionRange(current);
    if (text === '=' && current.slice(start, end || start + 1) === '=') {
        focusFormulaAt(start + 1);
        return;
    }
    const prefix = shouldPrefixSpace(current, start, text) ? ' ' : '';
    const inserted = `${prefix}${text}`;
    form.formula = `${current.slice(0, start)}${inserted}${current.slice(end)}`;
    validation.value = null;
    markDirty();
    focusFormulaAt(start + prefix.length + cursorOffset);
}
function insertField(field) {
    insertText(displayFieldRef(field));
}
function insertFunction(fn) {
    const snippet = `${fn.code}()`;
    insertText(snippet, fn.code.length + 1);
}
function insertOperator(item) {
    insertText(item.text, item.cursorOffset ?? item.text.length);
}
function insertConstant(item) {
    insertText(item.text);
}
function chatHistoryPayload() {
    return chatMessages.value.slice(-8).map((item) => ({
        role: item.role,
        content: item.content,
        formula: item.formula || null,
    }));
}
function errorMessage(e, fallback) {
    if (e?.code === 'ECONNABORTED')
        return '模型生成超时，请稍后重试或调大 AI 配置超时时间';
    return e?.response?.data?.detail || e?.message || fallback;
}
function normalizeAiFailureMessage(e) {
    const raw = errorMessage(e, '');
    if (e?.code === 'ECONNABORTED') {
        return '这次模型响应超时了，没有生成可用公式。可以缩短需求描述后重试，或在 AI 基础配置里调大超时时间。';
    }
    if (/Request failed with status code/i.test(raw)) {
        return '这次模型接口没有返回可用结果，我没有更新公式。请稍后重试，或检查 AI 基础配置里的模型和接口地址。';
    }
    if (/json|合法 JSON|JSON/i.test(raw)) {
        return '模型返回的内容格式不符合公式助手要求，我没有更新公式。请继续用一句话补充需求，我会重新生成结构化公式。';
    }
    if (/模型接口|Base URL|api key|unauthorized|forbidden|401|403/i.test(raw)) {
        return '模型接口调用失败，我没有更新公式。请检查 AI 基础配置里的 Base URL、API Key 和模型名称是否匹配。';
    }
    return raw || '这次没有生成可用公式，请换一种更明确的说法后重试。';
}
function compactFormulaIssues(issues) {
    const list = (issues || []).filter(Boolean);
    if (!list.length)
        return '';
    return list.slice(0, 2).join('；') + (list.length > 2 ? '。其余问题可在右侧校验结果查看。' : '');
}
function draftValidationErrors(draft) {
    return Array.isArray(draft?.validation_errors) ? draft.validation_errors.filter(Boolean) : [];
}
function buildAssistantReply(draft, applyResult) {
    const summary = draft.change_summary || draft.explanation || '已更新公式草稿。';
    if (draft.should_update_formula === false || draft.intent === 'formula_question') {
        const lines = [
            draft.explanation || draft.change_summary || '已回答你的问题。',
            draft.standard_excel_formula ? `标准 Excel：${draft.standard_excel_formula}` : '',
            draft.platform_limitation ? `平台限制：${draft.platform_limitation}` : '',
        ].filter(Boolean);
        return lines.join('\n');
    }
    const validationErrors = applyResult.validationErrors || draftValidationErrors(draft);
    const platformLimitation = draft.platform_limitation;
    if (validationErrors.length) {
        return `${summary}\n\n公式区已更新，但当前草稿还没有通过校验：${compactFormulaIssues(validationErrors)}`;
    }
    if (platformLimitation) {
        return `${summary}\n\n平台限制：${platformLimitation}`;
    }
    const warnings = Array.isArray(draft.warnings) ? draft.warnings.filter(Boolean) : [];
    if (warnings.length) {
        return `${summary}\n\n提示：${warnings.slice(0, 2).join('；')}`;
    }
    return summary;
}
async function applyDraftToFormula(draft) {
    if (draft.should_update_formula === false || draft.intent === 'formula_question') {
        return { valid: true, validationErrors: [] };
    }
    form.label = draft.field_label || form.label;
    form.formula = normalizeDisplayFormula(internalFormulaToDisplay(draft.formula_display || draft.formula));
    form.formula_display = form.formula;
    form.data_type = draft.data_type || 'number';
    validation.value = null;
    try {
        const result = await aiFormulaApi.validate({
            dataset_id: props.datasetId,
            formula: draft.formula,
        });
        validation.value = {
            ...result,
            warnings: [...(draft.warnings || []), ...(result.warnings || [])],
        };
        if (result.valid) {
            form.formula = normalizeDisplayFormula(internalFormulaToDisplay(result.formula));
        }
        return { valid: result.valid, validationErrors: result.valid ? [] : result.errors };
    }
    catch (e) {
        return {
            valid: false,
            validationErrors: [errorMessage(e, '自动校验失败')],
        };
    }
}
async function sendChat() {
    if (!props.datasetId) {
        ElMessage.warning('请先选择数据集');
        return;
    }
    const message = chatInput.value.trim();
    if (!message) {
        ElMessage.warning('请先输入调整需求');
        return;
    }
    const history = chatHistoryPayload();
    chatMessages.value.push({
        id: ++chatId,
        role: 'user',
        content: message,
        formula: form.formula || null,
    });
    chatInput.value = '';
    scrollChatToBottom();
    generating.value = true;
    try {
        const draft = await aiFormulaApi.draft({
            dataset_id: props.datasetId,
            message,
            current_formula: form.formula || null,
            current_field_label: form.label || null,
            history,
        });
        const shouldUpdateFormula = draft.should_update_formula !== false && draft.intent !== 'formula_question';
        const applyResult = await applyDraftToFormula(draft);
        chatMessages.value.push({
            id: ++chatId,
            role: 'assistant',
            content: buildAssistantReply(draft, applyResult),
            formula: shouldUpdateFormula ? form.formula || null : null,
        });
        if (shouldUpdateFormula)
            markDirty();
        if (shouldUpdateFormula && applyResult.validationErrors?.length) {
            ElMessage.warning('公式草稿已生成，但还需要调整后才能保存');
        }
        scrollChatToBottom();
    }
    catch (e) {
        const error = normalizeAiFailureMessage(e);
        chatMessages.value.push({
            id: ++chatId,
            role: 'assistant',
            content: error,
            formula: form.formula || null,
        });
        scrollChatToBottom();
        ElMessage.error(error);
    }
    finally {
        generating.value = false;
    }
}
function inferAggRole() {
    return form.data_type === 'number' ? 'measure' : 'dimension';
}
function handleChatKeydown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendChat();
    }
}
async function validate() {
    if (!props.datasetId || !form.formula.trim())
        return false;
    validating.value = true;
    try {
        const result = await aiFormulaApi.validate({
            dataset_id: props.datasetId,
            formula: form.formula.trim(),
        });
        validation.value = result;
        if (result.valid) {
            form.formula = normalizeDisplayFormula(internalFormulaToDisplay(result.formula));
            ElMessage.success('公式校验通过');
            return true;
        }
        ElMessage.warning(result.errors.join('；') || '公式未通过校验');
        return false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '校验失败');
        return false;
    }
    finally {
        validating.value = false;
    }
}
async function save() {
    if (!props.datasetId) {
        ElMessage.warning('请先选择数据集');
        return;
    }
    if (!form.label.trim() || !form.formula.trim()) {
        ElMessage.warning('字段名称和公式必填');
        return;
    }
    if (!form.code.trim()) {
        ElMessage.warning('字段编码正在生成，请稍后再保存');
        return;
    }
    const ok = validation.value?.valid || await validate();
    if (!ok)
        return;
    const latestValidation = await aiFormulaApi.validate({
        dataset_id: props.datasetId,
        formula: form.formula.trim(),
    });
    if (!latestValidation.valid) {
        validation.value = latestValidation;
        ElMessage.warning(latestValidation.errors.join('；') || '公式未通过校验');
        return;
    }
    validation.value = latestValidation;
    form.formula = normalizeDisplayFormula(internalFormulaToDisplay(latestValidation.formula));
    saving.value = true;
    try {
        const payload = {
            code: form.code.trim() || null,
            label: form.label.trim(),
            description: form.description.trim() || null,
            formula: form.formula.trim(),
            formula_display: null,
            data_type: form.data_type,
            agg_role: inferAggRole(),
            is_sensitive: form.is_sensitive,
            is_active: true,
        };
        let saved;
        if (props.editField?.id) {
            saved = await datasetsApi.updateCalculatedField(props.datasetId, props.editField.id, payload);
        }
        else {
            saved = await aiFormulaApi.saveCalculatedField(props.datasetId, payload);
        }
        ElMessage.success('计算字段已保存');
        dirty.value = false;
        emit('saved', saved);
        open.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function removeField() {
    if (!props.datasetId || !props.editField?.id)
        return;
    try {
        await ElMessageBox.confirm(`确定删除计算字段「${props.editField.label || props.editField.code}」吗？` +
            '删除后，引用了该字段的报表/拆分规则将自动跳过它，结果可能变化。', '删除计算字段', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    deleting.value = true;
    try {
        await datasetsApi.removeCalculatedField(props.datasetId, props.editField.id);
        ElMessage.success('计算字段已删除');
        dirty.value = false;
        emit('saved', props.editField);
        open.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
    finally {
        deleting.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-titlebar']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-items']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-main']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-card']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['user']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['send-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-card']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-button']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-input']} */ ;
/** @type {__VLS_StyleScopedClasses['el-textarea__inner']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-card']} */ ;
/** @type {__VLS_StyleScopedClasses['config-form']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row-2col']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-error']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-warn']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-main']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-browser']} */ ;
/** @type {__VLS_StyleScopedClasses['head-note']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-browser']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group-select']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-items']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['el-dialog__body']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer']} */ ;
/** @type {__VLS_StyleScopedClasses['title-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['title-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['send-icon-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.inline) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "formula-designer formula-designer--inline" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "resource-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-title" },
    });
    const __VLS_0 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        modelValue: (__VLS_ctx.activePickerTab),
        ...{ class: "picker-tabs" },
    }));
    const __VLS_2 = __VLS_1({
        modelValue: (__VLS_ctx.activePickerTab),
        ...{ class: "picker-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    const __VLS_4 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        label: "字段",
        name: "fields",
    }));
    const __VLS_6 = __VLS_5({
        label: "字段",
        name: "fields",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    const __VLS_8 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "函数",
        name: "functions",
    }));
    const __VLS_10 = __VLS_9({
        label: "函数",
        name: "functions",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const __VLS_12 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        label: "常量",
        name: "constants",
    }));
    const __VLS_14 = __VLS_13({
        label: "常量",
        name: "constants",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_3;
    const __VLS_16 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        modelValue: (__VLS_ctx.fieldKeyword),
        ...{ class: "picker-search" },
        size: "small",
        placeholder: "搜索",
        prefixIcon: (__VLS_ctx.Search),
    }));
    const __VLS_18 = __VLS_17({
        modelValue: (__VLS_ctx.fieldKeyword),
        ...{ class: "picker-search" },
        size: "small",
        placeholder: "搜索",
        prefixIcon: (__VLS_ctx.Search),
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-browser" },
    });
    const __VLS_20 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        modelValue: (__VLS_ctx.activeResourceGroup),
        ...{ class: "resource-group-select" },
        size: "small",
        placeholder: "选择分组",
        disabled: (!__VLS_ctx.resourceGroups.length),
    }));
    const __VLS_22 = __VLS_21({
        modelValue: (__VLS_ctx.activeResourceGroup),
        ...{ class: "resource-group-select" },
        size: "small",
        placeholder: "选择分组",
        disabled: (!__VLS_ctx.resourceGroups.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    __VLS_23.slots.default;
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.resourceGroups))) {
        const __VLS_24 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            key: (group.key),
            label: (`${group.label}（${group.items.length}）`),
            value: (group.key),
        }));
        const __VLS_26 = __VLS_25({
            key: (group.key),
            label: (`${group.label}（${group.items.length}）`),
            value: (group.key),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    }
    var __VLS_23;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-groups" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.resourceGroups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.inline))
                        return;
                    __VLS_ctx.activeResourceGroup = group.key;
                } },
            key: (group.key),
            type: "button",
            ...{ class: "resource-group" },
            ...{ class: ({ active: group.key === __VLS_ctx.activeResourceGroup }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "group-plus" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (group.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        (group.items.length);
    }
    if (!__VLS_ctx.resourceGroups.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-side" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-items" },
    });
    if (__VLS_ctx.activePickerTab === 'fields') {
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.activeFieldItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'fields'))
                            return;
                        __VLS_ctx.insertField(field);
                    } },
                key: (field.code),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.cleanFieldLabel(field));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (__VLS_ctx.cleanFieldCode(field));
        }
    }
    if (__VLS_ctx.activePickerTab === 'functions') {
        for (const [fn] of __VLS_getVForSourceType((__VLS_ctx.activeFunctionItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'functions'))
                            return;
                        __VLS_ctx.insertFunction(fn);
                    } },
                key: (`${fn.id || fn.code}`),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (fn.code);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (fn.name);
        }
    }
    if (__VLS_ctx.activePickerTab === 'constants') {
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeConstantItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'constants'))
                            return;
                        __VLS_ctx.insertConstant(item);
                    } },
                key: (item.code),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (item.code);
            (item.hint);
        }
    }
    if (!__VLS_ctx.activeResourceItems.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-side" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "designer-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "formula-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head compact-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-marker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "head-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "operator-bar" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.formulaOperators))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.inline))
                        return;
                    __VLS_ctx.insertOperator(item);
                } },
            key: (item.label),
            type: "button",
            ...{ class: "operator-button" },
        });
        (item.label);
    }
    const __VLS_28 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onInput': {} },
        ...{ 'onBlur': {} },
        ...{ 'onClick': {} },
        ...{ 'onKeyup': {} },
        ...{ 'onSelect': {} },
        ref: "formulaInputRef",
        modelValue: (__VLS_ctx.form.formula),
        ...{ class: "formula-input" },
        type: "textarea",
        spellcheck: "false",
        placeholder: "=IF(员工姓名=&quot;刘琦&quot;,1,2)",
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onInput': {} },
        ...{ 'onBlur': {} },
        ...{ 'onClick': {} },
        ...{ 'onKeyup': {} },
        ...{ 'onSelect': {} },
        ref: "formulaInputRef",
        modelValue: (__VLS_ctx.form.formula),
        ...{ class: "formula-input" },
        type: "textarea",
        spellcheck: "false",
        placeholder: "=IF(员工姓名=&quot;刘琦&quot;,1,2)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onInput: (__VLS_ctx.markDirty)
    };
    const __VLS_36 = {
        onBlur: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_37 = {
        onClick: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_38 = {
        onKeyup: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_39 = {
        onSelect: (__VLS_ctx.rememberFormulaCursor)
    };
    /** @type {typeof __VLS_ctx.formulaInputRef} */ ;
    var __VLS_40 = {};
    var __VLS_31;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "ai-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head compact-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-marker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "head-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "chatScrollRef",
        ...{ class: "chat-thread" },
    });
    /** @type {typeof __VLS_ctx.chatScrollRef} */ ;
    if (!__VLS_ctx.chatMessages.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-empty" },
        });
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.chatMessages))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.id),
            ...{ class: "chat-message" },
            ...{ class: (item.role) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-bubble" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-content" },
        });
        (item.content);
        if (item.role === 'assistant' && item.formula) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
                ...{ class: "chat-formula" },
            });
            (item.formula);
        }
    }
    if (__VLS_ctx.generating) {
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
    const __VLS_42 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
        ...{ 'onKeydown': {} },
        modelValue: (__VLS_ctx.chatInput),
        ...{ class: "ai-send-input" },
        type: "textarea",
        autosize: ({ minRows: 1, maxRows: 3 }),
        resize: "none",
        placeholder: "给 AI 发送消息",
    }));
    const __VLS_44 = __VLS_43({
        ...{ 'onKeydown': {} },
        modelValue: (__VLS_ctx.chatInput),
        ...{ class: "ai-send-input" },
        type: "textarea",
        autosize: ({ minRows: 1, maxRows: 3 }),
        resize: "none",
        placeholder: "给 AI 发送消息",
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    let __VLS_46;
    let __VLS_47;
    let __VLS_48;
    const __VLS_49 = {
        onKeydown: (__VLS_ctx.handleChatKeydown)
    };
    var __VLS_45;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ai-send-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "send-hint" },
    });
    const __VLS_50 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
        ...{ 'onClick': {} },
        ...{ class: "send-icon-button" },
        type: "primary",
        circle: true,
        loading: (__VLS_ctx.generating),
    }));
    const __VLS_52 = __VLS_51({
        ...{ 'onClick': {} },
        ...{ class: "send-icon-button" },
        type: "primary",
        circle: true,
        loading: (__VLS_ctx.generating),
    }, ...__VLS_functionalComponentArgsRest(__VLS_51));
    let __VLS_54;
    let __VLS_55;
    let __VLS_56;
    const __VLS_57 = {
        onClick: (__VLS_ctx.sendChat)
    };
    __VLS_53.slots.default;
    const __VLS_58 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({}));
    const __VLS_60 = __VLS_59({}, ...__VLS_functionalComponentArgsRest(__VLS_59));
    __VLS_61.slots.default;
    const __VLS_62 = {}.Position;
    /** @type {[typeof __VLS_components.Position, ]} */ ;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent(__VLS_62, new __VLS_62({}));
    const __VLS_64 = __VLS_63({}, ...__VLS_functionalComponentArgsRest(__VLS_63));
    var __VLS_61;
    var __VLS_53;
}
else {
    const __VLS_66 = {}.ElDialog;
    /** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent(__VLS_66, new __VLS_66({
        modelValue: (__VLS_ctx.open),
        width: "92vw",
        top: "0",
        ...{ class: "formula-designer-dialog" },
        modalClass: "formula-designer-modal",
        headerClass: "formula-designer-dialog-header",
        bodyClass: "formula-designer-dialog-body",
        appendToBody: true,
        showClose: (false),
        closeOnClickModal: (false),
        beforeClose: (__VLS_ctx.requestClose),
    }));
    const __VLS_68 = __VLS_67({
        modelValue: (__VLS_ctx.open),
        width: "92vw",
        top: "0",
        ...{ class: "formula-designer-dialog" },
        modalClass: "formula-designer-modal",
        headerClass: "formula-designer-dialog-header",
        bodyClass: "formula-designer-dialog-body",
        appendToBody: true,
        showClose: (false),
        closeOnClickModal: (false),
        beforeClose: (__VLS_ctx.requestClose),
    }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    __VLS_69.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_69.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "designer-titlebar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "designer-title" },
        });
        (__VLS_ctx.title || (__VLS_ctx.editField ? '编辑计算字段' : '新建计算字段'));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "designer-subtitle" },
        });
        (__VLS_ctx.subtitle || '用自然语言生成公式，也可以手动插入字段、函数和常量。');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "title-actions" },
        });
        var __VLS_70 = {};
        if (!__VLS_ctx.hideDefaultActions && __VLS_ctx.editField?.id && __VLS_ctx.canDeleteField) {
            const __VLS_72 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                ...{ 'onClick': {} },
                type: "danger",
                plain: true,
                loading: (__VLS_ctx.deleting),
            }));
            const __VLS_74 = __VLS_73({
                ...{ 'onClick': {} },
                type: "danger",
                plain: true,
                loading: (__VLS_ctx.deleting),
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            let __VLS_76;
            let __VLS_77;
            let __VLS_78;
            const __VLS_79 = {
                onClick: (__VLS_ctx.removeField)
            };
            __VLS_75.slots.default;
            const __VLS_80 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({}));
            const __VLS_82 = __VLS_81({}, ...__VLS_functionalComponentArgsRest(__VLS_81));
            __VLS_83.slots.default;
            const __VLS_84 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
            const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
            var __VLS_83;
            var __VLS_75;
        }
        if (!__VLS_ctx.hideDefaultActions) {
            const __VLS_88 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                ...{ 'onClick': {} },
            }));
            const __VLS_90 = __VLS_89({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            let __VLS_92;
            let __VLS_93;
            let __VLS_94;
            const __VLS_95 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.inline))
                        return;
                    if (!(!__VLS_ctx.hideDefaultActions))
                        return;
                    __VLS_ctx.requestClose();
                }
            };
            __VLS_91.slots.default;
            const __VLS_96 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
            const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
            __VLS_99.slots.default;
            const __VLS_100 = {}.Close;
            /** @type {[typeof __VLS_components.Close, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({}));
            const __VLS_102 = __VLS_101({}, ...__VLS_functionalComponentArgsRest(__VLS_101));
            var __VLS_99;
            var __VLS_91;
        }
        if (!__VLS_ctx.hideDefaultActions) {
            const __VLS_104 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.validating),
            }));
            const __VLS_106 = __VLS_105({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.validating),
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
            let __VLS_108;
            let __VLS_109;
            let __VLS_110;
            const __VLS_111 = {
                onClick: (__VLS_ctx.validate)
            };
            __VLS_107.slots.default;
            const __VLS_112 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
            const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
            __VLS_115.slots.default;
            const __VLS_116 = {}.Check;
            /** @type {[typeof __VLS_components.Check, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
            const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
            var __VLS_115;
            var __VLS_107;
        }
        if (!__VLS_ctx.hideDefaultActions) {
            const __VLS_120 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.saving),
            }));
            const __VLS_122 = __VLS_121({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.saving),
            }, ...__VLS_functionalComponentArgsRest(__VLS_121));
            let __VLS_124;
            let __VLS_125;
            let __VLS_126;
            const __VLS_127 = {
                onClick: (__VLS_ctx.save)
            };
            __VLS_123.slots.default;
            const __VLS_128 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
            const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
            __VLS_131.slots.default;
            const __VLS_132 = {}.Plus;
            /** @type {[typeof __VLS_components.Plus, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({}));
            const __VLS_134 = __VLS_133({}, ...__VLS_functionalComponentArgsRest(__VLS_133));
            var __VLS_131;
            var __VLS_123;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "formula-designer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "resource-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "panel-title" },
    });
    const __VLS_136 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        modelValue: (__VLS_ctx.activePickerTab),
        ...{ class: "picker-tabs" },
    }));
    const __VLS_138 = __VLS_137({
        modelValue: (__VLS_ctx.activePickerTab),
        ...{ class: "picker-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    __VLS_139.slots.default;
    const __VLS_140 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        label: "字段",
        name: "fields",
    }));
    const __VLS_142 = __VLS_141({
        label: "字段",
        name: "fields",
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    const __VLS_144 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        label: "函数",
        name: "functions",
    }));
    const __VLS_146 = __VLS_145({
        label: "函数",
        name: "functions",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    const __VLS_148 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        label: "常量",
        name: "constants",
    }));
    const __VLS_150 = __VLS_149({
        label: "常量",
        name: "constants",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    var __VLS_139;
    const __VLS_152 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        modelValue: (__VLS_ctx.fieldKeyword),
        ...{ class: "picker-search" },
        size: "small",
        placeholder: "搜索",
        prefixIcon: (__VLS_ctx.Search),
    }));
    const __VLS_154 = __VLS_153({
        modelValue: (__VLS_ctx.fieldKeyword),
        ...{ class: "picker-search" },
        size: "small",
        placeholder: "搜索",
        prefixIcon: (__VLS_ctx.Search),
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-browser" },
    });
    const __VLS_156 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        modelValue: (__VLS_ctx.activeResourceGroup),
        ...{ class: "resource-group-select" },
        size: "small",
        placeholder: "选择分组",
        disabled: (!__VLS_ctx.resourceGroups.length),
    }));
    const __VLS_158 = __VLS_157({
        modelValue: (__VLS_ctx.activeResourceGroup),
        ...{ class: "resource-group-select" },
        size: "small",
        placeholder: "选择分组",
        disabled: (!__VLS_ctx.resourceGroups.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.resourceGroups))) {
        const __VLS_160 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
            key: (group.key),
            label: (`${group.label}（${group.items.length}）`),
            value: (group.key),
        }));
        const __VLS_162 = __VLS_161({
            key: (group.key),
            label: (`${group.label}（${group.items.length}）`),
            value: (group.key),
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    }
    var __VLS_159;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-groups" },
    });
    for (const [group] of __VLS_getVForSourceType((__VLS_ctx.resourceGroups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.inline))
                        return;
                    __VLS_ctx.activeResourceGroup = group.key;
                } },
            key: (group.key),
            type: "button",
            ...{ class: "resource-group" },
            ...{ class: ({ active: group.key === __VLS_ctx.activeResourceGroup }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "group-plus" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (group.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        (group.items.length);
    }
    if (!__VLS_ctx.resourceGroups.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-side" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-items" },
    });
    if (__VLS_ctx.activePickerTab === 'fields') {
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.activeFieldItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'fields'))
                            return;
                        __VLS_ctx.insertField(field);
                    } },
                key: (field.code),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.cleanFieldLabel(field));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (__VLS_ctx.cleanFieldCode(field));
        }
    }
    if (__VLS_ctx.activePickerTab === 'functions') {
        for (const [fn] of __VLS_getVForSourceType((__VLS_ctx.activeFunctionItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'functions'))
                            return;
                        __VLS_ctx.insertFunction(fn);
                    } },
                key: (`${fn.id || fn.code}`),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (fn.code);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (fn.name);
        }
    }
    if (__VLS_ctx.activePickerTab === 'constants') {
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.activeConstantItems))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.inline))
                            return;
                        if (!(__VLS_ctx.activePickerTab === 'constants'))
                            return;
                        __VLS_ctx.insertConstant(item);
                    } },
                key: (item.code),
                type: "button",
                ...{ class: "pick-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (item.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
            (item.code);
            (item.hint);
        }
    }
    if (!__VLS_ctx.activeResourceItems.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-side" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "designer-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "formula-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head compact-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-marker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "head-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "operator-bar" },
    });
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.formulaOperators))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.inline))
                        return;
                    __VLS_ctx.insertOperator(item);
                } },
            key: (item.label),
            type: "button",
            ...{ class: "operator-button" },
        });
        (item.label);
    }
    const __VLS_164 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        ...{ 'onInput': {} },
        ...{ 'onBlur': {} },
        ...{ 'onClick': {} },
        ...{ 'onKeyup': {} },
        ...{ 'onSelect': {} },
        ref: "formulaInputRef",
        modelValue: (__VLS_ctx.form.formula),
        ...{ class: "formula-input" },
        type: "textarea",
        spellcheck: "false",
        placeholder: "=IF(员工姓名=&quot;刘琦&quot;,1,2)",
    }));
    const __VLS_166 = __VLS_165({
        ...{ 'onInput': {} },
        ...{ 'onBlur': {} },
        ...{ 'onClick': {} },
        ...{ 'onKeyup': {} },
        ...{ 'onSelect': {} },
        ref: "formulaInputRef",
        modelValue: (__VLS_ctx.form.formula),
        ...{ class: "formula-input" },
        type: "textarea",
        spellcheck: "false",
        placeholder: "=IF(员工姓名=&quot;刘琦&quot;,1,2)",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    let __VLS_168;
    let __VLS_169;
    let __VLS_170;
    const __VLS_171 = {
        onInput: (__VLS_ctx.markDirty)
    };
    const __VLS_172 = {
        onBlur: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_173 = {
        onClick: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_174 = {
        onKeyup: (__VLS_ctx.rememberFormulaCursor)
    };
    const __VLS_175 = {
        onSelect: (__VLS_ctx.rememberFormulaCursor)
    };
    /** @type {typeof __VLS_ctx.formulaInputRef} */ ;
    var __VLS_176 = {};
    var __VLS_167;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "ai-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head compact-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-marker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "head-note" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ref: "chatScrollRef",
        ...{ class: "chat-thread" },
    });
    /** @type {typeof __VLS_ctx.chatScrollRef} */ ;
    if (!__VLS_ctx.chatMessages.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-empty" },
        });
    }
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.chatMessages))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (item.id),
            ...{ class: "chat-message" },
            ...{ class: (item.role) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-bubble" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "chat-content" },
        });
        (item.content);
        if (item.role === 'assistant' && item.formula) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
                ...{ class: "chat-formula" },
            });
            (item.formula);
        }
    }
    if (__VLS_ctx.generating) {
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
    const __VLS_178 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
        ...{ 'onKeydown': {} },
        modelValue: (__VLS_ctx.chatInput),
        ...{ class: "ai-send-input" },
        type: "textarea",
        autosize: ({ minRows: 1, maxRows: 3 }),
        resize: "none",
        placeholder: "给 AI 发送消息，例如：如果员工是刘琦，则等于1，否则等于2",
    }));
    const __VLS_180 = __VLS_179({
        ...{ 'onKeydown': {} },
        modelValue: (__VLS_ctx.chatInput),
        ...{ class: "ai-send-input" },
        type: "textarea",
        autosize: ({ minRows: 1, maxRows: 3 }),
        resize: "none",
        placeholder: "给 AI 发送消息，例如：如果员工是刘琦，则等于1，否则等于2",
    }, ...__VLS_functionalComponentArgsRest(__VLS_179));
    let __VLS_182;
    let __VLS_183;
    let __VLS_184;
    const __VLS_185 = {
        onKeydown: (__VLS_ctx.handleChatKeydown)
    };
    var __VLS_181;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ai-send-actions" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "send-hint" },
    });
    const __VLS_186 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
        ...{ 'onClick': {} },
        ...{ class: "send-icon-button" },
        type: "primary",
        circle: true,
        loading: (__VLS_ctx.generating),
    }));
    const __VLS_188 = __VLS_187({
        ...{ 'onClick': {} },
        ...{ class: "send-icon-button" },
        type: "primary",
        circle: true,
        loading: (__VLS_ctx.generating),
    }, ...__VLS_functionalComponentArgsRest(__VLS_187));
    let __VLS_190;
    let __VLS_191;
    let __VLS_192;
    const __VLS_193 = {
        onClick: (__VLS_ctx.sendChat)
    };
    __VLS_189.slots.default;
    const __VLS_194 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({}));
    const __VLS_196 = __VLS_195({}, ...__VLS_functionalComponentArgsRest(__VLS_195));
    __VLS_197.slots.default;
    const __VLS_198 = {}.Position;
    /** @type {[typeof __VLS_components.Position, ]} */ ;
    // @ts-ignore
    const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({}));
    const __VLS_200 = __VLS_199({}, ...__VLS_functionalComponentArgsRest(__VLS_199));
    var __VLS_197;
    var __VLS_189;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "config-panel" },
    });
    var __VLS_202 = {};
    if (!__VLS_ctx.hideDefaultConfig) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
            ...{ class: "config-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-head compact-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "section-marker" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_204 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            labelPosition: "top",
            ...{ class: "config-form" },
        }));
        const __VLS_206 = __VLS_205({
            labelPosition: "top",
            ...{ class: "config-form" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        const __VLS_208 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            label: "字段名称",
            required: true,
        }));
        const __VLS_210 = __VLS_209({
            label: "字段名称",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        __VLS_211.slots.default;
        const __VLS_212 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            ...{ 'onInput': {} },
            modelValue: (__VLS_ctx.form.label),
            placeholder: "如 个税金额",
        }));
        const __VLS_214 = __VLS_213({
            ...{ 'onInput': {} },
            modelValue: (__VLS_ctx.form.label),
            placeholder: "如 个税金额",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        let __VLS_216;
        let __VLS_217;
        let __VLS_218;
        const __VLS_219 = {
            onInput: (__VLS_ctx.markDirty)
        };
        var __VLS_215;
        var __VLS_211;
        const __VLS_220 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            label: "字段编码",
        }));
        const __VLS_222 = __VLS_221({
            label: "字段编码",
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        __VLS_223.slots.default;
        /** @type {[typeof SmartCodeInput, ]} */ ;
        // @ts-ignore
        const __VLS_224 = __VLS_asFunctionalComponent(SmartCodeInput, new SmartCodeInput({
            modelValue: (__VLS_ctx.form.code),
            label: (__VLS_ctx.form.label),
            scope: "calculated_field",
            datasetId: (__VLS_ctx.datasetId),
            existingCodes: (__VLS_ctx.existingCalculatedCodes),
            context: "数据集计算字段",
        }));
        const __VLS_225 = __VLS_224({
            modelValue: (__VLS_ctx.form.code),
            label: (__VLS_ctx.form.label),
            scope: "calculated_field",
            datasetId: (__VLS_ctx.datasetId),
            existingCodes: (__VLS_ctx.existingCalculatedCodes),
            context: "数据集计算字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_224));
        var __VLS_223;
        const __VLS_227 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
            label: "字段类型",
        }));
        const __VLS_229 = __VLS_228({
            label: "字段类型",
        }, ...__VLS_functionalComponentArgsRest(__VLS_228));
        __VLS_230.slots.default;
        const __VLS_231 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.data_type),
            ...{ style: {} },
        }));
        const __VLS_233 = __VLS_232({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.data_type),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_232));
        let __VLS_235;
        let __VLS_236;
        let __VLS_237;
        const __VLS_238 = {
            onChange: (__VLS_ctx.markDirty)
        };
        __VLS_234.slots.default;
        const __VLS_239 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
            label: "数值",
            value: "number",
        }));
        const __VLS_241 = __VLS_240({
            label: "数值",
            value: "number",
        }, ...__VLS_functionalComponentArgsRest(__VLS_240));
        const __VLS_243 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
            label: "文本",
            value: "string",
        }));
        const __VLS_245 = __VLS_244({
            label: "文本",
            value: "string",
        }, ...__VLS_functionalComponentArgsRest(__VLS_244));
        const __VLS_247 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
            label: "日期",
            value: "date",
        }));
        const __VLS_249 = __VLS_248({
            label: "日期",
            value: "date",
        }, ...__VLS_functionalComponentArgsRest(__VLS_248));
        const __VLS_251 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
            label: "布尔",
            value: "bool",
        }));
        const __VLS_253 = __VLS_252({
            label: "布尔",
            value: "bool",
        }, ...__VLS_functionalComponentArgsRest(__VLS_252));
        var __VLS_234;
        var __VLS_230;
        const __VLS_255 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
            label: "描述",
        }));
        const __VLS_257 = __VLS_256({
            label: "描述",
        }, ...__VLS_functionalComponentArgsRest(__VLS_256));
        __VLS_258.slots.default;
        const __VLS_259 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
            ...{ 'onInput': {} },
            modelValue: (__VLS_ctx.form.description),
            type: "textarea",
            rows: (3),
            maxlength: "200",
            showWordLimit: true,
            placeholder: "输入描述信息",
        }));
        const __VLS_261 = __VLS_260({
            ...{ 'onInput': {} },
            modelValue: (__VLS_ctx.form.description),
            type: "textarea",
            rows: (3),
            maxlength: "200",
            showWordLimit: true,
            placeholder: "输入描述信息",
        }, ...__VLS_functionalComponentArgsRest(__VLS_260));
        let __VLS_263;
        let __VLS_264;
        let __VLS_265;
        const __VLS_266 = {
            onInput: (__VLS_ctx.markDirty)
        };
        var __VLS_262;
        var __VLS_258;
        const __VLS_267 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({}));
        const __VLS_269 = __VLS_268({}, ...__VLS_functionalComponentArgsRest(__VLS_268));
        __VLS_270.slots.default;
        const __VLS_271 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.is_sensitive),
            activeText: "绝密（所有人脱敏）",
            inactiveText: "按依赖裁决",
        }));
        const __VLS_273 = __VLS_272({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.form.is_sensitive),
            activeText: "绝密（所有人脱敏）",
            inactiveText: "按依赖裁决",
        }, ...__VLS_functionalComponentArgsRest(__VLS_272));
        let __VLS_275;
        let __VLS_276;
        let __VLS_277;
        const __VLS_278 = {
            onChange: (__VLS_ctx.markDirty)
        };
        var __VLS_274;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        var __VLS_270;
        var __VLS_207;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "config-card validation-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-head compact-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "section-marker" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "validate-panel" },
        ...{ class: ({ ok: __VLS_ctx.validation?.valid, bad: __VLS_ctx.validation && !__VLS_ctx.validation.valid }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "validate-title" },
    });
    (__VLS_ctx.validation ? (__VLS_ctx.validation.valid ? '校验通过' : '校验未通过') : '尚未校验');
    if (__VLS_ctx.validation?.depends_on?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "validate-line" },
        });
        (__VLS_ctx.validation.depends_on.join('，'));
    }
    if (__VLS_ctx.validation?.used_functions?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "validate-line" },
        });
        (__VLS_ctx.validation.used_functions.join('，'));
    }
    if (__VLS_ctx.validation?.is_sensitive) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "validate-line" },
        });
    }
    for (const [err] of __VLS_getVForSourceType((__VLS_ctx.validation?.errors || []))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (err),
            ...{ class: "validate-error" },
        });
        (err);
    }
    for (const [warn] of __VLS_getVForSourceType((__VLS_ctx.validation?.warnings || []))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (warn),
            ...{ class: "validate-warn" },
        });
        (warn);
    }
    var __VLS_69;
}
/** @type {__VLS_StyleScopedClasses['formula-designer']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer--inline']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-search']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-browser']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group-select']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['group-plus']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-side']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-items']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-side']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-main']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['head-note']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-button']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['head-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-content']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-box']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['send-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['send-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-titlebar']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-title']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['title-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-designer']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-title']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-search']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-browser']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group-select']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-groups']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-group']} */ ;
/** @type {__VLS_StyleScopedClasses['group-plus']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-side']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-items']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['pick-item']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-side']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-main']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['head-note']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['operator-button']} */ ;
/** @type {__VLS_StyleScopedClasses['formula-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['head-note']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-thread']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-content']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-formula']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-message']} */ ;
/** @type {__VLS_StyleScopedClasses['assistant']} */ ;
/** @type {__VLS_StyleScopedClasses['chat-bubble']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-box']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-input']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-send-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['send-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['send-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['config-form']} */ ;
/** @type {__VLS_StyleScopedClasses['config-card']} */ ;
/** @type {__VLS_StyleScopedClasses['validation-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-marker']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-title']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-line']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-line']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-line']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-error']} */ ;
/** @type {__VLS_StyleScopedClasses['validate-warn']} */ ;
// @ts-ignore
var __VLS_41 = __VLS_40, __VLS_71 = __VLS_70, __VLS_177 = __VLS_176, __VLS_203 = __VLS_202;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Check: Check,
            Close: Close,
            Plus: Plus,
            Search: Search,
            Position: Position,
            Delete: Delete,
            SmartCodeInput: SmartCodeInput,
            form: form,
            generating: generating,
            validating: validating,
            saving: saving,
            deleting: deleting,
            canDeleteField: canDeleteField,
            validation: validation,
            fieldKeyword: fieldKeyword,
            formulaInputRef: formulaInputRef,
            chatInput: chatInput,
            chatScrollRef: chatScrollRef,
            activePickerTab: activePickerTab,
            chatMessages: chatMessages,
            formulaOperators: formulaOperators,
            activeResourceGroup: activeResourceGroup,
            open: open,
            existingCalculatedCodes: existingCalculatedCodes,
            cleanFieldCode: cleanFieldCode,
            cleanFieldLabel: cleanFieldLabel,
            resourceGroups: resourceGroups,
            activeResourceItems: activeResourceItems,
            activeFieldItems: activeFieldItems,
            activeFunctionItems: activeFunctionItems,
            activeConstantItems: activeConstantItems,
            markDirty: markDirty,
            requestClose: requestClose,
            rememberFormulaCursor: rememberFormulaCursor,
            insertField: insertField,
            insertFunction: insertFunction,
            insertOperator: insertOperator,
            insertConstant: insertConstant,
            sendChat: sendChat,
            handleChatKeydown: handleChatKeydown,
            validate: validate,
            save: save,
            removeField: removeField,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
