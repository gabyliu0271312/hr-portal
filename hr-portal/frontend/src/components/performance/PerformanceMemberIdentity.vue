<template>
  <div class="member-identity">
    <span class="member-avatar" aria-hidden="true">{{ displayName.slice(-1) }}</span>
    <span class="member-name">{{ displayName }}</span>
  </div>
</template>

<script setup lang="ts">
defineProps<{ displayName: string }>()
</script>

<style scoped>
.member-identity{display:flex;align-items:center;min-width:0}
.member-avatar{display:inline-flex;align-items:center;justify-content:center;flex:0 0 var(--performance-member-avatar-size);width:var(--performance-member-avatar-size);height:var(--performance-member-avatar-size);border-radius:50%;background:var(--performance-member-avatar-background);color:var(--performance-member-avatar-color);font-size:var(--performance-member-avatar-font-size)}
.member-name{min-width:0;margin-left:var(--performance-member-name-gap);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style>
