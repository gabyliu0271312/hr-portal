/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getLayerStats } from '@/api/warehouse';
import { WAREHOUSE_LAYER_COLORS, WAREHOUSE_LAYER_LABELS } from '@/constants/warehouseLayers';
const router = useRouter();
const loading = ref(false);
const error = ref('');
const stats = ref([]);
async function load() {
    loading.value = true;
    error.value = '';
    try {
        const res = await getLayerStats();
        stats.value = res.items;
    }
    catch {
        error.value = '加载分层统计失败';
    }
    finally {
        loading.value = false;
    }
}
function goToLayer(code) {
    router.push(`/warehouse/assets?warehouse_layer=${encodeURIComponent(code)}`);
}
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['layer-stat-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    (__VLS_ctx.error);
}
else if (!__VLS_ctx.stats.length && !__VLS_ctx.loading) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
}
else {
    const __VLS_0 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        gutter: (16),
    }));
    const __VLS_2 = __VLS_1({
        gutter: (16),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_3.slots.default;
    for (const [s] of __VLS_getVForSourceType((__VLS_ctx.stats))) {
        const __VLS_4 = {}.ElCol;
        /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
        // @ts-ignore
        const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
            key: (s.code),
            xs: (12),
            sm: (Math.floor(24 / Math.min(__VLS_ctx.stats.length, 7))),
            ...{ style: {} },
        }));
        const __VLS_6 = __VLS_5({
            key: (s.code),
            xs: (12),
            sm: (Math.floor(24 / Math.min(__VLS_ctx.stats.length, 7))),
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_5));
        __VLS_7.slots.default;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.error))
                        return;
                    if (!!(!__VLS_ctx.stats.length && !__VLS_ctx.loading))
                        return;
                    s.count > 0 && __VLS_ctx.goToLayer(s.code);
                } },
            ...{ class: "layer-stat-item" },
            ...{ style: ({ cursor: s.count > 0 ? 'pointer' : 'default' }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div)({
            ...{ class: "layer-dot" },
            ...{ style: ({ background: __VLS_ctx.WAREHOUSE_LAYER_COLORS[s.code] || '#909399' }) },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "layer-info" },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "layer-code" },
        });
        (s.code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "layer-label" },
        });
        (__VLS_ctx.WAREHOUSE_LAYER_LABELS[s.code] || s.code);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "layer-count" },
        });
        (s.count);
        var __VLS_7;
    }
    var __VLS_3;
}
/** @type {__VLS_StyleScopedClasses['layer-stat-item']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-info']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-code']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-label']} */ ;
/** @type {__VLS_StyleScopedClasses['layer-count']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            WAREHOUSE_LAYER_COLORS: WAREHOUSE_LAYER_COLORS,
            WAREHOUSE_LAYER_LABELS: WAREHOUSE_LAYER_LABELS,
            loading: loading,
            error: error,
            stats: stats,
            goToLayer: goToLayer,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
