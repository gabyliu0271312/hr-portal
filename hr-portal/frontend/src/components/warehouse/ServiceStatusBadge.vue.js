/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const STATUS_MAP = {
    draft: { label: '草稿', type: 'info' },
    enabled: { label: '已启用', type: 'success' },
    disabled: { label: '已停用', type: 'warning' },
    error: { label: '异常', type: 'danger' },
    paused: { label: '已暂停', type: 'warning' },
    expired: { label: '已过期', type: 'info' },
    success: { label: '成功', type: 'success' },
    failed: { label: '失败', type: 'danger' },
    partial: { label: '部分成功', type: 'warning' },
    pending: { label: '待执行', type: 'info' },
};
const info = computed(() => STATUS_MAP[props.status] || { label: props.status, type: 'info' });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
const __VLS_0 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: (__VLS_ctx.info.type),
    size: "small",
}));
const __VLS_2 = __VLS_1({
    type: (__VLS_ctx.info.type),
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
(__VLS_ctx.info.label);
var __VLS_3;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            info: info,
        };
    },
    __typeProps: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeProps: {},
});
; /* PartiallyEnd: #4569/main.vue */
