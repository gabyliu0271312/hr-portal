/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { toLocalNaive, toUtcNaive } from '@/utils/datetime';
import { ref, computed, watch, nextTick } from 'vue';
import { Clock, Timer, CircleCheck, CircleClose, Finished, DocumentChecked, ArrowLeft, ArrowRight, Close, Check } from '@element-plus/icons-vue';
import ScheduleSelector from '@/components/common/ScheduleSelector.vue';
// ── RRULE → 文本描述（用于回填）────────────────────
function rruleToText(rrule) {
    const map = {
        'FREQ=DAILY;INTERVAL=1': '每日 06:00',
        'FREQ=WEEKLY;BYDAY=MO': '每周一 06:00',
        'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR': '每周一至周五 06:00',
        'FREQ=MONTHLY;BYMONTHDAY=1': '每月 1 日 06:00',
        'FREQ=MONTHLY;BYMONTHDAY=5': '每月 5 日 06:00',
        'FREQ=HOURLY;INTERVAL=1': '每小时整点',
    };
    return rrule ? (map[rrule] || '') : '';
}
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
        desc: '定时任务执行成功时触发',
        icon: CircleCheck,
        category: '门户继承',
    },
    {
        value: 'scheduled_job_failed',
        label: '定时任务执行失败',
        desc: '定时任务执行失败时触发',
        icon: CircleClose,
        category: '门户继承',
    },
    {
        value: 'scheduled_job_finished',
        label: '定时任务执行完成',
        desc: '定时任务执行完成时触发（无论成功/失败）',
        icon: Finished,
        category: '门户继承',
    },
    {
        value: 'report_run_success',
        label: '报表运行成功',
        desc: '报表运行成功时触发通知',
        icon: CircleCheck,
        category: '报表系统',
    },
    {
        value: 'report_run_failed',
        label: '报表运行失败',
        desc: '报表运行失败时触发通知',
        icon: CircleClose,
        category: '报表系统',
    },
    {
        value: 'scheduled_report_success',
        label: '定时报表生成成功',
        desc: '定时报表生成成功时触发通知',
        icon: DocumentChecked,
        category: '报表系统',
    },
    {
        value: 'scheduled_report_failed',
        label: '定时报表生成失败',
        desc: '定时报表生成失败时触发通知',
        icon: Timer,
        category: '报表系统',
    },
];
const categories = ['系统内置', '门户继承', '报表系统'];
const props = defineProps();
const emit = defineEmits();
const currentStep = ref('select');
const selectedType = ref(props.triggerType || '');
const selectedDef = computed(() => triggerDefs.find(t => t.value === selectedType.value));
// ── 配置表单 ─────────────────────────────────────────
// 定时配置（使用 ScheduleSelector 双向绑定）
const scheduleValue = ref('每日 06:00'); // 简单模式
const scheduleRRule = ref('FREQ=DAILY;INTERVAL=1'); // 高级模式
const scheduleStartDate = ref('');
// 事件配置
const localBizId = ref('');
// ── 向导状态管理 ─────────────────────────────────────
const isVisible = ref(false);
const isClosing = ref(false);
watch(() => props.modelValue, (val) => {
    if (val) {
        // 打开向导
        isVisible.value = true;
        isClosing.value = false;
        // 回填已有数据
        if (props.triggerType) {
            selectedType.value = props.triggerType;
            currentStep.value = 'configure';
            // 回填配置
            if (props.triggerType === 'schedule') {
                const cfg = props.triggerConfig || {};
                scheduleStartDate.value = toLocalNaive(cfg.start_time?.slice(0, 16)) || '';
                scheduleRRule.value = cfg.rrule || 'FREQ=DAILY;INTERVAL=1';
                // 根据 rrule 反推 schedule 文本
                scheduleValue.value = rruleToText(cfg.rrule) || '每日 06:00';
            }
            else {
                localBizId.value = props.triggerConfig?.biz_id || '';
            }
        }
        else {
            selectedType.value = '';
            currentStep.value = 'select';
            resetConfig();
        }
        // 动画入场
        nextTick(() => { isVisible.value = true; });
    }
    else {
        closeWizard();
    }
});
function resetConfig() {
    scheduleValue.value = '每日 06:00';
    scheduleRRule.value = 'FREQ=DAILY;INTERVAL=1';
    scheduleStartDate.value = '';
    localBizId.value = '';
}
function closeWizard() {
    isClosing.value = true;
    setTimeout(() => {
        isVisible.value = false;
        isClosing.value = false;
        emit('update:modelValue', false);
    }, 280);
}
// ── 步骤导航 ─────────────────────────────────────────
function goToConfigure() {
    if (!selectedType.value)
        return;
    currentStep.value = 'configure';
    // 如果之前有配置则回填
    if (props.triggerType === selectedType.value && props.triggerConfig) {
        if (selectedType.value === 'schedule') {
            const cfg = props.triggerConfig;
            scheduleStartDate.value = toLocalNaive(cfg.start_time?.slice(0, 16)) || scheduleStartDate.value;
            scheduleRRule.value = cfg.rrule || scheduleRRule.value;
        }
        else {
            localBizId.value = props.triggerConfig?.biz_id || '';
        }
    }
    else {
        resetConfig();
    }
}
function goBackToSelect() {
    currentStep.value = 'select';
}
function handleConfirm() {
    const triggerConfig = {};
    let bizId = null;
    if (selectedType.value === 'schedule') {
        triggerConfig.schedule_type = 'recurring';
        triggerConfig.start_time = scheduleStartDate.value ? toUtcNaive(scheduleStartDate.value + ':00') : null;
        triggerConfig.rrule = scheduleRRule.value;
    }
    else {
        bizId = localBizId.value ? Number(localBizId.value) : null;
        triggerConfig.biz_id = localBizId.value || null;
    }
    emit('confirm', { triggerType: selectedType.value, triggerConfig, bizId });
    closeWizard();
}
// ── 步骤指示器 ───────────────────────────────────────
const steps = [
    { key: 'select', label: '选择触发器类型' },
    { key: 'configure', label: '配置触发器' },
];
const currentStepIndex = computed(() => steps.findIndex(s => s.key === currentStep.value));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['wizard-back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['current']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-line']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-label']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['preset-chip']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.Teleport;
/** @type {[typeof __VLS_components.Teleport, typeof __VLS_components.Teleport, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    to: "body",
}));
const __VLS_2 = __VLS_1({
    to: "body",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.Transition;
/** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    name: "wizard-fade",
}));
const __VLS_6 = __VLS_5({
    name: "wizard-fade",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
if (__VLS_ctx.isVisible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "wizard-overlay" },
        ...{ class: ({ closing: __VLS_ctx.isClosing }) },
    });
    const __VLS_8 = {}.Transition;
    /** @type {[typeof __VLS_components.Transition, typeof __VLS_components.Transition, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        name: "wizard-slide",
    }));
    const __VLS_10 = __VLS_9({
        name: "wizard-slide",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    if (__VLS_ctx.isVisible && !__VLS_ctx.isClosing) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-panel" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-header-left" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (__VLS_ctx.closeWizard) },
            ...{ class: "wizard-back-btn" },
        });
        const __VLS_12 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            size: (20),
        }));
        const __VLS_14 = __VLS_13({
            size: (20),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        const __VLS_16 = {}.Close;
        /** @type {[typeof __VLS_components.Close, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
        const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
        var __VLS_15;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-title" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "step-indicator" },
        });
        for (const [step, i] of __VLS_getVForSourceType((__VLS_ctx.steps))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (step.key),
                ...{ class: "step-dot" },
                ...{ class: ({
                        active: i <= __VLS_ctx.currentStepIndex,
                        current: i === __VLS_ctx.currentStepIndex,
                    }) },
            });
            if (i < __VLS_ctx.currentStepIndex) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "step-check" },
                });
                const __VLS_20 = {}.ElIcon;
                /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                // @ts-ignore
                const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
                    size: (12),
                }));
                const __VLS_22 = __VLS_21({
                    size: (12),
                }, ...__VLS_functionalComponentArgsRest(__VLS_21));
                __VLS_23.slots.default;
                const __VLS_24 = {}.Check;
                /** @type {[typeof __VLS_components.Check, ]} */ ;
                // @ts-ignore
                const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
                const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
                var __VLS_23;
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "step-num" },
                });
                (i + 1);
            }
        }
        for (const [i] of __VLS_getVForSourceType((__VLS_ctx.steps.length - 1))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: ('line-' + i),
                ...{ class: "step-line" },
                ...{ class: ({ filled: i <= __VLS_ctx.currentStepIndex }) },
            });
        }
        if (__VLS_ctx.currentStep === 'select') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wizard-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "wizard-desc" },
            });
            for (const [cat] of __VLS_getVForSourceType((__VLS_ctx.categories))) {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    key: (cat),
                    ...{ class: "wiz-category" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wiz-cat-label" },
                });
                (cat);
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wiz-cards" },
                });
                for (const [t] of __VLS_getVForSourceType((__VLS_ctx.triggerDefs.filter(d => d.category === cat)))) {
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
                        ...{ onClick: (...[$event]) => {
                                if (!(__VLS_ctx.isVisible))
                                    return;
                                if (!(__VLS_ctx.isVisible && !__VLS_ctx.isClosing))
                                    return;
                                if (!(__VLS_ctx.currentStep === 'select'))
                                    return;
                                __VLS_ctx.selectedType = t.value;
                                __VLS_ctx.goToConfigure();
                            } },
                        key: (t.value),
                        ...{ class: "wiz-card" },
                        ...{ class: ({ active: __VLS_ctx.selectedType === t.value }) },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "wiz-card-icon" },
                        ...{ class: ({ highlight: __VLS_ctx.selectedType === t.value }) },
                    });
                    const __VLS_28 = {}.ElIcon;
                    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                    // @ts-ignore
                    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
                        size: (22),
                    }));
                    const __VLS_30 = __VLS_29({
                        size: (22),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
                    __VLS_31.slots.default;
                    const __VLS_32 = ((t.icon));
                    // @ts-ignore
                    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({}));
                    const __VLS_34 = __VLS_33({}, ...__VLS_functionalComponentArgsRest(__VLS_33));
                    var __VLS_31;
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "wiz-card-body" },
                    });
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "wiz-card-title" },
                    });
                    (t.label);
                    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                        ...{ class: "wiz-card-desc" },
                    });
                    (t.desc);
                    if (__VLS_ctx.selectedType === t.value) {
                        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                            ...{ class: "wiz-card-check" },
                        });
                        const __VLS_36 = {}.ElIcon;
                        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
                        // @ts-ignore
                        const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
                            size: (14),
                        }));
                        const __VLS_38 = __VLS_37({
                            size: (14),
                        }, ...__VLS_functionalComponentArgsRest(__VLS_37));
                        __VLS_39.slots.default;
                        const __VLS_40 = {}.Check;
                        /** @type {[typeof __VLS_components.Check, ]} */ ;
                        // @ts-ignore
                        const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
                        const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
                        var __VLS_39;
                    }
                }
            }
        }
        if (__VLS_ctx.currentStep === 'configure') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "wizard-body" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "config-summary" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "config-summary-badge" },
            });
            const __VLS_44 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
                size: (16),
            }));
            const __VLS_46 = __VLS_45({
                size: (16),
            }, ...__VLS_functionalComponentArgsRest(__VLS_45));
            __VLS_47.slots.default;
            const __VLS_48 = ((__VLS_ctx.selectedDef?.icon));
            // @ts-ignore
            const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({}));
            const __VLS_50 = __VLS_49({}, ...__VLS_functionalComponentArgsRest(__VLS_49));
            var __VLS_47;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "config-summary-text" },
            });
            (__VLS_ctx.selectedDef?.label);
            if (__VLS_ctx.selectedType === 'schedule') {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "schedule-form" },
                });
                /** @type {[typeof ScheduleSelector, ]} */ ;
                // @ts-ignore
                const __VLS_52 = __VLS_asFunctionalComponent(ScheduleSelector, new ScheduleSelector({
                    schedule: (__VLS_ctx.scheduleValue),
                    rrule: (__VLS_ctx.scheduleRRule),
                    startTime: (__VLS_ctx.scheduleStartDate),
                    allowAdvanced: (true),
                }));
                const __VLS_53 = __VLS_52({
                    schedule: (__VLS_ctx.scheduleValue),
                    rrule: (__VLS_ctx.scheduleRRule),
                    startTime: (__VLS_ctx.scheduleStartDate),
                    allowAdvanced: (true),
                }, ...__VLS_functionalComponentArgsRest(__VLS_52));
            }
            else {
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "event-form" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                    ...{ class: "wiz-field" },
                });
                __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
                    ...{ class: "wiz-label" },
                });
                const __VLS_55 = {}.ElInput;
                /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
                // @ts-ignore
                const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
                    modelValue: (__VLS_ctx.localBizId),
                    placeholder: "如：报表 ID、任务 ID，留空则匹配该类型所有事件",
                    ...{ style: {} },
                }));
                const __VLS_57 = __VLS_56({
                    modelValue: (__VLS_ctx.localBizId),
                    placeholder: "如：报表 ID、任务 ID，留空则匹配该类型所有事件",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_56));
                __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                    ...{ class: "wiz-hint" },
                });
            }
        }
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "wizard-footer" },
        });
        if (__VLS_ctx.currentStep === 'select') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
            const __VLS_59 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
                ...{ 'onClick': {} },
                type: "primary",
                disabled: (!__VLS_ctx.selectedType),
            }));
            const __VLS_61 = __VLS_60({
                ...{ 'onClick': {} },
                type: "primary",
                disabled: (!__VLS_ctx.selectedType),
            }, ...__VLS_functionalComponentArgsRest(__VLS_60));
            let __VLS_63;
            let __VLS_64;
            let __VLS_65;
            const __VLS_66 = {
                onClick: (__VLS_ctx.goToConfigure)
            };
            __VLS_62.slots.default;
            const __VLS_67 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
                ...{ class: "btn-icon-right" },
            }));
            const __VLS_69 = __VLS_68({
                ...{ class: "btn-icon-right" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_68));
            __VLS_70.slots.default;
            const __VLS_71 = {}.ArrowRight;
            /** @type {[typeof __VLS_components.ArrowRight, ]} */ ;
            // @ts-ignore
            const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({}));
            const __VLS_73 = __VLS_72({}, ...__VLS_functionalComponentArgsRest(__VLS_72));
            var __VLS_70;
            var __VLS_62;
        }
        if (__VLS_ctx.currentStep === 'configure') {
            const __VLS_75 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.ArrowLeft),
            }));
            const __VLS_77 = __VLS_76({
                ...{ 'onClick': {} },
                icon: (__VLS_ctx.ArrowLeft),
            }, ...__VLS_functionalComponentArgsRest(__VLS_76));
            let __VLS_79;
            let __VLS_80;
            let __VLS_81;
            const __VLS_82 = {
                onClick: (__VLS_ctx.goBackToSelect)
            };
            __VLS_78.slots.default;
            var __VLS_78;
            const __VLS_83 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.Check),
            }));
            const __VLS_85 = __VLS_84({
                ...{ 'onClick': {} },
                type: "primary",
                icon: (__VLS_ctx.Check),
            }, ...__VLS_functionalComponentArgsRest(__VLS_84));
            let __VLS_87;
            let __VLS_88;
            let __VLS_89;
            const __VLS_90 = {
                onClick: (__VLS_ctx.handleConfirm)
            };
            __VLS_86.slots.default;
            var __VLS_86;
        }
    }
    var __VLS_11;
}
var __VLS_7;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['wizard-overlay']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-header']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-header-left']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-back-btn']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-title']} */ ;
/** @type {__VLS_StyleScopedClasses['step-indicator']} */ ;
/** @type {__VLS_StyleScopedClasses['step-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['step-check']} */ ;
/** @type {__VLS_StyleScopedClasses['step-num']} */ ;
/** @type {__VLS_StyleScopedClasses['step-line']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-body']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-category']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-cat-label']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-cards']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-body']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-title']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-card-check']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-body']} */ ;
/** @type {__VLS_StyleScopedClasses['config-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['config-summary-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['config-summary-text']} */ ;
/** @type {__VLS_StyleScopedClasses['schedule-form']} */ ;
/** @type {__VLS_StyleScopedClasses['event-form']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-field']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-label']} */ ;
/** @type {__VLS_StyleScopedClasses['wiz-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['wizard-footer']} */ ;
/** @type {__VLS_StyleScopedClasses['btn-icon-right']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ArrowLeft: ArrowLeft,
            ArrowRight: ArrowRight,
            Close: Close,
            Check: Check,
            ScheduleSelector: ScheduleSelector,
            triggerDefs: triggerDefs,
            categories: categories,
            currentStep: currentStep,
            selectedType: selectedType,
            selectedDef: selectedDef,
            scheduleValue: scheduleValue,
            scheduleRRule: scheduleRRule,
            scheduleStartDate: scheduleStartDate,
            localBizId: localBizId,
            isVisible: isVisible,
            isClosing: isClosing,
            closeWizard: closeWizard,
            goToConfigure: goToConfigure,
            goBackToSelect: goBackToSelect,
            handleConfirm: handleConfirm,
            steps: steps,
            currentStepIndex: currentStepIndex,
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
