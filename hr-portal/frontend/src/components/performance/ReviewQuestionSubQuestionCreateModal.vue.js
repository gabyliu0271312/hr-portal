/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { reactive, watch } from 'vue';
import ReviewQuestionFormType from './ReviewQuestionFormType.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
import PerformanceTextField from './PerformanceTextField.vue';
import ReviewQuestionRuleSelect from './ReviewQuestionRuleSelect.vue';
const props = withDefaults(defineProps(), { ruleOptions: () => [] });
const emit = defineEmits();
const form = reactive({ language: '中文', name: '', description: '', type: 'regular', rule_id: null, remark: '' });
watch(() => props.open, (open) => {
    if (!open)
        return;
    form.language = '中文';
    form.name = '';
    form.description = '';
    form.type = 'regular';
    form.rule_id = null;
    form.remark = '';
});
function close() { emit('update:open', false); }
function submit() {
    if (!form.name.trim() || form.rule_id === null)
        return;
    emit('submit', { ...form, name: form.name.trim() });
    close();
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ ruleOptions: () => [] });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-input']} */ ;
/** @type {__VLS_StyleScopedClasses['language-options']} */ ;
/** @type {__VLS_StyleScopedClasses['language-options']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (props.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "sub-question-modal-mask" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sub-question-create-modal" },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "sub-question-create-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "sub-question-modal-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "sub-question-create-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "sub-question-modal-close" },
        type: "button",
        'aria-label': "关闭",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sub-question-modal-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "language-options" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "checkbox",
        checked: true,
        disabled: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "checkbox",
        disabled: true,
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "名称",
    }));
    const __VLS_1 = __VLS_0({
        label: "名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        ...{ class: "sub-question-modal-input" },
        placeholder: "请输入名称",
    });
    (__VLS_ctx.form.name);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
    /** @type {[typeof PerformanceTextField, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        maxlength: (1000),
        showCount: true,
    }));
    const __VLS_4 = __VLS_3({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        maxlength: (1000),
        showCount: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "类型",
    }));
    const __VLS_7 = __VLS_6({
        label: "类型",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    /** @type {[typeof ReviewQuestionFormType, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(ReviewQuestionFormType, new ReviewQuestionFormType({
        modelValue: (__VLS_ctx.form.type),
        entryMode: "sub_question",
    }));
    const __VLS_10 = __VLS_9({
        modelValue: (__VLS_ctx.form.type),
        entryMode: "sub_question",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sub-question-modal-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "评估规则",
    }));
    const __VLS_13 = __VLS_12({
        label: "评估规则",
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    /** @type {[typeof ReviewQuestionRuleSelect, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(ReviewQuestionRuleSelect, new ReviewQuestionRuleSelect({
        modelValue: (__VLS_ctx.form.rule_id),
        options: (props.ruleOptions),
    }));
    const __VLS_16 = __VLS_15({
        modelValue: (__VLS_ctx.form.rule_id),
        options: (props.ruleOptions),
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "sub-question-modal-card remark-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-modal-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "field-label" },
    });
    /** @type {[typeof PerformanceTextField, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(PerformanceTextField, new PerformanceTextField({
        modelValue: (__VLS_ctx.form.remark),
        type: "textarea",
        maxlength: (2000),
        showCount: true,
    }));
    const __VLS_19 = __VLS_18({
        modelValue: (__VLS_ctx.form.remark),
        type: "textarea",
        maxlength: (2000),
        showCount: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.footer, __VLS_intrinsicElements.footer)({
        ...{ class: "sub-question-modal-footer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.close) },
        ...{ class: "sub-question-modal-button secondary" },
        type: "button",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.submit) },
        ...{ class: "sub-question-modal-button primary" },
        type: "button",
    });
}
/** @type {__VLS_StyleScopedClasses['sub-question-modal-mask']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-create-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-close']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-body']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['language-options']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-input']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-card']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-card']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-field']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['secondary']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-modal-button']} */ ;
/** @type {__VLS_StyleScopedClasses['primary']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReviewQuestionFormType: ReviewQuestionFormType,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            PerformanceTextField: PerformanceTextField,
            ReviewQuestionRuleSelect: ReviewQuestionRuleSelect,
            form: form,
            close: close,
            submit: submit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
