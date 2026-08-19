/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, reactive, computed, nextTick, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid } from '@element-plus/icons-vue';
import { pipelineTemplateApi, ucpApi } from '@/api/ucp';
import { listAssets, listAssetColumns } from '@/api/warehouse';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue';
import WarehouseAssetSinkConfig from '@/components/ucp/WarehouseAssetSinkConfig.vue';
import { createEmptyDocument, } from '@/api/mapping';
const nodeTypes = ref([]);
const fixedNodeTypes = computed(() => nodeTypes.value.filter((nodeType) => nodeType.type === 'START_TRIGGER'));
const paletteNodeTypes = computed(() => nodeTypes.value.filter((nodeType) => nodeType.palette && nodeType.type !== 'START_TRIGGER'));
const ICON_MAP = { Connection, MagicStick, Share, Refresh, Delete, Aim, Box, Document, Plus, DataBoard, BellFilled, TrendCharts, UserFilled, Setting, Warning, Clock, Edit, FolderOpened, Key, Grid };
function resolveIcon(name) { return ICON_MAP[name] || Box; }
async function loadNodeTypes() {
    try {
        const meta = await pipelineTemplateApi.nodeTypes();
        nodeTypes.value = meta.node_types;
    }
    catch {
        nodeTypes.value = [];
        ElMessage.error('Unable to load pipeline node catalog');
    }
}
const systems = ref([]);
const allResources = ref([]);
const resourcesLoading = ref(false);
const capabilityCatalog = ref([]);
const capabilitySystems = computed(() => Array.from(new Map(capabilityCatalog.value.map(item => [item.system_id, item])).values()));
const capabilityObjects = computed(() => Array.from(new Set(capabilityCatalog.value.filter(item => item.system_id === selectedNode.value?.config?.system_id).map(item => item.object_code))));
const capabilityOperations = computed(() => capabilityCatalog.value.filter(item => item.system_id === selectedNode.value?.config?.system_id && item.object_code === selectedNode.value?.config?.object_code));
async function loadSystemsAndResources() {
    try {
        resourcesLoading.value = true;
        const [sysRes, resRes, capabilityRes] = await Promise.all([ucpApi.systems(), ucpApi.resources({}), ucpApi.capabilityCatalog({ include_unverified: true })]);
        systems.value = sysRes.items;
        allResources.value = resRes.items;
        capabilityCatalog.value = capabilityRes;
    }
    catch (e) {
        ElMessage.warning(`加载系统/资源失败: ${e instanceof Error ? e.message : String(e)}`);
    }
    finally {
        resourcesLoading.value = false;
    }
}
function resourcesOf(systemId) { if (!systemId)
    return []; return allResources.value.filter((r) => r.system_id === systemId); }
function capabilityOptionLabel(item) { return item.verification_status === 'VERIFIED' ? item.operation_name : `${item.operation_name}（待验证）`; }
function selectConnectorResource(value) {
    if (!selectedNode.value)
        return;
    const resource = allResources.value.find((item) => item.id === value);
    selectedNode.value.config = {
        ...(selectedNode.value.config || {}), resource_id: value,
        resource_name: resource?.resource_name || '', resource_code: resource?.resource_code || '',
        adapter_code: resource?.adapter_code || null, data_object_id: null,
    };
    resourceDataObjects.value = [];
    if (resource?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER')
        void loadResourceDataObjects(value);
}
function selectCapabilitySystem(value) { if (!selectedNode.value)
    return; selectedNode.value.config = { ...(selectedNode.value.config || {}), system_id: value, object_code: null, capability_id: null, capability_name: '' }; }
function selectCapabilityObject(value) { if (!selectedNode.value)
    return; selectedNode.value.config = { ...(selectedNode.value.config || {}), object_code: value, capability_id: null, capability_name: '' }; }
function selectCapabilityOperation(value) { if (!selectedNode.value)
    return; const item = capabilityCatalog.value.find(row => row.capability_id === value); if (item)
    selectedNode.value.config = { ...(selectedNode.value.config || {}), capability_id: value, capability_name: item.operation_name, operation_id: item.operation_id, operation_version: item.operation_version }; }
const publishedAssets = ref([]);
const targetAssetColumns = ref([]);
const offerMappings = computed(() => {
    const mappings = selectedNode.value?.config?.field_mapping;
    return Array.isArray(mappings) ? mappings : [];
});
function offerCapabilityForMerge() {
    const mergeNode = selectedNode.value;
    if (!mergeNode)
        return null;
    const upstream = findUpstreamNode(mergeNode.id);
    const inputKey = String(mergeNode.config?.input_key || '');
    const sourceNodeId = inputKey.match(/^\$\{([^.}]+)/)?.[1];
    const sourceNode = upstream || form.nodes.find(node => node.id === sourceNodeId);
    const capabilityId = Number(sourceNode?.config?.capability_id || 0);
    return capabilityCatalog.value.find(item => item.capability_id === capabilityId) || null;
}
const offerFieldOptions = computed(() => {
    const properties = offerCapabilityForMerge()?.output_schema?.properties;
    if (!properties || typeof properties !== 'object')
        return [];
    return Object.entries(properties).map(([code, schema]) => ({
        code,
        label: String(schema?.label || code),
    }));
});
async function loadPublishedAssets() { try {
    publishedAssets.value = (await listAssets({ page: 1, page_size: 200, asset_status: 'published' })).items;
}
catch {
    publishedAssets.value = [];
} }
async function loadTargetAssetColumns(value) { try {
    targetAssetColumns.value = (await listAssetColumns(value)).columns;
}
catch {
    targetAssetColumns.value = [];
} }
async function selectTargetAsset(value) { if (!selectedNode.value)
    return; const config = { ...(selectedNode.value.config || {}), target_asset: value, period_field: null, field_whitelist: [] }; delete config.primary_key; selectedNode.value.config = config; await loadTargetAssetColumns(value); }
function addOfferMapping() { if (!selectedNode.value)
    return; const config = { ...(selectedNode.value.config || {}) }; config.field_mapping = [...offerMappings.value, { source: offerFieldOptions.value[0]?.code || '', target: targetAssetColumns.value[0]?.column_code || '' }]; selectedNode.value.config = config; }
function removeOfferMapping(index) { if (!selectedNode.value)
    return; const config = { ...(selectedNode.value.config || {}) }; config.field_mapping = offerMappings.value.filter((_, itemIndex) => itemIndex !== index); selectedNode.value.config = config; }
const currentTpl = ref(null);
const form = reactive({ template_code: '', name: '', description: '', version: '1.0.0', change_note: '', nodes: [], edges: [] });
const selectedNodeId = ref(null);
const selectedNode = computed(() => form.nodes.find((n) => n.id === selectedNodeId.value) || null);
const selectedBranchEdges = computed(() => selectedNode.value?.type === 'BRANCH' ? form.edges.filter((edge) => edge.from === selectedNode.value?.id) : []);
const branchRouteOptions = [
    { value: 'TRUE', label: '?????True?' },
    { value: 'FALSE', label: '?????False?' },
];
function branchRouteExpression(branchId, route) {
    return `BRANCH_${route}:${branchId}`;
}
function branchRouteForEdge(edge) {
    const branchId = selectedNode.value?.id || edge.from;
    if (edge.condition?.trim() === branchRouteExpression(branchId, 'TRUE'))
        return 'TRUE';
    if (edge.condition?.trim() === branchRouteExpression(branchId, 'FALSE'))
        return 'FALSE';
    return '';
}
function updateBranchEdgeRoute(edge, route) {
    const branchId = selectedNode.value?.id || edge.from;
    edge.condition = branchRouteExpression(branchId, route);
}
function branchTargetName(nodeId) {
    const target = form.nodes.find((node) => node.id === nodeId);
    return target?.label || target?.id || nodeId;
}
const nodeMetadata = computed(() => new Map(nodeTypes.value.map((nodeType) => [nodeType.type, nodeType])));
const templateTriggers = ref([]);
const triggerLoading = ref(false);
const startTriggerModeOptions = [
    { value: 'WEBHOOK', label: 'Webhook 触发' },
    { value: 'SCHEDULE', label: '定时执行' },
    { value: 'MANUAL', label: '人工启动' },
    { value: 'PLATFORM_EVENT', label: '平台事件' },
];
const startTriggerMode = ref('');
const startTriggerSystemId = ref(null);
const startTriggerResourceId = ref(null);
const selectedStartTriggerCode = ref('');
const selectedScheduledTriggerCode = ref('');
const scheduledPlanSchedule = ref('');
const scheduledPlanEnabled = ref(false);
const schedulePlanSaving = ref(false);
const platformEventCatalog = ref([]);
const platformEventCategory = ref('');
const platformEventSource = ref('');
const platformEventType = ref('');
const platformEventFilterField = ref('');
const platformEventFilterValue = ref('');
const platformEventEnabled = ref(false);
const selectedPlatformEventTriggerCode = ref('');
const platformEventSaving = ref(false);
const startTriggerNeedsResource = computed(() => startTriggerMode.value === 'WEBHOOK');
const startTriggerResources = computed(() => resourcesOf(startTriggerSystemId.value));
const scheduledTemplateTriggers = computed(() => templateTriggers.value.filter((trigger) => trigger.trigger_type === 'SCHEDULE'));
const selectedScheduledPlan = computed(() => scheduledTemplateTriggers.value.find((trigger) => trigger.trigger_code === selectedScheduledTriggerCode.value));
const platformEventTriggers = computed(() => templateTriggers.value.filter((trigger) => trigger.trigger_type === 'PLATFORM_EVENT'));
const selectedPlatformEventTrigger = computed(() => platformEventTriggers.value.find((trigger) => trigger.trigger_code === selectedPlatformEventTriggerCode.value));
const platformEventCategories = computed(() => Array.from(new Map(platformEventCatalog.value.filter((event) => event.enabled).map((event) => [event.category, event])).values()));
const platformEventSources = computed(() => Array.from(new Map(platformEventCatalog.value.filter((event) => event.enabled && event.category === platformEventCategory.value).map((event) => [event.source, event])).values()));
const platformEventOptions = computed(() => platformEventCatalog.value.filter((event) => event.enabled && event.category === platformEventCategory.value && (!platformEventSource.value || event.source === platformEventSource.value)));
const selectedPlatformEventDefinition = computed(() => platformEventCatalog.value.find((event) => event.event_type === platformEventType.value));
const platformEventFilterFields = computed(() => selectedPlatformEventDefinition.value?.filter_fields || []);
const knownScheduleLabels = { '0 6 * * *': '每日 06:00', '0 0 * * *': '每日 00:00', '0 */6 * * *': '每 6 小时' };
function schedulePlanLabel(value) { return knownScheduleLabels[value] || (value.startsWith('每日 ') || value.startsWith('每周') || value.startsWith('每月') || value === '每小时整点' || value === '每 6 小时' ? value : '自定义计划'); }
function schedulePlanValue(trigger) { return schedulePlanLabel(String(trigger?.schedule_config?.cron || '')); }
function schedulePlanSummary(trigger) { return `${schedulePlanLabel(String(trigger.schedule_config?.cron || ''))}｜${trigger.is_active ? '已启用' : '已停用'}`; }
const isSchedulePlanDirty = computed(() => Boolean(scheduledPlanSchedule.value) && (!selectedScheduledPlan.value || scheduledPlanSchedule.value !== schedulePlanValue(selectedScheduledPlan.value) || scheduledPlanEnabled.value !== Boolean(selectedScheduledPlan.value.is_active)));
function syncSelectedSchedulePlan() {
    const trigger = selectedScheduledPlan.value;
    scheduledPlanSchedule.value = trigger ? schedulePlanValue(trigger) : '';
    scheduledPlanEnabled.value = trigger ? Boolean(trigger.is_active) : false;
}
watch(selectedScheduledPlan, syncSelectedSchedulePlan, { immediate: true });
function syncSelectedPlatformEventTrigger() {
    const trigger = selectedPlatformEventTrigger.value;
    platformEventType.value = trigger?.platform_event_type || '';
    const definition = platformEventCatalog.value.find((event) => event.event_type === platformEventType.value);
    platformEventCategory.value = definition?.category || '';
    platformEventSource.value = definition?.source || '';
    const rule = trigger?.filter_rule || {};
    platformEventFilterField.value = String(rule.path || '').replace(/^\$\./, '');
    platformEventFilterValue.value = rule.value == null ? '' : String(rule.value);
    platformEventEnabled.value = trigger ? Boolean(trigger.is_active) : false;
}
watch([selectedPlatformEventTrigger, platformEventCatalog], syncSelectedPlatformEventTrigger, { immediate: true });
function syncStartTriggerModeFromTemplate() {
    const trigger = scheduledTemplateTriggers.value[0] || platformEventTriggers.value[0] || templateTriggers.value[0];
    startTriggerMode.value = trigger?.trigger_type || '';
    selectedStartTriggerCode.value = trigger?.trigger_code || '';
    selectedScheduledTriggerCode.value = startTriggerMode.value === 'SCHEDULE' ? trigger?.trigger_code || '' : '';
    selectedPlatformEventTriggerCode.value = startTriggerMode.value === 'PLATFORM_EVENT' ? trigger?.trigger_code || '' : '';
    if (startTriggerMode.value === 'SCHEDULE')
        syncSelectedSchedulePlan();
    if (startTriggerMode.value === 'PLATFORM_EVENT')
        syncSelectedPlatformEventTrigger();
}
const filteredStartTriggers = computed(() => templateTriggers.value.filter((trigger) => {
    if (startTriggerMode.value && trigger.trigger_type !== startTriggerMode.value)
        return false;
    if (startTriggerResourceId.value && trigger.source_resource_id !== startTriggerResourceId.value)
        return false;
    if (!startTriggerSystemId.value)
        return true;
    const resource = allResources.value.find((item) => item.id === trigger.source_resource_id);
    return resource?.system_id === startTriggerSystemId.value;
}));
function startTriggerTypeLabel(value) { return startTriggerModeOptions.find((item) => item.value === value)?.label || value; }
function resetStartTriggerSelection() { startTriggerSystemId.value = null; startTriggerResourceId.value = null; selectedStartTriggerCode.value = ''; }
function changeStartTriggerMode() { resetStartTriggerSelection(); if (startTriggerMode.value === 'SCHEDULE') {
    selectedScheduledTriggerCode.value = scheduledTemplateTriggers.value[0]?.trigger_code || '';
    syncSelectedSchedulePlan();
} ; if (startTriggerMode.value === 'PLATFORM_EVENT') {
    selectedPlatformEventTriggerCode.value = platformEventTriggers.value[0]?.trigger_code || '';
    syncSelectedPlatformEventTrigger();
} }
function changeStartTriggerSystem() { startTriggerResourceId.value = null; selectedStartTriggerCode.value = ''; }
function changeStartTriggerResource() { selectedStartTriggerCode.value = ''; }
function changePlatformEventCategory() { platformEventSource.value = platformEventSources.value[0]?.source || ''; platformEventType.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; }
function changePlatformEventSource() { platformEventType.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; }
function changePlatformEventType() { platformEventFilterField.value = ''; platformEventFilterValue.value = ''; }
function openStartTriggerConfig() {
    if (!currentTpl.value) {
        ElMessage.warning('请先保存流程，再配置实际触发器');
        return;
    }
    if (['SCHEDULE', 'PLATFORM_EVENT'].includes(startTriggerMode.value))
        return;
    router.push({ path: '/ucp/events/triggers', query: { template_code: form.template_code, trigger_type: startTriggerMode.value || 'WEBHOOK' } });
}
function scheduleTriggerCode() { return `${form.template_code.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 52)}_SCHEDULE`; }
function platformEventTriggerCode() { return `${form.template_code.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 45)}_PLATFORM_EVENT`; }
async function saveInlineSchedulePlan() {
    if (!currentTpl.value || !scheduledPlanSchedule.value)
        return;
    const existing = selectedScheduledPlan.value;
    const payload = {
        trigger_code: existing?.trigger_code || scheduleTriggerCode(), trigger_name: existing?.trigger_name || `${form.name || form.template_code}定时执行`, pipeline_template_code: form.template_code,
        trigger_type: 'SCHEDULE', source_resource_object_id: null, filter_rule: existing?.filter_rule || {}, schedule_config: { ...(existing?.schedule_config || {}), cron: scheduledPlanSchedule.value, timezone: 'Asia/Shanghai' },
        input_schema: existing?.input_schema || {}, idempotency_expression: existing?.idempotency_expression || null, failure_policy: existing?.failure_policy || 'RETRY', run_as_type: existing?.run_as_type || 'SERVICE_ACCOUNT', service_account_code: existing?.service_account_code || null, is_active: scheduledPlanEnabled.value,
    };
    schedulePlanSaving.value = true;
    try {
        if (existing)
            await ucpApi.updatePipelineTrigger(existing.trigger_code, payload);
        else
            await ucpApi.createPipelineTrigger(payload);
        await loadTemplateTriggers(form.template_code);
        selectedScheduledTriggerCode.value = existing?.trigger_code || payload.trigger_code;
        ElMessage.success('调度计划已保存');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '调度计划保存失败');
    }
    finally {
        schedulePlanSaving.value = false;
    }
}
async function savePlatformEventTrigger() {
    if (!currentTpl.value || !selectedPlatformEventDefinition.value)
        return;
    const existing = selectedPlatformEventTrigger.value;
    const filter_rule = platformEventFilterField.value ? { path: `$.${platformEventFilterField.value}`, op: 'eq', value: platformEventFilterValue.value } : {};
    const payload = {
        trigger_code: existing?.trigger_code || platformEventTriggerCode(), trigger_name: existing?.trigger_name || `${form.name || form.template_code}${selectedPlatformEventDefinition.value.event_name}`,
        pipeline_template_code: form.template_code, trigger_type: 'PLATFORM_EVENT', platform_event_type: platformEventType.value, source_resource_object_id: null,
        filter_rule, schedule_config: {}, input_schema: existing?.input_schema || {}, idempotency_expression: existing?.idempotency_expression || null,
        failure_policy: existing?.failure_policy || 'RETRY', run_as_type: existing?.run_as_type || 'SERVICE_ACCOUNT', service_account_code: existing?.service_account_code || null, is_active: platformEventEnabled.value,
    };
    platformEventSaving.value = true;
    try {
        if (existing)
            await ucpApi.updatePipelineTrigger(existing.trigger_code, payload);
        else
            await ucpApi.createPipelineTrigger(payload);
        await loadTemplateTriggers(form.template_code);
        selectedPlatformEventTriggerCode.value = existing?.trigger_code || payload.trigger_code;
        ElMessage.success('平台事件已保存');
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '平台事件保存失败');
    }
    finally {
        platformEventSaving.value = false;
    }
}
const connectorParamsText = computed(() => JSON.stringify(selectedNode.value?.config?.params || {}, null, 2));
function updateConnectorParams(value) {
    if (!selectedNode.value)
        return;
    try {
        const params = value.trim() ? JSON.parse(value) : {};
        if (!params || Array.isArray(params) || typeof params !== 'object')
            throw new Error('params must be an object');
        selectedNode.value.config = { ...(selectedNode.value.config || {}), params };
    }
    catch {
        ElMessage.error('Connector parameters must be a JSON object');
    }
}
const approvalApproversText = computed(() => JSON.stringify(selectedNode.value?.config?.approvers || [], null, 2));
function updateApprovalApprovers(value) {
    if (!selectedNode.value)
        return;
    try {
        const approvers = value.trim() ? JSON.parse(value) : [];
        if (!Array.isArray(approvers) || !approvers.every((item) => item && typeof item === 'object'))
            throw new Error('approvers must be an array');
        selectedNode.value.config = { ...(selectedNode.value.config || {}), approvers };
    }
    catch {
        ElMessage.error('Approvers must be a JSON array');
    }
}
const canvasRef = ref(null);
const canvasW = 2000;
const canvasH = 1200;
const MIN_CANVAS_ZOOM = 0.5;
const MAX_CANVAS_ZOOM = 1.4;
const canvasZoom = ref(1);
const NODE_CARD_WIDTH = 188;
const NODE_CARD_HEIGHT = 96;
const NODE_GAP_X = 92;
const NODE_GAP_Y = 146;
const EDGE_ANCHOR_GAP = 7;
const connectorSides = ['left', 'right', 'top', 'bottom'];
const isCanvasPanning = ref(false);
let canvasPan = null;
let suppressCanvasClick = false;
function startCanvasPan(event) {
    const viewport = canvasRef.value;
    const target = event.target instanceof Element ? event.target : null;
    if (!viewport || event.button !== 0 || target?.closest('[data-node-id]'))
        return;
    canvasPan = { startX: event.clientX, startY: event.clientY, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop, didPan: false };
    window.addEventListener('mousemove', onCanvasPanMove);
    window.addEventListener('mouseup', onCanvasPanEnd);
}
function onCanvasPanMove(event) {
    const viewport = canvasRef.value;
    if (!canvasPan || !viewport)
        return;
    const deltaX = event.clientX - canvasPan.startX;
    const deltaY = event.clientY - canvasPan.startY;
    if (!canvasPan.didPan && Math.hypot(deltaX, deltaY) < 3)
        return;
    canvasPan.didPan = true;
    isCanvasPanning.value = true;
    viewport.scrollLeft = Math.max(0, canvasPan.scrollLeft - deltaX);
    viewport.scrollTop = Math.max(0, canvasPan.scrollTop - deltaY);
}
function onCanvasPanEnd() {
    const didPan = canvasPan?.didPan || false;
    canvasPan = null;
    isCanvasPanning.value = false;
    window.removeEventListener('mousemove', onCanvasPanMove);
    window.removeEventListener('mouseup', onCanvasPanEnd);
    if (didPan) {
        suppressCanvasClick = true;
        window.setTimeout(() => { suppressCanvasClick = false; }, 0);
    }
}
function onCanvasClick() {
    if (suppressCanvasClick) {
        suppressCanvasClick = false;
        return;
    }
    deselectNode();
}
let dragNode = null;
let dragOffset = { x: 0, y: 0 };
function startDrag(e, node) { dragNode = node; const point = canvasPoint(e.clientX, e.clientY); dragOffset.x = point.x - node.x; dragOffset.y = point.y - node.y; window.addEventListener('mousemove', onDragMove); window.addEventListener('mouseup', onDragEnd); }
function canvasPoint(clientX, clientY) {
    const viewport = canvasRef.value;
    if (!viewport)
        return { x: 0, y: 0 };
    const rect = viewport.getBoundingClientRect();
    return { x: (clientX - rect.left + viewport.scrollLeft) / canvasZoom.value, y: (clientY - rect.top + viewport.scrollTop) / canvasZoom.value };
}
function onDragMove(e) { if (!dragNode || !canvasRef.value)
    return; const point = canvasPoint(e.clientX, e.clientY); dragNode.x = Math.max(0, Math.min(canvasW - NODE_CARD_WIDTH, point.x - dragOffset.x)); dragNode.y = Math.max(0, Math.min(canvasH - NODE_CARD_HEIGHT, point.y - dragOffset.y)); }
function onDragEnd() { dragNode = null; window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd); }
let connectFrom = null;
const drawingEdges = ref([]);
function startConnect(e, node, side) { connectFrom = { node, side }; window.addEventListener('mousemove', onConnectMove); window.addEventListener('mouseup', onConnectEnd); }
function onConnectMove(e) { if (!connectFrom || !canvasRef.value)
    return; const point = canvasPoint(e.clientX, e.clientY); drawingEdges.value = [{ fromNodeId: connectFrom.node.id, fromSide: connectFrom.side, endX: point.x, endY: point.y }]; }
function onConnectEnd(e) { window.removeEventListener('mousemove', onConnectMove); window.removeEventListener('mouseup', onConnectEnd); if (!connectFrom || !canvasRef.value) {
    drawingEdges.value = [];
    connectFrom = null;
    return;
} ; const targetEl = document.elementFromPoint(e.clientX, e.clientY); const nodeCard = targetEl?.closest?.('[data-node-id]'); if (nodeCard) {
    const targetId = nodeCard.getAttribute('data-node-id') || '';
    if (targetId && targetId !== connectFrom.node.id) {
        const exist = form.edges.find((ed) => (ed.from === connectFrom.node.id && ed.to === targetId) || (ed.from === targetId && ed.to === connectFrom.node.id));
        const newEdge = { from: connectFrom.node.id, to: targetId };
        if (!exist && form.nodes.find((node) => node.id === newEdge.to)?.type !== 'START_TRIGGER')
            form.edges.push(newEdge);
    }
} ; drawingEdges.value = []; connectFrom = null; }
function onPaletteDragStart(e, type) { e.dataTransfer?.setData('nodeType', type); }
function onCanvasDrop(e) { if (!canvasRef.value)
    return; const type = e.dataTransfer?.getData('nodeType'); if (!type)
    return; if (type === 'START_TRIGGER' && form.nodes.some((node) => node.type === 'START_TRIGGER')) {
    ElMessage.warning('每个流程只能添加一个流程起点');
    return;
} ; const point = canvasPoint(e.clientX, e.clientY); const newNode = { id: type === 'START_TRIGGER' ? 'start_trigger' : `node_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, type, label: '', x: Math.max(0, point.x - NODE_CARD_WIDTH / 2), y: Math.max(0, point.y - NODE_CARD_HEIGHT / 2), config: type === 'START_TRIGGER' ? { mode: 'OR', trigger_types: ['WEBHOOK', 'SCHEDULE', 'MANUAL', 'PLATFORM_EVENT'], management_path: '/ucp/events/triggers' } : {} }; form.nodes.push(newNode); selectedNodeId.value = newNode.id; }
function selectNode(node) {
    selectedNodeId.value = node.id;
    if (node.type === 'CONNECTOR' && node.config?.resource_id && (node.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER' || node.config?.data_object_id)) {
        void loadResourceDataObjects(Number(node.config.resource_id));
    }
}
function deselectNode() { selectedNodeId.value = null; }
function removeNode(id) { if (form.nodes.find((node) => node.id === id)?.type === 'START_TRIGGER')
    return; form.nodes = form.nodes.filter((n) => n.id !== id); form.edges = form.edges.filter((e) => e.from !== id && e.to !== id); if (selectedNodeId.value === id)
    selectedNodeId.value = null; }
function getNodeMetadata(type) { return nodeMetadata.value.get(type); }
function getNodeColor(type) { return getNodeMetadata(type)?.color || '#dcdfe6'; }
function getNodeLabel(type) { return getNodeMetadata(type)?.label || type; }
function nodeSummaryLines(node) {
    const config = (node.config || {});
    if (node.type === 'TRANSFORM') {
        const document = config.mapping_component;
        const legacy = config.mapping;
        const rules = document?.ruleSet?.rules || legacy?.rules || [];
        return [`${Array.isArray(rules) ? rules.length : 0} 条映射规则`, config.storageMode === 'component_v1' || document ? 'component_v1' : 'legacy_v1'];
    }
    if (node.type === 'START_TRIGGER') {
        if (startTriggerMode.value === 'SCHEDULE')
            return ['定时执行', scheduledPlanSchedule.value ? schedulePlanLabel(scheduledPlanSchedule.value) : '尚未配置计划'];
        if (startTriggerMode.value === 'PLATFORM_EVENT') {
            const event = selectedPlatformEventDefinition.value;
            return ['平台事件', event ? `${event.source_name} · ${event.event_name}` : '请选择具体事件'];
        }
        const trigger = templateTriggers.value.find((item) => item.trigger_type === startTriggerMode.value) || templateTriggers.value[0];
        return [startTriggerMode.value ? startTriggerTypeLabel(startTriggerMode.value) : '尚未配置触发方式', trigger?.trigger_name || '点击节点完成配置'];
    }
    if (node.type === 'CONNECTOR')
        return [config.system_code || '未选择系统', config.resource_name || config.resource_code || '未选择资源'];
    if (String(node.type).includes('CAPABILITY'))
        return [config.capability_name || config.operation_name || '未选择业务能力', config.object_code || '等待配置'];
    if (node.type === 'RECORD_MERGE')
        return [`${Array.isArray(config.field_mapping) ? config.field_mapping.length : 0} 条合并规则`, config.primary_key || config.merge_key || '等待配置主键'];
    if (node.type === 'WAREHOUSE_ASSET_SINK')
        return [config.target_asset_name || config.target_asset || '未选择目标资产', config.write_mode === 'upsert' ? '追加或更新' : config.write_mode || '等待配置写入策略'];
    if (node.type === 'BRANCH')
        return [config.condition || '未设置判断条件', '配置分支路由'];
    if (node.type === 'APPROVAL')
        return [config.approval_mode || '单人审批', config.action_summary || '等待配置审批内容'];
    if (node.type === 'NOTIFY')
        return [config.template_code || '未选择通知模板', Array.isArray(config.receivers) && config.receivers.length ? `${config.receivers.length} 位接收人` : '未设置接收人'];
    return [Object.keys(config).length ? `${Object.keys(config).length} 项配置` : '等待配置', ''];
}
function nodeStatus(node) {
    if (node.type === 'START_TRIGGER') {
        if (startTriggerMode.value === 'SCHEDULE' && isSchedulePlanDirty.value)
            return { label: '待保存', tone: 'warning' };
        if (startTriggerMode.value === 'PLATFORM_EVENT' && platformEventType.value && !selectedPlatformEventTrigger.value)
            return { label: '待保存', tone: 'warning' };
        return templateTriggers.value.length ? { label: '已配置', tone: 'success' } : { label: '待配置', tone: 'warning' };
    }
    if (nodeHasError(node))
        return { label: '待配置', tone: 'danger' };
    return { label: '已配置', tone: 'success' };
}
function getNodeSchema(type) { return getNodeMetadata(type)?.config_schema || {}; }
function stringifyConfig(v) { if (v === undefined || v === null)
    return ''; if (Array.isArray(v))
    return v.join(', '); return String(v); }
function updateNodeConfig(key, value) { if (!selectedNode.value)
    return; const cfg = { ...(selectedNode.value.config || {}) }; if (value === '') {
    delete cfg[key];
}
else if (value.includes(',')) {
    cfg[key] = value.split(',').map((s) => s.trim());
}
else {
    cfg[key] = value;
} ; selectedNode.value.config = cfg; }
async function loadBitableTablesForNode(resourceId) {
    if (!resourceId) {
        bitableTableOptions.value = [];
        return;
    }
    try {
        bitableTableOptions.value = (await ucpApi.bitableTables(resourceId, { is_active: true })).items || [];
    }
    catch {
        bitableTableOptions.value = [];
    }
}
function nodeHasError(node) {
    const type = node.type;
    if (type === 'CAPABILITY')
        return !node.config?.capability_id;
    if (type === 'TRANSFORM') {
        const config = (node.config || {});
        const document = config.mapping_component;
        const legacy = config.mapping;
        const rules = document?.ruleSet?.rules || legacy?.rules;
        return !Array.isArray(rules) || (config.storageMode !== 'component_v1' && config.mapping_component && !config.mapping);
    }
    if (type === 'BRANCH') {
        const outgoing = form.edges.filter((edge) => edge.from === node.id);
        const expected = new Set([branchRouteExpression(node.id, 'TRUE'), branchRouteExpression(node.id, 'FALSE')]);
        return !(node.config?.condition_ast?.rules?.length) || outgoing.length !== 2 || new Set(outgoing.map((edge) => edge.condition?.trim() || '')).size !== 2 || !outgoing.every((edge) => expected.has(edge.condition?.trim() || ''));
    }
    if (type !== 'CONNECTOR')
        return false;
    if (!node.config?.system_id || !node.config?.resource_id)
        return true;
    if (node.config?.adapter_code === 'FEISHU_BITABLE_PULL_ADAPTER')
        return !node.config?.bitable_table_id;
    if (node.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER')
        return !node.config?.data_object_id;
    return false;
}
// ===== TRANSFORM 字段映射 =====
const bitableTableOptions = ref([]);
const resourceDataObjects = ref([]);
async function loadResourceDataObjects(resourceId) {
    if (!resourceId) {
        resourceDataObjects.value = [];
        return;
    }
    try {
        resourceDataObjects.value = ((await ucpApi.resourceDataObjects(resourceId)).items || []).filter((item) => item.is_active);
    }
    catch {
        resourceDataObjects.value = [];
    }
}
const upstreamFields = ref([]);
const upstreamSourceName = ref('');
const transformMappingDocument = ref(createEmptyDocument('ucp_transform', 'UCP Transform'));
const transformMappingCompatibility = ref(null);
const transformMappingStorageMode = ref('component_v1');
const transformLegacyMappingSnapshot = ref(null);
const transformLegacyMode = ref('strict');
function mappingCatalogField(field) {
    const code = String(field?.code ?? field?.field_id ?? field?.name ?? '');
    if (!code)
        return null;
    return { code, label: String(field?.label ?? field?.column_label ?? code), type: String(field?.type ?? field?.data_type ?? 'string') };
}
function catalogFields(value) {
    if (!Array.isArray(value))
        return [];
    return value.map((field) => mappingCatalogField(field)).filter(Boolean);
}
function mappingRuleFromLegacy(rawRule, index) {
    if (!rawRule || (rawRule.source_kind !== undefined && rawRule.source_kind !== 'upstream_field'))
        return null;
    if (typeof rawRule.source_field_id !== 'string' || typeof rawRule.target_field_id !== 'string')
        return null;
    return {
        id: `legacy_${index}`,
        type: 'field',
        enabled: true,
        displayOrder: index,
        sourceFields: [rawRule.source_field_id],
        targetFields: [rawRule.target_field_id],
        config: { mode: 'rename' },
    };
}
function documentFromTransformConfig(config) {
    const component = config.mapping_component;
    if (component && typeof component === 'object') {
        const document = JSON.parse(JSON.stringify(component));
        const legacySnapshot = config.legacy_mapping_snapshot && typeof config.legacy_mapping_snapshot === 'object'
            ? config.legacy_mapping_snapshot
            : config.mapping;
        const snapshot = legacySnapshot && typeof legacySnapshot === 'object' ? JSON.parse(JSON.stringify(legacySnapshot)) : null;
        return {
            document,
            storageMode: 'component_v1',
            snapshot,
            compatibility: { sourceFormat: 'ucp_transform_component_v1', readable: true, writable: true, requiresMigration: false, lossyFields: [], unknownFields: snapshot ? { legacy_mapping_snapshot: snapshot } : {} },
        };
    }
    const legacy = config.mapping;
    if (!legacy || typeof legacy !== 'object') {
        return {
            document: createEmptyDocument('ucp_transform', 'UCP Transform'),
            storageMode: 'component_v1',
            snapshot: null,
            compatibility: { sourceFormat: 'ucp_transform_component_v1', readable: true, writable: true, requiresMigration: false, lossyFields: [], unknownFields: {} },
        };
    }
    const rawRules = Array.isArray(legacy.rules) ? legacy.rules : [];
    const rules = rawRules.map(mappingRuleFromLegacy).filter(Boolean);
    const lossyFields = [
        ...(legacy.version !== 1 ? ['mapping.version'] : []),
        ...(!['strict', 'mapped_plus_same_name'].includes(legacy.mode ?? 'strict') ? ['mapping.mode'] : []),
        ...(!Array.isArray(legacy.rules) ? ['mapping.rules'] : []),
        ...rawRules.flatMap((rule, index) => mappingRuleFromLegacy(rule, index) ? [] : [`rules[${index}]`]),
    ];
    const unknownFields = {};
    for (const key of Object.keys(legacy)) {
        if (!['version', 'mode', 'source_operation_id', 'source_schema_hash', 'target_operation_id', 'target_schema_hash', 'target_field_catalog', 'rules'].includes(key))
            unknownFields[`mapping.${key}`] = legacy[key];
    }
    rawRules.forEach((rule, index) => {
        if (!rule || typeof rule !== 'object')
            return;
        for (const key of Object.keys(rule)) {
            if (!['source_field_id', 'target_field_id', 'source_kind'].includes(key))
                unknownFields[`rules[${index}].${key}`] = rule[key];
        }
    });
    const sourceAsset = legacy.source_operation_id == null ? null : String(legacy.source_operation_id);
    const targetAsset = legacy.target_operation_id == null ? null : String(legacy.target_operation_id);
    const document = {
        mappingSchemaVersion: 1,
        ruleSet: {
            code: sourceAsset || 'ucp_transform', name: targetAsset || 'UCP Transform', sourceAsset, targetAsset,
            sourceSchemaHash: String(legacy.source_schema_hash || ''), targetSchemaHash: String(legacy.target_schema_hash || ''), rules,
        },
    };
    const snapshot = JSON.parse(JSON.stringify(legacy));
    unknownFields.legacy_mapping_snapshot = snapshot;
    unknownFields.__legacy_mapping_mode__ = legacy.mode || 'strict';
    return {
        document,
        storageMode: 'legacy_v1',
        snapshot,
        compatibility: { sourceFormat: 'ucp_transform_legacy_v1', readable: true, writable: lossyFields.length === 0, requiresMigration: lossyFields.length > 0, lossyFields, unknownFields },
    };
}
function selectedTransformConfig() {
    return selectedNode.value?.type === 'TRANSFORM' ? (selectedNode.value.config || {}) : null;
}
function transformTargetCatalog() {
    const config = selectedTransformConfig();
    const downstream = selectedNode.value && form.edges.filter((edge) => edge.from === selectedNode.value?.id).map((edge) => form.nodes.find((node) => node.id === edge.to)).find(Boolean);
    const downstreamCatalog = catalogFields(downstream?.config?.input_field_catalog || downstream?.config?.target_field_catalog || downstream?.config?.field_catalog);
    const fromAsset = targetAssetColumns.value.map((column) => ({ code: column.column_code, label: column.column_label, type: column.data_type }));
    if (downstreamCatalog.length)
        return downstreamCatalog;
    if (fromAsset.length)
        return fromAsset;
    return catalogFields(config?.target_field_catalog || config?.mapping?.target_field_catalog || transformMappingDocument.value.ruleSet.rules.flatMap((rule) => rule.targetFields.map((code) => ({ code }))));
}
const transformSourceFields = computed(() => upstreamFields.value.map((field) => ({ code: field.name, label: field.name, type: field.type })));
const transformTargetFields = computed(() => transformTargetCatalog());
const transformMappingCaller = computed(() => selectedTransformConfig()?.mapping_caller === 'workflow' ? 'workflow' : 'ucp_transform');
const transformMappingPolicy = computed(() => {
    const config = selectedTransformConfig() || {};
    const source = transformSourceFields.value;
    const target = transformTargetFields.value;
    const policy = config.mapping_policy && typeof config.mapping_policy === 'object' ? config.mapping_policy : {};
    return {
        caller: transformMappingCaller.value,
        allowedRuleTypes: (Array.isArray(policy.allowedRuleTypes) ? policy.allowedRuleTypes : ['field', 'value_map', 'reference_lookup', 'identity_with_overrides', 'type_convert', 'format', 'split_merge']),
        source: { assetId: transformMappingDocument.value.ruleSet.sourceAsset || null, schemaHash: transformMappingDocument.value.ruleSet.sourceSchemaHash || 'runtime', allowedFieldIds: source.map((field) => field.code) },
        target: { assetId: transformMappingDocument.value.ruleSet.targetAsset || null, schemaHash: transformMappingDocument.value.ruleSet.targetSchemaHash || 'runtime', allowedFieldIds: target.map((field) => field.code), readonlyFieldIds: [], protectedKeyFieldIds: [] },
        referenceLookup: { allowedDatasetIds: Array.isArray(policy.allowedReferenceDatasetIds) ? policy.allowedReferenceDatasetIds : [], allowedFieldIds: Array.isArray(policy.allowedReferenceFieldIds) ? policy.allowedReferenceFieldIds : [], maxRules: Number(policy.maxReferenceRules || 20) },
        effects: { allowPreview: true, allowSave: true, allowPublish: false, allowExecute: true, allowRebuild: false },
        legacy: { sourceFormat: transformMappingCompatibility.value?.sourceFormat || null, allowLegacyRead: true, allowLegacyWrite: transformMappingStorageMode.value === 'legacy_v1', allowMigration: true },
        metadata: { policyVersion: 1, permissionScope: 'ucp.pipelines', issuedAt: new Date().toISOString() },
    };
});
const transformMappingLossyBlocked = computed(() => transformMappingStorageMode.value === 'legacy_v1' && transformMappingCompatibility.value?.writable === false);
const transformMappingMigrationHint = computed(() => {
    if (transformMappingStorageMode.value === 'component_v1')
        return transformLegacyMappingSnapshot.value ? '已迁移到 component_v1：运行时只执行 mapping_component，legacy_mapping_snapshot 仅用于回滚/兼容。' : '当前使用 component_v1 公共映射文档。';
    if (transformMappingCompatibility.value?.requiresMigration)
        return '当前为 Legacy v1 只读回显，存在无法无损表达的旧字段；请迁移到 component_v1 后再保存。';
    return '当前为 Legacy v1 兼容回显；仅 field 规则且无损时可继续保存旧结构。';
});
// 从 edges 中找到流入当前节点的上游节点
function findUpstreamNode(nodeId) {
    const edge = form.edges.find((e) => e.to === nodeId);
    if (!edge)
        return null;
    return form.nodes.find((n) => n.id === edge.from) || null;
}
// 加载上游节点的字段列表
async function loadUpstreamFields(nodeId) {
    upstreamFields.value = [];
    upstreamSourceName.value = '';
    const upstream = findUpstreamNode(nodeId);
    if (!upstream)
        return;
    const upstreamCatalog = catalogFields(upstream.config?.output_field_catalog || upstream.config?.field_catalog || upstream.config?.mapping_source_catalog);
    if (upstreamCatalog.length) {
        upstreamFields.value = upstreamCatalog.map((field) => ({ name: field.code, type: field.type || 'string' }));
        upstreamSourceName.value = `(${upstream.label || upstream.id})`;
        return;
    }
    if (upstream.type !== 'CONNECTOR')
        return;
    const adapterCode = upstream.config?.adapter_code;
    if (!adapterCode)
        return;
    upstreamSourceName.value = `(${upstream.config?.resource_name || adapterCode})`;
    try {
        const schema = await ucpApi.adapterSchema?.(adapterCode);
        if (schema?.categories)
            upstreamFields.value = schema.categories.flatMap((c) => (c.fields || []).map((f) => ({ name: f.name, type: f.type || 'string' })));
    }
    catch { /* 上游 schema 未就绪 */ }
}
function syncTransformMappingContext() {
    const config = selectedTransformConfig();
    if (!config)
        return;
    const result = documentFromTransformConfig(config);
    transformMappingDocument.value = result.document;
    transformMappingCompatibility.value = result.compatibility;
    transformMappingStorageMode.value = config.storageMode === 'component_v1' || config.mapping_component ? 'component_v1' : result.storageMode;
    transformLegacyMappingSnapshot.value = result.snapshot;
    transformLegacyMode.value = result.snapshot?.mode === 'mapped_plus_same_name' ? 'mapped_plus_same_name' : 'strict';
}
function isLegacyWritableDocument(document) {
    return document.ruleSet.rules.every((rule) => rule.type === 'field' && rule.sourceFields.length === 1 && rule.targetFields.length === 1 && rule.config?.mode === 'rename');
}
function legacyRulesFromDocument(document, snapshot) {
    const snapshotRules = Array.isArray(snapshot?.rules) ? snapshot.rules : [];
    return document.ruleSet.rules.map((rule, index) => ({
        ...(snapshotRules[index] && typeof snapshotRules[index] === 'object' ? JSON.parse(JSON.stringify(snapshotRules[index])) : {}),
        source_field_id: rule.sourceFields[0],
        target_field_id: rule.targetFields[0],
        source_kind: 'upstream_field',
    }));
}
function writeTransformMappingConfig(document) {
    if (!selectedNode.value || selectedNode.value.type !== 'TRANSFORM')
        return;
    const config = { ...(selectedNode.value.config || {}) };
    const compatibility = transformMappingCompatibility.value;
    const canUseLegacy = transformMappingStorageMode.value === 'legacy_v1' && isLegacyWritableDocument(document) && compatibility?.writable !== false;
    const sourceCatalog = transformSourceFields.value.map((field, ordinal) => ({ field_id: field.code, label: field.label, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }));
    const targetCatalog = transformTargetFields.value.map((field, ordinal) => ({ field_id: field.code, label: field.label, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }));
    if (canUseLegacy) {
        const legacy = transformLegacyMappingSnapshot.value ? JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value)) : {};
        legacy.version = 1;
        legacy.mode = transformLegacyMode.value;
        legacy.source_schema_hash = document.ruleSet.sourceSchemaHash;
        legacy.target_schema_hash = document.ruleSet.targetSchemaHash;
        if (!Array.isArray(legacy.target_field_catalog))
            legacy.target_field_catalog = targetCatalog;
        legacy.rules = legacyRulesFromDocument(document, transformLegacyMappingSnapshot.value);
        config.mapping = legacy;
        delete config.mapping_component;
        delete config.legacy_mapping_snapshot;
        config.storageMode = 'legacy_v1';
    }
    else {
        config.mapping_component = JSON.parse(JSON.stringify(document));
        config.storageMode = 'component_v1';
        if (transformLegacyMappingSnapshot.value) {
            config.mapping = JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value));
            config.legacy_mapping_snapshot = JSON.parse(JSON.stringify(transformLegacyMappingSnapshot.value));
        }
    }
    config.mapping_source_catalog = sourceCatalog;
    config.mapping_target_catalog = targetCatalog;
    selectedNode.value.config = config;
    transformMappingStorageMode.value = canUseLegacy ? 'legacy_v1' : 'component_v1';
    transformMappingDocument.value = document;
}
function onTransformMappingChange(document) {
    document = JSON.parse(JSON.stringify(document));
    const hasNonFieldRule = document.ruleSet.rules.some((rule) => rule.type !== 'field');
    if (hasNonFieldRule)
        transformMappingStorageMode.value = 'component_v1';
    if (transformMappingCompatibility.value?.writable === false && !selectedTransformConfig()?.mapping_component && !hasNonFieldRule)
        return;
    writeTransformMappingConfig(document);
}
// ===== NOTIFY 通知模板 =====
const notifyTemplates = ref([]);
async function loadNotifyTemplates() { try {
    const r = await ucpApi.listNotificationTemplates?.({ is_active: 1, limit: 200 });
    notifyTemplates.value = r?.items || [];
}
catch { } }
// ===== BRANCH 结构化条件 =====
const branchConditionAst = computed(() => {
    const config = selectedNode.value?.config || {};
    if (!config.condition_ast)
        config.condition_ast = { version: 1, mode: 'ALL', rules: [] };
    config.condition_field_catalog = upstreamFields.value.map((field, ordinal) => ({ field_id: field.name, label: field.name, type: field.type || 'string', sensitive: false, parent_field_id: null, ordinal }));
    return config.condition_ast;
});
function addBranchRule() { branchConditionAst.value.rules.push({ left_field_id: '', operator: 'EQ', right: '' }); }
function removeBranchRule(index) { branchConditionAst.value.rules.splice(index, 1); }
// 监听节点选中，同步映射
watch(selectedNodeId, async (newId) => {
    if (!newId) {
        upstreamFields.value = [];
        upstreamSourceName.value = '';
        transformMappingCompatibility.value = null;
        transformLegacyMappingSnapshot.value = null;
        return;
    }
    await loadUpstreamFields(newId);
    if (selectedNode.value?.type === 'TRANSFORM')
        syncTransformMappingContext();
    const node = selectedNode.value;
    if (node?.type === 'START_TRIGGER')
        resetStartTriggerSelection();
    if (node?.type === 'RECORD_MERGE') {
        const sinkNode = form.nodes.find(item => item.type === 'WAREHOUSE_ASSET_SINK');
        const targetAsset = String(sinkNode?.config?.target_asset || '');
        if (targetAsset)
            await loadTargetAssetColumns(targetAsset);
    }
});
function nodeAnchor(node, side) { if (side === 'left')
    return { x: node.x - EDGE_ANCHOR_GAP, y: node.y + NODE_CARD_HEIGHT / 2, side }; if (side === 'right')
    return { x: node.x + NODE_CARD_WIDTH + EDGE_ANCHOR_GAP, y: node.y + NODE_CARD_HEIGHT / 2, side }; if (side === 'top')
    return { x: node.x + NODE_CARD_WIDTH / 2, y: node.y - EDGE_ANCHOR_GAP, side }; return { x: node.x + NODE_CARD_WIDTH / 2, y: node.y + NODE_CARD_HEIGHT + EDGE_ANCHOR_GAP, side }; }
function edgeAnchors(from, to) { const fromCenterX = from.x + NODE_CARD_WIDTH / 2; const fromCenterY = from.y + NODE_CARD_HEIGHT / 2; const toCenterX = to.x + NODE_CARD_WIDTH / 2; const toCenterY = to.y + NODE_CARD_HEIGHT / 2; const deltaX = toCenterX - fromCenterX; const deltaY = toCenterY - fromCenterY; if (Math.abs(deltaX) >= Math.abs(deltaY))
    return deltaX >= 0 ? { from: nodeAnchor(from, 'right'), to: nodeAnchor(to, 'left') } : { from: nodeAnchor(from, 'left'), to: nodeAnchor(to, 'right') }; return deltaY >= 0 ? { from: nodeAnchor(from, 'bottom'), to: nodeAnchor(to, 'top') } : { from: nodeAnchor(from, 'top'), to: nodeAnchor(to, 'bottom') }; }
function storedEdge(e) { const from = form.nodes.find((node) => node.id === e.from); const to = form.nodes.find((node) => node.id === e.to); if (!from || !to)
    return { fromX: 0, fromY: 0, toX: 0, toY: 0, fromSide: 'right', toSide: 'left' }; const anchors = edgeAnchors(from, to); return { fromX: anchors.from.x, fromY: anchors.from.y, toX: anchors.to.x, toY: anchors.to.y, fromSide: anchors.from.side, toSide: anchors.to.side }; }
function edgePath(e) { const isDrawing = 'fromNodeId' in e; const source = isDrawing ? form.nodes.find((node) => node.id === e.fromNodeId) : null; const fromSide = isDrawing ? e.fromSide : e.fromSide; const anchor = source ? nodeAnchor(source, fromSide) : null; const fromX = anchor?.x ?? e.fromX; const fromY = anchor?.y ?? e.fromY; const toX = isDrawing ? e.endX : e.toX; const toY = isDrawing ? e.endY : e.toY; if (Math.abs(fromX - toX) < 0.5 || Math.abs(fromY - toY) < 0.5)
    return `M${fromX},${fromY} L${toX},${toY}`; return fromSide === 'top' || fromSide === 'bottom' ? `M${fromX},${fromY} V${fromY + (toY - fromY) / 2} H${toX} V${toY}` : `M${fromX},${fromY} H${fromX + (toX - fromX) / 2} V${toY} H${toX}`; }
function edgeStroke(edge) { return selectedNodeId.value && (edge.from === selectedNodeId.value || edge.to === selectedNodeId.value) ? '#409eff' : '#64748b'; }
function legacyAutoLayout(notify = true) {
    const byId = new Map(form.nodes.map((node) => [node.id, node]));
    const incoming = new Map(form.nodes.map((node) => [node.id, 0]));
    const levels = new Map();
    for (const edge of form.edges)
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    const queue = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0);
    queue.forEach((node) => levels.set(node.id, node.type === 'START_TRIGGER' ? 0 : 1));
    for (let index = 0; index < queue.length; index += 1) {
        const node = queue[index];
        const level = levels.get(node.id) || 0;
        for (const edge of form.edges.filter((item) => item.from === node.id)) {
            const nextLevel = Math.max(levels.get(edge.to) || 0, level + 1);
            levels.set(edge.to, nextLevel);
            incoming.set(edge.to, (incoming.get(edge.to) || 1) - 1);
            if (incoming.get(edge.to) === 0 && byId.has(edge.to))
                queue.push(byId.get(edge.to));
        }
    }
    const columns = new Map();
    form.nodes.forEach((node) => { const level = levels.get(node.id) ?? 1; columns.set(level, [...(columns.get(level) || []), node]); });
    columns.forEach((nodes, level) => nodes.forEach((node, index) => { node.x = 48 + level * (NODE_CARD_WIDTH + NODE_GAP_X); node.y = 96 + index * NODE_GAP_Y; }));
    void nextTick(centerCanvas);
    if (notify)
        ElMessage.success('流程已整理');
}
function edgeAxis(from, to) {
    return Math.abs(to.x - from.x) >= Math.abs(to.y - from.y) ? 'horizontal' : 'vertical';
}
function hasPathDirectionTurn() {
    const incoming = new Map(form.nodes.map((node) => [node.id, 0]));
    const outgoing = new Map();
    form.edges.forEach((edge) => {
        const from = form.nodes.find((node) => node.id === edge.from);
        const to = form.nodes.find((node) => node.id === edge.to);
        if (!from || !to)
            return;
        incoming.set(to.id, (incoming.get(to.id) || 0) + 1);
        outgoing.set(from.id, [...(outgoing.get(from.id) || []), { from, to, axis: edgeAxis(from, to) }]);
    });
    const roots = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0);
    const visit = (nodeId, previousAxis, path = new Set()) => {
        if (path.has(nodeId))
            return false;
        const nextPath = new Set(path).add(nodeId);
        return (outgoing.get(nodeId) || []).some((edge) => (previousAxis && previousAxis !== edge.axis) || visit(edge.to.id, edge.axis, nextPath));
    };
    return roots.some((node) => visit(node.id)) || form.nodes.some((node) => visit(node.id));
}
function normalizeAxisRun(nodes, axis) {
    if (nodes.length < 2)
        return false;
    const crossAxis = axis === 'horizontal' ? 'y' : 'x';
    const mainAxis = axis === 'horizontal' ? 'x' : 'y';
    const crossValue = nodes.reduce((total, node) => total + node[crossAxis], 0) / nodes.length;
    let changed = false;
    nodes.forEach((node) => {
        if (Math.abs(node[crossAxis] - crossValue) >= 0.5) {
            node[crossAxis] = crossValue;
            changed = true;
        }
    });
    if (nodes.length < 3)
        return changed;
    const ordered = [...nodes].sort((left, right) => left[mainAxis] - right[mainAxis]);
    const first = ordered[0][mainAxis];
    const last = ordered[ordered.length - 1][mainAxis];
    const minGap = axis === 'horizontal' ? NODE_CARD_WIDTH + NODE_GAP_X : NODE_CARD_HEIGHT + NODE_GAP_Y;
    const gap = Math.abs(last - first) < minGap * (ordered.length - 1) ? minGap : (last - first) / (ordered.length - 1);
    ordered.forEach((node, index) => {
        const position = first + gap * index;
        if (Math.abs(node[mainAxis] - position) >= 0.5) {
            node[mainAxis] = position;
            changed = true;
        }
    });
    return changed;
}
function normalizeSameAxisRuns() {
    const axisEdges = form.edges.flatMap((edge) => {
        const from = form.nodes.find((node) => node.id === edge.from);
        const to = form.nodes.find((node) => node.id === edge.to);
        return from && to ? [{ from, to, axis: edgeAxis(from, to) }] : [];
    });
    let changed = false;
    ['horizontal', 'vertical'].forEach((axis) => {
        const remaining = axisEdges.filter((edge) => edge.axis === axis);
        while (remaining.length) {
            const component = [remaining.shift()];
            const nodeIds = new Set([component[0].from.id, component[0].to.id]);
            let expanded = true;
            while (expanded) {
                expanded = false;
                for (let index = 0; index < remaining.length;) {
                    const edge = remaining[index];
                    if (nodeIds.has(edge.from.id) || nodeIds.has(edge.to.id)) {
                        component.push(edge);
                        nodeIds.add(edge.from.id);
                        nodeIds.add(edge.to.id);
                        remaining.splice(index, 1);
                        expanded = true;
                    }
                    else
                        index += 1;
                }
            }
            changed = normalizeAxisRun(form.nodes.filter((node) => nodeIds.has(node.id)), axis) || changed;
        }
    });
    return changed;
}
function inferSmartLayoutDirection() {
    if (hasPathDirectionTurn())
        return 'mixed';
    let horizontalDistance = 0;
    let verticalDistance = 0;
    let linkedEdges = 0;
    form.edges.forEach((edge) => {
        const from = form.nodes.find((node) => node.id === edge.from);
        const to = form.nodes.find((node) => node.id === edge.to);
        if (!from || !to)
            return;
        horizontalDistance += Math.abs(to.x - from.x);
        verticalDistance += Math.abs(to.y - from.y);
        linkedEdges += 1;
    });
    if (!linkedEdges)
        return 'horizontal';
    if (horizontalDistance > verticalDistance * 1.35)
        return 'horizontal';
    if (verticalDistance > horizontalDistance * 1.35)
        return 'vertical';
    return 'mixed';
}
function repairMixedLayout() {
    let changed = normalizeSameAxisRuns();
    for (let pass = 0; pass < 3; pass += 1) {
        const ordered = [...form.nodes].sort((left, right) => left.y - right.y || left.x - right.x);
        ordered.forEach((node, index) => ordered.slice(0, index).forEach((other) => {
            const overlaps = node.x < other.x + NODE_CARD_WIDTH && node.x + NODE_CARD_WIDTH > other.x && node.y < other.y + NODE_CARD_HEIGHT && node.y + NODE_CARD_HEIGHT > other.y;
            if (!overlaps)
                return;
            const moveRight = other.x + NODE_CARD_WIDTH + 32 - node.x;
            const moveDown = other.y + NODE_CARD_HEIGHT + 32 - node.y;
            if (moveRight <= moveDown)
                node.x = Math.min(canvasW - NODE_CARD_WIDTH, node.x + moveRight);
            else
                node.y = Math.min(canvasH - NODE_CARD_HEIGHT, node.y + moveDown);
            changed = true;
        }));
    }
    return changed;
}
function autoLayout(notify = true) {
    const direction = inferSmartLayoutDirection();
    if (direction === 'horizontal') {
        legacyAutoLayout(notify);
        return;
    }
    if (direction === 'mixed') {
        const repaired = repairMixedLayout();
        void nextTick(centerCanvas);
        if (notify)
            ElMessage.success(repaired ? '\u5df2\u4fdd\u7559\u5f53\u524d\u5e03\u5c40\u5e76\u6d88\u9664\u91cd\u53e0' : '\u5df2\u4fdd\u7559\u5f53\u524d\u6df7\u5408\u5e03\u5c40');
        return;
    }
    const byId = new Map(form.nodes.map((node) => [node.id, node]));
    const incoming = new Map(form.nodes.map((node) => [node.id, 0]));
    const levels = new Map();
    for (const edge of form.edges)
        incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    const queue = form.nodes.filter((node) => node.type === 'START_TRIGGER' || incoming.get(node.id) === 0);
    queue.forEach((node) => levels.set(node.id, node.type === 'START_TRIGGER' ? 0 : 1));
    for (let index = 0; index < queue.length; index += 1) {
        const node = queue[index];
        const level = levels.get(node.id) || 0;
        for (const edge of form.edges.filter((item) => item.from === node.id)) {
            const nextLevel = Math.max(levels.get(edge.to) || 0, level + 1);
            levels.set(edge.to, nextLevel);
            incoming.set(edge.to, (incoming.get(edge.to) || 1) - 1);
            if (incoming.get(edge.to) === 0 && byId.has(edge.to))
                queue.push(byId.get(edge.to));
        }
    }
    const rows = new Map();
    form.nodes.forEach((node) => { const level = levels.get(node.id) ?? 1; rows.set(level, [...(rows.get(level) || []), node]); });
    rows.forEach((nodes, level) => nodes.sort((left, right) => left.x - right.x).forEach((node, index) => { node.x = 48 + index * (NODE_CARD_WIDTH + NODE_GAP_X); node.y = 96 + level * (NODE_CARD_HEIGHT + NODE_GAP_Y); }));
    void nextTick(centerCanvas);
    if (notify)
        ElMessage.success('\u5df2\u6309\u4e0a\u4e0b\u65b9\u5411\u667a\u80fd\u5e03\u5c40');
}
function hasCanvasOverlap() {
    return form.nodes.some((node, index) => form.nodes.slice(index + 1).some((other) => node.x < other.x + NODE_CARD_WIDTH && node.x + NODE_CARD_WIDTH > other.x && node.y < other.y + NODE_CARD_HEIGHT && node.y + NODE_CARD_HEIGHT > other.y));
}
function setCanvasZoom(value, recenter = true) {
    const nextZoom = Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Number(value.toFixed(2))));
    if (nextZoom === canvasZoom.value)
        return false;
    canvasZoom.value = nextZoom;
    if (recenter)
        void nextTick(centerCanvas);
    return true;
}
function onCanvasWheel(event) {
    const viewport = canvasRef.value;
    if (!viewport || event.deltaY === 0)
        return;
    const currentZoom = canvasZoom.value;
    const nextZoom = currentZoom * Math.exp(-event.deltaY * 0.001);
    if (!setCanvasZoom(nextZoom, false))
        return;
    const rect = viewport.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const workflowX = (viewport.scrollLeft + pointerX) / currentZoom;
    const workflowY = (viewport.scrollTop + pointerY) / currentZoom;
    void nextTick(() => {
        viewport.scrollLeft = Math.max(0, workflowX * canvasZoom.value - pointerX);
        viewport.scrollTop = Math.max(0, workflowY * canvasZoom.value - pointerY);
    });
}
function resetCanvasZoom() { setCanvasZoom(1); }
function fitCanvas() {
    if (!canvasRef.value || !form.nodes.length)
        return;
    const minX = Math.min(...form.nodes.map((node) => node.x));
    const maxX = Math.max(...form.nodes.map((node) => node.x + NODE_CARD_WIDTH));
    const minY = Math.min(...form.nodes.map((node) => node.y));
    const maxY = Math.max(...form.nodes.map((node) => node.y + NODE_CARD_HEIGHT));
    const viewport = canvasRef.value;
    setCanvasZoom(Math.min((viewport.clientWidth - 64) / (maxX - minX), (viewport.clientHeight - 64) / (maxY - minY), 1));
}
function centerCanvas() {
    if (!canvasRef.value || !form.nodes.length)
        return;
    const minX = Math.min(...form.nodes.map((node) => node.x));
    const maxX = Math.max(...form.nodes.map((node) => node.x + NODE_CARD_WIDTH));
    const minY = Math.min(...form.nodes.map((node) => node.y));
    const maxY = Math.max(...form.nodes.map((node) => node.y + NODE_CARD_HEIGHT));
    const viewport = canvasRef.value;
    const left = Math.max(0, ((minX + maxX) * canvasZoom.value) / 2 - viewport.clientWidth / 2);
    const top = Math.max(0, ((minY + maxY) * canvasZoom.value) / 2 - viewport.clientHeight / 2);
    if (typeof viewport.scrollTo === 'function')
        viewport.scrollTo({ left, top, behavior: 'smooth' });
    else {
        viewport.scrollLeft = left;
        viewport.scrollTop = top;
    }
}
async function loadTemplateTriggers(templateCode) { triggerLoading.value = true; try {
    templateTriggers.value = (await ucpApi.pipelineTriggers({ pipeline_template_code: templateCode })).items || [];
    syncStartTriggerModeFromTemplate();
}
catch {
    templateTriggers.value = [];
    syncStartTriggerModeFromTemplate();
}
finally {
    triggerLoading.value = false;
} }
async function openDesigner(tpl) { currentTpl.value = tpl; form.template_code = tpl.template_code; form.name = tpl.name; form.description = tpl.description || ''; form.version = /^\d+\.\d+$/.test(tpl.version) ? `${tpl.version}.0` : tpl.version; form.change_note = ''; form.nodes = JSON.parse(JSON.stringify(tpl.nodes)); form.edges = JSON.parse(JSON.stringify(tpl.edges)); selectedNodeId.value = null; await Promise.all([loadSystemsAndResources(), loadTemplateTriggers(tpl.template_code)]); if (hasCanvasOverlap())
    autoLayout(false); const sinkNode = form.nodes.find(node => node.type === 'WAREHOUSE_ASSET_SINK'); const targetAsset = String(sinkNode?.config?.target_asset || ''); if (targetAsset)
    await loadTargetAssetColumns(targetAsset);
else
    targetAssetColumns.value = []; void nextTick(fitCanvas); }
/*
async function loadPendingHireTemplate(): Promise<void> {
  try {
    const existing = await pipelineTemplateApi.get('PENDING_HIRE_OFFER_ENRICHMENT')
    await openDesigner(existing)
    ElMessage.success('\u5df2\u6253\u5f00\u5f85\u5165\u804c\u4eba\u5458\u8865\u5168\u6a21\u677f\uff0c\u8bf7\u5b8c\u6210\u914d\u7f6e\u540e\u4fdd\u5b58')
    return
  } catch (error: unknown) {
    const status = (error as { response?: { status?: number } }).response?.status
    if (status !== 404) {
      ElMessage.error(`\u52a0\u8f7d\u6a21\u677f\u5931\u8d25: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
  }

  currentTpl.value = null
  form.template_code = 'PENDING_HIRE_OFFER_ENRICHMENT'
  form.name = '待入职人员入仓及 Offer 薪酬补充'
  form.description = '选择待入职来源、投递记录 ID、Offer 能力和目标数据资产后保存。'
  form.version = '1.0.0'
  form.nodes = [
    { id: 'read_pending', type: 'CONNECTOR' as any, x: 80, y: 180, label: '读取待入职人员', config: {} },
    { id: 'lookup_offer', type: 'CAPABILITY_LOOKUP' as any, x: 340, y: 180, label: '按投递记录 ID 查询 Offer', config: { input_key: '${read_pending.result.data}', lookup_field: 'application_id', parameter_name: 'application_id' } },
    { id: 'merge_offer', type: 'RECORD_MERGE' as any, x: 630, y: 180, label: '补全 Offer 字段', config: { input_key: '${lookup_offer.result.data}', field_mapping: [] } },
    { id: 'write_asset', type: 'WAREHOUSE_ASSET_SINK' as any, x: 890, y: 180, label: '写入待入职人员资产', config: { input_key: '${merge_offer.result.data}', write_mode: 'upsert', field_whitelist: [] } },
  ]
  form.edges = [{ from: 'read_pending', to: 'lookup_offer' }, { from: 'lookup_offer', to: 'merge_offer' }, { from: 'merge_offer', to: 'write_asset' }]
  selectedNodeId.value = null
  ElMessage.success('已加载待入职人员补全模板，请依次选择来源、业务能力和目标资产')
}
*/
const saving = ref(false);
function normalizeTransformStorageModes() {
    for (const node of form.nodes.filter((item) => item.type === 'TRANSFORM')) {
        const config = { ...(node.config || {}) };
        if (config.mapping_component && typeof config.mapping_component === 'object') {
            config.storageMode = 'component_v1';
            if (!config.legacy_mapping_snapshot && config.mapping && typeof config.mapping === 'object') {
                config.legacy_mapping_snapshot = JSON.parse(JSON.stringify(config.mapping));
            }
        }
        else if (config.mapping && typeof config.mapping === 'object') {
            config.storageMode = 'legacy_v1';
            delete config.legacy_mapping_snapshot;
        }
        else {
            config.storageMode = 'component_v1';
            config.mapping_component = createEmptyDocument('ucp_transform', 'UCP Transform');
        }
        node.config = config;
    }
}
function normalizeWarehouseSinkConfigs() {
    for (const node of form.nodes.filter((item) => item.type === 'WAREHOUSE_ASSET_SINK')) {
        const config = node.config;
        for (const [textKey, valueKey] of [['mapping_text', 'mapping'], ['validations_text', 'validations']]) {
            const source = config[textKey];
            if (typeof source !== 'string')
                continue;
            try {
                const value = source.trim() ? JSON.parse(source) : [];
                if (!Array.isArray(value))
                    throw new Error('必须是数组');
                config[valueKey] = value;
            }
            catch (error) {
                throw new Error(`${textKey === 'mapping_text' ? '字段映射' : '校验规则'} JSON 格式无效：${error instanceof Error ? error.message : String(error)}`);
            }
        }
        if (config.write_mode === 'period_full_snapshot' && !config.period_field) {
            throw new Error('按期间全量快照必须选择期间字段');
        }
    }
}
async function saveTemplate() { if (!form.template_code || !form.name) {
    ElMessage.error('编码和名称必填');
    return;
} ; saving.value = true; try {
    const blockedTransform = form.nodes.find((node) => { if (node.type !== 'TRANSFORM')
        return false; const result = documentFromTransformConfig((node.config || {})); return result.compatibility.writable === false && !node.config?.mapping_component; });
    if (blockedTransform)
        throw new Error(`TRANSFORM 节点 ${blockedTransform.id} 存在有损字段，已阻断保存`);
    normalizeTransformStorageModes();
    normalizeWarehouseSinkConfigs();
    const dangerous = form.nodes.filter((node) => node.type === 'WAREHOUSE_ASSET_SINK' && ['replace', 'period_full_snapshot'].includes(String(node.config?.write_mode)));
    if (dangerous.length)
        await ElMessageBox.confirm(`以下节点将执行破坏性写入：${dangerous.map((node) => `${node.id} → ${node.config?.target_asset || '未选择资产'}`).join('；')}。确认保存？`, '危险写入确认', { type: 'warning' });
    if (currentTpl.value) {
        const saved = await pipelineTemplateApi.update(currentTpl.value.template_code, { name: form.name, description: form.description, nodes: form.nodes, edges: form.edges, change_note: form.change_note || undefined });
        currentTpl.value = { ...saved, nodes: form.nodes, edges: form.edges };
        form.version = saved.version;
        ElMessage.success('已保存，新版本已创建');
    }
    else {
        const created = await pipelineTemplateApi.create({ template_code: form.template_code, name: form.name, description: form.description, nodes: form.nodes, edges: form.edges });
        currentTpl.value = { ...created, nodes: form.nodes, edges: form.edges };
        ElMessage.success('已创建');
    }
}
catch (e) {
    const detail = e.response?.data?.detail;
    ElMessage.error(`保存失败: ${typeof detail === 'string' ? detail : e instanceof Error ? e.message : String(e)}`);
}
finally {
    saving.value = false;
} }
const dryRunVisible = ref(false);
const dryRunResult = ref(null);
async function dryRun() {
    if (!form.template_code) {
        ElMessage.error('请先保存后再试运行');
        return;
    }
    try {
        dryRunResult.value = await ucpApi.runPipeline(form.template_code, { dry_run: true });
        dryRunVisible.value = true;
    }
    catch (e) {
        ElMessage.error(`试运行失败: ${e instanceof Error ? e.message : String(e)}`);
    }
}
const versionsVisible = ref(false);
const versions = ref([]);
async function viewVersions(tpl) { try {
    const list = (await pipelineTemplateApi.versions(tpl.template_code));
    versions.value = list;
    versionsVisible.value = true;
}
catch (e) {
    ElMessage.error(`加载版本失败: ${e instanceof Error ? e.message : String(e)}`);
} }
async function rollbackTo(row) { if (!currentTpl.value) {
    ElMessage.warning('请先打开流程设计');
    return;
} ; try {
    await ElMessageBox.confirm('确认回滚到此版本? 将创建新版本快照.', '提示', { type: 'warning' });
    await pipelineTemplateApi.rollback(currentTpl.value.template_code, row.id);
    ElMessage.success('已回滚');
    versionsVisible.value = false;
}
catch { } }
const route = useRoute();
const router = useRouter();
async function loadPlatformEventCatalog() { try {
    platformEventCatalog.value = (await ucpApi.platformEventCatalog()).items || [];
}
catch {
    platformEventCatalog.value = [];
    ElMessage.error('平台事件目录加载失败');
} }
onMounted(async () => { await Promise.all([loadNodeTypes(), loadSystemsAndResources(), loadPublishedAssets(), loadPlatformEventCatalog()]); const tplCode = route.query.code; if (tplCode) {
    try {
        const tpl = await pipelineTemplateApi.get(tplCode);
        if (tpl)
            await openDesigner(tpl);
    }
    catch { }
} });
onBeforeUnmount(() => {
    window.removeEventListener('mousemove', onCanvasPanMove);
    window.removeEventListener('mouseup', onCanvasPanEnd);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['designer-right']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-left']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-right']} */ ;
/** @type {__VLS_StyleScopedClasses['node-palette-item']} */ ;
/** @type {__VLS_StyleScopedClasses['node-palette-item']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['node-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['status-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['status-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['status-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['port']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-info-form']} */ ;
/** @type {__VLS_StyleScopedClasses['el-form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['upstream-ref']} */ ;
/** @type {__VLS_StyleScopedClasses['upstream-field']} */ ;
/** @type {__VLS_StyleScopedClasses['upstream-field']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-migration-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-lossy-blocked']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pipeline-designer-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-left" },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (...[$event]) => {
        __VLS_ctx.$router.push('/ucp/pipelines');
    }
};
__VLS_3.slots.default;
var __VLS_3;
const __VLS_8 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    direction: "vertical",
}));
const __VLS_10 = __VLS_9({
    direction: "vertical",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "toolbar-title" },
});
(__VLS_ctx.currentTpl ? `编辑流程 — ${__VLS_ctx.form.name || __VLS_ctx.form.template_code}` : '新建流程');
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-right" },
});
const __VLS_12 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.form.nodes.length),
}));
const __VLS_14 = __VLS_13({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.form.nodes.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onClick: (__VLS_ctx.autoLayout)
};
__VLS_15.slots.default;
var __VLS_15;
const __VLS_20 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.currentTpl),
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.currentTpl),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (...[$event]) => {
        __VLS_ctx.viewVersions(__VLS_ctx.currentTpl);
    }
};
__VLS_23.slots.default;
var __VLS_23;
const __VLS_28 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onClick': {} },
    type: "success",
}));
const __VLS_30 = __VLS_29({
    ...{ 'onClick': {} },
    type: "success",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onClick: (__VLS_ctx.dryRun)
};
__VLS_31.slots.default;
var __VLS_31;
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.saving),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.saving),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.saveTemplate)
};
__VLS_39.slots.default;
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-body" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
for (const [nt] of __VLS_getVForSourceType((__VLS_ctx.fixedNodeTypes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onDragstart: (...[$event]) => {
                __VLS_ctx.onPaletteDragStart($event, nt.type);
            } },
        key: (nt.type),
        ...{ class: "node-palette-item" },
        ...{ style: ({ borderLeft: `4px solid ${nt.color}` }) },
        draggable: "true",
    });
    const __VLS_44 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
    const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    const __VLS_48 = ((__VLS_ctx.resolveIcon(nt.icon)));
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
    const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
    var __VLS_47;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (nt.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
const __VLS_52 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ style: {} },
}));
const __VLS_54 = __VLS_53({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
for (const [nt] of __VLS_getVForSourceType((__VLS_ctx.paletteNodeTypes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onDragstart: (...[$event]) => {
                __VLS_ctx.onPaletteDragStart($event, nt.type);
            } },
        key: (nt.type),
        ...{ class: "node-palette-item" },
        ...{ style: ({ borderLeft: `4px solid ${nt.color}` }) },
        draggable: "true",
    });
    const __VLS_56 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = ((__VLS_ctx.resolveIcon(nt.icon)));
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
    const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
    var __VLS_59;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (nt.label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "canvas-viewport" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onWheel: (__VLS_ctx.onCanvasWheel) },
    ...{ onMousedown: (__VLS_ctx.startCanvasPan) },
    ...{ onDragover: () => { } },
    ...{ onDrop: (__VLS_ctx.onCanvasDrop) },
    ...{ onClick: (__VLS_ctx.onCanvasClick) },
    ...{ class: "designer-canvas" },
    ...{ class: ({ 'is-panning': __VLS_ctx.isCanvasPanning }) },
    ref: "canvasRef",
});
/** @type {typeof __VLS_ctx.canvasRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "canvas-scaler" },
    ...{ style: ({ width: `${__VLS_ctx.canvasW * __VLS_ctx.canvasZoom}px`, height: `${__VLS_ctx.canvasH * __VLS_ctx.canvasZoom}px` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "canvas-content" },
    ...{ style: ({ width: `${__VLS_ctx.canvasW}px`, height: `${__VLS_ctx.canvasH}px`, transform: `scale(${__VLS_ctx.canvasZoom})` }) },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    ...{ class: "edge-layer" },
    viewBox: (`0 0 ${__VLS_ctx.canvasW} ${__VLS_ctx.canvasH}`),
    width: (__VLS_ctx.canvasW),
    height: (__VLS_ctx.canvasH),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.defs, __VLS_intrinsicElements.defs)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.marker, __VLS_intrinsicElements.marker)({
    id: "arrowhead",
    viewBox: "0 0 10 10",
    markerWidth: "8",
    markerHeight: "8",
    refX: "10",
    refY: "5",
    orient: "auto",
    markerUnits: "strokeWidth",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M 0 0 L 10 5 L 0 10 z",
    fill: "context-stroke",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.pattern, __VLS_intrinsicElements.pattern)({
    id: "dotgrid",
    x: "0",
    y: "0",
    width: "20",
    height: "20",
    patternUnits: "userSpaceOnUse",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
    cx: "2",
    cy: "2",
    r: "1",
    fill: "#e4e7ed",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
    width: (__VLS_ctx.canvasW),
    height: (__VLS_ctx.canvasH),
    fill: "url(#dotgrid)",
});
for (const [edge, i] of __VLS_getVForSourceType((__VLS_ctx.drawingEdges))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        key: (`draw-edge-${i}`),
        d: (__VLS_ctx.edgePath(edge)),
        stroke: "#909399",
        'stroke-width': "2",
        fill: "none",
        'stroke-dasharray': "5,3",
        'marker-end': "url(#arrowhead)",
    });
}
for (const [edge, i] of __VLS_getVForSourceType((__VLS_ctx.form.edges))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        key: (`edge-${i}`),
        d: (__VLS_ctx.edgePath(__VLS_ctx.storedEdge(edge))),
        stroke: (__VLS_ctx.edgeStroke(edge)),
        'stroke-width': "2.5",
        fill: "none",
        'marker-end': "url(#arrowhead)",
    });
}
for (const [node] of __VLS_getVForSourceType((__VLS_ctx.form.nodes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMousedown: (...[$event]) => {
                __VLS_ctx.startDrag($event, node);
            } },
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.selectNode(node);
            } },
        key: (node.id),
        ...{ class: "node-card" },
        ...{ class: ({ selected: __VLS_ctx.selectedNodeId === node.id, 'is-error': __VLS_ctx.nodeHasError(node), 'start-trigger': node.type === 'START_TRIGGER' }) },
        ...{ style: ({ left: node.x + 'px', top: node.y + 'px', borderColor: __VLS_ctx.getNodeColor(node.type) }) },
        'data-node-id': (node.id),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-header" },
        ...{ style: ({ background: __VLS_ctx.getNodeColor(node.type) }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.getNodeLabel(node.type));
    const __VLS_64 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeNode(node.id);
        }
    };
    __VLS_67.slots.default;
    const __VLS_72 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
    const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    const __VLS_76 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({}));
    const __VLS_78 = __VLS_77({}, ...__VLS_functionalComponentArgsRest(__VLS_77));
    var __VLS_75;
    var __VLS_67;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-title" },
        title: (node.label || __VLS_ctx.getNodeLabel(node.type)),
    });
    (node.label || __VLS_ctx.getNodeLabel(node.type));
    for (const [line, index] of __VLS_getVForSourceType((__VLS_ctx.nodeSummaryLines(node)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (`${node.id}-summary-${index}`),
            ...{ class: "node-summary" },
            title: (line),
        });
        (line);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-status" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: (['status-dot', __VLS_ctx.nodeStatus(node).tone]) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.nodeStatus(node).label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-ports" },
    });
    for (const [side] of __VLS_getVForSourceType((__VLS_ctx.connectorSides))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ onMousedown: (...[$event]) => {
                    __VLS_ctx.startConnect($event, node, side);
                } },
            key: (`${node.id}-${side}`),
            ...{ class: "port" },
            ...{ class: (`port-${side}`) },
            'data-node-id': (node.id),
            'data-port': (side),
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onMousedown: () => { } },
    ...{ onClick: () => { } },
    ...{ class: "canvas-controls" },
});
const __VLS_80 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    ...{ 'onClick': {} },
    ...{ class: "zoom-value" },
    text: true,
    size: "small",
    disabled: (__VLS_ctx.canvasZoom === 1),
    'aria-label': "Reset zoom",
}));
const __VLS_82 = __VLS_81({
    ...{ 'onClick': {} },
    ...{ class: "zoom-value" },
    text: true,
    size: "small",
    disabled: (__VLS_ctx.canvasZoom === 1),
    'aria-label': "Reset zoom",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
let __VLS_84;
let __VLS_85;
let __VLS_86;
const __VLS_87 = {
    onClick: (__VLS_ctx.resetCanvasZoom)
};
__VLS_83.slots.default;
(Math.round(__VLS_ctx.canvasZoom * 100));
var __VLS_83;
const __VLS_88 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_90 = __VLS_89({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onClick: (__VLS_ctx.fitCanvas)
};
__VLS_91.slots.default;
var __VLS_91;
const __VLS_96 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_98 = __VLS_97({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
let __VLS_100;
let __VLS_101;
let __VLS_102;
const __VLS_103 = {
    onClick: (__VLS_ctx.centerCanvas)
};
__VLS_99.slots.default;
var __VLS_99;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "designer-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
const __VLS_104 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    model: (__VLS_ctx.form),
    labelWidth: "60px",
    size: "small",
    ...{ class: "pipeline-info-form" },
}));
const __VLS_106 = __VLS_105({
    model: (__VLS_ctx.form),
    labelWidth: "60px",
    size: "small",
    ...{ class: "pipeline-info-form" },
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
__VLS_107.slots.default;
const __VLS_108 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    gutter: (8),
}));
const __VLS_110 = __VLS_109({
    gutter: (8),
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    span: (12),
}));
const __VLS_114 = __VLS_113({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
const __VLS_116 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    label: "编码",
}));
const __VLS_118 = __VLS_117({
    label: "编码",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
const __VLS_120 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    modelValue: (__VLS_ctx.form.template_code),
    disabled: (!!__VLS_ctx.currentTpl),
    placeholder: "code",
    size: "small",
}));
const __VLS_122 = __VLS_121({
    modelValue: (__VLS_ctx.form.template_code),
    disabled: (!!__VLS_ctx.currentTpl),
    placeholder: "code",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
var __VLS_119;
var __VLS_115;
const __VLS_124 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    span: (12),
}));
const __VLS_126 = __VLS_125({
    span: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
const __VLS_128 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "名称",
}));
const __VLS_130 = __VLS_129({
    label: "名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
const __VLS_132 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "流程名称",
    size: "small",
}));
const __VLS_134 = __VLS_133({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "流程名称",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
var __VLS_131;
var __VLS_127;
var __VLS_111;
const __VLS_136 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    label: "描述",
    ...{ class: "compact-item" },
}));
const __VLS_138 = __VLS_137({
    label: "描述",
    ...{ class: "compact-item" },
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "流程用途说明",
    size: "small",
}));
const __VLS_142 = __VLS_141({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "流程用途说明",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
var __VLS_139;
if (__VLS_ctx.currentTpl) {
    const __VLS_144 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        gutter: (8),
    }));
    const __VLS_146 = __VLS_145({
        gutter: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    const __VLS_148 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        span: (12),
    }));
    const __VLS_150 = __VLS_149({
        span: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    __VLS_151.slots.default;
    const __VLS_152 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        label: "版本",
        ...{ class: "compact-item" },
    }));
    const __VLS_154 = __VLS_153({
        label: "版本",
        ...{ class: "compact-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    const __VLS_156 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        modelValue: (__VLS_ctx.form.version),
        disabled: true,
        size: "small",
    }));
    const __VLS_158 = __VLS_157({
        modelValue: (__VLS_ctx.form.version),
        disabled: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    {
        const { prepend: __VLS_thisSlot } = __VLS_159.slots;
    }
    var __VLS_159;
    var __VLS_155;
    var __VLS_151;
    const __VLS_160 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        span: (12),
    }));
    const __VLS_162 = __VLS_161({
        span: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    const __VLS_164 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        label: "变更",
        ...{ class: "compact-item" },
    }));
    const __VLS_166 = __VLS_165({
        label: "变更",
        ...{ class: "compact-item" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    __VLS_167.slots.default;
    const __VLS_168 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        modelValue: (__VLS_ctx.form.change_note),
        placeholder: "更新原因",
        size: "small",
    }));
    const __VLS_170 = __VLS_169({
        modelValue: (__VLS_ctx.form.change_note),
        placeholder: "更新原因",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    var __VLS_167;
    var __VLS_163;
    var __VLS_147;
}
var __VLS_107;
const __VLS_172 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
    ...{ style: {} },
}));
const __VLS_174 = __VLS_173({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_173));
__VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({});
if (!__VLS_ctx.selectedNode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-tip" },
    });
    const __VLS_176 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({}));
    const __VLS_178 = __VLS_177({}, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    const __VLS_180 = {}.Aim;
    /** @type {[typeof __VLS_components.Aim, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({}));
    const __VLS_182 = __VLS_181({}, ...__VLS_functionalComponentArgsRest(__VLS_181));
    var __VLS_179;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_184 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        labelWidth: "80px",
        size: "small",
    }));
    const __VLS_186 = __VLS_185({
        labelWidth: "80px",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    const __VLS_188 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        label: "ID",
    }));
    const __VLS_190 = __VLS_189({
        label: "ID",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    __VLS_191.slots.default;
    const __VLS_192 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        modelValue: (__VLS_ctx.selectedNode.id),
        disabled: true,
    }));
    const __VLS_194 = __VLS_193({
        modelValue: (__VLS_ctx.selectedNode.id),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    var __VLS_191;
    const __VLS_196 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        label: "&#33410;&#28857;&#31867;&#22411;",
    }));
    const __VLS_198 = __VLS_197({
        label: "&#33410;&#28857;&#31867;&#22411;",
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_199.slots.default;
    const __VLS_200 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
        modelValue: (__VLS_ctx.getNodeLabel(__VLS_ctx.selectedNode.type)),
        disabled: true,
    }));
    const __VLS_202 = __VLS_201({
        modelValue: (__VLS_ctx.getNodeLabel(__VLS_ctx.selectedNode.type)),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
    var __VLS_199;
    if (__VLS_ctx.selectedNode.type !== 'START_TRIGGER') {
        const __VLS_204 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            label: "&#31867;&#22411;&#35828;&#26126;",
        }));
        const __VLS_206 = __VLS_205({
            label: "&#31867;&#22411;&#35828;&#26126;",
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        __VLS_207.slots.default;
        const __VLS_208 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
            modelValue: "&#33410;&#28857;&#39034;&#24207;&#30001;&#30011;&#24067;&#36830;&#32447;&#20915;&#23450;",
            disabled: true,
        }));
        const __VLS_210 = __VLS_209({
            modelValue: "&#33410;&#28857;&#39034;&#24207;&#30001;&#30011;&#24067;&#36830;&#32447;&#20915;&#23450;",
            disabled: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_209));
        var __VLS_207;
    }
    if (__VLS_ctx.selectedNode.type === 'START_TRIGGER') {
        const __VLS_212 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
            label: "&#35302;&#21457;&#26041;&#24335;",
        }));
        const __VLS_214 = __VLS_213({
            label: "&#35302;&#21457;&#26041;&#24335;",
        }, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        const __VLS_216 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.startTriggerMode),
            clearable: true,
            placeholder: "&#36873;&#25321;&#35302;&#21457;&#26041;&#24335;",
            ...{ style: {} },
        }));
        const __VLS_218 = __VLS_217({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.startTriggerMode),
            clearable: true,
            placeholder: "&#36873;&#25321;&#35302;&#21457;&#26041;&#24335;",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        let __VLS_220;
        let __VLS_221;
        let __VLS_222;
        const __VLS_223 = {
            onChange: (__VLS_ctx.changeStartTriggerMode)
        };
        __VLS_219.slots.default;
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.startTriggerModeOptions))) {
            const __VLS_224 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                key: (option.value),
                label: (option.label),
                value: (option.value),
                disabled: (option.disabled),
            }));
            const __VLS_226 = __VLS_225({
                key: (option.value),
                label: (option.label),
                value: (option.value),
                disabled: (option.disabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_225));
        }
        var __VLS_219;
        var __VLS_215;
        if (__VLS_ctx.startTriggerMode === 'SCHEDULE') {
            const __VLS_228 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                label: "&#35843;&#24230;&#35745;&#21010;",
            }));
            const __VLS_230 = __VLS_229({
                label: "&#35843;&#24230;&#35745;&#21010;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_229));
            __VLS_231.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "schedule-plan-summary" },
            });
            if (__VLS_ctx.scheduledTemplateTriggers.length) {
                for (const [trigger] of __VLS_getVForSourceType((__VLS_ctx.scheduledTemplateTriggers.slice(0, 2)))) {
                    const __VLS_232 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                        key: (trigger.trigger_code),
                        type: (trigger.is_active ? 'success' : 'info'),
                    }));
                    const __VLS_234 = __VLS_233({
                        key: (trigger.trigger_code),
                        type: (trigger.is_active ? 'success' : 'info'),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
                    __VLS_235.slots.default;
                    (__VLS_ctx.schedulePlanSummary(trigger));
                    var __VLS_235;
                }
                if (__VLS_ctx.scheduledTemplateTriggers.length > 2) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "muted" },
                    });
                    (__VLS_ctx.scheduledTemplateTriggers.length);
                }
            }
            else if (!__VLS_ctx.isSchedulePlanDirty) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "muted" },
                });
            }
            if (__VLS_ctx.isSchedulePlanDirty) {
                const __VLS_236 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                    type: "warning",
                }));
                const __VLS_238 = __VLS_237({
                    type: "warning",
                }, ...__VLS_functionalComponentArgsRest(__VLS_237));
                __VLS_239.slots.default;
                (__VLS_ctx.schedulePlanLabel(__VLS_ctx.scheduledPlanSchedule));
                var __VLS_239;
            }
            var __VLS_231;
            if (__VLS_ctx.scheduledTemplateTriggers.length > 1) {
                const __VLS_240 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                    label: "调整计划",
                }));
                const __VLS_242 = __VLS_241({
                    label: "调整计划",
                }, ...__VLS_functionalComponentArgsRest(__VLS_241));
                __VLS_243.slots.default;
                const __VLS_244 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
                    modelValue: (__VLS_ctx.selectedScheduledTriggerCode),
                    ...{ style: {} },
                }));
                const __VLS_246 = __VLS_245({
                    modelValue: (__VLS_ctx.selectedScheduledTriggerCode),
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_245));
                __VLS_247.slots.default;
                for (const [trigger] of __VLS_getVForSourceType((__VLS_ctx.scheduledTemplateTriggers))) {
                    const __VLS_248 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                        key: (trigger.trigger_code),
                        label: (__VLS_ctx.schedulePlanSummary(trigger)),
                        value: (trigger.trigger_code),
                    }));
                    const __VLS_250 = __VLS_249({
                        key: (trigger.trigger_code),
                        label: (__VLS_ctx.schedulePlanSummary(trigger)),
                        value: (trigger.trigger_code),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
                }
                var __VLS_247;
                var __VLS_243;
            }
            const __VLS_252 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                label: "执行计划",
            }));
            const __VLS_254 = __VLS_253({
                label: "执行计划",
            }, ...__VLS_functionalComponentArgsRest(__VLS_253));
            __VLS_255.slots.default;
            /** @type {[typeof ScheduleSelector, ]} */ ;
            // @ts-ignore
            const __VLS_256 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
                schedule: (__VLS_ctx.scheduledPlanSchedule),
                showStartTime: (false),
                allowAdvanced: (false),
                allowManual: (false),
                showHint: (false),
            }));
            const __VLS_257 = __VLS_256({
                schedule: (__VLS_ctx.scheduledPlanSchedule),
                showStartTime: (false),
                allowAdvanced: (false),
                allowManual: (false),
                showHint: (false),
            }, ...__VLS_functionalComponentArgsRest(__VLS_256));
            var __VLS_255;
            const __VLS_259 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
                label: "计划状态",
            }));
            const __VLS_261 = __VLS_260({
                label: "计划状态",
            }, ...__VLS_functionalComponentArgsRest(__VLS_260));
            __VLS_262.slots.default;
            const __VLS_263 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
                modelValue: (__VLS_ctx.scheduledPlanEnabled),
                activeText: "启用",
                inactiveText: "停用",
            }));
            const __VLS_265 = __VLS_264({
                modelValue: (__VLS_ctx.scheduledPlanEnabled),
                activeText: "启用",
                inactiveText: "停用",
            }, ...__VLS_functionalComponentArgsRest(__VLS_264));
            var __VLS_262;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "start-trigger-hint" },
            });
            const __VLS_267 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
                disabled: (!__VLS_ctx.scheduledPlanSchedule),
                loading: (__VLS_ctx.schedulePlanSaving),
            }));
            const __VLS_269 = __VLS_268({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
                disabled: (!__VLS_ctx.scheduledPlanSchedule),
                loading: (__VLS_ctx.schedulePlanSaving),
            }, ...__VLS_functionalComponentArgsRest(__VLS_268));
            let __VLS_271;
            let __VLS_272;
            let __VLS_273;
            const __VLS_274 = {
                onClick: (__VLS_ctx.saveInlineSchedulePlan)
            };
            __VLS_270.slots.default;
            (__VLS_ctx.selectedScheduledPlan ? '保存调度计划' : '创建调度计划');
            var __VLS_270;
        }
        else if (__VLS_ctx.startTriggerMode === 'PLATFORM_EVENT') {
            if (__VLS_ctx.platformEventTriggers.length > 1) {
                const __VLS_275 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
                    label: "&#24050;&#37197;&#20107;&#20214;",
                }));
                const __VLS_277 = __VLS_276({
                    label: "&#24050;&#37197;&#20107;&#20214;",
                }, ...__VLS_functionalComponentArgsRest(__VLS_276));
                __VLS_278.slots.default;
                const __VLS_279 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.selectedPlatformEventTriggerCode),
                    clearable: true,
                    placeholder: "&#36873;&#25321;&#24050;&#26377;&#24179;&#21488;&#20107;&#20214;",
                    ...{ style: {} },
                }));
                const __VLS_281 = __VLS_280({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.selectedPlatformEventTriggerCode),
                    clearable: true,
                    placeholder: "&#36873;&#25321;&#24050;&#26377;&#24179;&#21488;&#20107;&#20214;",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_280));
                let __VLS_283;
                let __VLS_284;
                let __VLS_285;
                const __VLS_286 = {
                    onChange: (__VLS_ctx.syncSelectedPlatformEventTrigger)
                };
                __VLS_282.slots.default;
                for (const [trigger] of __VLS_getVForSourceType((__VLS_ctx.platformEventTriggers))) {
                    const __VLS_287 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
                        key: (trigger.trigger_code),
                        label: (trigger.trigger_name),
                        value: (trigger.trigger_code),
                    }));
                    const __VLS_289 = __VLS_288({
                        key: (trigger.trigger_code),
                        label: (trigger.trigger_name),
                        value: (trigger.trigger_code),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_288));
                }
                var __VLS_282;
                var __VLS_278;
            }
            const __VLS_291 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
                label: "&#20107;&#20214;&#20998;&#31867;",
            }));
            const __VLS_293 = __VLS_292({
                label: "&#20107;&#20214;&#20998;&#31867;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_292));
            __VLS_294.slots.default;
            const __VLS_295 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventCategory),
                clearable: true,
                placeholder: "&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;",
                ...{ style: {} },
            }));
            const __VLS_297 = __VLS_296({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventCategory),
                clearable: true,
                placeholder: "&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_296));
            let __VLS_299;
            let __VLS_300;
            let __VLS_301;
            const __VLS_302 = {
                onChange: (__VLS_ctx.changePlatformEventCategory)
            };
            __VLS_298.slots.default;
            for (const [category] of __VLS_getVForSourceType((__VLS_ctx.platformEventCategories))) {
                const __VLS_303 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
                    key: (category.category),
                    label: (category.category_name),
                    value: (category.category),
                }));
                const __VLS_305 = __VLS_304({
                    key: (category.category),
                    label: (category.category_name),
                    value: (category.category),
                }, ...__VLS_functionalComponentArgsRest(__VLS_304));
            }
            var __VLS_298;
            var __VLS_294;
            const __VLS_307 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
                label: "&#20107;&#20214;&#26469;&#28304;",
            }));
            const __VLS_309 = __VLS_308({
                label: "&#20107;&#20214;&#26469;&#28304;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_308));
            __VLS_310.slots.default;
            const __VLS_311 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_312 = __VLS_asFunctionalComponent(__VLS_311, new __VLS_311({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventSource),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventCategory),
                placeholder: "&#20808;&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;",
                ...{ style: {} },
            }));
            const __VLS_313 = __VLS_312({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventSource),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventCategory),
                placeholder: "&#20808;&#36873;&#25321;&#20107;&#20214;&#20998;&#31867;",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_312));
            let __VLS_315;
            let __VLS_316;
            let __VLS_317;
            const __VLS_318 = {
                onChange: (__VLS_ctx.changePlatformEventSource)
            };
            __VLS_314.slots.default;
            for (const [source] of __VLS_getVForSourceType((__VLS_ctx.platformEventSources))) {
                const __VLS_319 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_320 = __VLS_asFunctionalComponent(__VLS_319, new __VLS_319({
                    key: (source.source),
                    label: (source.source_name),
                    value: (source.source),
                }));
                const __VLS_321 = __VLS_320({
                    key: (source.source),
                    label: (source.source_name),
                    value: (source.source),
                }, ...__VLS_functionalComponentArgsRest(__VLS_320));
            }
            var __VLS_314;
            var __VLS_310;
            const __VLS_323 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
                label: "&#20855;&#20307;&#20107;&#20214;",
            }));
            const __VLS_325 = __VLS_324({
                label: "&#20855;&#20307;&#20107;&#20214;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_324));
            __VLS_326.slots.default;
            const __VLS_327 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_328 = __VLS_asFunctionalComponent(__VLS_327, new __VLS_327({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventType),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventSource),
                placeholder: "&#20808;&#36873;&#25321;&#20107;&#20214;&#26469;&#28304;",
                ...{ style: {} },
            }));
            const __VLS_329 = __VLS_328({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.platformEventType),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventSource),
                placeholder: "&#20808;&#36873;&#25321;&#20107;&#20214;&#26469;&#28304;",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_328));
            let __VLS_331;
            let __VLS_332;
            let __VLS_333;
            const __VLS_334 = {
                onChange: (__VLS_ctx.changePlatformEventType)
            };
            __VLS_330.slots.default;
            for (const [event] of __VLS_getVForSourceType((__VLS_ctx.platformEventOptions))) {
                const __VLS_335 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_336 = __VLS_asFunctionalComponent(__VLS_335, new __VLS_335({
                    key: (event.event_type),
                    label: (event.event_name),
                    value: (event.event_type),
                }));
                const __VLS_337 = __VLS_336({
                    key: (event.event_type),
                    label: (event.event_name),
                    value: (event.event_type),
                }, ...__VLS_functionalComponentArgsRest(__VLS_336));
            }
            var __VLS_330;
            var __VLS_326;
            const __VLS_339 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
                label: "&#31579;&#36873;&#23383;&#27573;",
            }));
            const __VLS_341 = __VLS_340({
                label: "&#31579;&#36873;&#23383;&#27573;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_340));
            __VLS_342.slots.default;
            const __VLS_343 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_344 = __VLS_asFunctionalComponent(__VLS_343, new __VLS_343({
                modelValue: (__VLS_ctx.platformEventFilterField),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventType),
                placeholder: "&#19981;&#31579;&#36873;&#21017;&#30041;&#31354;",
                ...{ style: {} },
            }));
            const __VLS_345 = __VLS_344({
                modelValue: (__VLS_ctx.platformEventFilterField),
                clearable: true,
                disabled: (!__VLS_ctx.platformEventType),
                placeholder: "&#19981;&#31579;&#36873;&#21017;&#30041;&#31354;",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_344));
            __VLS_346.slots.default;
            for (const [field] of __VLS_getVForSourceType((__VLS_ctx.platformEventFilterFields))) {
                const __VLS_347 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_348 = __VLS_asFunctionalComponent(__VLS_347, new __VLS_347({
                    key: (field),
                    label: (field),
                    value: (field),
                }));
                const __VLS_349 = __VLS_348({
                    key: (field),
                    label: (field),
                    value: (field),
                }, ...__VLS_functionalComponentArgsRest(__VLS_348));
            }
            var __VLS_346;
            var __VLS_342;
            const __VLS_351 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_352 = __VLS_asFunctionalComponent(__VLS_351, new __VLS_351({
                label: "&#23383;&#27573;&#20540;",
            }));
            const __VLS_353 = __VLS_352({
                label: "&#23383;&#27573;&#20540;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_352));
            __VLS_354.slots.default;
            const __VLS_355 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_356 = __VLS_asFunctionalComponent(__VLS_355, new __VLS_355({
                modelValue: (__VLS_ctx.platformEventFilterValue),
                modelModifiers: { trim: true, },
                disabled: (!__VLS_ctx.platformEventFilterField),
                placeholder: "&#36755;&#20837;&#31579;&#36873;&#20540;",
            }));
            const __VLS_357 = __VLS_356({
                modelValue: (__VLS_ctx.platformEventFilterValue),
                modelModifiers: { trim: true, },
                disabled: (!__VLS_ctx.platformEventFilterField),
                placeholder: "&#36755;&#20837;&#31579;&#36873;&#20540;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_356));
            var __VLS_354;
            const __VLS_359 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_360 = __VLS_asFunctionalComponent(__VLS_359, new __VLS_359({
                label: "&#21551;&#29992;&#29366;&#24577;",
            }));
            const __VLS_361 = __VLS_360({
                label: "&#21551;&#29992;&#29366;&#24577;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_360));
            __VLS_362.slots.default;
            const __VLS_363 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_364 = __VLS_asFunctionalComponent(__VLS_363, new __VLS_363({
                modelValue: (__VLS_ctx.platformEventEnabled),
                activeText: "&#21551;&#29992;",
                inactiveText: "&#20572;&#29992;",
            }));
            const __VLS_365 = __VLS_364({
                modelValue: (__VLS_ctx.platformEventEnabled),
                activeText: "&#21551;&#29992;",
                inactiveText: "&#20572;&#29992;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_364));
            var __VLS_362;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "start-trigger-hint" },
            });
            const __VLS_367 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_368 = __VLS_asFunctionalComponent(__VLS_367, new __VLS_367({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
                disabled: (!__VLS_ctx.currentTpl || !__VLS_ctx.selectedPlatformEventDefinition),
                loading: (__VLS_ctx.platformEventSaving),
            }));
            const __VLS_369 = __VLS_368({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
                disabled: (!__VLS_ctx.currentTpl || !__VLS_ctx.selectedPlatformEventDefinition),
                loading: (__VLS_ctx.platformEventSaving),
            }, ...__VLS_functionalComponentArgsRest(__VLS_368));
            let __VLS_371;
            let __VLS_372;
            let __VLS_373;
            const __VLS_374 = {
                onClick: (__VLS_ctx.savePlatformEventTrigger)
            };
            __VLS_370.slots.default;
            (__VLS_ctx.selectedPlatformEventTrigger ? '&#20445;&#23384;&#24179;&#21488;&#20107;&#20214;' : '&#21019;&#24314;&#24179;&#21488;&#20107;&#20214;');
            var __VLS_370;
        }
        else {
            if (__VLS_ctx.startTriggerNeedsResource) {
                const __VLS_375 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_376 = __VLS_asFunctionalComponent(__VLS_375, new __VLS_375({
                    label: "&#26469;&#28304;&#31995;&#32479;",
                }));
                const __VLS_377 = __VLS_376({
                    label: "&#26469;&#28304;&#31995;&#32479;",
                }, ...__VLS_functionalComponentArgsRest(__VLS_376));
                __VLS_378.slots.default;
                const __VLS_379 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.startTriggerSystemId),
                    clearable: true,
                    filterable: true,
                    placeholder: "&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;",
                    ...{ style: {} },
                }));
                const __VLS_381 = __VLS_380({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.startTriggerSystemId),
                    clearable: true,
                    filterable: true,
                    placeholder: "&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_380));
                let __VLS_383;
                let __VLS_384;
                let __VLS_385;
                const __VLS_386 = {
                    onChange: (__VLS_ctx.changeStartTriggerSystem)
                };
                __VLS_382.slots.default;
                for (const [system] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
                    const __VLS_387 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_388 = __VLS_asFunctionalComponent(__VLS_387, new __VLS_387({
                        key: (system.id),
                        label: (system.system_name),
                        value: (system.id),
                    }));
                    const __VLS_389 = __VLS_388({
                        key: (system.id),
                        label: (system.system_name),
                        value: (system.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_388));
                }
                var __VLS_382;
                var __VLS_378;
            }
            if (__VLS_ctx.startTriggerNeedsResource) {
                const __VLS_391 = {}.ElFormItem;
                /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
                // @ts-ignore
                const __VLS_392 = __VLS_asFunctionalComponent(__VLS_391, new __VLS_391({
                    label: "&#26469;&#28304;&#36164;&#28304;",
                }));
                const __VLS_393 = __VLS_392({
                    label: "&#26469;&#28304;&#36164;&#28304;",
                }, ...__VLS_functionalComponentArgsRest(__VLS_392));
                __VLS_394.slots.default;
                const __VLS_395 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_396 = __VLS_asFunctionalComponent(__VLS_395, new __VLS_395({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.startTriggerResourceId),
                    clearable: true,
                    filterable: true,
                    disabled: (!__VLS_ctx.startTriggerSystemId),
                    placeholder: "&#20808;&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;",
                    ...{ style: {} },
                }));
                const __VLS_397 = __VLS_396({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.startTriggerResourceId),
                    clearable: true,
                    filterable: true,
                    disabled: (!__VLS_ctx.startTriggerSystemId),
                    placeholder: "&#20808;&#36873;&#25321;&#26469;&#28304;&#31995;&#32479;",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_396));
                let __VLS_399;
                let __VLS_400;
                let __VLS_401;
                const __VLS_402 = {
                    onChange: (__VLS_ctx.changeStartTriggerResource)
                };
                __VLS_398.slots.default;
                for (const [resource] of __VLS_getVForSourceType((__VLS_ctx.startTriggerResources))) {
                    const __VLS_403 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_404 = __VLS_asFunctionalComponent(__VLS_403, new __VLS_403({
                        key: (resource.id),
                        label: (resource.resource_name),
                        value: (resource.id),
                    }));
                    const __VLS_405 = __VLS_404({
                        key: (resource.id),
                        label: (resource.resource_name),
                        value: (resource.id),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_404));
                }
                var __VLS_398;
                var __VLS_394;
            }
            const __VLS_407 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_408 = __VLS_asFunctionalComponent(__VLS_407, new __VLS_407({
                label: "&#24050;&#32465;&#35302;&#21457;&#22120;",
            }));
            const __VLS_409 = __VLS_408({
                label: "&#24050;&#32465;&#35302;&#21457;&#22120;",
            }, ...__VLS_functionalComponentArgsRest(__VLS_408));
            __VLS_410.slots.default;
            const __VLS_411 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_412 = __VLS_asFunctionalComponent(__VLS_411, new __VLS_411({
                modelValue: (__VLS_ctx.selectedStartTriggerCode),
                clearable: true,
                filterable: true,
                loading: (__VLS_ctx.triggerLoading),
                placeholder: "&#25353;&#19978;&#36848;&#26465;&#20214;&#36873;&#25321;&#24050;&#32465;&#35302;&#21457;&#22120;",
                ...{ style: {} },
            }));
            const __VLS_413 = __VLS_412({
                modelValue: (__VLS_ctx.selectedStartTriggerCode),
                clearable: true,
                filterable: true,
                loading: (__VLS_ctx.triggerLoading),
                placeholder: "&#25353;&#19978;&#36848;&#26465;&#20214;&#36873;&#25321;&#24050;&#32465;&#35302;&#21457;&#22120;",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_412));
            __VLS_414.slots.default;
            for (const [trigger] of __VLS_getVForSourceType((__VLS_ctx.filteredStartTriggers))) {
                const __VLS_415 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_416 = __VLS_asFunctionalComponent(__VLS_415, new __VLS_415({
                    key: (trigger.trigger_code),
                    label: (trigger.trigger_name),
                    value: (trigger.trigger_code),
                }));
                const __VLS_417 = __VLS_416({
                    key: (trigger.trigger_code),
                    label: (trigger.trigger_name),
                    value: (trigger.trigger_code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_416));
                __VLS_418.slots.default;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (trigger.trigger_name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
                (trigger.is_active ? '已启用' : '已停用');
                var __VLS_418;
            }
            var __VLS_414;
            var __VLS_410;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "start-trigger-hint" },
            });
            const __VLS_419 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_420 = __VLS_asFunctionalComponent(__VLS_419, new __VLS_419({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
            }));
            const __VLS_421 = __VLS_420({
                ...{ 'onClick': {} },
                type: "primary",
                plain: true,
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_420));
            let __VLS_423;
            let __VLS_424;
            let __VLS_425;
            const __VLS_426 = {
                onClick: (__VLS_ctx.openStartTriggerConfig)
            };
            __VLS_422.slots.default;
            var __VLS_422;
        }
    }
    else if (__VLS_ctx.selectedNode.type === 'CONNECTOR') {
        const __VLS_427 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_428 = __VLS_asFunctionalComponent(__VLS_427, new __VLS_427({
            label: "系统",
        }));
        const __VLS_429 = __VLS_428({
            label: "系统",
        }, ...__VLS_functionalComponentArgsRest(__VLS_428));
        __VLS_430.slots.default;
        const __VLS_431 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_432 = __VLS_asFunctionalComponent(__VLS_431, new __VLS_431({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }));
        const __VLS_433 = __VLS_432({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_432));
        let __VLS_435;
        let __VLS_436;
        let __VLS_437;
        const __VLS_438 = {
            onChange: ((v) => { if (__VLS_ctx.selectedNode) {
                const cfg = __VLS_ctx.selectedNode.config || {};
                cfg.system_id = v;
                cfg.system_code = __VLS_ctx.systems.find(x => x.id === v)?.system_code || '';
                __VLS_ctx.selectedNode.config = cfg;
            } })
        };
        __VLS_434.slots.default;
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
            const __VLS_439 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_440 = __VLS_asFunctionalComponent(__VLS_439, new __VLS_439({
                key: (s.id),
                label: (`${s.system_code} - ${s.system_name}`),
                value: (s.id),
            }));
            const __VLS_441 = __VLS_440({
                key: (s.id),
                label: (`${s.system_code} - ${s.system_name}`),
                value: (s.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_440));
        }
        var __VLS_434;
        var __VLS_430;
        const __VLS_443 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_444 = __VLS_asFunctionalComponent(__VLS_443, new __VLS_443({
            label: "资源",
        }));
        const __VLS_445 = __VLS_444({
            label: "资源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_444));
        __VLS_446.slots.default;
        const __VLS_447 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_448 = __VLS_asFunctionalComponent(__VLS_447, new __VLS_447({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.resource_id),
            clearable: true,
            placeholder: "选择资源",
            ...{ style: {} },
            loading: (__VLS_ctx.resourcesLoading),
        }));
        const __VLS_449 = __VLS_448({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.resource_id),
            clearable: true,
            placeholder: "选择资源",
            ...{ style: {} },
            loading: (__VLS_ctx.resourcesLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_448));
        let __VLS_451;
        let __VLS_452;
        let __VLS_453;
        const __VLS_454 = {
            onChange: (__VLS_ctx.selectConnectorResource)
        };
        __VLS_450.slots.default;
        for (const [r] of __VLS_getVForSourceType((__VLS_ctx.resourcesOf(__VLS_ctx.selectedNode.config?.system_id)))) {
            const __VLS_455 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_456 = __VLS_asFunctionalComponent(__VLS_455, new __VLS_455({
                key: (r.id),
                label: (`${r.resource_code} - ${r.resource_name}`),
                value: (r.id),
            }));
            const __VLS_457 = __VLS_456({
                key: (r.id),
                label: (`${r.resource_code} - ${r.resource_name}`),
                value: (r.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_456));
        }
        var __VLS_450;
        var __VLS_446;
        if (__VLS_ctx.selectedNode.config?.adapter_code === 'FEISHU_BITABLE_PULL_ADAPTER') {
            const __VLS_459 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_460 = __VLS_asFunctionalComponent(__VLS_459, new __VLS_459({
                label: "数据对象",
            }));
            const __VLS_461 = __VLS_460({
                label: "数据对象",
            }, ...__VLS_functionalComponentArgsRest(__VLS_460));
            __VLS_462.slots.default;
            const __VLS_463 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_464 = __VLS_asFunctionalComponent(__VLS_463, new __VLS_463({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.selectedNode.config.bitable_table_id),
                clearable: true,
                filterable: true,
                placeholder: "选择具体多维表格",
                ...{ style: {} },
            }));
            const __VLS_465 = __VLS_464({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.selectedNode.config.bitable_table_id),
                clearable: true,
                filterable: true,
                placeholder: "选择具体多维表格",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_464));
            let __VLS_467;
            let __VLS_468;
            let __VLS_469;
            const __VLS_470 = {
                onVisibleChange: ((v) => v && __VLS_ctx.selectedNode && __VLS_ctx.loadBitableTablesForNode(Number(__VLS_ctx.selectedNode.config?.resource_id) || null))
            };
            __VLS_466.slots.default;
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.bitableTableOptions))) {
                const __VLS_471 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_472 = __VLS_asFunctionalComponent(__VLS_471, new __VLS_471({
                    key: (item.id),
                    label: (`${item.object_code} - ${item.object_name}`),
                    value: (item.id),
                }));
                const __VLS_473 = __VLS_472({
                    key: (item.id),
                    label: (`${item.object_code} - ${item.object_name}`),
                    value: (item.id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_472));
            }
            var __VLS_466;
            var __VLS_462;
        }
        if (__VLS_ctx.selectedNode.config?.adapter_code === 'BEISEN_REPORT_PULL_ADAPTER') {
            const __VLS_475 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_476 = __VLS_asFunctionalComponent(__VLS_475, new __VLS_475({
                label: "北森报表",
            }));
            const __VLS_477 = __VLS_476({
                label: "北森报表",
            }, ...__VLS_functionalComponentArgsRest(__VLS_476));
            __VLS_478.slots.default;
            const __VLS_479 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_480 = __VLS_asFunctionalComponent(__VLS_479, new __VLS_479({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.selectedNode.config.data_object_id),
                clearable: true,
                filterable: true,
                placeholder: "选择待入职人员报表",
                ...{ style: {} },
            }));
            const __VLS_481 = __VLS_480({
                ...{ 'onVisibleChange': {} },
                modelValue: (__VLS_ctx.selectedNode.config.data_object_id),
                clearable: true,
                filterable: true,
                placeholder: "选择待入职人员报表",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_480));
            let __VLS_483;
            let __VLS_484;
            let __VLS_485;
            const __VLS_486 = {
                onVisibleChange: ((v) => v && __VLS_ctx.selectedNode && __VLS_ctx.loadResourceDataObjects(Number(__VLS_ctx.selectedNode.config?.resource_id) || null))
            };
            __VLS_482.slots.default;
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.resourceDataObjects))) {
                const __VLS_487 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_488 = __VLS_asFunctionalComponent(__VLS_487, new __VLS_487({
                    key: (item.id),
                    label: (`${item.object_code} - ${item.object_name}`),
                    value: (item.id),
                }));
                const __VLS_489 = __VLS_488({
                    key: (item.id),
                    label: (`${item.object_code} - ${item.object_name}`),
                    value: (item.id),
                }, ...__VLS_functionalComponentArgsRest(__VLS_488));
            }
            var __VLS_482;
            var __VLS_478;
        }
        const __VLS_491 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_492 = __VLS_asFunctionalComponent(__VLS_491, new __VLS_491({
            label: "????",
        }));
        const __VLS_493 = __VLS_492({
            label: "????",
        }, ...__VLS_functionalComponentArgsRest(__VLS_492));
        __VLS_494.slots.default;
        const __VLS_495 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_496 = __VLS_asFunctionalComponent(__VLS_495, new __VLS_495({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.connectorParamsText),
            type: "textarea",
            rows: (3),
            placeholder: "{&quot;key&quot;: &quot;value&quot;}",
        }));
        const __VLS_497 = __VLS_496({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.connectorParamsText),
            type: "textarea",
            rows: (3),
            placeholder: "{&quot;key&quot;: &quot;value&quot;}",
        }, ...__VLS_functionalComponentArgsRest(__VLS_496));
        let __VLS_499;
        let __VLS_500;
        let __VLS_501;
        const __VLS_502 = {
            'onUpdate:modelValue': (__VLS_ctx.updateConnectorParams)
        };
        var __VLS_498;
        var __VLS_494;
    }
    else if (__VLS_ctx.selectedNode.type === 'CAPABILITY') {
        const __VLS_503 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_504 = __VLS_asFunctionalComponent(__VLS_503, new __VLS_503({
            label: "系统",
        }));
        const __VLS_505 = __VLS_504({
            label: "系统",
        }, ...__VLS_functionalComponentArgsRest(__VLS_504));
        __VLS_506.slots.default;
        const __VLS_507 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_508 = __VLS_asFunctionalComponent(__VLS_507, new __VLS_507({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }));
        const __VLS_509 = __VLS_508({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_508));
        let __VLS_511;
        let __VLS_512;
        let __VLS_513;
        const __VLS_514 = {
            onChange: (__VLS_ctx.selectCapabilitySystem)
        };
        __VLS_510.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilitySystems))) {
            const __VLS_515 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_516 = __VLS_asFunctionalComponent(__VLS_515, new __VLS_515({
                key: (item.system_id),
                label: (item.system_name),
                value: (item.system_id),
            }));
            const __VLS_517 = __VLS_516({
                key: (item.system_id),
                label: (item.system_name),
                value: (item.system_id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_516));
        }
        var __VLS_510;
        var __VLS_506;
        const __VLS_519 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_520 = __VLS_asFunctionalComponent(__VLS_519, new __VLS_519({
            label: "对象",
        }));
        const __VLS_521 = __VLS_520({
            label: "对象",
        }, ...__VLS_functionalComponentArgsRest(__VLS_520));
        __VLS_522.slots.default;
        const __VLS_523 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_524 = __VLS_asFunctionalComponent(__VLS_523, new __VLS_523({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.object_code),
            clearable: true,
            placeholder: "选择业务对象",
            ...{ style: {} },
        }));
        const __VLS_525 = __VLS_524({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.object_code),
            clearable: true,
            placeholder: "选择业务对象",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_524));
        let __VLS_527;
        let __VLS_528;
        let __VLS_529;
        const __VLS_530 = {
            onChange: (__VLS_ctx.selectCapabilityObject)
        };
        __VLS_526.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilityObjects))) {
            const __VLS_531 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_532 = __VLS_asFunctionalComponent(__VLS_531, new __VLS_531({
                key: (item),
                label: (item),
                value: (item),
            }));
            const __VLS_533 = __VLS_532({
                key: (item),
                label: (item),
                value: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_532));
        }
        var __VLS_526;
        var __VLS_522;
        const __VLS_535 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_536 = __VLS_asFunctionalComponent(__VLS_535, new __VLS_535({
            label: "操作",
        }));
        const __VLS_537 = __VLS_536({
            label: "操作",
        }, ...__VLS_functionalComponentArgsRest(__VLS_536));
        __VLS_538.slots.default;
        const __VLS_539 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_540 = __VLS_asFunctionalComponent(__VLS_539, new __VLS_539({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.capability_id),
            clearable: true,
            placeholder: "选择业务能力",
            ...{ style: {} },
        }));
        const __VLS_541 = __VLS_540({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.capability_id),
            clearable: true,
            placeholder: "选择业务能力",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_540));
        let __VLS_543;
        let __VLS_544;
        let __VLS_545;
        const __VLS_546 = {
            onChange: (__VLS_ctx.selectCapabilityOperation)
        };
        __VLS_542.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilityOperations))) {
            const __VLS_547 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_548 = __VLS_asFunctionalComponent(__VLS_547, new __VLS_547({
                key: (item.capability_id),
                label: (__VLS_ctx.capabilityOptionLabel(item)),
                value: (item.capability_id),
            }));
            const __VLS_549 = __VLS_548({
                key: (item.capability_id),
                label: (__VLS_ctx.capabilityOptionLabel(item)),
                value: (item.capability_id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_548));
        }
        var __VLS_542;
        var __VLS_538;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
        });
    }
    else if (__VLS_ctx.selectedNode.type === 'CAPABILITY_LOOKUP') {
        const __VLS_551 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_552 = __VLS_asFunctionalComponent(__VLS_551, new __VLS_551({
            label: "业务系统",
        }));
        const __VLS_553 = __VLS_552({
            label: "业务系统",
        }, ...__VLS_functionalComponentArgsRest(__VLS_552));
        __VLS_554.slots.default;
        const __VLS_555 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_556 = __VLS_asFunctionalComponent(__VLS_555, new __VLS_555({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择飞书招聘系统",
            ...{ style: {} },
        }));
        const __VLS_557 = __VLS_556({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择飞书招聘系统",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_556));
        let __VLS_559;
        let __VLS_560;
        let __VLS_561;
        const __VLS_562 = {
            onChange: (__VLS_ctx.selectCapabilitySystem)
        };
        __VLS_558.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilitySystems))) {
            const __VLS_563 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_564 = __VLS_asFunctionalComponent(__VLS_563, new __VLS_563({
                key: (item.system_id),
                label: (item.system_name),
                value: (item.system_id),
            }));
            const __VLS_565 = __VLS_564({
                key: (item.system_id),
                label: (item.system_name),
                value: (item.system_id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_564));
        }
        var __VLS_558;
        var __VLS_554;
        const __VLS_567 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_568 = __VLS_asFunctionalComponent(__VLS_567, new __VLS_567({
            label: "业务对象",
        }));
        const __VLS_569 = __VLS_568({
            label: "业务对象",
        }, ...__VLS_functionalComponentArgsRest(__VLS_568));
        __VLS_570.slots.default;
        const __VLS_571 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_572 = __VLS_asFunctionalComponent(__VLS_571, new __VLS_571({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.object_code),
            clearable: true,
            placeholder: "选择 Offer",
            ...{ style: {} },
        }));
        const __VLS_573 = __VLS_572({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.object_code),
            clearable: true,
            placeholder: "选择 Offer",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_572));
        let __VLS_575;
        let __VLS_576;
        let __VLS_577;
        const __VLS_578 = {
            onChange: (__VLS_ctx.selectCapabilityObject)
        };
        __VLS_574.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilityObjects))) {
            const __VLS_579 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_580 = __VLS_asFunctionalComponent(__VLS_579, new __VLS_579({
                key: (item),
                label: (item),
                value: (item),
            }));
            const __VLS_581 = __VLS_580({
                key: (item),
                label: (item),
                value: (item),
            }, ...__VLS_functionalComponentArgsRest(__VLS_580));
        }
        var __VLS_574;
        var __VLS_570;
        const __VLS_583 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_584 = __VLS_asFunctionalComponent(__VLS_583, new __VLS_583({
            label: "Offer 能力",
        }));
        const __VLS_585 = __VLS_584({
            label: "Offer 能力",
        }, ...__VLS_functionalComponentArgsRest(__VLS_584));
        __VLS_586.slots.default;
        const __VLS_587 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_588 = __VLS_asFunctionalComponent(__VLS_587, new __VLS_587({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.capability_id),
            clearable: true,
            placeholder: "选择 Offer 查询能力",
            ...{ style: {} },
        }));
        const __VLS_589 = __VLS_588({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.capability_id),
            clearable: true,
            placeholder: "选择 Offer 查询能力",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_588));
        let __VLS_591;
        let __VLS_592;
        let __VLS_593;
        const __VLS_594 = {
            onChange: (__VLS_ctx.selectCapabilityOperation)
        };
        __VLS_590.slots.default;
        for (const [item] of __VLS_getVForSourceType((__VLS_ctx.capabilityOperations))) {
            const __VLS_595 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_596 = __VLS_asFunctionalComponent(__VLS_595, new __VLS_595({
                key: (item.capability_id),
                label: (__VLS_ctx.capabilityOptionLabel(item)),
                value: (item.capability_id),
            }));
            const __VLS_597 = __VLS_596({
                key: (item.capability_id),
                label: (__VLS_ctx.capabilityOptionLabel(item)),
                value: (item.capability_id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_596));
        }
        var __VLS_590;
        var __VLS_586;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
        });
        const __VLS_599 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_600 = __VLS_asFunctionalComponent(__VLS_599, new __VLS_599({
            label: "投递记录 ID",
        }));
        const __VLS_601 = __VLS_600({
            label: "投递记录 ID",
        }, ...__VLS_functionalComponentArgsRest(__VLS_600));
        __VLS_602.slots.default;
        const __VLS_603 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_604 = __VLS_asFunctionalComponent(__VLS_603, new __VLS_603({
            modelValue: (__VLS_ctx.selectedNode.config.lookup_field),
            allowCreate: true,
            filterable: true,
            placeholder: "选择北森来源字段",
            ...{ style: {} },
        }));
        const __VLS_605 = __VLS_604({
            modelValue: (__VLS_ctx.selectedNode.config.lookup_field),
            allowCreate: true,
            filterable: true,
            placeholder: "选择北森来源字段",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_604));
        __VLS_606.slots.default;
        const __VLS_607 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_608 = __VLS_asFunctionalComponent(__VLS_607, new __VLS_607({
            label: "投递记录 ID (application_id)",
            value: "application_id",
        }));
        const __VLS_609 = __VLS_608({
            label: "投递记录 ID (application_id)",
            value: "application_id",
        }, ...__VLS_functionalComponentArgsRest(__VLS_608));
        var __VLS_606;
        var __VLS_602;
        const __VLS_611 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_612 = __VLS_asFunctionalComponent(__VLS_611, new __VLS_611({
            label: "失败策略",
        }));
        const __VLS_613 = __VLS_612({
            label: "失败策略",
        }, ...__VLS_functionalComponentArgsRest(__VLS_612));
        __VLS_614.slots.default;
        const __VLS_615 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_616 = __VLS_asFunctionalComponent(__VLS_615, new __VLS_615({
            modelValue: (__VLS_ctx.selectedNode.config.failure_policy),
            ...{ style: {} },
        }));
        const __VLS_617 = __VLS_616({
            modelValue: (__VLS_ctx.selectedNode.config.failure_policy),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_616));
        __VLS_618.slots.default;
        const __VLS_619 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_620 = __VLS_asFunctionalComponent(__VLS_619, new __VLS_619({
            label: "单人失败继续",
            value: "CONTINUE",
        }));
        const __VLS_621 = __VLS_620({
            label: "单人失败继续",
            value: "CONTINUE",
        }, ...__VLS_functionalComponentArgsRest(__VLS_620));
        const __VLS_623 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_624 = __VLS_asFunctionalComponent(__VLS_623, new __VLS_623({
            label: "遇到失败停止",
            value: "STOP",
        }));
        const __VLS_625 = __VLS_624({
            label: "遇到失败停止",
            value: "STOP",
        }, ...__VLS_functionalComponentArgsRest(__VLS_624));
        var __VLS_618;
        var __VLS_614;
    }
    else if (__VLS_ctx.selectedNode.type === 'RECORD_MERGE') {
        const __VLS_627 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_628 = __VLS_asFunctionalComponent(__VLS_627, new __VLS_627({
            label: "Offer 字段映射",
        }));
        const __VLS_629 = __VLS_628({
            label: "Offer 字段映射",
        }, ...__VLS_functionalComponentArgsRest(__VLS_628));
        __VLS_630.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "field-mappings" },
        });
        for (const [mapping, index] of __VLS_getVForSourceType((__VLS_ctx.offerMappings))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (index),
                ...{ class: "mapping-row" },
            });
            const __VLS_631 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_632 = __VLS_asFunctionalComponent(__VLS_631, new __VLS_631({
                modelValue: (mapping.source),
                filterable: true,
                placeholder: "选择 Offer 字段",
                ...{ style: {} },
            }));
            const __VLS_633 = __VLS_632({
                modelValue: (mapping.source),
                filterable: true,
                placeholder: "选择 Offer 字段",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_632));
            __VLS_634.slots.default;
            for (const [field] of __VLS_getVForSourceType((__VLS_ctx.offerFieldOptions))) {
                const __VLS_635 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_636 = __VLS_asFunctionalComponent(__VLS_635, new __VLS_635({
                    key: (field.code),
                    label: (field.label),
                    value: (field.code),
                }));
                const __VLS_637 = __VLS_636({
                    key: (field.code),
                    label: (field.label),
                    value: (field.code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_636));
            }
            var __VLS_634;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "mapping-arrow" },
            });
            const __VLS_639 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_640 = __VLS_asFunctionalComponent(__VLS_639, new __VLS_639({
                modelValue: (mapping.target),
                filterable: true,
                placeholder: "选择目标资产字段",
                ...{ style: {} },
            }));
            const __VLS_641 = __VLS_640({
                modelValue: (mapping.target),
                filterable: true,
                placeholder: "选择目标资产字段",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_640));
            __VLS_642.slots.default;
            for (const [column] of __VLS_getVForSourceType((__VLS_ctx.targetAssetColumns))) {
                const __VLS_643 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_644 = __VLS_asFunctionalComponent(__VLS_643, new __VLS_643({
                    key: (column.column_code),
                    label: (column.column_label),
                    value: (column.column_code),
                }));
                const __VLS_645 = __VLS_644({
                    key: (column.column_code),
                    label: (column.column_label),
                    value: (column.column_code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_644));
            }
            var __VLS_642;
            const __VLS_647 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_648 = __VLS_asFunctionalComponent(__VLS_647, new __VLS_647({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                type: "danger",
            }));
            const __VLS_649 = __VLS_648({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_648));
            let __VLS_651;
            let __VLS_652;
            let __VLS_653;
            const __VLS_654 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.selectedNode))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'START_TRIGGER'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CONNECTOR'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY_LOOKUP'))
                        return;
                    if (!(__VLS_ctx.selectedNode.type === 'RECORD_MERGE'))
                        return;
                    __VLS_ctx.removeOfferMapping(index);
                }
            };
            __VLS_650.slots.default;
            const __VLS_655 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_656 = __VLS_asFunctionalComponent(__VLS_655, new __VLS_655({}));
            const __VLS_657 = __VLS_656({}, ...__VLS_functionalComponentArgsRest(__VLS_656));
            __VLS_658.slots.default;
            const __VLS_659 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_660 = __VLS_asFunctionalComponent(__VLS_659, new __VLS_659({}));
            const __VLS_661 = __VLS_660({}, ...__VLS_functionalComponentArgsRest(__VLS_660));
            var __VLS_658;
            var __VLS_650;
        }
        const __VLS_663 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_664 = __VLS_asFunctionalComponent(__VLS_663, new __VLS_663({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_665 = __VLS_664({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_664));
        let __VLS_667;
        let __VLS_668;
        let __VLS_669;
        const __VLS_670 = {
            onClick: (__VLS_ctx.addOfferMapping)
        };
        __VLS_666.slots.default;
        var __VLS_666;
        var __VLS_630;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "text-muted" },
        });
    }
    else if (__VLS_ctx.selectedNode.type === 'WAREHOUSE_ASSET_SINK') {
        /** @type {[typeof WarehouseAssetSinkConfig, ]} */ ;
        // @ts-ignore
        const __VLS_671 = __VLS_asFunctionalComponent(WarehouseAssetSinkConfig, new WarehouseAssetSinkConfig({
            modelValue: (__VLS_ctx.selectedNode.config),
        }));
        const __VLS_672 = __VLS_671({
            modelValue: (__VLS_ctx.selectedNode.config),
        }, ...__VLS_functionalComponentArgsRest(__VLS_671));
    }
    else if (__VLS_ctx.selectedNode.type === 'LOOP_RESOURCE' || __VLS_ctx.selectedNode.type === 'LOOP') {
        const __VLS_674 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_675 = __VLS_asFunctionalComponent(__VLS_674, new __VLS_674({
            label: "系统",
        }));
        const __VLS_676 = __VLS_675({
            label: "系统",
        }, ...__VLS_functionalComponentArgsRest(__VLS_675));
        __VLS_677.slots.default;
        const __VLS_678 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_679 = __VLS_asFunctionalComponent(__VLS_678, new __VLS_678({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }));
        const __VLS_680 = __VLS_679({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.system_id),
            clearable: true,
            placeholder: "选择系统",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_679));
        let __VLS_682;
        let __VLS_683;
        let __VLS_684;
        const __VLS_685 = {
            onChange: ((v) => { if (__VLS_ctx.selectedNode) {
                const cfg = __VLS_ctx.selectedNode.config || {};
                cfg.system_id = v;
                cfg.system_code = __VLS_ctx.systems.find(x => x.id === v)?.system_code || '';
                __VLS_ctx.selectedNode.config = cfg;
            } })
        };
        __VLS_681.slots.default;
        for (const [s] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
            const __VLS_686 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_687 = __VLS_asFunctionalComponent(__VLS_686, new __VLS_686({
                key: (s.id),
                label: (`${s.system_code} - ${s.system_name}`),
                value: (s.id),
            }));
            const __VLS_688 = __VLS_687({
                key: (s.id),
                label: (`${s.system_code} - ${s.system_name}`),
                value: (s.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_687));
        }
        var __VLS_681;
        var __VLS_677;
        const __VLS_690 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_691 = __VLS_asFunctionalComponent(__VLS_690, new __VLS_690({
            label: "资源",
        }));
        const __VLS_692 = __VLS_691({
            label: "资源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_691));
        __VLS_693.slots.default;
        const __VLS_694 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_695 = __VLS_asFunctionalComponent(__VLS_694, new __VLS_694({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.resource_id),
            clearable: true,
            placeholder: "选择资源",
            ...{ style: {} },
            loading: (__VLS_ctx.resourcesLoading),
        }));
        const __VLS_696 = __VLS_695({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config?.resource_id),
            clearable: true,
            placeholder: "选择资源",
            ...{ style: {} },
            loading: (__VLS_ctx.resourcesLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_695));
        let __VLS_698;
        let __VLS_699;
        let __VLS_700;
        const __VLS_701 = {
            onChange: ((v) => { if (__VLS_ctx.selectedNode) {
                const cfg = __VLS_ctx.selectedNode.config || {};
                cfg.resource_id = v;
                const r = __VLS_ctx.allResources.find(x => x.id === v);
                if (r) {
                    cfg.resource_name = r.resource_name;
                    cfg.resource_code = r.resource_code;
                    cfg.adapter_code = r.adapter_code || null;
                }
                __VLS_ctx.selectedNode.config = cfg;
            } })
        };
        __VLS_697.slots.default;
        for (const [r] of __VLS_getVForSourceType((__VLS_ctx.resourcesOf(__VLS_ctx.selectedNode.config?.system_id)))) {
            const __VLS_702 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_703 = __VLS_asFunctionalComponent(__VLS_702, new __VLS_702({
                key: (r.id),
                label: (`${r.resource_code} - ${r.resource_name}`),
                value: (r.id),
            }));
            const __VLS_704 = __VLS_703({
                key: (r.id),
                label: (`${r.resource_code} - ${r.resource_name}`),
                value: (r.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_703));
        }
        var __VLS_697;
        var __VLS_693;
        const __VLS_706 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_707 = __VLS_asFunctionalComponent(__VLS_706, new __VLS_706({
            label: "输入变量",
        }));
        const __VLS_708 = __VLS_707({
            label: "输入变量",
        }, ...__VLS_functionalComponentArgsRest(__VLS_707));
        __VLS_709.slots.default;
        const __VLS_710 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_711 = __VLS_asFunctionalComponent(__VLS_710, new __VLS_710({
            modelValue: (__VLS_ctx.selectedNode.config.loop_input),
            placeholder: "${previous_step.data}",
        }));
        const __VLS_712 = __VLS_711({
            modelValue: (__VLS_ctx.selectedNode.config.loop_input),
            placeholder: "${previous_step.data}",
        }, ...__VLS_functionalComponentArgsRest(__VLS_711));
        var __VLS_709;
        const __VLS_714 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_715 = __VLS_asFunctionalComponent(__VLS_714, new __VLS_714({
            label: "并发数",
        }));
        const __VLS_716 = __VLS_715({
            label: "并发数",
        }, ...__VLS_functionalComponentArgsRest(__VLS_715));
        __VLS_717.slots.default;
        const __VLS_718 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_719 = __VLS_asFunctionalComponent(__VLS_718, new __VLS_718({
            modelValue: (__VLS_ctx.selectedNode.config.max_concurrency),
            min: (1),
            max: (100),
        }));
        const __VLS_720 = __VLS_719({
            modelValue: (__VLS_ctx.selectedNode.config.max_concurrency),
            min: (1),
            max: (100),
        }, ...__VLS_functionalComponentArgsRest(__VLS_719));
        var __VLS_717;
    }
    else if (__VLS_ctx.selectedNode.type === 'APPROVAL') {
        const __VLS_722 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_723 = __VLS_asFunctionalComponent(__VLS_722, new __VLS_722({
            label: "Approval mode",
        }));
        const __VLS_724 = __VLS_723({
            label: "Approval mode",
        }, ...__VLS_functionalComponentArgsRest(__VLS_723));
        __VLS_725.slots.default;
        const __VLS_726 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_727 = __VLS_asFunctionalComponent(__VLS_726, new __VLS_726({
            modelValue: (__VLS_ctx.selectedNode.config.approval_mode),
            ...{ style: {} },
        }));
        const __VLS_728 = __VLS_727({
            modelValue: (__VLS_ctx.selectedNode.config.approval_mode),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_727));
        __VLS_729.slots.default;
        const __VLS_730 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_731 = __VLS_asFunctionalComponent(__VLS_730, new __VLS_730({
            label: "Single approver",
            value: "SINGLE",
        }));
        const __VLS_732 = __VLS_731({
            label: "Single approver",
            value: "SINGLE",
        }, ...__VLS_functionalComponentArgsRest(__VLS_731));
        const __VLS_734 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_735 = __VLS_asFunctionalComponent(__VLS_734, new __VLS_734({
            label: "Any approver",
            value: "ANY",
        }));
        const __VLS_736 = __VLS_735({
            label: "Any approver",
            value: "ANY",
        }, ...__VLS_functionalComponentArgsRest(__VLS_735));
        const __VLS_738 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_739 = __VLS_asFunctionalComponent(__VLS_738, new __VLS_738({
            label: "All approvers",
            value: "ALL",
        }));
        const __VLS_740 = __VLS_739({
            label: "All approvers",
            value: "ALL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_739));
        var __VLS_729;
        var __VLS_725;
        const __VLS_742 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_743 = __VLS_asFunctionalComponent(__VLS_742, new __VLS_742({
            label: "Approval reason",
        }));
        const __VLS_744 = __VLS_743({
            label: "Approval reason",
        }, ...__VLS_functionalComponentArgsRest(__VLS_743));
        __VLS_745.slots.default;
        const __VLS_746 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_747 = __VLS_asFunctionalComponent(__VLS_746, new __VLS_746({
            modelValue: (__VLS_ctx.selectedNode.config.reason),
            type: "textarea",
            rows: (2),
        }));
        const __VLS_748 = __VLS_747({
            modelValue: (__VLS_ctx.selectedNode.config.reason),
            type: "textarea",
            rows: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_747));
        var __VLS_745;
        const __VLS_750 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_751 = __VLS_asFunctionalComponent(__VLS_750, new __VLS_750({
            label: "Action summary",
        }));
        const __VLS_752 = __VLS_751({
            label: "Action summary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_751));
        __VLS_753.slots.default;
        const __VLS_754 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_755 = __VLS_asFunctionalComponent(__VLS_754, new __VLS_754({
            modelValue: (__VLS_ctx.selectedNode.config.action_summary),
            type: "textarea",
            rows: (2),
        }));
        const __VLS_756 = __VLS_755({
            modelValue: (__VLS_ctx.selectedNode.config.action_summary),
            type: "textarea",
            rows: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_755));
        var __VLS_753;
        const __VLS_758 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_759 = __VLS_asFunctionalComponent(__VLS_758, new __VLS_758({
            label: "Approvers JSON",
        }));
        const __VLS_760 = __VLS_759({
            label: "Approvers JSON",
        }, ...__VLS_functionalComponentArgsRest(__VLS_759));
        __VLS_761.slots.default;
        const __VLS_762 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_763 = __VLS_asFunctionalComponent(__VLS_762, new __VLS_762({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.approvalApproversText),
            type: "textarea",
            rows: (4),
            placeholder: "[{&quot;user_id&quot;: 1, &quot;user_name&quot;: &quot;Approver&quot;}]",
        }));
        const __VLS_764 = __VLS_763({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.approvalApproversText),
            type: "textarea",
            rows: (4),
            placeholder: "[{&quot;user_id&quot;: 1, &quot;user_name&quot;: &quot;Approver&quot;}]",
        }, ...__VLS_functionalComponentArgsRest(__VLS_763));
        let __VLS_766;
        let __VLS_767;
        let __VLS_768;
        const __VLS_769 = {
            'onUpdate:modelValue': (__VLS_ctx.updateApprovalApprovers)
        };
        var __VLS_765;
        var __VLS_761;
    }
    else if (__VLS_ctx.selectedNode.type === 'NOTIFY') {
        const __VLS_770 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_771 = __VLS_asFunctionalComponent(__VLS_770, new __VLS_770({
            label: "通知模板",
        }));
        const __VLS_772 = __VLS_771({
            label: "通知模板",
        }, ...__VLS_functionalComponentArgsRest(__VLS_771));
        __VLS_773.slots.default;
        const __VLS_774 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_775 = __VLS_asFunctionalComponent(__VLS_774, new __VLS_774({
            ...{ 'onVisibleChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config.template_id),
            filterable: true,
            placeholder: "选择通知模板",
            ...{ style: {} },
        }));
        const __VLS_776 = __VLS_775({
            ...{ 'onVisibleChange': {} },
            modelValue: (__VLS_ctx.selectedNode.config.template_id),
            filterable: true,
            placeholder: "选择通知模板",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_775));
        let __VLS_778;
        let __VLS_779;
        let __VLS_780;
        const __VLS_781 = {
            onVisibleChange: ((v) => v && __VLS_ctx.loadNotifyTemplates())
        };
        __VLS_777.slots.default;
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.notifyTemplates))) {
            const __VLS_782 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_783 = __VLS_asFunctionalComponent(__VLS_782, new __VLS_782({
                key: (t.id),
                label: (t.template_name),
                value: (t.id),
            }));
            const __VLS_784 = __VLS_783({
                key: (t.id),
                label: (t.template_name),
                value: (t.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_783));
        }
        var __VLS_777;
        var __VLS_773;
        const __VLS_786 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_787 = __VLS_asFunctionalComponent(__VLS_786, new __VLS_786({
            label: "接收人",
        }));
        const __VLS_788 = __VLS_787({
            label: "接收人",
        }, ...__VLS_functionalComponentArgsRest(__VLS_787));
        __VLS_789.slots.default;
        const __VLS_790 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_791 = __VLS_asFunctionalComponent(__VLS_790, new __VLS_790({
            modelValue: (__VLS_ctx.selectedNode.config.receivers),
            placeholder: "open_id 逗号分隔",
        }));
        const __VLS_792 = __VLS_791({
            modelValue: (__VLS_ctx.selectedNode.config.receivers),
            placeholder: "open_id 逗号分隔",
        }, ...__VLS_functionalComponentArgsRest(__VLS_791));
        var __VLS_789;
    }
    else if (__VLS_ctx.selectedNode.type === 'BRANCH') {
        const __VLS_794 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_795 = __VLS_asFunctionalComponent(__VLS_794, new __VLS_794({
            label: "匹配方式",
        }));
        const __VLS_796 = __VLS_795({
            label: "匹配方式",
        }, ...__VLS_functionalComponentArgsRest(__VLS_795));
        __VLS_797.slots.default;
        const __VLS_798 = {}.ElRadioGroup;
        /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
        // @ts-ignore
        const __VLS_799 = __VLS_asFunctionalComponent(__VLS_798, new __VLS_798({
            modelValue: (__VLS_ctx.branchConditionAst.mode),
        }));
        const __VLS_800 = __VLS_799({
            modelValue: (__VLS_ctx.branchConditionAst.mode),
        }, ...__VLS_functionalComponentArgsRest(__VLS_799));
        __VLS_801.slots.default;
        const __VLS_802 = {}.ElRadio;
        /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
        // @ts-ignore
        const __VLS_803 = __VLS_asFunctionalComponent(__VLS_802, new __VLS_802({
            value: "ALL",
        }));
        const __VLS_804 = __VLS_803({
            value: "ALL",
        }, ...__VLS_functionalComponentArgsRest(__VLS_803));
        __VLS_805.slots.default;
        var __VLS_805;
        const __VLS_806 = {}.ElRadio;
        /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
        // @ts-ignore
        const __VLS_807 = __VLS_asFunctionalComponent(__VLS_806, new __VLS_806({
            value: "ANY",
        }));
        const __VLS_808 = __VLS_807({
            value: "ANY",
        }, ...__VLS_functionalComponentArgsRest(__VLS_807));
        __VLS_809.slots.default;
        var __VLS_809;
        var __VLS_801;
        var __VLS_797;
        for (const [rule, index] of __VLS_getVForSourceType((__VLS_ctx.branchConditionAst.rules))) {
            const __VLS_810 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_811 = __VLS_asFunctionalComponent(__VLS_810, new __VLS_810({
                key: (index),
                label: (`条件 ${index + 1}`),
            }));
            const __VLS_812 = __VLS_811({
                key: (index),
                label: (`条件 ${index + 1}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_811));
            __VLS_813.slots.default;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-row" },
            });
            const __VLS_814 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_815 = __VLS_asFunctionalComponent(__VLS_814, new __VLS_814({
                modelValue: (rule.left_field_id),
                filterable: true,
                placeholder: "上游字段",
                ...{ style: {} },
            }));
            const __VLS_816 = __VLS_815({
                modelValue: (rule.left_field_id),
                filterable: true,
                placeholder: "上游字段",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_815));
            __VLS_817.slots.default;
            for (const [field] of __VLS_getVForSourceType((__VLS_ctx.upstreamFields))) {
                const __VLS_818 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_819 = __VLS_asFunctionalComponent(__VLS_818, new __VLS_818({
                    key: (field.name),
                    label: (field.name),
                    value: (field.name),
                }));
                const __VLS_820 = __VLS_819({
                    key: (field.name),
                    label: (field.name),
                    value: (field.name),
                }, ...__VLS_functionalComponentArgsRest(__VLS_819));
            }
            var __VLS_817;
            const __VLS_822 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_823 = __VLS_asFunctionalComponent(__VLS_822, new __VLS_822({
                modelValue: (rule.operator),
                ...{ style: {} },
            }));
            const __VLS_824 = __VLS_823({
                modelValue: (rule.operator),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_823));
            __VLS_825.slots.default;
            const __VLS_826 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_827 = __VLS_asFunctionalComponent(__VLS_826, new __VLS_826({
                label: "等于",
                value: "EQ",
            }));
            const __VLS_828 = __VLS_827({
                label: "等于",
                value: "EQ",
            }, ...__VLS_functionalComponentArgsRest(__VLS_827));
            const __VLS_830 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_831 = __VLS_asFunctionalComponent(__VLS_830, new __VLS_830({
                label: "不等于",
                value: "NE",
            }));
            const __VLS_832 = __VLS_831({
                label: "不等于",
                value: "NE",
            }, ...__VLS_functionalComponentArgsRest(__VLS_831));
            const __VLS_834 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_835 = __VLS_asFunctionalComponent(__VLS_834, new __VLS_834({
                label: "包含",
                value: "CONTAINS",
            }));
            const __VLS_836 = __VLS_835({
                label: "包含",
                value: "CONTAINS",
            }, ...__VLS_functionalComponentArgsRest(__VLS_835));
            const __VLS_838 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_839 = __VLS_asFunctionalComponent(__VLS_838, new __VLS_838({
                label: "大于",
                value: "GT",
            }));
            const __VLS_840 = __VLS_839({
                label: "大于",
                value: "GT",
            }, ...__VLS_functionalComponentArgsRest(__VLS_839));
            const __VLS_842 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_843 = __VLS_asFunctionalComponent(__VLS_842, new __VLS_842({
                label: "大于等于",
                value: "GTE",
            }));
            const __VLS_844 = __VLS_843({
                label: "大于等于",
                value: "GTE",
            }, ...__VLS_functionalComponentArgsRest(__VLS_843));
            const __VLS_846 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_847 = __VLS_asFunctionalComponent(__VLS_846, new __VLS_846({
                label: "小于",
                value: "LT",
            }));
            const __VLS_848 = __VLS_847({
                label: "小于",
                value: "LT",
            }, ...__VLS_functionalComponentArgsRest(__VLS_847));
            const __VLS_850 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_851 = __VLS_asFunctionalComponent(__VLS_850, new __VLS_850({
                label: "小于等于",
                value: "LTE",
            }));
            const __VLS_852 = __VLS_851({
                label: "小于等于",
                value: "LTE",
            }, ...__VLS_functionalComponentArgsRest(__VLS_851));
            const __VLS_854 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_855 = __VLS_asFunctionalComponent(__VLS_854, new __VLS_854({
                label: "为空",
                value: "IS_EMPTY",
            }));
            const __VLS_856 = __VLS_855({
                label: "为空",
                value: "IS_EMPTY",
            }, ...__VLS_functionalComponentArgsRest(__VLS_855));
            const __VLS_858 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_859 = __VLS_asFunctionalComponent(__VLS_858, new __VLS_858({
                label: "不为空",
                value: "NOT_EMPTY",
            }));
            const __VLS_860 = __VLS_859({
                label: "不为空",
                value: "NOT_EMPTY",
            }, ...__VLS_functionalComponentArgsRest(__VLS_859));
            var __VLS_825;
            if (!['IS_EMPTY', 'NOT_EMPTY'].includes(rule.operator)) {
                const __VLS_862 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_863 = __VLS_asFunctionalComponent(__VLS_862, new __VLS_862({
                    modelValue: (rule.right),
                    placeholder: "固定值",
                    ...{ style: {} },
                }));
                const __VLS_864 = __VLS_863({
                    modelValue: (rule.right),
                    placeholder: "固定值",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_863));
            }
            const __VLS_866 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_867 = __VLS_asFunctionalComponent(__VLS_866, new __VLS_866({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }));
            const __VLS_868 = __VLS_867({
                ...{ 'onClick': {} },
                link: true,
                type: "danger",
            }, ...__VLS_functionalComponentArgsRest(__VLS_867));
            let __VLS_870;
            let __VLS_871;
            let __VLS_872;
            const __VLS_873 = {
                onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.selectedNode))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'START_TRIGGER'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CONNECTOR'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY_LOOKUP'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'RECORD_MERGE'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'WAREHOUSE_ASSET_SINK'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'LOOP_RESOURCE' || __VLS_ctx.selectedNode.type === 'LOOP'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'APPROVAL'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'NOTIFY'))
                        return;
                    if (!(__VLS_ctx.selectedNode.type === 'BRANCH'))
                        return;
                    __VLS_ctx.removeBranchRule(index);
                }
            };
            __VLS_869.slots.default;
            var __VLS_869;
            var __VLS_813;
        }
        const __VLS_874 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_875 = __VLS_asFunctionalComponent(__VLS_874, new __VLS_874({
            ...{ 'onClick': {} },
            size: "small",
        }));
        const __VLS_876 = __VLS_875({
            ...{ 'onClick': {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_875));
        let __VLS_878;
        let __VLS_879;
        let __VLS_880;
        const __VLS_881 = {
            onClick: (__VLS_ctx.addBranchRule)
        };
        __VLS_877.slots.default;
        var __VLS_877;
        const __VLS_882 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_883 = __VLS_asFunctionalComponent(__VLS_882, new __VLS_882({
            title: "条件只可选择上游字段、运算符和固定值；不支持代码或表达式。",
            type: "info",
            closable: (false),
            ...{ style: {} },
        }));
        const __VLS_884 = __VLS_883({
            title: "条件只可选择上游字段、运算符和固定值；不支持代码或表达式。",
            type: "info",
            closable: (false),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_883));
        for (const [edge] of __VLS_getVForSourceType((__VLS_ctx.selectedBranchEdges))) {
            const __VLS_886 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_887 = __VLS_asFunctionalComponent(__VLS_886, new __VLS_886({
                key: (`${edge.from}-${edge.to}`),
                label: (`? ${__VLS_ctx.branchTargetName(edge.to)}`),
                ...{ style: {} },
            }));
            const __VLS_888 = __VLS_887({
                key: (`${edge.from}-${edge.to}`),
                label: (`? ${__VLS_ctx.branchTargetName(edge.to)}`),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_887));
            __VLS_889.slots.default;
            const __VLS_890 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_891 = __VLS_asFunctionalComponent(__VLS_890, new __VLS_890({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.branchRouteForEdge(edge)),
                ...{ style: {} },
            }));
            const __VLS_892 = __VLS_891({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.branchRouteForEdge(edge)),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_891));
            let __VLS_894;
            let __VLS_895;
            let __VLS_896;
            const __VLS_897 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(!__VLS_ctx.selectedNode))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'START_TRIGGER'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CONNECTOR'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'CAPABILITY_LOOKUP'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'RECORD_MERGE'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'WAREHOUSE_ASSET_SINK'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'LOOP_RESOURCE' || __VLS_ctx.selectedNode.type === 'LOOP'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'APPROVAL'))
                        return;
                    if (!!(__VLS_ctx.selectedNode.type === 'NOTIFY'))
                        return;
                    if (!(__VLS_ctx.selectedNode.type === 'BRANCH'))
                        return;
                    __VLS_ctx.updateBranchEdgeRoute(edge, $event);
                }
            };
            __VLS_893.slots.default;
            for (const [option] of __VLS_getVForSourceType((__VLS_ctx.branchRouteOptions))) {
                const __VLS_898 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_899 = __VLS_asFunctionalComponent(__VLS_898, new __VLS_898({
                    key: (option.value),
                    label: (option.label),
                    value: (option.value),
                }));
                const __VLS_900 = __VLS_899({
                    key: (option.value),
                    label: (option.label),
                    value: (option.value),
                }, ...__VLS_functionalComponentArgsRest(__VLS_899));
            }
            var __VLS_893;
            var __VLS_889;
        }
    }
    else if (__VLS_ctx.selectedNode.type === 'TRANSFORM') {
        /** @type {[typeof MappingWorkspace, ]} */ ;
        // @ts-ignore
        const __VLS_902 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.transformMappingDocument),
            policy: (__VLS_ctx.transformMappingPolicy),
            compatibility: (__VLS_ctx.transformMappingCompatibility),
            sourceFields: (__VLS_ctx.transformSourceFields),
            targetFields: (__VLS_ctx.transformTargetFields),
        }));
        const __VLS_903 = __VLS_902({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.transformMappingDocument),
            policy: (__VLS_ctx.transformMappingPolicy),
            compatibility: (__VLS_ctx.transformMappingCompatibility),
            sourceFields: (__VLS_ctx.transformSourceFields),
            targetFields: (__VLS_ctx.transformTargetFields),
        }, ...__VLS_functionalComponentArgsRest(__VLS_902));
        let __VLS_905;
        let __VLS_906;
        let __VLS_907;
        const __VLS_908 = {
            'onUpdate:modelValue': (__VLS_ctx.onTransformMappingChange)
        };
        var __VLS_904;
        if (__VLS_ctx.transformMappingMigrationHint) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-migration-hint" },
            });
            (__VLS_ctx.transformMappingMigrationHint);
        }
        if (__VLS_ctx.transformMappingLossyBlocked) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-lossy-blocked" },
            });
        }
    }
    else {
        for (const [schema, key] of __VLS_getVForSourceType(((__VLS_ctx.getNodeSchema(__VLS_ctx.selectedNode.type) || {})))) {
            const __VLS_909 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_910 = __VLS_asFunctionalComponent(__VLS_909, new __VLS_909({
                key: (key),
                label: (key),
            }));
            const __VLS_911 = __VLS_910({
                key: (key),
                label: (key),
            }, ...__VLS_functionalComponentArgsRest(__VLS_910));
            __VLS_912.slots.default;
            const __VLS_913 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_914 = __VLS_asFunctionalComponent(__VLS_913, new __VLS_913({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.stringifyConfig(__VLS_ctx.selectedNode.config?.[key])),
                placeholder: (schema),
                type: "textarea",
                rows: (2),
            }));
            const __VLS_915 = __VLS_914({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.stringifyConfig(__VLS_ctx.selectedNode.config?.[key])),
                placeholder: (schema),
                type: "textarea",
                rows: (2),
            }, ...__VLS_functionalComponentArgsRest(__VLS_914));
            let __VLS_917;
            let __VLS_918;
            let __VLS_919;
            const __VLS_920 = {
                'onUpdate:modelValue': ((v) => __VLS_ctx.updateNodeConfig(key, v))
            };
            var __VLS_916;
            var __VLS_912;
        }
    }
    var __VLS_187;
}
const __VLS_921 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_922 = __VLS_asFunctionalComponent(__VLS_921, new __VLS_921({
    modelValue: (__VLS_ctx.versionsVisible),
    title: "版本历史",
    width: "640px",
}));
const __VLS_923 = __VLS_922({
    modelValue: (__VLS_ctx.versionsVisible),
    title: "版本历史",
    width: "640px",
}, ...__VLS_functionalComponentArgsRest(__VLS_922));
__VLS_924.slots.default;
const __VLS_925 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_926 = __VLS_asFunctionalComponent(__VLS_925, new __VLS_925({
    data: (__VLS_ctx.versions),
    stripe: true,
    border: true,
}));
const __VLS_927 = __VLS_926({
    data: (__VLS_ctx.versions),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_926));
__VLS_928.slots.default;
const __VLS_929 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_930 = __VLS_asFunctionalComponent(__VLS_929, new __VLS_929({
    prop: "version",
    label: "版本",
    width: "120",
}));
const __VLS_931 = __VLS_930({
    prop: "version",
    label: "版本",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_930));
__VLS_932.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_932.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_933 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_934 = __VLS_asFunctionalComponent(__VLS_933, new __VLS_933({
        size: "small",
    }));
    const __VLS_935 = __VLS_934({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_934));
    __VLS_936.slots.default;
    (row.version);
    var __VLS_936;
}
var __VLS_932;
const __VLS_937 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_938 = __VLS_asFunctionalComponent(__VLS_937, new __VLS_937({
    prop: "change_note",
    label: "变更说明",
}));
const __VLS_939 = __VLS_938({
    prop: "change_note",
    label: "变更说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_938));
const __VLS_941 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_942 = __VLS_asFunctionalComponent(__VLS_941, new __VLS_941({
    prop: "created_by",
    label: "操作人",
    width: "120",
}));
const __VLS_943 = __VLS_942({
    prop: "created_by",
    label: "操作人",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_942));
const __VLS_945 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_946 = __VLS_asFunctionalComponent(__VLS_945, new __VLS_945({
    prop: "created_at",
    label: "时间",
    width: "180",
}));
const __VLS_947 = __VLS_946({
    prop: "created_at",
    label: "时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_946));
__VLS_948.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_948.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.formatDateTime(row.created_at));
}
var __VLS_948;
const __VLS_949 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_950 = __VLS_asFunctionalComponent(__VLS_949, new __VLS_949({
    label: "操作",
    width: "100",
}));
const __VLS_951 = __VLS_950({
    label: "操作",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_950));
__VLS_952.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_952.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_953 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_954 = __VLS_asFunctionalComponent(__VLS_953, new __VLS_953({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "warning",
    }));
    const __VLS_955 = __VLS_954({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "warning",
    }, ...__VLS_functionalComponentArgsRest(__VLS_954));
    let __VLS_957;
    let __VLS_958;
    let __VLS_959;
    const __VLS_960 = {
        onClick: (...[$event]) => {
            __VLS_ctx.rollbackTo(row);
        }
    };
    __VLS_956.slots.default;
    var __VLS_956;
}
var __VLS_952;
var __VLS_928;
var __VLS_924;
const __VLS_961 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_962 = __VLS_asFunctionalComponent(__VLS_961, new __VLS_961({
    modelValue: (__VLS_ctx.dryRunVisible),
    title: "试运行结果",
    size: "520px",
}));
const __VLS_963 = __VLS_962({
    modelValue: (__VLS_ctx.dryRunVisible),
    title: "试运行结果",
    size: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_962));
__VLS_964.slots.default;
const __VLS_965 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_966 = __VLS_asFunctionalComponent(__VLS_965, new __VLS_965({
    type: "info",
    closable: (false),
    showIcon: true,
    title: "试运行只执行可读节点；通知、审批、等待及落库节点会被安全跳过。",
}));
const __VLS_967 = __VLS_966({
    type: "info",
    closable: (false),
    showIcon: true,
    title: "试运行只执行可读节点；通知、审批、等待及落库节点会被安全跳过。",
}, ...__VLS_functionalComponentArgsRest(__VLS_966));
if (!__VLS_ctx.dryRunResult?.node_results?.length) {
    const __VLS_969 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_970 = __VLS_asFunctionalComponent(__VLS_969, new __VLS_969({
        description: "暂无可展示的节点结果",
    }));
    const __VLS_971 = __VLS_970({
        description: "暂无可展示的节点结果",
    }, ...__VLS_functionalComponentArgsRest(__VLS_970));
}
else {
    const __VLS_973 = {}.ElTimeline;
    /** @type {[typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, typeof __VLS_components.ElTimeline, typeof __VLS_components.elTimeline, ]} */ ;
    // @ts-ignore
    const __VLS_974 = __VLS_asFunctionalComponent(__VLS_973, new __VLS_973({
        ...{ class: "dry-run-results" },
    }));
    const __VLS_975 = __VLS_974({
        ...{ class: "dry-run-results" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_974));
    __VLS_976.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dryRunResult.node_results))) {
        const __VLS_977 = {}.ElTimelineItem;
        /** @type {[typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, typeof __VLS_components.ElTimelineItem, typeof __VLS_components.elTimelineItem, ]} */ ;
        // @ts-ignore
        const __VLS_978 = __VLS_asFunctionalComponent(__VLS_977, new __VLS_977({
            key: (item.node_id),
            type: (item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'),
        }));
        const __VLS_979 = __VLS_978({
            key: (item.node_id),
            type: (item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_978));
        __VLS_980.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "dry-run-result-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (item.node_id);
        const __VLS_981 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_982 = __VLS_asFunctionalComponent(__VLS_981, new __VLS_981({
            size: "small",
            type: (item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'),
        }));
        const __VLS_983 = __VLS_982({
            size: "small",
            type: (item.status === 'SKIPPED_SIDE_EFFECT' ? 'warning' : item.status === 'FAILED' ? 'danger' : 'success'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_982));
        __VLS_984.slots.default;
        (item.status === 'SKIPPED_SIDE_EFFECT' ? '已安全跳过' : item.status === 'FAILED' ? '执行失败' : '执行完成');
        var __VLS_984;
        if (item.output_summary?.row_count !== undefined) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dry-run-result-meta" },
            });
            (item.output_summary.row_count);
        }
        if (item.message) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dry-run-result-message" },
            });
            (item.message);
        }
        if (item.suggested_action) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "dry-run-result-action" },
            });
            (item.suggested_action);
        }
        var __VLS_980;
    }
    var __VLS_976;
}
var __VLS_964;
/** @type {__VLS_StyleScopedClasses['pipeline-designer-page']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-left']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-title']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-right']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-body']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-left']} */ ;
/** @type {__VLS_StyleScopedClasses['node-palette-item']} */ ;
/** @type {__VLS_StyleScopedClasses['node-palette-item']} */ ;
/** @type {__VLS_StyleScopedClasses['canvas-viewport']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-canvas']} */ ;
/** @type {__VLS_StyleScopedClasses['canvas-scaler']} */ ;
/** @type {__VLS_StyleScopedClasses['canvas-content']} */ ;
/** @type {__VLS_StyleScopedClasses['edge-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-header']} */ ;
/** @type {__VLS_StyleScopedClasses['node-body']} */ ;
/** @type {__VLS_StyleScopedClasses['node-title']} */ ;
/** @type {__VLS_StyleScopedClasses['node-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['node-status']} */ ;
/** @type {__VLS_StyleScopedClasses['node-ports']} */ ;
/** @type {__VLS_StyleScopedClasses['port']} */ ;
/** @type {__VLS_StyleScopedClasses['canvas-controls']} */ ;
/** @type {__VLS_StyleScopedClasses['zoom-value']} */ ;
/** @type {__VLS_StyleScopedClasses['designer-right']} */ ;
/** @type {__VLS_StyleScopedClasses['pipeline-info-form']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-item']} */ ;
/** @type {__VLS_StyleScopedClasses['compact-item']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-plan-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['start-trigger-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['start-trigger-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['start-trigger-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['field-mappings']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-migration-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-lossy-blocked']} */ ;
/** @type {__VLS_StyleScopedClasses['dry-run-results']} */ ;
/** @type {__VLS_StyleScopedClasses['dry-run-result-title']} */ ;
/** @type {__VLS_StyleScopedClasses['dry-run-result-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['dry-run-result-message']} */ ;
/** @type {__VLS_StyleScopedClasses['dry-run-result-action']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Delete: Delete,
            Aim: Aim,
            ScheduleSelector: ScheduleSelector,
            MappingWorkspace: MappingWorkspace,
            WarehouseAssetSinkConfig: WarehouseAssetSinkConfig,
            fixedNodeTypes: fixedNodeTypes,
            paletteNodeTypes: paletteNodeTypes,
            resolveIcon: resolveIcon,
            systems: systems,
            allResources: allResources,
            resourcesLoading: resourcesLoading,
            capabilitySystems: capabilitySystems,
            capabilityObjects: capabilityObjects,
            capabilityOperations: capabilityOperations,
            resourcesOf: resourcesOf,
            capabilityOptionLabel: capabilityOptionLabel,
            selectConnectorResource: selectConnectorResource,
            selectCapabilitySystem: selectCapabilitySystem,
            selectCapabilityObject: selectCapabilityObject,
            selectCapabilityOperation: selectCapabilityOperation,
            targetAssetColumns: targetAssetColumns,
            offerMappings: offerMappings,
            offerFieldOptions: offerFieldOptions,
            addOfferMapping: addOfferMapping,
            removeOfferMapping: removeOfferMapping,
            currentTpl: currentTpl,
            form: form,
            selectedNodeId: selectedNodeId,
            selectedNode: selectedNode,
            selectedBranchEdges: selectedBranchEdges,
            branchRouteOptions: branchRouteOptions,
            branchRouteForEdge: branchRouteForEdge,
            updateBranchEdgeRoute: updateBranchEdgeRoute,
            branchTargetName: branchTargetName,
            triggerLoading: triggerLoading,
            startTriggerModeOptions: startTriggerModeOptions,
            startTriggerMode: startTriggerMode,
            startTriggerSystemId: startTriggerSystemId,
            startTriggerResourceId: startTriggerResourceId,
            selectedStartTriggerCode: selectedStartTriggerCode,
            selectedScheduledTriggerCode: selectedScheduledTriggerCode,
            scheduledPlanSchedule: scheduledPlanSchedule,
            scheduledPlanEnabled: scheduledPlanEnabled,
            schedulePlanSaving: schedulePlanSaving,
            platformEventCategory: platformEventCategory,
            platformEventSource: platformEventSource,
            platformEventType: platformEventType,
            platformEventFilterField: platformEventFilterField,
            platformEventFilterValue: platformEventFilterValue,
            platformEventEnabled: platformEventEnabled,
            selectedPlatformEventTriggerCode: selectedPlatformEventTriggerCode,
            platformEventSaving: platformEventSaving,
            startTriggerNeedsResource: startTriggerNeedsResource,
            startTriggerResources: startTriggerResources,
            scheduledTemplateTriggers: scheduledTemplateTriggers,
            selectedScheduledPlan: selectedScheduledPlan,
            platformEventTriggers: platformEventTriggers,
            selectedPlatformEventTrigger: selectedPlatformEventTrigger,
            platformEventCategories: platformEventCategories,
            platformEventSources: platformEventSources,
            platformEventOptions: platformEventOptions,
            selectedPlatformEventDefinition: selectedPlatformEventDefinition,
            platformEventFilterFields: platformEventFilterFields,
            schedulePlanLabel: schedulePlanLabel,
            schedulePlanSummary: schedulePlanSummary,
            isSchedulePlanDirty: isSchedulePlanDirty,
            syncSelectedPlatformEventTrigger: syncSelectedPlatformEventTrigger,
            filteredStartTriggers: filteredStartTriggers,
            changeStartTriggerMode: changeStartTriggerMode,
            changeStartTriggerSystem: changeStartTriggerSystem,
            changeStartTriggerResource: changeStartTriggerResource,
            changePlatformEventCategory: changePlatformEventCategory,
            changePlatformEventSource: changePlatformEventSource,
            changePlatformEventType: changePlatformEventType,
            openStartTriggerConfig: openStartTriggerConfig,
            saveInlineSchedulePlan: saveInlineSchedulePlan,
            savePlatformEventTrigger: savePlatformEventTrigger,
            connectorParamsText: connectorParamsText,
            updateConnectorParams: updateConnectorParams,
            approvalApproversText: approvalApproversText,
            updateApprovalApprovers: updateApprovalApprovers,
            canvasRef: canvasRef,
            canvasW: canvasW,
            canvasH: canvasH,
            canvasZoom: canvasZoom,
            connectorSides: connectorSides,
            isCanvasPanning: isCanvasPanning,
            startCanvasPan: startCanvasPan,
            onCanvasClick: onCanvasClick,
            startDrag: startDrag,
            drawingEdges: drawingEdges,
            startConnect: startConnect,
            onPaletteDragStart: onPaletteDragStart,
            onCanvasDrop: onCanvasDrop,
            selectNode: selectNode,
            removeNode: removeNode,
            getNodeColor: getNodeColor,
            getNodeLabel: getNodeLabel,
            nodeSummaryLines: nodeSummaryLines,
            nodeStatus: nodeStatus,
            getNodeSchema: getNodeSchema,
            stringifyConfig: stringifyConfig,
            updateNodeConfig: updateNodeConfig,
            loadBitableTablesForNode: loadBitableTablesForNode,
            nodeHasError: nodeHasError,
            bitableTableOptions: bitableTableOptions,
            resourceDataObjects: resourceDataObjects,
            loadResourceDataObjects: loadResourceDataObjects,
            upstreamFields: upstreamFields,
            transformMappingDocument: transformMappingDocument,
            transformMappingCompatibility: transformMappingCompatibility,
            transformSourceFields: transformSourceFields,
            transformTargetFields: transformTargetFields,
            transformMappingPolicy: transformMappingPolicy,
            transformMappingLossyBlocked: transformMappingLossyBlocked,
            transformMappingMigrationHint: transformMappingMigrationHint,
            onTransformMappingChange: onTransformMappingChange,
            notifyTemplates: notifyTemplates,
            loadNotifyTemplates: loadNotifyTemplates,
            branchConditionAst: branchConditionAst,
            addBranchRule: addBranchRule,
            removeBranchRule: removeBranchRule,
            storedEdge: storedEdge,
            edgePath: edgePath,
            edgeStroke: edgeStroke,
            autoLayout: autoLayout,
            onCanvasWheel: onCanvasWheel,
            resetCanvasZoom: resetCanvasZoom,
            fitCanvas: fitCanvas,
            centerCanvas: centerCanvas,
            saving: saving,
            saveTemplate: saveTemplate,
            dryRunVisible: dryRunVisible,
            dryRunResult: dryRunResult,
            dryRun: dryRun,
            versionsVisible: versionsVisible,
            versions: versions,
            viewVersions: viewVersions,
            rollbackTo: rollbackTo,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
