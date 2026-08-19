/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { RULE_TYPES, } from '@/api/mapping';
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue';
import { getAsset, listAssets, listAssetColumns } from '@/api/warehouse';
import IngestionModeSelect from '@/components/warehouse/IngestionModeSelect.vue';
const props = defineProps();
const emit = defineEmits();
const assets = ref([]);
const columns = ref([]);
const assetIsPeriod = ref(false);
const periodLabel = ref(null);
const config = computed(() => props.modelValue);
const businessKeyLabels = computed(() => columns.value.filter(column => column.is_pk_part).map(column => column.column_label));
const modeByWriteMode = { upsert: 'incremental_upsert', append: 'append', period_full_snapshot: 'period_full_snapshot', replace: 'current_snapshot' };
const writeModeByMode = { current_snapshot: 'upsert', incremental_upsert: 'upsert', append: 'append', period_full_snapshot: 'period_full_snapshot' };
const ingestionMode = computed({
    get: () => modeByWriteMode[config.value.write_mode] || 'incremental_upsert',
    set: (mode) => {
        if (!mode)
            return;
        config.value.write_mode = writeModeByMode[mode];
        if (mode === 'period_full_snapshot') {
            config.value.period_field = periodLabel.value;
            const keys = columns.value.filter(column => column.is_pk_part).map(column => column.column_code);
            config.value.field_whitelist = [...new Set([...(config.value.field_whitelist || []), ...keys])];
            delete config.value.primary_key;
        }
    },
});
const issuedAt = new Date().toISOString();
const legacyMappingSnapshot = ref([]);
const adapterUnknownFields = ref({});
const adapterReadLossyFields = ref([]);
const mappingDocument = ref(emptyMappingDocument());
const compatibility = ref(emptyCompatibility());
const mappingSaveState = ref({ canSave: true, code: null, message: '', lossyFields: [] });
const lossyWriteBlocked = computed(() => !mappingSaveState.value.canSave);
const canSave = computed(() => mappingSaveState.value.canSave);
const fieldWhitelist = computed(() => Array.isArray(config.value.field_whitelist) ? config.value.field_whitelist : []);
const protectedKeyFields = computed(() => {
    const configuredKeys = Array.isArray(config.value.primary_key) ? config.value.primary_key : [];
    return [...new Set([...columns.value.filter(column => column.is_pk_part).map(column => column.column_code), ...configuredKeys])];
});
const readonlyFields = computed(() => columns.value.filter(column => column.is_computed || (!column.is_pk_part && !fieldWhitelist.value.includes(column.column_code))).map(column => column.column_code));
const sourceFields = computed(() => {
    const codes = new Set(Array.isArray(config.value.event_fields) ? config.value.event_fields : []);
    mappingDocument.value.ruleSet.rules.forEach(rule => rule.sourceFields.forEach(field => field && codes.add(field)));
    return Array.from(codes).map(code => ({ code, label: code }));
});
const targetFields = computed(() => columns.value
    .filter(column => fieldWhitelist.value.includes(column.column_code))
    .map(column => ({ code: column.column_code, label: column.column_label, type: column.data_type })));
const mappingPolicy = computed(() => ({
    caller: 'warehouse_sink',
    allowedRuleTypes: [...RULE_TYPES],
    source: {
        assetId: null,
        schemaHash: '',
        allowedFieldIds: sourceFields.value.map(field => field.code),
    },
    target: {
        assetId: config.value.target_asset || null,
        schemaHash: '',
        allowedFieldIds: [...fieldWhitelist.value],
        readonlyFieldIds: readonlyFields.value,
        protectedKeyFieldIds: protectedKeyFields.value,
    },
    referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
    effects: {
        allowPreview: true,
        allowSave: canSave.value,
        allowPublish: false,
        allowExecute: false,
        allowRebuild: false,
    },
    legacy: {
        sourceFormat: 'warehouse_asset_sink_legacy',
        allowLegacyRead: true,
        allowLegacyWrite: true,
        allowMigration: false,
    },
    metadata: { policyVersion: 1, permissionScope: 'ucp.pipelines', issuedAt },
}));
function clone(value) {
    if (value === undefined)
        return value;
    return JSON.parse(JSON.stringify(value));
}
function emptyMappingDocument() {
    return {
        mappingSchemaVersion: 1,
        ruleSet: {
            code: 'warehouse_asset_sink',
            name: 'Warehouse Asset Sink',
            sourceAsset: null,
            targetAsset: null,
            sourceSchemaHash: '',
            targetSchemaHash: '',
            rules: [],
        },
    };
}
function emptyCompatibility() {
    return {
        sourceFormat: 'warehouse_asset_sink_legacy',
        readable: true,
        writable: true,
        requiresMigration: false,
        lossyFields: [],
        unknownFields: {},
    };
}
function ensureConfig() {
    config.value.event_fields ||= [];
    config.value.mapping ||= [];
    config.value.validations ||= [];
    config.value.field_whitelist ||= [];
}
function legacyRuleToPublic(rawRule, index, lossyFields) {
    const path = `mapping[${index}]`;
    if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule)) {
        lossyFields.push(path);
        return null;
    }
    const legacy = rawRule;
    const source = legacy.source;
    const target = legacy.target;
    const transform = legacy.transform == null || legacy.transform === '' ? 'identity' : legacy.transform;
    if (typeof source !== 'string' || !source || typeof target !== 'string' || !target || typeof transform !== 'string') {
        lossyFields.push(path);
        return null;
    }
    const base = {
        id: String(index),
        enabled: true,
        displayOrder: index,
        sourceFields: [source],
        targetFields: [target],
    };
    if (transform === 'identity')
        return { ...base, type: 'field', config: { mode: 'rename' } };
    if (transform === 'string' || transform === 'decimal') {
        return { ...base, type: 'type_convert', config: { targetType: transform === 'string' ? 'string' : 'number', onError: 'reject' } };
    }
    if (transform === 'decimal_divide_100') {
        return { ...base, type: 'format', config: { formatType: 'unit_convert', options: { multiplier: 0.01 }, onError: 'reject' } };
    }
    if (transform === 'trim' || transform === 'yyyy_mm_to_yyyymm') {
        return { ...base, type: 'format', config: { formatType: transform, options: {}, onError: 'reject' } };
    }
    lossyFields.push(path);
    return null;
}
function collectUnknownFields(snapshot, rawMapping) {
    const unknown = {};
    const sinkContractKeys = ['target_asset', 'write_mode', 'primary_key', 'field_whitelist', 'batch_key', 'period_field'];
    sinkContractKeys.forEach((key) => {
        if (key in snapshot)
            unknown[key] = clone(snapshot[key]);
    });
    if ('validations' in snapshot)
        unknown.validations = clone(snapshot.validations);
    const knownTopLevel = new Set(['mapping', 'validations', ...sinkContractKeys]);
    Object.entries(snapshot).forEach(([key, value]) => {
        if (!knownTopLevel.has(key))
            unknown[key] = clone(value);
    });
    rawMapping.forEach((rawRule, index) => {
        if (!rawRule || typeof rawRule !== 'object' || Array.isArray(rawRule))
            return;
        Object.entries(rawRule).forEach(([key, value]) => {
            if (!['source', 'target', 'transform'].includes(key))
                unknown[`mapping[${index}].${key}`] = clone(value);
        });
    });
    unknown.__legacy_sink_snapshot__ = clone(snapshot);
    unknown.__legacy_mapping_snapshot__ = clone(snapshot);
    return unknown;
}
function initializeMappingAdapter() {
    ensureConfig();
    const rawMapping = clone(Array.isArray(config.value.mapping) ? config.value.mapping : []);
    const lossyFields = [];
    const rules = rawMapping.map((rule, index) => legacyRuleToPublic(rule, index, lossyFields)).filter((rule) => rule !== null);
    legacyMappingSnapshot.value = rawMapping;
    adapterReadLossyFields.value = lossyFields;
    adapterUnknownFields.value = collectUnknownFields(clone(config.value), rawMapping);
    mappingDocument.value = {
        mappingSchemaVersion: 1,
        ruleSet: {
            code: config.value.target_asset || 'warehouse_asset_sink',
            name: config.value.target_asset || 'Warehouse Asset Sink',
            sourceAsset: null,
            targetAsset: config.value.target_asset || null,
            sourceSchemaHash: '',
            targetSchemaHash: '',
            rules,
        },
    };
    compatibility.value = {
        sourceFormat: 'warehouse_asset_sink_legacy',
        readable: true,
        writable: lossyFields.length === 0,
        requiresMigration: lossyFields.length > 0,
        lossyFields: [...lossyFields],
        unknownFields: adapterUnknownFields.value,
    };
    syncDocumentToLegacy(false);
}
function normalizedLegacyTransform(rawRule) {
    return rawRule.transform == null || rawRule.transform === '' ? 'identity' : String(rawRule.transform);
}
function publicRuleToLegacy(rule, originalRule) {
    if (!rule.enabled)
        return `规则 ${rule.id} 已禁用，legacy Sink 无法表达 disabled rule`;
    if (rule.sourceFields.length !== 1 || rule.targetFields.length !== 1 || !rule.sourceFields[0] || !rule.targetFields[0]) {
        return `规则 ${rule.id} 只支持非空的单一 source/target`;
    }
    const source = rule.sourceFields[0];
    const target = rule.targetFields[0];
    let transform = null;
    if (rule.type === 'field' && rule.config.mode === 'rename')
        transform = 'identity';
    if (rule.type === 'type_convert' && rule.config.onError === 'reject') {
        if (rule.config.targetType === 'string')
            transform = 'string';
        if (rule.config.targetType === 'number')
            transform = 'decimal';
    }
    if (rule.type === 'format' && rule.config.onError === 'reject') {
        const formatType = rule.config.formatType;
        const options = rule.config.options || {};
        if (['trim', 'yyyy_mm_to_yyyymm'].includes(formatType) && Object.keys(options).length === 0)
            transform = formatType;
        if (formatType === 'unit_convert' && Object.keys(options).length === 1 && options.multiplier === 0.01)
            transform = 'decimal_divide_100';
    }
    if (!transform)
        return `公共规则 ${rule.id} 无法由 Warehouse Asset Sink legacy transform 表达`;
    if (!fieldWhitelist.value.includes(target))
        return `目标字段 ${target} 不在 Sink field_whitelist 中`;
    if (readonlyFields.value.includes(target))
        return `目标字段 ${target} 是 Sink 只读字段，Workspace 不得写入`;
    if (protectedKeyFields.value.includes(target)) {
        const unchanged = originalRule
            && originalRule.source === source
            && originalRule.target === target
            && normalizedLegacyTransform(originalRule) === transform;
        if (!unchanged)
            return `目标字段 ${target} 是 Sink 主键，Workspace 不得覆盖既有映射`;
    }
    return { source, target, transform };
}
function buildLegacyMapping(document) {
    const lossyFields = [...adapterReadLossyFields.value];
    if (document.mappingSchemaVersion !== 1)
        lossyFields.push('mappingSchemaVersion');
    if (document.ruleSet.targetAsset !== (config.value.target_asset || null))
        lossyFields.push('target_asset');
    if (lossyFields.length)
        return { lossyFields };
    const originalById = new Map();
    legacyMappingSnapshot.value.forEach((rawRule, index) => {
        if (rawRule && typeof rawRule === 'object' && !Array.isArray(rawRule))
            originalById.set(String(index), rawRule);
    });
    const retainedIds = new Set();
    const output = [];
    document.ruleSet.rules.forEach((rule) => {
        const original = originalById.get(rule.id);
        const converted = publicRuleToLegacy(rule, original);
        if (typeof converted === 'string') {
            lossyFields.push(converted);
            return;
        }
        const outputRule = original ? clone(original) : {};
        outputRule.source = converted.source;
        outputRule.target = converted.target;
        const originalTransform = original ? normalizedLegacyTransform(original) : null;
        if (!original || originalTransform !== converted.transform) {
            if (converted.transform !== 'identity' || 'transform' in outputRule)
                outputRule.transform = converted.transform;
        }
        output.push(outputRule);
        if (original)
            retainedIds.add(rule.id);
    });
    originalById.forEach((rawRule, id) => {
        if (retainedIds.has(id))
            return;
        const protectedFields = Object.keys(rawRule).filter(key => !['source', 'target', 'transform'].includes(key));
        if (protectedFields.length)
            lossyFields.push(`删除 mapping[${id}] 会丢失 ${protectedFields.join(', ')}`);
    });
    return lossyFields.length ? { lossyFields } : { mapping: output, lossyFields: [] };
}
function updateSaveState(lossyFields) {
    const next = lossyFields.length
        ? { canSave: false, code: 'lossy_write_blocked', message: lossyFields.join('；'), lossyFields: [...lossyFields] }
        : { canSave: true, code: null, message: '', lossyFields: [] };
    const changed = JSON.stringify(next) !== JSON.stringify(mappingSaveState.value);
    mappingSaveState.value = next;
    compatibility.value = {
        ...compatibility.value,
        writable: next.canSave,
        requiresMigration: !next.canSave,
        lossyFields: [...next.lossyFields],
        unknownFields: adapterUnknownFields.value,
    };
    if (!changed)
        return;
    emit('save-state', clone(next));
    if (!next.canSave)
        emit('lossy-write-blocked', clone(next));
}
function syncDocumentToLegacy(emitUpdate = true) {
    const result = buildLegacyMapping(mappingDocument.value);
    updateSaveState(result.lossyFields);
    if (!result.mapping)
        return;
    config.value.mapping.splice(0, config.value.mapping.length, ...clone(result.mapping));
    if (emitUpdate)
        emit('update:modelValue', config.value);
}
function handleMappingDocumentUpdate(document) {
    mappingDocument.value = document;
    syncDocumentToLegacy();
}
function handleMappingDirty(dirty) {
    if (dirty)
        syncDocumentToLegacy();
}
async function selectAsset(value) {
    columns.value = (await listAssetColumns(value)).columns;
    const asset = await getAsset(value);
    assetIsPeriod.value = asset.is_period;
    periodLabel.value = asset.period_col;
    config.value.target_asset = value;
    config.value.period_field = null;
    config.value.field_whitelist = [];
    config.value.mapping = [];
    config.value.validations = [];
    if (asset.is_period)
        ingestionMode.value = 'period_full_snapshot';
}
function syncRules() {
    config.value.validations.forEach((rule) => {
        rule.group_by = String(rule.group_by_text || '').split(',').map((item) => item.trim()).filter(Boolean);
    });
}
watch([() => props.modelValue.target_asset, () => props.modelValue.mapping], initializeMappingAdapter, { immediate: true });
watch([fieldWhitelist, readonlyFields, protectedKeyFields], () => syncDocumentToLegacy(false), { deep: true });
watch(() => props.modelValue.target_asset, async (value) => {
    ensureConfig();
    if (value) {
        columns.value = (await listAssetColumns(value)).columns;
        const asset = await getAsset(value);
        assetIsPeriod.value = asset.is_period;
        periodLabel.value = asset.period_col;
        if (asset.is_period)
            ingestionMode.value = 'period_full_snapshot';
    }
}, { immediate: true });
listAssets({ asset_status: 'published', page_size: 200 }).then((result) => { assets.value = result.items || result; }).catch(() => { assets.value = []; });
const __VLS_exposed = {
    canSave,
    lossyWriteBlocked,
    mappingSaveState,
    mappingDocument,
    mappingPolicy,
    compatibility,
    syncDocumentToLegacy,
};
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "warehouse-sink-config" },
});
if (__VLS_ctx.config.write_mode === 'replace') {
    const __VLS_0 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        title: "危险：每次运行会清空目标资产全部数据后重写。",
        type: "error",
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_2 = __VLS_1({
        title: "危险：每次运行会清空目标资产全部数据后重写。",
        type: "error",
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
if (__VLS_ctx.config.write_mode === 'period_full_snapshot') {
    const __VLS_4 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        title: "本批次会替换目标期间数据，并删除该期间未出现的业务键；历史期间保持不变。",
        type: "warning",
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_6 = __VLS_5({
        title: "本批次会替换目标期间数据，并删除该期间未出现的业务键；历史期间保持不变。",
        type: "warning",
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
const __VLS_8 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    label: "目标资产",
}));
const __VLS_10 = __VLS_9({
    label: "目标资产",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.modelValue.target_asset),
    filterable: true,
    placeholder: "选择已发布数据资产",
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.modelValue.target_asset),
    filterable: true,
    placeholder: "选择已发布数据资产",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (__VLS_ctx.selectAsset)
};
__VLS_15.slots.default;
for (const [asset] of __VLS_getVForSourceType((__VLS_ctx.assets))) {
    const __VLS_20 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        key: (asset.table_name),
        label: (asset.table_label),
        value: (asset.table_name),
    }));
    const __VLS_22 = __VLS_21({
        key: (asset.table_name),
        label: (asset.table_label),
        value: (asset.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
}
var __VLS_15;
var __VLS_11;
/** @type {[typeof IngestionModeSelect, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(IngestionModeSelect, new IngestionModeSelect({
    modelValue: (__VLS_ctx.ingestionMode),
    isPeriod: (__VLS_ctx.assetIsPeriod),
    periodLabel: (__VLS_ctx.periodLabel),
    keyLabels: (__VLS_ctx.businessKeyLabels),
}));
const __VLS_25 = __VLS_24({
    modelValue: (__VLS_ctx.ingestionMode),
    isPeriod: (__VLS_ctx.assetIsPeriod),
    periodLabel: (__VLS_ctx.periodLabel),
    keyLabels: (__VLS_ctx.businessKeyLabels),
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
if (__VLS_ctx.config.write_mode === 'period_full_snapshot') {
    const __VLS_27 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
        label: "期间字段",
    }));
    const __VLS_29 = __VLS_28({
        label: "期间字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    __VLS_30.slots.default;
    const __VLS_31 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        modelValue: (__VLS_ctx.config.period_field),
        disabled: true,
    }));
    const __VLS_33 = __VLS_32({
        modelValue: (__VLS_ctx.config.period_field),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    var __VLS_30;
}
const __VLS_35 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    label: "业务主键",
}));
const __VLS_37 = __VLS_36({
    label: "业务主键",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.columns.filter(item => item.is_pk_part)))) {
    const __VLS_39 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        key: (column.column_code),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_41 = __VLS_40({
        key: (column.column_code),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    (column.column_label);
    var __VLS_42;
}
var __VLS_38;
const __VLS_43 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    label: "允许写入字段",
}));
const __VLS_45 = __VLS_44({
    label: "允许写入字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
const __VLS_47 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    modelValue: (__VLS_ctx.config.field_whitelist),
    multiple: true,
    filterable: true,
    ...{ style: {} },
}));
const __VLS_49 = __VLS_48({
    modelValue: (__VLS_ctx.config.field_whitelist),
    multiple: true,
    filterable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
for (const [column] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
    const __VLS_51 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        key: (column.column_code),
        label: (column.column_label),
        value: (column.column_code),
    }));
    const __VLS_53 = __VLS_52({
        key: (column.column_code),
        label: (column.column_label),
        value: (column.column_code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
}
var __VLS_50;
var __VLS_46;
const __VLS_55 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    label: "事件补充字段",
}));
const __VLS_57 = __VLS_56({
    label: "事件补充字段",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
const __VLS_59 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    modelValue: (__VLS_ctx.config.event_fields),
    multiple: true,
    allowCreate: true,
    filterable: true,
    defaultFirstOption: true,
    placeholder: "例如 period",
    ...{ style: {} },
}));
const __VLS_61 = __VLS_60({
    modelValue: (__VLS_ctx.config.event_fields),
    multiple: true,
    allowCreate: true,
    filterable: true,
    defaultFirstOption: true,
    placeholder: "例如 period",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
var __VLS_58;
const __VLS_63 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    contentPosition: "left",
}));
const __VLS_65 = __VLS_64({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_66.slots.default;
var __VLS_66;
if (__VLS_ctx.lossyWriteBlocked) {
    const __VLS_67 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
        ...{ class: "lossy-write-blocked" },
        type: "error",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_69 = __VLS_68({
        ...{ class: "lossy-write-blocked" },
        type: "error",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_68));
    __VLS_70.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_70.slots;
        (__VLS_ctx.mappingSaveState.message);
    }
    var __VLS_70;
}
/** @type {[typeof MappingWorkspace, ]} */ ;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
    ...{ 'onUpdate:modelValue': {} },
    ...{ 'onDirty': {} },
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.mappingPolicy),
    compatibility: (__VLS_ctx.compatibility),
    sourceFields: (__VLS_ctx.sourceFields),
    targetFields: (__VLS_ctx.targetFields),
}));
const __VLS_72 = __VLS_71({
    ...{ 'onUpdate:modelValue': {} },
    ...{ 'onDirty': {} },
    modelValue: (__VLS_ctx.mappingDocument),
    policy: (__VLS_ctx.mappingPolicy),
    compatibility: (__VLS_ctx.compatibility),
    sourceFields: (__VLS_ctx.sourceFields),
    targetFields: (__VLS_ctx.targetFields),
}, ...__VLS_functionalComponentArgsRest(__VLS_71));
let __VLS_74;
let __VLS_75;
let __VLS_76;
const __VLS_77 = {
    'onUpdate:modelValue': (__VLS_ctx.handleMappingDocumentUpdate)
};
const __VLS_78 = {
    onDirty: (__VLS_ctx.handleMappingDirty)
};
var __VLS_73;
const __VLS_79 = {}.ElDivider;
/** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    contentPosition: "left",
}));
const __VLS_81 = __VLS_80({
    contentPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
var __VLS_82;
for (const [rule, index] of __VLS_getVForSourceType((__VLS_ctx.config.validations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (index),
        ...{ class: "mapping-row" },
    });
    const __VLS_83 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
        ...{ 'onChange': {} },
        modelValue: (rule.group_by_text),
        placeholder: "分组字段，逗号分隔",
    }));
    const __VLS_85 = __VLS_84({
        ...{ 'onChange': {} },
        modelValue: (rule.group_by_text),
        placeholder: "分组字段，逗号分隔",
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    let __VLS_87;
    let __VLS_88;
    let __VLS_89;
    const __VLS_90 = {
        onChange: (__VLS_ctx.syncRules)
    };
    var __VLS_86;
    const __VLS_91 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
        modelValue: (rule.sum_field),
        placeholder: "汇总字段",
    }));
    const __VLS_93 = __VLS_92({
        modelValue: (rule.sum_field),
        placeholder: "汇总字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_92));
    __VLS_94.slots.default;
    for (const [column] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
        const __VLS_95 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
            key: (column.column_code),
            label: (column.column_label),
            value: (column.column_code),
        }));
        const __VLS_97 = __VLS_96({
            key: (column.column_code),
            label: (column.column_label),
            value: (column.column_code),
        }, ...__VLS_functionalComponentArgsRest(__VLS_96));
    }
    var __VLS_94;
    const __VLS_99 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
        modelValue: (rule.expected),
        precision: (4),
    }));
    const __VLS_101 = __VLS_100({
        modelValue: (rule.expected),
        precision: (4),
    }, ...__VLS_functionalComponentArgsRest(__VLS_100));
    const __VLS_103 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        modelValue: (rule.tolerance),
        precision: (4),
        step: (0.0001),
    }));
    const __VLS_105 = __VLS_104({
        modelValue: (rule.tolerance),
        precision: (4),
        step: (0.0001),
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    const __VLS_107 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_108 = __VLS_asFunctionalComponent(__VLS_107, new __VLS_107({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_109 = __VLS_108({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_108));
    let __VLS_111;
    let __VLS_112;
    let __VLS_113;
    const __VLS_114 = {
        onClick: (...[$event]) => {
            __VLS_ctx.config.validations.splice(index, 1);
        }
    };
    __VLS_110.slots.default;
    var __VLS_110;
}
const __VLS_115 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_117 = __VLS_116({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_116));
let __VLS_119;
let __VLS_120;
let __VLS_121;
const __VLS_122 = {
    onClick: (...[$event]) => {
        __VLS_ctx.config.validations.push({ type: 'group_sum_equals', group_by_text: '', sum_field: '', expected: 1, tolerance: 0.0001 });
    }
};
__VLS_118.slots.default;
var __VLS_118;
/** @type {__VLS_StyleScopedClasses['warehouse-sink-config']} */ ;
/** @type {__VLS_StyleScopedClasses['lossy-write-blocked']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MappingWorkspace: MappingWorkspace,
            IngestionModeSelect: IngestionModeSelect,
            assets: assets,
            columns: columns,
            assetIsPeriod: assetIsPeriod,
            periodLabel: periodLabel,
            config: config,
            businessKeyLabels: businessKeyLabels,
            ingestionMode: ingestionMode,
            mappingDocument: mappingDocument,
            compatibility: compatibility,
            mappingSaveState: mappingSaveState,
            lossyWriteBlocked: lossyWriteBlocked,
            sourceFields: sourceFields,
            targetFields: targetFields,
            mappingPolicy: mappingPolicy,
            handleMappingDocumentUpdate: handleMappingDocumentUpdate,
            handleMappingDirty: handleMappingDirty,
            selectAsset: selectAsset,
            syncRules: syncRules,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
