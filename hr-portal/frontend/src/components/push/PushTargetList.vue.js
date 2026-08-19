/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Edit, Delete, VideoPlay, Search } from '@element-plus/icons-vue';
import { formatDateTime } from '@/utils/datetime';
import PermissionButton from '@/components/PermissionButton.vue';
import PushTargetDialog from './PushTargetDialog.vue';
import PushRunHistory from './PushRunHistory.vue';
import { pushTargetsApi } from '@/api/push_targets';
const props = withDefaults(defineProps(), {
    compact: false,
    hideHeader: false,
    permissionMenu: 'warehouse.service',
});
const emit = defineEmits();
const targets = ref([]);
const loading = ref(false);
const running = ref(null);
const historyTarget = ref(null);
const dialogRef = ref(null);
const historyRef = ref(null);
const orphanDialogVisible = ref(false);
const orphanLoading = ref(false);
const orphans = ref([]);
const activeTargets = computed(() => targets.value.filter((item) => item.is_active).length);
const tableMaxHeight = computed(() => (props.compact ? 300 : 400));
async function load() {
    loading.value = true;
    try {
        targets.value = await pushTargetsApi.list(props.sourceTable || undefined);
        emit('targets-change', targets.value);
    }
    catch {
        ElMessage.error('加载推送配置失败');
    }
    finally {
        loading.value = false;
    }
}
async function runNow(target) {
    running.value = target.id;
    try {
        const res = await pushTargetsApi.run(target.id);
        ElMessage.success(res.message || '推送成功');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '推送失败');
    }
    finally {
        running.value = null;
    }
}
async function remove(target) {
    await ElMessageBox.confirm(`确认删除推送配置「${target.name}」？`, '确认删除', {
        type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消',
    });
    try {
        await pushTargetsApi.remove(target.id);
        ElMessage.success('已删除');
        await load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '删除失败');
    }
}
async function checkOrphans() {
    orphanLoading.value = true;
    orphanDialogVisible.value = true;
    try {
        orphans.value = await pushTargetsApi.schemaOrphans();
    }
    catch {
        ElMessage.error('检查孤儿 Schema 失败');
    }
    finally {
        orphanLoading.value = false;
    }
}
const PUSH_TYPE_LABELS = {
    external_db: '写入数据库',
    http_push: 'HTTP 推送',
    api_expose: 'API 暴露',
    db_realtime: '实时数据库',
    db_snapshot: '快照数据库',
    feishu_sheet: '飞书表格',
};
watch(() => props.sourceTable, () => load());
onMounted(load);
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_withDefaultsArg = (function (t) { return t; })({
    compact: false,
    hideHeader: false,
    permissionMenu: 'warehouse.service',
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['push-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['push-list-toolbar']} */ ;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "push-target-list" },
    ...{ class: ({ 'is-compact': __VLS_ctx.compact }) },
});
if (!__VLS_ctx.hideHeader) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "push-list-header" },
    });
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_0 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "D",
        plain: true,
    }));
    const __VLS_1 = __VLS_0({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "D",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_0));
    let __VLS_3;
    let __VLS_4;
    let __VLS_5;
    const __VLS_6 = {
        onClick: (__VLS_ctx.checkOrphans)
    };
    __VLS_2.slots.default;
    const __VLS_7 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent(__VLS_7, new __VLS_7({
        ...{ style: {} },
    }));
    const __VLS_9 = __VLS_8({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    __VLS_10.slots.default;
    const __VLS_11 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({}));
    const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
    var __VLS_10;
    var __VLS_2;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_15 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "C",
        type: "primary",
    }));
    const __VLS_16 = __VLS_15({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "C",
        type: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_15));
    let __VLS_18;
    let __VLS_19;
    let __VLS_20;
    const __VLS_21 = {
        onClick: (...[$event]) => {
            if (!(!__VLS_ctx.hideHeader))
                return;
            __VLS_ctx.dialogRef?.open();
        }
    };
    __VLS_17.slots.default;
    const __VLS_22 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_23 = __VLS_asFunctionalComponent(__VLS_22, new __VLS_22({
        ...{ style: {} },
    }));
    const __VLS_24 = __VLS_23({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    __VLS_25.slots.default;
    const __VLS_26 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_27 = __VLS_asFunctionalComponent(__VLS_26, new __VLS_26({}));
    const __VLS_28 = __VLS_27({}, ...__VLS_functionalComponentArgsRest(__VLS_27));
    var __VLS_25;
    var __VLS_17;
}
else {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "push-list-toolbar" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "push-summary" },
    });
    (__VLS_ctx.targets.length);
    (__VLS_ctx.activeTargets);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "D",
        plain: true,
    }));
    const __VLS_31 = __VLS_30({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "D",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    let __VLS_33;
    let __VLS_34;
    let __VLS_35;
    const __VLS_36 = {
        onClick: (__VLS_ctx.checkOrphans)
    };
    __VLS_32.slots.default;
    const __VLS_37 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_38 = __VLS_asFunctionalComponent(__VLS_37, new __VLS_37({
        ...{ style: {} },
    }));
    const __VLS_39 = __VLS_38({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_38));
    __VLS_40.slots.default;
    const __VLS_41 = {}.Search;
    /** @type {[typeof __VLS_components.Search, ]} */ ;
    // @ts-ignore
    const __VLS_42 = __VLS_asFunctionalComponent(__VLS_41, new __VLS_41({}));
    const __VLS_43 = __VLS_42({}, ...__VLS_functionalComponentArgsRest(__VLS_42));
    var __VLS_40;
    var __VLS_32;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_45 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "C",
        type: "primary",
        plain: true,
    }));
    const __VLS_46 = __VLS_45({
        ...{ 'onClick': {} },
        menu: (__VLS_ctx.permissionMenu),
        op: "C",
        type: "primary",
        plain: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_45));
    let __VLS_48;
    let __VLS_49;
    let __VLS_50;
    const __VLS_51 = {
        onClick: (...[$event]) => {
            if (!!(!__VLS_ctx.hideHeader))
                return;
            __VLS_ctx.dialogRef?.open();
        }
    };
    __VLS_47.slots.default;
    const __VLS_52 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({
        ...{ style: {} },
    }));
    const __VLS_54 = __VLS_53({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_53));
    __VLS_55.slots.default;
    const __VLS_56 = {}.Plus;
    /** @type {[typeof __VLS_components.Plus, ]} */ ;
    // @ts-ignore
    const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({}));
    const __VLS_58 = __VLS_57({}, ...__VLS_functionalComponentArgsRest(__VLS_57));
    var __VLS_55;
    var __VLS_47;
}
if (!__VLS_ctx.loading && !__VLS_ctx.targets.length) {
    const __VLS_60 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_61 = __VLS_asFunctionalComponent(__VLS_60, new __VLS_60({
        imageSize: (__VLS_ctx.compact ? 72 : 120),
        description: "暂无推送配置",
    }));
    const __VLS_62 = __VLS_61({
        imageSize: (__VLS_ctx.compact ? 72 : 120),
        description: "暂无推送配置",
    }, ...__VLS_functionalComponentArgsRest(__VLS_61));
}
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ class: "push-table-wrap" },
});
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
if (__VLS_ctx.targets.length) {
    const __VLS_64 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
        data: (__VLS_ctx.targets),
        stripe: true,
        ...{ style: {} },
        maxHeight: (__VLS_ctx.tableMaxHeight),
    }));
    const __VLS_66 = __VLS_65({
        data: (__VLS_ctx.targets),
        stripe: true,
        ...{ style: {} },
        maxHeight: (__VLS_ctx.tableMaxHeight),
    }, ...__VLS_functionalComponentArgsRest(__VLS_65));
    __VLS_67.slots.default;
    const __VLS_68 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
        label: "名称",
        minWidth: "140",
        prop: "name",
    }));
    const __VLS_70 = __VLS_69({
        label: "名称",
        minWidth: "140",
        prop: "name",
    }, ...__VLS_functionalComponentArgsRest(__VLS_69));
    const __VLS_72 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({
        label: "推送方式",
        width: "120",
    }));
    const __VLS_74 = __VLS_73({
        label: "推送方式",
        width: "120",
    }, ...__VLS_functionalComponentArgsRest(__VLS_73));
    __VLS_75.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_75.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_76 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
            size: "small",
            effect: "plain",
        }));
        const __VLS_78 = __VLS_77({
            size: "small",
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_77));
        __VLS_79.slots.default;
        (__VLS_ctx.PUSH_TYPE_LABELS[row.push_type] ?? row.push_type);
        var __VLS_79;
    }
    var __VLS_75;
    const __VLS_80 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_81 = __VLS_asFunctionalComponent(__VLS_80, new __VLS_80({
        label: "状态",
        width: "80",
    }));
    const __VLS_82 = __VLS_81({
        label: "状态",
        width: "80",
    }, ...__VLS_functionalComponentArgsRest(__VLS_81));
    __VLS_83.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_83.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        const __VLS_84 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
            size: "small",
            type: (row.is_active ? 'success' : 'info'),
            effect: "plain",
        }));
        const __VLS_86 = __VLS_85({
            size: "small",
            type: (row.is_active ? 'success' : 'info'),
            effect: "plain",
        }, ...__VLS_functionalComponentArgsRest(__VLS_85));
        __VLS_87.slots.default;
        (row.is_active ? '启用' : '禁用');
        var __VLS_87;
    }
    var __VLS_83;
    const __VLS_88 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({
        label: "最近推送",
        minWidth: "160",
    }));
    const __VLS_90 = __VLS_89({
        label: "最近推送",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_89));
    __VLS_91.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_91.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.last_push_at) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({});
            const __VLS_92 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
                size: "small",
                type: (row.last_status === 'success' ? 'success' : 'danger'),
                effect: "plain",
            }));
            const __VLS_94 = __VLS_93({
                size: "small",
                type: (row.last_status === 'success' ? 'success' : 'danger'),
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_93));
            __VLS_95.slots.default;
            (row.last_status === 'success' ? '成功' : '失败');
            var __VLS_95;
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.formatDateTime(row.last_push_at));
            (row.last_rows);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
        }
    }
    var __VLS_91;
    const __VLS_96 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
        label: "操作",
        width: "240",
        fixed: "right",
    }));
    const __VLS_98 = __VLS_97({
        label: "操作",
        width: "240",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_97));
    __VLS_99.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_99.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (!props.hideHistory) {
            const __VLS_100 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
                ...{ 'onClick': {} },
                size: "small",
            }));
            const __VLS_102 = __VLS_101({
                ...{ 'onClick': {} },
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_101));
            let __VLS_104;
            let __VLS_105;
            let __VLS_106;
            const __VLS_107 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.targets.length))
                        return;
                    if (!(!props.hideHistory))
                        return;
                    __VLS_ctx.historyTarget = row;
                }
            };
            __VLS_103.slots.default;
            var __VLS_103;
        }
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_108 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.permissionMenu),
            op: "U",
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_109 = __VLS_108({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.permissionMenu),
            op: "U",
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_108));
        let __VLS_111;
        let __VLS_112;
        let __VLS_113;
        const __VLS_114 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.targets.length))
                    return;
                __VLS_ctx.dialogRef?.open(row);
            }
        };
        __VLS_110.slots.default;
        const __VLS_115 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_116 = __VLS_asFunctionalComponent(__VLS_115, new __VLS_115({}));
        const __VLS_117 = __VLS_116({}, ...__VLS_functionalComponentArgsRest(__VLS_116));
        __VLS_118.slots.default;
        const __VLS_119 = {}.Edit;
        /** @type {[typeof __VLS_components.Edit, ]} */ ;
        // @ts-ignore
        const __VLS_120 = __VLS_asFunctionalComponent(__VLS_119, new __VLS_119({}));
        const __VLS_121 = __VLS_120({}, ...__VLS_functionalComponentArgsRest(__VLS_120));
        var __VLS_118;
        var __VLS_110;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_123 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.permissionMenu),
            op: "D",
            size: "small",
            type: "danger",
            ...{ style: {} },
        }));
        const __VLS_124 = __VLS_123({
            ...{ 'onClick': {} },
            menu: (__VLS_ctx.permissionMenu),
            op: "D",
            size: "small",
            type: "danger",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_123));
        let __VLS_126;
        let __VLS_127;
        let __VLS_128;
        const __VLS_129 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.targets.length))
                    return;
                __VLS_ctx.remove(row);
            }
        };
        __VLS_125.slots.default;
        const __VLS_130 = {}.ElIcon;
        /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
        // @ts-ignore
        const __VLS_131 = __VLS_asFunctionalComponent(__VLS_130, new __VLS_130({}));
        const __VLS_132 = __VLS_131({}, ...__VLS_functionalComponentArgsRest(__VLS_131));
        __VLS_133.slots.default;
        const __VLS_134 = {}.Delete;
        /** @type {[typeof __VLS_components.Delete, ]} */ ;
        // @ts-ignore
        const __VLS_135 = __VLS_asFunctionalComponent(__VLS_134, new __VLS_134({}));
        const __VLS_136 = __VLS_135({}, ...__VLS_functionalComponentArgsRest(__VLS_135));
        var __VLS_133;
        var __VLS_125;
        if (row.push_type !== 'api_expose') {
            /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
            // @ts-ignore
            const __VLS_138 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
                ...{ 'onClick': {} },
                menu: (__VLS_ctx.permissionMenu),
                op: "C",
                size: "small",
                type: "primary",
                ...{ style: {} },
                loading: (__VLS_ctx.running === row.id),
            }));
            const __VLS_139 = __VLS_138({
                ...{ 'onClick': {} },
                menu: (__VLS_ctx.permissionMenu),
                op: "C",
                size: "small",
                type: "primary",
                ...{ style: {} },
                loading: (__VLS_ctx.running === row.id),
            }, ...__VLS_functionalComponentArgsRest(__VLS_138));
            let __VLS_141;
            let __VLS_142;
            let __VLS_143;
            const __VLS_144 = {
                onClick: (...[$event]) => {
                    if (!(__VLS_ctx.targets.length))
                        return;
                    if (!(row.push_type !== 'api_expose'))
                        return;
                    __VLS_ctx.runNow(row);
                }
            };
            __VLS_140.slots.default;
            const __VLS_145 = {}.ElIcon;
            /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
            // @ts-ignore
            const __VLS_146 = __VLS_asFunctionalComponent(__VLS_145, new __VLS_145({}));
            const __VLS_147 = __VLS_146({}, ...__VLS_functionalComponentArgsRest(__VLS_146));
            __VLS_148.slots.default;
            const __VLS_149 = {}.VideoPlay;
            /** @type {[typeof __VLS_components.VideoPlay, ]} */ ;
            // @ts-ignore
            const __VLS_150 = __VLS_asFunctionalComponent(__VLS_149, new __VLS_149({}));
            const __VLS_151 = __VLS_150({}, ...__VLS_functionalComponentArgsRest(__VLS_150));
            var __VLS_148;
            (row.push_type === 'db_realtime' ? '推送' : row.push_type === 'db_snapshot' ? '立即同步' : '立即推送');
            var __VLS_140;
        }
    }
    var __VLS_99;
    var __VLS_67;
}
const __VLS_153 = {}.ElDialog;
/** @type {[typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, typeof __VLS_components.ElDialog, typeof __VLS_components.elDialog, ]} */ ;
// @ts-ignore
const __VLS_154 = __VLS_asFunctionalComponent(__VLS_153, new __VLS_153({
    modelValue: (__VLS_ctx.orphanDialogVisible),
    title: "孤儿 Schema 检查",
    width: "760px",
}));
const __VLS_155 = __VLS_154({
    modelValue: (__VLS_ctx.orphanDialogVisible),
    title: "孤儿 Schema 检查",
    width: "760px",
}, ...__VLS_functionalComponentArgsRest(__VLS_154));
__VLS_156.slots.default;
const __VLS_157 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_158 = __VLS_asFunctionalComponent(__VLS_157, new __VLS_157({
    data: (__VLS_ctx.orphans),
    stripe: true,
}));
const __VLS_159 = __VLS_158({
    data: (__VLS_ctx.orphans),
    stripe: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_158));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.orphanLoading) }, null, null);
__VLS_160.slots.default;
const __VLS_161 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_162 = __VLS_asFunctionalComponent(__VLS_161, new __VLS_161({
    prop: "schema",
    label: "Schema",
    minWidth: "300",
}));
const __VLS_163 = __VLS_162({
    prop: "schema",
    label: "Schema",
    minWidth: "300",
}, ...__VLS_functionalComponentArgsRest(__VLS_162));
const __VLS_165 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_166 = __VLS_asFunctionalComponent(__VLS_165, new __VLS_165({
    prop: "object_count",
    label: "对象数",
    width: "100",
}));
const __VLS_167 = __VLS_166({
    prop: "object_count",
    label: "对象数",
    width: "100",
}, ...__VLS_functionalComponentArgsRest(__VLS_166));
const __VLS_169 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({
    label: "状态",
    minWidth: "180",
}));
const __VLS_171 = __VLS_170({
    label: "状态",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_170));
__VLS_172.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_172.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    const __VLS_173 = {}.ElTag;
    /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
    // @ts-ignore
    const __VLS_174 = __VLS_asFunctionalComponent(__VLS_173, new __VLS_173({
        type: (row.safe_to_delete ? 'warning' : 'success'),
    }));
    const __VLS_175 = __VLS_174({
        type: (row.safe_to_delete ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_174));
    __VLS_176.slots.default;
    (row.safe_to_delete ? '未被引用' : '仍被引用');
    var __VLS_176;
}
var __VLS_172;
const __VLS_177 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_178 = __VLS_asFunctionalComponent(__VLS_177, new __VLS_177({
    prop: "reason",
    label: "说明",
    minWidth: "180",
}));
const __VLS_179 = __VLS_178({
    prop: "reason",
    label: "说明",
    minWidth: "180",
}, ...__VLS_functionalComponentArgsRest(__VLS_178));
var __VLS_160;
if (!__VLS_ctx.orphanLoading && !__VLS_ctx.orphans.length) {
    const __VLS_181 = {}.ElEmpty;
    /** @type {[typeof __VLS_components.ElEmpty, typeof __VLS_components.elEmpty, ]} */ ;
    // @ts-ignore
    const __VLS_182 = __VLS_asFunctionalComponent(__VLS_181, new __VLS_181({
        description: "未发现孤儿 Schema",
    }));
    const __VLS_183 = __VLS_182({
        description: "未发现孤儿 Schema",
    }, ...__VLS_functionalComponentArgsRest(__VLS_182));
}
var __VLS_156;
const __VLS_185 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_186 = __VLS_asFunctionalComponent(__VLS_185, new __VLS_185({
    ...{ 'onClose': {} },
    modelValue: (!!__VLS_ctx.historyTarget),
    title: (`推送历史 · ${__VLS_ctx.historyTarget?.name}`),
    size: "500px",
}));
const __VLS_187 = __VLS_186({
    ...{ 'onClose': {} },
    modelValue: (!!__VLS_ctx.historyTarget),
    title: (`推送历史 · ${__VLS_ctx.historyTarget?.name}`),
    size: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_186));
let __VLS_189;
let __VLS_190;
let __VLS_191;
const __VLS_192 = {
    onClose: (...[$event]) => {
        __VLS_ctx.historyTarget = null;
    }
};
__VLS_188.slots.default;
if (__VLS_ctx.historyTarget) {
    /** @type {[typeof PushRunHistory, ]} */ ;
    // @ts-ignore
    const __VLS_193 = __VLS_asFunctionalComponent(PushRunHistory, new PushRunHistory({
        pushTargetId: (__VLS_ctx.historyTarget.id),
        ref: "historyRef",
    }));
    const __VLS_194 = __VLS_193({
        pushTargetId: (__VLS_ctx.historyTarget.id),
        ref: "historyRef",
    }, ...__VLS_functionalComponentArgsRest(__VLS_193));
    /** @type {typeof __VLS_ctx.historyRef} */ ;
    var __VLS_196 = {};
    var __VLS_195;
}
var __VLS_188;
/** @type {[typeof PushTargetDialog, ]} */ ;
// @ts-ignore
const __VLS_198 = __VLS_asFunctionalComponent(PushTargetDialog, new PushTargetDialog({
    ...{ 'onDone': {} },
    ref: "dialogRef",
    sourceTable: (__VLS_ctx.sourceTable),
    sourceColumns: (__VLS_ctx.sourceColumns),
}));
const __VLS_199 = __VLS_198({
    ...{ 'onDone': {} },
    ref: "dialogRef",
    sourceTable: (__VLS_ctx.sourceTable),
    sourceColumns: (__VLS_ctx.sourceColumns),
}, ...__VLS_functionalComponentArgsRest(__VLS_198));
let __VLS_201;
let __VLS_202;
let __VLS_203;
const __VLS_204 = {
    onDone: (__VLS_ctx.load)
};
/** @type {typeof __VLS_ctx.dialogRef} */ ;
var __VLS_205 = {};
var __VLS_200;
/** @type {__VLS_StyleScopedClasses['push-target-list']} */ ;
/** @type {__VLS_StyleScopedClasses['push-list-header']} */ ;
/** @type {__VLS_StyleScopedClasses['push-list-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['push-summary']} */ ;
/** @type {__VLS_StyleScopedClasses['push-table-wrap']} */ ;
// @ts-ignore
var __VLS_197 = __VLS_196, __VLS_206 = __VLS_205;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Edit: Edit,
            Delete: Delete,
            VideoPlay: VideoPlay,
            Search: Search,
            formatDateTime: formatDateTime,
            PermissionButton: PermissionButton,
            PushTargetDialog: PushTargetDialog,
            PushRunHistory: PushRunHistory,
            targets: targets,
            loading: loading,
            running: running,
            historyTarget: historyTarget,
            dialogRef: dialogRef,
            historyRef: historyRef,
            orphanDialogVisible: orphanDialogVisible,
            orphanLoading: orphanLoading,
            orphans: orphans,
            activeTargets: activeTargets,
            tableMaxHeight: tableMaxHeight,
            load: load,
            runNow: runNow,
            remove: remove,
            checkOrphans: checkOrphans,
            PUSH_TYPE_LABELS: PUSH_TYPE_LABELS,
        };
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
; /* PartiallyEnd: #4569/main.vue */
