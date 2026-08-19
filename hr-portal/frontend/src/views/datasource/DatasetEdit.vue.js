/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { ArrowLeft, Check, Plus, Delete, Connection, InfoFilled } from '@element-plus/icons-vue';
import { datasetsApi, } from '@/api/datasets';
import { dataApi } from '@/api/data';
import AclEditor from '@/components/AclEditor.vue';
import { SCOPE_STRATEGY_OPTIONS } from '@/constants/scopeStrategy';
const route = useRoute();
const router = useRouter();
const datasetId = computed(() => {
    const id = route.params.id;
    return id === 'new' ? null : Number(id);
});
const isNew = computed(() => datasetId.value === null);
const form = reactive({
    name: '',
    label: '',
    description: '',
    is_active: true,
    scope_strategy: null,
    tables: [],
    relations: [],
    acl: [],
});
const visibleTables = ref([]);
const columnsByAlias = ref({});
const saving = ref(false);
const integrityResult = ref(null);
const JOIN_TYPES = [
    { value: 'inner', label: 'INNER (内连接)' },
    { value: 'left', label: 'LEFT (左外，常用)' },
    { value: 'right', label: 'RIGHT (右外)' },
    { value: 'full', label: 'FULL (全外)' },
];
const CARDINALITIES = [
    { value: '1:1', label: '1:1（一对一）' },
    { value: '1:N', label: '1:N（左1右多）' },
    { value: 'N:1', label: 'N:1（左多右1）' },
];
const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
async function loadVisibleTables() {
    try {
        visibleTables.value = await datasetsApi.visibleTables();
    }
    catch {
        visibleTables.value = [];
    }
}
async function loadDataset() {
    if (isNew.value)
        return;
    try {
        const r = await datasetsApi.get(datasetId.value);
        form.name = r.name;
        form.label = r.label || '';
        form.description = r.description ?? '';
        form.is_active = r.is_active;
        form.scope_strategy = r.scope_strategy;
        form.acl = (r.acl || []).map((a) => ({ id: a.id, role_id: a.role_id, user_id: a.user_id }));
        form.tables = r.tables.map((t) => ({
            table_name: t.table_name,
            alias: t.alias,
            table_label: t.table_label,
        }));
        form.relations = r.relations.map((rel) => ({
            left_alias: rel.left_alias,
            right_alias: rel.right_alias,
            join_type: rel.join_type,
            cardinality: rel.cardinality || '1:1',
            keys: rel.keys.map((k) => ({ ...k })),
        }));
        await loadAliasColumns();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
}
async function loadAliasColumns() {
    // 加载每个 alias 对应表的字段元数据，用于关联键下拉
    const next = {};
    for (const t of form.tables) {
        try {
            next[t.alias] = await dataApi.columns(t.table_name);
        }
        catch {
            next[t.alias] = [];
        }
    }
    columnsByAlias.value = next;
}
function addTable() {
    const first = visibleTables.value[0];
    if (!first) {
        ElMessage.warning('没有可用源表');
        return;
    }
    form.tables.push({
        table_name: first.table_name,
        alias: nextAlias(first.table_name),
        table_label: first.label,
    });
    loadAliasColumns();
}
function removeTable(i) {
    const removed = form.tables[i];
    form.tables.splice(i, 1);
    // 删除该 alias 相关的所有 relation
    form.relations = form.relations.filter((r) => r.left_alias !== removed.alias && r.right_alias !== removed.alias);
    delete columnsByAlias.value[removed.alias];
}
function onTableChange(t) {
    t.table_label = visibleTableLabel(t.table_name);
    if (!t.alias || aliasDuplicate(t.alias, t)) {
        updateTableAlias(t, nextAlias(t.table_name));
    }
    loadAliasColumns();
}
function normalizeAlias(raw) {
    let alias = (raw || '').trim().replace(/[^A-Za-z0-9_]/g, '_');
    if (!alias)
        alias = 't';
    if (/^[0-9]/.test(alias))
        alias = `t_${alias}`;
    return alias;
}
function nextAlias(tableName) {
    const base = normalizeAlias(tableName);
    const used = new Set(form.tables.map((t) => t.alias));
    if (!used.has(base))
        return base;
    let index = 2;
    while (used.has(`${base}_${index}`))
        index += 1;
    return `${base}_${index}`;
}
function aliasDuplicate(alias, current) {
    return form.tables.some((item) => item !== current && item.alias === alias);
}
function syncRelationAlias(oldAlias, newAlias) {
    if (!oldAlias || oldAlias === newAlias)
        return;
    form.relations.forEach((r) => {
        if (r.left_alias === oldAlias)
            r.left_alias = newAlias;
        if (r.right_alias === oldAlias)
            r.right_alias = newAlias;
    });
}
function updateTableAlias(t, alias) {
    const oldAlias = t.alias;
    t.alias = alias;
    syncRelationAlias(oldAlias, alias);
    if (oldAlias && oldAlias !== alias) {
        const oldColumns = columnsByAlias.value[oldAlias];
        if (oldColumns && !columnsByAlias.value[alias])
            columnsByAlias.value[alias] = oldColumns;
        delete columnsByAlias.value[oldAlias];
    }
}
function onAliasInput(t, alias) {
    updateTableAlias(t, alias);
}
function onAliasChange(t) {
    const alias = normalizeAlias(t.alias);
    if (!ALIAS_RE.test(alias)) {
        ElMessage.warning('别名请使用英文、数字、下划线，且不能以数字开头');
        updateTableAlias(t, nextAlias(t.table_name));
        loadAliasColumns();
        return;
    }
    if (aliasDuplicate(alias, t)) {
        ElMessage.warning(`别名重复: ${alias}`);
        updateTableAlias(t, nextAlias(t.table_name));
        loadAliasColumns();
        return;
    }
    updateTableAlias(t, alias);
    loadAliasColumns();
}
function addRelation() {
    if (form.tables.length < 2) {
        ElMessage.warning('请先添加至少 2 张数据表');
        return;
    }
    form.relations.push({
        left_alias: form.tables[0].alias,
        right_alias: form.tables[1].alias,
        join_type: 'left',
        cardinality: '1:1',
        keys: [{ left: '', right: '' }],
    });
}
function removeRelation(i) {
    form.relations.splice(i, 1);
}
function addKey(rel) {
    rel.keys.push({ left: '', right: '' });
}
function removeKey(rel, ki) {
    rel.keys.splice(ki, 1);
}
function buildPayload() {
    return {
        name: form.name.trim(),
        label: form.label.trim() || null,
        description: form.description.trim() || null,
        is_active: form.is_active,
        scope_strategy: form.scope_strategy || null,
        tables: form.tables.map((t) => ({ table_name: t.table_name, alias: t.alias })),
        relations: form.relations.map((r) => ({
            left_alias: r.left_alias,
            right_alias: r.right_alias,
            join_type: r.join_type,
            cardinality: r.cardinality || '1:1',
            keys: r.keys.filter((k) => k.left && k.right),
        })),
        acl: form.acl
            .filter((a) => a.role_id != null || a.user_id != null)
            .map((a) => ({ role_id: a.role_id, user_id: a.user_id })),
    };
}
function visibleTableLabel(tableName) {
    return visibleTables.value.find((t) => t.table_name === tableName)?.label || tableName;
}
function tableDisplayName(t) {
    return t.table_label || visibleTableLabel(t.table_name);
}
function tableAliasOptionLabel(t) {
    return tableDisplayName(t);
}
async function save() {
    if (!form.name.trim()) {
        ElMessage.warning('请填写名称');
        return;
    }
    if (form.tables.length === 0) {
        ElMessage.warning('至少添加一张数据表');
        return;
    }
    const aliases = new Set();
    for (const t of form.tables) {
        updateTableAlias(t, normalizeAlias(t.alias));
        if (!ALIAS_RE.test(t.alias || '')) {
            ElMessage.warning(`别名格式不合法: ${t.alias}`);
            return;
        }
        if (aliases.has(t.alias)) {
            ElMessage.warning(`别名重复: ${t.alias}`);
            return;
        }
        aliases.add(t.alias);
    }
    saving.value = true;
    try {
        const payload = buildPayload();
        if (isNew.value) {
            const r = await datasetsApi.create(payload);
            ElMessage.success('已创建');
            router.replace(`/datasource/datasets/${r.id}`);
        }
        else {
            await datasetsApi.update(datasetId.value, payload);
            ElMessage.success('已保存');
            await checkIntegrity();
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function checkIntegrity() {
    if (isNew.value)
        return;
    try {
        integrityResult.value = await datasetsApi.integrity(datasetId.value);
    }
    catch {
        integrityResult.value = null;
    }
}
// P4-03: 输出字段配置
const outputFields = ref([]);
async function loadOutputFields() {
    if (isNew.value)
        return;
    try {
        outputFields.value = await datasetsApi.outputFields(datasetId.value);
    }
    catch {
        outputFields.value = [];
    }
}
async function updateField(row) {
    try {
        await datasetsApi.updateOutputField(datasetId.value, row.id, {
            output_label: row.output_label,
            agg_role: row.agg_role,
            description: row.description,
        });
    }
    catch { /* ignore */ }
}
onMounted(async () => {
    await loadVisibleTables();
    if (!isNew.value) {
        await loadDataset();
        await checkIntegrity();
        await loadOutputFields();
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        link: true,
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push('/datasource/datasets');
        }
    };
    __VLS_7.slots.default;
    const __VLS_12 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    __VLS_15.slots.default;
    const __VLS_16 = {}.ArrowLeft;
    /** @type {[typeof __VLS_components.ArrowLeft, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
    const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_15;
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.isNew ? '新建数据集' : `编辑数据集 · ${__VLS_ctx.form.name || '(未命名)'}`);
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_23.slots.default;
    const __VLS_28 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ style: {} },
    }));
    const __VLS_30 = __VLS_29({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    __VLS_31.slots.default;
    const __VLS_32 = {}.Check;
    /** @type {[typeof __VLS_components.Check, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
    var __VLS_31;
    var __VLS_23;
}
if (__VLS_ctx.integrityResult && !__VLS_ctx.integrityResult.ok) {
    const __VLS_36 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_38 = __VLS_37({
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.ul, __VLS_intrinsicElements.ul)({
        ...{ style: {} },
    });
    for (const [iss, i] of __VLS_getVForSourceType((__VLS_ctx.integrityResult.issues))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.li, __VLS_intrinsicElements.li)({
            key: (i),
        });
        (iss);
    }
    var __VLS_39;
}
const __VLS_40 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    labelPosition: "top",
}));
const __VLS_42 = __VLS_41({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "数据集编码（系统标识符）",
    required: true,
}));
const __VLS_46 = __VLS_45({
    label: "数据集编码（系统标识符）",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "64",
    placeholder: "如 ds_dwd_employee",
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "64",
    placeholder: "如 ds_dwd_employee",
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_47;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "展示名称",
}));
const __VLS_54 = __VLS_53({
    label: "展示名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    modelValue: (__VLS_ctx.form.label),
    maxlength: "128",
    placeholder: "如 员工DWD数据集",
}));
const __VLS_58 = __VLS_57({
    modelValue: (__VLS_ctx.form.label),
    maxlength: "128",
    placeholder: "如 员工DWD数据集",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
var __VLS_55;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "启用",
}));
const __VLS_62 = __VLS_61({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_66 = __VLS_65({
    modelValue: (__VLS_ctx.form.is_active),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_63;
const __VLS_68 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "描述",
}));
const __VLS_70 = __VLS_69({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    maxlength: "500",
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
    maxlength: "500",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
var __VLS_71;
const __VLS_76 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    label: "数据范围策略",
}));
const __VLS_78 = __VLS_77({
    label: "数据范围策略",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    modelValue: (__VLS_ctx.form.scope_strategy),
    clearable: true,
    ...{ style: {} },
    placeholder: "继承表默认",
}));
const __VLS_82 = __VLS_81({
    modelValue: (__VLS_ctx.form.scope_strategy),
    clearable: true,
    ...{ style: {} },
    placeholder: "继承表默认",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
for (const [item] of __VLS_getVForSourceType((__VLS_ctx.SCOPE_STRATEGY_OPTIONS))) {
    const __VLS_84 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }));
    const __VLS_86 = __VLS_85({
        key: (item.value),
        label: (item.label),
        value: (item.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
}
var __VLS_83;
var __VLS_79;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
(__VLS_ctx.form.tables.length);
for (const [t, i] of __VLS_getVForSourceType((__VLS_ctx.form.tables))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "rule-row" },
    });
    const __VLS_88 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onChange': {} },
        modelValue: (t.table_name),
        placeholder: "选择源表",
        ...{ style: {} },
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onChange': {} },
        modelValue: (t.table_name),
        placeholder: "选择源表",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onChange: (() => __VLS_ctx.onTableChange(t))
    };
    __VLS_91.slots.default;
    for (const [vt] of __VLS_getVForSourceType((__VLS_ctx.visibleTables))) {
        const __VLS_96 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
            key: (vt.table_name),
            label: (vt.label),
            value: (vt.table_name),
        }));
        const __VLS_98 = __VLS_97({
            key: (vt.table_name),
            label: (vt.label),
            value: (vt.table_name),
        }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    }
    var __VLS_91;
    const __VLS_100 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        ...{ 'onUpdate:modelValue': {} },
        ...{ 'onChange': {} },
        modelValue: (t.alias),
        placeholder: "别名，如 mgr / sub",
        ...{ style: {} },
    }));
    const __VLS_102 = __VLS_101({
        ...{ 'onUpdate:modelValue': {} },
        ...{ 'onChange': {} },
        modelValue: (t.alias),
        placeholder: "别名，如 mgr / sub",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    let __VLS_104;
    let __VLS_105;
    let __VLS_106;
    const __VLS_107 = {
        'onUpdate:modelValue': ((v) => __VLS_ctx.onAliasInput(t, v))
    };
    const __VLS_108 = {
        onChange: (() => __VLS_ctx.onAliasChange(t))
    };
    var __VLS_103;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "table-name-hint" },
    });
    (__VLS_ctx.tableDisplayName(t));
    const __VLS_109 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_111 = __VLS_110({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    let __VLS_113;
    let __VLS_114;
    let __VLS_115;
    const __VLS_116 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeTable(i);
        }
    };
    __VLS_112.slots.default;
    const __VLS_117 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_118 = __VLS_asFunctionalComponent(__VLS_117, new __VLS_117({}));
    const __VLS_119 = __VLS_118({}, ...__VLS_functionalComponentArgsRest(__VLS_118));
    __VLS_120.slots.default;
    const __VLS_121 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_122 = __VLS_asFunctionalComponent(__VLS_121, new __VLS_121({}));
    const __VLS_123 = __VLS_122({}, ...__VLS_functionalComponentArgsRest(__VLS_122));
    var __VLS_120;
    var __VLS_112;
}
const __VLS_125 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_126 = __VLS_asFunctionalComponent(__VLS_125, new __VLS_125({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_127 = __VLS_126({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_126));
let __VLS_129;
let __VLS_130;
let __VLS_131;
const __VLS_132 = {
    onClick: (__VLS_ctx.addTable)
};
__VLS_128.slots.default;
const __VLS_133 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_134 = __VLS_asFunctionalComponent(__VLS_133, new __VLS_133({
    ...{ style: {} },
}));
const __VLS_135 = __VLS_134({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_134));
__VLS_136.slots.default;
const __VLS_137 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_138 = __VLS_asFunctionalComponent(__VLS_137, new __VLS_137({}));
const __VLS_139 = __VLS_138({}, ...__VLS_functionalComponentArgsRest(__VLS_138));
var __VLS_136;
var __VLS_128;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
(__VLS_ctx.form.relations.length);
const __VLS_141 = {}.ElTooltip;
/** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
// @ts-ignore
const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({
    placement: "right",
    effect: "dark",
}));
const __VLS_143 = __VLS_142({
    placement: "right",
    effect: "dark",
}, ...__VLS_functionalComponentArgsRest(__VLS_142));
__VLS_144.slots.default;
{
    const { content: __VLS_thisSlot } = __VLS_144.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
}
const __VLS_145 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({
    ...{ style: {} },
}));
const __VLS_147 = __VLS_146({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_146));
__VLS_148.slots.default;
const __VLS_149 = {}.InfoFilled;
/** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
// @ts-ignore
const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({}));
const __VLS_151 = __VLS_150({}, ...__VLS_functionalComponentArgsRest(__VLS_150));
var __VLS_148;
var __VLS_144;
for (const [rel, i] of __VLS_getVForSourceType((__VLS_ctx.form.relations))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "relation-block" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "relation-head" },
    });
    const __VLS_153 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({}));
    const __VLS_155 = __VLS_154({}, ...__VLS_functionalComponentArgsRest(__VLS_154));
    __VLS_156.slots.default;
    const __VLS_157 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({}));
    const __VLS_159 = __VLS_158({}, ...__VLS_functionalComponentArgsRest(__VLS_158));
    var __VLS_156;
    const __VLS_161 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
        modelValue: (rel.left_alias),
        ...{ style: {} },
    }));
    const __VLS_163 = __VLS_162({
        modelValue: (rel.left_alias),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_162));
    __VLS_164.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.form.tables))) {
        const __VLS_165 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
            key: (t.alias),
            label: (__VLS_ctx.tableAliasOptionLabel(t)),
            value: (t.alias),
        }));
        const __VLS_167 = __VLS_166({
            key: (t.alias),
            label: (__VLS_ctx.tableAliasOptionLabel(t)),
            value: (t.alias),
        }, ...__VLS_functionalComponentArgsRest(__VLS_166));
    }
    var __VLS_164;
    const __VLS_169 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
        modelValue: (rel.join_type),
        ...{ style: {} },
    }));
    const __VLS_171 = __VLS_170({
        modelValue: (rel.join_type),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_170));
    __VLS_172.slots.default;
    for (const [jt] of __VLS_getVForSourceType((__VLS_ctx.JOIN_TYPES))) {
        const __VLS_173 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
            key: (jt.value),
            label: (jt.label),
            value: (jt.value),
        }));
        const __VLS_175 = __VLS_174({
            key: (jt.value),
            label: (jt.label),
            value: (jt.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_174));
    }
    var __VLS_172;
    const __VLS_177 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
        modelValue: (rel.right_alias),
        ...{ style: {} },
    }));
    const __VLS_179 = __VLS_178({
        modelValue: (rel.right_alias),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_178));
    __VLS_180.slots.default;
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.form.tables))) {
        const __VLS_181 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
            key: (t.alias),
            label: (__VLS_ctx.tableAliasOptionLabel(t)),
            value: (t.alias),
        }));
        const __VLS_183 = __VLS_182({
            key: (t.alias),
            label: (__VLS_ctx.tableAliasOptionLabel(t)),
            value: (t.alias),
        }, ...__VLS_functionalComponentArgsRest(__VLS_182));
    }
    var __VLS_180;
    const __VLS_185 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
        modelValue: (rel.cardinality),
        ...{ style: {} },
        placeholder: "基数",
    }));
    const __VLS_187 = __VLS_186({
        modelValue: (rel.cardinality),
        ...{ style: {} },
        placeholder: "基数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_186));
    __VLS_188.slots.default;
    for (const [c] of __VLS_getVForSourceType((__VLS_ctx.CARDINALITIES))) {
        const __VLS_189 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
            key: (c.value),
            label: (c.label),
            value: (c.value),
        }));
        const __VLS_191 = __VLS_190({
            key: (c.value),
            label: (c.label),
            value: (c.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_190));
    }
    var __VLS_188;
    const __VLS_193 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        ...{ style: {} },
    }));
    const __VLS_195 = __VLS_194({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_194));
    let __VLS_197;
    let __VLS_198;
    let __VLS_199;
    const __VLS_200 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeRelation(i);
        }
    };
    __VLS_196.slots.default;
    const __VLS_201 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({}));
    const __VLS_203 = __VLS_202({}, ...__VLS_functionalComponentArgsRest(__VLS_202));
    __VLS_204.slots.default;
    const __VLS_205 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({}));
    const __VLS_207 = __VLS_206({}, ...__VLS_functionalComponentArgsRest(__VLS_206));
    var __VLS_204;
    var __VLS_196;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "relation-keys" },
    });
    for (const [k, ki] of __VLS_getVForSourceType((rel.keys))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (ki),
            ...{ class: "key-row" },
        });
        const __VLS_209 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
            modelValue: (k.left),
            placeholder: "左字段",
            ...{ style: {} },
            filterable: true,
        }));
        const __VLS_211 = __VLS_210({
            modelValue: (k.left),
            placeholder: "左字段",
            ...{ style: {} },
            filterable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_210));
        __VLS_212.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.columnsByAlias[rel.left_alias] || []))) {
            const __VLS_213 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_215 = __VLS_214({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_214));
        }
        var __VLS_212;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        const __VLS_217 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
            modelValue: (k.right),
            placeholder: "右字段",
            ...{ style: {} },
            filterable: true,
        }));
        const __VLS_219 = __VLS_218({
            modelValue: (k.right),
            placeholder: "右字段",
            ...{ style: {} },
            filterable: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_218));
        __VLS_220.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.columnsByAlias[rel.right_alias] || []))) {
            const __VLS_221 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }));
            const __VLS_223 = __VLS_222({
                key: (c.code),
                label: (c.label),
                value: (c.code),
            }, ...__VLS_functionalComponentArgsRest(__VLS_222));
        }
        var __VLS_220;
        const __VLS_225 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }));
        const __VLS_227 = __VLS_226({
            ...{ 'onClick': {} },
            link: true,
            type: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_226));
        let __VLS_229;
        let __VLS_230;
        let __VLS_231;
        const __VLS_232 = {
            onClick: (...[$event]) => {
                __VLS_ctx.removeKey(rel, ki);
            }
        };
        __VLS_228.slots.default;
        const __VLS_233 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({}));
        const __VLS_235 = __VLS_234({}, ...__VLS_functionalComponentArgsRest(__VLS_234));
        __VLS_236.slots.default;
        const __VLS_237 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({}));
        const __VLS_239 = __VLS_238({}, ...__VLS_functionalComponentArgsRest(__VLS_238));
        var __VLS_236;
        var __VLS_228;
    }
    const __VLS_241 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
    }));
    const __VLS_243 = __VLS_242({
        ...{ 'onClick': {} },
        link: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    let __VLS_245;
    let __VLS_246;
    let __VLS_247;
    const __VLS_248 = {
        onClick: (...[$event]) => {
            __VLS_ctx.addKey(rel);
        }
    };
    __VLS_244.slots.default;
    const __VLS_249 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_250 = __VLS_asFunctionalComponent(__VLS_249, new __VLS_249({
        ...{ style: {} },
    }));
    const __VLS_251 = __VLS_250({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_250));
    __VLS_252.slots.default;
    const __VLS_253 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_254 = __VLS_asFunctionalComponent(__VLS_253, new __VLS_253({}));
    const __VLS_255 = __VLS_254({}, ...__VLS_functionalComponentArgsRest(__VLS_254));
    var __VLS_252;
    var __VLS_244;
}
const __VLS_257 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_258 = __VLS_asFunctionalComponent(__VLS_257, new __VLS_257({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}));
const __VLS_259 = __VLS_258({
    ...{ 'onClick': {} },
    link: true,
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_258));
let __VLS_261;
let __VLS_262;
let __VLS_263;
const __VLS_264 = {
    onClick: (__VLS_ctx.addRelation)
};
__VLS_260.slots.default;
const __VLS_265 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({
    ...{ style: {} },
}));
const __VLS_267 = __VLS_266({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_266));
__VLS_268.slots.default;
const __VLS_269 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_270 = __VLS_asFunctionalComponent(__VLS_269, new __VLS_269({}));
const __VLS_271 = __VLS_270({}, ...__VLS_functionalComponentArgsRest(__VLS_270));
var __VLS_268;
var __VLS_260;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-title" },
});
/** @type {[typeof AclEditor, ]} */ ;
// @ts-ignore
const __VLS_273 = __VLS_asFunctionalComponent(AclEditor, new AclEditor({
    modelValue: (__VLS_ctx.form.acl),
}));
const __VLS_274 = __VLS_273({
    modelValue: (__VLS_ctx.form.acl),
}, ...__VLS_functionalComponentArgsRest(__VLS_273));
var __VLS_43;
var __VLS_3;
if (!__VLS_ctx.isNew && __VLS_ctx.outputFields.length > 0) {
    const __VLS_276 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        ...{ style: {} },
    }));
    const __VLS_278 = __VLS_277({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    __VLS_279.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_279.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    }
    const __VLS_280 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        data: (__VLS_ctx.outputFields),
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_282 = __VLS_281({
        data: (__VLS_ctx.outputFields),
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    __VLS_283.slots.default;
    const __VLS_284 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({
        prop: "output_code",
        label: "字段编码",
        width: "160",
    }));
    const __VLS_286 = __VLS_285({
        prop: "output_code",
        label: "字段编码",
        width: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_285));
    const __VLS_288 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
        prop: "output_label",
        label: "显示名称",
    }));
    const __VLS_290 = __VLS_289({
        prop: "output_label",
        label: "显示名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_291.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_292 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
            ...{ 'onBlur': {} },
            modelValue: (row.output_label),
            size: "small",
        }));
        const __VLS_294 = __VLS_293({
            ...{ 'onBlur': {} },
            modelValue: (row.output_label),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_293));
        let __VLS_296;
        let __VLS_297;
        let __VLS_298;
        const __VLS_299 = {
            onBlur: (...[$event]) => {
                if (!(!__VLS_ctx.isNew && __VLS_ctx.outputFields.length > 0))
                    return;
                __VLS_ctx.updateField(row);
            }
        };
        var __VLS_295;
    }
    var __VLS_291;
    const __VLS_300 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        prop: "agg_role",
        label: "角色",
        width: "120",
    }));
    const __VLS_302 = __VLS_301({
        prop: "agg_role",
        label: "角色",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    __VLS_303.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_303.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_304 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
            ...{ 'onChange': {} },
            modelValue: (row.agg_role),
            size: "small",
        }));
        const __VLS_306 = __VLS_305({
            ...{ 'onChange': {} },
            modelValue: (row.agg_role),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_305));
        let __VLS_308;
        let __VLS_309;
        let __VLS_310;
        const __VLS_311 = {
            onChange: (...[$event]) => {
                if (!(!__VLS_ctx.isNew && __VLS_ctx.outputFields.length > 0))
                    return;
                __VLS_ctx.updateField(row);
            }
        };
        __VLS_307.slots.default;
        const __VLS_312 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
            label: "维度",
            value: "dimension",
        }));
        const __VLS_314 = __VLS_313({
            label: "维度",
            value: "dimension",
        }, ...__VLS_functionalComponentArgsRest(__VLS_313));
        const __VLS_316 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            label: "度量",
            value: "measure",
        }));
        const __VLS_318 = __VLS_317({
            label: "度量",
            value: "measure",
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
        var __VLS_307;
    }
    var __VLS_303;
    const __VLS_320 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
        prop: "description",
        label: "描述",
    }));
    const __VLS_322 = __VLS_321({
        prop: "description",
        label: "描述",
    }, ...__VLS_functionalComponentArgsRest(__VLS_321));
    __VLS_323.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_323.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_324 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            ...{ 'onBlur': {} },
            modelValue: (row.description),
            size: "small",
            placeholder: "口径说明",
        }));
        const __VLS_326 = __VLS_325({
            ...{ 'onBlur': {} },
            modelValue: (row.description),
            size: "small",
            placeholder: "口径说明",
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        let __VLS_328;
        let __VLS_329;
        let __VLS_330;
        const __VLS_331 = {
            onBlur: (...[$event]) => {
                if (!(!__VLS_ctx.isNew && __VLS_ctx.outputFields.length > 0))
                    return;
                __VLS_ctx.updateField(row);
            }
        };
        var __VLS_327;
    }
    var __VLS_323;
    var __VLS_283;
    var __VLS_279;
}
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['table-name-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['relation-block']} */ ;
/** @type {__VLS_StyleScopedClasses['relation-head']} */ ;
/** @type {__VLS_StyleScopedClasses['relation-keys']} */ ;
/** @type {__VLS_StyleScopedClasses['key-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            Check: Check,
            Plus: Plus,
            Delete: Delete,
            Connection: Connection,
            InfoFilled: InfoFilled,
            AclEditor: AclEditor,
            SCOPE_STRATEGY_OPTIONS: SCOPE_STRATEGY_OPTIONS,
            router: router,
            isNew: isNew,
            form: form,
            visibleTables: visibleTables,
            columnsByAlias: columnsByAlias,
            saving: saving,
            integrityResult: integrityResult,
            JOIN_TYPES: JOIN_TYPES,
            CARDINALITIES: CARDINALITIES,
            addTable: addTable,
            removeTable: removeTable,
            onTableChange: onTableChange,
            onAliasInput: onAliasInput,
            onAliasChange: onAliasChange,
            addRelation: addRelation,
            removeRelation: removeRelation,
            addKey: addKey,
            removeKey: removeKey,
            tableDisplayName: tableDisplayName,
            tableAliasOptionLabel: tableAliasOptionLabel,
            save: save,
            outputFields: outputFields,
            updateField: updateField,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
