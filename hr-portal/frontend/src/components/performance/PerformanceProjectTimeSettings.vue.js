/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, watch } from 'vue';
import PerformanceDateTimeField from './PerformanceDateTimeField.vue';
import PerformanceWorkflowStageIcon from '@/views/performance/PerformanceWorkflowStageIcon.vue';
const props = withDefaults(defineProps(), { modelValue: () => ({}), loading: false, error: '' });
const emit = defineEmits();
const draft = ref(cloneTimes(props.modelValue));
const lastEmitted = ref(JSON.stringify(draft.value));
function cloneTimes(value) { return JSON.parse(JSON.stringify(value || {})); }
function nodeKey(node) { return node.node_id || `${node.node_type}-${node.order}`; }
function defaultTime(node) {
    return { start_at: '', end_at: '', appeal_deadline: node.node_type === 'result_view' ? '' : undefined };
}
function ensureNode(node) {
    const key = nodeKey(node);
    if (!draft.value[key])
        draft.value[key] = defaultTime(node);
    const value = draft.value[key];
    value.start_at ??= '';
    value.end_at ??= '';
    if (node.node_type === 'result_view')
        value.appeal_deadline ??= '';
}
function ensureAllNodes() { props.nodes.forEach(ensureNode); }
function timeFor(node) { ensureNode(node); return draft.value[nodeKey(node)]; }
watch(() => props.nodes, ensureAllNodes, { deep: true, immediate: true });
watch(() => props.modelValue, value => { const next = JSON.stringify(value || {}); if (next !== lastEmitted.value) {
    draft.value = cloneTimes(value);
    ensureAllNodes();
    lastEmitted.value = JSON.stringify(draft.value);
} }, { deep: true });
watch(draft, value => { const next = JSON.stringify(value); if (next === lastEmitted.value)
    return; lastEmitted.value = next; emit('update:modelValue', cloneTimes(value)); }, { deep: true });
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({ modelValue: () => ({}), loading: false, error: '' });
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['time-node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['time-node-header']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields--result-view']} */ ;
/** @type {__VLS_StyleScopedClasses['time-node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "project-time-settings" },
    'aria-label': "起止时间",
});
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "time-state" },
        role: "status",
    });
}
else if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "time-state time-state--error" },
        role: "alert",
    });
    (__VLS_ctx.error);
}
else if (!__VLS_ctx.nodes.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "time-state" },
    });
}
else {
    for (const [node] of __VLS_getVForSourceType((__VLS_ctx.nodes))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.article, __VLS_intrinsicElements.article)({
            key: (__VLS_ctx.nodeKey(node)),
            ...{ class: "time-node-card" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.header, __VLS_intrinsicElements.header)({
            ...{ class: "time-node-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "time-node-icon" },
            'aria-hidden': "true",
        });
        /** @type {[typeof PerformanceWorkflowStageIcon, ]} */ ;
        // @ts-ignore
        const __VLS_0 = __VLS_asFunctionalComponent(PerformanceWorkflowStageIcon, new PerformanceWorkflowStageIcon({
            type: (node.node_type),
        }));
        const __VLS_1 = __VLS_0({
            type: (node.node_type),
        }, ...__VLS_functionalComponentArgsRest(__VLS_0));
        __VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({});
        (node.name);
        if (node.node_type === 'result_view') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "time-fields time-fields--result-view" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            /** @type {[typeof PerformanceDateTimeField, ]} */ ;
            // @ts-ignore
            const __VLS_3 = __VLS_asFunctionalComponent(PerformanceDateTimeField, new PerformanceDateTimeField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).start_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-start`),
                required: true,
            }));
            const __VLS_4 = __VLS_3({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).start_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-start`),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_3));
            let __VLS_6;
            let __VLS_7;
            let __VLS_8;
            const __VLS_9 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!(node.node_type === 'result_view'))
                        return;
                    __VLS_ctx.timeFor(node).start_at = $event;
                }
            };
            var __VLS_5;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
                ...{ class: "time-help" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            /** @type {[typeof PerformanceDateTimeField, ]} */ ;
            // @ts-ignore
            const __VLS_10 = __VLS_asFunctionalComponent(PerformanceDateTimeField, new PerformanceDateTimeField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).appeal_deadline || ''),
                inputId: (`${__VLS_ctx.nodeKey(node)}-appeal-deadline`),
                required: true,
            }));
            const __VLS_11 = __VLS_10({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).appeal_deadline || ''),
                inputId: (`${__VLS_ctx.nodeKey(node)}-appeal-deadline`),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_10));
            let __VLS_13;
            let __VLS_14;
            let __VLS_15;
            const __VLS_16 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!(node.node_type === 'result_view'))
                        return;
                    __VLS_ctx.timeFor(node).appeal_deadline = $event;
                }
            };
            var __VLS_12;
        }
        else if (node.node_type === 'result_reconsideration') {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "time-fields time-fields--single" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            /** @type {[typeof PerformanceDateTimeField, ]} */ ;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent(PerformanceDateTimeField, new PerformanceDateTimeField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).end_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-end`),
                required: true,
            }));
            const __VLS_18 = __VLS_17({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).end_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-end`),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            let __VLS_20;
            let __VLS_21;
            let __VLS_22;
            const __VLS_23 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'result_view'))
                        return;
                    if (!(node.node_type === 'result_reconsideration'))
                        return;
                    __VLS_ctx.timeFor(node).end_at = $event;
                }
            };
            var __VLS_19;
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "time-fields" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            /** @type {[typeof PerformanceDateTimeField, ]} */ ;
            // @ts-ignore
            const __VLS_24 = __VLS_asFunctionalComponent(PerformanceDateTimeField, new PerformanceDateTimeField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).start_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-start`),
                required: true,
            }));
            const __VLS_25 = __VLS_24({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).start_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-start`),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_24));
            let __VLS_27;
            let __VLS_28;
            let __VLS_29;
            const __VLS_30 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'result_view'))
                        return;
                    if (!!(node.node_type === 'result_reconsideration'))
                        return;
                    __VLS_ctx.timeFor(node).start_at = $event;
                }
            };
            var __VLS_26;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.label, __VLS_intrinsicElements.label)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            __VLS_asFunctionalElement(__VLS_intrinsicElements.i, __VLS_intrinsicElements.i)({});
            /** @type {[typeof PerformanceDateTimeField, ]} */ ;
            // @ts-ignore
            const __VLS_31 = __VLS_asFunctionalComponent(PerformanceDateTimeField, new PerformanceDateTimeField({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).end_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-end`),
                required: true,
            }));
            const __VLS_32 = __VLS_31({
                ...{ 'onUpdate:modelValue': {} },
                modelValue: (__VLS_ctx.timeFor(node).end_at),
                inputId: (`${__VLS_ctx.nodeKey(node)}-end`),
                required: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_31));
            let __VLS_34;
            let __VLS_35;
            let __VLS_36;
            const __VLS_37 = {
                'onUpdate:modelValue': (...[$event]) => {
                    if (!!(__VLS_ctx.loading))
                        return;
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.nodes.length))
                        return;
                    if (!!(node.node_type === 'result_view'))
                        return;
                    if (!!(node.node_type === 'result_reconsideration'))
                        return;
                    __VLS_ctx.timeFor(node).end_at = $event;
                }
            };
            var __VLS_33;
        }
    }
}
/** @type {__VLS_StyleScopedClasses['project-time-settings']} */ ;
/** @type {__VLS_StyleScopedClasses['time-state']} */ ;
/** @type {__VLS_StyleScopedClasses['time-state']} */ ;
/** @type {__VLS_StyleScopedClasses['time-state--error']} */ ;
/** @type {__VLS_StyleScopedClasses['time-state']} */ ;
/** @type {__VLS_StyleScopedClasses['time-node-card']} */ ;
/** @type {__VLS_StyleScopedClasses['time-node-header']} */ ;
/** @type {__VLS_StyleScopedClasses['time-node-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields--result-view']} */ ;
/** @type {__VLS_StyleScopedClasses['time-help']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields--single']} */ ;
/** @type {__VLS_StyleScopedClasses['time-fields']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            PerformanceDateTimeField: PerformanceDateTimeField,
            PerformanceWorkflowStageIcon: PerformanceWorkflowStageIcon,
            nodeKey: nodeKey,
            timeFor: timeFor,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
