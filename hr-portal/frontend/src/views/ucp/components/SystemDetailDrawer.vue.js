/// <reference types="../../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, ref, watch } from 'vue';
import { Connection, Document } from '@element-plus/icons-vue';
import { ucpApi } from '@/api/ucp';
const props = defineProps();
const emit = defineEmits();
const visible = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});
const title = computed(() => props.systemInfo ? `系统详情 - ${props.systemInfo.system_name || props.systemInfo.system_code}` : '系统详情');
const activeCount = computed(() => props.systemInfo?.active_count || 0);
const triggers = ref([]);
watch(() => props.systemCode, async (code) => {
    if (!code)
        return;
    try {
        const res = await ucpApi.listEventTriggers({ limit: 20 }).catch(() => ({ items: [] }));
        triggers.value = (res.items || []).filter((t) => t.source_system === code);
    }
    catch {
        triggers.value = [];
    }
}, { immediate: true });
function directionLabel(d) {
    return { INBOUND: '入站', OUTBOUND: '出站', BIDIRECTIONAL: '双向' }[d] || d;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['sd-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-item']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.title),
    size: "520px",
    direction: "rtl",
    destroyOnClose: (false),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.visible),
    title: (__VLS_ctx.title),
    size: "520px",
    direction: "rtl",
    destroyOnClose: (false),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
__VLS_3.slots.default;
if (__VLS_ctx.systemInfo) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-body" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section-title" },
    });
    const __VLS_5 = {}.ElDescriptions;
    /** @type {[typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, typeof __VLS_components.ElDescriptions, typeof __VLS_components.elDescriptions, ]} */ ;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent(__VLS_5, new __VLS_5({
        column: (2),
        border: true,
    }));
    const __VLS_7 = __VLS_6({
        column: (2),
        border: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_8.slots.default;
    const __VLS_9 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_10 = __VLS_asFunctionalComponent(__VLS_9, new __VLS_9({
        label: "系统编码",
    }));
    const __VLS_11 = __VLS_10({
        label: "系统编码",
    }, ...__VLS_functionalComponentArgsRest(__VLS_10));
    __VLS_12.slots.default;
    (__VLS_ctx.systemInfo.system_code);
    var __VLS_12;
    const __VLS_13 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent(__VLS_13, new __VLS_13({
        label: "系统名称",
    }));
    const __VLS_15 = __VLS_14({
        label: "系统名称",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    __VLS_16.slots.default;
    (__VLS_ctx.systemInfo.system_name);
    var __VLS_16;
    const __VLS_17 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_18 = __VLS_asFunctionalComponent(__VLS_17, new __VLS_17({
        label: "方向",
    }));
    const __VLS_19 = __VLS_18({
        label: "方向",
    }, ...__VLS_functionalComponentArgsRest(__VLS_18));
    __VLS_20.slots.default;
    const __VLS_21 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
        size: "small",
        effect: "plain",
    }));
    const __VLS_23 = __VLS_22({
        size: "small",
        effect: "plain",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    __VLS_24.slots.default;
    (__VLS_ctx.directionLabel(__VLS_ctx.systemInfo.direction));
    var __VLS_24;
    var __VLS_20;
    const __VLS_25 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent(__VLS_25, new __VLS_25({
        label: "状态",
    }));
    const __VLS_27 = __VLS_26({
        label: "状态",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    __VLS_28.slots.default;
    const __VLS_29 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({
        size: "small",
        type: (__VLS_ctx.activeCount > 0 ? 'success' : 'warning'),
        effect: "light",
    }));
    const __VLS_31 = __VLS_30({
        size: "small",
        type: (__VLS_ctx.activeCount > 0 ? 'success' : 'warning'),
        effect: "light",
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    __VLS_32.slots.default;
    (__VLS_ctx.activeCount > 0 ? '已启用' : '未启用');
    var __VLS_32;
    var __VLS_28;
    const __VLS_33 = {}.ElDescriptionsItem;
    /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent(__VLS_33, new __VLS_33({
        label: "资源数量",
        span: (2),
    }));
    const __VLS_35 = __VLS_34({
        label: "资源数量",
        span: (2),
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    __VLS_36.slots.default;
    (__VLS_ctx.systemInfo.resource_count);
    (__VLS_ctx.systemInfo.active_count);
    var __VLS_36;
    if (__VLS_ctx.systemInfo.description) {
        const __VLS_37 = {}.ElDescriptionsItem;
        /** @type {[typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, typeof __VLS_components.ElDescriptionsItem, typeof __VLS_components.elDescriptionsItem, ]} */ ;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
            label: "描述",
            span: (2),
        }));
        const __VLS_39 = __VLS_38({
            label: "描述",
            span: (2),
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
        __VLS_40.slots.default;
        (__VLS_ctx.systemInfo.description);
        var __VLS_40;
    }
    var __VLS_8;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-actions" },
    });
    const __VLS_41 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({
        ...{ 'onClick': {} },
    }));
    const __VLS_43 = __VLS_42({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
    let __VLS_45;
    let __VLS_46;
    let __VLS_47;
    const __VLS_48 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.systemInfo))
                return;
            __VLS_ctx.$emit('open-events');
        }
    };
    __VLS_44.slots.default;
    const __VLS_49 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({}));
    const __VLS_51 = __VLS_50({}, ...__VLS_functionalComponentArgsRest(__VLS_50));
    __VLS_52.slots.default;
    const __VLS_53 = {}.Document;
    /** @type {[typeof __VLS_components.Document, ]} */ ;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent(__VLS_53, new __VLS_53({}));
    const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
    var __VLS_52;
    if (__VLS_ctx.stats.event_count_24h) {
        const __VLS_57 = {}.ElBadge;
        /** @type {[typeof __VLS_components.ElBadge, typeof __VLS_components.elBadge, ]} */ ;
        // @ts-ignore
        const __VLS_58 = __VLS_asFunctionalComponent(__VLS_57, new __VLS_57({
            value: (__VLS_ctx.stats.event_count_24h),
            ...{ class: "sd-badge" },
        }));
        const __VLS_59 = __VLS_58({
            value: (__VLS_ctx.stats.event_count_24h),
            ...{ class: "sd-badge" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_58));
    }
    var __VLS_44;
    const __VLS_61 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({
        ...{ 'onClick': {} },
    }));
    const __VLS_63 = __VLS_62({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_62));
    let __VLS_65;
    let __VLS_66;
    let __VLS_67;
    const __VLS_68 = {
        onClick: (...[$event]) => {
            if (!(__VLS_ctx.systemInfo))
                return;
            __VLS_ctx.$emit('open-pipelines');
        }
    };
    __VLS_64.slots.default;
    const __VLS_69 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({}));
    const __VLS_71 = __VLS_70({}, ...__VLS_functionalComponentArgsRest(__VLS_70));
    __VLS_72.slots.default;
    const __VLS_73 = {}.Connection;
    /** @type {[typeof __VLS_components.Connection, ]} */ ;
    // @ts-ignore
    const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({}));
    const __VLS_75 = __VLS_74({}, ...__VLS_functionalComponentArgsRest(__VLS_74));
    var __VLS_72;
    if (__VLS_ctx.stats.pipeline_count) {
        const __VLS_77 = {}.ElBadge;
        /** @type {[typeof __VLS_components.ElBadge, typeof __VLS_components.elBadge, ]} */ ;
        // @ts-ignore
        const __VLS_78 = __VLS_asFunctionalComponent(__VLS_77, new __VLS_77({
            value: (__VLS_ctx.stats.pipeline_count),
            ...{ class: "sd-badge" },
        }));
        const __VLS_79 = __VLS_78({
            value: (__VLS_ctx.stats.pipeline_count),
            ...{ class: "sd-badge" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_78));
    }
    var __VLS_64;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section-title" },
    });
    (__VLS_ctx.stats.trigger_count || 0);
    if (__VLS_ctx.triggers.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sd-list" },
        });
        for (const [t] of __VLS_getVForSourceType((__VLS_ctx.triggers))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (t.id),
                ...{ class: "sd-list-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sd-list-main" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sd-list-name" },
            });
            (t.trigger_name || t.trigger_code);
            const __VLS_81 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
                size: "small",
                type: (t.is_active ? 'success' : 'info'),
                effect: "plain",
            }));
            const __VLS_83 = __VLS_82({
                size: "small",
                type: (t.is_active ? 'success' : 'info'),
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_82));
            __VLS_84.slots.default;
            (t.is_active ? '启用' : '停用');
            var __VLS_84;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sd-list-meta" },
            });
            (t.event_type || t.source_system || '—');
        }
    }
    else {
        const __VLS_85 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
            description: "暂无触发器",
            imageSize: (60),
        }));
        const __VLS_87 = __VLS_86({
            description: "暂无触发器",
            imageSize: (60),
        }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "sd-section-title" },
    });
    (__VLS_ctx.systemInfo.resource_count);
    if (__VLS_ctx.systemInfo.resources?.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "sd-list" },
        });
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.systemInfo.resources))) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                key: (c.id),
                ...{ class: "sd-list-item" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sd-list-main" },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ class: "sd-list-name" },
            });
            (c.system_name);
            (c.adapter_code || c.resource_code);
            const __VLS_89 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
                size: "small",
                type: (c.status === 1 ? 'success' : 'info'),
                effect: "plain",
            }));
            const __VLS_91 = __VLS_90({
                size: "small",
                type: (c.status === 1 ? 'success' : 'info'),
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_90));
            __VLS_92.slots.default;
            (c.status === 1 ? '已启用' : '已停用');
            var __VLS_92;
            if (c.test_status) {
                const __VLS_93 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
                    size: "small",
                    type: (c.test_status === 'PASS' ? 'success' : c.test_status === 'FAIL' ? 'danger' : 'info'),
                    effect: "plain",
                }));
                const __VLS_95 = __VLS_94({
                    size: "small",
                    type: (c.test_status === 'PASS' ? 'success' : c.test_status === 'FAIL' ? 'danger' : 'info'),
                    effect: "plain",
                }, ...__VLS_functionalComponentArgsRest(__VLS_94));
                __VLS_96.slots.default;
                (c.test_status);
                var __VLS_96;
            }
        }
    }
}
else {
    const __VLS_97 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
        description: "加载中…",
    }));
    const __VLS_99 = __VLS_98({
        description: "加载中…",
    }, ...__VLS_functionalComponentArgsRest(__VLS_98));
}
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['sd-body']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-actions']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-badge']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-main']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-name']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-meta']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-section-title']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-item']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-main']} */ ;
/** @type {__VLS_StyleScopedClasses['sd-list-name']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Connection: Connection,
            Document: Document,
            visible: visible,
            title: title,
            activeCount: activeCount,
            triggers: triggers,
            directionLabel: directionLabel,
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
