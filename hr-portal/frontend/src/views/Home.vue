<template>
  <div style="padding: 24px">
    <!-- 欢迎卡片 -->
    <el-card style="margin-bottom: 20px">
      <div style="display: flex; justify-content: space-between; align-items: center">
        <div>
          <div style="font-size: 13px; color: var(--color-text-secondary); margin-bottom: 6px">
            {{ today }} · 欢迎回来
          </div>
          <div style="font-size: 22px; font-weight: 600; color: var(--color-text-primary)">
            {{ greeting }}，{{ userStore.user?.display_name || '同事' }}
          </div>
          <div style="margin-top: 8px; font-size: 14px; color: var(--color-text-regular)">
            当前角色：<strong>{{ userStore.roles.join(' / ') || '无' }}</strong> ·
            可访问菜单 <strong>{{ userStore.menus.length }}</strong> 项
          </div>
        </div>
      </div>
    </el-card>

    <!-- 快速进入 -->
    <el-card>
      <template #header>
        <span style="font-size: 16px; font-weight: 600">快速进入</span>
      </template>
      <div class="menu-grid">
        <div
          v-for="m in leafMenus"
          :key="m.id"
          class="menu-card"
          @click="goto(m.code)"
        >
          <span class="menu-code">{{ m.code }}</span>
          <span class="menu-label">{{ m.label }}</span>
          <div class="menu-ops">
            <el-tag v-if="m.can_create" size="small" type="primary" effect="plain">增</el-tag>
            <el-tag v-if="m.can_update" size="small" type="primary" effect="plain">改</el-tag>
            <el-tag v-if="m.can_delete" size="small" type="primary" effect="plain">删</el-tag>
            <el-tag v-if="m.can_export" size="small" type="primary" effect="plain">导出</el-tag>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const router = useRouter()

// 叶子页 code → 路由路径（与 Default.vue 的 ROUTE_MAP 保持一致）
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
  'data.emp_realtime': '/data/emp-realtime',
  'data.emp_monthly': '/data/emp-monthly',
  'data.emp_salary': '/data/emp-salary',
  'data.emp_allocation': '/data/emp-allocation',
  'data.cc_monthly': '/data/cc-monthly',
  'report.list': '/report/list',
  'tools.center': '/tools/center',
  'tools.compensation_calc': '/tools/compensation-calc',
  'tools.income_certificate': '/tools/income-certificate',
}

// 只显示能真正打开页面的叶子菜单（过滤掉无页面的二级分组，以及作为入口聚合页的工具中心）
const HIDDEN_IN_QUICK = new Set(['tools.center'])
const leafMenus = computed(() =>
  userStore.menus.filter(
    (m) => m.parent_id !== null && ROUTE_MAP[m.code] !== undefined && !HIDDEN_IN_QUICK.has(m.code),
  ),
)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const today = computed(() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

function goto(code: string) {
  const path = ROUTE_MAP[code]
  if (path) router.push(path)
}
</script>

<style scoped>
.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.menu-card {
  padding: 16px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  background: var(--color-bg-card);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.menu-card:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.menu-code {
  font-family: monospace;
  font-size: 11px;
  color: var(--color-text-secondary);
}
.menu-label {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
}
.menu-ops {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}
</style>
