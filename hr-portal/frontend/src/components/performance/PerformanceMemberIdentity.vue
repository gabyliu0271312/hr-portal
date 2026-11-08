<template>
  <div class="member-identity" :class="{ 'is-dimission': dimission, 'is-tag': tag }">
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
  /** 飞书 ud__tag 胶囊形态（360° 评估率弹窗 person 标签：rgba(31,35,41,0.1) 灰底 + 全圆角 + 内距） */
  tag?: boolean
}>(), { size: 'md', dimission: false, tag: false })
</script>

<style scoped>
.member-identity{display:flex;align-items:center;min-width:0}
.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 var(--performance-member-avatar-size);width:var(--performance-member-avatar-size);height:var(--performance-member-avatar-size);border-radius:50%;background:var(--performance-member-avatar-background);color:var(--performance-member-avatar-color);font-size:var(--performance-member-avatar-font-size)}
.member-avatar--sm{flex-basis:var(--performance-member-avatar-size-sm);width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);font-size:var(--performance-member-avatar-font-size-sm)}
.member-name{min-width:0;margin-left:var(--performance-member-name-gap);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.member-name--sm{margin-left:var(--performance-member-name-gap-sm)}
/* 胶囊标签态（ud__tag-neutral）：全圆角灰底，左内距 2px 贴合头像，右 8px */
.is-tag{padding:0 8px 0 2px;border-radius:999999px;background:rgba(31,35,41,0.1);color:#646a73}
.is-tag .member-avatar{flex-basis:var(--performance-member-avatar-size-sm);width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);font-size:var(--performance-member-avatar-font-size-sm)}
.is-tag .member-name{color:#646a73;font-size:14px;line-height:22px}
.is-dimission .member-avatar{background:var(--performance-member-avatar-dimission-background, #e5e6e8);color:var(--performance-member-avatar-dimission-color, #8f959e)}
.is-dimission .member-name{color:var(--color-text-disabled, #c9cdd4)}
.member-dimission-mark{color:inherit;font-size:inherit}
</style>
