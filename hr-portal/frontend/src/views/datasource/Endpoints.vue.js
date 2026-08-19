/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, reactive, ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh, CopyDocument } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { formatDateTime } from '@/utils/datetime';
import PushTargetList from '@/components/push/PushTargetList.vue';
import { SOURCE_TYPES, findSourceType, initFormForType, } from '@/config/dataSources';
import { datasourcesApi } from '@/api/datasources';
import { adminTablesApi } from '@/api/admin_tables';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
import { useUserStore } from '@/stores/user';
const router = useRouter();
const userStore = useUserStore();
const userLoginName = computed(() => userStore.user?.login_name || '');
const list = ref([]);
const loading = ref(false);
// 月度自动偏移（inject）表集合：period_source==='inject' 的表显示「月份设置」
const injectTables = ref(new Set());
async function loadInjectTables() {
    try {
        const tables = await adminTablesApi.list();
        injectTables.value = new Set(tables.filter((t) => t.period_source === 'inject').map((t) => t.table_name));
    }
    catch {
        injectTables.value = new Set();
    }
}
async function load() {
    loading.value = true;
    try {
        list.value = await datasourcesApi.list();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
function statusType(s) {
    if (s === 'success')
        return 'success';
    if (s === 'failed')
        return 'danger';
    return 'info';
}
function statusLabel(s) {
    if (s === 'success')
        return '成功';
    if (s === 'failed')
        return '失败';
    return '未拉取';
}
function sourceTypeLabel(code) {
    return findSourceType(code)?.label ?? code;
}
// ===== 配置抽屉 =====
const drawerOpen = ref(false);
const activeTab = ref('pull');
const editing = ref(null);
const form = reactive({
    source_type: 'beisen_report',
    schedule: '每日 06:00',
    is_active: true,
    config: {},
});
const saving = ref(false);
const testing = ref(false);
const testResult = ref(null);
const currentType = computed(() => findSourceType(form.source_type));
// ===== 月度表「月份设置」：period_source==='inject' 的表均支持月度自动偏移 =====
const isPeriodTable = computed(() => !!editing.value && injectTables.value.has(editing.value.table_name));
const monthOffset = computed({
    get: () => parseInt(form.config['MONTH_OFFSET'] ?? '0', 10) || 0,
    set: (v) => {
        form.config['MONTH_OFFSET'] = String(v ?? 0);
    },
});
const monthPreview = computed(() => {
    const d = new Date();
    const idx = d.getFullYear() * 12 + d.getMonth() + monthOffset.value;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    return `${y}${String(m).padStart(2, '0')}`;
});
// 哪些字段是 secrets（与后端 SECRET_KEYS 保持一致）
const SECRET_KEY_SET = new Set([
    'BEISEN_APP_KEY',
    'BEISEN_APP_SECRET',
    'BEISEN_API_APP_KEY',
    'BEISEN_API_APP_SECRET',
    'HTTP_CREDENTIAL',
    'WEBHOOK_TOKEN',
    'DB_PASSWORD',
    'FEISHU_APP_ID',
    'FEISHU_APP_SECRET',
]);
function onTypeChange(newType) {
    const old = { ...form.config };
    const t = findSourceType(newType);
    if (!t)
        return;
    const fresh = initFormForType(newType);
    for (const k of Object.keys(fresh)) {
        if (old[k] !== undefined && old[k] !== '') {
            fresh[k] = old[k];
        }
    }
    form.config = fresh;
    form.schedule = t.defaultSchedule ?? form.schedule;
    testResult.value = null;
}
function openEdit(row) {
    editing.value = row;
    // settings 直接展开；secrets 用占位符（不显示原值，由 has_secret 标记是否已配）
    const merged = { ...initFormForType(row.source_type) };
    // 把 settings 中的非敏感字段灌进表单
    for (const [k, v] of Object.entries(row.settings || {})) {
        merged[k] = String(v ?? '');
    }
    // 敏感字段：留空，提示 placeholder 说明"已保存"
    // 月度表：默认月份偏移 0（当前月）
    if (injectTables.value.has(row.table_name) && !merged['MONTH_OFFSET']) {
        merged['MONTH_OFFSET'] = '0';
    }
    Object.assign(form, {
        source_type: row.source_type,
        schedule: row.schedule,
        is_active: row.is_active,
        config: merged,
    });
    testResult.value = null;
    drawerOpen.value = true;
}
function hasSecret(key) {
    return !!editing.value?.has_secret?.[key];
}
function fieldPlaceholder(key, original) {
    if (SECRET_KEY_SET.has(key) && hasSecret(key)) {
        return '••• 已保存（留空不变；填新值则覆盖）';
    }
    return original ?? '';
}
function allowManualInput(event) {
    ;
    event.target?.removeAttribute('readonly');
}
const copyDialogOpen = ref(false);
const copySource = ref(null);
const copyableEndpoints = computed(() => list.value.filter((e) => e.source_type === form.source_type && e.id !== editing.value?.id));
function openCopyDialog() {
    if (!copyableEndpoints.value.length) {
        ElMessage.info('当前没有同类型的其他接入可供复制凭证');
        return;
    }
    copySource.value = null;
    copyDialogOpen.value = true;
}
function applyCopy() {
    if (copySource.value === null) {
        ElMessage.warning('请选择来源');
        return;
    }
    const src = list.value.find((e) => e.id === copySource.value);
    if (!src)
        return;
    // 把源的非敏感 settings 复制过来（敏感字段无法跨表自动复制，因为后端不返回明文）
    for (const [k, v] of Object.entries(src.settings || {})) {
        form.config[k] = String(v ?? '');
    }
    copyDialogOpen.value = false;
    ElMessage.success(`已从「${src.table_label}」复制非敏感配置；敏感字段需重新输入`);
}
/** 拆分 form.config 为 settings（明文）+ secrets（明文，后端会加密）*/
function splitPayload() {
    const settings = {};
    const secrets = {};
    for (const [k, v] of Object.entries(form.config)) {
        if (SECRET_KEY_SET.has(k)) {
            if (v && !(hasSecret(k) && v === userLoginName.value))
                secrets[k] = v;
        }
        else {
            settings[k] = v;
        }
    }
    return { settings, secrets };
}
async function onSave() {
    // 必填校验
    const t = currentType.value;
    if (t) {
        for (const g of t.groups) {
            for (const f of g.fields) {
                if (!f.required)
                    continue;
                const val = form.config[f.key];
                if (SECRET_KEY_SET.has(f.key)) {
                    // 敏感字段：本次没填但后端已保存过 → 视为通过
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
    if (!editing.value)
        return;
    saving.value = true;
    try {
        const { settings, secrets } = splitPayload();
        const updated = await datasourcesApi.update(editing.value.id, {
            source_type: form.source_type,
            schedule: form.schedule,
            settings,
            secrets,
            is_active: form.is_active,
        });
        // 更新列表里的这一行
        const idx = list.value.findIndex((e) => e.id === updated.id);
        if (idx >= 0)
            list.value[idx] = updated;
        ElMessage.success('配置已保存');
        drawerOpen.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function handleTest() {
    if (!editing.value)
        return;
    testing.value = true;
    testResult.value = null;
    try {
        const { settings, secrets } = splitPayload();
        const res = await datasourcesApi.test(editing.value.id, {
            source_type: form.source_type,
            schedule: form.schedule,
            settings,
            secrets,
            is_active: form.is_active,
        });
        testResult.value = {
            ok: res.ok,
            message: res.ok
                ? `连接成功${res.token_preview ? ` · token: ${res.token_preview}` : ''}`
                : res.message,
        };
    }
    catch (e) {
        testResult.value = { ok: false, message: e?.response?.data?.detail || '测试失败' };
    }
    finally {
        testing.value = false;
    }
}
async function triggerSync(row) {
    try {
        ElMessage.info(`正在拉取「${row.table_label}」...`);
        const res = await datasourcesApi.sync(row.id);
        if (res.ok) {
            ElMessage.success(`同步成功：${res.message}`);
        }
        else {
            ElMessage.error(`同步失败：${res.message}`);
        }
        // 刷新该行
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '触发失败');
    }
}
onMounted(() => {
    load();
    loadInjectTables();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: "warning",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    type: "warning",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { title: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
}
{
    const { default: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push({ name: 'WarehouseAssets' });
        }
    };
    __VLS_7.slots.default;
    var __VLS_7;
}
var __VLS_3;
const __VLS_12 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_15.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.list.length);
}
const __VLS_16 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    title: "数据接入说明",
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    title: "数据接入说明",
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
var __VLS_19;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_20 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_22 = __VLS_21({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_23.slots.default;
const __VLS_24 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "数据表",
    minWidth: "200",
}));
const __VLS_26 = __VLS_25({
    label: "数据表",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_27.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (row.table_label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (row.table_name);
}
var __VLS_27;
const __VLS_28 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "接入类型",
    width: "160",
}));
const __VLS_30 = __VLS_29({
    label: "接入类型",
    width: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_31.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_32 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        size: "small",
        effect: "plain",
    }));
    const __VLS_34 = __VLS_33({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    (__VLS_ctx.sourceTypeLabel(row.source_type));
    var __VLS_35;
}
var __VLS_31;
const __VLS_36 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    prop: "schedule",
    label: "调度计划",
    minWidth: "180",
}));
const __VLS_38 = __VLS_37({
    prop: "schedule",
    label: "调度计划",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "上次拉取",
    minWidth: "180",
}));
const __VLS_42 = __VLS_41({
    label: "上次拉取",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_43.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_sync_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatDateTime(row.last_sync_at));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_43;
const __VLS_44 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "状态",
    width: "100",
}));
const __VLS_46 = __VLS_45({
    label: "状态",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_47.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_48 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        type: (__VLS_ctx.statusType(row.last_status)),
        size: "small",
    }));
    const __VLS_50 = __VLS_49({
        type: (__VLS_ctx.statusType(row.last_status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (__VLS_ctx.statusLabel(row.last_status));
    var __VLS_51;
}
var __VLS_47;
const __VLS_52 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "行数",
    width: "80",
}));
const __VLS_54 = __VLS_53({
    label: "行数",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_55.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_rows !== null) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (row.last_rows);
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
}
var __VLS_55;
const __VLS_56 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    label: "操作",
    width: "300",
    fixed: "right",
}));
const __VLS_58 = __VLS_57({
    label: "操作",
    width: "300",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_59.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "datasource.endpoints",
        op: "U",
        size: "small",
    }));
    const __VLS_61 = __VLS_60({
        ...{ 'onClick': {} },
        menu: "datasource.endpoints",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    let __VLS_63;
    let __VLS_64;
    let __VLS_65;
    const __VLS_66 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_62.slots.default;
    var __VLS_62;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "datasource.endpoints",
        op: "U",
        size: "small",
        type: "primary",
    }));
    const __VLS_68 = __VLS_67({
        ...{ 'onClick': {} },
        menu: "datasource.endpoints",
        op: "U",
        size: "small",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    let __VLS_70;
    let __VLS_71;
    let __VLS_72;
    const __VLS_73 = {
        onClick: (...[$event]) => {
            __VLS_ctx.triggerSync(row);
        }
    };
    __VLS_69.slots.default;
    const __VLS_74 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
        ...{ style: {} },
    }));
    const __VLS_76 = __VLS_75({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_75));
    __VLS_77.slots.default;
    const __VLS_78 = {}.Refresh;
    /** @type {[typeof __VLS_components.Refresh, ]} */ ;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({}));
    const __VLS_80 = __VLS_79({}, ...__VLS_functionalComponentArgsRest(__VLS_79));
    var __VLS_77;
    var __VLS_69;
    const __VLS_82 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_83 = __VLS_asFunctionalComponent(__VLS_82, new __VLS_82({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }));
    const __VLS_84 = __VLS_83({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_83));
    let __VLS_86;
    let __VLS_87;
    let __VLS_88;
    const __VLS_89 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push(`/datasource/sync-runs?ds=${row.id}`);
        }
    };
    __VLS_85.slots.default;
    var __VLS_85;
}
var __VLS_59;
var __VLS_23;
var __VLS_15;
const __VLS_90 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_91 = __VLS_asFunctionalComponent(__VLS_90, new __VLS_90({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.editing ? `配置接口 · ${__VLS_ctx.editing.table_label}` : '新建接口'),
    direction: "rtl",
    size: "600px",
}));
const __VLS_92 = __VLS_91({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.editing ? `配置接口 · ${__VLS_ctx.editing.table_label}` : '新建接口'),
    direction: "rtl",
    size: "600px",
}, ...__VLS_functionalComponentArgsRest(__VLS_91));
__VLS_93.slots.default;
const __VLS_94 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_95 = __VLS_asFunctionalComponent(__VLS_94, new __VLS_94({
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_96 = __VLS_95({
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_95));
__VLS_97.slots.default;
const __VLS_98 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
    label: "拉取接口",
    name: "pull",
}));
const __VLS_100 = __VLS_99({
    label: "拉取接口",
    name: "pull",
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
__VLS_101.slots.default;
const __VLS_102 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_103 = __VLS_asFunctionalComponent(__VLS_102, new __VLS_102({
    labelPosition: "top",
    autocomplete: "off",
}));
const __VLS_104 = __VLS_103({
    labelPosition: "top",
    autocomplete: "off",
}, ...__VLS_functionalComponentArgsRest(__VLS_103));
__VLS_105.slots.default;
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
const __VLS_106 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_107 = __VLS_asFunctionalComponent(__VLS_106, new __VLS_106({
    label: "接入类型",
}));
const __VLS_108 = __VLS_107({
    label: "接入类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_107));
__VLS_109.slots.default;
const __VLS_110 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_111 = __VLS_asFunctionalComponent(__VLS_110, new __VLS_110({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_type),
    ...{ style: {} },
}));
const __VLS_112 = __VLS_111({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.source_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_111));
let __VLS_114;
let __VLS_115;
let __VLS_116;
const __VLS_117 = {
    onChange: (__VLS_ctx.onTypeChange)
};
__VLS_113.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.SOURCE_TYPES))) {
    const __VLS_118 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_119 = __VLS_asFunctionalComponent(__VLS_118, new __VLS_118({
        key: (t.code),
        label: (t.label),
        value: (t.code),
    }));
    const __VLS_120 = __VLS_119({
        key: (t.code),
        label: (t.label),
        value: (t.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_119));
}
var __VLS_113;
if (__VLS_ctx.currentType) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.currentType.description);
}
var __VLS_109;
if (__VLS_ctx.currentType) {
    for (const [grp] of __VLS_getVForSourceType((__VLS_ctx.currentType.groups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (grp.title),
            ...{ class: "field-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "section-title" },
        });
        (grp.title);
        for (const [f] of __VLS_getVForSourceType((grp.fields))) {
            const __VLS_122 = {}.ElFormItem;
            /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
            // @ts-ignore
            const __VLS_123 = __VLS_asFunctionalComponent(__VLS_122, new __VLS_122({
                key: (f.key),
                label: (f.label),
                required: (f.required),
            }));
            const __VLS_124 = __VLS_123({
                key: (f.key),
                label: (f.label),
                required: (f.required),
            }, ...__VLS_functionalComponentArgsRest(__VLS_123));
            __VLS_125.slots.default;
            if (f.type === 'text' || f.type === 'url') {
                const __VLS_126 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_127 = __VLS_asFunctionalComponent(__VLS_126, new __VLS_126({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    name: (`hr-source-field-${f.key.toLowerCase()}-${__VLS_ctx.editing?.id || 'new'}`),
                    autocomplete: (__VLS_ctx.SECRET_KEY_SET.has(f.key) ? 'new-password' : 'off'),
                    readonly: (__VLS_ctx.SECRET_KEY_SET.has(f.key)),
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }));
                const __VLS_128 = __VLS_127({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    name: (`hr-source-field-${f.key.toLowerCase()}-${__VLS_ctx.editing?.id || 'new'}`),
                    autocomplete: (__VLS_ctx.SECRET_KEY_SET.has(f.key) ? 'new-password' : 'off'),
                    readonly: (__VLS_ctx.SECRET_KEY_SET.has(f.key)),
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_127));
                let __VLS_130;
                let __VLS_131;
                let __VLS_132;
                const __VLS_133 = {
                    onFocus: (__VLS_ctx.allowManualInput)
                };
                var __VLS_129;
            }
            else if (f.type === 'password') {
                const __VLS_134 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    type: "text",
                    showPassword: true,
                    name: (`hr-source-secret-${f.key.toLowerCase()}-${__VLS_ctx.editing?.id || 'new'}`),
                    autocomplete: "new-password",
                    readonly: true,
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }));
                const __VLS_136 = __VLS_135({
                    ...{ 'onFocus': {} },
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    type: "text",
                    showPassword: true,
                    name: (`hr-source-secret-${f.key.toLowerCase()}-${__VLS_ctx.editing?.id || 'new'}`),
                    autocomplete: "new-password",
                    readonly: true,
                    dataLpignore: "true",
                    data1pIgnore: "true",
                    dataBwignore: "true",
                    placeholder: (__VLS_ctx.fieldPlaceholder(f.key, f.placeholder)),
                }, ...__VLS_functionalComponentArgsRest(__VLS_135));
                let __VLS_138;
                let __VLS_139;
                let __VLS_140;
                const __VLS_141 = {
                    onFocus: (__VLS_ctx.allowManualInput)
                };
                var __VLS_137;
            }
            else if (f.type === 'textarea') {
                const __VLS_142 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_143 = __VLS_asFunctionalComponent(__VLS_142, new __VLS_142({
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    type: "textarea",
                    rows: (4),
                    placeholder: (f.placeholder),
                }));
                const __VLS_144 = __VLS_143({
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    type: "textarea",
                    rows: (4),
                    placeholder: (f.placeholder),
                }, ...__VLS_functionalComponentArgsRest(__VLS_143));
            }
            else if (f.type === 'select') {
                const __VLS_146 = {}.ElSelect;
                /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                // @ts-ignore
                const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    ...{ style: {} },
                }));
                const __VLS_148 = __VLS_147({
                    modelValue: (__VLS_ctx.form.config[f.key]),
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_147));
                __VLS_149.slots.default;
                for (const [opt] of __VLS_getVForSourceType((f.options))) {
                    const __VLS_150 = {}.ElOption;
                    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                    // @ts-ignore
                    const __VLS_151 = __VLS_asFunctionalComponent(__VLS_150, new __VLS_150({
                        key: (opt.value),
                        label: (opt.label),
                        value: (opt.value),
                    }));
                    const __VLS_152 = __VLS_151({
                        key: (opt.value),
                        label: (opt.label),
                        value: (opt.value),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_151));
                }
                var __VLS_149;
            }
            if (f.hint) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "field-hint" },
                });
                (f.hint);
            }
            var __VLS_125;
        }
    }
}
if (__VLS_ctx.isPeriodTable) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-group" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    const __VLS_154 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
        label: "月份偏移",
    }));
    const __VLS_156 = __VLS_155({
        label: "月份偏移",
    }, ...__VLS_functionalComponentArgsRest(__VLS_155));
    __VLS_157.slots.default;
    const __VLS_158 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
        modelValue: (__VLS_ctx.monthOffset),
        step: (1),
        controlsPosition: "right",
        ...{ style: {} },
    }));
    const __VLS_160 = __VLS_159({
        modelValue: (__VLS_ctx.monthOffset),
        step: (1),
        controlsPosition: "right",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_159));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (__VLS_ctx.monthPreview);
    var __VLS_157;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-group" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
const __VLS_162 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    label: "调度计划",
}));
const __VLS_164 = __VLS_163({
    label: "调度计划",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
__VLS_165.slots.default;
/** @type {[typeof ScheduleSelector, ]} */ ;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
    schedule: (__VLS_ctx.form.schedule),
    showStartTime: (false),
}));
const __VLS_167 = __VLS_166({
    schedule: (__VLS_ctx.form.schedule),
    showStartTime: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
var __VLS_165;
const __VLS_169 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    label: "启用",
}));
const __VLS_171 = __VLS_170({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
__VLS_172.slots.default;
const __VLS_173 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_175 = __VLS_174({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
var __VLS_172;
if (__VLS_ctx.testResult) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: (['test-result', __VLS_ctx.testResult.ok ? 'test-result--ok' : 'test-result--fail']) },
    });
    (__VLS_ctx.testResult.ok ? '✓' : '✕');
    (__VLS_ctx.testResult.message);
}
var __VLS_105;
var __VLS_101;
const __VLS_177 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
    label: "推送接口",
    name: "push",
}));
const __VLS_179 = __VLS_178({
    label: "推送接口",
    name: "push",
}, ...__VLS_functionalComponentArgsRest(__VLS_178));
__VLS_180.slots.default;
if (__VLS_ctx.editing) {
    /** @type {[typeof PushTargetList, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(PushTargetList, new PushTargetList({
        key: (__VLS_ctx.editing.id),
        sourceTable: (__VLS_ctx.editing.table_name),
    }));
    const __VLS_182 = __VLS_181({
        key: (__VLS_ctx.editing.id),
        sourceTable: (__VLS_ctx.editing.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
}
else {
    const __VLS_184 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        description: "请先选择一条接口配置",
    }));
    const __VLS_186 = __VLS_185({
        description: "请先选择一条接口配置",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
}
var __VLS_180;
var __VLS_97;
{
    const { footer: __VLS_thisSlot } = __VLS_93.slots;
    if (__VLS_ctx.activeTab === 'pull') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_188 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
            ...{ 'onClick': {} },
            link: true,
        }));
        const __VLS_190 = __VLS_189({
            ...{ 'onClick': {} },
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_189));
        let __VLS_192;
        let __VLS_193;
        let __VLS_194;
        const __VLS_195 = {
            onClick: (__VLS_ctx.openCopyDialog)
        };
        __VLS_191.slots.default;
        const __VLS_196 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
            ...{ style: {} },
        }));
        const __VLS_198 = __VLS_197({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_197));
        __VLS_199.slots.default;
        const __VLS_200 = {}.CopyDocument;
        /** @type {[typeof __VLS_components.CopyDocument, ]} */ ;
        // @ts-ignore
        const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({}));
        const __VLS_202 = __VLS_201({}, ...__VLS_functionalComponentArgsRest(__VLS_201));
        var __VLS_199;
        var __VLS_191;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        const __VLS_204 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            ...{ 'onClick': {} },
        }));
        const __VLS_206 = __VLS_205({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        let __VLS_208;
        let __VLS_209;
        let __VLS_210;
        const __VLS_211 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.activeTab === 'pull'))
                    return;
                __VLS_ctx.drawerOpen = false;
            }
        };
        __VLS_207.slots.default;
        var __VLS_207;
        if (__VLS_ctx.currentType?.testable) {
            const __VLS_212 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.testing),
            }));
            const __VLS_214 = __VLS_213({
                ...{ 'onClick': {} },
                loading: (__VLS_ctx.testing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_213));
            let __VLS_216;
            let __VLS_217;
            let __VLS_218;
            const __VLS_219 = {
                onClick: (__VLS_ctx.handleTest)
            };
            __VLS_215.slots.default;
            var __VLS_215;
        }
        const __VLS_220 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_222 = __VLS_221({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_221));
        let __VLS_224;
        let __VLS_225;
        let __VLS_226;
        const __VLS_227 = {
            onClick: (__VLS_ctx.onSave)
        };
        __VLS_223.slots.default;
        var __VLS_223;
    }
}
var __VLS_93;
const __VLS_228 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
    modelValue: (__VLS_ctx.copyDialogOpen),
    title: "从其他表复制配置",
    width: "420px",
}));
const __VLS_230 = __VLS_229({
    modelValue: (__VLS_ctx.copyDialogOpen),
    title: "从其他表复制配置",
    width: "420px",
}, ...__VLS_functionalComponentArgsRest(__VLS_229));
__VLS_231.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
(__VLS_ctx.currentType?.label);
__VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
const __VLS_232 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    modelValue: (__VLS_ctx.copySource),
    ...{ style: {} },
}));
const __VLS_234 = __VLS_233({
    modelValue: (__VLS_ctx.copySource),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
__VLS_235.slots.default;
for (const [e] of __VLS_getVForSourceType((__VLS_ctx.copyableEndpoints))) {
    const __VLS_236 = {}.ElRadio;
    /** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        key: (e.id),
        value: (e.id),
    }));
    const __VLS_238 = __VLS_237({
        key: (e.id),
        value: (e.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    __VLS_239.slots.default;
    (e.table_label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (e.table_name);
    var __VLS_239;
}
var __VLS_235;
{
    const { footer: __VLS_thisSlot } = __VLS_231.slots;
    const __VLS_240 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        ...{ 'onClick': {} },
    }));
    const __VLS_242 = __VLS_241({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    let __VLS_244;
    let __VLS_245;
    let __VLS_246;
    const __VLS_247 = {
        onClick: (...[$event]) => {
            __VLS_ctx.copyDialogOpen = false;
        }
    };
    __VLS_243.slots.default;
    var __VLS_243;
    const __VLS_248 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_250 = __VLS_249({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    let __VLS_252;
    let __VLS_253;
    let __VLS_254;
    const __VLS_255 = {
        onClick: (__VLS_ctx.applyCopy)
    };
    __VLS_251.slots.default;
    var __VLS_251;
}
var __VLS_231;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['field-group']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            CopyDocument: CopyDocument,
            PermissionButton: PermissionButton,
            formatDateTime: formatDateTime,
            PushTargetList: PushTargetList,
            SOURCE_TYPES: SOURCE_TYPES,
            ScheduleSelector: ScheduleSelector,
            router: router,
            list: list,
            loading: loading,
            statusType: statusType,
            statusLabel: statusLabel,
            sourceTypeLabel: sourceTypeLabel,
            drawerOpen: drawerOpen,
            activeTab: activeTab,
            editing: editing,
            form: form,
            saving: saving,
            testing: testing,
            testResult: testResult,
            currentType: currentType,
            isPeriodTable: isPeriodTable,
            monthOffset: monthOffset,
            monthPreview: monthPreview,
            SECRET_KEY_SET: SECRET_KEY_SET,
            onTypeChange: onTypeChange,
            openEdit: openEdit,
            fieldPlaceholder: fieldPlaceholder,
            allowManualInput: allowManualInput,
            copyDialogOpen: copyDialogOpen,
            copySource: copySource,
            copyableEndpoints: copyableEndpoints,
            openCopyDialog: openCopyDialog,
            applyCopy: applyCopy,
            onSave: onSave,
            handleTest: handleTest,
            triggerSync: triggerSync,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
