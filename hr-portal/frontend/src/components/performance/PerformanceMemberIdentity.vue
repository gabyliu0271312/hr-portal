<template>
  <div class="member-identity" :class="{ 'is-dimission': dimission }">
    <span class="member-avatar" :class="`member-avatar--${size}`" aria-hidden="true">{{ displayName.slice(-1) }}</span>
    <span class="member-name" :class="`member-name--${size}`">{{ displayName }}<span v-if="dimission" class="member-dimission-mark">（已离职）</span></span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  displayName: string
  /** md=列表 32px；sm=紧凑标签 20px（对齐飞书 360° 评估率弹窗 person 标签） */
  size?: 'md' | 'sm'
  /** 离职/账号暂停：置灰展示 */
  dimission?: boolean
}>(), { size: 'md', dimission: false })
</script>

<style scoped>
.member-identity{display:flex;align-items:center;min-width:0}
.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 var(--performance-member-avatar-size);width:var(--performance-member-avatar-size);height:var(--performance-member-avatar-size);border-radius:50%;background:var(--performance-member-avatar-background);color:var(--performance-member-avatar-color);font-size:var(--performance-member-avatar-font-size)}
.member-avatar--sm{flex-basis:var(--performance-member-avatar-size-sm);width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);font-size:var(--performance-member-avatar-font-size-sm)}
.member-name{min-width:0;margin-left:var(--performance-member-name-gap);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.member-name--sm{margin-left:var(--performance-member-name-gap-sm)}
.is-dimission .member-avatar{background:var(--performance-member-avatar-dimission-background, #e5e6e8);color:var(--performance-member-avatar-dimission-color, #8f959e)}
.is-dimission .member-name{color:var(--color-text-disabled, #c9cdd4)}
.member-dimission-mark{color:inherit;font-size:inherit}
</style>
