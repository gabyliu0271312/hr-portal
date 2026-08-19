/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed } from 'vue';
import { useUserStore } from '@/stores/user';
const props = defineProps();
const emit = defineEmits();
const userStore = useUserStore();
const canUpdate = computed(() => userStore.hasOp('data.view', 'U'));
const canDelete = computed(() => userStore.hasOp('data.view', 'D'));
// 操作条整体可见条件：勾选了行 且 至少有一个按钮可显示
const visible = computed(() => props.selectedRows.length > 0 && ((!!props.statusCol && canUpdate.value) || canDelete.value));
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
if (__VLS_ctx.visible) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.selectedRows.length);
    if (__VLS_ctx.statusCol && __VLS_ctx.canUpdate) {
        for (const [opt] of __VLS_getVForSourceType(((__VLS_ctx.statusCol.enum_options || [])))) {
            const __VLS_0 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
                ...{ 'onClick': {} },
                key: (opt),
                size: "small",
                type: (opt === '停用' ? 'warning' : 'primary'),
            }));
            const __VLS_2 = __VLS_1({
                ...{ 'onClick': {} },
                key: (opt),
                size: "small",
                type: (opt === '停用' ? 'warning' : 'primary'),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
            let __VLS_4;
            let __VLS_5;
            let __VLS_6;
            const __VLS_7 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.visible))
                        return;
                    if (!(__VLS_ctx.statusCol && __VLS_ctx.canUpdate))
                        return;
                    __VLS_ctx.emit('bulkStatus', opt);
                }
            };
            __VLS_3.slots.default;
            (opt);
            var __VLS_3;
        }
    }
    if (__VLS_ctx.canDelete) {
        const __VLS_8 = {}.ElPopconfirm;
        /** @type {[typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, typeof __VLS_components.ElPopconfirm, typeof __VLS_components.elPopconfirm, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            ...{ 'onConfirm': {} },
            title: (`确认删除选中的 ${__VLS_ctx.selectedRows.length} 行？此操作不可恢复。`),
            confirmButtonText: "确认删除",
            cancelButtonText: "取消",
            confirmButtonType: "danger",
        }));
        const __VLS_10 = __VLS_9({
            ...{ 'onConfirm': {} },
            title: (`确认删除选中的 ${__VLS_ctx.selectedRows.length} 行？此操作不可恢复。`),
            confirmButtonText: "确认删除",
            cancelButtonText: "取消",
            confirmButtonType: "danger",
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        let __VLS_12;
        let __VLS_13;
        let __VLS_14;
        const __VLS_15 = {
            onConfirm: (...[$event]) => {
                if (!(__VLS_ctx.visible))
                    return;
                if (!(__VLS_ctx.canDelete))
                    return;
                __VLS_ctx.emit('bulkDelete');
            }
        };
        __VLS_11.slots.default;
        {
            const { reference: __VLS_thisSlot } = __VLS_11.slots;
            const __VLS_16 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
                size: "small",
                type: "danger",
                plain: true,
            }));
            const __VLS_18 = __VLS_17({
                size: "small",
                type: "danger",
                plain: true,
            }, ...__VLS_functionalComponentArgsRest(__VLS_17));
            __VLS_19.slots.default;
            var __VLS_19;
        }
        var __VLS_11;
    }
    const __VLS_20 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }));
    const __VLS_22 = __VLS_21({
        ...{ 'onClick': {} },
        size: "small",
        link: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_21));
    let __VLS_24;
    let __VLS_25;
    let __VLS_26;
    const __VLS_27 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.visible))
                return;
            __VLS_ctx.emit('clear');
        }
    };
    __VLS_23.slots.default;
    var __VLS_23;
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            emit: emit,
            canUpdate: canUpdate,
            canDelete: canDelete,
            visible: visible,
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
