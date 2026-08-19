/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useUserStore } from '@/stores/user';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete, Top, Bottom, Refresh, VideoPlay, Upload, ArrowRight, Lock } from '@element-plus/icons-vue';
import { listAssets, listAssetColumns, listStandardizationRules, createStandardizationRule, updateStandardizationRule, deleteStandardizationRule, listStandardizationTemplates, createStandardizationTemplate, loadTemplateToAsset, previewStandardization, executeStandardization, STANDARDIZATION_RULE_TYPES, STANDARDIZATION_RULE_LABELS, } from '@/api/warehouse';
import OdsDwdAutomationPanel from '@/components/warehouse/OdsDwdAutomationPanel.vue';
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue';
import { RULE_LABELS, RULE_TYPES, createEmptyDocument, } from '@/api/mapping';
const userStore = useUserStore();
const automationPanelRef = ref(null);
// ===== 选表 =====
const tables = ref([]);
const referenceDwdAssets = ref([]);
const selectedTable = ref('');
const targetTableName = ref('');
const derivedTargetTable = computed(() => {
    if (!selectedTable.value)
        return '';
    const name = selectedTable.value;
    for (const prefix of ['ods_', 'raw_', 'src_']) {
        if (name.toLowerCase().startsWith(prefix))
            return 'dwd_' + name.slice(prefix.length);
    }
    return 'dwd_' + name;
});
const tableFields = ref([]);
const mappingWorkspaceRef = ref(null);
const transformationWorkspaceRef = ref(null);
const mappingDialogVisible = ref(false);
const transformationDialogVisible = ref(false);
const mappingDirty = ref(false);
const legacyDirty = ref(false);
const PUBLIC_RULE_TYPES = RULE_TYPES;
const MAPPING_RULE_TYPES = ['field', 'value_map', 'reference_lookup', 'identity_with_overrides'];
const TRANSFORMATION_RULE_TYPES = RULE_TYPES.filter((ruleType) => !MAPPING_RULE_TYPES.includes(ruleType));
const TOP_TRANSFORMATION_RULE_TYPES = ['type_convert', 'format', 'split_merge'];
const LEGACY_RULE_TYPES = STANDARDIZATION_RULE_TYPES.filter((rt) => !['rename', 'type_convert', 'value_map', 'split_merge', 'format_standardize', 'reference_lookup', 'identity_with_overrides'].includes(rt));
const mappingRuleTypeByStandard = {
    rename: 'field',
    type_convert: 'type_convert',
    value_map: 'value_map',
    split_merge: 'split_merge',
    format_standardize: 'format',
    reference_lookup: 'reference_lookup',
    identity_with_overrides: 'identity_with_overrides',
};
const standardRuleTypeByMapping = {
    field: 'rename',
    type_convert: 'type_convert',
    value_map: 'value_map',
    split_merge: 'split_merge',
    format: 'format_standardize',
    reference_lookup: 'reference_lookup',
    identity_with_overrides: 'identity_with_overrides',
};
function schemaHash(fields) {
    let hash = 2166136261;
    for (const char of JSON.stringify(fields.map((field) => [field.column_code, field.data_type]))) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}
function toMappings(value) {
    if (Array.isArray(value))
        return Object.fromEntries(value.map((item) => [String(item.from ?? ''), String(item.to ?? '')]));
    return value && typeof value === 'object' ? { ...value } : {};
}
function standardStepToMappingRule(step) {
    const type = mappingRuleTypeByStandard[step.rule_type];
    if (!type)
        return null;
    const config = { ...step.rule_config };
    if (type === 'field')
        config.mode = config.mode || 'rename';
    if (type === 'value_map')
        config.mappings = toMappings(config.mappings);
    if (type === 'reference_lookup') {
        const legacyRules = config.rules || [];
        config.lookupConfigs = config.lookupConfigs || config.lookup_configs?.map((item, index) => ({
            id: item.id || `lookup_${index}`, priority: item.priority ?? (index + 1) * 10, referenceDatasetId: item.referenceDatasetId || item.reference_dataset_id || '', sourceField: item.sourceField || item.source_field || '', referenceMatchField: item.referenceMatchField || item.reference_match_field || '', referenceReturnField: item.referenceReturnField || item.reference_return_field || '', targetField: item.targetField || item.target_field || step.target_field || '', conditions: item.conditions || {},
        })) || legacyRules.map((item, index) => ({
            id: item.id || `lookup_${index}`, priority: item.priority ?? (index + 1) * 10, referenceDatasetId: config.lookup_table || '', sourceField: item.sourceField || item.source_field || item.src_field || '', referenceMatchField: item.referenceField || item.reference_field || config.value_col || 'value', referenceReturnField: config.result_col || '', targetField: config.target || step.target_field || '', conditions: item.conditions || (item.match_type ? { [config.type_col || 'field_type']: item.match_type } : {}),
        }));
        config.unmatched = config.unmatched || 'keep';
    }
    if (type === 'identity_with_overrides') {
        config.defaultBehavior = config.defaultBehavior || config.default_behavior || 'keep_source';
        config.unmatched = config.unmatched || 'keep';
        config.overrides = config.overrides || {};
    }
    if (type === 'type_convert')
        config.targetType = config.targetType || config.target_type || config.to_type || 'string';
    if (type === 'format') {
        config.formatType = config.formatType || config.format || config.format_type || 'trim';
        config.options = config.options || Object.fromEntries(Object.entries(config).filter(([key]) => !['format', 'format_type', 'on_error', 'output_enabled', 'output_label', 'output_description'].includes(key)));
        config.onError = config.onError || config.on_error || 'reject';
    }
    if (type === 'split_merge') {
        config.action = config.action || 'merge';
        config.delimiter = config.delimiter ?? config.separator ?? '';
        config.nullBehavior = config.nullBehavior || config.null_behavior || 'keep_null';
    }
    return {
        id: step.id ? `standard_${step.id}` : config.__mappingRuleId || `draft_${step.display_order}_${step.rule_type}`,
        type,
        enabled: step.enabled,
        displayOrder: Math.max(0, step.display_order - 1),
        sourceFields: step.rule_config.source_fields || step.rule_config.sources || (step.source_field ? [step.source_field] : []),
        targetFields: step.rule_config.target_fields || (step.target_field ? [step.target_field] : []),
        config,
    };
}
function mappingRuleToStandardStep(rule) {
    const config = { ...rule.config };
    if (!rule.id.startsWith('standard_'))
        config.__mappingRuleId = rule.id;
    if (rule.type === 'value_map')
        config.mappings = toMappings(config.mappings);
    if (rule.type === 'reference_lookup') {
        const lookupConfigs = config.lookupConfigs || [];
        config.lookup_configs = lookupConfigs.map((item) => ({ id: item.id, priority: item.priority, reference_dataset_id: item.referenceDatasetId, source_field: item.sourceField, reference_match_field: item.referenceMatchField, reference_return_field: item.referenceReturnField, target_field: item.targetField, conditions: item.conditions || {} }));
        const first = lookupConfigs[0];
        if (first && lookupConfigs.every((item) => item.referenceDatasetId === first.referenceDatasetId && item.referenceReturnField === first.referenceReturnField)) {
            config.lookup_table = first.referenceDatasetId;
            config.target = first.targetField;
            config.result_col = first.referenceReturnField;
            config.rules = lookupConfigs.map((item) => ({ id: item.id, priority: item.priority, source_field: item.sourceField, reference_field: item.referenceMatchField, conditions: item.conditions || {} }));
        }
        delete config.lookupConfigs;
        delete config.referenceDatasetId;
        delete config.outputMap;
        delete config.matchRules;
    }
    if (rule.type === 'identity_with_overrides') {
        config.default_behavior = config.defaultBehavior || 'keep_source';
        delete config.defaultBehavior;
    }
    if (rule.type === 'type_convert') {
        config.target_type = config.targetType;
        delete config.targetType;
    }
    if (rule.type === 'format') {
        if (config.formatType === 'unit_convert') {
            config.multiplier = config.options?.multiplier ?? 1;
            config.decimal_places = config.options?.decimal_places ?? 2;
        }
        else {
            config.format = config.formatType;
            Object.assign(config, config.options || {});
        }
        delete config.formatType;
        delete config.options;
        delete config.onError;
    }
    if (rule.type === 'split_merge') {
        if (config.action === 'merge') {
            config.sources = rule.sourceFields;
            config.delimiter = config.delimiter || '';
        }
        else {
            config.separator = config.delimiter;
            config.target_fields = rule.targetFields;
            delete config.delimiter;
        }
        delete config.nullBehavior;
    }
    const id = rule.id.startsWith('standard_') ? Number(rule.id.slice('standard_'.length)) : undefined;
    const ruleType = standardRuleTypeByMapping[rule.type];
    if (!ruleType)
        throw new Error(`不支持的公共规则类型: ${rule.type}`);
    return {
        id: Number.isFinite(id) ? id : undefined,
        rule_type: ruleType,
        source_field: rule.sourceFields[0] || '',
        target_field: rule.targetFields[0] || '',
        rule_config: config,
        enabled: rule.enabled,
        display_order: rule.displayOrder + 1,
        dirty: true,
    };
}
function buildMappingDocument() {
    const document = createEmptyDocument(selectedTable.value, `${selectedTable.value} ODS→DWD 映射`);
    const hash = schemaHash(tableFields.value);
    document.ruleSet.sourceAsset = selectedTable.value;
    document.ruleSet.targetAsset = targetTableName.value.trim() || derivedTargetTable.value;
    document.ruleSet.sourceSchemaHash = hash;
    document.ruleSet.targetSchemaHash = hash;
    document.ruleSet.rules = steps.value.map(standardStepToMappingRule).filter((rule) => !!rule);
    return document;
}
const mappingDocument = ref(createEmptyDocument());
const mappingTargetFields = computed(() => {
    const fields = tableFields.value.map((field) => ({ code: field.column_code, label: field.column_label || field.column_code, type: field.data_type }));
    const known = new Set(fields.map((field) => field.code));
    for (const step of steps.value) {
        for (const code of [step.target_field, ...(step.rule_config.target_fields || [])]) {
            if (code && !known.has(code)) {
                fields.push({ code, label: code, type: '' });
                known.add(code);
            }
        }
    }
    return fields;
});
const mappingPolicy = computed(() => {
    const sourceFieldIds = tableFields.value.map((field) => field.column_code);
    const targetFieldIds = mappingTargetFields.value.map((field) => field.code);
    const hash = schemaHash(tableFields.value);
    return {
        caller: 'warehouse',
        allowedRuleTypes: PUBLIC_RULE_TYPES,
        source: { assetId: selectedTable.value || null, schemaHash: hash, allowedFieldIds: sourceFieldIds },
        target: { assetId: targetTableName.value.trim() || derivedTargetTable.value || null, schemaHash: hash, allowedFieldIds: targetFieldIds, readonlyFieldIds: [], protectedKeyFieldIds: [] },
        referenceLookup: {
            allowedDatasetIds: referenceDwdAssets.value.map((asset) => asset.table_name).filter((tableName) => tableName !== (targetTableName.value.trim() || derivedTargetTable.value)),
            allowedFieldIds: [], datasetLabels: Object.fromEntries(referenceDwdAssets.value.map((asset) => [asset.table_name, asset.table_label || asset.table_name])), maxRules: 20,
        },
        effects: { allowPreview: true, allowSave: true, allowPublish: false, allowExecute: true, allowRebuild: false },
        legacy: { sourceFormat: 'standardization_rules', allowLegacyRead: true, allowLegacyWrite: true, allowMigration: true },
        metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: new Date().toISOString() },
    };
});
const mappingOnlyPolicy = computed(() => ({
    ...mappingPolicy.value,
    allowedRuleTypes: MAPPING_RULE_TYPES,
}));
const transformationPolicy = computed(() => ({
    ...mappingPolicy.value,
    allowedRuleTypes: TRANSFORMATION_RULE_TYPES,
}));
const mappingFields = computed(() => tableFields.value.map((field) => ({ code: field.column_code, label: field.column_label || field.column_code, type: field.data_type })));
function refreshMappingDocument() { mappingDocument.value = buildMappingDocument(); }
function syncMappingToSteps(document) {
    const publicSteps = document.ruleSet.rules;
    const publicIndexes = steps.value.map((step, index) => mappingRuleTypeByStandard[step.rule_type] ? index : -1).filter((index) => index >= 0);
    const replacements = publicSteps.map(mappingRuleToStandardStep);
    const result = [...steps.value];
    publicIndexes.forEach((index, slot) => { result[index] = replacements[slot]; });
    if (replacements.length > publicIndexes.length)
        result.push(...replacements.slice(publicIndexes.length));
    if (replacements.length < publicIndexes.length) {
        const remove = new Set(publicIndexes.slice(replacements.length));
        steps.value = result.filter((_step, index) => !remove.has(index));
    }
    else {
        steps.value = result;
    }
    steps.value.forEach((step, index) => { step.display_order = index + 1; step.dirty = true; });
}
function isLegacyRule(ruleType) { return LEGACY_RULE_TYPES.includes(ruleType); }
async function focusPublicRule(index) {
    activePublicStepIndex.value = index;
    const step = steps.value[index];
    const rule = standardStepToMappingRule(step);
    const publicRule = rule && mappingDocument.value.ruleSet.rules.find((item) => item.id === rule.id);
    if (!publicRule) {
        ElMessage.warning('未能定位该规则的统一编辑器，请刷新后重试');
        return;
    }
    const isMappingRule = MAPPING_RULE_TYPES.includes(publicRule.type);
    if (isMappingRule)
        mappingDialogVisible.value = true;
    else
        transformationDialogVisible.value = true;
    await nextTick();
    const workspace = isMappingRule ? mappingWorkspaceRef.value : transformationWorkspaceRef.value;
    const focused = await workspace?.focusRule(publicRule.id);
    if (!focused)
        ElMessage.warning('未能定位该规则的统一编辑器，请刷新后重试');
}
function handleStepClick(index) {
    const step = steps.value[index];
    if (isLegacyRule(step.rule_type)) {
        editingIndex.value === index ? collapseStep() : expandStep(index);
    }
    else {
        focusPublicRule(index);
    }
}
function onMappingDirty(value) {
    mappingDirty.value = value;
    if (value)
        syncMappingToSteps(mappingDocument.value);
    dirty.value = mappingDirty.value || legacyDirty.value;
}
async function loadTables() {
    try {
        const res = await listAssets({ warehouse_layer: 'ODS', page_size: 200 });
        tables.value = res.items;
    }
    catch {
        tables.value = [];
    }
    try {
        const res = await listAssets({ warehouse_layer: 'DWD', page_size: 200 });
        referenceDwdAssets.value = res.items;
    }
    catch {
        referenceDwdAssets.value = [];
    }
}
async function onTableChange(tableName) {
    if (!tableName) {
        tableFields.value = [];
        return;
    }
    try {
        const res = await listAssetColumns(tableName);
        tableFields.value = res.columns.map((c) => ({ column_code: c.column_code, column_label: c.column_label, data_type: c.data_type || '' }));
    }
    catch {
        tableFields.value = [];
    }
    await loadRules();
}
const steps = ref([]);
const dirty = ref(false);
const activePublicStepIndex = ref(null);
const DEFAULT_PUBLIC_STEP_NAMES = {
    field: '\u5b57\u6bb5\u6620\u5c04',
    value_map: '\u679a\u4e3e/\u503c\u6620\u5c04',
    reference_lookup: '\u53c2\u8003 Lookup',
    identity_with_overrides: '\u9ed8\u8ba4\u81ea\u6620\u5c04+\u4f8b\u5916',
    type_convert: '\u7c7b\u578b\u8f6c\u6362',
    format: '\u683c\u5f0f\u8f6c\u6362',
    split_merge: '\u62c6\u5206/\u5408\u5e76',
};
const NODE_NAME_LABEL = '\u8282\u70b9\u540d\u79f0';
const NODE_NAME_PLACEHOLDER = '\u8bf7\u8f93\u5165\u6d41\u7a0b\u8282\u70b9\u540d\u79f0';
function defaultStepName(step) {
    const mappingRuleType = mappingRuleTypeByStandard[step.rule_type];
    return (mappingRuleType && DEFAULT_PUBLIC_STEP_NAMES[mappingRuleType]) || STANDARDIZATION_RULE_LABELS[step.rule_type] || step.rule_type;
}
const activePublicStepName = computed({
    get: () => {
        const index = activePublicStepIndex.value;
        const step = index === null ? null : steps.value[index];
        return step?.rule_config.display_name || (step ? defaultStepName(step) : '');
    },
    set: (value) => {
        const index = activePublicStepIndex.value;
        const step = index === null ? null : steps.value[index];
        if (!step)
            return;
        const displayName = value.trim();
        if (displayName)
            step.rule_config.display_name = displayName;
        else
            delete step.rule_config.display_name;
        const rule = standardStepToMappingRule(step);
        const documentRule = rule && mappingDocument.value.ruleSet.rules.find((item) => item.id === rule.id);
        if (documentRule) {
            const documentConfig = { ...documentRule.config };
            if (displayName)
                documentConfig.display_name = displayName;
            else
                delete documentConfig.display_name;
            documentRule.config = documentConfig;
        }
        step.dirty = true;
        mappingDirty.value = true;
        dirty.value = true;
    },
});
async function loadRules() {
    if (!selectedTable.value)
        return;
    try {
        const res = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 });
        steps.value = res.items.map(r => ({ id: r.id, rule_type: r.rule_type, source_field: r.source_field, target_field: r.target_field, rule_config: r.rule_config || {}, enabled: r.enabled, display_order: r.display_order })).sort((a, b) => a.display_order - b.display_order);
        legacyDirty.value = false;
        mappingDirty.value = false;
        dirty.value = false;
        activePublicStepIndex.value = null;
        refreshMappingDocument();
        mappingWorkspaceRef.value?.resetDirty();
        transformationWorkspaceRef.value?.resetDirty();
    }
    catch {
        steps.value = [];
    }
}
const showAddMenu = ref(false);
function openMappingDialog() {
    if (!selectedTable.value)
        return;
    activePublicStepIndex.value = null;
    mappingDialogVisible.value = true;
    showAddMenu.value = false;
}
function addStep(ruleType) {
    steps.value.push({ rule_type: ruleType, source_field: '', target_field: '', rule_config: { output_enabled: true }, enabled: true, display_order: steps.value.length + 1, dirty: true });
    const index = steps.value.length - 1;
    if (isLegacyRule(ruleType))
        expandStep(index);
    else {
        refreshMappingDocument();
        void focusPublicRule(index);
    }
    legacyDirty.value = isLegacyRule(ruleType) || legacyDirty.value;
    mappingDirty.value = !isLegacyRule(ruleType) || mappingDirty.value;
    dirty.value = true;
    showAddMenu.value = false;
}
function removeStep(index) {
    const removedPublicRule = !!mappingRuleTypeByStandard[steps.value[index].rule_type];
    steps.value.splice(index, 1);
    steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true; });
    if (removedPublicRule) {
        mappingDirty.value = true;
        refreshMappingDocument();
    }
    else
        legacyDirty.value = true;
    dirty.value = true;
}
function moveStep(index, dir) {
    const target = index + dir;
    if (target < 0 || target >= steps.value.length)
        return;
    const tmp = steps.value[target];
    steps.value[target] = steps.value[index];
    steps.value[index] = tmp;
    steps.value.forEach((s, i) => { s.display_order = i + 1; s.dirty = true; });
    if (mappingRuleTypeByStandard[steps.value[index].rule_type] || mappingRuleTypeByStandard[steps.value[target].rule_type]) {
        mappingDirty.value = true;
        refreshMappingDocument();
    }
    else
        legacyDirty.value = true;
    dirty.value = true;
}
const editingIndex = ref(-1);
function expandStep(index) { editingIndex.value = index; }
function collapseStep() { editingIndex.value = -1; }
const editingStep = computed(() => editingIndex.value >= 0 ? steps.value[editingIndex.value] : null);
function onStepFieldChange() {
    legacyDirty.value = true;
    dirty.value = true;
    if (editingIndex.value >= 0)
        steps.value[editingIndex.value].dirty = true;
}
function addMapRow() {
    const cfg = steps.value[editingIndex.value].rule_config;
    if (!cfg.mappings)
        cfg.mappings = [];
    cfg.mappings.push({ from: '', to: '' });
    onStepFieldChange();
}
function removeMapRow(rowIdx) {
    steps.value[editingIndex.value].rule_config.mappings.splice(rowIdx, 1);
    onStepFieldChange();
}
function addSplitField() {
    const cfg = steps.value[editingIndex.value].rule_config;
    if (!cfg.target_fields)
        cfg.target_fields = [];
    cfg.target_fields.push('');
    onStepFieldChange();
}
function removeSplitField(idx) {
    steps.value[editingIndex.value].rule_config.target_fields.splice(idx, 1);
    onStepFieldChange();
}
// ===== 保存 =====
const saving = ref(false);
async function doSave() {
    if (!selectedTable.value) {
        ElMessage.warning('请先选择来源表');
        return;
    }
    if (mappingDirty.value)
        syncMappingToSteps(mappingDocument.value);
    saving.value = true;
    try {
        const existing = await listStandardizationRules({ asset_code: selectedTable.value, page_size: 200 });
        for (const step of steps.value) {
            if (step.id) {
                await updateStandardizationRule(step.id, { rule_config: step.rule_config, enabled: step.enabled, display_order: step.display_order });
            }
            else {
                const created = await createStandardizationRule({ asset_type: 'table', asset_code: selectedTable.value, rule_type: step.rule_type, source_field: step.source_field, target_field: step.target_field, rule_config: step.rule_config, enabled: step.enabled, display_order: step.display_order });
                step.id = created.id;
            }
        }
        const currentIds = new Set(steps.value.filter(s => s.id).map(s => s.id));
        for (const rule of existing.items) {
            if (!currentIds.has(rule.id))
                await deleteStandardizationRule(rule.id);
        }
        dirty.value = false;
        legacyDirty.value = false;
        mappingDirty.value = false;
        steps.value.forEach(s => s.dirty = false);
        mappingWorkspaceRef.value?.resetDirty();
        transformationWorkspaceRef.value?.resetDirty();
        ElMessage.success('规则已保存');
        await loadRules();
        automationPanelRef.value?.refreshDetectedMode();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
// ===== 预览 =====
const previewLoading = ref(false);
const previewData = ref(null);
const previewMode = ref('detail');
const previewDebounce = ref(null);
async function doPreview() {
    if (!selectedTable.value || steps.value.length === 0)
        return;
    previewLoading.value = true;
    try {
        const ruleIds = steps.value.filter(s => s.id).map(s => s.id);
        const inlineRules = steps.value.filter(s => !s.id).map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }));
        previewData.value = await previewStandardization({ asset_code: selectedTable.value, rule_ids: ruleIds, inline_rules: inlineRules, sample_size: 20 });
    }
    catch {
        previewData.value = null;
    }
    finally {
        previewLoading.value = false;
    }
}
function schedulePreview() { if (previewDebounce.value)
    clearTimeout(previewDebounce.value); previewDebounce.value = setTimeout(doPreview, 500); }
// ===== 模板 =====
const templateVisible = ref(false);
const templates = ref([]);
const templateLoading = ref(false);
async function loadTemplates() { templateLoading.value = true; try {
    const res = await listStandardizationTemplates();
    templates.value = res.items;
}
catch {
    templates.value = [];
}
finally {
    templateLoading.value = false;
} ; templateVisible.value = true; }
async function applyTemplate(tpl) {
    try {
        await ElMessageBox.confirm(`模板"${tpl.name}"包含 ${tpl.template_rules?.length || 0} 条规则，将追加到当前步骤流末尾。`, '加载模板', { type: 'info' });
        await loadTemplateToAsset(tpl.id, selectedTable.value, 'table', 'skip');
        ElMessage.success('模板已加载');
        templateVisible.value = false;
        await loadRules();
    }
    catch { /* cancel */ }
}
// 保存为模板
const saveTplVisible = ref(false);
const saveTplForm = ref({ name: '', business_object: '' });
const saveTplSaving = ref(false);
function openSaveTemplate() { saveTplForm.value = { name: selectedTable.value + '_模板', business_object: '' }; saveTplVisible.value = true; }
async function doSaveTemplate() {
    if (!saveTplForm.value.name.trim()) {
        ElMessage.warning('请输入模板名称');
        return;
    }
    saveTplSaving.value = true;
    try {
        const tplRules = steps.value.map(s => ({ rule_type: s.rule_type, source_field: s.source_field, target_field: s.target_field, rule_config: s.rule_config, display_order: s.display_order }));
        await createStandardizationTemplate({ name: saveTplForm.value.name.trim(), business_object: saveTplForm.value.business_object.trim() || selectedTable.value, template_rules: tplRules });
        ElMessage.success('模板已保存');
        saveTplVisible.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存模板失败');
    }
    finally {
        saveTplSaving.value = false;
    }
}
// ===== 执行 =====
const executing = ref(false);
const execResult = ref(null);
async function doExecute() {
    if (!selectedTable.value)
        return;
    const target = targetTableName.value.trim() || derivedTargetTable.value;
    try {
        await ElMessageBox.confirm(`将对表"${selectedTable.value}"全量执行规则并写入"${target}"。目标表已存在时将被重建。确定？`, '确认执行', { type: 'warning' });
    }
    catch {
        return;
    }
    executing.value = true;
    execResult.value = null;
    try {
        if (dirty.value)
            await doSave();
        const res = await executeStandardization(selectedTable.value, target || undefined);
        execResult.value = { success: res.success, failed: res.failed, errors: res.errors || [] };
        if (res.failed === 0)
            ElMessage.success(`执行完成：共 ${res.total} 行 → ${res.target_table}，DWD 数据集字段已同步`);
        else
            ElMessage.warning(`执行完成：成功 ${res.success}，失败 ${res.failed}`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '执行失败');
    }
    finally {
        executing.value = false;
    }
}
// ===== 数据预览 =====
const previewItems = computed(() => previewData.value?.preview_items || previewData.value?.items || []);
const previewColumns = computed(() => { if (previewData.value?.columns)
    return previewData.value.columns; if (previewItems.value.length > 0)
    return Object.keys(previewItems.value[0]); return []; });
function stepSummary(s) {
    const from = s.source_field || '?';
    const to = s.target_field || '?';
    const cfg = s.rule_config;
    switch (s.rule_type) {
        case 'rename': return `${from} → ${to}`;
        case 'type_convert': return `${from}: ${cfg.from_type || '?'} → ${cfg.to_type || '?'}`;
        case 'value_map': return `${from}: ${cfg.mappings?.length || 0} 条映射`;
        case 'unit_convert': return `${from}: ${cfg.from_unit || '?'}→${cfg.to_unit || '?'}`;
        case 'split_merge': return `${from} → ${cfg.target_fields?.length || 0} 字段`;
        case 'deduplicate': return `${cfg.by?.join(',') || from}`;
        case 'null_handling': return `${to || from}: ${cfg.strategy || '?'}`;
        case 'format_standardize': return `${from}: ${cfg.format_type || '?'}`;
        default: return `${from} → ${to}`;
    }
}
const ruleTypeIcon = { rename: 'Aa', type_convert: '#', value_map: '{ }', unit_convert: '≍', split_merge: '⤨', deduplicate: '⊚', null_handling: '∅', format_standardize: '✦' };
watch(dirty, (v) => { if (v)
    window.addEventListener('beforeunload', warnUnsaved);
else
    window.removeEventListener('beforeunload', warnUnsaved); });
watch([targetTableName, derivedTargetTable], () => {
    mappingDocument.value.ruleSet.targetAsset = targetTableName.value.trim() || derivedTargetTable.value;
});
function warnUnsaved(e) { e.preventDefault(); e.returnValue = ''; }
const route = useRoute();
onMounted(async () => {
    await loadTables();
    const tableFromQuery = route.query.table;
    if (tableFromQuery && tables.value.some(t => t.table_name === tableFromQuery)) {
        selectedTable.value = tableFromQuery;
        await onTableChange(tableFromQuery);
    }
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['source-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['target-input']} */ ;
/** @type {__VLS_StyleScopedClasses['target-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['target-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['source-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['target-input']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['view-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['view-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['refresh-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['refresh-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-result']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-result']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-node-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-node-name']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['source']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['source']} */ ;
/** @type {__VLS_StyleScopedClasses['connector-line']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['connector-line']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['node-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['node-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['node-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['el-select']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input']} */ ;
/** @type {__VLS_StyleScopedClasses['config-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['recipe-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['recipe-empty']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "recipe-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "recipe-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-top" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
    ...{ class: "page-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "source-selector" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.selectedTable),
    filterable: true,
    placeholder: "选择 ODS 表",
    size: "default",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.selectedTable),
    filterable: true,
    placeholder: "选择 ODS 表",
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onChange: (__VLS_ctx.onTableChange)
};
__VLS_3.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tables))) {
    const __VLS_8 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        key: (t.table_name),
        label: (`${t.table_label || t.table_name}`),
        value: (t.table_name),
    }));
    const __VLS_10 = __VLS_9({
        key: (t.table_name),
        label: (`${t.table_label || t.table_name}`),
        value: (t.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (t.table_label || t.table_name);
    const __VLS_12 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        size: "small",
        type: "info",
        ...{ style: {} },
    }));
    const __VLS_14 = __VLS_13({
        size: "small",
        type: "info",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    (t.warehouse_layer);
    var __VLS_15;
    var __VLS_11;
}
var __VLS_3;
if (__VLS_ctx.userStore.hasOp('warehouse.cleaning', 'U')) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "target-input" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    const __VLS_16 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        modelValue: (__VLS_ctx.targetTableName),
        placeholder: (__VLS_ctx.derivedTargetTable),
        size: "default",
        clearable: true,
    }));
    const __VLS_18 = __VLS_17({
        modelValue: (__VLS_ctx.targetTableName),
        placeholder: (__VLS_ctx.derivedTargetTable),
        size: "default",
        clearable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    if (__VLS_ctx.targetTableName && __VLS_ctx.targetTableName !== __VLS_ctx.derivedTargetTable) {
        const __VLS_20 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }));
        const __VLS_22 = __VLS_21({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "warning",
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        let __VLS_24;
        let __VLS_25;
        let __VLS_26;
        const __VLS_27 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.cleaning', 'U')))
                    return;
                if (!(__VLS_ctx.targetTableName && __VLS_ctx.targetTableName !== __VLS_ctx.derivedTargetTable))
                    return;
                __VLS_ctx.targetTableName = '';
            }
        };
        __VLS_23.slots.default;
        var __VLS_23;
    }
}
else if (__VLS_ctx.selectedTable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "target-readonly" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "derived-name" },
    });
    (__VLS_ctx.derivedTargetTable);
    const __VLS_28 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
    const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.Lock;
    /** @type {[typeof __VLS_components.Lock, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    var __VLS_31;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-actions" },
});
if (__VLS_ctx.dirty) {
    const __VLS_36 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ 'onClick': {} },
        type: "warning",
        size: "default",
        loading: (__VLS_ctx.saving),
        plain: true,
    }));
    const __VLS_38 = __VLS_37({
        ...{ 'onClick': {} },
        type: "warning",
        size: "default",
        loading: (__VLS_ctx.saving),
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    let __VLS_40;
    let __VLS_41;
    let __VLS_42;
    const __VLS_43 = {
        onClick: (__VLS_ctx.doSave)
    };
    __VLS_39.slots.default;
    var __VLS_39;
}
const __VLS_44 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.selectedTable),
    size: "default",
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
    disabled: (!__VLS_ctx.selectedTable),
    size: "default",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.loadTemplates)
};
__VLS_47.slots.default;
const __VLS_52 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    ...{ style: {} },
}));
const __VLS_54 = __VLS_53({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.Upload;
/** @type {[typeof __VLS_components.Upload, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
var __VLS_55;
var __VLS_47;
const __VLS_60 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.steps.length === 0),
    size: "default",
    type: "primary",
    plain: true,
}));
const __VLS_62 = __VLS_61({
    ...{ 'onClick': {} },
    disabled: (__VLS_ctx.steps.length === 0),
    size: "default",
    type: "primary",
    plain: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
let __VLS_64;
let __VLS_65;
let __VLS_66;
const __VLS_67 = {
    onClick: (__VLS_ctx.openSaveTemplate)
};
__VLS_63.slots.default;
var __VLS_63;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-group toolbar-group-primary" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.openMappingDialog) },
    ...{ class: "tool-btn" },
    disabled: (!__VLS_ctx.selectedTable),
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "tool-btn-icon" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "tool-btn-label" },
});
for (const [rt] of __VLS_getVForSourceType((__VLS_ctx.TOP_TRANSFORMATION_RULE_TYPES))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.addStep(__VLS_ctx.standardRuleTypeByMapping[rt]);
            } },
        key: (rt),
        ...{ class: "tool-btn" },
        disabled: (!__VLS_ctx.selectedTable),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tool-btn-icon" },
    });
    (__VLS_ctx.ruleTypeIcon[__VLS_ctx.standardRuleTypeByMapping[rt]]);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tool-btn-label" },
    });
    (__VLS_ctx.RULE_LABELS[rt]);
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "toolbar-divider" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "toolbar-group" },
});
for (const [rt] of __VLS_getVForSourceType((__VLS_ctx.LEGACY_RULE_TYPES))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.addStep(rt);
            } },
        key: (rt),
        ...{ class: "tool-btn" },
        disabled: (!__VLS_ctx.selectedTable),
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tool-btn-icon" },
    });
    (__VLS_ctx.ruleTypeIcon[rt]);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "tool-btn-label" },
    });
    (__VLS_ctx.STANDARDIZATION_RULE_LABELS[rt]);
}
if (__VLS_ctx.selectedTable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "recipe-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "preview-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "preview-toolbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "view-switch" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedTable))
                    return;
                __VLS_ctx.previewMode = 'detail';
                __VLS_ctx.doPreview();
            } },
        ...{ class: ({ active: __VLS_ctx.previewMode === 'detail' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(__VLS_ctx.selectedTable))
                    return;
                __VLS_ctx.previewMode = 'structure';
            } },
        ...{ class: ({ active: __VLS_ctx.previewMode === 'structure' }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.doPreview) },
        ...{ class: "refresh-btn" },
        disabled: (__VLS_ctx.steps.length === 0),
    });
    const __VLS_68 = {}.Refresh;
    /** @type {[typeof __VLS_components.Refresh, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    if (__VLS_ctx.previewMode === 'detail') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-table-wrap" },
        });
        __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.previewLoading) }, null, null);
        if (__VLS_ctx.previewColumns.length && __VLS_ctx.previewItems.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.table, __VLS_intrinsicElements.table)({
                ...{ class: "data-table" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.thead, __VLS_intrinsicElements.thead)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({});
            for (const [c] of __VLS_getVForSourceType((__VLS_ctx.previewColumns))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.th, __VLS_intrinsicElements.th)({
                    key: (c),
                });
                (c);
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.tbody, __VLS_intrinsicElements.tbody)({});
            for (const [row, i] of __VLS_getVForSourceType((__VLS_ctx.previewItems))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.tr, __VLS_intrinsicElements.tr)({
                    key: (i),
                    ...{ class: ({ odd: i % 2 === 0 }) },
                });
                for (const [c] of __VLS_getVForSourceType((__VLS_ctx.previewColumns))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.td, __VLS_intrinsicElements.td)({
                        key: (c),
                        title: (row[c]),
                    });
                    (row[c]);
                }
            }
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "preview-empty" },
            });
            if (__VLS_ctx.steps.length === 0) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
            }
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preview-table-wrap" },
        });
        const __VLS_72 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
            data: (__VLS_ctx.tableFields),
            size: "small",
            border: true,
        }));
        const __VLS_74 = __VLS_73({
            data: (__VLS_ctx.tableFields),
            size: "small",
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_73));
        __VLS_75.slots.default;
        const __VLS_76 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            prop: "column_code",
            label: "字段名",
            width: "160",
        }));
        const __VLS_78 = __VLS_77({
            prop: "column_code",
            label: "字段名",
            width: "160",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        const __VLS_80 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            prop: "column_label",
            label: "中文名",
            width: "140",
        }));
        const __VLS_82 = __VLS_81({
            prop: "column_label",
            label: "中文名",
            width: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        const __VLS_84 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            prop: "data_type",
            label: "类型",
            width: "100",
        }));
        const __VLS_86 = __VLS_85({
            prop: "data_type",
            label: "类型",
            width: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        const __VLS_88 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            label: "来源",
        }));
        const __VLS_90 = __VLS_89({
            label: "来源",
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_91.slots;
            (__VLS_ctx.selectedTable);
        }
        var __VLS_91;
        var __VLS_75;
    }
    if (__VLS_ctx.execResult) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "exec-result" },
            ...{ class: (__VLS_ctx.execResult.failed ? 'warn' : 'ok') },
        });
        if (__VLS_ctx.execResult.failed === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.execResult.success);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            (__VLS_ctx.execResult.success);
            (__VLS_ctx.execResult.failed);
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "bottom-actions" },
    });
    const __VLS_92 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewLoading),
        disabled: (__VLS_ctx.steps.length === 0),
        size: "default",
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.previewLoading),
        disabled: (__VLS_ctx.steps.length === 0),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onClick: (__VLS_ctx.doPreview)
    };
    __VLS_95.slots.default;
    var __VLS_95;
    const __VLS_100 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
        size: "default",
    }));
    const __VLS_102 = __VLS_101({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    let __VLS_104;
    let __VLS_105;
    let __VLS_106;
    const __VLS_107 = {
        onClick: (__VLS_ctx.doSave)
    };
    __VLS_103.slots.default;
    var __VLS_103;
    const __VLS_108 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        ...{ 'onClick': {} },
        type: "success",
        icon: (__VLS_ctx.VideoPlay),
        loading: (__VLS_ctx.executing),
        disabled: (__VLS_ctx.steps.length === 0),
        size: "default",
    }));
    const __VLS_110 = __VLS_109({
        ...{ 'onClick': {} },
        type: "success",
        icon: (__VLS_ctx.VideoPlay),
        loading: (__VLS_ctx.executing),
        disabled: (__VLS_ctx.steps.length === 0),
        size: "default",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    let __VLS_112;
    let __VLS_113;
    let __VLS_114;
    const __VLS_115 = {
        onClick: (__VLS_ctx.doExecute)
    };
    __VLS_111.slots.default;
    var __VLS_111;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "flow-zone" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "legacy-rule-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({
        ...{ class: "flow-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-source-node" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-dot source" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-card source" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-name" },
    });
    (__VLS_ctx.selectedTable);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "node-meta" },
    });
    (__VLS_ctx.tableFields.length);
    for (const [step, i] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (i),
            ...{ class: "flow-step-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "flow-connector" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "connector-line" },
            ...{ class: ({ active: __VLS_ctx.editingIndex === i }) },
        });
        if (i === 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "connector-arrow" },
            });
            const __VLS_116 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({}));
            const __VLS_118 = __VLS_117({}, ...__VLS_functionalComponentArgsRest(__VLS_117));
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedTable))
                        return;
                    __VLS_ctx.handleStepClick(i);
                } },
            ...{ class: "flow-node" },
            ...{ class: ({ expanded: __VLS_ctx.editingIndex === i, dirty: step.dirty, public: !__VLS_ctx.isLegacyRule(step.rule_type) }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "node-dot" },
            ...{ class: (step.enabled ? 'active' : 'disabled') },
        });
        (i + 1);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "node-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "node-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "node-type-icon" },
        });
        (__VLS_ctx.ruleTypeIcon[step.rule_type]);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "node-type-label" },
        });
        (step.rule_config.display_name || __VLS_ctx.defaultStepName(step));
        if (!step.enabled) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "node-disabled-tag" },
            });
        }
        if (__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: () => { } },
                ...{ class: "node-actions" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedTable))
                            return;
                        if (!(__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)))
                            return;
                        __VLS_ctx.moveStep(i, -1);
                    } },
                disabled: (i === 0),
                title: "上移",
            });
            const __VLS_120 = {}.Top;
            /** @type {[typeof __VLS_components.Top, ]} */ ;
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({}));
            const __VLS_122 = __VLS_121({}, ...__VLS_functionalComponentArgsRest(__VLS_121));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedTable))
                            return;
                        if (!(__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)))
                            return;
                        __VLS_ctx.moveStep(i, 1);
                    } },
                disabled: (i === __VLS_ctx.steps.length - 1),
                title: "下移",
            });
            const __VLS_124 = {}.Bottom;
            /** @type {[typeof __VLS_components.Bottom, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({}));
            const __VLS_126 = __VLS_125({}, ...__VLS_functionalComponentArgsRest(__VLS_125));
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.selectedTable))
                            return;
                        if (!(__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)))
                            return;
                        __VLS_ctx.removeStep(i);
                    } },
                ...{ class: "danger" },
                title: "删除",
            });
            const __VLS_128 = {}.Delete;
            /** @type {[typeof __VLS_components.Delete, ]} */ ;
            // @ts-ignore
            const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({}));
            const __VLS_130 = __VLS_129({}, ...__VLS_functionalComponentArgsRest(__VLS_129));
        }
        if (__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ onClick: () => { } },
                ...{ class: "config-panel" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            const __VLS_132 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
                ...{ 'onChange': {} },
                modelValue: (step.source_field),
                filterable: true,
                placeholder: "选择字段",
                size: "small",
            }));
            const __VLS_134 = __VLS_133({
                ...{ 'onChange': {} },
                modelValue: (step.source_field),
                filterable: true,
                placeholder: "选择字段",
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_133));
            let __VLS_136;
            let __VLS_137;
            let __VLS_138;
            const __VLS_139 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            __VLS_135.slots.default;
            for (const [f] of __VLS_getVForSourceType((__VLS_ctx.tableFields))) {
                const __VLS_140 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                    key: (f.column_code),
                    label: (`${f.column_label || f.column_code}`),
                    value: (f.column_code),
                }));
                const __VLS_142 = __VLS_141({
                    key: (f.column_code),
                    label: (`${f.column_label || f.column_code}`),
                    value: (f.column_code),
                }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            }
            var __VLS_135;
            if (step.rule_type !== 'deduplicate') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_144 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                    ...{ 'onChange': {} },
                    modelValue: (step.target_field),
                    size: "small",
                    placeholder: "目标字段名",
                }));
                const __VLS_146 = __VLS_145({
                    ...{ 'onChange': {} },
                    modelValue: (step.target_field),
                    size: "small",
                    placeholder: "目标字段名",
                }, ...__VLS_functionalComponentArgsRest(__VLS_145));
                let __VLS_148;
                let __VLS_149;
                let __VLS_150;
                const __VLS_151 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                var __VLS_147;
            }
            if (step.rule_type === 'type_convert') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_152 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.from_type),
                    size: "small",
                }));
                const __VLS_154 = __VLS_153({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.from_type),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_153));
                let __VLS_156;
                let __VLS_157;
                let __VLS_158;
                const __VLS_159 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_155.slots.default;
                for (const [t] of __VLS_getVForSourceType((['text', 'int', 'float', 'decimal', 'date', 'boolean']))) {
                    const __VLS_160 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                        key: (t),
                        value: (t),
                    }));
                    const __VLS_162 = __VLS_161({
                        key: (t),
                        value: (t),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
                }
                var __VLS_155;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_164 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.to_type),
                    size: "small",
                }));
                const __VLS_166 = __VLS_165({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.to_type),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_165));
                let __VLS_168;
                let __VLS_169;
                let __VLS_170;
                const __VLS_171 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_167.slots.default;
                for (const [t] of __VLS_getVForSourceType((['int', 'float', 'decimal', 'text', 'date', 'boolean']))) {
                    const __VLS_172 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                        key: (t),
                        value: (t),
                    }));
                    const __VLS_174 = __VLS_173({
                        key: (t),
                        value: (t),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
                }
                var __VLS_167;
            }
            if (step.rule_type === 'value_map') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                for (const [m, mi] of __VLS_getVForSourceType(((step.rule_config.mappings || [])))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (mi),
                        ...{ class: "map-row" },
                    });
                    const __VLS_176 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                        ...{ 'onChange': {} },
                        modelValue: (m.from),
                        size: "small",
                        placeholder: "原值",
                    }));
                    const __VLS_178 = __VLS_177({
                        ...{ 'onChange': {} },
                        modelValue: (m.from),
                        size: "small",
                        placeholder: "原值",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
                    let __VLS_180;
                    let __VLS_181;
                    let __VLS_182;
                    const __VLS_183 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_179;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                        ...{ class: "map-arrow" },
                    });
                    const __VLS_184 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
                        ...{ 'onChange': {} },
                        modelValue: (m.to),
                        size: "small",
                        placeholder: "新值",
                    }));
                    const __VLS_186 = __VLS_185({
                        ...{ 'onChange': {} },
                        modelValue: (m.to),
                        size: "small",
                        placeholder: "新值",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
                    let __VLS_188;
                    let __VLS_189;
                    let __VLS_190;
                    const __VLS_191 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_187;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.selectedTable))
                                    return;
                                if (!(__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)))
                                    return;
                                if (!(step.rule_type === 'value_map'))
                                    return;
                                __VLS_ctx.removeMapRow(mi);
                            } },
                        ...{ class: "config-remove" },
                    });
                }
                const __VLS_192 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    type: "primary",
                }));
                const __VLS_194 = __VLS_193({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_193));
                let __VLS_196;
                let __VLS_197;
                let __VLS_198;
                const __VLS_199 = {
                    onClick: (__VLS_ctx.addMapRow)
                };
                __VLS_195.slots.default;
                var __VLS_195;
            }
            if (step.rule_type === 'unit_convert') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-row" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_200 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.from_unit),
                    size: "small",
                    placeholder: "如：元",
                }));
                const __VLS_202 = __VLS_201({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.from_unit),
                    size: "small",
                    placeholder: "如：元",
                }, ...__VLS_functionalComponentArgsRest(__VLS_201));
                let __VLS_204;
                let __VLS_205;
                let __VLS_206;
                const __VLS_207 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                var __VLS_203;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_208 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.to_unit),
                    size: "small",
                    placeholder: "如：万元",
                }));
                const __VLS_210 = __VLS_209({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.to_unit),
                    size: "small",
                    placeholder: "如：万元",
                }, ...__VLS_functionalComponentArgsRest(__VLS_209));
                let __VLS_212;
                let __VLS_213;
                let __VLS_214;
                const __VLS_215 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                var __VLS_211;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_216 = {}.ElInputNumber;
                /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                // @ts-ignore
                const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.multiplier),
                    size: "small",
                    min: (0.0001),
                    step: (1),
                }));
                const __VLS_218 = __VLS_217({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.multiplier),
                    size: "small",
                    min: (0.0001),
                    step: (1),
                }, ...__VLS_functionalComponentArgsRest(__VLS_217));
                let __VLS_220;
                let __VLS_221;
                let __VLS_222;
                const __VLS_223 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                var __VLS_219;
            }
            if (step.rule_type === 'split_merge') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_224 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.separator),
                    size: "small",
                    placeholder: "如：,",
                    ...{ style: {} },
                }));
                const __VLS_226 = __VLS_225({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.separator),
                    size: "small",
                    placeholder: "如：,",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_225));
                let __VLS_228;
                let __VLS_229;
                let __VLS_230;
                const __VLS_231 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                var __VLS_227;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ style: {} },
                });
                for (const [tf, ti] of __VLS_getVForSourceType(((step.rule_config.target_fields || [])))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        key: (ti),
                        ...{ class: "map-row" },
                    });
                    const __VLS_232 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.target_fields[ti]),
                        size: "small",
                        placeholder: "字段名",
                    }));
                    const __VLS_234 = __VLS_233({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.target_fields[ti]),
                        size: "small",
                        placeholder: "字段名",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
                    let __VLS_236;
                    let __VLS_237;
                    let __VLS_238;
                    const __VLS_239 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_235;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.selectedTable))
                                    return;
                                if (!(__VLS_ctx.editingIndex === i && __VLS_ctx.isLegacyRule(step.rule_type)))
                                    return;
                                if (!(step.rule_type === 'split_merge'))
                                    return;
                                __VLS_ctx.removeSplitField(ti);
                            } },
                        ...{ class: "config-remove" },
                    });
                }
                const __VLS_240 = {}.ElButton;
                /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
                // @ts-ignore
                const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    type: "primary",
                }));
                const __VLS_242 = __VLS_241({
                    ...{ 'onClick': {} },
                    size: "small",
                    text: true,
                    type: "primary",
                }, ...__VLS_functionalComponentArgsRest(__VLS_241));
                let __VLS_244;
                let __VLS_245;
                let __VLS_246;
                const __VLS_247 = {
                    onClick: (__VLS_ctx.addSplitField)
                };
                __VLS_243.slots.default;
                var __VLS_243;
            }
            if (step.rule_type === 'deduplicate') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_248 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.by),
                    multiple: true,
                    filterable: true,
                    placeholder: "选择去重字段",
                    size: "small",
                }));
                const __VLS_250 = __VLS_249({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.by),
                    multiple: true,
                    filterable: true,
                    placeholder: "选择去重字段",
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_249));
                let __VLS_252;
                let __VLS_253;
                let __VLS_254;
                const __VLS_255 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_251.slots.default;
                for (const [f] of __VLS_getVForSourceType((__VLS_ctx.tableFields))) {
                    const __VLS_256 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
                        key: (f.column_code),
                        label: (f.column_label || f.column_code),
                        value: (f.column_code),
                    }));
                    const __VLS_258 = __VLS_257({
                        key: (f.column_code),
                        label: (f.column_label || f.column_code),
                        value: (f.column_code),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
                }
                var __VLS_251;
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ style: {} },
                });
                const __VLS_260 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.keep),
                    size: "small",
                }));
                const __VLS_262 = __VLS_261({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.keep),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_261));
                let __VLS_264;
                let __VLS_265;
                let __VLS_266;
                const __VLS_267 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_263.slots.default;
                const __VLS_268 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
                    label: "保留第一条",
                    value: "first",
                }));
                const __VLS_270 = __VLS_269({
                    label: "保留第一条",
                    value: "first",
                }, ...__VLS_functionalComponentArgsRest(__VLS_269));
                const __VLS_272 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
                    label: "保留最后一条",
                    value: "last",
                }));
                const __VLS_274 = __VLS_273({
                    label: "保留最后一条",
                    value: "last",
                }, ...__VLS_functionalComponentArgsRest(__VLS_273));
                var __VLS_263;
            }
            if (step.rule_type === 'null_handling') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_276 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.strategy),
                    size: "small",
                }));
                const __VLS_278 = __VLS_277({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.strategy),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_277));
                let __VLS_280;
                let __VLS_281;
                let __VLS_282;
                const __VLS_283 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_279.slots.default;
                const __VLS_284 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
                    label: "填充默认值",
                    value: "fill_default",
                }));
                const __VLS_286 = __VLS_285({
                    label: "填充默认值",
                    value: "fill_default",
                }, ...__VLS_functionalComponentArgsRest(__VLS_285));
                const __VLS_288 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
                    label: "标记问题行",
                    value: "mark",
                }));
                const __VLS_290 = __VLS_289({
                    label: "标记问题行",
                    value: "mark",
                }, ...__VLS_functionalComponentArgsRest(__VLS_289));
                const __VLS_292 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
                    label: "跳过（保留空值）",
                    value: "skip",
                }));
                const __VLS_294 = __VLS_293({
                    label: "跳过（保留空值）",
                    value: "skip",
                }, ...__VLS_functionalComponentArgsRest(__VLS_293));
                const __VLS_296 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                    label: "使用上游值",
                    value: "use_upstream",
                }));
                const __VLS_298 = __VLS_297({
                    label: "使用上游值",
                    value: "use_upstream",
                }, ...__VLS_functionalComponentArgsRest(__VLS_297));
                var __VLS_279;
                if (step.rule_config.strategy === 'fill_default') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-field" },
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                    const __VLS_300 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.default),
                        size: "small",
                        placeholder: "默认值",
                    }));
                    const __VLS_302 = __VLS_301({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.default),
                        size: "small",
                        placeholder: "默认值",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
                    let __VLS_304;
                    let __VLS_305;
                    let __VLS_306;
                    const __VLS_307 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_303;
                }
            }
            if (step.rule_type === 'format_standardize') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "config-section" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                const __VLS_308 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.format_type),
                    size: "small",
                }));
                const __VLS_310 = __VLS_309({
                    ...{ 'onChange': {} },
                    modelValue: (step.rule_config.format_type),
                    size: "small",
                }, ...__VLS_functionalComponentArgsRest(__VLS_309));
                let __VLS_312;
                let __VLS_313;
                let __VLS_314;
                const __VLS_315 = {
                    onChange: (__VLS_ctx.onStepFieldChange)
                };
                __VLS_311.slots.default;
                const __VLS_316 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
                    label: "日期格式",
                    value: "date",
                }));
                const __VLS_318 = __VLS_317({
                    label: "日期格式",
                    value: "date",
                }, ...__VLS_functionalComponentArgsRest(__VLS_317));
                const __VLS_320 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
                    label: "编码格式",
                    value: "code",
                }));
                const __VLS_322 = __VLS_321({
                    label: "编码格式",
                    value: "code",
                }, ...__VLS_functionalComponentArgsRest(__VLS_321));
                const __VLS_324 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
                    label: "大小写",
                    value: "case",
                }));
                const __VLS_326 = __VLS_325({
                    label: "大小写",
                    value: "case",
                }, ...__VLS_functionalComponentArgsRest(__VLS_325));
                const __VLS_328 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_329 = __VLS_asFunctionalComponent(__VLS_328, new __VLS_328({
                    label: "去空格",
                    value: "trim",
                }));
                const __VLS_330 = __VLS_329({
                    label: "去空格",
                    value: "trim",
                }, ...__VLS_functionalComponentArgsRest(__VLS_329));
                const __VLS_332 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({
                    label: "字段长度",
                    value: "truncate",
                }));
                const __VLS_334 = __VLS_333({
                    label: "字段长度",
                    value: "truncate",
                }, ...__VLS_functionalComponentArgsRest(__VLS_333));
                var __VLS_311;
                if (step.rule_config.format_type === 'date') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-row" },
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                    const __VLS_336 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.from_format),
                        size: "small",
                        placeholder: "yyyyMMdd",
                    }));
                    const __VLS_338 = __VLS_337({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.from_format),
                        size: "small",
                        placeholder: "yyyyMMdd",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_337));
                    let __VLS_340;
                    let __VLS_341;
                    let __VLS_342;
                    const __VLS_343 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_339;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-field" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                    const __VLS_344 = {}.ElInput;
                    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                    // @ts-ignore
                    const __VLS_345 = __VLS_asFunctionalComponent(__VLS_344, new __VLS_344({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.to_format),
                        size: "small",
                        placeholder: "yyyy-MM-dd",
                    }));
                    const __VLS_346 = __VLS_345({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.to_format),
                        size: "small",
                        placeholder: "yyyy-MM-dd",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_345));
                    let __VLS_348;
                    let __VLS_349;
                    let __VLS_350;
                    const __VLS_351 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_347;
                }
                if (step.rule_config.format_type === 'case') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-field" },
                        ...{ style: {} },
                    });
                    const __VLS_352 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.case_type),
                        size: "small",
                    }));
                    const __VLS_354 = __VLS_353({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.case_type),
                        size: "small",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_353));
                    let __VLS_356;
                    let __VLS_357;
                    let __VLS_358;
                    const __VLS_359 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    __VLS_355.slots.default;
                    const __VLS_360 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_361 = __VLS_asFunctionalComponent(__VLS_360, new __VLS_360({
                        label: "大写",
                        value: "upper",
                    }));
                    const __VLS_362 = __VLS_361({
                        label: "大写",
                        value: "upper",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_361));
                    const __VLS_364 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
                        label: "小写",
                        value: "lower",
                    }));
                    const __VLS_366 = __VLS_365({
                        label: "小写",
                        value: "lower",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_365));
                    var __VLS_355;
                }
                if (step.rule_config.format_type === 'truncate') {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "config-field" },
                        ...{ style: {} },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
                    const __VLS_368 = {}.ElInputNumber;
                    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
                    // @ts-ignore
                    const __VLS_369 = __VLS_asFunctionalComponent(__VLS_368, new __VLS_368({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.max_length),
                        size: "small",
                        min: (1),
                        max: (10000),
                    }));
                    const __VLS_370 = __VLS_369({
                        ...{ 'onChange': {} },
                        modelValue: (step.rule_config.max_length),
                        size: "small",
                        min: (1),
                        max: (10000),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_369));
                    let __VLS_372;
                    let __VLS_373;
                    let __VLS_374;
                    const __VLS_375 = {
                        onChange: (__VLS_ctx.onStepFieldChange)
                    };
                    var __VLS_371;
                }
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
            const __VLS_376 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_377 = __VLS_asFunctionalComponent(__VLS_376, new __VLS_376({
                ...{ 'onChange': {} },
                modelValue: (step.enabled),
                size: "small",
                activeText: "启用",
            }));
            const __VLS_378 = __VLS_377({
                ...{ 'onChange': {} },
                modelValue: (step.enabled),
                size: "small",
                activeText: "启用",
            }, ...__VLS_functionalComponentArgsRest(__VLS_377));
            let __VLS_380;
            let __VLS_381;
            let __VLS_382;
            const __VLS_383 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            var __VLS_379;
            const __VLS_384 = {}.ElSwitch;
            /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
            // @ts-ignore
            const __VLS_385 = __VLS_asFunctionalComponent(__VLS_384, new __VLS_384({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_enabled),
                size: "small",
                activeText: "输出到DWD",
            }));
            const __VLS_386 = __VLS_385({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_enabled),
                size: "small",
                activeText: "输出到DWD",
            }, ...__VLS_functionalComponentArgsRest(__VLS_385));
            let __VLS_388;
            let __VLS_389;
            let __VLS_390;
            const __VLS_391 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            var __VLS_387;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-section" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-row" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            const __VLS_392 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_393 = __VLS_asFunctionalComponent(__VLS_392, new __VLS_392({
                ...{ 'onChange': {} },
                modelValue: (step.target_field),
                size: "small",
                placeholder: "DWD 字段名",
            }));
            const __VLS_394 = __VLS_393({
                ...{ 'onChange': {} },
                modelValue: (step.target_field),
                size: "small",
                placeholder: "DWD 字段名",
            }, ...__VLS_functionalComponentArgsRest(__VLS_393));
            let __VLS_396;
            let __VLS_397;
            let __VLS_398;
            const __VLS_399 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            var __VLS_395;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-field" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            const __VLS_400 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_401 = __VLS_asFunctionalComponent(__VLS_400, new __VLS_400({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_label),
                size: "small",
                placeholder: "中文展示名",
            }));
            const __VLS_402 = __VLS_401({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_label),
                size: "small",
                placeholder: "中文展示名",
            }, ...__VLS_functionalComponentArgsRest(__VLS_401));
            let __VLS_404;
            let __VLS_405;
            let __VLS_406;
            const __VLS_407 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            var __VLS_403;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-field" },
                ...{ style: {} },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            const __VLS_408 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_409 = __VLS_asFunctionalComponent(__VLS_408, new __VLS_408({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_description),
                size: "small",
                placeholder: "字段口径说明",
            }));
            const __VLS_410 = __VLS_409({
                ...{ 'onChange': {} },
                modelValue: (step.rule_config.output_description),
                size: "small",
                placeholder: "字段口径说明",
            }, ...__VLS_functionalComponentArgsRest(__VLS_409));
            let __VLS_412;
            let __VLS_413;
            let __VLS_414;
            const __VLS_415 = {
                onChange: (__VLS_ctx.onStepFieldChange)
            };
            var __VLS_411;
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-add-area" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "flow-connector" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "connector-line dashed" },
    });
    const __VLS_416 = {}.ElPopover;
    /** @type {[typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, typeof __VLS_components.ElPopover, typeof __VLS_components.elPopover, ]} */ ;
    // @ts-ignore
    const __VLS_417 = __VLS_asFunctionalComponent(__VLS_416, new __VLS_416({
        visible: (__VLS_ctx.showAddMenu),
        placement: "bottom-start",
        width: (220),
        trigger: "click",
    }));
    const __VLS_418 = __VLS_417({
        visible: (__VLS_ctx.showAddMenu),
        placement: "bottom-start",
        width: (220),
        trigger: "click",
    }, ...__VLS_functionalComponentArgsRest(__VLS_417));
    __VLS_419.slots.default;
    {
        const { reference: __VLS_thisSlot } = __VLS_419.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ class: "add-step-btn" },
            disabled: (!__VLS_ctx.selectedTable),
        });
        const __VLS_420 = {}.Plus;
        /** @type {[typeof __VLS_components.Plus, ]} */ ;
        // @ts-ignore
        const __VLS_421 = __VLS_asFunctionalComponent(__VLS_420, new __VLS_420({}));
        const __VLS_422 = __VLS_421({}, ...__VLS_functionalComponentArgsRest(__VLS_421));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "add-step-menu" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openMappingDialog) },
        ...{ class: "add-step-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "add-step-icon" },
    });
    for (const [rt] of __VLS_getVForSourceType((__VLS_ctx.TRANSFORMATION_RULE_TYPES))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedTable))
                        return;
                    __VLS_ctx.addStep(__VLS_ctx.standardRuleTypeByMapping[rt]);
                } },
            key: (rt),
            ...{ class: "add-step-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "add-step-icon" },
        });
        (__VLS_ctx.ruleTypeIcon[__VLS_ctx.standardRuleTypeByMapping[rt]]);
        (__VLS_ctx.RULE_LABELS[rt]);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "add-step-divider" },
    });
    for (const [rt] of __VLS_getVForSourceType((__VLS_ctx.LEGACY_RULE_TYPES))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.selectedTable))
                        return;
                    __VLS_ctx.addStep(rt);
                } },
            key: (rt),
            ...{ class: "add-step-item" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "add-step-icon" },
        });
        (__VLS_ctx.ruleTypeIcon[rt]);
        (__VLS_ctx.STANDARDIZATION_RULE_LABELS[rt]);
    }
    var __VLS_419;
}
if (__VLS_ctx.selectedTable) {
    /** @type {[typeof OdsDwdAutomationPanel, ]} */ ;
    // @ts-ignore
    const __VLS_424 = __VLS_asFunctionalComponent(OdsDwdAutomationPanel, new OdsDwdAutomationPanel({
        ref: "automationPanelRef",
        odsTableName: (__VLS_ctx.selectedTable),
        targetTableName: (__VLS_ctx.targetTableName || __VLS_ctx.derivedTargetTable),
    }));
    const __VLS_425 = __VLS_424({
        ref: "automationPanelRef",
        odsTableName: (__VLS_ctx.selectedTable),
        targetTableName: (__VLS_ctx.targetTableName || __VLS_ctx.derivedTargetTable),
    }, ...__VLS_functionalComponentArgsRest(__VLS_424));
    /** @type {typeof __VLS_ctx.automationPanelRef} */ ;
    var __VLS_427 = {};
    var __VLS_426;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "recipe-empty" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-illustration" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
const __VLS_429 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_430 = __VLS_asFunctionalComponent(__VLS_429, new __VLS_429({
    modelValue: (__VLS_ctx.mappingDialogVisible),
    title: "维护映射",
    width: "92%",
    alignCenter: true,
    closeOnClickModal: (false),
    ...{ class: "mapping-dialog" },
}));
const __VLS_431 = __VLS_430({
    modelValue: (__VLS_ctx.mappingDialogVisible),
    title: "维护映射",
    width: "92%",
    alignCenter: true,
    closeOnClickModal: (false),
    ...{ class: "mapping-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_430));
__VLS_432.slots.default;
if (__VLS_ctx.activePublicStepIndex !== null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-node-name" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    (__VLS_ctx.NODE_NAME_LABEL);
    const __VLS_433 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_434 = __VLS_asFunctionalComponent(__VLS_433, new __VLS_433({
        modelValue: (__VLS_ctx.activePublicStepName),
        maxlength: "64",
        showWordLimit: true,
        placeholder: (__VLS_ctx.NODE_NAME_PLACEHOLDER),
    }));
    const __VLS_435 = __VLS_434({
        modelValue: (__VLS_ctx.activePublicStepName),
        maxlength: "64",
        showWordLimit: true,
        placeholder: (__VLS_ctx.NODE_NAME_PLACEHOLDER),
    }, ...__VLS_functionalComponentArgsRest(__VLS_434));
}
/** @type {[typeof MappingWorkspace, ]} */ ;
// @ts-ignore
const __VLS_437 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
    ...{ 'onDirty': {} },
    ref: "mappingWorkspaceRef",
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.mappingOnlyPolicy),
    visibleRuleTypes: (__VLS_ctx.MAPPING_RULE_TYPES),
    sourceFields: (__VLS_ctx.mappingFields),
    targetFields: (__VLS_ctx.mappingTargetFields),
}));
const __VLS_438 = __VLS_437({
    ...{ 'onDirty': {} },
    ref: "mappingWorkspaceRef",
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.mappingOnlyPolicy),
    visibleRuleTypes: (__VLS_ctx.MAPPING_RULE_TYPES),
    sourceFields: (__VLS_ctx.mappingFields),
    targetFields: (__VLS_ctx.mappingTargetFields),
}, ...__VLS_functionalComponentArgsRest(__VLS_437));
let __VLS_440;
let __VLS_441;
let __VLS_442;
const __VLS_443 = {
    onDirty: (__VLS_ctx.onMappingDirty)
};
/** @type {typeof __VLS_ctx.mappingWorkspaceRef} */ ;
var __VLS_444 = {};
var __VLS_439;
var __VLS_432;
const __VLS_446 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_447 = __VLS_asFunctionalComponent(__VLS_446, new __VLS_446({
    modelValue: (__VLS_ctx.transformationDialogVisible),
    title: "维护转换规则",
    width: "92%",
    alignCenter: true,
    closeOnClickModal: (false),
    ...{ class: "mapping-dialog" },
}));
const __VLS_448 = __VLS_447({
    modelValue: (__VLS_ctx.transformationDialogVisible),
    title: "维护转换规则",
    width: "92%",
    alignCenter: true,
    closeOnClickModal: (false),
    ...{ class: "mapping-dialog" },
}, ...__VLS_functionalComponentArgsRest(__VLS_447));
__VLS_449.slots.default;
if (__VLS_ctx.activePublicStepIndex !== null) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "mapping-node-name" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    (__VLS_ctx.NODE_NAME_LABEL);
    const __VLS_450 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_451 = __VLS_asFunctionalComponent(__VLS_450, new __VLS_450({
        modelValue: (__VLS_ctx.activePublicStepName),
        maxlength: "64",
        showWordLimit: true,
        placeholder: (__VLS_ctx.NODE_NAME_PLACEHOLDER),
    }));
    const __VLS_452 = __VLS_451({
        modelValue: (__VLS_ctx.activePublicStepName),
        maxlength: "64",
        showWordLimit: true,
        placeholder: (__VLS_ctx.NODE_NAME_PLACEHOLDER),
    }, ...__VLS_functionalComponentArgsRest(__VLS_451));
}
/** @type {[typeof MappingWorkspace, ]} */ ;
// @ts-ignore
const __VLS_454 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
    ...{ 'onDirty': {} },
    ref: "transformationWorkspaceRef",
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.transformationPolicy),
    visibleRuleTypes: (__VLS_ctx.TRANSFORMATION_RULE_TYPES),
    sourceFields: (__VLS_ctx.mappingFields),
    targetFields: (__VLS_ctx.mappingTargetFields),
}));
const __VLS_455 = __VLS_454({
    ...{ 'onDirty': {} },
    ref: "transformationWorkspaceRef",
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.transformationPolicy),
    visibleRuleTypes: (__VLS_ctx.TRANSFORMATION_RULE_TYPES),
    sourceFields: (__VLS_ctx.mappingFields),
    targetFields: (__VLS_ctx.mappingTargetFields),
}, ...__VLS_functionalComponentArgsRest(__VLS_454));
let __VLS_457;
let __VLS_458;
let __VLS_459;
const __VLS_460 = {
    onDirty: (__VLS_ctx.onMappingDirty)
};
/** @type {typeof __VLS_ctx.transformationWorkspaceRef} */ ;
var __VLS_461 = {};
var __VLS_456;
var __VLS_449;
const __VLS_463 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_464 = __VLS_asFunctionalComponent(__VLS_463, new __VLS_463({
    modelValue: (__VLS_ctx.saveTplVisible),
    title: "保存为模板",
    width: "440px",
}));
const __VLS_465 = __VLS_464({
    modelValue: (__VLS_ctx.saveTplVisible),
    title: "保存为模板",
    width: "440px",
}, ...__VLS_functionalComponentArgsRest(__VLS_464));
__VLS_466.slots.default;
const __VLS_467 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_468 = __VLS_asFunctionalComponent(__VLS_467, new __VLS_467({
    labelWidth: "80px",
    size: "small",
}));
const __VLS_469 = __VLS_468({
    labelWidth: "80px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_468));
__VLS_470.slots.default;
const __VLS_471 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_472 = __VLS_asFunctionalComponent(__VLS_471, new __VLS_471({
    label: "模板名称",
    required: true,
}));
const __VLS_473 = __VLS_472({
    label: "模板名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_472));
__VLS_474.slots.default;
const __VLS_475 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_476 = __VLS_asFunctionalComponent(__VLS_475, new __VLS_475({
    modelValue: (__VLS_ctx.saveTplForm.name),
    placeholder: "如：员工月薪标准化模板",
    maxlength: "128",
}));
const __VLS_477 = __VLS_476({
    modelValue: (__VLS_ctx.saveTplForm.name),
    placeholder: "如：员工月薪标准化模板",
    maxlength: "128",
}, ...__VLS_functionalComponentArgsRest(__VLS_476));
var __VLS_474;
const __VLS_479 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_480 = __VLS_asFunctionalComponent(__VLS_479, new __VLS_479({
    label: "业务对象",
}));
const __VLS_481 = __VLS_480({
    label: "业务对象",
}, ...__VLS_functionalComponentArgsRest(__VLS_480));
__VLS_482.slots.default;
const __VLS_483 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_484 = __VLS_asFunctionalComponent(__VLS_483, new __VLS_483({
    modelValue: (__VLS_ctx.saveTplForm.business_object),
    placeholder: "如：员工表，留空则用来源表名",
    maxlength: "64",
}));
const __VLS_485 = __VLS_484({
    modelValue: (__VLS_ctx.saveTplForm.business_object),
    placeholder: "如：员工表，留空则用来源表名",
    maxlength: "64",
}, ...__VLS_functionalComponentArgsRest(__VLS_484));
var __VLS_482;
var __VLS_470;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
(__VLS_ctx.steps.length);
{
    const { footer: __VLS_thisSlot } = __VLS_466.slots;
    const __VLS_487 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_488 = __VLS_asFunctionalComponent(__VLS_487, new __VLS_487({
        ...{ 'onClick': {} },
    }));
    const __VLS_489 = __VLS_488({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_488));
    let __VLS_491;
    let __VLS_492;
    let __VLS_493;
    const __VLS_494 = {
        onClick: (...[$event]) => {
            __VLS_ctx.saveTplVisible = false;
        }
    };
    __VLS_490.slots.default;
    var __VLS_490;
    const __VLS_495 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_496 = __VLS_asFunctionalComponent(__VLS_495, new __VLS_495({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saveTplSaving),
    }));
    const __VLS_497 = __VLS_496({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saveTplSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_496));
    let __VLS_499;
    let __VLS_500;
    let __VLS_501;
    const __VLS_502 = {
        onClick: (__VLS_ctx.doSaveTemplate)
    };
    __VLS_498.slots.default;
    var __VLS_498;
}
var __VLS_466;
const __VLS_503 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_504 = __VLS_asFunctionalComponent(__VLS_503, new __VLS_503({
    modelValue: (__VLS_ctx.templateVisible),
    title: "选择模板",
    width: "500px",
}));
const __VLS_505 = __VLS_504({
    modelValue: (__VLS_ctx.templateVisible),
    title: "选择模板",
    width: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_504));
__VLS_506.slots.default;
const __VLS_507 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_508 = __VLS_asFunctionalComponent(__VLS_507, new __VLS_507({
    data: (__VLS_ctx.templates),
    size: "small",
    border: true,
    emptyText: "暂无模板",
}));
const __VLS_509 = __VLS_508({
    data: (__VLS_ctx.templates),
    size: "small",
    border: true,
    emptyText: "暂无模板",
}, ...__VLS_functionalComponentArgsRest(__VLS_508));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.templateLoading) }, null, null);
__VLS_510.slots.default;
const __VLS_511 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_512 = __VLS_asFunctionalComponent(__VLS_511, new __VLS_511({
    prop: "name",
    label: "模板名称",
    minWidth: "140",
}));
const __VLS_513 = __VLS_512({
    prop: "name",
    label: "模板名称",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_512));
const __VLS_515 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_516 = __VLS_asFunctionalComponent(__VLS_515, new __VLS_515({
    prop: "business_object",
    label: "业务对象",
    width: "100",
}));
const __VLS_517 = __VLS_516({
    prop: "business_object",
    label: "业务对象",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_516));
const __VLS_519 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_520 = __VLS_asFunctionalComponent(__VLS_519, new __VLS_519({
    label: "规则数",
    width: "70",
    align: "center",
}));
const __VLS_521 = __VLS_520({
    label: "规则数",
    width: "70",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_520));
__VLS_522.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_522.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.template_rules?.length || 0);
}
var __VLS_522;
const __VLS_523 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_524 = __VLS_asFunctionalComponent(__VLS_523, new __VLS_523({
    label: "版本",
    width: "60",
    align: "center",
    prop: "version",
}));
const __VLS_525 = __VLS_524({
    label: "版本",
    width: "60",
    align: "center",
    prop: "version",
}, ...__VLS_functionalComponentArgsRest(__VLS_524));
const __VLS_527 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_528 = __VLS_asFunctionalComponent(__VLS_527, new __VLS_527({
    label: "",
    width: "80",
}));
const __VLS_529 = __VLS_528({
    label: "",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_528));
__VLS_530.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_530.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_531 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_532 = __VLS_asFunctionalComponent(__VLS_531, new __VLS_531({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "primary",
    }));
    const __VLS_533 = __VLS_532({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_532));
    let __VLS_535;
    let __VLS_536;
    let __VLS_537;
    const __VLS_538 = {
        onClick: (...[$event]) => {
            __VLS_ctx.applyTemplate(row);
        }
    };
    __VLS_534.slots.default;
    var __VLS_534;
}
var __VLS_530;
var __VLS_510;
var __VLS_506;
/** @type {__VLS_StyleScopedClasses['recipe-page']} */ ;
/** @type {__VLS_StyleScopedClasses['recipe-header']} */ ;
/** @type {__VLS_StyleScopedClasses['header-top']} */ ;
/** @type {__VLS_StyleScopedClasses['header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['source-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['target-input']} */ ;
/** @type {__VLS_StyleScopedClasses['target-readonly']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-name']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-group-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-label']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-label']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-group']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['tool-btn-label']} */ ;
/** @type {__VLS_StyleScopedClasses['recipe-body']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['view-switch']} */ ;
/** @type {__VLS_StyleScopedClasses['refresh-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['data-table']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['preview-table-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['exec-result']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-zone']} */ ;
/** @type {__VLS_StyleScopedClasses['legacy-rule-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-title']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-source-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['source']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['source']} */ ;
/** @type {__VLS_StyleScopedClasses['node-label']} */ ;
/** @type {__VLS_StyleScopedClasses['node-name']} */ ;
/** @type {__VLS_StyleScopedClasses['node-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-step-group']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['connector-line']} */ ;
/** @type {__VLS_StyleScopedClasses['connector-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-node']} */ ;
/** @type {__VLS_StyleScopedClasses['node-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['node-header']} */ ;
/** @type {__VLS_StyleScopedClasses['node-type-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['node-type-label']} */ ;
/** @type {__VLS_StyleScopedClasses['node-disabled-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['node-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['danger']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['map-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['config-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['map-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-remove']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-section']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['config-field']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-add-area']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-connector']} */ ;
/** @type {__VLS_StyleScopedClasses['connector-line']} */ ;
/** @type {__VLS_StyleScopedClasses['dashed']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['add-step-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['recipe-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-illustration']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-node-name']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-dialog']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-node-name']} */ ;
// @ts-ignore
var __VLS_428 = __VLS_427, __VLS_445 = __VLS_444, __VLS_462 = __VLS_461;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            Top: Top,
            Bottom: Bottom,
            Refresh: Refresh,
            VideoPlay: VideoPlay,
            Upload: Upload,
            ArrowRight: ArrowRight,
            Lock: Lock,
            STANDARDIZATION_RULE_LABELS: STANDARDIZATION_RULE_LABELS,
            OdsDwdAutomationPanel: OdsDwdAutomationPanel,
            MappingWorkspace: MappingWorkspace,
            RULE_LABELS: RULE_LABELS,
            userStore: userStore,
            automationPanelRef: automationPanelRef,
            tables: tables,
            selectedTable: selectedTable,
            targetTableName: targetTableName,
            derivedTargetTable: derivedTargetTable,
            tableFields: tableFields,
            mappingWorkspaceRef: mappingWorkspaceRef,
            transformationWorkspaceRef: transformationWorkspaceRef,
            mappingDialogVisible: mappingDialogVisible,
            transformationDialogVisible: transformationDialogVisible,
            MAPPING_RULE_TYPES: MAPPING_RULE_TYPES,
            TRANSFORMATION_RULE_TYPES: TRANSFORMATION_RULE_TYPES,
            TOP_TRANSFORMATION_RULE_TYPES: TOP_TRANSFORMATION_RULE_TYPES,
            LEGACY_RULE_TYPES: LEGACY_RULE_TYPES,
            standardRuleTypeByMapping: standardRuleTypeByMapping,
            mappingDocument: mappingDocument,
            mappingTargetFields: mappingTargetFields,
            mappingOnlyPolicy: mappingOnlyPolicy,
            transformationPolicy: transformationPolicy,
            mappingFields: mappingFields,
            isLegacyRule: isLegacyRule,
            handleStepClick: handleStepClick,
            onMappingDirty: onMappingDirty,
            onTableChange: onTableChange,
            steps: steps,
            dirty: dirty,
            activePublicStepIndex: activePublicStepIndex,
            NODE_NAME_LABEL: NODE_NAME_LABEL,
            NODE_NAME_PLACEHOLDER: NODE_NAME_PLACEHOLDER,
            defaultStepName: defaultStepName,
            activePublicStepName: activePublicStepName,
            showAddMenu: showAddMenu,
            openMappingDialog: openMappingDialog,
            addStep: addStep,
            removeStep: removeStep,
            moveStep: moveStep,
            editingIndex: editingIndex,
            onStepFieldChange: onStepFieldChange,
            addMapRow: addMapRow,
            removeMapRow: removeMapRow,
            addSplitField: addSplitField,
            removeSplitField: removeSplitField,
            saving: saving,
            doSave: doSave,
            previewLoading: previewLoading,
            previewMode: previewMode,
            doPreview: doPreview,
            templateVisible: templateVisible,
            templates: templates,
            templateLoading: templateLoading,
            loadTemplates: loadTemplates,
            applyTemplate: applyTemplate,
            saveTplVisible: saveTplVisible,
            saveTplForm: saveTplForm,
            saveTplSaving: saveTplSaving,
            openSaveTemplate: openSaveTemplate,
            doSaveTemplate: doSaveTemplate,
            executing: executing,
            execResult: execResult,
            doExecute: doExecute,
            previewItems: previewItems,
            previewColumns: previewColumns,
            ruleTypeIcon: ruleTypeIcon,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
