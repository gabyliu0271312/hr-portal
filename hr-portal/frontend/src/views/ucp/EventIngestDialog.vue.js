import { reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { ucpApi } from '@/api/ucp';
const props = defineProps();
const emit = defineEmits();
const SOURCES = ['FEISHU', 'BEISEN', 'INTERNAL', 'GENERIC'];
const visible = ref(props.visible);
watch(() => props.visible, (v) => (visible.value = v));
watch(visible, (v) => emit('update:visible', v));
const form = reactive({
    event_id: '',
    event_type: '',
    source: 'GENERIC',
    trigger: 'REALTIME',
    is_dedup: true,
    auto_dispatch: true,
});
const payloadText = ref('{}');
const submitting = ref(false);
const formRef = ref();
const rules = {
    event_id: [{ required: true, message: '必填' }],
    event_type: [{ required: true, message: '必填' }],
    source: [{ required: true, message: '必填' }],
};
function onOpen() {
    // 预填一个 event_id
    if (!form.event_id) {
        form.event_id = `evt_${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}_${Math.random().toString(36).slice(2, 8)}`;
    }
}
function onClose() {
    // 重置
    form.event_id = '';
    form.event_type = '';
    form.source = 'GENERIC';
    form.trigger = 'REALTIME';
    form.is_dedup = true;
    form.auto_dispatch = true;
    payloadText.value = '{}';
}
async function onSubmit() {
    if (!formRef.value)
        return;
    await formRef.value.validate();
    let payload = {};
    try {
        payload = JSON.parse(payloadText.value || '{}');
    }
    catch {
        ElMessage.error('Payload 必须是合法 JSON');
        return;
    }
    submitting.value = true;
    try {
        const res = await ucpApi.ingestEvent({
            event_id: form.event_id,
            event_type: form.event_type,
            source: form.source,
            payload,
            trigger: form.trigger,
            is_dedup: form.is_dedup,
            auto_dispatch: form.auto_dispatch,
        });
        ElMessage.success(`事件已接入：${res.status}`);
        emit('success');
        visible.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail?.message || '发布失败');
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
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "发布事件（内部 API）",
    width: "640px",
    closeOnClickModal: (false),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onOpen': {} },
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "发布事件（内部 API）",
    width: "640px",
    closeOnClickModal: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onOpen: (__VLS_ctx.onOpen)
};
const __VLS_8 = {
    onClose: (__VLS_ctx.onClose)
};
var __VLS_9 = {};
__VLS_3.slots.default;
const __VLS_10 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "100px",
    size: "small",
}));
const __VLS_12 = __VLS_11({
    ref: "formRef",
    model: (__VLS_ctx.form),
    rules: (__VLS_ctx.rules),
    labelWidth: "100px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_14 = {};
__VLS_13.slots.default;
const __VLS_16 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    label: "Event ID",
    prop: "event_id",
}));
const __VLS_18 = __VLS_17({
    label: "Event ID",
    prop: "event_id",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    modelValue: (__VLS_ctx.form.event_id),
    placeholder: "如 evt_20260703_xxxxx（唯一键）",
}));
const __VLS_22 = __VLS_21({
    modelValue: (__VLS_ctx.form.event_id),
    placeholder: "如 evt_20260703_xxxxx（唯一键）",
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
var __VLS_19;
const __VLS_24 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
    label: "事件类型",
    prop: "event_type",
}));
const __VLS_26 = __VLS_25({
    label: "事件类型",
    prop: "event_type",
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    modelValue: (__VLS_ctx.form.event_type),
    placeholder: "如 EMPLOYEE_ONBOARDING",
}));
const __VLS_30 = __VLS_29({
    modelValue: (__VLS_ctx.form.event_type),
    placeholder: "如 EMPLOYEE_ONBOARDING",
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
const __VLS_32 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    label: "来源",
    prop: "source",
}));
const __VLS_34 = __VLS_33({
    label: "来源",
    prop: "source",
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
__VLS_35.slots.default;
const __VLS_36 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
    modelValue: (__VLS_ctx.form.source),
    ...{ style: {} },
}));
const __VLS_38 = __VLS_37({
    modelValue: (__VLS_ctx.form.source),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
for (const [s] of __VLS_getVForSourceType((__VLS_ctx.SOURCES))) {
    const __VLS_40 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        key: (s),
        label: (s),
        value: (s),
    }));
    const __VLS_42 = __VLS_41({
        key: (s),
        label: (s),
        value: (s),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
}
var __VLS_39;
var __VLS_35;
const __VLS_44 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    label: "触发模式",
}));
const __VLS_46 = __VLS_45({
    label: "触发模式",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
const __VLS_48 = {}.ElRadioGroup;
/** @type {[typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, typeof __VLS_components.ElRadioGroup, typeof __VLS_components.elRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
    modelValue: (__VLS_ctx.form.trigger),
}));
const __VLS_50 = __VLS_49({
    modelValue: (__VLS_ctx.form.trigger),
}, ...__VLS_functionalComponentArgsRest(__VLS_49));
__VLS_51.slots.default;
const __VLS_52 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
    value: "REALTIME",
}));
const __VLS_54 = __VLS_53({
    value: "REALTIME",
}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
var __VLS_55;
const __VLS_56 = {}.ElRadioButton;
/** @type {[typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, typeof __VLS_components.ElRadioButton, typeof __VLS_components.elRadioButton, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    value: "BATCH",
}));
const __VLS_58 = __VLS_57({
    value: "BATCH",
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
__VLS_59.slots.default;
var __VLS_59;
var __VLS_51;
var __VLS_47;
const __VLS_60 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
    label: "Payload",
}));
const __VLS_62 = __VLS_61({
    label: "Payload",
}, ...__VLS_functionalComponentArgsRest(__VLS_61));
__VLS_63.slots.default;
const __VLS_64 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    modelValue: (__VLS_ctx.payloadText),
    type: "textarea",
    rows: (6),
    placeholder: '{"key": "value"}',
}));
const __VLS_66 = __VLS_65({
    modelValue: (__VLS_ctx.payloadText),
    type: "textarea",
    rows: (6),
    placeholder: '{"key": "value"}',
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
var __VLS_63;
const __VLS_68 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "去重",
}));
const __VLS_70 = __VLS_69({
    label: "去重",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
__VLS_71.slots.default;
const __VLS_72 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
    modelValue: (__VLS_ctx.form.is_dedup),
}));
const __VLS_74 = __VLS_73({
    modelValue: (__VLS_ctx.form.is_dedup),
}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "form-tip" },
});
var __VLS_71;
const __VLS_76 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    label: "自动派发",
}));
const __VLS_78 = __VLS_77({
    label: "自动派发",
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
__VLS_79.slots.default;
const __VLS_80 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
    modelValue: (__VLS_ctx.form.auto_dispatch),
}));
const __VLS_82 = __VLS_81({
    modelValue: (__VLS_ctx.form.auto_dispatch),
}, ...__VLS_functionalComponentArgsRest(__VLS_81));
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "form-tip" },
});
var __VLS_79;
var __VLS_13;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_84 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
        ...{ 'onClick': {} },
    }));
    const __VLS_86 = __VLS_85({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_85));
    let __VLS_88;
    let __VLS_89;
    let __VLS_90;
    const __VLS_91 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_87.slots.default;
    var __VLS_87;
    const __VLS_92 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }));
    const __VLS_94 = __VLS_93({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    let __VLS_96;
    let __VLS_97;
    let __VLS_98;
    const __VLS_99 = {
        onClick: (__VLS_ctx.onSubmit)
    };
    __VLS_95.slots.default;
    var __VLS_95;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['form-tip']} */ ;
// @ts-ignore
var __VLS_15 = __VLS_14;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            SOURCES: SOURCES,
            visible: visible,
            form: form,
            payloadText: payloadText,
            submitting: submitting,
            formRef: formRef,
            rules: rules,
            onOpen: onOpen,
            onClose: onClose,
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
