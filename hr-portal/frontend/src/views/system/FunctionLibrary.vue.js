/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { functionLibraryApi, } from '@/api/functionLibrary';
const MENU = 'system.function_library';
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const dialogOpen = ref(false);
const editing = ref(null);
const activeTab = ref('base');
const keyword = ref('');
const statusFilter = ref('all');
const form = reactive({
    code: '',
    name: '',
    description: '',
    function_type: 'expression',
    parameters: [],
    return_type: 'number',
    formula_body: '',
    is_enabled: true,
    is_sensitive_output: false,
});
const baseFunctions = computed(() => list.value
    .filter((item) => item.source === 'base_excel' || item.function_type === 'base_excel')
    .filter((item) => {
    const kw = keyword.value.trim().toLowerCase();
    const status = statusFilter.value;
    const hitKeyword = !kw || `${item.code} ${item.name} ${item.category_label || ''}`.toLowerCase().includes(kw);
    const hitStatus = status === 'all' || item.support_status === status;
    return hitKeyword && hitStatus;
}));
const managedFunctions = computed(() => list.value.filter((item) => item.source !== 'base_excel' && item.function_type !== 'base_excel'));
function functionTypeLabel(type) {
    const map = {
        base_excel: '基础函数',
        system_builtin: '系统内置',
        expression: '表达式',
        data_action: '数据动作',
    };
    return map[type] || type;
}
function supportStatusLabel(row) {
    const status = row.support_status || 'executable';
    if (status === 'executable')
        return '可执行';
    if (status === 'blocked')
        return '风险禁用';
    return '待适配';
}
function supportStatusTag(row) {
    const status = row.support_status || 'executable';
    if (status === 'executable')
        return 'success';
    if (status === 'blocked')
        return 'danger';
    return 'info';
}
function parameterNames(row) {
    return (row.parameters || []).map((item) => item.name).filter(Boolean).join('，') || '-';
}
async function updateCatalog(row, patch) {
    if (!row.is_executable) {
        ElMessage.warning('该函数尚未适配执行，当前只能作为目录查看');
        await load();
        return;
    }
    try {
        const next = await functionLibraryApi.updateCatalog(row.code, patch);
        Object.assign(row, next);
        ElMessage.success('函数目录配置已更新');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '更新失败');
        await load();
    }
}
async function updateCatalogVisibility(row, value) {
    await updateCatalog(row, value
        ? { is_visible: true }
        : { is_visible: false, is_enabled: false, is_ai_enabled: false });
}
async function load() {
    loading.value = true;
    try {
        list.value = await functionLibraryApi.list(false);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载函数库失败');
    }
    finally {
        loading.value = false;
    }
}
function reset() {
    Object.assign(form, {
        code: '',
        name: '',
        description: '',
        function_type: 'expression',
        parameters: [],
        return_type: 'number',
        formula_body: '',
        is_enabled: true,
        is_sensitive_output: false,
    });
}
function openCreate() {
    editing.value = null;
    reset();
    dialogOpen.value = true;
}
function openEdit(row) {
    editing.value = row;
    Object.assign(form, {
        code: row.code,
        name: row.name,
        description: row.description || '',
        function_type: row.function_type,
        parameters: row.parameters.map((item) => ({ ...item })),
        return_type: row.return_type,
        formula_body: row.formula_body || '',
        is_enabled: row.is_enabled,
        is_sensitive_output: row.is_sensitive_output,
    });
    dialogOpen.value = true;
}
function addParam() {
    form.parameters.push({ name: '', type: 'number', description: '' });
}
function removeParam(index) {
    form.parameters.splice(index, 1);
}
async function save() {
    if (!form.code.trim() || !form.name.trim()) {
        ElMessage.warning('函数编码和名称必填');
        return;
    }
    if (form.function_type === 'expression' && !form.formula_body?.trim()) {
        ElMessage.warning('表达式型函数必须填写公式体');
        return;
    }
    saving.value = true;
    try {
        const payload = {
            ...form,
            code: form.code.trim().toUpperCase(),
            name: form.name.trim(),
            description: form.description?.trim() || null,
            formula_body: form.formula_body?.trim() || null,
            parameters: form.parameters
                .filter((item) => item.name?.trim())
                .map((item) => ({ ...item, name: item.name.trim() })),
        };
        if (editing.value) {
            if (editing.value.id == null) {
                ElMessage.warning('基础函数为系统只读，不能编辑');
                return;
            }
            await functionLibraryApi.update(editing.value.id, payload);
        }
        else {
            await functionLibraryApi.create(payload);
        }
        ElMessage.success('函数已保存');
        dialogOpen.value = false;
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page" },
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
        ...{ class: "page-head" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-subtitle" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "page-actions" },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Refresh),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (__VLS_ctx.load)
    };
    __VLS_7.slots.default;
    var __VLS_7;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "C",
        type: "primary",
    }));
    const __VLS_13 = __VLS_12({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    let __VLS_15;
    let __VLS_16;
    let __VLS_17;
    const __VLS_18 = {
        onClick: (__VLS_ctx.openCreate)
    };
    __VLS_14.slots.default;
    const __VLS_19 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({}));
    const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_22.slots.default;
    const __VLS_23 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
    const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
    var __VLS_22;
    var __VLS_14;
}
const __VLS_27 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_29 = __VLS_28({
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
const __VLS_31 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    label: (`Excel 函数目录（${__VLS_ctx.baseFunctions.length}）`),
    name: "base",
}));
const __VLS_33 = __VLS_32({
    label: (`Excel 函数目录（${__VLS_ctx.baseFunctions.length}）`),
    name: "base",
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "catalog-toolbar" },
});
const __VLS_35 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索函数编码/名称/分类",
    clearable: true,
}));
const __VLS_37 = __VLS_36({
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索函数编码/名称/分类",
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
const __VLS_39 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    modelValue: (__VLS_ctx.statusFilter),
    ...{ style: {} },
}));
const __VLS_41 = __VLS_40({
    modelValue: (__VLS_ctx.statusFilter),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
__VLS_42.slots.default;
const __VLS_43 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
    label: "全部状态",
    value: "all",
}));
const __VLS_45 = __VLS_44({
    label: "全部状态",
    value: "all",
}, ...__VLS_functionalComponentArgsRest(__VLS_44));
const __VLS_47 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    label: "可执行",
    value: "executable",
}));
const __VLS_49 = __VLS_48({
    label: "可执行",
    value: "executable",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
const __VLS_51 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    label: "待适配",
    value: "catalog_only",
}));
const __VLS_53 = __VLS_52({
    label: "待适配",
    value: "catalog_only",
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
const __VLS_55 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    label: "风险禁用",
    value: "blocked",
}));
const __VLS_57 = __VLS_56({
    label: "风险禁用",
    value: "blocked",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
var __VLS_42;
const __VLS_59 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    data: (__VLS_ctx.baseFunctions),
    stripe: true,
    ...{ style: {} },
    maxHeight: "640",
}));
const __VLS_61 = __VLS_60({
    data: (__VLS_ctx.baseFunctions),
    stripe: true,
    ...{ style: {} },
    maxHeight: "640",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_62.slots.default;
const __VLS_63 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    prop: "code",
    label: "编码",
    minWidth: "130",
}));
const __VLS_65 = __VLS_64({
    prop: "code",
    label: "编码",
    minWidth: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
const __VLS_67 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    prop: "name",
    label: "名称",
    minWidth: "150",
}));
const __VLS_69 = __VLS_68({
    prop: "name",
    label: "名称",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
const __VLS_71 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
    label: "分类",
    minWidth: "110",
}));
const __VLS_73 = __VLS_72({
    label: "分类",
    minWidth: "110",
}, ...__VLS_functionalComponentArgsRest(__VLS_72));
__VLS_74.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_74.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_75 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        type: "info",
        effect: "plain",
    }));
    const __VLS_77 = __VLS_76({
        type: "info",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    __VLS_78.slots.default;
    (row.category_label || __VLS_ctx.functionTypeLabel(row.function_type));
    var __VLS_78;
}
var __VLS_74;
const __VLS_79 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    prop: "return_type",
    label: "返回类型",
    minWidth: "100",
}));
const __VLS_81 = __VLS_80({
    prop: "return_type",
    label: "返回类型",
    minWidth: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
const __VLS_83 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
    label: "适配状态",
    minWidth: "100",
}));
const __VLS_85 = __VLS_84({
    label: "适配状态",
    minWidth: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_84));
__VLS_86.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_86.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_87 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_88 = __VLS_asFunctionalComponent(__VLS_87, new __VLS_87({
        type: (__VLS_ctx.supportStatusTag(row)),
        effect: "plain",
    }));
    const __VLS_89 = __VLS_88({
        type: (__VLS_ctx.supportStatusTag(row)),
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_88));
    __VLS_90.slots.default;
    (__VLS_ctx.supportStatusLabel(row));
    var __VLS_90;
}
var __VLS_86;
const __VLS_91 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_92 = __VLS_asFunctionalComponent(__VLS_91, new __VLS_91({
    label: "参数",
    minWidth: "180",
    showOverflowTooltip: true,
}));
const __VLS_93 = __VLS_92({
    label: "参数",
    minWidth: "180",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_92));
__VLS_94.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_94.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.parameterNames(row));
}
var __VLS_94;
const __VLS_95 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_96 = __VLS_asFunctionalComponent(__VLS_95, new __VLS_95({
    prop: "description",
    label: "说明",
    minWidth: "240",
    showOverflowTooltip: true,
}));
const __VLS_97 = __VLS_96({
    prop: "description",
    label: "说明",
    minWidth: "240",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_96));
const __VLS_99 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(__VLS_99, new __VLS_99({
    label: "编辑器显示",
    width: "120",
    fixed: "right",
}));
const __VLS_101 = __VLS_100({
    label: "编辑器显示",
    width: "120",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
__VLS_102.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_102.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_103 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_104 = __VLS_asFunctionalComponent(__VLS_103, new __VLS_103({
        ...{ 'onChange': {} },
        modelValue: (row.is_visible),
        disabled: (!row.is_executable),
    }));
    const __VLS_105 = __VLS_104({
        ...{ 'onChange': {} },
        modelValue: (row.is_visible),
        disabled: (!row.is_executable),
    }, ...__VLS_functionalComponentArgsRest(__VLS_104));
    let __VLS_107;
    let __VLS_108;
    let __VLS_109;
    const __VLS_110 = {
        onChange: ((value) => __VLS_ctx.updateCatalogVisibility(row, value))
    };
    var __VLS_106;
}
var __VLS_102;
const __VLS_111 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_112 = __VLS_asFunctionalComponent(__VLS_111, new __VLS_111({
    label: "报表可用",
    width: "110",
    fixed: "right",
}));
const __VLS_113 = __VLS_112({
    label: "报表可用",
    width: "110",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_112));
__VLS_114.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_114.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_115 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({
        ...{ 'onChange': {} },
        modelValue: (row.is_enabled),
        disabled: (!row.is_executable || !row.is_visible),
    }));
    const __VLS_117 = __VLS_116({
        ...{ 'onChange': {} },
        modelValue: (row.is_enabled),
        disabled: (!row.is_executable || !row.is_visible),
    }, ...__VLS_functionalComponentArgsRest(__VLS_116));
    let __VLS_119;
    let __VLS_120;
    let __VLS_121;
    const __VLS_122 = {
        onChange: ((value) => __VLS_ctx.updateCatalog(row, { is_enabled: value }))
    };
    var __VLS_118;
}
var __VLS_114;
const __VLS_123 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_124 = __VLS_asFunctionalComponent(__VLS_123, new __VLS_123({
    label: "AI 可用",
    width: "110",
    fixed: "right",
}));
const __VLS_125 = __VLS_124({
    label: "AI 可用",
    width: "110",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_124));
__VLS_126.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_126.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_127 = {}.ElSwitch;
    /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_128 = __VLS_asFunctionalComponent(__VLS_127, new __VLS_127({
        ...{ 'onChange': {} },
        modelValue: (row.is_ai_enabled),
        disabled: (!row.is_executable || !row.is_enabled),
    }));
    const __VLS_129 = __VLS_128({
        ...{ 'onChange': {} },
        modelValue: (row.is_ai_enabled),
        disabled: (!row.is_executable || !row.is_enabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_128));
    let __VLS_131;
    let __VLS_132;
    let __VLS_133;
    const __VLS_134 = {
        onChange: ((value) => __VLS_ctx.updateCatalog(row, { is_ai_enabled: value }))
    };
    var __VLS_130;
}
var __VLS_126;
var __VLS_62;
var __VLS_34;
const __VLS_135 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_136 = __VLS_asFunctionalComponent(__VLS_135, new __VLS_135({
    label: (`业务/自定义函数（${__VLS_ctx.managedFunctions.length}）`),
    name: "managed",
}));
const __VLS_137 = __VLS_136({
    label: (`业务/自定义函数（${__VLS_ctx.managedFunctions.length}）`),
    name: "managed",
}, ...__VLS_functionalComponentArgsRest(__VLS_136));
__VLS_138.slots.default;
const __VLS_139 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_140 = __VLS_asFunctionalComponent(__VLS_139, new __VLS_139({
    data: (__VLS_ctx.managedFunctions),
    stripe: true,
    ...{ style: {} },
    maxHeight: "640",
}));
const __VLS_141 = __VLS_140({
    data: (__VLS_ctx.managedFunctions),
    stripe: true,
    ...{ style: {} },
    maxHeight: "640",
}, ...__VLS_functionalComponentArgsRest(__VLS_140));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_142.slots.default;
const __VLS_143 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_144 = __VLS_asFunctionalComponent(__VLS_143, new __VLS_143({
    prop: "code",
    label: "编码",
    minWidth: "130",
}));
const __VLS_145 = __VLS_144({
    prop: "code",
    label: "编码",
    minWidth: "130",
}, ...__VLS_functionalComponentArgsRest(__VLS_144));
const __VLS_147 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_148 = __VLS_asFunctionalComponent(__VLS_147, new __VLS_147({
    prop: "name",
    label: "名称",
    minWidth: "150",
}));
const __VLS_149 = __VLS_148({
    prop: "name",
    label: "名称",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_148));
const __VLS_151 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_152 = __VLS_asFunctionalComponent(__VLS_151, new __VLS_151({
    label: "类型",
    minWidth: "120",
}));
const __VLS_153 = __VLS_152({
    label: "类型",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_152));
__VLS_154.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_154.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.functionTypeLabel(row.function_type));
}
var __VLS_154;
const __VLS_155 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_156 = __VLS_asFunctionalComponent(__VLS_155, new __VLS_155({
    prop: "return_type",
    label: "返回类型",
    minWidth: "100",
}));
const __VLS_157 = __VLS_156({
    prop: "return_type",
    label: "返回类型",
    minWidth: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_156));
const __VLS_159 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
    label: "状态",
    minWidth: "90",
}));
const __VLS_161 = __VLS_160({
    label: "状态",
    minWidth: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
__VLS_162.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_162.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_163 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_164 = __VLS_asFunctionalComponent(__VLS_163, new __VLS_163({
        type: (row.is_enabled ? 'success' : 'info'),
        effect: "plain",
    }));
    const __VLS_165 = __VLS_164({
        type: (row.is_enabled ? 'success' : 'info'),
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_164));
    __VLS_166.slots.default;
    (row.is_enabled ? '启用' : '停用');
    var __VLS_166;
}
var __VLS_162;
const __VLS_167 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({
    prop: "description",
    label: "说明",
    minWidth: "220",
    showOverflowTooltip: true,
}));
const __VLS_169 = __VLS_168({
    prop: "description",
    label: "说明",
    minWidth: "220",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_168));
const __VLS_171 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({
    label: "操作",
    width: "110",
    fixed: "right",
}));
const __VLS_173 = __VLS_172({
    label: "操作",
    width: "110",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_172));
__VLS_174.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_174.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_175 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
    }));
    const __VLS_176 = __VLS_175({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.MENU),
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_175));
    let __VLS_178;
    let __VLS_179;
    let __VLS_180;
    const __VLS_181 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_177.slots.default;
    var __VLS_177;
}
var __VLS_174;
var __VLS_142;
var __VLS_138;
var __VLS_30;
var __VLS_3;
const __VLS_182 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑函数' : '新增函数'),
    width: "760px",
    top: "6vh",
}));
const __VLS_184 = __VLS_183({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑函数' : '新增函数'),
    width: "760px",
    top: "6vh",
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
__VLS_185.slots.default;
const __VLS_186 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    labelPosition: "top",
}));
const __VLS_188 = __VLS_187({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-grid" },
});
const __VLS_190 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
    label: "函数编码",
    required: true,
}));
const __VLS_192 = __VLS_191({
    label: "函数编码",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_191));
__VLS_193.slots.default;
const __VLS_194 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    modelValue: (__VLS_ctx.form.code),
    disabled: (Boolean(__VLS_ctx.editing)),
    placeholder: "如 CALC_TAX",
}));
const __VLS_196 = __VLS_195({
    modelValue: (__VLS_ctx.form.code),
    disabled: (Boolean(__VLS_ctx.editing)),
    placeholder: "如 CALC_TAX",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
var __VLS_193;
const __VLS_198 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    label: "函数名称",
    required: true,
}));
const __VLS_200 = __VLS_199({
    label: "函数名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
__VLS_201.slots.default;
const __VLS_202 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    modelValue: (__VLS_ctx.form.name),
}));
const __VLS_204 = __VLS_203({
    modelValue: (__VLS_ctx.form.name),
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
var __VLS_201;
const __VLS_206 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    label: "函数类型",
}));
const __VLS_208 = __VLS_207({
    label: "函数类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_209.slots.default;
const __VLS_210 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    modelValue: (__VLS_ctx.form.function_type),
    disabled: (Boolean(__VLS_ctx.editing)),
    ...{ style: {} },
}));
const __VLS_212 = __VLS_211({
    modelValue: (__VLS_ctx.form.function_type),
    disabled: (Boolean(__VLS_ctx.editing)),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    label: "表达式",
    value: "expression",
}));
const __VLS_216 = __VLS_215({
    label: "表达式",
    value: "expression",
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
const __VLS_218 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
    label: "系统内置",
    value: "system_builtin",
}));
const __VLS_220 = __VLS_219({
    label: "系统内置",
    value: "system_builtin",
}, ...__VLS_functionalComponentArgsRest(__VLS_219));
const __VLS_222 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_223 = __VLS_asFunctionalComponent(__VLS_222, new __VLS_222({
    label: "数据动作（首期不可执行）",
    value: "data_action",
}));
const __VLS_224 = __VLS_223({
    label: "数据动作（首期不可执行）",
    value: "data_action",
}, ...__VLS_functionalComponentArgsRest(__VLS_223));
var __VLS_213;
var __VLS_209;
const __VLS_226 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
    label: "返回类型",
}));
const __VLS_228 = __VLS_227({
    label: "返回类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_227));
__VLS_229.slots.default;
const __VLS_230 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_231 = __VLS_asFunctionalComponent(__VLS_230, new __VLS_230({
    modelValue: (__VLS_ctx.form.return_type),
    ...{ style: {} },
}));
const __VLS_232 = __VLS_231({
    modelValue: (__VLS_ctx.form.return_type),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_231));
__VLS_233.slots.default;
const __VLS_234 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    label: "数值",
    value: "number",
}));
const __VLS_236 = __VLS_235({
    label: "数值",
    value: "number",
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
const __VLS_238 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_239 = __VLS_asFunctionalComponent(__VLS_238, new __VLS_238({
    label: "文本",
    value: "string",
}));
const __VLS_240 = __VLS_239({
    label: "文本",
    value: "string",
}, ...__VLS_functionalComponentArgsRest(__VLS_239));
const __VLS_242 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_243 = __VLS_asFunctionalComponent(__VLS_242, new __VLS_242({
    label: "布尔",
    value: "bool",
}));
const __VLS_244 = __VLS_243({
    label: "布尔",
    value: "bool",
}, ...__VLS_functionalComponentArgsRest(__VLS_243));
var __VLS_233;
var __VLS_229;
const __VLS_246 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_247 = __VLS_asFunctionalComponent(__VLS_246, new __VLS_246({
    label: "说明",
}));
const __VLS_248 = __VLS_247({
    label: "说明",
}, ...__VLS_functionalComponentArgsRest(__VLS_247));
__VLS_249.slots.default;
const __VLS_250 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_252 = __VLS_251({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
var __VLS_249;
if (__VLS_ctx.form.function_type === 'expression') {
    const __VLS_254 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_255 = __VLS_asFunctionalComponent(__VLS_254, new __VLS_254({
        label: "公式体",
        required: true,
    }));
    const __VLS_256 = __VLS_255({
        label: "公式体",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_255));
    __VLS_257.slots.default;
    const __VLS_258 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_259 = __VLS_asFunctionalComponent(__VLS_258, new __VLS_258({
        modelValue: (__VLS_ctx.form.formula_body),
        type: "textarea",
        rows: (3),
        placeholder: '参数用 FIELD("amount") 引用，如 =ROUND(FIELD("amount")*0.1,2)',
    }));
    const __VLS_260 = __VLS_259({
        modelValue: (__VLS_ctx.form.formula_body),
        type: "textarea",
        rows: (3),
        placeholder: '参数用 FIELD("amount") 引用，如 =ROUND(FIELD("amount")*0.1,2)',
    }, ...__VLS_functionalComponentArgsRest(__VLS_259));
    var __VLS_257;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "section-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
const __VLS_262 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_263 = __VLS_asFunctionalComponent(__VLS_262, new __VLS_262({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_264 = __VLS_263({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_263));
let __VLS_266;
let __VLS_267;
let __VLS_268;
const __VLS_269 = {
    onClick: (__VLS_ctx.addParam)
};
__VLS_265.slots.default;
const __VLS_270 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({}));
const __VLS_272 = __VLS_271({}, ...__VLS_functionalComponentArgsRest(__VLS_271));
__VLS_273.slots.default;
const __VLS_274 = {}.Plus;
/** @type {[typeof __VLS_components.Plus, ]} */ ;
// @ts-ignore
const __VLS_275 = __VLS_asFunctionalComponent(__VLS_274, new __VLS_274({}));
const __VLS_276 = __VLS_275({}, ...__VLS_functionalComponentArgsRest(__VLS_275));
var __VLS_273;
var __VLS_265;
const __VLS_278 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_279 = __VLS_asFunctionalComponent(__VLS_278, new __VLS_278({
    data: (__VLS_ctx.form.parameters),
    border: true,
    size: "small",
    ...{ style: {} },
}));
const __VLS_280 = __VLS_279({
    data: (__VLS_ctx.form.parameters),
    border: true,
    size: "small",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_279));
__VLS_281.slots.default;
const __VLS_282 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_283 = __VLS_asFunctionalComponent(__VLS_282, new __VLS_282({
    label: "名称",
    minWidth: "140",
}));
const __VLS_284 = __VLS_283({
    label: "名称",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_283));
__VLS_285.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_285.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_286 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_287 = __VLS_asFunctionalComponent(__VLS_286, new __VLS_286({
        modelValue: (row.name),
        size: "small",
    }));
    const __VLS_288 = __VLS_287({
        modelValue: (row.name),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_287));
}
var __VLS_285;
const __VLS_290 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
    label: "类型",
    width: "120",
}));
const __VLS_292 = __VLS_291({
    label: "类型",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_291));
__VLS_293.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_293.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_294 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_295 = __VLS_asFunctionalComponent(__VLS_294, new __VLS_294({
        modelValue: (row.type),
        size: "small",
    }));
    const __VLS_296 = __VLS_295({
        modelValue: (row.type),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_295));
}
var __VLS_293;
const __VLS_298 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_299 = __VLS_asFunctionalComponent(__VLS_298, new __VLS_298({
    label: "说明",
    minWidth: "180",
}));
const __VLS_300 = __VLS_299({
    label: "说明",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_299));
__VLS_301.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_301.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_302 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_303 = __VLS_asFunctionalComponent(__VLS_302, new __VLS_302({
        modelValue: (row.description),
        size: "small",
    }));
    const __VLS_304 = __VLS_303({
        modelValue: (row.description),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_303));
}
var __VLS_301;
const __VLS_306 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_307 = __VLS_asFunctionalComponent(__VLS_306, new __VLS_306({
    label: "操作",
    width: "80",
}));
const __VLS_308 = __VLS_307({
    label: "操作",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_307));
__VLS_309.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_309.slots;
    const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_310 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
        ...{ 'onClick': {} },
        type: "danger",
        link: true,
        size: "small",
    }));
    const __VLS_312 = __VLS_311({
        ...{ 'onClick': {} },
        type: "danger",
        link: true,
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_311));
    let __VLS_314;
    let __VLS_315;
    let __VLS_316;
    const __VLS_317 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeParam($index);
        }
    };
    __VLS_313.slots.default;
    var __VLS_313;
}
var __VLS_309;
var __VLS_281;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "switch-row" },
});
const __VLS_318 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
    modelValue: (__VLS_ctx.form.is_enabled),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_320 = __VLS_319({
    modelValue: (__VLS_ctx.form.is_enabled),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_319));
const __VLS_322 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_323 = __VLS_asFunctionalComponent(__VLS_322, new __VLS_322({
    modelValue: (__VLS_ctx.form.is_sensitive_output),
    activeText: "敏感输出",
    inactiveText: "普通输出",
}));
const __VLS_324 = __VLS_323({
    modelValue: (__VLS_ctx.form.is_sensitive_output),
    activeText: "敏感输出",
    inactiveText: "普通输出",
}, ...__VLS_functionalComponentArgsRest(__VLS_323));
var __VLS_189;
{
    const { footer: __VLS_thisSlot } = __VLS_185.slots;
    const __VLS_326 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
        ...{ 'onClick': {} },
    }));
    const __VLS_328 = __VLS_327({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_327));
    let __VLS_330;
    let __VLS_331;
    let __VLS_332;
    const __VLS_333 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogOpen = false;
        }
    };
    __VLS_329.slots.default;
    var __VLS_329;
    const __VLS_334 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_335 = __VLS_asFunctionalComponent(__VLS_334, new __VLS_334({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_336 = __VLS_335({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_335));
    let __VLS_338;
    let __VLS_339;
    let __VLS_340;
    const __VLS_341 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_337.slots.default;
    var __VLS_337;
}
var __VLS_185;
/** @type {__VLS_StyleScopedClasses['page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-head']} */ ;
/** @type {__VLS_StyleScopedClasses['page-title']} */ ;
/** @type {__VLS_StyleScopedClasses['page-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['page-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['catalog-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['section-head']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-row']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Refresh: Refresh,
            PermissionButton: PermissionButton,
            MENU: MENU,
            loading: loading,
            saving: saving,
            dialogOpen: dialogOpen,
            editing: editing,
            activeTab: activeTab,
            keyword: keyword,
            statusFilter: statusFilter,
            form: form,
            baseFunctions: baseFunctions,
            managedFunctions: managedFunctions,
            functionTypeLabel: functionTypeLabel,
            supportStatusLabel: supportStatusLabel,
            supportStatusTag: supportStatusTag,
            parameterNames: parameterNames,
            updateCatalog: updateCatalog,
            updateCatalogVisibility: updateCatalogVisibility,
            load: load,
            openCreate: openCreate,
            openEdit: openEdit,
            addParam: addParam,
            removeParam: removeParam,
            save: save,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
