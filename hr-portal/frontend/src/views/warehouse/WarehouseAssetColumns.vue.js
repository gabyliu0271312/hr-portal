/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, View, Connection, EditPen, Delete } from '@element-plus/icons-vue';
import Sortable from 'sortablejs';
import { listAssetColumns, impactField } from '@/api/warehouse';
import { tableColumnsApi } from '@/api/table_columns';
import { employeeProfileFieldsApi } from '@/api/employee_profile_fields';
import { useUserStore } from '@/stores/user';
import FieldLocalMaintenanceControl from '@/components/data/FieldLocalMaintenanceControl.vue';
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const tableName = route.params.table;
const columns = ref([]);
const loading = ref(false);
const error = ref(null);
const employeeProfileFields = ref([]);
const isEmployeeRoster = computed(() => tableName === 'emp_realtime_roster');
// 详情/编辑抽屉
const drawerVisible = ref(false);
const selectedColumn = ref(null);
const editMode = ref(false);
const isCreateMode = ref(false);
const newColumnCode = ref('');
const existingColumnCodes = computed(() => columns.value.map((c) => c.column_code));
const editForm = ref({
    column_label: '', agg_role: 'dimension',
    is_pk_part: false, is_sensitive: false, is_visible: true, copy_from_last_month: false,
    scope_role: '', display_order: 0, description: '',
    enum_options: [],
    enum_default: '',
    formula_expr: '',
    data_type: 'string',
});
const editSaving = ref(false);
// 影响分析
const impactVisible = ref(false);
const impactResult = ref(null);
const impactLoading = ref(false);
const DATA_TYPES = ['string', 'number', 'date', 'datetime', 'bool', 'enum'];
const DATA_TYPE_LABELS = { string: '字符串', number: '数字', date: '日期', datetime: '日期时间', bool: '布尔', enum: '值列表' };
const AGG_ROLES = [{ label: '维度', value: 'dimension' }, { label: '度量', value: 'measure' }];
const SCOPE_ROLES = [
    { label: '— 未设置 —', value: '' },
    { label: '成本中心编码', value: 'cc_code' },
    { label: '组织节点编码', value: 'org_node_code' },
    { label: '用工类型', value: 'employment_type' },
    { label: '用工主体', value: 'employment_entity' },
    { label: '人员', value: 'person' },
];
const AGG_LABELS = { dimension: '维度', measure: '度量' };
const refOptions = computed(() => columns.value.filter((c) => c.column_code !== selectedColumn.value?.column_code));
function insertRef(code) {
    editForm.value.formula_expr = (editForm.value.formula_expr || '') + `[${code}]`;
}
// ====== SortableJS 拖拽排序 ======
const tableRef = ref(null);
function initSortable() {
    if (!tableRef.value)
        return;
    const el = tableRef.value.$el?.querySelector?.('.el-table__body-wrapper tbody');
    if (!el)
        return;
    Sortable.create(el, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: async (evt) => {
            const { oldIndex, newIndex } = evt;
            if (oldIndex == null || newIndex == null || oldIndex === newIndex)
                return;
            const moved = columns.value.splice(oldIndex, 1)[0];
            columns.value.splice(newIndex, 0, moved);
            columns.value.forEach((c, i) => { c.display_order = (i + 1) * 10; });
            const payloads = columns.value.map(c => ({ id: c.id, display_order: c.display_order, column_code: c.column_code }));
            try {
                await tableColumnsApi.bulkUpdate(tableName, payloads);
            }
            catch {
                ElMessage.error('排序保存失败');
                load();
            }
        },
    });
}
async function load() {
    loading.value = true;
    error.value = null;
    try {
        const res = await listAssetColumns(tableName, { include_hidden: true });
        columns.value = res.columns.sort((a, b) => a.display_order - b.display_order);
        employeeProfileFields.value = isEmployeeRoster.value ? await employeeProfileFieldsApi.list() : [];
        await nextTick();
        initSortable();
    }
    catch (e) {
        error.value = e?.response?.data?.detail || '加载字段列表失败';
    }
    finally {
        loading.value = false;
    }
}
function employeeProfileField(columnCode) { return employeeProfileFields.value.find(field => field.column_name === columnCode); }
async function setEmployeeProfileQueryable(columnCode, isQueryable) {
    const field = employeeProfileField(columnCode);
    if (!field)
        return;
    const previous = field.is_queryable;
    field.is_queryable = isQueryable;
    try {
        employeeProfileFields.value = await employeeProfileFieldsApi.update(employeeProfileFields.value);
    }
    catch (cause) {
        field.is_queryable = previous;
        ElMessage.error(cause?.response?.data?.detail || '员工档案字段配置保存失败');
    }
}
function goBack() { router.back(); }
// ====== 新建字段 ======
function openCreate() {
    isCreateMode.value = true;
    selectedColumn.value = null;
    newColumnCode.value = '';
    editForm.value = {
        column_label: '', agg_role: 'dimension',
        is_pk_part: false, is_sensitive: false, is_visible: true, copy_from_last_month: false,
        scope_role: '',
        display_order: (columns.value[columns.value.length - 1]?.display_order ?? 0) + 10,
        description: '', enum_options: [], enum_default: '', formula_expr: '',
        data_type: 'string',
    };
    editMode.value = true;
    drawerVisible.value = true;
}
// ====== 编辑字段 ======
function enterEdit(col) {
    isCreateMode.value = false;
    selectedColumn.value = col;
    editForm.value = {
        column_label: col.column_label, agg_role: col.agg_role || 'dimension',
        is_pk_part: col.is_pk_part, is_sensitive: col.is_sensitive, is_visible: col.is_visible,
        copy_from_last_month: col.copy_from_last_month,
        scope_role: col.scope_role || '', display_order: col.display_order, description: col.description || '',
        enum_options: Array.isArray(col.enum_options) ? [...col.enum_options] : [],
        enum_default: col.enum_default || '',
        formula_expr: col.formula_expr || '',
        data_type: col.data_type || 'string',
    };
    editMode.value = true;
    drawerVisible.value = true;
}
function buildPayload() {
    const f = editForm.value;
    const p = {
        column_code: isCreateMode.value ? newColumnCode.value : selectedColumn.value.column_code,
        column_label: f.column_label,
        data_type: f.data_type || 'string',
        is_pk_part: f.is_pk_part, is_sensitive: f.is_sensitive,
        is_visible: f.is_visible, display_order: f.display_order,
        description: f.description || null, scope_role: f.scope_role || null,
        copy_from_last_month: f.copy_from_last_month, agg_role: f.agg_role,
        enum_options: f.data_type === 'enum' ? f.enum_options.map((value) => value.trim()).filter(Boolean) : null,
        enum_default: f.data_type === 'enum' && f.enum_default ? f.enum_default : null,
    };
    return p;
}
async function saveEdit() {
    if (!editForm.value.column_label.trim()) {
        ElMessage.warning('字段名称必填');
        return;
    }
    if (isCreateMode.value && !newColumnCode.value.trim()) {
        ElMessage.warning('字段编码必填');
        return;
    }
    editSaving.value = true;
    try {
        if (isCreateMode.value) {
            await tableColumnsApi.create(tableName, buildPayload());
            ElMessage.success('字段已创建');
        }
        else {
            const payload = buildPayload();
            const typeChanged = editForm.value.data_type !== selectedColumn.value?.data_type;
            if (typeChanged) {
                try {
                    await ElMessageBox.confirm(`字段「${editForm.value.column_label}」已有数据，确认将类型从「${DATA_TYPE_LABELS[selectedColumn.value?.data_type || ''] || selectedColumn.value?.data_type}」改为「${DATA_TYPE_LABELS[editForm.value.data_type] || editForm.value.data_type}」？已有数据将执行类型转换。`, '确认类型变更', { type: 'warning', confirmButtonText: '确认变更', cancelButtonText: '取消' });
                }
                catch {
                    editSaving.value = false;
                    return;
                }
                ;
                payload.confirm_type_change = true;
            }
            await tableColumnsApi.update(tableName, selectedColumn.value.id, payload);
            ElMessage.success('字段已更新');
        }
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
function cancelEdit() { editMode.value = false; isCreateMode.value = false; }
async function doDelete(col) {
    try {
        await ElMessageBox.confirm(`确定删除字段"${col.column_label}"(${col.column_code})？此操作不可恢复。`, '确认删除', { type: 'warning' });
    }
    catch {
        return;
    }
    try {
        await tableColumnsApi.remove(tableName, col.id);
        ElMessage.success('字段已删除');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
function showDetail(col) { selectedColumn.value = col; editMode.value = false; drawerVisible.value = true; }
async function showImpact(col) {
    impactVisible.value = true;
    impactLoading.value = true;
    try {
        impactResult.value = await impactField(tableName, col.column_code);
    }
    catch {
        ElMessage.error('影响分析查询失败');
    }
    finally {
        impactLoading.value = false;
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    text: true,
    icon: (__VLS_ctx.ArrowLeft),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    text: true,
    icon: (__VLS_ctx.ArrowLeft),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.goBack)
};
__VLS_3.slots.default;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
(__VLS_ctx.tableName);
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'C')) {
    const __VLS_8 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClick': {} },
        type: "primary",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_11.slots.default;
    var __VLS_11;
}
if (__VLS_ctx.error) {
    const __VLS_16 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }));
    const __VLS_18 = __VLS_17({
        type: "error",
        title: (__VLS_ctx.error),
        showIcon: true,
        closable: (false),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
}
const __VLS_20 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    shadow: "never",
}));
const __VLS_22 = __VLS_21({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
const __VLS_24 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    ref: "tableRef",
    data: (__VLS_ctx.columns),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无字段定义",
    rowKey: "id",
    maxHeight: "calc(100vh - 260px)",
}));
const __VLS_26 = __VLS_25({
    ref: "tableRef",
    data: (__VLS_ctx.columns),
    border: true,
    stripe: true,
    size: "small",
    emptyText: "暂无字段定义",
    rowKey: "id",
    maxHeight: "calc(100vh - 260px)",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
/** @type {typeof __VLS_ctx.tableRef} */ ;
var __VLS_28 = {};
__VLS_27.slots.default;
const __VLS_30 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_31 = __VLS_asFunctionalComponent(__VLS_30, new __VLS_30({
    width: "36",
    align: "center",
    fixed: "left",
}));
const __VLS_32 = __VLS_31({
    width: "36",
    align: "center",
    fixed: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_31));
__VLS_33.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_33.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "drag-handle" },
        ...{ style: {} },
    });
}
var __VLS_33;
const __VLS_34 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
    label: "序号",
    width: "50",
    align: "center",
}));
const __VLS_36 = __VLS_35({
    label: "序号",
    width: "50",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
__VLS_37.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_37.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.display_order);
}
var __VLS_37;
const __VLS_38 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_39 = __VLS_asFunctionalComponent(__VLS_38, new __VLS_38({
    label: "字段",
    minWidth: "200",
}));
const __VLS_40 = __VLS_39({
    label: "字段",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_39));
__VLS_41.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_41.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (row.column_label);
    if (row.is_computed) {
        const __VLS_42 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent(__VLS_42, new __VLS_42({
            size: "small",
            type: "success",
        }));
        const __VLS_44 = __VLS_43({
            size: "small",
            type: "success",
        }, ...__VLS_functionalComponentArgsRest(__VLS_43));
        __VLS_45.slots.default;
        var __VLS_45;
    }
    if (row.is_pk_part) {
        const __VLS_46 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_47 = __VLS_asFunctionalComponent(__VLS_46, new __VLS_46({
            size: "small",
            type: "danger",
            effect: "plain",
        }));
        const __VLS_48 = __VLS_47({
            size: "small",
            type: "danger",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_47));
        __VLS_49.slots.default;
        var __VLS_49;
    }
    if (row.is_sensitive) {
        const __VLS_50 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_51 = __VLS_asFunctionalComponent(__VLS_50, new __VLS_50({
            size: "small",
            type: "warning",
            effect: "plain",
        }));
        const __VLS_52 = __VLS_51({
            size: "small",
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_51));
        __VLS_53.slots.default;
        var __VLS_53;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (row.column_code);
}
var __VLS_41;
const __VLS_54 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent(__VLS_54, new __VLS_54({
    label: "类型",
    width: "80",
    align: "center",
}));
const __VLS_56 = __VLS_55({
    label: "类型",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
__VLS_57.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_57.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.DATA_TYPE_LABELS[row.data_type] || row.data_type);
}
var __VLS_57;
const __VLS_58 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_59 = __VLS_asFunctionalComponent(__VLS_58, new __VLS_58({
    label: "维护方式",
    width: "175",
}));
const __VLS_60 = __VLS_59({
    label: "维护方式",
    width: "175",
}, ...__VLS_functionalComponentArgsRest(__VLS_59));
__VLS_61.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_61.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof FieldLocalMaintenanceControl, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(FieldLocalMaintenanceControl, new FieldLocalMaintenanceControl({
        ...{ 'onUpdated': {} },
        tableName: (__VLS_ctx.tableName),
        column: (row),
        canManage: (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')),
    }));
    const __VLS_63 = __VLS_62({
        ...{ 'onUpdated': {} },
        tableName: (__VLS_ctx.tableName),
        column: (row),
        canManage: (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')),
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    let __VLS_65;
    let __VLS_66;
    let __VLS_67;
    const __VLS_68 = {
        onUpdated: (__VLS_ctx.load)
    };
    var __VLS_64;
}
var __VLS_61;
const __VLS_69 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    label: "业务定义",
    minWidth: "220",
}));
const __VLS_71 = __VLS_70({
    label: "业务定义",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
__VLS_72.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_72.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.description || '—');
}
var __VLS_72;
const __VLS_73 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
    label: "维度/度量",
    width: "80",
    align: "center",
}));
const __VLS_75 = __VLS_74({
    label: "维度/度量",
    width: "80",
    align: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_74));
__VLS_76.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_76.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_77 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
        size: "small",
        type: (row.agg_role === 'measure' ? 'success' : 'info'),
        effect: "plain",
    }));
    const __VLS_79 = __VLS_78({
        size: "small",
        type: (row.agg_role === 'measure' ? 'success' : 'info'),
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    __VLS_80.slots.default;
    (__VLS_ctx.AGG_LABELS[row.agg_role] || row.agg_role);
    var __VLS_80;
}
var __VLS_76;
const __VLS_81 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
    label: "属性",
    minWidth: "140",
}));
const __VLS_83 = __VLS_82({
    label: "属性",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
__VLS_84.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_84.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (!row.is_visible) {
        const __VLS_85 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
            size: "small",
            type: "info",
            effect: "plain",
        }));
        const __VLS_87 = __VLS_86({
            size: "small",
            type: "info",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_86));
        __VLS_88.slots.default;
        var __VLS_88;
    }
    if (row.data_type === 'enum') {
        const __VLS_89 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
            size: "small",
        }));
        const __VLS_91 = __VLS_90({
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_90));
        __VLS_92.slots.default;
        (row.enum_options?.length || 0);
        var __VLS_92;
    }
    if (row.scope_role) {
        const __VLS_93 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
            size: "small",
            type: "primary",
            effect: "plain",
        }));
        const __VLS_95 = __VLS_94({
            size: "small",
            type: "primary",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_94));
        __VLS_96.slots.default;
        (__VLS_ctx.SCOPE_ROLES.find(r => r.value === row.scope_role)?.label || row.scope_role);
        var __VLS_96;
    }
}
var __VLS_84;
if (__VLS_ctx.isEmployeeRoster) {
    const __VLS_97 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        label: "员工档案可查询",
        width: "150",
    }));
    const __VLS_99 = __VLS_98({
        label: "员工档案可查询",
        width: "150",
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
    __VLS_100.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_100.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_101 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.employeeProfileField(row.column_code)?.is_queryable || false),
            disabled: (!__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')),
            inlinePrompt: true,
            activeText: "开",
            inactiveText: "关",
        }));
        const __VLS_103 = __VLS_102({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.employeeProfileField(row.column_code)?.is_queryable || false),
            disabled: (!__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')),
            inlinePrompt: true,
            activeText: "开",
            inactiveText: "关",
        }, ...__VLS_functionalComponentArgsRest(__VLS_102));
        let __VLS_105;
        let __VLS_106;
        let __VLS_107;
        const __VLS_108 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.isEmployeeRoster))
                    return;
                __VLS_ctx.setEmployeeProfileQueryable(row.column_code, $event);
            }
        };
        var __VLS_104;
    }
    var __VLS_100;
}
const __VLS_109 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
    label: "操作",
    width: "180",
    fixed: "right",
}));
const __VLS_111 = __VLS_110({
    label: "操作",
    width: "180",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_110));
__VLS_112.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_112.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_113 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.View),
    }));
    const __VLS_115 = __VLS_114({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.View),
    }, ...__VLS_functionalComponentArgsRest(__VLS_114));
    let __VLS_117;
    let __VLS_118;
    let __VLS_119;
    const __VLS_120 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showDetail(row);
        }
    };
    __VLS_116.slots.default;
    var __VLS_116;
    if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')) {
        const __VLS_121 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.EditPen),
        }));
        const __VLS_123 = __VLS_122({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            icon: (__VLS_ctx.EditPen),
        }, ...__VLS_functionalComponentArgsRest(__VLS_122));
        let __VLS_125;
        let __VLS_126;
        let __VLS_127;
        const __VLS_128 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.assets', 'U')))
                    return;
                __VLS_ctx.enterEdit(row);
            }
        };
        __VLS_124.slots.default;
        var __VLS_124;
    }
    if (__VLS_ctx.userStore.hasOp('warehouse.assets', 'D')) {
        const __VLS_129 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }));
        const __VLS_131 = __VLS_130({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "danger",
            icon: (__VLS_ctx.Delete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_130));
        let __VLS_133;
        let __VLS_134;
        let __VLS_135;
        const __VLS_136 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.userStore.hasOp('warehouse.assets', 'D')))
                    return;
                __VLS_ctx.doDelete(row);
            }
        };
        __VLS_132.slots.default;
        var __VLS_132;
    }
    const __VLS_137 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Connection),
    }));
    const __VLS_139 = __VLS_138({
        ...{ 'onClick': {} },
        text: true,
        size: "small",
        icon: (__VLS_ctx.Connection),
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
    let __VLS_141;
    let __VLS_142;
    let __VLS_143;
    const __VLS_144 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showImpact(row);
        }
    };
    __VLS_140.slots.default;
    var __VLS_140;
}
var __VLS_112;
var __VLS_27;
var __VLS_23;
const __VLS_145 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.isCreateMode ? '新建字段' : __VLS_ctx.editMode ? '编辑字段' : '字段详情'),
    size: "520px",
}));
const __VLS_147 = __VLS_146({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.drawerVisible),
    title: (__VLS_ctx.isCreateMode ? '新建字段' : __VLS_ctx.editMode ? '编辑字段' : '字段详情'),
    size: "520px",
}, ...__VLS_functionalComponentArgsRest(__VLS_146));
let __VLS_149;
let __VLS_150;
let __VLS_151;
const __VLS_152 = {
    onClose: (...[$event]) => {
        __VLS_ctx.selectedColumn = null;
        __VLS_ctx.editMode = false;
        __VLS_ctx.isCreateMode = false;
    }
};
__VLS_148.slots.default;
if (__VLS_ctx.editMode) {
    const __VLS_153 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        labelPosition: "top",
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_155 = __VLS_154({
        labelPosition: "top",
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    __VLS_156.slots.default;
    const __VLS_157 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        label: "字段名称",
        required: true,
    }));
    const __VLS_159 = __VLS_158({
        label: "字段名称",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    __VLS_160.slots.default;
    const __VLS_161 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        modelValue: (__VLS_ctx.editForm.column_label),
        placeholder: "展示给用户看的中文名",
    }));
    const __VLS_163 = __VLS_162({
        modelValue: (__VLS_ctx.editForm.column_label),
        placeholder: "展示给用户看的中文名",
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
    var __VLS_160;
    if (__VLS_ctx.isCreateMode) {
        const __VLS_165 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
            label: "字段编码",
            required: true,
        }));
        const __VLS_167 = __VLS_166({
            label: "字段编码",
            required: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_166));
        __VLS_168.slots.default;
        const __VLS_169 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
            modelValue: (__VLS_ctx.newColumnCode),
            placeholder: "英文字母+数字+下划线，如 calc_bonus",
        }));
        const __VLS_171 = __VLS_170({
            modelValue: (__VLS_ctx.newColumnCode),
            placeholder: "英文字母+数字+下划线，如 calc_bonus",
        }, ...__VLS_functionalComponentArgsRest(__VLS_170));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_168;
    }
    else {
        const __VLS_173 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
            label: "字段编码",
        }));
        const __VLS_175 = __VLS_174({
            label: "字段编码",
        }, ...__VLS_functionalComponentArgsRest(__VLS_174));
        __VLS_176.slots.default;
        const __VLS_177 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            modelValue: (__VLS_ctx.selectedColumn?.column_code),
            disabled: true,
        }));
        const __VLS_179 = __VLS_178({
            modelValue: (__VLS_ctx.selectedColumn?.column_code),
            disabled: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_176;
    }
    const __VLS_181 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
        label: "数据类型",
    }));
    const __VLS_183 = __VLS_182({
        label: "数据类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    __VLS_184.slots.default;
    const __VLS_185 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        modelValue: (__VLS_ctx.editForm.data_type),
        ...{ style: {} },
    }));
    const __VLS_187 = __VLS_186({
        modelValue: (__VLS_ctx.editForm.data_type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    __VLS_188.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.DATA_TYPES))) {
        const __VLS_189 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
            key: (t),
            label: (__VLS_ctx.DATA_TYPE_LABELS[t] || t),
            value: (t),
        }));
        const __VLS_191 = __VLS_190({
            key: (t),
            label: (__VLS_ctx.DATA_TYPE_LABELS[t] || t),
            value: (t),
        }, ...__VLS_functionalComponentArgsRest(__VLS_190));
    }
    var __VLS_188;
    if (!__VLS_ctx.isCreateMode && __VLS_ctx.editForm.data_type !== __VLS_ctx.selectedColumn?.data_type) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
    var __VLS_184;
    const __VLS_193 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
        label: "维度/度量",
    }));
    const __VLS_195 = __VLS_194({
        label: "维度/度量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
    __VLS_196.slots.default;
    const __VLS_197 = {}.ElRadioGroup;
    /** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
    // @ts-ignore
    const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
        modelValue: (__VLS_ctx.editForm.agg_role),
    }));
    const __VLS_199 = __VLS_198({
        modelValue: (__VLS_ctx.editForm.agg_role),
    }, ...__VLS_functionalComponentArgsRest(__VLS_198));
    __VLS_200.slots.default;
    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.AGG_ROLES))) {
        const __VLS_201 = {}.ElRadioButton;
        /** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
        // @ts-ignore
        const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
            key: (r.value),
            value: (r.value),
        }));
        const __VLS_203 = __VLS_202({
            key: (r.value),
            value: (r.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_202));
        __VLS_204.slots.default;
        (r.label);
        var __VLS_204;
    }
    var __VLS_200;
    var __VLS_196;
    if (__VLS_ctx.editForm.data_type === 'enum') {
        const __VLS_205 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
            label: "值列表",
        }));
        const __VLS_207 = __VLS_206({
            label: "值列表",
        }, ...__VLS_functionalComponentArgsRest(__VLS_206));
        __VLS_208.slots.default;
        const __VLS_209 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
            modelValue: (__VLS_ctx.editForm.enum_options),
            multiple: true,
            filterable: true,
            allowCreate: true,
            defaultFirstOption: true,
            ...{ style: {} },
            placeholder: "输入值后回车",
        }));
        const __VLS_211 = __VLS_210({
            modelValue: (__VLS_ctx.editForm.enum_options),
            multiple: true,
            filterable: true,
            allowCreate: true,
            defaultFirstOption: true,
            ...{ style: {} },
            placeholder: "输入值后回车",
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        __VLS_212.slots.default;
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.editForm.enum_options))) {
            const __VLS_213 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
                key: (option),
                label: (option),
                value: (option),
            }));
            const __VLS_215 = __VLS_214({
                key: (option),
                label: (option),
                value: (option),
            }, ...__VLS_functionalComponentArgsRest(__VLS_214));
        }
        var __VLS_212;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        var __VLS_208;
    }
    if (__VLS_ctx.editForm.data_type === 'enum') {
        const __VLS_217 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
            label: "默认值",
        }));
        const __VLS_219 = __VLS_218({
            label: "默认值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_218));
        __VLS_220.slots.default;
        const __VLS_221 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
            modelValue: (__VLS_ctx.editForm.enum_default),
            clearable: true,
            ...{ style: {} },
            placeholder: "选择新增行默认值",
        }));
        const __VLS_223 = __VLS_222({
            modelValue: (__VLS_ctx.editForm.enum_default),
            clearable: true,
            ...{ style: {} },
            placeholder: "选择新增行默认值",
        }, ...__VLS_functionalComponentArgsRest(__VLS_222));
        __VLS_224.slots.default;
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.editForm.enum_options))) {
            const __VLS_225 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
                key: (option),
                label: (option),
                value: (option),
            }));
            const __VLS_227 = __VLS_226({
                key: (option),
                label: (option),
                value: (option),
            }, ...__VLS_functionalComponentArgsRest(__VLS_226));
        }
        var __VLS_224;
        var __VLS_220;
    }
    const __VLS_229 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
        label: "字段属性",
    }));
    const __VLS_231 = __VLS_230({
        label: "字段属性",
    }, ...__VLS_functionalComponentArgsRest(__VLS_230));
    __VLS_232.slots.default;
    const __VLS_233 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
        modelValue: (__VLS_ctx.editForm.is_pk_part),
    }));
    const __VLS_235 = __VLS_234({
        modelValue: (__VLS_ctx.editForm.is_pk_part),
    }, ...__VLS_functionalComponentArgsRest(__VLS_234));
    __VLS_236.slots.default;
    var __VLS_236;
    const __VLS_237 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
        modelValue: (__VLS_ctx.editForm.is_sensitive),
    }));
    const __VLS_239 = __VLS_238({
        modelValue: (__VLS_ctx.editForm.is_sensitive),
    }, ...__VLS_functionalComponentArgsRest(__VLS_238));
    __VLS_240.slots.default;
    var __VLS_240;
    const __VLS_241 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
        modelValue: (__VLS_ctx.editForm.is_visible),
    }));
    const __VLS_243 = __VLS_242({
        modelValue: (__VLS_ctx.editForm.is_visible),
    }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    __VLS_244.slots.default;
    var __VLS_244;
    const __VLS_245 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
        modelValue: (__VLS_ctx.editForm.copy_from_last_month),
    }));
    const __VLS_247 = __VLS_246({
        modelValue: (__VLS_ctx.editForm.copy_from_last_month),
    }, ...__VLS_functionalComponentArgsRest(__VLS_246));
    __VLS_248.slots.default;
    var __VLS_248;
    var __VLS_232;
    const __VLS_249 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
        label: "权限角色",
    }));
    const __VLS_251 = __VLS_250({
        label: "权限角色",
    }, ...__VLS_functionalComponentArgsRest(__VLS_250));
    __VLS_252.slots.default;
    const __VLS_253 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({
        modelValue: (__VLS_ctx.editForm.scope_role),
        clearable: true,
        ...{ style: {} },
        placeholder: "不参与权限过滤",
    }));
    const __VLS_255 = __VLS_254({
        modelValue: (__VLS_ctx.editForm.scope_role),
        clearable: true,
        ...{ style: {} },
        placeholder: "不参与权限过滤",
    }, ...__VLS_functionalComponentArgsRest(__VLS_254));
    __VLS_256.slots.default;
    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.SCOPE_ROLES.filter(x => x.value)))) {
        const __VLS_257 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
            key: (r.value),
            label: (r.label),
            value: (r.value),
        }));
        const __VLS_259 = __VLS_258({
            key: (r.value),
            label: (r.label),
            value: (r.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_258));
    }
    var __VLS_256;
    var __VLS_252;
    const __VLS_261 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_262 = __VLS_asFunctionalComponent(__VLS_261, new __VLS_261({
        label: "显示顺序",
    }));
    const __VLS_263 = __VLS_262({
        label: "显示顺序",
    }, ...__VLS_functionalComponentArgsRest(__VLS_262));
    __VLS_264.slots.default;
    const __VLS_265 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
        modelValue: (__VLS_ctx.editForm.display_order),
        min: (0),
        max: (9999),
        controlsPosition: "right",
    }));
    const __VLS_267 = __VLS_266({
        modelValue: (__VLS_ctx.editForm.display_order),
        min: (0),
        max: (9999),
        controlsPosition: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_266));
    var __VLS_264;
    const __VLS_269 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({
        label: "业务定义",
    }));
    const __VLS_271 = __VLS_270({
        label: "业务定义",
    }, ...__VLS_functionalComponentArgsRest(__VLS_270));
    __VLS_272.slots.default;
    const __VLS_273 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_274 = __VLS_asFunctionalComponent(__VLS_273, new __VLS_273({
        modelValue: (__VLS_ctx.editForm.description),
        type: "textarea",
        rows: (2),
    }));
    const __VLS_275 = __VLS_274({
        modelValue: (__VLS_ctx.editForm.description),
        type: "textarea",
        rows: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_274));
    var __VLS_272;
    var __VLS_156;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_277 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_278 = __VLS_asFunctionalComponent(__VLS_277, new __VLS_277({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSaving),
    }));
    const __VLS_279 = __VLS_278({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.editSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_278));
    let __VLS_281;
    let __VLS_282;
    let __VLS_283;
    const __VLS_284 = {
        onClick: (__VLS_ctx.saveEdit)
    };
    __VLS_280.slots.default;
    (__VLS_ctx.isCreateMode ? '创建' : '保存');
    var __VLS_280;
    const __VLS_285 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
        ...{ 'onClick': {} },
    }));
    const __VLS_287 = __VLS_286({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_286));
    let __VLS_289;
    let __VLS_290;
    let __VLS_291;
    const __VLS_292 = {
        onClick: (__VLS_ctx.cancelEdit)
    };
    __VLS_288.slots.default;
    var __VLS_288;
}
else if (__VLS_ctx.selectedColumn) {
    const __VLS_293 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_294 = __VLS_asFunctionalComponent(__VLS_293, new __VLS_293({
        header: "基础信息",
        shadow: "never",
        ...{ style: {} },
    }));
    const __VLS_295 = __VLS_294({
        header: "基础信息",
        shadow: "never",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_294));
    __VLS_296.slots.default;
    const __VLS_297 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_298 = __VLS_asFunctionalComponent(__VLS_297, new __VLS_297({
        column: (1),
        size: "small",
        border: true,
    }));
    const __VLS_299 = __VLS_298({
        column: (1),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_298));
    __VLS_300.slots.default;
    const __VLS_301 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_302 = __VLS_asFunctionalComponent(__VLS_301, new __VLS_301({
        label: "字段编码",
    }));
    const __VLS_303 = __VLS_302({
        label: "字段编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_302));
    __VLS_304.slots.default;
    (__VLS_ctx.selectedColumn.column_code);
    var __VLS_304;
    const __VLS_305 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({
        label: "字段名称",
    }));
    const __VLS_307 = __VLS_306({
        label: "字段名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_306));
    __VLS_308.slots.default;
    (__VLS_ctx.selectedColumn.column_label);
    var __VLS_308;
    const __VLS_309 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_310 = __VLS_asFunctionalComponent(__VLS_309, new __VLS_309({
        label: "数据类型",
    }));
    const __VLS_311 = __VLS_310({
        label: "数据类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_310));
    __VLS_312.slots.default;
    (__VLS_ctx.DATA_TYPE_LABELS[__VLS_ctx.selectedColumn.data_type] || __VLS_ctx.selectedColumn.data_type);
    var __VLS_312;
    const __VLS_313 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_314 = __VLS_asFunctionalComponent(__VLS_313, new __VLS_313({
        label: "描述",
    }));
    const __VLS_315 = __VLS_314({
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_314));
    __VLS_316.slots.default;
    (__VLS_ctx.selectedColumn.description || '—');
    var __VLS_316;
    const __VLS_317 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_318 = __VLS_asFunctionalComponent(__VLS_317, new __VLS_317({
        label: "可见",
    }));
    const __VLS_319 = __VLS_318({
        label: "可见",
    }, ...__VLS_functionalComponentArgsRest(__VLS_318));
    __VLS_320.slots.default;
    (__VLS_ctx.selectedColumn.is_visible ? '是' : '否');
    var __VLS_320;
    const __VLS_321 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_322 = __VLS_asFunctionalComponent(__VLS_321, new __VLS_321({
        label: "展示顺序",
    }));
    const __VLS_323 = __VLS_322({
        label: "展示顺序",
    }, ...__VLS_functionalComponentArgsRest(__VLS_322));
    __VLS_324.slots.default;
    (__VLS_ctx.selectedColumn.display_order);
    var __VLS_324;
    var __VLS_300;
    var __VLS_296;
    const __VLS_325 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_326 = __VLS_asFunctionalComponent(__VLS_325, new __VLS_325({
        header: "数仓属性",
        shadow: "never",
        ...{ style: {} },
    }));
    const __VLS_327 = __VLS_326({
        header: "数仓属性",
        shadow: "never",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_326));
    __VLS_328.slots.default;
    const __VLS_329 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_330 = __VLS_asFunctionalComponent(__VLS_329, new __VLS_329({
        column: (1),
        size: "small",
        border: true,
    }));
    const __VLS_331 = __VLS_330({
        column: (1),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_330));
    __VLS_332.slots.default;
    const __VLS_333 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_334 = __VLS_asFunctionalComponent(__VLS_333, new __VLS_333({
        label: "维度/度量",
    }));
    const __VLS_335 = __VLS_334({
        label: "维度/度量",
    }, ...__VLS_functionalComponentArgsRest(__VLS_334));
    __VLS_336.slots.default;
    (__VLS_ctx.AGG_LABELS[__VLS_ctx.selectedColumn.agg_role] || __VLS_ctx.selectedColumn.agg_role);
    var __VLS_336;
    const __VLS_337 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_338 = __VLS_asFunctionalComponent(__VLS_337, new __VLS_337({
        label: "来源",
    }));
    const __VLS_339 = __VLS_338({
        label: "来源",
    }, ...__VLS_functionalComponentArgsRest(__VLS_338));
    __VLS_340.slots.default;
    (__VLS_ctx.selectedColumn.source);
    var __VLS_340;
    const __VLS_341 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({
        label: "计算字段",
    }));
    const __VLS_343 = __VLS_342({
        label: "计算字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_342));
    __VLS_344.slots.default;
    (__VLS_ctx.selectedColumn.is_computed ? '是' : '否');
    var __VLS_344;
    const __VLS_345 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_346 = __VLS_asFunctionalComponent(__VLS_345, new __VLS_345({
        label: "计算公式",
    }));
    const __VLS_347 = __VLS_346({
        label: "计算公式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_346));
    __VLS_348.slots.default;
    (__VLS_ctx.selectedColumn.formula_expr || '—');
    var __VLS_348;
    var __VLS_332;
    var __VLS_328;
    const __VLS_349 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_350 = __VLS_asFunctionalComponent(__VLS_349, new __VLS_349({
        header: "权限属性",
        shadow: "never",
    }));
    const __VLS_351 = __VLS_350({
        header: "权限属性",
        shadow: "never",
    }, ...__VLS_functionalComponentArgsRest(__VLS_350));
    __VLS_352.slots.default;
    const __VLS_353 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_354 = __VLS_asFunctionalComponent(__VLS_353, new __VLS_353({
        column: (1),
        size: "small",
        border: true,
    }));
    const __VLS_355 = __VLS_354({
        column: (1),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_354));
    __VLS_356.slots.default;
    const __VLS_357 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_358 = __VLS_asFunctionalComponent(__VLS_357, new __VLS_357({
        label: "敏感字段",
    }));
    const __VLS_359 = __VLS_358({
        label: "敏感字段",
    }, ...__VLS_functionalComponentArgsRest(__VLS_358));
    __VLS_360.slots.default;
    (__VLS_ctx.selectedColumn.is_sensitive ? '是' : '否');
    var __VLS_360;
    var __VLS_356;
    var __VLS_352;
}
var __VLS_148;
const __VLS_361 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_362 = __VLS_asFunctionalComponent(__VLS_361, new __VLS_361({
    modelValue: (__VLS_ctx.impactVisible),
    title: "影响分析",
    width: "600px",
}));
const __VLS_363 = __VLS_362({
    modelValue: (__VLS_ctx.impactVisible),
    title: "影响分析",
    width: "600px",
}, ...__VLS_functionalComponentArgsRest(__VLS_362));
__VLS_364.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.impactLoading) }, null, null);
if (__VLS_ctx.impactResult) {
    if (__VLS_ctx.impactResult.blocking) {
        const __VLS_365 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_366 = __VLS_asFunctionalComponent(__VLS_365, new __VLS_365({
            type: "danger",
            title: "存在高风险引用",
            description: ('该字段被引用且不可直接修改/删除'),
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_367 = __VLS_366({
            type: "danger",
            title: "存在高风险引用",
            description: ('该字段被引用且不可直接修改/删除'),
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_366));
    }
    else {
        const __VLS_369 = {}.ElAlert;
        /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
        // @ts-ignore
        const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
            type: "success",
            title: "无阻塞引用",
            showIcon: true,
            ...{ style: {} },
        }));
        const __VLS_371 = __VLS_370({
            type: "success",
            title: "无阻塞引用",
            showIcon: true,
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    }
    if (__VLS_ctx.impactResult.references.length) {
        const __VLS_373 = {}.ElTable;
        /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
        // @ts-ignore
        const __VLS_374 = __VLS_asFunctionalComponent(__VLS_373, new __VLS_373({
            data: (__VLS_ctx.impactResult.references),
            size: "small",
            border: true,
        }));
        const __VLS_375 = __VLS_374({
            data: (__VLS_ctx.impactResult.references),
            size: "small",
            border: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_374));
        __VLS_376.slots.default;
        const __VLS_377 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
            prop: "type",
            label: "类型",
            width: "80",
        }));
        const __VLS_379 = __VLS_378({
            prop: "type",
            label: "类型",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_378));
        const __VLS_381 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_382 = __VLS_asFunctionalComponent(__VLS_381, new __VLS_381({
            prop: "name",
            label: "名称",
            minWidth: "140",
        }));
        const __VLS_383 = __VLS_382({
            prop: "name",
            label: "名称",
            minWidth: "140",
        }, ...__VLS_functionalComponentArgsRest(__VLS_382));
        const __VLS_385 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
            prop: "usage",
            label: "用途",
            minWidth: "100",
        }));
        const __VLS_387 = __VLS_386({
            prop: "usage",
            label: "用途",
            minWidth: "100",
        }, ...__VLS_functionalComponentArgsRest(__VLS_386));
        const __VLS_389 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_390 = __VLS_asFunctionalComponent(__VLS_389, new __VLS_389({
            prop: "risk_level",
            label: "风险",
            width: "80",
        }));
        const __VLS_391 = __VLS_390({
            prop: "risk_level",
            label: "风险",
            width: "80",
        }, ...__VLS_functionalComponentArgsRest(__VLS_390));
        __VLS_392.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_392.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            const __VLS_393 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_394 = __VLS_asFunctionalComponent(__VLS_393, new __VLS_393({
                size: "small",
                type: ({ low: 'success', medium: 'warning', high: 'danger' }[row.risk_level] || 'info'),
            }));
            const __VLS_395 = __VLS_394({
                size: "small",
                type: ({ low: 'success', medium: 'warning', high: 'danger' }[row.risk_level] || 'info'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_394));
            __VLS_396.slots.default;
            (row.risk_level);
            var __VLS_396;
        }
        var __VLS_392;
        const __VLS_397 = {}.ElTableColumn;
        /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
        // @ts-ignore
        const __VLS_398 = __VLS_asFunctionalComponent(__VLS_397, new __VLS_397({
            prop: "blocking",
            label: "阻塞",
            width: "70",
        }));
        const __VLS_399 = __VLS_398({
            prop: "blocking",
            label: "阻塞",
            width: "70",
        }, ...__VLS_functionalComponentArgsRest(__VLS_398));
        __VLS_400.slots.default;
        {
            const { default: __VLS_thisSlot } = __VLS_400.slots;
            const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
            (row.blocking ? '是' : '否');
        }
        var __VLS_400;
        var __VLS_376;
    }
    else {
        const __VLS_401 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_402 = __VLS_asFunctionalComponent(__VLS_401, new __VLS_401({
            description: "无引用记录",
            imageSize: (80),
        }));
        const __VLS_403 = __VLS_402({
            description: "无引用记录",
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_402));
    }
}
var __VLS_364;
/** @type {__VLS_StyleScopedClasses['drag-handle']} */ ;
// @ts-ignore
var __VLS_29 = __VLS_28;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            View: View,
            Connection: Connection,
            EditPen: EditPen,
            Delete: Delete,
            FieldLocalMaintenanceControl: FieldLocalMaintenanceControl,
            userStore: userStore,
            tableName: tableName,
            columns: columns,
            loading: loading,
            error: error,
            isEmployeeRoster: isEmployeeRoster,
            drawerVisible: drawerVisible,
            selectedColumn: selectedColumn,
            editMode: editMode,
            isCreateMode: isCreateMode,
            newColumnCode: newColumnCode,
            editForm: editForm,
            editSaving: editSaving,
            impactVisible: impactVisible,
            impactResult: impactResult,
            impactLoading: impactLoading,
            DATA_TYPES: DATA_TYPES,
            DATA_TYPE_LABELS: DATA_TYPE_LABELS,
            AGG_ROLES: AGG_ROLES,
            SCOPE_ROLES: SCOPE_ROLES,
            AGG_LABELS: AGG_LABELS,
            tableRef: tableRef,
            load: load,
            employeeProfileField: employeeProfileField,
            setEmployeeProfileQueryable: setEmployeeProfileQueryable,
            goBack: goBack,
            openCreate: openCreate,
            enterEdit: enterEdit,
            saveEdit: saveEdit,
            cancelEdit: cancelEdit,
            doDelete: doDelete,
            showDetail: showDetail,
            showImpact: showImpact,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
