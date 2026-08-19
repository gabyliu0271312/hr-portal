/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { listAssets } from '@/api/warehouse';
import LayerStatsPanel from '@/components/warehouse/LayerStatsPanel.vue';
const router = useRouter();
const loading = ref(false);
// 治理卡片数据
const noLayer = ref([]);
const noOwner = ref([]);
const qualityFail = ref([]);
async function load() {
    loading.value = true;
    try {
        const res = await listAssets({ page_size: 200 });
        const all = res.items;
        noLayer.value = all.filter((a) => !a.warehouse_layer);
        noOwner.value = all.filter((a) => !a.owner_name);
        qualityFail.value = all.filter((a) => a.last_quality_status === 'fail' || a.last_quality_status === 'warn');
    }
    catch {
        ElMessage.error('加载治理数据失败');
    }
    finally {
        loading.value = false;
    }
}
function goImpact(tableName) { router.push(`/warehouse/impact?table=${encodeURIComponent(tableName)}`); }
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['gov-entry-card']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.h2, __VLS_intrinsicElements.h2)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    gutter: (16),
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    gutter: (16),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
const __VLS_4 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_6 = __VLS_5({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_5));
__VLS_7.slots.default;
const __VLS_8 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_12;
let __VLS_13;
let __VLS_14;
const __VLS_15 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/warehouse/lineage');
    }
};
__VLS_11.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-icon" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-desc" },
});
var __VLS_11;
var __VLS_7;
const __VLS_16 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_18 = __VLS_17({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
__VLS_19.slots.default;
const __VLS_20 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_21 = __VLS_asFunctionalComponent(__VLS_20, new __VLS_20({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}));
const __VLS_22 = __VLS_21({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_21));
let __VLS_24;
let __VLS_25;
let __VLS_26;
const __VLS_27 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/warehouse/quality');
    }
};
__VLS_23.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-icon" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-desc" },
});
var __VLS_23;
var __VLS_19;
const __VLS_28 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_30 = __VLS_29({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_29));
__VLS_31.slots.default;
const __VLS_32 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}));
const __VLS_34 = __VLS_33({
    ...{ 'onClick': {} },
    shadow: "hover",
    ...{ class: "gov-entry-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_33));
let __VLS_36;
let __VLS_37;
let __VLS_38;
const __VLS_39 = {
    onClick: (...[$event]) => {
        __VLS_ctx.router.push('/warehouse/monitor');
    }
};
__VLS_35.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-icon" },
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-title" },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-entry-desc" },
});
var __VLS_35;
var __VLS_31;
var __VLS_3;
const __VLS_40 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ style: {} },
    shadow: "never",
}));
const __VLS_42 = __VLS_41({
    ...{ style: {} },
    shadow: "never",
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
__VLS_43.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_43.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
}
/** @type {[typeof LayerStatsPanel, ]} */ ;
// @ts-ignore
const __VLS_44 = __VLS_asFunctionalComponent(LayerStatsPanel, new LayerStatsPanel({}));
const __VLS_45 = __VLS_44({}, ...__VLS_functionalComponentArgsRest(__VLS_44));
var __VLS_43;
const __VLS_47 = {}.ElRow;
/** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
// @ts-ignore
const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
    gutter: (16),
    ...{ style: {} },
}));
const __VLS_49 = __VLS_48({
    gutter: (16),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_48));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_50.slots.default;
const __VLS_51 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_53 = __VLS_52({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_52));
__VLS_54.slots.default;
const __VLS_55 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
    shadow: "hover",
    ...{ class: "gov-card" },
}));
const __VLS_57 = __VLS_56({
    shadow: "hover",
    ...{ class: "gov-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_56));
__VLS_58.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-num" },
});
(__VLS_ctx.noLayer.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-label" },
});
if (__VLS_ctx.noLayer.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [a] of __VLS_getVForSourceType((__VLS_ctx.noLayer.slice(0, 5)))) {
        const __VLS_59 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
            key: (a.table_name),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_61 = __VLS_60({
            key: (a.table_name),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_60));
        __VLS_62.slots.default;
        (a.table_label);
        var __VLS_62;
    }
    if (__VLS_ctx.noLayer.length > 5) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.noLayer.length);
    }
}
var __VLS_58;
var __VLS_54;
const __VLS_63 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_64 = __VLS_asFunctionalComponent(__VLS_63, new __VLS_63({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_65 = __VLS_64({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_64));
__VLS_66.slots.default;
const __VLS_67 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_68 = __VLS_asFunctionalComponent(__VLS_67, new __VLS_67({
    shadow: "hover",
    ...{ class: "gov-card" },
}));
const __VLS_69 = __VLS_68({
    shadow: "hover",
    ...{ class: "gov-card" },
}, ...__VLS_functionalComponentArgsRest(__VLS_68));
__VLS_70.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-num" },
});
(__VLS_ctx.noOwner.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-label" },
});
if (__VLS_ctx.noOwner.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [a] of __VLS_getVForSourceType((__VLS_ctx.noOwner.slice(0, 5)))) {
        const __VLS_71 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_72 = __VLS_asFunctionalComponent(__VLS_71, new __VLS_71({
            key: (a.table_name),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_73 = __VLS_72({
            key: (a.table_name),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_72));
        __VLS_74.slots.default;
        (a.table_label);
        var __VLS_74;
    }
    if (__VLS_ctx.noOwner.length > 5) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.noOwner.length);
    }
}
var __VLS_70;
var __VLS_66;
const __VLS_75 = {}.ElCol;
/** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent(__VLS_75, new __VLS_75({
    sm: (8),
    ...{ style: {} },
}));
const __VLS_77 = __VLS_76({
    sm: (8),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
__VLS_78.slots.default;
const __VLS_79 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_80 = __VLS_asFunctionalComponent(__VLS_79, new __VLS_79({
    shadow: "hover",
    ...{ class: "gov-card" },
    ...{ style: ({ borderLeft: __VLS_ctx.qualityFail.length ? '3px solid #e6a23c' : '' }) },
}));
const __VLS_81 = __VLS_80({
    shadow: "hover",
    ...{ class: "gov-card" },
    ...{ style: ({ borderLeft: __VLS_ctx.qualityFail.length ? '3px solid #e6a23c' : '' }) },
}, ...__VLS_functionalComponentArgsRest(__VLS_80));
__VLS_82.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-num" },
    ...{ class: ({ 'text-warning': __VLS_ctx.qualityFail.length }) },
});
(__VLS_ctx.qualityFail.length);
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "gov-label" },
});
if (__VLS_ctx.qualityFail.length) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    for (const [a] of __VLS_getVForSourceType((__VLS_ctx.qualityFail.slice(0, 5)))) {
        const __VLS_83 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
            key: (a.table_name),
            size: "small",
            type: "warning",
            ...{ style: {} },
        }));
        const __VLS_85 = __VLS_84({
            key: (a.table_name),
            size: "small",
            type: "warning",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_84));
        __VLS_86.slots.default;
        (a.table_label);
        var __VLS_86;
    }
    if (__VLS_ctx.qualityFail.length > 5) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        (__VLS_ctx.qualityFail.length);
    }
}
var __VLS_82;
var __VLS_78;
var __VLS_50;
/** @type {__VLS_StyleScopedClasses['gov-entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-title']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-title']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-title']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-entry-desc']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-num']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-label']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-num']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-label']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-card']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-num']} */ ;
/** @type {__VLS_StyleScopedClasses['gov-label']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            LayerStatsPanel: LayerStatsPanel,
            router: router,
            loading: loading,
            noLayer: noLayer,
            noOwner: noOwner,
            qualityFail: qualityFail,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
