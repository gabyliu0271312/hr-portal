import { ref, computed, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
// ── 统一预设选项（兼顾接口配置 + 自动通知需求）────────
const scheduleOptions = [
    { label: '每日 06:00', value: '每日 06:00', rrule: 'FREQ=DAILY;INTERVAL=1' },
    { label: '每周一 06:00', value: '每周一 06:00', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
    { label: '每周一至周五 06:00', value: '每周一至周五 06:00', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { label: '每月 1 日 06:00', value: '每月 1 日 06:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
    { label: '每月 5 日 06:00', value: '每月 5 日 06:00', rrule: 'FREQ=MONTHLY;BYMONTHDAY=5' },
    { label: '每小时整点', value: '每小时整点', rrule: 'FREQ=HOURLY;INTERVAL=1' },
    { label: '每 6 小时', value: '每 6 小时', rrule: 'FREQ=HOURLY;INTERVAL=6' },
    { label: '手动触发', value: '手动触发', rrule: '' },
];
const availableScheduleOptions = computed(() => props.allowManual === false ? scheduleOptions.filter((option) => option.value !== '手动触发') : scheduleOptions);
// ── 高级模式 ────────────────────────────────────────
const isAdvanced = ref(false);
const customRRule = ref(props.rrule || '');
// 判断当前 schedule 是否能匹配到预设
const matchedOption = computed(() => {
    return scheduleOptions.find(o => o.value === props.schedule);
});
// 初始化：如果有 rrule 且不匹配预设，自动进入高级模式
watch(() => props.rrule, (val) => {
    if (val && !scheduleOptions.some(o => o.rrule === val)) {
        isAdvanced.value = true;
        customRRule.value = val;
    }
}, { immediate: true });
// ── 操作 ────────────────────────────────────────────
function onSelect(val) {
    emit('update:schedule', val);
    // 同步更新 rrule
    const opt = scheduleOptions.find(o => o.value === val);
    if (opt) {
        emit('update:rrule', opt.rrule || '');
    }
}
function toggleAdvanced() {
    isAdvanced.value = !isAdvanced.value;
    if (!isAdvanced.value) {
        // 退出高级模式，恢复为当前选中的预设
        onSelect(props.schedule || '每日 06:00');
    }
}
function onCustomRRule(val) {
    customRRule.value = val;
    emit('update:rrule', val);
    // 清除简单模式的值（表示使用自定义）
    emit('update:schedule', '');
}
function onStartTimeChange(val) {
    emit('update:startTime', val);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['ss-select-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-close']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-preset-btn']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "schedule-selector" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ss-field" },
});
if (__VLS_ctx.$slots.label) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "ss-label" },
    });
    var __VLS_0 = {};
    if (__VLS_ctx.$attrs.required) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "ss-required" },
        });
    }
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "ss-select-wrap" },
});
const __VLS_2 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(__VLS_2, new __VLS_2({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.schedule),
    placeholder: "选择调度计划",
    disabled: (__VLS_ctx.isAdvanced),
    ...{ style: {} },
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.schedule),
    placeholder: "选择调度计划",
    disabled: (__VLS_ctx.isAdvanced),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:modelValue': (__VLS_ctx.onSelect)
};
__VLS_5.slots.default;
for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.availableScheduleOptions))) {
    const __VLS_10 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent(__VLS_10, new __VLS_10({
        key: (opt.value),
        label: (opt.label),
        value: (opt.value),
    }));
    const __VLS_12 = __VLS_11({
        key: (opt.value),
        label: (opt.label),
        value: (opt.value),
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
}
var __VLS_5;
if (__VLS_ctx.allowAdvanced) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleAdvanced) },
        ...{ class: "ss-advanced-toggle" },
        ...{ class: ({ active: __VLS_ctx.isAdvanced }) },
        title: "高级模式（自定义 RRULE）",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "14",
        height: "14",
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        'stroke-width': "2",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.circle)({
        cx: "12",
        cy: "12",
        r: "3",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
    });
}
if (__VLS_ctx.showHint !== false && !__VLS_ctx.$attrs.required) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ss-hint" },
    });
}
if (__VLS_ctx.showStartTime !== false) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ss-field" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ class: "ss-label" },
    });
    const __VLS_14 = {}.ElDatePicker;
    /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(__VLS_14, new __VLS_14({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.startTime),
        type: "datetime",
        placeholder: "选择首次执行时间",
        format: "YYYY-MM-DD HH:mm",
        valueFormat: "YYYY-MM-DDTHH:mm",
        ...{ style: {} },
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.startTime),
        type: "datetime",
        placeholder: "选择首次执行时间",
        format: "YYYY-MM-DD HH:mm",
        valueFormat: "YYYY-MM-DDTHH:mm",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_18;
    let __VLS_19;
    let __VLS_20;
    const __VLS_21 = {
        'onUpdate:modelValue': (__VLS_ctx.onStartTimeChange)
    };
    var __VLS_17;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ss-hint" },
    });
}
if (__VLS_ctx.isAdvanced) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ss-advanced" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ss-advanced-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.toggleAdvanced) },
        ...{ class: "ss-advanced-close" },
    });
    const __VLS_22 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.customRRule),
        placeholder: "如 FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2",
        size: "small",
    }));
    const __VLS_24 = __VLS_23({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.customRRule),
        placeholder: "如 FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=2",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    let __VLS_26;
    let __VLS_27;
    let __VLS_28;
    const __VLS_29 = {
        'onUpdate:modelValue': (__VLS_ctx.onCustomRRule)
    };
    var __VLS_25;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "ss-advanced-presets" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "ss-advanced-presets-label" },
    });
    for (const [opt] of __VLS_getVForSourceType((__VLS_ctx.availableScheduleOptions.filter(o => o.rrule)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isAdvanced))
                        return;
                    __VLS_ctx.onCustomRRule(opt.rrule);
                } },
            key: (opt.rrule),
            ...{ class: "ss-preset-btn" },
        });
        (opt.label);
    }
}
/** @type {__VLS_StyleScopedClasses['schedule-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-field']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-required']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-select-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-toggle']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-field']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-header']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-close']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-presets']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-advanced-presets-label']} */ ;
/** @type {__VLS_StyleScopedClasses['ss-preset-btn']} */ ;
// @ts-ignore
var __VLS_1 = __VLS_0;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            availableScheduleOptions: availableScheduleOptions,
            isAdvanced: isAdvanced,
            customRRule: customRRule,
            onSelect: onSelect,
            toggleAdvanced: toggleAdvanced,
            onCustomRRule: onCustomRRule,
            onStartTimeChange: onStartTimeChange,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
