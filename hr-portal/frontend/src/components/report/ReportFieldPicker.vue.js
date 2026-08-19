/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
/** 所有字段始终可选（Track B：支持重复选择） */
const availableColumns = computed(() => props.allColumns);
/** 最大后缀+1 生成下一个 instance_id */
function nextInstanceId(sourceCode) {
    const suffixes = [];
    for (const id of props.selectedCodes) {
        if (id === sourceCode) {
            suffixes.push(1);
        }
        else if (id.startsWith(sourceCode + '#')) {
            const n = Number(id.split('#').pop());
            if (!isNaN(n))
                suffixes.push(n);
        }
    }
    const next = Math.max(0, ...suffixes, 0) + 1;
    return next === 1 ? sourceCode : `${sourceCode}#${next}`;
}
function toggleColumn(sourceCode) {
    const next = [...props.selectedCodes];
    next.push(nextInstanceId(sourceCode));
    emit('update:selectedCodes', next);
}
function removeAt(index) {
    const next = [...props.selectedCodes];
    next.splice(index, 1);
    emit('update:selectedCodes', next);
}
function moveAt(index, dir) {
    const next = [...props.selectedCodes];
    const j = index + dir;
    if (j < 0 || j >= next.length)
        return;
    [next[index], next[j]] = [next[j], next[index]];
    emit('update:selectedCodes', next);
}
/** instance_id → 显示名 */
function instanceLabel(instanceId) {
    const base = instanceId.replace(/#\d+$/, '');
    const col = props.allColumns.find(c => c.code === base);
    const baseLabel = col?.label ?? base;
    if (instanceId === base)
        return baseLabel;
    const n = instanceId.split('#').pop();
    return `${baseLabel} (${n})`;
}
/** 全选：仅选中当前未出现的 source_code（避免重复全选产生大量重复） */
function selectAll() {
    const existingSources = new Set(props.selectedCodes.map(id => id.replace(/#\d+$/, '')));
    const next = [...props.selectedCodes];
    for (const c of props.allColumns) {
        if (c.is_visible && !existingSources.has(c.code)) {
            next.push(c.code);
        }
    }
    emit('update:selectedCodes', next);
}
function clearAll() {
    emit('update:selectedCodes', []);
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['col-item']} */ ;
/** @type {__VLS_StyleScopedClasses['col-item--selected']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "columns-picker" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "picker-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.availableColumns.length);
const __VLS_0 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    link: true,
    size: "small",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    link: true,
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_4;
let __VLS_5;
let __VLS_6;
const __VLS_7 = {
    onClick: (__VLS_ctx.selectAll)
};
__VLS_3.slots.default;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-body" },
});
for (const [c] of __VLS_getVForSourceType((__VLS_ctx.availableColumns))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.toggleColumn(c.code);
            } },
        key: (c.code),
        ...{ class: "col-item" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (c.label);
    if (c.is_pk_part) {
        const __VLS_8 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            size: "small",
            type: "primary",
            effect: "plain",
        }));
        const __VLS_10 = __VLS_9({
            size: "small",
            type: "primary",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        var __VLS_11;
    }
    if (c.is_sensitive) {
        const __VLS_12 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            size: "small",
            type: "danger",
            effect: "plain",
        }));
        const __VLS_14 = __VLS_13({
            size: "small",
            type: "danger",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        var __VLS_15;
    }
    if (!c.is_visible) {
        const __VLS_16 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            size: "small",
            type: "info",
            effect: "plain",
        }));
        const __VLS_18 = __VLS_17({
            size: "small",
            type: "info",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        __VLS_19.slots.default;
        var __VLS_19;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (c.code);
}
if (!__VLS_ctx.availableColumns.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-tip" },
    });
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "picker-pane" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-head" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
(__VLS_ctx.selectedCodes.length);
const __VLS_20 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    link: true,
    size: "small",
    disabled: (!__VLS_ctx.selectedCodes.length),
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    link: true,
    size: "small",
    disabled: (!__VLS_ctx.selectedCodes.length),
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (__VLS_ctx.clearAll)
};
__VLS_23.slots.default;
var __VLS_23;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "pane-body" },
});
for (const [id, i] of __VLS_getVForSourceType((__VLS_ctx.selectedCodes))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (id),
        ...{ class: "col-item col-item--selected" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "order-num" },
    });
    (i + 1);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
    (__VLS_ctx.instanceLabel(id));
    if (__VLS_ctx.allColumns.find(c => c.code === id.replace(/#\d+$/, ''))?.is_sensitive) {
        const __VLS_28 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
            size: "small",
            type: "danger",
            effect: "plain",
        }));
        const __VLS_30 = __VLS_29({
            size: "small",
            type: "danger",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_29));
        __VLS_31.slots.default;
        var __VLS_31;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_32 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        disabled: (i === 0),
    }));
    const __VLS_34 = __VLS_33({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        disabled: (i === 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    let __VLS_36;
    let __VLS_37;
    let __VLS_38;
    const __VLS_39 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveAt(i, -1);
        }
    };
    __VLS_35.slots.default;
    var __VLS_35;
    const __VLS_40 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        disabled: (i === __VLS_ctx.selectedCodes.length - 1),
    }));
    const __VLS_42 = __VLS_41({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        disabled: (i === __VLS_ctx.selectedCodes.length - 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_41));
    let __VLS_44;
    let __VLS_45;
    let __VLS_46;
    const __VLS_47 = {
        onClick: (...[$event]) => {
            __VLS_ctx.moveAt(i, 1);
        }
    };
    __VLS_43.slots.default;
    var __VLS_43;
    const __VLS_48 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }));
    const __VLS_50 = __VLS_49({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
    let __VLS_52;
    let __VLS_53;
    let __VLS_54;
    const __VLS_55 = {
        onClick: (...[$event]) => {
            __VLS_ctx.removeAt(i);
        }
    };
    __VLS_51.slots.default;
    var __VLS_51;
}
if (!__VLS_ctx.selectedCodes.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "empty-tip" },
    });
}
/** @type {__VLS_StyleScopedClasses['columns-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-head']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-body']} */ ;
/** @type {__VLS_StyleScopedClasses['col-item']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
/** @type {__VLS_StyleScopedClasses['picker-pane']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-head']} */ ;
/** @type {__VLS_StyleScopedClasses['pane-body']} */ ;
/** @type {__VLS_StyleScopedClasses['col-item']} */ ;
/** @type {__VLS_StyleScopedClasses['col-item--selected']} */ ;
/** @type {__VLS_StyleScopedClasses['order-num']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-tip']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            availableColumns: availableColumns,
            toggleColumn: toggleColumn,
            removeAt: removeAt,
            moveAt: moveAt,
            instanceLabel: instanceLabel,
            selectAll: selectAll,
            clearAll: clearAll,
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
