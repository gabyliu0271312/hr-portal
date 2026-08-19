/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { dataCompareApi } from '@/api/data-compare';
import CompareResultCard from '@/components/ai/CompareResultCard.vue';
import ScheduleBindingDialog from '@/components/ai/ScheduleBindingDialog.vue';
const router = useRouter();
const activeTab = ref('skills');
const loading = ref(false);
const saving = ref(false);
const generating = ref(false);
const skills = ref([]);
const filterStatus = ref('');
const showCreateDialog = ref(false);
const showResult = ref(false);
const editingSkill = ref(null);
const runningId = ref(null);
const lastResult = ref(null);
const generatedSummary = ref('');
const form = ref({
    name: '',
    instruction: '',
    paramsJson: '',
});
function resetForm() {
    editingSkill.value = null;
    generatedSummary.value = '';
    form.value = { name: '', instruction: '', paramsJson: '' };
}
function openCreateDialog() {
    resetForm();
    showCreateDialog.value = true;
}
// Phase 2: Task state
const taskLoading = ref(false);
const taskSaving = ref(false);
const tasks = ref([]);
const filterEnabled = ref(null);
const showTaskDialog = ref(false);
const showScheduleDialog = ref(false);
const scheduleTask = ref(null);
const runningTaskId = ref(null);
const skillsForSelect = ref([]);
const taskForm = ref({
    name: '',
    skill_id: null,
    description: '',
});
function statusType(status) {
    return status === 'active' ? 'success' : status === 'archived' ? 'info' : 'warning';
}
function statusLabel(status) {
    return status === 'active' ? '已启用' : status === 'archived' ? '已归档' : '草稿';
}
function compareTypeLabel(type) {
    const map = { roster: '名单对比', field: '字段对比', amount: '金额对比' };
    return map[type] || type;
}
function taskStatusLabel(s) {
    const map = { success: '成功', partial_diff: '有差异', partial_success: '部分完成', failed: '失败' };
    return map[s] || s || '-';
}
function taskStatusTag(s) {
    const map = {
        success: 'success', partial_diff: 'warning', partial_success: 'warning', failed: 'danger',
    };
    return map[s] || '';
}
function formatTime(iso) {
    if (!iso)
        return '';
    return formatDateTime(iso);
}
function onTabChange(tab) {
    if (tab === 'tasks') {
        loadTasks();
        loadSkillsForSelect();
    }
}
async function loadSkills() {
    loading.value = true;
    try {
        const data = await dataCompareApi.listSkills({
            status: filterStatus.value || undefined,
        });
        skills.value = data.items;
    }
    catch (e) {
        ElMessage.error('加载失败: ' + (e?.message || '未知错误'));
    }
    finally {
        loading.value = false;
    }
}
async function loadSkillsForSelect() {
    try {
        const data = await dataCompareApi.listSkills({ status: 'active' });
        skillsForSelect.value = data.items;
    }
    catch {
        // ignore
    }
}
async function runSkill(id) {
    runningId.value = id;
    try {
        const data = await dataCompareApi.invokeSkill(id);
        lastResult.value = data.result;
        showResult.value = true;
        await loadSkills();
    }
    catch (e) {
        ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
    finally {
        runningId.value = null;
    }
}
function editSkill(skill) {
    editingSkill.value = skill;
    generatedSummary.value = skill.params?.compare_type
        ? `${compareTypeLabel(skill.params.compare_type)}: ${skill.params.source_a?.table || ''} -> ${skill.params.source_b?.table || ''}`
        : '';
    form.value = {
        name: skill.name,
        instruction: skill.instruction,
        paramsJson: JSON.stringify(skill.params, null, 2),
    };
    showCreateDialog.value = true;
}
async function generateParams() {
    if (!form.value.instruction) {
        ElMessage.warning('请先输入自然语言需求');
        return false;
    }
    generating.value = true;
    try {
        const data = await dataCompareApi.generateSkill({
            instruction: form.value.instruction,
            name: form.value.name || undefined,
        });
        form.value.paramsJson = JSON.stringify(data.params, null, 2);
        generatedSummary.value = data.summary;
        ElMessage.success('CompareSpec 已生成并完成规范化');
        return true;
    }
    catch (e) {
        ElMessage.error('生成失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
        return false;
    }
    finally {
        generating.value = false;
    }
}
async function saveSkill() {
    if (!form.value.name || !form.value.instruction) {
        ElMessage.warning('名称和需求描述为必填');
        return;
    }
    if (!form.value.paramsJson) {
        const ok = await generateParams();
        if (!ok)
            return;
    }
    let params;
    try {
        params = form.value.paramsJson ? JSON.parse(form.value.paramsJson) : {};
    }
    catch {
        ElMessage.error('CompareSpec JSON 格式不合法');
        return;
    }
    saving.value = true;
    try {
        if (editingSkill.value) {
            await dataCompareApi.updateSkill(editingSkill.value.id, {
                name: form.value.name,
                instruction: form.value.instruction,
                params,
            });
            ElMessage.success('更新成功');
        }
        else {
            await dataCompareApi.createSkill({
                name: form.value.name,
                instruction: form.value.instruction,
                params,
            });
            ElMessage.success('创建成功');
        }
        showCreateDialog.value = false;
        resetForm();
        await loadSkills();
    }
    catch (e) {
        ElMessage.error('保存失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
    finally {
        saving.value = false;
    }
}
async function deleteSkill(id) {
    try {
        await dataCompareApi.deleteSkill(id);
        ElMessage.success('删除成功');
        await loadSkills();
    }
    catch (e) {
        ElMessage.error('删除失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
}
// Phase 2: Task functions
async function loadTasks() {
    taskLoading.value = true;
    try {
        const data = await dataCompareApi.listTasks({
            enabled: filterEnabled.value ?? undefined,
        });
        tasks.value = data.items;
    }
    catch (e) {
        ElMessage.error('加载失败: ' + (e?.message || '未知错误'));
    }
    finally {
        taskLoading.value = false;
    }
}
async function saveTask() {
    if (!taskForm.value.name) {
        ElMessage.warning('任务名称为必填');
        return;
    }
    if (!taskForm.value.skill_id) {
        ElMessage.warning('请选择关联的对比配置');
        return;
    }
    taskSaving.value = true;
    try {
        await dataCompareApi.createTask({
            name: taskForm.value.name,
            skill_id: taskForm.value.skill_id,
            description: taskForm.value.description || undefined,
        });
        ElMessage.success('任务创建成功');
        showTaskDialog.value = false;
        taskForm.value = { name: '', skill_id: null, description: '' };
        await loadTasks();
    }
    catch (e) {
        ElMessage.error('创建失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
    finally {
        taskSaving.value = false;
    }
}
async function runTask(id) {
    runningTaskId.value = id;
    try {
        await dataCompareApi.runTask(id);
        ElMessage.success('执行完成');
        await loadTasks();
    }
    catch (e) {
        ElMessage.error('执行失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
    finally {
        runningTaskId.value = null;
    }
}
function openScheduleDialog(task) {
    scheduleTask.value = task;
    showScheduleDialog.value = true;
}
function viewRuns(taskId) {
    router.push(`/system/data-compare/runs/${taskId}`);
}
async function deleteTask(id) {
    try {
        await dataCompareApi.deleteTask(id);
        ElMessage.success('删除成功');
        await loadTasks();
    }
    catch (e) {
        ElMessage.error('删除失败: ' + (e?.response?.data?.detail || e?.message || '未知错误'));
    }
}
onMounted(() => {
    loadSkills();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "data-compare-page" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "page-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
const __VLS_0 = {}.ElTabs;
/** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onTabChange': {} },
    modelValue: (__VLS_ctx.activeTab),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onTabChange: (__VLS_ctx.onTabChange)
};
__VLS_3.slots.default;
const __VLS_8 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    label: "对比配置",
    name: "skills",
}));
const __VLS_10 = __VLS_9({
    label: "对比配置",
    name: "skills",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-header" },
});
const __VLS_12 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态筛选",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_14 = __VLS_13({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterStatus),
    placeholder: "状态筛选",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
let __VLS_16;
let __VLS_17;
let __VLS_18;
const __VLS_19 = {
    onChange: (__VLS_ctx.loadSkills)
};
__VLS_15.slots.default;
const __VLS_20 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    label: "全部",
    value: "",
}));
const __VLS_22 = __VLS_21({
    label: "全部",
    value: "",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
const __VLS_24 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "草稿",
    value: "draft",
}));
const __VLS_26 = __VLS_25({
    label: "草稿",
    value: "draft",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
const __VLS_28 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    label: "已启用",
    value: "active",
}));
const __VLS_30 = __VLS_29({
    label: "已启用",
    value: "active",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
const __VLS_32 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "已归档",
    value: "archived",
}));
const __VLS_34 = __VLS_33({
    label: "已归档",
    value: "archived",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
var __VLS_15;
const __VLS_36 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_38 = __VLS_37({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
let __VLS_40;
let __VLS_41;
let __VLS_42;
const __VLS_43 = {
    onClick: (__VLS_ctx.openCreateDialog)
};
__VLS_39.slots.default;
var __VLS_39;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "skill-cards" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.skills.length === 0 && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty" },
    });
}
for (const [skill] of __VLS_getVForSourceType((__VLS_ctx.skills))) {
    const __VLS_44 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
        key: (skill.id),
        ...{ class: "skill-card" },
        shadow: "hover",
    }));
    const __VLS_46 = __VLS_45({
        key: (skill.id),
        ...{ class: "skill-card" },
        shadow: "hover",
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    __VLS_47.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-main" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "name" },
    });
    (skill.name);
    const __VLS_48 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        type: (__VLS_ctx.statusType(skill.status)),
        size: "small",
    }));
    const __VLS_50 = __VLS_49({
        type: (__VLS_ctx.statusType(skill.status)),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_51.slots.default;
    (__VLS_ctx.statusLabel(skill.status));
    var __VLS_51;
    if (skill.params?.compare_type) {
        const __VLS_52 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            type: "info",
            size: "small",
            ...{ class: "type-tag" },
        }));
        const __VLS_54 = __VLS_53({
            type: "info",
            size: "small",
            ...{ class: "type-tag" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        __VLS_55.slots.default;
        (__VLS_ctx.compareTypeLabel(skill.params.compare_type));
        var __VLS_55;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-desc" },
    });
    (skill.description || skill.instruction?.slice(0, 100) || '无描述');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-meta" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (skill.run_count);
    if (skill.last_run_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (__VLS_ctx.formatTime(skill.last_run_at));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-actions" },
    });
    const __VLS_56 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.runningId === skill.id),
    }));
    const __VLS_58 = __VLS_57({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.runningId === skill.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    let __VLS_60;
    let __VLS_61;
    let __VLS_62;
    const __VLS_63 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runSkill(skill.id);
        }
    };
    __VLS_59.slots.default;
    var __VLS_59;
    const __VLS_64 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_66 = __VLS_65({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    let __VLS_68;
    let __VLS_69;
    let __VLS_70;
    const __VLS_71 = {
        onClick: (...[$event]) => {
            __VLS_ctx.editSkill(skill);
        }
    };
    __VLS_67.slots.default;
    var __VLS_67;
    const __VLS_72 = {}.ElPopconfirm;
    /** @type {[typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onConfirm': {} },
        title: "确定删除？",
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onConfirm': {} },
        title: "确定删除？",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onConfirm: (...[$event]) => {
            __VLS_ctx.deleteSkill(skill.id);
        }
    };
    __VLS_75.slots.default;
    {
        const { reference: __VLS_thisSlot } = __VLS_75.slots;
        const __VLS_80 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
            size: "small",
            type: "danger",
            text: true,
        }));
        const __VLS_82 = __VLS_81({
            size: "small",
            type: "danger",
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_81));
        __VLS_83.slots.default;
        var __VLS_83;
    }
    var __VLS_75;
    var __VLS_47;
}
var __VLS_11;
const __VLS_84 = {}.ElTabPane;
/** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    label: "定时任务",
    name: "tasks",
}));
const __VLS_86 = __VLS_85({
    label: "定时任务",
    name: "tasks",
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
__VLS_87.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "tab-header" },
});
const __VLS_88 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterEnabled),
    placeholder: "状态筛选",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_90 = __VLS_89({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.filterEnabled),
    placeholder: "状态筛选",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_89));
let __VLS_92;
let __VLS_93;
let __VLS_94;
const __VLS_95 = {
    onChange: (__VLS_ctx.loadTasks)
};
__VLS_91.slots.default;
const __VLS_96 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    label: "全部",
    value: (null),
}));
const __VLS_98 = __VLS_97({
    label: "全部",
    value: (null),
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "已启用",
    value: (true),
}));
const __VLS_102 = __VLS_101({
    label: "已启用",
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
const __VLS_104 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
    label: "未启用",
    value: (false),
}));
const __VLS_106 = __VLS_105({
    label: "未启用",
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_105));
var __VLS_91;
const __VLS_108 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
    ...{ 'onClick': {} },
    type: "primary",
}));
const __VLS_110 = __VLS_109({
    ...{ 'onClick': {} },
    type: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_109));
let __VLS_112;
let __VLS_113;
let __VLS_114;
const __VLS_115 = {
    onClick: (...[$event]) => {
        __VLS_ctx.showTaskDialog = true;
    }
};
__VLS_111.slots.default;
var __VLS_111;
const __VLS_116 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
    data: (__VLS_ctx.tasks),
    border: true,
    stripe: true,
}));
const __VLS_118 = __VLS_117({
    data: (__VLS_ctx.tasks),
    border: true,
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_117));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.taskLoading) }, null, null);
__VLS_119.slots.default;
const __VLS_120 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
    prop: "name",
    label: "任务名称",
    minWidth: "160",
}));
const __VLS_122 = __VLS_121({
    prop: "name",
    label: "任务名称",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_121));
const __VLS_124 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    prop: "compare_type",
    label: "类型",
    width: "100",
}));
const __VLS_126 = __VLS_125({
    prop: "compare_type",
    label: "类型",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_127.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (__VLS_ctx.compareTypeLabel(row.compare_type));
}
var __VLS_127;
const __VLS_128 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
    label: "表A → 表B",
    minWidth: "200",
}));
const __VLS_130 = __VLS_129({
    label: "表A → 表B",
    minWidth: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_129));
__VLS_131.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_131.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.table_a);
    (row.table_b);
}
var __VLS_131;
const __VLS_132 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "定时",
    width: "180",
}));
const __VLS_134 = __VLS_133({
    label: "定时",
    width: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_135.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.cron_expression) {
        const __VLS_136 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            type: "success",
            size: "small",
        }));
        const __VLS_138 = __VLS_137({
            type: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        (row.cron_expression);
        var __VLS_139;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-muted" },
        });
    }
}
var __VLS_135;
const __VLS_140 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
    label: "启用",
    width: "80",
}));
const __VLS_142 = __VLS_141({
    label: "启用",
    width: "80",
}, ...__VLS_functionalComponentArgsRest(__VLS_141));
__VLS_143.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_143.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_144 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
        type: (row.enabled ? 'success' : 'info'),
        size: "small",
    }));
    const __VLS_146 = __VLS_145({
        type: (row.enabled ? 'success' : 'info'),
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_145));
    __VLS_147.slots.default;
    (row.enabled ? '是' : '否');
    var __VLS_147;
}
var __VLS_143;
const __VLS_148 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "上次执行",
    width: "200",
}));
const __VLS_150 = __VLS_149({
    label: "上次执行",
    width: "200",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_151.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.last_run_at) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        (__VLS_ctx.formatTime(row.last_run_at));
        const __VLS_152 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
            type: (__VLS_ctx.taskStatusTag(row.last_status)),
            size: "small",
        }));
        const __VLS_154 = __VLS_153({
            type: (__VLS_ctx.taskStatusTag(row.last_status)),
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_153));
        __VLS_155.slots.default;
        (__VLS_ctx.taskStatusLabel(row.last_status));
        var __VLS_155;
        if (row.last_diff_count > 0) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "diff-count" },
            });
            (row.last_diff_count);
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "text-muted" },
        });
    }
}
var __VLS_151;
const __VLS_156 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
    label: "操作",
    width: "280",
    fixed: "right",
}));
const __VLS_158 = __VLS_157({
    label: "操作",
    width: "280",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_157));
__VLS_159.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_159.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_160 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.runningTaskId === row.id),
    }));
    const __VLS_162 = __VLS_161({
        ...{ 'onClick': {} },
        size: "small",
        loading: (__VLS_ctx.runningTaskId === row.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    let __VLS_164;
    let __VLS_165;
    let __VLS_166;
    const __VLS_167 = {
        onClick: (...[$event]) => {
            __VLS_ctx.runTask(row.id);
        }
    };
    __VLS_163.slots.default;
    var __VLS_163;
    const __VLS_168 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_170 = __VLS_169({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    let __VLS_172;
    let __VLS_173;
    let __VLS_174;
    const __VLS_175 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openScheduleDialog(row);
        }
    };
    __VLS_171.slots.default;
    var __VLS_171;
    const __VLS_176 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        ...{ 'onClick': {} },
        size: "small",
    }));
    const __VLS_178 = __VLS_177({
        ...{ 'onClick': {} },
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    let __VLS_180;
    let __VLS_181;
    let __VLS_182;
    const __VLS_183 = {
        onClick: (...[$event]) => {
            __VLS_ctx.viewRuns(row.id);
        }
    };
    __VLS_179.slots.default;
    var __VLS_179;
    const __VLS_184 = {}.ElPopconfirm;
    /** @type {[typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        ...{ 'onConfirm': {} },
        title: "确定删除？",
    }));
    const __VLS_186 = __VLS_185({
        ...{ 'onConfirm': {} },
        title: "确定删除？",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    let __VLS_188;
    let __VLS_189;
    let __VLS_190;
    const __VLS_191 = {
        onConfirm: (...[$event]) => {
            __VLS_ctx.deleteTask(row.id);
        }
    };
    __VLS_187.slots.default;
    {
        const { reference: __VLS_thisSlot } = __VLS_187.slots;
        const __VLS_192 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_193 = __VLS_asFunctionalComponent(__VLS_192, new __VLS_192({
            size: "small",
            type: "danger",
            text: true,
        }));
        const __VLS_194 = __VLS_193({
            size: "small",
            type: "danger",
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_193));
        __VLS_195.slots.default;
        var __VLS_195;
    }
    var __VLS_187;
}
var __VLS_159;
var __VLS_119;
var __VLS_87;
var __VLS_3;
const __VLS_196 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
    modelValue: (__VLS_ctx.showResult),
    title: "对比结果",
    width: "800px",
    destroyOnClose: true,
}));
const __VLS_198 = __VLS_197({
    modelValue: (__VLS_ctx.showResult),
    title: "对比结果",
    width: "800px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_197));
__VLS_199.slots.default;
if (__VLS_ctx.lastResult) {
    /** @type {[typeof CompareResultCard, ]} */ ;
    // @ts-ignore
    const __VLS_200 = __VLS_asFunctionalComponent(CompareResultCard, new CompareResultCard({
        result: (__VLS_ctx.lastResult),
    }));
    const __VLS_201 = __VLS_200({
        result: (__VLS_ctx.lastResult),
    }, ...__VLS_functionalComponentArgsRest(__VLS_200));
}
{
    const { footer: __VLS_thisSlot } = __VLS_199.slots;
    const __VLS_203 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_204 = __VLS_asFunctionalComponent(__VLS_203, new __VLS_203({
        ...{ 'onClick': {} },
    }));
    const __VLS_205 = __VLS_204({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_204));
    let __VLS_207;
    let __VLS_208;
    let __VLS_209;
    const __VLS_210 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showResult = false;
        }
    };
    __VLS_206.slots.default;
    var __VLS_206;
}
var __VLS_199;
const __VLS_211 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_212 = __VLS_asFunctionalComponent(__VLS_211, new __VLS_211({
    modelValue: (__VLS_ctx.showCreateDialog),
    title: (__VLS_ctx.editingSkill ? '编辑对比配置' : '新建对比'),
    width: "760px",
    destroyOnClose: true,
}));
const __VLS_213 = __VLS_212({
    modelValue: (__VLS_ctx.showCreateDialog),
    title: (__VLS_ctx.editingSkill ? '编辑对比配置' : '新建对比'),
    width: "760px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_212));
__VLS_214.slots.default;
const __VLS_215 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_216 = __VLS_asFunctionalComponent(__VLS_215, new __VLS_215({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}));
const __VLS_217 = __VLS_216({
    model: (__VLS_ctx.form),
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_216));
__VLS_218.slots.default;
const __VLS_219 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
    label: "名称",
    required: true,
}));
const __VLS_221 = __VLS_220({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_220));
__VLS_222.slots.default;
const __VLS_223 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_224 = __VLS_asFunctionalComponent(__VLS_223, new __VLS_223({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：2026年5月分摊表 vs 工资表名单核对",
}));
const __VLS_225 = __VLS_224({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "如：2026年5月分摊表 vs 工资表名单核对",
}, ...__VLS_functionalComponentArgsRest(__VLS_224));
var __VLS_222;
const __VLS_227 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_228 = __VLS_asFunctionalComponent(__VLS_227, new __VLS_227({
    label: "自然语言需求",
    required: true,
}));
const __VLS_229 = __VLS_228({
    label: "自然语言需求",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_228));
__VLS_230.slots.default;
const __VLS_231 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_232 = __VLS_asFunctionalComponent(__VLS_231, new __VLS_231({
    modelValue: (__VLS_ctx.form.instruction),
    type: "textarea",
    rows: (4),
    placeholder: "例：对员工月度成本分摊表emp_monthly_allocation中的名单与员工月度工资表emp_monthly_salary中的名单进行对比，对比月份是2026.05",
}));
const __VLS_233 = __VLS_232({
    modelValue: (__VLS_ctx.form.instruction),
    type: "textarea",
    rows: (4),
    placeholder: "例：对员工月度成本分摊表emp_monthly_allocation中的名单与员工月度工资表emp_monthly_salary中的名单进行对比，对比月份是2026.05",
}, ...__VLS_functionalComponentArgsRest(__VLS_232));
var __VLS_230;
const __VLS_235 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_236 = __VLS_asFunctionalComponent(__VLS_235, new __VLS_235({
    label: "AI 生成配置",
}));
const __VLS_237 = __VLS_236({
    label: "AI 生成配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_236));
__VLS_238.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "generate-row" },
});
const __VLS_239 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_240 = __VLS_asFunctionalComponent(__VLS_239, new __VLS_239({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    loading: (__VLS_ctx.generating),
}));
const __VLS_241 = __VLS_240({
    ...{ 'onClick': {} },
    type: "primary",
    plain: true,
    loading: (__VLS_ctx.generating),
}, ...__VLS_functionalComponentArgsRest(__VLS_240));
let __VLS_243;
let __VLS_244;
let __VLS_245;
const __VLS_246 = {
    onClick: (__VLS_ctx.generateParams)
};
__VLS_242.slots.default;
var __VLS_242;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "generate-tip" },
});
if (__VLS_ctx.generatedSummary) {
    const __VLS_247 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_248 = __VLS_asFunctionalComponent(__VLS_247, new __VLS_247({
        ...{ class: "generated-summary" },
        type: "success",
        closable: (false),
        title: (__VLS_ctx.generatedSummary),
    }));
    const __VLS_249 = __VLS_248({
        ...{ class: "generated-summary" },
        type: "success",
        closable: (false),
        title: (__VLS_ctx.generatedSummary),
    }, ...__VLS_functionalComponentArgsRest(__VLS_248));
}
var __VLS_238;
const __VLS_251 = {}.ElCollapse;
/** @type {[typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, typeof __VLS_components.ElCollapse, typeof __VLS_components.elCollapse, ]} */ ;
// @ts-ignore
const __VLS_252 = __VLS_asFunctionalComponent(__VLS_251, new __VLS_251({}));
const __VLS_253 = __VLS_252({}, ...__VLS_functionalComponentArgsRest(__VLS_252));
__VLS_254.slots.default;
const __VLS_255 = {}.ElCollapseItem;
/** @type {[typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, typeof __VLS_components.ElCollapseItem, typeof __VLS_components.elCollapseItem, ]} */ ;
// @ts-ignore
const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({
    title: "高级：查看/编辑 CompareSpec JSON",
    name: "json",
}));
const __VLS_257 = __VLS_256({
    title: "高级：查看/编辑 CompareSpec JSON",
    name: "json",
}, ...__VLS_functionalComponentArgsRest(__VLS_256));
__VLS_258.slots.default;
const __VLS_259 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_260 = __VLS_asFunctionalComponent(__VLS_259, new __VLS_259({
    modelValue: (__VLS_ctx.form.paramsJson),
    type: "textarea",
    rows: (10),
    placeholder: "点击 AI生成配置 后自动填充；如需高级调试可手工修改",
}));
const __VLS_261 = __VLS_260({
    modelValue: (__VLS_ctx.form.paramsJson),
    type: "textarea",
    rows: (10),
    placeholder: "点击 AI生成配置 后自动填充；如需高级调试可手工修改",
}, ...__VLS_functionalComponentArgsRest(__VLS_260));
var __VLS_258;
var __VLS_254;
var __VLS_218;
{
    const { footer: __VLS_thisSlot } = __VLS_214.slots;
    const __VLS_263 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_264 = __VLS_asFunctionalComponent(__VLS_263, new __VLS_263({
        ...{ 'onClick': {} },
    }));
    const __VLS_265 = __VLS_264({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_264));
    let __VLS_267;
    let __VLS_268;
    let __VLS_269;
    const __VLS_270 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showCreateDialog = false;
        }
    };
    __VLS_266.slots.default;
    var __VLS_266;
    const __VLS_271 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_272 = __VLS_asFunctionalComponent(__VLS_271, new __VLS_271({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving || __VLS_ctx.generating),
    }));
    const __VLS_273 = __VLS_272({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving || __VLS_ctx.generating),
    }, ...__VLS_functionalComponentArgsRest(__VLS_272));
    let __VLS_275;
    let __VLS_276;
    let __VLS_277;
    const __VLS_278 = {
        onClick: (__VLS_ctx.saveSkill)
    };
    __VLS_274.slots.default;
    var __VLS_274;
}
var __VLS_214;
const __VLS_279 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_280 = __VLS_asFunctionalComponent(__VLS_279, new __VLS_279({
    modelValue: (__VLS_ctx.showTaskDialog),
    title: "新建定时任务",
    width: "500px",
    destroyOnClose: true,
}));
const __VLS_281 = __VLS_280({
    modelValue: (__VLS_ctx.showTaskDialog),
    title: "新建定时任务",
    width: "500px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_280));
__VLS_282.slots.default;
const __VLS_283 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_284 = __VLS_asFunctionalComponent(__VLS_283, new __VLS_283({
    model: (__VLS_ctx.taskForm),
    labelPosition: "top",
}));
const __VLS_285 = __VLS_284({
    model: (__VLS_ctx.taskForm),
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_284));
__VLS_286.slots.default;
const __VLS_287 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_288 = __VLS_asFunctionalComponent(__VLS_287, new __VLS_287({
    label: "任务名称",
    required: true,
}));
const __VLS_289 = __VLS_288({
    label: "任务名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_288));
__VLS_290.slots.default;
const __VLS_291 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_292 = __VLS_asFunctionalComponent(__VLS_291, new __VLS_291({
    modelValue: (__VLS_ctx.taskForm.name),
    placeholder: "如：月度花名册对比",
}));
const __VLS_293 = __VLS_292({
    modelValue: (__VLS_ctx.taskForm.name),
    placeholder: "如：月度花名册对比",
}, ...__VLS_functionalComponentArgsRest(__VLS_292));
var __VLS_290;
const __VLS_295 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
    label: "关联对比配置",
}));
const __VLS_297 = __VLS_296({
    label: "关联对比配置",
}, ...__VLS_functionalComponentArgsRest(__VLS_296));
__VLS_298.slots.default;
const __VLS_299 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_300 = __VLS_asFunctionalComponent(__VLS_299, new __VLS_299({
    modelValue: (__VLS_ctx.taskForm.skill_id),
    placeholder: "选择已有的对比配置",
    filterable: true,
    clearable: true,
}));
const __VLS_301 = __VLS_300({
    modelValue: (__VLS_ctx.taskForm.skill_id),
    placeholder: "选择已有的对比配置",
    filterable: true,
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_300));
__VLS_302.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.skillsForSelect))) {
    const __VLS_303 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_304 = __VLS_asFunctionalComponent(__VLS_303, new __VLS_303({
        key: (s.id),
        label: (s.name),
        value: (s.id),
    }));
    const __VLS_305 = __VLS_304({
        key: (s.id),
        label: (s.name),
        value: (s.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_304));
}
var __VLS_302;
var __VLS_298;
const __VLS_307 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_308 = __VLS_asFunctionalComponent(__VLS_307, new __VLS_307({
    label: "描述",
}));
const __VLS_309 = __VLS_308({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_308));
__VLS_310.slots.default;
const __VLS_311 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_312 = __VLS_asFunctionalComponent(__VLS_311, new __VLS_311({
    modelValue: (__VLS_ctx.taskForm.description),
    type: "textarea",
    rows: (2),
}));
const __VLS_313 = __VLS_312({
    modelValue: (__VLS_ctx.taskForm.description),
    type: "textarea",
    rows: (2),
}, ...__VLS_functionalComponentArgsRest(__VLS_312));
var __VLS_310;
var __VLS_286;
{
    const { footer: __VLS_thisSlot } = __VLS_282.slots;
    const __VLS_315 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_316 = __VLS_asFunctionalComponent(__VLS_315, new __VLS_315({
        ...{ 'onClick': {} },
    }));
    const __VLS_317 = __VLS_316({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_316));
    let __VLS_319;
    let __VLS_320;
    let __VLS_321;
    const __VLS_322 = {
        onClick: (...[$event]) => {
            __VLS_ctx.showTaskDialog = false;
        }
    };
    __VLS_318.slots.default;
    var __VLS_318;
    const __VLS_323 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_324 = __VLS_asFunctionalComponent(__VLS_323, new __VLS_323({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.taskSaving),
    }));
    const __VLS_325 = __VLS_324({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.taskSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_324));
    let __VLS_327;
    let __VLS_328;
    let __VLS_329;
    const __VLS_330 = {
        onClick: (__VLS_ctx.saveTask)
    };
    __VLS_326.slots.default;
    var __VLS_326;
}
var __VLS_282;
/** @type {[typeof ScheduleBindingDialog, ]} */ ;
// @ts-ignore
const __VLS_331 = __VLS_asFunctionalComponent(ScheduleBindingDialog, new ScheduleBindingDialog({
    ...{ 'onSaved': {} },
    modelValue: (__VLS_ctx.showScheduleDialog),
    task: (__VLS_ctx.scheduleTask),
}));
const __VLS_332 = __VLS_331({
    ...{ 'onSaved': {} },
    modelValue: (__VLS_ctx.showScheduleDialog),
    task: (__VLS_ctx.scheduleTask),
}, ...__VLS_functionalComponentArgsRest(__VLS_331));
let __VLS_334;
let __VLS_335;
let __VLS_336;
const __VLS_337 = {
    onSaved: (__VLS_ctx.loadTasks)
};
var __VLS_333;
/** @type {__VLS_StyleScopedClasses['data-compare-page']} */ ;
/** @type {__VLS_StyleScopedClasses['page-header']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['empty']} */ ;
/** @type {__VLS_StyleScopedClasses['skill-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['card-main']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['name']} */ ;
/** @type {__VLS_StyleScopedClasses['type-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['card-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['card-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['card-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['tab-header']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['diff-count']} */ ;
/** @type {__VLS_StyleScopedClasses['text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['generate-row']} */ ;
/** @type {__VLS_StyleScopedClasses['generate-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['generated-summary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CompareResultCard: CompareResultCard,
            ScheduleBindingDialog: ScheduleBindingDialog,
            activeTab: activeTab,
            loading: loading,
            saving: saving,
            generating: generating,
            skills: skills,
            filterStatus: filterStatus,
            showCreateDialog: showCreateDialog,
            showResult: showResult,
            editingSkill: editingSkill,
            runningId: runningId,
            lastResult: lastResult,
            generatedSummary: generatedSummary,
            form: form,
            openCreateDialog: openCreateDialog,
            taskLoading: taskLoading,
            taskSaving: taskSaving,
            tasks: tasks,
            filterEnabled: filterEnabled,
            showTaskDialog: showTaskDialog,
            showScheduleDialog: showScheduleDialog,
            scheduleTask: scheduleTask,
            runningTaskId: runningTaskId,
            skillsForSelect: skillsForSelect,
            taskForm: taskForm,
            statusType: statusType,
            statusLabel: statusLabel,
            compareTypeLabel: compareTypeLabel,
            taskStatusLabel: taskStatusLabel,
            taskStatusTag: taskStatusTag,
            formatTime: formatTime,
            onTabChange: onTabChange,
            loadSkills: loadSkills,
            runSkill: runSkill,
            editSkill: editSkill,
            generateParams: generateParams,
            saveSkill: saveSkill,
            deleteSkill: deleteSkill,
            loadTasks: loadTasks,
            saveTask: saveTask,
            runTask: runTask,
            openScheduleDialog: openScheduleDialog,
            viewRuns: viewRuns,
            deleteTask: deleteTask,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
