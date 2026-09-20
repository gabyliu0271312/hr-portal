/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { reactive, watch } from 'vue';
import ReviewQuestionFormType from './ReviewQuestionFormType.vue';
const props = withDefaults(defineProps(), { options: () => [] });
const emit = defineEmits();
const form = reactive({
    language: '中文',
    name: '',
    description: '',
    type: 'regular',
    rule_id: null,
    remark: '',
});
watch(() => props.modelValue, (open) => {
    if (open) {
        form.language = '中文';
        form.name = props.question?.name ?? '';
        form.description = '';
        form.type = props.question?.type || 'regular';
        form.rule_id = props.question?.rule_id ?? null;
        form.remark = props.question?.remark ?? '';
    }
});
function handleSubmit() {
    emit('submit', { ...form });
    emit('update:modelValue', false);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ options: () => [] });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    title: (__VLS_ctx.mode === 'create' ? '新建评估题' : '编辑评估题'),
    width: "640px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.modelValue),
    title: (__VLS_ctx.mode === 'create' ? '新建评估题' : '编辑评估题'),
    width: "640px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:modelValue', $event);
    }
};
var __VLS_8 = {};
__VLS_3.slots.default;
const __VLS_9 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    labelWidth: "96px",
    labelPosition: "left",
}));
const __VLS_11 = __VLS_10({
    labelWidth: "96px",
    labelPosition: "left",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    label: "语言",
}));
const __VLS_15 = __VLS_14({
    label: "语言",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
const __VLS_17 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    modelValue: (__VLS_ctx.form.language),
}));
const __VLS_19 = __VLS_18({
    modelValue: (__VLS_ctx.form.language),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    value: "中文",
}));
const __VLS_23 = __VLS_22({
    value: "中文",
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
__VLS_24.slots.default;
var __VLS_24;
const __VLS_25 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    value: "英文",
}));
const __VLS_27 = __VLS_26({
    value: "英文",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_28.slots.default;
var __VLS_28;
var __VLS_20;
var __VLS_16;
const __VLS_29 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    label: "名称",
    required: true,
}));
const __VLS_31 = __VLS_30({
    label: "名称",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_32.slots.default;
const __VLS_33 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入名称",
}));
const __VLS_35 = __VLS_34({
    modelValue: (__VLS_ctx.form.name),
    placeholder: "请输入名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
var __VLS_32;
const __VLS_37 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    label: "描述",
}));
const __VLS_39 = __VLS_38({
    label: "描述",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
__VLS_40.slots.default;
const __VLS_41 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    maxlength: "1000",
    showWordLimit: true,
    placeholder: "描述将展示给评估人，以帮助其进行评估",
}));
const __VLS_43 = __VLS_42({
    modelValue: (__VLS_ctx.form.description),
    type: "textarea",
    rows: (3),
    maxlength: "1000",
    showWordLimit: true,
    placeholder: "描述将展示给评估人，以帮助其进行评估",
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
var __VLS_40;
const __VLS_45 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    label: "类型",
    required: true,
}));
const __VLS_47 = __VLS_46({
    label: "类型",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
__VLS_48.slots.default;
/** @type {[typeof ReviewQuestionFormType, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(ReviewQuestionFormType, new ReviewQuestionFormType({
    modelValue: (__VLS_ctx.form.type),
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.form.type),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
var __VLS_48;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    label: "评估规则",
}));
const __VLS_54 = __VLS_53({
    label: "评估规则",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    modelValue: (__VLS_ctx.form.rule_id),
    placeholder: "请选择",
    ...{ style: {} },
}));
const __VLS_58 = __VLS_57({
    modelValue: (__VLS_ctx.form.rule_id),
    placeholder: "请选择",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
for (const [option] of __VLS_getVForSourceType((__VLS_ctx.options))) {
    const __VLS_60 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }));
    const __VLS_62 = __VLS_61({
        key: (option.id),
        label: (option.name),
        value: (option.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
}
var __VLS_59;
var __VLS_55;
const __VLS_64 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "备注",
}));
const __VLS_66 = __VLS_65({
    label: "备注",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
__VLS_67.slots.default;
const __VLS_68 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    modelValue: (__VLS_ctx.form.remark),
    type: "textarea",
    rows: (2),
    maxlength: "2000",
    showWordLimit: true,
}));
const __VLS_70 = __VLS_69({
    modelValue: (__VLS_ctx.form.remark),
    type: "textarea",
    rows: (2),
    maxlength: "2000",
    showWordLimit: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_67;
var __VLS_12;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_72 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        ...{ 'onClick': {} },
    }));
    const __VLS_74 = __VLS_73({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    let __VLS_76;
    let __VLS_77;
    let __VLS_78;
    const __VLS_79 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('update:modelValue', false);
        }
    };
    __VLS_75.slots.default;
    var __VLS_75;
    const __VLS_80 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ 'onClick': {} },
    }));
    const __VLS_82 = __VLS_81({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    let __VLS_84;
    let __VLS_85;
    let __VLS_86;
    const __VLS_87 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('preview', { ...__VLS_ctx.form });
        }
    };
    __VLS_83.slots.default;
    var __VLS_83;
    const __VLS_88 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        ...{ 'onClick': {} },
        type: "primary",
    }));
    const __VLS_90 = __VLS_89({
        ...{ 'onClick': {} },
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    let __VLS_92;
    let __VLS_93;
    let __VLS_94;
    const __VLS_95 = {
        onClick: (__VLS_ctx.handleSubmit)
    };
    __VLS_91.slots.default;
    var __VLS_91;
}
var __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ReviewQuestionFormType: ReviewQuestionFormType,
            emit: emit,
            form: form,
            handleSubmit: handleSubmit,
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
