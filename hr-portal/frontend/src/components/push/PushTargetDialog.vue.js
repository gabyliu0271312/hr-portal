import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Hide, Refresh, View } from '@element-plus/icons-vue';
import { pushTargetsApi } from '@/api/push_targets';
import { dataApi } from '@/api/data';
import { SCHEDULE_OPTIONS } from '@/config/dataSources';
import { PASSWORD_POLICY_HINT, generateStrongPassword } from '@/utils/passwordPolicy';
import PushFieldMapper from './PushFieldMapper.vue';
import ApiExposeQueryParameters from './ApiExposeQueryParameters.vue';
import ServiceSourcePicker from '@/components/warehouse/ServiceSourcePicker.vue';
import PermissionButton from '@/components/PermissionButton.vue';
const props = withDefaults(defineProps(), {
    permissionMenu: 'warehouse.service',
});
const isMultiSource = !props.sourceTable;
const emit = defineEmits();
const visible = ref(false);
const saving = ref(false);
const currentTarget = ref(null);
const sourceColumns = ref([]);
const revealedSecrets = ref({});
const revealing = ref(false);
const fieldMapper = ref(null);
async function revealSecret(key) {
    if (!currentTarget.value)
        return;
    if (revealedSecrets.value[key] !== undefined) {
        // 再次点击隐藏
        delete revealedSecrets.value[key];
        return;
    }
    revealing.value = true;
    try {
        const secrets = await pushTargetsApi.reveal(currentTarget.value.id);
        revealedSecrets.value[key] = secrets[key] ?? '（未设置）';
    }
    catch {
        ElMessage.error('获取失败');
    }
    finally {
        revealing.value = false;
    }
}
const sourceCapabilities = ref({});
const availablePushTypes = computed(() => PUSH_TYPES.filter((type) => sourceCapabilities.value[type.value]?.supported !== false));
async function loadSourceCapabilities() {
    const sourceType = isMultiSource ? sourceRef.value.source_type : props.sourceTable.startsWith('report:') ? 'report' : 'table';
    const sourceId = isMultiSource ? sourceRef.value.source_id : sourceType === 'report' ? props.sourceTable.split(':', 2)[1] : props.sourceTable;
    if (!sourceId) {
        sourceCapabilities.value = {};
        return;
    }
    try {
        sourceCapabilities.value = (await pushTargetsApi.sourceCapabilities(sourceType, sourceId)).capabilities;
    }
    catch {
        sourceCapabilities.value = {};
    }
}
const PUSH_TYPES = [
    { value: 'external_db', label: '写入外部数据库（MySQL/PostgreSQL）' },
    { value: 'http_push', label: 'POST JSON 到接口' },
    { value: 'api_expose', label: '暴露只读 API（对方主动拉取）' },
    { value: 'db_realtime', label: '实时只读数据库访问（对方直连 PostgreSQL）' },
    { value: 'db_snapshot', label: '同步快照数据库访问（支持定时刷新）' },
    { value: 'feishu_sheet', label: '写入飞书在线表格' },
];
const DIALECTS = [
    { value: 'mysql', label: 'MySQL' },
    { value: 'postgresql', label: 'PostgreSQL' },
];
const isExposeType = (t) => t === 'api_expose' || t === 'db_realtime';
const form = reactive({
    name: '', description: '', push_type: 'external_db',
    is_active: true, schedule: '手动触发', field_mappings: [], mapping_component: null, period_ym: '',
    dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
    url: '', method: 'POST', bearer_token: '', batch_size: '500',
    app_id: '', app_secret: '', readonly_password: '', ip_whitelist: '', query_parameters: [],
    feishu_app_id: '', feishu_app_secret: '', feishu_wiki_url_or_token: '',
    feishu_spreadsheet_token: '', feishu_sheet_id: '', feishu_start_cell: 'A1',
    feishu_include_header: true, feishu_batch_size: '1000',
});
async function open(target) {
    await loadSourceCapabilities();
    currentTarget.value = target ?? null;
    revealedSecrets.value = {};
    sourceColumns.value = props.sourceColumns?.length
        ? [...props.sourceColumns]
        : props.sourceTable
            ? await dataApi.columns(props.sourceTable).catch(() => [])
            : [];
    if (target) {
        // 编辑时回填来源资产
        if (isMultiSource) {
            sourceRef.value = normalizeSourceRef(target);
        }
        const s = target.settings || {};
        form.name = target.name;
        form.description = target.description ?? '';
        form.push_type = target.push_type;
        form.is_active = target.is_active;
        form.field_mappings = (target.field_mappings || []).map((m) => ({ ...m }));
        form.mapping_component = target.mapping_component ? JSON.parse(JSON.stringify(target.mapping_component)) : null;
        form.schedule = s.schedule ?? '手动触发';
        form.period_ym = s.period_ym ?? '';
        form.ip_whitelist = (s.ip_whitelist || []).join(', ');
        form.query_parameters = (s.query_parameters || []).map((item) => ({
            column: item.column,
            required: Boolean(item.required),
        }));
        if (target.push_type === 'external_db') {
            form.dialect = s.dialect ?? 'mysql';
            form.host = s.host ?? '';
            form.port = String(s.port ?? 3306);
            form.database = s.database ?? '';
            form.db_user = s.user ?? '';
            form.target_table = s.target_table ?? '';
        }
        else if (target.push_type === 'http_push') {
            form.url = s.url ?? '';
            form.method = s.method ?? 'POST';
            form.batch_size = String(s.batch_size ?? 500);
        }
        else if (target.push_type === 'api_expose') {
            form.app_id = s.app_id ?? '';
        }
        else if (target.push_type === 'db_snapshot' || target.push_type === 'db_realtime') {
            form.feishu_wiki_url_or_token = s.wiki_url_or_token ?? '';
            form.feishu_spreadsheet_token = s.spreadsheet_token ?? '';
            form.feishu_sheet_id = s.sheet_id ?? '';
            form.feishu_start_cell = s.start_cell ?? 'A1';
            form.feishu_include_header = s.include_header ?? true;
            form.feishu_batch_size = String(s.batch_size ?? 1000);
        }
    }
    else {
        if (isMultiSource) {
            sourceRef.value = { source_type: 'table', source_id: '', source_label: '' };
        }
        Object.assign(form, {
            name: '', description: '', push_type: 'external_db', is_active: true,
            schedule: '手动触发', field_mappings: [], mapping_component: null, period_ym: '', ip_whitelist: '', query_parameters: [],
            dialect: 'mysql', host: '', port: '3306', database: '', db_user: '', password: '', target_table: '',
            url: '', method: 'POST', bearer_token: '', batch_size: '500',
            app_id: '', app_secret: '', readonly_password: '',
            feishu_app_id: '', feishu_app_secret: '', feishu_wiki_url_or_token: '',
            feishu_spreadsheet_token: '', feishu_sheet_id: '', feishu_start_cell: 'A1',
            feishu_include_header: true, feishu_batch_size: '1000',
        });
    }
    visible.value = true;
}
function parseIpWhitelist() {
    return form.ip_whitelist.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}
function resetPassword(field) {
    form[field] = generateStrongPassword(20);
    if (field === 'readonly_password')
        delete revealedSecrets.value.readonly_password;
    ElMessage.success('已生成随机强密码');
}
const sourceRef = ref({ source_type: 'table', source_id: props.sourceTable, source_label: '' });
function normalizeSourceRef(target) {
    const sourceTable = target.source_table || '';
    if (sourceTable.startsWith('report:')) {
        return {
            source_type: 'report',
            source_id: sourceTable.split(':', 2)[1] || target.source_id || '',
            source_label: target.source_label || '',
        };
    }
    return {
        source_type: target.source_type || 'table',
        source_id: target.source_id || sourceTable || '',
        source_label: target.source_label || '',
    };
}
function legacySourceTable(ref) {
    if (ref.source_type === 'report')
        return `report:${ref.source_id}`;
    return ref.source_id;
}
function buildPayload() {
    const st = isMultiSource ? legacySourceTable(sourceRef.value) : props.sourceTable;
    const mapping = fieldMapper.value?.serialize();
    if (mapping && !mapping.ok)
        throw new Error(mapping.reason);
    const base = {
        source_table: st,
        source_type: isMultiSource ? sourceRef.value.source_type : 'table',
        source_id: isMultiSource ? sourceRef.value.source_id : st,
        source_label: isMultiSource ? sourceRef.value.source_label : '',
        name: form.name.trim(),
        description: form.description.trim() || null,
        push_type: form.push_type,
        settings: {},
        secrets: {},
        field_mappings: isExposeType(form.push_type)
            ? []
            : mapping?.ok && mapping.storageMode === 'legacy_v1'
                ? mapping.mappings
                : form.field_mappings.filter((m) => m.source && m.target),
        mapping_storage_mode: mapping?.ok ? mapping.storageMode : 'legacy_v1',
        mapping_component: mapping?.ok && mapping.storageMode === 'component_v1'
            ? mapping.document
            : null,
        is_active: form.is_active,
        schedule: isExposeType(form.push_type) ? '手动触发' : form.schedule,
    };
    if (form.push_type === 'external_db') {
        base.settings = {
            period_ym: form.period_ym,
            dialect: form.dialect, host: form.host, port: Number(form.port),
            database: form.database, user: form.db_user, target_table: form.target_table,
        };
        if (form.password)
            base.secrets = { password: form.password };
    }
    else if (form.push_type === 'http_push') {
        base.settings = { period_ym: form.period_ym, url: form.url, method: form.method, batch_size: Number(form.batch_size) };
        if (form.bearer_token)
            base.secrets = { bearer_token: form.bearer_token };
    }
    else if (form.push_type === 'api_expose') {
        base.settings = {
            app_id: form.app_id,
            ip_whitelist: parseIpWhitelist(),
            query_parameters: form.query_parameters.filter((item) => item.column),
        };
        if (form.app_secret)
            base.secrets = { app_secret: form.app_secret };
    }
    else if (form.push_type === 'db_realtime' || form.push_type === 'db_snapshot') {
        base.settings = { period_ym: form.period_ym, ip_whitelist: parseIpWhitelist() };
        if (form.readonly_password)
            base.secrets = { readonly_password: form.readonly_password };
    }
    else if (form.push_type === 'feishu_sheet') {
        base.settings = {
            period_ym: form.period_ym,
            wiki_url_or_token: form.feishu_wiki_url_or_token,
            spreadsheet_token: form.feishu_spreadsheet_token,
            sheet_id: form.feishu_sheet_id,
            start_cell: form.feishu_start_cell || 'A1',
            include_header: form.feishu_include_header,
            batch_size: Number(form.feishu_batch_size || 1000),
        };
        if (form.feishu_app_id || form.feishu_app_secret) {
            base.secrets = { app_id: form.feishu_app_id, app_secret: form.feishu_app_secret };
        }
    }
    return base;
}
async function confirm() {
    if (!form.name.trim()) {
        ElMessage.warning('请填写推送目标名称');
        return;
    }
    saving.value = true;
    try {
        const payload = buildPayload();
        const result = currentTarget.value
            ? await pushTargetsApi.update(currentTarget.value.id, payload)
            : await pushTargetsApi.create(payload);
        ElMessage.success(currentTarget.value ? '已更新' : '已创建');
        visible.value = false;
        emit('done', result);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || e?.message || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function downloadDocumentation() {
    if (!currentTarget.value)
        return;
    try {
        const blob = await pushTargetsApi.integrationDocumentation(currentTarget.value.id);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `push-target-${currentTarget.value.id}-integration.txt`;
        link.click();
        URL.revokeObjectURL(url);
    }
    catch {
        ElMessage.error('下载对接文档失败');
    }
}
function copyUrl(id) {
    const url = `${window.location.origin}/api/v1/push-targets/${id}/data`;
    navigator.clipboard.writeText(url).then(() => ElMessage.success('已复制')).catch(() => ElMessage.error('复制失败'));
}
const apiBaseUrl = window.location.origin;
watch(sourceRef, loadSourceCapabilities, { deep: true });
const __VLS_exposed = { open };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    permissionMenu: 'warehouse.service',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.currentTarget ? '编辑推送目标' : '新建推送目标'),
    width: "680px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.currentTarget ? '编辑推送目标' : '新建推送目标'),
    width: "680px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
const __VLS_5 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}));
const __VLS_7 = __VLS_6({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_6));
__VLS_8.slots.default;
if (__VLS_ctx.isMultiSource) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
}
if (__VLS_ctx.isMultiSource) {
    const __VLS_9 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        label: "选择来源",
        required: true,
    }));
    const __VLS_11 = __VLS_10({
        label: "选择来源",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_12.slots.default;
    /** @type {[typeof ServiceSourcePicker, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(ServiceSourcePicker, new ServiceSourcePicker({
        modelValue: (__VLS_ctx.sourceRef),
        allowedTypes: (['table', 'report']),
    }));
    const __VLS_14 = __VLS_13({
        modelValue: (__VLS_ctx.sourceRef),
        allowedTypes: (['table', 'report']),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_12;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "名称",
    required: true,
}));
const __VLS_18 = __VLS_17({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如 推送到IT系统",
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如 推送到IT系统",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_19;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "状态",
}));
const __VLS_26 = __VLS_25({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
const __VLS_32 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "推送方式",
    required: true,
}));
const __VLS_34 = __VLS_33({
    label: "推送方式",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    modelValue: (__VLS_ctx.form.push_type),
    ...{ style: {} },
}));
const __VLS_38 = __VLS_37({
    modelValue: (__VLS_ctx.form.push_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.availablePushTypes))) {
    const __VLS_40 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }));
    const __VLS_42 = __VLS_41({
        key: (t.value),
        label: (t.label),
        value: (t.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
var __VLS_39;
var __VLS_35;
if (!__VLS_ctx.isExposeType(__VLS_ctx.form.push_type)) {
    const __VLS_44 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        label: "调度计划",
    }));
    const __VLS_46 = __VLS_45({
        label: "调度计划",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    const __VLS_48 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        modelValue: (__VLS_ctx.form.schedule),
        ...{ style: {} },
    }));
    const __VLS_50 = __VLS_49({
        modelValue: (__VLS_ctx.form.schedule),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    for (const [s] of __VLS_getVForSourceType((__VLS_ctx.SCHEDULE_OPTIONS))) {
        const __VLS_52 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            key: (s.value),
            label: (s.label),
            value: (s.value),
        }));
        const __VLS_54 = __VLS_53({
            key: (s.value),
            label: (s.label),
            value: (s.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    }
    var __VLS_51;
    var __VLS_47;
    const __VLS_56 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        label: "月份（月度表专用，YYYYMM，空则推全量）",
    }));
    const __VLS_58 = __VLS_57({
        label: "月份（月度表专用，YYYYMM，空则推全量）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        modelValue: (__VLS_ctx.form.period_ym),
        placeholder: "如 202504",
        ...{ style: {} },
    }));
    const __VLS_62 = __VLS_61({
        modelValue: (__VLS_ctx.form.period_ym),
        placeholder: "如 202504",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
}
if (__VLS_ctx.form.push_type === 'external_db') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_64 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        label: "数据库类型",
    }));
    const __VLS_66 = __VLS_65({
        label: "数据库类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    const __VLS_68 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        modelValue: (__VLS_ctx.form.dialect),
        ...{ style: {} },
    }));
    const __VLS_70 = __VLS_69({
        modelValue: (__VLS_ctx.form.dialect),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    __VLS_71.slots.default;
    for (const [d] of __VLS_getVForSourceType((__VLS_ctx.DIALECTS))) {
        const __VLS_72 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            key: (d.value),
            label: (d.label),
            value: (d.value),
        }));
        const __VLS_74 = __VLS_73({
            key: (d.value),
            label: (d.label),
            value: (d.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    }
    var __VLS_71;
    var __VLS_67;
    const __VLS_76 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        label: "目标表名",
        required: true,
    }));
    const __VLS_78 = __VLS_77({
        label: "目标表名",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    const __VLS_80 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        modelValue: (__VLS_ctx.form.target_table),
        placeholder: "如 beisen_salary_report",
    }));
    const __VLS_82 = __VLS_81({
        modelValue: (__VLS_ctx.form.target_table),
        placeholder: "如 beisen_salary_report",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    var __VLS_79;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_84 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        label: "Host",
        required: true,
    }));
    const __VLS_86 = __VLS_85({
        label: "Host",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    __VLS_87.slots.default;
    const __VLS_88 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        modelValue: (__VLS_ctx.form.host),
        placeholder: "192.168.1.100",
    }));
    const __VLS_90 = __VLS_89({
        modelValue: (__VLS_ctx.form.host),
        placeholder: "192.168.1.100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    var __VLS_87;
    const __VLS_92 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        label: "Port",
    }));
    const __VLS_94 = __VLS_93({
        label: "Port",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    __VLS_95.slots.default;
    const __VLS_96 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        modelValue: (__VLS_ctx.form.port),
        placeholder: "3306",
    }));
    const __VLS_98 = __VLS_97({
        modelValue: (__VLS_ctx.form.port),
        placeholder: "3306",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    var __VLS_95;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_100 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        label: "数据库名",
        required: true,
    }));
    const __VLS_102 = __VLS_101({
        label: "数据库名",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    const __VLS_104 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
        modelValue: (__VLS_ctx.form.database),
    }));
    const __VLS_106 = __VLS_105({
        modelValue: (__VLS_ctx.form.database),
    }, ...__VLS_functionalComponentArgsRest(__VLS_105));
    var __VLS_103;
    const __VLS_108 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        label: "用户名",
        required: true,
    }));
    const __VLS_110 = __VLS_109({
        label: "用户名",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    const __VLS_112 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        modelValue: (__VLS_ctx.form.db_user),
    }));
    const __VLS_114 = __VLS_113({
        modelValue: (__VLS_ctx.form.db_user),
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    var __VLS_111;
    const __VLS_116 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        label: "密码",
    }));
    const __VLS_118 = __VLS_117({
        label: "密码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "password-row" },
    });
    const __VLS_120 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        modelValue: (__VLS_ctx.form.password),
        type: "password",
        placeholder: "不修改留空",
        showPassword: true,
    }));
    const __VLS_122 = __VLS_121({
        modelValue: (__VLS_ctx.form.password),
        type: "password",
        placeholder: "不修改留空",
        showPassword: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
        plain: true,
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.form.push_type === 'external_db'))
                return;
            __VLS_ctx.resetPassword('password');
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "password-hint" },
    });
    (__VLS_ctx.PASSWORD_POLICY_HINT);
    var __VLS_119;
}
else if (__VLS_ctx.form.push_type === 'http_push') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_132 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        label: "接口 URL",
        required: true,
    }));
    const __VLS_134 = __VLS_133({
        label: "接口 URL",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    const __VLS_136 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        modelValue: (__VLS_ctx.form.url),
        placeholder: "https://...",
    }));
    const __VLS_138 = __VLS_137({
        modelValue: (__VLS_ctx.form.url),
        placeholder: "https://...",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    var __VLS_135;
    const __VLS_140 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        label: "方法",
    }));
    const __VLS_142 = __VLS_141({
        label: "方法",
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    __VLS_143.slots.default;
    const __VLS_144 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        modelValue: (__VLS_ctx.form.method),
        ...{ style: {} },
    }));
    const __VLS_146 = __VLS_145({
        modelValue: (__VLS_ctx.form.method),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    const __VLS_148 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        value: "POST",
        label: "POST",
    }));
    const __VLS_150 = __VLS_149({
        value: "POST",
        label: "POST",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    const __VLS_152 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        value: "PUT",
        label: "PUT",
    }));
    const __VLS_154 = __VLS_153({
        value: "PUT",
        label: "PUT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    var __VLS_147;
    var __VLS_143;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_156 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        label: "Bearer Token（可选）",
    }));
    const __VLS_158 = __VLS_157({
        label: "Bearer Token（可选）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    const __VLS_160 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        modelValue: (__VLS_ctx.form.bearer_token),
        type: "password",
        showPassword: true,
    }));
    const __VLS_162 = __VLS_161({
        modelValue: (__VLS_ctx.form.bearer_token),
        type: "password",
        showPassword: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    var __VLS_159;
    const __VLS_164 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "批次大小",
    }));
    const __VLS_166 = __VLS_165({
        label: "批次大小",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    const __VLS_168 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        modelValue: (__VLS_ctx.form.batch_size),
        placeholder: "500",
    }));
    const __VLS_170 = __VLS_169({
        modelValue: (__VLS_ctx.form.batch_size),
        placeholder: "500",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    var __VLS_167;
}
else if (__VLS_ctx.form.push_type === 'api_expose') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    if (__VLS_ctx.currentTarget) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_172 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            label: "AppID",
        }));
        const __VLS_174 = __VLS_173({
            label: "AppID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        __VLS_175.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_176 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
            modelValue: (__VLS_ctx.revealedSecrets['app_id'] !== undefined ? __VLS_ctx.revealedSecrets['app_id'] : '******'),
            readonly: true,
            ...{ style: {} },
        }));
        const __VLS_178 = __VLS_177({
            modelValue: (__VLS_ctx.revealedSecrets['app_id'] !== undefined ? __VLS_ctx.revealedSecrets['app_id'] : '******'),
            readonly: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
        const __VLS_180 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
            ...{ 'onClick': {} },
            link: true,
            loading: (__VLS_ctx.revealing),
        }));
        const __VLS_182 = __VLS_181({
            ...{ 'onClick': {} },
            link: true,
            loading: (__VLS_ctx.revealing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        let __VLS_184;
        let __VLS_185;
        let __VLS_186;
        const __VLS_187 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.form.push_type === 'external_db'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'http_push'))
                    return;
                if (!(__VLS_ctx.form.push_type === 'api_expose'))
                    return;
                if (!(__VLS_ctx.currentTarget))
                    return;
                __VLS_ctx.revealSecret('app_id');
            }
        };
        __VLS_183.slots.default;
        const __VLS_188 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({}));
        const __VLS_190 = __VLS_189({}, ...__VLS_functionalComponentArgsRest(__VLS_189));
        __VLS_191.slots.default;
        (__VLS_ctx.revealedSecrets['app_id'] !== undefined ? '🙈' : '👁');
        var __VLS_191;
        var __VLS_183;
        var __VLS_175;
        const __VLS_192 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            label: "AppSecret",
        }));
        const __VLS_194 = __VLS_193({
            label: "AppSecret",
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_196 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            modelValue: (__VLS_ctx.revealedSecrets['app_secret'] !== undefined ? __VLS_ctx.revealedSecrets['app_secret'] : '******'),
            readonly: true,
            ...{ style: {} },
        }));
        const __VLS_198 = __VLS_197({
            modelValue: (__VLS_ctx.revealedSecrets['app_secret'] !== undefined ? __VLS_ctx.revealedSecrets['app_secret'] : '******'),
            readonly: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        const __VLS_200 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
            ...{ 'onClick': {} },
            link: true,
            loading: (__VLS_ctx.revealing),
        }));
        const __VLS_202 = __VLS_201({
            ...{ 'onClick': {} },
            link: true,
            loading: (__VLS_ctx.revealing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        let __VLS_204;
        let __VLS_205;
        let __VLS_206;
        const __VLS_207 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.form.push_type === 'external_db'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'http_push'))
                    return;
                if (!(__VLS_ctx.form.push_type === 'api_expose'))
                    return;
                if (!(__VLS_ctx.currentTarget))
                    return;
                __VLS_ctx.revealSecret('app_secret');
            }
        };
        __VLS_203.slots.default;
        const __VLS_208 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({}));
        const __VLS_210 = __VLS_209({}, ...__VLS_functionalComponentArgsRest(__VLS_209));
        __VLS_211.slots.default;
        (__VLS_ctx.revealedSecrets['app_secret'] !== undefined ? '🙈' : '👁');
        var __VLS_211;
        var __VLS_203;
        var __VLS_195;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
    else {
        const __VLS_212 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            type: "info",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_214 = __VLS_213({
            type: "info",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        var __VLS_215;
    }
    const __VLS_216 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        label: "IP 白名单（必填：仅允许这些来源 IP）",
    }));
    const __VLS_218 = __VLS_217({
        label: "IP 白名单（必填：仅允许这些来源 IP）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    __VLS_219.slots.default;
    const __VLS_220 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        modelValue: (__VLS_ctx.form.ip_whitelist),
        type: "textarea",
        rows: (3),
        placeholder: "192.168.1.100, 10.0.0.1",
    }));
    const __VLS_222 = __VLS_221({
        modelValue: (__VLS_ctx.form.ip_whitelist),
        type: "textarea",
        rows: (3),
        placeholder: "192.168.1.100, 10.0.0.1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    var __VLS_219;
    if (__VLS_ctx.isMultiSource ? Boolean(__VLS_ctx.sourceRef.source_id) : Boolean(props.sourceTable)) {
        /** @type {[typeof ApiExposeQueryParameters, ]} */ ;
        // @ts-ignore
        const __VLS_224 = __VLS_asFunctionalComponent(ApiExposeQueryParameters, new ApiExposeQueryParameters({
            modelValue: (__VLS_ctx.form.query_parameters),
            sourceTable: (__VLS_ctx.isMultiSource ? __VLS_ctx.legacySourceTable(__VLS_ctx.sourceRef) : props.sourceTable),
        }));
        const __VLS_225 = __VLS_224({
            modelValue: (__VLS_ctx.form.query_parameters),
            sourceTable: (__VLS_ctx.isMultiSource ? __VLS_ctx.legacySourceTable(__VLS_ctx.sourceRef) : props.sourceTable),
        }, ...__VLS_functionalComponentArgsRest(__VLS_224));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
        ...{ style: {} },
    });
    if (__VLS_ctx.currentTarget) {
        const __VLS_227 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
            label: "拉取 URL",
        }));
        const __VLS_229 = __VLS_228({
            label: "拉取 URL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_228));
        __VLS_230.slots.default;
        const __VLS_231 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
            modelValue: (`${__VLS_ctx.apiBaseUrl}/api/v1/push-targets/${__VLS_ctx.currentTarget.id}/data`),
            readonly: true,
        }));
        const __VLS_233 = __VLS_232({
            modelValue: (`${__VLS_ctx.apiBaseUrl}/api/v1/push-targets/${__VLS_ctx.currentTarget.id}/data`),
            readonly: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_232));
        __VLS_234.slots.default;
        {
            const { append: __VLS_thisSlot } = __VLS_234.slots;
            const __VLS_235 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
                ...{ 'onClick': {} },
            }));
            const __VLS_237 = __VLS_236({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_236));
            let __VLS_239;
            let __VLS_240;
            let __VLS_241;
            const __VLS_242 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.form.push_type === 'external_db'))
                        return;
                    if (!!(__VLS_ctx.form.push_type === 'http_push'))
                        return;
                    if (!(__VLS_ctx.form.push_type === 'api_expose'))
                        return;
                    if (!(__VLS_ctx.currentTarget))
                        return;
                    __VLS_ctx.copyUrl(__VLS_ctx.currentTarget.id);
                }
            };
            __VLS_238.slots.default;
            var __VLS_238;
        }
        var __VLS_234;
        var __VLS_230;
    }
}
else if (__VLS_ctx.form.push_type === 'feishu_sheet') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    const __VLS_243 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_245 = __VLS_244({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_244));
    __VLS_246.slots.default;
    var __VLS_246;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_247 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
        label: "App ID",
        required: true,
    }));
    const __VLS_249 = __VLS_248({
        label: "App ID",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_248));
    __VLS_250.slots.default;
    const __VLS_251 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
        modelValue: (__VLS_ctx.form.feishu_app_id),
        placeholder: "飞书开放平台应用 App ID",
    }));
    const __VLS_253 = __VLS_252({
        modelValue: (__VLS_ctx.form.feishu_app_id),
        placeholder: "飞书开放平台应用 App ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_252));
    var __VLS_250;
    const __VLS_255 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
        label: "App Secret",
        required: true,
    }));
    const __VLS_257 = __VLS_256({
        label: "App Secret",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_256));
    __VLS_258.slots.default;
    const __VLS_259 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
        modelValue: (__VLS_ctx.form.feishu_app_secret),
        type: "password",
        showPassword: true,
        placeholder: "不修改可留空",
    }));
    const __VLS_261 = __VLS_260({
        modelValue: (__VLS_ctx.form.feishu_app_secret),
        type: "password",
        showPassword: true,
        placeholder: "不修改可留空",
    }, ...__VLS_functionalComponentArgsRest(__VLS_260));
    var __VLS_258;
    const __VLS_263 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
        label: "Wiki 链接或节点 Token",
    }));
    const __VLS_265 = __VLS_264({
        label: "Wiki 链接或节点 Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_264));
    __VLS_266.slots.default;
    const __VLS_267 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
        modelValue: (__VLS_ctx.form.feishu_wiki_url_or_token),
        placeholder: "https://xxx.feishu.cn/wiki/xxxx 或 wiki node token",
    }));
    const __VLS_269 = __VLS_268({
        modelValue: (__VLS_ctx.form.feishu_wiki_url_or_token),
        placeholder: "https://xxx.feishu.cn/wiki/xxxx 或 wiki node token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_268));
    var __VLS_266;
    const __VLS_271 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
        label: "Spreadsheet Token",
    }));
    const __VLS_273 = __VLS_272({
        label: "Spreadsheet Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    __VLS_274.slots.default;
    const __VLS_275 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
        modelValue: (__VLS_ctx.form.feishu_spreadsheet_token),
        placeholder: "与 Wiki 链接二选一；两者都填时优先使用 Spreadsheet Token",
    }));
    const __VLS_277 = __VLS_276({
        modelValue: (__VLS_ctx.form.feishu_spreadsheet_token),
        placeholder: "与 Wiki 链接二选一；两者都填时优先使用 Spreadsheet Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_276));
    var __VLS_274;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_279 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
        label: "Sheet ID",
    }));
    const __VLS_281 = __VLS_280({
        label: "Sheet ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_280));
    __VLS_282.slots.default;
    const __VLS_283 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
        modelValue: (__VLS_ctx.form.feishu_sheet_id),
        placeholder: "可留空，默认第一个工作表",
    }));
    const __VLS_285 = __VLS_284({
        modelValue: (__VLS_ctx.form.feishu_sheet_id),
        placeholder: "可留空，默认第一个工作表",
    }, ...__VLS_functionalComponentArgsRest(__VLS_284));
    var __VLS_282;
    const __VLS_287 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
        label: "起始单元格",
    }));
    const __VLS_289 = __VLS_288({
        label: "起始单元格",
    }, ...__VLS_functionalComponentArgsRest(__VLS_288));
    __VLS_290.slots.default;
    const __VLS_291 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
        modelValue: (__VLS_ctx.form.feishu_start_cell),
        placeholder: "A1",
    }));
    const __VLS_293 = __VLS_292({
        modelValue: (__VLS_ctx.form.feishu_start_cell),
        placeholder: "A1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_292));
    var __VLS_290;
    const __VLS_295 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
        label: "批次行数",
    }));
    const __VLS_297 = __VLS_296({
        label: "批次行数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_296));
    __VLS_298.slots.default;
    const __VLS_299 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
        modelValue: (__VLS_ctx.form.feishu_batch_size),
        placeholder: "1000",
    }));
    const __VLS_301 = __VLS_300({
        modelValue: (__VLS_ctx.form.feishu_batch_size),
        placeholder: "1000",
    }, ...__VLS_functionalComponentArgsRest(__VLS_300));
    var __VLS_298;
    const __VLS_303 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
        label: "写入表头",
    }));
    const __VLS_305 = __VLS_304({
        label: "写入表头",
    }, ...__VLS_functionalComponentArgsRest(__VLS_304));
    __VLS_306.slots.default;
    const __VLS_307 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
        modelValue: (__VLS_ctx.form.feishu_include_header),
        activeText: "是",
        inactiveText: "否",
    }));
    const __VLS_309 = __VLS_308({
        modelValue: (__VLS_ctx.form.feishu_include_header),
        activeText: "是",
        inactiveText: "否",
    }, ...__VLS_functionalComponentArgsRest(__VLS_308));
    var __VLS_306;
}
else if (__VLS_ctx.form.push_type === 'db_realtime' || __VLS_ctx.form.push_type === 'db_snapshot') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    const __VLS_311 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_312 = __VLS_asFunctionalComponent(__VLS_311, new __VLS_311({
        label: "IP 白名单（逗号或换行分隔，空则不限制）",
    }));
    const __VLS_313 = __VLS_312({
        label: "IP 白名单（逗号或换行分隔，空则不限制）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_312));
    __VLS_314.slots.default;
    const __VLS_315 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_316 = __VLS_asFunctionalComponent(__VLS_315, new __VLS_315({
        modelValue: (__VLS_ctx.form.ip_whitelist),
        type: "textarea",
        rows: (3),
        placeholder: "192.168.1.100, 10.0.0.1",
    }));
    const __VLS_317 = __VLS_316({
        modelValue: (__VLS_ctx.form.ip_whitelist),
        type: "textarea",
        rows: (3),
        placeholder: "192.168.1.100, 10.0.0.1",
    }, ...__VLS_functionalComponentArgsRest(__VLS_316));
    var __VLS_314;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    if (__VLS_ctx.currentTarget?.settings?.conn_url) {
        const __VLS_319 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_320 = __VLS_asFunctionalComponent(__VLS_319, new __VLS_319({
            column: (1),
            size: "small",
            border: true,
        }));
        const __VLS_321 = __VLS_320({
            column: (1),
            size: "small",
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_320));
        __VLS_322.slots.default;
        const __VLS_323 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
            label: "数据库名",
        }));
        const __VLS_325 = __VLS_324({
            label: "数据库名",
        }, ...__VLS_functionalComponentArgsRest(__VLS_324));
        __VLS_326.slots.default;
        (__VLS_ctx.currentTarget.settings.database);
        var __VLS_326;
        const __VLS_327 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_328 = __VLS_asFunctionalComponent(__VLS_327, new __VLS_327({
            label: "主机",
        }));
        const __VLS_329 = __VLS_328({
            label: "主机",
        }, ...__VLS_functionalComponentArgsRest(__VLS_328));
        __VLS_330.slots.default;
        (__VLS_ctx.currentTarget.settings.host);
        var __VLS_330;
        const __VLS_331 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({
            label: "端口",
        }));
        const __VLS_333 = __VLS_332({
            label: "端口",
        }, ...__VLS_functionalComponentArgsRest(__VLS_332));
        __VLS_334.slots.default;
        (__VLS_ctx.currentTarget.settings.port);
        var __VLS_334;
        const __VLS_335 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_336 = __VLS_asFunctionalComponent(__VLS_335, new __VLS_335({
            label: "用户名",
        }));
        const __VLS_337 = __VLS_336({
            label: "用户名",
        }, ...__VLS_functionalComponentArgsRest(__VLS_336));
        __VLS_338.slots.default;
        (__VLS_ctx.currentTarget.settings.readonly_user);
        var __VLS_338;
        const __VLS_339 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
            label: "密码",
        }));
        const __VLS_341 = __VLS_340({
            label: "密码",
        }, ...__VLS_functionalComponentArgsRest(__VLS_340));
        __VLS_342.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "secret-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "secret-value" },
        });
        (__VLS_ctx.form.readonly_password || (__VLS_ctx.revealedSecrets['readonly_password'] !== undefined ? __VLS_ctx.revealedSecrets['readonly_password'] : '••••••••••••'));
        const __VLS_343 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_344 = __VLS_asFunctionalComponent(__VLS_343, new __VLS_343({
            ...{ 'onClick': {} },
            link: true,
            size: "small",
            loading: (__VLS_ctx.revealing),
            title: (__VLS_ctx.revealedSecrets['readonly_password'] !== undefined ? '隐藏密码' : '显示密码'),
        }));
        const __VLS_345 = __VLS_344({
            ...{ 'onClick': {} },
            link: true,
            size: "small",
            loading: (__VLS_ctx.revealing),
            title: (__VLS_ctx.revealedSecrets['readonly_password'] !== undefined ? '隐藏密码' : '显示密码'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_344));
        let __VLS_347;
        let __VLS_348;
        let __VLS_349;
        const __VLS_350 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.form.push_type === 'external_db'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'http_push'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'api_expose'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'feishu_sheet'))
                    return;
                if (!(__VLS_ctx.form.push_type === 'db_realtime' || __VLS_ctx.form.push_type === 'db_snapshot'))
                    return;
                if (!(__VLS_ctx.currentTarget?.settings?.conn_url))
                    return;
                __VLS_ctx.revealSecret('readonly_password');
            }
        };
        __VLS_346.slots.default;
        const __VLS_351 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_352 = __VLS_asFunctionalComponent(__VLS_351, new __VLS_351({}));
        const __VLS_353 = __VLS_352({}, ...__VLS_functionalComponentArgsRest(__VLS_352));
        __VLS_354.slots.default;
        if (__VLS_ctx.revealedSecrets['readonly_password'] !== undefined) {
            const __VLS_355 = {}.Hide;
            /** @type {[typeof __VLS_components.Hide, ]} */ ;
            // @ts-ignore
            const __VLS_356 = __VLS_asFunctionalComponent(__VLS_355, new __VLS_355({}));
            const __VLS_357 = __VLS_356({}, ...__VLS_functionalComponentArgsRest(__VLS_356));
        }
        else {
            const __VLS_359 = {}.View;
            /** @type {[typeof __VLS_components.View, ]} */ ;
            // @ts-ignore
            const __VLS_360 = __VLS_asFunctionalComponent(__VLS_359, new __VLS_359({}));
            const __VLS_361 = __VLS_360({}, ...__VLS_functionalComponentArgsRest(__VLS_360));
        }
        var __VLS_354;
        var __VLS_346;
        const __VLS_363 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_364 = __VLS_asFunctionalComponent(__VLS_363, new __VLS_363({
            ...{ 'onClick': {} },
            size: "small",
            plain: true,
        }));
        const __VLS_365 = __VLS_364({
            ...{ 'onClick': {} },
            size: "small",
            plain: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_364));
        let __VLS_367;
        let __VLS_368;
        let __VLS_369;
        const __VLS_370 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.form.push_type === 'external_db'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'http_push'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'api_expose'))
                    return;
                if (!!(__VLS_ctx.form.push_type === 'feishu_sheet'))
                    return;
                if (!(__VLS_ctx.form.push_type === 'db_realtime' || __VLS_ctx.form.push_type === 'db_snapshot'))
                    return;
                if (!(__VLS_ctx.currentTarget?.settings?.conn_url))
                    return;
                __VLS_ctx.resetPassword('readonly_password');
            }
        };
        __VLS_366.slots.default;
        const __VLS_371 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_372 = __VLS_asFunctionalComponent(__VLS_371, new __VLS_371({}));
        const __VLS_373 = __VLS_372({}, ...__VLS_functionalComponentArgsRest(__VLS_372));
        __VLS_374.slots.default;
        const __VLS_375 = {}.Refresh;
        /** @type {[typeof __VLS_components.Refresh, ]} */ ;
        // @ts-ignore
        const __VLS_376 = __VLS_asFunctionalComponent(__VLS_375, new __VLS_375({}));
        const __VLS_377 = __VLS_376({}, ...__VLS_functionalComponentArgsRest(__VLS_376));
        var __VLS_374;
        var __VLS_366;
        var __VLS_342;
        const __VLS_379 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({
            label: "Schema",
        }));
        const __VLS_381 = __VLS_380({
            label: "Schema",
        }, ...__VLS_functionalComponentArgsRest(__VLS_380));
        __VLS_382.slots.default;
        const __VLS_383 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_384 = __VLS_asFunctionalComponent(__VLS_383, new __VLS_383({
            copyable: true,
        }));
        const __VLS_385 = __VLS_384({
            copyable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_384));
        __VLS_386.slots.default;
        (__VLS_ctx.currentTarget.settings.schema);
        var __VLS_386;
        var __VLS_382;
        const __VLS_387 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_388 = __VLS_asFunctionalComponent(__VLS_387, new __VLS_387({
            label: "表名",
        }));
        const __VLS_389 = __VLS_388({
            label: "表名",
        }, ...__VLS_functionalComponentArgsRest(__VLS_388));
        __VLS_390.slots.default;
        const __VLS_391 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_392 = __VLS_asFunctionalComponent(__VLS_391, new __VLS_391({
            copyable: true,
        }));
        const __VLS_393 = __VLS_392({
            copyable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_392));
        __VLS_394.slots.default;
        (__VLS_ctx.currentTarget.settings.view || __VLS_ctx.currentTarget.settings.table);
        var __VLS_394;
        var __VLS_390;
        const __VLS_395 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_396 = __VLS_asFunctionalComponent(__VLS_395, new __VLS_395({
            label: "JDBC URL",
        }));
        const __VLS_397 = __VLS_396({
            label: "JDBC URL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_396));
        __VLS_398.slots.default;
        const __VLS_399 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_400 = __VLS_asFunctionalComponent(__VLS_399, new __VLS_399({
            copyable: true,
        }));
        const __VLS_401 = __VLS_400({
            copyable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_400));
        __VLS_402.slots.default;
        (__VLS_ctx.currentTarget.settings.jdbc_url || __VLS_ctx.currentTarget.settings.conn_url);
        var __VLS_402;
        var __VLS_398;
        const __VLS_403 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_404 = __VLS_asFunctionalComponent(__VLS_403, new __VLS_403({
            label: "连接 URL",
        }));
        const __VLS_405 = __VLS_404({
            label: "连接 URL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_404));
        __VLS_406.slots.default;
        const __VLS_407 = {}.ElText;
        /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
        // @ts-ignore
        const __VLS_408 = __VLS_asFunctionalComponent(__VLS_407, new __VLS_407({
            copyable: true,
        }));
        const __VLS_409 = __VLS_408({
            copyable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_408));
        __VLS_410.slots.default;
        (__VLS_ctx.currentTarget.settings.conn_url);
        var __VLS_410;
        var __VLS_406;
        var __VLS_322;
    }
    else {
        const __VLS_411 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_412 = __VLS_asFunctionalComponent(__VLS_411, new __VLS_411({
            type: "info",
            closable: (false),
            showIcon: true,
        }));
        const __VLS_413 = __VLS_412({
            type: "info",
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_412));
        __VLS_414.slots.default;
        var __VLS_414;
    }
}
if (!__VLS_ctx.isExposeType(__VLS_ctx.form.push_type)) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    /** @type {[typeof PushFieldMapper, ]} */ ;
    // @ts-ignore
    const __VLS_415 = __VLS_asFunctionalComponent(PushFieldMapper, new PushFieldMapper({
        ...{ 'onUpdate:mappings': {} },
        ref: "fieldMapper",
        mappings: (__VLS_ctx.form.field_mappings),
        mappingComponent: (__VLS_ctx.form.mapping_component),
        sourceColumns: (__VLS_ctx.sourceColumns),
        sourceAsset: (__VLS_ctx.isMultiSource ? __VLS_ctx.sourceRef.source_id : props.sourceTable),
    }));
    const __VLS_416 = __VLS_415({
        ...{ 'onUpdate:mappings': {} },
        ref: "fieldMapper",
        mappings: (__VLS_ctx.form.field_mappings),
        mappingComponent: (__VLS_ctx.form.mapping_component),
        sourceColumns: (__VLS_ctx.sourceColumns),
        sourceAsset: (__VLS_ctx.isMultiSource ? __VLS_ctx.sourceRef.source_id : props.sourceTable),
    }, ...__VLS_functionalComponentArgsRest(__VLS_415));
    let __VLS_418;
    let __VLS_419;
    let __VLS_420;
    const __VLS_421 = {
        'onUpdate:mappings': (...[$event]) => {
            if (!(!__VLS_ctx.isExposeType(__VLS_ctx.form.push_type)))
                return;
            __VLS_ctx.form.field_mappings = $event;
        }
    };
    /** @type {typeof __VLS_ctx.fieldMapper} */ ;
    var __VLS_422 = {};
    var __VLS_417;
}
var __VLS_8;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    if (__VLS_ctx.currentTarget) {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_424 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: (props.permissionMenu),
            op: "E",
        }));
        const __VLS_425 = __VLS_424({
            ...{ 'onClick': {} },
            menu: (props.permissionMenu),
            op: "E",
        }, ...__VLS_functionalComponentArgsRest(__VLS_424));
        let __VLS_427;
        let __VLS_428;
        let __VLS_429;
        const __VLS_430 = {
            onClick: (__VLS_ctx.downloadDocumentation)
        };
        __VLS_426.slots.default;
        var __VLS_426;
    }
    const __VLS_431 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_432 = __VLS_asFunctionalComponent(__VLS_431, new __VLS_431({
        ...{ 'onClick': {} },
    }));
    const __VLS_433 = __VLS_432({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_432));
    let __VLS_435;
    let __VLS_436;
    let __VLS_437;
    const __VLS_438 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_434.slots.default;
    var __VLS_434;
    const __VLS_439 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_440 = __VLS_asFunctionalComponent(__VLS_439, new __VLS_439({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_441 = __VLS_440({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_440));
    let __VLS_443;
    let __VLS_444;
    let __VLS_445;
    const __VLS_446 = {
        onClick: (__VLS_ctx.confirm)
    };
    __VLS_442.slots.default;
    var __VLS_442;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['password-row']} */ ;
/** @type {__VLS_StyleScopedClasses['password-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['secret-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['secret-value']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
// @ts-ignore
var __VLS_423 = __VLS_422;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Hide: Hide,
            Refresh: Refresh,
            View: View,
            SCHEDULE_OPTIONS: SCHEDULE_OPTIONS,
            PASSWORD_POLICY_HINT: PASSWORD_POLICY_HINT,
            PushFieldMapper: PushFieldMapper,
            ApiExposeQueryParameters: ApiExposeQueryParameters,
            ServiceSourcePicker: ServiceSourcePicker,
            PermissionButton: PermissionButton,
            isMultiSource: isMultiSource,
            visible: visible,
            saving: saving,
            currentTarget: currentTarget,
            sourceColumns: sourceColumns,
            revealedSecrets: revealedSecrets,
            revealing: revealing,
            fieldMapper: fieldMapper,
            revealSecret: revealSecret,
            availablePushTypes: availablePushTypes,
            DIALECTS: DIALECTS,
            isExposeType: isExposeType,
            form: form,
            resetPassword: resetPassword,
            sourceRef: sourceRef,
            legacySourceTable: legacySourceTable,
            confirm: confirm,
            downloadDocumentation: downloadDocumentation,
            copyUrl: copyUrl,
            apiBaseUrl: apiBaseUrl,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
