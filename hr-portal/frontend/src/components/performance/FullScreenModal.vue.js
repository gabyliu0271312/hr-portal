import FixedActionBar from './FixedActionBar.vue';
import PageHeader from './PageHeader.vue';
const __VLS_props = withDefaults(defineProps(), {
    showFooter: true,
    submitting: false,
});
const emit = defineEmits();
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    showFooter: true,
    submitting: false,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "full-screen-modal" },
});
/** @type {[typeof PageHeader, typeof PageHeader, ]} */ ;
// @ts-ignore
const __VLS_0 = __VLS_asFunctionalComponent(PageHeader, new PageHeader({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.title),
}));
const __VLS_1 = __VLS_0({
    ...{ 'onBack': {} },
    title: (__VLS_ctx.title),
}, ...__VLS_functionalComponentArgsRest(__VLS_0));
let __VLS_3;
let __VLS_4;
let __VLS_5;
const __VLS_6 = {
    onBack: (...[$event]) => {
        __VLS_ctx.emit('back');
    }
};
__VLS_2.slots.default;
{
    const { subtitle: __VLS_thisSlot } = __VLS_2.slots;
    var __VLS_7 = {};
}
{
    const { actions: __VLS_thisSlot } = __VLS_2.slots;
    var __VLS_9 = {};
}
var __VLS_2;
__VLS_asFunctionalElement(__VLS_intrinsicElements.main, __VLS_intrinsicElements.main)({
    ...{ class: "full-screen-modal-content" },
});
var __VLS_11 = {};
if (__VLS_ctx.showFooter) {
    /** @type {[typeof FixedActionBar, typeof FixedActionBar, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(FixedActionBar, new FixedActionBar({
        ...{ 'onSubmit': {} },
        ...{ 'onPreview': {} },
        ...{ 'onCancel': {} },
        submitting: (__VLS_ctx.submitting),
    }));
    const __VLS_14 = __VLS_13({
        ...{ 'onSubmit': {} },
        ...{ 'onPreview': {} },
        ...{ 'onCancel': {} },
        submitting: (__VLS_ctx.submitting),
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    let __VLS_16;
    let __VLS_17;
    let __VLS_18;
    const __VLS_19 = {
        onSubmit: (...[$event]) => {
            if (!(__VLS_ctx.showFooter))
                return;
            __VLS_ctx.emit('submit');
        }
    };
    const __VLS_20 = {
        onPreview: (...[$event]) => {
            if (!(__VLS_ctx.showFooter))
                return;
            __VLS_ctx.emit('preview');
        }
    };
    const __VLS_21 = {
        onCancel: (...[$event]) => {
            if (!(__VLS_ctx.showFooter))
                return;
            __VLS_ctx.emit('cancel');
        }
    };
    __VLS_15.slots.default;
    if (__VLS_ctx.$slots.footer) {
        {
            const { default: __VLS_thisSlot } = __VLS_15.slots;
            var __VLS_22 = {};
        }
    }
    var __VLS_15;
}
/** @type {__VLS_StyleScopedClasses['full-screen-modal']} */ ;
/** @type {__VLS_StyleScopedClasses['full-screen-modal-content']} */ ;
// @ts-ignore
var __VLS_8 = __VLS_7, __VLS_10 = __VLS_9, __VLS_12 = __VLS_11, __VLS_23 = __VLS_22;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            FixedActionBar: FixedActionBar,
            PageHeader: PageHeader,
            emit: emit,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_component = (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
; /* PartiallyEnd: #4569/main.vue */
