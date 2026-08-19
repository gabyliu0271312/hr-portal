/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { toUtcNaive } from '@/utils/datetime';
import { ref, computed } from 'vue';
import { ElMessage } from 'element-plus';
const props = defineProps();
const emit = defineEmits();
const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});
const formRef = ref(null);
const submitting = ref(false);
const form = ref({
    dry_run: false,
});
const timeRangeValue = ref(null);
const overrideParamsText = ref('');
const rules = {
    dry_run: [{ required: true, message: '请选择触发方式', trigger: 'change' }],
};
function onOpen() {
    // 重置表单
    form.value = { dry_run: false };
    timeRangeValue.value = null;
    overrideParamsText.value = '';
    formRef.value?.clearValidate();
}
async function onSubmit() {
    if (!formRef.value)
        return;
    try {
        await formRef.value.validate();
    }
    catch {
        return;
    }
    // 解析 override_params JSON
    let override_params = null;
    if (overrideParamsText.value.trim()) {
        try {
            const parsed = JSON.parse(overrideParamsText.value);
            if (typeof parsed !== 'object' || Array.isArray(parsed)) {
                ElMessage.error('步骤参数覆盖必须是 JSON 对象');
                return;
            }
            override_params = parsed;
        }
        catch (e) {
            ElMessage.error(`步骤参数 JSON 解析失败: ${e.message ?? e}`);
            return;
        }
    }
    // 构造 time_range
    const time_range = timeRangeValue.value && timeRangeValue.value.length === 2
        ? { start: toUtcNaive(timeRangeValue.value[0]) ?? '', end: toUtcNaive(timeRangeValue.value[1]) ?? '' }
        : null;
    const params = {
        dry_run: form.value.dry_run,
        time_range,
        override_params,
    };
    submitting.value = true;
    try {
        // 父组件负责调用 API 并 resolve
        const result = await new Promise((resolve, reject) => {
            emit('submit', params, resolve, reject);
        });
        ElMessage.success(form.value.dry_run
            ? `模拟执行完成，状态：${result.status}`
            : `Pipeline 已触发，Run #${result.pipeline_run_id}，状态：${result.status}`);
        visible.value = false;
    }
    catch (e) {
        const detail = e?.response?.data?.detail;
        let errMsg;
        if (typeof detail === 'object' && detail?.message) {
            errMsg = detail.message;
        }
        else if (typeof detail === 'string') {
            errMsg = detail;
        }
        else {
            errMsg = e?.message || '触发失败';
        }
        ElMessage.error(errMsg);
    }
    finally {
        submitting.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: (`手动触发 Pipeline - ${__VLS_ctx.pipelineCode}`),
    width: "560px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onOpen': {} },
    modelValue: (__VLS_ctx.visible),
    title: (`手动触发 Pipeline - ${__VLS_ctx.pipelineCode}`),
    width: "560px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onOpen: (__VLS_ctx.onOpen)
};
var __VLS_8 = {};
__VLS_3.slots.default;
const __VLS_9 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "100px",
}));
const __VLS_11 = __VLS_10({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_13 = {};
__VLS_12.slots.default;
const __VLS_15 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({
    label: "Pipeline",
}));
const __VLS_17 = __VLS_16({
    label: "Pipeline",
}, ...__VLS_functionalComponentArgsRest(__VLS_16));
__VLS_18.slots.default;
const __VLS_19 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    modelValue: (__VLS_ctx.pipelineCode),
    disabled: true,
}));
const __VLS_21 = __VLS_20({
    modelValue: (__VLS_ctx.pipelineCode),
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
var __VLS_18;
const __VLS_23 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
    label: "触发方式",
    prop: "dry_run",
}));
const __VLS_25 = __VLS_24({
    label: "触发方式",
    prop: "dry_run",
}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    modelValue: (__VLS_ctx.form.dry_run),
}));
const __VLS_29 = __VLS_28({
    modelValue: (__VLS_ctx.form.dry_run),
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
__VLS_30.slots.default;
const __VLS_31 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
    value: (false),
}));
const __VLS_33 = __VLS_32({
    value: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_34.slots.default;
var __VLS_34;
const __VLS_35 = {}.ElRadio;
/** @type {[typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, typeof __VLS_components.ElRadio, typeof __VLS_components.elRadio, ]} */ ;
// @ts-ignore
const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
    value: (true),
}));
const __VLS_37 = __VLS_36({
    value: (true),
}, ...__VLS_functionalComponentArgsRest(__VLS_36));
__VLS_38.slots.default;
var __VLS_38;
var __VLS_30;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
if (__VLS_ctx.form.dry_run) {
    const __VLS_39 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        type: "warning",
        size: "small",
    }));
    const __VLS_41 = __VLS_40({
        type: "warning",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    var __VLS_42;
}
else {
    const __VLS_43 = {}.ElText;
    /** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
        type: "info",
        size: "small",
    }));
    const __VLS_45 = __VLS_44({
        type: "info",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    __VLS_46.slots.default;
    var __VLS_46;
}
var __VLS_26;
const __VLS_47 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    label: "时间范围",
}));
const __VLS_49 = __VLS_48({
    label: "时间范围",
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_50.slots.default;
const __VLS_51 = {}.ElDatePicker;
/** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    modelValue: (__VLS_ctx.timeRangeValue),
    type: "datetimerange",
    rangeSeparator: "至",
    startPlaceholder: "开始时间",
    endPlaceholder: "结束时间",
    format: "YYYY-MM-DD HH:mm",
    valueFormat: "YYYY-MM-DDTHH:mm:ss",
    ...{ style: {} },
}));
const __VLS_53 = __VLS_52({
    modelValue: (__VLS_ctx.timeRangeValue),
    type: "datetimerange",
    rangeSeparator: "至",
    startPlaceholder: "开始时间",
    endPlaceholder: "结束时间",
    format: "YYYY-MM-DD HH:mm",
    valueFormat: "YYYY-MM-DDTHH:mm:ss",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
const __VLS_55 = {}.ElText;
/** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    type: "info",
    size: "small",
}));
const __VLS_57 = __VLS_56({
    type: "info",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
var __VLS_58;
var __VLS_50;
const __VLS_59 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
    label: "步骤参数覆盖",
}));
const __VLS_61 = __VLS_60({
    label: "步骤参数覆盖",
}, ...__VLS_functionalComponentArgsRest(__VLS_60));
__VLS_62.slots.default;
const __VLS_63 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    modelValue: (__VLS_ctx.overrideParamsText),
    type: "textarea",
    rows: (3),
    placeholder: '格式: {"step_id_1": {"limit": 10}, "step_id_2": {"filter": "x"}}',
}));
const __VLS_65 = __VLS_64({
    modelValue: (__VLS_ctx.overrideParamsText),
    type: "textarea",
    rows: (3),
    placeholder: '格式: {"step_id_1": {"limit": 10}, "step_id_2": {"filter": "x"}}',
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-tip" },
});
const __VLS_67 = {}.ElText;
/** @type {[typeof __VLS_components.ElText, typeof __VLS_components.elText, typeof __VLS_components.ElText, typeof __VLS_components.elText, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    type: "info",
    size: "small",
}));
const __VLS_69 = __VLS_68({
    type: "info",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
__VLS_70.slots.default;
var __VLS_70;
var __VLS_62;
if (__VLS_ctx.form.dry_run) {
    const __VLS_71 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
        title: "DRY-RUN 模式",
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_73 = __VLS_72({
        title: "DRY-RUN 模式",
        type: "warning",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_72));
    __VLS_74.slots.default;
    var __VLS_74;
}
var __VLS_12;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_75 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
        ...{ 'onClick': {} },
    }));
    const __VLS_77 = __VLS_76({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_76));
    let __VLS_79;
    let __VLS_80;
    let __VLS_81;
    const __VLS_82 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_78.slots.default;
    var __VLS_78;
    const __VLS_83 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_85 = __VLS_84({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_84));
    let __VLS_87;
    let __VLS_88;
    let __VLS_89;
    const __VLS_90 = {
        onClick: (__VLS_ctx.onSubmit)
    };
    __VLS_86.slots.default;
    (__VLS_ctx.form.dry_run ? '模拟执行' : '确认触发');
    var __VLS_86;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
// @ts-ignore
var __VLS_14 = __VLS_13;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            visible: visible,
            formRef: formRef,
            submitting: submitting,
            form: form,
            timeRangeValue: timeRangeValue,
            overrideParamsText: overrideParamsText,
            rules: rules,
            onOpen: onOpen,
            onSubmit: onSubmit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
