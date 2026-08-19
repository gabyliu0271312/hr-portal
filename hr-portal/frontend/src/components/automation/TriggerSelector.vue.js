/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { toLocalNaive, toUtcNaive } from '@/utils/datetime';
import { computed, ref, watch } from 'vue';
import { Clock, Timer, CircleCheck, CircleClose, Finished, DocumentChecked, CaretTop } from '@element-plus/icons-vue';
const props = defineProps();
const emit = defineEmits();
const triggerDefs = [
    {
        value: 'schedule',
        label: '定时通知',
        desc: '按设定的时间周期自动发送通知，无需依赖业务事件触发',
        icon: Clock,
        category: '系统内置',
    },
    {
        value: 'scheduled_job_success',
        label: '定时任务执行成功',
        desc: '定时任务执行成功时触发通知',
        icon: CircleCheck,
        category: '门户继承',
    },
    {
        value: 'scheduled_job_failed',
        label: '定时任务执行失败',
        desc: '定时任务执行失败时触发通知',
        icon: CircleClose,
        category: '门户继承',
    },
    {
        value: 'scheduled_job_finished',
        label: '定时任务执行完成',
        desc: '定时任务执行完成时触发通知（无论成功/失败）',
        icon: Finished,
        category: '门户继承',
    },
    {
        value: 'report_run_success',
        label: '报表运行成功',
        desc: '当报表运行成功时触发通知',
        icon: CircleCheck,
        category: '报表系统',
    },
    {
        value: 'report_run_failed',
        label: '报表运行失败',
        desc: '当报表运行失败时触发通知',
        icon: CircleClose,
        category: '报表系统',
    },
    {
        value: 'scheduled_report_success',
        label: '定时报表生成成功',
        desc: '当定时报表生成成功时触发通知',
        icon: DocumentChecked,
        category: '报表系统',
    },
    {
        value: 'scheduled_report_failed',
        label: '定时报表生成失败',
        desc: '当定时报表生成失败时触发通知',
        icon: Timer,
        category: '报表系统',
    },
];
const categories = ['系统内置', '门户继承', '报表系统'];
// ── 选择状态 ────────────────────────────────────────────
const selectedTrigger = computed(() => triggerDefs.find(t => t.value === props.modelValue));
function selectTrigger(value) {
    emit('update:modelValue', value);
}
// ── 定时配置 (trigger_type = 'schedule') ────────────────
const scheduleType = ref(props.triggerConfig?.schedule_type || 'recurring');
const scheduleStartDate = ref(toLocalNaive(props.triggerConfig?.start_time?.slice(0, 16)) || '');
const scheduleRRule = ref(props.triggerConfig?.rrule || 'FREQ=DAILY;INTERVAL=1');
const scheduleTimezone = ref(props.triggerConfig?.timezone || 'Asia/Shanghai');
// 预设选项
const rrulePresets = [
    { label: '每天', rrule: 'FREQ=DAILY;INTERVAL=1' },
    { label: '每周一', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
    { label: '每周一至周五', rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { label: '每月1日', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1' },
];
const selectedPreset = ref('');
function applyPreset(preset) {
    selectedPreset.value = preset.rrule;
    scheduleRRule.value = preset.rrule;
    syncScheduleConfig();
}
function syncScheduleConfig() {
    emit('update:triggerConfig', {
        ...props.triggerConfig,
        schedule_type: scheduleType.value,
        start_time: scheduleStartDate.value ? toUtcNaive(scheduleStartDate.value + ':00') : null,
        rrule: scheduleType.value === 'recurring' ? scheduleRRule.value : null,
        timezone: scheduleTimezone.value,
    });
}
watch([scheduleType, scheduleStartDate, scheduleRRule, scheduleTimezone], () => {
    if (props.modelValue === 'schedule') {
        syncScheduleConfig();
    }
});
// 初始化
if (props.modelValue === 'schedule') {
    syncScheduleConfig();
}
// ── 事件触发器 biz_id ───────────────────────────────────
const localBizId = ref(props.bizId?.toString() || '');
function syncBizId() {
    emit('update:bizId', localBizId.value ? Number(localBizId.value) : null);
}
watch(localBizId, syncBizId);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['trig-card']} */ ;
/** @type {__VLS_StyleScopedClasses['trig-card']} */ ;
/** @type {__VLS_StyleScopedClasses['card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['trig-card']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['config-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "trig-selector" },
});
for (const [cat] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (cat),
        ...{ class: "trig-category" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-label" },
    });
    (cat);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "cat-cards" },
    });
    for (const [t] of __VLS_getVForSourceType((__VLS_ctx.triggerDefs.filter(d => d.category === cat)))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            key: (t.value),
            ...{ class: "trig-card" },
            ...{ class: ({
                    active: __VLS_ctx.modelValue === t.value,
                    selected: __VLS_ctx.modelValue === t.value,
                }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
            ...{ onChange: (...[$event]) => {
                    __VLS_ctx.selectTrigger(t.value);
                } },
            type: "radio",
            name: "triggerType",
            value: (t.value),
            checked: (__VLS_ctx.modelValue === t.value),
            ...{ class: "trig-radio" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-body" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-icon" },
            ...{ class: ({ 'icon-active': __VLS_ctx.modelValue === t.value }) },
        });
        const __VLS_0 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            size: (20),
        }));
        const __VLS_2 = __VLS_1({
            size: (20),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
        const __VLS_4 = ((t.icon));
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        var __VLS_3;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-title" },
        });
        (t.label);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "card-desc" },
        });
        (t.desc);
        if (__VLS_ctx.modelValue === t.value) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "card-check" },
            });
            const __VLS_8 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
                size: (16),
            }));
            const __VLS_10 = __VLS_9({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_9));
            __VLS_11.slots.default;
            const __VLS_12 = {}.CaretTop;
            /** @type {[typeof __VLS_components.CaretTop, ]} */ ;
            // @ts-ignore
            const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
            const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
            var __VLS_11;
        }
    }
}
if (__VLS_ctx.modelValue) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-panel" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "config-header" },
    });
    const __VLS_16 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        size: (18),
        ...{ class: "config-icon" },
    }));
    const __VLS_18 = __VLS_17({
        size: (18),
        ...{ class: "config-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    __VLS_19.slots.default;
    const __VLS_20 = ((__VLS_ctx.selectedTrigger?.icon));
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({}));
    const __VLS_22 = __VLS_21({}, ...__VLS_functionalComponentArgsRest(__VLS_21));
    var __VLS_19;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "config-title" },
    });
    (__VLS_ctx.selectedTrigger?.label);
    if (__VLS_ctx.modelValue === 'schedule') {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "schedule-config" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "config-label required" },
        });
        const __VLS_24 = {}.ElDatePicker;
        /** @type {[typeof __VLS_components.ElDatePicker, typeof __VLS_components.elDatePicker, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            modelValue: (__VLS_ctx.scheduleStartDate),
            type: "datetime",
            placeholder: "选择首次执行时间",
            format: "YYYY-MM-DD HH:mm",
            valueFormat: "YYYY-MM-DDTHH:mm",
            ...{ style: {} },
        }));
        const __VLS_26 = __VLS_25({
            modelValue: (__VLS_ctx.scheduleStartDate),
            type: "datetime",
            placeholder: "选择首次执行时间",
            format: "YYYY-MM-DD HH:mm",
            valueFormat: "YYYY-MM-DDTHH:mm",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "config-label required" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "preset-row" },
        });
        for (const [preset] of __VLS_getVForSourceType((__VLS_ctx.rrulePresets))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.modelValue))
                            return;
                        if (!(__VLS_ctx.modelValue === 'schedule'))
                            return;
                        __VLS_ctx.applyPreset(preset);
                    } },
                ...{ class: "preset-chip" },
                ...{ class: ({ active: __VLS_ctx.selectedPreset === preset.rrule }) },
            });
            (preset.label);
        }
        if (!__VLS_ctx.rrulePresets.some(p => p.rrule === __VLS_ctx.selectedPreset)) {
            const __VLS_28 = {}.ElInput;
            /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.scheduleRRule),
                placeholder: "自定义 RRULE",
                ...{ style: {} },
                size: "small",
            }));
            const __VLS_30 = __VLS_29({
                ...{ 'onChange': {} },
                modelValue: (__VLS_ctx.scheduleRRule),
                placeholder: "自定义 RRULE",
                ...{ style: {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            let __VLS_32;
            let __VLS_33;
            let __VLS_34;
            const __VLS_35 = {
                onChange: (...[$event]) => {
                    if (!(__VLS_ctx.modelValue))
                        return;
                    if (!(__VLS_ctx.modelValue === 'schedule'))
                        return;
                    if (!(!__VLS_ctx.rrulePresets.some(p => p.rrule === __VLS_ctx.selectedPreset)))
                        return;
                    __VLS_ctx.selectedPreset = '';
                    __VLS_ctx.syncScheduleConfig();
                }
            };
            var __VLS_31;
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "config-label" },
        });
        const __VLS_36 = {}.ElSelect;
        /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
        // @ts-ignore
        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.scheduleTimezone),
            ...{ style: {} },
            size: "small",
        }));
        const __VLS_38 = __VLS_37({
            ...{ 'onChange': {} },
            modelValue: (__VLS_ctx.scheduleTimezone),
            ...{ style: {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
        let __VLS_40;
        let __VLS_41;
        let __VLS_42;
        const __VLS_43 = {
            onChange: (__VLS_ctx.syncScheduleConfig)
        };
        __VLS_39.slots.default;
        const __VLS_44 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
            label: "Asia/Shanghai (UTC+8)",
            value: "Asia/Shanghai",
        }));
        const __VLS_46 = __VLS_45({
            label: "Asia/Shanghai (UTC+8)",
            value: "Asia/Shanghai",
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        const __VLS_48 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
            label: "Asia/Tokyo (UTC+9)",
            value: "Asia/Tokyo",
        }));
        const __VLS_50 = __VLS_49({
            label: "Asia/Tokyo (UTC+9)",
            value: "Asia/Tokyo",
        }, ...__VLS_functionalComponentArgsRest(__VLS_49));
        const __VLS_52 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
            label: "Asia/Singapore (UTC+8)",
            value: "Asia/Singapore",
        }));
        const __VLS_54 = __VLS_53({
            label: "Asia/Singapore (UTC+8)",
            value: "Asia/Singapore",
        }, ...__VLS_functionalComponentArgsRest(__VLS_53));
        const __VLS_56 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
            label: "UTC",
            value: "UTC",
        }));
        const __VLS_58 = __VLS_57({
            label: "UTC",
            value: "UTC",
        }, ...__VLS_functionalComponentArgsRest(__VLS_57));
        var __VLS_39;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "event-config" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "config-row" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
            ...{ class: "config-label" },
        });
        const __VLS_60 = {}.ElInput;
        /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
        // @ts-ignore
        const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
            modelValue: (__VLS_ctx.localBizId),
            placeholder: "如：报表 ID、任务 ID，留空表示匹配全部",
            ...{ style: {} },
            size: "small",
        }));
        const __VLS_62 = __VLS_61({
            modelValue: (__VLS_ctx.localBizId),
            placeholder: "如：报表 ID、任务 ID，留空表示匹配全部",
            ...{ style: {} },
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_61));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "field-hint" },
        });
    }
}
/** @type {__VLS_StyleScopedClasses['trig-selector']} */ ;
/** @type {__VLS_StyleScopedClasses['trig-category']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['cat-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['trig-card']} */ ;
/** @type {__VLS_StyleScopedClasses['trig-radio']} */ ;
/** @type {__VLS_StyleScopedClasses['card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['card-text']} */ ;
/** @type {__VLS_StyleScopedClasses['card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['card-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['card-check']} */ ;
/** @type {__VLS_StyleScopedClasses['config-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['config-header']} */ ;
/** @type {__VLS_StyleScopedClasses['config-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['config-title']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-config']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-row']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-label']} */ ;
/** @type {__VLS_StyleScopedClasses['event-config']} */ ;
/** @type {__VLS_StyleScopedClasses['config-row']} */ ;
/** @type {__VLS_StyleScopedClasses['config-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            CaretTop: CaretTop,
            triggerDefs: triggerDefs,
            categories: categories,
            selectedTrigger: selectedTrigger,
            selectTrigger: selectTrigger,
            scheduleStartDate: scheduleStartDate,
            scheduleRRule: scheduleRRule,
            scheduleTimezone: scheduleTimezone,
            rrulePresets: rrulePresets,
            selectedPreset: selectedPreset,
            applyPreset: applyPreset,
            syncScheduleConfig: syncScheduleConfig,
            localBizId: localBizId,
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
