/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime, toUtcNaive } from '@/utils/datetime';
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowRight, CircleCheck, Connection, DocumentRemove, Key, Loading, Plus, Search, } from '@element-plus/icons-vue';
import { ucpApi, monitorApi } from '@/api/ucp';
import { datasourcesApi } from '@/api/datasources';
import SchemaFormField from '../components/SchemaFormField.vue';
import CredentialForm from '../components/CredentialForm.vue';
import SystemCard from '../components/SystemCard.vue';
const searchKw = ref('');
const loading = ref(false);
const submitting = ref(false);
const router = useRouter();
const systems = ref([]);
const overviewMap = ref({});
const resourcesMap = ref({});
const credentials = ref([]);
// ── Phase 5-4: schema 驱动配置 ──
const connectorTypes = ref([]);
// 抽屉（编辑已有资源）
const editSchema = ref(null);
const editFormValues = ref({});
// 添加资源对话框 / 向导 step 3 共享
const addSchema = ref(null);
const addFormValues = ref({});
// schema 字段类型判别与占位符已抽到 components/SchemaFormField.vue
// 这里仅保留: 8 个 category 落库映射 + formValues 重组
// 把 schema 摊平到一个嵌套结构 {category_key: {field_name: default}}
function initFormValuesFromSchema(cats) {
    const out = {};
    for (const cat of cats) {
        out[cat.key] = {};
        for (const f of cat.fields) {
            out[cat.key][f.name] = f.default !== undefined ? f.default : '';
        }
    }
    return out;
}
// 反向:把 formValues 还原成 {category_key: {field_name: value}} JSON
function flattenFormToJson(cats, form) {
    const out = {};
    for (const cat of cats) {
        const inner = {};
        for (const f of cat.fields) {
            const v = form[cat.key]?.[f.name];
            // 跳过空值(可选字段未填)
            if (v === '' || v === null || v === undefined)
                continue;
            inner[f.name] = v;
        }
        if (Object.keys(inner).length > 0)
            out[cat.key] = inner;
    }
    return out;
}
// 把 schema 映射到 8 个 JSON 字段后端 key
const CATEGORY_TO_DB_FIELD = {
    protocol: 'protocol',
    report: 'report_config',
    mapping: 'mapping_config',
    file: 'file_config',
    scheduling: 'scheduling',
    notification: 'notification_config',
    retry: 'retry_config',
    circuit_breaker: 'circuit_breaker_config',
};
// 把扁平化的 category→fields 重组为 8 个 JSON 字段
function buildBackendJsonFields(payload) {
    const out = {};
    for (const [catKey, fields] of Object.entries(payload)) {
        const dbField = CATEGORY_TO_DB_FIELD[catKey] || `${catKey}_config`;
        if (Object.keys(fields).length > 0)
            out[dbField] = fields;
    }
    return out;
}
async function loadConnectorTypes() {
    try {
        const items = await datasourcesApi.types('ucp');
        connectorTypes.value = (items || []).filter((item) => item.connection_kind === 'DATA_OBJECT' || item.connection_kind === 'EVENT_INGRESS');
    }
    catch (_e) {
        connectorTypes.value = [];
    }
}
function connectorLabel(code) {
    return connectorTypes.value.find((item) => item.code === code)?.label || code || '旧版资源';
}
function connectorObjectLabel(code) {
    return connectorTypes.value.find((item) => item.code === code)?.object_label || '数据对象';
}
async function loadAdapterSchema(code) {
    if (!code)
        return [];
    try {
        const res = await ucpApi.adapterSchema(code);
        return (res?.categories || []);
    }
    catch {
        return [];
    }
}
async function onAddAdapterChange(code) {
    const cats = await loadAdapterSchema(code || null);
    addSchema.value = cats.length > 0 ? { categories: cats } : null;
    addFormValues.value = initFormValuesFromSchema(cats);
}
async function onAddConnectorChange(_code) {
    addSchema.value = null;
    addFormValues.value = {};
}
async function onEditAdapterChange(code) {
    const cats = await loadAdapterSchema(code || null);
    editSchema.value = cats.length > 0 ? { categories: cats } : null;
    editFormValues.value = initFormValuesFromSchema(cats);
    // 如果正在编辑的资源已有该 category 的 JSON 数据,反填到 form
    if (activeResource.value) {
        const r = activeResource.value;
        const prefill = (key, dbField) => {
            if (cats.find((c) => c.key === key) && r[dbField]) {
                for (const [k, v] of Object.entries(r[dbField])) {
                    if (k in editFormValues.value[key])
                        editFormValues.value[key][k] = v;
                }
            }
        };
        prefill('protocol', 'protocol');
        prefill('report', 'report_config');
        prefill('mapping', 'mapping_config');
        prefill('file', 'file_config');
        prefill('scheduling', 'scheduling');
        prefill('notification', 'notification_config');
        prefill('retry', 'retry_config');
        prefill('circuit_breaker', 'circuit_breaker_config');
    }
}
async function onEditConnectorChange(_code) {
    editSchema.value = null;
    editFormValues.value = {};
}
// 系统详情抽屉
const drawerOpen = ref(false);
const activeSystem = ref(null);
const systemCredentials = ref([]);
const systemCapabilities = ref([]);
const capabilityTestVisible = ref(false);
const capabilityUnderTest = ref(null);
const capabilityTestParameters = ref({});
const capabilityTestFields = computed(() => capabilityUnderTest.value?.input_parameters || []);
const capabilityTestResultVisible = ref(false);
const capabilityResultTab = ref('current');
const capabilityTestResult = ref(null);
const capabilityTestHistory = ref([]);
const capabilityTestHistoryLoading = ref(false);
const capabilityResultRows = computed(() => capabilityTestResult.value?.response_summary?.rows || []);
const credentialEditVisible = ref(false);
const credentialEditForm = ref({});
const currentEditCredentialFields = computed(() => AUTH_FIELDS[credentialEditForm.value.auth_type] || []);
const webhookIngressForm = ref({ rate_limit_per_minute: 120, rate_limit_burst: 10 });
const webhookVerifying = ref(false);
const webhookOverrideEditing = ref(false);
async function verifyWebhookResource() { if (!activeResource.value)
    return; webhookVerifying.value = true; try {
    const result = await ucpApi.verifyWebhookResource(activeResource.value.id);
    activeResource.value.test_status = result.test_status || 'PASS';
    ElMessage.success('Webhook 资源验证通过');
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || 'Webhook 资源验证失败');
}
finally {
    webhookVerifying.value = false;
} }
function webhookUrl(resource) { return `${window.location.origin}/api/v1/ucp/webhooks/resources/${resource?.resource_code || ''}`; }
async function copyWebhookUrl(resource) { await navigator.clipboard?.writeText(webhookUrl(resource)); ElMessage.success('接收地址已复制'); }
async function openResourceTemplateConfig() { const code = activeResource.value?.resource_template_code; if (!code) {
    ElMessage.warning('历史资源未记录来源模板');
    return;
} ; try {
    const template = await ucpApi.connectorPackage(code);
    const ingress = template.system_schema?.resource_defaults?.protocol?.ingress || {};
    const message = '模板：' + template.package_name + ' v' + template.version + '<br/>验签策略：' + (ingress.verification_strategy || '-') + '<br/>签名 Header：' + (ingress.signature_header || '-') + '<br/>事件类型路径：' + (ingress.event_type_path || '-') + '<br/>允许实例覆盖：' + ((template.system_schema?.instance_override_policy?.allowed_fields || []).join('、') || '无');
    await ElMessageBox.alert(message, '资源模板配置', { dangerouslyUseHTMLString: true, confirmButtonText: '关闭' });
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '读取资源模板失败');
} }
const resourceDrawerOpen = ref(false);
const activeResource = ref(null);
const bitableTables = ref([]);
const bitableTablesLoading = ref(false);
const bitableDialogVisible = ref(false);
const bitableSaving = ref(false);
const editingBitableTable = ref(null);
const bitableForm = ref({ object_code: '', object_name: '', app_token: '', table_id: '', view_id: '', field_mapping: '{}', page_size: 100, max_records: 10000, is_active: true });
const bitablePreview = ref(null);
const dataObjects = ref([]);
const dataObjectDialogVisible = ref(false);
const dataObjectSaving = ref(false);
const editingDataObject = ref(null);
const dataObjectForm = ref({ object_code: '', object_name: '', report_id: '', object_config: '{}', field_mapping: '{}', is_active: true });
const eventObjects = ref([]);
const eventDefinitions = ref([]);
const eventObjectDialogVisible = ref(false);
const eventObjectSaving = ref(false);
const editingEventObject = ref(null);
const eventObjectForm = ref({ object_code: '', object_name: '', event_definition_id: null, is_active: true });
const objectConfigTitle = computed(() => {
    const type = activeResource.value?.connector_type;
    return type === 'feishu_sheet' ? '表格配置' : type === 'feishu_bitable' ? '多维表格配置' : type === 'beisen_report' ? '报表配置' : '对象配置';
});
const objectConfigPlaceholder = computed(() => {
    const type = activeResource.value?.connector_type;
    if (type === 'feishu_sheet')
        return '{ "source_url": "飞书链接", "sheet_id": "可选", "range": "A1:ZZ10000" }';
    if (type === 'feishu_bitable')
        return '{ "app_token": "appxxx", "table_id": "tblxxx", "view_id": "可选" }';
    if (type === 'beisen_report')
        return '{ "report_id": "报表ID", "data_url": "报表地址", "method": "POST", "body_template": {} }';
    return '{}';
});
// Phase 6-3: 反向引用状态
const usingPipelines = ref(null);
const usingPipelinesLoading = ref(false);
const resourceEditForm = ref({});
// 添加系统向导
const showAddSystem = ref(false);
const wizardStep = ref(1);
const connectorPackages = ref([]);
const selectedConnectorCategory = ref('STANDARD_SAAS');
const selectedPackageCode = ref('');
watch(selectedConnectorCategory, () => {
    selectedPackageCode.value = '';
    selectedOperationIds.value = [];
    void loadConnectorPackages();
});
const selectedOperationIds = ref([]);
const usesCapabilityPackage = computed(() => ['STANDARD_SAAS', 'CONTROLLED_API'].includes(selectedPackage.value?.category));
const requiresResourceSetup = computed(() => !usesCapabilityPackage.value);
const selectedPackage = computed(() => connectorPackages.value.find((item) => item.package_code === selectedPackageCode.value));
const selectedPackageOperations = computed(() => selectedPackage.value?.operations || []);
const packageOptionLabel = (item) => `${item.package_name}${item.category === 'STANDARD_SAAS' ? '??? SaaS?' : '?????? API?'}`;
const wizardSteps = computed(() => usesCapabilityPackage.value ? ['系统信息', '第一套凭证', '启用业务能力', '配置检查'] : ['系统信息', '第一套凭证', '添加资源', '配置检查']);
const wizardTitle = computed(() => `添加业务系统 — 第 ${wizardStep.value}/4 步：${wizardSteps.value[wizardStep.value - 1]}`);
const pendingSystemId = ref(null);
const pendingCredId = ref(null);
const systemForm = ref({
    system_code: '',
    system_name: '',
    system_type: 'HR_SAAS',
    owner: '',
    domain: '',
    description: '',
    tagsStr: '',
    sensitivity: 'internal',
    instance_config: {},
});
// 添加资源
const showAddResource = ref(false);
const addResourceSystem = ref(null);
const resourceForm = ref({
    resource_template_code: '',
    resource_code: '',
    resource_name: '',
    connector_type: '',
    credential_id: null,
});
const resourceTemplates = ref([]);
// 凭证（向导第 2 步复用）
const showSecret = ref(false);
const credForm = ref({
    credential_code: '',
    credential_name: '',
    auth_type: 'api_key',
    env_tag: 'prod',
    description: '',
    expires_at: '',
    remind_before_days: 7,
    secrets: {},
});
// 向导 Step 3: 资源列表（每加一个即时刷新；跳过则为空）
const wizardResources = ref([]);
// 标志位:当前 addResource 流程是否由向导 Step 3 触发
const addResourceFromWizardFlag = ref(false);
const AUTH_FIELDS = {
    hmac_sha256_timestamped: [{ key: 'signing_secret', label: '签名密钥' }],
    api_key: [
        { key: 'app_id', label: 'app_id' },
        { key: 'app_secret', label: 'app_secret' },
    ],
    basic: [
        { key: 'username', label: 'username' },
        { key: 'password', label: 'password' },
    ],
    oauth2: [
        { key: 'client_id', label: 'client_id' },
        { key: 'client_secret', label: 'client_secret' },
        { key: 'authorize_url', label: 'authorize_url' },
        { key: 'token_url', label: 'token_url' },
    ],
    token: [{ key: 'token', label: 'token' }],
    app_key_secret: [
        { key: 'app_id', label: 'App ID' },
        { key: 'app_secret', label: 'App Secret' },
    ],
    none: [],
};
const currentSystemFields = computed(() => {
    const fields = selectedPackage.value?.system_schema?.fields;
    return Array.isArray(fields) ? fields.filter((field) => field?.key) : [];
});
const currentCredFields = computed(() => {
    const packageSchema = selectedPackage.value?.auth_policy?.credential_schema;
    if (Array.isArray(packageSchema) && packageSchema.length > 0) {
        return packageSchema.filter((field) => field.required !== false).map((field) => ({ key: field.key, label: field.label || field.key }));
    }
    const systemCode = String(systemForm.value.system_code || '').toUpperCase();
    const systemName = String(systemForm.value.system_name || '');
    if (systemCode.includes('BEISEN') || systemName.includes('北森')) {
        return [
            { key: 'BEISEN_APP_KEY', label: '北森 AppKey' },
            { key: 'BEISEN_APP_SECRET', label: '北森 AppSecret' },
        ];
    }
    return AUTH_FIELDS[credForm.value.auth_type] || [];
});
watch(() => credForm.value.auth_type, (n, o) => {
    if (n !== o)
        credForm.value.secrets = {};
});
const filteredSystems = computed(() => {
    const kw = searchKw.value.trim().toLowerCase();
    if (!kw)
        return systems.value;
    return systems.value.filter((s) => (s.system_code || '').toLowerCase().includes(kw) ||
        (s.system_name || '').toLowerCase().includes(kw));
});
/* ── 系统详情抽屉 ── */
const detailTab = ref('overview');
const detailPipelines = ref([]);
const detailExecutions = ref([]);
const detailAuditLogs = ref([]);
function resourcesOf(sysId) {
    return resourcesMap.value[sysId] || [];
}
function execStatusColor(status) {
    const map = { SUCCESS: 'success', FAILED: 'danger', PARTIAL_SUCCESS: 'warning', RUNNING: '', PENDING: 'info' };
    return map[status] || 'info';
}
/* ── KPI 卡片统计 ── */
const kpi = ref({
    systemCount: 0,
    systemActiveCount: 0,
    resourceCount: 0,
    resourceActiveCount: 0,
    resourceInactiveCount: 0,
    credCount: 0,
    credPrimaryCount: 0,
    credBackupCount: 0,
    alertCount: 0,
    // 来自 monitor/summary
    pipelineTotal: 0,
    pipelineRunning: 0,
    syncCount24h: 0,
    failRate: 0,
});
const inactiveSystemCount = computed(() => Math.max(0, kpi.value.systemCount - kpi.value.systemActiveCount));
const abnormalSystemCount = computed(() => systems.value.filter(s => {
    const h = overviewMap.value[s.id]?.health_status;
    return h === 'failing' || h === 'blocked' || h === 'offline';
}).length);
const credentialRiskCount = computed(() => {
    const allCreds = Object.values(credentialsBySystem.value).flat();
    const missingCredSystems = systems.value.filter((s) => systemCredentialsOf(s.id).length === 0).length;
    const syntheticExpiryRisks = allCreds.filter((c) => /expire|expired|过期|即将/i.test(`${c.status || ''} ${c.description || ''} ${c.credential_name || ''}`)).length;
    return Math.max(syntheticExpiryRisks, missingCredSystems);
});
const credentialHealthText = computed(() => `${Math.max(0, kpi.value.credCount - credentialRiskCount.value)}/${kpi.value.credCount || 0}`);
const healthySystemCount = computed(() => systems.value.filter((s) => systemHealth(s) === 'ok').length);
const platformHealthScore = computed(() => Math.max(72, Math.min(99, 96 - credentialRiskCount.value * 3 - kpi.value.alertCount)));
function recomputeKpi() {
    kpi.value.systemCount = systems.value.length;
    kpi.value.systemActiveCount = systems.value.filter((s) => s.is_active).length;
    kpi.value.resourceCount = Object.values(resourcesMap.value).reduce((a, list) => a + (list?.length || 0), 0);
    const allRes = Object.values(resourcesMap.value).flat();
    kpi.value.resourceActiveCount = allRes.filter((r) => r.status === 1).length;
    kpi.value.resourceInactiveCount = allRes.filter((r) => r.status === 2).length;
    // 凭证统计
    const allCreds = Object.values(credentialsBySystem.value).flat();
    kpi.value.credCount = allCreds.length;
    kpi.value.credPrimaryCount = allCreds.filter((c) => c.is_primary).length;
    kpi.value.credBackupCount = kpi.value.credCount - kpi.value.credPrimaryCount;
}
/* ── 系统健康状态色点 (蓝本 v2 借鉴) ── */
function systemHealth(sys) {
    const res = systemResources(sys.id);
    const creds = systemCredentialsOf(sys.id);
    if (res.length === 0)
        return 'unconfigured';
    if (creds.length === 0)
        return 'warn';
    if (!sys.is_active)
        return 'offline';
    return 'ok';
}
// 注: iconColor 迁至 SystemCard 组件 (按 system_type 哈希分配色块)
function systemResources(id) {
    return resourcesMap.value[id] || [];
}
// 系统下凭证列表(从已经拉过的 systemDetail 中汇总)
const credentialsBySystem = ref({});
function systemCredentialsOf(sysId) {
    return credentialsBySystem.value[sysId] || [];
}
async function load() {
    loading.value = true;
    try {
        const sysRes = await ucpApi.systems();
        systems.value = sysRes.items || [];
        // 系统聚合概览（流水线数、24h同步、成功率）
        try {
            const ovRes = await ucpApi.systemsOverview();
            const ovMap = {};
            for (const item of ovRes.items) {
                ovMap[item.system_id] = item;
            }
            overviewMap.value = ovMap;
        }
        catch {
            overviewMap.value = {};
        }
        // 并行拉所有系统的资源 + 凭证
        const resourcePromises = systems.value.map((s) => ucpApi.resources({ system_id: s.id }).catch(() => ({ items: [] })));
        const credPromises = systems.value.map((s) => ucpApi.systemDetail(s.id).catch(() => ({ credentials: [] })));
        const [resourceResults, credResults] = await Promise.all([
            Promise.all(resourcePromises),
            Promise.all(credPromises),
        ]);
        const rMap = {};
        const cMap = {};
        systems.value.forEach((s, i) => {
            rMap[s.id] = resourceResults[i]?.items || [];
            cMap[s.id] = credResults[i]?.credentials || [];
        });
        resourcesMap.value = rMap;
        credentialsBySystem.value = cMap;
        // 凭证全量列表(供下拉)
        const credRes = await ucpApi.credentials().catch(() => ({ items: [] }));
        credentials.value = credRes.items || [];
        recomputeKpi();
        // 告警 & 流水线统计 (蓝本 KPI 第 4-6 卡)
        try {
            const [alerts, summary] = await Promise.all([
                monitorApi.alerts(50),
                monitorApi.summary(24),
            ]);
            kpi.value.alertCount = alerts.length;
            kpi.value.pipelineTotal = summary.pipeline_total;
            kpi.value.pipelineRunning = summary.pipeline_running;
            // syncCount24h from overview aggregation, fallback to monitor summary
            const totalSync = Object.values(overviewMap.value).reduce((sum, ov) => sum + (ov.sync_count_24h || 0), 0);
            kpi.value.syncCount24h = totalSync || summary.pipeline_total;
            kpi.value.failRate = summary.fail_rate;
        }
        catch {
            kpi.value.alertCount = 0;
        }
    }
    catch (_e) {
        ElMessage.error('加载系统列表失败');
    }
    finally {
        loading.value = false;
    }
}
async function openSystem(sys) {
    activeSystem.value = sys;
    systemCredentials.value = [];
    detailTab.value = 'overview';
    detailPipelines.value = [];
    detailExecutions.value = [];
    detailAuditLogs.value = [];
    systemCapabilities.value = [];
    // 拉详情（含凭证）
    try {
        const detail = await ucpApi.systemDetail(sys.id);
        activeSystem.value = { ...sys, ...(detail.system || {}) };
        systemCredentials.value = detail.credentials || [];
        // 同步资源（防止遗漏）
        resourcesMap.value[sys.id] = detail.resources || [];
        systemCapabilities.value = await ucpApi.systemCapabilities(sys.id);
    }
    catch (_e) {
    }
    // 异步加载流水线和执行记录
    loadDetailPipelines(sys.id);
    loadDetailExecutions(sys.id);
    drawerOpen.value = true;
}
async function toggleSystemCapability(capability) {
    if (!activeSystem.value)
        return;
    try {
        await ucpApi.setSystemCapability(activeSystem.value.id, capability.operation_id, {
            credential_id: systemCredentials.value.find((item) => item.is_primary)?.id || systemCredentials.value[0]?.id,
            enabled: !capability.enabled,
        });
        systemCapabilities.value = await ucpApi.systemCapabilities(activeSystem.value.id);
        ElMessage.success(capability.enabled ? '业务能力已停用' : '业务能力已启用');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '更新业务能力失败');
    }
}
function openEditCredential(credential) {
    credentialEditForm.value = { id: credential.id, credential_name: credential.credential_name, env_tag: credential.env_tag || 'prod', auth_type: credential.auth_type, description: credential.description || '', secrets: {} };
    credentialEditVisible.value = true;
}
async function saveCredentialEdit() {
    submitting.value = true;
    try {
        const payload = { ...credentialEditForm.value };
        const fields = currentEditCredentialFields.value;
        const provided = fields.filter((field) => payload.secrets[field.key]?.trim());
        if (provided.length > 0 && provided.length !== fields.length) {
            ElMessage.warning('如需轮换密钥，请完整填写当前认证方式要求的全部密钥字段');
            return;
        }
        if (provided.length === 0)
            delete payload.secrets;
        await ucpApi.updateCredential(payload.id, payload);
        credentialEditVisible.value = false;
        ElMessage.success('凭证已更新');
        if (activeSystem.value)
            await openSystem(activeSystem.value);
        await load();
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '更新凭证失败');
    }
    finally {
        submitting.value = false;
    }
}
function openCapabilityTest(capability) {
    capabilityUnderTest.value = capability;
    capabilityTestParameters.value = Object.fromEntries((capability.input_parameters || []).map((field) => [field.key, '']));
    capabilityTestVisible.value = true;
}
async function submitCapabilityTest() {
    if (!activeSystem.value || !capabilityUnderTest.value)
        return;
    submitting.value = true;
    try {
        const result = await ucpApi.testSystemCapability(activeSystem.value.id, capabilityUnderTest.value.operation_id, capabilityTestParameters.value);
        ElMessage.success(`${result.message}（Trace：${result.trace_id.slice(0, 8)}）`);
        capabilityTestVisible.value = false;
        capabilityTestResult.value = result.test_run || null;
        capabilityResultTab.value = 'current';
        capabilityTestResultVisible.value = true;
        await loadCapabilityTestHistory();
        systemCapabilities.value = await ucpApi.systemCapabilities(activeSystem.value.id);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '能力测试失败');
    }
    finally {
        submitting.value = false;
    }
}
async function loadCapabilityTestHistory() {
    if (!activeSystem.value || !capabilityUnderTest.value)
        return;
    capabilityTestHistoryLoading.value = true;
    try {
        capabilityTestHistory.value = await ucpApi.systemCapabilityTestRuns(activeSystem.value.id, capabilityUnderTest.value.operation_id);
    }
    catch (error) {
        capabilityTestHistory.value = [];
        ElMessage.error(error?.response?.data?.detail || '加载测试记录失败');
    }
    finally {
        capabilityTestHistoryLoading.value = false;
    }
}
async function openCapabilityTestResults(capability) {
    capabilityUnderTest.value = capability;
    capabilityTestResult.value = null;
    capabilityResultTab.value = 'history';
    capabilityTestResultVisible.value = true;
    await loadCapabilityTestHistory();
}
function viewCapabilityTestRun(testRun) {
    capabilityTestResult.value = testRun;
    capabilityResultTab.value = 'current';
}
function objectEntries(row) {
    return Object.entries(row || {});
}
function resultFieldLabel(key) {
    const labels = { application_id: '投递记录 ID', id: 'Offer ID', offer_id: 'Offer ID', offer_status: 'Offer 状态' };
    return labels[key] || key;
}
function displayResultValue(value) {
    return typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '—');
}
async function loadDetailPipelines(sysId) {
    try {
        const res = await ucpApi.pipelines().catch(() => ({ items: [] }));
        // 筛选引用该系统资源的流水线（简化：展示全部启用流水线）
        detailPipelines.value = (res.items || []).filter((p) => p.status === 1 && (p.system_id === sysId || p.resource_system_id === sysId));
    }
    catch {
        detailPipelines.value = [];
    }
}
async function loadDetailExecutions(sysId) {
    try {
        const res = await ucpApi.executions({ limit: 20 }).catch(() => ({ items: [] }));
        detailExecutions.value = res.items || [];
    }
    catch {
        detailExecutions.value = [];
    }
}
async function loadBitableTables(resourceId) {
    bitableTablesLoading.value = true;
    try {
        bitableTables.value = (await ucpApi.bitableTables(resourceId)).items || [];
    }
    catch {
        bitableTables.value = [];
    }
    finally {
        bitableTablesLoading.value = false;
    }
}
function openBitableTableDialog(item) {
    editingBitableTable.value = item || null;
    bitablePreview.value = null;
    bitableForm.value = item ? { ...item, field_mapping: JSON.stringify(item.field_mapping || {}, null, 2) } : { object_code: '', object_name: '', app_token: '', table_id: '', view_id: '', field_mapping: '{}', page_size: 100, max_records: 10000, is_active: true };
    bitableDialogVisible.value = true;
}
async function saveBitableTable() {
    if (!activeResource.value)
        return;
    let mapping = {};
    try {
        mapping = JSON.parse(bitableForm.value.field_mapping || '{}');
    }
    catch {
        ElMessage.error('字段映射必须是合法 JSON 对象');
        return;
    }
    bitableSaving.value = true;
    try {
        const payload = { ...bitableForm.value, field_mapping: mapping };
        if (editingBitableTable.value)
            await ucpApi.updateBitableTable(activeResource.value.id, editingBitableTable.value.id, payload);
        else
            await ucpApi.createBitableTable(activeResource.value.id, payload);
        ElMessage.success('数据对象已保存');
        bitableDialogVisible.value = false;
        await loadBitableTables(activeResource.value.id);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        bitableSaving.value = false;
    }
}
async function removeBitableTable(item) {
    if (!activeResource.value)
        return;
    try {
        await ucpApi.deleteBitableTable(activeResource.value.id, item.id);
        ElMessage.success('数据对象已删除');
        await loadBitableTables(activeResource.value.id);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function previewBitableTable(item) {
    if (!activeResource.value)
        return;
    try {
        bitablePreview.value = await ucpApi.previewBitableTable(activeResource.value.id, item.id);
        ElMessage.success(`预览成功，共 ${bitablePreview.value.row_count} 条`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
}
async function loadDataObjects(resourceId) {
    try {
        dataObjects.value = (await ucpApi.resourceDataObjects(resourceId)).items || [];
    }
    catch {
        dataObjects.value = [];
    }
}
function openDataObjectDialog(item) {
    editingDataObject.value = item || null;
    dataObjectForm.value = item ? { ...item, report_id: item.object_config?.report_id || '', object_config: JSON.stringify(item.object_config || {}, null, 2), field_mapping: JSON.stringify(item.field_mapping || {}, null, 2) } : { object_code: '', object_name: '', report_id: '', object_config: '{}', field_mapping: '{}', is_active: true };
    dataObjectDialogVisible.value = true;
}
async function saveDataObject() {
    if (!activeResource.value)
        return;
    let objectConfig;
    let fieldMapping;
    try {
        objectConfig = activeResource.value.connector_type === 'beisen_report'
            ? { report_id: String(dataObjectForm.value.report_id || '').trim() }
            : JSON.parse(dataObjectForm.value.object_config || '{}');
        fieldMapping = JSON.parse(dataObjectForm.value.field_mapping || '{}');
    }
    catch {
        ElMessage.error('对象配置和字段映射必须是合法 JSON 对象');
        return;
    }
    if (activeResource.value.connector_type === 'beisen_report' && !objectConfig.report_id) {
        ElMessage.warning('请填写 Report ID');
        return;
    }
    dataObjectSaving.value = true;
    try {
        const payload = { ...dataObjectForm.value, object_config: objectConfig, field_mapping: fieldMapping };
        if (editingDataObject.value)
            await ucpApi.updateResourceDataObject(activeResource.value.id, editingDataObject.value.id, payload);
        else
            await ucpApi.createResourceDataObject(activeResource.value.id, payload);
        ElMessage.success('数据对象已保存');
        dataObjectDialogVisible.value = false;
        await loadDataObjects(activeResource.value.id);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        dataObjectSaving.value = false;
    }
}
async function removeDataObject(item) {
    if (!activeResource.value)
        return;
    try {
        await ucpApi.deleteResourceDataObject(activeResource.value.id, item.id);
        ElMessage.success('数据对象已删除');
        await loadDataObjects(activeResource.value.id);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function loadEventObjects(resourceId) { try {
    eventObjects.value = (await ucpApi.resourceObjects(resourceId, { object_type: 'EVENT_TYPE' })).items || [];
    eventDefinitions.value = (await ucpApi.eventDefinitions()).items || [];
}
catch {
    eventObjects.value = [];
    eventDefinitions.value = [];
} }
function openEventObjectDialog(item) { editingEventObject.value = item || null; const { event_config, ...form } = item || {}; eventObjectForm.value = item ? form : { object_code: '', object_name: '', event_definition_id: null, is_active: true }; eventObjectDialogVisible.value = true; }
async function saveEventObject() { if (!activeResource.value || !eventObjectForm.value.event_definition_id) {
    ElMessage.warning('请选择已发布事件定义');
    return;
} ; eventObjectSaving.value = true; try {
    const payload = { ...eventObjectForm.value, object_type: 'EVENT_TYPE' };
    if (editingEventObject.value)
        await ucpApi.updateResourceObject(activeResource.value.id, editingEventObject.value.id, payload);
    else
        await ucpApi.createResourceObject(activeResource.value.id, payload);
    ElMessage.success('事件已保存');
    eventObjectDialogVisible.value = false;
    await loadEventObjects(activeResource.value.id);
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '保存失败');
}
finally {
    eventObjectSaving.value = false;
} }
async function verifyEventObject(item) { if (!activeResource.value)
    return; try {
    await ucpApi.verifyResourceObject(activeResource.value.id, item.id);
    ElMessage.success('事件验证通过');
    await loadEventObjects(activeResource.value.id);
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '事件验证失败');
} }
async function removeEventObject(item) { if (!activeResource.value)
    return; try {
    await ucpApi.deleteResourceObject(activeResource.value.id, item.id);
    ElMessage.success('事件已删除');
    await loadEventObjects(activeResource.value.id);
}
catch (error) {
    ElMessage.error(error?.response?.data?.detail || '删除失败');
} }
async function openResource(sys, res) {
    activeResource.value = res;
    resourceEditForm.value = {
        resource_name: res.resource_name,
        connector_type: res.connector_type,
        credential_id: res.credential_id,
        status: res.status,
    };
    webhookIngressForm.value = { rate_limit_per_minute: res.protocol?.ingress?.rate_limit_per_minute || 120, rate_limit_burst: res.protocol?.ingress?.rate_limit_burst || 10 };
    webhookOverrideEditing.value = false;
    // 触发 schema 加载并反填历史值
    await onEditConnectorChange(res.connector_type);
    resourceDrawerOpen.value = true;
    // Phase 6-3: 反向引用 — 拉取引用此 resource 的流水线
    loadUsingPipelines(res.id);
    if (res.connector_type)
        await loadDataObjects(res.id);
    if (res.connector_type === 'webhook_ingress')
        await loadEventObjects(res.id);
}
async function loadUsingPipelines(resourceId) {
    usingPipelinesLoading.value = true;
    usingPipelines.value = null;
    try {
        usingPipelines.value = await ucpApi.pipelinesUsingResource(resourceId);
    }
    catch (_e) {
        usingPipelines.value = { resource_id: resourceId, total: 0, items: [] };
    }
    finally {
        usingPipelinesLoading.value = false;
    }
}
function triggerTypeColor(t) {
    if (t === 'SCHEDULED')
        return 'primary';
    if (t === 'EVENT')
        return 'warning';
    if (t === 'MANUAL')
        return 'success';
    return 'info';
}
function triggerTypeLabel(t) {
    return { SCHEDULED: '定时', EVENT: '事件', MANUAL: '手动' }[t] || t;
}
function pipelineStatusColor(s) {
    if (s === 1)
        return 'success';
    if (s === 2)
        return 'info';
    return 'warning';
}
function pipelineStatusLabel(s) {
    return { 0: '未启用', 1: '启用', 2: '停用' }[s] || '未知';
}
function goToPipeline(pipelineId) {
    resourceDrawerOpen.value = false;
    router.push({ name: 'UcpPipelineDesigner' });
}
async function addResource(sys) {
    addResourceSystem.value = sys;
    resourceForm.value = {
        resource_template_code: '',
        resource_code: '',
        resource_name: '',
        // 向导 Step 3 触发时,默认凭证 = 刚创建的 pendingCredId
        credential_id: addResourceFromWizardFlag.value && pendingCredId.value ? pendingCredId.value : null,
    };
    // 清空 schema
    addSchema.value = null;
    addFormValues.value = {};
    resourceTemplates.value = [];
    try {
        resourceTemplates.value = await ucpApi.resourceTemplates(sys.id);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || 'Failed to load resource templates');
    }
    // 默认带出该系统已用的凭证
    try {
        const r = await ucpApi.systemDefaultCredential(sys.id);
        if (r.credential_id)
            resourceForm.value.credential_id = r.credential_id;
    }
    catch { }
    showAddResource.value = true;
}
const showEditSystemDialog = ref(false);
const editForm = ref(null);
const editSubmitting = ref(false);
function editSystem(sys) {
    editForm.value = {
        system_name: sys.system_name || '',
        system_type: sys.system_type || 'CUSTOM',
        owner: sys.owner || '',
        domain: sys.domain || '',
        description: sys.description || '',
        tagsStr: Array.isArray(sys.tags) ? sys.tags.join(', ') : '',
        sensitivity: sys.sensitivity || 'internal',
        is_active: (sys.is_active ?? 1),
    };
    showEditSystemDialog.value = true;
}
async function submitEditSystem() {
    if (!editForm.value || !activeSystem.value)
        return;
    editSubmitting.value = true;
    try {
        const tags = editForm.value.tagsStr
            ? editForm.value.tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
            : [];
        await ucpApi.updateSystem(activeSystem.value.id, {
            system_name: editForm.value.system_name,
            system_type: editForm.value.system_type,
            owner: editForm.value.owner,
            domain: editForm.value.domain,
            description: editForm.value.description,
            tags,
            sensitivity: editForm.value.sensitivity,
            is_active: editForm.value.is_active,
        });
        ElMessage.success('系统已更新');
        showEditSystemDialog.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '更新失败');
    }
    finally {
        editSubmitting.value = false;
    }
}
async function confirmDeleteSystem(sys) {
    try {
        await ElMessageBox.confirm(`确定删除系统「${sys.system_name}」？该操作会级联删除其下所有资源。`, '删除确认', { type: 'warning' });
    }
    catch {
        return;
    }
    try {
        await ucpApi.deleteSystem(sys.id);
        ElMessage.success('已删除');
        drawerOpen.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function saveResource() {
    if (!activeResource.value)
        return;
    try {
        // Phase 5-4: 按 schema 把 formValues 重组到 8 个 JSON 字段
        const cats = (editSchema.value?.categories || []);
        const payload = flattenFormToJson(cats, editFormValues.value);
        const jsonFields = buildBackendJsonFields(payload);
        const body = {
            resource_name: resourceEditForm.value.resource_name,
            credential_id: resourceEditForm.value.credential_id,
            status: resourceEditForm.value.status,
            ...jsonFields,
        };
        if (resourceEditForm.value.connector_type === 'webhook_ingress') {
            body.protocol = { ...(activeResource.value.protocol || {}), ingress: { ...((activeResource.value.protocol || {}).ingress || {}), rate_limit_per_minute: webhookIngressForm.value.rate_limit_per_minute, rate_limit_burst: webhookIngressForm.value.rate_limit_burst } };
        }
        await ucpApi.updateResource(activeResource.value.id, body);
        ElMessage.success('已保存');
        resourceDrawerOpen.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
async function confirmDeleteResource() {
    if (!activeResource.value)
        return;
    // P2-A05: 删除前影响分析 — 查询引用该资源的流水线
    let impactMsg = `确定删除资源「${activeResource.value.resource_name}」？`;
    try {
        const impact = await ucpApi.pipelinesUsingResource(activeResource.value.id);
        if (impact.total > 0) {
            const names = impact.items.map((p) => p.pipeline_name || p.pipeline_code).join('、');
            impactMsg = `资源「${activeResource.value.resource_name}」被 ${impact.total} 条流水线引用：${names}。\n删除后这些流水线将无法执行。\n\n确定删除？`;
        }
    }
    catch { /* 查询失败不影响删除流程 */ }
    try {
        await ElMessageBox.confirm(impactMsg, '删除确认', {
            type: 'warning',
            confirmButtonText: '确认删除',
            dangerouslyUseHTMLString: false,
        });
    }
    catch {
        return;
    }
    try {
        await ucpApi.deleteResource(activeResource.value.id);
        ElMessage.success('已删除');
        resourceDrawerOpen.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
// ── 添加系统 向导 ──
function openAddSystemWizard(opts = {}) {
    if (opts.mode === 'credOnly' && opts.system) {
        openAddCredentialForSystem(opts.system);
        return;
    }
    systemForm.value = { system_code: '', system_name: '', system_type: 'HR_SAAS', owner: '', domain: '', description: '', tagsStr: '', sensitivity: 'internal', instance_config: {} };
    credForm.value = {
        credential_code: '',
        credential_name: '',
        auth_type: 'api_key',
        env_tag: 'prod',
        description: '',
        expires_at: '',
        secrets: {},
    };
    pendingSystemId.value = null;
    selectedConnectorCategory.value = 'STANDARD_SAAS';
    selectedPackageCode.value = '';
    selectedOperationIds.value = [];
    wizardStep.value = 1;
    loadConnectorPackages();
    showAddSystem.value = true;
}
async function loadConnectorPackages() {
    try {
        connectorPackages.value = await ucpApi.connectorPackages({ category: selectedConnectorCategory.value, status: 'PUBLISHED' });
    }
    catch {
        connectorPackages.value = [];
    }
}
function selectConnectorPackage() {
    const packageItem = selectedPackage.value;
    if (!packageItem)
        return;
    systemForm.value.system_code = packageItem.package_code;
    systemForm.value.system_name = packageItem.package_name;
    systemForm.value.system_type = packageItem.category === 'STANDARD_SAAS' ? 'HR_SAAS' : 'CUSTOM';
    systemForm.value.instance_config = {};
    credForm.value.auth_type = packageItem.auth_policy?.auth_type || credForm.value.auth_type;
    credForm.value.secrets = {};
    selectedOperationIds.value = (packageItem.operations || [])
        .map((item) => item.operation_id);
}
// ── 给已存在系统补充凭证 ──
function openAddCredentialForSystem(sys) {
    pendingSystemId.value = sys.id;
    systemForm.value = {
        system_code: sys.system_code,
        system_name: sys.system_name,
        system_type: sys.system_type || 'HR_SAAS',
        owner: sys.owner || '',
        domain: sys.domain || '',
        description: sys.description || '',
        tagsStr: '',
        sensitivity: 'internal',
        instance_config: sys.instance_config || {},
    };
    // 自动选下一个未用的 env_tag
    const used = new Set((systemCredentials.value || []).map((c) => c.env_tag));
    const next = ['prod', 'staging', 'dev', 'backup'].find((t) => !used.has(t)) || 'prod';
    credForm.value = {
        credential_code: `CRED-${sys.system_code}-${next.toUpperCase()}`,
        credential_name: `${sys.system_name} (${next})`,
        auth_type: 'api_key',
        env_tag: next,
        description: '',
        secrets: {},
    };
    showSecret.value = false;
    wizardStep.value = 2;
    showAddSystem.value = true;
}
async function setPrimaryCredential(c) {
    try {
        await ucpApi.updateCredential(c.id, { is_primary: true });
        ElMessage.success(`「${c.credential_name}」已设为激活凭证`);
        await load();
        // 刷新抽屉
        if (activeSystem.value) {
            const detail = await ucpApi.systemDetail(activeSystem.value.id);
            systemCredentials.value = detail.credentials || [];
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '设置失败');
    }
}
function cancelWizard() {
    showAddSystem.value = false;
    wizardStep.value = 1;
    pendingSystemId.value = null;
    pendingCredId.value = null;
    showSecret.value = false;
    addFormValues.value = {};
    addSchema.value = null;
}
async function submitSystemStep1() {
    if (!systemForm.value.system_code || !systemForm.value.system_name) {
        ElMessage.warning('请填写系统编码和名称');
        return;
    }
    submitting.value = true;
    try {
        const tags = systemForm.value.tagsStr
            ? systemForm.value.tagsStr.split(',').map((t) => t.trim()).filter(Boolean)
            : [];
        const r = await ucpApi.createSystem({
            system_code: systemForm.value.system_code,
            system_name: systemForm.value.system_name,
            system_type: systemForm.value.system_type,
            owner: systemForm.value.owner,
            domain: systemForm.value.domain,
            description: systemForm.value.description,
            tags,
            sensitivity: systemForm.value.sensitivity,
            package_id: selectedPackage.value?.id,
            catalog_version: selectedPackage.value?.version,
            connection_mode: selectedPackage.value?.category,
            instance_config: systemForm.value.instance_config,
        });
        pendingSystemId.value = r.id;
        ElMessage.success(`系统「${systemForm.value.system_name}」已创建`);
        wizardStep.value = 2;
        // 预填凭证编码
        if (!credForm.value.credential_code) {
            credForm.value.credential_code = `CRED-${(systemForm.value.system_code || 'SYS').toUpperCase()}-${(credForm.value.env_tag || 'PROD').toUpperCase()}`;
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '创建系统失败');
    }
    finally {
        submitting.value = false;
    }
}
async function submitSystemStep2() {
    if (!pendingSystemId.value)
        return;
    if (!credForm.value.credential_code || !credForm.value.credential_name) {
        ElMessage.warning('请填写凭证编码和名称');
        return;
    }
    const required = currentCredFields.value;
    const missing = required.filter((f) => !credForm.value.secrets[f.key]?.trim());
    if (missing.length > 0) {
        ElMessage.warning(`请填写所有密钥字段：${missing.map((f) => f.label).join(' / ')}`);
        return;
    }
    submitting.value = true;
    try {
        const r = await ucpApi.createCredential({
            credential_code: credForm.value.credential_code,
            credential_name: credForm.value.credential_name,
            auth_type: credForm.value.auth_type || undefined,
            description: credForm.value.description || undefined,
            system_id: pendingSystemId.value,
            env_tag: credForm.value.env_tag || undefined,
            is_primary: true,
            expires_at: toUtcNaive(credForm.value.expires_at) || undefined,
            remind_before_days: credForm.value.remind_before_days ?? 7,
            secrets: credForm.value.secrets,
        });
        pendingCredId.value = r.id;
        ElMessage.success('凭证已创建并绑定到系统');
        if (usesCapabilityPackage.value) {
            wizardStep.value = 3;
            return;
        }
        // 预填资源 form 凭证
        resourceForm.value.credential_id = r.id;
        // 进入 Step 3: 加载该系统下的资源列表
        await loadWizardResources();
        wizardStep.value = 3;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '创建凭证失败');
    }
    finally {
        submitting.value = false;
    }
}
// Step 3: 资源已通过"添加资源"按钮即时加入 wizardResources。
// 这里只做"下一步"按钮的兜底提交（资源为空时直接进 Step 4）；
// 若列表非空,说明用户已通过对话框完成创建,直接到 Step 4。
async function submitSystemStep3() {
    if (usesCapabilityPackage.value) {
        if (!pendingSystemId.value || !pendingCredId.value || selectedOperationIds.value.length === 0) {
            ElMessage.warning('请至少启用一项业务能力');
            return;
        }
        submitting.value = true;
        try {
            await Promise.all(selectedOperationIds.value.map((operationId) => ucpApi.setSystemCapability(pendingSystemId.value, operationId, { credential_id: pendingCredId.value, enabled: true })));
            ElMessage.success('业务能力已启用，待补充测试参数后可进行连接测试');
        }
        catch (e) {
            ElMessage.error(e?.response?.data?.detail || '启用业务能力失败');
            return;
        }
        finally {
            submitting.value = false;
        }
    }
    wizardStep.value = 4;
}
// 拉取新建系统下的资源列表(Step 3 展示)
async function loadWizardResources() {
    if (!pendingSystemId.value) {
        wizardResources.value = [];
        return;
    }
    try {
        const detail = await ucpApi.systemDetail(pendingSystemId.value);
        wizardResources.value = detail?.resources || [];
    }
    catch {
        wizardResources.value = [];
    }
}
// Step 3 顶部"添加资源"按钮:复用 addResource 流程,但把 addResourceSystem 设为待接入系统
async function addResourceFromWizard() {
    if (!pendingSystemId.value)
        return;
    addResourceFromWizardFlag.value = true;
    // 构造一个"伪 system 对象"喂给 addResource(),只用到 sys.id
    const sysStub = { id: pendingSystemId.value, system_name: systemForm.value.system_name };
    await addResource(sysStub);
}
function finishWizardAll() {
    showAddSystem.value = false;
    wizardStep.value = 1;
    pendingSystemId.value = null;
    pendingCredId.value = null;
    showSecret.value = false;
    addFormValues.value = {};
    addSchema.value = null;
    ElMessage.success(`系统「${systemForm.value.system_name}」接入完成`);
    load();
}
function finishWizardSkipCred() {
    showAddSystem.value = false;
    wizardStep.value = 1;
    pendingSystemId.value = null;
    showSecret.value = false;
    ElMessage.info('系统已创建，可在系统详情中补充凭证');
    load();
}
async function submitResource() {
    if (!addResourceSystem.value)
        return;
    if (!resourceForm.value.resource_template_code) {
        ElMessage.warning('请选择资源模板');
        return;
    }
    submitting.value = true;
    try {
        await ucpApi.createResource({
            system_id: addResourceSystem.value.id,
            resource_template_code: resourceForm.value.resource_template_code,
        });
        ElMessage.success('资源已创建');
        showAddResource.value = false;
        if (addResourceFromWizardFlag.value) {
            await loadWizardResources();
            addResourceFromWizardFlag.value = false;
        }
        else {
            await load();
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '创建资源失败');
    }
    finally {
        submitting.value = false;
    }
}
// 加载 adapter 列表
onMounted(async () => {
    await loadConnectorTypes();
    await loadConnectorPackages();
    await load();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['resource-template-option']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-template-option']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['done']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['done']} */ ;
/** @type {__VLS_StyleScopedClasses['check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['systems-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['systems-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-item']} */ ;
/** @type {__VLS_StyleScopedClasses['systems-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['health-main']} */ ;
/** @type {__VLS_StyleScopedClasses['health-main']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row-4col']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-overview']} */ ;
/** @type {__VLS_StyleScopedClasses['ops-overview']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "systems-tab" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-row kpi-row-4col" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-sys" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.systemCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
(__VLS_ctx.kpi.systemActiveCount);
(__VLS_ctx.inactiveSystemCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-res" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.kpi.resourceCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
(__VLS_ctx.kpi.resourceActiveCount);
(__VLS_ctx.kpi.resourceInactiveCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-cred" },
    ...{ class: ({ 'kpi-alert-warn': __VLS_ctx.credentialRiskCount > 0 }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.credentialRiskCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
(__VLS_ctx.kpi.credPrimaryCount);
(__VLS_ctx.kpi.credBackupCount);
(__VLS_ctx.credentialRiskCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-card kpi-abnormal" },
    ...{ class: ({ 'kpi-alert-warn': __VLS_ctx.abnormalSystemCount > 0 }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-value" },
});
(__VLS_ctx.abnormalSystemCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "kpi-sub" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar optimized-toolbar" },
});
const __VLS_0 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.searchKw),
    placeholder: "搜索系统 / 资源 / 凭证 / 负责人",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.searchKw),
    placeholder: "搜索系统 / 资源 / 凭证 / 负责人",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_4 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
    const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    const __VLS_8 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({}));
    const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
    var __VLS_7;
}
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "filter-pills" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "filter-pill active" },
});
(__VLS_ctx.kpi.systemCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "filter-pill" },
});
(__VLS_ctx.healthySystemCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "filter-pill warn" },
});
(__VLS_ctx.credentialRiskCount);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "filter-pill" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "filter-pill" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-right" },
});
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
var __VLS_15;
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
var __VLS_19;
const __VLS_20 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (...[$event]) => {
        __VLS_ctx.openAddSystemWizard({ mode: 'system' });
    }
};
__VLS_23.slots.default;
const __VLS_28 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_31;
var __VLS_23;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "loading-state" },
    });
    const __VLS_36 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ class: "is-loading" },
    }));
    const __VLS_38 = __VLS_37({
        ...{ class: "is-loading" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.Loading;
    /** @type {[typeof __VLS_components.Loading, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    var __VLS_39;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "system-grid" },
    });
    for (const [sys] of __VLS_getVForSourceType((__VLS_ctx.filteredSystems))) {
        /** @type {[typeof SystemCard, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(SystemCard, new SystemCard({
            ...{ 'onOpen': {} },
            ...{ 'onOpenResource': {} },
            ...{ 'onAddResource': {} },
            key: (sys.id),
            system: (sys),
            resources: (__VLS_ctx.systemResources(sys.id)),
            credentials: (__VLS_ctx.systemCredentialsOf(sys.id)),
            overview: (__VLS_ctx.overviewMap[sys.id]),
            health: (__VLS_ctx.systemHealth(sys)),
        }));
        const __VLS_45 = __VLS_44({
            ...{ 'onOpen': {} },
            ...{ 'onOpenResource': {} },
            ...{ 'onAddResource': {} },
            key: (sys.id),
            system: (sys),
            resources: (__VLS_ctx.systemResources(sys.id)),
            credentials: (__VLS_ctx.systemCredentialsOf(sys.id)),
            overview: (__VLS_ctx.overviewMap[sys.id]),
            health: (__VLS_ctx.systemHealth(sys)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        let __VLS_47;
        let __VLS_48;
        let __VLS_49;
        const __VLS_50 = {
            onOpen: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                __VLS_ctx.openSystem(sys);
            }
        };
        const __VLS_51 = {
            onOpenResource: ((res) => __VLS_ctx.openResource(sys, res))
        };
        const __VLS_52 = {
            onAddResource: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                __VLS_ctx.addResource(sys);
            }
        };
        var __VLS_46;
    }
}
if (!__VLS_ctx.loading && __VLS_ctx.systems.length === 0) {
    const __VLS_53 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
        description: "尚未接入任何系统，点击「添加系统」开始接入",
    }));
    const __VLS_55 = __VLS_54({
        description: "尚未接入任何系统，点击「添加系统」开始接入",
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
}
const __VLS_57 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (`${__VLS_ctx.activeSystem?.system_name || ''} 详情`),
    size: "620px",
    direction: "rtl",
}));
const __VLS_59 = __VLS_58({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (`${__VLS_ctx.activeSystem?.system_name || ''} 详情`),
    size: "620px",
    direction: "rtl",
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
__VLS_60.slots.default;
if (__VLS_ctx.activeSystem) {
    const __VLS_61 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        modelValue: (__VLS_ctx.detailTab),
        ...{ class: "system-detail-tabs" },
    }));
    const __VLS_63 = __VLS_62({
        modelValue: (__VLS_ctx.detailTab),
        ...{ class: "system-detail-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    const __VLS_65 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        label: "概览",
        name: "overview",
    }));
    const __VLS_67 = __VLS_66({
        label: "概览",
        name: "overview",
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_68.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    const __VLS_69 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        column: (1),
        border: true,
        size: "small",
    }));
    const __VLS_71 = __VLS_70({
        column: (1),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    const __VLS_73 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
        label: "系统编码",
    }));
    const __VLS_75 = __VLS_74({
        label: "系统编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    __VLS_76.slots.default;
    (__VLS_ctx.activeSystem.system_code);
    var __VLS_76;
    const __VLS_77 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        label: "系统名称",
    }));
    const __VLS_79 = __VLS_78({
        label: "系统名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    (__VLS_ctx.activeSystem.system_name);
    var __VLS_80;
    const __VLS_81 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        label: "系统类型",
    }));
    const __VLS_83 = __VLS_82({
        label: "系统类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    (__VLS_ctx.activeSystem.system_type || '—');
    var __VLS_84;
    const __VLS_85 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        label: "负责人",
    }));
    const __VLS_87 = __VLS_86({
        label: "负责人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    (__VLS_ctx.activeSystem.owner || '—');
    var __VLS_88;
    const __VLS_89 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        label: "状态",
    }));
    const __VLS_91 = __VLS_90({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    __VLS_92.slots.default;
    const __VLS_93 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        type: (__VLS_ctx.activeSystem.is_active ? 'success' : 'info'),
        size: "small",
    }));
    const __VLS_95 = __VLS_94({
        type: (__VLS_ctx.activeSystem.is_active ? 'success' : 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    __VLS_96.slots.default;
    (__VLS_ctx.activeSystem.is_active ? '运行中' : '已停用');
    var __VLS_96;
    var __VLS_92;
    const __VLS_97 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        label: "资源数",
    }));
    const __VLS_99 = __VLS_98({
        label: "资源数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    __VLS_100.slots.default;
    (__VLS_ctx.activeSystem.resource_count || __VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id).length);
    var __VLS_100;
    const __VLS_101 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        label: "凭证数",
    }));
    const __VLS_103 = __VLS_102({
        label: "凭证数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    (__VLS_ctx.systemCredentials.length);
    var __VLS_104;
    const __VLS_105 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
        label: "说明",
    }));
    const __VLS_107 = __VLS_106({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    __VLS_108.slots.default;
    (__VLS_ctx.activeSystem.description || '—');
    var __VLS_108;
    var __VLS_72;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "quick-actions" },
        ...{ style: {} },
    });
    const __VLS_109 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        ...{ 'onClick': {} },
    }));
    const __VLS_111 = __VLS_110({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    let __VLS_113;
    let __VLS_114;
    let __VLS_115;
    const __VLS_116 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.detailTab = 'resources';
        }
    };
    __VLS_112.slots.default;
    var __VLS_112;
    const __VLS_117 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
        ...{ 'onClick': {} },
    }));
    const __VLS_119 = __VLS_118({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_118));
    let __VLS_121;
    let __VLS_122;
    let __VLS_123;
    const __VLS_124 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.detailTab = 'credentials';
            __VLS_ctx.openAddCredentialForSystem(__VLS_ctx.activeSystem);
        }
    };
    __VLS_120.slots.default;
    const __VLS_125 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({}));
    const __VLS_127 = __VLS_126({}, ...__VLS_functionalComponentArgsRest(__VLS_126));
    __VLS_128.slots.default;
    const __VLS_129 = {}.Key;
    /** @type {[typeof __VLS_components.Key, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({}));
    const __VLS_131 = __VLS_130({}, ...__VLS_functionalComponentArgsRest(__VLS_130));
    var __VLS_128;
    var __VLS_120;
    const __VLS_133 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        ...{ 'onClick': {} },
    }));
    const __VLS_135 = __VLS_134({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    let __VLS_137;
    let __VLS_138;
    let __VLS_139;
    const __VLS_140 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.editSystem(__VLS_ctx.activeSystem);
        }
    };
    __VLS_136.slots.default;
    var __VLS_136;
    const __VLS_141 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_143 = __VLS_142({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_142));
    let __VLS_145;
    let __VLS_146;
    let __VLS_147;
    const __VLS_148 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.confirmDeleteSystem(__VLS_ctx.activeSystem);
        }
    };
    __VLS_144.slots.default;
    var __VLS_144;
    var __VLS_68;
    const __VLS_149 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        label: "资源",
        name: "resources",
    }));
    const __VLS_151 = __VLS_150({
        label: "资源",
        name: "resources",
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    __VLS_152.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id).length);
    const __VLS_153 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }));
    const __VLS_155 = __VLS_154({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    let __VLS_157;
    let __VLS_158;
    let __VLS_159;
    const __VLS_160 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.addResource(__VLS_ctx.activeSystem);
        }
    };
    __VLS_156.slots.default;
    const __VLS_161 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({}));
    const __VLS_163 = __VLS_162({}, ...__VLS_functionalComponentArgsRest(__VLS_162));
    __VLS_164.slots.default;
    const __VLS_165 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({}));
    const __VLS_167 = __VLS_166({}, ...__VLS_functionalComponentArgsRest(__VLS_166));
    var __VLS_164;
    var __VLS_156;
    if (__VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id).length) {
        const __VLS_169 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id)),
            stripe: true,
            size: "small",
            maxHeight: "400",
            ...{ style: {} },
        }));
        const __VLS_171 = __VLS_170({
            ...{ 'onRowClick': {} },
            data: (__VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id)),
            stripe: true,
            size: "small",
            maxHeight: "400",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        let __VLS_173;
        let __VLS_174;
        let __VLS_175;
        const __VLS_176 = {
            onRowClick: ((row) => __VLS_ctx.openResource(__VLS_ctx.activeSystem, row))
        };
        __VLS_172.slots.default;
        const __VLS_177 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            prop: "resource_name",
            label: "名称",
            minWidth: "100",
        }));
        const __VLS_179 = __VLS_178({
            prop: "resource_name",
            label: "名称",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        const __VLS_181 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
            label: "类型",
            width: "90",
        }));
        const __VLS_183 = __VLS_182({
            label: "类型",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_182));
        __VLS_184.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_184.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_185 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
                size: "small",
            }));
            const __VLS_187 = __VLS_186({
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_186));
            __VLS_188.slots.default;
            (row.resource_type || 'API');
            var __VLS_188;
        }
        var __VLS_184;
        const __VLS_189 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
            label: "接入类型",
            minWidth: "110",
        }));
        const __VLS_191 = __VLS_190({
            label: "接入类型",
            minWidth: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_190));
        __VLS_192.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_192.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.connector_type) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.connectorLabel(row.connector_type));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "text-muted" },
                });
            }
        }
        var __VLS_192;
        const __VLS_193 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
            label: "状态",
            width: "80",
        }));
        const __VLS_195 = __VLS_194({
            label: "状态",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_194));
        __VLS_196.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_196.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.status === 1) {
                const __VLS_197 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
                    type: "success",
                    size: "small",
                }));
                const __VLS_199 = __VLS_198({
                    type: "success",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_198));
                __VLS_200.slots.default;
                var __VLS_200;
            }
            else if (row.status === 2) {
                const __VLS_201 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
                    type: "info",
                    size: "small",
                }));
                const __VLS_203 = __VLS_202({
                    type: "info",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_202));
                __VLS_204.slots.default;
                var __VLS_204;
            }
            else {
                const __VLS_205 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
                    type: "warning",
                    size: "small",
                }));
                const __VLS_207 = __VLS_206({
                    type: "warning",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_206));
                __VLS_208.slots.default;
                var __VLS_208;
            }
        }
        var __VLS_196;
        const __VLS_209 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
            label: "操作",
            width: "76",
        }));
        const __VLS_211 = __VLS_210({
            label: "操作",
            width: "76",
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        __VLS_212.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_212.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_213 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
                size: "small",
            }));
            const __VLS_215 = __VLS_214({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_214));
            let __VLS_217;
            let __VLS_218;
            let __VLS_219;
            const __VLS_220 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeSystem))
                        return;
                    if (!(__VLS_ctx.resourcesOf(__VLS_ctx.activeSystem.id).length))
                        return;
                    __VLS_ctx.openResource(__VLS_ctx.activeSystem, row);
                }
            };
            __VLS_216.slots.default;
            var __VLS_216;
        }
        var __VLS_212;
        var __VLS_172;
    }
    else {
        const __VLS_221 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
            description: "暂无资源",
            imageSize: (60),
        }));
        const __VLS_223 = __VLS_222({
            description: "暂无资源",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_222));
    }
    var __VLS_152;
    const __VLS_225 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
        label: "凭证",
        name: "credentials",
    }));
    const __VLS_227 = __VLS_226({
        label: "凭证",
        name: "credentials",
    }, ...__VLS_functionalComponentArgsRest(__VLS_226));
    __VLS_228.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.systemCredentials.length);
    const __VLS_229 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }));
    const __VLS_231 = __VLS_230({
        ...{ 'onClick': {} },
        size: "small",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_230));
    let __VLS_233;
    let __VLS_234;
    let __VLS_235;
    const __VLS_236 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.activeSystem))
                return;
            __VLS_ctx.openAddCredentialForSystem(__VLS_ctx.activeSystem);
        }
    };
    __VLS_232.slots.default;
    const __VLS_237 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({}));
    const __VLS_239 = __VLS_238({}, ...__VLS_functionalComponentArgsRest(__VLS_238));
    __VLS_240.slots.default;
    const __VLS_241 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({}));
    const __VLS_243 = __VLS_242({}, ...__VLS_functionalComponentArgsRest(__VLS_242));
    var __VLS_240;
    var __VLS_232;
    if (__VLS_ctx.systemCredentials.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
            ...{ style: {} },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "cred-list" },
        });
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.systemCredentials))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (c.id),
                ...{ class: "cred-item" },
            });
            const __VLS_245 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({}));
            const __VLS_247 = __VLS_246({}, ...__VLS_functionalComponentArgsRest(__VLS_246));
            __VLS_248.slots.default;
            const __VLS_249 = {}.Key;
            /** @type {[typeof __VLS_components.Key, ]} */ ;
            // @ts-ignore
            const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({}));
            const __VLS_251 = __VLS_250({}, ...__VLS_functionalComponentArgsRest(__VLS_250));
            var __VLS_248;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cred-item-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cred-item-name" },
            });
            (c.credential_name);
            if (c.is_primary) {
                const __VLS_253 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
                    type: "success",
                    size: "small",
                }));
                const __VLS_255 = __VLS_254({
                    type: "success",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_254));
                __VLS_256.slots.default;
                var __VLS_256;
            }
            else {
                const __VLS_257 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
                    type: "info",
                    size: "small",
                }));
                const __VLS_259 = __VLS_258({
                    type: "info",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_258));
                __VLS_260.slots.default;
                var __VLS_260;
            }
            if (c.env_tag) {
                const __VLS_261 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
                    size: "small",
                }));
                const __VLS_263 = __VLS_262({
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_262));
                __VLS_264.slots.default;
                (c.env_tag);
                var __VLS_264;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "cred-item-meta" },
            });
            (c.auth_type);
            (c.last_verified_at || '—');
            if (!c.is_primary) {
                const __VLS_265 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
                    ...{ 'onClick': {} },
                    size: "small",
                    link: true,
                    type: "primary",
                }));
                const __VLS_267 = __VLS_266({
                    ...{ 'onClick': {} },
                    size: "small",
                    link: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_266));
                let __VLS_269;
                let __VLS_270;
                let __VLS_271;
                const __VLS_272 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeSystem))
                            return;
                        if (!!(__VLS_ctx.systemCredentials.length === 0))
                            return;
                        if (!(!c.is_primary))
                            return;
                        __VLS_ctx.setPrimaryCredential(c);
                    }
                };
                __VLS_268.slots.default;
                var __VLS_268;
            }
            const __VLS_273 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
                type: "primary",
            }));
            const __VLS_275 = __VLS_274({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_274));
            let __VLS_277;
            let __VLS_278;
            let __VLS_279;
            const __VLS_280 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeSystem))
                        return;
                    if (!!(__VLS_ctx.systemCredentials.length === 0))
                        return;
                    __VLS_ctx.openEditCredential(c);
                }
            };
            __VLS_276.slots.default;
            var __VLS_276;
        }
    }
    var __VLS_228;
    const __VLS_281 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_282 = __VLS_asFunctionalComponent(__VLS_281, new __VLS_281({
        label: "业务能力",
        name: "capabilities",
    }));
    const __VLS_283 = __VLS_282({
        label: "业务能力",
        name: "capabilities",
    }, ...__VLS_functionalComponentArgsRest(__VLS_282));
    __VLS_284.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    const __VLS_285 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "在此管理接入类型预置能力与系统扩展能力；接口地址、认证和安全策略均继承自能力包。",
    }));
    const __VLS_287 = __VLS_286({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "在此管理接入类型预置能力与系统扩展能力；接口地址、认证和安全策略均继承自能力包。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_286));
    if (__VLS_ctx.systemCapabilities.length) {
        const __VLS_289 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_290 = __VLS_asFunctionalComponent(__VLS_289, new __VLS_289({
            data: (__VLS_ctx.systemCapabilities),
            stripe: true,
            size: "small",
        }));
        const __VLS_291 = __VLS_290({
            data: (__VLS_ctx.systemCapabilities),
            stripe: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_290));
        __VLS_292.slots.default;
        const __VLS_293 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
            prop: "operation_name",
            label: "业务能力",
            minWidth: "170",
        }));
        const __VLS_295 = __VLS_294({
            prop: "operation_name",
            label: "业务能力",
            minWidth: "170",
        }, ...__VLS_functionalComponentArgsRest(__VLS_294));
        const __VLS_297 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
            label: "状态",
            width: "140",
        }));
        const __VLS_299 = __VLS_298({
            label: "状态",
            width: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_298));
        __VLS_300.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_300.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_301 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
                type: (row.enabled ? 'success' : 'info'),
                size: "small",
            }));
            const __VLS_303 = __VLS_302({
                type: (row.enabled ? 'success' : 'info'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_302));
            __VLS_304.slots.default;
            (row.enabled ? '已启用' : '未启用');
            var __VLS_304;
            if (row.enabled) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "text-muted" },
                });
                (row.test_status);
            }
        }
        var __VLS_300;
        const __VLS_305 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
            label: "操作",
            width: "210",
        }));
        const __VLS_307 = __VLS_306({
            label: "操作",
            width: "210",
        }, ...__VLS_functionalComponentArgsRest(__VLS_306));
        __VLS_308.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_308.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.enabled) {
                const __VLS_309 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_310 = __VLS_asFunctionalComponent(__VLS_309, new __VLS_309({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }));
                const __VLS_311 = __VLS_310({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_310));
                let __VLS_313;
                let __VLS_314;
                let __VLS_315;
                const __VLS_316 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeSystem))
                            return;
                        if (!(__VLS_ctx.systemCapabilities.length))
                            return;
                        if (!(row.enabled))
                            return;
                        __VLS_ctx.openCapabilityTest(row);
                    }
                };
                __VLS_312.slots.default;
                var __VLS_312;
            }
            if (row.enabled) {
                const __VLS_317 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }));
                const __VLS_319 = __VLS_318({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_318));
                let __VLS_321;
                let __VLS_322;
                let __VLS_323;
                const __VLS_324 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeSystem))
                            return;
                        if (!(__VLS_ctx.systemCapabilities.length))
                            return;
                        if (!(row.enabled))
                            return;
                        __VLS_ctx.openCapabilityTestResults(row);
                    }
                };
                __VLS_320.slots.default;
                var __VLS_320;
            }
            const __VLS_325 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
                size: "small",
            }));
            const __VLS_327 = __VLS_326({
                ...{ 'onClick': {} },
                link: true,
                type: "primary",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_326));
            let __VLS_329;
            let __VLS_330;
            let __VLS_331;
            const __VLS_332 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeSystem))
                        return;
                    if (!(__VLS_ctx.systemCapabilities.length))
                        return;
                    __VLS_ctx.toggleSystemCapability(row);
                }
            };
            __VLS_328.slots.default;
            (row.enabled ? '停用' : '启用');
            var __VLS_328;
        }
        var __VLS_308;
        var __VLS_292;
    }
    else {
        const __VLS_333 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
            description: "此系统尚未启用标准业务能力",
            imageSize: (60),
        }));
        const __VLS_335 = __VLS_334({
            description: "此系统尚未启用标准业务能力",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_334));
    }
    var __VLS_284;
    const __VLS_337 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
        label: "流水线",
        name: "pipelines",
    }));
    const __VLS_339 = __VLS_338({
        label: "流水线",
        name: "pipelines",
    }, ...__VLS_functionalComponentArgsRest(__VLS_338));
    __VLS_340.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.detailPipelines.length);
    if (__VLS_ctx.detailPipelines.length) {
        const __VLS_341 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
            data: (__VLS_ctx.detailPipelines),
            stripe: true,
            size: "small",
            maxHeight: "400",
        }));
        const __VLS_343 = __VLS_342({
            data: (__VLS_ctx.detailPipelines),
            stripe: true,
            size: "small",
            maxHeight: "400",
        }, ...__VLS_functionalComponentArgsRest(__VLS_342));
        __VLS_344.slots.default;
        const __VLS_345 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
            prop: "pipeline_name",
            label: "名称",
            minWidth: "120",
        }));
        const __VLS_347 = __VLS_346({
            prop: "pipeline_name",
            label: "名称",
            minWidth: "120",
        }, ...__VLS_functionalComponentArgsRest(__VLS_346));
        const __VLS_349 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({
            label: "触发方式",
            width: "90",
        }));
        const __VLS_351 = __VLS_350({
            label: "触发方式",
            width: "90",
        }, ...__VLS_functionalComponentArgsRest(__VLS_350));
        __VLS_352.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_352.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_353 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_354 = __VLS_asFunctionalComponent(__VLS_353, new __VLS_353({
                size: "small",
            }));
            const __VLS_355 = __VLS_354({
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_354));
            __VLS_356.slots.default;
            (row.trigger_type || 'MANUAL');
            var __VLS_356;
        }
        var __VLS_352;
        const __VLS_357 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
            label: "状态",
            width: "80",
        }));
        const __VLS_359 = __VLS_358({
            label: "状态",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_358));
        __VLS_360.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_360.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (row.status === 1) {
                const __VLS_361 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_362 = __VLS_asFunctionalComponent(__VLS_361, new __VLS_361({
                    type: "success",
                    size: "small",
                }));
                const __VLS_363 = __VLS_362({
                    type: "success",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_362));
                __VLS_364.slots.default;
                var __VLS_364;
            }
            else {
                const __VLS_365 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
                    type: "info",
                    size: "small",
                }));
                const __VLS_367 = __VLS_366({
                    type: "info",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_366));
                __VLS_368.slots.default;
                var __VLS_368;
            }
        }
        var __VLS_360;
        var __VLS_344;
    }
    else {
        const __VLS_369 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
            description: "暂无关联流水线",
            imageSize: (60),
        }));
        const __VLS_371 = __VLS_370({
            description: "暂无关联流水线",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    }
    var __VLS_340;
    const __VLS_373 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
        label: "执行记录",
        name: "executions",
    }));
    const __VLS_375 = __VLS_374({
        label: "执行记录",
        name: "executions",
    }, ...__VLS_functionalComponentArgsRest(__VLS_374));
    __VLS_376.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    if (__VLS_ctx.detailExecutions.length) {
        const __VLS_377 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
            data: (__VLS_ctx.detailExecutions),
            stripe: true,
            size: "small",
            maxHeight: "400",
        }));
        const __VLS_379 = __VLS_378({
            data: (__VLS_ctx.detailExecutions),
            stripe: true,
            size: "small",
            maxHeight: "400",
        }, ...__VLS_functionalComponentArgsRest(__VLS_378));
        __VLS_380.slots.default;
        const __VLS_381 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({
            label: "Trace ID",
            minWidth: "100",
        }));
        const __VLS_383 = __VLS_382({
            label: "Trace ID",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_382));
        __VLS_384.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_384.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
                ...{ style: {} },
            });
            (row.trace_id?.slice(0, 8));
        }
        var __VLS_384;
        const __VLS_385 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
            prop: "pipeline_code",
            label: "流水线",
            width: "130",
        }));
        const __VLS_387 = __VLS_386({
            prop: "pipeline_code",
            label: "流水线",
            width: "130",
        }, ...__VLS_functionalComponentArgsRest(__VLS_386));
        const __VLS_389 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
            label: "状态",
            width: "100",
        }));
        const __VLS_391 = __VLS_390({
            label: "状态",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_390));
        __VLS_392.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_392.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_393 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
                type: (__VLS_ctx.execStatusColor(row.status)),
                size: "small",
            }));
            const __VLS_395 = __VLS_394({
                type: (__VLS_ctx.execStatusColor(row.status)),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_394));
            __VLS_396.slots.default;
            (row.status);
            var __VLS_396;
        }
        var __VLS_392;
        const __VLS_397 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_398 = __VLS_asFunctionalComponent(__VLS_397, new __VLS_397({
            label: "时间",
            minWidth: "140",
        }));
        const __VLS_399 = __VLS_398({
            label: "时间",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_398));
        __VLS_400.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_400.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.formatDateTime(row.started_at || row.created_at));
        }
        var __VLS_400;
        var __VLS_380;
    }
    else {
        const __VLS_401 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
            description: "暂无执行记录",
            imageSize: (60),
        }));
        const __VLS_403 = __VLS_402({
            description: "暂无执行记录",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_402));
    }
    var __VLS_376;
    const __VLS_405 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_406 = __VLS_asFunctionalComponent(__VLS_405, new __VLS_405({
        label: "审计/测试",
        name: "audit",
    }));
    const __VLS_407 = __VLS_406({
        label: "审计/测试",
        name: "audit",
    }, ...__VLS_functionalComponentArgsRest(__VLS_406));
    __VLS_408.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tab-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section-title" },
    });
    if (__VLS_ctx.detailAuditLogs.length) {
        const __VLS_409 = {}.ElTimeline;
        /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
        // @ts-ignore
        const __VLS_410 = __VLS_asFunctionalComponent(__VLS_409, new __VLS_409({
            ...{ style: {} },
        }));
        const __VLS_411 = __VLS_410({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_410));
        __VLS_412.slots.default;
        for (const [item, i] of __VLS_getVForSourceType((__VLS_ctx.detailAuditLogs))) {
            const __VLS_413 = {}.ElTimelineItem;
            /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
            // @ts-ignore
            const __VLS_414 = __VLS_asFunctionalComponent(__VLS_413, new __VLS_413({
                key: (i),
                timestamp: (__VLS_ctx.formatDateTime(item.created_at)),
                placement: "top",
            }));
            const __VLS_415 = __VLS_414({
                key: (i),
                timestamp: (__VLS_ctx.formatDateTime(item.created_at)),
                placement: "top",
            }, ...__VLS_functionalComponentArgsRest(__VLS_414));
            __VLS_416.slots.default;
            (item.action || item.message || '配置变更');
            var __VLS_416;
        }
        var __VLS_412;
    }
    else {
        const __VLS_417 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_418 = __VLS_asFunctionalComponent(__VLS_417, new __VLS_417({
            description: "暂无审计记录",
            imageSize: (60),
        }));
        const __VLS_419 = __VLS_418({
            description: "暂无审计记录",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_418));
    }
    var __VLS_408;
    var __VLS_64;
}
var __VLS_60;
const __VLS_421 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_422 = __VLS_asFunctionalComponent(__VLS_421, new __VLS_421({
    modelValue: (__VLS_ctx.capabilityTestVisible),
    title: "测试业务能力",
    width: "520px",
}));
const __VLS_423 = __VLS_422({
    modelValue: (__VLS_ctx.capabilityTestVisible),
    title: "测试业务能力",
    width: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_422));
__VLS_424.slots.default;
const __VLS_425 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_426 = __VLS_asFunctionalComponent(__VLS_425, new __VLS_425({
    type: "info",
    closable: (false),
    ...{ style: {} },
}));
const __VLS_427 = __VLS_426({
    type: "info",
    closable: (false),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_426));
__VLS_428.slots.default;
var __VLS_428;
const __VLS_429 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_430 = __VLS_asFunctionalComponent(__VLS_429, new __VLS_429({
    labelWidth: "110px",
}));
const __VLS_431 = __VLS_430({
    labelWidth: "110px",
}, ...__VLS_functionalComponentArgsRest(__VLS_430));
__VLS_432.slots.default;
for (const [field] of __VLS_getVForSourceType((__VLS_ctx.capabilityTestFields))) {
    const __VLS_433 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_434 = __VLS_asFunctionalComponent(__VLS_433, new __VLS_433({
        key: (field.key),
        label: (field.label),
        required: true,
    }));
    const __VLS_435 = __VLS_434({
        key: (field.key),
        label: (field.label),
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_434));
    __VLS_436.slots.default;
    if (field.enum?.length) {
        const __VLS_437 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_438 = __VLS_asFunctionalComponent(__VLS_437, new __VLS_437({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            ...{ style: {} },
        }));
        const __VLS_439 = __VLS_438({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_438));
        __VLS_440.slots.default;
        for (const [item] of __VLS_getVForSourceType((field.enum))) {
            const __VLS_441 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_442 = __VLS_asFunctionalComponent(__VLS_441, new __VLS_441({
                key: (String(item)),
                label: (String(item)),
                value: (item),
            }));
            const __VLS_443 = __VLS_442({
                key: (String(item)),
                label: (String(item)),
                value: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_442));
        }
        var __VLS_440;
    }
    else if (field.type === 'boolean') {
        const __VLS_445 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_446 = __VLS_asFunctionalComponent(__VLS_445, new __VLS_445({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
        }));
        const __VLS_447 = __VLS_446({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_446));
    }
    else if (['number', 'integer'].includes(field.type)) {
        const __VLS_449 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_450 = __VLS_asFunctionalComponent(__VLS_449, new __VLS_449({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            ...{ style: {} },
        }));
        const __VLS_451 = __VLS_450({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_450));
    }
    else if (field.type === 'date') {
        const __VLS_453 = {}.ElDatePicker;
        /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
        // @ts-ignore
        const __VLS_454 = __VLS_asFunctionalComponent(__VLS_453, new __VLS_453({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            type: "date",
            valueFormat: "YYYY-MM-DD",
            ...{ style: {} },
        }));
        const __VLS_455 = __VLS_454({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            type: "date",
            valueFormat: "YYYY-MM-DD",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_454));
    }
    else {
        const __VLS_457 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_458 = __VLS_asFunctionalComponent(__VLS_457, new __VLS_457({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            placeholder: (`输入${field.label}`),
        }));
        const __VLS_459 = __VLS_458({
            modelValue: (__VLS_ctx.capabilityTestParameters[field.key]),
            placeholder: (`输入${field.label}`),
        }, ...__VLS_functionalComponentArgsRest(__VLS_458));
    }
    var __VLS_436;
}
var __VLS_432;
{
    const { footer: __VLS_thisSlot } = __VLS_424.slots;
    const __VLS_461 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_462 = __VLS_asFunctionalComponent(__VLS_461, new __VLS_461({
        ...{ 'onClick': {} },
    }));
    const __VLS_463 = __VLS_462({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_462));
    let __VLS_465;
    let __VLS_466;
    let __VLS_467;
    const __VLS_468 = {
        onClick: (...[$event]) => {
            __VLS_ctx.capabilityTestVisible = false;
        }
    };
    __VLS_464.slots.default;
    var __VLS_464;
    const __VLS_469 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_470 = __VLS_asFunctionalComponent(__VLS_469, new __VLS_469({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_471 = __VLS_470({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_470));
    let __VLS_473;
    let __VLS_474;
    let __VLS_475;
    const __VLS_476 = {
        onClick: (__VLS_ctx.submitCapabilityTest)
    };
    __VLS_472.slots.default;
    var __VLS_472;
}
var __VLS_424;
const __VLS_477 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_478 = __VLS_asFunctionalComponent(__VLS_477, new __VLS_477({
    modelValue: (__VLS_ctx.capabilityTestResultVisible),
    title: (`${__VLS_ctx.capabilityUnderTest?.operation_name || '业务能力'}测试结果`),
    width: "760px",
    destroyOnClose: true,
}));
const __VLS_479 = __VLS_478({
    modelValue: (__VLS_ctx.capabilityTestResultVisible),
    title: (`${__VLS_ctx.capabilityUnderTest?.operation_name || '业务能力'}测试结果`),
    width: "760px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_478));
__VLS_480.slots.default;
const __VLS_481 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_482 = __VLS_asFunctionalComponent(__VLS_481, new __VLS_481({
    modelValue: (__VLS_ctx.capabilityResultTab),
}));
const __VLS_483 = __VLS_482({
    modelValue: (__VLS_ctx.capabilityResultTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_482));
__VLS_484.slots.default;
const __VLS_485 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_486 = __VLS_asFunctionalComponent(__VLS_485, new __VLS_485({
    label: "本次结果",
    name: "current",
}));
const __VLS_487 = __VLS_486({
    label: "本次结果",
    name: "current",
}, ...__VLS_functionalComponentArgsRest(__VLS_486));
__VLS_488.slots.default;
const __VLS_489 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_490 = __VLS_asFunctionalComponent(__VLS_489, new __VLS_489({
    type: (__VLS_ctx.capabilityTestResult?.status === 'SUCCESS' ? 'success' : 'warning'),
    closable: (false),
    ...{ style: {} },
    title: (__VLS_ctx.capabilityTestResult?.error_message || __VLS_ctx.capabilityTestResult?.status || '暂无测试结果'),
}));
const __VLS_491 = __VLS_490({
    type: (__VLS_ctx.capabilityTestResult?.status === 'SUCCESS' ? 'success' : 'warning'),
    closable: (false),
    ...{ style: {} },
    title: (__VLS_ctx.capabilityTestResult?.error_message || __VLS_ctx.capabilityTestResult?.status || '暂无测试结果'),
}, ...__VLS_functionalComponentArgsRest(__VLS_490));
if (__VLS_ctx.capabilityTestResult) {
    const __VLS_493 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_494 = __VLS_asFunctionalComponent(__VLS_493, new __VLS_493({
        column: (2),
        border: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_495 = __VLS_494({
        column: (2),
        border: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_494));
    __VLS_496.slots.default;
    const __VLS_497 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_498 = __VLS_asFunctionalComponent(__VLS_497, new __VLS_497({
        label: "Trace",
    }));
    const __VLS_499 = __VLS_498({
        label: "Trace",
    }, ...__VLS_functionalComponentArgsRest(__VLS_498));
    __VLS_500.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (__VLS_ctx.capabilityTestResult.trace_id?.slice(0, 8));
    var __VLS_500;
    const __VLS_501 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_502 = __VLS_asFunctionalComponent(__VLS_501, new __VLS_501({
        label: "测试时间",
    }));
    const __VLS_503 = __VLS_502({
        label: "测试时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_502));
    __VLS_504.slots.default;
    (__VLS_ctx.formatDateTime(__VLS_ctx.capabilityTestResult.created_at));
    var __VLS_504;
    var __VLS_496;
}
const __VLS_505 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_506 = __VLS_asFunctionalComponent(__VLS_505, new __VLS_505({
    contentPosition: "left",
}));
const __VLS_507 = __VLS_506({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_506));
__VLS_508.slots.default;
var __VLS_508;
if (__VLS_ctx.capabilityResultRows.length === 0) {
    const __VLS_509 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_510 = __VLS_asFunctionalComponent(__VLS_509, new __VLS_509({
        description: "本次未返回可展示的数据",
        imageSize: (56),
    }));
    const __VLS_511 = __VLS_510({
        description: "本次未返回可展示的数据",
        imageSize: (56),
    }, ...__VLS_functionalComponentArgsRest(__VLS_510));
}
else {
    const __VLS_513 = {}.ElCollapse;
    /** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
    // @ts-ignore
    const __VLS_514 = __VLS_asFunctionalComponent(__VLS_513, new __VLS_513({}));
    const __VLS_515 = __VLS_514({}, ...__VLS_functionalComponentArgsRest(__VLS_514));
    __VLS_516.slots.default;
    for (const [row, index] of __VLS_getVForSourceType((__VLS_ctx.capabilityResultRows))) {
        const __VLS_517 = {}.ElCollapseItem;
        /** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
        // @ts-ignore
        const __VLS_518 = __VLS_asFunctionalComponent(__VLS_517, new __VLS_517({
            key: (index),
            title: (`结果 ${index + 1}`),
            name: (index),
        }));
        const __VLS_519 = __VLS_518({
            key: (index),
            title: (`结果 ${index + 1}`),
            name: (index),
        }, ...__VLS_functionalComponentArgsRest(__VLS_518));
        __VLS_520.slots.default;
        const __VLS_521 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_522 = __VLS_asFunctionalComponent(__VLS_521, new __VLS_521({
            column: (1),
            border: true,
            size: "small",
        }));
        const __VLS_523 = __VLS_522({
            column: (1),
            border: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_522));
        __VLS_524.slots.default;
        for (const [[key, value]] of __VLS_getVForSourceType((__VLS_ctx.objectEntries(row)))) {
            const __VLS_525 = {}.ElDescriptionsItem;
            /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
            // @ts-ignore
            const __VLS_526 = __VLS_asFunctionalComponent(__VLS_525, new __VLS_525({
                key: (key),
                label: (__VLS_ctx.resultFieldLabel(key)),
            }));
            const __VLS_527 = __VLS_526({
                key: (key),
                label: (__VLS_ctx.resultFieldLabel(key)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_526));
            __VLS_528.slots.default;
            (__VLS_ctx.displayResultValue(value));
            var __VLS_528;
        }
        var __VLS_524;
        var __VLS_520;
    }
    var __VLS_516;
}
var __VLS_488;
const __VLS_529 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_530 = __VLS_asFunctionalComponent(__VLS_529, new __VLS_529({
    label: "测试记录",
    name: "history",
}));
const __VLS_531 = __VLS_530({
    label: "测试记录",
    name: "history",
}, ...__VLS_functionalComponentArgsRest(__VLS_530));
__VLS_532.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "capability-result-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_533 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_534 = __VLS_asFunctionalComponent(__VLS_533, new __VLS_533({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
    loading: (__VLS_ctx.capabilityTestHistoryLoading),
}));
const __VLS_535 = __VLS_534({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
    loading: (__VLS_ctx.capabilityTestHistoryLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_534));
let __VLS_537;
let __VLS_538;
let __VLS_539;
const __VLS_540 = {
    onClick: (__VLS_ctx.loadCapabilityTestHistory)
};
__VLS_536.slots.default;
var __VLS_536;
if (__VLS_ctx.capabilityTestHistory.length) {
    const __VLS_541 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_542 = __VLS_asFunctionalComponent(__VLS_541, new __VLS_541({
        data: (__VLS_ctx.capabilityTestHistory),
        stripe: true,
        size: "small",
        maxHeight: "360",
    }));
    const __VLS_543 = __VLS_542({
        data: (__VLS_ctx.capabilityTestHistory),
        stripe: true,
        size: "small",
        maxHeight: "360",
    }, ...__VLS_functionalComponentArgsRest(__VLS_542));
    __VLS_544.slots.default;
    const __VLS_545 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_546 = __VLS_asFunctionalComponent(__VLS_545, new __VLS_545({
        label: "时间",
        minWidth: "145",
    }));
    const __VLS_547 = __VLS_546({
        label: "时间",
        minWidth: "145",
    }, ...__VLS_functionalComponentArgsRest(__VLS_546));
    __VLS_548.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_548.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.formatDateTime(row.created_at));
    }
    var __VLS_548;
    const __VLS_549 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_550 = __VLS_asFunctionalComponent(__VLS_549, new __VLS_549({
        label: "状态",
        width: "100",
    }));
    const __VLS_551 = __VLS_550({
        label: "状态",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_550));
    __VLS_552.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_552.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_553 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_554 = __VLS_asFunctionalComponent(__VLS_553, new __VLS_553({
            type: (row.status === 'SUCCESS' ? 'success' : 'warning'),
            size: "small",
        }));
        const __VLS_555 = __VLS_554({
            type: (row.status === 'SUCCESS' ? 'success' : 'warning'),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_554));
        __VLS_556.slots.default;
        (row.status);
        var __VLS_556;
    }
    var __VLS_552;
    const __VLS_557 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_558 = __VLS_asFunctionalComponent(__VLS_557, new __VLS_557({
        label: "Trace",
        width: "100",
    }));
    const __VLS_559 = __VLS_558({
        label: "Trace",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_558));
    __VLS_560.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_560.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        (row.trace_id?.slice(0, 8));
    }
    var __VLS_560;
    const __VLS_561 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_562 = __VLS_asFunctionalComponent(__VLS_561, new __VLS_561({
        label: "结果",
        minWidth: "120",
    }));
    const __VLS_563 = __VLS_562({
        label: "结果",
        minWidth: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_562));
    __VLS_564.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_564.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        ((row.response_summary?.rows || []).length);
    }
    var __VLS_564;
    const __VLS_565 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_566 = __VLS_asFunctionalComponent(__VLS_565, new __VLS_565({
        label: "操作",
        width: "70",
    }));
    const __VLS_567 = __VLS_566({
        label: "操作",
        width: "70",
    }, ...__VLS_functionalComponentArgsRest(__VLS_566));
    __VLS_568.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_568.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_569 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_570 = __VLS_asFunctionalComponent(__VLS_569, new __VLS_569({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            size: "small",
        }));
        const __VLS_571 = __VLS_570({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_570));
        let __VLS_573;
        let __VLS_574;
        let __VLS_575;
        const __VLS_576 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.capabilityTestHistory.length))
                    return;
                __VLS_ctx.viewCapabilityTestRun(row);
            }
        };
        __VLS_572.slots.default;
        var __VLS_572;
    }
    var __VLS_568;
    var __VLS_544;
}
else if (!__VLS_ctx.capabilityTestHistoryLoading) {
    const __VLS_577 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_578 = __VLS_asFunctionalComponent(__VLS_577, new __VLS_577({
        description: "暂无测试记录",
        imageSize: (56),
    }));
    const __VLS_579 = __VLS_578({
        description: "暂无测试记录",
        imageSize: (56),
    }, ...__VLS_functionalComponentArgsRest(__VLS_578));
}
var __VLS_532;
var __VLS_484;
var __VLS_480;
const __VLS_581 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_582 = __VLS_asFunctionalComponent(__VLS_581, new __VLS_581({
    modelValue: (__VLS_ctx.credentialEditVisible),
    title: "编辑凭证",
    width: "520px",
}));
const __VLS_583 = __VLS_582({
    modelValue: (__VLS_ctx.credentialEditVisible),
    title: "编辑凭证",
    width: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_582));
__VLS_584.slots.default;
const __VLS_585 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_586 = __VLS_asFunctionalComponent(__VLS_585, new __VLS_585({
    model: (__VLS_ctx.credentialEditForm),
    labelWidth: "105px",
}));
const __VLS_587 = __VLS_586({
    model: (__VLS_ctx.credentialEditForm),
    labelWidth: "105px",
}, ...__VLS_functionalComponentArgsRest(__VLS_586));
__VLS_588.slots.default;
const __VLS_589 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_590 = __VLS_asFunctionalComponent(__VLS_589, new __VLS_589({
    label: "凭证名称",
    required: true,
}));
const __VLS_591 = __VLS_590({
    label: "凭证名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_590));
__VLS_592.slots.default;
const __VLS_593 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_594 = __VLS_asFunctionalComponent(__VLS_593, new __VLS_593({
    modelValue: (__VLS_ctx.credentialEditForm.credential_name),
}));
const __VLS_595 = __VLS_594({
    modelValue: (__VLS_ctx.credentialEditForm.credential_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_594));
var __VLS_592;
const __VLS_597 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_598 = __VLS_asFunctionalComponent(__VLS_597, new __VLS_597({
    label: "环境",
}));
const __VLS_599 = __VLS_598({
    label: "环境",
}, ...__VLS_functionalComponentArgsRest(__VLS_598));
__VLS_600.slots.default;
const __VLS_601 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_602 = __VLS_asFunctionalComponent(__VLS_601, new __VLS_601({
    modelValue: (__VLS_ctx.credentialEditForm.env_tag),
    ...{ style: {} },
}));
const __VLS_603 = __VLS_602({
    modelValue: (__VLS_ctx.credentialEditForm.env_tag),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_602));
__VLS_604.slots.default;
const __VLS_605 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_606 = __VLS_asFunctionalComponent(__VLS_605, new __VLS_605({
    label: "生产",
    value: "prod",
}));
const __VLS_607 = __VLS_606({
    label: "生产",
    value: "prod",
}, ...__VLS_functionalComponentArgsRest(__VLS_606));
const __VLS_609 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_610 = __VLS_asFunctionalComponent(__VLS_609, new __VLS_609({
    label: "测试",
    value: "staging",
}));
const __VLS_611 = __VLS_610({
    label: "测试",
    value: "staging",
}, ...__VLS_functionalComponentArgsRest(__VLS_610));
const __VLS_613 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_614 = __VLS_asFunctionalComponent(__VLS_613, new __VLS_613({
    label: "开发",
    value: "dev",
}));
const __VLS_615 = __VLS_614({
    label: "开发",
    value: "dev",
}, ...__VLS_functionalComponentArgsRest(__VLS_614));
const __VLS_617 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_618 = __VLS_asFunctionalComponent(__VLS_617, new __VLS_617({
    label: "备份",
    value: "backup",
}));
const __VLS_619 = __VLS_618({
    label: "备份",
    value: "backup",
}, ...__VLS_functionalComponentArgsRest(__VLS_618));
var __VLS_604;
var __VLS_600;
/** @type {[typeof CredentialForm, ]} */ ;
// @ts-ignore
const __VLS_621 = __VLS_asFunctionalComponent(CredentialForm, new CredentialForm({
    modelValue: (__VLS_ctx.credentialEditForm),
    editMode: (true),
}));
const __VLS_622 = __VLS_621({
    modelValue: (__VLS_ctx.credentialEditForm),
    editMode: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_621));
const __VLS_624 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_625 = __VLS_asFunctionalComponent(__VLS_624, new __VLS_624({
    label: "说明",
}));
const __VLS_626 = __VLS_625({
    label: "说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_625));
__VLS_627.slots.default;
const __VLS_628 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_629 = __VLS_asFunctionalComponent(__VLS_628, new __VLS_628({
    modelValue: (__VLS_ctx.credentialEditForm.description),
    type: "textarea",
}));
const __VLS_630 = __VLS_629({
    modelValue: (__VLS_ctx.credentialEditForm.description),
    type: "textarea",
}, ...__VLS_functionalComponentArgsRest(__VLS_629));
var __VLS_627;
var __VLS_588;
{
    const { footer: __VLS_thisSlot } = __VLS_584.slots;
    const __VLS_632 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_633 = __VLS_asFunctionalComponent(__VLS_632, new __VLS_632({
        ...{ 'onClick': {} },
    }));
    const __VLS_634 = __VLS_633({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_633));
    let __VLS_636;
    let __VLS_637;
    let __VLS_638;
    const __VLS_639 = {
        onClick: (...[$event]) => {
            __VLS_ctx.credentialEditVisible = false;
        }
    };
    __VLS_635.slots.default;
    var __VLS_635;
    const __VLS_640 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_641 = __VLS_asFunctionalComponent(__VLS_640, new __VLS_640({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_642 = __VLS_641({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_641));
    let __VLS_644;
    let __VLS_645;
    let __VLS_646;
    const __VLS_647 = {
        onClick: (__VLS_ctx.saveCredentialEdit)
    };
    __VLS_643.slots.default;
    var __VLS_643;
}
var __VLS_584;
const __VLS_648 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_649 = __VLS_asFunctionalComponent(__VLS_648, new __VLS_648({
    modelValue: (__VLS_ctx.resourceDrawerOpen),
    title: (__VLS_ctx.activeResource ? `资源：${__VLS_ctx.activeResource.resource_name}` : '资源详情'),
    size: "560px",
    direction: "rtl",
}));
const __VLS_650 = __VLS_649({
    modelValue: (__VLS_ctx.resourceDrawerOpen),
    title: (__VLS_ctx.activeResource ? `资源：${__VLS_ctx.activeResource.resource_name}` : '资源详情'),
    size: "560px",
    direction: "rtl",
}, ...__VLS_functionalComponentArgsRest(__VLS_649));
__VLS_651.slots.default;
if (__VLS_ctx.activeResource) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "resource-detail" },
    });
    const __VLS_652 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_653 = __VLS_asFunctionalComponent(__VLS_652, new __VLS_652({
        model: (__VLS_ctx.resourceEditForm),
        labelWidth: "100px",
    }));
    const __VLS_654 = __VLS_653({
        model: (__VLS_ctx.resourceEditForm),
        labelWidth: "100px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_653));
    __VLS_655.slots.default;
    const __VLS_656 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_657 = __VLS_asFunctionalComponent(__VLS_656, new __VLS_656({
        label: "资源编码",
    }));
    const __VLS_658 = __VLS_657({
        label: "资源编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_657));
    __VLS_659.slots.default;
    const __VLS_660 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_661 = __VLS_asFunctionalComponent(__VLS_660, new __VLS_660({
        modelValue: (__VLS_ctx.activeResource.resource_code),
        disabled: true,
    }));
    const __VLS_662 = __VLS_661({
        modelValue: (__VLS_ctx.activeResource.resource_code),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_661));
    var __VLS_659;
    const __VLS_664 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_665 = __VLS_asFunctionalComponent(__VLS_664, new __VLS_664({
        label: "资源名称",
    }));
    const __VLS_666 = __VLS_665({
        label: "资源名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_665));
    __VLS_667.slots.default;
    const __VLS_668 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_669 = __VLS_asFunctionalComponent(__VLS_668, new __VLS_668({
        modelValue: (__VLS_ctx.resourceEditForm.resource_name),
    }));
    const __VLS_670 = __VLS_669({
        modelValue: (__VLS_ctx.resourceEditForm.resource_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_669));
    var __VLS_667;
    const __VLS_672 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_673 = __VLS_asFunctionalComponent(__VLS_672, new __VLS_672({
        label: "凭证",
    }));
    const __VLS_674 = __VLS_673({
        label: "凭证",
    }, ...__VLS_functionalComponentArgsRest(__VLS_673));
    __VLS_675.slots.default;
    const __VLS_676 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_677 = __VLS_asFunctionalComponent(__VLS_676, new __VLS_676({
        modelValue: (__VLS_ctx.resourceEditForm.credential_id),
        placeholder: "选择凭证",
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_678 = __VLS_677({
        modelValue: (__VLS_ctx.resourceEditForm.credential_id),
        placeholder: "选择凭证",
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_677));
    __VLS_679.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.credentials))) {
        const __VLS_680 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_681 = __VLS_asFunctionalComponent(__VLS_680, new __VLS_680({
            key: (c.id),
            label: (`${c.credential_name} (${c.auth_type})`),
            value: (c.id),
        }));
        const __VLS_682 = __VLS_681({
            key: (c.id),
            label: (`${c.credential_name} (${c.auth_type})`),
            value: (c.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_681));
    }
    var __VLS_679;
    var __VLS_675;
    const __VLS_684 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_685 = __VLS_asFunctionalComponent(__VLS_684, new __VLS_684({
        label: "状态",
    }));
    const __VLS_686 = __VLS_685({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_685));
    __VLS_687.slots.default;
    const __VLS_688 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_689 = __VLS_asFunctionalComponent(__VLS_688, new __VLS_688({
        modelValue: (__VLS_ctx.resourceEditForm.status),
    }));
    const __VLS_690 = __VLS_689({
        modelValue: (__VLS_ctx.resourceEditForm.status),
    }, ...__VLS_functionalComponentArgsRest(__VLS_689));
    __VLS_691.slots.default;
    const __VLS_692 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_693 = __VLS_asFunctionalComponent(__VLS_692, new __VLS_692({
        value: (0),
    }));
    const __VLS_694 = __VLS_693({
        value: (0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_693));
    __VLS_695.slots.default;
    var __VLS_695;
    const __VLS_696 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_697 = __VLS_asFunctionalComponent(__VLS_696, new __VLS_696({
        value: (1),
    }));
    const __VLS_698 = __VLS_697({
        value: (1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_697));
    __VLS_699.slots.default;
    var __VLS_699;
    const __VLS_700 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_701 = __VLS_asFunctionalComponent(__VLS_700, new __VLS_700({
        value: (2),
    }));
    const __VLS_702 = __VLS_701({
        value: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_701));
    __VLS_703.slots.default;
    var __VLS_703;
    var __VLS_691;
    var __VLS_687;
    if (__VLS_ctx.editSchema) {
        /** @type {[typeof SchemaFormField, ]} */ ;
        // @ts-ignore
        const __VLS_704 = __VLS_asFunctionalComponent(SchemaFormField, new SchemaFormField({
            schema: (__VLS_ctx.editSchema),
            modelValue: (__VLS_ctx.editFormValues),
            title: "配置（schema 驱动）",
            emptyText: "当前 adapter 未注册 schema, 无扩展字段。",
        }));
        const __VLS_705 = __VLS_704({
            schema: (__VLS_ctx.editSchema),
            modelValue: (__VLS_ctx.editFormValues),
            title: "配置（schema 驱动）",
            emptyText: "当前 adapter 未注册 schema, 无扩展字段。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_704));
    }
    var __VLS_655;
    if (__VLS_ctx.resourceEditForm.connector_type === '__legacy_bitable__') {
        const __VLS_707 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_708 = __VLS_asFunctionalComponent(__VLS_707, new __VLS_707({
            contentPosition: "left",
        }));
        const __VLS_709 = __VLS_708({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_708));
        __VLS_710.slots.default;
        var __VLS_710;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "resource-object-toolbar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_711 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_712 = __VLS_asFunctionalComponent(__VLS_711, new __VLS_711({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }));
        const __VLS_713 = __VLS_712({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_712));
        let __VLS_715;
        let __VLS_716;
        let __VLS_717;
        const __VLS_718 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeResource))
                    return;
                if (!(__VLS_ctx.resourceEditForm.connector_type === '__legacy_bitable__'))
                    return;
                __VLS_ctx.openBitableTableDialog();
            }
        };
        __VLS_714.slots.default;
        var __VLS_714;
        const __VLS_719 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_720 = __VLS_asFunctionalComponent(__VLS_719, new __VLS_719({
            data: (__VLS_ctx.bitableTables),
            size: "small",
            maxHeight: "240",
        }));
        const __VLS_721 = __VLS_720({
            data: (__VLS_ctx.bitableTables),
            size: "small",
            maxHeight: "240",
        }, ...__VLS_functionalComponentArgsRest(__VLS_720));
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.bitableTablesLoading) }, null, null);
        __VLS_722.slots.default;
        const __VLS_723 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_724 = __VLS_asFunctionalComponent(__VLS_723, new __VLS_723({
            prop: "object_name",
            label: "名称",
            minWidth: "110",
        }));
        const __VLS_725 = __VLS_724({
            prop: "object_name",
            label: "名称",
            minWidth: "110",
        }, ...__VLS_functionalComponentArgsRest(__VLS_724));
        const __VLS_727 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_728 = __VLS_asFunctionalComponent(__VLS_727, new __VLS_727({
            prop: "object_code",
            label: "编码",
            minWidth: "130",
        }));
        const __VLS_729 = __VLS_728({
            prop: "object_code",
            label: "编码",
            minWidth: "130",
        }, ...__VLS_functionalComponentArgsRest(__VLS_728));
        const __VLS_731 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_732 = __VLS_asFunctionalComponent(__VLS_731, new __VLS_731({
            prop: "table_id_masked",
            label: "数据表",
            minWidth: "100",
        }));
        const __VLS_733 = __VLS_732({
            prop: "table_id_masked",
            label: "数据表",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_732));
        const __VLS_735 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_736 = __VLS_asFunctionalComponent(__VLS_735, new __VLS_735({
            label: "状态",
            width: "70",
        }));
        const __VLS_737 = __VLS_736({
            label: "状态",
            width: "70",
        }, ...__VLS_functionalComponentArgsRest(__VLS_736));
        __VLS_738.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_738.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_739 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_740 = __VLS_asFunctionalComponent(__VLS_739, new __VLS_739({
                type: (row.is_active ? 'success' : 'info'),
                size: "small",
            }));
            const __VLS_741 = __VLS_740({
                type: (row.is_active ? 'success' : 'info'),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_740));
            __VLS_742.slots.default;
            (row.is_active ? '启用' : '停用');
            var __VLS_742;
        }
        var __VLS_738;
        const __VLS_743 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_744 = __VLS_asFunctionalComponent(__VLS_743, new __VLS_743({
            label: "操作",
            width: "160",
        }));
        const __VLS_745 = __VLS_744({
            label: "操作",
            width: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_744));
        __VLS_746.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_746.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_747 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_748 = __VLS_asFunctionalComponent(__VLS_747, new __VLS_747({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
            }));
            const __VLS_749 = __VLS_748({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_748));
            let __VLS_751;
            let __VLS_752;
            let __VLS_753;
            const __VLS_754 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeResource))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type === '__legacy_bitable__'))
                        return;
                    __VLS_ctx.openBitableTableDialog(row);
                }
            };
            __VLS_750.slots.default;
            var __VLS_750;
            const __VLS_755 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_756 = __VLS_asFunctionalComponent(__VLS_755, new __VLS_755({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
            }));
            const __VLS_757 = __VLS_756({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_756));
            let __VLS_759;
            let __VLS_760;
            let __VLS_761;
            const __VLS_762 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeResource))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type === '__legacy_bitable__'))
                        return;
                    __VLS_ctx.previewBitableTable(row);
                }
            };
            __VLS_758.slots.default;
            var __VLS_758;
            const __VLS_763 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_764 = __VLS_asFunctionalComponent(__VLS_763, new __VLS_763({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                size: "small",
            }));
            const __VLS_765 = __VLS_764({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_764));
            let __VLS_767;
            let __VLS_768;
            let __VLS_769;
            const __VLS_770 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeResource))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type === '__legacy_bitable__'))
                        return;
                    __VLS_ctx.removeBitableTable(row);
                }
            };
            __VLS_766.slots.default;
            var __VLS_766;
        }
        var __VLS_746;
        var __VLS_722;
        if (!__VLS_ctx.bitableTablesLoading && __VLS_ctx.bitableTables.length === 0) {
            const __VLS_771 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_772 = __VLS_asFunctionalComponent(__VLS_771, new __VLS_771({
                description: "暂无数据对象，新增后可在流水线中选择具体表",
                imageSize: (50),
            }));
            const __VLS_773 = __VLS_772({
                description: "暂无数据对象，新增后可在流水线中选择具体表",
                imageSize: (50),
            }, ...__VLS_functionalComponentArgsRest(__VLS_772));
        }
    }
    if (__VLS_ctx.resourceEditForm.connector_type && __VLS_ctx.resourceEditForm.connector_type !== '__legacy_bitable__') {
        const __VLS_775 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_776 = __VLS_asFunctionalComponent(__VLS_775, new __VLS_775({
            contentPosition: "left",
        }));
        const __VLS_777 = __VLS_776({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_776));
        __VLS_778.slots.default;
        (__VLS_ctx.connectorObjectLabel(__VLS_ctx.resourceEditForm.connector_type));
        var __VLS_778;
        if (__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "resource-object-toolbar" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_779 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_780 = __VLS_asFunctionalComponent(__VLS_779, new __VLS_779({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }));
            const __VLS_781 = __VLS_780({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_780));
            let __VLS_783;
            let __VLS_784;
            let __VLS_785;
            const __VLS_786 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeResource))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type && __VLS_ctx.resourceEditForm.connector_type !== '__legacy_bitable__'))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress'))
                        return;
                    __VLS_ctx.openDataObjectDialog();
                }
            };
            __VLS_782.slots.default;
            var __VLS_782;
        }
        if (__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress' && __VLS_ctx.dataObjects.length) {
            const __VLS_787 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_788 = __VLS_asFunctionalComponent(__VLS_787, new __VLS_787({
                data: (__VLS_ctx.dataObjects),
                size: "small",
                border: true,
                ...{ style: {} },
            }));
            const __VLS_789 = __VLS_788({
                data: (__VLS_ctx.dataObjects),
                size: "small",
                border: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_788));
            __VLS_790.slots.default;
            const __VLS_791 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_792 = __VLS_asFunctionalComponent(__VLS_791, new __VLS_791({
                prop: "object_code",
                label: "编码",
                minWidth: "120",
            }));
            const __VLS_793 = __VLS_792({
                prop: "object_code",
                label: "编码",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_792));
            const __VLS_795 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_796 = __VLS_asFunctionalComponent(__VLS_795, new __VLS_795({
                prop: "object_name",
                label: "名称",
                minWidth: "140",
            }));
            const __VLS_797 = __VLS_796({
                prop: "object_name",
                label: "名称",
                minWidth: "140",
            }, ...__VLS_functionalComponentArgsRest(__VLS_796));
            const __VLS_799 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_800 = __VLS_asFunctionalComponent(__VLS_799, new __VLS_799({
                label: "状态",
                width: "76",
            }));
            const __VLS_801 = __VLS_800({
                label: "状态",
                width: "76",
            }, ...__VLS_functionalComponentArgsRest(__VLS_800));
            __VLS_802.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_802.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_803 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_804 = __VLS_asFunctionalComponent(__VLS_803, new __VLS_803({
                    size: "small",
                    type: (row.is_active ? 'success' : 'info'),
                }));
                const __VLS_805 = __VLS_804({
                    size: "small",
                    type: (row.is_active ? 'success' : 'info'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_804));
                __VLS_806.slots.default;
                (row.is_active ? '启用' : '停用');
                var __VLS_806;
            }
            var __VLS_802;
            const __VLS_807 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_808 = __VLS_asFunctionalComponent(__VLS_807, new __VLS_807({
                label: "操作",
                width: "130",
            }));
            const __VLS_809 = __VLS_808({
                label: "操作",
                width: "130",
            }, ...__VLS_functionalComponentArgsRest(__VLS_808));
            __VLS_810.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_810.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_811 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_812 = __VLS_asFunctionalComponent(__VLS_811, new __VLS_811({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }));
                const __VLS_813 = __VLS_812({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_812));
                let __VLS_815;
                let __VLS_816;
                let __VLS_817;
                const __VLS_818 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type && __VLS_ctx.resourceEditForm.connector_type !== '__legacy_bitable__'))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress' && __VLS_ctx.dataObjects.length))
                            return;
                        __VLS_ctx.openDataObjectDialog(row);
                    }
                };
                __VLS_814.slots.default;
                var __VLS_814;
                const __VLS_819 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_820 = __VLS_asFunctionalComponent(__VLS_819, new __VLS_819({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                    size: "small",
                }));
                const __VLS_821 = __VLS_820({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_820));
                let __VLS_823;
                let __VLS_824;
                let __VLS_825;
                const __VLS_826 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type && __VLS_ctx.resourceEditForm.connector_type !== '__legacy_bitable__'))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress' && __VLS_ctx.dataObjects.length))
                            return;
                        __VLS_ctx.removeDataObject(row);
                    }
                };
                __VLS_822.slots.default;
                var __VLS_822;
            }
            var __VLS_810;
            var __VLS_790;
        }
        else if (__VLS_ctx.resourceEditForm.connector_type !== 'webhook_ingress') {
            const __VLS_827 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_828 = __VLS_asFunctionalComponent(__VLS_827, new __VLS_827({
                description: "暂无数据对象，新增后可在流水线中选择",
                imageSize: (50),
            }));
            const __VLS_829 = __VLS_828({
                description: "暂无数据对象，新增后可在流水线中选择",
                imageSize: (50),
            }, ...__VLS_functionalComponentArgsRest(__VLS_828));
        }
    }
    if (__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress') {
        const __VLS_831 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_832 = __VLS_asFunctionalComponent(__VLS_831, new __VLS_831({
            contentPosition: "left",
        }));
        const __VLS_833 = __VLS_832({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_832));
        __VLS_834.slots.default;
        var __VLS_834;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "resource-object-toolbar" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_835 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_836 = __VLS_asFunctionalComponent(__VLS_835, new __VLS_835({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }));
        const __VLS_837 = __VLS_836({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_836));
        let __VLS_839;
        let __VLS_840;
        let __VLS_841;
        const __VLS_842 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeResource))
                    return;
                if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                    return;
                __VLS_ctx.openEventObjectDialog();
            }
        };
        __VLS_838.slots.default;
        var __VLS_838;
        if (__VLS_ctx.eventObjects.length) {
            const __VLS_843 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_844 = __VLS_asFunctionalComponent(__VLS_843, new __VLS_843({
                data: (__VLS_ctx.eventObjects),
                size: "small",
                border: true,
                ...{ style: {} },
            }));
            const __VLS_845 = __VLS_844({
                data: (__VLS_ctx.eventObjects),
                size: "small",
                border: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_844));
            __VLS_846.slots.default;
            const __VLS_847 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_848 = __VLS_asFunctionalComponent(__VLS_847, new __VLS_847({
                prop: "object_code",
                label: "事件编码",
                minWidth: "135",
            }));
            const __VLS_849 = __VLS_848({
                prop: "object_code",
                label: "事件编码",
                minWidth: "135",
            }, ...__VLS_functionalComponentArgsRest(__VLS_848));
            const __VLS_851 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_852 = __VLS_asFunctionalComponent(__VLS_851, new __VLS_851({
                prop: "object_name",
                label: "事件名称",
                minWidth: "120",
            }));
            const __VLS_853 = __VLS_852({
                prop: "object_name",
                label: "事件名称",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_852));
            const __VLS_855 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_856 = __VLS_asFunctionalComponent(__VLS_855, new __VLS_855({
                label: "定义版本",
                width: "100",
            }));
            const __VLS_857 = __VLS_856({
                label: "定义版本",
                width: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_856));
            __VLS_858.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_858.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                (row.event_definition?.version || row.schema_version || '-');
            }
            var __VLS_858;
            const __VLS_859 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_860 = __VLS_asFunctionalComponent(__VLS_859, new __VLS_859({
                label: "启用",
                width: "70",
            }));
            const __VLS_861 = __VLS_860({
                label: "启用",
                width: "70",
            }, ...__VLS_functionalComponentArgsRest(__VLS_860));
            __VLS_862.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_862.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_863 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_864 = __VLS_asFunctionalComponent(__VLS_863, new __VLS_863({
                    size: "small",
                    type: (row.is_active ? 'success' : 'info'),
                }));
                const __VLS_865 = __VLS_864({
                    size: "small",
                    type: (row.is_active ? 'success' : 'info'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_864));
                __VLS_866.slots.default;
                (row.is_active ? '启用' : '停用');
                var __VLS_866;
            }
            var __VLS_862;
            const __VLS_867 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_868 = __VLS_asFunctionalComponent(__VLS_867, new __VLS_867({
                prop: "verification_status",
                label: "验证状态",
                minWidth: "100",
            }));
            const __VLS_869 = __VLS_868({
                prop: "verification_status",
                label: "验证状态",
                minWidth: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_868));
            const __VLS_871 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_872 = __VLS_asFunctionalComponent(__VLS_871, new __VLS_871({
                label: "操作",
                width: "190",
            }));
            const __VLS_873 = __VLS_872({
                label: "操作",
                width: "190",
            }, ...__VLS_functionalComponentArgsRest(__VLS_872));
            __VLS_874.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_874.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                const __VLS_875 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_876 = __VLS_asFunctionalComponent(__VLS_875, new __VLS_875({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }));
                const __VLS_877 = __VLS_876({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_876));
                let __VLS_879;
                let __VLS_880;
                let __VLS_881;
                const __VLS_882 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                            return;
                        if (!(__VLS_ctx.eventObjects.length))
                            return;
                        __VLS_ctx.openEventObjectDialog(row);
                    }
                };
                __VLS_878.slots.default;
                var __VLS_878;
                const __VLS_883 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_884 = __VLS_asFunctionalComponent(__VLS_883, new __VLS_883({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }));
                const __VLS_885 = __VLS_884({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_884));
                let __VLS_887;
                let __VLS_888;
                let __VLS_889;
                const __VLS_890 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                            return;
                        if (!(__VLS_ctx.eventObjects.length))
                            return;
                        __VLS_ctx.verifyEventObject(row);
                    }
                };
                __VLS_886.slots.default;
                var __VLS_886;
                const __VLS_891 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_892 = __VLS_asFunctionalComponent(__VLS_891, new __VLS_891({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                    size: "small",
                }));
                const __VLS_893 = __VLS_892({
                    ...{ 'onClick': {} },
                    link: true,
                    type: "danger",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_892));
                let __VLS_895;
                let __VLS_896;
                let __VLS_897;
                const __VLS_898 = {
                    onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                            return;
                        if (!(__VLS_ctx.eventObjects.length))
                            return;
                        __VLS_ctx.removeEventObject(row);
                    }
                };
                __VLS_894.slots.default;
                var __VLS_894;
            }
            var __VLS_874;
            var __VLS_846;
        }
        else {
            const __VLS_899 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_900 = __VLS_asFunctionalComponent(__VLS_899, new __VLS_899({
                description: "暂无事件，新增后可在流水线触发器中选择",
                imageSize: (50),
            }));
            const __VLS_901 = __VLS_900({
                description: "暂无事件，新增后可在流水线触发器中选择",
                imageSize: (50),
            }, ...__VLS_functionalComponentArgsRest(__VLS_900));
        }
    }
    if (__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress') {
        const __VLS_903 = {}.ElDivider;
        /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
        // @ts-ignore
        const __VLS_904 = __VLS_asFunctionalComponent(__VLS_903, new __VLS_903({
            contentPosition: "left",
        }));
        const __VLS_905 = __VLS_904({
            contentPosition: "left",
        }, ...__VLS_functionalComponentArgsRest(__VLS_904));
        __VLS_906.slots.default;
        var __VLS_906;
        const __VLS_907 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_908 = __VLS_asFunctionalComponent(__VLS_907, new __VLS_907({
            type: "info",
            closable: (false),
            title: "验签 Header、请求解析路径、最大包体等共用入站规则由资源模板维护；此处仅展示端点、绑定凭证和允许的环境限流覆盖。",
            ...{ style: {} },
        }));
        const __VLS_909 = __VLS_908({
            type: "info",
            closable: (false),
            title: "验签 Header、请求解析路径、最大包体等共用入站规则由资源模板维护；此处仅展示端点、绑定凭证和允许的环境限流覆盖。",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_908));
        const __VLS_911 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_912 = __VLS_asFunctionalComponent(__VLS_911, new __VLS_911({
            label: "来源资源模板",
        }));
        const __VLS_913 = __VLS_912({
            label: "来源资源模板",
        }, ...__VLS_functionalComponentArgsRest(__VLS_912));
        __VLS_914.slots.default;
        const __VLS_915 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_916 = __VLS_asFunctionalComponent(__VLS_915, new __VLS_915({
            modelValue: (__VLS_ctx.activeResource?.resource_template_code || '历史资源（未记录模板来源）'),
            readonly: true,
        }));
        const __VLS_917 = __VLS_916({
            modelValue: (__VLS_ctx.activeResource?.resource_template_code || '历史资源（未记录模板来源）'),
            readonly: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_916));
        var __VLS_914;
        const __VLS_919 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_920 = __VLS_asFunctionalComponent(__VLS_919, new __VLS_919({
            label: "接收地址",
        }));
        const __VLS_921 = __VLS_920({
            label: "接收地址",
        }, ...__VLS_functionalComponentArgsRest(__VLS_920));
        __VLS_922.slots.default;
        const __VLS_923 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_924 = __VLS_asFunctionalComponent(__VLS_923, new __VLS_923({
            modelValue: (__VLS_ctx.webhookUrl(__VLS_ctx.activeResource)),
            readonly: true,
        }));
        const __VLS_925 = __VLS_924({
            modelValue: (__VLS_ctx.webhookUrl(__VLS_ctx.activeResource)),
            readonly: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_924));
        __VLS_926.slots.default;
        {
            const { append: __VLS_thisSlot } = __VLS_926.slots;
            const __VLS_927 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_928 = __VLS_asFunctionalComponent(__VLS_927, new __VLS_927({
                ...{ 'onClick': {} },
            }));
            const __VLS_929 = __VLS_928({
                ...{ 'onClick': {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_928));
            let __VLS_931;
            let __VLS_932;
            let __VLS_933;
            const __VLS_934 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.activeResource))
                        return;
                    if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                        return;
                    __VLS_ctx.copyWebhookUrl(__VLS_ctx.activeResource);
                }
            };
            __VLS_930.slots.default;
            var __VLS_930;
        }
        var __VLS_926;
        var __VLS_922;
        const __VLS_935 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_936 = __VLS_asFunctionalComponent(__VLS_935, new __VLS_935({
            label: "操作",
        }));
        const __VLS_937 = __VLS_936({
            label: "操作",
        }, ...__VLS_functionalComponentArgsRest(__VLS_936));
        __VLS_938.slots.default;
        const __VLS_939 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_940 = __VLS_asFunctionalComponent(__VLS_939, new __VLS_939({
            ...{ 'onClick': {} },
        }));
        const __VLS_941 = __VLS_940({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_940));
        let __VLS_943;
        let __VLS_944;
        let __VLS_945;
        const __VLS_946 = {
            onClick: (__VLS_ctx.openResourceTemplateConfig)
        };
        __VLS_942.slots.default;
        var __VLS_942;
        const __VLS_947 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_948 = __VLS_asFunctionalComponent(__VLS_947, new __VLS_947({
            ...{ 'onClick': {} },
        }));
        const __VLS_949 = __VLS_948({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_948));
        let __VLS_951;
        let __VLS_952;
        let __VLS_953;
        const __VLS_954 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeResource))
                    return;
                if (!(__VLS_ctx.resourceEditForm.connector_type === 'webhook_ingress'))
                    return;
                __VLS_ctx.webhookOverrideEditing = !__VLS_ctx.webhookOverrideEditing;
            }
        };
        __VLS_950.slots.default;
        (__VLS_ctx.webhookOverrideEditing ? '取消环境覆盖编辑' : '编辑环境覆盖');
        var __VLS_950;
        const __VLS_955 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_956 = __VLS_asFunctionalComponent(__VLS_955, new __VLS_955({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.webhookVerifying),
        }));
        const __VLS_957 = __VLS_956({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.webhookVerifying),
        }, ...__VLS_functionalComponentArgsRest(__VLS_956));
        let __VLS_959;
        let __VLS_960;
        let __VLS_961;
        const __VLS_962 = {
            onClick: (__VLS_ctx.verifyWebhookResource)
        };
        __VLS_958.slots.default;
        var __VLS_958;
        var __VLS_938;
        const __VLS_963 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_964 = __VLS_asFunctionalComponent(__VLS_963, new __VLS_963({
            label: "环境覆盖",
        }));
        const __VLS_965 = __VLS_964({
            label: "环境覆盖",
        }, ...__VLS_functionalComponentArgsRest(__VLS_964));
        __VLS_966.slots.default;
        if (__VLS_ctx.webhookOverrideEditing) {
            const __VLS_967 = {}.ElInputNumber;
            /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
            // @ts-ignore
            const __VLS_968 = __VLS_asFunctionalComponent(__VLS_967, new __VLS_967({
                modelValue: (__VLS_ctx.webhookIngressForm.rate_limit_per_minute),
                min: (1),
                max: (100000),
            }));
            const __VLS_969 = __VLS_968({
                modelValue: (__VLS_ctx.webhookIngressForm.rate_limit_per_minute),
                min: (1),
                max: (100000),
            }, ...__VLS_functionalComponentArgsRest(__VLS_968));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            const __VLS_971 = {}.ElInputNumber;
            /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
            // @ts-ignore
            const __VLS_972 = __VLS_asFunctionalComponent(__VLS_971, new __VLS_971({
                modelValue: (__VLS_ctx.webhookIngressForm.rate_limit_burst),
                min: (1),
                max: (10000),
                ...{ style: {} },
            }));
            const __VLS_973 = __VLS_972({
                modelValue: (__VLS_ctx.webhookIngressForm.rate_limit_burst),
                min: (1),
                max: (10000),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_972));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        else {
            const __VLS_975 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_976 = __VLS_asFunctionalComponent(__VLS_975, new __VLS_975({
                type: "info",
            }));
            const __VLS_977 = __VLS_976({
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_976));
            __VLS_978.slots.default;
            (__VLS_ctx.webhookIngressForm.rate_limit_per_minute);
            (__VLS_ctx.webhookIngressForm.rate_limit_burst);
            var __VLS_978;
        }
        var __VLS_966;
        const __VLS_979 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_980 = __VLS_asFunctionalComponent(__VLS_979, new __VLS_979({
            label: "验证",
        }));
        const __VLS_981 = __VLS_980({
            label: "验证",
        }, ...__VLS_functionalComponentArgsRest(__VLS_980));
        __VLS_982.slots.default;
        const __VLS_983 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_984 = __VLS_asFunctionalComponent(__VLS_983, new __VLS_983({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.webhookVerifying),
        }));
        const __VLS_985 = __VLS_984({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.webhookVerifying),
        }, ...__VLS_functionalComponentArgsRest(__VLS_984));
        let __VLS_987;
        let __VLS_988;
        let __VLS_989;
        const __VLS_990 = {
            onClick: (__VLS_ctx.verifyWebhookResource)
        };
        __VLS_986.slots.default;
        var __VLS_986;
        if (__VLS_ctx.activeResource.test_status) {
            const __VLS_991 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_992 = __VLS_asFunctionalComponent(__VLS_991, new __VLS_991({
                ...{ style: {} },
                type: (__VLS_ctx.activeResource.test_status === 'PASS' ? 'success' : 'info'),
            }));
            const __VLS_993 = __VLS_992({
                ...{ style: {} },
                type: (__VLS_ctx.activeResource.test_status === 'PASS' ? 'success' : 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_992));
            __VLS_994.slots.default;
            (__VLS_ctx.activeResource.test_status);
            var __VLS_994;
        }
        var __VLS_982;
    }
    const __VLS_995 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_996 = __VLS_asFunctionalComponent(__VLS_995, new __VLS_995({
        contentPosition: "left",
    }));
    const __VLS_997 = __VLS_996({
        contentPosition: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_996));
    __VLS_998.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_999 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1000 = __VLS_asFunctionalComponent(__VLS_999, new __VLS_999({}));
    const __VLS_1001 = __VLS_1000({}, ...__VLS_functionalComponentArgsRest(__VLS_1000));
    __VLS_1002.slots.default;
    const __VLS_1003 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_1004 = __VLS_asFunctionalComponent(__VLS_1003, new __VLS_1003({}));
    const __VLS_1005 = __VLS_1004({}, ...__VLS_functionalComponentArgsRest(__VLS_1004));
    var __VLS_1002;
    if (__VLS_ctx.usingPipelines) {
        const __VLS_1007 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_1008 = __VLS_asFunctionalComponent(__VLS_1007, new __VLS_1007({
            type: "info",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_1009 = __VLS_1008({
            type: "info",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1008));
        __VLS_1010.slots.default;
        (__VLS_ctx.usingPipelines.total);
        var __VLS_1010;
    }
    var __VLS_998;
    if (__VLS_ctx.usingPipelinesLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ref-loading" },
        });
        const __VLS_1011 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1012 = __VLS_asFunctionalComponent(__VLS_1011, new __VLS_1011({
            ...{ class: "is-loading" },
        }));
        const __VLS_1013 = __VLS_1012({
            ...{ class: "is-loading" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1012));
        __VLS_1014.slots.default;
        const __VLS_1015 = {}.Loading;
        /** @type {[typeof __VLS_components.Loading, ]} */ ;
        // @ts-ignore
        const __VLS_1016 = __VLS_asFunctionalComponent(__VLS_1015, new __VLS_1015({}));
        const __VLS_1017 = __VLS_1016({}, ...__VLS_functionalComponentArgsRest(__VLS_1016));
        var __VLS_1014;
    }
    else if (__VLS_ctx.usingPipelines && __VLS_ctx.usingPipelines.total === 0) {
        const __VLS_1019 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_1020 = __VLS_asFunctionalComponent(__VLS_1019, new __VLS_1019({
            imageSize: (60),
            description: "暂无流水线引用此资源",
        }));
        const __VLS_1021 = __VLS_1020({
            imageSize: (60),
            description: "暂无流水线引用此资源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1020));
    }
    else if (__VLS_ctx.usingPipelines) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ref-list" },
        });
        for (const [p] of __VLS_getVForSourceType((__VLS_ctx.usingPipelines.items))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.activeResource))
                            return;
                        if (!!(__VLS_ctx.usingPipelinesLoading))
                            return;
                        if (!!(__VLS_ctx.usingPipelines && __VLS_ctx.usingPipelines.total === 0))
                            return;
                        if (!(__VLS_ctx.usingPipelines))
                            return;
                        __VLS_ctx.goToPipeline(p.id);
                    } },
                key: (p.id),
                ...{ class: "ref-item" },
            });
            const __VLS_1023 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_1024 = __VLS_asFunctionalComponent(__VLS_1023, new __VLS_1023({
                ...{ class: "ref-icon" },
            }));
            const __VLS_1025 = __VLS_1024({
                ...{ class: "ref-icon" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_1024));
            __VLS_1026.slots.default;
            const __VLS_1027 = {}.Connection;
            /** @type {[typeof __VLS_components.Connection, ]} */ ;
            // @ts-ignore
            const __VLS_1028 = __VLS_asFunctionalComponent(__VLS_1027, new __VLS_1027({}));
            const __VLS_1029 = __VLS_1028({}, ...__VLS_functionalComponentArgsRest(__VLS_1028));
            var __VLS_1026;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ref-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ref-name" },
            });
            (p.pipeline_name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ref-code" },
            });
            (p.pipeline_code);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ref-meta" },
            });
            const __VLS_1031 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_1032 = __VLS_asFunctionalComponent(__VLS_1031, new __VLS_1031({
                size: "small",
                type: (__VLS_ctx.triggerTypeColor(p.trigger_type)),
            }));
            const __VLS_1033 = __VLS_1032({
                size: "small",
                type: (__VLS_ctx.triggerTypeColor(p.trigger_type)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1032));
            __VLS_1034.slots.default;
            (__VLS_ctx.triggerTypeLabel(p.trigger_type));
            var __VLS_1034;
            const __VLS_1035 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_1036 = __VLS_asFunctionalComponent(__VLS_1035, new __VLS_1035({
                size: "small",
                type: (__VLS_ctx.pipelineStatusColor(p.status)),
            }));
            const __VLS_1037 = __VLS_1036({
                size: "small",
                type: (__VLS_ctx.pipelineStatusColor(p.status)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1036));
            __VLS_1038.slots.default;
            (__VLS_ctx.pipelineStatusLabel(p.status));
            var __VLS_1038;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ref-steps" },
            });
            (p.step_count);
            (p.hit_steps.length);
            const __VLS_1039 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_1040 = __VLS_asFunctionalComponent(__VLS_1039, new __VLS_1039({
                ...{ class: "ref-arrow" },
            }));
            const __VLS_1041 = __VLS_1040({
                ...{ class: "ref-arrow" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_1040));
            __VLS_1042.slots.default;
            const __VLS_1043 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_1044 = __VLS_asFunctionalComponent(__VLS_1043, new __VLS_1043({}));
            const __VLS_1045 = __VLS_1044({}, ...__VLS_functionalComponentArgsRest(__VLS_1044));
            var __VLS_1042;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "drawer-footer" },
    });
    const __VLS_1047 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1048 = __VLS_asFunctionalComponent(__VLS_1047, new __VLS_1047({
        ...{ 'onClick': {} },
        type: "danger",
    }));
    const __VLS_1049 = __VLS_1048({
        ...{ 'onClick': {} },
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1048));
    let __VLS_1051;
    let __VLS_1052;
    let __VLS_1053;
    const __VLS_1054 = {
        onClick: (__VLS_ctx.confirmDeleteResource)
    };
    __VLS_1050.slots.default;
    var __VLS_1050;
    const __VLS_1055 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1056 = __VLS_asFunctionalComponent(__VLS_1055, new __VLS_1055({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_1057 = __VLS_1056({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1056));
    let __VLS_1059;
    let __VLS_1060;
    let __VLS_1061;
    const __VLS_1062 = {
        onClick: (__VLS_ctx.saveResource)
    };
    __VLS_1058.slots.default;
    var __VLS_1058;
}
const __VLS_1063 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1064 = __VLS_asFunctionalComponent(__VLS_1063, new __VLS_1063({
    modelValue: (__VLS_ctx.bitableDialogVisible),
    title: (__VLS_ctx.editingBitableTable ? '编辑数据对象' : '新增数据对象'),
    width: "620px",
    appendToBody: true,
}));
const __VLS_1065 = __VLS_1064({
    modelValue: (__VLS_ctx.bitableDialogVisible),
    title: (__VLS_ctx.editingBitableTable ? '编辑数据对象' : '新增数据对象'),
    width: "620px",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1064));
__VLS_1066.slots.default;
const __VLS_1067 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1068 = __VLS_asFunctionalComponent(__VLS_1067, new __VLS_1067({
    model: (__VLS_ctx.bitableForm),
    labelWidth: "105px",
}));
const __VLS_1069 = __VLS_1068({
    model: (__VLS_ctx.bitableForm),
    labelWidth: "105px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1068));
__VLS_1070.slots.default;
const __VLS_1071 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1072 = __VLS_asFunctionalComponent(__VLS_1071, new __VLS_1071({
    label: "对象编码",
    required: true,
}));
const __VLS_1073 = __VLS_1072({
    label: "对象编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1072));
__VLS_1074.slots.default;
const __VLS_1075 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1076 = __VLS_asFunctionalComponent(__VLS_1075, new __VLS_1075({
    modelValue: (__VLS_ctx.bitableForm.object_code),
    placeholder: "FEISHU_EMPLOYEE_ROSTER",
}));
const __VLS_1077 = __VLS_1076({
    modelValue: (__VLS_ctx.bitableForm.object_code),
    placeholder: "FEISHU_EMPLOYEE_ROSTER",
}, ...__VLS_functionalComponentArgsRest(__VLS_1076));
var __VLS_1074;
const __VLS_1079 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1080 = __VLS_asFunctionalComponent(__VLS_1079, new __VLS_1079({
    label: "对象名称",
    required: true,
}));
const __VLS_1081 = __VLS_1080({
    label: "对象名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1080));
__VLS_1082.slots.default;
const __VLS_1083 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1084 = __VLS_asFunctionalComponent(__VLS_1083, new __VLS_1083({
    modelValue: (__VLS_ctx.bitableForm.object_name),
    placeholder: "员工花名册",
}));
const __VLS_1085 = __VLS_1084({
    modelValue: (__VLS_ctx.bitableForm.object_name),
    placeholder: "员工花名册",
}, ...__VLS_functionalComponentArgsRest(__VLS_1084));
var __VLS_1082;
const __VLS_1087 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1088 = __VLS_asFunctionalComponent(__VLS_1087, new __VLS_1087({
    label: "App Token",
    required: true,
}));
const __VLS_1089 = __VLS_1088({
    label: "App Token",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1088));
__VLS_1090.slots.default;
const __VLS_1091 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1092 = __VLS_asFunctionalComponent(__VLS_1091, new __VLS_1091({
    modelValue: (__VLS_ctx.bitableForm.app_token),
}));
const __VLS_1093 = __VLS_1092({
    modelValue: (__VLS_ctx.bitableForm.app_token),
}, ...__VLS_functionalComponentArgsRest(__VLS_1092));
var __VLS_1090;
const __VLS_1095 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1096 = __VLS_asFunctionalComponent(__VLS_1095, new __VLS_1095({
    label: "Table ID",
    required: true,
}));
const __VLS_1097 = __VLS_1096({
    label: "Table ID",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1096));
__VLS_1098.slots.default;
const __VLS_1099 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1100 = __VLS_asFunctionalComponent(__VLS_1099, new __VLS_1099({
    modelValue: (__VLS_ctx.bitableForm.table_id),
}));
const __VLS_1101 = __VLS_1100({
    modelValue: (__VLS_ctx.bitableForm.table_id),
}, ...__VLS_functionalComponentArgsRest(__VLS_1100));
var __VLS_1098;
const __VLS_1103 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1104 = __VLS_asFunctionalComponent(__VLS_1103, new __VLS_1103({
    label: "View ID",
}));
const __VLS_1105 = __VLS_1104({
    label: "View ID",
}, ...__VLS_functionalComponentArgsRest(__VLS_1104));
__VLS_1106.slots.default;
const __VLS_1107 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1108 = __VLS_asFunctionalComponent(__VLS_1107, new __VLS_1107({
    modelValue: (__VLS_ctx.bitableForm.view_id),
}));
const __VLS_1109 = __VLS_1108({
    modelValue: (__VLS_ctx.bitableForm.view_id),
}, ...__VLS_functionalComponentArgsRest(__VLS_1108));
var __VLS_1106;
const __VLS_1111 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1112 = __VLS_asFunctionalComponent(__VLS_1111, new __VLS_1111({
    label: "字段映射",
}));
const __VLS_1113 = __VLS_1112({
    label: "字段映射",
}, ...__VLS_functionalComponentArgsRest(__VLS_1112));
__VLS_1114.slots.default;
const __VLS_1115 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1116 = __VLS_asFunctionalComponent(__VLS_1115, new __VLS_1115({
    modelValue: (__VLS_ctx.bitableForm.field_mapping),
    type: "textarea",
    rows: (4),
    placeholder: '{"飞书字段": "平台字段"}',
}));
const __VLS_1117 = __VLS_1116({
    modelValue: (__VLS_ctx.bitableForm.field_mapping),
    type: "textarea",
    rows: (4),
    placeholder: '{"飞书字段": "平台字段"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_1116));
var __VLS_1114;
const __VLS_1119 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1120 = __VLS_asFunctionalComponent(__VLS_1119, new __VLS_1119({
    label: "单页条数",
}));
const __VLS_1121 = __VLS_1120({
    label: "单页条数",
}, ...__VLS_functionalComponentArgsRest(__VLS_1120));
__VLS_1122.slots.default;
const __VLS_1123 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_1124 = __VLS_asFunctionalComponent(__VLS_1123, new __VLS_1123({
    modelValue: (__VLS_ctx.bitableForm.page_size),
    min: (1),
    max: (500),
}));
const __VLS_1125 = __VLS_1124({
    modelValue: (__VLS_ctx.bitableForm.page_size),
    min: (1),
    max: (500),
}, ...__VLS_functionalComponentArgsRest(__VLS_1124));
var __VLS_1122;
const __VLS_1127 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1128 = __VLS_asFunctionalComponent(__VLS_1127, new __VLS_1127({
    label: "最大记录数",
}));
const __VLS_1129 = __VLS_1128({
    label: "最大记录数",
}, ...__VLS_functionalComponentArgsRest(__VLS_1128));
__VLS_1130.slots.default;
const __VLS_1131 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_1132 = __VLS_asFunctionalComponent(__VLS_1131, new __VLS_1131({
    modelValue: (__VLS_ctx.bitableForm.max_records),
    min: (1),
    max: (50000),
}));
const __VLS_1133 = __VLS_1132({
    modelValue: (__VLS_ctx.bitableForm.max_records),
    min: (1),
    max: (50000),
}, ...__VLS_functionalComponentArgsRest(__VLS_1132));
var __VLS_1130;
const __VLS_1135 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1136 = __VLS_asFunctionalComponent(__VLS_1135, new __VLS_1135({
    label: "启用",
}));
const __VLS_1137 = __VLS_1136({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_1136));
__VLS_1138.slots.default;
const __VLS_1139 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_1140 = __VLS_asFunctionalComponent(__VLS_1139, new __VLS_1139({
    modelValue: (__VLS_ctx.bitableForm.is_active),
}));
const __VLS_1141 = __VLS_1140({
    modelValue: (__VLS_ctx.bitableForm.is_active),
}, ...__VLS_functionalComponentArgsRest(__VLS_1140));
var __VLS_1138;
var __VLS_1070;
{
    const { footer: __VLS_thisSlot } = __VLS_1066.slots;
    const __VLS_1143 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1144 = __VLS_asFunctionalComponent(__VLS_1143, new __VLS_1143({
        ...{ 'onClick': {} },
    }));
    const __VLS_1145 = __VLS_1144({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1144));
    let __VLS_1147;
    let __VLS_1148;
    let __VLS_1149;
    const __VLS_1150 = {
        onClick: (...[$event]) => {
            __VLS_ctx.bitableDialogVisible = false;
        }
    };
    __VLS_1146.slots.default;
    var __VLS_1146;
    const __VLS_1151 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1152 = __VLS_asFunctionalComponent(__VLS_1151, new __VLS_1151({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bitableSaving),
    }));
    const __VLS_1153 = __VLS_1152({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.bitableSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1152));
    let __VLS_1155;
    let __VLS_1156;
    let __VLS_1157;
    const __VLS_1158 = {
        onClick: (__VLS_ctx.saveBitableTable)
    };
    __VLS_1154.slots.default;
    var __VLS_1154;
}
var __VLS_1066;
var __VLS_651;
const __VLS_1159 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1160 = __VLS_asFunctionalComponent(__VLS_1159, new __VLS_1159({
    modelValue: (__VLS_ctx.showAddSystem),
    title: (__VLS_ctx.wizardTitle),
    width: "640px",
    closeOnClickModal: (false),
}));
const __VLS_1161 = __VLS_1160({
    modelValue: (__VLS_ctx.showAddSystem),
    title: (__VLS_ctx.wizardTitle),
    width: "640px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1160));
__VLS_1162.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "wizard-steps" },
});
for (const [s, i] of __VLS_getVForSourceType((__VLS_ctx.wizardSteps))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "wiz-step" },
        ...{ class: ({ active: __VLS_ctx.wizardStep === i + 1, done: __VLS_ctx.wizardStep > i + 1 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "wiz-dot" },
    });
    (__VLS_ctx.wizardStep > i + 1 ? '✓' : i + 1);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "wiz-label" },
    });
    (s);
}
if (__VLS_ctx.wizardStep === 1) {
    const __VLS_1163 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1164 = __VLS_asFunctionalComponent(__VLS_1163, new __VLS_1163({
        type: "info",
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_1165 = __VLS_1164({
        type: "info",
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1164));
    __VLS_1166.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    var __VLS_1166;
    const __VLS_1167 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_1168 = __VLS_asFunctionalComponent(__VLS_1167, new __VLS_1167({
        model: (__VLS_ctx.systemForm),
        labelWidth: "100px",
    }));
    const __VLS_1169 = __VLS_1168({
        model: (__VLS_ctx.systemForm),
        labelWidth: "100px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1168));
    __VLS_1170.slots.default;
    const __VLS_1171 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1172 = __VLS_asFunctionalComponent(__VLS_1171, new __VLS_1171({
        label: "接入类型",
        required: true,
    }));
    const __VLS_1173 = __VLS_1172({
        label: "接入类型",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1172));
    __VLS_1174.slots.default;
    const __VLS_1175 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_1176 = __VLS_asFunctionalComponent(__VLS_1175, new __VLS_1175({
        modelValue: (__VLS_ctx.selectedConnectorCategory),
    }));
    const __VLS_1177 = __VLS_1176({
        modelValue: (__VLS_ctx.selectedConnectorCategory),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1176));
    __VLS_1178.slots.default;
    const __VLS_1179 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_1180 = __VLS_asFunctionalComponent(__VLS_1179, new __VLS_1179({
        value: "STANDARD_SAAS",
    }));
    const __VLS_1181 = __VLS_1180({
        value: "STANDARD_SAAS",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1180));
    __VLS_1182.slots.default;
    var __VLS_1182;
    const __VLS_1183 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_1184 = __VLS_asFunctionalComponent(__VLS_1183, new __VLS_1183({
        value: "CONTROLLED_API",
    }));
    const __VLS_1185 = __VLS_1184({
        value: "CONTROLLED_API",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1184));
    __VLS_1186.slots.default;
    var __VLS_1186;
    var __VLS_1178;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "text-muted" },
    });
    var __VLS_1174;
    const __VLS_1187 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1188 = __VLS_asFunctionalComponent(__VLS_1187, new __VLS_1187({
        label: "连接器能力包",
        required: true,
    }));
    const __VLS_1189 = __VLS_1188({
        label: "连接器能力包",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1188));
    __VLS_1190.slots.default;
    const __VLS_1191 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1192 = __VLS_asFunctionalComponent(__VLS_1191, new __VLS_1191({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.selectedPackageCode),
        clearable: true,
        placeholder: "选择已发布的系统接入类型",
        ...{ style: {} },
    }));
    const __VLS_1193 = __VLS_1192({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.selectedPackageCode),
        clearable: true,
        placeholder: "选择已发布的系统接入类型",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1192));
    let __VLS_1195;
    let __VLS_1196;
    let __VLS_1197;
    const __VLS_1198 = {
        onChange: (__VLS_ctx.selectConnectorPackage)
    };
    __VLS_1194.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.connectorPackages))) {
        const __VLS_1199 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_1200 = __VLS_asFunctionalComponent(__VLS_1199, new __VLS_1199({
            key: (item.package_code),
            label: (item.package_name),
            value: (item.package_code),
        }));
        const __VLS_1201 = __VLS_1200({
            key: (item.package_code),
            label: (item.package_name),
            value: (item.package_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1200));
    }
    var __VLS_1194;
    if (__VLS_ctx.selectedPackage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    }
    var __VLS_1190;
    if (__VLS_ctx.currentSystemFields.length) {
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.currentSystemFields))) {
            const __VLS_1203 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_1204 = __VLS_asFunctionalComponent(__VLS_1203, new __VLS_1203({
                key: (field.key),
                label: (field.label),
                required: (field.required),
            }));
            const __VLS_1205 = __VLS_1204({
                key: (field.key),
                label: (field.label),
                required: (field.required),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1204));
            __VLS_1206.slots.default;
            if (field.type === 'select') {
                const __VLS_1207 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_1208 = __VLS_asFunctionalComponent(__VLS_1207, new __VLS_1207({
                    modelValue: (__VLS_ctx.systemForm.instance_config[field.key]),
                    clearable: true,
                    ...{ style: {} },
                }));
                const __VLS_1209 = __VLS_1208({
                    modelValue: (__VLS_ctx.systemForm.instance_config[field.key]),
                    clearable: true,
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_1208));
                __VLS_1210.slots.default;
                for (const [option] of __VLS_getVForSourceType((field.options || []))) {
                    const __VLS_1211 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_1212 = __VLS_asFunctionalComponent(__VLS_1211, new __VLS_1211({
                        key: (String(option.value ?? option)),
                        label: (String(option.label ?? option)),
                        value: (option.value ?? option),
                    }));
                    const __VLS_1213 = __VLS_1212({
                        key: (String(option.value ?? option)),
                        label: (String(option.label ?? option)),
                        value: (option.value ?? option),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_1212));
                }
                var __VLS_1210;
            }
            else {
                const __VLS_1215 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_1216 = __VLS_asFunctionalComponent(__VLS_1215, new __VLS_1215({
                    modelValue: (__VLS_ctx.systemForm.instance_config[field.key]),
                    type: (field.type === 'number' ? 'number' : 'text'),
                    placeholder: (`请输入${field.label}`),
                }));
                const __VLS_1217 = __VLS_1216({
                    modelValue: (__VLS_ctx.systemForm.instance_config[field.key]),
                    type: (field.type === 'number' ? 'number' : 'text'),
                    placeholder: (`请输入${field.label}`),
                }, ...__VLS_functionalComponentArgsRest(__VLS_1216));
            }
            var __VLS_1206;
        }
    }
    const __VLS_1219 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1220 = __VLS_asFunctionalComponent(__VLS_1219, new __VLS_1219({
        label: "系统编码",
        required: true,
    }));
    const __VLS_1221 = __VLS_1220({
        label: "系统编码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1220));
    __VLS_1222.slots.default;
    const __VLS_1223 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1224 = __VLS_asFunctionalComponent(__VLS_1223, new __VLS_1223({
        modelValue: (__VLS_ctx.systemForm.system_code),
        placeholder: "如 BEISEN / FEISHU",
        disabled: (__VLS_ctx.usesCapabilityPackage),
    }));
    const __VLS_1225 = __VLS_1224({
        modelValue: (__VLS_ctx.systemForm.system_code),
        placeholder: "如 BEISEN / FEISHU",
        disabled: (__VLS_ctx.usesCapabilityPackage),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1224));
    var __VLS_1222;
    const __VLS_1227 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1228 = __VLS_asFunctionalComponent(__VLS_1227, new __VLS_1227({
        label: "系统名称",
        required: true,
    }));
    const __VLS_1229 = __VLS_1228({
        label: "系统名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1228));
    __VLS_1230.slots.default;
    const __VLS_1231 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1232 = __VLS_asFunctionalComponent(__VLS_1231, new __VLS_1231({
        modelValue: (__VLS_ctx.systemForm.system_name),
        placeholder: "如 北森 / 飞书",
    }));
    const __VLS_1233 = __VLS_1232({
        modelValue: (__VLS_ctx.systemForm.system_name),
        placeholder: "如 北森 / 飞书",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1232));
    var __VLS_1230;
    const __VLS_1235 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1236 = __VLS_asFunctionalComponent(__VLS_1235, new __VLS_1235({
        label: "系统类型",
    }));
    const __VLS_1237 = __VLS_1236({
        label: "系统类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1236));
    __VLS_1238.slots.default;
    const __VLS_1239 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1240 = __VLS_asFunctionalComponent(__VLS_1239, new __VLS_1239({
        modelValue: (__VLS_ctx.systemForm.system_type),
        placeholder: "选择类型",
        ...{ style: {} },
    }));
    const __VLS_1241 = __VLS_1240({
        modelValue: (__VLS_ctx.systemForm.system_type),
        placeholder: "选择类型",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1240));
    __VLS_1242.slots.default;
    const __VLS_1243 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1244 = __VLS_asFunctionalComponent(__VLS_1243, new __VLS_1243({
        label: "HR SaaS",
        value: "HR_SAAS",
    }));
    const __VLS_1245 = __VLS_1244({
        label: "HR SaaS",
        value: "HR_SAAS",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1244));
    const __VLS_1247 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1248 = __VLS_asFunctionalComponent(__VLS_1247, new __VLS_1247({
        label: "OA",
        value: "OA",
    }));
    const __VLS_1249 = __VLS_1248({
        label: "OA",
        value: "OA",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1248));
    const __VLS_1251 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1252 = __VLS_asFunctionalComponent(__VLS_1251, new __VLS_1251({
        label: "IM (即时通讯)",
        value: "IM",
    }));
    const __VLS_1253 = __VLS_1252({
        label: "IM (即时通讯)",
        value: "IM",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1252));
    const __VLS_1255 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1256 = __VLS_asFunctionalComponent(__VLS_1255, new __VLS_1255({
        label: "CAR (出行)",
        value: "CAR",
    }));
    const __VLS_1257 = __VLS_1256({
        label: "CAR (出行)",
        value: "CAR",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1256));
    const __VLS_1259 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1260 = __VLS_asFunctionalComponent(__VLS_1259, new __VLS_1259({
        label: "自定义",
        value: "CUSTOM",
    }));
    const __VLS_1261 = __VLS_1260({
        label: "自定义",
        value: "CUSTOM",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1260));
    var __VLS_1242;
    var __VLS_1238;
    const __VLS_1263 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1264 = __VLS_asFunctionalComponent(__VLS_1263, new __VLS_1263({
        label: "负责人",
    }));
    const __VLS_1265 = __VLS_1264({
        label: "负责人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1264));
    __VLS_1266.slots.default;
    const __VLS_1267 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1268 = __VLS_asFunctionalComponent(__VLS_1267, new __VLS_1267({
        modelValue: (__VLS_ctx.systemForm.owner),
        placeholder: "可选",
    }));
    const __VLS_1269 = __VLS_1268({
        modelValue: (__VLS_ctx.systemForm.owner),
        placeholder: "可选",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1268));
    var __VLS_1266;
    const __VLS_1271 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1272 = __VLS_asFunctionalComponent(__VLS_1271, new __VLS_1271({
        label: "域/团队",
    }));
    const __VLS_1273 = __VLS_1272({
        label: "域/团队",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1272));
    __VLS_1274.slots.default;
    const __VLS_1275 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1276 = __VLS_asFunctionalComponent(__VLS_1275, new __VLS_1275({
        modelValue: (__VLS_ctx.systemForm.domain),
        placeholder: "如 HR / SSC / IT",
    }));
    const __VLS_1277 = __VLS_1276({
        modelValue: (__VLS_ctx.systemForm.domain),
        placeholder: "如 HR / SSC / IT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1276));
    var __VLS_1274;
    const __VLS_1279 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1280 = __VLS_asFunctionalComponent(__VLS_1279, new __VLS_1279({
        label: "说明",
    }));
    const __VLS_1281 = __VLS_1280({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1280));
    __VLS_1282.slots.default;
    const __VLS_1283 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1284 = __VLS_asFunctionalComponent(__VLS_1283, new __VLS_1283({
        modelValue: (__VLS_ctx.systemForm.description),
        type: "textarea",
        rows: (2),
    }));
    const __VLS_1285 = __VLS_1284({
        modelValue: (__VLS_ctx.systemForm.description),
        type: "textarea",
        rows: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1284));
    var __VLS_1282;
    const __VLS_1287 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1288 = __VLS_asFunctionalComponent(__VLS_1287, new __VLS_1287({
        label: "标签",
    }));
    const __VLS_1289 = __VLS_1288({
        label: "标签",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1288));
    __VLS_1290.slots.default;
    const __VLS_1291 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1292 = __VLS_asFunctionalComponent(__VLS_1291, new __VLS_1291({
        modelValue: (__VLS_ctx.systemForm.tagsStr),
        placeholder: "逗号分隔，如 生产,核心",
    }));
    const __VLS_1293 = __VLS_1292({
        modelValue: (__VLS_ctx.systemForm.tagsStr),
        placeholder: "逗号分隔，如 生产,核心",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1292));
    var __VLS_1290;
    const __VLS_1295 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1296 = __VLS_asFunctionalComponent(__VLS_1295, new __VLS_1295({
        label: "敏感级别",
    }));
    const __VLS_1297 = __VLS_1296({
        label: "敏感级别",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1296));
    __VLS_1298.slots.default;
    const __VLS_1299 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1300 = __VLS_asFunctionalComponent(__VLS_1299, new __VLS_1299({
        modelValue: (__VLS_ctx.systemForm.sensitivity),
        ...{ style: {} },
    }));
    const __VLS_1301 = __VLS_1300({
        modelValue: (__VLS_ctx.systemForm.sensitivity),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1300));
    __VLS_1302.slots.default;
    const __VLS_1303 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1304 = __VLS_asFunctionalComponent(__VLS_1303, new __VLS_1303({
        label: "内部",
        value: "internal",
    }));
    const __VLS_1305 = __VLS_1304({
        label: "内部",
        value: "internal",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1304));
    const __VLS_1307 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1308 = __VLS_asFunctionalComponent(__VLS_1307, new __VLS_1307({
        label: "机密",
        value: "confidential",
    }));
    const __VLS_1309 = __VLS_1308({
        label: "机密",
        value: "confidential",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1308));
    const __VLS_1311 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1312 = __VLS_asFunctionalComponent(__VLS_1311, new __VLS_1311({
        label: "绝密",
        value: "restricted",
    }));
    const __VLS_1313 = __VLS_1312({
        label: "绝密",
        value: "restricted",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1312));
    var __VLS_1302;
    var __VLS_1298;
    var __VLS_1170;
}
else if (__VLS_ctx.wizardStep === 2) {
    const __VLS_1315 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1316 = __VLS_asFunctionalComponent(__VLS_1315, new __VLS_1315({
        type: "success",
        closable: (false),
        ...{ style: {} },
        title: (`系统「${__VLS_ctx.systemForm.system_name}」已创建，现在录入第一套凭证`),
    }));
    const __VLS_1317 = __VLS_1316({
        type: "success",
        closable: (false),
        ...{ style: {} },
        title: (`系统「${__VLS_ctx.systemForm.system_name}」已创建，现在录入第一套凭证`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1316));
    const __VLS_1319 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_1320 = __VLS_asFunctionalComponent(__VLS_1319, new __VLS_1319({
        model: (__VLS_ctx.credForm),
        labelWidth: "100px",
    }));
    const __VLS_1321 = __VLS_1320({
        model: (__VLS_ctx.credForm),
        labelWidth: "100px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1320));
    __VLS_1322.slots.default;
    const __VLS_1323 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1324 = __VLS_asFunctionalComponent(__VLS_1323, new __VLS_1323({
        label: "凭证编码",
        required: true,
    }));
    const __VLS_1325 = __VLS_1324({
        label: "凭证编码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1324));
    __VLS_1326.slots.default;
    const __VLS_1327 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1328 = __VLS_asFunctionalComponent(__VLS_1327, new __VLS_1327({
        modelValue: (__VLS_ctx.credForm.credential_code),
        placeholder: (`如 CRED-${(__VLS_ctx.systemForm.system_code || 'SYS').toUpperCase()}-PROD`),
    }));
    const __VLS_1329 = __VLS_1328({
        modelValue: (__VLS_ctx.credForm.credential_code),
        placeholder: (`如 CRED-${(__VLS_ctx.systemForm.system_code || 'SYS').toUpperCase()}-PROD`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1328));
    var __VLS_1326;
    const __VLS_1331 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1332 = __VLS_asFunctionalComponent(__VLS_1331, new __VLS_1331({
        label: "凭证名称",
        required: true,
    }));
    const __VLS_1333 = __VLS_1332({
        label: "凭证名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1332));
    __VLS_1334.slots.default;
    const __VLS_1335 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1336 = __VLS_asFunctionalComponent(__VLS_1335, new __VLS_1335({
        modelValue: (__VLS_ctx.credForm.credential_name),
        placeholder: "如 北森生产凭证",
    }));
    const __VLS_1337 = __VLS_1336({
        modelValue: (__VLS_ctx.credForm.credential_name),
        placeholder: "如 北森生产凭证",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1336));
    var __VLS_1334;
    const __VLS_1339 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1340 = __VLS_asFunctionalComponent(__VLS_1339, new __VLS_1339({
        label: "环境",
    }));
    const __VLS_1341 = __VLS_1340({
        label: "环境",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1340));
    __VLS_1342.slots.default;
    const __VLS_1343 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1344 = __VLS_asFunctionalComponent(__VLS_1343, new __VLS_1343({
        modelValue: (__VLS_ctx.credForm.env_tag),
        placeholder: "选环境",
        ...{ style: {} },
    }));
    const __VLS_1345 = __VLS_1344({
        modelValue: (__VLS_ctx.credForm.env_tag),
        placeholder: "选环境",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1344));
    __VLS_1346.slots.default;
    const __VLS_1347 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1348 = __VLS_asFunctionalComponent(__VLS_1347, new __VLS_1347({
        label: "生产 (prod)",
        value: "prod",
    }));
    const __VLS_1349 = __VLS_1348({
        label: "生产 (prod)",
        value: "prod",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1348));
    const __VLS_1351 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1352 = __VLS_asFunctionalComponent(__VLS_1351, new __VLS_1351({
        label: "测试 (staging)",
        value: "staging",
    }));
    const __VLS_1353 = __VLS_1352({
        label: "测试 (staging)",
        value: "staging",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1352));
    const __VLS_1355 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1356 = __VLS_asFunctionalComponent(__VLS_1355, new __VLS_1355({
        label: "开发 (dev)",
        value: "dev",
    }));
    const __VLS_1357 = __VLS_1356({
        label: "开发 (dev)",
        value: "dev",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1356));
    const __VLS_1359 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1360 = __VLS_asFunctionalComponent(__VLS_1359, new __VLS_1359({
        label: "备份 (backup)",
        value: "backup",
    }));
    const __VLS_1361 = __VLS_1360({
        label: "备份 (backup)",
        value: "backup",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1360));
    var __VLS_1346;
    var __VLS_1342;
    /** @type {[typeof CredentialForm, ]} */ ;
    // @ts-ignore
    const __VLS_1363 = __VLS_asFunctionalComponent(CredentialForm, new CredentialForm({
        modelValue: (__VLS_ctx.credForm),
        schema: (__VLS_ctx.selectedPackage?.auth_policy?.credential_schema),
        allowedAuthTypes: (__VLS_ctx.selectedPackage?.auth_policy?.auth_type ? [__VLS_ctx.selectedPackage.auth_policy.auth_type] : undefined),
        readonlyAuth: (Boolean(__VLS_ctx.selectedPackage?.auth_policy?.auth_type)),
    }));
    const __VLS_1364 = __VLS_1363({
        modelValue: (__VLS_ctx.credForm),
        schema: (__VLS_ctx.selectedPackage?.auth_policy?.credential_schema),
        allowedAuthTypes: (__VLS_ctx.selectedPackage?.auth_policy?.auth_type ? [__VLS_ctx.selectedPackage.auth_policy.auth_type] : undefined),
        readonlyAuth: (Boolean(__VLS_ctx.selectedPackage?.auth_policy?.auth_type)),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1363));
    const __VLS_1366 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1367 = __VLS_asFunctionalComponent(__VLS_1366, new __VLS_1366({
        label: "过期时间",
    }));
    const __VLS_1368 = __VLS_1367({
        label: "过期时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1367));
    __VLS_1369.slots.default;
    const __VLS_1370 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_1371 = __VLS_asFunctionalComponent(__VLS_1370, new __VLS_1370({
        modelValue: (__VLS_ctx.credForm.expires_at),
        type: "datetime",
        placeholder: "选填，到期后凭证自动标记为已过期",
        ...{ style: {} },
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
    }));
    const __VLS_1372 = __VLS_1371({
        modelValue: (__VLS_ctx.credForm.expires_at),
        type: "datetime",
        placeholder: "选填，到期后凭证自动标记为已过期",
        ...{ style: {} },
        valueFormat: "YYYY-MM-DDTHH:mm:ss",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1371));
    var __VLS_1369;
    const __VLS_1374 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1375 = __VLS_asFunctionalComponent(__VLS_1374, new __VLS_1374({
        label: "到期提醒",
    }));
    const __VLS_1376 = __VLS_1375({
        label: "到期提醒",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1375));
    __VLS_1377.slots.default;
    const __VLS_1378 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_1379 = __VLS_asFunctionalComponent(__VLS_1378, new __VLS_1378({
        modelValue: (__VLS_ctx.credForm.remind_before_days),
        min: (1),
        max: (90),
        ...{ style: {} },
    }));
    const __VLS_1380 = __VLS_1379({
        modelValue: (__VLS_ctx.credForm.remind_before_days),
        min: (1),
        max: (90),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1379));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    var __VLS_1377;
    const __VLS_1382 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1383 = __VLS_asFunctionalComponent(__VLS_1382, new __VLS_1382({
        label: "说明",
    }));
    const __VLS_1384 = __VLS_1383({
        label: "说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1383));
    __VLS_1385.slots.default;
    const __VLS_1386 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1387 = __VLS_asFunctionalComponent(__VLS_1386, new __VLS_1386({
        modelValue: (__VLS_ctx.credForm.description),
        type: "textarea",
        rows: (2),
    }));
    const __VLS_1388 = __VLS_1387({
        modelValue: (__VLS_ctx.credForm.description),
        type: "textarea",
        rows: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1387));
    var __VLS_1385;
    var __VLS_1322;
}
else if (__VLS_ctx.wizardStep === 3) {
    if (__VLS_ctx.usesCapabilityPackage) {
        const __VLS_1390 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_1391 = __VLS_asFunctionalComponent(__VLS_1390, new __VLS_1390({
            type: "success",
            closable: (false),
            ...{ style: {} },
            title: "选择要启用的业务能力",
        }));
        const __VLS_1392 = __VLS_1391({
            type: "success",
            closable: (false),
            ...{ style: {} },
            title: "选择要启用的业务能力",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1391));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
            ...{ style: {} },
        });
        const __VLS_1394 = {}.ElCheckboxGroup;
        /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
        // @ts-ignore
        const __VLS_1395 = __VLS_asFunctionalComponent(__VLS_1394, new __VLS_1394({
            modelValue: (__VLS_ctx.selectedOperationIds),
            ...{ class: "capability-list" },
        }));
        const __VLS_1396 = __VLS_1395({
            modelValue: (__VLS_ctx.selectedOperationIds),
            ...{ class: "capability-list" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1395));
        __VLS_1397.slots.default;
        for (const [operation] of __VLS_getVForSourceType((__VLS_ctx.selectedPackageOperations))) {
            const __VLS_1398 = {}.ElCard;
            /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
            // @ts-ignore
            const __VLS_1399 = __VLS_asFunctionalComponent(__VLS_1398, new __VLS_1398({
                key: (operation.operation_id),
                shadow: "never",
                ...{ class: "capability-card" },
            }));
            const __VLS_1400 = __VLS_1399({
                key: (operation.operation_id),
                shadow: "never",
                ...{ class: "capability-card" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_1399));
            __VLS_1401.slots.default;
            const __VLS_1402 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_1403 = __VLS_asFunctionalComponent(__VLS_1402, new __VLS_1402({
                label: (operation.operation_id),
            }));
            const __VLS_1404 = __VLS_1403({
                label: (operation.operation_id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1403));
            __VLS_1405.slots.default;
            (operation.operation_name);
            var __VLS_1405;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "text-muted capability-fields" },
            });
            (operation.input_fields.join('、') || '无');
            (operation.output_fields.join('、') || '无');
            const __VLS_1406 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_1407 = __VLS_asFunctionalComponent(__VLS_1406, new __VLS_1406({
                size: "small",
                type: "warning",
            }));
            const __VLS_1408 = __VLS_1407({
                size: "small",
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1407));
            __VLS_1409.slots.default;
            var __VLS_1409;
            var __VLS_1401;
        }
        var __VLS_1397;
    }
    else {
        const __VLS_1410 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_1411 = __VLS_asFunctionalComponent(__VLS_1410, new __VLS_1410({
            type: "info",
            closable: (false),
            ...{ style: {} },
        }));
        const __VLS_1412 = __VLS_1411({
            type: "info",
            closable: (false),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1411));
        __VLS_1413.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_1413.slots;
        }
        var __VLS_1413;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-step3-head" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-step3-title" },
        });
        (__VLS_ctx.wizardResources.length);
        const __VLS_1414 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1415 = __VLS_asFunctionalComponent(__VLS_1414, new __VLS_1414({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }));
        const __VLS_1416 = __VLS_1415({
            ...{ 'onClick': {} },
            type: "primary",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1415));
        let __VLS_1418;
        let __VLS_1419;
        let __VLS_1420;
        const __VLS_1421 = {
            onClick: (__VLS_ctx.addResourceFromWizard)
        };
        __VLS_1417.slots.default;
        const __VLS_1422 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1423 = __VLS_asFunctionalComponent(__VLS_1422, new __VLS_1422({}));
        const __VLS_1424 = __VLS_1423({}, ...__VLS_functionalComponentArgsRest(__VLS_1423));
        __VLS_1425.slots.default;
        const __VLS_1426 = {}.Plus;
        /** @type {[typeof __VLS_components.Plus, ]} */ ;
        // @ts-ignore
        const __VLS_1427 = __VLS_asFunctionalComponent(__VLS_1426, new __VLS_1426({}));
        const __VLS_1428 = __VLS_1427({}, ...__VLS_functionalComponentArgsRest(__VLS_1427));
        var __VLS_1425;
        var __VLS_1417;
        if (__VLS_ctx.wizardResources.length > 0) {
            const __VLS_1430 = {}.ElTable;
            /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
            // @ts-ignore
            const __VLS_1431 = __VLS_asFunctionalComponent(__VLS_1430, new __VLS_1430({
                data: (__VLS_ctx.wizardResources),
                stripe: true,
                size: "small",
                ...{ style: {} },
                maxHeight: "320",
            }));
            const __VLS_1432 = __VLS_1431({
                data: (__VLS_ctx.wizardResources),
                stripe: true,
                size: "small",
                ...{ style: {} },
                maxHeight: "320",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1431));
            __VLS_1433.slots.default;
            const __VLS_1434 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_1435 = __VLS_asFunctionalComponent(__VLS_1434, new __VLS_1434({
                prop: "resource_name",
                label: "资源名称",
                minWidth: "120",
            }));
            const __VLS_1436 = __VLS_1435({
                prop: "resource_name",
                label: "资源名称",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1435));
            const __VLS_1438 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_1439 = __VLS_asFunctionalComponent(__VLS_1438, new __VLS_1438({
                label: "适配器",
                minWidth: "100",
            }));
            const __VLS_1440 = __VLS_1439({
                label: "适配器",
                minWidth: "100",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1439));
            __VLS_1441.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_1441.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                if (row.adapter_code) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
                        ...{ style: {} },
                    });
                    (row.adapter_code);
                }
                else {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "text-muted" },
                    });
                }
            }
            var __VLS_1441;
            const __VLS_1442 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_1443 = __VLS_asFunctionalComponent(__VLS_1442, new __VLS_1442({
                prop: "resource_code",
                label: "标识",
                minWidth: "120",
            }));
            const __VLS_1444 = __VLS_1443({
                prop: "resource_code",
                label: "标识",
                minWidth: "120",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1443));
            __VLS_1445.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_1445.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({
                    ...{ style: {} },
                });
                (row.resource_code);
            }
            var __VLS_1445;
            const __VLS_1446 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_1447 = __VLS_asFunctionalComponent(__VLS_1446, new __VLS_1446({
                label: "状态",
                width: "90",
            }));
            const __VLS_1448 = __VLS_1447({
                label: "状态",
                width: "90",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1447));
            __VLS_1449.slots.default;
            {
                const { default: __VLS_thisSlot } = __VLS_1449.slots;
                const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
                if (row.status === 1) {
                    const __VLS_1450 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_1451 = __VLS_asFunctionalComponent(__VLS_1450, new __VLS_1450({
                        type: "success",
                        size: "small",
                    }));
                    const __VLS_1452 = __VLS_1451({
                        type: "success",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_1451));
                    __VLS_1453.slots.default;
                    var __VLS_1453;
                }
                else if (row.status === 2) {
                    const __VLS_1454 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_1455 = __VLS_asFunctionalComponent(__VLS_1454, new __VLS_1454({
                        type: "info",
                        size: "small",
                    }));
                    const __VLS_1456 = __VLS_1455({
                        type: "info",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_1455));
                    __VLS_1457.slots.default;
                    var __VLS_1457;
                }
                else {
                    const __VLS_1458 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_1459 = __VLS_asFunctionalComponent(__VLS_1458, new __VLS_1458({
                        type: "warning",
                        size: "small",
                    }));
                    const __VLS_1460 = __VLS_1459({
                        type: "warning",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_1459));
                    __VLS_1461.slots.default;
                    var __VLS_1461;
                }
            }
            var __VLS_1449;
            var __VLS_1433;
        }
        else {
            const __VLS_1462 = {}.ElEmpty;
            /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
            // @ts-ignore
            const __VLS_1463 = __VLS_asFunctionalComponent(__VLS_1462, new __VLS_1462({
                description: "尚未添加资源（点击右上角「+ 添加资源」开始；或跳过此步,稍后到系统详情补加）",
                imageSize: (80),
            }));
            const __VLS_1464 = __VLS_1463({
                description: "尚未添加资源（点击右上角「+ 添加资源」开始；或跳过此步,稍后到系统详情补加）",
                imageSize: (80),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1463));
        }
    }
}
else {
    const __VLS_1466 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1467 = __VLS_asFunctionalComponent(__VLS_1466, new __VLS_1466({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "即将完成 — 检查摘要",
    }));
    const __VLS_1468 = __VLS_1467({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "即将完成 — 检查摘要",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1467));
    const __VLS_1470 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_1471 = __VLS_asFunctionalComponent(__VLS_1470, new __VLS_1470({
        column: (1),
        border: true,
    }));
    const __VLS_1472 = __VLS_1471({
        column: (1),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1471));
    __VLS_1473.slots.default;
    const __VLS_1474 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1475 = __VLS_asFunctionalComponent(__VLS_1474, new __VLS_1474({
        label: "系统",
    }));
    const __VLS_1476 = __VLS_1475({
        label: "系统",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1475));
    __VLS_1477.slots.default;
    (__VLS_ctx.systemForm.system_name);
    (__VLS_ctx.systemForm.system_code);
    var __VLS_1477;
    const __VLS_1478 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1479 = __VLS_asFunctionalComponent(__VLS_1478, new __VLS_1478({
        label: "系统类型",
    }));
    const __VLS_1480 = __VLS_1479({
        label: "系统类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1479));
    __VLS_1481.slots.default;
    (__VLS_ctx.systemForm.system_type);
    var __VLS_1481;
    const __VLS_1482 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1483 = __VLS_asFunctionalComponent(__VLS_1482, new __VLS_1482({
        label: "凭证",
    }));
    const __VLS_1484 = __VLS_1483({
        label: "凭证",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1483));
    __VLS_1485.slots.default;
    (__VLS_ctx.credForm.credential_name);
    (__VLS_ctx.credForm.env_tag);
    (__VLS_ctx.credForm.auth_type);
    var __VLS_1485;
    const __VLS_1486 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_1487 = __VLS_asFunctionalComponent(__VLS_1486, new __VLS_1486({
        label: "资源",
    }));
    const __VLS_1488 = __VLS_1487({
        label: "资源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1487));
    __VLS_1489.slots.default;
    if (__VLS_ctx.usesCapabilityPackage) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    else if (__VLS_ctx.wizardResources.length > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.wizardResources.length);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-muted" },
        });
    }
    var __VLS_1489;
    if (__VLS_ctx.usesCapabilityPackage) {
        const __VLS_1490 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_1491 = __VLS_asFunctionalComponent(__VLS_1490, new __VLS_1490({
            label: "业务能力",
        }));
        const __VLS_1492 = __VLS_1491({
            label: "业务能力",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1491));
        __VLS_1493.slots.default;
        (__VLS_ctx.selectedOperationIds.length);
        var __VLS_1493;
    }
    var __VLS_1473;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "finish-checklist" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "check-item" },
    });
    const __VLS_1494 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1495 = __VLS_asFunctionalComponent(__VLS_1494, new __VLS_1494({
        ...{ class: "ok" },
    }));
    const __VLS_1496 = __VLS_1495({
        ...{ class: "ok" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1495));
    __VLS_1497.slots.default;
    const __VLS_1498 = {}.CircleCheck;
    /** @type {[typeof __VLS_components.CircleCheck, ]} */ ;
    // @ts-ignore
    const __VLS_1499 = __VLS_asFunctionalComponent(__VLS_1498, new __VLS_1498({}));
    const __VLS_1500 = __VLS_1499({}, ...__VLS_functionalComponentArgsRest(__VLS_1499));
    var __VLS_1497;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "check-item" },
    });
    const __VLS_1502 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_1503 = __VLS_asFunctionalComponent(__VLS_1502, new __VLS_1502({
        ...{ class: "ok" },
    }));
    const __VLS_1504 = __VLS_1503({
        ...{ class: "ok" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1503));
    __VLS_1505.slots.default;
    const __VLS_1506 = {}.CircleCheck;
    /** @type {[typeof __VLS_components.CircleCheck, ]} */ ;
    // @ts-ignore
    const __VLS_1507 = __VLS_asFunctionalComponent(__VLS_1506, new __VLS_1506({}));
    const __VLS_1508 = __VLS_1507({}, ...__VLS_functionalComponentArgsRest(__VLS_1507));
    var __VLS_1505;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "check-item" },
    });
    if (__VLS_ctx.usesCapabilityPackage || __VLS_ctx.wizardResources.length > 0) {
        const __VLS_1510 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1511 = __VLS_asFunctionalComponent(__VLS_1510, new __VLS_1510({
            ...{ class: "ok" },
        }));
        const __VLS_1512 = __VLS_1511({
            ...{ class: "ok" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1511));
        __VLS_1513.slots.default;
        const __VLS_1514 = {}.CircleCheck;
        /** @type {[typeof __VLS_components.CircleCheck, ]} */ ;
        // @ts-ignore
        const __VLS_1515 = __VLS_asFunctionalComponent(__VLS_1514, new __VLS_1514({}));
        const __VLS_1516 = __VLS_1515({}, ...__VLS_functionalComponentArgsRest(__VLS_1515));
        var __VLS_1513;
    }
    else {
        const __VLS_1518 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1519 = __VLS_asFunctionalComponent(__VLS_1518, new __VLS_1518({
            ...{ class: "skip" },
        }));
        const __VLS_1520 = __VLS_1519({
            ...{ class: "skip" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1519));
        __VLS_1521.slots.default;
        const __VLS_1522 = {}.DocumentRemove;
        /** @type {[typeof __VLS_components.DocumentRemove, ]} */ ;
        // @ts-ignore
        const __VLS_1523 = __VLS_asFunctionalComponent(__VLS_1522, new __VLS_1522({}));
        const __VLS_1524 = __VLS_1523({}, ...__VLS_functionalComponentArgsRest(__VLS_1523));
        var __VLS_1521;
    }
    (__VLS_ctx.usesCapabilityPackage ? `已启用 ${__VLS_ctx.selectedOperationIds.length} 项业务能力` : (__VLS_ctx.wizardResources.length > 0 ? `已添加 ${__VLS_ctx.wizardResources.length} 个资源` : '资源 — 跳过'));
}
{
    const { footer: __VLS_thisSlot } = __VLS_1162.slots;
    if (__VLS_ctx.wizardStep > 1) {
        const __VLS_1526 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1527 = __VLS_asFunctionalComponent(__VLS_1526, new __VLS_1526({
            ...{ 'onClick': {} },
        }));
        const __VLS_1528 = __VLS_1527({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1527));
        let __VLS_1530;
        let __VLS_1531;
        let __VLS_1532;
        const __VLS_1533 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.wizardStep > 1))
                    return;
                __VLS_ctx.wizardStep--;
            }
        };
        __VLS_1529.slots.default;
        var __VLS_1529;
    }
    const __VLS_1534 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1535 = __VLS_asFunctionalComponent(__VLS_1534, new __VLS_1534({
        ...{ 'onClick': {} },
    }));
    const __VLS_1536 = __VLS_1535({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1535));
    let __VLS_1538;
    let __VLS_1539;
    let __VLS_1540;
    const __VLS_1541 = {
        onClick: (__VLS_ctx.cancelWizard)
    };
    __VLS_1537.slots.default;
    var __VLS_1537;
    if (__VLS_ctx.wizardStep === 3 && __VLS_ctx.requiresResourceSetup) {
        const __VLS_1542 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1543 = __VLS_asFunctionalComponent(__VLS_1542, new __VLS_1542({
            ...{ 'onClick': {} },
        }));
        const __VLS_1544 = __VLS_1543({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1543));
        let __VLS_1546;
        let __VLS_1547;
        let __VLS_1548;
        const __VLS_1549 = {
            onClick: (__VLS_ctx.submitSystemStep3)
        };
        __VLS_1545.slots.default;
        var __VLS_1545;
    }
    if (__VLS_ctx.wizardStep === 1) {
        const __VLS_1550 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1551 = __VLS_asFunctionalComponent(__VLS_1550, new __VLS_1550({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_1552 = __VLS_1551({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1551));
        let __VLS_1554;
        let __VLS_1555;
        let __VLS_1556;
        const __VLS_1557 = {
            onClick: (__VLS_ctx.submitSystemStep1)
        };
        __VLS_1553.slots.default;
        var __VLS_1553;
    }
    else if (__VLS_ctx.wizardStep === 2) {
        const __VLS_1558 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1559 = __VLS_asFunctionalComponent(__VLS_1558, new __VLS_1558({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_1560 = __VLS_1559({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1559));
        let __VLS_1562;
        let __VLS_1563;
        let __VLS_1564;
        const __VLS_1565 = {
            onClick: (__VLS_ctx.submitSystemStep2)
        };
        __VLS_1561.slots.default;
        var __VLS_1561;
    }
    else if (__VLS_ctx.wizardStep === 3) {
        const __VLS_1566 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1567 = __VLS_asFunctionalComponent(__VLS_1566, new __VLS_1566({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_1568 = __VLS_1567({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1567));
        let __VLS_1570;
        let __VLS_1571;
        let __VLS_1572;
        const __VLS_1573 = {
            onClick: (__VLS_ctx.submitSystemStep3)
        };
        __VLS_1569.slots.default;
        var __VLS_1569;
    }
    else {
        const __VLS_1574 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_1575 = __VLS_asFunctionalComponent(__VLS_1574, new __VLS_1574({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }));
        const __VLS_1576 = __VLS_1575({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.submitting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1575));
        let __VLS_1578;
        let __VLS_1579;
        let __VLS_1580;
        const __VLS_1581 = {
            onClick: (__VLS_ctx.finishWizardAll)
        };
        __VLS_1577.slots.default;
        var __VLS_1577;
    }
}
var __VLS_1162;
const __VLS_1582 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1583 = __VLS_asFunctionalComponent(__VLS_1582, new __VLS_1582({
    modelValue: (__VLS_ctx.showAddResource),
    title: (`新增资源（依附系统）${__VLS_ctx.addResourceSystem ? ' — ' + __VLS_ctx.addResourceSystem.system_name : ''}`),
    width: "640px",
    closeOnClickModal: (false),
}));
const __VLS_1584 = __VLS_1583({
    modelValue: (__VLS_ctx.showAddResource),
    title: (`新增资源（依附系统）${__VLS_ctx.addResourceSystem ? ' — ' + __VLS_ctx.addResourceSystem.system_name : ''}`),
    width: "640px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1583));
__VLS_1585.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "resource-template-picker" },
});
const __VLS_1586 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_1587 = __VLS_asFunctionalComponent(__VLS_1586, new __VLS_1586({
    type: "info",
    closable: (false),
    ...{ style: {} },
}));
const __VLS_1588 = __VLS_1587({
    type: "info",
    closable: (false),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1587));
__VLS_1589.slots.default;
var __VLS_1589;
if (!__VLS_ctx.resourceTemplates.length) {
    const __VLS_1590 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_1591 = __VLS_asFunctionalComponent(__VLS_1590, new __VLS_1590({
        description: "当前 SaaS 模板暂无可添加的已发布资源模板，请先在接入类型管理中创建并发布。",
    }));
    const __VLS_1592 = __VLS_1591({
        description: "当前 SaaS 模板暂无可添加的已发布资源模板，请先在接入类型管理中创建并发布。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1591));
}
else {
    const __VLS_1594 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_1595 = __VLS_asFunctionalComponent(__VLS_1594, new __VLS_1594({
        modelValue: (__VLS_ctx.resourceForm.resource_template_code),
        ...{ class: "resource-template-options" },
    }));
    const __VLS_1596 = __VLS_1595({
        modelValue: (__VLS_ctx.resourceForm.resource_template_code),
        ...{ class: "resource-template-options" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1595));
    __VLS_1597.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.resourceTemplates))) {
        const __VLS_1598 = {}.ElRadio;
        /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
        // @ts-ignore
        const __VLS_1599 = __VLS_asFunctionalComponent(__VLS_1598, new __VLS_1598({
            key: (item.resource_template_code),
            value: (item.resource_template_code),
            ...{ class: "resource-template-option" },
        }));
        const __VLS_1600 = __VLS_1599({
            key: (item.resource_template_code),
            value: (item.resource_template_code),
            ...{ class: "resource-template-option" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1599));
        __VLS_1601.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.resource_template_name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (item.description || item.configuration_profile_label || item.object_type || item.resource_template_code);
        var __VLS_1601;
    }
    var __VLS_1597;
}
{
    const { footer: __VLS_thisSlot } = __VLS_1585.slots;
    const __VLS_1602 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1603 = __VLS_asFunctionalComponent(__VLS_1602, new __VLS_1602({
        ...{ 'onClick': {} },
    }));
    const __VLS_1604 = __VLS_1603({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1603));
    let __VLS_1606;
    let __VLS_1607;
    let __VLS_1608;
    const __VLS_1609 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showAddResource = false;
        }
    };
    __VLS_1605.slots.default;
    var __VLS_1605;
    const __VLS_1610 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1611 = __VLS_asFunctionalComponent(__VLS_1610, new __VLS_1610({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.resourceTemplates.length || !__VLS_ctx.resourceForm.resource_template_code),
    }));
    const __VLS_1612 = __VLS_1611({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
        disabled: (!__VLS_ctx.resourceTemplates.length || !__VLS_ctx.resourceForm.resource_template_code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1611));
    let __VLS_1614;
    let __VLS_1615;
    let __VLS_1616;
    const __VLS_1617 = {
        onClick: (__VLS_ctx.submitResource)
    };
    __VLS_1613.slots.default;
    var __VLS_1613;
}
var __VLS_1585;
const __VLS_1618 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1619 = __VLS_asFunctionalComponent(__VLS_1618, new __VLS_1618({
    modelValue: (__VLS_ctx.dataObjectDialogVisible),
    title: (__VLS_ctx.editingDataObject ? '编辑数据对象' : '新增数据对象'),
    width: "620px",
    appendToBody: true,
}));
const __VLS_1620 = __VLS_1619({
    modelValue: (__VLS_ctx.dataObjectDialogVisible),
    title: (__VLS_ctx.editingDataObject ? '编辑数据对象' : '新增数据对象'),
    width: "620px",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1619));
__VLS_1621.slots.default;
const __VLS_1622 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1623 = __VLS_asFunctionalComponent(__VLS_1622, new __VLS_1622({
    model: (__VLS_ctx.dataObjectForm),
    labelWidth: "105px",
}));
const __VLS_1624 = __VLS_1623({
    model: (__VLS_ctx.dataObjectForm),
    labelWidth: "105px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1623));
__VLS_1625.slots.default;
const __VLS_1626 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1627 = __VLS_asFunctionalComponent(__VLS_1626, new __VLS_1626({
    label: "对象编码",
    required: true,
}));
const __VLS_1628 = __VLS_1627({
    label: "对象编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1627));
__VLS_1629.slots.default;
const __VLS_1630 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1631 = __VLS_asFunctionalComponent(__VLS_1630, new __VLS_1630({
    modelValue: (__VLS_ctx.dataObjectForm.object_code),
    placeholder: "如 PENDING_EMPLOYEE",
}));
const __VLS_1632 = __VLS_1631({
    modelValue: (__VLS_ctx.dataObjectForm.object_code),
    placeholder: "如 PENDING_EMPLOYEE",
}, ...__VLS_functionalComponentArgsRest(__VLS_1631));
var __VLS_1629;
const __VLS_1634 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1635 = __VLS_asFunctionalComponent(__VLS_1634, new __VLS_1634({
    label: "对象名称",
    required: true,
}));
const __VLS_1636 = __VLS_1635({
    label: "对象名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1635));
__VLS_1637.slots.default;
const __VLS_1638 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1639 = __VLS_asFunctionalComponent(__VLS_1638, new __VLS_1638({
    modelValue: (__VLS_ctx.dataObjectForm.object_name),
    placeholder: "如 待入职人员",
}));
const __VLS_1640 = __VLS_1639({
    modelValue: (__VLS_ctx.dataObjectForm.object_name),
    placeholder: "如 待入职人员",
}, ...__VLS_functionalComponentArgsRest(__VLS_1639));
var __VLS_1637;
if (__VLS_ctx.activeResource?.connector_type === 'beisen_report') {
    const __VLS_1642 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1643 = __VLS_asFunctionalComponent(__VLS_1642, new __VLS_1642({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "北森凭证和报表接口由连接统一复用；每个数据对象只需指定一张北森报表。",
    }));
    const __VLS_1644 = __VLS_1643({
        type: "info",
        closable: (false),
        ...{ style: {} },
        title: "北森凭证和报表接口由连接统一复用；每个数据对象只需指定一张北森报表。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1643));
    const __VLS_1646 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1647 = __VLS_asFunctionalComponent(__VLS_1646, new __VLS_1646({
        label: "Report ID",
        required: true,
    }));
    const __VLS_1648 = __VLS_1647({
        label: "Report ID",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1647));
    __VLS_1649.slots.default;
    const __VLS_1650 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1651 = __VLS_asFunctionalComponent(__VLS_1650, new __VLS_1650({
        modelValue: (__VLS_ctx.dataObjectForm.report_id),
        placeholder: "北森后台 → 报表管理",
    }));
    const __VLS_1652 = __VLS_1651({
        modelValue: (__VLS_ctx.dataObjectForm.report_id),
        placeholder: "北森后台 → 报表管理",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1651));
    var __VLS_1649;
}
else {
    const __VLS_1654 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1655 = __VLS_asFunctionalComponent(__VLS_1654, new __VLS_1654({
        label: (__VLS_ctx.objectConfigTitle),
    }));
    const __VLS_1656 = __VLS_1655({
        label: (__VLS_ctx.objectConfigTitle),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1655));
    __VLS_1657.slots.default;
    const __VLS_1658 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1659 = __VLS_asFunctionalComponent(__VLS_1658, new __VLS_1658({
        modelValue: (__VLS_ctx.dataObjectForm.object_config),
        type: "textarea",
        rows: (8),
        placeholder: (__VLS_ctx.objectConfigPlaceholder),
    }));
    const __VLS_1660 = __VLS_1659({
        modelValue: (__VLS_ctx.dataObjectForm.object_config),
        type: "textarea",
        rows: (8),
        placeholder: (__VLS_ctx.objectConfigPlaceholder),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1659));
    var __VLS_1657;
}
const __VLS_1662 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1663 = __VLS_asFunctionalComponent(__VLS_1662, new __VLS_1662({
    label: "字段映射",
}));
const __VLS_1664 = __VLS_1663({
    label: "字段映射",
}, ...__VLS_functionalComponentArgsRest(__VLS_1663));
__VLS_1665.slots.default;
const __VLS_1666 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1667 = __VLS_asFunctionalComponent(__VLS_1666, new __VLS_1666({
    modelValue: (__VLS_ctx.dataObjectForm.field_mapping),
    type: "textarea",
    rows: (3),
    placeholder: "可选，JSON 对象",
}));
const __VLS_1668 = __VLS_1667({
    modelValue: (__VLS_ctx.dataObjectForm.field_mapping),
    type: "textarea",
    rows: (3),
    placeholder: "可选，JSON 对象",
}, ...__VLS_functionalComponentArgsRest(__VLS_1667));
var __VLS_1665;
const __VLS_1670 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1671 = __VLS_asFunctionalComponent(__VLS_1670, new __VLS_1670({
    label: "启用",
}));
const __VLS_1672 = __VLS_1671({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_1671));
__VLS_1673.slots.default;
const __VLS_1674 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_1675 = __VLS_asFunctionalComponent(__VLS_1674, new __VLS_1674({
    modelValue: (__VLS_ctx.dataObjectForm.is_active),
}));
const __VLS_1676 = __VLS_1675({
    modelValue: (__VLS_ctx.dataObjectForm.is_active),
}, ...__VLS_functionalComponentArgsRest(__VLS_1675));
var __VLS_1673;
var __VLS_1625;
{
    const { footer: __VLS_thisSlot } = __VLS_1621.slots;
    const __VLS_1678 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1679 = __VLS_asFunctionalComponent(__VLS_1678, new __VLS_1678({
        ...{ 'onClick': {} },
    }));
    const __VLS_1680 = __VLS_1679({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1679));
    let __VLS_1682;
    let __VLS_1683;
    let __VLS_1684;
    const __VLS_1685 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dataObjectDialogVisible = false;
        }
    };
    __VLS_1681.slots.default;
    var __VLS_1681;
    const __VLS_1686 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1687 = __VLS_asFunctionalComponent(__VLS_1686, new __VLS_1686({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.dataObjectSaving),
    }));
    const __VLS_1688 = __VLS_1687({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.dataObjectSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1687));
    let __VLS_1690;
    let __VLS_1691;
    let __VLS_1692;
    const __VLS_1693 = {
        onClick: (__VLS_ctx.saveDataObject)
    };
    __VLS_1689.slots.default;
    var __VLS_1689;
}
var __VLS_1621;
const __VLS_1694 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1695 = __VLS_asFunctionalComponent(__VLS_1694, new __VLS_1694({
    modelValue: (__VLS_ctx.eventObjectDialogVisible),
    title: (__VLS_ctx.editingEventObject ? '编辑事件' : '新增事件'),
    width: "620px",
    appendToBody: true,
}));
const __VLS_1696 = __VLS_1695({
    modelValue: (__VLS_ctx.eventObjectDialogVisible),
    title: (__VLS_ctx.editingEventObject ? '编辑事件' : '新增事件'),
    width: "620px",
    appendToBody: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1695));
__VLS_1697.slots.default;
const __VLS_1698 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_1699 = __VLS_asFunctionalComponent(__VLS_1698, new __VLS_1698({
    type: "info",
    closable: (false),
    ...{ style: {} },
    title: "事件对象只描述业务事件语义、已发布定义与启用状态；Webhook 的验签和请求解析规则统一由资源模板维护。",
}));
const __VLS_1700 = __VLS_1699({
    type: "info",
    closable: (false),
    ...{ style: {} },
    title: "事件对象只描述业务事件语义、已发布定义与启用状态；Webhook 的验签和请求解析规则统一由资源模板维护。",
}, ...__VLS_functionalComponentArgsRest(__VLS_1699));
const __VLS_1702 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_1703 = __VLS_asFunctionalComponent(__VLS_1702, new __VLS_1702({
    model: (__VLS_ctx.eventObjectForm),
    labelWidth: "105px",
}));
const __VLS_1704 = __VLS_1703({
    model: (__VLS_ctx.eventObjectForm),
    labelWidth: "105px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1703));
__VLS_1705.slots.default;
const __VLS_1706 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1707 = __VLS_asFunctionalComponent(__VLS_1706, new __VLS_1706({
    label: "事件编码",
    required: true,
}));
const __VLS_1708 = __VLS_1707({
    label: "事件编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1707));
__VLS_1709.slots.default;
const __VLS_1710 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1711 = __VLS_asFunctionalComponent(__VLS_1710, new __VLS_1710({
    modelValue: (__VLS_ctx.eventObjectForm.object_code),
    placeholder: "如 ALLOCATION_PERIOD_UNLOCKED",
}));
const __VLS_1712 = __VLS_1711({
    modelValue: (__VLS_ctx.eventObjectForm.object_code),
    placeholder: "如 ALLOCATION_PERIOD_UNLOCKED",
}, ...__VLS_functionalComponentArgsRest(__VLS_1711));
var __VLS_1709;
const __VLS_1714 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1715 = __VLS_asFunctionalComponent(__VLS_1714, new __VLS_1714({
    label: "事件名称",
    required: true,
}));
const __VLS_1716 = __VLS_1715({
    label: "事件名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1715));
__VLS_1717.slots.default;
const __VLS_1718 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_1719 = __VLS_asFunctionalComponent(__VLS_1718, new __VLS_1718({
    modelValue: (__VLS_ctx.eventObjectForm.object_name),
}));
const __VLS_1720 = __VLS_1719({
    modelValue: (__VLS_ctx.eventObjectForm.object_name),
}, ...__VLS_functionalComponentArgsRest(__VLS_1719));
var __VLS_1717;
const __VLS_1722 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1723 = __VLS_asFunctionalComponent(__VLS_1722, new __VLS_1722({
    label: "事件定义",
    required: true,
}));
const __VLS_1724 = __VLS_1723({
    label: "事件定义",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1723));
__VLS_1725.slots.default;
const __VLS_1726 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1727 = __VLS_asFunctionalComponent(__VLS_1726, new __VLS_1726({
    modelValue: (__VLS_ctx.eventObjectForm.event_definition_id),
    filterable: true,
    ...{ style: {} },
}));
const __VLS_1728 = __VLS_1727({
    modelValue: (__VLS_ctx.eventObjectForm.event_definition_id),
    filterable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1727));
__VLS_1729.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.eventDefinitions))) {
    const __VLS_1730 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1731 = __VLS_asFunctionalComponent(__VLS_1730, new __VLS_1730({
        key: (item.id),
        label: (`${item.event_name} (${item.event_code} v${item.version})`),
        value: (item.id),
    }));
    const __VLS_1732 = __VLS_1731({
        key: (item.id),
        label: (`${item.event_name} (${item.event_code} v${item.version})`),
        value: (item.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1731));
}
var __VLS_1729;
var __VLS_1725;
const __VLS_1734 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_1735 = __VLS_asFunctionalComponent(__VLS_1734, new __VLS_1734({
    label: "启用",
}));
const __VLS_1736 = __VLS_1735({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_1735));
__VLS_1737.slots.default;
const __VLS_1738 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_1739 = __VLS_asFunctionalComponent(__VLS_1738, new __VLS_1738({
    modelValue: (__VLS_ctx.eventObjectForm.is_active),
}));
const __VLS_1740 = __VLS_1739({
    modelValue: (__VLS_ctx.eventObjectForm.is_active),
}, ...__VLS_functionalComponentArgsRest(__VLS_1739));
var __VLS_1737;
var __VLS_1705;
{
    const { footer: __VLS_thisSlot } = __VLS_1697.slots;
    const __VLS_1742 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1743 = __VLS_asFunctionalComponent(__VLS_1742, new __VLS_1742({
        ...{ 'onClick': {} },
    }));
    const __VLS_1744 = __VLS_1743({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1743));
    let __VLS_1746;
    let __VLS_1747;
    let __VLS_1748;
    const __VLS_1749 = {
        onClick: (...[$event]) => {
            __VLS_ctx.eventObjectDialogVisible = false;
        }
    };
    __VLS_1745.slots.default;
    var __VLS_1745;
    const __VLS_1750 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1751 = __VLS_asFunctionalComponent(__VLS_1750, new __VLS_1750({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.eventObjectSaving),
    }));
    const __VLS_1752 = __VLS_1751({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.eventObjectSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1751));
    let __VLS_1754;
    let __VLS_1755;
    let __VLS_1756;
    const __VLS_1757 = {
        onClick: (__VLS_ctx.saveEventObject)
    };
    __VLS_1753.slots.default;
    var __VLS_1753;
}
var __VLS_1697;
const __VLS_1758 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1759 = __VLS_asFunctionalComponent(__VLS_1758, new __VLS_1758({
    modelValue: (__VLS_ctx.showEditSystemDialog),
    title: "编辑系统",
    width: "520px",
    destroyOnClose: true,
}));
const __VLS_1760 = __VLS_1759({
    modelValue: (__VLS_ctx.showEditSystemDialog),
    title: "编辑系统",
    width: "520px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_1759));
__VLS_1761.slots.default;
if (__VLS_ctx.editForm) {
    const __VLS_1762 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_1763 = __VLS_asFunctionalComponent(__VLS_1762, new __VLS_1762({
        model: (__VLS_ctx.editForm),
        labelWidth: "80px",
    }));
    const __VLS_1764 = __VLS_1763({
        model: (__VLS_ctx.editForm),
        labelWidth: "80px",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1763));
    __VLS_1765.slots.default;
    const __VLS_1766 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1767 = __VLS_asFunctionalComponent(__VLS_1766, new __VLS_1766({
        label: "名称",
    }));
    const __VLS_1768 = __VLS_1767({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1767));
    __VLS_1769.slots.default;
    const __VLS_1770 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1771 = __VLS_asFunctionalComponent(__VLS_1770, new __VLS_1770({
        modelValue: (__VLS_ctx.editForm.system_name),
    }));
    const __VLS_1772 = __VLS_1771({
        modelValue: (__VLS_ctx.editForm.system_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1771));
    var __VLS_1769;
    const __VLS_1774 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1775 = __VLS_asFunctionalComponent(__VLS_1774, new __VLS_1774({
        label: "系统类型",
    }));
    const __VLS_1776 = __VLS_1775({
        label: "系统类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1775));
    __VLS_1777.slots.default;
    const __VLS_1778 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1779 = __VLS_asFunctionalComponent(__VLS_1778, new __VLS_1778({
        modelValue: (__VLS_ctx.editForm.system_type),
        ...{ style: {} },
    }));
    const __VLS_1780 = __VLS_1779({
        modelValue: (__VLS_ctx.editForm.system_type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1779));
    __VLS_1781.slots.default;
    const __VLS_1782 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1783 = __VLS_asFunctionalComponent(__VLS_1782, new __VLS_1782({
        label: "HR SaaS",
        value: "HR_SAAS",
    }));
    const __VLS_1784 = __VLS_1783({
        label: "HR SaaS",
        value: "HR_SAAS",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1783));
    const __VLS_1786 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1787 = __VLS_asFunctionalComponent(__VLS_1786, new __VLS_1786({
        label: "OA 协同",
        value: "OA",
    }));
    const __VLS_1788 = __VLS_1787({
        label: "OA 协同",
        value: "OA",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1787));
    const __VLS_1790 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1791 = __VLS_asFunctionalComponent(__VLS_1790, new __VLS_1790({
        label: "IM",
        value: "IM",
    }));
    const __VLS_1792 = __VLS_1791({
        label: "IM",
        value: "IM",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1791));
    const __VLS_1794 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1795 = __VLS_asFunctionalComponent(__VLS_1794, new __VLS_1794({
        label: "财务",
        value: "FINANCE",
    }));
    const __VLS_1796 = __VLS_1795({
        label: "财务",
        value: "FINANCE",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1795));
    const __VLS_1798 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1799 = __VLS_asFunctionalComponent(__VLS_1798, new __VLS_1798({
        label: "自定义",
        value: "CUSTOM",
    }));
    const __VLS_1800 = __VLS_1799({
        label: "自定义",
        value: "CUSTOM",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1799));
    var __VLS_1781;
    var __VLS_1777;
    const __VLS_1802 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1803 = __VLS_asFunctionalComponent(__VLS_1802, new __VLS_1802({
        label: "负责人",
    }));
    const __VLS_1804 = __VLS_1803({
        label: "负责人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1803));
    __VLS_1805.slots.default;
    const __VLS_1806 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1807 = __VLS_asFunctionalComponent(__VLS_1806, new __VLS_1806({
        modelValue: (__VLS_ctx.editForm.owner),
        placeholder: "员工 ID 或姓名",
    }));
    const __VLS_1808 = __VLS_1807({
        modelValue: (__VLS_ctx.editForm.owner),
        placeholder: "员工 ID 或姓名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1807));
    var __VLS_1805;
    const __VLS_1810 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1811 = __VLS_asFunctionalComponent(__VLS_1810, new __VLS_1810({
        label: "域/团队",
    }));
    const __VLS_1812 = __VLS_1811({
        label: "域/团队",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1811));
    __VLS_1813.slots.default;
    const __VLS_1814 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1815 = __VLS_asFunctionalComponent(__VLS_1814, new __VLS_1814({
        modelValue: (__VLS_ctx.editForm.domain),
        placeholder: "如 HR / SSC / IT",
    }));
    const __VLS_1816 = __VLS_1815({
        modelValue: (__VLS_ctx.editForm.domain),
        placeholder: "如 HR / SSC / IT",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1815));
    var __VLS_1813;
    const __VLS_1818 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1819 = __VLS_asFunctionalComponent(__VLS_1818, new __VLS_1818({
        label: "描述",
    }));
    const __VLS_1820 = __VLS_1819({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1819));
    __VLS_1821.slots.default;
    const __VLS_1822 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1823 = __VLS_asFunctionalComponent(__VLS_1822, new __VLS_1822({
        modelValue: (__VLS_ctx.editForm.description),
        type: "textarea",
        rows: (2),
    }));
    const __VLS_1824 = __VLS_1823({
        modelValue: (__VLS_ctx.editForm.description),
        type: "textarea",
        rows: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1823));
    var __VLS_1821;
    const __VLS_1826 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1827 = __VLS_asFunctionalComponent(__VLS_1826, new __VLS_1826({
        label: "标签",
    }));
    const __VLS_1828 = __VLS_1827({
        label: "标签",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1827));
    __VLS_1829.slots.default;
    const __VLS_1830 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_1831 = __VLS_asFunctionalComponent(__VLS_1830, new __VLS_1830({
        modelValue: (__VLS_ctx.editForm.tagsStr),
        placeholder: "逗号分隔，如 生产,核心,敏感",
    }));
    const __VLS_1832 = __VLS_1831({
        modelValue: (__VLS_ctx.editForm.tagsStr),
        placeholder: "逗号分隔，如 生产,核心,敏感",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1831));
    var __VLS_1829;
    const __VLS_1834 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1835 = __VLS_asFunctionalComponent(__VLS_1834, new __VLS_1834({
        label: "敏感级别",
    }));
    const __VLS_1836 = __VLS_1835({
        label: "敏感级别",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1835));
    __VLS_1837.slots.default;
    const __VLS_1838 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_1839 = __VLS_asFunctionalComponent(__VLS_1838, new __VLS_1838({
        modelValue: (__VLS_ctx.editForm.sensitivity),
        ...{ style: {} },
    }));
    const __VLS_1840 = __VLS_1839({
        modelValue: (__VLS_ctx.editForm.sensitivity),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1839));
    __VLS_1841.slots.default;
    const __VLS_1842 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1843 = __VLS_asFunctionalComponent(__VLS_1842, new __VLS_1842({
        label: "公开",
        value: "public",
    }));
    const __VLS_1844 = __VLS_1843({
        label: "公开",
        value: "public",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1843));
    const __VLS_1846 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1847 = __VLS_asFunctionalComponent(__VLS_1846, new __VLS_1846({
        label: "内部",
        value: "internal",
    }));
    const __VLS_1848 = __VLS_1847({
        label: "内部",
        value: "internal",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1847));
    const __VLS_1850 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1851 = __VLS_asFunctionalComponent(__VLS_1850, new __VLS_1850({
        label: "机密",
        value: "confidential",
    }));
    const __VLS_1852 = __VLS_1851({
        label: "机密",
        value: "confidential",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1851));
    const __VLS_1854 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_1855 = __VLS_asFunctionalComponent(__VLS_1854, new __VLS_1854({
        label: "绝密",
        value: "restricted",
    }));
    const __VLS_1856 = __VLS_1855({
        label: "绝密",
        value: "restricted",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1855));
    var __VLS_1841;
    var __VLS_1837;
    const __VLS_1858 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_1859 = __VLS_asFunctionalComponent(__VLS_1858, new __VLS_1858({
        label: "状态",
    }));
    const __VLS_1860 = __VLS_1859({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1859));
    __VLS_1861.slots.default;
    const __VLS_1862 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_1863 = __VLS_asFunctionalComponent(__VLS_1862, new __VLS_1862({
        modelValue: (__VLS_ctx.editForm.is_active),
        activeValue: (1),
        inactiveValue: (0),
        activeText: "启用",
        inactiveText: "停用",
    }));
    const __VLS_1864 = __VLS_1863({
        modelValue: (__VLS_ctx.editForm.is_active),
        activeValue: (1),
        inactiveValue: (0),
        activeText: "启用",
        inactiveText: "停用",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1863));
    var __VLS_1861;
    var __VLS_1765;
}
{
    const { footer: __VLS_thisSlot } = __VLS_1761.slots;
    const __VLS_1866 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1867 = __VLS_asFunctionalComponent(__VLS_1866, new __VLS_1866({
        ...{ 'onClick': {} },
    }));
    const __VLS_1868 = __VLS_1867({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1867));
    let __VLS_1870;
    let __VLS_1871;
    let __VLS_1872;
    const __VLS_1873 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showEditSystemDialog = false;
        }
    };
    __VLS_1869.slots.default;
    var __VLS_1869;
    const __VLS_1874 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1875 = __VLS_asFunctionalComponent(__VLS_1874, new __VLS_1874({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSubmitting),
    }));
    const __VLS_1876 = __VLS_1875({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSubmitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1875));
    let __VLS_1878;
    let __VLS_1879;
    let __VLS_1880;
    const __VLS_1881 = {
        onClick: (__VLS_ctx.submitEditSystem)
    };
    __VLS_1877.slots.default;
    var __VLS_1877;
}
var __VLS_1761;
/** @type {__VLS_StyleScopedClasses['systems-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row-4col']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sys']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-res']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-cred']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-abnormal']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['optimized-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pills']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['warn']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-pill']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
/** @type {__VLS_StyleScopedClasses['loading-state']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['system-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['system-detail-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['quick-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-head']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-head']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-list']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-item']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-item-info']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-item-name']} */ ;
/** @type {__VLS_StyleScopedClasses['cred-item-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-head']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-content']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['capability-result-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-object-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-object-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-object-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['is-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-list']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-info']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-code']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['ref-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['drawer-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-steps']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-step']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-label']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['capability-list']} */ ;
/** @type {__VLS_StyleScopedClasses['capability-card']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['capability-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-step3-head']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-step3-title']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['finish-checklist']} */ ;
/** @type {__VLS_StyleScopedClasses['check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ok']} */ ;
/** @type {__VLS_StyleScopedClasses['check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ok']} */ ;
/** @type {__VLS_StyleScopedClasses['check-item']} */ ;
/** @type {__VLS_StyleScopedClasses['ok']} */ ;
/** @type {__VLS_StyleScopedClasses['skip']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-template-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-template-options']} */ ;
/** @type {__VLS_StyleScopedClasses['resource-template-option']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            ArrowRight: ArrowRight,
            CircleCheck: CircleCheck,
            Connection: Connection,
            DocumentRemove: DocumentRemove,
            Key: Key,
            Loading: Loading,
            Plus: Plus,
            Search: Search,
            SchemaFormField: SchemaFormField,
            CredentialForm: CredentialForm,
            SystemCard: SystemCard,
            searchKw: searchKw,
            loading: loading,
            submitting: submitting,
            systems: systems,
            overviewMap: overviewMap,
            credentials: credentials,
            editSchema: editSchema,
            editFormValues: editFormValues,
            connectorLabel: connectorLabel,
            connectorObjectLabel: connectorObjectLabel,
            drawerOpen: drawerOpen,
            activeSystem: activeSystem,
            systemCredentials: systemCredentials,
            systemCapabilities: systemCapabilities,
            capabilityTestVisible: capabilityTestVisible,
            capabilityUnderTest: capabilityUnderTest,
            capabilityTestParameters: capabilityTestParameters,
            capabilityTestFields: capabilityTestFields,
            capabilityTestResultVisible: capabilityTestResultVisible,
            capabilityResultTab: capabilityResultTab,
            capabilityTestResult: capabilityTestResult,
            capabilityTestHistory: capabilityTestHistory,
            capabilityTestHistoryLoading: capabilityTestHistoryLoading,
            capabilityResultRows: capabilityResultRows,
            credentialEditVisible: credentialEditVisible,
            credentialEditForm: credentialEditForm,
            webhookIngressForm: webhookIngressForm,
            webhookVerifying: webhookVerifying,
            webhookOverrideEditing: webhookOverrideEditing,
            verifyWebhookResource: verifyWebhookResource,
            webhookUrl: webhookUrl,
            copyWebhookUrl: copyWebhookUrl,
            openResourceTemplateConfig: openResourceTemplateConfig,
            resourceDrawerOpen: resourceDrawerOpen,
            activeResource: activeResource,
            bitableTables: bitableTables,
            bitableTablesLoading: bitableTablesLoading,
            bitableDialogVisible: bitableDialogVisible,
            bitableSaving: bitableSaving,
            editingBitableTable: editingBitableTable,
            bitableForm: bitableForm,
            dataObjects: dataObjects,
            dataObjectDialogVisible: dataObjectDialogVisible,
            dataObjectSaving: dataObjectSaving,
            editingDataObject: editingDataObject,
            dataObjectForm: dataObjectForm,
            eventObjects: eventObjects,
            eventDefinitions: eventDefinitions,
            eventObjectDialogVisible: eventObjectDialogVisible,
            eventObjectSaving: eventObjectSaving,
            editingEventObject: editingEventObject,
            eventObjectForm: eventObjectForm,
            objectConfigTitle: objectConfigTitle,
            objectConfigPlaceholder: objectConfigPlaceholder,
            usingPipelines: usingPipelines,
            usingPipelinesLoading: usingPipelinesLoading,
            resourceEditForm: resourceEditForm,
            showAddSystem: showAddSystem,
            wizardStep: wizardStep,
            connectorPackages: connectorPackages,
            selectedConnectorCategory: selectedConnectorCategory,
            selectedPackageCode: selectedPackageCode,
            selectedOperationIds: selectedOperationIds,
            usesCapabilityPackage: usesCapabilityPackage,
            requiresResourceSetup: requiresResourceSetup,
            selectedPackage: selectedPackage,
            selectedPackageOperations: selectedPackageOperations,
            wizardSteps: wizardSteps,
            wizardTitle: wizardTitle,
            systemForm: systemForm,
            showAddResource: showAddResource,
            addResourceSystem: addResourceSystem,
            resourceForm: resourceForm,
            resourceTemplates: resourceTemplates,
            credForm: credForm,
            wizardResources: wizardResources,
            currentSystemFields: currentSystemFields,
            filteredSystems: filteredSystems,
            detailTab: detailTab,
            detailPipelines: detailPipelines,
            detailExecutions: detailExecutions,
            detailAuditLogs: detailAuditLogs,
            resourcesOf: resourcesOf,
            execStatusColor: execStatusColor,
            kpi: kpi,
            inactiveSystemCount: inactiveSystemCount,
            abnormalSystemCount: abnormalSystemCount,
            credentialRiskCount: credentialRiskCount,
            healthySystemCount: healthySystemCount,
            systemHealth: systemHealth,
            systemResources: systemResources,
            systemCredentialsOf: systemCredentialsOf,
            openSystem: openSystem,
            toggleSystemCapability: toggleSystemCapability,
            openEditCredential: openEditCredential,
            saveCredentialEdit: saveCredentialEdit,
            openCapabilityTest: openCapabilityTest,
            submitCapabilityTest: submitCapabilityTest,
            loadCapabilityTestHistory: loadCapabilityTestHistory,
            openCapabilityTestResults: openCapabilityTestResults,
            viewCapabilityTestRun: viewCapabilityTestRun,
            objectEntries: objectEntries,
            resultFieldLabel: resultFieldLabel,
            displayResultValue: displayResultValue,
            openBitableTableDialog: openBitableTableDialog,
            saveBitableTable: saveBitableTable,
            removeBitableTable: removeBitableTable,
            previewBitableTable: previewBitableTable,
            openDataObjectDialog: openDataObjectDialog,
            saveDataObject: saveDataObject,
            removeDataObject: removeDataObject,
            openEventObjectDialog: openEventObjectDialog,
            saveEventObject: saveEventObject,
            verifyEventObject: verifyEventObject,
            removeEventObject: removeEventObject,
            openResource: openResource,
            triggerTypeColor: triggerTypeColor,
            triggerTypeLabel: triggerTypeLabel,
            pipelineStatusColor: pipelineStatusColor,
            pipelineStatusLabel: pipelineStatusLabel,
            goToPipeline: goToPipeline,
            addResource: addResource,
            showEditSystemDialog: showEditSystemDialog,
            editForm: editForm,
            editSubmitting: editSubmitting,
            editSystem: editSystem,
            submitEditSystem: submitEditSystem,
            confirmDeleteSystem: confirmDeleteSystem,
            saveResource: saveResource,
            confirmDeleteResource: confirmDeleteResource,
            openAddSystemWizard: openAddSystemWizard,
            selectConnectorPackage: selectConnectorPackage,
            openAddCredentialForSystem: openAddCredentialForSystem,
            setPrimaryCredential: setPrimaryCredential,
            cancelWizard: cancelWizard,
            submitSystemStep1: submitSystemStep1,
            submitSystemStep2: submitSystemStep2,
            submitSystemStep3: submitSystemStep3,
            addResourceFromWizard: addResourceFromWizard,
            finishWizardAll: finishWizardAll,
            submitResource: submitResource,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
