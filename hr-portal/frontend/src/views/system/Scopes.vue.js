/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, Close } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import HierarchyTreePicker from '@/components/HierarchyTreePicker.vue';
import { scopesApi, } from '@/api/scopes';
import { treesApi, distinctApi } from '@/api/data';
const list = ref([]);
const loading = ref(false);
const DIM_OPTS = [
    { value: '', label: '全部' },
    { value: 'cost_center', label: '成本中心' },
    { value: 'org', label: '组织' },
];
const filterDim = ref('');
const FIELD_OPTS = [
    { value: 'employment_type', label: '用工类型' },
    { value: 'employment_entity', label: '用工主体' },
    { value: 'person', label: '人员' },
];
const OP_OPTS = [
    { value: 'eq', label: '等于' },
    { value: 'neq', label: '不等于' },
];
const drawerOpen = ref(false);
const editing = ref(null);
const saving = ref(false);
const form = reactive({
    name: '',
    description: '',
    dimension: 'cost_center',
    org_scope_enabled: true,
    org_scope_unlimited: false,
    selections: [],
    person_scope_enabled: false,
    filters: [],
});
const cc_tree = ref([]);
const org_tree = ref([]);
const include_inactive = ref(false);
const employmentTypes = ref([]);
const employmentEntities = ref([]);
const personOptionsByRow = ref({});
const personLoadingByRow = ref({});
const filteredList = computed(() => {
    if (!filterDim.value)
        return list.value;
    return list.value.filter((s) => s.dimension === filterDim.value);
});
const currentTree = computed(() => form.dimension === 'cost_center' ? cc_tree.value : org_tree.value);
async function loadList() {
    loading.value = true;
    try {
        list.value = await scopesApi.list();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
async function loadTrees() {
    try {
        cc_tree.value = await treesApi.costCenter(include_inactive.value);
        org_tree.value = await treesApi.org(include_inactive.value);
    }
    catch {
        cc_tree.value = [];
        org_tree.value = [];
    }
}
async function loadEnums() {
    try {
        employmentTypes.value = await distinctApi.employmentTypes(include_inactive.value);
        employmentEntities.value = await distinctApi.employmentEntities(include_inactive.value);
    }
    catch {
        employmentTypes.value = [];
        employmentEntities.value = [];
    }
}
watch(include_inactive, async () => {
    await Promise.all([loadTrees(), loadEnums()]);
});
function resetForm() {
    Object.assign(form, {
        name: '',
        description: '',
        dimension: 'cost_center',
        org_scope_enabled: true,
        org_scope_unlimited: false,
        selections: [],
        person_scope_enabled: false,
        filters: [],
    });
    personOptionsByRow.value = {};
    personLoadingByRow.value = {};
    editing.value = null;
}
function openCreate() {
    resetForm();
    drawerOpen.value = true;
}
function openEdit(row) {
    editing.value = row;
    form.name = row.name;
    form.description = row.description ?? '';
    form.dimension = row.dimension;
    form.org_scope_enabled = row.org_scope_enabled;
    form.org_scope_unlimited = row.org_scope_unlimited;
    form.selections = row.selections.map((s) => ({
        node_id: s.node_id,
        include_descendants: s.include_descendants,
    }));
    form.person_scope_enabled = row.person_scope_enabled;
    form.filters = row.filters.map((f) => ({
        field_code: f.field_code,
        operator: f.operator,
        values: [...f.values],
    }));
    // 编辑模式：把已选 person 值预填到 options，避免回显成空
    personOptionsByRow.value = {};
    form.filters.forEach((f, idx) => {
        if (f.field_code === 'person' && f.values.length) {
            personOptionsByRow.value[idx] = f.values.map((v) => ({
                value: v,
                label: v,
                department: null,
                active: true,
            }));
        }
    });
    drawerOpen.value = true;
}
function dimLabel(s) {
    return s.dimension === 'cost_center' ? '成本中心' : '组织';
}
function summary(s) {
    const parts = [];
    if (s.org_scope_enabled) {
        if (s.org_scope_unlimited)
            parts.push('组织不限');
        else
            parts.push(`组织 ${s.selections.length} 节点`);
    }
    if (s.person_scope_enabled) {
        parts.push(`人员 ${s.filters.length} 条筛选`);
    }
    return parts.join(' / ') || '—';
}
function fieldLabel(f) {
    return FIELD_OPTS.find((x) => x.value === f)?.label || f;
}
function addFilter() {
    form.filters.push({ field_code: 'employment_type', operator: 'eq', values: [] });
}
function removeFilter(idx) {
    form.filters.splice(idx, 1);
    // 重排 personOptionsByRow / personLoadingByRow 的 key
    const rebuiltOpts = {};
    const rebuiltLoading = {};
    form.filters.forEach((_, i) => {
        if (personOptionsByRow.value[i])
            rebuiltOpts[i] = personOptionsByRow.value[i];
        if (personLoadingByRow.value[i])
            rebuiltLoading[i] = personLoadingByRow.value[i];
    });
    personOptionsByRow.value = rebuiltOpts;
    personLoadingByRow.value = rebuiltLoading;
}
function onFieldChange(idx) {
    // 切换字段后清空已选值，避免脏数据
    form.filters[idx].values = [];
    if (form.filters[idx].field_code === 'person') {
        personOptionsByRow.value[idx] = [];
    }
}
function valueOptionsFor(idx) {
    const f = form.filters[idx];
    if (f.field_code === 'employment_type') {
        return employmentTypes.value.map((d) => ({
            value: d.value,
            label: `${d.value} (在职 ${d.active_count})`,
        }));
    }
    if (f.field_code === 'employment_entity') {
        return employmentEntities.value.map((d) => ({
            value: d.value,
            label: `${d.value} (在职 ${d.active_count})`,
        }));
    }
    // person：来自远程搜索
    return (personOptionsByRow.value[idx] || []).map((p) => ({
        value: p.value,
        label: p.value + (p.department ? `（${p.department}）` : '') + (p.active ? '' : ' [离职]'),
    }));
}
async function remoteSearchPerson(idx, keyword) {
    personLoadingByRow.value[idx] = true;
    try {
        const list = await distinctApi.persons({
            keyword,
            include_inactive: include_inactive.value,
            limit: 50,
        });
        // 保留已选项，避免下拉里看不到自己选的（如果搜索结果不含）
        const selected = new Set(form.filters[idx].values);
        const seen = new Set(list.map((p) => p.value));
        const merged = [...list];
        selected.forEach((v) => {
            if (!seen.has(v))
                merged.push({ value: v, label: v, department: null, active: true });
        });
        personOptionsByRow.value[idx] = merged;
    }
    catch {
        personOptionsByRow.value[idx] = [];
    }
    finally {
        personLoadingByRow.value[idx] = false;
    }
}
async function onPersonFocus(idx) {
    if (form.filters[idx].field_code !== 'person')
        return;
    if (!personOptionsByRow.value[idx] || personOptionsByRow.value[idx].length === 0) {
        await remoteSearchPerson(idx, '');
    }
}
const filterPreview = computed(() => {
    if (!form.person_scope_enabled || !form.filters.length)
        return '';
    return form.filters
        .map((f) => {
        const op = f.operator === 'eq' ? '∈' : '∉';
        const vals = f.values.length ? `(${f.values.join(', ')})` : '(未选)';
        return `${fieldLabel(f.field_code)} ${op} ${vals}`;
    })
        .join('  AND  ');
});
function buildPayload() {
    return {
        name: form.name.trim(),
        description: form.description.trim() || null,
        dimension: form.dimension,
        org_scope_enabled: form.org_scope_enabled,
        org_scope_unlimited: form.org_scope_unlimited,
        selections: form.org_scope_enabled && !form.org_scope_unlimited
            ? form.selections.map((s) => ({
                node_id: s.node_id,
                include_descendants: s.include_descendants,
            }))
            : [],
        person_scope_enabled: form.person_scope_enabled,
        filters: form.person_scope_enabled
            ? form.filters.map((f, i) => ({
                field_code: f.field_code,
                operator: f.operator,
                values: f.values,
                order_index: i,
            }))
            : [],
    };
}
function validate() {
    if (!form.name.trim())
        return '请填写名称';
    if (!form.org_scope_enabled && !form.person_scope_enabled)
        return '至少启用「管理组织范围」或「管理人员范围」之一';
    if (form.org_scope_enabled &&
        !form.org_scope_unlimited &&
        form.selections.length === 0)
        return '请勾选组织节点，或选择「不限范围」';
    if (form.person_scope_enabled) {
        if (form.filters.length === 0)
            return '请至少添加 1 条人员筛选条件';
        for (let i = 0; i < form.filters.length; i++) {
            if (form.filters[i].values.length === 0)
                return `第 ${i + 1} 条筛选条件未选值`;
        }
    }
    return null;
}
async function save() {
    const err = validate();
    if (err) {
        ElMessage.warning(err);
        return;
    }
    saving.value = true;
    try {
        const payload = buildPayload();
        if (editing.value) {
            await scopesApi.update(editing.value.id, payload);
            ElMessage.success('已保存');
        }
        else {
            await scopesApi.create(payload);
            ElMessage.success('已创建');
        }
        drawerOpen.value = false;
        await loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function handleDelete(row) {
    try {
        await ElMessageBox.confirm(`确认删除标签「${row.name}」？`, '删除确认', { type: 'warning' });
    }
    catch {
        return;
    }
    try {
        await scopesApi.remove(row.id);
        ElMessage.success('已删除');
        await loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function onDimensionChange() {
    if (form.selections.length > 0) {
        try {
            await ElMessageBox.confirm('切换维度会清空已勾选的节点，确认继续？', '提示', { type: 'warning' });
        }
        catch {
            // 回滚
            form.dimension = form.dimension === 'cost_center' ? 'org' : 'cost_center';
            return;
        }
        form.selections = [];
    }
}
onMounted(async () => {
    await loadList();
    await Promise.all([loadTrees(), loadEnums()]);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
    (__VLS_ctx.filteredList.length);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.scopes",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "system.scopes",
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
const __VLS_19 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_21 = __VLS_20({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_22.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
var __VLS_22;
const __VLS_23 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    inline: true,
    ...{ style: {} },
}));
const __VLS_25 = __VLS_24({
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    label: "维度",
}));
const __VLS_29 = __VLS_28({
    label: "维度",
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
const __VLS_31 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    modelValue: (__VLS_ctx.filterDim),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_33 = __VLS_32({
    modelValue: (__VLS_ctx.filterDim),
    placeholder: "全部",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
for (const [d] of __VLS_getVForSourceType((__VLS_ctx.DIM_OPTS))) {
    const __VLS_35 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        key: (d.value),
        label: (d.label),
        value: (d.value),
    }));
    const __VLS_37 = __VLS_36({
        key: (d.value),
        label: (d.label),
        value: (d.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
}
var __VLS_34;
var __VLS_30;
var __VLS_26;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_39 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    data: (__VLS_ctx.filteredList),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_41 = __VLS_40({
    data: (__VLS_ctx.filteredList),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_42.slots.default;
const __VLS_43 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    label: "标签名",
    minWidth: "200",
}));
const __VLS_45 = __VLS_44({
    label: "标签名",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
__VLS_46.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_46.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    (row.name);
    if (row.description) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (row.description);
    }
}
var __VLS_46;
const __VLS_47 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    label: "组织维度",
    width: "120",
}));
const __VLS_49 = __VLS_48({
    label: "组织维度",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_50.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_51 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        size: "small",
        effect: "plain",
    }));
    const __VLS_53 = __VLS_52({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    __VLS_54.slots.default;
    (__VLS_ctx.dimLabel(row));
    var __VLS_54;
}
var __VLS_50;
const __VLS_55 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    label: "范围概要",
    minWidth: "240",
}));
const __VLS_57 = __VLS_56({
    label: "范围概要",
    minWidth: "240",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_58.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.summary(row));
}
var __VLS_58;
const __VLS_59 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    label: "使用用户",
    width: "100",
}));
const __VLS_61 = __VLS_60({
    label: "使用用户",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_62.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.used_by_users);
}
var __VLS_62;
const __VLS_63 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    label: "操作",
    width: "200",
    fixed: "right",
}));
const __VLS_65 = __VLS_64({
    label: "操作",
    width: "200",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_66.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_66.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_67 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.scopes",
        op: "U",
        size: "small",
    }));
    const __VLS_68 = __VLS_67({
        ...{ 'onClick': {} },
        menu: "system.scopes",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_67));
    let __VLS_70;
    let __VLS_71;
    let __VLS_72;
    const __VLS_73 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
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
    const __VLS_78 = {}.Edit;
    /** @type {[typeof __VLS_components.Edit, ]} */ ;
    // @ts-ignore
    const __VLS_79 = __VLS_asFunctionalComponent(__VLS_78, new __VLS_78({}));
    const __VLS_80 = __VLS_79({}, ...__VLS_functionalComponentArgsRest(__VLS_79));
    var __VLS_77;
    var __VLS_69;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.scopes",
        op: "D",
        size: "small",
        type: "danger",
    }));
    const __VLS_83 = __VLS_82({
        ...{ 'onClick': {} },
        menu: "system.scopes",
        op: "D",
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    let __VLS_85;
    let __VLS_86;
    let __VLS_87;
    const __VLS_88 = {
        onClick: (...[$event]) => {
            __VLS_ctx.handleDelete(row);
        }
    };
    __VLS_84.slots.default;
    const __VLS_89 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        ...{ style: {} },
    }));
    const __VLS_91 = __VLS_90({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    __VLS_92.slots.default;
    const __VLS_93 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({}));
    const __VLS_95 = __VLS_94({}, ...__VLS_functionalComponentArgsRest(__VLS_94));
    var __VLS_92;
    var __VLS_84;
}
var __VLS_66;
var __VLS_42;
var __VLS_3;
const __VLS_97 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.editing ? `编辑标签 · ${__VLS_ctx.editing.name}` : '新建标签'),
    direction: "rtl",
    size: "720px",
}));
const __VLS_99 = __VLS_98({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.editing ? `编辑标签 · ${__VLS_ctx.editing.name}` : '新建标签'),
    direction: "rtl",
    size: "720px",
}, ...__VLS_functionalComponentArgsRest(__VLS_98));
__VLS_100.slots.default;
const __VLS_101 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
    labelPosition: "top",
}));
const __VLS_103 = __VLS_102({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_102));
__VLS_104.slots.default;
const __VLS_105 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
    label: "标签名",
    required: true,
}));
const __VLS_107 = __VLS_106({
    label: "标签名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_106));
__VLS_108.slots.default;
const __VLS_109 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "64",
    placeholder: "如：研发部正式员工",
}));
const __VLS_111 = __VLS_110({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "64",
    placeholder: "如：研发部正式员工",
}, ...__VLS_functionalComponentArgsRest(__VLS_110));
var __VLS_108;
const __VLS_113 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({
    label: "描述",
}));
const __VLS_115 = __VLS_114({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_114));
__VLS_116.slots.default;
const __VLS_117 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    maxlength: "500",
}));
const __VLS_119 = __VLS_118({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    maxlength: "500",
}, ...__VLS_functionalComponentArgsRest(__VLS_118));
var __VLS_116;
const __VLS_121 = {}.ElCheckbox;
/** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
// @ts-ignore
const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({
    modelValue: (__VLS_ctx.include_inactive),
    ...{ style: {} },
}));
const __VLS_123 = __VLS_122({
    modelValue: (__VLS_ctx.include_inactive),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_122));
__VLS_124.slots.default;
var __VLS_124;
const __VLS_125 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
    shadow: "never",
    ...{ style: {} },
}));
const __VLS_127 = __VLS_126({
    shadow: "never",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_126));
__VLS_128.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_128.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    const __VLS_129 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_130 = __VLS_asFunctionalComponent(__VLS_129, new __VLS_129({
        modelValue: (__VLS_ctx.form.org_scope_enabled),
    }));
    const __VLS_131 = __VLS_130({
        modelValue: (__VLS_ctx.form.org_scope_enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_130));
}
if (__VLS_ctx.form.org_scope_enabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_133 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
        label: "维度",
        required: true,
        ...{ style: {} },
    }));
    const __VLS_135 = __VLS_134({
        label: "维度",
        required: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_134));
    __VLS_136.slots.default;
    const __VLS_137 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.dimension),
        ...{ style: {} },
    }));
    const __VLS_139 = __VLS_138({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.form.dimension),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_138));
    let __VLS_141;
    let __VLS_142;
    let __VLS_143;
    const __VLS_144 = {
        onChange: (__VLS_ctx.onDimensionChange)
    };
    __VLS_140.slots.default;
    const __VLS_145 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
        label: "成本中心",
        value: "cost_center",
    }));
    const __VLS_147 = __VLS_146({
        label: "成本中心",
        value: "cost_center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_146));
    const __VLS_149 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({
        label: "组织",
        value: "org",
    }));
    const __VLS_151 = __VLS_150({
        label: "组织",
        value: "org",
    }, ...__VLS_functionalComponentArgsRest(__VLS_150));
    var __VLS_140;
    var __VLS_136;
    const __VLS_153 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
        label: "不限范围",
        ...{ style: {} },
    }));
    const __VLS_155 = __VLS_154({
        label: "不限范围",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_154));
    __VLS_156.slots.default;
    const __VLS_157 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
        modelValue: (__VLS_ctx.form.org_scope_unlimited),
        activeText: "不限（该维度无约束）",
        inactiveText: "按下方勾选",
    }));
    const __VLS_159 = __VLS_158({
        modelValue: (__VLS_ctx.form.org_scope_unlimited),
        activeText: "不限（该维度无约束）",
        inactiveText: "按下方勾选",
    }, ...__VLS_functionalComponentArgsRest(__VLS_158));
    var __VLS_156;
    if (!__VLS_ctx.form.org_scope_unlimited) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.form.selections.length);
        /** @type {[typeof HierarchyTreePicker, ]} */ ;
        // @ts-ignore
        const __VLS_161 = __VLS_asFunctionalComponent(HierarchyTreePicker, new HierarchyTreePicker({
            modelValue: (__VLS_ctx.form.selections),
            tree: (__VLS_ctx.currentTree),
        }));
        const __VLS_162 = __VLS_161({
            modelValue: (__VLS_ctx.form.selections),
            tree: (__VLS_ctx.currentTree),
        }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
var __VLS_128;
const __VLS_164 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    shadow: "never",
}));
const __VLS_166 = __VLS_165({
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
__VLS_167.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_167.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    const __VLS_168 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        modelValue: (__VLS_ctx.form.person_scope_enabled),
    }));
    const __VLS_170 = __VLS_169({
        modelValue: (__VLS_ctx.form.person_scope_enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
}
if (__VLS_ctx.form.person_scope_enabled) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [f, idx] of __VLS_getVForSourceType((__VLS_ctx.form.filters))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (idx),
            ...{ style: {} },
        });
        const __VLS_172 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
            ...{ 'onChange': {} },
            modelValue: (f.field_code),
            ...{ style: {} },
        }));
        const __VLS_174 = __VLS_173({
            ...{ 'onChange': {} },
            modelValue: (f.field_code),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        let __VLS_176;
        let __VLS_177;
        let __VLS_178;
        const __VLS_179 = {
            onChange: (...[$event]) => {
                if (!(__VLS_ctx.form.person_scope_enabled))
                    return;
                __VLS_ctx.onFieldChange(idx);
            }
        };
        __VLS_175.slots.default;
        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.FIELD_OPTS))) {
            const __VLS_180 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }));
            const __VLS_182 = __VLS_181({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        }
        var __VLS_175;
        const __VLS_184 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
            modelValue: (f.operator),
            ...{ style: {} },
        }));
        const __VLS_186 = __VLS_185({
            modelValue: (f.operator),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_185));
        __VLS_187.slots.default;
        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.OP_OPTS))) {
            const __VLS_188 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }));
            const __VLS_190 = __VLS_189({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
        }
        var __VLS_187;
        const __VLS_192 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            ...{ 'onFocus': {} },
            modelValue: (f.values),
            multiple: true,
            filterable: true,
            remote: (f.field_code === 'person'),
            remoteMethod: (f.field_code === 'person' ? (kw) => __VLS_ctx.remoteSearchPerson(idx, kw) : undefined),
            loading: (!!__VLS_ctx.personLoadingByRow[idx]),
            placeholder: "选择值",
            ...{ style: {} },
        }));
        const __VLS_194 = __VLS_193({
            ...{ 'onFocus': {} },
            modelValue: (f.values),
            multiple: true,
            filterable: true,
            remote: (f.field_code === 'person'),
            remoteMethod: (f.field_code === 'person' ? (kw) => __VLS_ctx.remoteSearchPerson(idx, kw) : undefined),
            loading: (!!__VLS_ctx.personLoadingByRow[idx]),
            placeholder: "选择值",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        let __VLS_196;
        let __VLS_197;
        let __VLS_198;
        const __VLS_199 = {
            onFocus: (...[$event]) => {
                if (!(__VLS_ctx.form.person_scope_enabled))
                    return;
                __VLS_ctx.onPersonFocus(idx);
            }
        };
        __VLS_195.slots.default;
        for (const [o] of __VLS_getVForSourceType((__VLS_ctx.valueOptionsFor(idx)))) {
            const __VLS_200 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }));
            const __VLS_202 = __VLS_201({
                key: (o.value),
                label: (o.label),
                value: (o.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_201));
        }
        var __VLS_195;
        const __VLS_204 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_206 = __VLS_205({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_205));
        let __VLS_208;
        let __VLS_209;
        let __VLS_210;
        const __VLS_211 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.form.person_scope_enabled))
                    return;
                __VLS_ctx.removeFilter(idx);
            }
        };
        __VLS_207.slots.default;
        const __VLS_212 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({}));
        const __VLS_214 = __VLS_213({}, ...__VLS_functionalComponentArgsRest(__VLS_213));
        __VLS_215.slots.default;
        const __VLS_216 = {}.Close;
        /** @type {[typeof __VLS_components.Close, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({}));
        const __VLS_218 = __VLS_217({}, ...__VLS_functionalComponentArgsRest(__VLS_217));
        var __VLS_215;
        var __VLS_207;
    }
    const __VLS_220 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        size: "small",
    }));
    const __VLS_222 = __VLS_221({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    let __VLS_224;
    let __VLS_225;
    let __VLS_226;
    const __VLS_227 = {
        onClick: (__VLS_ctx.addFilter)
    };
    __VLS_223.slots.default;
    const __VLS_228 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        ...{ style: {} },
    }));
    const __VLS_230 = __VLS_229({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    __VLS_231.slots.default;
    const __VLS_232 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({}));
    const __VLS_234 = __VLS_233({}, ...__VLS_functionalComponentArgsRest(__VLS_233));
    var __VLS_231;
    var __VLS_223;
    if (__VLS_ctx.filterPreview) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.filterPreview);
    }
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
var __VLS_167;
var __VLS_104;
{
    const { footer: __VLS_thisSlot } = __VLS_100.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_236 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        ...{ 'onClick': {} },
    }));
    const __VLS_238 = __VLS_237({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    let __VLS_240;
    let __VLS_241;
    let __VLS_242;
    const __VLS_243 = {
        onClick: (...[$event]) => {
            __VLS_ctx.drawerOpen = false;
        }
    };
    __VLS_239.slots.default;
    var __VLS_239;
    const __VLS_244 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_246 = __VLS_245({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    let __VLS_248;
    let __VLS_249;
    let __VLS_250;
    const __VLS_251 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_247.slots.default;
    var __VLS_247;
}
var __VLS_100;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Edit: Edit,
            Delete: Delete,
            Close: Close,
            PermissionButton: PermissionButton,
            HierarchyTreePicker: HierarchyTreePicker,
            loading: loading,
            DIM_OPTS: DIM_OPTS,
            filterDim: filterDim,
            FIELD_OPTS: FIELD_OPTS,
            OP_OPTS: OP_OPTS,
            drawerOpen: drawerOpen,
            editing: editing,
            saving: saving,
            form: form,
            include_inactive: include_inactive,
            personLoadingByRow: personLoadingByRow,
            filteredList: filteredList,
            currentTree: currentTree,
            openCreate: openCreate,
            openEdit: openEdit,
            dimLabel: dimLabel,
            summary: summary,
            addFilter: addFilter,
            removeFilter: removeFilter,
            onFieldChange: onFieldChange,
            valueOptionsFor: valueOptionsFor,
            remoteSearchPerson: remoteSearchPerson,
            onPersonFocus: onPersonFocus,
            filterPreview: filterPreview,
            save: save,
            handleDelete: handleDelete,
            onDimensionChange: onDimensionChange,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
