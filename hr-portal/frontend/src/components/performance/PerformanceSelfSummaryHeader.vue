<template>
  <header class="self-summary-header">
    <button class="back-button" type="button" aria-label="返回" @click="$emit('back')">
      <SpaceLeftOutlinedIcon class="back-icon" />
    </button>
    <span class="person-avatar" aria-hidden="true">{{ initial }}</span>
    <div class="person-info">
      <strong>{{ person.display_name }}</strong>
      <span v-if="personMeta">{{ personMeta }}</span>
    </div>
    <div class="header-actions" aria-label="页面工具">
      <button type="button" disabled aria-label="翻译">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.656 9.5h1.47a8.504 8.504 0 0 0-16.252 0H1.799c1.122-4.592 5.264-8 10.201-8 4.938 0 9.079 3.408 10.2 8h1.644a.16.16 0 0 1 .156.162.166.166 0 0 1-.046.115l-2.539 2.652a.226.226 0 0 1-.33 0l-2.54-2.652a.167.167 0 0 1 0-.23.152.152 0 0 1 .11-.047Zm-13.312 5h-1.47a8.504 8.504 0 0 0 16.252 0h2.075c-1.122 4.592-5.264 8-10.201 8s-9.079-3.408-10.2-8H.155a.152.152 0 0 1-.11-.048.168.168 0 0 1 0-.23l2.539-2.65a.226.226 0 0 1 .33 0l2.54 2.65a.169.169 0 0 1 .045.116.16.16 0 0 1-.156.162Z" fill="currentColor" /><path d="M13.015 7.5H11.01l-3.51 9h2.016l1.025-2.484H13.4l1.116 2.484H16.5l-3.485-9ZM12.93 12h-1.873l.958-2.52.915 2.52Z" fill="currentColor" /></svg>
      </button>
      <i aria-hidden="true"></i>
      <button type="button" disabled aria-label="全屏填写">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2a1 1 0 1 0 0 2h18a1 1 0 1 0 0-2H3Zm4.5 11v1.692a.7.7 0 0 1-1.088.582l-4.038-2.691a.7.7 0 0 1 0-1.165l4.038-2.692a.7.7 0 0 1 1.088.582V11h9V9.308a.7.7 0 0 1 1.088-.582l4.038 2.692a.7.7 0 0 1 0 1.165l-4.038 2.691a.7.7 0 0 1-1.088-.582V13h-9ZM2 21a1 1 0 0 1 1-1h18a1 1 0 0 1 0 2H3a1 1 0 0 1-1-1Z" fill="currentColor" /></svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SelfSummaryPerson } from '@/api/performance'
import SpaceLeftOutlinedIcon from '@/components/performance/SpaceLeftOutlinedIcon.vue'

const props = defineProps<{ person: SelfSummaryPerson }>()
defineEmits<{ back: [] }>()
const initial = computed(() => props.person.display_name.trim().slice(0, 1) || '我')
const personMeta = computed(() => [props.person.organization_ref, props.person.manager_name].filter(Boolean).join(' · '))
</script>

<style scoped>
.self-summary-header{display:flex;height:64px;flex:none;align-items:center;padding:0 20px 0 16px;box-sizing:border-box;border-bottom:1px solid rgba(31,35,41,.15);background:#fff;color:#1f2329}.header-actions button{display:grid;place-items:center;padding:4px;border:0;border-radius:6px;background:transparent;color:#1f2329}.back-button{display:flex;width:28px;height:24px;flex:0 0 28px;align-items:center;justify-content:center;margin-right:16px;padding:2px 4px;box-sizing:border-box;border:0;border-radius:0;background:transparent;color:#1f2329;cursor:pointer;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji";font-size:16px;font-weight:600;line-height:24px}.back-button:hover{background:rgba(31,35,41,.1)}.back-icon{display:block;width:20px;height:20px;flex:0 0 20px;color:#1f2329;line-height:20px}.person-avatar{display:grid;width:40px;height:40px;flex:0 0 40px;place-items:center;border-radius:50%;background:#dbe4f5;color:#1456f0;font-size:14px;font-weight:600}.person-info{min-width:0;margin-left:12px}.person-info strong,.person-info span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.person-info strong{color:#1d252f;font-size:16px;line-height:24px}.person-info span{max-width:680px;color:#646a73;font-size:14px;line-height:20px}.header-actions{display:flex;align-items:center;gap:8px;margin-left:auto}.header-actions button{width:28px;height:28px}.header-actions button:disabled{color:#646a73;cursor:not-allowed;opacity:.72}.header-actions svg{width:14px;height:14px}.header-actions i{width:1px;height:16px;background:rgba(31,35,41,.15)}
</style>
