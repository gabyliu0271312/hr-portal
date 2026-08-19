/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { ucpApi } from '@/api/ucp';
import PackageOperations from './PackageOperations.vue';
const items = ref([]);
const loading = ref(false);
const drawerVisible = ref(false);
const configurationProfiles = ref([]);
const resourceEditorVisible = ref(false);
const resourceTemplateImpact = ref(null);
const activeTab = ref('config');
const activePackage = ref();
const blankSystem = () => ({ id: 0, package_code: '', package_name: '', category: 'STANDARD_SAAS', owner: '', version: '1.0.0', hosts: '', auth_type: 'none', scopes: '', base_url: '', release_notes: '' });
const blankResource = () => ({ id: 0, package_code: '', package_name: '', owner: '', version: '1.0.0', description: '', resource_code: '', resource_name: '', configuration_profile: '', report_id: '', beisen_token_url: 'https://openapi.italent.cn/token', beisen_header_url: 'https://openapi.italent.cn/Ocean/api/v2/Reports/GridHeader', beisen_data_url: 'https://openapi.italent.cn/Ocean/api/v2/Reports/GridData', spreadsheet_token: '', sheet_id: '', sheet_range: 'A1:ZZ10000', app_token: '', table_id: '', view_id: '', api_path: '', credential_auth_type: 'none', required_secret_keys: '', object_type: 'TABLE', object_multiple: true, required_object_fields: '', allowed_override_fields: ['credential_id'], signature_header: 'X-Signature', request_id_header: 'X-Request-Id', timestamp_header: 'X-Timestamp', nonce_header: 'X-Nonce', event_type_path: 'event_type', event_id_path: 'request_id', batch_id_path: 'batch_id', max_timestamp_diff_seconds: 300, rate_limit_per_minute: 120, rate_limit_burst: 10, max_body_bytes: 1048576, event_definition_source_system_type: '', event_definition_codes: '', default_event_objects: [], source_schema: {} });
const systemForm = reactive(blankSystem());
const resourceForm = reactive(blankResource());
const systemPackages = computed(() => items.value.filter(item => item.category !== 'INSTANCE_RESOURCE'));
const activeResourceTemplates = computed(() => items.value.filter(item => item.category === 'INSTANCE_RESOURCE' && item.system_schema?.parent_package_code === activePackage.value?.package_code));
const drawerTitle = computed(() => activePackage.value ? `管理接入类型 — ${activePackage.value.package_name}` : '新增接入类型');
const selectedProfile = computed(() => configurationProfiles.value.find(profile => profile.code === resourceForm.configuration_profile));
const detectedProfileLabel = computed(() => {
    if (resourceForm.object_type === 'EVENT_TYPE')
        return 'Webhook 入站配置';
    if (resourceForm.object_type === 'REPORT')
        return '北森报表访问配置';
    if (resourceForm.object_type === 'API_OBJECT')
        return '通用 API 对象';
    const hasSheet = Boolean(resourceForm.spreadsheet_token || resourceForm.sheet_id);
    const hasBitable = Boolean(resourceForm.app_token || resourceForm.table_id);
    if (hasSheet && hasBitable)
        return '定位字段冲突，请仅填写一种表格配置';
    if (hasSheet)
        return '飞书在线表格（自动识别）';
    if (hasBitable)
        return '飞书多维表格（自动识别）';
    return '填写表格定位字段后自动识别';
});
function categoryLabel(category) { return category === 'CONTROLLED_API' ? '受控 API' : '标准 SaaS'; }
function resourceSummary(packageCode) { const list = items.value.filter(item => item.category === 'INSTANCE_RESOURCE' && item.system_schema?.parent_package_code === packageCode); return list.length ? list.map(item => item.package_name).join('、') : '暂无资源模板'; }
function splitValues(value) { return value.split(',').map((item) => item.trim()).filter(Boolean); }
function profileCode(schema) { return schema?.resource_defaults?.configuration_profile || ''; }
function configurationProfileLabel(row) { const code = profileCode(row.system_schema); return configurationProfiles.value.find(profile => profile.code === code)?.label || code || '-'; }
async function load() { loading.value = true; try {
    items.value = await ucpApi.connectorPackages();
}
finally {
    loading.value = false;
} }
async function loadConfigurationProfiles() { try {
    configurationProfiles.value = await ucpApi.resourceConfigurationProfiles();
}
catch {
    configurationProfiles.value = [];
} }
function assignSystemForm(row) { const schema = row?.system_schema || {}; const auth = row?.auth_policy || {}; Object.assign(systemForm, blankSystem(), row || {}, { hosts: (row?.host_allowlist || []).join(','), auth_type: auth.auth_type || 'none', scopes: (auth.required_scopes || []).join(','), base_url: schema.base_url || '' }); }
function createSystemPackage() { activePackage.value = undefined; assignSystemForm(); activeTab.value = 'config'; drawerVisible.value = true; }
function manage(row) { activePackage.value = row; assignSystemForm(row); activeTab.value = 'config'; drawerVisible.value = true; }
async function saveSystemPackage() {
    if (!systemForm.package_code || !systemForm.package_name)
        return ElMessage.warning('请填写模板编码和名称');
    const payload = { package_code: systemForm.package_code, package_name: systemForm.package_name, category: systemForm.category, owner: systemForm.owner, version: systemForm.version, host_allowlist: splitValues(systemForm.hosts), auth_policy: { auth_type: systemForm.auth_type, required_scopes: splitValues(systemForm.scopes), credential_schema: [] }, system_schema: { base_url: systemForm.base_url, fields: [] }, release_notes: systemForm.release_notes };
    try {
        const saved = systemForm.id ? await ucpApi.updateConnectorPackage(systemForm.package_code, payload) : await ucpApi.createConnectorPackage(payload);
        activePackage.value = saved;
        assignSystemForm(saved);
        await load();
        ElMessage.success('接入配置已保存');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '保存失败');
    }
}
function applyObjectType() { resourceForm.configuration_profile = ''; }
function addDefaultEventObject() { resourceForm.default_event_objects.push({ object_code: '', object_name: '', event_definition_code: '', is_active: true }); }
async function openResourceEditor(row) {
    resourceTemplateImpact.value = null;
    const schema = row?.system_schema || {};
    const defaults = schema.resource_defaults || {};
    const credential = schema.credential_requirement || {};
    const objectTemplate = schema.object_template || {};
    const ingress = defaults.protocol?.ingress || {};
    const preset = blankResource();
    Object.assign(resourceForm, preset, row || {}, {
        resource_code: schema.resource_code || defaults.resource_code || '',
        resource_name: schema.resource_name || defaults.resource_name || '',
        configuration_profile: '',
        report_id: objectTemplate.default_object_config?.report_id || '',
        beisen_token_url: defaults.report_config?.token_url || preset.beisen_token_url,
        beisen_header_url: defaults.report_config?.header_url || preset.beisen_header_url,
        beisen_data_url: defaults.report_config?.data_url || preset.beisen_data_url,
        spreadsheet_token: objectTemplate.default_object_config?.spreadsheet_token || '', sheet_id: objectTemplate.default_object_config?.sheet_id || '', sheet_range: objectTemplate.default_object_config?.range || preset.sheet_range,
        app_token: objectTemplate.default_object_config?.app_token || '', table_id: objectTemplate.default_object_config?.table_id || '', view_id: objectTemplate.default_object_config?.view_id || '', api_path: objectTemplate.default_object_config?.path || '',
        credential_auth_type: credential.auth_type || preset.credential_auth_type,
        required_secret_keys: (credential.required_secret_keys || []).join(','),
        object_type: objectTemplate.object_type || preset.object_type,
        object_multiple: objectTemplate.multiple !== false,
        required_object_fields: (objectTemplate.required_object_fields || []).join(','),
        allowed_override_fields: schema.instance_override_policy?.allowed_fields || preset.allowed_override_fields,
        signature_header: ingress.signature_header || preset.signature_header,
        request_id_header: ingress.request_id_header || preset.request_id_header,
        timestamp_header: ingress.timestamp_header || preset.timestamp_header,
        nonce_header: ingress.nonce_header || preset.nonce_header,
        max_timestamp_diff_seconds: ingress.max_timestamp_diff_seconds || preset.max_timestamp_diff_seconds,
        event_type_path: ingress.event_type_path || preset.event_type_path,
        event_id_path: ingress.event_id_path || preset.event_id_path,
        batch_id_path: ingress.batch_id_path || preset.batch_id_path,
        rate_limit_per_minute: ingress.rate_limit_per_minute || preset.rate_limit_per_minute,
        rate_limit_burst: ingress.rate_limit_burst || preset.rate_limit_burst,
        max_body_bytes: ingress.max_body_bytes || preset.max_body_bytes,
        event_definition_source_system_type: objectTemplate.event_definition_source_system_type || '',
        event_definition_codes: (objectTemplate.event_definition_codes || []).join(','),
        default_event_objects: (objectTemplate.default_objects || []).map((item) => ({ ...item })),
        source_schema: schema,
    });
    applyObjectType();
    if (row?.package_code) {
        try {
            resourceTemplateImpact.value = await ucpApi.resourceTemplateImpact(row.package_code);
        }
        catch {
            resourceTemplateImpact.value = null;
        }
    }
    resourceEditorVisible.value = true;
}
async function saveResourceTemplate() {
    if (!resourceForm.package_code || !resourceForm.package_name || !resourceForm.object_type || !resourceForm.resource_code || !resourceForm.resource_name)
        return ElMessage.warning('请填写资源模板编码、名称、对象类型及稳定资源标识');
    const hasValue = (value) => String(value ?? '').trim().length > 0;
    const hasSheetLocator = hasValue(resourceForm.spreadsheet_token) || hasValue(resourceForm.sheet_id);
    const hasBitableLocator = hasValue(resourceForm.app_token) || hasValue(resourceForm.table_id) || hasValue(resourceForm.view_id);
    if (resourceForm.object_type === 'REPORT' && !hasValue(resourceForm.report_id))
        return ElMessage.warning('请填写默认报表 ID');
    if (resourceForm.object_type === 'TABLE') {
        if (hasSheetLocator && hasBitableLocator)
            return ElMessage.warning('在线表格与多维表格定位字段不能同时填写');
        if (!hasSheetLocator && !hasBitableLocator)
            return ElMessage.warning('请填写一种完整的表格定位配置');
        if (hasSheetLocator && (!hasValue(resourceForm.spreadsheet_token) || !hasValue(resourceForm.sheet_id) || !hasValue(resourceForm.sheet_range)))
            return ElMessage.warning('飞书在线表格需填写 Spreadsheet Token、Sheet ID 和读取范围');
        if (hasBitableLocator && (!hasValue(resourceForm.app_token) || !hasValue(resourceForm.table_id)))
            return ElMessage.warning('飞书多维表格需填写 App Token 和数据表 ID');
    }
    if (resourceForm.object_type === 'API_OBJECT' && !hasValue(resourceForm.api_path))
        return ElMessage.warning('请填写对象路径');
    const defaultObjectConfig = resourceForm.object_type === 'REPORT'
        ? { report_id: resourceForm.report_id }
        : resourceForm.object_type === 'TABLE'
            ? hasSheetLocator && hasBitableLocator
                ? { spreadsheet_token: resourceForm.spreadsheet_token, sheet_id: resourceForm.sheet_id, range: resourceForm.sheet_range, app_token: resourceForm.app_token, table_id: resourceForm.table_id, view_id: resourceForm.view_id }
                : hasBitableLocator
                    ? { app_token: resourceForm.app_token, table_id: resourceForm.table_id, view_id: resourceForm.view_id }
                    : { spreadsheet_token: resourceForm.spreadsheet_token, sheet_id: resourceForm.sheet_id, range: resourceForm.sheet_range }
            : resourceForm.object_type === 'API_OBJECT' ? { path: resourceForm.api_path } : {};
    try {
        const resourceDefaults = { resource_code: resourceForm.resource_code, resource_name: resourceForm.resource_name };
        if (resourceForm.object_type === 'EVENT_TYPE')
            resourceDefaults.protocol = { ingress: { verification_strategy: 'HMAC_SHA256_TIMESTAMPED', signature_header: resourceForm.signature_header, request_id_header: resourceForm.request_id_header, timestamp_header: resourceForm.timestamp_header, nonce_header: resourceForm.nonce_header, max_timestamp_diff_seconds: resourceForm.max_timestamp_diff_seconds, event_type_path: resourceForm.event_type_path, event_id_path: resourceForm.event_id_path, batch_id_path: resourceForm.batch_id_path, rate_limit_per_minute: resourceForm.rate_limit_per_minute, rate_limit_burst: resourceForm.rate_limit_burst, max_body_bytes: resourceForm.max_body_bytes } };
        if (resourceForm.object_type === 'REPORT')
            resourceDefaults.report_config = { token_url: resourceForm.beisen_token_url, header_url: resourceForm.beisen_header_url, data_url: resourceForm.beisen_data_url };
        const sourceSchema = { ...(resourceForm.source_schema || {}) };
        delete sourceSchema.resource_connector_type;
        delete sourceSchema.runtime_binding;
        const payload = { package_code: resourceForm.package_code, package_name: resourceForm.package_name, category: 'INSTANCE_RESOURCE', owner: resourceForm.owner, version: resourceForm.version, description: resourceForm.description, host_allowlist: [], auth_policy: {}, system_schema: { ...sourceSchema, parent_package_code: activePackage.value.package_code, resource_defaults: resourceDefaults, credential_requirement: { auth_type: resourceForm.credential_auth_type, required_secret_keys: splitValues(resourceForm.required_secret_keys) }, object_template: { object_type: resourceForm.object_type, multiple: resourceForm.object_multiple, required_object_fields: splitValues(resourceForm.required_object_fields), event_definition_source_system_type: resourceForm.event_definition_source_system_type || undefined, event_definition_codes: splitValues(resourceForm.event_definition_codes), config_schema: [], default_object_config: defaultObjectConfig, default_objects: resourceForm.default_event_objects.filter((item) => item.object_code && item.event_definition_code) }, instance_override_policy: { allowed_fields: resourceForm.allowed_override_fields } } };
        if (resourceForm.id)
            await ucpApi.updateConnectorPackage(resourceForm.package_code, payload);
        else
            await ucpApi.createConnectorPackage(payload);
        resourceEditorVisible.value = false;
        await load();
        ElMessage.success('资源模板已保存');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || error?.message || '保存失败');
    }
}
async function publish(row) { try {
    await ucpApi.publishConnectorPackage(row.package_code);
    await load();
    if (activePackage.value?.package_code === row.package_code)
        activePackage.value = items.value.find(item => item.package_code === row.package_code);
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '发布失败');
} }
async function reloadActivePackage() { await load(); if (activePackage.value)
    activePackage.value = items.value.find(item => item.package_code === activePackage.value.package_code) || activePackage.value; }
onMounted(() => { load(); loadConfigurationProfiles(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['head']} */ ;
/** @type {__VLS_StyleScopedClasses['head']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-actions']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.createSystemPackage)
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    data: (__VLS_ctx.systemPackages),
    border: true,
}));
const __VLS_10 = __VLS_9({
    data: (__VLS_ctx.systemPackages),
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_11.slots.default;
const __VLS_12 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    prop: "package_name",
    label: "接入类型",
    minWidth: "160",
}));
const __VLS_14 = __VLS_13({
    prop: "package_name",
    label: "接入类型",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
const __VLS_16 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    prop: "package_code",
    label: "编码",
    minWidth: "180",
}));
const __VLS_18 = __VLS_17({
    prop: "package_code",
    label: "编码",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_20 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "接入方式",
    minWidth: "120",
}));
const __VLS_22 = __VLS_21({
    label: "接入方式",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_23.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.categoryLabel(row.category));
}
var __VLS_23;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "资源模板",
    minWidth: "260",
}));
const __VLS_26 = __VLS_25({
    label: "资源模板",
    minWidth: "260",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.resourceSummary(row.package_code));
}
var __VLS_27;
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    prop: "status",
    label: "状态",
    width: "110",
}));
const __VLS_30 = __VLS_29({
    prop: "status",
    label: "状态",
    width: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "操作",
    width: "140",
}));
const __VLS_34 = __VLS_33({
    label: "操作",
    width: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_35.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_36 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onClick: (...[$event]) => {
            __VLS_ctx.manage(row);
        }
    };
    __VLS_39.slots.default;
    var __VLS_39;
    if (row.status === 'DRAFT') {
        const __VLS_44 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }));
        const __VLS_46 = __VLS_45({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        let __VLS_48;
        let __VLS_49;
        let __VLS_50;
        const __VLS_51 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'DRAFT'))
                    return;
                __VLS_ctx.publish(row);
            }
        };
        __VLS_47.slots.default;
        var __VLS_47;
    }
}
var __VLS_35;
var __VLS_11;
const __VLS_52 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.drawerTitle),
    size: "820px",
    destroyOnClose: true,
}));
const __VLS_54 = __VLS_53({
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.drawerTitle),
    size: "820px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "catalog-tabs" },
}));
const __VLS_58 = __VLS_57({
    modelValue: (__VLS_ctx.activeTab),
    ...{ class: "catalog-tabs" },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
const __VLS_60 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "接入配置",
    name: "config",
}));
const __VLS_62 = __VLS_61({
    label: "接入配置",
    name: "config",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "接入配置定义系统如何连接；认证、凭证 Schema、系统实例字段均在本页分区维护。",
}));
const __VLS_66 = __VLS_65({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "接入配置定义系统如何连接；认证、凭证 Schema、系统实例字段均在本页分区维护。",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const __VLS_68 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    labelWidth: "120px",
}));
const __VLS_70 = __VLS_69({
    labelWidth: "120px",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    contentPosition: "left",
}));
const __VLS_74 = __VLS_73({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
var __VLS_75;
const __VLS_76 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    label: "模板编码",
    required: true,
}));
const __VLS_78 = __VLS_77({
    label: "模板编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    modelValue: (__VLS_ctx.systemForm.package_code),
    disabled: (Boolean(__VLS_ctx.systemForm.id)),
}));
const __VLS_82 = __VLS_81({
    modelValue: (__VLS_ctx.systemForm.package_code),
    disabled: (Boolean(__VLS_ctx.systemForm.id)),
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
var __VLS_79;
const __VLS_84 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "模板名称",
    required: true,
}));
const __VLS_86 = __VLS_85({
    label: "模板名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    modelValue: (__VLS_ctx.systemForm.package_name),
}));
const __VLS_90 = __VLS_89({
    modelValue: (__VLS_ctx.systemForm.package_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
var __VLS_87;
const __VLS_92 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    label: "目录分类",
}));
const __VLS_94 = __VLS_93({
    label: "目录分类",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
const __VLS_96 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    modelValue: (__VLS_ctx.systemForm.category),
    disabled: (Boolean(__VLS_ctx.systemForm.id)),
}));
const __VLS_98 = __VLS_97({
    modelValue: (__VLS_ctx.systemForm.category),
    disabled: (Boolean(__VLS_ctx.systemForm.id)),
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "标准 SaaS",
    value: "STANDARD_SAAS",
}));
const __VLS_102 = __VLS_101({
    label: "标准 SaaS",
    value: "STANDARD_SAAS",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "受控 API",
    value: "CONTROLLED_API",
}));
const __VLS_106 = __VLS_105({
    label: "受控 API",
    value: "CONTROLLED_API",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
var __VLS_99;
var __VLS_95;
const __VLS_108 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    label: "维护人",
}));
const __VLS_110 = __VLS_109({
    label: "维护人",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    modelValue: (__VLS_ctx.systemForm.owner),
}));
const __VLS_114 = __VLS_113({
    modelValue: (__VLS_ctx.systemForm.owner),
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
var __VLS_111;
const __VLS_116 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    label: "版本",
}));
const __VLS_118 = __VLS_117({
    label: "版本",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    modelValue: (__VLS_ctx.systemForm.version),
}));
const __VLS_122 = __VLS_121({
    modelValue: (__VLS_ctx.systemForm.version),
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_119;
const __VLS_124 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "升级说明",
}));
const __VLS_126 = __VLS_125({
    label: "升级说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    modelValue: (__VLS_ctx.systemForm.release_notes),
    type: "textarea",
}));
const __VLS_130 = __VLS_129({
    modelValue: (__VLS_ctx.systemForm.release_notes),
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
var __VLS_127;
const __VLS_132 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    contentPosition: "left",
}));
const __VLS_134 = __VLS_133({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
var __VLS_135;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "基础 URL",
}));
const __VLS_138 = __VLS_137({
    label: "基础 URL",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.systemForm.base_url),
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.systemForm.base_url),
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_139;
const __VLS_144 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    label: "允许域名",
}));
const __VLS_146 = __VLS_145({
    label: "允许域名",
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
__VLS_147.slots.default;
const __VLS_148 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.systemForm.hosts),
    placeholder: "多个域名以逗号分隔",
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.systemForm.hosts),
    placeholder: "多个域名以逗号分隔",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
var __VLS_147;
const __VLS_152 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "认证方式",
}));
const __VLS_154 = __VLS_153({
    label: "认证方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
const __VLS_156 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    modelValue: (__VLS_ctx.systemForm.auth_type),
}));
const __VLS_158 = __VLS_157({
    modelValue: (__VLS_ctx.systemForm.auth_type),
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
const __VLS_160 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    label: "无认证",
    value: "none",
}));
const __VLS_162 = __VLS_161({
    label: "无认证",
    value: "none",
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
const __VLS_164 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    label: "Bearer Token",
    value: "bearer",
}));
const __VLS_166 = __VLS_165({
    label: "Bearer Token",
    value: "bearer",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
const __VLS_168 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    label: "App Key / Secret",
    value: "app_key_secret",
}));
const __VLS_170 = __VLS_169({
    label: "App Key / Secret",
    value: "app_key_secret",
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
const __VLS_172 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    label: "OAuth 2.0",
    value: "oauth2",
}));
const __VLS_174 = __VLS_173({
    label: "OAuth 2.0",
    value: "oauth2",
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
var __VLS_159;
var __VLS_155;
const __VLS_176 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "必需 Scope",
}));
const __VLS_178 = __VLS_177({
    label: "必需 Scope",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
__VLS_179.slots.default;
const __VLS_180 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    modelValue: (__VLS_ctx.systemForm.scopes),
    placeholder: "多个 Scope 以逗号分隔",
}));
const __VLS_182 = __VLS_181({
    modelValue: (__VLS_ctx.systemForm.scopes),
    placeholder: "多个 Scope 以逗号分隔",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
var __VLS_179;
const __VLS_184 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    contentPosition: "left",
}));
const __VLS_186 = __VLS_185({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
__VLS_187.slots.default;
var __VLS_187;
const __VLS_188 = {}.ElEmpty;
/** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    description: "暂未配置系统实例字段；后续可在此定义租户 ID、企业 ID、环境标识等系统差异字段。",
    imageSize: (72),
}));
const __VLS_190 = __VLS_189({
    description: "暂未配置系统实例字段；后续可在此定义租户 ID、企业 ID、环境标识等系统差异字段。",
    imageSize: (72),
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_71;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "drawer-actions" },
});
const __VLS_192 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_194 = __VLS_193({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_193));
let __VLS_196;
let __VLS_197;
let __VLS_198;
const __VLS_199 = {
    onClick: (__VLS_ctx.saveSystemPackage)
};
__VLS_195.slots.default;
var __VLS_195;
var __VLS_63;
const __VLS_200 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    label: "资源模板",
    name: "resources",
    disabled: (!__VLS_ctx.activePackage),
}));
const __VLS_202 = __VLS_201({
    label: "资源模板",
    name: "resources",
    disabled: (!__VLS_ctx.activePackage),
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
const __VLS_204 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "资源模板以对象类型为主模型；配置方案决定实际访问协议和运行适配器。资源实例仅继承模板，并绑定凭证、运行状态和已批准的环境覆盖。",
}));
const __VLS_206 = __VLS_205({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "资源模板以对象类型为主模型；配置方案决定实际访问协议和运行适配器。资源实例仅继承模板，并绑定凭证、运行状态和已批准的环境覆盖。",
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
const __VLS_208 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_210 = __VLS_209({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_209));
let __VLS_212;
let __VLS_213;
let __VLS_214;
const __VLS_215 = {
    onClick: (...[$event]) => {
        __VLS_ctx.openResourceEditor();
    }
};
__VLS_211.slots.default;
var __VLS_211;
const __VLS_216 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
    data: (__VLS_ctx.activeResourceTemplates),
    border: true,
}));
const __VLS_218 = __VLS_217({
    data: (__VLS_ctx.activeResourceTemplates),
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_217));
__VLS_219.slots.default;
const __VLS_220 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
    prop: "package_name",
    label: "资源名称",
}));
const __VLS_222 = __VLS_221({
    prop: "package_name",
    label: "资源名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_221));
const __VLS_224 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
    prop: "package_code",
    label: "资源编码",
}));
const __VLS_226 = __VLS_225({
    prop: "package_code",
    label: "资源编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_225));
const __VLS_228 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    label: "对象类型",
    minWidth: "120",
}));
const __VLS_230 = __VLS_229({
    label: "对象类型",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
__VLS_231.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_231.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.system_schema?.object_template?.object_type || '-');
}
var __VLS_231;
const __VLS_232 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    label: "配置方案",
    minWidth: "180",
}));
const __VLS_234 = __VLS_233({
    label: "配置方案",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
__VLS_235.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_235.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.configurationProfileLabel(row));
}
var __VLS_235;
const __VLS_236 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
    prop: "status",
    label: "状态",
    width: "100",
}));
const __VLS_238 = __VLS_237({
    prop: "status",
    label: "状态",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_237));
const __VLS_240 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
    label: "操作",
    width: "130",
}));
const __VLS_242 = __VLS_241({
    label: "操作",
    width: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_241));
__VLS_243.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_243.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_244 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        ...{ 'onClick': {} },
        link: true,
    }));
    const __VLS_246 = __VLS_245({
        ...{ 'onClick': {} },
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    let __VLS_248;
    let __VLS_249;
    let __VLS_250;
    const __VLS_251 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openResourceEditor(row);
        }
    };
    __VLS_247.slots.default;
    var __VLS_247;
    if (row.status === 'DRAFT') {
        const __VLS_252 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }));
        const __VLS_254 = __VLS_253({
            ...{ 'onClick': {} },
            link: true,
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_253));
        let __VLS_256;
        let __VLS_257;
        let __VLS_258;
        const __VLS_259 = {
            onClick: (...[$event]) => {
                if (!(row.status === 'DRAFT'))
                    return;
                __VLS_ctx.publish(row);
            }
        };
        __VLS_255.slots.default;
        var __VLS_255;
    }
}
var __VLS_243;
var __VLS_219;
var __VLS_203;
const __VLS_260 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
    label: "业务动作",
    name: "operations",
    disabled: (!__VLS_ctx.activePackage),
}));
const __VLS_262 = __VLS_261({
    label: "业务动作",
    name: "operations",
    disabled: (!__VLS_ctx.activePackage),
}, ...__VLS_functionalComponentArgsRest(__VLS_261));
__VLS_263.slots.default;
if (__VLS_ctx.activePackage) {
    /** @type {[typeof PackageOperations, ]} */ ;
    // @ts-ignore
    const __VLS_264 = __VLS_asFunctionalComponent(PackageOperations, new PackageOperations({
        ...{ 'onChanged': {} },
        key: (__VLS_ctx.activePackage.package_code),
        packageCode: (__VLS_ctx.activePackage.package_code),
        packageId: (__VLS_ctx.activePackage.id),
    }));
    const __VLS_265 = __VLS_264({
        ...{ 'onChanged': {} },
        key: (__VLS_ctx.activePackage.package_code),
        packageCode: (__VLS_ctx.activePackage.package_code),
        packageId: (__VLS_ctx.activePackage.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_264));
    let __VLS_267;
    let __VLS_268;
    let __VLS_269;
    const __VLS_270 = {
        onChanged: (__VLS_ctx.reloadActivePackage)
    };
    var __VLS_266;
}
var __VLS_263;
var __VLS_59;
var __VLS_55;
const __VLS_271 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
    modelValue: (__VLS_ctx.resourceEditorVisible),
    title: (__VLS_ctx.resourceForm.id ? '编辑资源模板' : '新增资源模板'),
    width: "860px",
    destroyOnClose: true,
}));
const __VLS_273 = __VLS_272({
    modelValue: (__VLS_ctx.resourceEditorVisible),
    title: (__VLS_ctx.resourceForm.id ? '编辑资源模板' : '新增资源模板'),
    width: "860px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_272));
__VLS_274.slots.default;
const __VLS_275 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "对象类型是资源模板的主模型。运行连接器由配置方案在服务端派生，不作为可编辑的资源实现类型。",
}));
const __VLS_277 = __VLS_276({
    type: "info",
    closable: (false),
    ...{ class: "section-tip" },
    title: "对象类型是资源模板的主模型。运行连接器由配置方案在服务端派生，不作为可编辑的资源实现类型。",
}, ...__VLS_functionalComponentArgsRest(__VLS_276));
if (__VLS_ctx.resourceTemplateImpact) {
    const __VLS_279 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
        closable: (false),
        type: "warning",
        ...{ class: "section-tip" },
        title: (`当前模板影响 ${__VLS_ctx.resourceTemplateImpact.total} 个资源实例；修改已发布模板前请确认兼容性。`),
    }));
    const __VLS_281 = __VLS_280({
        closable: (false),
        type: "warning",
        ...{ class: "section-tip" },
        title: (`当前模板影响 ${__VLS_ctx.resourceTemplateImpact.total} 个资源实例；修改已发布模板前请确认兼容性。`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_280));
}
const __VLS_283 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
    labelWidth: "130px",
}));
const __VLS_285 = __VLS_284({
    labelWidth: "130px",
}, ...__VLS_functionalComponentArgsRest(__VLS_284));
__VLS_286.slots.default;
const __VLS_287 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
    label: "资源模板编码",
    required: true,
}));
const __VLS_289 = __VLS_288({
    label: "资源模板编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_288));
__VLS_290.slots.default;
const __VLS_291 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
    modelValue: (__VLS_ctx.resourceForm.package_code),
    disabled: (Boolean(__VLS_ctx.resourceForm.id)),
}));
const __VLS_293 = __VLS_292({
    modelValue: (__VLS_ctx.resourceForm.package_code),
    disabled: (Boolean(__VLS_ctx.resourceForm.id)),
}, ...__VLS_functionalComponentArgsRest(__VLS_292));
var __VLS_290;
const __VLS_295 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
    label: "资源模板名称",
    required: true,
}));
const __VLS_297 = __VLS_296({
    label: "资源模板名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_296));
__VLS_298.slots.default;
const __VLS_299 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
    modelValue: (__VLS_ctx.resourceForm.package_name),
}));
const __VLS_301 = __VLS_300({
    modelValue: (__VLS_ctx.resourceForm.package_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_300));
var __VLS_298;
const __VLS_303 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
    label: "对象类型",
    required: true,
}));
const __VLS_305 = __VLS_304({
    label: "对象类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_304));
__VLS_306.slots.default;
const __VLS_307 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.resourceForm.object_type),
    ...{ style: {} },
}));
const __VLS_309 = __VLS_308({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.resourceForm.object_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_308));
let __VLS_311;
let __VLS_312;
let __VLS_313;
const __VLS_314 = {
    onChange: (__VLS_ctx.applyObjectType)
};
__VLS_310.slots.default;
const __VLS_315 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_316 = __VLS_asFunctionalComponent(__VLS_315, new __VLS_315({
    label: "事件",
    value: "EVENT_TYPE",
}));
const __VLS_317 = __VLS_316({
    label: "事件",
    value: "EVENT_TYPE",
}, ...__VLS_functionalComponentArgsRest(__VLS_316));
const __VLS_319 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_320 = __VLS_asFunctionalComponent(__VLS_319, new __VLS_319({
    label: "报表",
    value: "REPORT",
}));
const __VLS_321 = __VLS_320({
    label: "报表",
    value: "REPORT",
}, ...__VLS_functionalComponentArgsRest(__VLS_320));
const __VLS_323 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
    label: "数据表",
    value: "TABLE",
}));
const __VLS_325 = __VLS_324({
    label: "数据表",
    value: "TABLE",
}, ...__VLS_functionalComponentArgsRest(__VLS_324));
const __VLS_327 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_328 = __VLS_asFunctionalComponent(__VLS_327, new __VLS_327({
    label: "API 对象",
    value: "API_OBJECT",
}));
const __VLS_329 = __VLS_328({
    label: "API 对象",
    value: "API_OBJECT",
}, ...__VLS_functionalComponentArgsRest(__VLS_328));
var __VLS_310;
var __VLS_306;
const __VLS_331 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({
    label: "配置方案",
}));
const __VLS_333 = __VLS_332({
    label: "配置方案",
}, ...__VLS_functionalComponentArgsRest(__VLS_332));
__VLS_334.slots.default;
const __VLS_335 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_336 = __VLS_asFunctionalComponent(__VLS_335, new __VLS_335({
    modelValue: (__VLS_ctx.detectedProfileLabel),
    disabled: true,
}));
const __VLS_337 = __VLS_336({
    modelValue: (__VLS_ctx.detectedProfileLabel),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_336));
var __VLS_334;
const __VLS_339 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
    label: "维护人",
}));
const __VLS_341 = __VLS_340({
    label: "维护人",
}, ...__VLS_functionalComponentArgsRest(__VLS_340));
__VLS_342.slots.default;
const __VLS_343 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_344 = __VLS_asFunctionalComponent(__VLS_343, new __VLS_343({
    modelValue: (__VLS_ctx.resourceForm.owner),
}));
const __VLS_345 = __VLS_344({
    modelValue: (__VLS_ctx.resourceForm.owner),
}, ...__VLS_functionalComponentArgsRest(__VLS_344));
var __VLS_342;
const __VLS_347 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_348 = __VLS_asFunctionalComponent(__VLS_347, new __VLS_347({
    label: "版本",
}));
const __VLS_349 = __VLS_348({
    label: "版本",
}, ...__VLS_functionalComponentArgsRest(__VLS_348));
__VLS_350.slots.default;
const __VLS_351 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_352 = __VLS_asFunctionalComponent(__VLS_351, new __VLS_351({
    modelValue: (__VLS_ctx.resourceForm.version),
}));
const __VLS_353 = __VLS_352({
    modelValue: (__VLS_ctx.resourceForm.version),
}, ...__VLS_functionalComponentArgsRest(__VLS_352));
var __VLS_350;
const __VLS_355 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_356 = __VLS_asFunctionalComponent(__VLS_355, new __VLS_355({
    label: "描述",
}));
const __VLS_357 = __VLS_356({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_356));
__VLS_358.slots.default;
const __VLS_359 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_360 = __VLS_asFunctionalComponent(__VLS_359, new __VLS_359({
    modelValue: (__VLS_ctx.resourceForm.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_361 = __VLS_360({
    modelValue: (__VLS_ctx.resourceForm.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_360));
var __VLS_358;
const __VLS_363 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_364 = __VLS_asFunctionalComponent(__VLS_363, new __VLS_363({
    contentPosition: "left",
}));
const __VLS_365 = __VLS_364({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_364));
__VLS_366.slots.default;
var __VLS_366;
const __VLS_367 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_368 = __VLS_asFunctionalComponent(__VLS_367, new __VLS_367({
    label: "稳定资源编码",
    required: true,
}));
const __VLS_369 = __VLS_368({
    label: "稳定资源编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_368));
__VLS_370.slots.default;
const __VLS_371 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_372 = __VLS_asFunctionalComponent(__VLS_371, new __VLS_371({
    modelValue: (__VLS_ctx.resourceForm.resource_code),
    placeholder: "实例创建后保持稳定，不能直接等同模板编码",
}));
const __VLS_373 = __VLS_372({
    modelValue: (__VLS_ctx.resourceForm.resource_code),
    placeholder: "实例创建后保持稳定，不能直接等同模板编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_372));
var __VLS_370;
const __VLS_375 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_376 = __VLS_asFunctionalComponent(__VLS_375, new __VLS_375({
    label: "默认资源名称",
    required: true,
}));
const __VLS_377 = __VLS_376({
    label: "默认资源名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_376));
__VLS_378.slots.default;
const __VLS_379 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({
    modelValue: (__VLS_ctx.resourceForm.resource_name),
}));
const __VLS_381 = __VLS_380({
    modelValue: (__VLS_ctx.resourceForm.resource_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_380));
var __VLS_378;
if (__VLS_ctx.resourceForm.object_type === 'EVENT_TYPE') {
    const __VLS_383 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_384 = __VLS_asFunctionalComponent(__VLS_383, new __VLS_383({
        contentPosition: "left",
    }));
    const __VLS_385 = __VLS_384({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_384));
    __VLS_386.slots.default;
    var __VLS_386;
    const __VLS_387 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_388 = __VLS_asFunctionalComponent(__VLS_387, new __VLS_387({
        label: "签名 Header",
    }));
    const __VLS_389 = __VLS_388({
        label: "签名 Header",
    }, ...__VLS_functionalComponentArgsRest(__VLS_388));
    __VLS_390.slots.default;
    const __VLS_391 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_392 = __VLS_asFunctionalComponent(__VLS_391, new __VLS_391({
        modelValue: (__VLS_ctx.resourceForm.signature_header),
    }));
    const __VLS_393 = __VLS_392({
        modelValue: (__VLS_ctx.resourceForm.signature_header),
    }, ...__VLS_functionalComponentArgsRest(__VLS_392));
    var __VLS_390;
    const __VLS_395 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_396 = __VLS_asFunctionalComponent(__VLS_395, new __VLS_395({
        label: "请求 ID Header",
    }));
    const __VLS_397 = __VLS_396({
        label: "请求 ID Header",
    }, ...__VLS_functionalComponentArgsRest(__VLS_396));
    __VLS_398.slots.default;
    const __VLS_399 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_400 = __VLS_asFunctionalComponent(__VLS_399, new __VLS_399({
        modelValue: (__VLS_ctx.resourceForm.request_id_header),
    }));
    const __VLS_401 = __VLS_400({
        modelValue: (__VLS_ctx.resourceForm.request_id_header),
    }, ...__VLS_functionalComponentArgsRest(__VLS_400));
    var __VLS_398;
    const __VLS_403 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_404 = __VLS_asFunctionalComponent(__VLS_403, new __VLS_403({
        label: "时间戳 Header",
    }));
    const __VLS_405 = __VLS_404({
        label: "时间戳 Header",
    }, ...__VLS_functionalComponentArgsRest(__VLS_404));
    __VLS_406.slots.default;
    const __VLS_407 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_408 = __VLS_asFunctionalComponent(__VLS_407, new __VLS_407({
        modelValue: (__VLS_ctx.resourceForm.timestamp_header),
    }));
    const __VLS_409 = __VLS_408({
        modelValue: (__VLS_ctx.resourceForm.timestamp_header),
    }, ...__VLS_functionalComponentArgsRest(__VLS_408));
    var __VLS_406;
    const __VLS_411 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_412 = __VLS_asFunctionalComponent(__VLS_411, new __VLS_411({
        label: "Nonce Header",
    }));
    const __VLS_413 = __VLS_412({
        label: "Nonce Header",
    }, ...__VLS_functionalComponentArgsRest(__VLS_412));
    __VLS_414.slots.default;
    const __VLS_415 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_416 = __VLS_asFunctionalComponent(__VLS_415, new __VLS_415({
        modelValue: (__VLS_ctx.resourceForm.nonce_header),
    }));
    const __VLS_417 = __VLS_416({
        modelValue: (__VLS_ctx.resourceForm.nonce_header),
    }, ...__VLS_functionalComponentArgsRest(__VLS_416));
    var __VLS_414;
    const __VLS_419 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_420 = __VLS_asFunctionalComponent(__VLS_419, new __VLS_419({
        label: "事件类型路径",
    }));
    const __VLS_421 = __VLS_420({
        label: "事件类型路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_420));
    __VLS_422.slots.default;
    const __VLS_423 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_424 = __VLS_asFunctionalComponent(__VLS_423, new __VLS_423({
        modelValue: (__VLS_ctx.resourceForm.event_type_path),
    }));
    const __VLS_425 = __VLS_424({
        modelValue: (__VLS_ctx.resourceForm.event_type_path),
    }, ...__VLS_functionalComponentArgsRest(__VLS_424));
    var __VLS_422;
    const __VLS_427 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_428 = __VLS_asFunctionalComponent(__VLS_427, new __VLS_427({
        label: "请求 ID 路径",
    }));
    const __VLS_429 = __VLS_428({
        label: "请求 ID 路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_428));
    __VLS_430.slots.default;
    const __VLS_431 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_432 = __VLS_asFunctionalComponent(__VLS_431, new __VLS_431({
        modelValue: (__VLS_ctx.resourceForm.event_id_path),
    }));
    const __VLS_433 = __VLS_432({
        modelValue: (__VLS_ctx.resourceForm.event_id_path),
    }, ...__VLS_functionalComponentArgsRest(__VLS_432));
    var __VLS_430;
    const __VLS_435 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_436 = __VLS_asFunctionalComponent(__VLS_435, new __VLS_435({
        label: "批次路径",
    }));
    const __VLS_437 = __VLS_436({
        label: "批次路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_436));
    __VLS_438.slots.default;
    const __VLS_439 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_440 = __VLS_asFunctionalComponent(__VLS_439, new __VLS_439({
        modelValue: (__VLS_ctx.resourceForm.batch_id_path),
    }));
    const __VLS_441 = __VLS_440({
        modelValue: (__VLS_ctx.resourceForm.batch_id_path),
    }, ...__VLS_functionalComponentArgsRest(__VLS_440));
    var __VLS_438;
    const __VLS_443 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_444 = __VLS_asFunctionalComponent(__VLS_443, new __VLS_443({
        label: "默认限流",
    }));
    const __VLS_445 = __VLS_444({
        label: "默认限流",
    }, ...__VLS_functionalComponentArgsRest(__VLS_444));
    __VLS_446.slots.default;
    const __VLS_447 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_448 = __VLS_asFunctionalComponent(__VLS_447, new __VLS_447({
        modelValue: (__VLS_ctx.resourceForm.rate_limit_per_minute),
        min: (1),
    }));
    const __VLS_449 = __VLS_448({
        modelValue: (__VLS_ctx.resourceForm.rate_limit_per_minute),
        min: (1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_448));
    var __VLS_446;
    const __VLS_451 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_452 = __VLS_asFunctionalComponent(__VLS_451, new __VLS_451({
        label: "突发容量",
    }));
    const __VLS_453 = __VLS_452({
        label: "突发容量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_452));
    __VLS_454.slots.default;
    const __VLS_455 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_456 = __VLS_asFunctionalComponent(__VLS_455, new __VLS_455({
        modelValue: (__VLS_ctx.resourceForm.rate_limit_burst),
        min: (1),
    }));
    const __VLS_457 = __VLS_456({
        modelValue: (__VLS_ctx.resourceForm.rate_limit_burst),
        min: (1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_456));
    var __VLS_454;
    const __VLS_459 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_460 = __VLS_asFunctionalComponent(__VLS_459, new __VLS_459({
        label: "最大包体",
    }));
    const __VLS_461 = __VLS_460({
        label: "最大包体",
    }, ...__VLS_functionalComponentArgsRest(__VLS_460));
    __VLS_462.slots.default;
    const __VLS_463 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_464 = __VLS_asFunctionalComponent(__VLS_463, new __VLS_463({
        modelValue: (__VLS_ctx.resourceForm.max_body_bytes),
        min: (1024),
    }));
    const __VLS_465 = __VLS_464({
        modelValue: (__VLS_ctx.resourceForm.max_body_bytes),
        min: (1024),
    }, ...__VLS_functionalComponentArgsRest(__VLS_464));
    var __VLS_462;
}
if (__VLS_ctx.resourceForm.object_type === 'REPORT') {
    const __VLS_467 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_468 = __VLS_asFunctionalComponent(__VLS_467, new __VLS_467({
        contentPosition: "left",
    }));
    const __VLS_469 = __VLS_468({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_468));
    __VLS_470.slots.default;
    var __VLS_470;
    const __VLS_471 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_472 = __VLS_asFunctionalComponent(__VLS_471, new __VLS_471({
        label: "默认报表 ID",
        required: true,
    }));
    const __VLS_473 = __VLS_472({
        label: "默认报表 ID",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_472));
    __VLS_474.slots.default;
    const __VLS_475 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_476 = __VLS_asFunctionalComponent(__VLS_475, new __VLS_475({
        modelValue: (__VLS_ctx.resourceForm.report_id),
        placeholder: "用于识别北森报表配置方案",
    }));
    const __VLS_477 = __VLS_476({
        modelValue: (__VLS_ctx.resourceForm.report_id),
        placeholder: "用于识别北森报表配置方案",
    }, ...__VLS_functionalComponentArgsRest(__VLS_476));
    var __VLS_474;
    const __VLS_479 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_480 = __VLS_asFunctionalComponent(__VLS_479, new __VLS_479({
        label: "Token 接口",
    }));
    const __VLS_481 = __VLS_480({
        label: "Token 接口",
    }, ...__VLS_functionalComponentArgsRest(__VLS_480));
    __VLS_482.slots.default;
    const __VLS_483 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_484 = __VLS_asFunctionalComponent(__VLS_483, new __VLS_483({
        modelValue: (__VLS_ctx.resourceForm.beisen_token_url),
    }));
    const __VLS_485 = __VLS_484({
        modelValue: (__VLS_ctx.resourceForm.beisen_token_url),
    }, ...__VLS_functionalComponentArgsRest(__VLS_484));
    var __VLS_482;
    const __VLS_487 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_488 = __VLS_asFunctionalComponent(__VLS_487, new __VLS_487({
        label: "表头接口",
    }));
    const __VLS_489 = __VLS_488({
        label: "表头接口",
    }, ...__VLS_functionalComponentArgsRest(__VLS_488));
    __VLS_490.slots.default;
    const __VLS_491 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_492 = __VLS_asFunctionalComponent(__VLS_491, new __VLS_491({
        modelValue: (__VLS_ctx.resourceForm.beisen_header_url),
    }));
    const __VLS_493 = __VLS_492({
        modelValue: (__VLS_ctx.resourceForm.beisen_header_url),
    }, ...__VLS_functionalComponentArgsRest(__VLS_492));
    var __VLS_490;
    const __VLS_495 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_496 = __VLS_asFunctionalComponent(__VLS_495, new __VLS_495({
        label: "数据接口",
    }));
    const __VLS_497 = __VLS_496({
        label: "数据接口",
    }, ...__VLS_functionalComponentArgsRest(__VLS_496));
    __VLS_498.slots.default;
    const __VLS_499 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_500 = __VLS_asFunctionalComponent(__VLS_499, new __VLS_499({
        modelValue: (__VLS_ctx.resourceForm.beisen_data_url),
    }));
    const __VLS_501 = __VLS_500({
        modelValue: (__VLS_ctx.resourceForm.beisen_data_url),
    }, ...__VLS_functionalComponentArgsRest(__VLS_500));
    var __VLS_498;
}
if (__VLS_ctx.resourceForm.object_type === 'TABLE') {
    const __VLS_503 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_504 = __VLS_asFunctionalComponent(__VLS_503, new __VLS_503({
        contentPosition: "left",
    }));
    const __VLS_505 = __VLS_504({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_504));
    __VLS_506.slots.default;
    var __VLS_506;
    const __VLS_507 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_508 = __VLS_asFunctionalComponent(__VLS_507, new __VLS_507({
        type: "info",
        closable: (false),
        ...{ class: "section-tip" },
        title: "填写其中一组定位字段即可。系统根据字段自动识别飞书在线表格或飞书多维表格；两组不可同时填写。",
    }));
    const __VLS_509 = __VLS_508({
        type: "info",
        closable: (false),
        ...{ class: "section-tip" },
        title: "填写其中一组定位字段即可。系统根据字段自动识别飞书在线表格或飞书多维表格；两组不可同时填写。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_508));
    const __VLS_511 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_512 = __VLS_asFunctionalComponent(__VLS_511, new __VLS_511({
        label: "Spreadsheet Token",
    }));
    const __VLS_513 = __VLS_512({
        label: "Spreadsheet Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_512));
    __VLS_514.slots.default;
    const __VLS_515 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_516 = __VLS_asFunctionalComponent(__VLS_515, new __VLS_515({
        modelValue: (__VLS_ctx.resourceForm.spreadsheet_token),
    }));
    const __VLS_517 = __VLS_516({
        modelValue: (__VLS_ctx.resourceForm.spreadsheet_token),
    }, ...__VLS_functionalComponentArgsRest(__VLS_516));
    var __VLS_514;
    const __VLS_519 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_520 = __VLS_asFunctionalComponent(__VLS_519, new __VLS_519({
        label: "Sheet ID",
    }));
    const __VLS_521 = __VLS_520({
        label: "Sheet ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_520));
    __VLS_522.slots.default;
    const __VLS_523 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_524 = __VLS_asFunctionalComponent(__VLS_523, new __VLS_523({
        modelValue: (__VLS_ctx.resourceForm.sheet_id),
    }));
    const __VLS_525 = __VLS_524({
        modelValue: (__VLS_ctx.resourceForm.sheet_id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_524));
    var __VLS_522;
    const __VLS_527 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_528 = __VLS_asFunctionalComponent(__VLS_527, new __VLS_527({
        label: "读取范围",
    }));
    const __VLS_529 = __VLS_528({
        label: "读取范围",
    }, ...__VLS_functionalComponentArgsRest(__VLS_528));
    __VLS_530.slots.default;
    const __VLS_531 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_532 = __VLS_asFunctionalComponent(__VLS_531, new __VLS_531({
        modelValue: (__VLS_ctx.resourceForm.sheet_range),
        placeholder: "如 A1:ZZ10000",
    }));
    const __VLS_533 = __VLS_532({
        modelValue: (__VLS_ctx.resourceForm.sheet_range),
        placeholder: "如 A1:ZZ10000",
    }, ...__VLS_functionalComponentArgsRest(__VLS_532));
    var __VLS_530;
    const __VLS_535 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_536 = __VLS_asFunctionalComponent(__VLS_535, new __VLS_535({
        label: "Bitable App Token",
    }));
    const __VLS_537 = __VLS_536({
        label: "Bitable App Token",
    }, ...__VLS_functionalComponentArgsRest(__VLS_536));
    __VLS_538.slots.default;
    const __VLS_539 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_540 = __VLS_asFunctionalComponent(__VLS_539, new __VLS_539({
        modelValue: (__VLS_ctx.resourceForm.app_token),
    }));
    const __VLS_541 = __VLS_540({
        modelValue: (__VLS_ctx.resourceForm.app_token),
    }, ...__VLS_functionalComponentArgsRest(__VLS_540));
    var __VLS_538;
    const __VLS_543 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_544 = __VLS_asFunctionalComponent(__VLS_543, new __VLS_543({
        label: "数据表 ID",
    }));
    const __VLS_545 = __VLS_544({
        label: "数据表 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_544));
    __VLS_546.slots.default;
    const __VLS_547 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_548 = __VLS_asFunctionalComponent(__VLS_547, new __VLS_547({
        modelValue: (__VLS_ctx.resourceForm.table_id),
    }));
    const __VLS_549 = __VLS_548({
        modelValue: (__VLS_ctx.resourceForm.table_id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_548));
    var __VLS_546;
    const __VLS_551 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_552 = __VLS_asFunctionalComponent(__VLS_551, new __VLS_551({
        label: "视图 ID",
    }));
    const __VLS_553 = __VLS_552({
        label: "视图 ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_552));
    __VLS_554.slots.default;
    const __VLS_555 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_556 = __VLS_asFunctionalComponent(__VLS_555, new __VLS_555({
        modelValue: (__VLS_ctx.resourceForm.view_id),
    }));
    const __VLS_557 = __VLS_556({
        modelValue: (__VLS_ctx.resourceForm.view_id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_556));
    var __VLS_554;
}
if (__VLS_ctx.resourceForm.object_type === 'API_OBJECT') {
    const __VLS_559 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_560 = __VLS_asFunctionalComponent(__VLS_559, new __VLS_559({
        contentPosition: "left",
    }));
    const __VLS_561 = __VLS_560({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_560));
    __VLS_562.slots.default;
    var __VLS_562;
    const __VLS_563 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_564 = __VLS_asFunctionalComponent(__VLS_563, new __VLS_563({
        label: "默认对象路径",
    }));
    const __VLS_565 = __VLS_564({
        label: "默认对象路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_564));
    __VLS_566.slots.default;
    const __VLS_567 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_568 = __VLS_asFunctionalComponent(__VLS_567, new __VLS_567({
        modelValue: (__VLS_ctx.resourceForm.api_path),
        placeholder: "/v1/resources",
    }));
    const __VLS_569 = __VLS_568({
        modelValue: (__VLS_ctx.resourceForm.api_path),
        placeholder: "/v1/resources",
    }, ...__VLS_functionalComponentArgsRest(__VLS_568));
    var __VLS_566;
}
const __VLS_571 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_572 = __VLS_asFunctionalComponent(__VLS_571, new __VLS_571({
    contentPosition: "left",
}));
const __VLS_573 = __VLS_572({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_572));
__VLS_574.slots.default;
var __VLS_574;
const __VLS_575 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_576 = __VLS_asFunctionalComponent(__VLS_575, new __VLS_575({
    label: "凭证认证方式",
}));
const __VLS_577 = __VLS_576({
    label: "凭证认证方式",
}, ...__VLS_functionalComponentArgsRest(__VLS_576));
__VLS_578.slots.default;
const __VLS_579 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_580 = __VLS_asFunctionalComponent(__VLS_579, new __VLS_579({
    modelValue: (__VLS_ctx.resourceForm.credential_auth_type),
    ...{ style: {} },
}));
const __VLS_581 = __VLS_580({
    modelValue: (__VLS_ctx.resourceForm.credential_auth_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_580));
__VLS_582.slots.default;
const __VLS_583 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_584 = __VLS_asFunctionalComponent(__VLS_583, new __VLS_583({
    label: "HMAC-SHA256 时间戳签名",
    value: "hmac_sha256_timestamped",
}));
const __VLS_585 = __VLS_584({
    label: "HMAC-SHA256 时间戳签名",
    value: "hmac_sha256_timestamped",
}, ...__VLS_functionalComponentArgsRest(__VLS_584));
const __VLS_587 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_588 = __VLS_asFunctionalComponent(__VLS_587, new __VLS_587({
    label: "App Key / Secret",
    value: "app_key_secret",
}));
const __VLS_589 = __VLS_588({
    label: "App Key / Secret",
    value: "app_key_secret",
}, ...__VLS_functionalComponentArgsRest(__VLS_588));
const __VLS_591 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_592 = __VLS_asFunctionalComponent(__VLS_591, new __VLS_591({
    label: "Bearer Token",
    value: "bearer",
}));
const __VLS_593 = __VLS_592({
    label: "Bearer Token",
    value: "bearer",
}, ...__VLS_functionalComponentArgsRest(__VLS_592));
const __VLS_595 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_596 = __VLS_asFunctionalComponent(__VLS_595, new __VLS_595({
    label: "无认证",
    value: "none",
}));
const __VLS_597 = __VLS_596({
    label: "无认证",
    value: "none",
}, ...__VLS_functionalComponentArgsRest(__VLS_596));
var __VLS_582;
var __VLS_578;
const __VLS_599 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_600 = __VLS_asFunctionalComponent(__VLS_599, new __VLS_599({
    label: "必需密钥",
}));
const __VLS_601 = __VLS_600({
    label: "必需密钥",
}, ...__VLS_functionalComponentArgsRest(__VLS_600));
__VLS_602.slots.default;
const __VLS_603 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_604 = __VLS_asFunctionalComponent(__VLS_603, new __VLS_603({
    modelValue: (__VLS_ctx.resourceForm.required_secret_keys),
    placeholder: "多个密钥以逗号分隔",
}));
const __VLS_605 = __VLS_604({
    modelValue: (__VLS_ctx.resourceForm.required_secret_keys),
    placeholder: "多个密钥以逗号分隔",
}, ...__VLS_functionalComponentArgsRest(__VLS_604));
var __VLS_602;
const __VLS_607 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_608 = __VLS_asFunctionalComponent(__VLS_607, new __VLS_607({
    label: "允许多个对象",
}));
const __VLS_609 = __VLS_608({
    label: "允许多个对象",
}, ...__VLS_functionalComponentArgsRest(__VLS_608));
__VLS_610.slots.default;
const __VLS_611 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_612 = __VLS_asFunctionalComponent(__VLS_611, new __VLS_611({
    modelValue: (__VLS_ctx.resourceForm.object_multiple),
}));
const __VLS_613 = __VLS_612({
    modelValue: (__VLS_ctx.resourceForm.object_multiple),
}, ...__VLS_functionalComponentArgsRest(__VLS_612));
var __VLS_610;
const __VLS_615 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_616 = __VLS_asFunctionalComponent(__VLS_615, new __VLS_615({
    label: "对象必填字段",
}));
const __VLS_617 = __VLS_616({
    label: "对象必填字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_616));
__VLS_618.slots.default;
const __VLS_619 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_620 = __VLS_asFunctionalComponent(__VLS_619, new __VLS_619({
    modelValue: (__VLS_ctx.resourceForm.required_object_fields),
    placeholder: "多个字段以逗号分隔",
}));
const __VLS_621 = __VLS_620({
    modelValue: (__VLS_ctx.resourceForm.required_object_fields),
    placeholder: "多个字段以逗号分隔",
}, ...__VLS_functionalComponentArgsRest(__VLS_620));
var __VLS_618;
if (__VLS_ctx.resourceForm.object_type === 'EVENT_TYPE') {
    const __VLS_623 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_624 = __VLS_asFunctionalComponent(__VLS_623, new __VLS_623({
        label: "事件定义来源",
    }));
    const __VLS_625 = __VLS_624({
        label: "事件定义来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_624));
    __VLS_626.slots.default;
    const __VLS_627 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_628 = __VLS_asFunctionalComponent(__VLS_627, new __VLS_627({
        modelValue: (__VLS_ctx.resourceForm.event_definition_source_system_type),
        placeholder: "如 COST_ALLOCATION_SYSTEM",
    }));
    const __VLS_629 = __VLS_628({
        modelValue: (__VLS_ctx.resourceForm.event_definition_source_system_type),
        placeholder: "如 COST_ALLOCATION_SYSTEM",
    }, ...__VLS_functionalComponentArgsRest(__VLS_628));
    var __VLS_626;
    const __VLS_631 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_632 = __VLS_asFunctionalComponent(__VLS_631, new __VLS_631({
        label: "允许事件编码",
    }));
    const __VLS_633 = __VLS_632({
        label: "允许事件编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_632));
    __VLS_634.slots.default;
    const __VLS_635 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_636 = __VLS_asFunctionalComponent(__VLS_635, new __VLS_635({
        modelValue: (__VLS_ctx.resourceForm.event_definition_codes),
        placeholder: "留空表示该来源全部已发布事件；多个编码以逗号分隔",
    }));
    const __VLS_637 = __VLS_636({
        modelValue: (__VLS_ctx.resourceForm.event_definition_codes),
        placeholder: "留空表示该来源全部已发布事件；多个编码以逗号分隔",
    }, ...__VLS_functionalComponentArgsRest(__VLS_636));
    var __VLS_634;
    const __VLS_639 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_640 = __VLS_asFunctionalComponent(__VLS_639, new __VLS_639({
        label: "默认事件对象",
    }));
    const __VLS_641 = __VLS_640({
        label: "默认事件对象",
    }, ...__VLS_functionalComponentArgsRest(__VLS_640));
    __VLS_642.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "default-events" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "default-events__toolbar" },
    });
    const __VLS_643 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_644 = __VLS_asFunctionalComponent(__VLS_643, new __VLS_643({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_645 = __VLS_644({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_644));
    let __VLS_647;
    let __VLS_648;
    let __VLS_649;
    const __VLS_650 = {
        onClick: (__VLS_ctx.addDefaultEventObject)
    };
    __VLS_646.slots.default;
    var __VLS_646;
    const __VLS_651 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_652 = __VLS_asFunctionalComponent(__VLS_651, new __VLS_651({
        data: (__VLS_ctx.resourceForm.default_event_objects),
        size: "small",
        border: true,
    }));
    const __VLS_653 = __VLS_652({
        data: (__VLS_ctx.resourceForm.default_event_objects),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_652));
    __VLS_654.slots.default;
    const __VLS_655 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_656 = __VLS_asFunctionalComponent(__VLS_655, new __VLS_655({
        label: "对象编码",
        minWidth: "145",
    }));
    const __VLS_657 = __VLS_656({
        label: "对象编码",
        minWidth: "145",
    }, ...__VLS_functionalComponentArgsRest(__VLS_656));
    __VLS_658.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_658.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_659 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_660 = __VLS_asFunctionalComponent(__VLS_659, new __VLS_659({
            modelValue: (row.object_code),
        }));
        const __VLS_661 = __VLS_660({
            modelValue: (row.object_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_660));
    }
    var __VLS_658;
    const __VLS_663 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_664 = __VLS_asFunctionalComponent(__VLS_663, new __VLS_663({
        label: "事件名称",
        minWidth: "125",
    }));
    const __VLS_665 = __VLS_664({
        label: "事件名称",
        minWidth: "125",
    }, ...__VLS_functionalComponentArgsRest(__VLS_664));
    __VLS_666.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_666.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_667 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_668 = __VLS_asFunctionalComponent(__VLS_667, new __VLS_667({
            modelValue: (row.object_name),
        }));
        const __VLS_669 = __VLS_668({
            modelValue: (row.object_name),
        }, ...__VLS_functionalComponentArgsRest(__VLS_668));
    }
    var __VLS_666;
    const __VLS_671 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_672 = __VLS_asFunctionalComponent(__VLS_671, new __VLS_671({
        label: "事件定义编码",
        minWidth: "190",
    }));
    const __VLS_673 = __VLS_672({
        label: "事件定义编码",
        minWidth: "190",
    }, ...__VLS_functionalComponentArgsRest(__VLS_672));
    __VLS_674.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_674.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_675 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_676 = __VLS_asFunctionalComponent(__VLS_675, new __VLS_675({
            modelValue: (row.event_definition_code),
            placeholder: "allocation_period.locked",
        }));
        const __VLS_677 = __VLS_676({
            modelValue: (row.event_definition_code),
            placeholder: "allocation_period.locked",
        }, ...__VLS_functionalComponentArgsRest(__VLS_676));
    }
    var __VLS_674;
    const __VLS_679 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_680 = __VLS_asFunctionalComponent(__VLS_679, new __VLS_679({
        label: "操作",
        width: "70",
    }));
    const __VLS_681 = __VLS_680({
        label: "操作",
        width: "70",
    }, ...__VLS_functionalComponentArgsRest(__VLS_680));
    __VLS_682.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_682.slots;
        const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_683 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_684 = __VLS_asFunctionalComponent(__VLS_683, new __VLS_683({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_685 = __VLS_684({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_684));
        let __VLS_687;
        let __VLS_688;
        let __VLS_689;
        const __VLS_690 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.resourceForm.object_type === 'EVENT_TYPE'))
                    return;
                __VLS_ctx.resourceForm.default_event_objects.splice($index, 1);
            }
        };
        __VLS_686.slots.default;
        var __VLS_686;
    }
    var __VLS_682;
    var __VLS_654;
    var __VLS_642;
}
const __VLS_691 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_692 = __VLS_asFunctionalComponent(__VLS_691, new __VLS_691({
    label: "实例允许覆盖",
}));
const __VLS_693 = __VLS_692({
    label: "实例允许覆盖",
}, ...__VLS_functionalComponentArgsRest(__VLS_692));
__VLS_694.slots.default;
const __VLS_695 = {}.ElCheckboxGroup;
/** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
// @ts-ignore
const __VLS_696 = __VLS_asFunctionalComponent(__VLS_695, new __VLS_695({
    modelValue: (__VLS_ctx.resourceForm.allowed_override_fields),
}));
const __VLS_697 = __VLS_696({
    modelValue: (__VLS_ctx.resourceForm.allowed_override_fields),
}, ...__VLS_functionalComponentArgsRest(__VLS_696));
__VLS_698.slots.default;
const __VLS_699 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_700 = __VLS_asFunctionalComponent(__VLS_699, new __VLS_699({
    label: "credential_id",
}));
const __VLS_701 = __VLS_700({
    label: "credential_id",
}, ...__VLS_functionalComponentArgsRest(__VLS_700));
__VLS_702.slots.default;
var __VLS_702;
if (__VLS_ctx.resourceForm.object_type === 'EVENT_TYPE') {
    const __VLS_703 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_704 = __VLS_asFunctionalComponent(__VLS_703, new __VLS_703({
        label: "protocol.ingress.rate_limit_per_minute",
    }));
    const __VLS_705 = __VLS_704({
        label: "protocol.ingress.rate_limit_per_minute",
    }, ...__VLS_functionalComponentArgsRest(__VLS_704));
    __VLS_706.slots.default;
    var __VLS_706;
}
if (__VLS_ctx.resourceForm.object_type === 'EVENT_TYPE') {
    const __VLS_707 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_708 = __VLS_asFunctionalComponent(__VLS_707, new __VLS_707({
        label: "protocol.ingress.rate_limit_burst",
    }));
    const __VLS_709 = __VLS_708({
        label: "protocol.ingress.rate_limit_burst",
    }, ...__VLS_functionalComponentArgsRest(__VLS_708));
    __VLS_710.slots.default;
    var __VLS_710;
}
var __VLS_698;
var __VLS_694;
var __VLS_286;
{
    const { footer: __VLS_thisSlot } = __VLS_274.slots;
    const __VLS_711 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_712 = __VLS_asFunctionalComponent(__VLS_711, new __VLS_711({
        ...{ 'onClick': {} },
    }));
    const __VLS_713 = __VLS_712({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_712));
    let __VLS_715;
    let __VLS_716;
    let __VLS_717;
    const __VLS_718 = {
        onClick: (...[$event]) => {
            __VLS_ctx.resourceEditorVisible = false;
        }
    };
    __VLS_714.slots.default;
    var __VLS_714;
    const __VLS_719 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_720 = __VLS_asFunctionalComponent(__VLS_719, new __VLS_719({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_721 = __VLS_720({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_720));
    let __VLS_723;
    let __VLS_724;
    let __VLS_725;
    const __VLS_726 = {
        onClick: (__VLS_ctx.saveResourceTemplate)
    };
    __VLS_722.slots.default;
    var __VLS_722;
}
var __VLS_274;
/** @type {__VLS_StyleScopedClasses['page']} */ ;
/** @type {__VLS_StyleScopedClasses['head']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['section-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['default-events']} */ ;
/** @type {__VLS_StyleScopedClasses['default-events__toolbar']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PackageOperations: PackageOperations,
            loading: loading,
            drawerVisible: drawerVisible,
            resourceEditorVisible: resourceEditorVisible,
            resourceTemplateImpact: resourceTemplateImpact,
            activeTab: activeTab,
            activePackage: activePackage,
            systemForm: systemForm,
            resourceForm: resourceForm,
            systemPackages: systemPackages,
            activeResourceTemplates: activeResourceTemplates,
            drawerTitle: drawerTitle,
            detectedProfileLabel: detectedProfileLabel,
            categoryLabel: categoryLabel,
            resourceSummary: resourceSummary,
            configurationProfileLabel: configurationProfileLabel,
            createSystemPackage: createSystemPackage,
            manage: manage,
            saveSystemPackage: saveSystemPackage,
            applyObjectType: applyObjectType,
            addDefaultEventObject: addDefaultEventObject,
            openResourceEditor: openResourceEditor,
            saveResourceTemplate: saveResourceTemplate,
            publish: publish,
            reloadActivePackage: reloadActivePackage,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
