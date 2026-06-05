<template>
  <el-container style="height: 100vh; flex-direction: column">
    <!-- 顶部一级导航：tabs -->
    <div class="app-header">
      <div class="header-left">
        <span class="system-name" @click="router.push('/home')">HR Portal · 权限报表中台</span>
        <nav class="top-tabs">
          <span
            v-for="g in tabGroups"
            :key="g.id"
            class="tab-item"
            :class="{ active: activeTabId === g.id }"
            @click="onTabClick(g)"
          >
            {{ g.label }}
          </span>
        </nav>
      </div>
      <div class="header-right">
        <span class="user-name">{{ userStore.user?.display_name }}</span>
        <span class="user-roles">{{ userStore.roles.join(' / ') || '无角色' }}</span>
        <el-dropdown @command="handleCommand">
          <el-button text>
            <el-icon><Avatar /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="changePassword">修改密码</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 二级布局：左侧二三级菜单 + 右侧内容 -->
    <el-container style="flex: 1; min-height: 0">
      <el-aside v-if="leftMenu.length" width="220px" class="app-aside">
        <template v-for="grp in leftMenu" :key="grp.id">
          <!-- 二级分组（无子集时直接当叶子）-->
          <template v-if="grp.children.length">
            <div class="group-title">{{ grp.label }}</div>
            <div
              v-for="c in grp.children"
              :key="c.id"
              class="leaf-item"
              :class="{ active: c.routePath === route.path }"
              @click="router.push(c.routePath)"
            >
              {{ c.label }}
            </div>
          </template>
          <template v-else>
            <div
              class="leaf-item leaf-item--single"
              :class="{ active: grp.routePath === route.path }"
              @click="router.push(grp.routePath)"
            >
              {{ grp.label }}
            </div>
          </template>
        </template>
      </el-aside>

      <el-main style="background: var(--color-bg-page); padding: 0; overflow-y: auto">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Avatar } from '@element-plus/icons-vue'
import { authApi } from '@/api/auth'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// 路由路径映射：菜单 code → 实际路由路径
const ROUTE_MAP: Record<string, string> = {
  'system.users': '/system/users',
  'system.roles': '/system/roles',
  'system.scopes': '/system/scopes',
  'system.field_categories': '/system/field-categories',
  'system.field_columns': '/system/field-columns',
  'system.compensation_caps': '/system/compensation-caps',
  'datasource.endpoints': '/datasource/endpoints',
  'datasource.datasets': '/datasource/datasets',
  'data.view': '/data/view',
  'report.list': '/report/list',
  'tools.center': '/tools/center',
  'tools.compensation_calc': '/tools/compensation-calc',
  'tools.income_certificate': '/tools/income-certificate',
}

interface LeafMenu {
  id: number
  code: string
  label: string
  routePath: string
}
interface GroupMenu extends LeafMenu {
  children: LeafMenu[]
}
interface TabMenu extends LeafMenu {
  children: GroupMenu[]
}

/** 把后端三层菜单结构组织成 TabMenu[] */
const tabGroups = computed<TabMenu[]>(() => {
  return userStore.topMenus.map((tab) => {
    const groups = userStore.childrenOf(tab.id).map<GroupMenu>((g) => {
      const leaves = userStore.childrenOf(g.id).map<LeafMenu>((leaf) => ({
        id: leaf.id,
        code: leaf.code,
        label: leaf.label,
        routePath: ROUTE_MAP[leaf.code] ?? '/home',
      }))
      return {
        id: g.id,
        code: g.code,
        label: g.label,
        routePath: ROUTE_MAP[g.code] ?? '/home',
        children: leaves,
      }
    })
    return {
      id: tab.id,
      code: tab.code,
      label: tab.label,
      routePath: ROUTE_MAP[tab.code] ?? '/home',
      children: groups,
    }
  })
})

/** 当前激活的 tab：根据 route.path 反查 */
const activeTabId = computed(() => {
  for (const tab of tabGroups.value) {
    for (const g of tab.children) {
      if (g.routePath === route.path) return tab.id
      for (const leaf of g.children) {
        if (leaf.routePath === route.path) return tab.id
      }
    }
  }
  return tabGroups.value[0]?.id ?? null
})

/** 当前 tab 下的左侧菜单（二级分组 + 三级叶子）*/
const leftMenu = computed<GroupMenu[]>(() => {
  const tab = tabGroups.value.find((t) => t.id === activeTabId.value)
  return tab?.children ?? []
})

function onTabClick(tab: TabMenu) {
  // 跳到该 tab 下第一个可达的叶子或分组
  const firstGroup = tab.children[0]
  if (!firstGroup) return
  const firstLeaf = firstGroup.children[0]
  if (firstLeaf) {
    router.push(firstLeaf.routePath)
  } else {
    router.push(firstGroup.routePath)
  }
}

async function handleCommand(cmd: string) {
  if (cmd === 'logout') {
    try {
      await ElMessageBox.confirm('确定退出登录？', '提示', {
        type: 'warning',
        confirmButtonText: '退出',
        cancelButtonText: '取消',
      })
    } catch {
      return
    }
    await userStore.logout()
    router.push('/login')
  } else if (cmd === 'changePassword') {
    try {
      const { value: oldPwd } = await ElMessageBox.prompt(
        '请输入当前密码',
        '修改密码',
        { inputType: 'password', confirmButtonText: '下一步' }
      )
      const { value: newPwd } = await ElMessageBox.prompt(
        '请输入新密码（≥ 8 位且含字母与数字）',
        '修改密码',
        { inputType: 'password', confirmButtonText: '提交' }
      )
      await authApi.changePassword(oldPwd, newPwd)
      ElMessage.success('密码已更新')
    } catch (e: any) {
      if (e === 'cancel' || e?.message === 'cancel') return
      ElMessage.error(e?.response?.data?.detail || '修改失败')
    }
  }
}
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 24px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 32px;
}
.system-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s;
}
.system-name:hover {
  color: var(--color-primary);
}
.top-tabs {
  display: flex;
  gap: 4px;
}
.tab-item {
  padding: 6px 16px;
  font-size: 14px;
  color: var(--color-text-regular);
  cursor: pointer;
  border-radius: 4px;
  transition: all 0.15s;
  position: relative;
}
.tab-item:hover {
  color: var(--color-primary);
  background: var(--color-bg-hover);
}
.tab-item.active {
  color: var(--color-primary);
  font-weight: 500;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: -10px;
  left: 50%;
  transform: translateX(-50%);
  width: 60%;
  height: 2px;
  background: var(--color-primary);
  border-radius: 1px;
}
.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.user-name {
  font-size: 14px;
  color: var(--color-text-primary);
}
.user-roles {
  font-size: 12px;
  color: var(--color-text-secondary);
  padding-left: 8px;
  border-left: 1px solid var(--color-border);
}

/* 左侧菜单 */
.app-aside {
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
  padding: 12px 0;
  overflow-y: auto;
}
.group-title {
  padding: 12px 20px 6px 20px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.leaf-item {
  padding: 9px 20px 9px 32px;
  font-size: 14px;
  color: var(--color-text-regular);
  cursor: pointer;
  transition: all 0.15s;
  border-left: 2px solid transparent;
}
.leaf-item--single {
  padding-left: 20px;
}
.leaf-item:hover {
  background: var(--color-bg-hover);
  color: var(--color-primary);
}
.leaf-item.active {
  background: var(--color-primary-light);
  color: var(--color-primary);
  border-left-color: var(--color-primary);
  font-weight: 500;
}
</style>
