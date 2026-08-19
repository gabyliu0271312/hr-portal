/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search, Link, InfoFilled } from '@element-plus/icons-vue';
import { listUcpSystems, listUcpResources, UCP_DISABLED_TEXT } from '@/api/warehouse';
const props = defineProps();
const emit = defineEmits();
// ==================== 状态 ====================
const visible = ref(false);
const loading = ref(false);
const systems = ref([]);
const resources = ref([]);
const selectedSystemId = ref(undefined);
const selectedResource = ref(null);
const ucpAvailable = ref(true);
const keyword = ref('');
// ==================== 方法 ====================
async function loadSystems() {
    try {
        systems.value = await listUcpSystems();
        ucpAvailable.value = true;
    }
    catch {
        ucpAvailable.value = false;
        systems.value = [];
    }
}
async function loadResources() {
    if (!ucpAvailable.value)
        return;
    loading.value = true;
    try {
        resources.value = await listUcpResources(selectedSystemId.value);
    }
    catch {
        resources.value = [];
    }
    finally {
        loading.value = false;
    }
}
function open() {
    visible.value = true;
    selectedResource.value = null;
    selectedSystemId.value = props.modelValue?.system_id ?? undefined;
    loadSystems();
    if (ucpAvailable.value) {
        loadResources();
    }
}
function selectResource(r) {
    selectedResource.value = r;
}
function confirm() {
    if (!selectedResource.value) {
        ElMessage.warning('请选择一个 UCP 资源');
        return;
    }
    const r = selectedResource.value;
    emit('update:modelValue', {
        system_id: r.system_id,
        resource_id: r.id,
        resource_name: r.name,
    });
    visible.value = false;
}
function clear() {
    emit('update:modelValue', { system_id: null, resource_id: null, resource_name: undefined });
}
function onSystemChange() {
    loadResources();
}
const filteredResources = () => {
    if (!keyword.value)
        return resources.value;
    const kw = keyword.value.toLowerCase();
    return resources.value.filter(r => r.name.toLowerCase().includes(kw) ||
        r.resource_type.toLowerCase().includes(kw));
};
onMounted(() => {
    loadSystems();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "resource-picker" },
});
if (props.modelValue?.resource_id) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "picked-resource" },
    });
    const __VLS_0 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
        ...{ 'onClose': {} },
        type: "success",
        size: "small",
        effect: "plain",
        closable: true,
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClose': {} },
        type: "success",
        size: "small",
        effect: "plain",
        closable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_4;
    let __VLS_5;
    let __VLS_6;
    const __VLS_7 = {
        onClose: (__VLS_ctx.clear)
    };
    __VLS_3.slots.default;
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
    const __VLS_12 = {}.Link;
    /** @type {[typeof __VLS_components.Link, ]} */ ;
    // @ts-ignore
    const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({}));
    const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    var __VLS_11;
    (props.modelValue.resource_name || ('UCP 资源 #' + props.modelValue.resource_id));
    var __VLS_3;
}
const __VLS_16 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.ucpAvailable),
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    size: "small",
    disabled: (!__VLS_ctx.ucpAvailable),
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_20;
let __VLS_21;
let __VLS_22;
const __VLS_23 = {
    onClick: (__VLS_ctx.open)
};
__VLS_19.slots.default;
const __VLS_24 = {}.ElIcon;
/** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_27.slots.default;
const __VLS_28 = {}.Link;
/** @type {[typeof __VLS_components.Link, ]} */ ;
// @ts-ignore
const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({}));
const __VLS_30 = __VLS_29({}, ...__VLS_functionalComponentArgsRest(__VLS_29));
var __VLS_27;
(props.modelValue?.resource_id ? '更换' : '选择 UCP 资源');
var __VLS_19;
if (!__VLS_ctx.ucpAvailable) {
    const __VLS_32 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent(__VLS_32, new __VLS_32({
        content: (__VLS_ctx.UCP_DISABLED_TEXT),
        placement: "top",
    }));
    const __VLS_34 = __VLS_33({
        content: (__VLS_ctx.UCP_DISABLED_TEXT),
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    __VLS_35.slots.default;
    const __VLS_36 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({
        ...{ style: {} },
    }));
    const __VLS_38 = __VLS_37({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.InfoFilled;
    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    var __VLS_39;
    var __VLS_35;
}
const __VLS_44 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    modelValue: (__VLS_ctx.visible),
    title: "选择数据连接资源",
    width: "700px",
    destroyOnClose: true,
}));
const __VLS_46 = __VLS_45({
    modelValue: (__VLS_ctx.visible),
    title: "选择数据连接资源",
    width: "700px",
    destroyOnClose: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
__VLS_47.slots.default;
if (!__VLS_ctx.ucpAvailable) {
    const __VLS_48 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        title: (__VLS_ctx.UCP_DISABLED_TEXT),
        type: "info",
        showIcon: true,
        closable: (false),
        description: "数据连接平台当前未启用，无法关联 UCP 资源。",
        ...{ style: {} },
    }));
    const __VLS_50 = __VLS_49({
        title: (__VLS_ctx.UCP_DISABLED_TEXT),
        type: "info",
        showIcon: true,
        closable: (false),
        description: "数据连接平台当前未启用，无法关联 UCP 资源。",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
}
else {
    const __VLS_52 = {}.ElRow;
    /** @type {[typeof __VLS_components.ElRow, typeof __VLS_components.elRow, typeof __VLS_components.ElRow, typeof __VLS_components.elRow, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        gutter: (12),
        ...{ style: {} },
    }));
    const __VLS_54 = __VLS_53({
        gutter: (12),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
        span: (8),
    }));
    const __VLS_58 = __VLS_57({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_57));
    __VLS_59.slots.default;
    const __VLS_60 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.selectedSystemId),
        placeholder: "系统筛选",
        clearable: true,
        ...{ style: {} },
    }));
    const __VLS_62 = __VLS_61({
        ...{ 'onChange': {} },
        modelValue: (__VLS_ctx.selectedSystemId),
        placeholder: "系统筛选",
        clearable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
    let __VLS_64;
    let __VLS_65;
    let __VLS_66;
    const __VLS_67 = {
        onChange: (__VLS_ctx.onSystemChange)
    };
    __VLS_63.slots.default;
    for (const [s] of __VLS_getVForSourceType((__VLS_ctx.systems))) {
        const __VLS_68 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
            key: (s.id),
            label: (s.name),
            value: (s.id),
        }));
        const __VLS_70 = __VLS_69({
            key: (s.id),
            label: (s.name),
            value: (s.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    }
    var __VLS_63;
    var __VLS_59;
    const __VLS_72 = {}.ElCol;
    /** @type {[typeof __VLS_components.ElCol, typeof __VLS_components.elCol, typeof __VLS_components.ElCol, typeof __VLS_components.elCol, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        span: (8),
    }));
    const __VLS_74 = __VLS_73({
        span: (8),
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    const __VLS_76 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
        modelValue: (__VLS_ctx.keyword),
        placeholder: "搜索资源名称/类型",
        prefixIcon: (__VLS_ctx.Search),
        clearable: true,
    }));
    const __VLS_78 = __VLS_77({
        modelValue: (__VLS_ctx.keyword),
        placeholder: "搜索资源名称/类型",
        prefixIcon: (__VLS_ctx.Search),
        clearable: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_77));
    var __VLS_75;
    var __VLS_55;
    const __VLS_80 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.filteredResources()),
        size: "small",
        stripe: true,
        maxHeight: "350",
        highlightCurrentRow: true,
        rowClassName: (({ id }) => __VLS_ctx.selectedResource?.id === id ? 'selected-row' : ''),
    }));
    const __VLS_82 = __VLS_81({
        ...{ 'onRowClick': {} },
        data: (__VLS_ctx.filteredResources()),
        size: "small",
        stripe: true,
        maxHeight: "350",
        highlightCurrentRow: true,
        rowClassName: (({ id }) => __VLS_ctx.selectedResource?.id === id ? 'selected-row' : ''),
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    let __VLS_84;
    let __VLS_85;
    let __VLS_86;
    const __VLS_87 = {
        onRowClick: (__VLS_ctx.selectResource)
    };
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_83.slots.default;
    const __VLS_88 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        label: "系统",
        width: "100",
    }));
    const __VLS_90 = __VLS_89({
        label: "系统",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_91.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (__VLS_ctx.systems.find(s => s.id === row.system_id)?.name || '-');
    }
    var __VLS_91;
    const __VLS_92 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
        prop: "name",
        label: "资源名称",
        minWidth: "140",
    }));
    const __VLS_94 = __VLS_93({
        prop: "name",
        label: "资源名称",
        minWidth: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_93));
    const __VLS_96 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        prop: "resource_type",
        label: "类型",
        width: "80",
    }));
    const __VLS_98 = __VLS_97({
        prop: "resource_type",
        label: "类型",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    const __VLS_100 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
        label: "状态",
        width: "80",
    }));
    const __VLS_102 = __VLS_101({
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_101));
    __VLS_103.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_103.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_104 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            type: (row.status === 'active' ? 'success' : 'info'),
            size: "small",
            effect: "plain",
        }));
        const __VLS_106 = __VLS_105({
            type: (row.status === 'active' ? 'success' : 'info'),
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        __VLS_107.slots.default;
        (row.status);
        var __VLS_107;
    }
    var __VLS_103;
    const __VLS_108 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
        label: "最近测试",
        width: "100",
    }));
    const __VLS_110 = __VLS_109({
        label: "最近测试",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_111.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_111.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (row.last_test_at || '-');
    }
    var __VLS_111;
    const __VLS_112 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        label: "操作",
        width: "70",
    }));
    const __VLS_114 = __VLS_113({
        label: "操作",
        width: "70",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_115.slots;
        const __VLS_116 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
            link: true,
            size: "small",
            type: "primary",
        }));
        const __VLS_118 = __VLS_117({
            link: true,
            size: "small",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_117));
        __VLS_119.slots.default;
        var __VLS_119;
    }
    var __VLS_115;
    var __VLS_83;
    if (!__VLS_ctx.loading && __VLS_ctx.resources.length === 0) {
        const __VLS_120 = {}.ElEmpty;
        /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            description: "暂无 UCP 资源",
            imageSize: (80),
        }));
        const __VLS_122 = __VLS_121({
            description: "暂无 UCP 资源",
            imageSize: (80),
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_47.slots;
    const __VLS_124 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
        ...{ 'onClick': {} },
    }));
    const __VLS_126 = __VLS_125({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_125));
    let __VLS_128;
    let __VLS_129;
    let __VLS_130;
    const __VLS_131 = {
        onClick: (...[$event]) => {
            __VLS_ctx.visible = false;
        }
    };
    __VLS_127.slots.default;
    var __VLS_127;
    const __VLS_132 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        ...{ 'onClick': {} },
        type: "primary",
        disabled: (!__VLS_ctx.ucpAvailable),
    }));
    const __VLS_134 = __VLS_133({
        ...{ 'onClick': {} },
        type: "primary",
        disabled: (!__VLS_ctx.ucpAvailable),
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    let __VLS_136;
    let __VLS_137;
    let __VLS_138;
    const __VLS_139 = {
        onClick: (__VLS_ctx.confirm)
    };
    __VLS_135.slots.default;
    var __VLS_135;
}
var __VLS_47;
/** @type {__VLS_StyleScopedClasses['resource-picker']} */ ;
/** @type {__VLS_StyleScopedClasses['picked-resource']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Search: Search,
            Link: Link,
            InfoFilled: InfoFilled,
            UCP_DISABLED_TEXT: UCP_DISABLED_TEXT,
            visible: visible,
            loading: loading,
            systems: systems,
            resources: resources,
            selectedSystemId: selectedSystemId,
            selectedResource: selectedResource,
            ucpAvailable: ucpAvailable,
            keyword: keyword,
            open: open,
            selectResource: selectResource,
            confirm: confirm,
            clear: clear,
            onSystemChange: onSystemChange,
            filteredResources: filteredResources,
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
