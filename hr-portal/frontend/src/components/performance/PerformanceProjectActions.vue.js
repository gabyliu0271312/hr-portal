/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import PerformancePermissionButton from './PerformancePermissionButton.vue';
const props = defineProps();
const emit = defineEmits();
const menuOpen = ref(false);
function run(action) {
    menuOpen.value = false;
    if (action === 'edit')
        emit('edit');
    else if (action === 'start')
        emit('start');
    else if (action === 'copy')
        emit('copy');
    else
        emit('remove');
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['project-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['project-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['more-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['more-menu']} */ ;
/** @type {__VLS_StyleScopedClasses['more-menu']} */ ;
// CSS variable injection 
// CSS variable injection end 
if (props.canManage) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onMouseleave: (...[$event]) => {
                if (!(props.canManage))
                    return;
                __VLS_ctx.menuOpen = false;
            } },
        ...{ class: "project-actions" },
    });
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        'aria-label': (`编辑${props.projectName}`),
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        'aria-label': (`编辑${props.projectName}`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onClick: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.run('edit');
        }
    };
    __VLS_2.slots.default;
    var __VLS_2;
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        disabled: (props.started),
        'aria-label': (`启动${props.projectName}`),
    }));
    const __VLS_8 = __VLS_7({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        disabled: (props.started),
        'aria-label': (`启动${props.projectName}`),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    let __VLS_10;
    let __VLS_11;
    let __VLS_12;
    const __VLS_13 = {
        onClick: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.run('start');
        }
    };
    __VLS_9.slots.default;
    var __VLS_9;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "more-wrap" },
    });
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        ...{ 'onFocus': {} },
        op: "V",
        allowed: (props.canManage),
        ...{ class: "more-action" },
        'aria-label': "更多项目操作",
        'aria-expanded': (__VLS_ctx.menuOpen),
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onClick': {} },
        ...{ 'onFocus': {} },
        op: "V",
        allowed: (props.canManage),
        ...{ class: "more-action" },
        'aria-label': "更多项目操作",
        'aria-expanded': (__VLS_ctx.menuOpen),
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_17;
    let __VLS_18;
    let __VLS_19;
    const __VLS_20 = {
        onClick: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.menuOpen = !__VLS_ctx.menuOpen;
        }
    };
    const __VLS_21 = {
        onFocus: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.menuOpen = true;
        }
    };
    __VLS_16.slots.default;
    var __VLS_16;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: () => { } },
        ...{ class: "more-menu" },
        role: "menu",
    });
    __VLS_asFunctionalDirective(__VLS_directives.vShow)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.menuOpen) }, null, null);
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        'aria-label': "复制项目",
    }));
    const __VLS_23 = __VLS_22({
        ...{ 'onClick': {} },
        op: "U",
        allowed: (props.canManage),
        'aria-label': "复制项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    let __VLS_25;
    let __VLS_26;
    let __VLS_27;
    const __VLS_28 = {
        onClick: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.run('copy');
        }
    };
    __VLS_24.slots.default;
    var __VLS_24;
    /** @type {[typeof PerformancePermissionButton, typeof PerformancePermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(PerformancePermissionButton, new PerformancePermissionButton({
        ...{ 'onClick': {} },
        op: "D",
        allowed: (props.canManage),
        disabled: (props.started),
        danger: true,
        'aria-label': "删除项目",
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        op: "D",
        allowed: (props.canManage),
        disabled: (props.started),
        danger: true,
        'aria-label': "删除项目",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (...[$event]) => {
            if (!(props.canManage))
                return;
            __VLS_ctx.run('remove');
        }
    };
    __VLS_31.slots.default;
    var __VLS_31;
}
/** @type {__VLS_StyleScopedClasses['project-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['more-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['more-action']} */ ;
/** @type {__VLS_StyleScopedClasses['more-menu']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformancePermissionButton: PerformancePermissionButton,
            menuOpen: menuOpen,
            run: run,
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
