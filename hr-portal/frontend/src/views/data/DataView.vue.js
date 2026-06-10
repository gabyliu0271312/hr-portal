/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { QuestionFilled, Plus, List, Calendar, Money, Histogram, OfficeBuilding, Collection, TrendCharts, DataLine, Document, Grid, Cpu, Files, Coin, } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import CreateTableDialog from '@/components/data/CreateTableDialog.vue';
import { adminTablesApi } from '@/api/admin_tables';
const ICON_MAP = {
    List, Calendar, Money, Histogram, OfficeBuilding, Collection,
    TrendCharts, DataLine, Document, Grid, Cpu, Files, Coin,
};
const router = useRouter();
const tables = ref([]);
const loading = ref(false);
const createDialogRef = ref(null);
async function loadTables() {
    loading.value = true;
    try {
        tables.value = await adminTablesApi.list();
    }
    catch {
        ElMessage.error('加载视图列表失败');
    }
    finally {
        loading.value = false;
    }
}
function tableIcon(iconName) {
    return ICON_MAP[iconName] ?? Grid;
}
function tablePath(t) {
    return `/data/${t.table_name}`;
}
function onCreated() {
    loadTables();
}
onMounted(loadTables);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['data-card']} */ ;
// CSS variable injection
// CSS variable injection end
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_0 = {}.ElCard;
/** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
{
    const { header: __VLS_thisSlot } = __VLS_3.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    const __VLS_4 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        placement: "right",
        showAfter: (100),
    }));
    const __VLS_6 = __VLS_5({
        placement: "right",
        showAfter: (100),
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    __VLS_7.slots.default;
    {
        const { content: __VLS_thisSlot } = __VLS_7.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.b, __VLS_intrinsicElements.b)({});
    }
    const __VLS_8 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent(__VLS_8, new __VLS_8({
        ...{ style: {} },
    }));
    const __VLS_10 = __VLS_9({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    __VLS_11.slots.default;
    const __VLS_12 = {}.QuestionFilled;
    /** @type {[typeof __VLS_components.QuestionFilled, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    var __VLS_7;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "C",
        type: "primary",
    }));
    const __VLS_17 = __VLS_16({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_16));
    let __VLS_19;
    let __VLS_20;
    let __VLS_21;
    const __VLS_22 = {
        onClick: (...[$event]) => {
            __VLS_ctx.createDialogRef?.open();
        }
    };
    __VLS_18.slots.default;
    const __VLS_23 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
        ...{ style: {} },
    }));
    const __VLS_25 = __VLS_24({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_26.slots.default;
    const __VLS_27 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({}));
    const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
    var __VLS_26;
    var __VLS_18;
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "data-grid" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
for (const [t] of __VLS_getVForSourceType((__VLS_ctx.tables))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ onClick: (...[$event]) => {
                __VLS_ctx.router.push(__VLS_ctx.tablePath(t));
            } },
        key: (t.table_name),
        ...{ class: "data-card" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "data-card__icon" },
    });
    const __VLS_31 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        size: (20),
    }));
    const __VLS_33 = __VLS_32({
        size: (20),
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    __VLS_34.slots.default;
    const __VLS_35 = ((__VLS_ctx.tableIcon(t.icon)));
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({}));
    const __VLS_37 = __VLS_36({}, ...__VLS_functionalComponentArgsRest(__VLS_36));
    var __VLS_34;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "data-card__title" },
    });
    (t.table_label);
    if (!t.is_builtin) {
        const __VLS_39 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
            size: "small",
            type: "success",
            effect: "plain",
            ...{ style: {} },
        }));
        const __VLS_41 = __VLS_40({
            size: "small",
            type: "success",
            effect: "plain",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_40));
        __VLS_42.slots.default;
        var __VLS_42;
    }
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "data-card__desc" },
    });
    (t.description || (t.is_period ? `月度表 · 期间字段：${t.period_col}` : '全量表'));
}
var __VLS_3;
/** @type {[typeof CreateTableDialog, ]} */ ;
// @ts-ignore
const __VLS_43 = __VLS_asFunctionalComponent(CreateTableDialog, new CreateTableDialog({
    ...{ 'onDone': {} },
    ref: "createDialogRef",
}));
const __VLS_44 = __VLS_43({
    ...{ 'onDone': {} },
    ref: "createDialogRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_43));
let __VLS_46;
let __VLS_47;
let __VLS_48;
const __VLS_49 = {
    onDone: (__VLS_ctx.onCreated)
};
/** @type {typeof __VLS_ctx.createDialogRef} */ ;
var __VLS_50 = {};
var __VLS_45;
/** @type {__VLS_StyleScopedClasses['data-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['data-card']} */ ;
/** @type {__VLS_StyleScopedClasses['data-card__icon']} */ ;
/** @type {__VLS_StyleScopedClasses['data-card__title']} */ ;
/** @type {__VLS_StyleScopedClasses['data-card__desc']} */ ;
// @ts-ignore
var __VLS_51 = __VLS_50;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            QuestionFilled: QuestionFilled,
            Plus: Plus,
            PermissionButton: PermissionButton,
            CreateTableDialog: CreateTableDialog,
            router: router,
            tables: tables,
            loading: loading,
            createDialogRef: createDialogRef,
            tableIcon: tableIcon,
            tablePath: tablePath,
            onCreated: onCreated,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
