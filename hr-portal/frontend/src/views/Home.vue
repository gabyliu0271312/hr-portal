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
      <el-empty v-if="!visibleTools.length" description="暂无可用工具，请联系管理员开通提效工具权限" />
      <div v-else class="tool-grid">
        <ToolCard
          v-for="tool in visibleTools"
          :key="tool.code"
          :tool="tool"
          @open="router.push"
        />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { TOOLS_CATALOG } from '@/constants/toolsCatalog'
import ToolCard from '@/components/ToolCard.vue'

const userStore = useUserStore()
const router = useRouter()

// C1：快速进入只显示有权限的工具，与工具中心同源（TOOLS_CATALOG）同样式（ToolCard）
const visibleTools = computed(() =>
  TOOLS_CATALOG.filter((t) => userStore.menus.some((m) => m.code === t.code)),
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
</script>

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
</style>
