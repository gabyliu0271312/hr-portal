/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Search } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { fieldCategoriesApi, } from '@/api/field_categories';
import { tableColumnsApi, } from '@/api/table_columns';
const list = ref([]);
const loading = ref(false);
const dialogOpen = ref(false);
const dialogMode = ref('create');
const editingId = ref(null);
const form = reactive({ name: '', description: '', is_sensitive: false });
const saving = ref(false);
const assignmentDrawer = ref(false);
const assignmentCat = ref(null);
const assignments = ref([]);
const assignSaving = ref(false);
const tables = ref([]);
const currentTable = ref('');
const tableColumns = ref([]);
const columnsLoading = ref(false);
const selectedColumns = ref([]);
const fieldKeyword = ref('');
const fieldSelectTableRef = ref();
const columnLabelCache = ref({});
// ===== 授权工具白名单 =====
const tools = ref([]);
const whitelistOpen = ref(false);
const whitelistCat = ref(null);
const whitelistKeys = ref([]);
const whitelistSaving = ref(false);
async function openWhitelist(cat) {
    whitelistCat.value = cat;
    try {
        const r = await fieldCategoriesApi.getWhitelist(cat.id);
        whitelistKeys.value = r.tool_keys;
    }
    catch {
        whitelistKeys.value = [];
    }
    whitelistOpen.value = true;
}
async function saveWhitelist() {
    if (!whitelistCat.value)
        return;
    whitelistSaving.value = true;
    try {
        await fieldCategoriesApi.setWhitelist(whitelistCat.value.id, whitelistKeys.value);
        ElMessage.success('已保存白名单');
        whitelistOpen.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        whitelistSaving.value = false;
    }
}
const DATA_TYPES = [
    { label: '字符串', value: 'string' },
    { label: '数字', value: 'number' },
    { label: '日期', value: 'date' },
    { label: '日期时间', value: 'datetime' },
    { label: '布尔', value: 'bool' },
    { label: '值列表', value: 'enum' },
];
const assignmentKey = (tableName, columnName) => `${tableName}.${columnName}`;
const assignedKeys = computed(() => new Set(assignments.value.map((a) => assignmentKey(a.table_name, a.column_name))));
const selectedAssignableCodes = computed(() => selectedColumns.value
    .filter((c) => !assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code)))
    .map((c) => c.column_code));
const filteredTableColumns = computed(() => {
    const keyword = fieldKeyword.value.trim().toLowerCase();
    return tableColumns.value.filter((c) => {
        if (assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code)))
            return false;
        if (!keyword)
            return true;
        return `${c.column_label} ${c.column_code}`.toLowerCase().includes(keyword);
    });
});
async function load() {
    loading.value = true;
    try {
        list.value = await fieldCategoriesApi.list();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
async function loadTables() {
    try {
        tables.value = await tableColumnsApi.tables();
        if (!currentTable.value && tables.value.length) {
            currentTable.value = tables.value[0].table_name;
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载业务表失败');
        tables.value = [];
    }
}
async function loadTableColumns() {
    if (!currentTable.value) {
        tableColumns.value = [];
        return;
    }
    columnsLoading.value = true;
    selectedColumns.value = [];
    try {
        tableColumns.value = await tableColumnsApi.list(currentTable.value);
        tableColumns.value.forEach((c) => {
            columnLabelCache.value[`${currentTable.value}.${c.column_code}`] = c.column_label;
        });
    }
    catch (e) {
        tableColumns.value = [];
        ElMessage.error(e?.response?.data?.detail || '加载字段失败');
    }
    finally {
        columnsLoading.value = false;
    }
}
function openCreate() {
    dialogMode.value = 'create';
    editingId.value = null;
    Object.assign(form, { name: '', description: '', is_sensitive: false });
    dialogOpen.value = true;
}
function openEdit(cat) {
    dialogMode.value = 'edit';
    editingId.value = cat.id;
    Object.assign(form, {
        name: cat.name,
        description: cat.description ?? '',
        is_sensitive: cat.is_sensitive,
    });
    dialogOpen.value = true;
}
async function saveCategory() {
    if (!form.name.trim()) {
        ElMessage.warning('分类名必填');
        return;
    }
    saving.value = true;
    try {
        const body = {
            name: form.name,
            description: form.description || undefined,
            is_sensitive: form.is_sensitive,
        };
        if (dialogMode.value === 'create') {
            await fieldCategoriesApi.create(body);
            ElMessage.success('分类已创建');
        }
        else if (editingId.value !== null) {
            await fieldCategoriesApi.update(editingId.value, body);
            ElMessage.success('分类已更新');
        }
        dialogOpen.value = false;
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function removeCat(cat) {
    try {
        await ElMessageBox.confirm(`删除分类 "${cat.name}"？`, '提示', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        await fieldCategoriesApi.remove(cat.id);
        ElMessage.success('已删除');
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function openAssignments(cat) {
    assignmentCat.value = cat;
    try {
        assignments.value = await fieldCategoriesApi.getAssignments(cat.id);
        assignmentDrawer.value = true;
        if (!tables.value.length) {
            await loadTables();
        }
        if (!currentTable.value && assignments.value[0]?.table_name) {
            currentTable.value = assignments.value[0].table_name;
        }
        if (!currentTable.value && tables.value[0]) {
            currentTable.value = tables.value[0].table_name;
        }
        // 预加载已分配字段所在的所有表，填充 columnLabelCache
        const assignedTables = [...new Set(assignments.value.map((a) => a.table_name))];
        await Promise.all(assignedTables
            .filter((t) => t !== currentTable.value)
            .map(async (t) => {
            try {
                const cols = await tableColumnsApi.list(t);
                cols.forEach((c) => {
                    columnLabelCache.value[`${t}.${c.column_code}`] = c.column_label;
                });
            }
            catch { }
        }));
        await loadTableColumns();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
}
function onColumnSelectionChange(rows) {
    selectedColumns.value = rows;
}
async function persistAssignments() {
    if (!assignmentCat.value)
        return;
    await fieldCategoriesApi.setAssignments(assignmentCat.value.id, assignments.value);
    load();
}
async function saveAssignments() {
    if (!assignmentCat.value)
        return;
    assignSaving.value = true;
    try {
        await persistAssignments();
        ElMessage.success('分配已保存');
        assignmentDrawer.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        assignSaving.value = false;
    }
}
async function addSelectedAssignments() {
    if (!currentTable.value) {
        ElMessage.warning('请先选择业务表');
        return;
    }
    const next = selectedColumns.value.filter((c) => !assignedKeys.value.has(assignmentKey(currentTable.value, c.column_code)));
    if (!next.length) {
        ElMessage.warning('请选择尚未加入分类的字段');
        return;
    }
    assignments.value.push(...next.map((c) => ({
        table_name: currentTable.value,
        column_name: c.column_code,
    })));
    selectedColumns.value = [];
    fieldSelectTableRef.value?.clearSelection();
    try {
        await persistAssignments();
        ElMessage.success(`已加入 ${next.length} 个字段`);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
async function removeAssignment(idx) {
    assignments.value.splice(idx, 1);
    try {
        await persistAssignments();
        ElMessage.success('已移除');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
}
const tableLabel = (val) => tables.value.find((t) => t.table_name === val)?.label ?? val;
const dataTypeLabel = (val) => DATA_TYPES.find((t) => t.value === val)?.label ?? val;
function columnLabel(a) {
    return columnLabelCache.value[`${a.table_name}.${a.column_name}`] ?? a.column_name;
}
onMounted(async () => {
    await Promise.all([load(), loadTables()]);
    await loadTableColumns();
    try {
        tools.value = await fieldCategoriesApi.tools();
    }
    catch {
        tools.value = [];
    }
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.list.length);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClick: (__VLS_ctx.openCreate)
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
    const __VLS_15 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
    const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
    var __VLS_14;
    var __VLS_6;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_19 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_21 = __VLS_20({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_22.slots.default;
const __VLS_23 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    label: "分类名",
    minWidth: "160",
}));
const __VLS_25 = __VLS_24({
    label: "分类名",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_26.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (row.name);
    if (row.is_sensitive) {
        const __VLS_27 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
            size: "small",
            type: "danger",
            effect: "plain",
            ...{ style: {} },
        }));
        const __VLS_29 = __VLS_28({
            size: "small",
            type: "danger",
            effect: "plain",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_28));
        __VLS_30.slots.default;
        var __VLS_30;
    }
}
var __VLS_26;
const __VLS_31 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    prop: "description",
    label: "描述",
    minWidth: "280",
}));
const __VLS_33 = __VLS_32({
    prop: "description",
    label: "描述",
    minWidth: "280",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
const __VLS_35 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    label: "字段数",
    width: "100",
}));
const __VLS_37 = __VLS_36({
    label: "字段数",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_38.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.field_count);
}
var __VLS_38;
const __VLS_39 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    label: "操作",
    width: "380",
    fixed: "right",
}));
const __VLS_41 = __VLS_40({
    label: "操作",
    width: "380",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_42.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_42.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_43 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "U",
        size: "small",
    }));
    const __VLS_44 = __VLS_43({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_43));
    let __VLS_46;
    let __VLS_47;
    let __VLS_48;
    const __VLS_49 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openAssignments(row);
        }
    };
    __VLS_45.slots.default;
    var __VLS_45;
    if (row.is_sensitive) {
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_50 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.field_categories",
            op: "U",
            size: "small",
            type: "primary",
        }));
        const __VLS_51 = __VLS_50({
            ...{ 'onClick': {} },
            menu: "system.field_categories",
            op: "U",
            size: "small",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_50));
        let __VLS_53;
        let __VLS_54;
        let __VLS_55;
        const __VLS_56 = {
            onClick: (...[$event]) => {
                if (!(row.is_sensitive))
                    return;
                __VLS_ctx.openWhitelist(row);
            }
        };
        __VLS_52.slots.default;
        var __VLS_52;
    }
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "U",
        size: "small",
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_59.slots.default;
    var __VLS_59;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_64 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "D",
        size: "small",
        type: "danger",
    }));
    const __VLS_65 = __VLS_64({
        ...{ 'onClick': {} },
        menu: "system.field_categories",
        op: "D",
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    let __VLS_67;
    let __VLS_68;
    let __VLS_69;
    const __VLS_70 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeCat(row);
        }
    };
    __VLS_66.slots.default;
    var __VLS_66;
}
var __VLS_42;
var __VLS_22;
var __VLS_3;
const __VLS_71 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建分类' : '编辑分类'),
    width: "480px",
}));
const __VLS_73 = __VLS_72({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.dialogMode === 'create' ? '新建分类' : '编辑分类'),
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
const __VLS_75 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    labelPosition: "top",
}));
const __VLS_77 = __VLS_76({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
__VLS_78.slots.default;
const __VLS_79 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    label: "分类名",
    required: true,
}));
const __VLS_81 = __VLS_80({
    label: "分类名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
const __VLS_83 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：敏感、薪酬、身份证",
}));
const __VLS_85 = __VLS_84({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：敏感、薪酬、身份证",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
var __VLS_82;
const __VLS_87 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
    label: "描述",
}));
const __VLS_89 = __VLS_88({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_88));
__VLS_90.slots.default;
const __VLS_91 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "该分类的用途说明",
}));
const __VLS_93 = __VLS_92({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    placeholder: "该分类的用途说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
var __VLS_90;
const __VLS_95 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({}));
const __VLS_97 = __VLS_96({}, ...__VLS_functionalComponentArgsRest(__VLS_96));
__VLS_98.slots.default;
const __VLS_99 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
    modelValue: (__VLS_ctx.form.is_sensitive),
}));
const __VLS_101 = __VLS_100({
    modelValue: (__VLS_ctx.form.is_sensitive),
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
var __VLS_102;
var __VLS_98;
var __VLS_78;
{
    const { footer: __VLS_thisSlot } = __VLS_74.slots;
    const __VLS_103 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        ...{ 'onClick': {} },
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogOpen = false;
        }
    };
    __VLS_106.slots.default;
    var __VLS_106;
    const __VLS_111 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_113 = __VLS_112({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_112));
    let __VLS_115;
    let __VLS_116;
    let __VLS_117;
    const __VLS_118 = {
        onClick: (__VLS_ctx.saveCategory)
    };
    __VLS_114.slots.default;
    (__VLS_ctx.dialogMode === 'create' ? '创建' : '保存');
    var __VLS_114;
}
var __VLS_74;
const __VLS_119 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({
    modelValue: (__VLS_ctx.assignmentDrawer),
    title: (`管理字段 · ${__VLS_ctx.assignmentCat?.name ?? ''}`),
    direction: "rtl",
    size: "540px",
}));
const __VLS_121 = __VLS_120({
    modelValue: (__VLS_ctx.assignmentDrawer),
    title: (`管理字段 · ${__VLS_ctx.assignmentCat?.name ?? ''}`),
    direction: "rtl",
    size: "540px",
}, ...__VLS_functionalComponentArgsRest(__VLS_120));
__VLS_122.slots.default;
const __VLS_123 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ class: "assignment-alert" },
}));
const __VLS_125 = __VLS_124({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ class: "assignment-alert" },
}, ...__VLS_functionalComponentArgsRest(__VLS_124));
__VLS_126.slots.default;
var __VLS_126;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "assignment-picker" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "assignment-toolbar" },
});
const __VLS_127 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.currentTable),
    filterable: true,
    placeholder: "选择业务表",
    ...{ class: "table-select" },
    disabled: (__VLS_ctx.columnsLoading),
}));
const __VLS_129 = __VLS_128({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.currentTable),
    filterable: true,
    placeholder: "选择业务表",
    ...{ class: "table-select" },
    disabled: (__VLS_ctx.columnsLoading),
}, ...__VLS_functionalComponentArgsRest(__VLS_128));
let __VLS_131;
let __VLS_132;
let __VLS_133;
const __VLS_134 = {
    onChange: (__VLS_ctx.loadTableColumns)
};
__VLS_130.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tables))) {
    const __VLS_135 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
        key: (t.table_name),
        label: (t.label),
        value: (t.table_name),
    }));
    const __VLS_137 = __VLS_136({
        key: (t.table_name),
        label: (t.label),
        value: (t.table_name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_136));
}
var __VLS_130;
const __VLS_139 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
    modelValue: (__VLS_ctx.fieldKeyword),
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
    placeholder: "搜索字段名称/编码",
    ...{ class: "field-search" },
}));
const __VLS_141 = __VLS_140({
    modelValue: (__VLS_ctx.fieldKeyword),
    clearable: true,
    prefixIcon: (__VLS_ctx.Search),
    placeholder: "搜索字段名称/编码",
    ...{ class: "field-search" },
}, ...__VLS_functionalComponentArgsRest(__VLS_140));
const __VLS_143 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
    ...{ 'onClick': {} },
    type: "primary",
    disabled: (!__VLS_ctx.selectedAssignableCodes.length),
}));
const __VLS_145 = __VLS_144({
    ...{ 'onClick': {} },
    type: "primary",
    disabled: (!__VLS_ctx.selectedAssignableCodes.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_144));
let __VLS_147;
let __VLS_148;
let __VLS_149;
const __VLS_150 = {
    onClick: (__VLS_ctx.addSelectedAssignments)
};
__VLS_146.slots.default;
const __VLS_151 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
    ...{ style: {} },
}));
const __VLS_153 = __VLS_152({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_152));
__VLS_154.slots.default;
const __VLS_155 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({}));
const __VLS_157 = __VLS_156({}, ...__VLS_functionalComponentArgsRest(__VLS_156));
var __VLS_154;
var __VLS_146;
const __VLS_159 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
    ...{ 'onSelectionChange': {} },
    ref: "fieldSelectTableRef",
    data: (__VLS_ctx.filteredTableColumns),
    rowKey: "column_code",
    height: "280",
    ...{ class: "field-select-table" },
}));
const __VLS_161 = __VLS_160({
    ...{ 'onSelectionChange': {} },
    ref: "fieldSelectTableRef",
    data: (__VLS_ctx.filteredTableColumns),
    rowKey: "column_code",
    height: "280",
    ...{ class: "field-select-table" },
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
let __VLS_163;
let __VLS_164;
let __VLS_165;
const __VLS_166 = {
    onSelectionChange: (__VLS_ctx.onColumnSelectionChange)
};
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.columnsLoading) }, null, null);
/** @type {typeof __VLS_ctx.fieldSelectTableRef} */ ;
var __VLS_167 = {};
__VLS_162.slots.default;
const __VLS_169 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    type: "selection",
    width: "42",
}));
const __VLS_171 = __VLS_170({
    type: "selection",
    width: "42",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
const __VLS_173 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
    label: "字段",
    minWidth: "220",
}));
const __VLS_175 = __VLS_174({
    label: "字段",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_174));
__VLS_176.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_176.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-name" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (row.column_label);
    if (row.is_sensitive) {
        const __VLS_177 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
            size: "small",
            type: "warning",
            effect: "plain",
        }));
        const __VLS_179 = __VLS_178({
            size: "small",
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_178));
        __VLS_180.slots.default;
        var __VLS_180;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "field-code" },
    });
    (row.column_code);
}
var __VLS_176;
const __VLS_181 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
    label: "类型",
    width: "90",
}));
const __VLS_183 = __VLS_182({
    label: "类型",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_182));
__VLS_184.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_184.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.dataTypeLabel(row.data_type));
}
var __VLS_184;
{
    const { empty: __VLS_thisSlot } = __VLS_162.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "assignment-empty" },
    });
    (__VLS_ctx.currentTable ? '当前表暂无可选字段' : '请先选择业务表');
}
var __VLS_162;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
(__VLS_ctx.assignments.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "assigned-list" },
});
for (const [a, i] of __VLS_getVForSourceType((__VLS_ctx.assignments))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (`${a.table_name}.${a.column_name}`),
        ...{ class: "assigned-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "assigned-table" },
    });
    (__VLS_ctx.tableLabel(a.table_name));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "assigned-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.columnLabel(a));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-code" },
    });
    (a.column_name);
    const __VLS_185 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "danger",
    }));
    const __VLS_187 = __VLS_186({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    let __VLS_189;
    let __VLS_190;
    let __VLS_191;
    const __VLS_192 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeAssignment(i);
        }
    };
    __VLS_188.slots.default;
    var __VLS_188;
}
if (!__VLS_ctx.assignments.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "assignment-empty" },
    });
}
{
    const { footer: __VLS_thisSlot } = __VLS_122.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_193 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
        ...{ 'onClick': {} },
    }));
    const __VLS_195 = __VLS_194({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
    let __VLS_197;
    let __VLS_198;
    let __VLS_199;
    const __VLS_200 = {
        onClick: (...[$event]) => {
            __VLS_ctx.assignmentDrawer = false;
        }
    };
    __VLS_196.slots.default;
    var __VLS_196;
    const __VLS_201 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.assignSaving),
    }));
    const __VLS_203 = __VLS_202({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.assignSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_202));
    let __VLS_205;
    let __VLS_206;
    let __VLS_207;
    const __VLS_208 = {
        onClick: (__VLS_ctx.saveAssignments)
    };
    __VLS_204.slots.default;
    var __VLS_204;
}
var __VLS_122;
const __VLS_209 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    modelValue: (__VLS_ctx.whitelistOpen),
    title: (`授权工具白名单 · ${__VLS_ctx.whitelistCat?.name ?? ''}`),
    width: "460px",
}));
const __VLS_211 = __VLS_210({
    modelValue: (__VLS_ctx.whitelistOpen),
    title: (`授权工具白名单 · ${__VLS_ctx.whitelistCat?.name ?? ''}`),
    width: "460px",
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
__VLS_212.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
const __VLS_213 = {}.ElCheckboxGroup;
/** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    modelValue: (__VLS_ctx.whitelistKeys),
}));
const __VLS_215 = __VLS_214({
    modelValue: (__VLS_ctx.whitelistKeys),
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
__VLS_216.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tools))) {
    const __VLS_217 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
        key: (t.key),
        value: (t.key),
        border: true,
        ...{ style: {} },
    }));
    const __VLS_219 = __VLS_218({
        key: (t.key),
        value: (t.key),
        border: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_218));
    __VLS_220.slots.default;
    (t.label);
    var __VLS_220;
}
var __VLS_216;
{
    const { footer: __VLS_thisSlot } = __VLS_212.slots;
    const __VLS_221 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
        ...{ 'onClick': {} },
    }));
    const __VLS_223 = __VLS_222({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_222));
    let __VLS_225;
    let __VLS_226;
    let __VLS_227;
    const __VLS_228 = {
        onClick: (...[$event]) => {
            __VLS_ctx.whitelistOpen = false;
        }
    };
    __VLS_224.slots.default;
    var __VLS_224;
    const __VLS_229 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.whitelistSaving),
    }));
    const __VLS_231 = __VLS_230({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.whitelistSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_230));
    let __VLS_233;
    let __VLS_234;
    let __VLS_235;
    const __VLS_236 = {
        onClick: (__VLS_ctx.saveWhitelist)
    };
    __VLS_232.slots.default;
    var __VLS_232;
}
var __VLS_212;
/** @type {__VLS_StyleScopedClasses['assignment-alert']} */ ;
/** @type {__VLS_StyleScopedClasses['assignment-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['assignment-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['table-select']} */ ;
/** @type {__VLS_StyleScopedClasses['field-search']} */ ;
/** @type {__VLS_StyleScopedClasses['field-select-table']} */ ;
/** @type {__VLS_StyleScopedClasses['field-name']} */ ;
/** @type {__VLS_StyleScopedClasses['field-code']} */ ;
/** @type {__VLS_StyleScopedClasses['assignment-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['assigned-list']} */ ;
/** @type {__VLS_StyleScopedClasses['assigned-row']} */ ;
/** @type {__VLS_StyleScopedClasses['assigned-table']} */ ;
/** @type {__VLS_StyleScopedClasses['assigned-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-code']} */ ;
/** @type {__VLS_StyleScopedClasses['assignment-empty']} */ ;
// @ts-ignore
var __VLS_168 = __VLS_167;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Search: Search,
            PermissionButton: PermissionButton,
            list: list,
            loading: loading,
            dialogOpen: dialogOpen,
            dialogMode: dialogMode,
            form: form,
            saving: saving,
            assignmentDrawer: assignmentDrawer,
            assignmentCat: assignmentCat,
            assignments: assignments,
            assignSaving: assignSaving,
            tables: tables,
            currentTable: currentTable,
            columnsLoading: columnsLoading,
            fieldKeyword: fieldKeyword,
            fieldSelectTableRef: fieldSelectTableRef,
            tools: tools,
            whitelistOpen: whitelistOpen,
            whitelistCat: whitelistCat,
            whitelistKeys: whitelistKeys,
            whitelistSaving: whitelistSaving,
            openWhitelist: openWhitelist,
            saveWhitelist: saveWhitelist,
            selectedAssignableCodes: selectedAssignableCodes,
            filteredTableColumns: filteredTableColumns,
            loadTableColumns: loadTableColumns,
            openCreate: openCreate,
            openEdit: openEdit,
            saveCategory: saveCategory,
            removeCat: removeCat,
            openAssignments: openAssignments,
            onColumnSelectionChange: onColumnSelectionChange,
            saveAssignments: saveAssignments,
            addSelectedAssignments: addSelectedAssignments,
            removeAssignment: removeAssignment,
            tableLabel: tableLabel,
            dataTypeLabel: dataTypeLabel,
            columnLabel: columnLabel,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
