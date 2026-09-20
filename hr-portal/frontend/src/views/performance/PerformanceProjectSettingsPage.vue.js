/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '@/components/performance/PageHeader.vue';
import PerformanceStepFlow from '@/components/performance/PerformanceStepFlow.vue';
import PerformanceProjectDialog from '@/components/performance/PerformanceProjectDialog.vue';
import PerformanceMultiSelect from '@/components/performance/PerformanceMultiSelect.vue';
import PerformanceIconButton from '@/components/performance/PerformanceIconButton.vue';
import PerformanceContentSurface from '@/components/performance/PerformanceContentSurface.vue';
import { performanceProjectApi, performanceTemplateApi } from '@/api/performance';
import PerformanceProjectFlowSettings from '@/components/performance/PerformanceProjectFlowSettings.vue';
import PerformanceProjectTimeSettings from '@/components/performance/PerformanceProjectTimeSettings.vue';
const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.id || 0) || null);
const cycleId = computed(() => Number(route.params.cycleId || 0) || null);
const evaluatorOptions = ref({ departments: [], employee_types: [], employees: [] });
const savedView = ref(false);
const currentStep = ref(0);
const saving = ref(false);
const notice = ref('');
const validationError = ref('');
const templateLoading = ref(false);
const templates = ref([]);
const basicDialogOpen = ref(false);
const basicDialogSaving = ref(false);
const basicDialogProject = ref(null);
const workflowNodes = ref([]);
const flowLoading = ref(false);
const flowError = ref('');
const evaluatedCount = ref(0);
const steps = [{ key: 'info', label: '项目信息' }, { key: 'flow', label: '流程设置' }, { key: 'time', label: '起止时间' }];
const form = reactive({ name: '', description: '', administrators: [], template_id: null, start_at: '', end_at: '', evaluator_rules: { groups: [{ conditions: [{ field: 'department', operator: 'include', values: [] }] }] }, flow_settings: { node_settings: {}, node_times: {} } });
const administratorsText = computed({ get: () => form.administrators.join('、'), set: value => { form.administrators = value.split(/[、,，]/).map(item => item.trim()).filter(Boolean); } });
const selectedTemplate = computed(() => templates.value.find(template => template.template_id === form.template_id));
const projectName = computed(() => form.name);
const dateError = computed(() => Boolean(form.start_at && form.end_at && form.end_at <= form.start_at));
function workflowNodeKey(node) { return node.node_id || `${node.node_type}-${node.order}`; }
const nodeTimeError = computed(() => {
    for (const node of workflowNodes.value) {
        const time = form.flow_settings.node_times?.[workflowNodeKey(node)];
        if (node.node_type === 'result_view') {
            if (!time?.start_at || !time.appeal_deadline)
                return `${node.name}的开始时间和发起复议截止时间不能为空`;
            if (time.appeal_deadline <= time.start_at)
                return `${node.name}的发起复议截止时间必须晚于开始时间`;
        }
        else if (node.node_type === 'result_reconsideration') {
            if (!time?.end_at)
                return `${node.name}的处理复议截止时间不能为空`;
        }
        else {
            if (!time?.start_at || !time.end_at)
                return `${node.name}的开始时间和截止时间不能为空`;
            if (time.end_at <= time.start_at)
                return `${node.name}的截止时间必须晚于开始时间`;
        }
    }
    return '';
});
function addGroup() { form.evaluator_rules.groups.push({ conditions: [{ field: 'department', operator: 'include', values: [] }] }); }
function removeGroup(index) { if (form.evaluator_rules.groups.length > 1)
    form.evaluator_rules.groups.splice(index, 1); }
function addCondition(index) { form.evaluator_rules.groups[index].conditions.push({ field: 'department', operator: 'include', values: [] }); }
function removeCondition(groupIndex, conditionIndex) { const conditions = form.evaluator_rules.groups[groupIndex].conditions; if (conditions.length > 1)
    conditions.splice(conditionIndex, 1); }
function optionsFor(field) { return field === 'department' ? evaluatorOptions.value.departments : field === 'employee_type' ? evaluatorOptions.value.employee_types : evaluatorOptions.value.employees; }
function openBasicEditor() { if (!projectId.value)
    return; basicDialogProject.value = { id: projectId.value, project_ref: '', name: form.name, description: form.description || null, administrators: [...form.administrators], status: 'DRAFT', evaluated_count: 0 }; basicDialogOpen.value = true; }
async function saveBasicInfo(payload) { if (!projectId.value)
    return; basicDialogSaving.value = true; try {
    await performanceProjectApi.update(projectId.value, payload);
    basicDialogOpen.value = false;
    await loadProject();
}
catch (error) {
    notice.value = error?.response?.data?.detail || '基本信息保存失败';
}
finally {
    basicDialogSaving.value = false;
} }
function toInputTime(value) { return value ? value.slice(0, 16) : ''; }
function validate() { validationError.value = ''; if (!form.name.trim())
    validationError.value = '项目名称不能为空';
else if (!form.template_id)
    validationError.value = '请选择绩效模板';
else if (!form.evaluator_rules.groups.some(group => group.conditions.some(condition => condition.values.length)))
    validationError.value = '请至少配置一个被评估人筛选条件';
else if (dateError.value)
    validationError.value = '项目截止时间必须晚于开始时间'; return !validationError.value; }
function payload() { return { name: form.name.trim(), description: form.description.trim() || null, administrators: form.administrators, template_id: form.template_id, start_at: form.start_at ? new Date(form.start_at).toISOString() : null, end_at: form.end_at ? new Date(form.end_at).toISOString() : null, evaluator_rules: { groups: form.evaluator_rules.groups.map(group => ({ conditions: group.conditions.map(condition => { const values = Array.isArray(condition.values) ? condition.values : String(condition.values).split(/[、,，]/).map(value => value.trim()).filter(Boolean); return { ...condition, values }; }) })) }, flow_settings: form.flow_settings }; }
async function loadTemplates() { templateLoading.value = true; try {
    templates.value = (await performanceTemplateApi.list()).filter(template => template.status === 'active');
}
catch {
    notice.value = '绩效模板加载失败，请稍后重试';
}
finally {
    templateLoading.value = false;
} }
async function loadTemplateWorkflow() {
    if (!form.template_id) {
        workflowNodes.value = [];
        flowError.value = '';
        return;
    }
    flowLoading.value = true;
    flowError.value = '';
    try {
        const workflow = await performanceTemplateApi.getWorkflow(form.template_id);
        workflowNodes.value = workflow.nodes;
    }
    catch (error) {
        workflowNodes.value = [];
        flowError.value = error?.response?.data?.detail?.message || '绩效模板流程加载失败，请稍后重试';
    }
    finally {
        flowLoading.value = false;
    }
}
async function loadEvaluatorOptions() { if (!cycleId.value)
    return; try {
    evaluatorOptions.value = await performanceProjectApi.listEvaluatorOptions(cycleId.value);
}
catch {
    notice.value = '被评估人名单加载失败，请稍后重试';
} }
async function loadProject() { if (!projectId.value)
    return; try {
    const project = await performanceProjectApi.get(projectId.value);
    form.name = project.name;
    form.description = project.description || '';
    form.administrators = [...project.administrators];
    form.template_id = project.template_id;
    form.start_at = toInputTime(project.start_at);
    form.end_at = toInputTime(project.end_at);
    evaluatedCount.value = project.evaluated_count;
    const savedFlowSettings = project.flow_settings || { node_settings: {}, node_times: {} };
    form.flow_settings = { node_settings: savedFlowSettings.node_settings || {}, node_times: savedFlowSettings.node_times || {} };
    if (project.evaluator_rules?.groups?.length)
        form.evaluator_rules = JSON.parse(JSON.stringify(project.evaluator_rules));
    savedView.value = true;
}
catch (error) {
    notice.value = error?.response?.data?.detail || '项目加载失败';
} }
async function saveDraft() { if (!projectId.value)
    return true; saving.value = true; try {
    await performanceProjectApi.update(projectId.value, payload());
    return true;
}
catch (error) {
    notice.value = error?.response?.data?.detail || '当前步骤保存失败';
    return false;
}
finally {
    saving.value = false;
} }
async function nextStep() { if (currentStep.value === 0 && !validate())
    return; if (currentStep.value < steps.length - 1) {
    if (await saveDraft())
        currentStep.value += 1;
    return;
} if (nodeTimeError.value) {
    validationError.value = nodeTimeError.value;
    return;
} if (!validate() || saving.value)
    return; if (await saveDraft()) {
    savedView.value = true;
    notice.value = '项目设置已保存';
} }
function goBack() { void router.push({ name: 'PerformanceCycles' }); }
onMounted(async () => { document.body.style.overflow = 'hidden'; await loadTemplates(); await loadEvaluatorOptions(); await loadProject(); await loadTemplateWorkflow(); });
onBeforeUnmount(() => { document.body.style.overflow = ''; });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['project-settings-page']} */ ;
/** @type {__VLS_StyleScopedClasses['edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['previous-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-settings-content']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['date-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['date-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['date-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-group-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-group-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-summary']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-settings-page" },
});
/** @type {[typeof PageHeader, typeof PageHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PageHeader, new PageHeader({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.projectName || '新建项目'),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.projectName || '新建项目'),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (__VLS_ctx.goBack)
};
__VLS_2.slots.default;
{
    const { subtitle: __VLS_thisSlot } = __VLS_2.slots;
    if (__VLS_ctx.savedView) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "project-status-badge" },
        });
    }
}
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    /** @type {[typeof PerformanceStepFlow, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceStepFlow, new PerformanceStepFlow({
        steps: (__VLS_ctx.steps),
        currentStep: (__VLS_ctx.currentStep),
        'aria-label': "项目设置步骤",
    }));
    const __VLS_8 = __VLS_7({
        steps: (__VLS_ctx.steps),
        currentStep: (__VLS_ctx.currentStep),
        'aria-label': "项目设置步骤",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    if (__VLS_ctx.currentStep > 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.currentStep > 0))
                        return;
                    __VLS_ctx.currentStep--;
                } },
            ...{ class: "previous-button" },
            type: "button",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.nextStep) },
        ...{ class: "next-button" },
        type: "button",
        disabled: (__VLS_ctx.saving),
    });
    (__VLS_ctx.currentStep === __VLS_ctx.steps.length - 1 ? '完成' : '下一步');
}
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "project-settings-content" },
});
/** @type {[typeof PerformanceContentSurface, typeof PerformanceContentSurface, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(PerformanceContentSurface, new PerformanceContentSurface({
    ...{ class: "settings-surface" },
}));
const __VLS_11 = __VLS_10({
    ...{ class: "settings-surface" },
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
if (__VLS_ctx.currentStep === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card" },
        'aria-labelledby': "project-info-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "card-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        id: "project-info-title",
    });
    if (__VLS_ctx.savedView) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.openBasicEditor) },
            ...{ class: "card-edit-button" },
            type: "button",
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "basic-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        maxlength: "128",
        disabled: (__VLS_ctx.savedView),
    });
    (__VLS_ctx.form.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        placeholder: "例如：HRBP",
        disabled: (__VLS_ctx.savedView),
    });
    (__VLS_ctx.administratorsText);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "wide" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.form.description),
        maxlength: "500",
        rows: "2",
        disabled: (__VLS_ctx.savedView),
    });
}
if (__VLS_ctx.currentStep === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card" },
        'aria-labelledby': "template-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "template-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
        ...{ onChange: (__VLS_ctx.loadTemplateWorkflow) },
        value: (__VLS_ctx.form.template_id),
        disabled: (__VLS_ctx.saving),
        ...{ class: "template-select" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
        value: (null),
    });
    for (const [template] of __VLS_getVForSourceType((__VLS_ctx.templates))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
            key: (template.template_id),
            value: (template.template_id),
        });
        (template.name);
    }
    if (__VLS_ctx.templateLoading) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "muted" },
        });
    }
    else if (!__VLS_ctx.templates.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "muted" },
        });
    }
}
if (__VLS_ctx.currentStep === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card" },
        'aria-labelledby': "people-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "people-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "required" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hint" },
    });
    for (const [group, groupIndex] of __VLS_getVForSourceType((__VLS_ctx.form.evaluator_rules.groups))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (groupIndex),
            ...{ class: "rule-group" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "rule-group-heading" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        (groupIndex + 1);
        /** @type {[typeof PerformanceIconButton, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除范围 ${groupIndex + 1}`),
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onClick': {} },
            icon: "DeleteTrashOutlined",
            label: (`删除范围 ${groupIndex + 1}`),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_16;
        let __VLS_17;
        let __VLS_18;
        const __VLS_19 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.currentStep === 0))
                    return;
                __VLS_ctx.removeGroup(groupIndex);
            }
        };
        var __VLS_15;
        for (const [condition, conditionIndex] of __VLS_getVForSourceType((group.conditions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (conditionIndex),
                ...{ class: "rule-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                ...{ onChange: (...[$event]) => {
                        if (!(__VLS_ctx.currentStep === 0))
                            return;
                        condition.values = [];
                    } },
                value: (condition.field),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "department",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "employee_type",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "employee",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.select, __VLS_intrinsicElements.select)({
                value: (condition.operator),
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "include",
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.option, __VLS_intrinsicElements.option)({
                value: "exclude",
            });
            /** @type {[typeof PerformanceMultiSelect, ]} */ ;
            // @ts-ignore
            const __VLS_20 = __VLS_asFunctionalComponent(PerformanceMultiSelect, new PerformanceMultiSelect({
                modelValue: (condition.values),
                options: (__VLS_ctx.optionsFor(condition.field)),
                placeholder: (condition.field === 'department' ? '请选择部门' : condition.field === 'employee_type' ? '请选择人员类型' : '请选择员工'),
            }));
            const __VLS_21 = __VLS_20({
                modelValue: (condition.values),
                options: (__VLS_ctx.optionsFor(condition.field)),
                placeholder: (condition.field === 'department' ? '请选择部门' : condition.field === 'employee_type' ? '请选择人员类型' : '请选择员工'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_20));
            /** @type {[typeof PerformanceIconButton, ]} */ ;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
                ...{ 'onClick': {} },
                icon: "DeleteTrashOutlined",
                label: (`删除范围 ${groupIndex + 1} 条件 ${conditionIndex + 1}`),
            }));
            const __VLS_24 = __VLS_23({
                ...{ 'onClick': {} },
                icon: "DeleteTrashOutlined",
                label: (`删除范围 ${groupIndex + 1} 条件 ${conditionIndex + 1}`),
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
            let __VLS_26;
            let __VLS_27;
            let __VLS_28;
            const __VLS_29 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.currentStep === 0))
                        return;
                    __VLS_ctx.removeCondition(groupIndex, conditionIndex);
                }
            };
            var __VLS_25;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.currentStep === 0))
                        return;
                    __VLS_ctx.addCondition(groupIndex);
                } },
            ...{ class: "link-button" },
            type: "button",
        });
        if (groupIndex < __VLS_ctx.form.evaluator_rules.groups.length - 1) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "or-divider" },
            });
        }
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.addGroup) },
        ...{ class: "link-button add-group" },
        type: "button",
    });
    if (__VLS_ctx.validationError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
            role: "alert",
        });
        (__VLS_ctx.validationError);
    }
}
if (__VLS_ctx.currentStep === 1) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card flow-card" },
        'aria-labelledby': "flow-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        id: "flow-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hint" },
    });
    if (__VLS_ctx.form.template_id) {
        /** @type {[typeof PerformanceProjectFlowSettings, ]} */ ;
        // @ts-ignore
        const __VLS_30 = __VLS_asFunctionalComponent(PerformanceProjectFlowSettings, new PerformanceProjectFlowSettings({
            modelValue: (__VLS_ctx.form.flow_settings),
            nodes: (__VLS_ctx.workflowNodes),
            peopleOptions: (__VLS_ctx.evaluatorOptions.employees),
            evaluatedCount: (__VLS_ctx.evaluatedCount),
            loading: (__VLS_ctx.flowLoading),
            error: (__VLS_ctx.flowError),
        }));
        const __VLS_31 = __VLS_30({
            modelValue: (__VLS_ctx.form.flow_settings),
            nodes: (__VLS_ctx.workflowNodes),
            peopleOptions: (__VLS_ctx.evaluatorOptions.employees),
            evaluatedCount: (__VLS_ctx.evaluatedCount),
            loading: (__VLS_ctx.flowLoading),
            error: (__VLS_ctx.flowError),
        }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "flow-summary" },
        });
    }
}
if (__VLS_ctx.currentStep === 2) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "settings-card time-card" },
        'aria-labelledby': "date-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        id: "date-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "hint" },
    });
    /** @type {[typeof PerformanceProjectTimeSettings, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(PerformanceProjectTimeSettings, new PerformanceProjectTimeSettings({
        modelValue: (__VLS_ctx.form.flow_settings.node_times),
        nodes: (__VLS_ctx.workflowNodes),
        loading: (__VLS_ctx.flowLoading),
        error: (__VLS_ctx.flowError),
    }));
    const __VLS_34 = __VLS_33({
        modelValue: (__VLS_ctx.form.flow_settings.node_times),
        nodes: (__VLS_ctx.workflowNodes),
        loading: (__VLS_ctx.flowLoading),
        error: (__VLS_ctx.flowError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    if (__VLS_ctx.nodeTimeError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "error" },
            role: "alert",
        });
        (__VLS_ctx.nodeTimeError);
    }
}
var __VLS_12;
if (__VLS_ctx.notice) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "page-notice" },
        role: "alert",
    });
    (__VLS_ctx.notice);
}
/** @type {[typeof PerformanceProjectDialog, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(PerformanceProjectDialog, new PerformanceProjectDialog({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.basicDialogOpen),
    mode: "edit",
    project: (__VLS_ctx.basicDialogProject),
    canSubmit: (Boolean(__VLS_ctx.projectId)),
    saving: (__VLS_ctx.basicDialogSaving),
}));
const __VLS_37 = __VLS_36({
    ...{ 'onSubmit': {} },
    modelValue: (__VLS_ctx.basicDialogOpen),
    mode: "edit",
    project: (__VLS_ctx.basicDialogProject),
    canSubmit: (Boolean(__VLS_ctx.projectId)),
    saving: (__VLS_ctx.basicDialogSaving),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
let __VLS_39;
let __VLS_40;
let __VLS_41;
const __VLS_42 = {
    onSubmit: (__VLS_ctx.saveBasicInfo)
};
var __VLS_38;
/** @type {__VLS_StyleScopedClasses['project-settings-page']} */ ;
/** @type {__VLS_StyleScopedClasses['project-status-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['previous-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['project-settings-content']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['card-edit-button']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['wide']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['template-select']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['muted']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-group']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-group-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-row']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['or-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['link-button']} */ ;
/** @type {__VLS_StyleScopedClasses['add-group']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['flow-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['settings-card']} */ ;
/** @type {__VLS_StyleScopedClasses['time-card']} */ ;
/** @type {__VLS_StyleScopedClasses['hint']} */ ;
/** @type {__VLS_StyleScopedClasses['error']} */ ;
/** @type {__VLS_StyleScopedClasses['page-notice']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PageHeader: PageHeader,
            PerformanceStepFlow: PerformanceStepFlow,
            PerformanceProjectDialog: PerformanceProjectDialog,
            PerformanceMultiSelect: PerformanceMultiSelect,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceContentSurface: PerformanceContentSurface,
            PerformanceProjectFlowSettings: PerformanceProjectFlowSettings,
            PerformanceProjectTimeSettings: PerformanceProjectTimeSettings,
            projectId: projectId,
            evaluatorOptions: evaluatorOptions,
            savedView: savedView,
            currentStep: currentStep,
            saving: saving,
            notice: notice,
            validationError: validationError,
            templateLoading: templateLoading,
            templates: templates,
            basicDialogOpen: basicDialogOpen,
            basicDialogSaving: basicDialogSaving,
            basicDialogProject: basicDialogProject,
            workflowNodes: workflowNodes,
            flowLoading: flowLoading,
            flowError: flowError,
            evaluatedCount: evaluatedCount,
            steps: steps,
            form: form,
            administratorsText: administratorsText,
            projectName: projectName,
            nodeTimeError: nodeTimeError,
            addGroup: addGroup,
            removeGroup: removeGroup,
            addCondition: addCondition,
            removeCondition: removeCondition,
            optionsFor: optionsFor,
            openBasicEditor: openBasicEditor,
            saveBasicInfo: saveBasicInfo,
            loadTemplateWorkflow: loadTemplateWorkflow,
            nextStep: nextStep,
            goBack: goBack,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
