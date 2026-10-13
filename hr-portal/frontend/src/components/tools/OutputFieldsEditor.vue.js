/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const dragging = ref('');
// 空清单 = 全部输出；非空 = 严格按清单（过滤已删除字段）
const isAll = computed(() => props.modelValue.length === 0);
const outputFields = computed(() => {
    if (isAll.value)
        return [...props.candidates];
    return props.modelValue.filter((f) => props.candidates.includes(f));
});
const hiddenFields = computed(() => {
    if (isAll.value)
        return [];
    return props.candidates.filter((f) => !outputFields.value.includes(f));
});
function fieldLabel(field) {
    return props.labels?.[field] || field;
}
function hideField(f) {
    if (isAll.value) {
        // 首次移除：从「全部输出」固化为「自定义清单」
        emit('update:modelValue', props.candidates.filter((x) => x !== f));
    }
    else {
        emit('update:modelValue', outputFields.value.filter((x) => x !== f));
    }
}
function restoreField(f) {
    emit('update:modelValue', [...outputFields.value, f]);
}
function resetAll() {
    emit('update:modelValue', []);
}
function reorder(code, target) {
    if (!code || !target || code === target)
        return;
    const next = [...outputFields.value];
    const from = next.indexOf(code);
    const to = next.indexOf(target);
    if (from < 0 || to < 0)
        return;
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    emit('update:modelValue', next);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "output-fields" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ class: "of-hint" },
});
if (__VLS_ctx.isAll) {
}
else {
}
if (!__VLS_ctx.isAll) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "of-actions" },
    });
    const __VLS_0 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClick: (__VLS_ctx.resetAll)
    };
    __VLS_3.slots.default;
    var __VLS_3;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "of-tags" },
});
for (const [f] of __VLS_getVForSourceType((__VLS_ctx.outputFields))) {
    const __VLS_8 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ 'onClose': {} },
        ...{ 'onDragstart': {} },
        ...{ 'onDragend': {} },
        ...{ 'onDragover': {} },
        ...{ 'onDrop': {} },
        key: (f),
        closable: true,
        ...{ class: "of-tag" },
        draggable: "true",
    }));
    const __VLS_10 = __VLS_9({
        ...{ 'onClose': {} },
        ...{ 'onDragstart': {} },
        ...{ 'onDragend': {} },
        ...{ 'onDragover': {} },
        ...{ 'onDrop': {} },
        key: (f),
        closable: true,
        ...{ class: "of-tag" },
        draggable: "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    let __VLS_12;
    let __VLS_13;
    let __VLS_14;
    const __VLS_15 = {
        onClose: (...[$event]) => {
            __VLS_ctx.hideField(f);
        }
    };
    const __VLS_16 = {
        onDragstart: (...[$event]) => {
            __VLS_ctx.dragging = f;
        }
    };
    const __VLS_17 = {
        onDragend: (...[$event]) => {
            __VLS_ctx.dragging = '';
        }
    };
    const __VLS_18 = {
        onDragover: () => { }
    };
    const __VLS_19 = {
        onDrop: (...[$event]) => {
            __VLS_ctx.reorder(__VLS_ctx.dragging, f);
            __VLS_ctx.dragging = '';
        }
    };
    __VLS_11.slots.default;
    (__VLS_ctx.fieldLabel(f));
    var __VLS_11;
}
for (const [f] of __VLS_getVForSourceType((__VLS_ctx.hiddenFields))) {
    const __VLS_20 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        key: ('hidden-' + f),
        ...{ class: "of-tag-hidden" },
        title: "点击恢复输出",
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        key: ('hidden-' + f),
        ...{ class: "of-tag-hidden" },
        title: "点击恢复输出",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            __VLS_ctx.restoreField(f);
        }
    };
    __VLS_23.slots.default;
    (__VLS_ctx.fieldLabel(f));
    var __VLS_23;
}
if (__VLS_ctx.hiddenFields.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
        ...{ class: "of-hidden-hint" },
    });
}
/** @type {__VLS_StyleScopedClasses['output-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['of-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['of-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['of-tags']} */ ;
/** @type {__VLS_StyleScopedClasses['of-tag']} */ ;
/** @type {__VLS_StyleScopedClasses['of-tag-hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['of-hidden-hint']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            dragging: dragging,
            isAll: isAll,
            outputFields: outputFields,
            hiddenFields: hiddenFields,
            fieldLabel: fieldLabel,
            hideField: hideField,
            restoreField: restoreField,
            resetAll: resetAll,
            reorder: reorder,
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
