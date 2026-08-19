/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, reactive, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import { adapterRegistryApi } from '@/api/ucp';
const ADAPTER_TYPES = ['HTTP', 'DB', 'FILE', 'EVENT', 'TRANSFORM', 'CUSTOM'];
const rows = ref([]);
const loading = ref(false);
const filters = reactive({
    adapter_type: null,
    is_active: null,
    keyword: '',
});
const dialogVisible = ref(false);
const submitting = ref(false);
const form = reactive({
    adapter_code: '',
    adapter_type: 'HTTP',
    name: '',
    description: '',
    version: '1.0.0',
});
const schemaText = ref('');
const sampleText = ref('');
const formRef = ref();
const detailVisible = ref(false);
const detailData = ref(null);
const formRules = computed(() => ({
    adapter_code: [
        { required: true, message: '请输入 code', trigger: 'blur' },
        {
            validator: (_, v, cb) => {
                if (!/^[A-Z][A-Z0-9_]{2,63}$/.test(v || '')) {
                    cb(new Error('需 ^[A-Z][A-Z0-9_]{2,63}$'));
                }
                else
                    cb();
            },
            trigger: 'blur',
        },
    ],
    adapter_type: [{ required: true, message: '请选择类型', trigger: 'change' }],
    name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
}));
async function loadList() {
    loading.value = true;
    try {
        const params = {};
        if (filters.adapter_type)
            params.adapter_type = filters.adapter_type;
        if (filters.is_active !== null)
            params.is_active = filters.is_active;
        if (filters.keyword)
            params.keyword = filters.keyword;
        rows.value = await adapterRegistryApi.list(params);
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ElMessage.error(`加载失败: ${msg}`);
    }
    finally {
        loading.value = false;
    }
}
function resetFilters() {
    filters.adapter_type = null;
    filters.is_active = null;
    filters.keyword = '';
    loadList();
}
function openCreateDialog() {
    form.adapter_code = '';
    form.adapter_type = 'HTTP';
    form.name = '';
    form.description = '';
    form.version = '1.0.0';
    schemaText.value = '';
    sampleText.value = '';
    dialogVisible.value = true;
}
async function submitForm() {
    if (!formRef.value)
        return;
    try {
        await formRef.value.validate();
    }
    catch {
        return;
    }
    let schema;
    if (schemaText.value.trim()) {
        try {
            schema = JSON.parse(schemaText.value);
        }
        catch (e) {
            ElMessage.error('Schema JSON 格式错误');
            return;
        }
    }
    let sample;
    if (sampleText.value.trim()) {
        try {
            sample = JSON.parse(sampleText.value);
        }
        catch (e) {
            ElMessage.error('样例 JSON 格式错误');
            return;
        }
    }
    submitting.value = true;
    try {
        await adapterRegistryApi.register({
            adapter_code: form.adapter_code,
            adapter_type: form.adapter_type,
            name: form.name,
            description: form.description || undefined,
            version: form.version,
            schema,
            sample_payload: sample,
        });
        ElMessage.success('注册成功');
        dialogVisible.value = false;
        loadList();
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ElMessage.error(`注册失败: ${msg}`);
    }
    finally {
        submitting.value = false;
    }
}
async function toggleActive(row) {
    const action = row.is_active ? '停用' : '启用';
    try {
        await ElMessageBox.confirm(`确认${action} ${row.adapter_code}?`, '提示', { type: 'warning' });
        await adapterRegistryApi.activate(row.adapter_code, !row.is_active);
        ElMessage.success(`已${action}`);
        loadList();
    }
    catch {
        // cancelled
    }
}
async function removeAdapter(row) {
    try {
        await ElMessageBox.confirm(`确认删除 ${row.adapter_code}?`, '危险操作', {
            type: 'error',
        });
        await adapterRegistryApi.remove(row.adapter_code);
        ElMessage.success('已删除');
        loadList();
    }
    catch (e) {
        if (e === 'cancel')
            return;
        const msg = e instanceof Error ? e.message : String(e);
        ElMessage.error(`删除失败: ${msg}`);
    }
}
async function viewAdapter(row) {
    try {
        detailData.value = await adapterRegistryApi.get(row.adapter_code);
        detailVisible.value = true;
    }
    catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        ElMessage.error(`查询失败: ${msg}`);
    }
}
onMounted(loadList);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "adapter-registry-page" },
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
        ...{ class: "page-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "sub" },
    });
    const __VLS_4 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onClick': {} },
        type: "primary",
        icon: (__VLS_ctx.Plus),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onClick: (__VLS_ctx.openCreateDialog)
    };
    __VLS_7.slots.default;
    var __VLS_7;
}
const __VLS_12 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    inline: true,
    model: (__VLS_ctx.filters),
    ...{ class: "filter-bar" },
}));
const __VLS_14 = __VLS_13({
    inline: true,
    model: (__VLS_ctx.filters),
    ...{ class: "filter-bar" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_15.slots.default;
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "类型",
}));
const __VLS_18 = __VLS_17({
    label: "类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.filters.adapter_type),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.filters.adapter_type),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
__VLS_23.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.ADAPTER_TYPES))) {
    const __VLS_24 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
        key: (t),
        label: (t),
        value: (t),
    }));
    const __VLS_26 = __VLS_25({
        key: (t),
        label: (t),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_25));
}
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "状态",
}));
const __VLS_30 = __VLS_29({
    label: "状态",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    modelValue: (__VLS_ctx.filters.is_active),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}));
const __VLS_34 = __VLS_33({
    modelValue: (__VLS_ctx.filters.is_active),
    clearable: true,
    placeholder: "全部",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    label: "已启用",
    value: (true),
}));
const __VLS_38 = __VLS_37({
    label: "已启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
const __VLS_40 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    label: "未启用",
    value: (false),
}));
const __VLS_42 = __VLS_41({
    label: "未启用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
var __VLS_35;
var __VLS_31;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "关键字",
}));
const __VLS_46 = __VLS_45({
    label: "关键字",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.keyword),
    clearable: true,
    placeholder: "按名称搜索",
    ...{ style: {} },
}));
const __VLS_50 = __VLS_49({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.filters.keyword),
    clearable: true,
    placeholder: "按名称搜索",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onKeyup: (__VLS_ctx.loadList)
};
var __VLS_51;
var __VLS_47;
const __VLS_56 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
const __VLS_60 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    ...{ 'onClick': {} },
}));
const __VLS_62 = __VLS_61({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
let __VLS_64;
let __VLS_65;
let __VLS_66;
const __VLS_67 = {
    onClick: (__VLS_ctx.loadList)
};
__VLS_63.slots.default;
var __VLS_63;
const __VLS_68 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    ...{ 'onClick': {} },
}));
const __VLS_70 = __VLS_69({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
let __VLS_72;
let __VLS_73;
let __VLS_74;
const __VLS_75 = {
    onClick: (__VLS_ctx.resetFilters)
};
__VLS_71.slots.default;
var __VLS_71;
var __VLS_59;
var __VLS_15;
const __VLS_76 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
}));
const __VLS_78 = __VLS_77({
    data: (__VLS_ctx.rows),
    stripe: true,
    border: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_79.slots.default;
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    prop: "adapter_code",
    label: "Code",
    width: "200",
}));
const __VLS_82 = __VLS_81({
    prop: "adapter_code",
    label: "Code",
    width: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
    (row.adapter_code);
    if (row.is_active) {
        const __VLS_84 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            type: "success",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_86 = __VLS_85({
            type: "success",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        var __VLS_87;
    }
    else {
        const __VLS_88 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
            type: "info",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_90 = __VLS_89({
            type: "info",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_89));
        __VLS_91.slots.default;
        var __VLS_91;
    }
}
var __VLS_83;
const __VLS_92 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    prop: "adapter_type",
    label: "类型",
    width: "120",
}));
const __VLS_94 = __VLS_93({
    prop: "adapter_type",
    label: "类型",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_95.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_95.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_96 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        size: "small",
    }));
    const __VLS_98 = __VLS_97({
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    (row.adapter_type);
    var __VLS_99;
}
var __VLS_95;
const __VLS_100 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    prop: "name",
    label: "名称",
    minWidth: "160",
}));
const __VLS_102 = __VLS_101({
    prop: "name",
    label: "名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    prop: "version",
    label: "版本",
    width: "100",
}));
const __VLS_106 = __VLS_105({
    prop: "version",
    label: "版本",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
const __VLS_108 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    prop: "description",
    label: "描述",
    minWidth: "200",
    showOverflowTooltip: true,
}));
const __VLS_110 = __VLS_109({
    prop: "description",
    label: "描述",
    minWidth: "200",
    showOverflowTooltip: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
const __VLS_112 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    prop: "created_by",
    label: "创建人",
    width: "120",
}));
const __VLS_114 = __VLS_113({
    prop: "created_by",
    label: "创建人",
    width: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
const __VLS_116 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    prop: "created_at",
    label: "创建时间",
    width: "180",
}));
const __VLS_118 = __VLS_117({
    prop: "created_at",
    label: "创建时间",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_119.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_119.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "muted" },
    });
    (__VLS_ctx.formatDateTime(row.created_at));
}
var __VLS_119;
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    label: "操作",
    width: "240",
    fixed: "right",
}));
const __VLS_122 = __VLS_121({
    label: "操作",
    width: "240",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
__VLS_123.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_123.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            __VLS_ctx.viewAdapter(row);
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    const __VLS_132 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: (row.is_active ? 'warning' : 'success'),
    }));
    const __VLS_134 = __VLS_133({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: (row.is_active ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    let __VLS_136;
    let __VLS_137;
    let __VLS_138;
    const __VLS_139 = {
        onClick: (...[$event]) => {
            __VLS_ctx.toggleActive(row);
        }
    };
    __VLS_135.slots.default;
    (row.is_active ? '停用' : '启用');
    var __VLS_135;
    const __VLS_140 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
        disabled: (row.is_active),
    }));
    const __VLS_142 = __VLS_141({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
        disabled: (row.is_active),
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    let __VLS_144;
    let __VLS_145;
    let __VLS_146;
    const __VLS_147 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeAdapter(row);
        }
    };
    __VLS_143.slots.default;
    var __VLS_143;
}
var __VLS_123;
var __VLS_79;
var __VLS_3;
const __VLS_148 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    modelValue: (__VLS_ctx.dialogVisible),
    title: "注册 Adapter",
    width: "640px",
    closeOnClickModal: (false),
}));
const __VLS_150 = __VLS_149({
    modelValue: (__VLS_ctx.dialogVisible),
    title: "注册 Adapter",
    width: "640px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
const __VLS_152 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    model: (__VLS_ctx.form),
    labelWidth: "120px",
    rules: (__VLS_ctx.formRules),
    ref: "formRef",
}));
const __VLS_154 = __VLS_153({
    model: (__VLS_ctx.form),
    labelWidth: "120px",
    rules: (__VLS_ctx.formRules),
    ref: "formRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_156 = {};
__VLS_155.slots.default;
const __VLS_158 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_159 = __VLS_asFunctionalComponent(__VLS_158, new __VLS_158({
    label: "Adapter Code",
    prop: "adapter_code",
}));
const __VLS_160 = __VLS_159({
    label: "Adapter Code",
    prop: "adapter_code",
}, ...__VLS_functionalComponentArgsRest(__VLS_159));
__VLS_161.slots.default;
const __VLS_162 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_163 = __VLS_asFunctionalComponent(__VLS_162, new __VLS_162({
    modelValue: (__VLS_ctx.form.adapter_code),
    placeholder: "大写字母+下划线, e.g. CUSTOM_BILL_PULL",
}));
const __VLS_164 = __VLS_163({
    modelValue: (__VLS_ctx.form.adapter_code),
    placeholder: "大写字母+下划线, e.g. CUSTOM_BILL_PULL",
}, ...__VLS_functionalComponentArgsRest(__VLS_163));
var __VLS_161;
const __VLS_166 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_167 = __VLS_asFunctionalComponent(__VLS_166, new __VLS_166({
    label: "类型",
    prop: "adapter_type",
}));
const __VLS_168 = __VLS_167({
    label: "类型",
    prop: "adapter_type",
}, ...__VLS_functionalComponentArgsRest(__VLS_167));
__VLS_169.slots.default;
const __VLS_170 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_171 = __VLS_asFunctionalComponent(__VLS_170, new __VLS_170({
    modelValue: (__VLS_ctx.form.adapter_type),
    placeholder: "选择类型",
    ...{ style: {} },
}));
const __VLS_172 = __VLS_171({
    modelValue: (__VLS_ctx.form.adapter_type),
    placeholder: "选择类型",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_171));
__VLS_173.slots.default;
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.ADAPTER_TYPES))) {
    const __VLS_174 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
        key: (t),
        label: (t),
        value: (t),
    }));
    const __VLS_176 = __VLS_175({
        key: (t),
        label: (t),
        value: (t),
    }, ...__VLS_functionalComponentArgsRest(__VLS_175));
}
var __VLS_173;
var __VLS_169;
const __VLS_178 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_179 = __VLS_asFunctionalComponent(__VLS_178, new __VLS_178({
    label: "名称",
    prop: "name",
}));
const __VLS_180 = __VLS_179({
    label: "名称",
    prop: "name",
}, ...__VLS_functionalComponentArgsRest(__VLS_179));
__VLS_181.slots.default;
const __VLS_182 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_183 = __VLS_asFunctionalComponent(__VLS_182, new __VLS_182({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
    showWordLimit: true,
}));
const __VLS_184 = __VLS_183({
    modelValue: (__VLS_ctx.form.name),
    maxlength: "128",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_183));
var __VLS_181;
const __VLS_186 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_187 = __VLS_asFunctionalComponent(__VLS_186, new __VLS_186({
    label: "描述",
}));
const __VLS_188 = __VLS_187({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_187));
__VLS_189.slots.default;
const __VLS_190 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_191 = __VLS_asFunctionalComponent(__VLS_190, new __VLS_190({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_192 = __VLS_191({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_191));
var __VLS_189;
const __VLS_194 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    label: "版本",
}));
const __VLS_196 = __VLS_195({
    label: "版本",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
__VLS_197.slots.default;
const __VLS_198 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_199 = __VLS_asFunctionalComponent(__VLS_198, new __VLS_198({
    modelValue: (__VLS_ctx.form.version),
    placeholder: "1.0.0",
}));
const __VLS_200 = __VLS_199({
    modelValue: (__VLS_ctx.form.version),
    placeholder: "1.0.0",
}, ...__VLS_functionalComponentArgsRest(__VLS_199));
var __VLS_197;
const __VLS_202 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_203 = __VLS_asFunctionalComponent(__VLS_202, new __VLS_202({
    label: "Schema (JSON)",
}));
const __VLS_204 = __VLS_203({
    label: "Schema (JSON)",
}, ...__VLS_functionalComponentArgsRest(__VLS_203));
__VLS_205.slots.default;
const __VLS_206 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_207 = __VLS_asFunctionalComponent(__VLS_206, new __VLS_206({
    modelValue: (__VLS_ctx.schemaText),
    type: "textarea",
    rows: (6),
    placeholder: '{"fields": [{"name": "id", "type": "string", "required": true}]}',
}));
const __VLS_208 = __VLS_207({
    modelValue: (__VLS_ctx.schemaText),
    type: "textarea",
    rows: (6),
    placeholder: '{"fields": [{"name": "id", "type": "string", "required": true}]}',
}, ...__VLS_functionalComponentArgsRest(__VLS_207));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "hint" },
});
var __VLS_205;
const __VLS_210 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_211 = __VLS_asFunctionalComponent(__VLS_210, new __VLS_210({
    label: "样例 Payload",
}));
const __VLS_212 = __VLS_211({
    label: "样例 Payload",
}, ...__VLS_functionalComponentArgsRest(__VLS_211));
__VLS_213.slots.default;
const __VLS_214 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({
    modelValue: (__VLS_ctx.sampleText),
    type: "textarea",
    rows: (4),
    placeholder: '{"employee_no": "E001", "name": "张三"}',
}));
const __VLS_216 = __VLS_215({
    modelValue: (__VLS_ctx.sampleText),
    type: "textarea",
    rows: (4),
    placeholder: '{"employee_no": "E001", "name": "张三"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_215));
var __VLS_213;
var __VLS_155;
{
    const { footer: __VLS_thisSlot } = __VLS_151.slots;
    const __VLS_218 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_219 = __VLS_asFunctionalComponent(__VLS_218, new __VLS_218({
        ...{ 'onClick': {} },
    }));
    const __VLS_220 = __VLS_219({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_219));
    let __VLS_222;
    let __VLS_223;
    let __VLS_224;
    const __VLS_225 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogVisible = false;
        }
    };
    __VLS_221.slots.default;
    var __VLS_221;
    const __VLS_226 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_227 = __VLS_asFunctionalComponent(__VLS_226, new __VLS_226({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_228 = __VLS_227({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_227));
    let __VLS_230;
    let __VLS_231;
    let __VLS_232;
    const __VLS_233 = {
        onClick: (__VLS_ctx.submitForm)
    };
    __VLS_229.slots.default;
    var __VLS_229;
}
var __VLS_151;
const __VLS_234 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_235 = __VLS_asFunctionalComponent(__VLS_234, new __VLS_234({
    modelValue: (__VLS_ctx.detailVisible),
    title: "Adapter 详情",
    width: "720px",
}));
const __VLS_236 = __VLS_235({
    modelValue: (__VLS_ctx.detailVisible),
    title: "Adapter 详情",
    width: "720px",
}, ...__VLS_functionalComponentArgsRest(__VLS_235));
__VLS_237.slots.default;
if (__VLS_ctx.detailData) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.pre, __VLS_intrinsicElements.pre)({
        ...{ class: "json-block" },
    });
    (JSON.stringify(__VLS_ctx.detailData, null, 2));
}
var __VLS_237;
/** @type {__VLS_StyleScopedClasses['adapter-registry-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub']} */ ;
/** @type {__VLS_StyleScopedClasses['filter-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['json-block']} */ ;
// @ts-ignore
var __VLS_157 = __VLS_156;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            Plus: Plus,
            ADAPTER_TYPES: ADAPTER_TYPES,
            rows: rows,
            loading: loading,
            filters: filters,
            dialogVisible: dialogVisible,
            submitting: submitting,
            form: form,
            schemaText: schemaText,
            sampleText: sampleText,
            formRef: formRef,
            detailVisible: detailVisible,
            detailData: detailData,
            formRules: formRules,
            loadList: loadList,
            resetFilters: resetFilters,
            openCreateDialog: openCreateDialog,
            submitForm: submitForm,
            toggleActive: toggleActive,
            removeAdapter: removeAdapter,
            viewAdapter: viewAdapter,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
