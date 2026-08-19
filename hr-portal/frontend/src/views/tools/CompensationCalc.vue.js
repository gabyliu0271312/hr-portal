/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { QuestionFilled, Search, Plus, Delete, Document, Printer } from '@element-plus/icons-vue';
import { toolsApi, } from '@/api/tools';
import DocumentPaperPreview from '@/components/document/DocumentPaperPreview.vue';
import { printPdfBlob } from '@/utils/printPdf';
const route = useRoute();
const router = useRouter();
const keyword = ref('');
const searching = ref(false);
const calculating = ref(false);
const employees = ref([]);
const selected = ref(null);
const leaveDate = ref('');
const leaveDateInvalid = ref(false);
const plan = ref('N+1');
const region = ref(null);
const result = ref(null);
// 解除协议生成
const agreementOpen = ref(false);
const agreementLoading = ref(false);
const previewing = ref(false);
const downloading = ref(false);
const agreement = ref(null);
const previewHtml = ref('');
const originalPreviewHtml = ref('');
const previewRef = ref(null);
const draftAdjusted = ref(false);
const busy = computed(() => searching.value || calculating.value);
function money(v) {
    if (v === null || v === undefined)
        return '—';
    return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
async function searchAndCalculate() {
    if (!keyword.value.trim()) {
        ElMessage.warning('请输入工号、中文名或英文名');
        return;
    }
    searching.value = true;
    result.value = null;
    selected.value = null;
    try {
        employees.value = await toolsApi.searchCompensationEmployees({ keyword: keyword.value.trim(), limit: 30 });
        if (!employees.value.length) {
            ElMessage.info('未找到有权限查看的员工');
        }
        else if (employees.value.length === 1) {
            pickEmployee(employees.value[0]);
        }
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '查询员工失败');
    }
    finally {
        searching.value = false;
    }
}
function pickEmployee(row) {
    selected.value = row;
    employees.value = [row];
    if (row.leave_date)
        leaveDate.value = row.leave_date;
    calculate();
}
async function pickEmployeeFromAi(row) {
    selected.value = row;
    employees.value = [row];
    if (row.leave_date && !leaveDate.value)
        leaveDate.value = row.leave_date;
    await calculate();
}
function rowClassName({ row }) {
    return selected.value && row.id === selected.value.id ? 'is-selected-row' : '';
}
function leaveDateDisplay(row) {
    if (row.leave_date)
        return row.leave_date;
    if (selected.value && row.id === selected.value.id && leaveDate.value)
        return leaveDate.value;
    return '—';
}
async function calculate() {
    if (!selected.value)
        return;
    if (!leaveDate.value) {
        leaveDateInvalid.value = true;
        result.value = null;
        ElMessage.warning(`「${selected.value.name || '该员工'}」花名册无离职日期，请先手动选择离职日期再计算`);
        return;
    }
    leaveDateInvalid.value = false;
    calculating.value = true;
    try {
        result.value = await toolsApi.calculateCompensation({
            employee_id: selected.value.id,
            leave_date: leaveDate.value || null,
            plan: plan.value,
            region: region.value || null,
        });
    }
    catch (e) {
        result.value = null;
        ElMessage.error(`已找到「${selected.value.name || ''}」，但${e?.response?.data?.detail || '计算失败'}`);
    }
    finally {
        calculating.value = false;
    }
}
// 离职日期 / 方案 改动后自动重算（前提是已选中员工）
watch([leaveDate, plan], () => {
    if (selected.value)
        calculate();
});
function queryString(value) {
    return typeof value === 'string' ? value.trim() : '';
}
async function hydrateFromAiQuery() {
    if (route.query.ai !== '1')
        return;
    const queryPlan = queryString(route.query.plan).toUpperCase();
    plan.value = queryPlan === 'N' ? 'N' : 'N+1';
    const queryLeaveDate = queryString(route.query.leave_date);
    if (queryLeaveDate)
        leaveDate.value = queryLeaveDate;
    const queryRegion = queryString(route.query.region);
    region.value = queryRegion || null;
    const employeeId = Number(route.query.employee_id || 0);
    const queryKeyword = queryString(route.query.keyword);
    if (queryKeyword)
        keyword.value = queryKeyword;
    try {
        if (employeeId) {
            const list = await toolsApi.searchCompensationEmployees({
                keyword: queryKeyword || String(employeeId),
                limit: 50,
            });
            const found = list.find((item) => item.id === employeeId);
            if (found) {
                await pickEmployeeFromAi(found);
                ElMessage.success('已从 AI 助手带入员工并完成试算');
            }
            else {
                employees.value = list;
                ElMessage.warning('AI 带入的员工不在当前可见候选中，请手动选择');
            }
        }
        else if (queryKeyword) {
            await searchAndCalculate();
        }
    }
    finally {
        const { ai, employee_id, keyword: _keyword, leave_date, plan: _plan, region: _region, ...rest } = route.query;
        router.replace({ path: route.path, query: rest });
    }
}
onMounted(() => {
    hydrateFromAiQuery();
});
function resetAll() {
    keyword.value = '';
    employees.value = [];
    selected.value = null;
    leaveDate.value = '';
    leaveDateInvalid.value = false;
    plan.value = 'N+1';
    region.value = null;
    result.value = null;
    previewHtml.value = '';
    originalPreviewHtml.value = '';
    draftAdjusted.value = false;
}
async function openAgreement() {
    if (!selected.value)
        return;
    agreementOpen.value = true;
    agreementLoading.value = true;
    previewHtml.value = '';
    originalPreviewHtml.value = '';
    draftAdjusted.value = false;
    agreement.value = null;
    try {
        agreement.value = await toolsApi.prepareAgreement({
            employee_id: selected.value.id,
            leave_date: leaveDate.value || null,
            plan: plan.value,
            region: region.value || null,
        });
        await refreshPreview();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '生成协议数据失败');
        agreementOpen.value = false;
    }
    finally {
        agreementLoading.value = false;
    }
}
const installmentSum = () => (agreement.value?.installments || []).reduce((s, it) => s + (Number(it.amount) || 0), 0);
function addInstallment() {
    if (!agreement.value)
        return;
    agreement.value.installments.push({ pay_date: agreement.value.last_work_date, amount: 0 });
}
function removeInstallment(idx) {
    agreement.value?.installments.splice(idx, 1);
}
async function refreshPreview() {
    if (!agreement.value)
        return;
    if (draftAdjusted.value) {
        try {
            await ElMessageBox.confirm('重新生成会覆盖当前预览中的人工修改，是否继续？', '确认重新生成', {
                confirmButtonText: '继续',
                cancelButtonText: '取消',
                type: 'warning',
            });
        }
        catch {
            return;
        }
    }
    previewing.value = true;
    try {
        previewHtml.value = await toolsApi.previewAgreement(agreement.value);
        originalPreviewHtml.value = previewHtml.value;
        draftAdjusted.value = false;
        await nextTick();
        previewRef.value?.setHtml(previewHtml.value);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '预览失败');
    }
    finally {
        previewing.value = false;
    }
}
function resetPreviewDraft() {
    previewHtml.value = originalPreviewHtml.value;
    previewRef.value?.setHtml(originalPreviewHtml.value);
}
function currentDraft() {
    const html = previewRef.value?.getHtml() || previewHtml.value;
    return {
        draft_html: draftAdjusted.value ? html : null,
        manually_adjusted: draftAdjusted.value,
    };
}
async function downloadDocx() {
    if (!agreement.value)
        return;
    downloading.value = true;
    try {
        const resp = await toolsApi.downloadAgreement(agreement.value, currentDraft());
        const blob = new Blob([resp.data], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `解除劳动合同协议书_${agreement.value.name || '员工'}.docx`;
        a.click();
        URL.revokeObjectURL(url);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '下载失败');
    }
    finally {
        downloading.value = false;
    }
}
async function printAgreement() {
    if (!previewHtml.value)
        return;
    if (!agreement.value)
        return;
    try {
        const resp = await toolsApi.downloadAgreementPdf(agreement.value, currentDraft());
        printPdfBlob(new Blob([resp.data], { type: 'application/pdf' }));
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '打印失败');
    }
}
const printing = ref(false);
async function printDirect() {
    if (!selected.value)
        return;
    printing.value = true;
    try {
        const data = await toolsApi.prepareAgreement({
            employee_id: selected.value.id,
            leave_date: leaveDate.value || null,
            plan: plan.value,
            region: region.value || null,
        });
        previewHtml.value = await toolsApi.previewAgreement(data);
        originalPreviewHtml.value = previewHtml.value;
        draftAdjusted.value = false;
        await nextTick();
        previewRef.value?.setHtml(previewHtml.value);
        agreement.value = data;
        await printAgreement();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '生成协议失败');
    }
    finally {
        printing.value = false;
    }
}
const resultRow = computed(() => {
    if (!result.value)
        return [];
    const r = result.value;
    const row = {
        employee_no: r.employee.employee_no || '—',
        name: r.employee.name || '—',
        hire_date: r.hire_date,
        leave_date: r.leave_date,
        work_region: r.work_region,
        basic_salary: money(r.basic_salary),
        cap_amount: money(r.cap_amount),
        compensation_base: money(r.compensation_base),
        service_years_n: r.service_years_n,
        plan: r.plan,
        n_amount: money(r.n_amount),
        extra_amount: money(r.extra_amount),
        total_amount: money(r.total_amount),
    };
    return [row];
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['date-invalid']} */ ;
/** @type {__VLS_StyleScopedClasses['el-input__wrapper']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "comp-calc" },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    bodyStyle: "padding: 16px",
}));
const __VLS_2 = __VLS_1({
    bodyStyle: "padding: 16px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_4 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        placement: "right",
        content: "员工搜索结果会自动叠加当前账号的数据范围权限。若员工重名，请从候选列表中选择正确人员。",
    }));
    const __VLS_6 = __VLS_5({
        placement: "right",
        content: "员工搜索结果会自动叠加当前账号的数据范围权限。若员工重名，请从候选列表中选择正确人员。",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.QuestionFilled;
    /** @type {[typeof __VLS_components.QuestionFilled, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    var __VLS_7;
    if (__VLS_ctx.result) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        const __VLS_16 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            loading: (__VLS_ctx.agreementLoading),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            type: "primary",
            plain: true,
            loading: (__VLS_ctx.agreementLoading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (__VLS_ctx.openAgreement)
        };
        __VLS_19.slots.default;
        const __VLS_24 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            ...{ style: {} },
        }));
        const __VLS_26 = __VLS_25({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_27.slots.default;
        const __VLS_28 = {}.Document;
        /** @type {[typeof __VLS_components.Document, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
        const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
        var __VLS_27;
        var __VLS_19;
        const __VLS_32 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.printing),
        }));
        const __VLS_34 = __VLS_33({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.printing),
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        let __VLS_36;
        let __VLS_37;
        let __VLS_38;
        const __VLS_39 = {
            onClick: (__VLS_ctx.printDirect)
        };
        __VLS_35.slots.default;
        const __VLS_40 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
            ...{ style: {} },
        }));
        const __VLS_42 = __VLS_41({
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_41));
        __VLS_43.slots.default;
        const __VLS_44 = {}.Printer;
        /** @type {[typeof __VLS_components.Printer, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({}));
        const __VLS_46 = __VLS_45({}, ...__VLS_functionalComponentArgsRest(__VLS_45));
        var __VLS_43;
        var __VLS_35;
    }
}
const __VLS_48 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    ...{ class: "op-bar" },
}));
const __VLS_50 = __VLS_49({
    ...{ class: "op-bar" },
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "op-row" },
});
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "工号 / 中文名 / 英文名",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_58 = __VLS_57({
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.keyword),
    placeholder: "工号 / 中文名 / 英文名",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onKeyup: (__VLS_ctx.searchAndCalculate)
};
__VLS_59.slots.default;
{
    const { prefix: __VLS_thisSlot } = __VLS_59.slots;
    const __VLS_64 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({}));
    const __VLS_66 = __VLS_65({}, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    const __VLS_68 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({}));
    const __VLS_70 = __VLS_69({}, ...__VLS_functionalComponentArgsRest(__VLS_69));
    var __VLS_67;
}
var __VLS_59;
var __VLS_55;
const __VLS_72 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    label: "离职日期",
}));
const __VLS_74 = __VLS_73({
    label: "离职日期",
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: ({ 'date-invalid': __VLS_ctx.leaveDateInvalid }) },
});
const __VLS_76 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    modelValue: (__VLS_ctx.leaveDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "离职日期",
    ...{ style: {} },
}));
const __VLS_78 = __VLS_77({
    modelValue: (__VLS_ctx.leaveDate),
    type: "date",
    valueFormat: "YYYY-MM-DD",
    placeholder: "离职日期",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
var __VLS_75;
const __VLS_80 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    label: "方案",
}));
const __VLS_82 = __VLS_81({
    label: "方案",
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_83.slots.default;
const __VLS_84 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    modelValue: (__VLS_ctx.plan),
}));
const __VLS_86 = __VLS_85({
    modelValue: (__VLS_ctx.plan),
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
const __VLS_88 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    value: "N+1",
}));
const __VLS_90 = __VLS_89({
    value: "N+1",
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
const __VLS_92 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    value: "N",
}));
const __VLS_94 = __VLS_93({
    value: "N",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
var __VLS_87;
var __VLS_83;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "op-row" },
});
const __VLS_96 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
__VLS_99.slots.default;
const __VLS_100 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.busy),
}));
const __VLS_102 = __VLS_101({
    ...{ 'onClick': {} },
    type: "primary",
    loading: (__VLS_ctx.busy),
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
let __VLS_104;
let __VLS_105;
let __VLS_106;
const __VLS_107 = {
    onClick: (__VLS_ctx.searchAndCalculate)
};
__VLS_103.slots.default;
const __VLS_108 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ style: {} },
}));
const __VLS_110 = __VLS_109({
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
__VLS_111.slots.default;
const __VLS_112 = {}.Search;
/** @type {[typeof __VLS_components.Search, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({}));
const __VLS_114 = __VLS_113({}, ...__VLS_functionalComponentArgsRest(__VLS_113));
var __VLS_111;
var __VLS_103;
const __VLS_116 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    ...{ 'onClick': {} },
    link: true,
}));
const __VLS_118 = __VLS_117({
    ...{ 'onClick': {} },
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
let __VLS_120;
let __VLS_121;
let __VLS_122;
const __VLS_123 = {
    onClick: (__VLS_ctx.resetAll)
};
__VLS_119.slots.default;
var __VLS_119;
var __VLS_99;
var __VLS_51;
if (__VLS_ctx.employees.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    (__VLS_ctx.employees.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_124 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.employees),
        stripe: true,
        highlightCurrentRow: true,
        size: "small",
        maxHeight: "220",
        ...{ style: {} },
        rowClassName: (__VLS_ctx.rowClassName),
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.employees),
        stripe: true,
        highlightCurrentRow: true,
        size: "small",
        maxHeight: "220",
        ...{ style: {} },
        rowClassName: (__VLS_ctx.rowClassName),
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onRowClick: (__VLS_ctx.pickEmployee)
    };
    __VLS_127.slots.default;
    const __VLS_132 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }));
    const __VLS_134 = __VLS_133({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    const __VLS_136 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }));
    const __VLS_138 = __VLS_137({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_137));
    const __VLS_140 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
        prop: "company",
        label: "公司",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }));
    const __VLS_142 = __VLS_141({
        prop: "company",
        label: "公司",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_141));
    const __VLS_144 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        prop: "department",
        label: "部门",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }));
    const __VLS_146 = __VLS_145({
        prop: "department",
        label: "部门",
        align: "left",
        minWidth: "140",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    const __VLS_148 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
        prop: "work_region",
        label: "工作地",
        align: "left",
        minWidth: "90",
    }));
    const __VLS_150 = __VLS_149({
        prop: "work_region",
        label: "工作地",
        align: "left",
        minWidth: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_149));
    __VLS_151.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_151.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.work_region || '—');
    }
    var __VLS_151;
    const __VLS_152 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_154 = __VLS_153({
        prop: "hire_date",
        label: "入职日期",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_155.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.hire_date || '—');
    }
    var __VLS_155;
    const __VLS_156 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
        prop: "leave_date",
        label: "离职日期",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_158 = __VLS_157({
        prop: "leave_date",
        label: "离职日期",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_157));
    __VLS_159.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_159.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.leaveDateDisplay(row));
    }
    var __VLS_159;
    var __VLS_127;
}
if (__VLS_ctx.result) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_160 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        data: (__VLS_ctx.resultRow),
        border: true,
        size: "small",
        ...{ style: {} },
    }));
    const __VLS_162 = __VLS_161({
        data: (__VLS_ctx.resultRow),
        border: true,
        size: "small",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    const __VLS_164 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }));
    const __VLS_166 = __VLS_165({
        prop: "employee_no",
        label: "工号",
        align: "left",
        minWidth: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_165));
    const __VLS_168 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }));
    const __VLS_170 = __VLS_169({
        prop: "name",
        label: "姓名",
        align: "left",
        minWidth: "100",
        showOverflowTooltip: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    const __VLS_172 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
        prop: "basic_salary",
        label: "基本工资",
        align: "left",
        minWidth: "100",
    }));
    const __VLS_174 = __VLS_173({
        prop: "basic_salary",
        label: "基本工资",
        align: "left",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_173));
    const __VLS_176 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        prop: "compensation_base",
        label: "补偿基数",
        align: "left",
        minWidth: "100",
    }));
    const __VLS_178 = __VLS_177({
        prop: "compensation_base",
        label: "补偿基数",
        align: "left",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    const __VLS_180 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
        prop: "service_years_n",
        label: "年限 N",
        align: "left",
        minWidth: "80",
    }));
    const __VLS_182 = __VLS_181({
        prop: "service_years_n",
        label: "年限 N",
        align: "left",
        minWidth: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_181));
    const __VLS_184 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        prop: "plan",
        label: "方案",
        align: "left",
        minWidth: "70",
    }));
    const __VLS_186 = __VLS_185({
        prop: "plan",
        label: "方案",
        align: "left",
        minWidth: "70",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    const __VLS_188 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
        prop: "n_amount",
        label: "N 金额",
        align: "left",
        minWidth: "100",
    }));
    const __VLS_190 = __VLS_189({
        prop: "n_amount",
        label: "N 金额",
        align: "left",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_189));
    const __VLS_192 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
        prop: "extra_amount",
        label: "+1 金额",
        align: "left",
        minWidth: "100",
    }));
    const __VLS_194 = __VLS_193({
        prop: "extra_amount",
        label: "+1 金额",
        align: "left",
        minWidth: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    const __VLS_196 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
        prop: "total_amount",
        label: "合计",
        align: "left",
        minWidth: "110",
    }));
    const __VLS_198 = __VLS_197({
        prop: "total_amount",
        label: "合计",
        align: "left",
        minWidth: "110",
    }, ...__VLS_functionalComponentArgsRest(__VLS_197));
    __VLS_199.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_199.slots;
        const [scope] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "result-highlight" },
        });
        (scope.row.total_amount);
    }
    var __VLS_199;
    var __VLS_163;
}
var __VLS_3;
const __VLS_200 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_201 = __VLS_asFunctionalComponent(__VLS_200, new __VLS_200({
    modelValue: (__VLS_ctx.agreementOpen),
    title: "生成解除劳动合同协议书",
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}));
const __VLS_202 = __VLS_201({
    modelValue: (__VLS_ctx.agreementOpen),
    title: "生成解除劳动合同协议书",
    width: "92%",
    top: "4vh",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_201));
__VLS_203.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-layout" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.agreementLoading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-form-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-pane-title" },
});
if (__VLS_ctx.agreement) {
    const __VLS_204 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        labelPosition: "top",
        size: "small",
    }));
    const __VLS_206 = __VLS_205({
        labelPosition: "top",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    const __VLS_208 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        label: "甲方（公司全称）",
    }));
    const __VLS_210 = __VLS_209({
        label: "甲方（公司全称）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    const __VLS_212 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({
        modelValue: (__VLS_ctx.agreement.company),
    }));
    const __VLS_214 = __VLS_213({
        modelValue: (__VLS_ctx.agreement.company),
    }, ...__VLS_functionalComponentArgsRest(__VLS_213));
    var __VLS_211;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agr-row2" },
    });
    const __VLS_216 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
        label: "乙方（员工）",
    }));
    const __VLS_218 = __VLS_217({
        label: "乙方（员工）",
    }, ...__VLS_functionalComponentArgsRest(__VLS_217));
    __VLS_219.slots.default;
    const __VLS_220 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
        modelValue: (__VLS_ctx.agreement.name),
    }));
    const __VLS_222 = __VLS_221({
        modelValue: (__VLS_ctx.agreement.name),
    }, ...__VLS_functionalComponentArgsRest(__VLS_221));
    var __VLS_219;
    const __VLS_224 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
        label: "身份证号码",
    }));
    const __VLS_226 = __VLS_225({
        label: "身份证号码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_225));
    __VLS_227.slots.default;
    const __VLS_228 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_229 = __VLS_asFunctionalComponent(__VLS_228, new __VLS_228({
        modelValue: (__VLS_ctx.agreement.id_card),
    }));
    const __VLS_230 = __VLS_229({
        modelValue: (__VLS_ctx.agreement.id_card),
    }, ...__VLS_functionalComponentArgsRest(__VLS_229));
    var __VLS_227;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agr-row2" },
    });
    const __VLS_232 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
        label: "解除劳动关系日期",
    }));
    const __VLS_234 = __VLS_233({
        label: "解除劳动关系日期",
    }, ...__VLS_functionalComponentArgsRest(__VLS_233));
    __VLS_235.slots.default;
    const __VLS_236 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_237 = __VLS_asFunctionalComponent(__VLS_236, new __VLS_236({
        modelValue: (__VLS_ctx.agreement.dissolve_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }));
    const __VLS_238 = __VLS_237({
        modelValue: (__VLS_ctx.agreement.dissolve_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_237));
    var __VLS_235;
    const __VLS_240 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({
        label: "最后工作日",
    }));
    const __VLS_242 = __VLS_241({
        label: "最后工作日",
    }, ...__VLS_functionalComponentArgsRest(__VLS_241));
    __VLS_243.slots.default;
    const __VLS_244 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_245 = __VLS_asFunctionalComponent(__VLS_244, new __VLS_244({
        modelValue: (__VLS_ctx.agreement.last_work_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }));
    const __VLS_246 = __VLS_245({
        modelValue: (__VLS_ctx.agreement.last_work_date),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_245));
    var __VLS_243;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agr-row2" },
    });
    const __VLS_248 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_249 = __VLS_asFunctionalComponent(__VLS_248, new __VLS_248({
        label: "社保最后月份",
    }));
    const __VLS_250 = __VLS_249({
        label: "社保最后月份",
    }, ...__VLS_functionalComponentArgsRest(__VLS_249));
    __VLS_251.slots.default;
    const __VLS_252 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        modelValue: (__VLS_ctx.agreement.social_security_month),
        placeholder: "如 2024年1月",
    }));
    const __VLS_254 = __VLS_253({
        modelValue: (__VLS_ctx.agreement.social_security_month),
        placeholder: "如 2024年1月",
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    var __VLS_251;
    const __VLS_256 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_257 = __VLS_asFunctionalComponent(__VLS_256, new __VLS_256({
        label: "工资计算截止日",
    }));
    const __VLS_258 = __VLS_257({
        label: "工资计算截止日",
    }, ...__VLS_functionalComponentArgsRest(__VLS_257));
    __VLS_259.slots.default;
    const __VLS_260 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        modelValue: (__VLS_ctx.agreement.salary_until),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }));
    const __VLS_262 = __VLS_261({
        modelValue: (__VLS_ctx.agreement.salary_until),
        type: "date",
        valueFormat: "YYYY-MM-DD",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    var __VLS_259;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agr-row2" },
    });
    const __VLS_264 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_265 = __VLS_asFunctionalComponent(__VLS_264, new __VLS_264({
        label: "补偿基数",
    }));
    const __VLS_266 = __VLS_265({
        label: "补偿基数",
    }, ...__VLS_functionalComponentArgsRest(__VLS_265));
    __VLS_267.slots.default;
    const __VLS_268 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
        modelValue: (__VLS_ctx.agreement.base_amount),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }));
    const __VLS_270 = __VLS_269({
        modelValue: (__VLS_ctx.agreement.base_amount),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_269));
    var __VLS_267;
    const __VLS_272 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
        label: "补偿总额",
    }));
    const __VLS_274 = __VLS_273({
        label: "补偿总额",
    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
    __VLS_275.slots.default;
    const __VLS_276 = {}.ElInputNumber;
    /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
    // @ts-ignore
    const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
        modelValue: (__VLS_ctx.agreement.total_amount),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }));
    const __VLS_278 = __VLS_277({
        modelValue: (__VLS_ctx.agreement.total_amount),
        min: (0),
        precision: (2),
        step: (1000),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_277));
    var __VLS_275;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "agr-pane-title" },
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    const __VLS_280 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_282 = __VLS_281({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_281));
    let __VLS_284;
    let __VLS_285;
    let __VLS_286;
    const __VLS_287 = {
        onClick: (__VLS_ctx.addInstallment)
    };
    __VLS_283.slots.default;
    const __VLS_288 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({}));
    const __VLS_290 = __VLS_289({}, ...__VLS_functionalComponentArgsRest(__VLS_289));
    __VLS_291.slots.default;
    const __VLS_292 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({}));
    const __VLS_294 = __VLS_293({}, ...__VLS_functionalComponentArgsRest(__VLS_293));
    var __VLS_291;
    var __VLS_283;
    const __VLS_296 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
        data: (__VLS_ctx.agreement.installments),
        size: "small",
        border: true,
    }));
    const __VLS_298 = __VLS_297({
        data: (__VLS_ctx.agreement.installments),
        size: "small",
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_297));
    __VLS_299.slots.default;
    const __VLS_300 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        label: "期",
        width: "50",
        align: "left",
    }));
    const __VLS_302 = __VLS_301({
        label: "期",
        width: "50",
        align: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    __VLS_303.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_303.slots;
        const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        ($index + 1);
    }
    var __VLS_303;
    const __VLS_304 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_305 = __VLS_asFunctionalComponent(__VLS_304, new __VLS_304({
        label: "付款日期",
        minWidth: "150",
        align: "left",
    }));
    const __VLS_306 = __VLS_305({
        label: "付款日期",
        minWidth: "150",
        align: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_305));
    __VLS_307.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_307.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_308 = {}.ElDatePicker;
        /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
        // @ts-ignore
        const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
            modelValue: (row.pay_date),
            type: "date",
            valueFormat: "YYYY-MM-DD",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_310 = __VLS_309({
            modelValue: (row.pay_date),
            type: "date",
            valueFormat: "YYYY-MM-DD",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    }
    var __VLS_307;
    const __VLS_312 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_313 = __VLS_asFunctionalComponent(__VLS_312, new __VLS_312({
        label: "金额",
        minWidth: "130",
        align: "left",
    }));
    const __VLS_314 = __VLS_313({
        label: "金额",
        minWidth: "130",
        align: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_313));
    __VLS_315.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_315.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_316 = {}.ElInputNumber;
        /** @type {[typeof __VLS_components.ElInputNumber, typeof __VLS_components.elInputNumber, ]} */ ;
        // @ts-ignore
        const __VLS_317 = __VLS_asFunctionalComponent(__VLS_316, new __VLS_316({
            modelValue: (row.amount),
            min: (0),
            precision: (2),
            step: (1000),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_318 = __VLS_317({
            modelValue: (row.amount),
            min: (0),
            precision: (2),
            step: (1000),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_317));
    }
    var __VLS_315;
    const __VLS_320 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_321 = __VLS_asFunctionalComponent(__VLS_320, new __VLS_320({
        label: "操作",
        width: "70",
        align: "left",
    }));
    const __VLS_322 = __VLS_321({
        label: "操作",
        width: "70",
        align: "left",
    }, ...__VLS_functionalComponentArgsRest(__VLS_321));
    __VLS_323.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_323.slots;
        const [{ $index }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_324 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_325 = __VLS_asFunctionalComponent(__VLS_324, new __VLS_324({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
            link: true,
        }));
        const __VLS_326 = __VLS_325({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
            link: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_325));
        let __VLS_328;
        let __VLS_329;
        let __VLS_330;
        const __VLS_331 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.agreement))
                    return;
                __VLS_ctx.removeInstallment($index);
            }
        };
        __VLS_327.slots.default;
        const __VLS_332 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_333 = __VLS_asFunctionalComponent(__VLS_332, new __VLS_332({}));
        const __VLS_334 = __VLS_333({}, ...__VLS_functionalComponentArgsRest(__VLS_333));
        __VLS_335.slots.default;
        const __VLS_336 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({}));
        const __VLS_338 = __VLS_337({}, ...__VLS_functionalComponentArgsRest(__VLS_337));
        var __VLS_335;
        var __VLS_327;
    }
    var __VLS_323;
    var __VLS_299;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
        ...{ style: ({ color: Math.abs(__VLS_ctx.installmentSum() - __VLS_ctx.agreement.total_amount) > 0.01 ? 'var(--el-color-danger)' : 'var(--color-text-placeholder)' }) },
    });
    (__VLS_ctx.installmentSum().toFixed(2));
    (__VLS_ctx.agreement.total_amount.toFixed(2));
    const __VLS_340 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_341 = __VLS_asFunctionalComponent(__VLS_340, new __VLS_340({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        ...{ style: {} },
        loading: (__VLS_ctx.previewing),
    }));
    const __VLS_342 = __VLS_341({
        ...{ 'onClick': {} },
        type: "primary",
        plain: true,
        ...{ style: {} },
        loading: (__VLS_ctx.previewing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_341));
    let __VLS_344;
    let __VLS_345;
    let __VLS_346;
    const __VLS_347 = {
        onClick: (__VLS_ctx.refreshPreview)
    };
    __VLS_343.slots.default;
    var __VLS_343;
    var __VLS_207;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-preview-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-preview-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "agr-pane-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "draft-tip" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "draft-actions" },
});
const __VLS_348 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_349 = __VLS_asFunctionalComponent(__VLS_348, new __VLS_348({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}));
const __VLS_350 = __VLS_349({
    type: (__VLS_ctx.draftAdjusted ? 'warning' : 'success'),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_349));
__VLS_351.slots.default;
(__VLS_ctx.draftAdjusted ? '已人工调整' : '标准生成');
var __VLS_351;
const __VLS_352 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_353 = __VLS_asFunctionalComponent(__VLS_352, new __VLS_352({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}));
const __VLS_354 = __VLS_353({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.draftAdjusted),
}, ...__VLS_functionalComponentArgsRest(__VLS_353));
let __VLS_356;
let __VLS_357;
let __VLS_358;
const __VLS_359 = {
    onClick: (__VLS_ctx.resetPreviewDraft)
};
__VLS_355.slots.default;
var __VLS_355;
/** @type {[typeof DocumentPaperPreview, ]} */ ;
// @ts-ignore
const __VLS_360 = __VLS_asFunctionalComponent(DocumentPaperPreview, new DocumentPaperPreview({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.previewing),
}));
const __VLS_361 = __VLS_360({
    ...{ 'onDirty': {} },
    ref: "previewRef",
    loading: (__VLS_ctx.previewing),
}, ...__VLS_functionalComponentArgsRest(__VLS_360));
let __VLS_363;
let __VLS_364;
let __VLS_365;
const __VLS_366 = {
    onDirty: (...[$event]) => {
        __VLS_ctx.draftAdjusted = $event;
    }
};
/** @type {typeof __VLS_ctx.previewRef} */ ;
var __VLS_367 = {};
var __VLS_362;
{
    const { footer: __VLS_thisSlot } = __VLS_203.slots;
    const __VLS_369 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_370 = __VLS_asFunctionalComponent(__VLS_369, new __VLS_369({
        ...{ 'onClick': {} },
    }));
    const __VLS_371 = __VLS_370({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_370));
    let __VLS_373;
    let __VLS_374;
    let __VLS_375;
    const __VLS_376 = {
        onClick: (...[$event]) => {
            __VLS_ctx.agreementOpen = false;
        }
    };
    __VLS_372.slots.default;
    var __VLS_372;
    const __VLS_377 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_378 = __VLS_asFunctionalComponent(__VLS_377, new __VLS_377({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.downloading),
    }));
    const __VLS_379 = __VLS_378({
        ...{ 'onClick': {} },
        loading: (__VLS_ctx.downloading),
    }, ...__VLS_functionalComponentArgsRest(__VLS_378));
    let __VLS_381;
    let __VLS_382;
    let __VLS_383;
    const __VLS_384 = {
        onClick: (__VLS_ctx.downloadDocx)
    };
    __VLS_380.slots.default;
    var __VLS_380;
    const __VLS_385 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_386 = __VLS_asFunctionalComponent(__VLS_385, new __VLS_385({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.printing),
    }));
    const __VLS_387 = __VLS_386({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.printing),
    }, ...__VLS_functionalComponentArgsRest(__VLS_386));
    let __VLS_389;
    let __VLS_390;
    let __VLS_391;
    const __VLS_392 = {
        onClick: (__VLS_ctx.printAgreement)
    };
    __VLS_388.slots.default;
    var __VLS_388;
}
var __VLS_203;
/** @type {__VLS_StyleScopedClasses['comp-calc']} */ ;
/** @type {__VLS_StyleScopedClasses['op-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['op-row']} */ ;
/** @type {__VLS_StyleScopedClasses['op-row']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['result-highlight']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-form-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-row2']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-preview-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-preview-head']} */ ;
/** @type {__VLS_StyleScopedClasses['agr-pane-title']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['draft-actions']} */ ;
// @ts-ignore
var __VLS_368 = __VLS_367;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            QuestionFilled: QuestionFilled,
            Search: Search,
            Plus: Plus,
            Delete: Delete,
            Document: Document,
            Printer: Printer,
            DocumentPaperPreview: DocumentPaperPreview,
            keyword: keyword,
            employees: employees,
            leaveDate: leaveDate,
            leaveDateInvalid: leaveDateInvalid,
            plan: plan,
            result: result,
            agreementOpen: agreementOpen,
            agreementLoading: agreementLoading,
            previewing: previewing,
            downloading: downloading,
            agreement: agreement,
            previewRef: previewRef,
            draftAdjusted: draftAdjusted,
            busy: busy,
            searchAndCalculate: searchAndCalculate,
            pickEmployee: pickEmployee,
            rowClassName: rowClassName,
            leaveDateDisplay: leaveDateDisplay,
            resetAll: resetAll,
            openAgreement: openAgreement,
            installmentSum: installmentSum,
            addInstallment: addInstallment,
            removeInstallment: removeInstallment,
            refreshPreview: refreshPreview,
            resetPreviewDraft: resetPreviewDraft,
            downloadDocx: downloadDocx,
            printAgreement: printAgreement,
            printing: printing,
            printDirect: printDirect,
            resultRow: resultRow,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
