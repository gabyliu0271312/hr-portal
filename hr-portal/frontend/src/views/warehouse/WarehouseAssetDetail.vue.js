/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, Link, Edit, Delete, List, DataAnalysis, Connection } from '@element-plus/icons-vue';
import ResourcePicker from '@/components/warehouse/ResourcePicker.vue';
import { getAsset, updateAsset, updatePeriodConfig, listAssetColumns, getAssetEndpoints, getAssetSyncHistory, getUcpRoute, UCP_DISABLED_TEXT, UCP_NOT_CONNECTED_TEXT, } from '@/api/warehouse';
import { useUserStore } from '@/stores/user';
import { formatDateTime } from '@/utils/datetime';
import { dataApi } from '@/api/data';
import { datasourcesApi } from '@/api/datasources';
import { adminTablesApi } from '@/api/admin_tables';
import { SOURCE_TYPES, } from '@/config/dataSources';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
import PushTargetList from '@/components/push/PushTargetList.vue';
import PermissionButton from '@/components/PermissionButton.vue';
import IngestionModeSelect from '@/components/warehouse/IngestionModeSelect.vue';
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tableName = route.params.tableName;
const asset = ref(null);
const loading = ref(false);
const error = ref(null);
// 来源与开放
const endpoints = ref(null);
const endpointsLoading = ref(false);
const syncingEndpointIds = ref(new Set());
const deletingEndpointIds = ref(new Set());
const periodFieldReady = ref(false);
// 数据预览
const previewRows = ref([]);
const previewColumns = ref([]);
const previewLoading = ref(false);
const previewTotal = ref(0);
const previewPage = ref(1);
const PREVIEW_PAGE_SIZE = 20;
function getColumnWidth(col) {
    // 基于 header + 当前页数据内容计算列宽（自适应）
    const headerText = col.label || col.code;
    let maxPx = measureTextPx(headerText, 30);
    for (const row of previewRows.value) {
        const val = row[col.code];
        if (val != null && val !== '') {
            maxPx = Math.max(maxPx, measureTextPx(String(val), 50));
        }
    }
    return Math.min(360, Math.max(100, maxPx + 40));
}
function measureTextPx(text, maxChars) {
    let w = 0;
    for (const ch of text.slice(0, maxChars)) {
        w += ch.charCodeAt(0) > 127 ? 16 : 9;
    }
    return w;
}
async function loadPreview(resetPage = false) {
    if (resetPage)
        previewPage.value = 1;
    previewLoading.value = true;
    try {
        const res = await dataApi.query(tableName, { page: previewPage.value, page_size: PREVIEW_PAGE_SIZE });
        previewRows.value = res.items || [];
        previewTotal.value = res.total || 0;
        if (previewColumns.value.length === 0) {
            previewColumns.value = await dataApi.columns(tableName);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览数据加载失败');
    }
    finally {
        previewLoading.value = false;
    }
}
// 同步历史
const syncHistory = ref([]);
const syncHistoryLoading = ref(false);
// DataSource 抽屉 (T0211) — 完整迁移旧 Endpoints.vue 的拉取接口配置
const dsDrawerVisible = ref(false);
const dsDrawerMode = ref('create');
const dsEditId = ref(null);
const dsEditRow = ref(null);
const dsForm = reactive({
    source_type: 'beisen_report',
    schedule: '每日 06:00',
    is_active: true,
    ingestion_mode: null,
    sync_semantics: '',
    write_strategy: '',
    missing_row_strategy: '',
    business_key_fields: '',
    config: {},
});
const dsSaving = ref(false);
const dsTesting = ref(false);
const dsDiscovering = ref(false);
const discoveredFields = ref([]);
const selectedPeriodField = ref('');
const dsTestResult = ref(null);
// 月度自动偏移表
const injectTables = ref(new Set());
const sourceTypes = ref([...SOURCE_TYPES]);
const connectorCatalogLoading = ref(false);
const currentType = computed(() => sourceTypes.value.find((item) => item.code === dsForm.source_type));
const hasResolvableFeishuLink = computed(() => {
    if (dsForm.source_type !== 'feishu_sheet')
        return false;
    const value = String(dsForm.config.FEISHU_WIKI_URL_OR_TOKEN || '').trim();
    try {
        const url = new URL(value);
        return /(^|\.)feishu\.cn$/i.test(url.hostname) && /\/(wiki|sheets)\//.test(url.pathname);
    }
    catch {
        return false;
    }
});
const feishuLinkStatus = computed(() => hasResolvableFeishuLink.value
    ? '\u5df2\u8bc6\u522b\u98de\u4e66\u8868\u683c\u94fe\u63a5\uff1a\u7cfb\u7edf\u5c06\u81ea\u52a8\u5b9a\u4f4d\u8868\u683c\u4e0e\u5de5\u4f5c\u8868\u3002'
    : '\u8bf7\u7c98\u8d34\u98de\u4e66 Wiki \u6216\u5728\u7ebf\u8868\u683c\u5b8c\u6574\u94fe\u63a5\uff1b\u65e0\u6cd5\u8bc6\u522b\u65f6\u518d\u624b\u52a8\u8865\u5145\u5b9a\u4f4d\u4fe1\u606f\u3002');
const isPeriodTable = computed(() => injectTables.value.has(tableName));
const businessKeyLabels = ref([]);
function modeFromSavedPolicy(saved) {
    if (saved.ingestion_mode)
        return saved.ingestion_mode;
    if (saved.sync_semantics === 'incremental_append' && saved.write_strategy === 'append')
        return 'append';
    if (saved.sync_semantics === 'incremental_upsert' && saved.write_strategy === 'incremental_upsert')
        return 'incremental_upsert';
    if (saved.sync_semantics === 'full_snapshot' && saved.write_strategy === 'incremental_upsert' && saved.missing_row_strategy === 'mark_inactive')
        return 'current_snapshot';
    return null;
}
const monthOffset = computed({
    get: () => parseInt(dsForm.config['MONTH_OFFSET'] ?? '0', 10) || 0,
    set: (v) => (dsForm.config['MONTH_OFFSET'] = String(v ?? 0)),
});
const monthPreview = computed(() => {
    const d = new Date();
    const idx = d.getFullYear() * 12 + d.getMonth() + monthOffset.value;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}${String(m).padStart(2, '0')}`;
});
const SECRET_KEY_SET = new Set([
    'BEISEN_APP_KEY', 'BEISEN_APP_SECRET', 'BEISEN_API_APP_KEY', 'BEISEN_API_APP_SECRET',
    'HTTP_CREDENTIAL', 'WEBHOOK_TOKEN', 'DB_PASSWORD', 'FEISHU_APP_ID', 'FEISHU_APP_SECRET',
]);
const connectorCatalogFallback = ref(false);
function getSourceType(code) {
    return sourceTypes.value.find((item) => item.code === code);
}
function initFormForSourceType(code) {
    const type = getSourceType(code);
    return Object.fromEntries((type?.groups || []).flatMap((group) => group.fields.map((field) => [field.key, field.default ?? ''])));
}
function shouldShowSourceField(key) {
    if (dsForm.source_type !== 'feishu_sheet')
        return true;
    if (!hasResolvableFeishuLink.value)
        return true;
    return !['FEISHU_SPREADSHEET_TOKEN', 'FEISHU_SHEET_ID'].includes(key);
}
async function loadConnectorCatalog() {
    connectorCatalogLoading.value = true;
    try {
        const remoteTypes = await datasourcesApi.types('warehouse');
        for (const remote of remoteTypes) {
            const index = sourceTypes.value.findIndex((item) => item.code === remote.code);
            const normalized = {
                code: remote.code,
                label: remote.label,
                description: remote.description,
                groups: remote.groups,
                testable: remote.testable,
                defaultSchedule: remote.defaultSchedule,
            };
            if (index >= 0)
                sourceTypes.value[index] = { ...sourceTypes.value[index], ...normalized };
            else
                sourceTypes.value.push(normalized);
            for (const key of remote.secret_keys || [])
                SECRET_KEY_SET.add(key);
        }
    }
    catch (_error) {
        connectorCatalogFallback.value = true;
    }
    finally {
        connectorCatalogLoading.value = false;
    }
}
function onTypeChange(newType) {
    const old = { ...dsForm.config };
    const t = getSourceType(newType);
    if (!t)
        return;
    const fresh = initFormForSourceType(newType);
    for (const k of Object.keys(fresh)) {
        if (old[k])
            fresh[k] = old[k];
    }
    dsForm.config = fresh;
    dsForm.schedule = t.defaultSchedule ?? dsForm.schedule;
    dsTestResult.value = null;
}
function fieldPlaceholder(key, original) {
    if (SECRET_KEY_SET.has(key) && dsEditRow.value?.has_secret?.[key])
        return '••• 已保存（留空不变；填新值则覆盖）';
    return original ?? '';
}
function allowManualInput(event) {
    ;
    event.target?.removeAttribute('readonly');
}
function hasSecret(key) { return !!dsEditRow.value?.has_secret?.[key]; }
function splitPayload() {
    const settings = {};
    const secrets = {};
    const userLoginName = userStore.user?.login_name || '';
    for (const [k, v] of Object.entries(dsForm.config)) {
        if (SECRET_KEY_SET.has(k)) {
            if (v && !(hasSecret(k) && v === userLoginName))
                secrets[k] = v;
        }
        else
            settings[k] = v;
    }
    return { settings, secrets };
}
async function openCreateDS() {
    dsDrawerMode.value = 'create';
    dsEditId.value = null;
    dsEditRow.value = null;
    const t = getSourceType('beisen_report');
    dsForm.source_type = 'beisen_report';
    dsForm.schedule = t?.defaultSchedule ?? '每日 06:00';
    dsForm.is_active = true;
    dsForm.ingestion_mode = null;
    dsForm.sync_semantics = '';
    dsForm.write_strategy = '';
    dsForm.missing_row_strategy = '';
    dsForm.business_key_fields = '';
    dsForm.config = initFormForSourceType('beisen_report');
    dsTestResult.value = null;
    discoveredFields.value = [];
    selectedPeriodField.value = '';
    dsDrawerVisible.value = true;
}
function openDataSourceConfig() {
    const existing = endpoints.value?.pulls[0];
    if (existing) {
        void openEditDS(existing);
        return;
    }
    void openCreateDS();
}
async function openEditDS(ep) {
    dsDrawerMode.value = 'edit';
    dsEditId.value = ep.endpoint_id;
    try {
        const saved = await datasourcesApi.get(ep.endpoint_id);
        const t = getSourceType(saved.source_type) || getSourceType('beisen_report');
        const merged = initFormForSourceType(saved.source_type);
        for (const [k, v] of Object.entries(saved.settings || {})) {
            merged[k] = String(v ?? '');
        }
        if (injectTables.value.has(tableName) && !merged['MONTH_OFFSET'])
            merged['MONTH_OFFSET'] = '0';
        dsForm.source_type = saved.source_type;
        dsForm.schedule = saved.schedule || t?.defaultSchedule || '';
        dsForm.is_active = saved.is_active;
        dsForm.ingestion_mode = modeFromSavedPolicy(saved);
        dsForm.sync_semantics = saved.sync_semantics || '';
        dsForm.write_strategy = saved.write_strategy || '';
        dsForm.missing_row_strategy = saved.missing_row_strategy || '';
        dsForm.business_key_fields = (saved.business_key_fields || []).join(', ');
        dsForm.config = merged;
        dsEditRow.value = saved;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载入仓来源配置失败');
        return;
    }
    dsTestResult.value = null;
    discoveredFields.value = [];
    selectedPeriodField.value = '';
    dsDrawerVisible.value = true;
}
async function saveDS() {
    if (dsSaving.value)
        return;
    const t = currentType.value;
    if (t) {
        for (const g of t.groups) {
            for (const f of g.fields) {
                if (!f.required)
                    continue;
                const val = dsForm.config[f.key];
                if (SECRET_KEY_SET.has(f.key)) {
                    if (!val && !hasSecret(f.key)) {
                        ElMessage.warning(`「${f.label}」为必填`);
                        return;
                    }
                }
                else if (!val?.trim()) {
                    ElMessage.warning(`「${f.label}」为必填`);
                    return;
                }
            }
        }
    }
    dsSaving.value = true;
    try {
        const { settings, secrets } = splitPayload();
        const writePolicy = {
            ingestion_mode: dsForm.ingestion_mode,
        };
        if (dsDrawerMode.value === 'create') {
            const created = await datasourcesApi.create({
                table_name: tableName,
                table_label: asset.value?.table_label || tableName,
                source_type: dsForm.source_type,
                schedule: dsForm.schedule,
                is_active: dsForm.is_active,
                ...writePolicy,
            });
            await datasourcesApi.update(created.id, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active, ...writePolicy });
            ElMessage.success('入仓来源已保存');
        }
        else if (dsEditId.value) {
            await datasourcesApi.update(dsEditId.value, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active, ...writePolicy });
            ElMessage.success('入仓来源已更新');
        }
        dsDrawerVisible.value = false;
        endpoints.value = null;
        await loadEndpoints();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        dsSaving.value = false;
    }
}
async function dsTest() {
    if (!dsEditId.value && dsDrawerMode.value !== 'edit') {
        ElMessage.warning('请先保存后再测试连接');
        return;
    }
    dsTesting.value = true;
    dsTestResult.value = null;
    try {
        const { settings, secrets } = splitPayload();
        const res = await datasourcesApi.test(dsEditId.value, { source_type: dsForm.source_type, schedule: dsForm.schedule, settings, secrets, is_active: dsForm.is_active });
        dsTestResult.value = { ok: res.ok, message: res.ok ? `连接成功${res.token_preview ? ` · token: ${res.token_preview}` : ''}` : res.message };
    }
    catch (e) {
        dsTestResult.value = { ok: false, message: e?.response?.data?.detail || '测试失败' };
    }
    finally {
        dsTesting.value = false;
    }
}
async function dsDiscoverFields() {
    if (!dsEditId.value) {
        ElMessage.warning('请先保存来源配置');
        return;
    }
    dsDiscovering.value = true;
    try {
        discoveredFields.value = await datasourcesApi.discoverFields(dsEditId.value);
        if (!discoveredFields.value.length)
            ElMessage.warning('未发现字段，请检查读取范围和表头行');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '字段发现失败');
    }
    finally {
        dsDiscovering.value = false;
    }
}
async function savePeriodField() {
    const field = discoveredFields.value.find(item => item.column_code === selectedPeriodField.value);
    if (!field) {
        ElMessage.warning('请选择期间字段');
        return;
    }
    if (!field.is_yearmonth) {
        ElMessage.warning('该字段样本不是有效年月');
        return;
    }
    try {
        await updatePeriodConfig(tableName, {
            period_col: field.column_code,
            period_source: 'field',
            source_label: field.label,
        });
        ElMessage.success(`期间字段已设置为 ${field.label}`);
        await load();
        periodFieldReady.value = true;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存期间字段失败');
    }
}
async function dsSync(ep) {
    if (syncingEndpointIds.value.has(ep.endpoint_id))
        return;
    syncingEndpointIds.value = new Set(syncingEndpointIds.value).add(ep.endpoint_id);
    try {
        ElMessage.info('正在读取飞书并写入本地 ODS，请稍候...');
        const res = await datasourcesApi.sync(ep.endpoint_id);
        if (res.ok) {
            ElMessage.success(`同步完成：${res.message}`);
            endpoints.value = null;
            syncHistory.value = [];
            await Promise.all([load(), loadEndpoints(), loadSyncHistory()]);
            await loadPreview(true);
        }
        else {
            ElMessage.error(`同步失败：${res.message}`);
            endpoints.value = null;
            syncHistory.value = [];
            await Promise.all([loadEndpoints(), loadSyncHistory()]);
        }
    }
    catch (e) {
        const message = e?.code === 'ECONNABORTED'
            ? '同步请求等待超时，请到同步历史查看最终状态'
            : (e?.response?.data?.detail || '同步触发失败');
        ElMessage.error(message);
        endpoints.value = null;
        syncHistory.value = [];
        await Promise.all([loadEndpoints(), loadSyncHistory()]);
    }
    finally {
        const next = new Set(syncingEndpointIds.value);
        next.delete(ep.endpoint_id);
        syncingEndpointIds.value = next;
    }
}
async function dsDelete(ep) {
    try {
        await ElMessageBox.confirm(`确认删除入仓来源「${ep.name}」？删除后该接口配置和同步历史将被清除。`, '确认删除', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' });
    }
    catch {
        return; // 用户取消
    }
    deletingEndpointIds.value = new Set(deletingEndpointIds.value).add(ep.endpoint_id);
    try {
        await datasourcesApi.remove(ep.endpoint_id);
        ElMessage.success('已删除');
        endpoints.value = null;
        syncHistory.value = [];
        await Promise.all([load(), loadEndpoints(), loadSyncHistory()]);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
    finally {
        const next = new Set(deletingEndpointIds.value);
        next.delete(ep.endpoint_id);
        deletingEndpointIds.value = next;
    }
}
async function loadInjectTables() {
    try {
        const tables = await adminTablesApi.list();
        injectTables.value = new Set(tables.filter(t => t.period_source === 'inject').map(t => t.table_name));
    }
    catch {
        injectTables.value = new Set();
    }
}
// Tab
const activeTab = ref('overview');
// 编辑模式
const editMode = ref(false);
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy';
import LayerTag from '@/components/warehouse/LayerTag.vue';
import { WAREHOUSE_LAYER_OPTIONS } from '@/constants/warehouseLayers';
const editForm = ref({ warehouse_layer: '', subject_area: '', owner_name: '', asset_status: '', description: '', scope_strategy: '', ucp_system_id: null, ucp_resource_id: null, ucp_resource_name: '' });
const editSaving = ref(false);
const STATUS_OPTIONS = ['draft', 'published', 'disabled', 'archived'];
const STATUS_LABELS = { draft: '草稿', published: '已发布', disabled: '已禁用', archived: '已归档' };
const QUALITY_TAG = { unknown: 'info', pass: 'success', warn: 'warning', fail: 'danger' };
const RUN_STATUS_TAG = { success: 'success', failed: 'danger', running: 'warning' };
const RUN_STATUS_LABEL = { success: '成功', failed: '失败', running: '运行中' };
async function load() {
    loading.value = true;
    error.value = null;
    try {
        asset.value = await getAsset(tableName);
        const columns = await listAssetColumns(tableName);
        businessKeyLabels.value = columns.columns.filter(column => column.is_pk_part).map(column => column.column_label);
        if (asset.value.is_period && asset.value.period_source === 'field') {
            periodFieldReady.value = columns.columns.some(column => column.column_code === asset.value?.period_col && column.is_pk_part);
        }
        else {
            periodFieldReady.value = true;
        }
    }
    catch (e) {
        const detail = e?.response?.data?.detail;
        if (e?.response?.status === 404)
            error.value = '资产不存在';
        else if (e?.response?.status === 403)
            error.value = '无权限访问该资产';
        else
            error.value = typeof detail === 'string' ? detail : '加载失败';
    }
    finally {
        loading.value = false;
    }
}
async function loadEndpoints() {
    if (endpoints.value)
        return;
    endpointsLoading.value = true;
    try {
        endpoints.value = await getAssetEndpoints(tableName);
    }
    catch {
        // 静默降级
    }
    finally {
        endpointsLoading.value = false;
    }
}
async function loadSyncHistory() {
    if (syncHistory.value.length)
        return;
    syncHistoryLoading.value = true;
    try {
        const res = await getAssetSyncHistory(tableName);
        syncHistory.value = res.entries;
    }
    catch { /* 静默降级 */ }
    finally {
        syncHistoryLoading.value = false;
    }
}
function handleTabChange(tab) {
    if (tab === 'endpoints')
        loadEndpoints();
    if (tab === 'sync')
        loadSyncHistory();
    if (tab === 'preview')
        loadPreview();
}
function goBack() { router.back(); }
function handleUcpJump() {
    if (!asset.value)
        return;
    const route = getUcpRoute(asset.value.ucp);
    if (route)
        router.push(route);
}
function enterEdit() {
    if (!asset.value)
        return;
    editForm.value = {
        warehouse_layer: asset.value.warehouse_layer,
        subject_area: asset.value.subject_area || '',
        owner_name: asset.value.owner_name || '',
        asset_status: asset.value.asset_status,
        description: asset.value.description || '',
        scope_strategy: asset.value.scope_strategy || '',
        ucp_system_id: asset.value.ucp_system_id ?? null,
        ucp_resource_id: asset.value.ucp_resource_id ?? null,
        ucp_resource_name: '',
    };
    editMode.value = true;
}
function cancelEdit() { editMode.value = false; }
async function saveEdit() {
    if (!asset.value)
        return;
    editSaving.value = true;
    try {
        await updateAsset(tableName, {
            warehouse_layer: editForm.value.warehouse_layer,
            subject_area: editForm.value.subject_area || null,
            owner_name: editForm.value.owner_name || null,
            ucp_system_id: editForm.value.ucp_system_id,
            ucp_resource_id: editForm.value.ucp_resource_id,
            asset_status: editForm.value.asset_status,
            description: editForm.value.description || null,
            scope_strategy: editForm.value.scope_strategy || null,
        });
        ElMessage.success('保存成功');
        editMode.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        editSaving.value = false;
    }
}
function goFields() { router.push(`/warehouse/assets/${encodeURIComponent(tableName)}/columns`); }
function goPreview() { activeTab.value = 'preview'; loadPreview(); }
function goImpact() { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`); }
// 端点辅助
function epFlat() {
    if (!endpoints.value)
        return [];
    return [...endpoints.value.pulls, ...endpoints.value.pushes, ...endpoints.value.exposes, ...endpoints.value.ucp_resources];
}
const statusTagType = { draft: 'info', published: 'success', disabled: 'warning', archived: 'info' };
onMounted(() => {
    loadConnectorCatalog();
    load();
    loadInjectTables();
    if (route.query.tab === 'preview') {
        activeTab.value = 'preview';
        loadPreview();
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    text: true,
    size: "small",
    icon: (__VLS_ctx.ArrowLeft),
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    text: true,
    size: "small",
    icon: (__VLS_ctx.ArrowLeft),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.goBack)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.loading) {
    const __VLS_8 = {}.ElSkeleton;
    /** @type {[typeof __VLS_components.ElSkeleton, typeof __VLS_components.elSkeleton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        rows: (6),
        animated: true,
    }));
    const __VLS_10 = __VLS_9({
        rows: (6),
        animated: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
else if (__VLS_ctx.error) {
    const __VLS_12 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_14 = __VLS_13({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
}
else if (__VLS_ctx.asset) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
        ...{ style: {} },
    });
    (__VLS_ctx.asset.table_label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.asset.table_name);
    const __VLS_16 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        type: (__VLS_ctx.statusTagType[__VLS_ctx.asset.asset_status] || 'info'),
        size: "small",
    }));
    const __VLS_18 = __VLS_17({
        type: (__VLS_ctx.statusTagType[__VLS_ctx.asset.asset_status] || 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    (__VLS_ctx.STATUS_LABELS[__VLS_ctx.asset.asset_status] || __VLS_ctx.asset.asset_status);
    var __VLS_19;
    /** @type {[typeof LayerTag, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(LayerTag, new LayerTag({
        layer: (__VLS_ctx.asset.warehouse_layer),
    }));
    const __VLS_21 = __VLS_20({
        layer: (__VLS_ctx.asset.warehouse_layer),
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
        const __VLS_23 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
            ...{ 'onClick': {} },
            size: "small",
            icon: (__VLS_ctx.Edit),
            type: (__VLS_ctx.editMode ? 'default' : 'primary'),
        }));
        const __VLS_25 = __VLS_24({
            ...{ 'onClick': {} },
            size: "small",
            icon: (__VLS_ctx.Edit),
            type: (__VLS_ctx.editMode ? 'default' : 'primary'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        let __VLS_27;
        let __VLS_28;
        let __VLS_29;
        const __VLS_30 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.loading))
                    return;
                if (!!(__VLS_ctx.error))
                    return;
                if (!(__VLS_ctx.asset))
                    return;
                if (!(__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')))
                    return;
                __VLS_ctx.editMode ? __VLS_ctx.cancelEdit() : __VLS_ctx.enterEdit();
            }
        };
        __VLS_26.slots.default;
        (__VLS_ctx.editMode ? '取消编辑' : '编辑资产');
        var __VLS_26;
    }
    const __VLS_31 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.List),
    }));
    const __VLS_33 = __VLS_32({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.List),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    let __VLS_35;
    let __VLS_36;
    let __VLS_37;
    const __VLS_38 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.loading))
                return;
            if (!!(__VLS_ctx.error))
                return;
            if (!(__VLS_ctx.asset))
                return;
            __VLS_ctx.goFields();
        }
    };
    __VLS_34.slots.default;
    var __VLS_34;
    const __VLS_39 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.DataAnalysis),
    }));
    const __VLS_41 = __VLS_40({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.DataAnalysis),
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    let __VLS_43;
    let __VLS_44;
    let __VLS_45;
    const __VLS_46 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.loading))
                return;
            if (!!(__VLS_ctx.error))
                return;
            if (!(__VLS_ctx.asset))
                return;
            __VLS_ctx.goPreview();
        }
    };
    __VLS_42.slots.default;
    var __VLS_42;
    const __VLS_47 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Connection),
    }));
    const __VLS_49 = __VLS_48({
        ...{ 'onClick': {} },
        size: "small",
        icon: (__VLS_ctx.Connection),
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    let __VLS_51;
    let __VLS_52;
    let __VLS_53;
    const __VLS_54 = {
        onClick: (...[$event]) => {
            if (!!(__VLS_ctx.loading))
                return;
            if (!!(__VLS_ctx.error))
                return;
            if (!(__VLS_ctx.asset))
                return;
            __VLS_ctx.goImpact();
        }
    };
    __VLS_50.slots.default;
    var __VLS_50;
    if (__VLS_ctx.editMode) {
        const __VLS_55 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
            ...{ style: {} },
        }));
        const __VLS_57 = __VLS_56({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_56));
        __VLS_58.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_58.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        const __VLS_59 = {}.ElForm;
        /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
            labelWidth: "100px",
            size: "small",
        }));
        const __VLS_61 = __VLS_60({
            labelWidth: "100px",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_62.slots.default;
        const __VLS_63 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
            label: "描述",
        }));
        const __VLS_65 = __VLS_64({
            label: "描述",
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        __VLS_66.slots.default;
        const __VLS_67 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
            modelValue: (__VLS_ctx.editForm.description),
        }));
        const __VLS_69 = __VLS_68({
            modelValue: (__VLS_ctx.editForm.description),
        }, ...__VLS_functionalComponentArgsRest(__VLS_68));
        var __VLS_66;
        const __VLS_71 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
            label: "分层",
        }));
        const __VLS_73 = __VLS_72({
            label: "分层",
        }, ...__VLS_functionalComponentArgsRest(__VLS_72));
        __VLS_74.slots.default;
        const __VLS_75 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
            modelValue: (__VLS_ctx.editForm.warehouse_layer),
            ...{ style: {} },
        }));
        const __VLS_77 = __VLS_76({
            modelValue: (__VLS_ctx.editForm.warehouse_layer),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_76));
        __VLS_78.slots.default;
        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.WAREHOUSE_LAYER_OPTIONS.slice(1)))) {
            const __VLS_79 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }));
            const __VLS_81 = __VLS_80({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_80));
        }
        var __VLS_78;
        var __VLS_74;
        const __VLS_83 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
            label: "主题域",
        }));
        const __VLS_85 = __VLS_84({
            label: "主题域",
        }, ...__VLS_functionalComponentArgsRest(__VLS_84));
        __VLS_86.slots.default;
        const __VLS_87 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
            modelValue: (__VLS_ctx.editForm.subject_area),
            placeholder: "如：员工、薪酬",
        }));
        const __VLS_89 = __VLS_88({
            modelValue: (__VLS_ctx.editForm.subject_area),
            placeholder: "如：员工、薪酬",
        }, ...__VLS_functionalComponentArgsRest(__VLS_88));
        var __VLS_86;
        const __VLS_91 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
            label: "负责人",
        }));
        const __VLS_93 = __VLS_92({
            label: "负责人",
        }, ...__VLS_functionalComponentArgsRest(__VLS_92));
        __VLS_94.slots.default;
        const __VLS_95 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
            modelValue: (__VLS_ctx.editForm.owner_name),
            placeholder: "负责人姓名",
        }));
        const __VLS_97 = __VLS_96({
            modelValue: (__VLS_ctx.editForm.owner_name),
            placeholder: "负责人姓名",
        }, ...__VLS_functionalComponentArgsRest(__VLS_96));
        var __VLS_94;
        const __VLS_99 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
            label: "状态",
        }));
        const __VLS_101 = __VLS_100({
            label: "状态",
        }, ...__VLS_functionalComponentArgsRest(__VLS_100));
        __VLS_102.slots.default;
        const __VLS_103 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
            modelValue: (__VLS_ctx.editForm.asset_status),
            ...{ style: {} },
        }));
        const __VLS_105 = __VLS_104({
            modelValue: (__VLS_ctx.editForm.asset_status),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_104));
        __VLS_106.slots.default;
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.STATUS_OPTIONS))) {
            const __VLS_107 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
                key: (s),
                label: (__VLS_ctx.STATUS_LABELS[s]),
                value: (s),
            }));
            const __VLS_109 = __VLS_108({
                key: (s),
                label: (__VLS_ctx.STATUS_LABELS[s]),
                value: (s),
            }, ...__VLS_functionalComponentArgsRest(__VLS_108));
        }
        var __VLS_106;
        var __VLS_102;
        const __VLS_111 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
            label: "数据范围策略",
        }));
        const __VLS_113 = __VLS_112({
            label: "数据范围策略",
        }, ...__VLS_functionalComponentArgsRest(__VLS_112));
        __VLS_114.slots.default;
        const __VLS_115 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
            modelValue: (__VLS_ctx.editForm.scope_strategy),
            clearable: true,
            ...{ style: {} },
        }));
        const __VLS_117 = __VLS_116({
            modelValue: (__VLS_ctx.editForm.scope_strategy),
            clearable: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_116));
        __VLS_118.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.SCOPE_STRATEGY_OPTIONS))) {
            const __VLS_119 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }));
            const __VLS_121 = __VLS_120({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_120));
        }
        var __VLS_118;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_114;
        const __VLS_123 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
            label: "UCP 资源",
        }));
        const __VLS_125 = __VLS_124({
            label: "UCP 资源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_124));
        __VLS_126.slots.default;
        /** @type {[typeof ResourcePicker, ]} */ ;
        // @ts-ignore
        const __VLS_127 = __VLS_asFunctionalComponent(ResourcePicker, new ResourcePicker({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: ({ system_id: __VLS_ctx.editForm.ucp_system_id, resource_id: __VLS_ctx.editForm.ucp_resource_id, resource_name: __VLS_ctx.editForm.ucp_resource_name }),
        }));
        const __VLS_128 = __VLS_127({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: ({ system_id: __VLS_ctx.editForm.ucp_system_id, resource_id: __VLS_ctx.editForm.ucp_resource_id, resource_name: __VLS_ctx.editForm.ucp_resource_name }),
        }, ...__VLS_functionalComponentArgsRest(__VLS_127));
        let __VLS_130;
        let __VLS_131;
        let __VLS_132;
        const __VLS_133 = {
            'onUpdate:modelValue': ((v) => { __VLS_ctx.editForm.ucp_system_id = v.system_id; __VLS_ctx.editForm.ucp_resource_id = v.resource_id; __VLS_ctx.editForm.ucp_resource_name = v.resource_name || ''; })
        };
        var __VLS_129;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_126;
        const __VLS_134 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({}));
        const __VLS_136 = __VLS_135({}, ...__VLS_functionalComponentArgsRest(__VLS_135));
        __VLS_137.slots.default;
        const __VLS_138 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_139 = __VLS_asFunctionalComponent(__VLS_138, new __VLS_138({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.editSaving),
        }));
        const __VLS_140 = __VLS_139({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.editSaving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_139));
        let __VLS_142;
        let __VLS_143;
        let __VLS_144;
        const __VLS_145 = {
            onClick: (__VLS_ctx.saveEdit)
        };
        __VLS_141.slots.default;
        var __VLS_141;
        var __VLS_137;
        var __VLS_62;
        var __VLS_58;
    }
    const __VLS_146 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({}));
    const __VLS_148 = __VLS_147({}, ...__VLS_functionalComponentArgsRest(__VLS_147));
    __VLS_149.slots.default;
    const __VLS_150 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
        ...{ 'onTabChange': {} },
        modelValue: (__VLS_ctx.activeTab),
    }));
    const __VLS_152 = __VLS_151({
        ...{ 'onTabChange': {} },
        modelValue: (__VLS_ctx.activeTab),
    }, ...__VLS_functionalComponentArgsRest(__VLS_151));
    let __VLS_154;
    let __VLS_155;
    let __VLS_156;
    const __VLS_157 = {
        onTabChange: (__VLS_ctx.handleTabChange)
    };
    __VLS_153.slots.default;
    const __VLS_158 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
        label: "概览",
        name: "overview",
    }));
    const __VLS_160 = __VLS_159({
        label: "概览",
        name: "overview",
    }, ...__VLS_functionalComponentArgsRest(__VLS_159));
    __VLS_161.slots.default;
    const __VLS_162 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
        column: (2),
        border: true,
        size: "small",
    }));
    const __VLS_164 = __VLS_163({
        column: (2),
        border: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_163));
    __VLS_165.slots.default;
    const __VLS_166 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
        label: "描述",
    }));
    const __VLS_168 = __VLS_167({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_167));
    __VLS_169.slots.default;
    (__VLS_ctx.asset.description || '—');
    var __VLS_169;
    const __VLS_170 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
        label: "来源系统",
    }));
    const __VLS_172 = __VLS_171({
        label: "来源系统",
    }, ...__VLS_functionalComponentArgsRest(__VLS_171));
    __VLS_173.slots.default;
    (__VLS_ctx.asset.source_system || '—');
    var __VLS_173;
    const __VLS_174 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
        label: "负责人",
    }));
    const __VLS_176 = __VLS_175({
        label: "负责人",
    }, ...__VLS_functionalComponentArgsRest(__VLS_175));
    __VLS_177.slots.default;
    (__VLS_ctx.asset.owner_name || '—');
    var __VLS_177;
    const __VLS_178 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
        label: "字段数",
    }));
    const __VLS_180 = __VLS_179({
        label: "字段数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_179));
    __VLS_181.slots.default;
    (__VLS_ctx.asset.columns_count ?? '—');
    var __VLS_181;
    const __VLS_182 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
        label: "主题域",
    }));
    const __VLS_184 = __VLS_183({
        label: "主题域",
    }, ...__VLS_functionalComponentArgsRest(__VLS_183));
    __VLS_185.slots.default;
    (__VLS_ctx.asset.subject_area || '—');
    var __VLS_185;
    const __VLS_186 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
        label: "质量状态",
    }));
    const __VLS_188 = __VLS_187({
        label: "质量状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_187));
    __VLS_189.slots.default;
    const __VLS_190 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
        type: (__VLS_ctx.QUALITY_TAG[__VLS_ctx.asset.last_quality_status] || 'info'),
        size: "small",
    }));
    const __VLS_192 = __VLS_191({
        type: (__VLS_ctx.QUALITY_TAG[__VLS_ctx.asset.last_quality_status] || 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_191));
    __VLS_193.slots.default;
    (__VLS_ctx.asset.last_quality_status);
    var __VLS_193;
    var __VLS_189;
    const __VLS_194 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
        label: "最近同步",
    }));
    const __VLS_196 = __VLS_195({
        label: "最近同步",
    }, ...__VLS_functionalComponentArgsRest(__VLS_195));
    __VLS_197.slots.default;
    (__VLS_ctx.asset.last_synced_at ? __VLS_ctx.formatDateTime(__VLS_ctx.asset.last_synced_at) : '—');
    var __VLS_197;
    const __VLS_198 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
        label: "创建时间",
    }));
    const __VLS_200 = __VLS_199({
        label: "创建时间",
    }, ...__VLS_functionalComponentArgsRest(__VLS_199));
    __VLS_201.slots.default;
    (__VLS_ctx.asset.created_at ? __VLS_ctx.formatDateTime(__VLS_ctx.asset.created_at) : '—');
    var __VLS_201;
    if (__VLS_ctx.asset.is_period) {
        const __VLS_202 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
            label: "周期字段",
        }));
        const __VLS_204 = __VLS_203({
            label: "周期字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_203));
        __VLS_205.slots.default;
        (__VLS_ctx.asset.period_col || '待发现');
        var __VLS_205;
    }
    const __VLS_206 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
        label: "数据范围策略",
    }));
    const __VLS_208 = __VLS_207({
        label: "数据范围策略",
    }, ...__VLS_functionalComponentArgsRest(__VLS_207));
    __VLS_209.slots.default;
    (__VLS_ctx.asset.scope_strategy || '—');
    var __VLS_209;
    var __VLS_165;
    var __VLS_161;
    const __VLS_210 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
        label: "来源与开放",
        name: "endpoints",
    }));
    const __VLS_212 = __VLS_211({
        label: "来源与开放",
        name: "endpoints",
    }, ...__VLS_functionalComponentArgsRest(__VLS_211));
    __VLS_213.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.endpointsLoading) }, null, null);
    const __VLS_214 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
        shadow: "never",
        ...{ class: "ep-section" },
        ...{ style: {} },
        ...{ style: ({ borderLeftColor: __VLS_ctx.asset.asset_status === 'published' ? '#10b981' : '#f59e0b' }) },
    }));
    const __VLS_216 = __VLS_215({
        shadow: "never",
        ...{ class: "ep-section" },
        ...{ style: {} },
        ...{ style: ({ borderLeftColor: __VLS_ctx.asset.asset_status === 'published' ? '#10b981' : '#f59e0b' }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_215));
    __VLS_217.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_217.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_218 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
        type: (__VLS_ctx.asset.asset_status === 'published' ? 'success' : __VLS_ctx.asset.asset_status === 'draft' ? 'warning' : 'info'),
        size: "default",
    }));
    const __VLS_220 = __VLS_219({
        type: (__VLS_ctx.asset.asset_status === 'published' ? 'success' : __VLS_ctx.asset.asset_status === 'draft' ? 'warning' : 'info'),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_219));
    __VLS_221.slots.default;
    (__VLS_ctx.asset.asset_status === 'published' ? '已发布' : __VLS_ctx.asset.asset_status === 'draft' ? '草稿' : __VLS_ctx.asset.asset_status === 'archived' ? '已归档' : __VLS_ctx.asset.asset_status);
    var __VLS_221;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.asset.warehouse_layer === 'ODS') {
        const __VLS_222 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
            type: "danger",
            size: "default",
        }));
        const __VLS_224 = __VLS_223({
            type: "danger",
            size: "default",
        }, ...__VLS_functionalComponentArgsRest(__VLS_223));
        __VLS_225.slots.default;
        var __VLS_225;
    }
    else {
        const __VLS_226 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
            type: (__VLS_ctx.asset.asset_status === 'published' ? 'success' : 'info'),
            size: "default",
        }));
        const __VLS_228 = __VLS_227({
            type: (__VLS_ctx.asset.asset_status === 'published' ? 'success' : 'info'),
            size: "default",
        }, ...__VLS_functionalComponentArgsRest(__VLS_227));
        __VLS_229.slots.default;
        (__VLS_ctx.asset.asset_status === 'published' ? '可查询' : '未开放');
        var __VLS_229;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_230 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
        type: ((__VLS_ctx.endpoints?.exposes?.length || 0) > 0 ? 'success' : 'info'),
        size: "default",
    }));
    const __VLS_232 = __VLS_231({
        type: ((__VLS_ctx.endpoints?.exposes?.length || 0) > 0 ? 'success' : 'info'),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_231));
    __VLS_233.slots.default;
    ((__VLS_ctx.endpoints?.exposes?.length || 0) > 0 ? `${__VLS_ctx.endpoints?.exposes.length} 个端点` : '未配置');
    var __VLS_233;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_234 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
        type: ((__VLS_ctx.endpoints?.pushes?.length || 0) > 0 ? 'success' : 'info'),
        size: "default",
    }));
    const __VLS_236 = __VLS_235({
        type: ((__VLS_ctx.endpoints?.pushes?.length || 0) > 0 ? 'success' : 'info'),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_235));
    __VLS_237.slots.default;
    ((__VLS_ctx.endpoints?.pushes?.length || 0) > 0 ? `${__VLS_ctx.endpoints?.pushes.length} 个目标` : '未配置');
    var __VLS_237;
    if (__VLS_ctx.asset.asset_status !== 'published') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
    var __VLS_217;
    if (__VLS_ctx.asset?.is_period && __VLS_ctx.asset.period_source === 'field' && !__VLS_ctx.periodFieldReady) {
        const __VLS_238 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
            shadow: "never",
            ...{ class: "ep-section" },
            ...{ style: {} },
        }));
        const __VLS_240 = __VLS_239({
            shadow: "never",
            ...{ class: "ep-section" },
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_239));
        __VLS_241.slots.default;
        const __VLS_242 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "请先配置实际期间字段",
        }));
        const __VLS_244 = __VLS_243({
            type: "warning",
            closable: (false),
            showIcon: true,
            title: "请先配置实际期间字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_243));
        __VLS_245.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_245.slots;
        }
        var __VLS_245;
        var __VLS_241;
    }
    if (__VLS_ctx.asset?.warehouse_layer === 'ODS') {
        const __VLS_246 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
            shadow: "never",
            ...{ class: "ep-section" },
        }));
        const __VLS_248 = __VLS_247({
            shadow: "never",
            ...{ class: "ep-section" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_247));
        __VLS_249.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_249.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.endpoints?.pulls.length || 0);
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_250 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "warehouse.assets",
                op: "C",
                size: "small",
                type: "primary",
            }));
            const __VLS_251 = __VLS_250({
                ...{ 'onClick': {} },
                menu: "warehouse.assets",
                op: "C",
                size: "small",
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_250));
            let __VLS_253;
            let __VLS_254;
            let __VLS_255;
            const __VLS_256 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!(__VLS_ctx.asset))
                        return;
                    if (!(__VLS_ctx.asset?.warehouse_layer === 'ODS'))
                        return;
                    __VLS_ctx.openDataSourceConfig();
                }
            };
            __VLS_252.slots.default;
            (__VLS_ctx.endpoints?.pulls.length ? '编辑入仓来源' : '配置入仓来源');
            var __VLS_252;
        }
        if (__VLS_ctx.endpoints?.pulls.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            for (const [ep] of __VLS_getVForSourceType((__VLS_ctx.endpoints.pulls))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: ('pull-' + ep.endpoint_id),
                    ...{ class: "ep-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ep-info" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ep-name" },
                });
                (ep.name);
                if (ep.is_active) {
                    const __VLS_257 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
                        size: "small",
                        type: "success",
                        effect: "plain",
                    }));
                    const __VLS_259 = __VLS_258({
                        size: "small",
                        type: "success",
                        effect: "plain",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_258));
                    __VLS_260.slots.default;
                    var __VLS_260;
                }
                else {
                    const __VLS_261 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
                        size: "small",
                        type: "info",
                        effect: "plain",
                    }));
                    const __VLS_263 = __VLS_262({
                        size: "small",
                        type: "info",
                        effect: "plain",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
                    __VLS_264.slots.default;
                    var __VLS_264;
                }
                if (ep.schedule) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "ep-meta" },
                    });
                    (ep.schedule);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ep-stats" },
                });
                if (ep.last_status) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    const __VLS_265 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
                        type: (__VLS_ctx.RUN_STATUS_TAG[ep.last_status] || 'info'),
                        size: "small",
                    }));
                    const __VLS_267 = __VLS_266({
                        type: (__VLS_ctx.RUN_STATUS_TAG[ep.last_status] || 'info'),
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_266));
                    __VLS_268.slots.default;
                    (__VLS_ctx.RUN_STATUS_LABEL[ep.last_status] || ep.last_status);
                    var __VLS_268;
                }
                if (ep.last_rows != null) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "ep-meta" },
                    });
                    (ep.last_rows);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ep-meta" },
                });
                (ep.last_run_at ? __VLS_ctx.formatDateTime(ep.last_run_at) : '—');
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_269 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "U",
                    size: "small",
                    ...{ style: {} },
                }));
                const __VLS_270 = __VLS_269({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "U",
                    size: "small",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_269));
                let __VLS_272;
                let __VLS_273;
                let __VLS_274;
                const __VLS_275 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.asset?.warehouse_layer === 'ODS'))
                            return;
                        if (!(__VLS_ctx.endpoints?.pulls.length))
                            return;
                        __VLS_ctx.openEditDS(ep);
                    }
                };
                __VLS_271.slots.default;
                const __VLS_276 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({}));
                const __VLS_278 = __VLS_277({}, ...__VLS_functionalComponentArgsRest(__VLS_277));
                __VLS_279.slots.default;
                const __VLS_280 = {}.Edit;
                /** @type {[typeof __VLS_components.Edit, ]} */ ;
                // @ts-ignore
                const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({}));
                const __VLS_282 = __VLS_281({}, ...__VLS_functionalComponentArgsRest(__VLS_281));
                var __VLS_279;
                var __VLS_271;
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_284 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "D",
                    size: "small",
                    type: "danger",
                    ...{ style: {} },
                    loading: (__VLS_ctx.deletingEndpointIds.has(ep.endpoint_id)),
                    disabled: (__VLS_ctx.deletingEndpointIds.has(ep.endpoint_id)),
                }));
                const __VLS_285 = __VLS_284({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "D",
                    size: "small",
                    type: "danger",
                    ...{ style: {} },
                    loading: (__VLS_ctx.deletingEndpointIds.has(ep.endpoint_id)),
                    disabled: (__VLS_ctx.deletingEndpointIds.has(ep.endpoint_id)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_284));
                let __VLS_287;
                let __VLS_288;
                let __VLS_289;
                const __VLS_290 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.asset?.warehouse_layer === 'ODS'))
                            return;
                        if (!(__VLS_ctx.endpoints?.pulls.length))
                            return;
                        __VLS_ctx.dsDelete(ep);
                    }
                };
                __VLS_286.slots.default;
                const __VLS_291 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({}));
                const __VLS_293 = __VLS_292({}, ...__VLS_functionalComponentArgsRest(__VLS_292));
                __VLS_294.slots.default;
                const __VLS_295 = {}.Delete;
                /** @type {[typeof __VLS_components.Delete, ]} */ ;
                // @ts-ignore
                const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({}));
                const __VLS_297 = __VLS_296({}, ...__VLS_functionalComponentArgsRest(__VLS_296));
                var __VLS_294;
                var __VLS_286;
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_299 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "U",
                    size: "small",
                    type: "primary",
                    ...{ style: {} },
                    loading: (__VLS_ctx.syncingEndpointIds.has(ep.endpoint_id)),
                    disabled: (__VLS_ctx.syncingEndpointIds.has(ep.endpoint_id) || (__VLS_ctx.asset?.is_period && __VLS_ctx.asset.period_source === 'field' && !__VLS_ctx.periodFieldReady)),
                }));
                const __VLS_300 = __VLS_299({
                    ...{ 'onClick': {} },
                    menu: "datasource.endpoints",
                    op: "U",
                    size: "small",
                    type: "primary",
                    ...{ style: {} },
                    loading: (__VLS_ctx.syncingEndpointIds.has(ep.endpoint_id)),
                    disabled: (__VLS_ctx.syncingEndpointIds.has(ep.endpoint_id) || (__VLS_ctx.asset?.is_period && __VLS_ctx.asset.period_source === 'field' && !__VLS_ctx.periodFieldReady)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_299));
                let __VLS_302;
                let __VLS_303;
                let __VLS_304;
                const __VLS_305 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.asset?.warehouse_layer === 'ODS'))
                            return;
                        if (!(__VLS_ctx.endpoints?.pulls.length))
                            return;
                        __VLS_ctx.dsSync(ep);
                    }
                };
                __VLS_301.slots.default;
                (__VLS_ctx.syncingEndpointIds.has(ep.endpoint_id) ? '同步中' : (__VLS_ctx.asset?.is_period && __VLS_ctx.asset.period_source === 'field' && !__VLS_ctx.periodFieldReady ? '先配置期间字段' : '同步'));
                var __VLS_301;
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ style: {} },
            });
            const __VLS_306 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }));
            const __VLS_308 = __VLS_307({
                ...{ 'onClick': {} },
                type: "primary",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_307));
            let __VLS_310;
            let __VLS_311;
            let __VLS_312;
            const __VLS_313 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!(__VLS_ctx.asset))
                        return;
                    if (!(__VLS_ctx.asset?.warehouse_layer === 'ODS'))
                        return;
                    if (!!(__VLS_ctx.endpoints?.pulls.length))
                        return;
                    __VLS_ctx.openCreateDS();
                }
            };
            __VLS_309.slots.default;
            var __VLS_309;
        }
        var __VLS_249;
    }
    if (__VLS_ctx.asset && __VLS_ctx.asset.warehouse_layer !== 'ODS') {
        const __VLS_314 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_315 = __VLS_asFunctionalComponent(__VLS_314, new __VLS_314({
            shadow: "never",
            ...{ class: "ep-section" },
        }));
        const __VLS_316 = __VLS_315({
            shadow: "never",
            ...{ class: "ep-section" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_315));
        __VLS_317.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_317.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.asset.warehouse_layer === 'ODS' ? 'ODS 层禁止消费' : __VLS_ctx.asset.warehouse_layer === 'DWD' ? 'DWD 受控消费' : '可消费');
            if (__VLS_ctx.asset.warehouse_layer === 'ODS') {
                const __VLS_318 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                }));
                const __VLS_320 = __VLS_319({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_319));
                let __VLS_322;
                let __VLS_323;
                let __VLS_324;
                const __VLS_325 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.asset && __VLS_ctx.asset.warehouse_layer !== 'ODS'))
                            return;
                        if (!(__VLS_ctx.asset.warehouse_layer === 'ODS'))
                            return;
                        __VLS_ctx.$router.push('/warehouse/data-recipe');
                    }
                };
                __VLS_321.slots.default;
                var __VLS_321;
            }
            else {
                const __VLS_326 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                }));
                const __VLS_328 = __VLS_327({
                    ...{ 'onClick': {} },
                    type: "primary",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_327));
                let __VLS_330;
                let __VLS_331;
                let __VLS_332;
                const __VLS_333 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.asset && __VLS_ctx.asset.warehouse_layer !== 'ODS'))
                            return;
                        if (!!(__VLS_ctx.asset.warehouse_layer === 'ODS'))
                            return;
                        __VLS_ctx.$router.push(`/warehouse/service?source_type=table&source_id=${__VLS_ctx.asset.table_name}`);
                    }
                };
                __VLS_329.slots.default;
                var __VLS_329;
            }
        }
        if (__VLS_ctx.asset.warehouse_layer === 'ODS') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ style: {} },
            });
        }
        else {
            /** @type {[typeof PushTargetList, ]} */ ;
            // @ts-ignore
            const __VLS_334 = __VLS_asFunctionalComponent(PushTargetList, new PushTargetList({
                sourceTable: (__VLS_ctx.tableName),
                compact: true,
                hideHistory: true,
            }));
            const __VLS_335 = __VLS_334({
                sourceTable: (__VLS_ctx.tableName),
                compact: true,
                hideHistory: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_334));
        }
        var __VLS_317;
    }
    if (__VLS_ctx.endpoints?.exposes.length) {
        const __VLS_337 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
            shadow: "never",
            ...{ class: "ep-section" },
        }));
        const __VLS_339 = __VLS_338({
            shadow: "never",
            ...{ class: "ep-section" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_338));
        __VLS_340.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_340.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        for (const [ep] of __VLS_getVForSourceType((__VLS_ctx.endpoints.exposes))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: ('exp-' + ep.endpoint_id),
                ...{ class: "ep-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ep-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ep-name" },
            });
            (ep.name);
            if (ep.is_active) {
                const __VLS_341 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
                    size: "small",
                    type: "success",
                    effect: "plain",
                }));
                const __VLS_343 = __VLS_342({
                    size: "small",
                    type: "success",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_342));
                __VLS_344.slots.default;
                var __VLS_344;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ep-stats" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ep-meta" },
            });
            (ep.last_run_at ? __VLS_ctx.formatDateTime(ep.last_run_at) : '—');
        }
        var __VLS_340;
    }
    if (__VLS_ctx.endpoints?.ucp_resources.length) {
        const __VLS_345 = {}.ElCard;
        /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
        // @ts-ignore
        const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
            shadow: "never",
            ...{ class: "ep-section" },
        }));
        const __VLS_347 = __VLS_346({
            shadow: "never",
            ...{ class: "ep-section" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_346));
        __VLS_348.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_348.slots;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
        for (const [ep] of __VLS_getVForSourceType((__VLS_ctx.endpoints.ucp_resources))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: ('ucp-' + ep.endpoint_id),
                ...{ class: "ep-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ep-info" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "ep-name" },
            });
            (ep.name);
            if (ep.summary_extra.system_name) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ep-meta" },
                });
                (ep.summary_extra.system_name);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "ep-stats" },
            });
            if (ep.summary_extra.resource_status) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "ep-meta" },
                });
                (ep.summary_extra.resource_status);
            }
            if (ep.config_route) {
                const __VLS_349 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({
                    ...{ 'onClick': {} },
                    text: true,
                    size: "small",
                    icon: (__VLS_ctx.Link),
                }));
                const __VLS_351 = __VLS_350({
                    ...{ 'onClick': {} },
                    text: true,
                    size: "small",
                    icon: (__VLS_ctx.Link),
                }, ...__VLS_functionalComponentArgsRest(__VLS_350));
                let __VLS_353;
                let __VLS_354;
                let __VLS_355;
                const __VLS_356 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.loading))
                            return;
                        if (!!(__VLS_ctx.error))
                            return;
                        if (!(__VLS_ctx.asset))
                            return;
                        if (!(__VLS_ctx.endpoints?.ucp_resources.length))
                            return;
                        if (!(ep.config_route))
                            return;
                        __VLS_ctx.router.push(ep.config_route);
                    }
                };
                __VLS_352.slots.default;
                var __VLS_352;
            }
        }
        var __VLS_348;
    }
    const __VLS_357 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
        shadow: "never",
        ...{ class: "ep-section" },
    }));
    const __VLS_359 = __VLS_358({
        shadow: "never",
        ...{ class: "ep-section" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_358));
    __VLS_360.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_360.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    const __VLS_361 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_362 = __VLS_asFunctionalComponent(__VLS_361, new __VLS_361({
        column: (2),
        size: "small",
    }));
    const __VLS_363 = __VLS_362({
        column: (2),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_362));
    __VLS_364.slots.default;
    const __VLS_365 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
        label: "入仓来源",
    }));
    const __VLS_367 = __VLS_366({
        label: "入仓来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_366));
    __VLS_368.slots.default;
    (__VLS_ctx.endpoints?.pulls.length || 0);
    var __VLS_368;
    const __VLS_369 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
        label: "出仓目标",
    }));
    const __VLS_371 = __VLS_370({
        label: "出仓目标",
    }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    __VLS_372.slots.default;
    ((__VLS_ctx.endpoints?.pushes.length || 0) + (__VLS_ctx.endpoints?.exposes.length || 0));
    var __VLS_372;
    const __VLS_373 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
        label: "UCP 关联",
    }));
    const __VLS_375 = __VLS_374({
        label: "UCP 关联",
    }, ...__VLS_functionalComponentArgsRest(__VLS_374));
    __VLS_376.slots.default;
    (__VLS_ctx.endpoints?.ucp_resources.length || 0);
    (__VLS_ctx.endpoints?.ucp_resources.length ? ' 个' : ' — 无');
    var __VLS_376;
    const __VLS_377 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
        label: "凭证已配置",
    }));
    const __VLS_379 = __VLS_378({
        label: "凭证已配置",
    }, ...__VLS_functionalComponentArgsRest(__VLS_378));
    __VLS_380.slots.default;
    (__VLS_ctx.endpoints?.pulls.filter(e => e.has_secrets).length || 0);
    (__VLS_ctx.endpoints?.pulls.length || 0);
    var __VLS_380;
    var __VLS_364;
    var __VLS_360;
    if (__VLS_ctx.asset && !__VLS_ctx.asset.ucp.enabled) {
        const __VLS_381 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({
            type: "info",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_383 = __VLS_382({
            type: "info",
            closable: (false),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_382));
        __VLS_384.slots.default;
        {
            const { title: __VLS_thisSlot } = __VLS_384.slots;
        }
        var __VLS_384;
    }
    var __VLS_213;
    const __VLS_385 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
        label: "同步历史",
        name: "sync",
    }));
    const __VLS_387 = __VLS_386({
        label: "同步历史",
        name: "sync",
    }, ...__VLS_functionalComponentArgsRest(__VLS_386));
    __VLS_388.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.syncHistoryLoading) }, null, null);
    if (__VLS_ctx.syncHistory.length === 0 && !__VLS_ctx.syncHistoryLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sync-table-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
            ...{ class: "sync-data-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.colgroup, __VLS_intrinsicElements.colgroup)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.col, __VLS_intrinsicElements.col)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
            ...{ class: "text-center" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
        for (const [row] of __VLS_getVForSourceType((__VLS_ctx.syncHistory))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                key: (row.run_id),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            const __VLS_389 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
                size: "small",
                type: (row.source_type === 'datasource' ? 'primary' : 'success'),
                effect: "plain",
            }));
            const __VLS_391 = __VLS_390({
                size: "small",
                type: (row.source_type === 'datasource' ? 'primary' : 'success'),
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_390));
            __VLS_392.slots.default;
            (row.source_type === 'datasource' ? 'DataSource' : 'PushTarget');
            var __VLS_392;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                title: (row.source_name),
            });
            (row.source_name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "text-center" },
            });
            const __VLS_393 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
                size: "small",
                type: (__VLS_ctx.RUN_STATUS_TAG[row.status] || 'info'),
            }));
            const __VLS_395 = __VLS_394({
                size: "small",
                type: (__VLS_ctx.RUN_STATUS_TAG[row.status] || 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_394));
            __VLS_396.slots.default;
            (__VLS_ctx.RUN_STATUS_LABEL[row.status] || row.status);
            var __VLS_396;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            (row.started_at ? __VLS_ctx.formatDateTime(row.started_at) : '—');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({});
            if (row.started_at && row.finished_at) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (Math.round((new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "text-center" },
            });
            (row.rows ?? '—');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                ...{ class: "text-center" },
            });
            if (row.triggered_by === 'cron') {
                const __VLS_397 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_398 = __VLS_asFunctionalComponent(__VLS_397, new __VLS_397({
                    size: "small",
                    effect: "plain",
                }));
                const __VLS_399 = __VLS_398({
                    size: "small",
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_398));
                __VLS_400.slots.default;
                var __VLS_400;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row.triggered_by || '—');
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                title: (row.message || ''),
            });
            if (row.status === 'failed') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (row.message);
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (row.message || '—');
            }
        }
    }
    var __VLS_388;
    const __VLS_401 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
        label: "数据预览",
        name: "preview",
    }));
    const __VLS_403 = __VLS_402({
        label: "数据预览",
        name: "preview",
    }, ...__VLS_functionalComponentArgsRest(__VLS_402));
    __VLS_404.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.previewLoading) }, null, null);
    if (__VLS_ctx.previewRows.length === 0 && !__VLS_ctx.previewLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.previewTotal);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-table-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
            ...{ class: "preview-data-table" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.previewColumns))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                key: (col.code),
                ...{ style: ({ width: __VLS_ctx.getColumnWidth(col) + 'px', minWidth: __VLS_ctx.getColumnWidth(col) + 'px' }) },
            });
            (col.label || col.code);
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
        for (const [row, ri] of __VLS_getVForSourceType((__VLS_ctx.previewRows))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                key: (ri),
            });
            for (const [col] of __VLS_getVForSourceType((__VLS_ctx.previewColumns))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                    key: (col.code),
                    title: (row[col.code] ?? ''),
                    ...{ style: ({ width: __VLS_ctx.getColumnWidth(col) + 'px', minWidth: __VLS_ctx.getColumnWidth(col) + 'px' }) },
                });
                (row[col.code] ?? '—');
            }
        }
    }
    var __VLS_404;
    const __VLS_405 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_406 = __VLS_asFunctionalComponent(__VLS_405, new __VLS_405({
        label: "数据连接",
        name: "ucp",
    }));
    const __VLS_407 = __VLS_406({
        label: "数据连接",
        name: "ucp",
    }, ...__VLS_functionalComponentArgsRest(__VLS_406));
    __VLS_408.slots.default;
    if (!__VLS_ctx.asset.ucp.enabled) {
        const __VLS_409 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_410 = __VLS_asFunctionalComponent(__VLS_409, new __VLS_409({
            type: "info",
            title: (__VLS_ctx.UCP_DISABLED_TEXT),
            description: ('当前分支未部署 UCP 模块，数据连接能力暂不可用。'),
            showIcon: true,
            closable: (false),
        }));
        const __VLS_411 = __VLS_410({
            type: "info",
            title: (__VLS_ctx.UCP_DISABLED_TEXT),
            description: ('当前分支未部署 UCP 模块，数据连接能力暂不可用。'),
            showIcon: true,
            closable: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_410));
    }
    else if (!__VLS_ctx.asset.ucp.resource_id) {
        const __VLS_413 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_414 = __VLS_asFunctionalComponent(__VLS_413, new __VLS_413({
            type: "info",
            title: (__VLS_ctx.UCP_NOT_CONNECTED_TEXT),
            description: "该资产尚未关联 UCP 数据资源。",
            showIcon: true,
            closable: (false),
        }));
        const __VLS_415 = __VLS_414({
            type: "info",
            title: (__VLS_ctx.UCP_NOT_CONNECTED_TEXT),
            description: "该资产尚未关联 UCP 数据资源。",
            showIcon: true,
            closable: (false),
        }, ...__VLS_functionalComponentArgsRest(__VLS_414));
    }
    else {
        const __VLS_417 = {}.ElDescriptions;
        /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
        // @ts-ignore
        const __VLS_418 = __VLS_asFunctionalComponent(__VLS_417, new __VLS_417({
            column: (2),
            border: true,
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_419 = __VLS_418({
            column: (2),
            border: true,
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_418));
        __VLS_420.slots.default;
        const __VLS_421 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_422 = __VLS_asFunctionalComponent(__VLS_421, new __VLS_421({
            label: "系统 ID",
        }));
        const __VLS_423 = __VLS_422({
            label: "系统 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_422));
        __VLS_424.slots.default;
        (__VLS_ctx.asset.ucp.system_id ?? '—');
        var __VLS_424;
        const __VLS_425 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_426 = __VLS_asFunctionalComponent(__VLS_425, new __VLS_425({
            label: "资源 ID",
        }));
        const __VLS_427 = __VLS_426({
            label: "资源 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_426));
        __VLS_428.slots.default;
        (__VLS_ctx.asset.ucp.resource_id ?? '—');
        var __VLS_428;
        const __VLS_429 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_430 = __VLS_asFunctionalComponent(__VLS_429, new __VLS_429({
            label: "连接器配置 ID",
        }));
        const __VLS_431 = __VLS_430({
            label: "连接器配置 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_430));
        __VLS_432.slots.default;
        (__VLS_ctx.asset.ucp.connector_config_id ?? '—');
        var __VLS_432;
        const __VLS_433 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_434 = __VLS_asFunctionalComponent(__VLS_433, new __VLS_433({
            label: "跳转路由",
        }));
        const __VLS_435 = __VLS_434({
            label: "跳转路由",
        }, ...__VLS_functionalComponentArgsRest(__VLS_434));
        __VLS_436.slots.default;
        (__VLS_ctx.asset.ucp.config_route ?? '—');
        var __VLS_436;
        var __VLS_420;
        const __VLS_437 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_438 = __VLS_asFunctionalComponent(__VLS_437, new __VLS_437({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Link),
        }));
        const __VLS_439 = __VLS_438({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.Link),
        }, ...__VLS_functionalComponentArgsRest(__VLS_438));
        let __VLS_441;
        let __VLS_442;
        let __VLS_443;
        const __VLS_444 = {
            onClick: (__VLS_ctx.handleUcpJump)
        };
        __VLS_440.slots.default;
        var __VLS_440;
    }
    var __VLS_408;
    var __VLS_153;
    var __VLS_149;
}
const __VLS_445 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_446 = __VLS_asFunctionalComponent(__VLS_445, new __VLS_445({
    modelValue: (__VLS_ctx.dsDrawerVisible),
    title: (__VLS_ctx.dsDrawerMode === 'create' ? '新建入仓来源' : `配置入仓来源 · ${__VLS_ctx.asset?.table_label || ''}`),
    size: "600px",
    direction: "rtl",
}));
const __VLS_447 = __VLS_446({
    modelValue: (__VLS_ctx.dsDrawerVisible),
    title: (__VLS_ctx.dsDrawerMode === 'create' ? '新建入仓来源' : `配置入仓来源 · ${__VLS_ctx.asset?.table_label || ''}`),
    size: "600px",
    direction: "rtl",
}, ...__VLS_functionalComponentArgsRest(__VLS_446));
__VLS_448.slots.default;
const __VLS_449 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_450 = __VLS_asFunctionalComponent(__VLS_449, new __VLS_449({
    labelPosition: "top",
    size: "small",
    ...{ style: {} },
    autocomplete: "off",
}));
const __VLS_451 = __VLS_450({
    labelPosition: "top",
    size: "small",
    ...{ style: {} },
    autocomplete: "off",
}, ...__VLS_functionalComponentArgsRest(__VLS_450));
__VLS_452.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    tabindex: "-1",
    autocomplete: "username",
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    tabindex: "-1",
    type: "password",
    autocomplete: "current-password",
    ...{ style: {} },
});
const __VLS_453 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_454 = __VLS_asFunctionalComponent(__VLS_453, new __VLS_453({
    label: "数据表",
}));
const __VLS_455 = __VLS_454({
    label: "数据表",
}, ...__VLS_functionalComponentArgsRest(__VLS_454));
__VLS_456.slots.default;
const __VLS_457 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_458 = __VLS_asFunctionalComponent(__VLS_457, new __VLS_457({
    modelValue: (__VLS_ctx.tableName),
    disabled: true,
}));
const __VLS_459 = __VLS_458({
    modelValue: (__VLS_ctx.tableName),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_458));
var __VLS_456;
const __VLS_461 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_462 = __VLS_asFunctionalComponent(__VLS_461, new __VLS_461({
    label: "接入类型",
}));
const __VLS_463 = __VLS_462({
    label: "接入类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_462));
__VLS_464.slots.default;
const __VLS_465 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_466 = __VLS_asFunctionalComponent(__VLS_465, new __VLS_465({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.dsForm.source_type),
    ...{ style: {} },
    loading: (__VLS_ctx.connectorCatalogLoading),
    disabled: (__VLS_ctx.connectorCatalogLoading),
}));
const __VLS_467 = __VLS_466({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.dsForm.source_type),
    ...{ style: {} },
    loading: (__VLS_ctx.connectorCatalogLoading),
    disabled: (__VLS_ctx.connectorCatalogLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_466));
let __VLS_469;
let __VLS_470;
let __VLS_471;
const __VLS_472 = {
    onChange: (__VLS_ctx.onTypeChange)
};
__VLS_468.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.sourceTypes))) {
    const __VLS_473 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_474 = __VLS_asFunctionalComponent(__VLS_473, new __VLS_473({
        key: (t.code),
        label: (t.label),
        value: (t.code),
    }));
    const __VLS_475 = __VLS_474({
        key: (t.code),
        label: (t.label),
        value: (t.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_474));
}
var __VLS_468;
if (__VLS_ctx.connectorCatalogLoading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
else if (__VLS_ctx.connectorCatalogFallback) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
if (__VLS_ctx.currentType) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.currentType.description);
}
var __VLS_464;
if (__VLS_ctx.currentType) {
    for (const [grp] of __VLS_getVForSourceType((__VLS_ctx.currentType.groups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (grp.title),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (grp.title);
        for (const [f] of __VLS_getVForSourceType((grp.fields))) {
            const __VLS_477 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_478 = __VLS_asFunctionalComponent(__VLS_477, new __VLS_477({
                key: (f.key),
                label: (f.label),
                required: (f.required),
            }));
            const __VLS_479 = __VLS_478({
                key: (f.key),
                label: (f.label),
                required: (f.required),
            }, ...__VLS_functionalComponentArgsRest(__VLS_478));
            __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.shouldShowSourceField(f.key)) }, null, null);
            __VLS_480.slots.default;
            if (f.type === 'text' || f.type === 'url') {
                const __VLS_481 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_482 = __VLS_asFunctionalComponent(__VLS_481, new __VLS_481({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    name: (`datasource-field-${f.key.toLowerCase()}-${__VLS_ctx.dsEditId || 'new'}`),
                    autocomplete: (__VLS_ctx.SECRET_KEY_SET.has(f.key) ? 'new-password' : 'off'),
                    readonly: (__VLS_ctx.SECRET_KEY_SET.has(f.key)),
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }));
                const __VLS_483 = __VLS_482({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    name: (`datasource-field-${f.key.toLowerCase()}-${__VLS_ctx.dsEditId || 'new'}`),
                    autocomplete: (__VLS_ctx.SECRET_KEY_SET.has(f.key) ? 'new-password' : 'off'),
                    readonly: (__VLS_ctx.SECRET_KEY_SET.has(f.key)),
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_482));
                let __VLS_485;
                let __VLS_486;
                let __VLS_487;
                const __VLS_488 = {
                    onFocus: (__VLS_ctx.allowManualInput)
                };
                var __VLS_484;
            }
            else if (f.type === 'password') {
                const __VLS_489 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_490 = __VLS_asFunctionalComponent(__VLS_489, new __VLS_489({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    type: "text",
                    showPassword: true,
                    name: (`datasource-secret-${f.key.toLowerCase()}-${__VLS_ctx.dsEditId || 'new'}`),
                    autocomplete: "new-password",
                    readonly: true,
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }));
                const __VLS_491 = __VLS_490({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    type: "text",
                    showPassword: true,
                    name: (`datasource-secret-${f.key.toLowerCase()}-${__VLS_ctx.dsEditId || 'new'}`),
                    autocomplete: "new-password",
                    readonly: true,
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_490));
                let __VLS_493;
                let __VLS_494;
                let __VLS_495;
                const __VLS_496 = {
                    onFocus: (__VLS_ctx.allowManualInput)
                };
                var __VLS_492;
            }
            else if (f.type === 'textarea') {
                const __VLS_497 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_498 = __VLS_asFunctionalComponent(__VLS_497, new __VLS_497({
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    type: "textarea",
                    rows: (4),
                    placeholder: (f.placeholder),
                }));
                const __VLS_499 = __VLS_498({
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    type: "textarea",
                    rows: (4),
                    placeholder: (f.placeholder),
                }, ...__VLS_functionalComponentArgsRest(__VLS_498));
            }
            else if (f.type === 'select') {
                const __VLS_501 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_502 = __VLS_asFunctionalComponent(__VLS_501, new __VLS_501({
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    ...{ style: {} },
                }));
                const __VLS_503 = __VLS_502({
                    modelValue: (__VLS_ctx.dsForm.config[f.key]),
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_502));
                __VLS_504.slots.default;
                for (const [opt] of __VLS_getVForSourceType((f.options))) {
                    const __VLS_505 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_506 = __VLS_asFunctionalComponent(__VLS_505, new __VLS_505({
                        key: (opt.value),
                        label: (opt.label),
                        value: (opt.value),
                    }));
                    const __VLS_507 = __VLS_506({
                        key: (opt.value),
                        label: (opt.label),
                        value: (opt.value),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_506));
                }
                var __VLS_504;
            }
            if (f.hint) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                (f.hint);
            }
            if (f.key === 'FEISHU_WIKI_URL_OR_TOKEN') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ style: {} },
                });
                (__VLS_ctx.feishuLinkStatus);
            }
            var __VLS_480;
        }
    }
}
if (__VLS_ctx.isPeriodTable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_509 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_510 = __VLS_asFunctionalComponent(__VLS_509, new __VLS_509({
        label: "月份偏移",
    }));
    const __VLS_511 = __VLS_510({
        label: "月份偏移",
    }, ...__VLS_functionalComponentArgsRest(__VLS_510));
    __VLS_512.slots.default;
    const __VLS_513 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_514 = __VLS_asFunctionalComponent(__VLS_513, new __VLS_513({
        modelValue: (__VLS_ctx.monthOffset),
        step: (1),
        controlsPosition: "right",
        ...{ style: {} },
    }));
    const __VLS_515 = __VLS_514({
        modelValue: (__VLS_ctx.monthOffset),
        step: (1),
        controlsPosition: "right",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_514));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.monthPreview);
    var __VLS_512;
}
if (__VLS_ctx.asset?.is_period && __VLS_ctx.asset.period_source === 'field') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_517 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_518 = __VLS_asFunctionalComponent(__VLS_517, new __VLS_517({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
        title: "请先发现飞书字段，再选择实际年月字段作为月度期间。",
    }));
    const __VLS_519 = __VLS_518({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
        title: "请先发现飞书字段，再选择实际年月字段作为月度期间。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_518));
    if (__VLS_ctx.discoveredFields.length) {
        const __VLS_521 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_522 = __VLS_asFunctionalComponent(__VLS_521, new __VLS_521({
            modelValue: (__VLS_ctx.selectedPeriodField),
            placeholder: "选择年月字段",
            ...{ style: {} },
        }));
        const __VLS_523 = __VLS_522({
            modelValue: (__VLS_ctx.selectedPeriodField),
            placeholder: "选择年月字段",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_522));
        __VLS_524.slots.default;
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.discoveredFields))) {
            const __VLS_525 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_526 = __VLS_asFunctionalComponent(__VLS_525, new __VLS_525({
                key: (field.column_code),
                value: (field.column_code),
                disabled: (!field.is_yearmonth),
                label: (`${field.label} → ${field.column_code}${field.is_yearmonth ? '' : '（非年月）'}`),
            }));
            const __VLS_527 = __VLS_526({
                key: (field.column_code),
                value: (field.column_code),
                disabled: (!field.is_yearmonth),
                label: (`${field.label} → ${field.column_code}${field.is_yearmonth ? '' : '（非年月）'}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_526));
        }
        var __VLS_524;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.discoveredFields.find(item => item.column_code === __VLS_ctx.selectedPeriodField)?.sample_values.join('、') || '—');
        const __VLS_529 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_530 = __VLS_asFunctionalComponent(__VLS_529, new __VLS_529({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            size: "small",
        }));
        const __VLS_531 = __VLS_530({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_530));
        let __VLS_533;
        let __VLS_534;
        let __VLS_535;
        const __VLS_536 = {
            onClick: (__VLS_ctx.savePeriodField)
        };
        __VLS_532.slots.default;
        var __VLS_532;
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_537 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_538 = __VLS_asFunctionalComponent(__VLS_537, new __VLS_537({
    label: "调度计划",
}));
const __VLS_539 = __VLS_538({
    label: "调度计划",
}, ...__VLS_functionalComponentArgsRest(__VLS_538));
__VLS_540.slots.default;
/** @type {[typeof ScheduleSelector, ]} */ ;
// @ts-ignore
const __VLS_541 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
    schedule: (__VLS_ctx.dsForm.schedule),
    showStartTime: (false),
}));
const __VLS_542 = __VLS_541({
    schedule: (__VLS_ctx.dsForm.schedule),
    showStartTime: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_541));
var __VLS_540;
const __VLS_544 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_545 = __VLS_asFunctionalComponent(__VLS_544, new __VLS_544({
    label: "启用",
}));
const __VLS_546 = __VLS_545({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_545));
__VLS_547.slots.default;
const __VLS_548 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_549 = __VLS_asFunctionalComponent(__VLS_548, new __VLS_548({
    modelValue: (__VLS_ctx.dsForm.is_active),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_550 = __VLS_549({
    modelValue: (__VLS_ctx.dsForm.is_active),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_549));
var __VLS_547;
/** @type {[typeof IngestionModeSelect, ]} */ ;
// @ts-ignore
const __VLS_552 = __VLS_asFunctionalComponent(IngestionModeSelect, new IngestionModeSelect({
    modelValue: (__VLS_ctx.dsForm.ingestion_mode),
    isPeriod: (__VLS_ctx.asset?.is_period),
    periodLabel: (__VLS_ctx.asset?.period_col),
    keyLabels: (__VLS_ctx.businessKeyLabels),
}));
const __VLS_553 = __VLS_552({
    modelValue: (__VLS_ctx.dsForm.ingestion_mode),
    isPeriod: (__VLS_ctx.asset?.is_period),
    periodLabel: (__VLS_ctx.asset?.period_col),
    keyLabels: (__VLS_ctx.businessKeyLabels),
}, ...__VLS_functionalComponentArgsRest(__VLS_552));
if (__VLS_ctx.dsTestResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: ({
                padding: '10px 12px', borderRadius: 4, marginBottom: 12,
                background: __VLS_ctx.dsTestResult.ok ? '#f0f9eb' : '#fef0f0',
                color: __VLS_ctx.dsTestResult.ok ? '#67c23a' : '#f56c6c',
            }) },
    });
    (__VLS_ctx.dsTestResult.ok ? '✓' : '✕');
    (__VLS_ctx.dsTestResult.message);
}
var __VLS_452;
{
    const { footer: __VLS_thisSlot } = __VLS_448.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    if (__VLS_ctx.dsEditId && __VLS_ctx.dsForm.source_type === 'feishu_sheet') {
        const __VLS_555 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_556 = __VLS_asFunctionalComponent(__VLS_555, new __VLS_555({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.dsDiscovering),
            ...{ style: {} },
        }));
        const __VLS_557 = __VLS_556({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.dsDiscovering),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_556));
        let __VLS_559;
        let __VLS_560;
        let __VLS_561;
        const __VLS_562 = {
            onClick: (__VLS_ctx.dsDiscoverFields)
        };
        __VLS_558.slots.default;
        var __VLS_558;
    }
    if (__VLS_ctx.currentType?.testable) {
        const __VLS_563 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_564 = __VLS_asFunctionalComponent(__VLS_563, new __VLS_563({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.dsTesting),
            ...{ style: {} },
        }));
        const __VLS_565 = __VLS_564({
            ...{ 'onClick': {} },
            loading: (__VLS_ctx.dsTesting),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_564));
        let __VLS_567;
        let __VLS_568;
        let __VLS_569;
        const __VLS_570 = {
            onClick: (__VLS_ctx.dsTest)
        };
        __VLS_566.slots.default;
        var __VLS_566;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_571 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_572 = __VLS_asFunctionalComponent(__VLS_571, new __VLS_571({
        ...{ 'onClick': {} },
    }));
    const __VLS_573 = __VLS_572({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_572));
    let __VLS_575;
    let __VLS_576;
    let __VLS_577;
    const __VLS_578 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dsDrawerVisible = false;
        }
    };
    __VLS_574.slots.default;
    var __VLS_574;
    const __VLS_579 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_580 = __VLS_asFunctionalComponent(__VLS_579, new __VLS_579({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.dsSaving),
    }));
    const __VLS_581 = __VLS_580({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.dsSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_580));
    let __VLS_583;
    let __VLS_584;
    let __VLS_585;
    const __VLS_586 = {
        onClick: (__VLS_ctx.saveDS)
    };
    __VLS_582.slots.default;
    var __VLS_582;
}
var __VLS_448;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-info']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-info']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-row']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-info']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-name']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-stats']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ep-section']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['sync-data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-data-table']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Link: Link,
            Edit: Edit,
            Delete: Delete,
            List: List,
            DataAnalysis: DataAnalysis,
            Connection: Connection,
            ResourcePicker: ResourcePicker,
            UCP_DISABLED_TEXT: UCP_DISABLED_TEXT,
            UCP_NOT_CONNECTED_TEXT: UCP_NOT_CONNECTED_TEXT,
            formatDateTime: formatDateTime,
            ScheduleSelector: ScheduleSelector,
            PushTargetList: PushTargetList,
            PermissionButton: PermissionButton,
            IngestionModeSelect: IngestionModeSelect,
            router: router,
            userStore: userStore,
            tableName: tableName,
            asset: asset,
            loading: loading,
            error: error,
            endpoints: endpoints,
            endpointsLoading: endpointsLoading,
            syncingEndpointIds: syncingEndpointIds,
            deletingEndpointIds: deletingEndpointIds,
            periodFieldReady: periodFieldReady,
            previewRows: previewRows,
            previewColumns: previewColumns,
            previewLoading: previewLoading,
            previewTotal: previewTotal,
            getColumnWidth: getColumnWidth,
            syncHistory: syncHistory,
            syncHistoryLoading: syncHistoryLoading,
            dsDrawerVisible: dsDrawerVisible,
            dsDrawerMode: dsDrawerMode,
            dsEditId: dsEditId,
            dsForm: dsForm,
            dsSaving: dsSaving,
            dsTesting: dsTesting,
            dsDiscovering: dsDiscovering,
            discoveredFields: discoveredFields,
            selectedPeriodField: selectedPeriodField,
            dsTestResult: dsTestResult,
            sourceTypes: sourceTypes,
            connectorCatalogLoading: connectorCatalogLoading,
            currentType: currentType,
            feishuLinkStatus: feishuLinkStatus,
            isPeriodTable: isPeriodTable,
            businessKeyLabels: businessKeyLabels,
            monthOffset: monthOffset,
            monthPreview: monthPreview,
            SECRET_KEY_SET: SECRET_KEY_SET,
            connectorCatalogFallback: connectorCatalogFallback,
            shouldShowSourceField: shouldShowSourceField,
            onTypeChange: onTypeChange,
            fieldPlaceholder: fieldPlaceholder,
            allowManualInput: allowManualInput,
            openCreateDS: openCreateDS,
            openDataSourceConfig: openDataSourceConfig,
            openEditDS: openEditDS,
            saveDS: saveDS,
            dsTest: dsTest,
            dsDiscoverFields: dsDiscoverFields,
            savePeriodField: savePeriodField,
            dsSync: dsSync,
            dsDelete: dsDelete,
            activeTab: activeTab,
            editMode: editMode,
            SCOPE_STRATEGY_OPTIONS: SCOPE_STRATEGY_OPTIONS,
            LayerTag: LayerTag,
            WAREHOUSE_LAYER_OPTIONS: WAREHOUSE_LAYER_OPTIONS,
            editForm: editForm,
            editSaving: editSaving,
            STATUS_OPTIONS: STATUS_OPTIONS,
            STATUS_LABELS: STATUS_LABELS,
            QUALITY_TAG: QUALITY_TAG,
            RUN_STATUS_TAG: RUN_STATUS_TAG,
            RUN_STATUS_LABEL: RUN_STATUS_LABEL,
            handleTabChange: handleTabChange,
            goBack: goBack,
            handleUcpJump: handleUcpJump,
            enterEdit: enterEdit,
            cancelEdit: cancelEdit,
            saveEdit: saveEdit,
            goFields: goFields,
            goPreview: goPreview,
            goImpact: goImpact,
            statusTagType: statusTagType,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
