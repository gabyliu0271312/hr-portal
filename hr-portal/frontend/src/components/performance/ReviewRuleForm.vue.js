import { computed, reactive, ref, watch } from 'vue';
import AsteriskOutlinedIcon from './AsteriskOutlinedIcon.vue';
import PerformanceCheckbox from './PerformanceCheckbox.vue';
import PerformanceSwitch from './PerformanceSwitch.vue';
import ReviewTypeRadioGroup from './ReviewTypeRadioGroup.vue';
import LevelConfigEditor from './LevelConfigEditor.vue';
import InfoOutlinedIcon from './InfoOutlinedIcon.vue';
import PerformanceRequiredLabel from './PerformanceRequiredLabel.vue';
import ScoreConfig from './ScoreConfig.vue';
import ScoreMappingConfig from './ScoreMappingConfig.vue';
import { getFixedScoreErrors } from './fixedScoreValidation';
const props = withDefaults(defineProps(), {
    isUsed: false,
    modelValue: undefined,
});
const emit = defineEmits();
const form = reactive({
    languages: { chinese: true, english: false },
    name: '',
    reviewType: '评级',
    gradeParticipatesInCalculation: false,
    levels: [
        { id: 'review-level-1', color: 'rgb(251, 191, 188)', code: '', name: '', quantifiedScore: '', value: '' },
        { id: 'review-level-2', color: 'rgb(254, 212, 164)', code: '', name: '', quantifiedScore: '', value: '' },
        { id: 'review-level-3', color: 'rgb(248, 230, 171)', code: '', name: '', quantifiedScore: '', value: '' },
    ],
    score: {
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        precision: '不保留小数',
        fixedOptions: [{ id: 'fixed-score-1', value: '' }, { id: 'fixed-score-2', value: '' }],
    },
    mapping: {
        method: '在分数上下限内输入评分',
        min: '',
        max: '',
        rule: 'a ≤ 分数 < b',
        intervals: [
            { lower: '', upper: '', code: '', name: '' },
            { lower: '', upper: '', code: '', name: '' },
        ],
        precision: '不保留小数',
    },
    remark: '',
});
const submitted = ref(false);
const previewRequested = ref(false);
const usedEdit = computed(() => props.mode === 'edit' && props.isUsed);
const validationActive = computed(() => submitted.value || previewRequested.value);
const nameError = computed(() => validationActive.value && !form.name.trim());
const gradeCodeErrors = computed(() => form.reviewType === '评级' && validationActive.value
    ? form.levels.map((level) => !level.code.trim())
    : form.levels.map(() => false));
const gradeLevelCountError = computed(() => form.reviewType === '评级' && previewRequested.value && form.levels.length < 2);
const quantifiedScoreErrors = computed(() => form.reviewType === '评级' && form.gradeParticipatesInCalculation && validationActive.value
    ? form.levels.map((level) => String(level.quantifiedScore ?? '').trim() === '')
    : form.levels.map(() => false));
const scoreBoundsError = computed(() => form.reviewType === '评分' && previewRequested.value
    && form.score.method === '在分数上下限内输入评分'
    && !validBounds(form.score.min, form.score.max));
const fixedScoreValidationErrors = computed(() => form.reviewType === '评分'
    && form.score.method === '在固定分值选项内选择评分'
    ? getFixedScoreErrors(form.score.fixedOptions || [])
    : (form.score.fixedOptions || []).map(() => undefined));
const fixedOptionErrors = computed(() => validationActive.value
    ? fixedScoreValidationErrors.value
    : fixedScoreValidationErrors.value.map(() => undefined));
const mappingBoundsError = computed(() => form.reviewType === '评分映射等级型' && previewRequested.value
    && !validBounds(form.mapping.min, form.mapping.max));
const mappingCodeErrors = computed(() => form.reviewType === '评分映射等级型' && previewRequested.value
    ? form.mapping.intervals.map((interval) => !interval.code.trim())
    : form.mapping.intervals.map(() => false));
const mappingIntervalErrors = computed(() => {
    if (form.reviewType !== '评分映射等级型' || !previewRequested.value)
        return form.mapping.intervals.map(() => false);
    const minimum = Number(form.mapping.min);
    const maximum = Number(form.mapping.max);
    if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || maximum <= minimum)
        return form.mapping.intervals.map(() => true);
    return form.mapping.intervals.map((interval, index) => {
        const lower = index === 0 ? minimum : Number(form.mapping.intervals[index - 1].upper);
        const upper = index === form.mapping.intervals.length - 1 ? maximum : Number(interval.upper);
        return !Number.isFinite(lower) || !Number.isFinite(upper) || lower < minimum || upper > maximum || upper <= lower;
    });
});
const previewErrors = computed(() => ({
    name: nameError.value,
    gradeCodes: gradeCodeErrors.value,
    levelCount: gradeLevelCountError.value,
    quantifiedScores: quantifiedScoreErrors.value,
    scoreBounds: scoreBoundsError.value,
    fixedOptions: fixedOptionErrors.value,
    mappingBounds: mappingBoundsError.value,
    mappingIntervals: mappingIntervalErrors.value,
    mappingCodes: mappingCodeErrors.value,
}));
watch(() => props.modelValue, (value) => {
    if (!value)
        return;
    Object.assign(form, value);
    if (value.languages)
        form.languages = { ...form.languages, ...value.languages };
    if (value.levels)
        form.levels = value.levels.map((level, index) => ({ ...level, id: level.id ?? `review-level-${index + 1}`, quantifiedScore: level.quantifiedScore ?? '' }));
    if (value.score)
        form.score = { ...form.score, ...value.score };
    if (value.mapping) {
        form.mapping = { ...form.mapping, ...value.mapping };
        if (value.mapping.intervals)
            form.mapping.intervals = value.mapping.intervals.map((interval) => ({ ...interval }));
    }
}, { immediate: true, deep: true });
function validBounds(minimum, maximum) {
    if (String(minimum).trim() === '' || String(maximum).trim() === '')
        return false;
    const minValue = Number(minimum);
    const maxValue = Number(maximum);
    return Number.isFinite(minValue) && Number.isFinite(maxValue) && maxValue > minValue;
}
function emitValue() {
    emit('update:modelValue', JSON.parse(JSON.stringify(form)));
}
function updateReviewType(value) {
    form.reviewType = value;
    previewRequested.value = false;
    emitValue();
}
function submit() {
    submitted.value = true;
    if (nameError.value || gradeCodeErrors.value.some(Boolean) || quantifiedScoreErrors.value.some(Boolean) || fixedScoreValidationErrors.value.some(Boolean))
        return;
    emit('submit', JSON.parse(JSON.stringify(form)));
}
function preview() {
    previewRequested.value = true;
    const errors = previewErrors.value;
    const invalid = errors.name
        || errors.gradeCodes.some(Boolean)
        || errors.levelCount
        || errors.quantifiedScores.some(Boolean)
        || errors.scoreBounds
        || errors.fixedOptions.some(Boolean)
        || errors.mappingBounds
        || errors.mappingIntervals.some(Boolean)
        || errors.mappingCodes.some(Boolean);
    if (invalid)
        return;
    emit('preview', JSON.parse(JSON.stringify(form)));
}
const __VLS_exposed = { submit, preview, form };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    isUsed: false,
    modelValue: undefined,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['language-control']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['level-header-content']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified-score-header']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified-score-header']} */ ;
/** @type {__VLS_StyleScopedClasses['value-header']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "review-rule-form-surface" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.form, __VLS_intrinsicElements.form)({
    ...{ onSubmit: (__VLS_ctx.submit) },
    ...{ class: "review-rule-form" },
    novalidate: true,
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "form-card basic-info-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "语言",
}));
const __VLS_1 = __VLS_0({
    label: "语言",
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control language-control" },
});
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_3 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.languages.chinese),
    label: "中文",
    disabled: true,
}));
const __VLS_4 = __VLS_3({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.languages.chinese),
    label: "中文",
    disabled: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_3));
let __VLS_6;
let __VLS_7;
let __VLS_8;
const __VLS_9 = {
    'onUpdate:modelValue': (__VLS_ctx.emitValue)
};
var __VLS_5;
/** @type {[typeof PerformanceCheckbox, ]} */ ;
// @ts-ignore
const __VLS_10 = __VLS_asFunctionalComponent(PerformanceCheckbox, new PerformanceCheckbox({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.languages.english),
    label: "英文",
    disabled: (__VLS_ctx.usedEdit),
}));
const __VLS_11 = __VLS_10({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.languages.english),
    label: "英文",
    disabled: (__VLS_ctx.usedEdit),
}, ...__VLS_functionalComponentArgsRest(__VLS_10));
let __VLS_13;
let __VLS_14;
let __VLS_15;
const __VLS_16 = {
    'onUpdate:modelValue': (__VLS_ctx.emitValue)
};
var __VLS_12;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "名称",
}));
const __VLS_18 = __VLS_17({
    label: "名称",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
    ...{ onInput: (__VLS_ctx.emitValue) },
    ...{ class: "native-input" },
    ...{ class: ({ error: __VLS_ctx.nameError }) },
    placeholder: "请输入名称",
});
(__VLS_ctx.form.name);
if (__VLS_ctx.nameError) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "error-text" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row type-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
/** @type {[typeof PerformanceRequiredLabel, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
    label: "评估类型",
}));
const __VLS_21 = __VLS_20({
    label: "评估类型",
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control" },
});
/** @type {[typeof ReviewTypeRadioGroup, ]} */ ;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent(ReviewTypeRadioGroup, new ReviewTypeRadioGroup({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.reviewType),
    disabled: (__VLS_ctx.usedEdit),
}));
const __VLS_24 = __VLS_23({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.form.reviewType),
    disabled: (__VLS_ctx.usedEdit),
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
let __VLS_26;
let __VLS_27;
let __VLS_28;
const __VLS_29 = {
    'onUpdate:modelValue': (__VLS_ctx.updateReviewType)
};
var __VLS_25;
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "form-card config-card" },
});
if (__VLS_ctx.form.reviewType === '评级') {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rating-config" },
        'aria-label': "评级设置",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rating-switch-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "strong-label" },
    });
    /** @type {[typeof PerformanceSwitch, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(PerformanceSwitch, new PerformanceSwitch({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.gradeParticipatesInCalculation),
        'aria-label': "评级可参与计算",
        disabled: (__VLS_ctx.usedEdit),
    }));
    const __VLS_31 = __VLS_30({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.gradeParticipatesInCalculation),
        'aria-label': "评级可参与计算",
        disabled: (__VLS_ctx.usedEdit),
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    let __VLS_33;
    let __VLS_34;
    let __VLS_35;
    const __VLS_36 = {
        'onUpdate:modelValue': (__VLS_ctx.emitValue)
    };
    var __VLS_32;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "helper-text" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "rating-preview" },
        'aria-label': "配置等级",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.h3, __VLS_intrinsicElements.h3)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "info-banner" },
    });
    /** @type {[typeof InfoOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(InfoOutlinedIcon, new InfoOutlinedIcon({
        ...{ class: "info-banner-icon" },
    }));
    const __VLS_38 = __VLS_37({
        ...{ class: "info-banner-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-header" },
        ...{ class: ({ quantified: __VLS_ctx.form.gradeParticipatesInCalculation }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "level-header-handle" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "level-header-content" },
        ...{ class: ({ quantified: __VLS_ctx.form.gradeParticipatesInCalculation }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        'aria-hidden': "true",
    });
    /** @type {[typeof PerformanceRequiredLabel, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(PerformanceRequiredLabel, new PerformanceRequiredLabel({
        label: "颜色与等级",
    }));
    const __VLS_41 = __VLS_40({
        label: "颜色与等级",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    if (__VLS_ctx.form.gradeParticipatesInCalculation) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "quantified-score-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        /** @type {[typeof AsteriskOutlinedIcon, ]} */ ;
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent(AsteriskOutlinedIcon, new AsteriskOutlinedIcon({}));
        const __VLS_44 = __VLS_43({}, ...__VLS_functionalComponentArgsRest(__VLS_43));
        /** @type {[typeof InfoOutlinedIcon, ]} */ ;
        // @ts-ignore
        const __VLS_46 = __VLS_asFunctionalComponent(InfoOutlinedIcon, new InfoOutlinedIcon({}));
        const __VLS_47 = __VLS_46({}, ...__VLS_functionalComponentArgsRest(__VLS_46));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "value-header" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    /** @type {[typeof InfoOutlinedIcon, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(InfoOutlinedIcon, new InfoOutlinedIcon({
        ...{ class: "value-info-icon" },
    }));
    const __VLS_50 = __VLS_49({
        ...{ class: "value-info-icon" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "level-header-delete" },
        'aria-hidden': "true",
    });
    /** @type {[typeof LevelConfigEditor, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(LevelConfigEditor, new LevelConfigEditor({
        levels: (__VLS_ctx.form.levels),
        quantified: (__VLS_ctx.form.gradeParticipatesInCalculation),
        structureLocked: (__VLS_ctx.usedEdit),
        quantifiedScoreDisabled: (__VLS_ctx.usedEdit),
        errors: (__VLS_ctx.gradeCodeErrors),
        quantifiedErrors: (__VLS_ctx.quantifiedScoreErrors),
        minimumError: (__VLS_ctx.gradeLevelCountError),
    }));
    const __VLS_53 = __VLS_52({
        levels: (__VLS_ctx.form.levels),
        quantified: (__VLS_ctx.form.gradeParticipatesInCalculation),
        structureLocked: (__VLS_ctx.usedEdit),
        quantifiedScoreDisabled: (__VLS_ctx.usedEdit),
        errors: (__VLS_ctx.gradeCodeErrors),
        quantifiedErrors: (__VLS_ctx.quantifiedScoreErrors),
        minimumError: (__VLS_ctx.gradeLevelCountError),
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
}
else if (__VLS_ctx.form.reviewType === '评分') {
    /** @type {[typeof ScoreConfig, ]} */ ;
    // @ts-ignore
    const __VLS_55 = __VLS_asFunctionalComponent(ScoreConfig, new ScoreConfig({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.score),
        disabled: (__VLS_ctx.usedEdit),
        errors: ({ bounds: __VLS_ctx.scoreBoundsError, fixedOptions: __VLS_ctx.fixedOptionErrors }),
    }));
    const __VLS_56 = __VLS_55({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.score),
        disabled: (__VLS_ctx.usedEdit),
        errors: ({ bounds: __VLS_ctx.scoreBoundsError, fixedOptions: __VLS_ctx.fixedOptionErrors }),
    }, ...__VLS_functionalComponentArgsRest(__VLS_55));
    let __VLS_58;
    let __VLS_59;
    let __VLS_60;
    const __VLS_61 = {
        'onUpdate:modelValue': (__VLS_ctx.emitValue)
    };
    var __VLS_57;
}
else {
    /** @type {[typeof ScoreMappingConfig, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(ScoreMappingConfig, new ScoreMappingConfig({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.mapping),
        boundsDisabled: (__VLS_ctx.usedEdit),
        structureLocked: (__VLS_ctx.usedEdit),
        errors: ({ bounds: __VLS_ctx.mappingBoundsError, intervalBounds: __VLS_ctx.mappingIntervalErrors, intervalCodes: __VLS_ctx.mappingCodeErrors }),
    }));
    const __VLS_63 = __VLS_62({
        ...{ 'onUpdate:modelValue': {} },
        modelValue: (__VLS_ctx.form.mapping),
        boundsDisabled: (__VLS_ctx.usedEdit),
        structureLocked: (__VLS_ctx.usedEdit),
        errors: ({ bounds: __VLS_ctx.mappingBoundsError, intervalBounds: __VLS_ctx.mappingIntervalErrors, intervalCodes: __VLS_ctx.mappingCodeErrors }),
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    let __VLS_65;
    let __VLS_66;
    let __VLS_67;
    const __VLS_68 = {
        'onUpdate:modelValue': (__VLS_ctx.emitValue)
    };
    var __VLS_64;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.section, __VLS_intrinsicElements.section)({
    ...{ class: "form-card remark-card" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "form-row" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "field-control textarea-wrap" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.textarea)({
    ...{ onInput: (__VLS_ctx.emitValue) },
    value: (__VLS_ctx.form.remark),
    ...{ class: "native-textarea" },
    maxlength: "2000",
    disabled: (__VLS_ctx.usedEdit),
    placeholder: "将用于帮助管理员理解评估规则，仅展示在飞书绩效管理后台",
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "count" },
});
(__VLS_ctx.form.remark.length);
/** @type {__VLS_StyleScopedClasses['review-rule-form-surface']} */ ;
/** @type {__VLS_StyleScopedClasses['review-rule-form']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['basic-info-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['language-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['native-input']} */ ;
/** @type {__VLS_StyleScopedClasses['error-text']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['type-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['config-card']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-config']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-switch-row']} */ ;
/** @type {__VLS_StyleScopedClasses['strong-label']} */ ;
/** @type {__VLS_StyleScopedClasses['helper-text']} */ ;
/** @type {__VLS_StyleScopedClasses['rating-preview']} */ ;
/** @type {__VLS_StyleScopedClasses['info-banner']} */ ;
/** @type {__VLS_StyleScopedClasses['info-banner-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['level-header']} */ ;
/** @type {__VLS_StyleScopedClasses['level-header-handle']} */ ;
/** @type {__VLS_StyleScopedClasses['level-header-content']} */ ;
/** @type {__VLS_StyleScopedClasses['quantified-score-header']} */ ;
/** @type {__VLS_StyleScopedClasses['value-header']} */ ;
/** @type {__VLS_StyleScopedClasses['value-info-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['level-header-delete']} */ ;
/** @type {__VLS_StyleScopedClasses['form-card']} */ ;
/** @type {__VLS_StyleScopedClasses['remark-card']} */ ;
/** @type {__VLS_StyleScopedClasses['form-row']} */ ;
/** @type {__VLS_StyleScopedClasses['field-label']} */ ;
/** @type {__VLS_StyleScopedClasses['field-control']} */ ;
/** @type {__VLS_StyleScopedClasses['textarea-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['native-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['count']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            AsteriskOutlinedIcon: AsteriskOutlinedIcon,
            PerformanceCheckbox: PerformanceCheckbox,
            PerformanceSwitch: PerformanceSwitch,
            ReviewTypeRadioGroup: ReviewTypeRadioGroup,
            LevelConfigEditor: LevelConfigEditor,
            InfoOutlinedIcon: InfoOutlinedIcon,
            PerformanceRequiredLabel: PerformanceRequiredLabel,
            ScoreConfig: ScoreConfig,
            ScoreMappingConfig: ScoreMappingConfig,
            form: form,
            usedEdit: usedEdit,
            nameError: nameError,
            gradeCodeErrors: gradeCodeErrors,
            gradeLevelCountError: gradeLevelCountError,
            quantifiedScoreErrors: quantifiedScoreErrors,
            scoreBoundsError: scoreBoundsError,
            fixedOptionErrors: fixedOptionErrors,
            mappingBoundsError: mappingBoundsError,
            mappingCodeErrors: mappingCodeErrors,
            mappingIntervalErrors: mappingIntervalErrors,
            emitValue: emitValue,
            updateReviewType: updateReviewType,
            submit: submit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
