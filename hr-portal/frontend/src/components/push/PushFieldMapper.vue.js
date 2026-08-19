/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { createEmptyDocument, } from '@/api/mapping';
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue';
const props = withDefaults(defineProps(), {
    targetFields: () => [],
    sourceAsset: '',
});
const emit = defineEmits();
const document = ref(props.mappingComponent ? clone(props.mappingComponent) : createDocument());
let syncingFromParent = false;
watch(() => [props.mappings, props.mappingComponent], () => {
    if (!syncingFromParent)
        document.value = props.mappingComponent ? clone(props.mappingComponent) : createDocument();
    syncingFromParent = false;
}, { deep: true });
function clone(value) {
    return JSON.parse(JSON.stringify(value));
}
function createDocument() {
    const doc = createEmptyDocument('push_target', 'PushTarget');
    doc.ruleSet.sourceAsset = props.sourceAsset || null;
    doc.ruleSet.targetAsset = null;
    doc.ruleSet.rules = props.mappings.map((mapping, index) => ({
        id: String(index),
        type: 'field',
        enabled: true,
        displayOrder: index,
        sourceFields: [mapping.source],
        targetFields: [mapping.target],
        config: { mode: 'rename' },
    }));
    return doc;
}
const sourceFields = computed(() => props.sourceColumns.map((column) => ({
    code: column.code,
    label: column.label,
    type: column.data_type,
})));
const targetFields = computed(() => {
    const fields = new Map();
    props.targetFields.forEach((field) => fields.set(field.code, field));
    props.mappings.forEach((mapping) => {
        if (mapping.target && !fields.has(mapping.target)) {
            fields.set(mapping.target, { code: mapping.target, label: mapping.target });
        }
    });
    document.value.ruleSet.rules.forEach((rule) => rule.targetFields.forEach((code) => {
        if (code && !fields.has(code))
            fields.set(code, { code, label: code });
    }));
    return Array.from(fields.values());
});
const policy = computed(() => ({
    caller: 'push_target',
    allowedRuleTypes: [
        'field', 'value_map', 'reference_lookup', 'identity_with_overrides',
        'type_convert', 'format', 'split_merge',
    ],
    source: {
        assetId: props.sourceAsset || null,
        schemaHash: '',
        allowedFieldIds: sourceFields.value.map((field) => field.code),
    },
    target: {
        assetId: null,
        schemaHash: '',
        allowedFieldIds: targetFields.value.map((field) => field.code),
        readonlyFieldIds: [],
        protectedKeyFieldIds: [],
    },
    referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
    effects: {
        allowPreview: true,
        allowSave: true,
        allowPublish: false,
        allowExecute: false,
        allowRebuild: false,
    },
    legacy: {
        sourceFormat: 'push_target_field_mappings',
        allowLegacyRead: true,
        allowLegacyWrite: true,
        allowMigration: false,
    },
    metadata: { policyVersion: 1, permissionScope: 'warehouse.service', issuedAt: '' },
}));
const compatibility = computed(() => {
    const lossyFields = props.mappings.flatMap((mapping, index) => {
        if (!mapping || typeof mapping !== 'object' || !mapping.source || !mapping.target) {
            return [`field_mappings[${index}]`];
        }
        if (!sourceFields.value.some((field) => field.code === mapping.source)) {
            return [`field_mappings[${index}].source`];
        }
        return [];
    });
    return {
        sourceFormat: 'push_target_field_mappings',
        readable: true,
        writable: lossyFields.length === 0,
        requiresMigration: false,
        lossyFields,
        unknownFields: {},
    };
});
function onDocumentUpdate(next) {
    document.value = next;
    syncingFromParent = true;
    const originalById = new Map(props.mappings.map((mapping, index) => [String(index), mapping]));
    emit('update:mappings', next.ruleSet.rules
        .filter((rule) => rule.type === 'field')
        .map((rule) => ({
        ...(originalById.get(rule.id) || {}),
        source: rule.sourceFields[0] || '',
        target: rule.targetFields[0] || '',
    })));
    emit('document', next);
}
function serialize() {
    const rules = [...document.value.ruleSet.rules].sort((a, b) => a.displayOrder - b.displayOrder);
    const originalById = new Map(props.mappings.map((mapping, index) => [String(index), mapping]));
    const lossyFields = [...compatibility.value.lossyFields];
    if (rules.some((rule) => rule.type !== 'field')) {
        return { ok: true, storageMode: 'component_v1', document: clone(document.value) };
    }
    const output = [];
    const retainedIds = new Set();
    for (const rule of rules) {
        const fieldConfig = rule.config;
        if (!rule.enabled || fieldConfig.mode !== 'rename' || rule.sourceFields.length !== 1 || rule.targetFields.length !== 1) {
            return {
                ok: false,
                reason: `公共规则 ${rule.id} 无法无损表达为旧 field_mappings，已阻断保存。`,
            };
        }
        const source = rule.sourceFields[0];
        const target = rule.targetFields[0];
        if (!source || !target || !sourceFields.value.some((field) => field.code === source)) {
            return { ok: false, reason: `规则 ${rule.id} 的字段不在允许白名单内，已阻断保存。` };
        }
        const original = originalById.get(rule.id);
        output.push({ ...(original || {}), source, target });
        if (original)
            retainedIds.add(rule.id);
    }
    for (const [id, original] of originalById) {
        if (retainedIds.has(id))
            continue;
        const unknownKeys = Object.keys(original).filter((key) => key !== 'source' && key !== 'target');
        if (unknownKeys.length)
            lossyFields.push(`field_mappings[${id}]`);
    }
    if (lossyFields.length) {
        return { ok: false, reason: '旧 field_mappings 含无法无损回写的字段，已阻断保存。' };
    }
    return { ok: true, storageMode: 'legacy_v1', mappings: output };
}
const __VLS_exposed = { serialize, getDocument: () => clone(document.value) };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    targetFields: () => [],
    sourceAsset: '',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {[typeof MappingWorkspace, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.document),
    policy: (__VLS_ctx.policy),
    compatibility: (__VLS_ctx.compatibility),
    sourceFields: (__VLS_ctx.sourceFields),
    targetFields: (__VLS_ctx.targetFields),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.document),
    policy: (__VLS_ctx.policy),
    compatibility: (__VLS_ctx.compatibility),
    sourceFields: (__VLS_ctx.sourceFields),
    targetFields: (__VLS_ctx.targetFields),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    'onUpdate:modelValue': (__VLS_ctx.onDocumentUpdate)
};
var __VLS_7 = {};
var __VLS_2;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MappingWorkspace: MappingWorkspace,
            document: document,
            sourceFields: sourceFields,
            targetFields: targetFields,
            policy: policy,
            compatibility: compatibility,
            onDocumentUpdate: onDocumentUpdate,
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
