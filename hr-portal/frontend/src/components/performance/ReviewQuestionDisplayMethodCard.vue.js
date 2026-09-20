/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue';
import PerformanceSwitch from './PerformanceSwitch.vue';
import ReviewQuestionOrderSection from './ReviewQuestionOrderSection.vue';
const props = withDefaults(defineProps(), {
    showOptions: true,
    showOrder: false,
});
const emit = defineEmits();
function valueOf(camel, snake) {
    return props.config[camel] ?? props.config[snake];
}
function booleanValue(camel, snake) {
    const value = valueOf(camel, snake);
    return value === true || value === 'true' || value === 1 || value === '1';
}
const gradeParticipatesInCalculation = computed(() => booleanValue('gradeParticipatesInCalculation', 'grade_participates_in_calculation'));
const hideGradeQuantifiedScore = computed(() => booleanValue('hideGradeQuantifiedScore', 'hide_grade_quantified_score'));
const displayMode = computed(() => {
    const value = props.displayMode ?? valueOf('displayMode', 'display_mode');
    return value === '下拉样式' ? '下拉样式' : '标签样式';
});
const showHideScoreOption = computed(() => props.ruleType === '评级' && gradeParticipatesInCalculation.value);
const selectedDisplayMode = ref(displayMode.value);
const localHideGradeQuantifiedScore = ref(hideGradeQuantifiedScore.value);
watch([() => props.displayMode, () => props.config], () => {
    selectedDisplayMode.value = displayMode.value;
    localHideGradeQuantifiedScore.value = hideGradeQuantifiedScore.value;
}, { deep: true });
function selectDisplayMode(value) {
    selectedDisplayMode.value = value;
    emit('update:displayMode', value);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    showOptions: true,
    showOrder: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['display-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['display-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['display-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['has-options']} */ ;
/** @type {__VLS_StyleScopedClasses['display-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-label']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['selected']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-choice']} */ ;
/** @type {__VLS_StyleScopedClasses['display-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['display-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['label-style-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-score-heading']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "question-card display-method-card" },
    ...{ class: ({ 'is-quantified': __VLS_ctx.showHideScoreOption, 'has-options': props.showOptions, 'has-order': props.showOrder }) },
    'aria-label': "展示方式",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "additional-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "display-options" },
});
if (props.showOptions) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "display-hint" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-option-grid" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ onClick: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('标签样式');
            } },
        ...{ onKeydown: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('标签样式');
            } },
        ...{ onKeydown: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('标签样式');
            } },
        ...{ class: "display-option" },
        ...{ class: ({ selected: __VLS_ctx.selectedDisplayMode === '标签样式' }) },
        ...{ style: {} },
        role: "radio",
        'aria-checked': (__VLS_ctx.selectedDisplayMode === '标签样式'),
        tabindex: "0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-option-choice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        tabindex: "-1",
        'aria-hidden': "true",
        checked: (__VLS_ctx.selectedDisplayMode === '标签样式'),
        name: "display-mode",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "radio-dot" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "display-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "display-option-divider" },
        ...{ style: ({ backgroundColor: __VLS_ctx.selectedDisplayMode === '标签样式' ? '#f0f4ff' : '#dee0e3' }) },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-option-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "label-style-preview" },
        'aria-label': "标签样式预览",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.svg, __VLS_intrinsicElements.svg)({
        width: "336",
        height: "32",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        width: "48",
        height: "32",
        rx: "16",
        fill: "#F5F6F7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M24.2 10.808c-1.596 0-2.8.518-3.64 1.582-.756.938-1.12 2.142-1.12 3.626 0 1.512.35 2.716 1.078 3.612.826 1.036 2.058 1.568 3.696 1.568 1.078 0 2.002-.308 2.772-.924.826-.658 1.344-1.568 1.568-2.73H27.07c-.196.784-.546 1.372-1.05 1.764-.476.364-1.092.546-1.82.546-1.12 0-1.946-.35-2.478-1.05-.504-.658-.756-1.582-.756-2.786 0-1.162.252-2.086.77-2.758.546-.742 1.358-1.106 2.436-1.106.728 0 1.316.154 1.792.476.476.322.798.826.966 1.498h1.484c-.154-1.008-.602-1.82-1.33-2.408-.756-.616-1.722-.91-2.884-.91z",
        fill: "#646A73",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        fill: "#DEE0E3",
        d: "M48 15.5h48v1H48z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "96",
        width: "48",
        height: "32",
        rx: "16",
        fill: "#F5F6F7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M116.174 11.004V21h4.564c1.064 0 1.89-.196 2.478-.588.686-.476 1.036-1.204 1.036-2.212 0-.672-.168-1.218-.504-1.624-.336-.406-.84-.672-1.498-.798a2.484 2.484 0 001.162-.826c.28-.392.42-.868.42-1.428 0-.77-.266-1.372-.798-1.82-.56-.476-1.316-.7-2.296-.7h-4.564zm1.526 1.26h2.66c.672 0 1.176.112 1.484.35.308.224.462.588.462 1.092 0 .532-.154.924-.462 1.176-.308.238-.812.364-1.512.364H117.7v-2.982zm0 4.228h2.87c.728 0 1.274.126 1.624.392.35.266.532.7.532 1.288 0 .574-.238.994-.686 1.26-.364.196-.868.308-1.512.308H117.7v-3.248z",
        fill: "#646A73",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        fill: "#DEE0E3",
        d: "M144 15.5h48v1H144z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "192",
        width: "48",
        height: "32",
        rx: "16",
        fill: "#F5F6F7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M215.133 11.004L211.283 21h1.624l.938-2.576h4.298l.938 2.576h1.638l-3.85-9.996h-1.736zm-.826 6.16l1.666-4.522h.056l1.652 4.522h-3.374z",
        fill: "#646A73",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        fill: "#DEE0E3",
        d: "M240 15.5h48v1H240z",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.rect)({
        x: "288",
        width: "48",
        height: "32",
        rx: "16",
        fill: "#F5F6F7",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.path)({
        d: "M311.948 10.808c-1.064 0-1.946.238-2.646.714-.742.504-1.106 1.19-1.106 2.072 0 .868.378 1.54 1.148 2.002.308.168 1.064.434 2.296.826 1.106.336 1.764.56 1.988.672.63.322.952.756.952 1.316 0 .448-.224.798-.672 1.05-.448.252-1.05.392-1.806.392-.84 0-1.456-.154-1.862-.462-.448-.336-.728-.91-.84-1.694h-1.512c.084 1.26.532 2.184 1.358 2.772.686.476 1.638.728 2.856.728 1.26 0 2.24-.252 2.94-.756.7-.518 1.05-1.218 1.05-2.114 0-.924-.434-1.638-1.288-2.156-.392-.238-1.274-.56-2.618-.98-.938-.28-1.512-.49-1.736-.616-.504-.266-.742-.616-.742-1.064 0-.504.21-.868.644-1.092.35-.196.854-.294 1.512-.294.756 0 1.316.14 1.708.434.392.28.644.756.784 1.4h1.512c-.098-1.092-.49-1.89-1.19-2.408-.658-.504-1.568-.742-2.73-.742z",
        fill: "#646A73",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({
        ...{ onClick: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('下拉样式');
            } },
        ...{ onKeydown: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('下拉样式');
            } },
        ...{ onKeydown: (...[$event]) => {
                if (!(props.showOptions))
                    return;
                __VLS_ctx.selectDisplayMode('下拉样式');
            } },
        ...{ class: "display-option" },
        ...{ class: ({ selected: __VLS_ctx.selectedDisplayMode === '下拉样式' }) },
        ...{ style: {} },
        role: "radio",
        'aria-checked': (__VLS_ctx.selectedDisplayMode === '下拉样式'),
        tabindex: "0",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-option-choice" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "radio",
        tabindex: "-1",
        'aria-hidden': "true",
        checked: (__VLS_ctx.selectedDisplayMode === '下拉样式'),
        name: "display-mode",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "radio-dot" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "display-copy" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span)({
        ...{ class: "display-option-divider" },
        ...{ style: ({ backgroundColor: __VLS_ctx.selectedDisplayMode === '下拉样式' ? '#f0f4ff' : '#dee0e3' }) },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "display-option-preview" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "select-preview" },
        'aria-label': "下拉样式预览",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    /** @type {[typeof DownBoldOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(DownBoldOutlinedIcon, new DownBoldOutlinedIcon({
        ...{ class: "select-preview-arrow" },
        size: (12),
    }));
    const __VLS_1 = __VLS_0({
        ...{ class: "select-preview-arrow" },
        size: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
}
if (__VLS_ctx.showHideScoreOption) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hide-score-option" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "hide-score-heading" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    /** @type {[typeof PerformanceSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_3 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localHideGradeQuantifiedScore),
        'aria-label': "隐藏等级量化分",
    }));
    const __VLS_4 = __VLS_3({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.localHideGradeQuantifiedScore),
        'aria-label': "隐藏等级量化分",
    }, ...__VLS_functionalComponentArgsRest(__VLS_3));
    let __VLS_6;
    let __VLS_7;
    let __VLS_8;
    const __VLS_9 = {
        'onUpdate:modelValue': (...[$event]) => {
            if (!(__VLS_ctx.showHideScoreOption))
                return;
            __VLS_ctx.localHideGradeQuantifiedScore = $event;
        }
    };
    var __VLS_5;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.small, __VLS_intrinsicElements.small)({
        ...{ class: "hide-score-description" },
    });
}
if (props.showOrder) {
    /** @type {[typeof ReviewQuestionOrderSection, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(ReviewQuestionOrderSection, new ReviewQuestionOrderSection({}));
    const __VLS_11 = __VLS_10({}, ...__VLS_functionalComponentArgsRest(__VLS_10));
}
/** @type {__VLS_StyleScopedClasses['question-card']} */ ;
/** @type {__VLS_StyleScopedClasses['display-method-card']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['display-options']} */ ;
/** @type {__VLS_StyleScopedClasses['display-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-choice']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['display-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['label-style-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-choice']} */ ;
/** @type {__VLS_StyleScopedClasses['radio-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['display-copy']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-divider']} */ ;
/** @type {__VLS_StyleScopedClasses['display-option-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['select-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['select-preview-arrow']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-score-option']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-score-heading']} */ ;
/** @type {__VLS_StyleScopedClasses['hide-score-description']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            DownBoldOutlinedIcon: DownBoldOutlinedIcon,
            PerformanceSwitch: PerformanceSwitch,
            ReviewQuestionOrderSection: ReviewQuestionOrderSection,
            showHideScoreOption: showHideScoreOption,
            selectedDisplayMode: selectedDisplayMode,
            localHideGradeQuantifiedScore: localHideGradeQuantifiedScore,
            selectDisplayMode: selectDisplayMode,
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
