/// <reference types="../../node_modules/.vue-global-types/vue_3.5_0_0_0.d.ts" />
import { computed, onMounted, ref, watch } from 'vue';
import { Plus, Delete } from '@element-plus/icons-vue';
import { rolesApi } from '@/api/roles';
import { usersApi } from '@/api/users';
const props = defineProps();
const emit = defineEmits();
const roles = ref([]);
const users = ref([]);
const rows = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});
function addRole() {
    rows.value = [...rows.value, { role_id: null, user_id: null }];
}
function addUser() {
    rows.value = [...rows.value, { role_id: null, user_id: null }];
}
function remove(i) {
    const next = [...rows.value];
    next.splice(i, 1);
    rows.value = next;
}
function setRole(i, val) {
    const next = [...rows.value];
    next[i] = { ...next[i], role_id: val, user_id: null };
    rows.value = next;
}
function setUser(i, val) {
    const next = [...rows.value];
    next[i] = { ...next[i], user_id: val, role_id: null };
    rows.value = next;
}
async function loadCandidates() {
    try {
        if (props.loadOptions) {
            if (!props.datasetId) {
                roles.value = [];
                users.value = [];
                return;
            }
            const options = await props.loadOptions(props.datasetId);
            roles.value = options.roles || [];
            users.value = options.users || [];
            return;
        }
        const [r, u] = await Promise.all([
            rolesApi.list(),
            usersApi.list({ page_size: 100 }),
        ]);
        roles.value = (r.items || []).map((item) => ({ id: item.id, name: item.name }));
        users.value = (u.items || []).map((item) => ({
            id: item.id,
            login_name: item.login_name,
            display_name: item.display_name,
        }));
    }
    catch {
        /* 列表加载失败不阻塞 */
    }
}
onMounted(loadCandidates);
watch(() => props.datasetId, () => loadCandidates());
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_components;
let __VLS_directives;
// CSS variable injection 
// CSS variable injection end 
__VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({});
const __VLS_0 = {}.ElAlert;
/** @type {[typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, typeof __VLS_components.ElAlert, typeof __VLS_components.elAlert, ]} */ ;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}));
const __VLS_2 = __VLS_1({
    type: "info",
    closable: (false),
    showIcon: true,
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
__VLS_3.slots.default;
__VLS_asFunctionalElement(__VLS_intrinsicElements.p, __VLS_intrinsicElements.p)({
    ...{ style: {} },
});
var __VLS_3;
for (const [row, i] of __VLS_getVForSourceType((__VLS_ctx.rows))) {
    __VLS_asFunctionalElement(__VLS_intrinsicElements.div, __VLS_intrinsicElements.div)({
        key: (i),
        ...{ class: "acl-row" },
    });
    const __VLS_4 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_5 = __VLS_asFunctionalComponent(__VLS_4, new __VLS_4({
        ...{ 'onChange': {} },
        modelValue: (row.role_id ?? undefined),
        placeholder: "选择角色",
        clearable: true,
        filterable: true,
        ...{ style: {} },
    }));
    const __VLS_6 = __VLS_5({
        ...{ 'onChange': {} },
        modelValue: (row.role_id ?? undefined),
        placeholder: "选择角色",
        clearable: true,
        filterable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_5));
    let __VLS_8;
    let __VLS_9;
    let __VLS_10;
    const __VLS_11 = {
        onChange: ((v) => __VLS_ctx.setRole(i, v ?? null))
    };
    __VLS_7.slots.default;
    for (const [r] of __VLS_getVForSourceType((__VLS_ctx.roles))) {
        const __VLS_12 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent(__VLS_12, new __VLS_12({
            key: (r.id),
            label: (r.name),
            value: (r.id),
        }));
        const __VLS_14 = __VLS_13({
            key: (r.id),
            label: (r.name),
            value: (r.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    var __VLS_7;
    __VLS_asFunctionalElement(__VLS_intrinsicElements.span, __VLS_intrinsicElements.span)({
        ...{ class: "acl-or" },
    });
    const __VLS_16 = {}.ElSelect;
    /** @type {[typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, typeof __VLS_components.ElSelect, typeof __VLS_components.elSelect, ]} */ ;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({
        ...{ 'onChange': {} },
        modelValue: (row.user_id ?? undefined),
        placeholder: "指定用户",
        clearable: true,
        filterable: true,
        ...{ style: {} },
    }));
    const __VLS_18 = __VLS_17({
        ...{ 'onChange': {} },
        modelValue: (row.user_id ?? undefined),
        placeholder: "指定用户",
        clearable: true,
        filterable: true,
        ...{ style: {} },
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    let __VLS_20;
    let __VLS_21;
    let __VLS_22;
    const __VLS_23 = {
        onChange: ((v) => __VLS_ctx.setUser(i, v ?? null))
    };
    __VLS_19.slots.default;
    for (const [u] of __VLS_getVForSourceType((__VLS_ctx.users))) {
        const __VLS_24 = {}.ElOption;
        /** @type {[typeof __VLS_components.ElOption, typeof __VLS_components.elOption, ]} */ ;
        // @ts-ignore
        const __VLS_25 = __VLS_asFunctionalComponent(__VLS_24, new __VLS_24({
            key: (u.id),
            label: (`${u.display_name}（${u.login_name}）`),
            value: (u.id),
        }));
        const __VLS_26 = __VLS_25({
            key: (u.id),
            label: (`${u.display_name}（${u.login_name}）`),
            value: (u.id),
        }, ...__VLS_functionalComponentArgsRest(__VLS_25));
    }
    var __VLS_19;
    const __VLS_28 = {}.ElButton;
    /** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
    // @ts-ignore
    const __VLS_29 = __VLS_asFunctionalComponent(__VLS_28, new __VLS_28({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }));
    const __VLS_30 = __VLS_29({
        ...{ 'onClick': {} },
        link: true,
        type: "danger",
    }, ...__VLS_functionalComponentArgsRest(__VLS_29));
    let __VLS_32;
    let __VLS_33;
    let __VLS_34;
    const __VLS_35 = {
        onClick: (...[$event]) => {
            __VLS_ctx.remove(i);
        }
    };
    __VLS_31.slots.default;
    const __VLS_36 = {}.ElIcon;
    /** @type {[typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, typeof __VLS_components.ElIcon, typeof __VLS_components.elIcon, ]} */ ;
    // @ts-ignore
    const __VLS_37 = __VLS_asFunctionalComponent(__VLS_36, new __VLS_36({}));
    const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
    __VLS_39.slots.default;
    const __VLS_40 = {}.Delete;
    /** @type {[typeof __VLS_components.Delete, ]} */ ;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    var __VLS_39;
    var __VLS_31;
}
const __VLS_44 = {}.ElButton;
/** @type {[typeof __VLS_components.ElButton, typeof __VLS_components.elButton, typeof __VLS_components.ElButton, typeof __VLS_components.elButton, ]} */ ;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    ...{ 'onClick': {} },
    size: "small",
}));
const __VLS_46 = __VLS_45({
    ...{ 'onClick': {} },
    size: "small",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
let __VLS_48;
let __VLS_49;
let __VLS_50;
const __VLS_51 = {
    onClick: (__VLS_ctx.addRole)
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
/** @type {__VLS_StyleScopedClasses['acl-row']} */ ;
/** @type {__VLS_StyleScopedClasses['acl-or']} */ ;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup() {
        return {
            Plus: Plus,
            Delete: Delete,
            roles: roles,
            users: users,
            rows: rows,
            addRole: addRole,
            remove: remove,
            setRole: setRole,
            setUser: setUser,
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
