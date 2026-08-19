/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
const __VLS_props = defineProps();
const emit = defineEmits();
const paperRef = ref(null);
const original = ref('');
function setHtml(html) {
    if (paperRef.value)
        paperRef.value.innerHTML = html;
    original.value = html;
    emit('dirty', false);
}
function getHtml() {
    return paperRef.value?.innerHTML ?? '';
}
function onInput() {
    emit('dirty', (paperRef.value?.innerHTML ?? '') !== original.value);
}
const __VLS_exposed = { setHtml, getHtml };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "doc-paper-wrap" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ onInput: (__VLS_ctx.onInput) },
    ref: "paperRef",
    ...{ class: "doc-paper" },
    contenteditable: "true",
    spellcheck: "false",
});
/** @type {typeof __VLS_ctx.paperRef} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['doc-paper']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            paperRef: paperRef,
            onInput: onInput,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
    __typeEmits: {},
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
