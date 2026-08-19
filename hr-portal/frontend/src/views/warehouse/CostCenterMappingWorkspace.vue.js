/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import MappingWorkspace from '@/components/mapping/MappingWorkspace.vue';
import { costCenterMappingApi, createEmptyDocument, mappingApi, } from '@/api/mapping';
const now = new Date();
const period = ref(`${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`);
const periodState = ref(null);
const dwdGate = ref(null);
const mappingDocument = ref(createCostCenterDocument());
const mappingDirty = ref(false);
const loading = ref(false);
const saving = ref(false);
const publishing = ref(false);
const errorMessage = ref('');
const sourceFields = ref([
    { code: 'code', label: '成本中心编码', type: 'string' },
    { code: 'name', label: '成本中心名称', type: 'string' },
    { code: 'status', label: '启用状态', type: 'string' },
]);
const targetFields = ref([...sourceFields.value]);
const mappingPolicy = ref(createFallbackPolicy());
function createFallbackPolicy() {
    return {
        caller: 'warehouse',
        allowedRuleTypes: ['identity_with_overrides', 'reference_lookup', 'field', 'value_map', 'type_convert', 'format', 'split_merge'],
        source: { assetId: 'cost_center_monthly', schemaHash: '', allowedFieldIds: sourceFields.value.map((item) => item.code) },
        target: { assetId: 'dwd_cost_center_monthly', schemaHash: '', allowedFieldIds: targetFields.value.map((item) => item.code), readonlyFieldIds: [], protectedKeyFieldIds: ['code'] },
        referenceLookup: { allowedDatasetIds: [], allowedFieldIds: [], maxRules: 20 },
        effects: { allowPreview: false, allowSave: false, allowPublish: false, allowExecute: false, allowRebuild: false },
        legacy: { sourceFormat: 'standardization_rules', allowLegacyRead: true, allowLegacyWrite: false, allowMigration: false },
        metadata: { policyVersion: 1, permissionScope: 'warehouse.modeling', issuedAt: '' },
    };
}
const rebuildStatusLabel = computed(() => ({ not_started: '未开始', pending: '待执行', running: '执行中', success: '已完成', failed: '失败' }[periodState.value?.rebuildStatus || 'not_started']));
const notificationStatusLabel = computed(() => ({ not_started: '未开始', pending: '待投递', retrying: '重试中', sent: '已送达', exhausted: '重试耗尽' }[periodState.value?.notificationStatus || 'not_started']));
function createCostCenterDocument() {
    const document = createEmptyDocument('cost_center_monthly', '成本中心月度映射');
    document.ruleSet.sourceAsset = 'cost_center_monthly';
    document.ruleSet.targetAsset = 'dwd_cost_center_monthly';
    document.ruleSet.rules = [
        { id: 'cost-center-identity', type: 'identity_with_overrides', enabled: true, displayOrder: 0, sourceFields: ['code'], targetFields: ['code'], config: { defaultBehavior: 'keep_source', overrides: {}, unmatched: 'keep' } },
    ];
    return document;
}
async function loadTrustedPolicy() {
    const policy = await mappingApi.resolvePolicy('warehouse', 'cost_center_monthly', 'dwd_cost_center_monthly');
    mappingPolicy.value = {
        ...policy,
        legacy: {
            ...policy.legacy,
            sourceFormat: 'standardization_rules',
            allowLegacyWrite: false,
            allowMigration: false,
        },
    };
    sourceFields.value = policy.source.allowedFieldIds.map((code) => ({ code, label: code === 'code' ? '成本中心编码' : code === 'name' ? '成本中心名称' : code, type: 'string' }));
    targetFields.value = policy.target.allowedFieldIds.map((code) => ({ code, label: code === 'code' ? '成本中心编码' : code === 'name' ? '成本中心名称' : code, type: 'string' }));
    mappingDocument.value.ruleSet.sourceSchemaHash = policy.source.schemaHash;
    mappingDocument.value.ruleSet.targetSchemaHash = policy.target.schemaHash;
}
function normalizePeriod() {
    period.value = period.value.replace(/\D/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(period.value))
        throw new Error('期间必须为 YYYYMM');
}
async function loadPeriod() {
    errorMessage.value = '';
    try {
        normalizePeriod();
        loading.value = true;
        await loadTrustedPolicy();
        periodState.value = await costCenterMappingApi.getPeriod(period.value);
        dwdGate.value = await costCenterMappingApi.getDwdGate(period.value);
    }
    catch (error) {
        periodState.value = null;
        dwdGate.value = null;
        errorMessage.value = error?.response?.data?.detail || error?.message || '加载成本中心期间失败';
    }
    finally {
        loading.value = false;
    }
}
async function initializePeriod() {
    try {
        normalizePeriod();
        loading.value = true;
        periodState.value = await costCenterMappingApi.initialize(period.value, { source_snapshot: {} });
        dwdGate.value = await costCenterMappingApi.getDwdGate(period.value).catch(() => ({ status: 'review_required', reason: 'cost_center_mapping_not_published' }));
        ElMessage.success(`已初始化 ${period.value}`);
    }
    catch (error) {
        errorMessage.value = error?.response?.data?.detail || error?.message || '初始化失败';
    }
    finally {
        loading.value = false;
    }
}
async function saveException() {
    if (!periodState.value)
        return;
    try {
        saving.value = true;
        const rule = mappingDocument.value.ruleSet.rules.find((item) => item.type === 'identity_with_overrides');
        const overrides = rule && 'overrides' in rule.config ? rule.config.overrides : {};
        const first = Object.entries(overrides || {})[0];
        if (!first) {
            ElMessage.info('当前没有待保存的例外');
            return;
        }
        periodState.value = await costCenterMappingApi.updateException(period.value, { source_code: first[0], target_code: String(first[1]), expected_version: periodState.value.expectedVersion });
        mappingDirty.value = false;
        ElMessage.success('例外已保存');
    }
    catch (error) {
        errorMessage.value = error?.response?.data?.detail || error?.message || '保存例外失败';
    }
    finally {
        saving.value = false;
    }
}
async function confirmDiff(diffId) {
    if (!periodState.value)
        return;
    try {
        periodState.value = await costCenterMappingApi.confirmDiff(period.value, { diff_id: diffId, expected_version: periodState.value.expectedVersion, actor: 'current-user' });
        ElMessage.success('差异已确认');
    }
    catch (error) {
        errorMessage.value = error?.response?.data?.detail || error?.message || '确认差异失败';
    }
}
async function publishPeriod() {
    if (!periodState.value)
        return;
    try {
        publishing.value = true;
        const result = await costCenterMappingApi.publish(period.value, { expected_version: periodState.value.expectedVersion, actor: 'current-user' });
        periodState.value = await costCenterMappingApi.getPeriod(period.value);
        dwdGate.value = result.status === 'published' ? { status: 'allowed' } : { status: 'review_required', reason: result.reason };
        ElMessage[result.status === 'published' ? 'success' : 'warning'](result.status === 'published' ? '周期已发布，等待 DWD 重算' : '仍有差异待确认');
    }
    catch (error) {
        errorMessage.value = error?.response?.data?.detail || error?.message || '发布失败';
    }
    finally {
        publishing.value = false;
    }
}
async function retryNotification(notificationId) {
    try {
        await costCenterMappingApi.retryNotification(period.value, notificationId);
        periodState.value = await costCenterMappingApi.getPeriod(period.value);
        ElMessage.success('已创建人工重试任务');
    }
    catch (error) {
        errorMessage.value = error?.response?.data?.detail || error?.message || '通知重试失败';
    }
}
onMounted(loadPeriod);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['el-card']} */ ;
/** @type {__VLS_StyleScopedClasses['period-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['status-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['status-value']} */ ;
/** @type {__VLS_StyleScopedClasses['status-value']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['side-column']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-row']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-row']} */ ;
/** @type {__VLS_StyleScopedClasses['audit-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['status-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "cost-center-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "eyebrow" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "subtitle" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "header-actions" },
});
const __VLS_0 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: (__VLS_ctx.periodState?.status === 'published' ? 'success' : 'warning'),
    effect: "plain",
}));
const __VLS_2 = __VLS_1({
    type: (__VLS_ctx.periodState?.status === 'published' ? 'success' : 'warning'),
    effect: "plain",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
(__VLS_ctx.periodState ? (__VLS_ctx.periodState.status === 'published' ? '已发布' : '草稿') : '未初始化');
var __VLS_3;
const __VLS_4 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}));
const __VLS_6 = __VLS_5({
    ...{ 'onClick': {} },
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
let __VLS_8;
let __VLS_9;
let __VLS_10;
const __VLS_11 = {
    onClick: (__VLS_ctx.loadPeriod)
};
__VLS_7.slots.default;
var __VLS_7;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ class: "period-card" },
    shadow: "never",
}));
const __VLS_14 = __VLS_13({
    ...{ class: "period-card" },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "period-toolbar" },
});
const __VLS_16 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onSubmit': {} },
    inline: true,
}));
const __VLS_18 = __VLS_17({
    ...{ 'onSubmit': {} },
    inline: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onSubmit: () => { }
};
__VLS_19.slots.default;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "映射期间",
}));
const __VLS_26 = __VLS_25({
    label: "映射期间",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.period),
    maxlength: "6",
    placeholder: "YYYYMM",
    ...{ style: {} },
}));
const __VLS_30 = __VLS_29({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.period),
    maxlength: "6",
    placeholder: "YYYYMM",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onKeyup: (__VLS_ctx.loadPeriod)
};
var __VLS_31;
var __VLS_27;
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "period-actions" },
});
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.loading),
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.initializePeriod)
};
__VLS_39.slots.default;
var __VLS_39;
var __VLS_15;
if (__VLS_ctx.errorMessage) {
    const __VLS_44 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        ...{ class: "page-alert" },
        type: "error",
        title: (__VLS_ctx.errorMessage),
        closable: (false),
    }));
    const __VLS_46 = __VLS_45({
        ...{ class: "page-alert" },
        type: "error",
        title: (__VLS_ctx.errorMessage),
        closable: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
}
if (__VLS_ctx.periodState) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-grid" },
    });
    const __VLS_48 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        shadow: "never",
    }));
    const __VLS_50 = __VLS_49({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-value" },
        ...{ class: (__VLS_ctx.periodState.reviewRequired ? 'warning' : 'success') },
    });
    (__VLS_ctx.periodState.reviewRequired ? `${__VLS_ctx.periodState.pendingDiffCount} 项待确认` : '已确认');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-meta" },
    });
    (__VLS_ctx.periodState.version);
    (__VLS_ctx.periodState.sourceCount);
    var __VLS_51;
    const __VLS_52 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        shadow: "never",
    }));
    const __VLS_54 = __VLS_53({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-value" },
    });
    (__VLS_ctx.rebuildStatusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-meta" },
    });
    (__VLS_ctx.periodState.rebuildRunId ? `Run #${__VLS_ctx.periodState.rebuildRunId}` : '发布后生成重算记录');
    var __VLS_55;
    const __VLS_56 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        shadow: "never",
    }));
    const __VLS_58 = __VLS_57({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-value" },
    });
    (__VLS_ctx.notificationStatusLabel);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "status-meta" },
    });
    (__VLS_ctx.periodState.notifications.length);
    var __VLS_59;
}
if (__VLS_ctx.periodState) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "workspace-layout" },
    });
    const __VLS_60 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        shadow: "never",
        ...{ class: "mapping-card" },
    }));
    const __VLS_62 = __VLS_61({
        shadow: "never",
        ...{ class: "mapping-card" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    __VLS_63.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_63.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_64 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
            ...{ 'onClick': {} },
            type: "primary",
            disabled: (__VLS_ctx.periodState.status === 'published'),
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_66 = __VLS_65({
            ...{ 'onClick': {} },
            type: "primary",
            disabled: (__VLS_ctx.periodState.status === 'published'),
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_65));
        let __VLS_68;
        let __VLS_69;
        let __VLS_70;
        const __VLS_71 = {
            onClick: (__VLS_ctx.saveException)
        };
        __VLS_67.slots.default;
        var __VLS_67;
    }
    /** @type {[typeof MappingWorkspace, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(MappingWorkspace, new MappingWorkspace({
        ...{ 'onDirty': {} },
        ref: "mappingWorkspaceRef",
        modelValue: (__VLS_ctx.mappingDocument),
        policy: (__VLS_ctx.mappingPolicy),
        sourceFields: (__VLS_ctx.sourceFields),
        targetFields: (__VLS_ctx.targetFields),
        previewRows: ([]),
    }));
    const __VLS_73 = __VLS_72({
        ...{ 'onDirty': {} },
        ref: "mappingWorkspaceRef",
        modelValue: (__VLS_ctx.mappingDocument),
        policy: (__VLS_ctx.mappingPolicy),
        sourceFields: (__VLS_ctx.sourceFields),
        targetFields: (__VLS_ctx.targetFields),
        previewRows: ([]),
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    let __VLS_75;
    let __VLS_76;
    let __VLS_77;
    const __VLS_78 = {
        onDirty: (...[$event]) => {
            if (!(__VLS_ctx.periodState))
                return;
            __VLS_ctx.mappingDirty = $event;
        }
    };
    /** @type {typeof __VLS_ctx.mappingWorkspaceRef} */ ;
    var __VLS_79 = {};
    var __VLS_74;
    var __VLS_63;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.aside, __VLS_intrinsicElements.aside)({
        ...{ class: "side-column" },
    });
    const __VLS_81 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        shadow: "never",
    }));
    const __VLS_83 = __VLS_82({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_84.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    }
    if (!__VLS_ctx.periodState.diffs.length) {
        const __VLS_85 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
            description: "暂无周期差异",
            imageSize: (60),
        }));
        const __VLS_87 = __VLS_86({
            description: "暂无周期差异",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    }
    for (const [diff] of __VLS_getVForSourceType((__VLS_ctx.periodState.diffs))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (diff.id),
            ...{ class: "diff-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "diff-title" },
        });
        (diff.sourceCode);
        const __VLS_89 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
            size: "small",
            effect: "plain",
        }));
        const __VLS_91 = __VLS_90({
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_90));
        __VLS_92.slots.default;
        (diff.diffType);
        var __VLS_92;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "diff-meta" },
        });
        (diff.status === 'confirmed' ? '已确认' : '需要人工确认');
        if (diff.status === 'pending') {
            const __VLS_93 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                link: true,
            }));
            const __VLS_95 = __VLS_94({
                ...{ 'onClick': {} },
                size: "small",
                type: "primary",
                link: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_94));
            let __VLS_97;
            let __VLS_98;
            let __VLS_99;
            const __VLS_100 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.periodState))
                        return;
                    if (!(diff.status === 'pending'))
                        return;
                    __VLS_ctx.confirmDiff(diff.id);
                }
            };
            __VLS_96.slots.default;
            var __VLS_96;
        }
    }
    var __VLS_84;
    const __VLS_101 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        shadow: "never",
    }));
    const __VLS_103 = __VLS_102({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_104.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    }
    if (__VLS_ctx.dwdGate?.status === 'review_required') {
        const __VLS_105 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
            type: "warning",
            closable: (false),
            title: "当前期间尚未满足 DWD 执行门禁",
        }));
        const __VLS_107 = __VLS_106({
            type: "warning",
            closable: (false),
            title: "当前期间尚未满足 DWD 执行门禁",
        }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    }
    else if (__VLS_ctx.dwdGate?.status === 'allowed') {
        const __VLS_109 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
            type: "success",
            closable: (false),
            title: "已允许进入 DWD 执行",
        }));
        const __VLS_111 = __VLS_110({
            type: "success",
            closable: (false),
            title: "已允许进入 DWD 执行",
        }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    }
    const __VLS_113 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        ...{ 'onClick': {} },
        ...{ class: "publish-button" },
        type: "success",
        disabled: (__VLS_ctx.periodState.status === 'published' || __VLS_ctx.periodState.reviewRequired),
        loading: (__VLS_ctx.publishing),
    }));
    const __VLS_115 = __VLS_114({
        ...{ 'onClick': {} },
        ...{ class: "publish-button" },
        type: "success",
        disabled: (__VLS_ctx.periodState.status === 'published' || __VLS_ctx.periodState.reviewRequired),
        loading: (__VLS_ctx.publishing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    let __VLS_117;
    let __VLS_118;
    let __VLS_119;
    const __VLS_120 = {
        onClick: (__VLS_ctx.publishPeriod)
    };
    __VLS_116.slots.default;
    var __VLS_116;
    if (__VLS_ctx.periodState.publishAuditId) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "audit-meta" },
        });
        (__VLS_ctx.periodState.publishAuditId);
    }
    var __VLS_104;
    const __VLS_121 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
        shadow: "never",
    }));
    const __VLS_123 = __VLS_122({
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_122));
    __VLS_124.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_124.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    }
    if (!__VLS_ctx.periodState.notifications.length) {
        const __VLS_125 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
            description: "发布后创建通知",
            imageSize: (50),
        }));
        const __VLS_127 = __VLS_126({
            description: "发布后创建通知",
            imageSize: (50),
        }, ...__VLS_functionalComponentArgsRest(__VLS_126));
    }
    for (const [notification] of __VLS_getVForSourceType((__VLS_ctx.periodState.notifications))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (notification.id),
            ...{ class: "notification-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "notification-title" },
        });
        (notification.notificationKey);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "diff-meta" },
        });
        (notification.status);
        (notification.retryCount);
        if (notification.lastError) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "notification-error" },
            });
            (notification.lastError);
        }
        if (notification.status === 'retrying' || notification.status === 'exhausted') {
            const __VLS_129 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
                type: "warning",
            }));
            const __VLS_131 = __VLS_130({
                ...{ 'onClick': {} },
                size: "small",
                link: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_130));
            let __VLS_133;
            let __VLS_134;
            let __VLS_135;
            const __VLS_136 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.periodState))
                        return;
                    if (!(notification.status === 'retrying' || notification.status === 'exhausted'))
                        return;
                    __VLS_ctx.retryNotification(notification.id);
                }
            };
            __VLS_132.slots.default;
            var __VLS_132;
        }
    }
    var __VLS_124;
}
else if (!__VLS_ctx.loading) {
    const __VLS_137 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        description: "请选择期间并初始化，或加载已有周期",
    }));
    const __VLS_139 = __VLS_138({
        description: "请选择期间并初始化，或加载已有周期",
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
}
/** @type {__VLS_StyleScopedClasses['cost-center-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
/** @type {__VLS_StyleScopedClasses['subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['period-card']} */ ;
/** @type {__VLS_StyleScopedClasses['period-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['period-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['page-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['status-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-value']} */ ;
/** @type {__VLS_StyleScopedClasses['status-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-value']} */ ;
/** @type {__VLS_StyleScopedClasses['status-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['status-label']} */ ;
/** @type {__VLS_StyleScopedClasses['status-value']} */ ;
/** @type {__VLS_StyleScopedClasses['status-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['workspace-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['mapping-card']} */ ;
/** @type {__VLS_StyleScopedClasses['section-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['side-column']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-row']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-title']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['publish-button']} */ ;
/** @type {__VLS_StyleScopedClasses['audit-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-row']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-title']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['notification-error']} */ ;
// @ts-ignore
var __VLS_80 = __VLS_79;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            MappingWorkspace: MappingWorkspace,
            period: period,
            periodState: periodState,
            dwdGate: dwdGate,
            mappingDocument: mappingDocument,
            mappingDirty: mappingDirty,
            loading: loading,
            saving: saving,
            publishing: publishing,
            errorMessage: errorMessage,
            sourceFields: sourceFields,
            targetFields: targetFields,
            mappingPolicy: mappingPolicy,
            rebuildStatusLabel: rebuildStatusLabel,
            notificationStatusLabel: notificationStatusLabel,
            loadPeriod: loadPeriod,
            initializePeriod: initializePeriod,
            saveException: saveException,
            confirmDiff: confirmDiff,
            publishPeriod: publishPeriod,
            retryNotification: retryNotification,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
