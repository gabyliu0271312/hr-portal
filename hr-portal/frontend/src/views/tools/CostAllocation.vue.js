/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Setting, Delete } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import AllocationRunDialog from '@/components/allocation/AllocationRunDialog.vue';
import { allocationApi } from '@/api/allocation';
const router = useRouter();
const schemes = ref([]);
const loading = ref(false);
const runDialogVisible = ref(false);
const activeScheme = ref(null);
async function loadSchemes() {
    loading.value = true;
    try {
        schemes.value = await allocationApi.listSchemes();
    }
    catch {
        ElMessage.error('加载方案列表失败');
    }
    finally {
        loading.value = false;
    }
}
function openRunDialog(scheme) {
    activeScheme.value = scheme;
    runDialogVisible.value = true;
}
async function deleteScheme(scheme) {
    await ElMessageBox.confirm(`确认删除方案「${scheme.name}」？执行历史也将一并删除。`, '确认删除', {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    try {
        await allocationApi.deleteScheme(scheme.id);
        ElMessage.success('已删除');
        await loadSchemes();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
function onRunDone() {
    loadSchemes();
}
onMounted(loadSchemes);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "tools.cost_allocation",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "tools.cost_allocation",
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_4));
    let __VLS_7;
    let __VLS_8;
    let __VLS_9;
    const __VLS_10 = {
        onClick: (...[$event]) => {
            __VLS_ctx.router.push('/tools/allocation-designer/new');
        }
    };
    __VLS_6.slots.default;
    const __VLS_11 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({
        ...{ style: {} },
    }));
    const __VLS_13 = __VLS_12({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_14.slots.default;
    const __VLS_15 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_16 = __VLS_asFunctionalComponent(__VLS_15, new __VLS_15({}));
    const __VLS_17 = __VLS_16({}, ...__VLS_functionalComponentArgsRest(__VLS_16));
    var __VLS_14;
    var __VLS_6;
}
if (!__VLS_ctx.loading && !__VLS_ctx.schemes.length) {
    const __VLS_19 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
        description: "暂无分摊方案，点击右上角新建",
    }));
    const __VLS_21 = __VLS_20({
        description: "暂无分摊方案，点击右上角新建",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.schemes.length) {
    const __VLS_23 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
        data: (__VLS_ctx.schemes),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }));
    const __VLS_25 = __VLS_24({
        data: (__VLS_ctx.schemes),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_26.slots.default;
    const __VLS_27 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
        label: "方案名",
        minWidth: "160",
    }));
    const __VLS_29 = __VLS_28({
        label: "方案名",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    __VLS_30.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_30.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_31 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }));
        const __VLS_33 = __VLS_32({
            ...{ 'onClick': {} },
            link: true,
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_32));
        let __VLS_35;
        let __VLS_36;
        let __VLS_37;
        const __VLS_38 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schemes.length))
                    return;
                __VLS_ctx.router.push(`/tools/allocation-designer/${row.id}`);
            }
        };
        __VLS_34.slots.default;
        (row.name);
        var __VLS_34;
    }
    var __VLS_30;
    const __VLS_39 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        label: "数据来源",
        minWidth: "160",
    }));
    const __VLS_41 = __VLS_40({
        label: "数据来源",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_42.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
        const __VLS_43 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
            size: "small",
            type: "warning",
            effect: "plain",
        }));
        const __VLS_45 = __VLS_44({
            size: "small",
            type: "warning",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_44));
        __VLS_46.slots.default;
        var __VLS_46;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (row.dataset_name || `#${row.dataset_id}`);
    }
    var __VLS_42;
    const __VLS_47 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_48 = __VLS_asFunctionalComponent(__VLS_47, new __VLS_47({
        label: "写入结果表",
        minWidth: "160",
        prop: "result_table_label",
    }));
    const __VLS_49 = __VLS_48({
        label: "写入结果表",
        minWidth: "160",
        prop: "result_table_label",
    }, ...__VLS_functionalComponentArgsRest(__VLS_48));
    const __VLS_51 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_52 = __VLS_asFunctionalComponent(__VLS_51, new __VLS_51({
        label: "最近执行",
        minWidth: "160",
    }));
    const __VLS_53 = __VLS_52({
        label: "最近执行",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_52));
    __VLS_54.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_54.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.last_run) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_55 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_56 = __VLS_asFunctionalComponent(__VLS_55, new __VLS_55({
                size: "small",
                type: (row.last_run.status === 'success' ? 'success' : 'danger'),
                effect: "plain",
            }));
            const __VLS_57 = __VLS_56({
                size: "small",
                type: (row.last_run.status === 'success' ? 'success' : 'danger'),
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_56));
            __VLS_58.slots.default;
            (row.last_run.status === 'success' ? '成功' : '失败');
            var __VLS_58;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (row.last_run.period_ym);
            (row.last_run.rows_written);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
    }
    var __VLS_54;
    const __VLS_59 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({
        label: "操作",
        width: "200",
        fixed: "right",
    }));
    const __VLS_61 = __VLS_60({
        label: "操作",
        width: "200",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_60));
    __VLS_62.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_62.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_63 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "U",
            size: "small",
        }));
        const __VLS_64 = __VLS_63({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "U",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_63));
        let __VLS_66;
        let __VLS_67;
        let __VLS_68;
        const __VLS_69 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schemes.length))
                    return;
                __VLS_ctx.router.push(`/tools/allocation-designer/${row.id}`);
            }
        };
        __VLS_65.slots.default;
        const __VLS_70 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_71 = __VLS_asFunctionalComponent(__VLS_70, new __VLS_70({}));
        const __VLS_72 = __VLS_71({}, ...__VLS_functionalComponentArgsRest(__VLS_71));
        __VLS_73.slots.default;
        const __VLS_74 = {}.Setting;
        /** @type {[typeof __VLS_components.Setting, ]} */ ;
        // @ts-ignore
        const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({}));
        const __VLS_76 = __VLS_75({}, ...__VLS_functionalComponentArgsRest(__VLS_75));
        var __VLS_73;
        var __VLS_65;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_78 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "C",
            size: "small",
            type: "primary",
            ...{ style: {} },
        }));
        const __VLS_79 = __VLS_78({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "C",
            size: "small",
            type: "primary",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_78));
        let __VLS_81;
        let __VLS_82;
        let __VLS_83;
        const __VLS_84 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schemes.length))
                    return;
                __VLS_ctx.openRunDialog(row);
            }
        };
        __VLS_80.slots.default;
        var __VLS_80;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "D",
            size: "small",
            type: "danger",
            ...{ style: {} },
        }));
        const __VLS_86 = __VLS_85({
            ...{ 'onClick': {} },
            menu: "tools.cost_allocation",
            op: "D",
            size: "small",
            type: "danger",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        let __VLS_88;
        let __VLS_89;
        let __VLS_90;
        const __VLS_91 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schemes.length))
                    return;
                __VLS_ctx.deleteScheme(row);
            }
        };
        __VLS_87.slots.default;
        const __VLS_92 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({}));
        const __VLS_94 = __VLS_93({}, ...__VLS_functionalComponentArgsRest(__VLS_93));
        __VLS_95.slots.default;
        const __VLS_96 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({}));
        const __VLS_98 = __VLS_97({}, ...__VLS_functionalComponentArgsRest(__VLS_97));
        var __VLS_95;
        var __VLS_87;
    }
    var __VLS_62;
    var __VLS_26;
}
var __VLS_3;
/** @type {[typeof AllocationRunDialog, ]} */ ;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent(AllocationRunDialog, new AllocationRunDialog({
    ...{ 'onDone': {} },
    visible: (__VLS_ctx.runDialogVisible),
    scheme: (__VLS_ctx.activeScheme),
}));
const __VLS_101 = __VLS_100({
    ...{ 'onDone': {} },
    visible: (__VLS_ctx.runDialogVisible),
    scheme: (__VLS_ctx.activeScheme),
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
let __VLS_103;
let __VLS_104;
let __VLS_105;
const __VLS_106 = {
    onDone: (__VLS_ctx.onRunDone)
};
var __VLS_102;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Setting: Setting,
            Delete: Delete,
            PermissionButton: PermissionButton,
            AllocationRunDialog: AllocationRunDialog,
            router: router,
            schemes: schemes,
            loading: loading,
            runDialogVisible: runDialogVisible,
            activeScheme: activeScheme,
            openRunDialog: openRunDialog,
            deleteScheme: deleteScheme,
            onRunDone: onRunDone,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
