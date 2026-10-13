/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Upload, Download, MagicStick, CircleCheck, Warning, Document, Grid } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import OutputFieldsEditor from '@/components/tools/OutputFieldsEditor.vue';
import TableMergeKeyMappingPanel from '@/components/table-tools/TableMergeKeyMappingPanel.vue';
import TableMergeTemplateCard from '@/components/table-tools/TableMergeTemplateCard.vue';
import TableToolFullscreenShell from '@/components/tools/TableToolFullscreenShell.vue';
import { tableToolsApi, } from '@/api/tableTools';
import { useUserStore } from '@/stores/user';
const userStore = useUserStore();
const route = useRoute();
const router = useRouter();
/** 改/删门禁:仅模板创建者本人或超级管理员(与后端一致) */
function canModify(t) {
    return userStore.isSuperAdmin || t.created_by === userStore.user?.id;
}
// ── 视图状态 ─────────────────────────────────────────────────────────────────
// mode: list | build | merge
const mode = ref('list');
// ── 模板列表 ─────────────────────────────────────────────────────────────────
const templates = ref([]);
const listLoading = ref(false);
const listError = ref('');
async function loadTemplates() {
    listLoading.value = true;
    listError.value = '';
    try {
        templates.value = await tableToolsApi.listTemplates();
    }
    catch (e) {
        templates.value = [];
        listError.value = e?.response?.data?.detail || '加载模板列表失败';
    }
    finally {
        listLoading.value = false;
    }
}
function openNewRoute() {
    void router.push({ name: 'TableMergeNew' });
}
function openEditRoute(item) {
    void router.push({ name: 'TableMergeEdit', params: { id: item.id } });
}
function openMappingRoute(item) {
    void router.push({ name: 'TableMergeMapping', params: { id: item.id } });
}
function openMergeRoute(item) {
    void router.push({ name: 'TableMergeRun', params: { id: item.id } });
}
function returnToTemplateList() {
    void router.push({ name: 'TableMerge' });
}
// ── 建/编辑模板（build 模式） ─────────────────────────────────────────────────
const editingId = ref(null);
const buildStep = ref('upload');
const activeConfigTab = ref('base');
const workflowSteps = [
    { key: 'base', label: '基础模板' },
    { key: 'key', label: '主键映射' },
    { key: 'dwd', label: '数据关联' },
    { key: 'output', label: '信息输出' },
];
const workflowStepIndex = computed(() => workflowSteps.findIndex((step) => step.key === activeConfigTab.value));
const isLastWorkflowStep = computed(() => workflowStepIndex.value === workflowSteps.length - 1);
const keyMappings = ref([]);
const keyMappingDraft = ref(null);
const keyMappingSaving = ref(false);
const keyMappingsLoading = ref(false);
const keyMappingsError = ref('');
const keyMappingSaveError = ref('');
const keyMappingTogglingIds = ref([]);
const dwdRelations = ref([]);
const dwdSources = ref([]);
const dwdFields = ref([]);
const dwdFieldsLoading = ref(false);
const dwdRelationDraft = ref(null);
const dwdRelationSaving = ref(false);
function emptyKeyMapping() {
    return {
        id: 0, template_id: editingId.value || 0,
        source_key: Object.fromEntries(form.value.merge_keys.map((field) => [field, ''])),
        canonical_merge_key: Object.fromEntries(form.value.merge_keys.map((field) => [field, ''])),
        enabled: true,
    };
}
function emptyDwdRelation() {
    return {
        name: '', dataset_id: undefined, report_id: undefined, left_fields: [], right_fields: [], select_fields: [],
        missing_policy: 'anomaly', multiple_policy: 'anomaly', enabled: true,
    };
}
async function loadKeyMappings(id = editingId.value) {
    if (!id)
        return;
    keyMappingsLoading.value = true;
    keyMappingsError.value = '';
    try {
        keyMappings.value = await tableToolsApi.listKeyMappings(id);
    }
    catch (e) {
        keyMappingsError.value = e?.response?.data?.detail || '主键值映射加载失败';
    }
    finally {
        keyMappingsLoading.value = false;
    }
}
async function loadAdvancedConfig(id) {
    await Promise.all([
        loadKeyMappings(id),
        (async () => {
            try {
                const [relations, sources] = await Promise.all([
                    tableToolsApi.listDwdRelations(id),
                    tableToolsApi.listDwdSources(),
                ]);
                dwdRelations.value = relations;
                dwdSources.value = sources;
                const fieldLists = await Promise.all(relations.filter((r) => r.enabled).map((r) => r.dataset_id ? tableToolsApi.listDwdFields(r.dataset_id) : r.report_id ? tableToolsApi.listDwdFieldsByReport(r.report_id) : Promise.resolve([])));
                dwdFields.value = [...new Map(fieldLists.flat().map((field) => [field.code, field])).values()];
            }
            catch (e) {
                ElMessage.error(e?.response?.data?.detail || '加载 DWD 关联配置失败');
            }
        })(),
    ]);
}
async function loadDwdFields(datasetId, reportId) {
    dwdFields.value = [];
    if (!datasetId && !reportId)
        return;
    dwdFieldsLoading.value = true;
    try {
        dwdFields.value = datasetId
            ? await tableToolsApi.listDwdFields(datasetId)
            : await tableToolsApi.listDwdFieldsByReport(reportId);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载 DWD 字段失败');
    }
    finally {
        dwdFieldsLoading.value = false;
    }
}
function selectDwdDataset(datasetId) {
    if (!dwdRelationDraft.value)
        return;
    dwdRelationDraft.value.dataset_id = datasetId;
    dwdRelationDraft.value.report_id = undefined;
    void loadDwdFields(datasetId);
}
function startKeyMapping(item) {
    keyMappingSaveError.value = '';
    keyMappingDraft.value = item ? JSON.parse(JSON.stringify(item)) : emptyKeyMapping();
}
function cancelKeyMapping() {
    keyMappingDraft.value = null;
    keyMappingSaveError.value = '';
}
async function saveKeyMapping(showSuccess = true) {
    if (!editingId.value || !keyMappingDraft.value)
        return;
    const item = keyMappingDraft.value;
    if (form.value.merge_keys.some((field) => !String(item.source_key[field] ?? '').trim() || !String(item.canonical_merge_key[field] ?? '').trim())) {
        ElMessage.warning('请完整填写源主键值和归集统一键');
        return;
    }
    keyMappingSaving.value = true;
    keyMappingSaveError.value = '';
    try {
        const payload = { source_key: item.source_key, canonical_merge_key: item.canonical_merge_key, enabled: item.enabled };
        const saved = item.id
            ? await tableToolsApi.updateKeyMapping(editingId.value, item.id, payload)
            : await tableToolsApi.createKeyMapping(editingId.value, payload);
        keyMappings.value = keyMappings.value.some((value) => value.id === saved.id)
            ? keyMappings.value.map((value) => value.id === saved.id ? saved : value)
            : [...keyMappings.value, saved];
        keyMappingDraft.value = null;
        markSaved();
        if (showSuccess)
            ElMessage.success('主键值映射已保存');
    }
    catch (e) {
        keyMappingSaveError.value = e?.response?.data?.detail || '主键值映射保存失败';
    }
    finally {
        keyMappingSaving.value = false;
    }
}
async function toggleKeyMapping(item, enabled) {
    if (!editingId.value || keyMappingTogglingIds.value.includes(item.id))
        return;
    keyMappingTogglingIds.value = [...keyMappingTogglingIds.value, item.id];
    keyMappings.value = keyMappings.value.map((value) => value.id === item.id ? { ...value, enabled } : value);
    try {
        const saved = await tableToolsApi.updateKeyMapping(editingId.value, item.id, {
            source_key: item.source_key,
            canonical_merge_key: item.canonical_merge_key,
            enabled,
        });
        keyMappings.value = keyMappings.value.map((value) => value.id === saved.id ? saved : value);
        markSaved();
    }
    catch (e) {
        keyMappings.value = keyMappings.value.map((value) => value.id === item.id ? item : value);
        ElMessage.error(e?.response?.data?.detail || `${enabled ? '启用' : '停用'}主键值映射失败`);
    }
    finally {
        keyMappingTogglingIds.value = keyMappingTogglingIds.value.filter((id) => id !== item.id);
    }
}
async function removeKeyMapping(item) {
    if (!editingId.value)
        return;
    try {
        await ElMessageBox.confirm('确认删除该主键值映射？', '确认删除', { type: 'warning' });
        await tableToolsApi.deleteKeyMapping(editingId.value, item.id);
        keyMappings.value = keyMappings.value.filter((value) => value.id !== item.id);
        markSaved();
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close')
            ElMessage.error(e?.response?.data?.detail || '删除主键值映射失败');
    }
}
function startDwdRelation(item) {
    const draft = item ? JSON.parse(JSON.stringify(item)) : emptyDwdRelation();
    dwdRelationDraft.value = draft;
    void loadDwdFields(draft.dataset_id ?? undefined, draft.report_id ?? undefined);
}
function cancelDwdRelation() { dwdRelationDraft.value = null; dwdFields.value = []; }
function addDwdPair() {
    if (!dwdRelationDraft.value)
        return;
    dwdRelationDraft.value.left_fields = [...(dwdRelationDraft.value.left_fields || []), ''];
    dwdRelationDraft.value.right_fields = [...(dwdRelationDraft.value.right_fields || []), ''];
}
function removeDwdPair(index) {
    if (!dwdRelationDraft.value)
        return;
    dwdRelationDraft.value.left_fields = (dwdRelationDraft.value.left_fields || []).filter((_, i) => i !== index);
    dwdRelationDraft.value.right_fields = (dwdRelationDraft.value.right_fields || []).filter((_, i) => i !== index);
}
async function saveDwdRelation(showSuccess = true) {
    if (!editingId.value || !dwdRelationDraft.value)
        return;
    const item = dwdRelationDraft.value;
    if (!item.name?.trim() || (!item.dataset_id && !item.report_id) || !item.left_fields?.length || !item.right_fields?.length) {
        ElMessage.warning('请填写名称、DWD 来源和关联字段');
        return;
    }
    if (item.left_fields.length !== item.right_fields.length) {
        ElMessage.warning('左右关联字段数量必须一致');
        return;
    }
    dwdRelationSaving.value = true;
    try {
        const payload = {
            name: item.name, dataset_id: item.dataset_id ?? null, report_id: item.dataset_id ? null : item.report_id ?? null,
            left_fields: item.left_fields, right_fields: item.right_fields, select_fields: item.select_fields || [],
            missing_policy: item.missing_policy || 'anomaly', multiple_policy: item.multiple_policy || 'anomaly',
            enabled: item.enabled !== false,
        };
        const saved = item.id
            ? await tableToolsApi.updateDwdRelation(editingId.value, item.id, payload)
            : await tableToolsApi.createDwdRelation(editingId.value, payload);
        dwdRelations.value = dwdRelations.value.some((value) => value.id === saved.id)
            ? dwdRelations.value.map((value) => value.id === saved.id ? saved : value)
            : [...dwdRelations.value, saved];
        dwdRelationDraft.value = null;
        markSaved();
        if (showSuccess)
            ElMessage.success('DWD 关联已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || 'DWD 关联保存失败');
    }
    finally {
        dwdRelationSaving.value = false;
    }
}
async function removeDwdRelation(item) {
    if (!editingId.value)
        return;
    try {
        await ElMessageBox.confirm('确认删除该 DWD 关联？', '确认删除', { type: 'warning' });
        await tableToolsApi.deleteDwdRelation(editingId.value, item.id);
        dwdRelations.value = dwdRelations.value.filter((value) => value.id !== item.id);
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close')
            ElMessage.error(e?.response?.data?.detail || '删除 DWD 关联失败');
    }
}
// 文件 + AI
const tplFiles = ref([]);
const aiContext = ref('');
const aiLoading = ref(false);
const draft = ref(null);
// 表单数据
const form = ref({
    name: '',
    description: '',
    merge_keys: ['姓名', '证件号码'],
    std_fields: [],
    aggregate: 'sum',
    result_save_mode: 'input_period',
    result_period_field: null,
    output_fields: [],
    mappings: [],
});
const stdFieldInput = ref('');
const draggingStdField = ref('');
const outputFieldCandidates = computed(() => {
    const dwdSelects = dwdRelations.value
        .filter((r) => r.enabled)
        .flatMap((r) => r.select_fields || []);
    return [...new Set([...form.value.merge_keys, ...form.value.std_fields, ...dwdSelects])];
});
const outputFieldLabels = computed(() => Object.fromEntries(dwdFields.value.map((field) => [field.code, field.label])));
const savingTpl = ref(false);
const savedSnapshot = ref('');
function currentSnapshot() {
    return JSON.stringify({
        form: form.value,
        keyMappings: keyMappings.value,
        dwdRelations: dwdRelations.value,
        keyMappingDraft: keyMappingDraft.value,
        dwdRelationDraft: dwdRelationDraft.value,
        editingMapping: editingMapping.value,
        tplFiles: tplFiles.value.map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified })),
        aiContext: aiContext.value,
        draft: draft.value,
    });
}
function markSaved() { savedSnapshot.value = currentSnapshot(); }
const hasUnsavedChanges = computed(() => savedSnapshot.value !== currentSnapshot());
// 当前展开的 mapping 索引
const expandedMapping = ref(null);
// 当前正在编辑的 mapping 副本
const editingMapping = ref(null);
function openNew() {
    editingId.value = null;
    tplFiles.value = [];
    aiContext.value = '';
    draft.value = null;
    expandedMapping.value = null;
    editingMapping.value = null;
    keyMappings.value = [];
    dwdRelations.value = [];
    dwdSources.value = [];
    keyMappingDraft.value = null;
    dwdRelationDraft.value = null;
    activeConfigTab.value = 'base';
    resetForm();
    buildStep.value = 'upload';
    mode.value = 'build';
    markSaved();
}
async function openEdit(id) {
    editingId.value = id;
    try {
        const detail = await tableToolsApi.getTemplate(id);
        form.value = {
            name: detail.name,
            description: detail.description || '',
            merge_keys: [...detail.merge_keys],
            std_fields: [...detail.std_fields],
            aggregate: detail.aggregate,
            result_save_mode: detail.result_save_mode,
            result_period_field: detail.result_period_field || null,
            output_fields: [...(detail.output_fields || [])],
            mappings: detail.mappings.map((m) => ({ ...m })),
        };
        expandedMapping.value = null;
        editingMapping.value = null;
        activeConfigTab.value = 'base';
        await loadAdvancedConfig(id);
        buildStep.value = 'form';
        mode.value = 'build';
        markSaved();
        return true;
    }
    catch {
        ElMessage.error('加载模板详情失败');
        return false;
    }
}
const mappingWizardTemplate = ref(null);
const mappingWizardStep = ref('upload');
const mappingWorkflowSteps = [
    { key: 'upload', label: '上传样表' },
    { key: 'confirm', label: '确认映射' },
];
const mappingWorkflowStep = computed(() => mappingWizardStep.value === 'confirm' ? 'confirm' : 'upload');
const mappingWizardFiles = ref([]);
const mappingWizardContext = ref('');
const mappingWizardDrafts = ref([]);
const mappingWizardSaving = ref(false);
function resetMappingWizard() {
    mappingWizardStep.value = 'upload';
    mappingWizardFiles.value = [];
    mappingWizardContext.value = '';
    mappingWizardDrafts.value = [];
}
async function handleMappingBack() {
    returnToTemplateList();
}
function goToMappingStep(step) {
    if (mappingWizardStep.value === 'ai' || step === mappingWorkflowStep.value)
        return;
    if (step === 'upload')
        mappingWizardStep.value = 'upload';
}
async function openAddMapping(id) {
    try {
        mappingWizardTemplate.value = await tableToolsApi.getTemplate(id);
        resetMappingWizard();
        mode.value = 'mapping';
        return true;
    }
    catch {
        ElMessage.error('加载模板详情失败');
        return false;
    }
}
function removeMappingWizardFile(index) {
    mappingWizardFiles.value.splice(index, 1);
}
function handleMappingWizardFile(uploadFile) {
    const file = uploadFile.raw;
    if (!mappingWizardFiles.value.some((item) => item.name === file.name && item.size === file.size)) {
        mappingWizardFiles.value.push(file);
    }
}
function uniqueWizardMappingName(proposedName, usedNames) {
    const baseName = proposedName.trim() || '新映射';
    if (!usedNames.has(baseName)) {
        usedNames.add(baseName);
        return baseName;
    }
    let sequence = 2;
    while (usedNames.has(`${baseName}-${sequence}`))
        sequence += 1;
    const name = `${baseName}-${sequence}`;
    usedNames.add(name);
    return name;
}
async function runMappingDrafts() {
    if (!mappingWizardTemplate.value || !mappingWizardFiles.value.length) {
        ElMessage.warning('请先拖拽或选择至少一个样表文件');
        return;
    }
    mappingWizardStep.value = 'ai';
    try {
        const result = await tableToolsApi.mappingDrafts(mappingWizardTemplate.value.id, mappingWizardFiles.value, mappingWizardContext.value);
        const usedNames = new Set(mappingWizardTemplate.value.mappings.map((mapping) => mapping.name));
        mappingWizardDrafts.value = result.mappings.map((mapping) => ({
            ...mapping,
            name: uniqueWizardMappingName(mapping.name, usedNames),
        }));
        mappingWizardStep.value = 'confirm';
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '样表识别失败，请重试');
        mappingWizardStep.value = 'upload';
    }
}
function removeMappingWizardDraft(index) {
    mappingWizardDrafts.value.splice(index, 1);
}
async function saveMappingDrafts() {
    if (!mappingWizardTemplate.value || !mappingWizardDrafts.value.length) {
        ElMessage.warning('请保留至少一条待保存映射');
        return;
    }
    mappingWizardSaving.value = true;
    try {
        const invalidMapping = mappingWizardDrafts.value.find((mapping) => validateDerivedFields(mapping));
        if (invalidMapping) {
            ElMessage.warning(validateDerivedFields(invalidMapping) || '派生字段配置无效');
            return;
        }
        await tableToolsApi.createMappings(mappingWizardTemplate.value.id, mappingWizardDrafts.value.map((mapping) => ({
            name: mapping.name,
            match_signature: mapping.match_signature || [],
            source_fields: mapping.source_fields || [],
            sheet_kw: mapping.sheet_kw || null,
            header_start: mapping.header_start || 1,
            header_end: mapping.header_end || 1,
            key_map: mapping.key_map || {},
            column_map: mapping.column_map || {},
            new_std_fields: mapping.new_std_fields || [],
            derived_fields: mapping.derived_fields || [],
            derive_check: mapping.derive_check || null,
            skip_tokens: mapping.skip_tokens || ['合计', '小计', '总计'],
        })));
        const savedCount = mappingWizardDrafts.value.length;
        resetMappingWizard();
        ElMessage.success(`已新增 ${savedCount} 条源映射`);
        await router.push({ name: 'TableMerge' });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '批量保存映射失败');
    }
    finally {
        mappingWizardSaving.value = false;
    }
}
function resetForm() {
    form.value = { name: '', description: '', merge_keys: ['姓名', '证件号码'], std_fields: [], aggregate: 'sum', result_save_mode: 'input_period', result_period_field: null, output_fields: [], mappings: [] };
}
// 文件选择（去重）
function handleTplFileChange(uploadFile) {
    const file = uploadFile.raw;
    if (!tplFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
        tplFiles.value.push(file);
    }
}
function removeTplFile(index) { tplFiles.value.splice(index, 1); }
// AI 识别
async function runAiDraft() {
    if (!tplFiles.value.length) {
        ElMessage.warning('请先上传文件');
        return;
    }
    buildStep.value = 'ai';
    try {
        draft.value = await tableToolsApi.aiDraft(tplFiles.value, aiContext.value);
        form.value = {
            name: draft.value.name || '',
            description: draft.value.description || '',
            merge_keys: [...draft.value.merge_keys],
            std_fields: [...draft.value.std_fields],
            aggregate: draft.value.aggregate,
            result_save_mode: 'input_period',
            result_period_field: null,
            output_fields: [],
            mappings: draft.value.mappings.map((m) => ({ ...m })),
        };
        buildStep.value = 'form';
        expandedMapping.value = null;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || 'AI 识别失败，请重试');
        buildStep.value = 'upload';
    }
}
async function handleBuildBack() {
    if (!savingTpl.value)
        returnToTemplateList();
}
async function goToConfigStep(target) {
    const step = workflowSteps.find((item) => item.key === target);
    if (!step || step.key === activeConfigTab.value || buildStep.value !== 'form' || savingTpl.value)
        return;
    if (!hasUnsavedChanges.value) {
        activeConfigTab.value = step.key;
        return;
    }
    if (await saveTemplate(false, false))
        activeConfigTab.value = step.key;
}
async function goToPreviousStep() {
    const index = workflowStepIndex.value;
    if (index > 0)
        await goToConfigStep(workflowSteps[index - 1].key);
}
async function goToNextStep() {
    if (savingTpl.value)
        return;
    const index = workflowStepIndex.value;
    if (index < 0)
        return;
    if (!isLastWorkflowStep.value) {
        await goToConfigStep(workflowSteps[index + 1].key);
        return;
    }
    if (hasUnsavedChanges.value) {
        await saveTemplate(true);
    }
    else {
        await router.push({ name: 'TableMerge' });
    }
}
function skipToManual() {
    draft.value = null;
    resetForm();
    buildStep.value = 'form';
}
// mapping 编辑
function startEditMapping(idx) {
    expandedMapping.value = idx;
    editingMapping.value = JSON.parse(JSON.stringify(form.value.mappings[idx]));
}
function cancelEditMapping() {
    expandedMapping.value = null;
    editingMapping.value = null;
}
function validateDerivedFields(mapping) {
    const stdFields = new Set([
        ...form.value.std_fields,
        ...(mapping.new_std_fields || []),
    ].map((field) => field.trim()));
    for (const [source, target] of Object.entries(mapping.column_map || {})) {
        const normalizedTarget = String(target || '').trim();
        if (!normalizedTarget || !stdFields.has(normalizedTarget)) {
            return `映射「${mapping.name || '未命名映射'}」的源字段「${source}」目标必须属于模板标准字段或本次新增标准字段`;
        }
    }
    const directTargets = new Set(Object.values(mapping.column_map || {}).map((field) => String(field).trim()));
    const targets = new Set();
    for (const field of mapping.derived_fields || []) {
        const target = String(field.target || '').trim();
        const expr = String(field.expr || '').trim();
        const refs = Array.from(expr.matchAll(/\{([^{}]+)\}/g), (match) => match[1].trim());
        if (!stdFields.has(target))
            return '派生字段目标必须属于模板标准字段';
        if (!expr)
            return '派生字段公式不能为空';
        if (targets.has(target))
            return '同一映射不能重复配置派生字段目标';
        if (directTargets.has(target))
            return '派生字段目标不能同时配置直接映射';
        if (!refs.length || refs.some((ref) => !stdFields.has(ref)))
            return '派生公式只能引用模板标准字段';
        targets.add(target);
    }
    return null;
}
async function saveEditMapping(showSuccess = true) {
    if (expandedMapping.value === null || !editingMapping.value)
        return;
    const validationError = validateDerivedFields(editingMapping.value);
    if (validationError) {
        ElMessage.warning(validationError);
        return;
    }
    const index = expandedMapping.value;
    const payload = { ...editingMapping.value };
    try {
        if (editingId.value) {
            const saved = payload.id
                ? await tableToolsApi.updateMapping(editingId.value, payload.id, payload)
                : await tableToolsApi.createMapping(editingId.value, payload);
            form.value.mappings[index] = saved;
        }
        else {
            form.value.mappings[index] = payload;
        }
        expandedMapping.value = null;
        editingMapping.value = null;
        markSaved();
        if (showSuccess)
            ElMessage.success('源映射已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '源映射保存失败');
    }
}
const mappingDraftLoading = ref(false);
const mappingDraftFile = ref(null);
const mappingDraftSheets = ref([]);
const mappingDraftSheet = ref("");
const mappingDraftWarnings = ref([]);
const mappingDraftLowConfidence = ref(null);
async function handleMappingSample(uploadFile) {
    if (!editingId.value || !editingMapping.value)
        return;
    mappingDraftLoading.value = true;
    try {
        const sampleFile = uploadFile.raw;
        mappingDraftFile.value = sampleFile;
        const result = await tableToolsApi.mappingDraft(editingId.value, sampleFile, mappingDraftSheet.value || undefined);
        mappingDraftSheets.value = result.available_sheets;
        mappingDraftSheet.value = result.mapping.sheet_kw || "";
        mappingDraftWarnings.value = result.warnings;
        mappingDraftLowConfidence.value = result.low_confidence[0] || null;
        editingMapping.value = {
            ...editingMapping.value,
            ...result.mapping,
            source_fields: result.mapping.source_fields || result.effective_headers,
        };
        ElMessage.success('已根据样表表头回填映射草稿，请确认后保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '样表解析失败');
    }
    finally {
        mappingDraftLoading.value = false;
    }
}
async function reloadMappingDraft() {
    if (mappingDraftFile.value)
        await handleMappingSample({ raw: mappingDraftFile.value });
}
async function removeMapping(idx) {
    const mapping = form.value.mappings[idx];
    try {
        await ElMessageBox.confirm(`确认删除映射「${mapping.name}」？`, '确认删除', { type: 'warning' });
        if (editingId.value && mapping.id)
            await tableToolsApi.deleteMapping(editingId.value, mapping.id);
        form.value.mappings.splice(idx, 1);
        cancelEditMapping();
        ElMessage.success('源映射已删除');
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close')
            ElMessage.error(e?.response?.data?.detail || '删除映射失败');
    }
}
// key_map / column_map 编辑辅助
function addKeyMapEntry() {
    if (!editingMapping.value?.source_fields?.length) {
        ElMessage.warning('请先上传样表解析源字段');
        return;
    }
    if (!editingMapping.value.key_map)
        editingMapping.value.key_map = {};
    editingMapping.value._keyMapEntries = [...objToEntries(editingMapping.value.key_map), { key: '', val: '' }];
}
function addColumnMapEntry() {
    if (!editingMapping.value?.source_fields?.length) {
        ElMessage.warning('请先上传样表解析源字段');
        return;
    }
    if (!editingMapping.value.column_map)
        editingMapping.value.column_map = {};
    editingMapping.value._colMapEntries = [...objToEntries(editingMapping.value.column_map), { key: '', val: '' }];
}
function objToEntries(obj) {
    return Object.entries(obj).map(([k, v]) => ({ key: k, val: v }));
}
function entriesToObj(entries) {
    const obj = {};
    for (const e of entries) {
        if (e.key)
            obj[e.key] = e.val;
    }
    return obj;
}
// derived_fields 编辑
function addDerivedField() {
    if (!editingMapping.value)
        return;
    if (!editingMapping.value.derived_fields)
        editingMapping.value.derived_fields = [];
    editingMapping.value.derived_fields.push({ target: '', expr: '', round: 2 });
}
function removeDerivedField(idx) {
    editingMapping.value?.derived_fields?.splice(idx, 1);
}
// 把 key_map/column_map 对象同步到 editingMapping
function syncKeyMap(entries) {
    if (!editingMapping.value)
        return;
    editingMapping.value._keyMapEntries = entries;
    editingMapping.value.key_map = entriesToObj(entries);
}
function syncColumnMap(entries) {
    if (!editingMapping.value)
        return;
    editingMapping.value._colMapEntries = entries;
    editingMapping.value.column_map = entriesToObj(entries);
}
// 标准字段
function addStdField() {
    const v = stdFieldInput.value.trim();
    if (!v || form.value.std_fields.includes(v)) {
        stdFieldInput.value = '';
        return;
    }
    form.value.std_fields.push(v);
    if (form.value.output_fields.length && !form.value.output_fields.includes(v))
        form.value.output_fields.push(v);
    stdFieldInput.value = '';
}
function removeStdField(f) {
    form.value.std_fields = form.value.std_fields.filter((x) => x !== f);
    form.value.output_fields = form.value.output_fields.filter((x) => x !== f);
}
// 拖拽排序：决定归集输出表的列顺序
function reorderStdField(code, targetCode) {
    if (!code || !targetCode || code === targetCode)
        return;
    const next = [...form.value.std_fields];
    const from = next.indexOf(code);
    const to = next.indexOf(targetCode);
    if (from < 0 || to < 0)
        return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    form.value.std_fields = next;
}
// 低置信度
function aiLowConfidence(mappingName) {
    return draft.value?._meta?.low_confidence?.find((l) => l.sheet === mappingName);
}
// 保存模板
async function saveTemplate(returnToList = true, showSuccess = true) {
    if (editingMapping.value) {
        await saveEditMapping(showSuccess);
        if (editingMapping.value)
            return false;
    }
    if (keyMappingDraft.value) {
        await saveKeyMapping(showSuccess);
        if (keyMappingDraft.value)
            return false;
    }
    if (dwdRelationDraft.value) {
        await saveDwdRelation(showSuccess);
        if (dwdRelationDraft.value)
            return false;
    }
    if (!form.value.name.trim()) {
        ElMessage.warning('请填写模板名称');
        return;
    }
    if (!form.value.std_fields.length) {
        ElMessage.warning('标准字段不能为空');
        return;
    }
    const invalidMapping = form.value.mappings.find((mapping) => validateDerivedFields(mapping));
    if (invalidMapping) {
        ElMessage.warning(validateDerivedFields(invalidMapping) || '源映射配置无效');
        return;
    }
    savingTpl.value = true;
    try {
        const payload = {
            name: form.value.name,
            description: form.value.description || null,
            merge_keys: form.value.merge_keys,
            std_fields: form.value.std_fields,
            output_fields: form.value.output_fields,
            aggregate: form.value.aggregate,
            result_save_mode: form.value.result_save_mode,
            result_period_field: form.value.result_save_mode === 'field_period' ? form.value.result_period_field : null,
            mappings: form.value.mappings.map((m) => ({
                id: m.id || null,
                name: m.name,
                match_signature: m.match_signature || [],
                source_fields: m.source_fields || [],
                sheet_kw: m.sheet_kw || null,
                header_start: m.header_start || 1,
                header_end: m.header_end || 1,
                key_map: m.key_map || {},
                column_map: m.column_map || {},
                new_std_fields: m.new_std_fields || [],
                derived_fields: m.derived_fields || [],
                derive_check: m.derive_check || null,
                skip_tokens: m.skip_tokens || ['合计', '小计', '总计'],
            })),
        };
        if (editingId.value) {
            await tableToolsApi.updateTemplate(editingId.value, payload);
            if (showSuccess)
                ElMessage.success('模板已更新');
        }
        else {
            const created = await tableToolsApi.createTemplate(payload);
            editingId.value = created.id;
            if (showSuccess)
                ElMessage.success('模板已保存');
        }
        markSaved();
        if (returnToList) {
            await router.push({ name: 'TableMerge' });
        }
        else if (route.name === 'TableMergeNew' && editingId.value) {
            suppressNextRouteSync = true;
            try {
                await router.replace({ name: 'TableMergeEdit', params: { id: editingId.value } });
            }
            catch (error) {
                suppressNextRouteSync = false;
                throw error;
            }
        }
        return true;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        savingTpl.value = false;
    }
}
async function deleteTemplate(t) {
    await ElMessageBox.confirm(`确认删除模板「${t.name}」？`, '确认删除', {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    try {
        await tableToolsApi.deleteTemplate(t.id);
        ElMessage.success('已删除');
        await loadTemplates();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
// ── 月度合并（merge 模式） ────────────────────────────────────────────────────
const mergeTemplate = ref(null);
const mergeFiles = ref([]);
const merging = ref(false);
const downloading = ref(false);
const mergeResult = ref(null);
const resultPeriod = ref('');
const savingResult = ref(false);
const resultBatches = ref([]);
const historyResult = ref(null);
const historyLoading = ref(false);
function resultLoadError(e, fallback) {
    const status = e?.response?.status;
    const detail = e?.response?.data?.detail || fallback;
    if (status === 401)
        return `${detail}，请重新登录后再试`;
    if (status)
        return `${detail}（HTTP ${status}）`;
    return detail;
}
async function loadResultBatches(showError = false) {
    if (!mergeTemplate.value)
        return;
    try {
        resultBatches.value = await tableToolsApi.listResultBatches(mergeTemplate.value.id);
    }
    catch (e) {
        resultBatches.value = [];
        if (showError)
            ElMessage.error(resultLoadError(e, '加载历史结果失败'));
    }
}
function openMerge(t) {
    mergeTemplate.value = t;
    mergeFiles.value = [];
    mergeResult.value = null;
    resultPeriod.value = '';
    resultBatches.value = [];
    historyResult.value = null;
    mode.value = 'merge';
    void loadResultBatches();
}
async function handleMergeBack() {
    returnToTemplateList();
}
function handleMergeFileChange(uploadFile) {
    const file = uploadFile.raw;
    if (!mergeFiles.value.find((f) => f.name === file.name && f.size === file.size)) {
        mergeFiles.value.push(file);
    }
}
function removeMergeFile(index) { mergeFiles.value.splice(index, 1); }
async function runMerge() {
    if (!mergeTemplate.value || !mergeFiles.value.length)
        return;
    merging.value = true;
    mergeResult.value = null;
    try {
        mergeResult.value = await tableToolsApi.runMerge(mergeTemplate.value.id, mergeFiles.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '合并失败');
    }
    finally {
        merging.value = false;
    }
}
async function downloadResult() {
    if (!mergeTemplate.value || !mergeFiles.value.length)
        return;
    downloading.value = true;
    try {
        await tableToolsApi.downloadMerge(mergeTemplate.value.id, mergeFiles.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载失败');
    }
    finally {
        downloading.value = false;
    }
}
async function saveCurrentResult() {
    if (!mergeTemplate.value || !mergeResult.value?.preview_token)
        return;
    const mode = mergeTemplate.value.result_save_mode || 'input_period';
    let period;
    if (mode === 'input_period') {
        const input = await ElMessageBox.prompt('请输入业务月份（YYYYMM）', '保存结果', {
            inputValue: resultPeriod.value,
            inputPlaceholder: '例如 202606',
            inputPattern: /^\d{6}$/,
            inputErrorMessage: '请输入有效的业务月份 YYYYMM',
            confirmButtonText: '继续',
            cancelButtonText: '取消',
        }).catch(() => null);
        if (!input)
            return;
        period = input.value;
        resultPeriod.value = period;
    }
    else if (mode === 'field_period') {
        const field = mergeTemplate.value.result_period_field;
        const periods = [...new Set((mergeResult.value.rows || []).map((row) => String(row[field || ''] || '').trim()).filter(Boolean))];
        if (periods.length === 0) {
            ElMessage.error(`结果中未识别到业务月份字段“${field || ''}”，保存时将由服务端校验完整结果`);
        }
        else if (periods.length !== 1 || !/^\d{6}$/.test(periods[0]) || Number(periods[0].slice(4)) < 1 || Number(periods[0].slice(4)) > 12) {
            ElMessage.error('结果中必须包含唯一的有效业务月份');
            return;
        }
        else {
            period = periods[0];
        }
    }
    const label = mode === 'none' ? '当前结果快照' : `${period} 的结果`;
    try {
        await ElMessageBox.confirm(`将保存${label}的完整预览结果（共 ${mergeResult.value.total_rows} 行）。相同归集联合主键将整行覆盖，新主键将新增；本次未出现的既有数据不会删除，DWD 字段一并固化。`, '确认保存结果', { type: 'warning', confirmButtonText: '确认保存' });
    }
    catch {
        return;
    }
    savingResult.value = true;
    try {
        const saved = await tableToolsApi.saveResultBatch(mergeTemplate.value.id, mergeResult.value.preview_token, period);
        ElMessage.success(`保存完成：新增 ${saved.inserted_count} 行，覆盖 ${saved.replaced_count} 行，当前共 ${saved.total_count} 行`);
        await loadResultBatches(true);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存结果失败');
    }
    finally {
        savingResult.value = false;
    }
}
async function viewResultBatch(batch) {
    if (!mergeTemplate.value)
        return;
    historyLoading.value = true;
    try {
        historyResult.value = await tableToolsApi.getResultBatchRows(mergeTemplate.value.id, batch.id);
    }
    catch (e) {
        ElMessage.error(resultLoadError(e, '加载历史结果失败'));
    }
    finally {
        historyLoading.value = false;
    }
}
async function downloadResultBatch(batch) {
    if (!mergeTemplate.value)
        return;
    try {
        await tableToolsApi.downloadResultBatch(mergeTemplate.value.id, batch);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载历史结果失败');
    }
}
// ── 计算属性 ─────────────────────────────────────────────────────────────────
const mergeResultCols = computed(() => mergeResult.value?.columns || []);
const historyResultCols = computed(() => historyResult.value?.columns || []);
function mergeColumnLabel(column) {
    return mergeResult.value?.column_labels?.[column] || column;
}
function historyColumnLabel(column) {
    return historyResult.value?.column_labels?.[column] || column;
}
// key_map / column_map entries（用于 v-model 绑定）
const editingKeyMapEntries = computed({
    get: () => editingMapping.value ? (editingMapping.value._keyMapEntries || objToEntries(editingMapping.value.key_map || {})) : [],
    set: (v) => syncKeyMap(v),
});
const editingColMapEntries = computed({
    get: () => editingMapping.value ? (editingMapping.value._colMapEntries || objToEntries(editingMapping.value.column_map || {})) : [],
    set: (v) => syncColumnMap(v),
});
let syncingRoute = false;
let suppressNextRouteSync = false;
function routeTemplateId() {
    const id = Number(route.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
}
async function syncRouteState() {
    syncingRoute = true;
    try {
        if (route.name === 'TableMerge') {
            mode.value = 'list';
            await loadTemplates();
            return;
        }
        if (route.name === 'TableMergeNew') {
            mode.value = 'build';
            openNew();
            return;
        }
        const id = routeTemplateId();
        if (!id) {
            ElMessage.error('模板参数无效');
            await router.replace({ name: 'TableMerge' });
            return;
        }
        if (route.name === 'TableMergeEdit') {
            mode.value = 'build';
            if (!await openEdit(id))
                await router.replace({ name: 'TableMerge' });
            return;
        }
        if (route.name === 'TableMergeMapping') {
            mode.value = 'mapping';
            if (!await openAddMapping(id))
                await router.replace({ name: 'TableMerge' });
            return;
        }
        if (route.name === 'TableMergeRun') {
            mode.value = 'merge';
            try {
                openMerge(await tableToolsApi.getTemplate(id));
            }
            catch {
                ElMessage.error('加载模板详情失败');
                await router.replace({ name: 'TableMerge' });
            }
        }
    }
    finally {
        syncingRoute = false;
    }
}
async function confirmRouteNavigation() {
    if (syncingRoute || mode.value === 'list')
        return true;
    if (mode.value === 'build') {
        if (savingTpl.value)
            return false;
        if (!hasUnsavedChanges.value)
            return true;
        try {
            if (buildStep.value !== 'form') {
                await ElMessageBox.confirm('返回后，当前步骤尚未保存的内容将丢失。', '确认返回', {
                    type: 'warning', confirmButtonText: '返回', cancelButtonText: '继续编辑',
                });
                return true;
            }
            await ElMessageBox.confirm('当前页面有未保存的修改，是否保存后返回？', '确认返回', {
                type: 'warning', confirmButtonText: '保存后返回', cancelButtonText: '取消', distinguishCancelAndClose: true,
            });
            return await saveTemplate(false) === true;
        }
        catch (e) {
            if (e !== 'cancel' && e !== 'close')
                ElMessage.error('返回操作失败');
            return false;
        }
    }
    if (mode.value === 'mapping') {
        const hasDraft = mappingWizardFiles.value.length > 0
            || Boolean(mappingWizardContext.value.trim())
            || mappingWizardDrafts.value.length > 0;
        if (!hasDraft)
            return true;
        try {
            await ElMessageBox.confirm('返回后，本次上传和未保存的映射草稿将丢失。', '确认返回', {
                type: 'warning', confirmButtonText: '返回', cancelButtonText: '继续编辑',
            });
            return true;
        }
        catch (e) {
            if (e !== 'cancel' && e !== 'close')
                ElMessage.error('返回操作失败');
            return false;
        }
    }
    if (!mergeFiles.value.length && !mergeResult.value)
        return true;
    try {
        await ElMessageBox.confirm('返回后，本次上传文件和未保存的预览结果将被清除。', '确认返回', {
            type: 'warning', confirmButtonText: '返回', cancelButtonText: '继续操作',
        });
        return true;
    }
    catch (e) {
        if (e !== 'cancel' && e !== 'close')
            ElMessage.error('返回操作失败');
        return false;
    }
}
onBeforeRouteLeave(confirmRouteNavigation);
onBeforeRouteUpdate(confirmRouteNavigation);
watch(() => `${String(route.name)}:${String(route.params.id || '')}`, () => {
    if (suppressNextRouteSync) {
        suppressNextRouteSync = false;
        return;
    }
    void syncRouteState();
}, { immediate: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['config-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['el-upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['history-row']} */ ;
/** @type {__VLS_StyleScopedClasses['build-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-left']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cards']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tt-root" },
});
if (__VLS_ctx.mode === 'list') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "template-list-page" },
    });
    const __VLS_0 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ class: "template-list-surface" },
    }));
    const __VLS_2 = __VLS_1({
        ...{ class: "template-list-surface" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_3.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "template-list-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "template-list-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }));
        const __VLS_5 = __VLS_4({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
        let __VLS_7;
        let __VLS_8;
        let __VLS_9;
        const __VLS_10 = {
            onClick: (__VLS_ctx.openNewRoute)
        };
        __VLS_6.slots.default;
        var __VLS_6;
    }
    if (__VLS_ctx.listLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "list-loading" },
            'aria-label': "正在加载归集模板",
        });
        for (const [i] of __VLS_getVForSourceType((3))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
                ...{ class: "skeleton" },
                key: (i),
            });
        }
    }
    else if (__VLS_ctx.listError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
            role: "alert",
        });
        const __VLS_11 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
            ...{ class: "empty-icon" },
        }));
        const __VLS_13 = __VLS_12({
            ...{ class: "empty-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        __VLS_14.slots.default;
        const __VLS_15 = {}.Warning;
        /** @type {[typeof __VLS_components.Warning, ]} */ ;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
        const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
        var __VLS_14;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        (__VLS_ctx.listError);
        const __VLS_19 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
            ...{ 'onClick': {} },
            type: "primary",
        }));
        const __VLS_21 = __VLS_20({
            ...{ 'onClick': {} },
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
        let __VLS_23;
        let __VLS_24;
        let __VLS_25;
        const __VLS_26 = {
            onClick: (__VLS_ctx.loadTemplates)
        };
        __VLS_22.slots.default;
        var __VLS_22;
    }
    else if (!__VLS_ctx.templates.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-state" },
        });
        const __VLS_27 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
            ...{ class: "empty-icon" },
        }));
        const __VLS_29 = __VLS_28({
            ...{ class: "empty-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_28));
        __VLS_30.slots.default;
        const __VLS_31 = {}.Grid;
        /** @type {[typeof __VLS_components.Grid, ]} */ ;
        // @ts-ignore
        const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({}));
        const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
        var __VLS_30;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_35 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }));
        const __VLS_36 = __VLS_35({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "C",
            type: "primary",
            icon: (__VLS_ctx.Plus),
        }, ...__VLS_functionalComponentArgsRest(__VLS_35));
        let __VLS_38;
        let __VLS_39;
        let __VLS_40;
        const __VLS_41 = {
            onClick: (__VLS_ctx.openNewRoute)
        };
        __VLS_37.slots.default;
        var __VLS_37;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tpl-grid" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.templates))) {
            /** @type {[typeof TableMergeTemplateCard, ]} */ ;
            // @ts-ignore
            const __VLS_42 = __VLS_asFunctionalComponent(TableMergeTemplateCard, new TableMergeTemplateCard({
                ...{ 'onMerge': {} },
                ...{ 'onAdd': {} },
                ...{ 'onEdit': {} },
                ...{ 'onDelete': {} },
                key: (t.id),
                template: (t),
                canModify: (__VLS_ctx.canModify(t)),
            }));
            const __VLS_43 = __VLS_42({
                ...{ 'onMerge': {} },
                ...{ 'onAdd': {} },
                ...{ 'onEdit': {} },
                ...{ 'onDelete': {} },
                key: (t.id),
                template: (t),
                canModify: (__VLS_ctx.canModify(t)),
            }, ...__VLS_functionalComponentArgsRest(__VLS_42));
            let __VLS_45;
            let __VLS_46;
            let __VLS_47;
            const __VLS_48 = {
                onMerge: (__VLS_ctx.openMergeRoute)
            };
            const __VLS_49 = {
                onAdd: (__VLS_ctx.openMappingRoute)
            };
            const __VLS_50 = {
                onEdit: (__VLS_ctx.openEditRoute)
            };
            const __VLS_51 = {
                onDelete: (__VLS_ctx.deleteTemplate)
            };
            var __VLS_44;
        }
    }
    var __VLS_3;
}
else if (__VLS_ctx.mode === 'build') {
    /** @type {[typeof TableToolFullscreenShell, typeof TableToolFullscreenShell, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(TableToolFullscreenShell, new TableToolFullscreenShell({
        ...{ 'onBack': {} },
        ...{ 'onStepChange': {} },
        title: (__VLS_ctx.editingId ? '编辑模板' : '新建归集模板'),
        steps: (__VLS_ctx.buildStep === 'form' ? __VLS_ctx.workflowSteps : []),
        activeStep: (__VLS_ctx.activeConfigTab),
    }));
    const __VLS_53 = __VLS_52({
        ...{ 'onBack': {} },
        ...{ 'onStepChange': {} },
        title: (__VLS_ctx.editingId ? '编辑模板' : '新建归集模板'),
        steps: (__VLS_ctx.buildStep === 'form' ? __VLS_ctx.workflowSteps : []),
        activeStep: (__VLS_ctx.activeConfigTab),
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    let __VLS_55;
    let __VLS_56;
    let __VLS_57;
    const __VLS_58 = {
        onBack: (__VLS_ctx.handleBuildBack)
    };
    const __VLS_59 = {
        onStepChange: (__VLS_ctx.goToConfigStep)
    };
    __VLS_54.slots.default;
    {
        const { actions: __VLS_thisSlot } = __VLS_54.slots;
        if (__VLS_ctx.buildStep === 'form') {
            const __VLS_60 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
                ...{ 'onClick': {} },
                ...{ class: "workflow-action" },
                disabled: (__VLS_ctx.workflowStepIndex <= 0),
            }));
            const __VLS_62 = __VLS_61({
                ...{ 'onClick': {} },
                ...{ class: "workflow-action" },
                disabled: (__VLS_ctx.workflowStepIndex <= 0),
            }, ...__VLS_functionalComponentArgsRest(__VLS_61));
            let __VLS_64;
            let __VLS_65;
            let __VLS_66;
            const __VLS_67 = {
                onClick: (__VLS_ctx.goToPreviousStep)
            };
            __VLS_63.slots.default;
            var __VLS_63;
        }
        if (__VLS_ctx.buildStep === 'form') {
            const __VLS_68 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                ...{ 'onClick': {} },
                ...{ class: "workflow-action" },
                type: "primary",
            }));
            const __VLS_70 = __VLS_69({
                ...{ 'onClick': {} },
                ...{ class: "workflow-action" },
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            let __VLS_72;
            let __VLS_73;
            let __VLS_74;
            const __VLS_75 = {
                onClick: (__VLS_ctx.goToNextStep)
            };
            __VLS_71.slots.default;
            (__VLS_ctx.isLastWorkflowStep ? '完成' : '下一步');
            var __VLS_71;
        }
    }
    if (__VLS_ctx.buildStep === 'upload') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-upload-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "upload-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "upload-sub" },
        });
        const __VLS_76 = {}.ElUpload;
        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleTplFileChange),
            ...{ class: "upload-dragger" },
        }));
        const __VLS_78 = __VLS_77({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleTplFileChange),
            ...{ class: "upload-dragger" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        const __VLS_80 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ class: "upload-icon" },
        }));
        const __VLS_82 = __VLS_81({
            ...{ class: "upload-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        const __VLS_84 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({}));
        const __VLS_86 = __VLS_85({}, ...__VLS_functionalComponentArgsRest(__VLS_85));
        var __VLS_83;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-hint" },
        });
        var __VLS_79;
        if (__VLS_ctx.tplFiles.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chips" },
            });
            for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.tplFiles))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "file-chip" },
                    key: (i),
                });
                const __VLS_88 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
                const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
                __VLS_91.slots.default;
                const __VLS_92 = {}.Document;
                /** @type {[typeof __VLS_components.Document, ]} */ ;
                // @ts-ignore
                const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
                const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
                var __VLS_91;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (f.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!(__VLS_ctx.tplFiles.length))
                                return;
                            __VLS_ctx.removeTplFile(i);
                        } },
                    ...{ class: "chip-remove" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "context-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "context-label" },
        });
        const __VLS_96 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            modelValue: (__VLS_ctx.aiContext),
            type: "textarea",
            rows: (3),
            placeholder: "描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。",
        }));
        const __VLS_98 = __VLS_97({
            modelValue: (__VLS_ctx.aiContext),
            type: "textarea",
            rows: (3),
            placeholder: "描述本次归集的场景与你想要的标准字段，AI 会据此决定字段清单和合并粒度。可包含：&#10;· 归集场景（如：月度社保公积金、考勤汇总、报销明细）&#10;· 想要哪些标准字段、合并到什么粗细（如：每类只保留个人/单位两项，忽略基数与比例）&#10;· 哪些列要忽略、用什么作归集主键&#10;描述越具体，AI 生成的模板越贴近预期，需要手工调整的越少。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-actions" },
        });
        const __VLS_100 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onClick': {} },
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onClick: (__VLS_ctx.skipToManual)
        };
        __VLS_103.slots.default;
        var __VLS_103;
        const __VLS_108 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.tplFiles.length),
        }));
        const __VLS_110 = __VLS_109({
            ...{ 'onClick': {} },
            type: "primary",
            icon: (__VLS_ctx.MagicStick),
            disabled: (!__VLS_ctx.tplFiles.length),
        }, ...__VLS_functionalComponentArgsRest(__VLS_109));
        let __VLS_112;
        let __VLS_113;
        let __VLS_114;
        const __VLS_115 = {
            onClick: (__VLS_ctx.runAiDraft)
        };
        __VLS_111.slots.default;
        var __VLS_111;
    }
    else if (__VLS_ctx.buildStep === 'ai') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-loading-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-spinner" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
        });
        const __VLS_116 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            ...{ class: "spinner-icon" },
        }));
        const __VLS_118 = __VLS_117({
            ...{ class: "spinner-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        const __VLS_120 = {}.MagicStick;
        /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
        const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
        var __VLS_119;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "ai-loading-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "ai-loading-sub" },
        });
        (__VLS_ctx.tplFiles.length);
    }
    else {
        if (__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId) {
            if (__VLS_ctx.draft?._meta?.low_confidence?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "confidence-alert" },
                });
                const __VLS_124 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
                const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
                __VLS_127.slots.default;
                const __VLS_128 = {}.Warning;
                /** @type {[typeof __VLS_components.Warning, ]} */ ;
                // @ts-ignore
                const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
                const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
                var __VLS_127;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                for (const [lc] of __VLS_getVForSourceType((__VLS_ctx.draft._meta.low_confidence))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({
                        key: (lc.sheet),
                        ...{ style: {} },
                    });
                    (lc.sheet);
                    (Math.round(lc.confidence * 100));
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "build-layout" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "build-left" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "form-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "field-group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label required" },
            });
            const __VLS_132 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                modelValue: (__VLS_ctx.form.name),
                placeholder: "如：社保月度归集",
            }));
            const __VLS_134 = __VLS_133({
                modelValue: (__VLS_ctx.form.name),
                placeholder: "如：社保月度归集",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "field-group" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "field-label" },
            });
            const __VLS_136 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                modelValue: (__VLS_ctx.form.description),
                placeholder: "可选",
            }));
            const __VLS_138 = __VLS_137({
                modelValue: (__VLS_ctx.form.description),
                placeholder: "可选",
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            const __VLS_140 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                modelValue: (__VLS_ctx.form.merge_keys),
                multiple: true,
                allowCreate: true,
                filterable: true,
                placeholder: "输入后回车",
                ...{ style: {} },
            }));
            const __VLS_142 = __VLS_141({
                modelValue: (__VLS_ctx.form.merge_keys),
                multiple: true,
                allowCreate: true,
                filterable: true,
                placeholder: "输入后回车",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            __VLS_143.slots.default;
            for (const [k] of __VLS_getVForSourceType((__VLS_ctx.form.merge_keys))) {
                const __VLS_144 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                    key: (k),
                    label: (k),
                    value: (k),
                }));
                const __VLS_146 = __VLS_145({
                    key: (k),
                    label: (k),
                    value: (k),
                }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            }
            var __VLS_143;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "form-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "required-mark" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "std-tags" },
            });
            for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                const __VLS_148 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                    ...{ 'onClose': {} },
                    ...{ 'onDragstart': {} },
                    ...{ 'onDragend': {} },
                    ...{ 'onDragover': {} },
                    ...{ 'onDrop': {} },
                    key: (f),
                    closable: true,
                    ...{ class: "std-tag" },
                    draggable: "true",
                }));
                const __VLS_150 = __VLS_149({
                    ...{ 'onClose': {} },
                    ...{ 'onDragstart': {} },
                    ...{ 'onDragend': {} },
                    ...{ 'onDragover': {} },
                    ...{ 'onDrop': {} },
                    key: (f),
                    closable: true,
                    ...{ class: "std-tag" },
                    draggable: "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_149));
                let __VLS_152;
                let __VLS_153;
                let __VLS_154;
                const __VLS_155 = {
                    onClose: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                            return;
                        __VLS_ctx.removeStdField(f);
                    }
                };
                const __VLS_156 = {
                    onDragstart: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                            return;
                        __VLS_ctx.draggingStdField = f;
                    }
                };
                const __VLS_157 = {
                    onDragend: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                            return;
                        __VLS_ctx.draggingStdField = '';
                    }
                };
                const __VLS_158 = {
                    onDragover: () => { }
                };
                const __VLS_159 = {
                    onDrop: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                            return;
                        __VLS_ctx.reorderStdField(__VLS_ctx.draggingStdField, f);
                        __VLS_ctx.draggingStdField = '';
                    }
                };
                __VLS_151.slots.default;
                (f);
                var __VLS_151;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "std-add" },
            });
            const __VLS_160 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.stdFieldInput),
                placeholder: "输入字段名后添加",
                size: "small",
            }));
            const __VLS_162 = __VLS_161({
                ...{ 'onKeyup': {} },
                modelValue: (__VLS_ctx.stdFieldInput),
                placeholder: "输入字段名后添加",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_161));
            let __VLS_164;
            let __VLS_165;
            let __VLS_166;
            const __VLS_167 = {
                onKeyup: (__VLS_ctx.addStdField)
            };
            var __VLS_163;
            const __VLS_168 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_170 = __VLS_169({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_169));
            let __VLS_172;
            let __VLS_173;
            let __VLS_174;
            const __VLS_175 = {
                onClick: (__VLS_ctx.addStdField)
            };
            __VLS_171.slots.default;
            var __VLS_171;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "form-section" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            const __VLS_176 = {}.ElRadioGroup;
            /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
            // @ts-ignore
            const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.form.result_save_mode),
            }));
            const __VLS_178 = __VLS_177({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.form.result_save_mode),
            }, ...__VLS_functionalComponentArgsRest(__VLS_177));
            let __VLS_180;
            let __VLS_181;
            let __VLS_182;
            const __VLS_183 = {
                onChange: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                        return;
                    __VLS_ctx.form.result_period_field = __VLS_ctx.form.result_save_mode === 'field_period' ? __VLS_ctx.form.result_period_field : null;
                }
            };
            __VLS_179.slots.default;
            const __VLS_184 = {}.ElRadio;
            /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
            // @ts-ignore
            const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                label: "none",
            }));
            const __VLS_186 = __VLS_185({
                label: "none",
            }, ...__VLS_functionalComponentArgsRest(__VLS_185));
            __VLS_187.slots.default;
            var __VLS_187;
            const __VLS_188 = {}.ElRadio;
            /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                label: "input_period",
            }));
            const __VLS_190 = __VLS_189({
                label: "input_period",
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            __VLS_191.slots.default;
            var __VLS_191;
            const __VLS_192 = {}.ElRadio;
            /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
            // @ts-ignore
            const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                label: "field_period",
            }));
            const __VLS_194 = __VLS_193({
                label: "field_period",
            }, ...__VLS_functionalComponentArgsRest(__VLS_193));
            __VLS_195.slots.default;
            var __VLS_195;
            var __VLS_179;
            if (__VLS_ctx.form.result_save_mode === 'field_period') {
                const __VLS_196 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                    modelValue: (__VLS_ctx.form.result_period_field),
                    placeholder: "选择业务月份字段",
                    ...{ style: {} },
                }));
                const __VLS_198 = __VLS_197({
                    modelValue: (__VLS_ctx.form.result_period_field),
                    placeholder: "选择业务月份字段",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_197));
                __VLS_199.slots.default;
                for (const [field] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                    const __VLS_200 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                        key: (field),
                        label: (field),
                        value: (field),
                    }));
                    const __VLS_202 = __VLS_201({
                        key: (field),
                        label: (field),
                        value: (field),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                }
                var __VLS_199;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "build-right" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mappings-header" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "mappings-count" },
            });
            (__VLS_ctx.form.mappings.length);
            if (__VLS_ctx.editingId) {
                const __VLS_204 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    plain: true,
                    icon: (__VLS_ctx.Plus),
                }));
                const __VLS_206 = __VLS_205({
                    ...{ 'onClick': {} },
                    size: "small",
                    type: "primary",
                    plain: true,
                    icon: (__VLS_ctx.Plus),
                }, ...__VLS_functionalComponentArgsRest(__VLS_205));
                let __VLS_208;
                let __VLS_209;
                let __VLS_210;
                const __VLS_211 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                            return;
                        if (!(__VLS_ctx.editingId))
                            return;
                        __VLS_ctx.openAddMapping(__VLS_ctx.editingId);
                    }
                };
                __VLS_207.slots.default;
                var __VLS_207;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
                ...{ style: {} },
            });
            if (!__VLS_ctx.form.mappings.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mappings-empty" },
                });
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-list" },
            });
            for (const [m, idx] of __VLS_getVForSourceType((__VLS_ctx.form.mappings))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (idx),
                    ...{ class: "mapping-item" },
                    ...{ class: ({ expanded: __VLS_ctx.expandedMapping === idx }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                return;
                            __VLS_ctx.expandedMapping === idx ? __VLS_ctx.cancelEditMapping() : __VLS_ctx.startEditMapping(idx);
                        } },
                    ...{ class: "mapping-header" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mapping-header-left" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mapping-chevron" },
                    ...{ class: ({ rotated: __VLS_ctx.expandedMapping === idx }) },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mapping-name" },
                });
                (m.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "mapping-meta" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (m.header_start);
                (m.header_end);
                if (m.sheet_kw) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    (m.sheet_kw);
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (Object.keys(m.column_map || {}).length);
                if (__VLS_ctx.aiLowConfidence(m.name)) {
                    const __VLS_212 = {}.ElTag;
                    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                    // @ts-ignore
                    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                        type: "warning",
                        size: "small",
                    }));
                    const __VLS_214 = __VLS_213({
                        type: "warning",
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
                    __VLS_215.slots.default;
                    (Math.round((__VLS_ctx.aiLowConfidence(m.name)?.confidence || 0) * 100));
                    var __VLS_215;
                }
                if (__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "mapping-editor" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-row" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_216 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
                        modelValue: (__VLS_ctx.editingMapping.name),
                        size: "small",
                        placeholder: "例如：北京-公积金导出表",
                    }));
                    const __VLS_218 = __VLS_217({
                        modelValue: (__VLS_ctx.editingMapping.name),
                        size: "small",
                        placeholder: "例如：北京-公积金导出表",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_220 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                        ...{ 'onUpdate:modelValue': {} },
                        modelValue: ((__VLS_ctx.editingMapping.match_signature || []).join(',')),
                        size: "small",
                        placeholder: "姓名,证件号码,缴存基数",
                    }));
                    const __VLS_222 = __VLS_221({
                        ...{ 'onUpdate:modelValue': {} },
                        modelValue: ((__VLS_ctx.editingMapping.match_signature || []).join(',')),
                        size: "small",
                        placeholder: "姓名,证件号码,缴存基数",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
                    let __VLS_224;
                    let __VLS_225;
                    let __VLS_226;
                    const __VLS_227 = {
                        'onUpdate:modelValue': (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.editingMapping.match_signature = $event.split(',').map((v) => v.trim()).filter(Boolean);
                        }
                    };
                    var __VLS_223;
                    if (__VLS_ctx.editingId) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "editor-row" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "editor-field" },
                        });
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                            ...{ class: "editor-label" },
                        });
                        const __VLS_228 = {}.ElUpload;
                        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
                        // @ts-ignore
                        const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
                            autoUpload: (false),
                            showFileList: (false),
                            accept: ".xlsx",
                            disabled: (__VLS_ctx.mappingDraftLoading),
                            onChange: (__VLS_ctx.handleMappingSample),
                        }));
                        const __VLS_230 = __VLS_229({
                            autoUpload: (false),
                            showFileList: (false),
                            accept: ".xlsx",
                            disabled: (__VLS_ctx.mappingDraftLoading),
                            onChange: (__VLS_ctx.handleMappingSample),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_229));
                        __VLS_231.slots.default;
                        const __VLS_232 = {}.ElButton;
                        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                        // @ts-ignore
                        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                            size: "small",
                            loading: (__VLS_ctx.mappingDraftLoading),
                            icon: (__VLS_ctx.Upload),
                        }));
                        const __VLS_234 = __VLS_233({
                            size: "small",
                            loading: (__VLS_ctx.mappingDraftLoading),
                            icon: (__VLS_ctx.Upload),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
                        __VLS_235.slots.default;
                        var __VLS_235;
                        var __VLS_231;
                        if (__VLS_ctx.mappingDraftSheets.length > 1) {
                            const __VLS_236 = {}.ElSelect;
                            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                            // @ts-ignore
                            const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
                                ...{ 'onChange': {} },
                                modelValue: (__VLS_ctx.mappingDraftSheet),
                                size: "small",
                                placeholder: "选择要解析的 Sheet",
                                ...{ style: {} },
                            }));
                            const __VLS_238 = __VLS_237({
                                ...{ 'onChange': {} },
                                modelValue: (__VLS_ctx.mappingDraftSheet),
                                size: "small",
                                placeholder: "选择要解析的 Sheet",
                                ...{ style: {} },
                            }, ...__VLS_functionalComponentArgsRest(__VLS_237));
                            let __VLS_240;
                            let __VLS_241;
                            let __VLS_242;
                            const __VLS_243 = {
                                onChange: (__VLS_ctx.reloadMappingDraft)
                            };
                            __VLS_239.slots.default;
                            for (const [sheet] of __VLS_getVForSourceType((__VLS_ctx.mappingDraftSheets))) {
                                const __VLS_244 = {}.ElOption;
                                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                                // @ts-ignore
                                const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
                                    key: (sheet),
                                    label: (sheet),
                                    value: (sheet),
                                }));
                                const __VLS_246 = __VLS_245({
                                    key: (sheet),
                                    label: (sheet),
                                    value: (sheet),
                                }, ...__VLS_functionalComponentArgsRest(__VLS_245));
                            }
                            var __VLS_239;
                        }
                        if (__VLS_ctx.mappingDraftLowConfidence) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                ...{ class: "ai-notes" },
                            });
                            (Math.round(__VLS_ctx.mappingDraftLowConfidence.confidence * 100));
                            (__VLS_ctx.mappingDraftLowConfidence.notes);
                        }
                        for (const [warning] of __VLS_getVForSourceType((__VLS_ctx.mappingDraftWarnings))) {
                            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                                key: (warning),
                                ...{ class: "ai-notes" },
                            });
                            (warning);
                        }
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-row" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_248 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                        modelValue: (__VLS_ctx.editingMapping.sheet_kw),
                        size: "small",
                        placeholder: "留空匹配全部 sheet",
                    }));
                    const __VLS_250 = __VLS_249({
                        modelValue: (__VLS_ctx.editingMapping.sheet_kw),
                        size: "small",
                        placeholder: "留空匹配全部 sheet",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_252 = {}.ElInputNumber;
                    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                    // @ts-ignore
                    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
                        modelValue: (__VLS_ctx.editingMapping.header_start),
                        min: (1),
                        max: (10),
                        size: "small",
                    }));
                    const __VLS_254 = __VLS_253({
                        modelValue: (__VLS_ctx.editingMapping.header_start),
                        min: (1),
                        max: (10),
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-field" },
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                        ...{ class: "editor-label" },
                    });
                    const __VLS_256 = {}.ElInputNumber;
                    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                    // @ts-ignore
                    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
                        modelValue: (__VLS_ctx.editingMapping.header_end),
                        min: (1),
                        max: (10),
                        size: "small",
                    }));
                    const __VLS_258 = __VLS_257({
                        modelValue: (__VLS_ctx.editingMapping.header_end),
                        min: (1),
                        max: (10),
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section-header" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (__VLS_ctx.addKeyMapEntry) },
                        ...{ class: "add-row-btn" },
                        disabled: (!__VLS_ctx.editingMapping.source_fields?.length),
                    });
                    if (!__VLS_ctx.editingMapping.source_fields?.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "derived-empty" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-table" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-row map-row-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    for (const [entry, ei] of __VLS_getVForSourceType((__VLS_ctx.editingKeyMapEntries))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "map-row" },
                            key: (ei),
                        });
                        const __VLS_260 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                            ...{ 'onChange': {} },
                            modelValue: (entry.key),
                            size: "small",
                            filterable: true,
                            placeholder: "选择源列名",
                        }));
                        const __VLS_262 = __VLS_261({
                            ...{ 'onChange': {} },
                            modelValue: (entry.key),
                            size: "small",
                            filterable: true,
                            placeholder: "选择源列名",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_261));
                        let __VLS_264;
                        let __VLS_265;
                        let __VLS_266;
                        const __VLS_267 = {
                            onChange: (...[$event]) => {
                                if (!!(__VLS_ctx.mode === 'list'))
                                    return;
                                if (!(__VLS_ctx.mode === 'build'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'upload'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'ai'))
                                    return;
                                if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                    return;
                                if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                    return;
                                __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries);
                            }
                        };
                        __VLS_263.slots.default;
                        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.editingMapping.source_fields || []))) {
                            const __VLS_268 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                                key: (field),
                                label: (field),
                                value: (field),
                            }));
                            const __VLS_270 = __VLS_269({
                                key: (field),
                                label: (field),
                                value: (field),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_269));
                        }
                        var __VLS_263;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "map-arrow" },
                        });
                        const __VLS_272 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
                            ...{ 'onChange': {} },
                            modelValue: (entry.val),
                            size: "small",
                            filterable: true,
                        }));
                        const __VLS_274 = __VLS_273({
                            ...{ 'onChange': {} },
                            modelValue: (entry.val),
                            size: "small",
                            filterable: true,
                        }, ...__VLS_functionalComponentArgsRest(__VLS_273));
                        let __VLS_276;
                        let __VLS_277;
                        let __VLS_278;
                        const __VLS_279 = {
                            onChange: (...[$event]) => {
                                if (!!(__VLS_ctx.mode === 'list'))
                                    return;
                                if (!(__VLS_ctx.mode === 'build'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'upload'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'ai'))
                                    return;
                                if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                    return;
                                if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                    return;
                                __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries);
                            }
                        };
                        __VLS_275.slots.default;
                        for (const [k] of __VLS_getVForSourceType((__VLS_ctx.form.merge_keys))) {
                            const __VLS_280 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                                key: (k),
                                label: (k),
                                value: (k),
                            }));
                            const __VLS_282 = __VLS_281({
                                key: (k),
                                label: (k),
                                value: (k),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
                        }
                        var __VLS_275;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (() => { __VLS_ctx.editingKeyMapEntries.splice(ei, 1); __VLS_ctx.syncKeyMap(__VLS_ctx.editingKeyMapEntries); }) },
                            ...{ class: "del-row-btn" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section-header" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (__VLS_ctx.addColumnMapEntry) },
                        ...{ class: "add-row-btn" },
                        disabled: (!__VLS_ctx.editingMapping.source_fields?.length),
                    });
                    if (!__VLS_ctx.editingMapping.source_fields?.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "derived-empty" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-table" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "map-row map-row-head" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    for (const [entry, ei] of __VLS_getVForSourceType((__VLS_ctx.editingColMapEntries))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "map-row" },
                            key: (ei),
                        });
                        const __VLS_284 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                            ...{ 'onChange': {} },
                            modelValue: (entry.key),
                            size: "small",
                            filterable: true,
                            placeholder: "选择源列名",
                        }));
                        const __VLS_286 = __VLS_285({
                            ...{ 'onChange': {} },
                            modelValue: (entry.key),
                            size: "small",
                            filterable: true,
                            placeholder: "选择源列名",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_285));
                        let __VLS_288;
                        let __VLS_289;
                        let __VLS_290;
                        const __VLS_291 = {
                            onChange: (...[$event]) => {
                                if (!!(__VLS_ctx.mode === 'list'))
                                    return;
                                if (!(__VLS_ctx.mode === 'build'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'upload'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'ai'))
                                    return;
                                if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                    return;
                                if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                    return;
                                __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries);
                            }
                        };
                        __VLS_287.slots.default;
                        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.editingMapping.source_fields || []))) {
                            const __VLS_292 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
                                key: (field),
                                label: (field),
                                value: (field),
                            }));
                            const __VLS_294 = __VLS_293({
                                key: (field),
                                label: (field),
                                value: (field),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_293));
                        }
                        var __VLS_287;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "map-arrow" },
                        });
                        const __VLS_296 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                            ...{ 'onChange': {} },
                            modelValue: (entry.val),
                            size: "small",
                            filterable: true,
                        }));
                        const __VLS_298 = __VLS_297({
                            ...{ 'onChange': {} },
                            modelValue: (entry.val),
                            size: "small",
                            filterable: true,
                        }, ...__VLS_functionalComponentArgsRest(__VLS_297));
                        let __VLS_300;
                        let __VLS_301;
                        let __VLS_302;
                        const __VLS_303 = {
                            onChange: (...[$event]) => {
                                if (!!(__VLS_ctx.mode === 'list'))
                                    return;
                                if (!(__VLS_ctx.mode === 'build'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'upload'))
                                    return;
                                if (!!(__VLS_ctx.buildStep === 'ai'))
                                    return;
                                if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                    return;
                                if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                    return;
                                __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries);
                            }
                        };
                        __VLS_299.slots.default;
                        for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                            const __VLS_304 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
                                key: (f),
                                label: (f),
                                value: (f),
                            }));
                            const __VLS_306 = __VLS_305({
                                key: (f),
                                label: (f),
                                value: (f),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_305));
                        }
                        var __VLS_299;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (() => { __VLS_ctx.editingColMapEntries.splice(ei, 1); __VLS_ctx.syncColumnMap(__VLS_ctx.editingColMapEntries); }) },
                            ...{ class: "del-row-btn" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-section-header" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (__VLS_ctx.addDerivedField) },
                        ...{ class: "add-row-btn" },
                    });
                    if (!__VLS_ctx.editingMapping.derived_fields?.length) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "derived-empty" },
                        });
                    }
                    for (const [df, di] of __VLS_getVForSourceType((__VLS_ctx.editingMapping.derived_fields))) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "derived-row" },
                            key: (di),
                        });
                        const __VLS_308 = {}.ElSelect;
                        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                        // @ts-ignore
                        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
                            modelValue: (df.target),
                            size: "small",
                            filterable: true,
                            placeholder: "目标标准字段",
                            ...{ style: {} },
                        }));
                        const __VLS_310 = __VLS_309({
                            modelValue: (df.target),
                            size: "small",
                            filterable: true,
                            placeholder: "目标标准字段",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
                        __VLS_311.slots.default;
                        for (const [f] of __VLS_getVForSourceType((__VLS_ctx.form.std_fields))) {
                            const __VLS_312 = {}.ElOption;
                            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                            // @ts-ignore
                            const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
                                key: (f),
                                label: (f),
                                value: (f),
                            }));
                            const __VLS_314 = __VLS_313({
                                key: (f),
                                label: (f),
                                value: (f),
                            }, ...__VLS_functionalComponentArgsRest(__VLS_313));
                        }
                        var __VLS_311;
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ class: "map-arrow" },
                        });
                        const __VLS_316 = {}.ElInput;
                        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                        // @ts-ignore
                        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
                            modelValue: (df.expr),
                            size: "small",
                            placeholder: "{标准字段A}+{标准字段B}",
                            ...{ style: {} },
                        }));
                        const __VLS_318 = __VLS_317({
                            modelValue: (df.expr),
                            size: "small",
                            placeholder: "{标准字段A}+{标准字段B}",
                            ...{ style: {} },
                        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
                        const __VLS_320 = {}.ElInputNumber;
                        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                        // @ts-ignore
                        const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
                            modelValue: (df.round),
                            min: (0),
                            max: (6),
                            size: "small",
                            ...{ style: {} },
                            controls: (false),
                            placeholder: "小数位",
                        }));
                        const __VLS_322 = __VLS_321({
                            modelValue: (df.round),
                            min: (0),
                            max: (6),
                            size: "small",
                            ...{ style: {} },
                            controls: (false),
                            placeholder: "小数位",
                        }, ...__VLS_functionalComponentArgsRest(__VLS_321));
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                            ...{ onClick: (...[$event]) => {
                                    if (!!(__VLS_ctx.mode === 'list'))
                                        return;
                                    if (!(__VLS_ctx.mode === 'build'))
                                        return;
                                    if (!!(__VLS_ctx.buildStep === 'upload'))
                                        return;
                                    if (!!(__VLS_ctx.buildStep === 'ai'))
                                        return;
                                    if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                        return;
                                    if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                        return;
                                    __VLS_ctx.removeDerivedField(di);
                                } },
                            ...{ class: "del-row-btn" },
                        });
                    }
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "editor-actions" },
                    });
                    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_324 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                        ...{ 'onClick': {} },
                        menu: "table_tools",
                        op: "D",
                        size: "small",
                        type: "danger",
                    }));
                    const __VLS_325 = __VLS_324({
                        ...{ 'onClick': {} },
                        menu: "table_tools",
                        op: "D",
                        size: "small",
                        type: "danger",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_324));
                    let __VLS_327;
                    let __VLS_328;
                    let __VLS_329;
                    const __VLS_330 = {
                        onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.removeMapping(idx);
                        }
                    };
                    __VLS_326.slots.default;
                    var __VLS_326;
                    const __VLS_331 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({
                        ...{ 'onClick': {} },
                        size: "small",
                    }));
                    const __VLS_333 = __VLS_332({
                        ...{ 'onClick': {} },
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_332));
                    let __VLS_335;
                    let __VLS_336;
                    let __VLS_337;
                    const __VLS_338 = {
                        onClick: (__VLS_ctx.cancelEditMapping)
                    };
                    __VLS_334.slots.default;
                    var __VLS_334;
                    const __VLS_339 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "primary",
                        icon: (__VLS_ctx.CircleCheck),
                    }));
                    const __VLS_341 = __VLS_340({
                        ...{ 'onClick': {} },
                        size: "small",
                        type: "primary",
                        icon: (__VLS_ctx.CircleCheck),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_340));
                    let __VLS_343;
                    let __VLS_344;
                    let __VLS_345;
                    const __VLS_346 = {
                        onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.activeConfigTab === 'base' || !__VLS_ctx.editingId))
                                return;
                            if (!(__VLS_ctx.expandedMapping === idx && __VLS_ctx.editingMapping))
                                return;
                            __VLS_ctx.saveEditMapping();
                        }
                    };
                    __VLS_342.slots.default;
                    var __VLS_342;
                    if (__VLS_ctx.aiLowConfidence(m.name)?.notes) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "ai-notes" },
                        });
                        (__VLS_ctx.aiLowConfidence(m.name)?.notes);
                    }
                }
            }
        }
        if (__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'key') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "advanced-config-panel" },
            });
            /** @type {[typeof TableMergeKeyMappingPanel, ]} */ ;
            // @ts-ignore
            const __VLS_347 = __VLS_asFunctionalComponent(TableMergeKeyMappingPanel, new TableMergeKeyMappingPanel({
                ...{ 'onUpdate:draft': {} },
                ...{ 'onCreate': {} },
                ...{ 'onEdit': {} },
                ...{ 'onCancel': {} },
                ...{ 'onSave': {} },
                ...{ 'onDelete': {} },
                ...{ 'onToggle': {} },
                ...{ 'onRetry': {} },
                mergeKeys: (__VLS_ctx.form.merge_keys),
                mappings: (__VLS_ctx.keyMappings),
                draft: (__VLS_ctx.keyMappingDraft),
                loading: (__VLS_ctx.keyMappingsLoading),
                error: (__VLS_ctx.keyMappingsError),
                saveError: (__VLS_ctx.keyMappingSaveError),
                saving: (__VLS_ctx.keyMappingSaving),
                togglingIds: (__VLS_ctx.keyMappingTogglingIds),
                canUpdate: (__VLS_ctx.userStore.hasOp('table_tools', 'U')),
            }));
            const __VLS_348 = __VLS_347({
                ...{ 'onUpdate:draft': {} },
                ...{ 'onCreate': {} },
                ...{ 'onEdit': {} },
                ...{ 'onCancel': {} },
                ...{ 'onSave': {} },
                ...{ 'onDelete': {} },
                ...{ 'onToggle': {} },
                ...{ 'onRetry': {} },
                mergeKeys: (__VLS_ctx.form.merge_keys),
                mappings: (__VLS_ctx.keyMappings),
                draft: (__VLS_ctx.keyMappingDraft),
                loading: (__VLS_ctx.keyMappingsLoading),
                error: (__VLS_ctx.keyMappingsError),
                saveError: (__VLS_ctx.keyMappingSaveError),
                saving: (__VLS_ctx.keyMappingSaving),
                togglingIds: (__VLS_ctx.keyMappingTogglingIds),
                canUpdate: (__VLS_ctx.userStore.hasOp('table_tools', 'U')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_347));
            let __VLS_350;
            let __VLS_351;
            let __VLS_352;
            const __VLS_353 = {
                'onUpdate:draft': (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'key'))
                        return;
                    __VLS_ctx.keyMappingDraft = $event;
                }
            };
            const __VLS_354 = {
                onCreate: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'key'))
                        return;
                    __VLS_ctx.startKeyMapping();
                }
            };
            const __VLS_355 = {
                onEdit: (__VLS_ctx.startKeyMapping)
            };
            const __VLS_356 = {
                onCancel: (__VLS_ctx.cancelKeyMapping)
            };
            const __VLS_357 = {
                onSave: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'key'))
                        return;
                    __VLS_ctx.saveKeyMapping();
                }
            };
            const __VLS_358 = {
                onDelete: (__VLS_ctx.removeKeyMapping)
            };
            const __VLS_359 = {
                onToggle: (__VLS_ctx.toggleKeyMapping)
            };
            const __VLS_360 = {
                onRetry: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'key'))
                        return;
                    __VLS_ctx.loadKeyMappings();
                }
            };
            var __VLS_349;
        }
        if (__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "advanced-config-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-panel-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_361 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "table_tools",
                op: "U",
                type: "primary",
                size: "small",
                icon: (__VLS_ctx.Plus),
            }));
            const __VLS_362 = __VLS_361({
                ...{ 'onClick': {} },
                menu: "table_tools",
                op: "U",
                type: "primary",
                size: "small",
                icon: (__VLS_ctx.Plus),
            }, ...__VLS_functionalComponentArgsRest(__VLS_361));
            let __VLS_364;
            let __VLS_365;
            let __VLS_366;
            const __VLS_367 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.buildStep === 'ai'))
                        return;
                    if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd'))
                        return;
                    __VLS_ctx.startDwdRelation();
                }
            };
            __VLS_363.slots.default;
            var __VLS_363;
            if (__VLS_ctx.dwdRelationDraft) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-editor" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_368 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
                    modelValue: (__VLS_ctx.dwdRelationDraft.name),
                }));
                const __VLS_370 = __VLS_369({
                    modelValue: (__VLS_ctx.dwdRelationDraft.name),
                }, ...__VLS_functionalComponentArgsRest(__VLS_369));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_372 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_373 = __VLS_asFunctionalComponent(__VLS_372, new __VLS_372({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.dwdRelationDraft.dataset_id),
                    filterable: true,
                    loading: (__VLS_ctx.dwdFieldsLoading),
                    placeholder: "选择当前用户可访问的 DWD 数据集",
                    ...{ style: {} },
                }));
                const __VLS_374 = __VLS_373({
                    ...{ 'onChange': {} },
                    modelValue: (__VLS_ctx.dwdRelationDraft.dataset_id),
                    filterable: true,
                    loading: (__VLS_ctx.dwdFieldsLoading),
                    placeholder: "选择当前用户可访问的 DWD 数据集",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_373));
                let __VLS_376;
                let __VLS_377;
                let __VLS_378;
                const __VLS_379 = {
                    onChange: (__VLS_ctx.selectDwdDataset)
                };
                __VLS_375.slots.default;
                for (const [source] of __VLS_getVForSourceType((__VLS_ctx.dwdSources))) {
                    const __VLS_380 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_381 = __VLS_asFunctionalComponent(__VLS_380, new __VLS_380({
                        key: (source.dataset_id),
                        value: (source.dataset_id),
                        label: (source.dataset_label || source.dataset_name),
                    }));
                    const __VLS_382 = __VLS_381({
                        key: (source.dataset_id),
                        value: (source.dataset_id),
                        label: (source.dataset_label || source.dataset_name),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_381));
                }
                var __VLS_375;
                if (__VLS_ctx.dwdRelationDraft.report_id && !__VLS_ctx.dwdRelationDraft.dataset_id) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "config-muted" },
                    });
                }
                if (!__VLS_ctx.dwdSources.length) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                        ...{ class: "config-muted" },
                    });
                }
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "field-group" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-label" },
                });
                for (const [_, index] of __VLS_getVForSourceType(((__VLS_ctx.dwdRelationDraft.left_fields || [])))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (index),
                        ...{ class: "dwd-pair-row" },
                    });
                    const __VLS_384 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
                        modelValue: (__VLS_ctx.dwdRelationDraft.left_fields[index]),
                        placeholder: "归集字段",
                    }));
                    const __VLS_386 = __VLS_385({
                        modelValue: (__VLS_ctx.dwdRelationDraft.left_fields[index]),
                        placeholder: "归集字段",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_385));
                    __VLS_387.slots.default;
                    for (const [field] of __VLS_getVForSourceType(([...__VLS_ctx.form.merge_keys, ...__VLS_ctx.form.std_fields]))) {
                        const __VLS_388 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_389 = __VLS_asFunctionalComponent(__VLS_388, new __VLS_388({
                            key: (field),
                            value: (field),
                            label: (field),
                        }));
                        const __VLS_390 = __VLS_389({
                            key: (field),
                            value: (field),
                            label: (field),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_389));
                    }
                    var __VLS_387;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                    const __VLS_392 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
                        modelValue: (__VLS_ctx.dwdRelationDraft.right_fields[index]),
                        placeholder: "DWD 字段",
                    }));
                    const __VLS_394 = __VLS_393({
                        modelValue: (__VLS_ctx.dwdRelationDraft.right_fields[index]),
                        placeholder: "DWD 字段",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_393));
                    __VLS_395.slots.default;
                    for (const [field] of __VLS_getVForSourceType((__VLS_ctx.dwdFields))) {
                        const __VLS_396 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_397 = __VLS_asFunctionalComponent(__VLS_396, new __VLS_396({
                            key: (field.code),
                            value: (field.code),
                            label: (`${field.label}（${field.code}）`),
                        }));
                        const __VLS_398 = __VLS_397({
                            key: (field.code),
                            value: (field.code),
                            label: (`${field.label}（${field.code}）`),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_397));
                    }
                    var __VLS_395;
                    const __VLS_400 = {}.ElButton;
                    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                    // @ts-ignore
                    const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                    }));
                    const __VLS_402 = __VLS_401({
                        ...{ 'onClick': {} },
                        link: true,
                        type: "danger",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_401));
                    let __VLS_404;
                    let __VLS_405;
                    let __VLS_406;
                    const __VLS_407 = {
                        onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'upload'))
                                return;
                            if (!!(__VLS_ctx.buildStep === 'ai'))
                                return;
                            if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd'))
                                return;
                            if (!(__VLS_ctx.dwdRelationDraft))
                                return;
                            __VLS_ctx.removeDwdPair(index);
                        }
                    };
                    __VLS_403.slots.default;
                    var __VLS_403;
                }
                const __VLS_408 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_410 = __VLS_409({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_409));
                let __VLS_412;
                let __VLS_413;
                let __VLS_414;
                const __VLS_415 = {
                    onClick: (__VLS_ctx.addDwdPair)
                };
                __VLS_411.slots.default;
                var __VLS_411;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "field-group" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "field-label" },
                });
                const __VLS_416 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
                    modelValue: (__VLS_ctx.dwdRelationDraft.select_fields),
                    multiple: true,
                    filterable: true,
                    loading: (__VLS_ctx.dwdFieldsLoading),
                    placeholder: "选择要补充到结果的 DWD 字段",
                    ...{ style: {} },
                }));
                const __VLS_418 = __VLS_417({
                    modelValue: (__VLS_ctx.dwdRelationDraft.select_fields),
                    multiple: true,
                    filterable: true,
                    loading: (__VLS_ctx.dwdFieldsLoading),
                    placeholder: "选择要补充到结果的 DWD 字段",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_417));
                __VLS_419.slots.default;
                for (const [field] of __VLS_getVForSourceType((__VLS_ctx.dwdFields))) {
                    const __VLS_420 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({
                        key: (field.code),
                        value: (field.code),
                        label: (`${field.label}（${field.code}）`),
                    }));
                    const __VLS_422 = __VLS_421({
                        key: (field.code),
                        value: (field.code),
                        label: (`${field.label}（${field.code}）`),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_421));
                }
                var __VLS_419;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_424 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_425 = __VLS_asFunctionalComponent(__VLS_424, new __VLS_424({
                    modelValue: (__VLS_ctx.dwdRelationDraft.missing_policy),
                }));
                const __VLS_426 = __VLS_425({
                    modelValue: (__VLS_ctx.dwdRelationDraft.missing_policy),
                }, ...__VLS_functionalComponentArgsRest(__VLS_425));
                __VLS_427.slots.default;
                const __VLS_428 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_429 = __VLS_asFunctionalComponent(__VLS_428, new __VLS_428({
                    label: "记录异常",
                    value: "anomaly",
                }));
                const __VLS_430 = __VLS_429({
                    label: "记录异常",
                    value: "anomaly",
                }, ...__VLS_functionalComponentArgsRest(__VLS_429));
                const __VLS_432 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_433 = __VLS_asFunctionalComponent(__VLS_432, new __VLS_432({
                    label: "跳过异常",
                    value: "skip",
                }));
                const __VLS_434 = __VLS_433({
                    label: "跳过异常",
                    value: "skip",
                }, ...__VLS_functionalComponentArgsRest(__VLS_433));
                var __VLS_427;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "editor-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "editor-label" },
                });
                const __VLS_436 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_437 = __VLS_asFunctionalComponent(__VLS_436, new __VLS_436({
                    modelValue: (__VLS_ctx.dwdRelationDraft.multiple_policy),
                }));
                const __VLS_438 = __VLS_437({
                    modelValue: (__VLS_ctx.dwdRelationDraft.multiple_policy),
                }, ...__VLS_functionalComponentArgsRest(__VLS_437));
                __VLS_439.slots.default;
                const __VLS_440 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_441 = __VLS_asFunctionalComponent(__VLS_440, new __VLS_440({
                    label: "记录异常",
                    value: "anomaly",
                }));
                const __VLS_442 = __VLS_441({
                    label: "记录异常",
                    value: "anomaly",
                }, ...__VLS_functionalComponentArgsRest(__VLS_441));
                const __VLS_444 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_445 = __VLS_asFunctionalComponent(__VLS_444, new __VLS_444({
                    label: "取第一条",
                    value: "first",
                }));
                const __VLS_446 = __VLS_445({
                    label: "取第一条",
                    value: "first",
                }, ...__VLS_functionalComponentArgsRest(__VLS_445));
                var __VLS_439;
                const __VLS_448 = {}.ElCheckbox;
                /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
                // @ts-ignore
                const __VLS_449 = __VLS_asFunctionalComponent(__VLS_448, new __VLS_448({
                    modelValue: (__VLS_ctx.dwdRelationDraft.enabled),
                }));
                const __VLS_450 = __VLS_449({
                    modelValue: (__VLS_ctx.dwdRelationDraft.enabled),
                }, ...__VLS_functionalComponentArgsRest(__VLS_449));
                __VLS_451.slots.default;
                var __VLS_451;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-editor-actions" },
                });
                const __VLS_452 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_453 = __VLS_asFunctionalComponent(__VLS_452, new __VLS_452({
                    ...{ 'onClick': {} },
                    size: "small",
                }));
                const __VLS_454 = __VLS_453({
                    ...{ 'onClick': {} },
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_453));
                let __VLS_456;
                let __VLS_457;
                let __VLS_458;
                const __VLS_459 = {
                    onClick: (__VLS_ctx.cancelDwdRelation)
                };
                __VLS_455.slots.default;
                var __VLS_455;
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_460 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    type: "primary",
                    size: "small",
                    loading: (__VLS_ctx.dwdRelationSaving),
                }));
                const __VLS_461 = __VLS_460({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "U",
                    type: "primary",
                    size: "small",
                    loading: (__VLS_ctx.dwdRelationSaving),
                }, ...__VLS_functionalComponentArgsRest(__VLS_460));
                let __VLS_463;
                let __VLS_464;
                let __VLS_465;
                const __VLS_466 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd'))
                            return;
                        if (!(__VLS_ctx.dwdRelationDraft))
                            return;
                        __VLS_ctx.saveDwdRelation();
                    }
                };
                __VLS_462.slots.default;
                var __VLS_462;
            }
            if (!__VLS_ctx.dwdRelations.length && !__VLS_ctx.dwdRelationDraft) {
                const __VLS_467 = {}.ElEmpty;
                /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
                // @ts-ignore
                const __VLS_468 = __VLS_asFunctionalComponent(__VLS_467, new __VLS_467({
                    description: "暂无 DWD 关联",
                }));
                const __VLS_469 = __VLS_468({
                    description: "暂无 DWD 关联",
                }, ...__VLS_functionalComponentArgsRest(__VLS_468));
            }
            for (const [item] of __VLS_getVForSourceType((__VLS_ctx.dwdRelations))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (item.id),
                    ...{ class: "config-list-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
                __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
                (item.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "config-muted" },
                });
                (__VLS_ctx.dwdSources.find((source) => source.dataset_id === item.dataset_id)?.dataset_name || (item.report_id ? `历史报表 #${item.report_id}` : `数据集 #${item.dataset_id}`));
                const __VLS_471 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_472 = __VLS_asFunctionalComponent(__VLS_471, new __VLS_471({
                    size: "small",
                    type: (item.enabled ? 'success' : 'info'),
                }));
                const __VLS_473 = __VLS_472({
                    size: "small",
                    type: (item.enabled ? 'success' : 'info'),
                }, ...__VLS_functionalComponentArgsRest(__VLS_472));
                __VLS_474.slots.default;
                (item.enabled ? '启用' : '停用');
                var __VLS_474;
                const __VLS_475 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_476 = __VLS_asFunctionalComponent(__VLS_475, new __VLS_475({
                    ...{ 'onClick': {} },
                    link: true,
                    size: "small",
                }));
                const __VLS_477 = __VLS_476({
                    ...{ 'onClick': {} },
                    link: true,
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_476));
                let __VLS_479;
                let __VLS_480;
                let __VLS_481;
                const __VLS_482 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd'))
                            return;
                        __VLS_ctx.startDwdRelation(item);
                    }
                };
                __VLS_478.slots.default;
                var __VLS_478;
                /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
                // @ts-ignore
                const __VLS_483 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    link: true,
                    type: "danger",
                    size: "small",
                }));
                const __VLS_484 = __VLS_483({
                    ...{ 'onClick': {} },
                    menu: "table_tools",
                    op: "D",
                    link: true,
                    type: "danger",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_483));
                let __VLS_486;
                let __VLS_487;
                let __VLS_488;
                const __VLS_489 = {
                    onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'upload'))
                            return;
                        if (!!(__VLS_ctx.buildStep === 'ai'))
                            return;
                        if (!(__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'dwd'))
                            return;
                        __VLS_ctx.removeDwdRelation(item);
                    }
                };
                __VLS_485.slots.default;
                var __VLS_485;
            }
        }
        if (__VLS_ctx.editingId && __VLS_ctx.activeConfigTab === 'output') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
                ...{ class: "advanced-config-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-panel-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
                ...{ class: "section-title" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "section-desc" },
            });
            /** @type {[typeof OutputFieldsEditor, ]} */ ;
            // @ts-ignore
            const __VLS_490 = __VLS_asFunctionalComponent(OutputFieldsEditor, new OutputFieldsEditor({
                modelValue: (__VLS_ctx.form.output_fields),
                candidates: (__VLS_ctx.outputFieldCandidates),
                labels: (__VLS_ctx.outputFieldLabels),
            }));
            const __VLS_491 = __VLS_490({
                modelValue: (__VLS_ctx.form.output_fields),
                candidates: (__VLS_ctx.outputFieldCandidates),
                labels: (__VLS_ctx.outputFieldLabels),
            }, ...__VLS_functionalComponentArgsRest(__VLS_490));
        }
    }
    var __VLS_54;
}
else if (__VLS_ctx.mode === 'mapping') {
    /** @type {[typeof TableToolFullscreenShell, typeof TableToolFullscreenShell, ]} */ ;
    // @ts-ignore
    const __VLS_493 = __VLS_asFunctionalComponent(TableToolFullscreenShell, new TableToolFullscreenShell({
        ...{ 'onBack': {} },
        ...{ 'onStepChange': {} },
        title: (`为「${__VLS_ctx.mappingWizardTemplate?.name || ''}」新增源映射`),
        steps: (__VLS_ctx.mappingWorkflowSteps),
        activeStep: (__VLS_ctx.mappingWorkflowStep),
        busy: (__VLS_ctx.mappingWizardStep === 'ai' || __VLS_ctx.mappingWizardSaving),
    }));
    const __VLS_494 = __VLS_493({
        ...{ 'onBack': {} },
        ...{ 'onStepChange': {} },
        title: (`为「${__VLS_ctx.mappingWizardTemplate?.name || ''}」新增源映射`),
        steps: (__VLS_ctx.mappingWorkflowSteps),
        activeStep: (__VLS_ctx.mappingWorkflowStep),
        busy: (__VLS_ctx.mappingWizardStep === 'ai' || __VLS_ctx.mappingWizardSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_493));
    let __VLS_496;
    let __VLS_497;
    let __VLS_498;
    const __VLS_499 = {
        onBack: (__VLS_ctx.handleMappingBack)
    };
    const __VLS_500 = {
        onStepChange: (__VLS_ctx.goToMappingStep)
    };
    __VLS_495.slots.default;
    {
        const { actions: __VLS_thisSlot } = __VLS_495.slots;
        if (__VLS_ctx.mappingWizardStep === 'upload') {
            const __VLS_501 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_502 = __VLS_asFunctionalComponent(__VLS_501, new __VLS_501({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.MagicStick),
                disabled: (!__VLS_ctx.mappingWizardFiles.length),
            }));
            const __VLS_503 = __VLS_502({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.MagicStick),
                disabled: (!__VLS_ctx.mappingWizardFiles.length),
            }, ...__VLS_functionalComponentArgsRest(__VLS_502));
            let __VLS_505;
            let __VLS_506;
            let __VLS_507;
            const __VLS_508 = {
                onClick: (__VLS_ctx.runMappingDrafts)
            };
            __VLS_504.slots.default;
            (__VLS_ctx.mappingWizardFiles.length);
            var __VLS_504;
        }
        if (__VLS_ctx.mappingWizardStep === 'confirm') {
            const __VLS_509 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_510 = __VLS_asFunctionalComponent(__VLS_509, new __VLS_509({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.mappingWizardSaving),
            }));
            const __VLS_511 = __VLS_510({
                ...{ 'onClick': {} },
                type: "primary",
                loading: (__VLS_ctx.mappingWizardSaving),
            }, ...__VLS_functionalComponentArgsRest(__VLS_510));
            let __VLS_513;
            let __VLS_514;
            let __VLS_515;
            const __VLS_516 = {
                onClick: (__VLS_ctx.saveMappingDrafts)
            };
            __VLS_512.slots.default;
            (__VLS_ctx.mappingWizardDrafts.length);
            var __VLS_512;
        }
    }
    if (__VLS_ctx.mappingWizardStep === 'upload') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "build-upload-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "upload-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "upload-sub" },
        });
        const __VLS_517 = {}.ElUpload;
        /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
        // @ts-ignore
        const __VLS_518 = __VLS_asFunctionalComponent(__VLS_517, new __VLS_517({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleMappingWizardFile),
            ...{ class: "upload-dragger" },
        }));
        const __VLS_519 = __VLS_518({
            drag: true,
            multiple: true,
            autoUpload: (false),
            showFileList: (false),
            accept: ".xlsx",
            onChange: (__VLS_ctx.handleMappingWizardFile),
            ...{ class: "upload-dragger" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_518));
        __VLS_520.slots.default;
        const __VLS_521 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_522 = __VLS_asFunctionalComponent(__VLS_521, new __VLS_521({
            ...{ class: "upload-icon" },
        }));
        const __VLS_523 = __VLS_522({
            ...{ class: "upload-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_522));
        __VLS_524.slots.default;
        const __VLS_525 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_526 = __VLS_asFunctionalComponent(__VLS_525, new __VLS_525({}));
        const __VLS_527 = __VLS_526({}, ...__VLS_functionalComponentArgsRest(__VLS_526));
        var __VLS_524;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.em, __VLS_intrinsicElements.em)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "upload-hint" },
        });
        var __VLS_520;
        if (__VLS_ctx.mappingWizardFiles.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chips" },
            });
            for (const [file, index] of __VLS_getVForSourceType((__VLS_ctx.mappingWizardFiles))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (`${file.name}-${file.size}`),
                    ...{ class: "file-chip" },
                });
                const __VLS_529 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_530 = __VLS_asFunctionalComponent(__VLS_529, new __VLS_529({}));
                const __VLS_531 = __VLS_530({}, ...__VLS_functionalComponentArgsRest(__VLS_530));
                __VLS_532.slots.default;
                const __VLS_533 = {}.Document;
                /** @type {[typeof __VLS_components.Document, ]} */ ;
                // @ts-ignore
                const __VLS_534 = __VLS_asFunctionalComponent(__VLS_533, new __VLS_533({}));
                const __VLS_535 = __VLS_534({}, ...__VLS_functionalComponentArgsRest(__VLS_534));
                var __VLS_532;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (file.name);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!!(__VLS_ctx.mode === 'list'))
                                return;
                            if (!!(__VLS_ctx.mode === 'build'))
                                return;
                            if (!(__VLS_ctx.mode === 'mapping'))
                                return;
                            if (!(__VLS_ctx.mappingWizardStep === 'upload'))
                                return;
                            if (!(__VLS_ctx.mappingWizardFiles.length))
                                return;
                            __VLS_ctx.removeMappingWizardFile(index);
                        } },
                    ...{ class: "chip-remove" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "context-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "context-label" },
        });
        const __VLS_537 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_538 = __VLS_asFunctionalComponent(__VLS_537, new __VLS_537({
            modelValue: (__VLS_ctx.mappingWizardContext),
            type: "textarea",
            rows: (3),
            placeholder: "例如：本批样表为各城市社保、公积金明细；请优先识别员工标识与缴费字段。",
        }));
        const __VLS_539 = __VLS_538({
            modelValue: (__VLS_ctx.mappingWizardContext),
            type: "textarea",
            rows: (3),
            placeholder: "例如：本批样表为各城市社保、公积金明细；请优先识别员工标识与缴费字段。",
        }, ...__VLS_functionalComponentArgsRest(__VLS_538));
    }
    else if (__VLS_ctx.mappingWizardStep === 'ai') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-loading-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "ai-spinner" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
        });
        const __VLS_541 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_542 = __VLS_asFunctionalComponent(__VLS_541, new __VLS_541({
            ...{ class: "spinner-icon" },
        }));
        const __VLS_543 = __VLS_542({
            ...{ class: "spinner-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_542));
        __VLS_544.slots.default;
        const __VLS_545 = {}.MagicStick;
        /** @type {[typeof __VLS_components.MagicStick, ]} */ ;
        // @ts-ignore
        const __VLS_546 = __VLS_asFunctionalComponent(__VLS_545, new __VLS_545({}));
        const __VLS_547 = __VLS_546({}, ...__VLS_functionalComponentArgsRest(__VLS_546));
        var __VLS_544;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
            ...{ class: "ai-loading-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "ai-loading-sub" },
        });
        (__VLS_ctx.mappingWizardFiles.length);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-intro" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
        const __VLS_549 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_550 = __VLS_asFunctionalComponent(__VLS_549, new __VLS_549({
            ...{ 'onClick': {} },
        }));
        const __VLS_551 = __VLS_550({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_550));
        let __VLS_553;
        let __VLS_554;
        let __VLS_555;
        const __VLS_556 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!(__VLS_ctx.mode === 'mapping'))
                    return;
                if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                    return;
                if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                    return;
                __VLS_ctx.mappingWizardStep = 'upload';
            }
        };
        __VLS_552.slots.default;
        var __VLS_552;
        const __VLS_557 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_558 = __VLS_asFunctionalComponent(__VLS_557, new __VLS_557({
            title: "请确认映射名称和表头识别特征；带有低置信度提示的映射建议重点检查。",
            type: "warning",
            closable: (false),
            showIcon: true,
        }));
        const __VLS_559 = __VLS_558({
            title: "请确认映射名称和表头识别特征；带有低置信度提示的映射建议重点检查。",
            type: "warning",
            closable: (false),
            showIcon: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_558));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "mapping-confirm-list" },
        });
        for (const [mapping, index] of __VLS_getVForSourceType((__VLS_ctx.mappingWizardDrafts))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (`${mapping.name}-${index}`),
                ...{ class: "mapping-confirm-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-confirm-card-head" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (index + 1);
            if (mapping.sheet_kw) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (mapping.sheet_kw);
            }
            const __VLS_561 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_562 = __VLS_asFunctionalComponent(__VLS_561, new __VLS_561({
                ...{ 'onClick': {} },
                text: true,
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }));
            const __VLS_563 = __VLS_562({
                ...{ 'onClick': {} },
                text: true,
                type: "danger",
                icon: (__VLS_ctx.Delete),
            }, ...__VLS_functionalComponentArgsRest(__VLS_562));
            let __VLS_565;
            let __VLS_566;
            let __VLS_567;
            const __VLS_568 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                        return;
                    __VLS_ctx.removeMappingWizardDraft(index);
                }
            };
            __VLS_564.slots.default;
            var __VLS_564;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "editor-label" },
            });
            const __VLS_569 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_570 = __VLS_asFunctionalComponent(__VLS_569, new __VLS_569({
                modelValue: (mapping.name),
            }));
            const __VLS_571 = __VLS_570({
                modelValue: (mapping.name),
            }, ...__VLS_functionalComponentArgsRest(__VLS_570));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "editor-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ class: "editor-label" },
            });
            const __VLS_573 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_574 = __VLS_asFunctionalComponent(__VLS_573, new __VLS_573({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: ((mapping.match_signature || []).join(',')),
            }));
            const __VLS_575 = __VLS_574({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: ((mapping.match_signature || []).join(',')),
            }, ...__VLS_functionalComponentArgsRest(__VLS_574));
            let __VLS_577;
            let __VLS_578;
            let __VLS_579;
            const __VLS_580 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'upload'))
                        return;
                    if (!!(__VLS_ctx.mappingWizardStep === 'ai'))
                        return;
                    mapping.match_signature = $event.split(',').map((value) => value.trim()).filter(Boolean);
                }
            };
            var __VLS_576;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "mapping-confirm-meta" },
            });
            if (mapping.new_std_fields?.length) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (mapping.new_std_fields.join('、'));
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (mapping.header_start);
            (mapping.header_end);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (Object.keys(mapping.key_map || {}).length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (Object.keys(mapping.column_map || {}).length);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (mapping.derived_fields?.length || 0);
            if (Number(mapping._confidence || 0) < 0.85) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "ai-notes" },
                });
                (Math.round(Number(mapping._confidence || 0) * 100));
                (mapping._notes || '请人工确认该映射。');
            }
        }
    }
    var __VLS_495;
}
else if (__VLS_ctx.mode === 'merge') {
    /** @type {[typeof TableToolFullscreenShell, typeof TableToolFullscreenShell, ]} */ ;
    // @ts-ignore
    const __VLS_581 = __VLS_asFunctionalComponent(TableToolFullscreenShell, new TableToolFullscreenShell({
        ...{ 'onBack': {} },
        title: (`合并 · ${__VLS_ctx.mergeTemplate?.name || ''}`),
        busy: (__VLS_ctx.merging || __VLS_ctx.downloading || __VLS_ctx.savingResult),
    }));
    const __VLS_582 = __VLS_581({
        ...{ 'onBack': {} },
        title: (`合并 · ${__VLS_ctx.mergeTemplate?.name || ''}`),
        busy: (__VLS_ctx.merging || __VLS_ctx.downloading || __VLS_ctx.savingResult),
    }, ...__VLS_functionalComponentArgsRest(__VLS_581));
    let __VLS_584;
    let __VLS_585;
    let __VLS_586;
    const __VLS_587 = {
        onBack: (__VLS_ctx.handleMergeBack)
    };
    __VLS_583.slots.default;
    {
        const { actions: __VLS_thisSlot } = __VLS_583.slots;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_588 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "E",
            icon: (__VLS_ctx.Download),
            loading: (__VLS_ctx.downloading),
            disabled: (!__VLS_ctx.mergeFiles.length),
        }));
        const __VLS_589 = __VLS_588({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "E",
            icon: (__VLS_ctx.Download),
            loading: (__VLS_ctx.downloading),
            disabled: (!__VLS_ctx.mergeFiles.length),
        }, ...__VLS_functionalComponentArgsRest(__VLS_588));
        let __VLS_591;
        let __VLS_592;
        let __VLS_593;
        const __VLS_594 = {
            onClick: (__VLS_ctx.downloadResult)
        };
        __VLS_590.slots.default;
        var __VLS_590;
        const __VLS_595 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_596 = __VLS_asFunctionalComponent(__VLS_595, new __VLS_595({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.merging),
            disabled: (!__VLS_ctx.mergeFiles.length),
        }));
        const __VLS_597 = __VLS_596({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.merging),
            disabled: (!__VLS_ctx.mergeFiles.length),
        }, ...__VLS_functionalComponentArgsRest(__VLS_596));
        let __VLS_599;
        let __VLS_600;
        let __VLS_601;
        const __VLS_602 = {
            onClick: (__VLS_ctx.runMerge)
        };
        __VLS_598.slots.default;
        var __VLS_598;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_603 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "V",
            type: "success",
            loading: (__VLS_ctx.savingResult),
            disabled: (!__VLS_ctx.mergeResult?.preview_token),
        }));
        const __VLS_604 = __VLS_603({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "V",
            type: "success",
            loading: (__VLS_ctx.savingResult),
            disabled: (!__VLS_ctx.mergeResult?.preview_token),
        }, ...__VLS_functionalComponentArgsRest(__VLS_603));
        let __VLS_606;
        let __VLS_607;
        let __VLS_608;
        const __VLS_609 = {
            onClick: (__VLS_ctx.saveCurrentResult)
        };
        __VLS_605.slots.default;
        var __VLS_605;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-layout" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-left" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "section-title" },
    });
    const __VLS_610 = {}.ElUpload;
    /** @type {[typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, typeof __VLS_components.ElUpload, typeof __VLS_components.elUpload, ]} */ ;
    // @ts-ignore
    const __VLS_611 = __VLS_asFunctionalComponent(__VLS_610, new __VLS_610({
        drag: true,
        multiple: true,
        autoUpload: (false),
        showFileList: (false),
        accept: ".xlsx",
        onChange: (__VLS_ctx.handleMergeFileChange),
        ...{ class: "upload-dragger upload-dragger--sm" },
    }));
    const __VLS_612 = __VLS_611({
        drag: true,
        multiple: true,
        autoUpload: (false),
        showFileList: (false),
        accept: ".xlsx",
        onChange: (__VLS_ctx.handleMergeFileChange),
        ...{ class: "upload-dragger upload-dragger--sm" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_611));
    __VLS_613.slots.default;
    const __VLS_614 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_615 = __VLS_asFunctionalComponent(__VLS_614, new __VLS_614({
        ...{ class: "upload-icon" },
        ...{ style: {} },
    }));
    const __VLS_616 = __VLS_615({
        ...{ class: "upload-icon" },
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_615));
    __VLS_617.slots.default;
    const __VLS_618 = {}.Upload;
    /** @type {[typeof __VLS_components.Upload, ]} */ ;
    // @ts-ignore
    const __VLS_619 = __VLS_asFunctionalComponent(__VLS_618, new __VLS_618({}));
    const __VLS_620 = __VLS_619({}, ...__VLS_functionalComponentArgsRest(__VLS_619));
    var __VLS_617;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "upload-text" },
        ...{ style: {} },
    });
    var __VLS_613;
    if (__VLS_ctx.mergeFiles.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "file-chips" },
            ...{ style: {} },
        });
        for (const [f, i] of __VLS_getVForSourceType((__VLS_ctx.mergeFiles))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "file-chip" },
                key: (i),
            });
            const __VLS_622 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_623 = __VLS_asFunctionalComponent(__VLS_622, new __VLS_622({}));
            const __VLS_624 = __VLS_623({}, ...__VLS_functionalComponentArgsRest(__VLS_623));
            __VLS_625.slots.default;
            const __VLS_626 = {}.Document;
            /** @type {[typeof __VLS_components.Document, ]} */ ;
            // @ts-ignore
            const __VLS_627 = __VLS_asFunctionalComponent(__VLS_626, new __VLS_626({}));
            const __VLS_628 = __VLS_627({}, ...__VLS_functionalComponentArgsRest(__VLS_627));
            var __VLS_625;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (f.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!!(__VLS_ctx.mode === 'list'))
                            return;
                        if (!!(__VLS_ctx.mode === 'build'))
                            return;
                        if (!!(__VLS_ctx.mode === 'mapping'))
                            return;
                        if (!(__VLS_ctx.mode === 'merge'))
                            return;
                        if (!(__VLS_ctx.mergeFiles.length))
                            return;
                        __VLS_ctx.removeMergeFile(i);
                    } },
                ...{ class: "chip-remove" },
            });
        }
    }
    if (__VLS_ctx.mergeResult?.recognize_log?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "log-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "log-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-count" },
        });
        (__VLS_ctx.mergeResult.recognize_log.length);
        for (const [l, i] of __VLS_getVForSourceType((__VLS_ctx.mergeResult.recognize_log))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "log-row" },
                key: (i),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-score" },
                ...{ class: (l.score >= 0.9 ? 'good' : 'warn') },
            });
            (Math.round(l.score * 100));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-file" },
            });
            (l.file);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "log-sheet" },
            });
            (l.sheet);
        }
    }
    if (__VLS_ctx.mergeResult?.anomalies?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "anomaly-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "log-title danger" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-count" },
        });
        (__VLS_ctx.mergeResult.anomalies.length);
        for (const [a, i] of __VLS_getVForSourceType((__VLS_ctx.mergeResult.anomalies))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "anomaly-row" },
                key: (i),
            });
            const __VLS_630 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_631 = __VLS_asFunctionalComponent(__VLS_630, new __VLS_630({
                type: "danger",
                size: "small",
            }));
            const __VLS_632 = __VLS_631({
                type: "danger",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_631));
            __VLS_633.slots.default;
            (a.type);
            var __VLS_633;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "anomaly-detail" },
            });
            (a.detail);
        }
    }
    if (__VLS_ctx.mergeResult?.dwd_anomalies?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "anomaly-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h4, __VLS_intrinsicElements.h4)({
            ...{ class: "log-title danger" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "log-count" },
        });
        (__VLS_ctx.mergeResult.dwd_anomalies.length);
        for (const [a, i] of __VLS_getVForSourceType((__VLS_ctx.mergeResult.dwd_anomalies))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "anomaly-row" },
                key: (i),
            });
            const __VLS_634 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_635 = __VLS_asFunctionalComponent(__VLS_634, new __VLS_634({
                type: "warning",
                size: "small",
            }));
            const __VLS_636 = __VLS_635({
                type: "warning",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_635));
            __VLS_637.slots.default;
            (a.type);
            var __VLS_637;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "anomaly-detail" },
            });
            (a.detail);
        }
    }
    if (__VLS_ctx.mergeResult?.raw_key_traces?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.details, __VLS_intrinsicElements.details)({
            ...{ class: "trace-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.summary, __VLS_intrinsicElements.summary)({});
        (__VLS_ctx.mergeResult.raw_key_traces.length);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({});
        (JSON.stringify(__VLS_ctx.mergeResult.raw_key_traces, null, 2));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "merge-right" },
    });
    if (__VLS_ctx.mergeResult) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-cards" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.files);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.records);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card highlight" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.persons);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-card" },
            ...{ class: (__VLS_ctx.mergeResult.stats.anomalies ? 'danger' : '') },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-val" },
        });
        (__VLS_ctx.mergeResult.stats.anomalies);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "stat-label" },
        });
        if (__VLS_ctx.mergeResult.key_mapping_stats) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stat-card" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stat-val" },
            });
            (__VLS_ctx.mergeResult.key_mapping_stats.matched);
            (__VLS_ctx.mergeResult.key_mapping_stats.configured);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "stat-label" },
            });
        }
    }
    if (__VLS_ctx.mergeResult?.rows?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-wrap" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.mergeResult.rows.length);
        (__VLS_ctx.mergeResult.total_rows);
        const __VLS_638 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_639 = __VLS_asFunctionalComponent(__VLS_638, new __VLS_638({
            data: (__VLS_ctx.mergeResult.rows),
            size: "small",
            border: true,
            maxHeight: "600",
            ...{ style: {} },
        }));
        const __VLS_640 = __VLS_639({
            data: (__VLS_ctx.mergeResult.rows),
            size: "small",
            border: true,
            maxHeight: "600",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_639));
        __VLS_641.slots.default;
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.mergeResultCols))) {
            const __VLS_642 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_643 = __VLS_asFunctionalComponent(__VLS_642, new __VLS_642({
                key: (col),
                prop: (col),
                label: (__VLS_ctx.mergeColumnLabel(col)),
                minWidth: "110",
                showOverflowTooltip: true,
            }));
            const __VLS_644 = __VLS_643({
                key: (col),
                prop: (col),
                label: (__VLS_ctx.mergeColumnLabel(col)),
                minWidth: "110",
                showOverflowTooltip: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_643));
        }
        var __VLS_641;
    }
    if (__VLS_ctx.historyResult) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-wrap" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.historyLoading) }, null, null);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.historyResult.batch.period === 'CURRENT' ? '当前快照' : `历史结果 · ${__VLS_ctx.historyResult.batch.period}`);
        (__VLS_ctx.historyResult.total_rows);
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_646 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "E",
            size: "small",
        }));
        const __VLS_647 = __VLS_646({
            ...{ 'onClick': {} },
            menu: "table_tools",
            op: "E",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_646));
        let __VLS_649;
        let __VLS_650;
        let __VLS_651;
        const __VLS_652 = {
            onClick: (...[$event]) => {
                if (!!(__VLS_ctx.mode === 'list'))
                    return;
                if (!!(__VLS_ctx.mode === 'build'))
                    return;
                if (!!(__VLS_ctx.mode === 'mapping'))
                    return;
                if (!(__VLS_ctx.mode === 'merge'))
                    return;
                if (!(__VLS_ctx.historyResult))
                    return;
                __VLS_ctx.downloadResultBatch(__VLS_ctx.historyResult.batch);
            }
        };
        __VLS_648.slots.default;
        var __VLS_648;
        const __VLS_653 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_654 = __VLS_asFunctionalComponent(__VLS_653, new __VLS_653({
            data: (__VLS_ctx.historyResult.rows),
            size: "small",
            border: true,
            maxHeight: "500",
            ...{ style: {} },
        }));
        const __VLS_655 = __VLS_654({
            data: (__VLS_ctx.historyResult.rows),
            size: "small",
            border: true,
            maxHeight: "500",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_654));
        __VLS_656.slots.default;
        for (const [col] of __VLS_getVForSourceType((__VLS_ctx.historyResultCols))) {
            const __VLS_657 = {}.ElTableColumn;
            /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
            // @ts-ignore
            const __VLS_658 = __VLS_asFunctionalComponent(__VLS_657, new __VLS_657({
                key: (col),
                prop: (col),
                label: (__VLS_ctx.historyColumnLabel(col)),
                minWidth: "110",
                showOverflowTooltip: true,
            }));
            const __VLS_659 = __VLS_658({
                key: (col),
                prop: (col),
                label: (__VLS_ctx.historyColumnLabel(col)),
                minWidth: "110",
                showOverflowTooltip: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_658));
        }
        var __VLS_656;
    }
    if (__VLS_ctx.resultBatches.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "history-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        for (const [batch] of __VLS_getVForSourceType((__VLS_ctx.resultBatches))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (batch.id),
                ...{ class: "history-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (batch.period === 'CURRENT' ? '当前快照' : batch.period);
            (batch.row_count);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_661 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_662 = __VLS_asFunctionalComponent(__VLS_661, new __VLS_661({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
            }));
            const __VLS_663 = __VLS_662({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_662));
            let __VLS_665;
            let __VLS_666;
            let __VLS_667;
            const __VLS_668 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!(__VLS_ctx.mode === 'merge'))
                        return;
                    if (!(__VLS_ctx.resultBatches.length))
                        return;
                    __VLS_ctx.viewResultBatch(batch);
                }
            };
            __VLS_664.slots.default;
            var __VLS_664;
            const __VLS_669 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_670 = __VLS_asFunctionalComponent(__VLS_669, new __VLS_669({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
            }));
            const __VLS_671 = __VLS_670({
                ...{ 'onClick': {} },
                text: true,
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_670));
            let __VLS_673;
            let __VLS_674;
            let __VLS_675;
            const __VLS_676 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.mode === 'list'))
                        return;
                    if (!!(__VLS_ctx.mode === 'build'))
                        return;
                    if (!!(__VLS_ctx.mode === 'mapping'))
                        return;
                    if (!(__VLS_ctx.mode === 'merge'))
                        return;
                    if (!(__VLS_ctx.resultBatches.length))
                        return;
                    __VLS_ctx.downloadResultBatch(batch);
                }
            };
            __VLS_672.slots.default;
            var __VLS_672;
        }
    }
    else if (!__VLS_ctx.merging) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "merge-empty" },
        });
        const __VLS_677 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_678 = __VLS_asFunctionalComponent(__VLS_677, new __VLS_677({
            ...{ style: {} },
        }));
        const __VLS_679 = __VLS_678({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_678));
        __VLS_680.slots.default;
        const __VLS_681 = {}.Upload;
        /** @type {[typeof __VLS_components.Upload, ]} */ ;
        // @ts-ignore
        const __VLS_682 = __VLS_asFunctionalComponent(__VLS_681, new __VLS_681({}));
        const __VLS_683 = __VLS_682({}, ...__VLS_functionalComponentArgsRest(__VLS_682));
        var __VLS_680;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
    }
    if (__VLS_ctx.merging) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "merge-loading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "spinner-ring" },
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    var __VLS_583;
}
/** @type {__VLS_StyleScopedClasses['tt-root']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-page']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['template-list-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['list-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['skeleton']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-state']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tpl-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-action']} */ ;
/** @type {__VLS_StyleScopedClasses['workflow-action']} */ ;
/** @type {__VLS_StyleScopedClasses['build-upload-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['context-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['confidence-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['build-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['build-left']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['std-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['std-add']} */ ;
/** @type {__VLS_StyleScopedClasses['form-section']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['build-right']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-count']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['mappings-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-item']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-chevron']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['map-table']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row-head']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['map-table']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row-head']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-section-header']} */ ;
/** @type {__VLS_StyleScopedClasses['add-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['del-row-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['config-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['config-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['config-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['dwd-pair-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['config-editor-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['config-list-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['advanced-config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel-head']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['build-upload-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['context-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['context-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-spinner']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-title']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-loading-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-intro']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-list']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-card-head']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-row']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-field']} */ ;
/** @type {__VLS_StyleScopedClasses['editor-label']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-confirm-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['ai-notes']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-left']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-dragger--sm']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['upload-text']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chips']} */ ;
/** @type {__VLS_StyleScopedClasses['file-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['chip-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['log-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['log-row']} */ ;
/** @type {__VLS_StyleScopedClasses['log-score']} */ ;
/** @type {__VLS_StyleScopedClasses['log-file']} */ ;
/** @type {__VLS_StyleScopedClasses['log-sheet']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-row']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['log-title']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['log-count']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-row']} */ ;
/** @type {__VLS_StyleScopedClasses['anomaly-detail']} */ ;
/** @type {__VLS_StyleScopedClasses['trace-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-right']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-card']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-val']} */ ;
/** @type {__VLS_StyleScopedClasses['stat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['history-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['history-row']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['merge-loading']} */ ;
/** @type {__VLS_StyleScopedClasses['spinner-ring']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            Upload: Upload,
            Download: Download,
            MagicStick: MagicStick,
            CircleCheck: CircleCheck,
            Warning: Warning,
            Document: Document,
            Grid: Grid,
            PermissionButton: PermissionButton,
            OutputFieldsEditor: OutputFieldsEditor,
            TableMergeKeyMappingPanel: TableMergeKeyMappingPanel,
            TableMergeTemplateCard: TableMergeTemplateCard,
            TableToolFullscreenShell: TableToolFullscreenShell,
            userStore: userStore,
            canModify: canModify,
            mode: mode,
            templates: templates,
            listLoading: listLoading,
            listError: listError,
            loadTemplates: loadTemplates,
            openNewRoute: openNewRoute,
            openEditRoute: openEditRoute,
            openMappingRoute: openMappingRoute,
            openMergeRoute: openMergeRoute,
            editingId: editingId,
            buildStep: buildStep,
            activeConfigTab: activeConfigTab,
            workflowSteps: workflowSteps,
            workflowStepIndex: workflowStepIndex,
            isLastWorkflowStep: isLastWorkflowStep,
            keyMappings: keyMappings,
            keyMappingDraft: keyMappingDraft,
            keyMappingSaving: keyMappingSaving,
            keyMappingsLoading: keyMappingsLoading,
            keyMappingsError: keyMappingsError,
            keyMappingSaveError: keyMappingSaveError,
            keyMappingTogglingIds: keyMappingTogglingIds,
            dwdRelations: dwdRelations,
            dwdSources: dwdSources,
            dwdFields: dwdFields,
            dwdFieldsLoading: dwdFieldsLoading,
            dwdRelationDraft: dwdRelationDraft,
            dwdRelationSaving: dwdRelationSaving,
            loadKeyMappings: loadKeyMappings,
            selectDwdDataset: selectDwdDataset,
            startKeyMapping: startKeyMapping,
            cancelKeyMapping: cancelKeyMapping,
            saveKeyMapping: saveKeyMapping,
            toggleKeyMapping: toggleKeyMapping,
            removeKeyMapping: removeKeyMapping,
            startDwdRelation: startDwdRelation,
            cancelDwdRelation: cancelDwdRelation,
            addDwdPair: addDwdPair,
            removeDwdPair: removeDwdPair,
            saveDwdRelation: saveDwdRelation,
            removeDwdRelation: removeDwdRelation,
            tplFiles: tplFiles,
            aiContext: aiContext,
            draft: draft,
            form: form,
            stdFieldInput: stdFieldInput,
            draggingStdField: draggingStdField,
            outputFieldCandidates: outputFieldCandidates,
            outputFieldLabels: outputFieldLabels,
            expandedMapping: expandedMapping,
            editingMapping: editingMapping,
            mappingWizardTemplate: mappingWizardTemplate,
            mappingWizardStep: mappingWizardStep,
            mappingWorkflowSteps: mappingWorkflowSteps,
            mappingWorkflowStep: mappingWorkflowStep,
            mappingWizardFiles: mappingWizardFiles,
            mappingWizardContext: mappingWizardContext,
            mappingWizardDrafts: mappingWizardDrafts,
            mappingWizardSaving: mappingWizardSaving,
            handleMappingBack: handleMappingBack,
            goToMappingStep: goToMappingStep,
            openAddMapping: openAddMapping,
            removeMappingWizardFile: removeMappingWizardFile,
            handleMappingWizardFile: handleMappingWizardFile,
            runMappingDrafts: runMappingDrafts,
            removeMappingWizardDraft: removeMappingWizardDraft,
            saveMappingDrafts: saveMappingDrafts,
            handleTplFileChange: handleTplFileChange,
            removeTplFile: removeTplFile,
            runAiDraft: runAiDraft,
            handleBuildBack: handleBuildBack,
            goToConfigStep: goToConfigStep,
            goToPreviousStep: goToPreviousStep,
            goToNextStep: goToNextStep,
            skipToManual: skipToManual,
            startEditMapping: startEditMapping,
            cancelEditMapping: cancelEditMapping,
            saveEditMapping: saveEditMapping,
            mappingDraftLoading: mappingDraftLoading,
            mappingDraftSheets: mappingDraftSheets,
            mappingDraftSheet: mappingDraftSheet,
            mappingDraftWarnings: mappingDraftWarnings,
            mappingDraftLowConfidence: mappingDraftLowConfidence,
            handleMappingSample: handleMappingSample,
            reloadMappingDraft: reloadMappingDraft,
            removeMapping: removeMapping,
            addKeyMapEntry: addKeyMapEntry,
            addColumnMapEntry: addColumnMapEntry,
            addDerivedField: addDerivedField,
            removeDerivedField: removeDerivedField,
            syncKeyMap: syncKeyMap,
            syncColumnMap: syncColumnMap,
            addStdField: addStdField,
            removeStdField: removeStdField,
            reorderStdField: reorderStdField,
            aiLowConfidence: aiLowConfidence,
            deleteTemplate: deleteTemplate,
            mergeTemplate: mergeTemplate,
            mergeFiles: mergeFiles,
            merging: merging,
            downloading: downloading,
            mergeResult: mergeResult,
            savingResult: savingResult,
            resultBatches: resultBatches,
            historyResult: historyResult,
            historyLoading: historyLoading,
            handleMergeBack: handleMergeBack,
            handleMergeFileChange: handleMergeFileChange,
            removeMergeFile: removeMergeFile,
            runMerge: runMerge,
            downloadResult: downloadResult,
            saveCurrentResult: saveCurrentResult,
            viewResultBatch: viewResultBatch,
            downloadResultBatch: downloadResultBatch,
            mergeResultCols: mergeResultCols,
            historyResultCols: historyResultCols,
            mergeColumnLabel: mergeColumnLabel,
            historyColumnLabel: historyColumnLabel,
            editingKeyMapEntries: editingKeyMapEntries,
            editingColMapEntries: editingColMapEntries,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
