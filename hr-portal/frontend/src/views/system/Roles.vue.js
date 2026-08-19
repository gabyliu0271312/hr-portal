/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, InfoFilled } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import AiCapabilityGrantEditor from '@/components/system/AiCapabilityGrantEditor.vue';
import { rolesApi, menusApi, } from '@/api/roles';
import { fieldCategoriesApi } from '@/api/field_categories';
const list = ref([]);
const loading = ref(false);
const allMenus = ref([]);
const allCategories = ref([]);
const selectedCategoryIds = ref([]);
const editingId = ref(null);
const form = reactive({
    name: '',
    description: '',
    is_active: true,
    ai_capability_ids: [],
    matrix: [],
});
const saving = ref(false);
const editingTitle = computed(() => {
    if (editingId.value === 'new')
        return '新建角色';
    if (typeof editingId.value === 'number') {
        const r = list.value.find((x) => x.id === editingId.value);
        return `编辑角色 · ${r?.name ?? ''}`;
    }
    return '';
});
async function loadList() {
    loading.value = true;
    try {
        const resp = await rolesApi.list();
        list.value = resp.items;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
async function loadMenus() {
    if (allMenus.value.length)
        return;
    allMenus.value = await menusApi.list();
}
function buildMatrix(detail) {
    const dict = new Map();
    detail?.menus.forEach((m) => dict.set(m.menu_id, m));
    // 计算每个菜单的 depth：根节点 0，依次 +1
    const byId = new Map();
    allMenus.value.forEach((m) => byId.set(m.id, m));
    const depthOf = (m) => {
        let d = 0;
        let cur = m;
        while (cur && cur.parent_id !== null) {
            d++;
            cur = byId.get(cur.parent_id);
        }
        return d;
    };
    // 子节点存在性 → 判断是否叶子
    const hasChildren = new Set();
    allMenus.value.forEach((m) => {
        if (m.parent_id !== null)
            hasChildren.add(m.parent_id);
    });
    // 排序：父在前、按 display_order
    const sorted = [...allMenus.value].sort((a, b) => {
        if (a.parent_id === b.parent_id) {
            return (a.id ?? 0) - (b.id ?? 0);
        }
        return 0;
    });
    return sorted.map((m) => {
        const cur = dict.get(m.id);
        return {
            menu_id: m.id,
            code: m.code,
            label: m.label,
            parent_id: m.parent_id,
            depth: depthOf(m),
            is_leaf: !hasChildren.has(m.id),
            enabled: !!cur,
            scope_dimension: cur?.scope_dimension ?? 'none',
            can_create: !!cur?.can_create,
            can_update: !!cur?.can_update,
            can_delete: !!cur?.can_delete,
            can_export: !!cur?.can_export,
        };
    });
}
async function openCreate() {
    await loadMenus();
    await loadCategories();
    selectedCategoryIds.value = [];
    editingId.value = 'new';
    Object.assign(form, {
        name: '',
        description: '',
        is_active: true,
        ai_capability_ids: [],
        matrix: buildMatrix(null),
    });
}
async function openEdit(id) {
    await loadMenus();
    await loadCategories();
    try {
        const detail = await rolesApi.get(id);
        const visibleCats = await fieldCategoriesApi.getRoleVisible(id).catch(() => []);
        selectedCategoryIds.value = [...visibleCats];
        editingId.value = id;
        Object.assign(form, {
            name: detail.name,
            description: detail.description ?? '',
            is_active: detail.is_active,
            ai_capability_ids: detail.ai_capability_ids,
            matrix: buildMatrix(detail),
        });
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
}
async function loadCategories() {
    try {
        allCategories.value = await fieldCategoriesApi.list();
    }
    catch {
        allCategories.value = [];
    }
}
function exitEdit() {
    editingId.value = null;
}
async function onSave() {
    if (!form.name.trim()) {
        ElMessage.warning('请填写角色名');
        return;
    }
    saving.value = true;
    try {
        const menus = form.matrix
            .filter((m) => m.enabled)
            .map((m) => ({
            menu_id: m.menu_id,
            scope_dimension: m.scope_dimension,
            can_view: true,
            can_create: m.can_create,
            can_update: m.can_update,
            can_delete: m.can_delete,
            can_export: m.can_export,
        }));
        if (editingId.value === 'new') {
            const created = await rolesApi.create({
                name: form.name,
                description: form.description || undefined,
                menus,
                ai_capability_ids: form.ai_capability_ids,
            });
            // 新建后保存可见分类
            if (selectedCategoryIds.value.length > 0) {
                await fieldCategoriesApi
                    .setRoleVisible(created.id, selectedCategoryIds.value)
                    .catch(() => { });
            }
            ElMessage.success('角色已创建');
        }
        else if (typeof editingId.value === 'number') {
            await rolesApi.update(editingId.value, {
                name: form.name,
                description: form.description || undefined,
                is_active: form.is_active,
                menus,
                ai_capability_ids: form.ai_capability_ids,
            });
            await fieldCategoriesApi
                .setRoleVisible(editingId.value, selectedCategoryIds.value)
                .catch(() => { });
            ElMessage.success('角色已更新');
        }
        exitEdit();
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function onToggleActive(row) {
    const action = row.is_active ? '停用' : '启用';
    try {
        await ElMessageBox.confirm(`${action}角色 "${row.name}"？`, '提示', {
            type: 'warning',
            confirmButtonText: action,
            cancelButtonText: '取消',
        });
    }
    catch {
        return;
    }
    try {
        if (row.is_active)
            await rolesApi.deactivate(row.id);
        else
            await rolesApi.activate(row.id);
        ElMessage.success(`已${action}`);
        loadList();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || `${action}失败`);
    }
}
function toggleEnabled(row) {
    if (!row.enabled) {
        row.scope_dimension = 'none';
        row.can_create = false;
        row.can_update = false;
        row.can_delete = false;
        row.can_export = false;
    }
}
function onSelectAllOps(row, on) {
    row.can_create = on;
    row.can_update = on;
    row.can_delete = on;
    row.can_export = on;
}
onMounted(() => {
    loadList();
});
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
if (__VLS_ctx.editingId === null) {
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
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.list.length);
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "C",
            type: "primary",
        }));
        const __VLS_5 = __VLS_4({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "C",
            type: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_4));
        let __VLS_7;
        let __VLS_8;
        let __VLS_9;
        const __VLS_10 = {
            onClick: (__VLS_ctx.openCreate)
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_19 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
        data: (__VLS_ctx.list),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }));
    const __VLS_21 = __VLS_20({
        data: (__VLS_ctx.list),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    __VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
    __VLS_22.slots.default;
    const __VLS_23 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({
        label: "角色名",
        minWidth: "160",
    }));
    const __VLS_25 = __VLS_24({
        label: "角色名",
        minWidth: "160",
    }, ...__VLS_functionalComponentArgsRest(__VLS_24));
    __VLS_26.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_26.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
        (row.name);
        if (!row.is_active) {
            const __VLS_27 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
                size: "small",
                ...{ style: {} },
                type: "info",
            }));
            const __VLS_29 = __VLS_28({
                size: "small",
                ...{ style: {} },
                type: "info",
            }, ...__VLS_functionalComponentArgsRest(__VLS_28));
            __VLS_30.slots.default;
            var __VLS_30;
        }
    }
    var __VLS_26;
    const __VLS_31 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_32 = __VLS_asFunctionalComponent(__VLS_31, new __VLS_31({
        prop: "description",
        label: "描述",
        minWidth: "220",
    }));
    const __VLS_33 = __VLS_32({
        prop: "description",
        label: "描述",
        minWidth: "220",
    }, ...__VLS_functionalComponentArgsRest(__VLS_32));
    const __VLS_35 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_36 = __VLS_asFunctionalComponent(__VLS_35, new __VLS_35({
        label: "绑定用户",
        width: "100",
    }));
    const __VLS_37 = __VLS_36({
        label: "绑定用户",
        width: "100",
    }, ...__VLS_functionalComponentArgsRest(__VLS_36));
    __VLS_38.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_38.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.user_count);
    }
    var __VLS_38;
    const __VLS_39 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
        label: "菜单数",
        width: "90",
    }));
    const __VLS_41 = __VLS_40({
        label: "菜单数",
        width: "90",
    }, ...__VLS_functionalComponentArgsRest(__VLS_40));
    __VLS_42.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_42.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        (row.menu_count);
    }
    var __VLS_42;
    const __VLS_43 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_44 = __VLS_asFunctionalComponent(__VLS_43, new __VLS_43({
        label: "操作",
        width: "200",
        fixed: "right",
    }));
    const __VLS_45 = __VLS_44({
        label: "操作",
        width: "200",
        fixed: "right",
    }, ...__VLS_functionalComponentArgsRest(__VLS_44));
    __VLS_46.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_46.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_47 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "U",
            size: "small",
        }));
        const __VLS_48 = __VLS_47({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "U",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_47));
        let __VLS_50;
        let __VLS_51;
        let __VLS_52;
        const __VLS_53 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingId === null))
                    return;
                __VLS_ctx.openEdit(row.id);
            }
        };
        __VLS_49.slots.default;
        var __VLS_49;
        /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "U",
            size: "small",
            type: (row.is_active ? 'warning' : 'success'),
        }));
        const __VLS_55 = __VLS_54({
            ...{ 'onClick': {} },
            menu: "system.roles",
            op: "U",
            size: "small",
            type: (row.is_active ? 'warning' : 'success'),
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        let __VLS_57;
        let __VLS_58;
        let __VLS_59;
        const __VLS_60 = {
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.editingId === null))
                    return;
                __VLS_ctx.onToggleActive(row);
            }
        };
        __VLS_56.slots.default;
        (row.is_active ? '停用' : '启用');
        var __VLS_56;
    }
    var __VLS_46;
    var __VLS_22;
    var __VLS_3;
}
else {
    const __VLS_61 = {}.ElCard;
    /** @type {[typeof __VLS_components.ElCard, typeof __VLS_components.elCard, typeof __VLS_components.ElCard, typeof __VLS_components.elCard, ]} */ ;
    // @ts-ignore
    const __VLS_62 = __VLS_asFunctionalComponent(__VLS_61, new __VLS_61({}));
    const __VLS_63 = __VLS_62({}, ...__VLS_functionalComponentArgsRest(__VLS_62));
    __VLS_64.slots.default;
    {
        const { header: __VLS_thisSlot } = __VLS_64.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
        (__VLS_ctx.editingTitle);
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
        const __VLS_65 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_66 = __VLS_asFunctionalComponent(__VLS_65, new __VLS_65({
            ...{ 'onClick': {} },
        }));
        const __VLS_67 = __VLS_66({
            ...{ 'onClick': {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_66));
        let __VLS_69;
        let __VLS_70;
        let __VLS_71;
        const __VLS_72 = {
            onClick: (__VLS_ctx.exitEdit)
        };
        __VLS_68.slots.default;
        var __VLS_68;
        const __VLS_73 = {}.ElButton;
        /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
        // @ts-ignore
        const __VLS_74 = __VLS_asFunctionalComponent(__VLS_73, new __VLS_73({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }));
        const __VLS_75 = __VLS_74({
            ...{ 'onClick': {} },
            type: "primary",
            loading: (__VLS_ctx.saving),
        }, ...__VLS_functionalComponentArgsRest(__VLS_74));
        let __VLS_77;
        let __VLS_78;
        let __VLS_79;
        const __VLS_80 = {
            onClick: (__VLS_ctx.onSave)
        };
        __VLS_76.slots.default;
        var __VLS_76;
    }
    const __VLS_81 = {}.ElForm;
    /** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
    // @ts-ignore
    const __VLS_82 = __VLS_asFunctionalComponent(__VLS_81, new __VLS_81({
        labelPosition: "top",
        inline: true,
    }));
    const __VLS_83 = __VLS_82({
        labelPosition: "top",
        inline: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_82));
    __VLS_84.slots.default;
    const __VLS_85 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_86 = __VLS_asFunctionalComponent(__VLS_85, new __VLS_85({
        label: "角色名",
        required: true,
    }));
    const __VLS_87 = __VLS_86({
        label: "角色名",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_86));
    __VLS_88.slots.default;
    const __VLS_89 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_90 = __VLS_asFunctionalComponent(__VLS_89, new __VLS_89({
        modelValue: (__VLS_ctx.form.name),
        ...{ style: {} },
    }));
    const __VLS_91 = __VLS_90({
        modelValue: (__VLS_ctx.form.name),
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_90));
    var __VLS_88;
    if (__VLS_ctx.editingId !== 'new') {
        const __VLS_93 = {}.ElFormItem;
        /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
        // @ts-ignore
        const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
            label: "状态",
        }));
        const __VLS_95 = __VLS_94({
            label: "状态",
        }, ...__VLS_functionalComponentArgsRest(__VLS_94));
        __VLS_96.slots.default;
        const __VLS_97 = {}.ElSwitch;
        /** @type {[typeof __VLS_components.ElSwitch, typeof __VLS_components.elSwitch, ]} */ ;
        // @ts-ignore
        const __VLS_98 = __VLS_asFunctionalComponent(__VLS_97, new __VLS_97({
            modelValue: (__VLS_ctx.form.is_active),
            activeText: "启用",
            inactiveText: "停用",
        }));
        const __VLS_99 = __VLS_98({
            modelValue: (__VLS_ctx.form.is_active),
            activeText: "启用",
            inactiveText: "停用",
        }, ...__VLS_functionalComponentArgsRest(__VLS_98));
        var __VLS_96;
    }
    const __VLS_101 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_102 = __VLS_asFunctionalComponent(__VLS_101, new __VLS_101({
        label: "描述",
        ...{ style: {} },
    }));
    const __VLS_103 = __VLS_102({
        label: "描述",
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_102));
    __VLS_104.slots.default;
    const __VLS_105 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_106 = __VLS_asFunctionalComponent(__VLS_105, new __VLS_105({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        rows: (2),
        placeholder: "该角色的职责说明",
    }));
    const __VLS_107 = __VLS_106({
        modelValue: (__VLS_ctx.form.description),
        type: "textarea",
        rows: (2),
        placeholder: "该角色的职责说明",
    }, ...__VLS_functionalComponentArgsRest(__VLS_106));
    var __VLS_104;
    var __VLS_84;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    /** @type {[typeof AiCapabilityGrantEditor, ]} */ ;
    // @ts-ignore
    const __VLS_109 = __VLS_asFunctionalComponent(AiCapabilityGrantEditor, new AiCapabilityGrantEditor({
        modelValue: (__VLS_ctx.form.ai_capability_ids),
    }));
    const __VLS_110 = __VLS_109({
        modelValue: (__VLS_ctx.form.ai_capability_ids),
    }, ...__VLS_functionalComponentArgsRest(__VLS_109));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_112 = {}.ElTable;
    /** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
    // @ts-ignore
    const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
        data: (__VLS_ctx.form.matrix),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }));
    const __VLS_114 = __VLS_113({
        data: (__VLS_ctx.form.matrix),
        stripe: true,
        ...{ style: {} },
        maxHeight: "600",
    }, ...__VLS_functionalComponentArgsRest(__VLS_113));
    __VLS_115.slots.default;
    const __VLS_116 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
        label: "菜单",
        minWidth: "260",
    }));
    const __VLS_118 = __VLS_117({
        label: "菜单",
        minWidth: "260",
    }, ...__VLS_functionalComponentArgsRest(__VLS_117));
    __VLS_119.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_119.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (!row.is_leaf) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: (`font-weight: 600; padding-left: ${row.depth * 16}px`) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (row.code);
            (row.label);
        }
        else {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: (`padding-left: ${row.depth * 16}px`) },
            });
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (row.label);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (row.code);
        }
    }
    var __VLS_119;
    const __VLS_120 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
        label: "可访问",
        width: "80",
        align: "center",
    }));
    const __VLS_122 = __VLS_121({
        label: "可访问",
        width: "80",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_121));
    __VLS_123.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_123.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_124 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
                ...{ 'onChange': {} },
                modelValue: (row.enabled),
            }));
            const __VLS_126 = __VLS_125({
                ...{ 'onChange': {} },
                modelValue: (row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_125));
            let __VLS_128;
            let __VLS_129;
            let __VLS_130;
            const __VLS_131 = {
                onChange: (() => __VLS_ctx.toggleEnabled(row))
            };
            var __VLS_127;
        }
    }
    var __VLS_123;
    const __VLS_132 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
        label: "数据范围",
        width: "180",
    }));
    const __VLS_134 = __VLS_133({
        label: "数据范围",
        width: "180",
    }, ...__VLS_functionalComponentArgsRest(__VLS_133));
    __VLS_135.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_135.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_136 = {}.ElSelect;
            /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
            // @ts-ignore
            const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
                modelValue: (row.scope_dimension),
                disabled: (!row.enabled),
                size: "small",
            }));
            const __VLS_138 = __VLS_137({
                modelValue: (row.scope_dimension),
                disabled: (!row.enabled),
                size: "small",
            }, ...__VLS_functionalComponentArgsRest(__VLS_137));
            __VLS_139.slots.default;
            const __VLS_140 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
                label: "不限",
                value: "none",
            }));
            const __VLS_142 = __VLS_141({
                label: "不限",
                value: "none",
            }, ...__VLS_functionalComponentArgsRest(__VLS_141));
            const __VLS_144 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
                label: "成本中心",
                value: "cost_center",
            }));
            const __VLS_146 = __VLS_145({
                label: "成本中心",
                value: "cost_center",
            }, ...__VLS_functionalComponentArgsRest(__VLS_145));
            const __VLS_148 = {}.ElOption;
            /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
            // @ts-ignore
            const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
                label: "组织架构",
                value: "org",
            }));
            const __VLS_150 = __VLS_149({
                label: "组织架构",
                value: "org",
            }, ...__VLS_functionalComponentArgsRest(__VLS_149));
            var __VLS_139;
        }
    }
    var __VLS_135;
    const __VLS_152 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
        label: "增",
        width: "60",
        align: "center",
    }));
    const __VLS_154 = __VLS_153({
        label: "增",
        width: "60",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_153));
    __VLS_155.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_155.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_156 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_157 = __VLS_asFunctionalComponent(__VLS_156, new __VLS_156({
                modelValue: (row.can_create),
                disabled: (!row.enabled),
            }));
            const __VLS_158 = __VLS_157({
                modelValue: (row.can_create),
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_157));
        }
    }
    var __VLS_155;
    const __VLS_160 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_161 = __VLS_asFunctionalComponent(__VLS_160, new __VLS_160({
        label: "改",
        width: "60",
        align: "center",
    }));
    const __VLS_162 = __VLS_161({
        label: "改",
        width: "60",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_161));
    __VLS_163.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_163.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_164 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
                modelValue: (row.can_update),
                disabled: (!row.enabled),
            }));
            const __VLS_166 = __VLS_165({
                modelValue: (row.can_update),
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_165));
        }
    }
    var __VLS_163;
    const __VLS_168 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_169 = __VLS_asFunctionalComponent(__VLS_168, new __VLS_168({
        label: "删",
        width: "60",
        align: "center",
    }));
    const __VLS_170 = __VLS_169({
        label: "删",
        width: "60",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_169));
    __VLS_171.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_171.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_172 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_173 = __VLS_asFunctionalComponent(__VLS_172, new __VLS_172({
                modelValue: (row.can_delete),
                disabled: (!row.enabled),
            }));
            const __VLS_174 = __VLS_173({
                modelValue: (row.can_delete),
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_173));
        }
    }
    var __VLS_171;
    const __VLS_176 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(__VLS_176, new __VLS_176({
        label: "导出",
        width: "60",
        align: "center",
    }));
    const __VLS_178 = __VLS_177({
        label: "导出",
        width: "60",
        align: "center",
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    __VLS_179.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_179.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_180 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_181 = __VLS_asFunctionalComponent(__VLS_180, new __VLS_180({
                modelValue: (row.can_export),
                disabled: (!row.enabled),
            }));
            const __VLS_182 = __VLS_181({
                modelValue: (row.can_export),
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_181));
        }
    }
    var __VLS_179;
    const __VLS_184 = {}.ElTableColumn;
    /** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
    // @ts-ignore
    const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
        label: "批量",
        width: "140",
    }));
    const __VLS_186 = __VLS_185({
        label: "批量",
        width: "140",
    }, ...__VLS_functionalComponentArgsRest(__VLS_185));
    __VLS_187.slots.default;
    {
        const { default: __VLS_thisSlot } = __VLS_187.slots;
        const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
        if (row.is_leaf) {
            const __VLS_188 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_189 = __VLS_asFunctionalComponent(__VLS_188, new __VLS_188({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                disabled: (!row.enabled),
            }));
            const __VLS_190 = __VLS_189({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_189));
            let __VLS_192;
            let __VLS_193;
            let __VLS_194;
            const __VLS_195 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.editingId === null))
                        return;
                    if (!(row.is_leaf))
                        return;
                    __VLS_ctx.onSelectAllOps(row, true);
                }
            };
            __VLS_191.slots.default;
            var __VLS_191;
            const __VLS_196 = {}.ElButton;
            /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
            // @ts-ignore
            const __VLS_197 = __VLS_asFunctionalComponent(__VLS_196, new __VLS_196({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                disabled: (!row.enabled),
            }));
            const __VLS_198 = __VLS_197({
                ...{ 'onClick': {} },
                link: true,
                size: "small",
                disabled: (!row.enabled),
            }, ...__VLS_functionalComponentArgsRest(__VLS_197));
            let __VLS_200;
            let __VLS_201;
            let __VLS_202;
            const __VLS_203 = {
                onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.editingId === null))
                        return;
                    if (!(row.is_leaf))
                        return;
                    __VLS_ctx.onSelectAllOps(row, false);
                }
            };
            __VLS_199.slots.default;
            var __VLS_199;
        }
    }
    var __VLS_187;
    var __VLS_115;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_204 = {}.ElTooltip;
    /** @type {[typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, typeof __VLS_components.ElTooltip, typeof __VLS_components.elTooltip, ]} */ ;
    // @ts-ignore
    const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
        placement: "top",
    }));
    const __VLS_206 = __VLS_205({
        placement: "top",
    }, ...__VLS_functionalComponentArgsRest(__VLS_205));
    __VLS_207.slots.default;
    {
        const { content: __VLS_thisSlot } = __VLS_207.slots;
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.code, __VLS_intrinsicElements.code)({});
        __VLS_asFunctionalElement(__VLS_intrinsicElements.br)({});
    }
    const __VLS_208 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_209 = __VLS_asFunctionalComponent(__VLS_208, new __VLS_208({
        ...{ style: {} },
    }));
    const __VLS_210 = __VLS_209({
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_209));
    __VLS_211.slots.default;
    const __VLS_212 = {}.InfoFilled;
    /** @type {[typeof __VLS_components.InfoFilled, ]} */ ;
    // @ts-ignore
    const __VLS_213 = __VLS_asFunctionalComponent(__VLS_212, new __VLS_212({}));
    const __VLS_214 = __VLS_213({}, ...__VLS_functionalComponentArgsRest(__VLS_213));
    var __VLS_211;
    var __VLS_207;
    if (__VLS_ctx.allCategories.length === 0) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    }
    else {
        const __VLS_216 = {}.ElCheckboxGroup;
        /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
        // @ts-ignore
        const __VLS_217 = __VLS_asFunctionalComponent(__VLS_216, new __VLS_216({
            modelValue: (__VLS_ctx.selectedCategoryIds),
        }));
        const __VLS_218 = __VLS_217({
            modelValue: (__VLS_ctx.selectedCategoryIds),
        }, ...__VLS_functionalComponentArgsRest(__VLS_217));
        __VLS_219.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allCategories))) {
            const __VLS_220 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_221 = __VLS_asFunctionalComponent(__VLS_220, new __VLS_220({
                key: (c.id),
                value: (c.id),
                ...{ style: {} },
            }));
            const __VLS_222 = __VLS_221({
                key: (c.id),
                value: (c.id),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_221));
            __VLS_223.slots.default;
            (c.name);
            if (c.is_sensitive) {
                const __VLS_224 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }));
                const __VLS_226 = __VLS_225({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_225));
                __VLS_227.slots.default;
                var __VLS_227;
            }
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (c.field_count);
            var __VLS_223;
        }
        var __VLS_219;
    }
    var __VLS_64;
}
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            InfoFilled: InfoFilled,
            PermissionButton: PermissionButton,
            AiCapabilityGrantEditor: AiCapabilityGrantEditor,
            list: list,
            loading: loading,
            allCategories: allCategories,
            selectedCategoryIds: selectedCategoryIds,
            editingId: editingId,
            form: form,
            saving: saving,
            editingTitle: editingTitle,
            openCreate: openCreate,
            openEdit: openEdit,
            exitEdit: exitEdit,
            onSave: onSave,
            onToggleActive: onToggleActive,
            toggleEnabled: toggleEnabled,
            onSelectAllOps: onSelectAllOps,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
