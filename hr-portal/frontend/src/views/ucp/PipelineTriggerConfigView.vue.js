/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ucpApi } from '@/api/ucp';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
const route = useRoute();
const items = ref([]);
const systems = ref([]);
const resources = ref([]);
const objects = ref([]);
const loading = ref(false);
const sourceLoading = ref(false);
const saving = ref(false);
const testing = ref(false);
const loadError = ref(false);
const forbidden = ref(false);
const visible = ref(false);
const testVisible = ref(false);
const editing = ref(null);
const testTarget = ref(null);
const migrationStatus = ref(null);
const systemId = ref();
const resourceId = ref();
const samplePayloadText = ref('{}');
const platformEventCatalog = ref([]);
const platformEventCategory = ref('');
const platformEventFilterField = ref('');
const platformEventFilterValue = ref('');
const fresh = () => ({ trigger_code: '', trigger_name: '', pipeline_template_code: '', trigger_type: 'WEBHOOK', platform_event_type: '', source_resource_object_id: undefined, schedule_config: { cron: '', timezone: 'Asia/Shanghai' }, filter_rule: {}, input_schema: {}, failure_policy: 'RETRY', run_as_type: 'SERVICE_ACCOUNT', is_active: false });
const form = ref(fresh());
const platformEventCategories = computed(() => Array.from(new Map(platformEventCatalog.value.filter((item) => item.enabled).map((item) => [item.category, item])).values()));
const platformEventOptions = computed(() => platformEventCatalog.value.filter((item) => item.enabled && item.category === platformEventCategory.value));
const selectedPlatformEvent = computed(() => platformEventCatalog.value.find((item) => item.event_type === form.value.platform_event_type));
const platformEventFilterFields = computed(() => selectedPlatformEvent.value?.filter_fields || []);
const canSave = computed(() => Boolean(form.value.trigger_code && form.value.trigger_name && form.value.pipeline_template_code && (form.value.trigger_type !== 'WEBHOOK' || form.value.source_resource_object_id) && (form.value.trigger_type !== 'SCHEDULE' || form.value.schedule_config.cron && form.value.schedule_config.timezone) && (form.value.trigger_type !== 'PLATFORM_EVENT' || form.value.platform_event_type)));
function apiMessage(error, fallback) { return error?.response?.data?.detail || fallback; }
function sourceLabel(row) { return row.trigger_type === 'WEBHOOK' ? `事件对象 #${row.source_resource_object_id || '-'}` : row.trigger_type === 'SCHEDULE' ? `${row.schedule_config?.cron || '-'}（北京时间）` : row.trigger_type === 'PLATFORM_EVENT' ? '平台事件' : '人工启动'; }
function resetSource() { systemId.value = undefined; resourceId.value = undefined; resources.value = []; objects.value = []; form.value.source_resource_object_id = undefined; platformEventCategory.value = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.platform_event_type = ''; }
function changePlatformEventCategory() { form.value.platform_event_type = ''; platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.filter_rule = {}; }
function changePlatformEventType() { platformEventFilterField.value = ''; platformEventFilterValue.value = ''; form.value.filter_rule = {}; }
function syncPlatformEventFilter() { form.value.filter_rule = platformEventFilterField.value ? { path: `$.${platformEventFilterField.value}`, op: 'eq', value: platformEventFilterValue.value } : {}; }
function closeEditor() { editing.value = null; form.value = fresh(); resetSource(); }
async function load() {
    loading.value = true;
    loadError.value = false;
    forbidden.value = false;
    try {
        const [triggers, availableSystems, migration, catalog] = await Promise.all([ucpApi.pipelineTriggers(), ucpApi.systems(), ucpApi.triggerMigrationStatus(), ucpApi.platformEventCatalog()]);
        items.value = triggers.items || [];
        systems.value = availableSystems.items || [];
        migrationStatus.value = migration;
        platformEventCatalog.value = catalog.items || [];
    }
    catch (error) {
        forbidden.value = error?.response?.status === 403;
        loadError.value = !forbidden.value;
        ElMessage.error(apiMessage(error, 'Load failed'));
    }
    finally {
        loading.value = false;
    }
}
function showLegacy() { const codes = migrationStatus.value?.legacy_triggers?.map((item) => item.trigger_code).join(', ') || 'None'; ElMessage.warning(`Legacy trigger review: ${codes}`); }
async function loadResources() {
    resourceId.value = undefined;
    objects.value = [];
    form.value.source_resource_object_id = undefined;
    if (!systemId.value) {
        resources.value = [];
        return;
    }
    sourceLoading.value = true;
    try {
        resources.value = (await ucpApi.resources({ system_id: systemId.value })).items || [];
    }
    catch (error) {
        ElMessage.error(apiMessage(error, 'Unable to load resources'));
    }
    finally {
        sourceLoading.value = false;
    }
}
async function loadObjects() {
    objects.value = [];
    form.value.source_resource_object_id = undefined;
    if (!resourceId.value)
        return;
    sourceLoading.value = true;
    try {
        const result = await ucpApi.resourceObjects(resourceId.value, { object_type: 'EVENT_TYPE', is_active: true });
        objects.value = (result.items || []).filter((item) => item.verification_status === 'VERIFIED' && item.event_definition?.status === 'PUBLISHED');
    }
    catch (error) {
        ElMessage.error(apiMessage(error, 'Unable to load event objects'));
    }
    finally {
        sourceLoading.value = false;
    }
}
function openCreate() { form.value = fresh(); resetSource(); const templateCode = String(route.query.template_code || ''); const triggerType = String(route.query.trigger_type || 'WEBHOOK'); if (templateCode)
    form.value.pipeline_template_code = templateCode; if (['WEBHOOK', 'SCHEDULE', 'MANUAL', 'PLATFORM_EVENT'].includes(triggerType))
    form.value.trigger_type = triggerType; visible.value = true; }
async function openEdit(row) {
    editing.value = row;
    form.value = { ...fresh(), ...row, schedule_config: { ...fresh().schedule_config, ...(row.schedule_config || {}) } };
    resetSource();
    if (row.trigger_type === 'PLATFORM_EVENT') {
        form.value.platform_event_type = row.platform_event_type || '';
        const definition = platformEventCatalog.value.find((item) => item.event_type === form.value.platform_event_type);
        platformEventCategory.value = definition?.category || '';
        const rule = row.filter_rule || {};
        platformEventFilterField.value = String(rule.path || '').replace(/^\$\./, '');
        platformEventFilterValue.value = rule.value == null ? '' : String(rule.value);
    }
    if (row.trigger_type === 'WEBHOOK' && row.source_resource_id) {
        const resource = (await ucpApi.resources()).items?.find((item) => item.id === row.source_resource_id);
        if (resource) {
            systemId.value = resource.system_id;
            await loadResources();
            resourceId.value = resource.id;
            await loadObjects();
            form.value.source_resource_object_id = row.source_resource_object_id;
        }
    }
    visible.value = true;
}
async function save() {
    saving.value = true;
    try {
        if (editing.value?.migration_status === 'PENDING_MIGRATION')
            await ucpApi.migrateLegacyPipelineTrigger(editing.value.trigger_code, form.value.source_resource_object_id);
        if (editing.value)
            await ucpApi.updatePipelineTrigger(editing.value.trigger_code, form.value);
        else
            await ucpApi.createPipelineTrigger(form.value);
        visible.value = false;
        await load();
        ElMessage.success('Trigger saved');
    }
    catch (error) {
        ElMessage.error(apiMessage(error, 'Save failed'));
    }
    finally {
        saving.value = false;
    }
}
async function rollbackMigration(row) {
    try {
        await ElMessageBox.confirm('Restore the legacy callback path and remove this trigger from the resource ingress route?', 'Rollback trigger migration');
        await ucpApi.rollbackLegacyPipelineTrigger(row.trigger_code);
        await load();
        ElMessage.success('Trigger migration rolled back');
    }
    catch (error) {
        if (error !== 'cancel')
            ElMessage.error(apiMessage(error, 'Rollback failed'));
    }
}
async function toggle(row) { try {
    await ucpApi.enablePipelineTrigger(row.trigger_code, !row.is_active);
    await load();
    ElMessage.success(row.is_active ? 'Trigger disabled' : 'Trigger enabled');
}
catch (error) {
    ElMessage.error(apiMessage(error, 'Operation failed'));
} }
function sampleFor(row, object) {
    const required = object?.event_definition?.payload_schema?.required || [];
    return Object.fromEntries((object?.event_definition?.payload_schema?.required || []).map((key) => [key, `<${key}>`]));
}
async function openTest(row) {
    testTarget.value = row;
    try {
        const source = row.source_resource_id ? (await ucpApi.resourceObjects(row.source_resource_id, { object_type: 'EVENT_TYPE', is_active: true })).items?.find((item) => item.id === row.source_resource_object_id) : undefined;
        samplePayloadText.value = JSON.stringify(sampleFor(row, source), null, 2);
        testVisible.value = true;
    }
    catch (error) {
        ElMessage.error(apiMessage(error, 'Unable to prepare dry-run input'));
    }
}
async function runTest() { try {
    const sample_payload = JSON.parse(samplePayloadText.value);
    testing.value = true;
    await ucpApi.testPipelineTrigger(testTarget.value.trigger_code, { dry_run: true, sample_payload });
    testVisible.value = false;
    ElMessage.success('Dry run completed');
}
catch (error) {
    ElMessage.error(error instanceof SyntaxError ? 'Input must be valid JSON' : apiMessage(error, 'Dry run failed'));
}
finally {
    testing.value = false;
} }
async function remove(row) { try {
    await ElMessageBox.confirm('Disable the trigger before deleting it.', 'Delete trigger');
    await ucpApi.deletePipelineTrigger(row.trigger_code);
    await load();
    ElMessage.success('Trigger deleted');
}
catch (error) {
    if (error !== 'cancel')
        ElMessage.error(apiMessage(error, 'Delete failed'));
} }
onMounted(async () => { await load(); if (route.query.template_code)
    openCreate(); });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "trigger-config" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "page-header" },
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
    disabled: (__VLS_ctx.forbidden),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    type: "primary",
    disabled: (__VLS_ctx.forbidden),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.openCreate)
};
__VLS_3.slots.default;
var __VLS_3;
if (__VLS_ctx.forbidden) {
    const __VLS_8 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        type: "warning",
        closable: (false),
        title: "You do not have permission to manage pipeline triggers.",
    }));
    const __VLS_10 = __VLS_9({
        type: "warning",
        closable: (false),
        title: "You do not have permission to manage pipeline triggers.",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
}
else if (__VLS_ctx.loadError) {
    const __VLS_12 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        type: "error",
        closable: (false),
        showIcon: true,
    }));
    const __VLS_14 = __VLS_13({
        type: "error",
        closable: (false),
        showIcon: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_15.slots;
    }
    const __VLS_16 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_19.slots.default;
    var __VLS_19;
    var __VLS_15;
}
if (!__VLS_ctx.forbidden && !__VLS_ctx.loadError && __VLS_ctx.migrationStatus?.legacy_trigger_count) {
    const __VLS_24 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ class: "migration-alert" },
    }));
    const __VLS_26 = __VLS_25({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ class: "migration-alert" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    __VLS_27.slots.default;
    {
        const { title: __VLS_thisSlot } = __VLS_27.slots;
        (__VLS_ctx.migrationStatus.legacy_trigger_count);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_28 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (__VLS_ctx.showLegacy)
    };
    __VLS_31.slots.default;
    var __VLS_31;
    var __VLS_27;
}
if (!__VLS_ctx.forbidden && !__VLS_ctx.loadError) {
    const __VLS_36 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        data: (__VLS_ctx.items),
        emptyText: "No pipeline triggers configured yet.",
    }));
    const __VLS_38 = __VLS_37({
        data: (__VLS_ctx.items),
        emptyText: "No pipeline triggers configured yet.",
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_39.slots.default;
    const __VLS_40 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        prop: "trigger_name",
        label: "Trigger",
        minWidth: "180",
    }));
    const __VLS_42 = __VLS_41({
        prop: "trigger_name",
        label: "Trigger",
        minWidth: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    const __VLS_44 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        prop: "pipeline_template_code",
        label: "Pipeline",
        minWidth: "160",
    }));
    const __VLS_46 = __VLS_45({
        prop: "pipeline_template_code",
        label: "Pipeline",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    const __VLS_48 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        prop: "trigger_type",
        label: "Type",
        width: "120",
    }));
    const __VLS_50 = __VLS_49({
        prop: "trigger_type",
        label: "Type",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    const __VLS_52 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        label: "Source",
        minWidth: "200",
    }));
    const __VLS_54 = __VLS_53({
        label: "Source",
        minWidth: "200",
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_55.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.sourceLabel(row));
    }
    var __VLS_55;
    const __VLS_56 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        label: "Status",
        width: "110",
    }));
    const __VLS_58 = __VLS_57({
        label: "Status",
        width: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_59.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_60 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            type: (row.is_active ? 'success' : 'info'),
        }));
        const __VLS_62 = __VLS_61({
            type: (row.is_active ? 'success' : 'info'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        __VLS_63.slots.default;
        (row.is_active ? 'Enabled' : 'Disabled');
        var __VLS_63;
    }
    var __VLS_59;
    const __VLS_64 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        label: "Migration",
        width: "150",
    }));
    const __VLS_66 = __VLS_65({
        label: "Migration",
        width: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_67.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.migration_status === 'PENDING_MIGRATION') {
            const __VLS_68 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
                type: "warning",
            }));
            const __VLS_70 = __VLS_69({
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_69));
            __VLS_71.slots.default;
            var __VLS_71;
        }
        else if (row.migration_status === 'MIGRATED') {
            const __VLS_72 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
                type: "success",
            }));
            const __VLS_74 = __VLS_73({
                type: "success",
            }, ...__VLS_functionalComponentArgsRest(__VLS_73));
            __VLS_75.slots.default;
            var __VLS_75;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        }
    }
    var __VLS_67;
    const __VLS_76 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        label: "Actions",
        width: "360",
        fixed: "right",
    }));
    const __VLS_78 = __VLS_77({
        label: "Actions",
        width: "360",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    __VLS_79.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_79.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_80 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_82 = __VLS_81({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        let __VLS_84;
        let __VLS_85;
        let __VLS_86;
        const __VLS_87 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                    return;
                __VLS_ctx.openEdit(row);
            }
        };
        __VLS_83.slots.default;
        var __VLS_83;
        if (row.migration_status === 'PENDING_MIGRATION') {
            const __VLS_88 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }));
            const __VLS_90 = __VLS_89({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_89));
            let __VLS_92;
            let __VLS_93;
            let __VLS_94;
            const __VLS_95 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                        return;
                    if (!(row.migration_status === 'PENDING_MIGRATION'))
                        return;
                    __VLS_ctx.openEdit(row);
                }
            };
            __VLS_91.slots.default;
            var __VLS_91;
        }
        if (row.migration_status === 'MIGRATED') {
            const __VLS_96 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }));
            const __VLS_98 = __VLS_97({
                ...{ 'onClick': {} },
                link: true,
                type: "warning",
            }, ...__VLS_functionalComponentArgsRest(__VLS_97));
            let __VLS_100;
            let __VLS_101;
            let __VLS_102;
            const __VLS_103 = {
                onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                        return;
                    if (!(row.migration_status === 'MIGRATED'))
                        return;
                    __VLS_ctx.rollbackMigration(row);
                }
            };
            __VLS_99.slots.default;
            var __VLS_99;
        }
        const __VLS_104 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_106 = __VLS_105({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        let __VLS_108;
        let __VLS_109;
        let __VLS_110;
        const __VLS_111 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                    return;
                __VLS_ctx.toggle(row);
            }
        };
        __VLS_107.slots.default;
        (row.is_active ? 'Disable' : 'Enable');
        var __VLS_107;
        const __VLS_112 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_114 = __VLS_113({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        let __VLS_116;
        let __VLS_117;
        let __VLS_118;
        const __VLS_119 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                    return;
                __VLS_ctx.openTest(row);
            }
        };
        __VLS_115.slots.default;
        var __VLS_115;
        const __VLS_120 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (row.is_active),
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
            disabled: (row.is_active),
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        let __VLS_126;
        const __VLS_127 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.forbidden && !__VLS_ctx.loadError))
                    return;
                __VLS_ctx.remove(row);
            }
        };
        __VLS_123.slots.default;
        var __VLS_123;
    }
    var __VLS_79;
    var __VLS_39;
}
const __VLS_128 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.editing ? 'Edit pipeline trigger' : 'Create pipeline trigger'),
    width: "680px",
}));
const __VLS_130 = __VLS_129({
    ...{ 'onClosed': {} },
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.editing ? 'Edit pipeline trigger' : 'Create pipeline trigger'),
    width: "680px",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
let __VLS_132;
let __VLS_133;
let __VLS_134;
const __VLS_135 = {
    onClosed: (__VLS_ctx.closeEditor)
};
__VLS_131.slots.default;
const __VLS_136 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
    labelWidth: "150px",
}));
const __VLS_138 = __VLS_137({
    labelWidth: "150px",
}, ...__VLS_functionalComponentArgsRest(__VLS_137));
__VLS_139.slots.default;
const __VLS_140 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "Trigger code",
    required: true,
}));
const __VLS_142 = __VLS_141({
    label: "Trigger code",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
const __VLS_144 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
    modelValue: (__VLS_ctx.form.trigger_code),
    modelModifiers: { trim: true, },
    disabled: (Boolean(__VLS_ctx.editing)),
}));
const __VLS_146 = __VLS_145({
    modelValue: (__VLS_ctx.form.trigger_code),
    modelModifiers: { trim: true, },
    disabled: (Boolean(__VLS_ctx.editing)),
}, ...__VLS_functionalComponentArgsRest(__VLS_145));
var __VLS_143;
const __VLS_148 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "Name",
    required: true,
}));
const __VLS_150 = __VLS_149({
    label: "Name",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    modelValue: (__VLS_ctx.form.trigger_name),
    modelModifiers: { trim: true, },
}));
const __VLS_154 = __VLS_153({
    modelValue: (__VLS_ctx.form.trigger_name),
    modelModifiers: { trim: true, },
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
var __VLS_151;
const __VLS_156 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "Pipeline template",
    required: true,
}));
const __VLS_158 = __VLS_157({
    label: "Pipeline template",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
const __VLS_160 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
    modelValue: (__VLS_ctx.form.pipeline_template_code),
    modelModifiers: { trim: true, },
}));
const __VLS_162 = __VLS_161({
    modelValue: (__VLS_ctx.form.pipeline_template_code),
    modelModifiers: { trim: true, },
}, ...__VLS_functionalComponentArgsRest(__VLS_161));
var __VLS_159;
const __VLS_164 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    label: "Type",
    required: true,
}));
const __VLS_166 = __VLS_165({
    label: "Type",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
const __VLS_168 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.trigger_type),
    disabled: (Boolean(__VLS_ctx.editing)),
}));
const __VLS_170 = __VLS_169({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.trigger_type),
    disabled: (Boolean(__VLS_ctx.editing)),
}, ...__VLS_functionalComponentArgsRest(__VLS_169));
let __VLS_172;
let __VLS_173;
let __VLS_174;
const __VLS_175 = {
    onChange: (__VLS_ctx.resetSource)
};
__VLS_171.slots.default;
const __VLS_176 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
    label: "Webhook",
    value: "WEBHOOK",
}));
const __VLS_178 = __VLS_177({
    label: "Webhook",
    value: "WEBHOOK",
}, ...__VLS_functionalComponentArgsRest(__VLS_177));
const __VLS_180 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
    label: "Schedule",
    value: "SCHEDULE",
}));
const __VLS_182 = __VLS_181({
    label: "Schedule",
    value: "SCHEDULE",
}, ...__VLS_functionalComponentArgsRest(__VLS_181));
const __VLS_184 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    label: "Manual",
    value: "MANUAL",
}));
const __VLS_186 = __VLS_185({
    label: "Manual",
    value: "MANUAL",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
const __VLS_188 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
    label: "Platform event",
    value: "PLATFORM_EVENT",
}));
const __VLS_190 = __VLS_189({
    label: "Platform event",
    value: "PLATFORM_EVENT",
}, ...__VLS_functionalComponentArgsRest(__VLS_189));
var __VLS_171;
var __VLS_167;
if (__VLS_ctx.form.trigger_type === 'WEBHOOK') {
    const __VLS_192 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        label: "System",
        required: true,
    }));
    const __VLS_194 = __VLS_193({
        label: "System",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    __VLS_195.slots.default;
    const __VLS_196 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.systemId),
        filterable: true,
        loading: (__VLS_ctx.sourceLoading),
    }));
    const __VLS_198 = __VLS_197({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.systemId),
        filterable: true,
        loading: (__VLS_ctx.sourceLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    let __VLS_200;
    let __VLS_201;
    let __VLS_202;
    const __VLS_203 = {
        onChange: (__VLS_ctx.loadResources)
    };
    __VLS_199.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
        const __VLS_204 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            key: (item.id),
            label: (item.system_name),
            value: (item.id),
        }));
        const __VLS_206 = __VLS_205({
            key: (item.id),
            label: (item.system_name),
            value: (item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    }
    var __VLS_199;
    var __VLS_195;
    const __VLS_208 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        label: "Resource",
        required: true,
    }));
    const __VLS_210 = __VLS_209({
        label: "Resource",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    const __VLS_212 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.resourceId),
        filterable: true,
        disabled: (!__VLS_ctx.systemId),
        loading: (__VLS_ctx.sourceLoading),
    }));
    const __VLS_214 = __VLS_213({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.resourceId),
        filterable: true,
        disabled: (!__VLS_ctx.systemId),
        loading: (__VLS_ctx.sourceLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    let __VLS_216;
    let __VLS_217;
    let __VLS_218;
    const __VLS_219 = {
        onChange: (__VLS_ctx.loadObjects)
    };
    __VLS_215.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.resources))) {
        const __VLS_220 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            key: (item.id),
            label: (item.resource_name),
            value: (item.id),
        }));
        const __VLS_222 = __VLS_221({
            key: (item.id),
            label: (item.resource_name),
            value: (item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    }
    var __VLS_215;
    var __VLS_211;
    const __VLS_224 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        label: "Event object",
        required: true,
    }));
    const __VLS_226 = __VLS_225({
        label: "Event object",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_227.slots.default;
    const __VLS_228 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        modelValue: (__VLS_ctx.form.source_resource_object_id),
        disabled: (!__VLS_ctx.resourceId),
        loading: (__VLS_ctx.sourceLoading),
    }));
    const __VLS_230 = __VLS_229({
        modelValue: (__VLS_ctx.form.source_resource_object_id),
        disabled: (!__VLS_ctx.resourceId),
        loading: (__VLS_ctx.sourceLoading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.objects))) {
        const __VLS_232 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
            key: (item.id),
            label: (item.object_name),
            value: (item.id),
        }));
        const __VLS_234 = __VLS_233({
            key: (item.id),
            label: (item.object_name),
            value: (item.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    }
    var __VLS_231;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hint" },
    });
    var __VLS_227;
}
if (__VLS_ctx.form.trigger_type === 'SCHEDULE') {
    const __VLS_236 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        label: "调度计划",
        required: true,
    }));
    const __VLS_238 = __VLS_237({
        label: "调度计划",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    /** @type {[typeof ScheduleSelector, ]} */ ;
    // @ts-ignore
    const __VLS_240 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
        schedule: (__VLS_ctx.form.schedule_config.cron),
        showStartTime: (false),
        allowAdvanced: (false),
        allowManual: (false),
        showHint: (false),
    }));
    const __VLS_241 = __VLS_240({
        schedule: (__VLS_ctx.form.schedule_config.cron),
        showStartTime: (false),
        allowAdvanced: (false),
        allowManual: (false),
        showHint: (false),
    }, ...__VLS_functionalComponentArgsRest(__VLS_240));
    var __VLS_239;
    const __VLS_243 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_244 = __VLS_asFunctionalComponent(__VLS_243, new __VLS_243({
        label: "执行时区",
    }));
    const __VLS_245 = __VLS_244({
        label: "执行时区",
    }, ...__VLS_functionalComponentArgsRest(__VLS_244));
    __VLS_246.slots.default;
    const __VLS_247 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
        modelValue: "Asia/Shanghai（北京时间）",
        disabled: true,
    }));
    const __VLS_249 = __VLS_248({
        modelValue: "Asia/Shanghai（北京时间）",
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_248));
    var __VLS_246;
}
if (__VLS_ctx.form.trigger_type === 'PLATFORM_EVENT') {
    const __VLS_251 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({
        label: "事件分类",
        required: true,
    }));
    const __VLS_253 = __VLS_252({
        label: "事件分类",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_252));
    __VLS_254.slots.default;
    const __VLS_255 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.platformEventCategory),
    }));
    const __VLS_257 = __VLS_256({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.platformEventCategory),
    }, ...__VLS_functionalComponentArgsRest(__VLS_256));
    let __VLS_259;
    let __VLS_260;
    let __VLS_261;
    const __VLS_262 = {
        onChange: (__VLS_ctx.changePlatformEventCategory)
    };
    __VLS_258.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.platformEventCategories))) {
        const __VLS_263 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
            key: (item.category),
            label: (item.category_name),
            value: (item.category),
        }));
        const __VLS_265 = __VLS_264({
            key: (item.category),
            label: (item.category_name),
            value: (item.category),
        }, ...__VLS_functionalComponentArgsRest(__VLS_264));
    }
    var __VLS_258;
    var __VLS_254;
    const __VLS_267 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_268 = __VLS_asFunctionalComponent(__VLS_267, new __VLS_267({
        label: "事件来源",
    }));
    const __VLS_269 = __VLS_268({
        label: "事件来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_268));
    __VLS_270.slots.default;
    const __VLS_271 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
        modelValue: (__VLS_ctx.selectedPlatformEvent?.source_name || ''),
        disabled: true,
    }));
    const __VLS_273 = __VLS_272({
        modelValue: (__VLS_ctx.selectedPlatformEvent?.source_name || ''),
        disabled: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    var __VLS_270;
    const __VLS_275 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_276 = __VLS_asFunctionalComponent(__VLS_275, new __VLS_275({
        label: "具体事件",
        required: true,
    }));
    const __VLS_277 = __VLS_276({
        label: "具体事件",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_276));
    __VLS_278.slots.default;
    const __VLS_279 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.platform_event_type),
        disabled: (!__VLS_ctx.platformEventCategory),
    }));
    const __VLS_281 = __VLS_280({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.platform_event_type),
        disabled: (!__VLS_ctx.platformEventCategory),
    }, ...__VLS_functionalComponentArgsRest(__VLS_280));
    let __VLS_283;
    let __VLS_284;
    let __VLS_285;
    const __VLS_286 = {
        onChange: (__VLS_ctx.changePlatformEventType)
    };
    __VLS_282.slots.default;
    for (const [item] of __VLS_getVForSourceType((__VLS_ctx.platformEventOptions))) {
        const __VLS_287 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
            key: (item.event_type),
            label: (item.event_name),
            value: (item.event_type),
        }));
        const __VLS_289 = __VLS_288({
            key: (item.event_type),
            label: (item.event_name),
            value: (item.event_type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_288));
    }
    var __VLS_282;
    var __VLS_278;
    if (__VLS_ctx.platformEventFilterFields.length) {
        const __VLS_291 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
            label: "筛选字段",
        }));
        const __VLS_293 = __VLS_292({
            label: "筛选字段",
        }, ...__VLS_functionalComponentArgsRest(__VLS_292));
        __VLS_294.slots.default;
        const __VLS_295 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.platformEventFilterField),
            clearable: true,
        }));
        const __VLS_297 = __VLS_296({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.platformEventFilterField),
            clearable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_296));
        let __VLS_299;
        let __VLS_300;
        let __VLS_301;
        const __VLS_302 = {
            onChange: (__VLS_ctx.syncPlatformEventFilter)
        };
        __VLS_298.slots.default;
        for (const [field] of __VLS_getVForSourceType((__VLS_ctx.platformEventFilterFields))) {
            const __VLS_303 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
                key: (field),
                label: (field),
                value: (field),
            }));
            const __VLS_305 = __VLS_304({
                key: (field),
                label: (field),
                value: (field),
            }, ...__VLS_functionalComponentArgsRest(__VLS_304));
        }
        var __VLS_298;
        var __VLS_294;
    }
    if (__VLS_ctx.platformEventFilterField) {
        const __VLS_307 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
            label: "字段值",
        }));
        const __VLS_309 = __VLS_308({
            label: "字段值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_308));
        __VLS_310.slots.default;
        const __VLS_311 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_312 = __VLS_asFunctionalComponent(__VLS_311, new __VLS_311({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.platformEventFilterValue),
            modelModifiers: { trim: true, },
        }));
        const __VLS_313 = __VLS_312({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.platformEventFilterValue),
            modelModifiers: { trim: true, },
        }, ...__VLS_functionalComponentArgsRest(__VLS_312));
        let __VLS_315;
        let __VLS_316;
        let __VLS_317;
        const __VLS_318 = {
            onChange: (__VLS_ctx.syncPlatformEventFilter)
        };
        var __VLS_314;
        var __VLS_310;
    }
}
const __VLS_319 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_320 = __VLS_asFunctionalComponent(__VLS_319, new __VLS_319({
    label: "Failure policy",
}));
const __VLS_321 = __VLS_320({
    label: "Failure policy",
}, ...__VLS_functionalComponentArgsRest(__VLS_320));
__VLS_322.slots.default;
const __VLS_323 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
    modelValue: (__VLS_ctx.form.failure_policy),
}));
const __VLS_325 = __VLS_324({
    modelValue: (__VLS_ctx.form.failure_policy),
}, ...__VLS_functionalComponentArgsRest(__VLS_324));
__VLS_326.slots.default;
const __VLS_327 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_328 = __VLS_asFunctionalComponent(__VLS_327, new __VLS_327({
    label: "Retry",
    value: "RETRY",
}));
const __VLS_329 = __VLS_328({
    label: "Retry",
    value: "RETRY",
}, ...__VLS_functionalComponentArgsRest(__VLS_328));
const __VLS_331 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({
    label: "Dead letter",
    value: "DEAD_LETTER",
}));
const __VLS_333 = __VLS_332({
    label: "Dead letter",
    value: "DEAD_LETTER",
}, ...__VLS_functionalComponentArgsRest(__VLS_332));
const __VLS_335 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_336 = __VLS_asFunctionalComponent(__VLS_335, new __VLS_335({
    label: "Stop",
    value: "STOP",
}));
const __VLS_337 = __VLS_336({
    label: "Stop",
    value: "STOP",
}, ...__VLS_functionalComponentArgsRest(__VLS_336));
var __VLS_326;
var __VLS_322;
const __VLS_339 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_340 = __VLS_asFunctionalComponent(__VLS_339, new __VLS_339({
    label: "Enabled",
}));
const __VLS_341 = __VLS_340({
    label: "Enabled",
}, ...__VLS_functionalComponentArgsRest(__VLS_340));
__VLS_342.slots.default;
const __VLS_343 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_344 = __VLS_asFunctionalComponent(__VLS_343, new __VLS_343({
    modelValue: (__VLS_ctx.form.is_active),
}));
const __VLS_345 = __VLS_344({
    modelValue: (__VLS_ctx.form.is_active),
}, ...__VLS_functionalComponentArgsRest(__VLS_344));
var __VLS_342;
var __VLS_139;
{
    const { footer: __VLS_thisSlot } = __VLS_131.slots;
    const __VLS_347 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_348 = __VLS_asFunctionalComponent(__VLS_347, new __VLS_347({
        ...{ 'onClick': {} },
    }));
    const __VLS_349 = __VLS_348({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_348));
    let __VLS_351;
    let __VLS_352;
    let __VLS_353;
    const __VLS_354 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_350.slots.default;
    var __VLS_350;
    const __VLS_355 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_356 = __VLS_asFunctionalComponent(__VLS_355, new __VLS_355({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
        disabled: (!__VLS_ctx.canSave),
    }));
    const __VLS_357 = __VLS_356({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
        disabled: (!__VLS_ctx.canSave),
    }, ...__VLS_functionalComponentArgsRest(__VLS_356));
    let __VLS_359;
    let __VLS_360;
    let __VLS_361;
    const __VLS_362 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_358.slots.default;
    var __VLS_358;
}
var __VLS_131;
const __VLS_363 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_364 = __VLS_asFunctionalComponent(__VLS_363, new __VLS_363({
    modelValue: (__VLS_ctx.testVisible),
    title: "Dry-run input",
    width: "640px",
}));
const __VLS_365 = __VLS_364({
    modelValue: (__VLS_ctx.testVisible),
    title: "Dry-run input",
    width: "640px",
}, ...__VLS_functionalComponentArgsRest(__VLS_364));
__VLS_366.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "hint" },
});
const __VLS_367 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_368 = __VLS_asFunctionalComponent(__VLS_367, new __VLS_367({
    modelValue: (__VLS_ctx.samplePayloadText),
    type: "textarea",
    rows: (12),
}));
const __VLS_369 = __VLS_368({
    modelValue: (__VLS_ctx.samplePayloadText),
    type: "textarea",
    rows: (12),
}, ...__VLS_functionalComponentArgsRest(__VLS_368));
{
    const { footer: __VLS_thisSlot } = __VLS_366.slots;
    const __VLS_371 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_372 = __VLS_asFunctionalComponent(__VLS_371, new __VLS_371({
        ...{ 'onClick': {} },
    }));
    const __VLS_373 = __VLS_372({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_372));
    let __VLS_375;
    let __VLS_376;
    let __VLS_377;
    const __VLS_378 = {
        onClick: (...[$event]) => {
            __VLS_ctx.testVisible = false;
        }
    };
    __VLS_374.slots.default;
    var __VLS_374;
    const __VLS_379 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_380 = __VLS_asFunctionalComponent(__VLS_379, new __VLS_379({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.testing),
    }));
    const __VLS_381 = __VLS_380({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.testing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_380));
    let __VLS_383;
    let __VLS_384;
    let __VLS_385;
    const __VLS_386 = {
        onClick: (__VLS_ctx.runTest)
    };
    __VLS_382.slots.default;
    var __VLS_382;
}
var __VLS_366;
/** @type {__VLS_StyleScopedClasses['trigger-config']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['migration-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ScheduleSelector: ScheduleSelector,
            items: items,
            systems: systems,
            resources: resources,
            objects: objects,
            loading: loading,
            sourceLoading: sourceLoading,
            saving: saving,
            testing: testing,
            loadError: loadError,
            forbidden: forbidden,
            visible: visible,
            testVisible: testVisible,
            editing: editing,
            migrationStatus: migrationStatus,
            systemId: systemId,
            resourceId: resourceId,
            samplePayloadText: samplePayloadText,
            platformEventCategory: platformEventCategory,
            platformEventFilterField: platformEventFilterField,
            platformEventFilterValue: platformEventFilterValue,
            form: form,
            platformEventCategories: platformEventCategories,
            platformEventOptions: platformEventOptions,
            selectedPlatformEvent: selectedPlatformEvent,
            platformEventFilterFields: platformEventFilterFields,
            canSave: canSave,
            sourceLabel: sourceLabel,
            resetSource: resetSource,
            changePlatformEventCategory: changePlatformEventCategory,
            changePlatformEventType: changePlatformEventType,
            syncPlatformEventFilter: syncPlatformEventFilter,
            closeEditor: closeEditor,
            load: load,
            showLegacy: showLegacy,
            loadResources: loadResources,
            loadObjects: loadObjects,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            rollbackMigration: rollbackMigration,
            toggle: toggle,
            openTest: openTest,
            runTest: runTest,
            remove: remove,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
