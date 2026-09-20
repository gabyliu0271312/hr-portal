/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import PerformanceDragHandle from './PerformanceDragHandle.vue';
import PerformanceIconButton from './PerformanceIconButton.vue';
import PerformanceSortableList from './PerformanceSortableList.vue';
import ReviewQuestionSubQuestionSelect from './ReviewQuestionSubQuestionSelect.vue';
const props = defineProps();
const emit = defineEmits();
const pickerOpen = ref(false);
const pickerQuery = ref('');
const rootRef = ref(null);
const isCondition = computed(() => props.calculationRule === 'condition');
const showWeight = computed(() => props.calculationRule === 'weighted_sum');
const filteredOptions = computed(() => {
    const query = pickerQuery.value.trim().toLowerCase();
    return query ? props.options.filter((option) => `${option.name} ${option.rule_name}`.toLowerCase().includes(query)) : props.options;
});
const selectedIds = computed(() => new Set(props.modelValue.map((row) => row.question_id).filter((id) => id !== null)));
const selectedOption = (questionId) => props.options.find((option) => String(option.id) === String(questionId)) ?? null;
function updateQuestion(index, questionId) {
    emit('update:modelValue', props.modelValue.map((row, rowIndex) => rowIndex === index ? { ...row, question_id: questionId } : row));
}
function openPicker() {
    pickerQuery.value = '';
    pickerOpen.value = true;
}
function selectOption(option) {
    const optionId = String(option.id);
    const selectedRows = props.modelValue.filter((row) => String(row.question_id) === optionId);
    if (selectedRows.length) {
        emit('update:modelValue', props.modelValue.filter((row) => String(row.question_id) !== optionId));
        return;
    }
    const emptyIndex = props.modelValue.findIndex((row) => row.question_id === null);
    if (emptyIndex >= 0)
        updateQuestion(emptyIndex, option.id);
    else
        emit('update:modelValue', [...props.modelValue, { id: `sub-question-${props.modelValue.length + 1}`, question_id: option.id }]);
}
function removeRow(index) {
    emit('update:modelValue', props.modelValue.filter((_, rowIndex) => rowIndex !== index));
}
function reorder(from, to) {
    if (from === to)
        return;
    const next = props.modelValue.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    emit('update:modelValue', next);
}
function scoreBounds(option) {
    return option?.score_min !== null && option?.score_min !== undefined && option?.score_max !== null && option?.score_max !== undefined
        ? `${option.score_min} - ${option.score_max}`
        : '--';
}
function handleDocumentClick(event) {
    if (!pickerOpen.value || !rootRef.value)
        return;
    if (!rootRef.value.contains(event.target))
        pickerOpen.value = false;
}
onMounted(() => document.addEventListener('click', handleDocumentClick));
onBeforeUnmount(() => document.removeEventListener('click', handleDocumentClick));
watch(() => [props.calculationRule, props.options.map((option) => String(option.id)).join(',')], () => {
    const validIds = new Set(props.options.map((option) => option.id));
    const next = props.modelValue.filter((row) => row.question_id === null || validIds.has(row.question_id));
    if (next.length !== props.modelValue.length || next.some((row, index) => row.question_id !== props.modelValue[index]?.question_id))
        emit('update:modelValue', next);
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sub-question-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-sortable-list']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['has-weight']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-column']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['is-condition']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['new-sub-question']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-search']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onKeydown: (...[$event]) => {
            __VLS_ctx.pickerOpen = false;
        } },
    ref: "rootRef",
    ...{ class: "sub-question-list" },
    ...{ class: ({ 'is-sortable': !__VLS_ctx.isCondition, 'is-condition': __VLS_ctx.isCondition, 'has-weight': __VLS_ctx.showWeight }) },
    'data-component': "review-question-sub-question-list",
});
/** @type {typeof __VLS_ctx.rootRef} */ ;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "additional-label" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "required-mark" },
});
if (!__VLS_ctx.isCondition) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-header sortable-grid" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "name-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "rule-column" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "bounds-column" },
    });
    if (__VLS_ctx.showWeight) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "weight-column" },
        });
    }
    /** @type {[typeof PerformanceSortableList, typeof PerformanceSortableList, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceSortableList, new PerformanceSortableList({
        ...{ 'onReorder': {} },
        items: (__VLS_ctx.modelValue),
        itemKey: "id",
        gap: (12),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onReorder': {} },
        items: (__VLS_ctx.modelValue),
        itemKey: "id",
        gap: (12),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onReorder: (__VLS_ctx.reorder)
    };
    __VLS_2.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_2.slots;
        const [{ item, index, dragging, itemStyle }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sub-question-row sortable-grid" },
            ...{ class: ({ 'is-dragging': dragging }) },
            'data-sortable-index': (index),
            ...{ style: (itemStyle) },
        });
        /** @type {[typeof PerformanceDragHandle, ]} */ ;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent(PerformanceDragHandle, new PerformanceDragHandle({
            label: (`拖动第${index + 1}个子评估题`),
            dragging: (dragging),
        }));
        const __VLS_8 = __VLS_7({
            label: (`拖动第${index + 1}个子评估题`),
            dragging: (dragging),
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        /** @type {[typeof ReviewQuestionSubQuestionSelect, ]} */ ;
        // @ts-ignore
        const __VLS_10 = __VLS_asFunctionalComponent(ReviewQuestionSubQuestionSelect, new ReviewQuestionSubQuestionSelect({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "name-column" },
            modelValue: (item.question_id),
            options: (__VLS_ctx.options),
            loading: (__VLS_ctx.loading),
        }));
        const __VLS_11 = __VLS_10({
            ...{ 'onUpdate:modelValue': {} },
            ...{ class: "name-column" },
            modelValue: (item.question_id),
            options: (__VLS_ctx.options),
            loading: (__VLS_ctx.loading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_10));
        let __VLS_13;
        let __VLS_14;
        let __VLS_15;
        const __VLS_16 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!(!__VLS_ctx.isCondition))
                    return;
                __VLS_ctx.updateQuestion(index, $event);
            }
        };
        var __VLS_12;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "derived-cell rule-column" },
            'aria-label': "评估规则",
        });
        (__VLS_ctx.selectedOption(item.question_id)?.rule_name ?? '--');
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "derived-cell bounds-column" },
            'aria-label': "评分上下限",
        });
        (__VLS_ctx.scoreBounds(__VLS_ctx.selectedOption(item.question_id)));
        if (__VLS_ctx.showWeight) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "derived-cell weight-column" },
                'aria-label': "权重",
            });
        }
        /** @type {[typeof PerformanceIconButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
            ...{ 'onClick': {} },
            ...{ class: "delete-column" },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个子评估题`),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            ...{ class: "delete-column" },
            icon: "DeleteTrashOutlined",
            label: (`删除第${index + 1}个子评估题`),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isCondition))
                    return;
                __VLS_ctx.removeRow(index);
            }
        };
        var __VLS_19;
    }
    var __VLS_2;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-header condition-grid" },
        'aria-hidden': "true",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    for (const [row, index] of __VLS_getVForSourceType((__VLS_ctx.modelValue))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (row.id),
            ...{ class: "sub-question-row condition-grid" },
        });
        /** @type {[typeof ReviewQuestionSubQuestionSelect, ]} */ ;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent(ReviewQuestionSubQuestionSelect, new ReviewQuestionSubQuestionSelect({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (row.question_id),
            options: (__VLS_ctx.options),
            loading: (__VLS_ctx.loading),
        }));
        const __VLS_25 = __VLS_24({
            ...{ 'onUpdate:modelValue': {} },
            modelValue: (row.question_id),
            options: (__VLS_ctx.options),
            loading: (__VLS_ctx.loading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        let __VLS_27;
        let __VLS_28;
        let __VLS_29;
        const __VLS_30 = {
            'onUpdate:modelValue': (...[$event]) => {
                if (!!(!__VLS_ctx.isCondition))
                    return;
                __VLS_ctx.updateQuestion(index, $event);
            }
        };
        var __VLS_26;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "derived-cell" },
            'aria-label': "评估规则",
        });
        (__VLS_ctx.selectedOption(row.question_id)?.rule_name ?? '--');
    }
}
if (!__VLS_ctx.isCondition) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (__VLS_ctx.openPicker) },
        ...{ class: "new-sub-question" },
        type: "button",
        'data-action': "new-sub-question",
        'aria-expanded': (__VLS_ctx.pickerOpen),
    });
}
if (!__VLS_ctx.isCondition && __VLS_ctx.validationMessage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-validation" },
        role: "alert",
    });
    (__VLS_ctx.validationMessage);
}
if (!__VLS_ctx.isCondition && __VLS_ctx.pickerOpen) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: () => { } },
        ...{ class: "sub-question-picker" },
        role: "dialog",
        'aria-label': "子评估题选择",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-picker-search" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.input)({
        type: "search",
        placeholder: "通过子评估题名称搜索",
        'aria-label': "通过子评估题名称搜索",
    });
    (__VLS_ctx.pickerQuery);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-question-picker-options" },
        role: "listbox",
        'aria-label': "子评估题候选",
    });
    for (const [option] of __VLS_getVForSourceType((__VLS_ctx.filteredOptions))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(!__VLS_ctx.isCondition && __VLS_ctx.pickerOpen))
                        return;
                    __VLS_ctx.selectOption(option);
                } },
            key: (option.id),
            ...{ class: "sub-question-picker-option" },
            ...{ class: ({ selected: __VLS_ctx.selectedIds.has(option.id) }) },
            type: "button",
            role: "option",
            'aria-selected': (__VLS_ctx.selectedIds.has(option.id)),
            'data-cy': (option.id),
            'data-id': (option.id),
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "sub-question-picker-option-main" },
        });
        (option.name);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "sub-question-picker-option-summary" },
        });
        (option.score_min ?? '--');
        (option.score_max ?? '--');
        (option.rule_name);
        if (__VLS_ctx.selectedIds.has(option.id)) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ class: "sub-question-picker-option-check" },
                'aria-hidden': "true",
            });
        }
    }
    if (!__VLS_ctx.filteredOptions.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sub-question-picker-empty" },
        });
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.button, __VLS_intrinsicElements.button)({
        ...{ onClick: (...[$event]) => {
                if (!(!__VLS_ctx.isCondition && __VLS_ctx.pickerOpen))
                    return;
                __VLS_ctx.emit('create-sub-question');
            } },
        ...{ class: "sub-question-picker-create" },
        type: "button",
    });
}
/** @type {__VLS_StyleScopedClasses['sub-question-list']} */ ;
/** @type {__VLS_StyleScopedClasses['additional-label']} */ ;
/** @type {__VLS_StyleScopedClasses['required-mark']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-header']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['name-column']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-column']} */ ;
/** @type {__VLS_StyleScopedClasses['bounds-column']} */ ;
/** @type {__VLS_StyleScopedClasses['weight-column']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['sortable-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['name-column']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['rule-column']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['bounds-column']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['weight-column']} */ ;
/** @type {__VLS_StyleScopedClasses['delete-column']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-header']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-row']} */ ;
/** @type {__VLS_StyleScopedClasses['condition-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['derived-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['new-sub-question']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-validation']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-search']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-options']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option-main']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-option-check']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-empty']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-question-picker-create']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceDragHandle: PerformanceDragHandle,
            PerformanceIconButton: PerformanceIconButton,
            PerformanceSortableList: PerformanceSortableList,
            ReviewQuestionSubQuestionSelect: ReviewQuestionSubQuestionSelect,
            emit: emit,
            pickerOpen: pickerOpen,
            pickerQuery: pickerQuery,
            rootRef: rootRef,
            isCondition: isCondition,
            showWeight: showWeight,
            filteredOptions: filteredOptions,
            selectedIds: selectedIds,
            selectedOption: selectedOption,
            updateQuestion: updateQuestion,
            openPicker: openPicker,
            selectOption: selectOption,
            removeRow: removeRow,
            reorder: reorder,
            scoreBounds: scoreBounds,
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
