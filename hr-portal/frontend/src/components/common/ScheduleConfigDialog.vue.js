/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { formatDateTime } from '@/utils/datetime';
import { ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import ScheduleSelector from './ScheduleSelector.vue';
import { schedulerApi } from '@/api/scheduler';
const props = defineProps();
const emit = defineEmits();
const loading = ref(false);
const saving = ref(false);
const job = ref(null);
const cron = ref('手动触发');
const enabled = ref(true);
const period = ref('');
async function load() {
    loading.value = true;
    try {
        const jobs = await schedulerApi.jobs({ kind: props.kind });
        job.value = jobs.find(j => j.business_id === props.businessId) || null;
        if (job.value) {
            cron.value = job.value.cron;
            enabled.value = job.value.enabled;
            period.value = String(job.value.payload?.period || '');
        }
        else {
            cron.value = '手动触发';
            enabled.value = true;
            period.value = '';
        }
    }
    catch {
        job.value = null;
    }
    finally {
        loading.value = false;
    }
}
watch(() => props.visible, (v) => {
    if (v)
        load();
});
async function save() {
    if (props.periodRequired && !/^\d{6}$/.test(period.value.trim())) {
        ElMessage.error('关系质量定时检查必须填写 YYYYMM 期间');
        return;
    }
    saving.value = true;
    try {
        const payload = { ...(job.value?.payload || {}), ...(props.payload || {}) };
        if (period.value.trim())
            payload.period = period.value.trim();
        if (job.value) {
            await schedulerApi.updateJob(job.value.id, {
                cron: cron.value,
                payload,
                enabled: enabled.value,
            });
            ElMessage.success('定时配置已更新');
        }
        else {
            await schedulerApi.createJob({
                kind: props.kind,
                business_id: props.businessId,
                cron: cron.value,
                payload,
                enabled: enabled.value,
            });
            ElMessage.success('定时配置已创建');
        }
        emit('saved');
        emit('update:visible', false);
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function remove() {
    if (!job.value)
        return;
    try {
        await ElMessageBox.confirm('确定删除定时配置？', '确认', { type: 'warning' });
        await schedulerApi.deleteJob(job.value.id);
        job.value = null;
        cron.value = '手动触发';
        enabled.value = true;
        ElMessage.success('定时配置已删除');
        emit('deleted');
        emit('update:visible', false);
    }
    catch { /* 取消 */ }
}
const kindLabels = {
    dataset_build: '数据集构建',
    snapshot_run: '快照任务',
    metric_compute: '指标计算',
    quality_run: '质量检查',
};
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "定时配置",
    width: "480px",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    ...{ 'onClose': {} },
    modelValue: (__VLS_ctx.visible),
    title: "定时配置",
    width: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    'onUpdate:modelValue': (...[$event]) => {
        __VLS_ctx.emit('update:visible', $event);
    }
};
const __VLS_8 = {
    onClose: (...[$event]) => {
        __VLS_ctx.job = null;
    }
};
var __VLS_9 = {};
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.businessName) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.kindLabels[__VLS_ctx.kind] || __VLS_ctx.kind);
    (__VLS_ctx.businessName);
}
const __VLS_10 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
    labelWidth: "80px",
    size: "small",
}));
const __VLS_12 = __VLS_11({
    labelWidth: "80px",
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_11));
__VLS_13.slots.default;
const __VLS_14 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
    label: "调度计划",
}));
const __VLS_16 = __VLS_15({
    label: "调度计划",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
__VLS_17.slots.default;
/** @type {[typeof ScheduleSelector, ]} */ ;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
    schedule: (__VLS_ctx.cron),
}));
const __VLS_19 = __VLS_18({
    schedule: (__VLS_ctx.cron),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
var __VLS_17;
if (__VLS_ctx.periodRequired) {
    const __VLS_21 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        label: "检查期间",
        required: true,
    }));
    const __VLS_23 = __VLS_22({
        label: "检查期间",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    const __VLS_25 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
        modelValue: (__VLS_ctx.period),
        maxlength: "6",
        placeholder: "YYYYMM，例如 202607",
    }));
    const __VLS_27 = __VLS_26({
        modelValue: (__VLS_ctx.period),
        maxlength: "6",
        placeholder: "YYYYMM，例如 202607",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    var __VLS_24;
}
const __VLS_29 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
    label: "启用",
}));
const __VLS_31 = __VLS_30({
    label: "启用",
}, ...__VLS_functionalComponentArgsRest(__VLS_30));
__VLS_32.slots.default;
const __VLS_33 = {}.ElSwitch;
/** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
// @ts-ignore
const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
    modelValue: (__VLS_ctx.enabled),
    activeText: "启用",
    inactiveText: "停用",
}));
const __VLS_35 = __VLS_34({
    modelValue: (__VLS_ctx.enabled),
    activeText: "启用",
    inactiveText: "停用",
}, ...__VLS_functionalComponentArgsRest(__VLS_34));
var __VLS_32;
var __VLS_13;
if (__VLS_ctx.job) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    (__VLS_ctx.formatDateTime(__VLS_ctx.job.last_run_at) || '—');
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: ({ color: __VLS_ctx.job.last_status === 'success' ? '#67c23a' : '#f56c6c' }) },
    });
    (__VLS_ctx.job.last_status || '—');
}
{
    const { footer: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.job) {
        const __VLS_37 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
            ...{ 'onClick': {} },
            type: "danger",
            text: true,
        }));
        const __VLS_39 = __VLS_38({
            ...{ 'onClick': {} },
            type: "danger",
            text: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
        let __VLS_41;
        let __VLS_42;
        let __VLS_43;
        const __VLS_44 = {
            onClick: (__VLS_ctx.remove)
        };
        __VLS_40.slots.default;
        var __VLS_40;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_45 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent(__VLS_45, new __VLS_45({
        ...{ 'onClick': {} },
    }));
    const __VLS_47 = __VLS_46({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    let __VLS_49;
    let __VLS_50;
    let __VLS_51;
    const __VLS_52 = {
        onClick: (...[$event]) => {
            __VLS_ctx.emit('update:visible', false);
        }
    };
    __VLS_48.slots.default;
    var __VLS_48;
    const __VLS_53 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_55 = __VLS_54({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_54));
    let __VLS_57;
    let __VLS_58;
    let __VLS_59;
    const __VLS_60 = {
        onClick: (__VLS_ctx.save)
    };
    __VLS_56.slots.default;
    var __VLS_56;
}
var __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            formatDateTime: formatDateTime,
            ScheduleSelector: ScheduleSelector,
            emit: emit,
            loading: loading,
            saving: saving,
            job: job,
            cron: cron,
            enabled: enabled,
            period: period,
            save: save,
            remove: remove,
            kindLabels: kindLabels,
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
