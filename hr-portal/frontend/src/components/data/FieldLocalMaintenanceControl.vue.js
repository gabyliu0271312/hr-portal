/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { tableColumnsApi } from '@/api/table_columns';
const props = defineProps();
const emit = defineEmits();
const loading = ref(false);
const unavailableReason = computed(() => {
    if (props.column.is_pk_part)
        return '业务主键字段不能改为手工字段';
    if (props.column.is_computed)
        return '计算字段不能改为手工字段';
    if (!props.canManage)
        return '暂无字段维护权限';
    return '';
});
async function enableLocalMaintenance() {
    try {
        await ElMessageBox.confirm(`字段“${props.column.column_label}”切换后将完全由人工维护：可在数据视图编辑，后续系统同步不会覆盖该字段。此操作不可恢复，确认继续吗？`, '改为手工字段', { type: 'warning', confirmButtonText: '确认修改', cancelButtonText: '取消' });
    }
    catch {
        return;
    }
    loading.value = true;
    try {
        const column = await tableColumnsApi.enableLocalMaintenance(props.tableName, props.column.id);
        ElMessage.success('字段已改为手工字段');
        emit('updated', column);
    }
    catch (error) {
        ElMessage.error(error?.response?.data?.detail || '改为手工字段失败');
    }
    finally {
        loading.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (!__VLS_ctx.column.auto_discovered) {
    const __VLS_0 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        size: "small",
        type: "success",
        effect: "plain",
    }));
    const __VLS_2 = __VLS_1({
        size: "small",
        type: "success",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    var __VLS_3;
}
else {
    const __VLS_4 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        size: "small",
        type: "info",
        effect: "plain",
    }));
    const __VLS_6 = __VLS_5({
        size: "small",
        type: "info",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    var __VLS_7;
    if (__VLS_ctx.unavailableReason) {
        const __VLS_8 = {}.ElTooltip;
        /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
            content: (__VLS_ctx.unavailableReason),
        }));
        const __VLS_10 = __VLS_9({
            content: (__VLS_ctx.unavailableReason),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        __VLS_11.slots.default;
        const __VLS_12 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            text: true,
            size: "small",
            disabled: true,
        }));
        const __VLS_14 = __VLS_13({
            text: true,
            size: "small",
            disabled: true,
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        __VLS_15.slots.default;
        var __VLS_15;
        var __VLS_11;
    }
    else {
        const __VLS_16 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "primary",
            loading: (__VLS_ctx.loading),
        }));
        const __VLS_18 = __VLS_17({
            ...{ 'onClick': {} },
            text: true,
            size: "small",
            type: "primary",
            loading: (__VLS_ctx.loading),
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        let __VLS_20;
        let __VLS_21;
        let __VLS_22;
        const __VLS_23 = {
            onClick: (__VLS_ctx.enableLocalMaintenance)
        };
        __VLS_19.slots.default;
        var __VLS_19;
    }
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            loading: loading,
            unavailableReason: unavailableReason,
            enableLocalMaintenance: enableLocalMaintenance,
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
