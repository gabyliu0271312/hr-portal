<template>
  <section class="performance-reference-content" :aria-label="reference.node_name">
    <h2 v-if="showTitle" class="reference-content-title">{{ reference.node_name }}</h2>
    <PerformanceTemplateRenderer
      v-if="reference.status === 'completed' && reference.form_schema.length"
      mode="readonly"
      :sections="reference.form_schema"
      :answers="reference.answers"
    />
    <div v-else class="performance-reference-empty">
      <img v-if="reference.status === 'not_started'" src="/performance-not-started.svg" alt="" width="120" height="121">
      <img v-else src="/performance-no-submit.svg" alt="" width="120" height="120">
      <p>{{ reference.status === 'completed' ? '暂无可查看内容' : '暂未提交' }}</p>
      <button v-if="reference.can_remind" class="performance-reminder-button" type="button" aria-label="催办" title="催办" @click="$emit('remind', reference)">
        <span class="performance-reminder-button__icon" aria-hidden="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" data-icon="BellOutlined"><path d="M10 3.176v-.26c0-.55.45-1 1-1h2c.55 0 1 .45 1 1v.26c3.45.917 6 4.15 6 7.998v6.364h1a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2h1v-6.364c0-3.848 2.55-7.081 6-7.998ZM6 17.538h12v-6.361c0-3.458-2.686-6.261-6-6.261s-6 2.803-6 6.26v6.362Zm2.75 4.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 0 2h-4.5a1 1 0 0 1-1-1Z" fill="currentColor"/></svg>
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PerformanceReferenceTab } from '@/api/performance'
import PerformanceTemplateRenderer from './PerformanceTemplateRenderer.vue'

defineProps<{ reference: PerformanceReferenceTab; showTitle?: boolean }>()
defineEmits<{ remind: [reference: PerformanceReferenceTab] }>()
</script>

<style scoped>
.reference-content-title{flex:none;margin:0 0 20px;color:var(--color-text-primary);font:600 16px/24px var(--font-sans)}
.performance-reference-content{width:100%;min-height:100%;box-sizing:border-box}.performance-reference-empty{display:flex;min-height:360px;flex-direction:column;align-items:center;justify-content:center;color:#646a73}.performance-reference-empty p{margin:8px 0 20px;color:#646a73;font-size:16px;line-height:24px}.performance-reminder-button{display:flex;position:relative;justify-content:center;align-items:center;width:80px;height:32px;min-width:80px;padding:4px 11px;box-sizing:border-box;border:1px solid var(--color-primary);border-radius:6px;background:#c2d4ff;color:var(--color-primary);cursor:pointer;transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in,width .2s ease-in}.performance-reminder-button:hover,.performance-reminder-button:focus-visible{background:#abc4ff;outline:0}.performance-reminder-button:active{background:#9ebaff}.performance-reminder-button__icon{display:block;line-height:0}.performance-reminder-button svg{display:inline-block;overflow:hidden;width:14px;height:14px;line-height:14px}
</style>
