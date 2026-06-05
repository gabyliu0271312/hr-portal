<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Money, Document, Right } from '@element-plus/icons-vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const tools = computed(() => [
  {
    code: 'tools.compensation_calc',
    title: '补偿金计算',
    desc: '根据员工信息、离职日期和地区补偿基数上限自动计算 N / N+1 补偿金，并可一键生成解除劳动合同协议。',
    path: '/tools/compensation-calc',
    icon: Money,
    enabled: userStore.menus.some((m) => m.code === 'tools.compensation_calc'),
  },
  {
    code: 'tools.income_certificate',
    title: '证明开具',
    desc: '选择模板后开具收入证明，支持预览、打印和下载 Word。',
    path: '/tools/income-certificate',
    icon: Document,
    enabled: userStore.menus.some((m) => m.code === 'tools.income_certificate'),
  },
])

const visibleTools = computed(() => tools.value.filter((t) => t.enabled))
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
        <div
          v-for="tool in visibleTools"
          :key="tool.code"
          class="tool-card"
          :class="{ disabled: !tool.enabled }"
          @click="tool.enabled && router.push(tool.path)"
        >
          <div class="tool-icon">
            <el-icon><component :is="tool.icon" /></el-icon>
          </div>
          <div style="flex: 1">
            <div class="tool-title">
              {{ tool.title }}
            </div>
            <div class="tool-desc">{{ tool.desc }}</div>
          </div>
          <el-icon v-if="tool.enabled" class="tool-arrow"><Right /></el-icon>
        </div>
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
.tool-card {
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-bg-card);
  cursor: pointer;
  transition: all 0.15s;
}
.tool-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 8px 24px rgba(31, 35, 41, 0.08);
  transform: translateY(-1px);
}
.tool-card.disabled {
  cursor: not-allowed;
  opacity: 0.65;
}
.tool-card.disabled:hover {
  border-color: var(--color-border);
  box-shadow: none;
  transform: none;
}
.tool-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: rgba(51, 112, 255, 0.1);
  color: var(--color-primary);
  font-size: 22px;
}
.tool-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}
.tool-desc {
  margin-top: 8px;
  color: var(--color-text-regular);
  font-size: 13px;
  line-height: 1.6;
}
.tool-arrow {
  margin-top: 4px;
  color: var(--color-text-placeholder);
}
</style>
