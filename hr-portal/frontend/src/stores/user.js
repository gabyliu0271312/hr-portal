import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { authApi } from '@/api/auth';
import { setToken } from '@/api/client';
export const useUserStore = defineStore('user', () => {
    const user = ref(null);
    const roles = ref([]);
    const menus = ref([]);
    const loading = ref(false);
    const isLoggedIn = computed(() => user.value !== null);
    const isSuperAdmin = computed(() => roles.value.includes('超级管理员'));
    /** 顶级菜单（parent_id 为 null） */
    const topMenus = computed(() => menus.value
        .filter((m) => m.parent_id === null)
        .sort((a, b) => a.order - b.order));
    /** 给定 parent，返回其直接子菜单 */
    function childrenOf(parentId) {
        return menus.value
            .filter((m) => m.parent_id === parentId)
            .sort((a, b) => a.order - b.order);
    }
    /** 检查是否对某菜单有某操作 */
    function hasOp(code, op) {
        const m = menus.value.find((x) => x.code === code);
        if (!m)
            return false;
        return op === 'C'
            ? m.can_create
            : op === 'U'
                ? m.can_update
                : op === 'D'
                    ? m.can_delete
                    : m.can_export;
    }
    async function login(login_name, password) {
        loading.value = true;
        try {
            const resp = await authApi.login(login_name, password);
            setToken(resp.access_token);
            await refresh();
        }
        finally {
            loading.value = false;
        }
    }
    async function loginByFeishu(code) {
        loading.value = true;
        try {
            const resp = await authApi.feishuCallback(code);
            setToken(resp.access_token);
            await refresh();
        }
        finally {
            loading.value = false;
        }
    }
    async function refresh() {
        try {
            const me = await authApi.me();
            user.value = me.user;
            roles.value = me.roles;
            menus.value = me.menus;
            return me;
        }
        catch {
            reset();
            return null;
        }
    }
    async function logout() {
        try {
            await authApi.logout();
        }
        catch {
            /* 忽略 */
        }
        reset();
    }
    function reset() {
        user.value = null;
        roles.value = [];
        menus.value = [];
        setToken(null);
    }
    return {
        user,
        roles,
        menus,
        loading,
        isLoggedIn,
        isSuperAdmin,
        topMenus,
        childrenOf,
        hasOp,
        login,
        loginByFeishu,
        refresh,
        logout,
        reset,
    };
});
