<template>
  <div class="member-identity" :class="[{ 'is-dimission': dimission && !identityStatus, 'is-tag': tag, 'has-identity-status': identityStatus, 'has-group-tags': identityStatus?.group_tags?.length, 'without-avatar': !showAvatar }, `member-identity--${size}`]">
    <span v-if="showAvatar" class="member-avatar" :class="`member-avatar--${size}`" aria-hidden="true">{{ displayName.slice(-1) }}</span>
    <span class="member-name" :class="`member-name--${size}`" :title="displayName">{{ displayName }}<span v-if="dimission && !identityStatus" class="member-dimission-mark">（已离职）</span></span>
    <span v-if="identityStatus" class="member-status-tags">
      <PerformanceMemberDelegationTag type="AUTHORIZE" :records="identityStatus.delegations" />
      <PerformanceMemberDelegationTag type="TRANSFER" :records="identityStatus.delegations" />
      <span v-if="departed" class="member-status-tag member-status-tag--departed">已离职</span>
      <span v-for="group in identityStatus.group_tags || []" :key="group.group_id" class="member-status-tag member-status-tag--group" :style="groupColors(group)" :title="group.name"><span class="member-group-name">{{ group.name }}</span></span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PerformanceMemberGroupTag, PerformanceMemberIdentityStatus } from '@/api/performance'
import PerformanceMemberDelegationTag from './PerformanceMemberDelegationTag.vue'

const props = withDefaults(defineProps<{
  displayName: string
  size?: 'md' | 'sm'
  dimission?: boolean
  tag?: boolean
  showAvatar?: boolean
  identityStatus?: PerformanceMemberIdentityStatus | null
}>(), { size: 'md', dimission: false, tag: false, identityStatus: null, showAvatar: true })
const departed = computed(() => ['离职', '已离职', 'dimissed', 'dismissed', 'departed'].includes(props.identityStatus?.live_employment_status || ''))
function groupColors(group: PerformanceMemberGroupTag) {
  const literalColor = /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\))$/i
  return {
    color: literalColor.test(group.text_color) ? group.text_color : undefined,
    backgroundColor: literalColor.test(group.bg_color) ? group.bg_color : undefined,
  }
}
</script>

<style scoped>
.member-identity{display:flex;align-items:center;min-width:0}
.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 var(--performance-member-avatar-size);width:var(--performance-member-avatar-size);height:var(--performance-member-avatar-size);border-radius:var(--performance-member-avatar-radius);background:var(--performance-member-avatar-background);color:var(--performance-member-avatar-color);font-size:var(--performance-member-avatar-font-size)}
.member-avatar--sm{flex-basis:var(--performance-member-avatar-size-sm);width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);font-size:var(--performance-member-avatar-font-size-sm)}
.member-name{min-width:0;margin-left:var(--performance-member-name-gap);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.member-name--sm{margin-left:var(--performance-member-name-gap-sm)}
.has-identity-status.member-identity--md .member-avatar{flex-basis:var(--performance-member-avatar-size-list);width:var(--performance-member-avatar-size-list);height:var(--performance-member-avatar-size-list)}
.has-identity-status.member-identity--md .member-name{margin-left:var(--performance-member-name-gap-list)}
.is-tag{padding:0 var(--performance-member-pill-padding-right) 0 var(--performance-member-pill-padding-left);border-radius:var(--radius-pill);background:var(--performance-member-pill-background);color:var(--performance-member-pill-color)}
.is-tag .member-avatar{flex-basis:var(--performance-member-avatar-size-sm);width:var(--performance-member-avatar-size-sm);height:var(--performance-member-avatar-size-sm);font-size:var(--performance-member-avatar-font-size-sm)}
.is-tag .member-name{color:var(--performance-member-pill-color);font-size:var(--font-size-md);line-height:var(--input-line-height)}
.is-dimission .member-avatar{background:var(--performance-member-avatar-dimission-background);color:var(--performance-member-avatar-dimission-color)}
.is-dimission .member-name{color:var(--color-text-disabled)}
.member-dimission-mark{color:inherit;font-size:inherit}
.member-identity.without-avatar .member-name{margin-left:0}
.member-status-tags{display:inline-flex;align-items:center;flex:none;gap:var(--performance-member-status-gap);margin-left:var(--performance-member-status-gap)}
.member-status-tags:empty{display:none}
.member-status-tag{display:inline-flex;align-items:center;justify-content:center;flex:none;height:var(--performance-member-status-height);padding:0 var(--performance-member-status-padding-x);border-radius:var(--performance-member-status-radius);font:var(--font-weight-normal) var(--performance-member-status-font-size)/var(--performance-member-status-line-height) var(--font-sans);white-space:nowrap}
.member-status-tag--departed{background:var(--performance-member-status-departed-background);color:var(--color-text-primary)}
.has-group-tags{flex-wrap:wrap;row-gap:var(--performance-member-status-gap)}
.has-group-tags .member-name{flex-shrink:0;margin-right:var(--performance-member-status-gap);max-width:min(var(--performance-member-group-name-max-width),calc(100% - var(--performance-member-avatar-size-list) - var(--performance-member-name-gap-list) - var(--performance-member-status-gap)))}
.has-group-tags.without-avatar .member-name{max-width:min(var(--performance-member-group-name-max-width),100%)}
.has-group-tags .member-status-tags{flex-wrap:wrap;max-width:100%;margin-left:0}
.member-status-tag--group{box-sizing:border-box;min-width:0;max-width:var(--performance-member-group-tag-max-width);background:var(--performance-member-status-departed-background);color:var(--color-text-primary);cursor:text}
.member-group-name{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
</style>
