/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import PreviewCloseButton from './PreviewCloseButton.vue';
import RatingRulePreview from './RatingRulePreview.vue';
import ScoreRulePreview from './ScoreRulePreview.vue';
import ScoreMappingRulePreview from './ScoreMappingRulePreview.vue';
const props = defineProps();
const emit = defineEmits();
const previewValue = ref('');
const mappingBodyHeight = computed(() => 262.667 + Math.max(0, props.formValue.mapping.intervals.length - 2) * 70.667);
watch(() => props.open, (open) => {
    if (open)
        previewValue.value = '';
});
function updatePreviewValue(value) {
    previewValue.value = value;
    emit('update:previewValue', value);
}
function precisionDigits(value) {
    return value === '保留 1 位小数' ? 1 : value === '保留 2 位小数' ? 2 : 0;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['is-rating']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['is-score']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-body']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['is-mapping']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-body']} */ ;
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
if (__VLS_ctx.open) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onKeydown: (...[$event]) => {
                if (!(__VLS_ctx.open))
                    return;
                __VLS_ctx.emit('close');
            } },
        ...{ class: "review-rule-preview-layer" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
        ...{ class: "review-rule-preview-modal" },
        ...{ class: (`is-${__VLS_ctx.reviewType}`) },
        ...{ style: (__VLS_ctx.reviewType === 'mapping' ? { '--mapping-preview-body-height': `${__VLS_ctx.mappingBodyHeight}px` } : undefined) },
        role: "dialog",
        'aria-modal': "true",
        'aria-labelledby': "review-rule-preview-title",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
        ...{ class: "review-rule-preview-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
        id: "review-rule-preview-title",
    });
    /** @type {[typeof PreviewCloseButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PreviewCloseButton, new PreviewCloseButton({
        ...{ 'onClose': {} },
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClose': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClose: (...[$event]) => {
            if (!(__VLS_ctx.open))
                return;
            __VLS_ctx.emit('close');
        }
    };
    var __VLS_6;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
        ...{ class: "review-rule-preview-body" },
    });
    if (__VLS_ctx.reviewType === 'rating') {
        /** @type {[typeof RatingRulePreview, ]} */ ;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent(RatingRulePreview, new RatingRulePreview({
            levels: (__VLS_ctx.formValue.levels),
            quantified: (__VLS_ctx.formValue.gradeParticipatesInCalculation),
        }));
        const __VLS_12 = __VLS_11({
            levels: (__VLS_ctx.formValue.levels),
            quantified: (__VLS_ctx.formValue.gradeParticipatesInCalculation),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    }
    else if (__VLS_ctx.reviewType === 'score') {
        /** @type {[typeof ScoreRulePreview, ]} */ ;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent(ScoreRulePreview, new ScoreRulePreview({
            method: (__VLS_ctx.formValue.score.method),
            minimum: (__VLS_ctx.formValue.score.min),
            maximum: (__VLS_ctx.formValue.score.max),
            precision: (__VLS_ctx.precisionDigits(__VLS_ctx.formValue.score.precision)),
            fixedOptions: (__VLS_ctx.formValue.score.fixedOptions),
        }));
        const __VLS_15 = __VLS_14({
            method: (__VLS_ctx.formValue.score.method),
            minimum: (__VLS_ctx.formValue.score.min),
            maximum: (__VLS_ctx.formValue.score.max),
            precision: (__VLS_ctx.precisionDigits(__VLS_ctx.formValue.score.precision)),
            fixedOptions: (__VLS_ctx.formValue.score.fixedOptions),
        }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    }
    else {
        /** @type {[typeof ScoreMappingRulePreview, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(ScoreMappingRulePreview, new ScoreMappingRulePreview({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.previewValue),
            minimum: (__VLS_ctx.formValue.mapping.min),
            maximum: (__VLS_ctx.formValue.mapping.max),
            precision: (__VLS_ctx.precisionDigits(__VLS_ctx.formValue.mapping.precision)),
            intervals: (__VLS_ctx.formValue.mapping.intervals),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (__VLS_ctx.previewValue),
            minimum: (__VLS_ctx.formValue.mapping.min),
            maximum: (__VLS_ctx.formValue.mapping.max),
            precision: (__VLS_ctx.precisionDigits(__VLS_ctx.formValue.mapping.precision)),
            intervals: (__VLS_ctx.formValue.mapping.intervals),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            'onUpdate:modelValue': (__VLS_ctx.updatePreviewValue)
        };
        var __VLS_19;
    }
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-layer']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-header']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-preview-body']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PreviewCloseButton: PreviewCloseButton,
            RatingRulePreview: RatingRulePreview,
            ScoreRulePreview: ScoreRulePreview,
            ScoreMappingRulePreview: ScoreMappingRulePreview,
            emit: emit,
            previewValue: previewValue,
            mappingBodyHeight: mappingBodyHeight,
            updatePreviewValue: updatePreviewValue,
            precisionDigits: precisionDigits,
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
