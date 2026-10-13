/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import PerformanceIconButton from './PerformanceIconButton.vue';
const __VLS_props = defineProps();
const __VLS_emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['performance-icon-button']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onPointerdown: () => { } },
        ...{ class: "configured-card-action-toolbar" },
        role: "toolbar",
        'aria-label': "卡片操作",
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "configured-card-action-toolbar__surface captured-actions" },
    });
    /** @type {[typeof PerformanceIconButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
        ...{ 'onClick': {} },
        icon: "SpaceUpOutlined",
        label: "Move up",
        disabled: (__VLS_ctx.index === 0),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onClick': {} },
        icon: "SpaceUpOutlined",
        label: "Move up",
        disabled: (__VLS_ctx.index === 0),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.visible))
                return;
            __VLS_ctx.$emit('move-up');
        }
    };
    var __VLS_2;
    /** @type {[typeof PerformanceIconButton, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
        ...{ 'onClick': {} },
        icon: "SpaceDownOutlined",
        label: "Move down",
        disabled: (__VLS_ctx.index === __VLS_ctx.count - 1),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onClick': {} },
        icon: "SpaceDownOutlined",
        label: "Move down",
        disabled: (__VLS_ctx.index === __VLS_ctx.count - 1),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.visible))
                return;
            __VLS_ctx.$emit('move-down');
        }
    };
    var __VLS_9;
    /** @type {[typeof PerformanceIconButton, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
        ...{ 'onClick': {} },
        icon: "EditOutlined",
        label: "Edit content",
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onClick': {} },
        icon: "EditOutlined",
        label: "Edit content",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_17;
    let __VLS_18;
    let __VLS_19;
    const __VLS_20 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.visible))
                return;
            __VLS_ctx.$emit('edit');
        }
    };
    var __VLS_16;
    /** @type {[typeof PerformanceIconButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(PerformanceIconButton, new PerformanceIconButton({
        ...{ 'onClick': {} },
        icon: "DeleteTrashOutlined",
        label: "Delete content",
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        icon: "DeleteTrashOutlined",
        label: "Delete content",
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.visible))
                return;
            __VLS_ctx.$emit('delete');
        }
    };
    var __VLS_23;
}
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['configured-card-action-toolbar__surface']} */ ;
/** @type {__VLS_StyleScopedClasses['captured-actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceIconButton: PerformanceIconButton,
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
