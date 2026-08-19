/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { ref, onMounted } from 'vue';
import { Refresh, CircleClose } from '@element-plus/icons-vue';
import { useUserStore } from '@/stores/user';
import { getWarehouseFeatures, emergencyStopL4, resumeL4, getL4Status, getL4Summary } from '@/api/warehouse';
const userStore = useUserStore();
const isAdmin = userStore.hasOp('warehouse.metrics', 'U');
const features = ref(null);
const emergencyStopped = ref(false);
const runningCount = ref(0);
const partialFailedCount = ref(0);
const loading = ref(true);
async function load() {
    loading.value = true;
    try {
        features.value = await getWarehouseFeatures();
        try {
            const s = await getL4Status();
            emergencyStopped.value = s?.emergency_stop || false;
        }
        catch { }
        try {
            const sum = await getL4Summary();
            runningCount.value = (sum?.total || 0) - (sum?.success || 0) - (sum?.failed || 0) - (sum?.blocked || 0);
            partialFailedCount.value = sum?.failed || 0;
        }
        catch { }
    }
    catch {
        features.value = null;
    }
    finally {
        loading.value = false;
    }
}
async function doEmergencyStop() {
    try {
        const { ElMessageBox, ElMessage } = await import('element-plus');
        await ElMessageBox.confirm('确定紧急停止所有 L4 全自动级联任务？', '紧急停止', { type: 'error', confirmButtonText: '确定停止', cancelButtonText: '取消' });
        await emergencyStopL4();
        emergencyStopped.value = true;
        ElMessage.success('已紧急停止');
    }
    catch { /* cancelled */ }
}
async function doResume() {
    try {
        await resumeL4();
        emergencyStopped.value = false;
        const { ElMessage } = await import('element-plus');
        ElMessage.success('已恢复运行');
    }
    catch { /* ignore */ }
}
onMounted(load);
const __VLS_exposed = { load };
defineExpose(__VLS_exposed);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-bar" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-items" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-item" },
});
const __VLS_0 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: (__VLS_ctx.features?.ods_dwd_automation ? 'warning' : 'info'),
    size: "small",
    effect: "dark",
}));
const __VLS_2 = __VLS_1({
    type: (__VLS_ctx.features?.ods_dwd_automation ? 'warning' : 'info'),
    size: "small",
    effect: "dark",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
var __VLS_3;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-text" },
});
(__VLS_ctx.features?.ods_dwd_automation ? '试点中' : '未启用');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-item" },
});
const __VLS_4 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    type: (__VLS_ctx.features?.metric_automation ? 'warning' : 'info'),
    size: "small",
    effect: "dark",
}));
const __VLS_6 = __VLS_5({
    type: (__VLS_ctx.features?.metric_automation ? 'warning' : 'info'),
    size: "small",
    effect: "dark",
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
var __VLS_7;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-text" },
});
(__VLS_ctx.features?.metric_automation ? '试点中' : '未启用');
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-item" },
});
const __VLS_8 = {}.ElTag;
/** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    type: (!__VLS_ctx.features?.l4_full_auto ? 'info' : __VLS_ctx.emergencyStopped ? 'danger' : 'success'),
    size: "small",
    effect: "dark",
}));
const __VLS_10 = __VLS_9({
    type: (!__VLS_ctx.features?.l4_full_auto ? 'info' : __VLS_ctx.emergencyStopped ? 'danger' : 'success'),
    size: "small",
    effect: "dark",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
__VLS_11.slots.default;
var __VLS_11;
__VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
    ...{ class: "status-text" },
});
(!__VLS_ctx.features?.l4_full_auto ? '未启用' : __VLS_ctx.emergencyStopped ? `紧急停止中 | 待处理: ${__VLS_ctx.partialFailedCount}` : `试点中 | 进行中: ${Math.max(0, __VLS_ctx.runningCount)}`);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "status-actions" },
});
if (__VLS_ctx.isAdmin) {
    if (__VLS_ctx.features?.l4_full_auto && __VLS_ctx.emergencyStopped) {
        const __VLS_12 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            ...{ 'onClick': {} },
            type: "success",
            size: "small",
        }));
        const __VLS_14 = __VLS_13({
            ...{ 'onClick': {} },
            type: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
        let __VLS_16;
        let __VLS_17;
        let __VLS_18;
        const __VLS_19 = {
            onClick: (__VLS_ctx.doResume)
        };
        __VLS_15.slots.default;
        var __VLS_15;
    }
    else if (__VLS_ctx.features?.l4_full_auto) {
        const __VLS_20 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
            ...{ 'onClick': {} },
            type: "danger",
            size: "small",
            icon: (__VLS_ctx.CircleClose),
        }));
        const __VLS_22 = __VLS_21({
            ...{ 'onClick': {} },
            type: "danger",
            size: "small",
            icon: (__VLS_ctx.CircleClose),
        }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        let __VLS_24;
        let __VLS_25;
        let __VLS_26;
        const __VLS_27 = {
            onClick: (__VLS_ctx.doEmergencyStop)
        };
        __VLS_23.slots.default;
        var __VLS_23;
    }
}
const __VLS_28 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Refresh),
    loading: (__VLS_ctx.loading),
}));
const __VLS_30 = __VLS_29({
    ...{ 'onClick': {} },
    size: "small",
    icon: (__VLS_ctx.Refresh),
    loading: (__VLS_ctx.loading),
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
let __VLS_32;
let __VLS_33;
let __VLS_34;
const __VLS_35 = {
    onClick: (__VLS_ctx.load)
};
__VLS_31.slots.default;
var __VLS_31;
/** @type {__VLS_StyleScopedClasses['status-bar']} */ ;
/** @type {__VLS_StyleScopedClasses['status-items']} */ ;
/** @type {__VLS_StyleScopedClasses['status-item']} */ ;
/** @type {__VLS_StyleScopedClasses['status-text']} */ ;
/** @type {__VLS_StyleScopedClasses['status-item']} */ ;
/** @type {__VLS_StyleScopedClasses['status-text']} */ ;
/** @type {__VLS_StyleScopedClasses['status-item']} */ ;
/** @type {__VLS_StyleScopedClasses['status-text']} */ ;
/** @type {__VLS_StyleScopedClasses['status-actions']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Refresh: Refresh,
            CircleClose: CircleClose,
            isAdmin: isAdmin,
            features: features,
            emergencyStopped: emergencyStopped,
            runningCount: runningCount,
            partialFailedCount: partialFailedCount,
            loading: loading,
            load: load,
            doEmergencyStop: doEmergencyStop,
            doResume: doResume,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {
            ...__VLS_exposed,
        };
    },
});
; /* PartiallyEnd: #4569/main.vue */
