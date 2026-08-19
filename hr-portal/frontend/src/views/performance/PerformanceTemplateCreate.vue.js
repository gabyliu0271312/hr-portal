/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import PerformanceSwitch from '@/components/performance/PerformanceSwitch.vue';
import PerformanceTemplateWorkflowSettings from './PerformanceTemplateWorkflowSettings.vue';
const router = useRouter();
const workflowRef = ref(null);
const templateId = Number(router.currentRoute.value.query.template_id || 0) || null;
const templateName = ref('');
const description = ref('');
const englishEnabled = ref(false);
const calculationEnabled = ref(false);
const selectedRules = ref([]);
const currentStep = ref(0);
const nameError = ref('');
const calculationError = ref(false);
const notice = ref('');
const mockTemplateNames = ['11', '半年度绩效评估（2026模板）', '全年度绩效评估', '半年度绩效评估'];
const calculationOptions = [{ key: 'content', label: '按评估内容计算', description: '可配置环节内的各个评估项评分计算得到环节内的总分' }, { key: 'role', label: '按评估角色计算', description: '可配置不同环节的评估项评分计算得到最终结果' }];
const steps = computed(() => { const result = [{ key: 'basic', label: '基本信息' }, { key: 'flow', label: '流程设置' }, { key: 'content', label: '内容设置' }]; if (calculationEnabled.value)
    result.push({ key: 'calculation', label: '计算规则' }); result.push({ key: 'preview', label: '模板预览' }); return result; });
function toggleCalculation(value) { calculationEnabled.value = value; calculationError.value = false; selectedRules.value = []; }
function validate() { const name = templateName.value.trim(); if (!name) {
    nameError.value = '名称为必填';
    return false;
} ; if (mockTemplateNames.includes(name)) {
    nameError.value = '该模板名称已存在，请重新输入';
    notice.value = nameError.value;
    return false;
} ; nameError.value = ''; if (calculationEnabled.value && selectedRules.value.length === 0) {
    calculationError.value = true;
    return false;
} ; calculationError.value = false; return true; }
function handleNext() { if (currentStep.value === 1) {
    void workflowRef.value?.save();
    return;
} ; goNext(); }
function goNext() { if (currentStep.value === 0 && !validate())
    return; if (currentStep.value === 0)
    localStorage.setItem('performance-template-draft', JSON.stringify({ name: templateName.value.trim(), description: description.value, englishEnabled: englishEnabled.value, calculationEnabled: calculationEnabled.value, selectedRules: selectedRules.value })); currentStep.value = Math.min(currentStep.value + 1, steps.value.length - 1); }
function goBack() { if (currentStep.value === 0)
    void router.push({ name: 'PerformanceTemplates' });
else
    currentStep.value -= 1; }
onMounted(() => { document.body.style.overflow = 'hidden'; if (router.currentRoute.value.query.step === 'workflow')
    currentStep.value = 1; });
onBeforeUnmount(() => { document.body.style.overflow = ''; });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['invalid']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-box']} */ ;
/** @type {__VLS_StyleScopedClasses['option-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['option-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['create-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['create-body']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['step-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-description']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-form']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['language-field']} */ ;
/** @type {__VLS_StyleScopedClasses['language-field']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-box']} */ ;
/** @type {__VLS_StyleScopedClasses['checked']} */ ;
/** @type {__VLS_StyleScopedClasses['language-field']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-field']} */ ;
/** @type {__VLS_StyleScopedClasses['switch']} */ ;
/** @type {__VLS_StyleScopedClasses['on']} */ ;
/** @type {__VLS_StyleScopedClasses['switch-thumb']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['notice']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder-panel']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
    ...{ class: "full-screen-modal-header" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-left" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.goBack) },
    ...{ class: "full-screen-modal-header-back" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "universe-icon full-screen-modal-header-back-icon" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    'data-icon': "SpaceLeftOutlined",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
    d: "M1.293 11.293a1 1 0 0 0 0 1.414l7 7a1 1 0 0 0 1.414-1.414L4.414 13H21a1 1 0 1 0 0-2H4.414l5.293-5.293a1 1 0 0 0-1.414-1.414l-7 7Z",
    fill: "currentColor",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "full-screen-modal-header-back-text" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-gap" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-subtitle" },
    'aria-hidden': "true",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-right" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal-header-actions" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.nav, __VLS_intrinsicElements.nav)({
    ...{ class: "step-flow" },
    'aria-label': "创建步骤",
});
for (const [step, index] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
    (step.key);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "step-item" },
        ...{ class: ({ current: index === __VLS_ctx.currentStep }) },
    });
    (step.label);
    if (index < __VLS_ctx.steps.length - 1) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "step-separator" },
            'aria-hidden': "true",
        });
    }
}
if (__VLS_ctx.currentStep > 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.goBack) },
        ...{ class: "previous-button" },
        type: "button",
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
    ...{ onClick: (__VLS_ctx.handleNext) },
    ...{ class: "next-button" },
    type: "button",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "full-screen-modal-content" },
});
if (__VLS_ctx.currentStep === 0) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "basic-info-panel" },
        'aria-labelledby': "basic-info-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({
        id: "basic-info-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "panel-description" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
        ...{ onSubmit: (__VLS_ctx.goNext) },
        ...{ class: "basic-info-form" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
        ...{ class: "form-item language-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.legend, __VLS_intrinsicElements.legend)({
        ...{ class: "field-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "field-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "language-options" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "checkbox-row fixed-checkbox" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        checked: true,
        disabled: true,
        type: "checkbox",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "checkbox-box checked" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "checkbox-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "checkbox-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "checkbox",
    });
    (__VLS_ctx.englishEnabled);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "checkbox-box" },
        ...{ class: ({ checked: __VLS_ctx.englishEnabled }) },
    });
    (__VLS_ctx.englishEnabled ? '✓' : '');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "checkbox-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-item" },
        ...{ class: ({ invalid: __VLS_ctx.nameError }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "required-mark" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "native-input" },
        maxlength: "100",
        placeholder: "请输入模板名称",
        'aria-label': "模板名称",
    });
    (__VLS_ctx.templateName);
    if (__VLS_ctx.nameError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "field-error" },
        });
        (__VLS_ctx.nameError);
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "form-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "textarea-wrap" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
        value: (__VLS_ctx.description),
        ...{ class: "native-textarea" },
        maxlength: "2000",
        placeholder: "请输入模板描述",
        'aria-label': "模板描述",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "character-count" },
    });
    (__VLS_ctx.description.length);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.fieldset, __VLS_intrinsicElements.fieldset)({
        ...{ class: "form-item calculation-field" },
        ...{ class: ({ invalid: __VLS_ctx.calculationError }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "calculation-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    /** @type {[typeof PerformanceSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.calculationEnabled),
        'aria-label': "配置计算规则",
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.calculationEnabled),
        'aria-label': "配置计算规则",
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        'onUpdate:modelValue': (__VLS_ctx.toggleCalculation)
    };
    var __VLS_2;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "calculation-hint" },
    });
    if (__VLS_ctx.calculationEnabled) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "calculation-options" },
        });
        for (const [option] of __VLS_getVForSourceType((__VLS_ctx.calculationOptions))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                key: (option.key),
                ...{ class: "checkbox-row option-row" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
                type: "checkbox",
                value: (option.key),
            });
            (__VLS_ctx.selectedRules);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "checkbox-box" },
                ...{ class: ({ checked: __VLS_ctx.selectedRules.includes(option.key) }) },
            });
            (__VLS_ctx.selectedRules.includes(option.key) ? '✓' : '');
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "option-copy" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
            (option.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
            (option.description);
        }
    }
    if (__VLS_ctx.calculationError) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "field-error" },
        });
    }
}
if (__VLS_ctx.currentStep === 1) {
    /** @type {[typeof PerformanceTemplateWorkflowSettings, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceTemplateWorkflowSettings, new PerformanceTemplateWorkflowSettings({
        ...{ 'onBack': {} },
        ...{ 'onNext': {} },
        ref: "workflowRef",
        templateId: (__VLS_ctx.templateId),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onBack': {} },
        ...{ 'onNext': {} },
        ref: "workflowRef",
        templateId: (__VLS_ctx.templateId),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onBack: (__VLS_ctx.goBack)
    };
    const __VLS_14 = {
        onNext: (__VLS_ctx.goNext)
    };
    /** @type {typeof __VLS_ctx.workflowRef} */ ;
    var __VLS_15 = {};
    var __VLS_9;
}
else if (__VLS_ctx.currentStep >= 2) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "placeholder-panel" },
        'aria-live': "polite",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h1, __VLS_intrinsicElements.h1)({});
    (__VLS_ctx.steps[__VLS_ctx.currentStep].label);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({});
}
if (__VLS_ctx.notice) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "notice" },
        role: "alert",
    });
    (__VLS_ctx.notice);
}
/** @type {__VLS_StyleScopedClasses['full-screen-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back']} */ ;
/** @type {__VLS_StyleScopedClasses['universe-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-back-text']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-gap']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-title']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-subtitle']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-right']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-header-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['step-flow']} */ ;
/** @type {__VLS_StyleScopedClasses['step-item']} */ ;
/** @type {__VLS_StyleScopedClasses['step-separator']} */ ;
/** @type {__VLS_StyleScopedClasses['previous-button']} */ ;
/** @type {__VLS_StyleScopedClasses['next-button']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['panel-description']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['language-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['language-options']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed-checkbox']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-box']} */ ;
/** @type {__VLS_StyleScopedClasses['checked']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-box']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-label']} */ ;
/** @type {__VLS_StyleScopedClasses['form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['character-count']} */ ;
/** @type {__VLS_StyleScopedClasses['form-item']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-field']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['calculation-options']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-row']} */ ;
/** @type {__VLS_StyleScopedClasses['option-row']} */ ;
/** @type {__VLS_StyleScopedClasses['checkbox-box']} */ ;
/** @type {__VLS_StyleScopedClasses['option-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['field-error']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['notice']} */ ;
// @ts-ignore
var __VLS_16 = __VLS_15;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceSwitch: PerformanceSwitch,
            PerformanceTemplateWorkflowSettings: PerformanceTemplateWorkflowSettings,
            workflowRef: workflowRef,
            templateId: templateId,
            templateName: templateName,
            description: description,
            englishEnabled: englishEnabled,
            calculationEnabled: calculationEnabled,
            selectedRules: selectedRules,
            currentStep: currentStep,
            nameError: nameError,
            calculationError: calculationError,
            notice: notice,
            calculationOptions: calculationOptions,
            steps: steps,
            toggleCalculation: toggleCalculation,
            handleNext: handleNext,
            goNext: goNext,
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
