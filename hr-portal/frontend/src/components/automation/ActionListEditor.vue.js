/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref } from 'vue';
import { Delete, Plus } from '@element-plus/icons-vue';
import FeishuMessageActionConfig from './FeishuMessageActionConfig.vue';
import { Promotion } from '@element-plus/icons-vue';
debugger; /* PartiallyEnd: #3632/both.vue */
export default await (async () => {
    const props = defineProps();
    const emit = defineEmits();
    const expandedIndex = ref(null);
    function addAction() {
        const newActions = [...props.modelValue, {
                type: 'feishu_send_message',
                name: '发送飞书消息',
                enabled: true,
                config: {
                    receivers: [],
                    message: {
                        message_format: 'markdown',
                        title_template: '',
                        content_template: '{{trigger_event.event_type}} 事件触发',
                        resources: [],
                    },
                    require_completion: false,
                },
            }];
        expandedIndex.value = newActions.length - 1;
        emit('update:modelValue', newActions);
    }
    function removeAction(index) {
        const newActions = [...props.modelValue];
        newActions.splice(index, 1);
        if (expandedIndex.value === index)
            expandedIndex.value = null;
        emit('update:modelValue', newActions);
    }
    function updateAction(index, updated) {
        const newActions = [...props.modelValue];
        newActions[index] = updated;
        emit('update:modelValue', newActions);
    }
    debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
    const __VLS_ctx = {};
    let __VLS_components;
    let __VLS_directives;
    /** @type {__VLS_StyleScopedClasses['action-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-chevron']} */ ;
    // CSS variable injection 
    // CSS variable injection end 
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "action-list-editor" },
    });
    if (__VLS_ctx.modelValue.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-actions" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "empty-icon-wrap" },
        });
        const __VLS_0 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
            ...{ class: "empty-icon" },
        }));
        const __VLS_2 = __VLS_1({
            ...{ class: "empty-icon" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        __VLS_3.slots.default;
        const __VLS_4 = {}.Promotion;
        /** @type {[typeof __VLS_components.Promotion, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({}));
        const __VLS_6 = __VLS_5({}, ...__VLS_functionalComponentArgsRest(__VLS_5));
        var __VLS_3;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty-text" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
            ...{ class: "empty-hint" },
        });
    }
    for (const [action, idx] of __VLS_getVForSourceType((__VLS_ctx.modelValue))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (idx),
            ...{ class: "action-item" },
            ...{ class: ({ expanded: __VLS_ctx.expandedIndex === idx }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    __VLS_ctx.expandedIndex === idx ? __VLS_ctx.expandedIndex = null : __VLS_ctx.expandedIndex = idx;
                } },
            ...{ class: "action-header" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-header-left" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "action-chevron" },
            ...{ class: ({ rotated: __VLS_ctx.expandedIndex === idx }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-name" },
        });
        (idx + 1);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "action-meta" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        ((action.config?.receivers || []).length);
        const __VLS_8 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
            text: true,
            icon: (__VLS_ctx.Delete),
        }));
        const __VLS_10 = __VLS_9({
            ...{ 'onClick': {} },
            size: "small",
            type: "danger",
            text: true,
            icon: (__VLS_ctx.Delete),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        let __VLS_12;
        let __VLS_13;
        let __VLS_14;
        const __VLS_15 = {
            onClick: (...[$event]) => {
                __VLS_ctx.removeAction(idx);
            }
        };
        var __VLS_11;
        if (__VLS_ctx.expandedIndex === idx) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "action-editor" },
            });
            /** @type {[typeof FeishuMessageActionConfig, ]} */ ;
            // @ts-ignore
            const __VLS_16 = __VLS_asFunctionalComponent(FeishuMessageActionConfig, new FeishuMessageActionConfig({
                ...{ 'onUpdate:config': {} },
                config: (action.config),
            }));
            const __VLS_17 = __VLS_16({
                ...{ 'onUpdate:config': {} },
                config: (action.config),
            }, ...__VLS_functionalComponentArgsRest(__VLS_16));
            let __VLS_19;
            let __VLS_20;
            let __VLS_21;
            const __VLS_22 = {
                'onUpdate:config': (...[$event]) => {
                    if (!(__VLS_ctx.expandedIndex === idx))
                        return;
                    __VLS_ctx.updateAction(idx, { ...action, config: $event });
                }
            };
            var __VLS_18;
        }
    }
    const __VLS_23 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Plus),
        ...{ class: "add-action-btn" },
    }));
    const __VLS_25 = __VLS_24({
        ...{ 'onClick': {} },
        icon: (__VLS_ctx.Plus),
        ...{ class: "add-action-btn" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    let __VLS_27;
    let __VLS_28;
    let __VLS_29;
    const __VLS_30 = {
        onClick: (__VLS_ctx.addAction)
    };
    __VLS_26.slots.default;
    var __VLS_26;
    /** @type {__VLS_StyleScopedClasses['action-list-editor']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty-actions']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty-icon-wrap']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty-icon']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['empty-hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-header']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-header-left']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-chevron']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-name']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-meta']} */ ;
    /** @type {__VLS_StyleScopedClasses['action-editor']} */ ;
    /** @type {__VLS_StyleScopedClasses['add-action-btn']} */ ;
    var __VLS_dollars;
    const __VLS_self = (await import('vue')).defineComponent({
        setup() {
            return {
                Delete: Delete,
                Plus: Plus,
                FeishuMessageActionConfig: FeishuMessageActionConfig,
                expandedIndex: expandedIndex,
                addAction: addAction,
                removeAction: removeAction,
                updateAction: updateAction,
                Promotion: Promotion,
            };
        },
        __typeEmits: {},
        __typeProps: {},
    });
    return (await import('vue')).defineComponent({
        setup() {
            return {};
        },
        __typeEmits: {},
        __typeProps: {},
    });
})(); /* PartiallyEnd: #4569/main.vue */
