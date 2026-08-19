/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { dataCompareApi } from '@/api/data-compare';
const props = defineProps();
const emit = defineEmits();
const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});
const saving = ref(false);
const form = ref({
    enabled: false,
    preset: '',
    cron_expression: '',
});
watch(() => props.task, (task) => {
    if (task) {
        form.value.enabled = task.enabled;
        form.value.cron_expression = task.cron_expression || '';
        // Try to match preset
        const presets = {
            '0 0 9 1 * *': '0 0 9 1 * *',
            '0 0 9 10 * *': '0 0 9 10 * *',
            '0 0 9 15 * *': '0 0 9 15 * *',
            '0 0 9 * * 1': '0 0 9 * * 1',
            '0 0 9 * * *': '0 0 9 * * *',
        };
        const matched = Object.entries(presets).find(([, v]) => v === task.cron_expression);
        form.value.preset = matched ? matched[1] : (task.cron_expression ? 'custom' : '');
    }
}, { immediate: true });
const nextRunPreview = computed(() => {
    if (!form.value.cron_expression)
        return '-';
    // Simple preview — just show the cron for now
    return `Cron: ${form.value.cron_expression}`;
});
function onPresetChange(val) {
    if (val !== 'custom') {
        form.value.cron_expression = val;
    }
}
async function handleSave() {
    if (!props.task)
        return;
    saving.value = true;
    try {
        const update = {
            enabled: form.value.enabled,
            cron_expression: form.value.cron_expression || null,
        };
        await dataCompareApi.updateTask(props.task.id, update);
        ElMessage.success('定时配置已保存');
        emit('saved');
        visible.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
function handleClose() {
    visible.value = false;
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
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "绑定定时执行",
    width: "480px",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "绑定定时执行",
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClose: (__VLS_ctx.handleClose)
};
var __VLS_8 = {};
__VLS_3.slots.default;
const __VLS_9 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
}));
const __VLS_11 = __VLS_10({
    model: (__VLS_ctx.form),
    labelWidth: "100px",
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
__VLS_12.slots.default;
const __VLS_13 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
    label: "任务名称",
}));
const __VLS_15 = __VLS_14({
    label: "任务名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
__VLS_16.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.task?.name);
var __VLS_16;
const __VLS_17 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
    label: "启用定时",
}));
const __VLS_19 = __VLS_18({
    label: "启用定时",
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
__VLS_20.slots.default;
const __VLS_21 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    modelValue: (__VLS_ctx.form.enabled),
}));
const __VLS_23 = __VLS_22({
    modelValue: (__VLS_ctx.form.enabled),
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
var __VLS_20;
const __VLS_25 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
    label: "执行频率",
}));
const __VLS_27 = __VLS_26({
    label: "执行频率",
}, ...__VLS_functionalComponentArgsRest(__VLS_26));
__VLS_28.slots.default;
const __VLS_29 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.preset),
    placeholder: "选择预设频率",
}));
const __VLS_31 = __VLS_30({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.form.preset),
    placeholder: "选择预设频率",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
let __VLS_33;
let __VLS_34;
let __VLS_35;
const __VLS_36 = {
    onChange: (__VLS_ctx.onPresetChange)
};
__VLS_32.slots.default;
const __VLS_37 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
    label: "每月1号 09:00",
    value: "0 0 9 1 * *",
}));
const __VLS_39 = __VLS_38({
    label: "每月1号 09:00",
    value: "0 0 9 1 * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_38));
const __VLS_41 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
    label: "每月10号 09:00",
    value: "0 0 9 10 * *",
}));
const __VLS_43 = __VLS_42({
    label: "每月10号 09:00",
    value: "0 0 9 10 * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
const __VLS_45 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
    label: "每月15号 09:00",
    value: "0 0 9 15 * *",
}));
const __VLS_47 = __VLS_46({
    label: "每月15号 09:00",
    value: "0 0 9 15 * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_46));
const __VLS_49 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    label: "每周一 09:00",
    value: "0 0 9 * * 1",
}));
const __VLS_51 = __VLS_50({
    label: "每周一 09:00",
    value: "0 0 9 * * 1",
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
const __VLS_53 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
    label: "每天 09:00",
    value: "0 0 9 * * *",
}));
const __VLS_55 = __VLS_54({
    label: "每天 09:00",
    value: "0 0 9 * * *",
}, ...__VLS_functionalComponentArgsRest(__VLS_54));
const __VLS_57 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
    label: "自定义",
    value: "custom",
}));
const __VLS_59 = __VLS_58({
    label: "自定义",
    value: "custom",
}, ...__VLS_functionalComponentArgsRest(__VLS_58));
var __VLS_32;
var __VLS_28;
if (__VLS_ctx.form.preset === 'custom') {
    const __VLS_61 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        label: "Cron 表达式",
    }));
    const __VLS_63 = __VLS_62({
        label: "Cron 表达式",
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    const __VLS_65 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
        modelValue: (__VLS_ctx.form.cron_expression),
        placeholder: "如: 0 0 9 1 * *",
    }));
    const __VLS_67 = __VLS_66({
        modelValue: (__VLS_ctx.form.cron_expression),
        placeholder: "如: 0 0 9 1 * *",
    }, ...__VLS_functionalComponentArgsRest(__VLS_66));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cron-hint" },
    });
    var __VLS_64;
}
if (__VLS_ctx.form.cron_expression) {
    const __VLS_69 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
        label: "下次执行",
    }));
    const __VLS_71 = __VLS_70({
        label: "下次执行",
    }, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "next-run" },
    });
    (__VLS_ctx.nextRunPreview);
    var __VLS_72;
}
var __VLS_12;
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    const __VLS_73 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
        ...{ 'onClick': {} },
    }));
    const __VLS_75 = __VLS_74({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_74));
    let __VLS_77;
    let __VLS_78;
    let __VLS_79;
    const __VLS_80 = {
        onClick: (__VLS_ctx.handleClose)
    };
    __VLS_76.slots.default;
    var __VLS_76;
    const __VLS_81 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_83 = __VLS_82({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    let __VLS_85;
    let __VLS_86;
    let __VLS_87;
    const __VLS_88 = {
        onClick: (__VLS_ctx.handleSave)
    };
    __VLS_84.slots.default;
    var __VLS_84;
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['cron-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['next-run']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            visible: visible,
            saving: saving,
            form: form,
            nextRunPreview: nextRunPreview,
            onPresetChange: onPresetChange,
            handleSave: handleSave,
            handleClose: handleClose,
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
