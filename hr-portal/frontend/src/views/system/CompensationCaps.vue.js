/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import { toolsApi, } from '@/api/tools';
const loading = ref(false);
const saving = ref(false);
const list = ref([]);
const keyword = ref('');
const dialogOpen = ref(false);
const editing = ref(null);
// 分期规则
const rulesLoading = ref(false);
const rulesSaving = ref(false);
const rules = ref([]);
const form = reactive({
    region: '',
    effective_start: '',
    effective_end: '',
    cap_amount: 0,
    note: '',
});
function money(v) {
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}
async function load() {
    loading.value = true;
    try {
        list.value = await toolsApi.listCompensationCaps({ keyword: keyword.value || undefined });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载补偿金上限失败');
    }
    finally {
        loading.value = false;
    }
}
function openCreate() {
    editing.value = null;
    Object.assign(form, {
        region: '',
        effective_start: '',
        effective_end: '',
        cap_amount: 0,
        note: '',
    });
    dialogOpen.value = true;
}
function openEdit(row) {
    editing.value = row;
    Object.assign(form, {
        region: row.region,
        effective_start: row.effective_start,
        effective_end: row.effective_end,
        cap_amount: row.cap_amount,
        note: row.note || '',
    });
    dialogOpen.value = true;
}
async function save() {
    if (!form.region.trim() || !form.effective_start || !form.effective_end || !form.cap_amount) {
        ElMessage.warning('地区、生效期间和基数上限必填');
        return;
    }
    saving.value = true;
    try {
        if (editing.value)
            await toolsApi.updateCompensationCap(editing.value.id, form);
        else
            await toolsApi.createCompensationCap(form);
        ElMessage.success('已保存');
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
async function remove(row) {
    try {
        await ElMessageBox.confirm(`删除「${row.region}」${row.effective_start} 至 ${row.effective_end} 的上限规则？`, '提示', {
            type: 'warning',
            confirmButtonText: '删除',
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        await toolsApi.removeCompensationCap(row.id);
        ElMessage.success('已删除');
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function loadRules() {
    rulesLoading.value = true;
    try {
        rules.value = await toolsApi.listInstallmentRules();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载分期规则失败');
    }
    finally {
        rulesLoading.value = false;
    }
}
function addRule() {
    const nextNo = rules.value.length ? Math.max(...rules.value.map((r) => r.period_no)) + 1 : 1;
    rules.value.push({ period_no: nextNo, ratio: 0, months_after: nextNo, pay_day: 15 });
}
function removeRule(idx) {
    rules.value.splice(idx, 1);
    rules.value.forEach((r, i) => (r.period_no = i + 1));
}
const ratioSum = () => rules.value.reduce((s, r) => s + (Number(r.ratio) || 0), 0);
async function saveRules() {
    if (!rules.value.length) {
        ElMessage.warning('至少保留一期');
        return;
    }
    if (Math.abs(ratioSum() - 100) > 0.01) {
        ElMessage.warning(`各期比例之和必须为 100%，当前为 ${ratioSum()}%`);
        return;
    }
    rulesSaving.value = true;
    try {
        rules.value = await toolsApi.saveInstallmentRules(rules.value);
        ElMessage.success('分期规则已保存');
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        rulesSaving.value = false;
    }
}
onMounted(() => {
    load();
    loadRules();
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
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
const __VLS_19 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    inline: true,
    ...{ style: {} },
}));
const __VLS_21 = __VLS_20({
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_22.slots.default;
const __VLS_23 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    ...{ 'onKeyup': {} },
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "请输入地区关键词",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_29 = __VLS_28({
    ...{ 'onKeyup': {} },
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "请输入地区关键词",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onKeyup: (__VLS_ctx.load)
};
const __VLS_35 = {
    onChange: (__VLS_ctx.load)
};
var __VLS_30;
var __VLS_26;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onClick': {} },
}));
const __VLS_42 = __VLS_41({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onClick: (__VLS_ctx.load)
};
__VLS_43.slots.default;
var __VLS_43;
const __VLS_48 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ 'onClick': {} },
    link: true,
}));
const __VLS_50 = __VLS_49({
    ...{ 'onClick': {} },
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
let __VLS_52;
let __VLS_53;
let __VLS_54;
const __VLS_55 = {
    onClick: (...[$event]) => {
        __VLS_ctx.keyword = '';
        __VLS_ctx.load();
    }
};
__VLS_51.slots.default;
var __VLS_51;
var __VLS_39;
var __VLS_22;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_56 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_58 = __VLS_57({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_59.slots.default;
const __VLS_60 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    prop: "region",
    label: "地区",
    minWidth: "120",
}));
const __VLS_62 = __VLS_61({
    prop: "region",
    label: "地区",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
const __VLS_64 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    prop: "effective_start",
    label: "生效开始日期",
    minWidth: "140",
}));
const __VLS_66 = __VLS_65({
    prop: "effective_start",
    label: "生效开始日期",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const __VLS_68 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    prop: "effective_end",
    label: "生效结束日期",
    minWidth: "140",
}));
const __VLS_70 = __VLS_69({
    prop: "effective_end",
    label: "生效结束日期",
    minWidth: "140",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
const __VLS_72 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    label: "基数上限",
    minWidth: "140",
    align: "right",
}));
const __VLS_74 = __VLS_73({
    label: "基数上限",
    minWidth: "140",
    align: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_75.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.money(row.cap_amount));
}
var __VLS_75;
const __VLS_76 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    prop: "note",
    label: "备注",
    minWidth: "180",
}));
const __VLS_78 = __VLS_77({
    prop: "note",
    label: "备注",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_79.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.note || '—');
}
var __VLS_79;
const __VLS_80 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "操作",
    width: "180",
    fixed: "right",
}));
const __VLS_82 = __VLS_81({
    label: "操作",
    width: "180",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_83.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
    }));
    const __VLS_85 = __VLS_84({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    let __VLS_87;
    let __VLS_88;
    let __VLS_89;
    const __VLS_90 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row);
        }
    };
    __VLS_86.slots.default;
    var __VLS_86;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_91 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "D",
        size: "small",
        type: "danger",
    }));
    const __VLS_92 = __VLS_91({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "D",
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_91));
    let __VLS_94;
    let __VLS_95;
    let __VLS_96;
    const __VLS_97 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(row);
        }
    };
    __VLS_93.slots.default;
    var __VLS_93;
}
var __VLS_83;
var __VLS_59;
var __VLS_3;
const __VLS_98 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({
    ...{ style: {} },
}));
const __VLS_100 = __VLS_99({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_99));
__VLS_101.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_101.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
    }));
    const __VLS_103 = __VLS_102({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    let __VLS_105;
    let __VLS_106;
    let __VLS_107;
    const __VLS_108 = {
        onClick: (__VLS_ctx.addRule)
    };
    __VLS_104.slots.default;
    const __VLS_109 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_110 = __VLS_asFunctionalComponent(__VLS_109, new __VLS_109({
        ...{ style: {} },
    }));
    const __VLS_111 = __VLS_110({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_110));
    __VLS_112.slots.default;
    const __VLS_113 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_114 = __VLS_asFunctionalComponent(__VLS_113, new __VLS_113({}));
    const __VLS_115 = __VLS_114({}, ...__VLS_functionalComponentArgsRest(__VLS_114));
    var __VLS_112;
    var __VLS_104;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        type: "primary",
        size: "small",
        loading: (__VLS_ctx.rulesSaving),
    }));
    const __VLS_118 = __VLS_117({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        type: "primary",
        size: "small",
        loading: (__VLS_ctx.rulesSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    let __VLS_120;
    let __VLS_121;
    let __VLS_122;
    const __VLS_123 = {
        onClick: (__VLS_ctx.saveRules)
    };
    __VLS_119.slots.default;
    var __VLS_119;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_124 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    data: (__VLS_ctx.rules),
    stripe: true,
    ...{ style: {} },
    maxHeight: "400",
}));
const __VLS_126 = __VLS_125({
    data: (__VLS_ctx.rules),
    stripe: true,
    ...{ style: {} },
    maxHeight: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.rulesLoading) }, null, null);
__VLS_127.slots.default;
const __VLS_128 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "期号",
    minWidth: "80",
    align: "left",
}));
const __VLS_130 = __VLS_129({
    label: "期号",
    minWidth: "80",
    align: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_131.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.period_no);
}
var __VLS_131;
const __VLS_132 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "比例(%)",
    minWidth: "140",
    align: "left",
}));
const __VLS_134 = __VLS_133({
    label: "比例(%)",
    minWidth: "140",
    align: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_135.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_136 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        modelValue: (row.ratio),
        min: (0),
        max: (100),
        precision: (2),
        step: (5),
        size: "small",
    }));
    const __VLS_138 = __VLS_137({
        modelValue: (row.ratio),
        min: (0),
        max: (100),
        precision: (2),
        step: (5),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
}
var __VLS_135;
const __VLS_140 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "离职后第几个月",
    minWidth: "160",
    align: "left",
}));
const __VLS_142 = __VLS_141({
    label: "离职后第几个月",
    minWidth: "160",
    align: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_143.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_144 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        modelValue: (row.months_after),
        min: (0),
        step: (1),
        size: "small",
    }));
    const __VLS_146 = __VLS_145({
        modelValue: (row.months_after),
        min: (0),
        step: (1),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
}
var __VLS_143;
const __VLS_148 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "当月几号付款",
    minWidth: "150",
    align: "left",
}));
const __VLS_150 = __VLS_149({
    label: "当月几号付款",
    minWidth: "150",
    align: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_151.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_152 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        modelValue: (row.pay_day),
        min: (1),
        max: (31),
        step: (1),
        size: "small",
    }));
    const __VLS_154 = __VLS_153({
        modelValue: (row.pay_day),
        min: (1),
        max: (31),
        step: (1),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
}
var __VLS_151;
const __VLS_156 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "操作",
    width: "100",
    fixed: "right",
    align: "left",
}));
const __VLS_158 = __VLS_157({
    label: "操作",
    width: "100",
    fixed: "right",
    align: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_159.slots;
    const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_160 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
        type: "danger",
    }));
    const __VLS_161 = __VLS_160({
        ...{ 'onClick': {} },
        menu: "system.compensation_caps",
        op: "U",
        size: "small",
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_160));
    let __VLS_163;
    let __VLS_164;
    let __VLS_165;
    const __VLS_166 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeRule($index);
        }
    };
    __VLS_162.slots.default;
    const __VLS_167 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_168 = __VLS_asFunctionalComponent(__VLS_167, new __VLS_167({}));
    const __VLS_169 = __VLS_168({}, ...__VLS_functionalComponentArgsRest(__VLS_168));
    __VLS_170.slots.default;
    const __VLS_171 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_172 = __VLS_asFunctionalComponent(__VLS_171, new __VLS_171({}));
    const __VLS_173 = __VLS_172({}, ...__VLS_functionalComponentArgsRest(__VLS_172));
    var __VLS_170;
    var __VLS_162;
}
var __VLS_159;
var __VLS_127;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
    ...{ style: ({ color: Math.abs(__VLS_ctx.ratioSum() - 100) > 0.01 ? 'var(--el-color-danger)' : 'var(--color-text-regular)' }) },
});
(__VLS_ctx.ratioSum());
var __VLS_101;
const __VLS_175 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_176 = __VLS_asFunctionalComponent(__VLS_175, new __VLS_175({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑补偿金上限规则' : '新增补偿金上限规则'),
    width: "480px",
}));
const __VLS_177 = __VLS_176({
    modelValue: (__VLS_ctx.dialogOpen),
    title: (__VLS_ctx.editing ? '编辑补偿金上限规则' : '新增补偿金上限规则'),
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_176));
__VLS_178.slots.default;
const __VLS_179 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
    labelPosition: "top",
}));
const __VLS_181 = __VLS_180({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_180));
__VLS_182.slots.default;
const __VLS_183 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_184 = __VLS_asFunctionalComponent(__VLS_183, new __VLS_183({
    label: "地区",
    required: true,
}));
const __VLS_185 = __VLS_184({
    label: "地区",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_184));
__VLS_186.slots.default;
const __VLS_187 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_188 = __VLS_asFunctionalComponent(__VLS_187, new __VLS_187({
    modelValue: (__VLS_ctx.form.region),
    placeholder: "如：深圳、上海、北京",
}));
const __VLS_189 = __VLS_188({
    modelValue: (__VLS_ctx.form.region),
    placeholder: "如：深圳、上海、北京",
}, ...__VLS_functionalComponentArgsRest(__VLS_188));
var __VLS_186;
const __VLS_191 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_192 = __VLS_asFunctionalComponent(__VLS_191, new __VLS_191({
    label: "生效期间",
    required: true,
}));
const __VLS_193 = __VLS_192({
    label: "生效期间",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_192));
__VLS_194.slots.default;
const __VLS_195 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_196 = __VLS_asFunctionalComponent(__VLS_195, new __VLS_195({
    modelValue: (__VLS_ctx.form.effective_start),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "开始日期",
    ...{ style: {} },
}));
const __VLS_197 = __VLS_196({
    modelValue: (__VLS_ctx.form.effective_start),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "开始日期",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_196));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ style: {} },
});
const __VLS_199 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
    modelValue: (__VLS_ctx.form.effective_end),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "结束日期",
    ...{ style: {} },
}));
const __VLS_201 = __VLS_200({
    modelValue: (__VLS_ctx.form.effective_end),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "结束日期",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_200));
var __VLS_194;
const __VLS_203 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
    label: "基数上限",
    required: true,
}));
const __VLS_205 = __VLS_204({
    label: "基数上限",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_204));
__VLS_206.slots.default;
const __VLS_207 = {}.ElInputNumber;
/** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
// @ts-ignore
const __VLS_208 = __VLS_asFunctionalComponent(__VLS_207, new __VLS_207({
    modelValue: (__VLS_ctx.form.cap_amount),
    min: (0),
    precision: (2),
    step: (1000),
    ...{ style: {} },
}));
const __VLS_209 = __VLS_208({
    modelValue: (__VLS_ctx.form.cap_amount),
    min: (0),
    precision: (2),
    step: (1000),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_208));
var __VLS_206;
const __VLS_211 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
    label: "备注",
}));
const __VLS_213 = __VLS_212({
    label: "备注",
}, ...__VLS_functionalComponentArgsRest(__VLS_212));
__VLS_214.slots.default;
const __VLS_215 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
    modelValue: (__VLS_ctx.form.note),
    type: "textarea",
    rows: (3),
    placeholder: "可选",
}));
const __VLS_217 = __VLS_216({
    modelValue: (__VLS_ctx.form.note),
    type: "textarea",
    rows: (3),
    placeholder: "可选",
}, ...__VLS_functionalComponentArgsRest(__VLS_216));
var __VLS_214;
var __VLS_182;
{
    const { footer: __VLS_thisSlot } = __VLS_178.slots;
    const __VLS_219 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
        ...{ 'onClick': {} },
    }));
    const __VLS_221 = __VLS_220({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_220));
    let __VLS_223;
    let __VLS_224;
    let __VLS_225;
    const __VLS_226 = {
        onClick: (...[$event]) => {
            __VLS_ctx.dialogOpen = false;
        }
    };
    __VLS_222.slots.default;
    var __VLS_222;
    const __VLS_227 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_229 = __VLS_228({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_228));
    let __VLS_231;
    let __VLS_232;
    let __VLS_233;
    const __VLS_234 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_230.slots.default;
    var __VLS_230;
}
var __VLS_178;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            PermissionButton: PermissionButton,
            loading: loading,
            saving: saving,
            list: list,
            keyword: keyword,
            dialogOpen: dialogOpen,
            editing: editing,
            rulesLoading: rulesLoading,
            rulesSaving: rulesSaving,
            rules: rules,
            form: form,
            money: money,
            load: load,
            openCreate: openCreate,
            openEdit: openEdit,
            save: save,
            remove: remove,
            addRule: addRule,
            removeRule: removeRule,
            ratioSum: ratioSum,
            saveRules: saveRules,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
