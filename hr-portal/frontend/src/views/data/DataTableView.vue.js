/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime'
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Refresh, Download, Setting, Plus, Share } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import BulkActionBar from '@/components/BulkActionBar.vue';
import { dataApi } from '@/api/data';
import { datasourcesApi } from '@/api/datasources';
import { adminTablesApi } from '@/api/admin_tables';
import { useDataExport } from '@/composables/useDataExport';
import { pushTargetsApi } from '@/api/push_targets';
const route = useRoute();
const { exporting, exportCsv } = useDataExport();
// 立即推送：对该表所有启用的推送目标批量触发
const pushing = ref(false);
async function triggerPush() {
    if (!meta.value)
        return;
    pushing.value = true;
    try {
        const targets = await pushTargetsApi.list(meta.value.code);
        const active = targets.filter((t) => t.is_active);
        if (!active.length) {
            ElMessage.warning('该表暂无启用的推送目标，请先到接口配置页配置');
            return;
        }
        let successCount = 0;
        for (const t of active) {
            try {
                await pushTargetsApi.run(t.id);
                successCount++;
            }
            catch {
                ElMessage.error(`推送目标「${t.name}」失败`);
            }
        }
        if (successCount > 0)
            ElMessage.success(`已触发 ${successCount} 个推送目标`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '推送失败');
    }
    finally {
        pushing.value = false;
    }
}
// 从路由参数直接读 table_name（路由 /data/:table 里 table 就是 table_name）
const tableName = computed(() => route.params.table);
const tableLabel = ref('');
// 启动时从 registered_tables 查中文名
async function loadTableLabel() {
    try {
        const all = await adminTablesApi.list();
        const found = all.find((t) => t.table_name === tableName.value);
        tableLabel.value = found?.table_label ?? tableName.value;
    }
    catch {
        tableLabel.value = tableName.value;
    }
}
// 兼容旧 meta 用法
const meta = computed(() => tableName.value ? { code: tableName.value, label: tableLabel.value } : null);
const columns = ref([]);
const list = ref([]);
const total = ref(0);
const loading = ref(false);
const ds = ref(null);
const query = reactive({
    page: 1,
    page_size: 20,
    keyword: '',
});
// 值列表(enum)字段的筛选条件：{列编码: 选中值}
const filters = reactive({});
const enumFilterColumns = computed(() => columns.value.filter((c) => c.data_type === 'enum' && c.is_visible));
// ===== 行勾选 + 批量启用/停用 =====
const tableRef = ref();
const selectedRows = ref([]);
const statusCol = computed(() => columns.value.find((c) => c.code === '启用状态' && c.data_type === 'enum'));
function onSelectionChange(rows) {
    selectedRows.value = rows;
}
async function bulkSetStatus(val) {
    if (!meta.value || !statusCol.value || !selectedRows.value.length)
        return;
    const ids = selectedRows.value.map((r) => r._id);
    try {
        const res = await dataApi.bulkUpdate(meta.value.code, ids, {
            [statusCol.value.code]: val,
        });
        ElMessage.success(`已将 ${res.updated} 行设为「${val}」`);
        tableRef.value?.clearSelection?.();
        selectedRows.value = [];
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '批量操作失败');
    }
}
async function bulkDelete() {
    if (!meta.value || !selectedRows.value.length)
        return;
    const ids = selectedRows.value.map((r) => r._id);
    try {
        const res = await dataApi.bulkDelete(meta.value.code, ids);
        ElMessage.success(`已删除 ${res.deleted} 行`);
        tableRef.value?.clearSelection?.();
        selectedRows.value = [];
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function loadColumns() {
    if (!meta.value)
        return;
    try {
        columns.value = await dataApi.columns(meta.value.code);
    }
    catch {
        columns.value = [];
    }
}
async function loadDatasource() {
    if (!meta.value)
        return;
    try {
        const all = await datasourcesApi.list();
        ds.value = all.find((d) => d.table_name === meta.value.code) ?? null;
    }
    catch {
        ds.value = null;
    }
}
async function load() {
    if (!meta.value)
        return;
    loading.value = true;
    try {
        const params = { page: query.page, page_size: query.page_size };
        if (query.keyword)
            params.keyword = query.keyword;
        const activeFilters = {};
        for (const [k, v] of Object.entries(filters)) {
            if (v)
                activeFilters[k] = v;
        }
        if (Object.keys(activeFilters).length)
            params.filters = activeFilters;
        const resp = await dataApi.query(meta.value.code, params);
        list.value = resp.items;
        total.value = resp.total;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
async function triggerSync() {
    if (!ds.value) {
        ElMessage.warning('该表暂未配置数据源，请先到接口配置页配置');
        return;
    }
    try {
        ElMessage.info('正在拉取...');
        const res = await datasourcesApi.sync(ds.value.id);
        if (res.ok) {
            ElMessage.success(`同步成功：${res.message}`);
            await loadDatasource();
            await loadColumns();
            await load();
        }
        else {
            ElMessage.error(`同步失败：${res.message}`);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '触发失败');
    }
}
function formatCell(row, col) {
    const v = row[col.code];
    if (v === null || v === undefined || v === '')
        return '—';
    if (col.data_type === 'datetime' || col.data_type === 'date') {
        if (typeof v === 'string') {
            try {
                return formatDateTime(v);
            }
            catch {
                return v;
            }
        }
    }
    return String(v);
}
// ===== 手工字段内联编辑（auto_discovered=false 且非敏感）=====
const editingCell = ref(null);
const editValue = ref('');
function isEditable(col) {
    return !col.is_sensitive && !col.auto_discovered;
}
function isEditing(row, col) {
    return editingCell.value?.id === row._id && editingCell.value?.code === col.code;
}
function startEdit(row, col) {
    if (!isEditable(col))
        return;
    const v = row[col.code];
    editValue.value = v === null || v === undefined ? '' : String(v);
    editingCell.value = { id: row._id, code: col.code };
}
async function saveCell(row, col, val) {
    if (!meta.value)
        return;
    if (String(row[col.code] ?? '') === String(val ?? ''))
        return;
    try {
        await dataApi.updateRow(meta.value.code, row._id, { [col.code]: val });
        row[col.code] = val;
        ElMessage.success('已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
async function saveEdit(row, col) {
    if (!editingCell.value)
        return;
    const newVal = editValue.value;
    editingCell.value = null;
    await saveCell(row, col, newVal);
}
// ===== 新增行（手工维护表：无接口的表才显示）=====
const isManualTable = computed(() => ds.value === null);
// 可录入的列：手工字段（auto_discovered=false）且非计算字段
const editableColumns = computed(() => columns.value.filter((c) => !c.auto_discovered && !c.is_computed));
const createOpen = ref(false);
const createForm = reactive({});
const creating = ref(false);
function openCreate() {
    for (const k of Object.keys(createForm))
        delete createForm[k];
    for (const c of editableColumns.value) {
        createForm[c.code] = c.data_type === 'enum' ? (c.enum_options?.[0] ?? '') : '';
    }
    createOpen.value = true;
}
async function submitCreate() {
    if (!meta.value)
        return;
    creating.value = true;
    try {
        const values = {};
        for (const c of editableColumns.value) {
            const v = createForm[c.code];
            if (v !== '' && v !== null && v !== undefined)
                values[c.code] = v;
        }
        await dataApi.createRow(meta.value.code, values);
        ElMessage.success('已新增一行');
        createOpen.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '新增失败');
    }
    finally {
        creating.value = false;
    }
}
// 默认筛选：成本中心「启用状态」默认只看「启用」（可手动清空看全部）
function applyDefaultFilters() {
    const statusCol = columns.value.find((c) => c.code === '启用状态' && c.data_type === 'enum');
    if (statusCol && filters['启用状态'] === undefined) {
        filters['启用状态'] = '启用';
    }
}
watch(meta, async () => {
    query.page = 1;
    query.keyword = '';
    for (const k of Object.keys(filters))
        delete filters[k];
    list.value = [];
    await loadColumns();
    applyDefaultFilters();
    await loadDatasource();
    await load();
});
onMounted(async () => {
    await loadTableLabel();
    await loadColumns();
    applyDefaultFilters();
    await loadDatasource();
    await load();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
// CSS variable injection
// CSS variable injection end
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (__VLS_ctx.meta) {
    const __VLS_0 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_3.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.meta.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.meta.code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.field_columns",
            op: "U",
            size: "default",
        }));
        const __VLS_5 = __VLS_4({
            ...{ 'onClick': {} },
            menu: "system.field_columns",
            op: "U",
            size: "default",
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
        let __VLS_7;
        let __VLS_8;
        let __VLS_9;
        const __VLS_10 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.meta))
                    return;
                __VLS_ctx.$router.push(`/system/field-columns?table=${__VLS_ctx.meta.code}`);
            }
        };
        __VLS_6.slots.default;
        const __VLS_11 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
            ...{ style: {} },
        }));
        const __VLS_13 = __VLS_12({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
        __VLS_14.slots.default;
        const __VLS_15 = {}.Setting;
        /** @type {[typeof __VLS_components.Setting, ]} */ ;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
        const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
        var __VLS_14;
        var __VLS_6;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_19 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.users",
            op: "C",
            size: "default",
            loading: (__VLS_ctx.pushing),
        }));
        const __VLS_20 = __VLS_19({
            ...{ 'onClick': {} },
            menu: "system.users",
            op: "C",
            size: "default",
            loading: (__VLS_ctx.pushing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_19));
        let __VLS_22;
        let __VLS_23;
        let __VLS_24;
        const __VLS_25 = {
            onClick: (__VLS_ctx.triggerPush)
        };
        __VLS_21.slots.default;
        const __VLS_26 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({
            ...{ style: {} },
        }));
        const __VLS_28 = __VLS_27({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_27));
        __VLS_29.slots.default;
        const __VLS_30 = {}.Share;
        /** @type {[typeof __VLS_components.Share, ]} */ ;
        // @ts-ignore
        const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({}));
        const __VLS_32 = __VLS_31({}, ...__VLS_functionalComponentArgsRest(__VLS_31));
        var __VLS_29;
        var __VLS_21;
        if (__VLS_ctx.isManualTable) {
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_34 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "data.view",
                op: "C",
                size: "default",
                type: "primary",
            }));
            const __VLS_35 = __VLS_34({
                ...{ 'onClick': {} },
                menu: "data.view",
                op: "C",
                size: "default",
                type: "primary",
            }, ...__VLS_functionalComponentArgsRest(__VLS_34));
            let __VLS_37;
            let __VLS_38;
            let __VLS_39;
            const __VLS_40 = {
                onClick: (__VLS_ctx.openCreate)
            };
            __VLS_36.slots.default;
            const __VLS_41 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
                ...{ style: {} },
            }));
            const __VLS_43 = __VLS_42({
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_42));
            __VLS_44.slots.default;
            const __VLS_45 = {}.Plus;
            /** @type {[typeof __VLS_components.Plus, ]} */ ;
            // @ts-ignore
            const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({}));
            const __VLS_47 = __VLS_46({}, ...__VLS_functionalComponentArgsRest(__VLS_46));
            var __VLS_44;
            var __VLS_36;
        }
        if (!__VLS_ctx.isManualTable) {
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: "data.view",
                op: "U",
                size: "default",
            }));
            const __VLS_50 = __VLS_49({
                ...{ 'onClick': {} },
                menu: "data.view",
                op: "U",
                size: "default",
            }, ...__VLS_functionalComponentArgsRest(__VLS_49));
            let __VLS_52;
            let __VLS_53;
            let __VLS_54;
            const __VLS_55 = {
                onClick: (__VLS_ctx.triggerSync)
            };
            __VLS_51.slots.default;
            const __VLS_56 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
                ...{ style: {} },
            }));
            const __VLS_58 = __VLS_57({
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_57));
            __VLS_59.slots.default;
            const __VLS_60 = {}.Refresh;
            /** @type {[typeof __VLS_components.Refresh, ]} */ ;
            // @ts-ignore
            const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({}));
            const __VLS_62 = __VLS_61({}, ...__VLS_functionalComponentArgsRest(__VLS_61));
            var __VLS_59;
            var __VLS_51;
        }
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "data.view",
            op: "E",
            size: "default",
            type: "primary",
            loading: (__VLS_ctx.exporting),
        }));
        const __VLS_65 = __VLS_64({
            ...{ 'onClick': {} },
            menu: "data.view",
            op: "E",
            size: "default",
            type: "primary",
            loading: (__VLS_ctx.exporting),
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
        let __VLS_67;
        let __VLS_68;
        let __VLS_69;
        const __VLS_70 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.meta))
                    return;
                __VLS_ctx.exportCsv(__VLS_ctx.meta.code, __VLS_ctx.meta.label, { keyword: __VLS_ctx.query.keyword, filters: Object.fromEntries(Object.entries(__VLS_ctx.filters).filter(([, v]) => v)) });
            }
        };
        __VLS_66.slots.default;
        const __VLS_71 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
            ...{ style: {} },
        }));
        const __VLS_73 = __VLS_72({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_72));
        __VLS_74.slots.default;
        const __VLS_75 = {}.Download;
        /** @type {[typeof __VLS_components.Download, ]} */ ;
        // @ts-ignore
        const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({}));
        const __VLS_77 = __VLS_76({}, ...__VLS_functionalComponentArgsRest(__VLS_76));
        var __VLS_74;
        var __VLS_66;
    }
    const __VLS_79 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
        inline: true,
        ...{ style: {} },
    }));
    const __VLS_81 = __VLS_80({
        inline: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_80));
    __VLS_82.slots.default;
    const __VLS_83 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({}));
    const __VLS_85 = __VLS_84({}, ...__VLS_functionalComponentArgsRest(__VLS_84));
    __VLS_86.slots.default;
    const __VLS_87 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
        ...{ 'onKeyup': {} },
        ...{ 'onClear': {} },
        modelValue: (__VLS_ctx.query.keyword),
        placeholder: "跨字段模糊搜索",
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_89 = __VLS_88({
        ...{ 'onKeyup': {} },
        ...{ 'onClear': {} },
        modelValue: (__VLS_ctx.query.keyword),
        placeholder: "跨字段模糊搜索",
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_88));
    let __VLS_91;
    let __VLS_92;
    let __VLS_93;
    const __VLS_94 = {
        onKeyup: (() => { __VLS_ctx.query.page = 1; __VLS_ctx.load(); })
    };
    const __VLS_95 = {
        onClear: (() => { __VLS_ctx.query.page = 1; __VLS_ctx.load(); })
    };
    var __VLS_90;
    var __VLS_86;
    for (const [fc] of __VLS_getVForSourceType((__VLS_ctx.enumFilterColumns))) {
        const __VLS_96 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            key: (fc.code),
            label: (fc.label),
        }));
        const __VLS_98 = __VLS_97({
            key: (fc.code),
            label: (fc.label),
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
        __VLS_99.slots.default;
        const __VLS_100 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
            ...{ 'onChange': {} },
            ...{ 'onClear': {} },
            modelValue: (__VLS_ctx.filters[fc.code]),
            clearable: true,
            placeholder: "全部",
            ...{ style: {} },
        }));
        const __VLS_102 = __VLS_101({
            ...{ 'onChange': {} },
            ...{ 'onClear': {} },
            modelValue: (__VLS_ctx.filters[fc.code]),
            clearable: true,
            placeholder: "全部",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_101));
        let __VLS_104;
        let __VLS_105;
        let __VLS_106;
        const __VLS_107 = {
            onChange: (() => { __VLS_ctx.query.page = 1; __VLS_ctx.load(); })
        };
        const __VLS_108 = {
            onClear: (() => { __VLS_ctx.query.page = 1; __VLS_ctx.load(); })
        };
        __VLS_103.slots.default;
        for (const [opt] of __VLS_getVForSourceType(((fc.enum_options || [])))) {
            const __VLS_109 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
                key: (opt),
                label: (opt),
                value: (opt),
            }));
            const __VLS_111 = __VLS_110({
                key: (opt),
                label: (opt),
                value: (opt),
            }, ...__VLS_functionalComponentArgsRest(__VLS_110));
        }
        var __VLS_103;
        var __VLS_99;
    }
    const __VLS_113 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({}));
    const __VLS_115 = __VLS_114({}, ...__VLS_functionalComponentArgsRest(__VLS_114));
    __VLS_116.slots.default;
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
        onClick: (() => { __VLS_ctx.query.page = 1; __VLS_ctx.load(); })
    };
    __VLS_120.slots.default;
    var __VLS_120;
    var __VLS_116;
    var __VLS_82;
    /** @type {[typeof BulkActionBar, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(BulkActionBar, new BulkActionBar({
        ...{ 'onBulkStatus': {} },
        ...{ 'onBulkDelete': {} },
        ...{ 'onClear': {} },
        selectedRows: (__VLS_ctx.selectedRows),
        statusCol: (__VLS_ctx.statusCol),
        tableCode: (__VLS_ctx.meta.code),
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onBulkStatus': {} },
        ...{ 'onBulkDelete': {} },
        ...{ 'onClear': {} },
        selectedRows: (__VLS_ctx.selectedRows),
        statusCol: (__VLS_ctx.statusCol),
        tableCode: (__VLS_ctx.meta.code),
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onBulkStatus: (__VLS_ctx.bulkSetStatus)
    };
    const __VLS_132 = {
        onBulkDelete: (__VLS_ctx.bulkDelete)
    };
    const __VLS_133 = {
        onClear: (...[$event]) => {
            if (!(__VLS_ctx.meta))
                return;
            __VLS_ctx.tableRef?.clearSelection?.();
        }
    };
    var __VLS_127;
    const __VLS_134 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({
        ...{ 'onSelectionChange': {} },
        ref: "tableRef",
        data: (__VLS_ctx.list),
        stripe: true,
        border: true,
        ...{ style: {} },
        maxHeight: "600",
    }));
    const __VLS_136 = __VLS_135({
        ...{ 'onSelectionChange': {} },
        ref: "tableRef",
        data: (__VLS_ctx.list),
        stripe: true,
        border: true,
        ...{ style: {} },
        maxHeight: "600",
    }, ...__VLS_functionalComponentArgsRest(__VLS_135));
    let __VLS_138;
    let __VLS_139;
    let __VLS_140;
    const __VLS_141 = {
        onSelectionChange: (__VLS_ctx.onSelectionChange)
    };
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    /** @type {typeof __VLS_ctx.tableRef} */ ;
    var __VLS_142 = {};
    __VLS_137.slots.default;
    const __VLS_144 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        type: "selection",
        width: "48",
        selectable: (() => true),
    }));
    const __VLS_146 = __VLS_145({
        type: "selection",
        width: "48",
        selectable: (() => true),
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    for (const [col] of __VLS_getVForSourceType((__VLS_ctx.columns))) {
        const __VLS_148 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
            key: (col.code),
            label: (col.label),
            prop: (col.code),
            minWidth: "140",
        }));
        const __VLS_150 = __VLS_149({
            key: (col.code),
            label: (col.label),
            prop: (col.code),
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_149));
        __VLS_151.slots.default;
        {
            const { header: __VLS_thisSlot } = __VLS_151.slots;
            (col.label);
            if (col.is_pk_part) {
                const __VLS_152 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
                    size: "small",
                    type: "primary",
                    effect: "plain",
                    ...{ style: {} },
                }));
                const __VLS_154 = __VLS_153({
                    size: "small",
                    type: "primary",
                    effect: "plain",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_153));
                __VLS_155.slots.default;
                var __VLS_155;
            }
            if (col.is_sensitive) {
                const __VLS_156 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }));
                const __VLS_158 = __VLS_157({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_157));
                __VLS_159.slots.default;
                var __VLS_159;
            }
            if (__VLS_ctx.isEditable(col)) {
                const __VLS_160 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
                    size: "small",
                    type: "warning",
                    effect: "plain",
                    ...{ style: {} },
                }));
                const __VLS_162 = __VLS_161({
                    size: "small",
                    type: "warning",
                    effect: "plain",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_161));
                __VLS_163.slots.default;
                var __VLS_163;
            }
        }
        {
            const { default: __VLS_thisSlot } = __VLS_151.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            if (col.is_sensitive) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ style: {} },
                });
            }
            else if (__VLS_ctx.isEditable(col)) {
                if (col.data_type === 'enum') {
                    const __VLS_164 = {}.ElSelect;
                    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
                    // @ts-ignore
                    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                        ...{ 'onChange': {} },
                        modelValue: (row[col.code] ?? ''),
                        size: "small",
                        placeholder: "—",
                        ...{ style: {} },
                    }));
                    const __VLS_166 = __VLS_165({
                        ...{ 'onChange': {} },
                        modelValue: (row[col.code] ?? ''),
                        size: "small",
                        placeholder: "—",
                        ...{ style: {} },
                    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
                    let __VLS_168;
                    let __VLS_169;
                    let __VLS_170;
                    const __VLS_171 = {
                        onChange: ((v) => __VLS_ctx.saveCell(row, col, v))
                    };
                    __VLS_167.slots.default;
                    for (const [opt] of __VLS_getVForSourceType(((col.enum_options || [])))) {
                        const __VLS_172 = {}.ElOption;
                        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                        // @ts-ignore
                        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                            key: (opt),
                            label: (opt),
                            value: (opt),
                        }));
                        const __VLS_174 = __VLS_173({
                            key: (opt),
                            label: (opt),
                            value: (opt),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
                    }
                    var __VLS_167;
                }
                else {
                    if (__VLS_ctx.isEditing(row, col)) {
                        const __VLS_176 = {}.ElInput;
                        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                        // @ts-ignore
                        const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
                            ...{ 'onBlur': {} },
                            ...{ 'onKeyup': {} },
                            modelValue: (__VLS_ctx.editValue),
                            size: "small",
                            autofocus: true,
                        }));
                        const __VLS_178 = __VLS_177({
                            ...{ 'onBlur': {} },
                            ...{ 'onKeyup': {} },
                            modelValue: (__VLS_ctx.editValue),
                            size: "small",
                            autofocus: true,
                        }, ...__VLS_functionalComponentArgsRest(__VLS_177));
                        let __VLS_180;
                        let __VLS_181;
                        let __VLS_182;
                        const __VLS_183 = {
                            onBlur: (...[$event]) => {
                                if (!(__VLS_ctx.meta))
                                    return;
                                if (!!(col.is_sensitive))
                                    return;
                                if (!(__VLS_ctx.isEditable(col)))
                                    return;
                                if (!!(col.data_type === 'enum'))
                                    return;
                                if (!(__VLS_ctx.isEditing(row, col)))
                                    return;
                                __VLS_ctx.saveEdit(row, col);
                            }
                        };
                        const __VLS_184 = {
                            onKeyup: (...[$event]) => {
                                if (!(__VLS_ctx.meta))
                                    return;
                                if (!!(col.is_sensitive))
                                    return;
                                if (!(__VLS_ctx.isEditable(col)))
                                    return;
                                if (!!(col.data_type === 'enum'))
                                    return;
                                if (!(__VLS_ctx.isEditing(row, col)))
                                    return;
                                __VLS_ctx.saveEdit(row, col);
                            }
                        };
                        var __VLS_179;
                    }
                    else {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                            ...{ onClick: (...[$event]) => {
                                    if (!(__VLS_ctx.meta))
                                        return;
                                    if (!!(col.is_sensitive))
                                        return;
                                    if (!(__VLS_ctx.isEditable(col)))
                                        return;
                                    if (!!(col.data_type === 'enum'))
                                        return;
                                    if (!!(__VLS_ctx.isEditing(row, col)))
                                        return;
                                    __VLS_ctx.startEdit(row, col);
                                } },
                            ...{ class: "editable-cell" },
                            title: "点击编辑",
                        });
                        (__VLS_ctx.formatCell(row, col));
                    }
                }
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
                (__VLS_ctx.formatCell(row, col));
            }
        }
        var __VLS_151;
    }
    {
        const { empty: __VLS_thisSlot } = __VLS_137.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        if (__VLS_ctx.columns.length === 0) {
            if (__VLS_ctx.isManualTable) {
            }
            else {
            }
        }
        else {
            if (__VLS_ctx.isManualTable) {
            }
            else {
            }
        }
    }
    var __VLS_137;
    const __VLS_185 = {}.ElPagination;
    /** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        ...{ 'onCurrentChange': {} },
        ...{ 'onSizeChange': {} },
        ...{ style: {} },
        currentPage: (__VLS_ctx.query.page),
        pageSize: (__VLS_ctx.query.page_size),
        total: (__VLS_ctx.total),
        pageSizes: ([20, 50, 100, 200]),
        layout: "total, sizes, prev, pager, next, jumper",
    }));
    const __VLS_187 = __VLS_186({
        ...{ 'onCurrentChange': {} },
        ...{ 'onSizeChange': {} },
        ...{ style: {} },
        currentPage: (__VLS_ctx.query.page),
        pageSize: (__VLS_ctx.query.page_size),
        total: (__VLS_ctx.total),
        pageSizes: ([20, 50, 100, 200]),
        layout: "total, sizes, prev, pager, next, jumper",
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    let __VLS_189;
    let __VLS_190;
    let __VLS_191;
    const __VLS_192 = {
        onCurrentChange: (__VLS_ctx.load)
    };
    const __VLS_193 = {
        onSizeChange: (__VLS_ctx.load)
    };
    var __VLS_188;
    var __VLS_3;
}
else {
    const __VLS_194 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({}));
    const __VLS_196 = __VLS_195({}, ...__VLS_functionalComponentArgsRest(__VLS_195));
    __VLS_197.slots.default;
    const __VLS_198 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
        description: "未知的数据表路径",
    }));
    const __VLS_200 = __VLS_199({
        description: "未知的数据表路径",
    }, ...__VLS_functionalComponentArgsRest(__VLS_199));
    var __VLS_197;
}
const __VLS_202 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.createOpen),
    title: (`新增行 · ${__VLS_ctx.meta?.label ?? ''}`),
    width: "560px",
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.createOpen),
    title: (`新增行 · ${__VLS_ctx.meta?.label ?? ''}`),
    width: "560px",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
__VLS_205.slots.default;
if (__VLS_ctx.editableColumns.length) {
    const __VLS_206 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
        labelPosition: "top",
    }));
    const __VLS_208 = __VLS_207({
        labelPosition: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_207));
    __VLS_209.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.editableColumns))) {
        const __VLS_210 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
            key: (c.code),
            label: (c.label),
        }));
        const __VLS_212 = __VLS_211({
            key: (c.code),
            label: (c.label),
        }, ...__VLS_functionalComponentArgsRest(__VLS_211));
        __VLS_213.slots.default;
        if (c.data_type === 'enum') {
            const __VLS_214 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
                modelValue: (__VLS_ctx.createForm[c.code]),
                clearable: true,
                placeholder: "请选择",
                ...{ style: {} },
            }));
            const __VLS_216 = __VLS_215({
                modelValue: (__VLS_ctx.createForm[c.code]),
                clearable: true,
                placeholder: "请选择",
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_215));
            __VLS_217.slots.default;
            for (const [opt] of __VLS_getVForSourceType(((c.enum_options || [])))) {
                const __VLS_218 = {}.ElOption;
                /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
                // @ts-ignore
                const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
                    key: (opt),
                    label: (opt),
                    value: (opt),
                }));
                const __VLS_220 = __VLS_219({
                    key: (opt),
                    label: (opt),
                    value: (opt),
                }, ...__VLS_functionalComponentArgsRest(__VLS_219));
            }
            var __VLS_217;
        }
        else {
            const __VLS_222 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
                modelValue: (__VLS_ctx.createForm[c.code]),
                placeholder: (`输入${c.label}`),
            }));
            const __VLS_224 = __VLS_223({
                modelValue: (__VLS_ctx.createForm[c.code]),
                placeholder: (`输入${c.label}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_223));
        }
        var __VLS_213;
    }
    var __VLS_209;
}
else {
    const __VLS_226 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
        description: "该表还没有可录入的字段，请先到「字段管理」添加列",
    }));
    const __VLS_228 = __VLS_227({
        description: "该表还没有可录入的字段，请先到「字段管理」添加列",
    }, ...__VLS_functionalComponentArgsRest(__VLS_227));
}
{
    const { footer: __VLS_thisSlot } = __VLS_205.slots;
    const __VLS_230 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
        ...{ 'onClick': {} },
    }));
    const __VLS_232 = __VLS_231({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_231));
    let __VLS_234;
    let __VLS_235;
    let __VLS_236;
    const __VLS_237 = {
        onClick: (...[$event]) => {
            __VLS_ctx.createOpen = false;
        }
    };
    __VLS_233.slots.default;
    var __VLS_233;
    const __VLS_238 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.creating),
        disabled: (!__VLS_ctx.editableColumns.length),
    }));
    const __VLS_240 = __VLS_239({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.creating),
        disabled: (!__VLS_ctx.editableColumns.length),
    }, ...__VLS_functionalComponentArgsRest(__VLS_239));
    let __VLS_242;
    let __VLS_243;
    let __VLS_244;
    const __VLS_245 = {
        onClick: (__VLS_ctx.submitCreate)
    };
    __VLS_241.slots.default;
    var __VLS_241;
}
var __VLS_205;
/** @type {__VLS_StyleScopedClasses['editable-cell']} */ ;
// @ts-ignore
var __VLS_143 = __VLS_142;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            Download: Download,
            Setting: Setting,
            Plus: Plus,
            Share: Share,
            PermissionButton: PermissionButton,
            BulkActionBar: BulkActionBar,
            exporting: exporting,
            exportCsv: exportCsv,
            pushing: pushing,
            triggerPush: triggerPush,
            meta: meta,
            columns: columns,
            list: list,
            total: total,
            loading: loading,
            query: query,
            filters: filters,
            enumFilterColumns: enumFilterColumns,
            tableRef: tableRef,
            selectedRows: selectedRows,
            statusCol: statusCol,
            onSelectionChange: onSelectionChange,
            bulkSetStatus: bulkSetStatus,
            bulkDelete: bulkDelete,
            load: load,
            triggerSync: triggerSync,
            formatCell: formatCell,
            editValue: editValue,
            isEditable: isEditable,
            isEditing: isEditing,
            startEdit: startEdit,
            saveCell: saveCell,
            saveEdit: saveEdit,
            isManualTable: isManualTable,
            editableColumns: editableColumns,
            createOpen: createOpen,
            createForm: createForm,
            creating: creating,
            openCreate: openCreate,
            submitCreate: submitCreate,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
