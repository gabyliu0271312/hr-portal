/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref } from 'vue';
import EventListView from '../EventListView.vue';
import PipelineTriggerConfigView from '../PipelineTriggerConfigView.vue';
import DeadLetterListView from '../DeadLetterListView.vue';
import { ucpApi } from '@/api/ucp';
const __VLS_props = defineProps();
const subTab = ref('list');
/* ── KPI 统计 ── */
const kpi = ref({ total: 0, completed: 0, failed: 0, dead: 0 });
const completionRate = computed(() => {
    if (kpi.value.total === 0)
        return '0';
    return ((kpi.value.completed / kpi.value.total) * 100).toFixed(1);
});
async function loadKpi() {
    try {
        const [evRes, dlRes] = await Promise.all([
            ucpApi.listEvents({ limit: 200 }).catch(() => ({ total: 0, items: [] })),
            ucpApi.listDeadLetters({ limit: 200 }).catch(() => ({ total: 0, items: [] })),
        ]);
        const items = evRes.items || [];
        kpi.value.total = items.length;
        kpi.value.completed = items.filter((e) => e.status === 'COMPLETED').length;
        kpi.value.failed = items.filter((e) => e.status === 'FAILED').length;
        kpi.value.dead = (dlRes.items || []).length;
    }
    catch (_e) {
    }
}
onMounted(loadKpi);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['events-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['events-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['events-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['events-tab']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "events-tab" },
});
if (!__VLS_ctx.currentSystemCode) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "placeholder" },
    });
    const __VLS_0 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        description: "请先在「接入系统」中选择一个系统",
    }));
    const __VLS_2 = __VLS_1({
        description: "请先在「接入系统」中选择一个系统",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "events-content" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-row" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-card kpi-total" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-value" },
    });
    (__VLS_ctx.kpi.total);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-card kpi-completed" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-value" },
    });
    (__VLS_ctx.kpi.completed);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-sub" },
    });
    (__VLS_ctx.completionRate);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-card kpi-failed" },
        ...{ class: ({ 'kpi-warn': __VLS_ctx.kpi.failed > 0 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-value" },
    });
    (__VLS_ctx.kpi.failed);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-sub" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-card kpi-dead" },
        ...{ class: ({ 'kpi-warn': __VLS_ctx.kpi.dead > 0 }) },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-label" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-value" },
    });
    (__VLS_ctx.kpi.dead);
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "kpi-sub" },
    });
    const __VLS_4 = {}.ElTabs;
    /** @type {[typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, typeof __VLS_components.ElTabs, typeof __VLS_components.elTabs, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        modelValue: (__VLS_ctx.subTab),
        ...{ class: "sub-tabs" },
    }));
    const __VLS_6 = __VLS_5({
        modelValue: (__VLS_ctx.subTab),
        ...{ class: "sub-tabs" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    const __VLS_8 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        label: "事件列表",
        name: "list",
    }));
    const __VLS_10 = __VLS_9({
        label: "事件列表",
        name: "list",
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const __VLS_12 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
        label: "触发器",
        name: "triggers",
    }));
    const __VLS_14 = __VLS_13({
        label: "触发器",
        name: "triggers",
    }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    const __VLS_16 = {}.ElTabPane;
    /** @type {[typeof __VLS_components.ElTabPane, typeof __VLS_components.elTabPane, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        label: "死信队列",
        name: "dead",
    }));
    const __VLS_18 = __VLS_17({
        label: "死信队列",
        name: "dead",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sub-content" },
    });
    if (__VLS_ctx.subTab === 'list') {
        /** @type {[typeof EventListView, ]} */ ;
        // @ts-ignore
        const __VLS_20 = __VLS_asFunctionalComponent(EventListView, new EventListView({
            systemCode: (__VLS_ctx.currentSystemCode),
        }));
        const __VLS_21 = __VLS_20({
            systemCode: (__VLS_ctx.currentSystemCode),
        }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    }
    else if (__VLS_ctx.subTab === 'triggers') {
        /** @type {[typeof PipelineTriggerConfigView, ]} */ ;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent(PipelineTriggerConfigView, new PipelineTriggerConfigView({
            systemCode: (__VLS_ctx.currentSystemCode),
        }));
        const __VLS_24 = __VLS_23({
            systemCode: (__VLS_ctx.currentSystemCode),
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    }
    else if (__VLS_ctx.subTab === 'dead') {
        /** @type {[typeof DeadLetterListView, ]} */ ;
        // @ts-ignore
        const __VLS_26 = __VLS_asFunctionalComponent(DeadLetterListView, new DeadLetterListView({}));
        const __VLS_27 = __VLS_26({}, ...__VLS_functionalComponentArgsRest(__VLS_26));
    }
}
/** @type {__VLS_StyleScopedClasses['events-tab']} */ ;
/** @type {__VLS_StyleScopedClasses['placeholder']} */ ;
/** @type {__VLS_StyleScopedClasses['events-content']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-row']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-total']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-completed']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-failed']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-card']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-dead']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-label']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-value']} */ ;
/** @type {__VLS_StyleScopedClasses['kpi-sub']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-tabs']} */ ;
/** @type {__VLS_StyleScopedClasses['sub-content']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            EventListView: EventListView,
            PipelineTriggerConfigView: PipelineTriggerConfigView,
            DeadLetterListView: DeadLetterListView,
            subTab: subTab,
            kpi: kpi,
            completionRate: completionRate,
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
