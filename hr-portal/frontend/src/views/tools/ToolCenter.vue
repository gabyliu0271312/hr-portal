<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { TOOLS_CATALOG } from '@/constants/toolsCatalog'
import ToolCard from '@/components/ToolCard.vue'

const router = useRouter()
const userStore = useUserStore()

const visibleTools = computed(() =>
  TOOLS_CATALOG.filter((t) => userStore.menus.some((m) => m.code === t.code)),
)
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <div>
          <div style="font-size: 16px; font-weight: 600">工具中心</div>
          <div style="margin-top: 4px; color: var(--color-text-placeholder); font-size: 13px">
            这里展示当前账号有权限使用的 HR 小工具。
          </div>
        </div>
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

<style scoped>
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}
</style>
