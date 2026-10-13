<template>
  <PerformanceSurfaceCard class="authorization-panel" title="授权管理">
    <div class="auth-grid">
      <PerformanceGridCard v-for="item in authorizations" :key="item.key" class="auth-card">
        <div class="auth-head">
          <span class="auth-title">{{ item.title }}</span>
          <PerformanceTextButton label="查看" @click="emit('view', item)" />
        </div>
        <p class="auth-desc">{{ item.description }}</p>
      </PerformanceGridCard>
    </div>
  </PerformanceSurfaceCard>
</template>

<script setup lang="ts">
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import PerformanceGridCard from './PerformanceGridCard.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'

export interface AuthorizationItem {
  key: string
  title: string
  description: string
}

defineProps<{
  authorizations: AuthorizationItem[]
}>()

const emit = defineEmits<{
  view: [item: AuthorizationItem]
}>()

</script>

<style scoped>
.authorization-panel { margin-top: 12px; flex: none; }
.auth-grid { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.auth-card { --grid-card-padding: 20px; }
.auth-head { display: flex; justify-content: space-between; min-width: 0; min-height: 0; }
.auth-title { min-width: 0; overflow: hidden; margin-right: 8px; font-size: 14px; font-weight: 600; line-height: 21px; white-space: nowrap; text-overflow: ellipsis; }
.auth-desc { min-width: 0; min-height: 0; margin: 4px 0 0; color: #646a73; font-size: 14px; font-weight: 400; line-height: 21px; }
</style>
