<template>
  <svg class="app-icon" :width="size" :height="size" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" :aria-hidden="true">
    <template v-if="appKey === 'portal'">
      <!-- 门户：檐 + 双柱 + 青色入口 -->
      <rect x="4" y="5" width="20" height="4.5" rx="1.2" fill="#3370FF" />
      <rect x="7" y="11.5" width="3.6" height="11" rx="1.2" fill="#3370FF" />
      <rect x="17.4" y="11.5" width="3.6" height="11" rx="1.2" fill="#3370FF" />
      <rect x="12.2" y="14" width="3.6" height="8.5" rx="1.2" fill="#00D6B9" />
    </template>
    <template v-else-if="appKey === 'people'">
      <!-- 创梦人力：两人形 + 组织连接 -->
      <circle cx="9.6" cy="8.6" r="3.2" fill="#3370FF" />
      <path d="M4 23a5.6 5.6 0 0 1 11.2 0" fill="#3370FF" />
      <circle cx="19.2" cy="11.4" r="3.2" fill="#00D6B9" />
      <path d="M13.8 23a5.6 5.6 0 0 1 11.2 0" fill="#00D6B9" />
    </template>
    <template v-else>
      <!-- 创梦绩效：与 PerformanceBrand 相同的图标图形 -->
      <path d="M5.988 13.97a2.708 2.708 0 1 0 0-5.415 2.708 2.708 0 0 0 0 5.416Z" fill="#3370FF" />
      <path d="M14.329 7.416a2.708 2.708 0 1 0 0-5.416 2.708 2.708 0 0 0 0 5.416Z" fill="#3370FF" />
      <path d="M22.704 10.974a2.708 2.708 0 1 0 0-5.416 2.708 2.708 0 0 0 0 5.416Z" fill="#3370FF" />
      <path d="M8.979 24.425C7.126 23.902 3 21.567 3 18.085v.088c0-1.914 1.389-3.376 3.13-3.376 1.74 0 2.849 1.41 2.849 3.14v6.488Z" fill="#3370FF" />
      <path d="M17.349 25.107a9.6 9.6 0 0 1-6.04 0v-13.85a3.02 3.02 0 1 1 6.04 0v13.85Z" fill="#3370FF" />
      <path d="M19.684 24.416V14.82a3.022 3.022 0 0 1 3.029-3.02 3.02 3.02 0 0 1 3.02 3.02v.949c-.007 5.292-2.713 7.497-6.049 8.648Z" fill="#00D6B9" />
    </template>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ appKey: string; size?: number }>(), { size: 28 })
</script>

<style scoped>
.app-icon { display: block; }
</style>
