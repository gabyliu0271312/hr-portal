/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
/** 调度配置编辑器。复用现有 ScheduleSelector 组件，增加事件触发模式。 */
import { ref, watch } from 'vue';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
const props = defineProps();
const emit = defineEmits();
const frequency = ref(props.modelValue?.frequency || 'manual');
const cronExpr = ref(props.modelValue?.cron_expr || '');
const FREQ_OPTIONS = [
    { label: '手动触发', value: 'manual' },
    { label: '每天', value: 'daily' },
    { label: '每周', value: 'weekly' },
    { label: '每月', value: 'monthly' },
    { label: '事件触发', value: 'event' },
];
function emitChange() {
    emit('update:modelValue', {
        frequency: frequency.value,
        ...(frequency.value !== 'manual' && frequency.value !== 'event' ? { cron_expr: cronExpr.value } : {}),
    });
}
watch(frequency, emitChange);
watch(cronExpr, emitChange);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "schedule-editor" },
});
const __VLS_0 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.frequency),
    placeholder: "调度频率",
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.frequency),
    placeholder: "调度频率",
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
for (const [f] of __VLS_getVForSourceType((__VLS_ctx.FREQ_OPTIONS))) {
    const __VLS_4 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        key: (f.value),
        label: (f.label),
        value: (f.value),
    }));
    const __VLS_6 = __VLS_5({
        key: (f.value),
        label: (f.label),
        value: (f.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
}
var __VLS_3;
if (__VLS_ctx.frequency !== 'manual' && __VLS_ctx.frequency !== 'event') {
    /** @type {[typeof ScheduleSelector, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
        ...{ 'onUpdate:schedule': {} },
        schedule: (__VLS_ctx.cronExpr),
        ...{ style: {} },
    }));
    const __VLS_9 = __VLS_8({
        ...{ 'onUpdate:schedule': {} },
        schedule: (__VLS_ctx.cronExpr),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    let __VLS_11;
    let __VLS_12;
    let __VLS_13;
    const __VLS_14 = {
        'onUpdate:schedule': (...[$event]) => {
            if (!(__VLS_ctx.frequency !== 'manual' && __VLS_ctx.frequency !== 'event'))
                return;
            __VLS_ctx.cronExpr = $event;
        }
    };
    var __VLS_10;
}
/** @type {__VLS_StyleScopedClasses['schedule-editor']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ScheduleSelector: ScheduleSelector,
            frequency: frequency,
            cronExpr: cronExpr,
            FREQ_OPTIONS: FREQ_OPTIONS,
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
