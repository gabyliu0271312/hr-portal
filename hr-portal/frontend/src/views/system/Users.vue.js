/// <reference types="../../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { onMounted, reactive, ref, computed, h } from 'vue';
import { ElInput, ElMessage, ElMessageBox } from 'element-plus';
import { Plus } from '@element-plus/icons-vue';
import PermissionButton from '@/components/PermissionButton.vue';
import AiCapabilityGrantEditor from '@/components/system/AiCapabilityGrantEditor.vue';
import { usersApi } from '@/api/users';
import { scopesApi } from '@/api/scopes';
import { fieldCategoriesApi } from '@/api/field_categories';
import { formatDateTime } from '@/utils/datetime';
import { rolesApi } from '@/api/roles';
import { PASSWORD_POLICY_HINT, generateStrongPassword, validatePasswordPolicy, } from '@/utils/passwordPolicy';
const query = reactive({
    q: '',
    is_active: '',
    role_id: '',
    page: 1,
    page_size: 20,
});
const loading = ref(false);
const list = ref([]);
const total = ref(0);
const roles = ref([]);
async function loadRoles() {
    try {
        const resp = await rolesApi.list();
        roles.value = resp.items;
    }
    catch {
        /* 角色列表载入失败不阻塞 */
    }
}
async function load() {
    loading.value = true;
    try {
        const params = {
            page: query.page,
            page_size: query.page_size,
        };
        if (query.q)
            params.q = query.q;
        if (query.is_active !== '')
            params.is_active = query.is_active === 'true';
        if (query.role_id !== '')
            params.role_id = query.role_id;
        const resp = await usersApi.list(params);
        list.value = resp.items;
        total.value = resp.total;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
    finally {
        loading.value = false;
    }
}
function onSearch() {
    query.page = 1;
    load();
}
function resetFilter() {
    query.q = '';
    query.is_active = '';
    query.role_id = '';
    onSearch();
}
const drawerOpen = ref(false);
const drawerMode = ref('create');
const editing = ref(null);
const form = reactive({
    login_name: '',
    display_name: '',
    email: '',
    password: '',
    role_ids: [],
    ai_capability_ids: [],
});
const saving = ref(false);
function openCreate() {
    drawerMode.value = 'create';
    editing.value = null;
    Object.assign(form, {
        login_name: '',
        display_name: '',
        email: '',
        password: generateStrongPassword(),
        role_ids: [],
        ai_capability_ids: [],
    });
    drawerOpen.value = true;
}
async function openEdit(id) {
    drawerMode.value = 'edit';
    try {
        const detail = await usersApi.get(id);
        editing.value = detail;
        Object.assign(form, {
            login_name: detail.login_name,
            display_name: detail.display_name,
            email: detail.email || '',
            password: '',
            role_ids: [...detail.role_ids],
            ai_capability_ids: [...detail.ai_capability_ids],
        });
        drawerOpen.value = true;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '加载失败');
    }
}
async function onSave() {
    // 创建模式的前置校验
    if (drawerMode.value === 'create') {
        if (!form.login_name || !form.display_name || !form.password) {
            ElMessage.warning('登录名、姓名、密码为必填');
            return;
        }
        if (!/^[a-zA-Z0-9_.\-]{3,64}$/.test(form.login_name)) {
            ElMessage.warning('登录名只能含字母/数字/._-，长度 3~64');
            return;
        }
        const passwordError = validatePasswordPolicy(form.password);
        if (passwordError) {
            ElMessage.warning(passwordError);
            return;
        }
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
        ElMessage.warning('邮箱格式不正确');
        return;
    }
    saving.value = true;
    try {
        if (drawerMode.value === 'create') {
            await usersApi.create({
                login_name: form.login_name,
                display_name: form.display_name,
                email: form.email || null,
                password: form.password,
                role_ids: form.role_ids,
                ai_capability_ids: form.ai_capability_ids,
            });
            ElMessage.success('用户已创建');
        }
        else if (editing.value) {
            await usersApi.update(editing.value.id, {
                display_name: form.display_name,
                email: form.email || null,
                ai_capability_ids: form.ai_capability_ids,
            });
            await usersApi.setRoles(editing.value.id, form.role_ids);
            ElMessage.success('用户信息已更新');
        }
        drawerOpen.value = false;
        load();
    }
    catch (e) {
        const detail = e?.response?.data?.detail;
        ElMessage.error(typeof detail === 'string' ? detail : '保存失败');
    }
    finally {
        saving.value = false;
    }
}
async function onToggleActive(row) {
    const action = row.is_active ? '禁用' : '启用';
    try {
        await ElMessageBox.confirm(`确定${action}用户 "${row.display_name}"？`, '提示', {
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
            await usersApi.deactivate(row.id);
        else
            await usersApi.activate(row.id);
        ElMessage.success(`已${action}`);
        load();
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || `${action}失败`);
    }
}
async function onResetPassword(row) {
    const newPassword = ref(generateStrongPassword());
    try {
        await ElMessageBox({
            title: '重置密码',
            message: () => h('div', { class: 'reset-password-box' }, [
                h('div', { class: 'reset-password-title' }, `重置 "${row.display_name}" 的密码`),
                h(ElInput, {
                    modelValue: newPassword.value,
                    'onUpdate:modelValue': (value) => {
                        newPassword.value = value;
                    },
                    type: 'password',
                    showPassword: true,
                    placeholder: PASSWORD_POLICY_HINT,
                }),
                h('div', { class: 'reset-password-hint' }, `密码要求：${PASSWORD_POLICY_HINT}`),
            ]),
            confirmButtonText: '重置',
            cancelButtonText: '取消',
            showCancelButton: true,
            beforeClose: (action, instance, done) => {
                if (action !== 'confirm') {
                    done();
                    return;
                }
                const passwordError = validatePasswordPolicy(newPassword.value);
                if (passwordError) {
                    ElMessage.warning(passwordError);
                    return;
                }
                done();
            },
        });
        await usersApi.resetPassword(row.id, newPassword.value);
        ElMessage.success('密码已重置');
    }
    catch (e) {
        if (e === 'cancel' || e?.message === 'cancel')
            return;
        ElMessage.error(e?.response?.data?.detail || '重置失败');
    }
}
const lockedHint = (row) => {
    if (!row.locked_until)
        return '';
    const until = new Date(row.locked_until);
    if (until <= new Date())
        return '';
    return `锁定至 ${formatDateTime(row.locked_until)}`;
};
onMounted(() => {
    loadRoles();
    loadAllTags();
    load();
});
// ===== 标签分配 =====
const allTags = ref([]);
const tagsDrawerOpen = ref(false);
const tagsTarget = ref(null);
const selectedTagIds = ref([]);
const tagsSaving = ref(false);
const allCategories = ref([]);
const selectedCategoryIds = ref([]);
const groupedTags = computed(() => {
    const groups = [
        { label: '成本中心维度', items: [] },
        { label: '组织维度', items: [] },
    ];
    for (const t of allTags.value) {
        if (t.dimension === 'cost_center')
            groups[0].items.push(t);
        else if (t.dimension === 'org')
            groups[1].items.push(t);
    }
    return groups;
});
function tagSummary(t) {
    const parts = [];
    if (t.org_scope_enabled) {
        parts.push(t.org_scope_unlimited ? '组织不限' : `组织 ${t.selections.length} 节点`);
    }
    if (t.person_scope_enabled) {
        parts.push(`人员 ${t.filters.length} 条筛选`);
    }
    return parts.length ? `（${parts.join(' / ')}）` : '';
}
const MAX_SCOPE_TAGS = 3;
const visibleScopeNames = (names) => names.slice(0, MAX_SCOPE_TAGS);
const hiddenScopeCount = (names) => Math.max(0, names.length - MAX_SCOPE_TAGS);
async function loadAllTags() {
    try {
        allTags.value = await scopesApi.list();
    }
    catch {
        allTags.value = [];
    }
}
async function openTags(row) {
    tagsTarget.value = row;
    tagsDrawerOpen.value = true;
    try {
        const tags = await scopesApi.userTags(row.id);
        selectedTagIds.value = tags.map((t) => t.id);
    }
    catch {
        selectedTagIds.value = [];
    }
    try {
        allCategories.value = await fieldCategoriesApi.list();
        selectedCategoryIds.value = await fieldCategoriesApi.getUserVisible(row.id);
    }
    catch {
        allCategories.value = [];
        selectedCategoryIds.value = [];
    }
}
async function saveTags() {
    if (!tagsTarget.value)
        return;
    tagsSaving.value = true;
    try {
        await scopesApi.assignUserTags(tagsTarget.value.id, selectedTagIds.value);
        await fieldCategoriesApi
            .setUserVisible(tagsTarget.value.id, selectedCategoryIds.value)
            .catch(() => { });
        ElMessage.success('已保存');
        tagsDrawerOpen.value = false;
    }
    catch (e) {
        ElMessage.error(e?.response?.data?.detail || '保存失败');
    }
    finally {
        tagsSaving.value = false;
    }
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
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
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ style: {} },
    });
    (__VLS_ctx.total);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_4 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "C",
        type: "primary",
    }));
    const __VLS_5 = __VLS_4({
        ...{ 'onClick': {} },
        menu: "system.users",
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
const __VLS_19 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_20 = __VLS_asFunctionalComponent(__VLS_19, new __VLS_19({
    inline: true,
    ...{ style: {} },
}));
const __VLS_21 = __VLS_20({
    inline: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_20));
__VLS_22.slots.default;
const __VLS_23 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_24 = __VLS_asFunctionalComponent(__VLS_23, new __VLS_23({}));
const __VLS_25 = __VLS_24({}, ...__VLS_functionalComponentArgsRest(__VLS_24));
__VLS_26.slots.default;
const __VLS_27 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_28 = __VLS_asFunctionalComponent(__VLS_27, new __VLS_27({
    ...{ 'onChange': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.query.q),
    placeholder: "姓名/管理单元/账号",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_29 = __VLS_28({
    ...{ 'onChange': {} },
    ...{ 'onKeyup': {} },
    modelValue: (__VLS_ctx.query.q),
    placeholder: "姓名/管理单元/账号",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_28));
let __VLS_31;
let __VLS_32;
let __VLS_33;
const __VLS_34 = {
    onChange: (__VLS_ctx.onSearch)
};
const __VLS_35 = {
    onKeyup: (__VLS_ctx.onSearch)
};
var __VLS_30;
var __VLS_26;
const __VLS_36 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_39.slots.default;
const __VLS_40 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.query.role_id),
    placeholder: "角色",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_42 = __VLS_41({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.query.role_id),
    placeholder: "角色",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_41));
let __VLS_44;
let __VLS_45;
let __VLS_46;
const __VLS_47 = {
    onChange: (__VLS_ctx.onSearch)
};
__VLS_43.slots.default;
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.roles))) {
    const __VLS_48 = {}.ElOption;
    /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
    // @ts-ignore
    const __VLS_49 = __VLS_asFunctionalComponent(__VLS_48, new __VLS_48({
        key: (r.id),
        label: (r.name),
        value: (r.id),
    }));
    const __VLS_50 = __VLS_49({
        key: (r.id),
        label: (r.name),
        value: (r.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_49));
}
var __VLS_43;
var __VLS_39;
const __VLS_52 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_53 = __VLS_asFunctionalComponent(__VLS_52, new __VLS_52({}));
const __VLS_54 = __VLS_53({}, ...__VLS_functionalComponentArgsRest(__VLS_53));
__VLS_55.slots.default;
const __VLS_56 = {}.ElSelect;
/** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
// @ts-ignore
const __VLS_57 = __VLS_asFunctionalComponent(__VLS_56, new __VLS_56({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.query.is_active),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}));
const __VLS_58 = __VLS_57({
    ...{ 'onChange': {} },
    modelValue: (__VLS_ctx.query.is_active),
    placeholder: "状态",
    clearable: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_57));
let __VLS_60;
let __VLS_61;
let __VLS_62;
const __VLS_63 = {
    onChange: (__VLS_ctx.onSearch)
};
__VLS_59.slots.default;
const __VLS_64 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    label: "启用",
    value: "true",
}));
const __VLS_66 = __VLS_65({
    label: "启用",
    value: "true",
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const __VLS_68 = {}.ElOption;
/** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
// @ts-ignore
const __VLS_69 = __VLS_asFunctionalComponent(__VLS_68, new __VLS_68({
    label: "禁用",
    value: "false",
}));
const __VLS_70 = __VLS_69({
    label: "禁用",
    value: "false",
}, ...__VLS_functionalComponentArgsRest(__VLS_69));
var __VLS_59;
var __VLS_55;
const __VLS_72 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_73 = __VLS_asFunctionalComponent(__VLS_72, new __VLS_72({}));
const __VLS_74 = __VLS_73({}, ...__VLS_functionalComponentArgsRest(__VLS_73));
__VLS_75.slots.default;
const __VLS_76 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_77 = __VLS_asFunctionalComponent(__VLS_76, new __VLS_76({
    ...{ 'onClick': {} },
}));
const __VLS_78 = __VLS_77({
    ...{ 'onClick': {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_77));
let __VLS_80;
let __VLS_81;
let __VLS_82;
const __VLS_83 = {
    onClick: (__VLS_ctx.onSearch)
};
__VLS_79.slots.default;
var __VLS_79;
const __VLS_84 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_85 = __VLS_asFunctionalComponent(__VLS_84, new __VLS_84({
    ...{ 'onClick': {} },
    link: true,
}));
const __VLS_86 = __VLS_85({
    ...{ 'onClick': {} },
    link: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_85));
let __VLS_88;
let __VLS_89;
let __VLS_90;
const __VLS_91 = {
    onClick: (__VLS_ctx.resetFilter)
};
__VLS_87.slots.default;
var __VLS_87;
var __VLS_75;
var __VLS_22;
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
    ...{ style: {} },
});
const __VLS_92 = {}.ElTable;
/** @type {[typeof __VLS_components.ElTable, typeof __VLS_components.elTable, typeof __VLS_components.ElTable, typeof __VLS_components.elTable, ]} */ ;
// @ts-ignore
const __VLS_93 = __VLS_asFunctionalComponent(__VLS_92, new __VLS_92({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}));
const __VLS_94 = __VLS_93({
    data: (__VLS_ctx.list),
    stripe: true,
    ...{ style: {} },
    maxHeight: "600",
}, ...__VLS_functionalComponentArgsRest(__VLS_93));
__VLS_asFunctionalDirective(__VLS_directives.vLoading)(null, { ...__VLS_directiveBindingRestFields, value: (__VLS_ctx.loading) }, null, null);
__VLS_95.slots.default;
const __VLS_96 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_97 = __VLS_asFunctionalComponent(__VLS_96, new __VLS_96({
    prop: "display_name",
    label: "姓名",
    minWidth: "120",
}));
const __VLS_98 = __VLS_97({
    prop: "display_name",
    label: "姓名",
    minWidth: "120",
}, ...__VLS_functionalComponentArgsRest(__VLS_97));
const __VLS_100 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_101 = __VLS_asFunctionalComponent(__VLS_100, new __VLS_100({
    label: "组织管理单元",
    minWidth: "220",
}));
const __VLS_102 = __VLS_101({
    label: "组织管理单元",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_101));
__VLS_103.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_103.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.org_scope_names.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "scope-tag-list" },
        });
        for (const [name] of __VLS_getVForSourceType((__VLS_ctx.visibleScopeNames(row.org_scope_names)))) {
            const __VLS_104 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
                key: (name),
                size: "small",
                effect: "plain",
            }));
            const __VLS_106 = __VLS_105({
                key: (name),
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_105));
            __VLS_107.slots.default;
            (name);
            var __VLS_107;
        }
        if (__VLS_ctx.hiddenScopeCount(row.org_scope_names)) {
            const __VLS_108 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_109 = __VLS_asFunctionalComponent(__VLS_108, new __VLS_108({
                size: "small",
                type: "info",
                effect: "plain",
            }));
            const __VLS_110 = __VLS_109({
                size: "small",
                type: "info",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_109));
            __VLS_111.slots.default;
            (__VLS_ctx.hiddenScopeCount(row.org_scope_names));
            var __VLS_111;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty-text" },
        });
    }
}
var __VLS_103;
const __VLS_112 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
    label: "成本中心管理单元",
    minWidth: "220",
}));
const __VLS_114 = __VLS_113({
    label: "成本中心管理单元",
    minWidth: "220",
}, ...__VLS_functionalComponentArgsRest(__VLS_113));
__VLS_115.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_115.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (row.cost_center_scope_names.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "scope-tag-list" },
        });
        for (const [name] of __VLS_getVForSourceType((__VLS_ctx.visibleScopeNames(row.cost_center_scope_names)))) {
            const __VLS_116 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_117 = __VLS_asFunctionalComponent(__VLS_116, new __VLS_116({
                key: (name),
                size: "small",
                effect: "plain",
            }));
            const __VLS_118 = __VLS_117({
                key: (name),
                size: "small",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_117));
            __VLS_119.slots.default;
            (name);
            var __VLS_119;
        }
        if (__VLS_ctx.hiddenScopeCount(row.cost_center_scope_names)) {
            const __VLS_120 = {}.ElTag;
            /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
            // @ts-ignore
            const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
                size: "small",
                type: "info",
                effect: "plain",
            }));
            const __VLS_122 = __VLS_121({
                size: "small",
                type: "info",
                effect: "plain",
            }, ...__VLS_functionalComponentArgsRest(__VLS_121));
            __VLS_123.slots.default;
            (__VLS_ctx.hiddenScopeCount(row.cost_center_scope_names));
            var __VLS_123;
        }
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty-text" },
        });
    }
}
var __VLS_115;
const __VLS_124 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_125 = __VLS_asFunctionalComponent(__VLS_124, new __VLS_124({
    label: "角色",
    minWidth: "160",
}));
const __VLS_126 = __VLS_125({
    label: "角色",
    minWidth: "160",
}, ...__VLS_functionalComponentArgsRest(__VLS_125));
__VLS_127.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_127.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    for (const [rn] of __VLS_getVForSourceType((row.role_names))) {
        const __VLS_128 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            key: (rn),
            size: "small",
            ...{ style: {} },
        }));
        const __VLS_130 = __VLS_129({
            key: (rn),
            size: "small",
            ...{ style: {} },
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        __VLS_131.slots.default;
        (rn);
        var __VLS_131;
    }
    if (!row.role_names.length) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ class: "empty-text" },
        });
    }
}
var __VLS_127;
const __VLS_132 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_133 = __VLS_asFunctionalComponent(__VLS_132, new __VLS_132({
    label: "状态",
    width: "90",
}));
const __VLS_134 = __VLS_133({
    label: "状态",
    width: "90",
}, ...__VLS_functionalComponentArgsRest(__VLS_133));
__VLS_135.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_135.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    if (!row.is_active) {
        const __VLS_136 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({
            type: "danger",
            size: "small",
        }));
        const __VLS_138 = __VLS_137({
            type: "danger",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_137));
        __VLS_139.slots.default;
        var __VLS_139;
    }
    else if (__VLS_ctx.lockedHint(row)) {
        const __VLS_140 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_141 = __VLS_asFunctionalComponent(__VLS_140, new __VLS_140({
            type: "warning",
            size: "small",
            title: (__VLS_ctx.lockedHint(row)),
        }));
        const __VLS_142 = __VLS_141({
            type: "warning",
            size: "small",
            title: (__VLS_ctx.lockedHint(row)),
        }, ...__VLS_functionalComponentArgsRest(__VLS_141));
        __VLS_143.slots.default;
        var __VLS_143;
    }
    else {
        const __VLS_144 = {}.ElTag;
        /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
        // @ts-ignore
        const __VLS_145 = __VLS_asFunctionalComponent(__VLS_144, new __VLS_144({
            type: "success",
            size: "small",
        }));
        const __VLS_146 = __VLS_145({
            type: "success",
            size: "small",
        }, ...__VLS_functionalComponentArgsRest(__VLS_145));
        __VLS_147.slots.default;
        var __VLS_147;
    }
}
var __VLS_135;
const __VLS_148 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_149 = __VLS_asFunctionalComponent(__VLS_148, new __VLS_148({
    label: "上次登录",
    minWidth: "150",
}));
const __VLS_150 = __VLS_149({
    label: "上次登录",
    minWidth: "150",
}, ...__VLS_functionalComponentArgsRest(__VLS_149));
__VLS_151.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_151.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    (row.last_login_at ? __VLS_ctx.formatDateTime(row.last_login_at) : '—');
}
var __VLS_151;
const __VLS_152 = {}.ElTableColumn;
/** @type {[typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, typeof __VLS_components.ElTableColumn, typeof __VLS_components.elTableColumn, ]} */ ;
// @ts-ignore
const __VLS_153 = __VLS_asFunctionalComponent(__VLS_152, new __VLS_152({
    label: "操作",
    width: "360",
    fixed: "right",
}));
const __VLS_154 = __VLS_153({
    label: "操作",
    width: "360",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_153));
__VLS_155.slots.default;
{
    const { default: __VLS_thisSlot } = __VLS_155.slots;
    const [{ row }] = __VLS_getSlotParams(__VLS_thisSlot);
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_156 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
    }));
    const __VLS_157 = __VLS_156({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_156));
    let __VLS_159;
    let __VLS_160;
    let __VLS_161;
    const __VLS_162 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openEdit(row.id);
        }
    };
    __VLS_158.slots.default;
    var __VLS_158;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_163 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
    }));
    const __VLS_164 = __VLS_163({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
    }, ...__VLS_functionalComponentArgsRest(__VLS_163));
    let __VLS_166;
    let __VLS_167;
    let __VLS_168;
    const __VLS_169 = {
        onClick: (...[$event]) => {
            __VLS_ctx.openTags(row);
        }
    };
    __VLS_165.slots.default;
    var __VLS_165;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_170 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
        type: "info",
    }));
    const __VLS_171 = __VLS_170({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
        type: "info",
    }, ...__VLS_functionalComponentArgsRest(__VLS_170));
    let __VLS_173;
    let __VLS_174;
    let __VLS_175;
    const __VLS_176 = {
        onClick: (...[$event]) => {
            __VLS_ctx.onResetPassword(row);
        }
    };
    __VLS_172.slots.default;
    var __VLS_172;
    /** @type {[typeof PermissionButton, typeof PermissionButton, ]} */ ;
    // @ts-ignore
    const __VLS_177 = __VLS_asFunctionalComponent(PermissionButton, new PermissionButton({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
        type: (row.is_active ? 'warning' : 'success'),
    }));
    const __VLS_178 = __VLS_177({
        ...{ 'onClick': {} },
        menu: "system.users",
        op: "U",
        size: "small",
        type: (row.is_active ? 'warning' : 'success'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_177));
    let __VLS_180;
    let __VLS_181;
    let __VLS_182;
    const __VLS_183 = {
        onClick: (...[$event]) => {
            __VLS_ctx.onToggleActive(row);
        }
    };
    __VLS_179.slots.default;
    (row.is_active ? '禁用' : '启用');
    var __VLS_179;
}
var __VLS_155;
var __VLS_95;
const __VLS_184 = {}.ElPagination;
/** @type {[typeof __VLS_components.ElPagination, typeof __VLS_components.elPagination, ]} */ ;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ style: {} },
    currentPage: (__VLS_ctx.query.page),
    pageSize: (__VLS_ctx.query.page_size),
    total: (__VLS_ctx.total),
    pageSizes: ([10, 20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}));
const __VLS_186 = __VLS_185({
    ...{ 'onCurrentChange': {} },
    ...{ 'onSizeChange': {} },
    ...{ style: {} },
    currentPage: (__VLS_ctx.query.page),
    pageSize: (__VLS_ctx.query.page_size),
    total: (__VLS_ctx.total),
    pageSizes: ([10, 20, 50, 100]),
    layout: "total, sizes, prev, pager, next, jumper",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
let __VLS_188;
let __VLS_189;
let __VLS_190;
const __VLS_191 = {
    onCurrentChange: (__VLS_ctx.load)
};
const __VLS_192 = {
    onSizeChange: (__VLS_ctx.load)
};
var __VLS_187;
var __VLS_3;
const __VLS_193 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_194 = __VLS_asFunctionalComponent(__VLS_193, new __VLS_193({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.drawerMode === 'create' ? '新建用户' : `编辑用户 · ${__VLS_ctx.editing?.display_name}`),
    direction: "rtl",
    size: "480px",
}));
const __VLS_195 = __VLS_194({
    modelValue: (__VLS_ctx.drawerOpen),
    title: (__VLS_ctx.drawerMode === 'create' ? '新建用户' : `编辑用户 · ${__VLS_ctx.editing?.display_name}`),
    direction: "rtl",
    size: "480px",
}, ...__VLS_functionalComponentArgsRest(__VLS_194));
__VLS_196.slots.default;
const __VLS_197 = {}.ElForm;
/** @type {[typeof __VLS_components.ElForm, typeof __VLS_components.elForm, typeof __VLS_components.ElForm, typeof __VLS_components.elForm, ]} */ ;
// @ts-ignore
const __VLS_198 = __VLS_asFunctionalComponent(__VLS_197, new __VLS_197({
    labelPosition: "top",
}));
const __VLS_199 = __VLS_198({
    labelPosition: "top",
}, ...__VLS_functionalComponentArgsRest(__VLS_198));
__VLS_200.slots.default;
const __VLS_201 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_202 = __VLS_asFunctionalComponent(__VLS_201, new __VLS_201({
    label: "登录名",
    required: true,
}));
const __VLS_203 = __VLS_202({
    label: "登录名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_202));
__VLS_204.slots.default;
const __VLS_205 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_206 = __VLS_asFunctionalComponent(__VLS_205, new __VLS_205({
    modelValue: (__VLS_ctx.form.login_name),
    disabled: (__VLS_ctx.drawerMode === 'edit'),
    placeholder: "3-64 位，字母/数字/. _ -",
}));
const __VLS_207 = __VLS_206({
    modelValue: (__VLS_ctx.form.login_name),
    disabled: (__VLS_ctx.drawerMode === 'edit'),
    placeholder: "3-64 位，字母/数字/. _ -",
}, ...__VLS_functionalComponentArgsRest(__VLS_206));
var __VLS_204;
const __VLS_209 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    label: "姓名",
    required: true,
}));
const __VLS_211 = __VLS_210({
    label: "姓名",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
__VLS_212.slots.default;
const __VLS_213 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_214 = __VLS_asFunctionalComponent(__VLS_213, new __VLS_213({
    modelValue: (__VLS_ctx.form.display_name),
    placeholder: "显示在系统中的名字",
}));
const __VLS_215 = __VLS_214({
    modelValue: (__VLS_ctx.form.display_name),
    placeholder: "显示在系统中的名字",
}, ...__VLS_functionalComponentArgsRest(__VLS_214));
var __VLS_212;
const __VLS_217 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_218 = __VLS_asFunctionalComponent(__VLS_217, new __VLS_217({
    label: "邮箱",
}));
const __VLS_219 = __VLS_218({
    label: "邮箱",
}, ...__VLS_functionalComponentArgsRest(__VLS_218));
__VLS_220.slots.default;
const __VLS_221 = {}.ElInput;
/** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
// @ts-ignore
const __VLS_222 = __VLS_asFunctionalComponent(__VLS_221, new __VLS_221({
    modelValue: (__VLS_ctx.form.email),
    placeholder: "可选",
}));
const __VLS_223 = __VLS_222({
    modelValue: (__VLS_ctx.form.email),
    placeholder: "可选",
}, ...__VLS_functionalComponentArgsRest(__VLS_222));
var __VLS_220;
if (__VLS_ctx.drawerMode === 'create') {
    const __VLS_225 = {}.ElFormItem;
    /** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
    // @ts-ignore
    const __VLS_226 = __VLS_asFunctionalComponent(__VLS_225, new __VLS_225({
        label: "初始密码",
        required: true,
    }));
    const __VLS_227 = __VLS_226({
        label: "初始密码",
        required: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_226));
    __VLS_228.slots.default;
    const __VLS_229 = {}.ElInput;
    /** @type {[typeof __VLS_components.ElInput, typeof __VLS_components.elInput, ]} */ ;
    // @ts-ignore
    const __VLS_230 = __VLS_asFunctionalComponent(__VLS_229, new __VLS_229({
        modelValue: (__VLS_ctx.form.password),
        type: "password",
        showPassword: true,
        placeholder: (__VLS_ctx.PASSWORD_POLICY_HINT),
    }));
    const __VLS_231 = __VLS_230({
        modelValue: (__VLS_ctx.form.password),
        type: "password",
        showPassword: true,
        placeholder: (__VLS_ctx.PASSWORD_POLICY_HINT),
    }, ...__VLS_functionalComponentArgsRest(__VLS_230));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "password-hint" },
    });
    (__VLS_ctx.PASSWORD_POLICY_HINT);
    var __VLS_228;
}
const __VLS_233 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_234 = __VLS_asFunctionalComponent(__VLS_233, new __VLS_233({
    label: "角色",
}));
const __VLS_235 = __VLS_234({
    label: "角色",
}, ...__VLS_functionalComponentArgsRest(__VLS_234));
__VLS_236.slots.default;
const __VLS_237 = {}.ElCheckboxGroup;
/** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
// @ts-ignore
const __VLS_238 = __VLS_asFunctionalComponent(__VLS_237, new __VLS_237({
    modelValue: (__VLS_ctx.form.role_ids),
    ...{ style: {} },
}));
const __VLS_239 = __VLS_238({
    modelValue: (__VLS_ctx.form.role_ids),
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_238));
__VLS_240.slots.default;
for (const [r] of __VLS_getVForSourceType((__VLS_ctx.roles))) {
    const __VLS_241 = {}.ElCheckbox;
    /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
    // @ts-ignore
    const __VLS_242 = __VLS_asFunctionalComponent(__VLS_241, new __VLS_241({
        key: (r.id),
        value: (r.id),
        disabled: (!r.is_active),
    }));
    const __VLS_243 = __VLS_242({
        key: (r.id),
        value: (r.id),
        disabled: (!r.is_active),
    }, ...__VLS_functionalComponentArgsRest(__VLS_242));
    __VLS_244.slots.default;
    (r.name);
    if (!r.is_active) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
            ...{ style: {} },
        });
    }
    var __VLS_244;
}
var __VLS_240;
var __VLS_236;
const __VLS_245 = {}.ElFormItem;
/** @type {[typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, typeof __VLS_components.ElFormItem, typeof __VLS_components.elFormItem, ]} */ ;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
    label: "AI 能力授权",
}));
const __VLS_247 = __VLS_246({
    label: "AI 能力授权",
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
__VLS_248.slots.default;
/** @type {[typeof AiCapabilityGrantEditor, ]} */ ;
// @ts-ignore
const __VLS_249 = __VLS_asFunctionalComponent(AiCapabilityGrantEditor, new AiCapabilityGrantEditor({
    modelValue: (__VLS_ctx.form.ai_capability_ids),
}));
const __VLS_250 = __VLS_249({
    modelValue: (__VLS_ctx.form.ai_capability_ids),
}, ...__VLS_functionalComponentArgsRest(__VLS_249));
var __VLS_248;
var __VLS_200;
{
    const { footer: __VLS_thisSlot } = __VLS_196.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_252 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_253 = __VLS_asFunctionalComponent(__VLS_252, new __VLS_252({
        ...{ 'onClick': {} },
    }));
    const __VLS_254 = __VLS_253({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_253));
    let __VLS_256;
    let __VLS_257;
    let __VLS_258;
    const __VLS_259 = {
        onClick: (...[$event]) => {
            __VLS_ctx.drawerOpen = false;
        }
    };
    __VLS_255.slots.default;
    var __VLS_255;
    const __VLS_260 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }));
    const __VLS_262 = __VLS_261({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.saving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_261));
    let __VLS_264;
    let __VLS_265;
    let __VLS_266;
    const __VLS_267 = {
        onClick: (__VLS_ctx.onSave)
    };
    __VLS_263.slots.default;
    (__VLS_ctx.drawerMode === 'create' ? '创建' : '保存');
    var __VLS_263;
}
var __VLS_196;
const __VLS_268 = {}.ElDrawer;
/** @type {[typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, typeof __VLS_components.ElDrawer, typeof __VLS_components.elDrawer, ]} */ ;
// @ts-ignore
const __VLS_269 = __VLS_asFunctionalComponent(__VLS_268, new __VLS_268({
    modelValue: (__VLS_ctx.tagsDrawerOpen),
    title: (`标签分配 · ${__VLS_ctx.tagsTarget?.display_name || ''}`),
    direction: "rtl",
    size: "500px",
}));
const __VLS_270 = __VLS_269({
    modelValue: (__VLS_ctx.tagsDrawerOpen),
    title: (`标签分配 · ${__VLS_ctx.tagsTarget?.display_name || ''}`),
    direction: "rtl",
    size: "500px",
}, ...__VLS_functionalComponentArgsRest(__VLS_269));
__VLS_271.slots.default;
if (__VLS_ctx.tagsTarget) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
    const __VLS_272 = {}.ElAlert;
    /** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
    // @ts-ignore
    const __VLS_273 = __VLS_asFunctionalComponent(__VLS_272, new __VLS_272({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }));
    const __VLS_274 = __VLS_273({
        type: "info",
        closable: (false),
        showIcon: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_273));
    __VLS_275.slots.default;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.strong, __VLS_intrinsicElements.strong)({});
    var __VLS_275;
    for (const [grp] of __VLS_getVForSourceType((__VLS_ctx.groupedTags))) {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            key: (grp.label),
            ...{ style: {} },
        });
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ class: "tag-group-title" },
        });
        (grp.label);
        const __VLS_276 = {}.ElCheckboxGroup;
        /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
        // @ts-ignore
        const __VLS_277 = __VLS_asFunctionalComponent(__VLS_276, new __VLS_276({
            modelValue: (__VLS_ctx.selectedTagIds),
        }));
        const __VLS_278 = __VLS_277({
            modelValue: (__VLS_ctx.selectedTagIds),
        }, ...__VLS_functionalComponentArgsRest(__VLS_277));
        __VLS_279.slots.default;
        for (const [t] of __VLS_getVForSourceType((grp.items))) {
            const __VLS_280 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
                key: (t.id),
                value: (t.id),
                ...{ style: {} },
            }));
            const __VLS_282 = __VLS_281({
                key: (t.id),
                value: (t.id),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_281));
            __VLS_283.slots.default;
            (t.name);
            __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
                ...{ style: {} },
            });
            (__VLS_ctx.tagSummary(t));
            var __VLS_283;
        }
        var __VLS_279;
        if (!grp.items.length) {
            __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
                ...{ style: {} },
            });
        }
    }
    const __VLS_284 = {}.ElDivider;
    /** @type {[typeof __VLS_components.ElDivider, typeof __VLS_components.elDivider, ]} */ ;
    // @ts-ignore
    const __VLS_285 = __VLS_asFunctionalComponent(__VLS_284, new __VLS_284({}));
    const __VLS_286 = __VLS_285({}, ...__VLS_functionalComponentArgsRest(__VLS_285));
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ class: "tag-group-title" },
    });
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    if (__VLS_ctx.allCategories.length) {
        const __VLS_288 = {}.ElCheckboxGroup;
        /** @type {[typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, typeof __VLS_components.ElCheckboxGroup, typeof __VLS_components.elCheckboxGroup, ]} */ ;
        // @ts-ignore
        const __VLS_289 = __VLS_asFunctionalComponent(__VLS_288, new __VLS_288({
            modelValue: (__VLS_ctx.selectedCategoryIds),
        }));
        const __VLS_290 = __VLS_289({
            modelValue: (__VLS_ctx.selectedCategoryIds),
        }, ...__VLS_functionalComponentArgsRest(__VLS_289));
        __VLS_291.slots.default;
        for (const [c] of __VLS_getVForSourceType((__VLS_ctx.allCategories))) {
            const __VLS_292 = {}.ElCheckbox;
            /** @type {[typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, typeof __VLS_components.ElCheckbox, typeof __VLS_components.elCheckbox, ]} */ ;
            // @ts-ignore
            const __VLS_293 = __VLS_asFunctionalComponent(__VLS_292, new __VLS_292({
                key: (c.id),
                value: (c.id),
                ...{ style: {} },
            }));
            const __VLS_294 = __VLS_293({
                key: (c.id),
                value: (c.id),
                ...{ style: {} },
            }, ...__VLS_functionalComponentArgsRest(__VLS_293));
            __VLS_295.slots.default;
            (c.name);
            if (c.is_sensitive) {
                const __VLS_296 = {}.ElTag;
                /** @type {[typeof __VLS_components.ElTag, typeof __VLS_components.elTag, typeof __VLS_components.ElTag, typeof __VLS_components.elTag, ]} */ ;
                // @ts-ignore
                const __VLS_297 = __VLS_asFunctionalComponent(__VLS_296, new __VLS_296({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }));
                const __VLS_298 = __VLS_297({
                    size: "small",
                    type: "danger",
                    effect: "plain",
                    ...{ style: {} },
                }, ...__VLS_functionalComponentArgsRest(__VLS_297));
                __VLS_299.slots.default;
                var __VLS_299;
            }
            var __VLS_295;
        }
        var __VLS_291;
    }
    else {
        __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
            ...{ style: {} },
        });
    }
}
{
    const { footer: __VLS_thisSlot } = __VLS_271.slots;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        ...{ style: {} },
    });
    const __VLS_300 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({
        ...{ 'onClick': {} },
    }));
    const __VLS_302 = __VLS_301({
        ...{ 'onClick': {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_301));
    let __VLS_304;
    let __VLS_305;
    let __VLS_306;
    const __VLS_307 = {
        onClick: (...[$event]) => {
            __VLS_ctx.tagsDrawerOpen = false;
        }
    };
    __VLS_303.slots.default;
    var __VLS_303;
    const __VLS_308 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_309 = __VLS_asFunctionalComponent(__VLS_308, new __VLS_308({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.tagsSaving),
    }));
    const __VLS_310 = __VLS_309({
        ...{ 'onClick': {} },
        type: "primary",
        loading: (__VLS_ctx.tagsSaving),
    }, ...__VLS_functionalComponentArgsRest(__VLS_309));
    let __VLS_312;
    let __VLS_313;
    let __VLS_314;
    const __VLS_315 = {
        onClick: (__VLS_ctx.saveTags)
    };
    __VLS_311.slots.default;
    var __VLS_311;
}
var __VLS_271;
/** @type {__VLS_StyleScopedClasses['scope-tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['scope-tag-list']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['empty-text']} */ ;
/** @type {__VLS_StyleScopedClasses['password-hint']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-group-title']} */ ;
/** @type {__VLS_StyleScopedClasses['tag-group-title']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            ElInput: ElInput,
            Plus: Plus,
            PermissionButton: PermissionButton,
            AiCapabilityGrantEditor: AiCapabilityGrantEditor,
            formatDateTime: formatDateTime,
            PASSWORD_POLICY_HINT: PASSWORD_POLICY_HINT,
            query: query,
            loading: loading,
            list: list,
            total: total,
            roles: roles,
            load: load,
            onSearch: onSearch,
            resetFilter: resetFilter,
            drawerOpen: drawerOpen,
            drawerMode: drawerMode,
            editing: editing,
            form: form,
            saving: saving,
            openCreate: openCreate,
            openEdit: openEdit,
            onSave: onSave,
            onToggleActive: onToggleActive,
            onResetPassword: onResetPassword,
            lockedHint: lockedHint,
            tagsDrawerOpen: tagsDrawerOpen,
            tagsTarget: tagsTarget,
            selectedTagIds: selectedTagIds,
            tagsSaving: tagsSaving,
            allCategories: allCategories,
            selectedCategoryIds: selectedCategoryIds,
            groupedTags: groupedTags,
            tagSummary: tagSummary,
            visibleScopeNames: visibleScopeNames,
            hiddenScopeCount: hiddenScopeCount,
            openTags: openTags,
            saveTags: saveTags,
        };
    },
});
export default (await import('vue')).defineComponent({
    setup() {
        return {};
    },
});
; /* PartiallyEnd: #4569/main.vue */
