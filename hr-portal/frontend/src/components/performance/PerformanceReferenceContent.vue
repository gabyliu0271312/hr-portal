<template>
  <section class="performance-reference-content" :aria-label="reference.node_name">
    <PerformanceTemplateRenderer
      v-if="reference.status === 'completed' && reference.form_schema.length"
      mode="readonly"
      :sections="reference.form_schema"
      :answers="reference.answers"
    />
    <div v-else class="performance-reference-empty">
      <img v-if="reference.status === 'not_started'" src="/performance-not-started.svg" alt="" width="120" height="121">
      <svg v-else width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M76.543 70.079l-.216-.099-14.469 11.05a4 4 0 01-4.137.438L7.719 57.835c-1.36-.643-1.55-2.502-.347-3.407L21.06 44.142l21.08-36.53a4 4 0 015.175-1.617l51.362 24.281a4 4 0 01.975.65l14.776 13.376a4 4 0 01.781 4.964l-3.377 5.853-18.03 31.225-2.846 15.935c-.276 1.545-2.144 2.185-3.31 1.132l-13.33-12.042a4 4 0 01-1.242-3.746l3.478-17.535-.01-.009z" fill="#BBBFC4" fill-opacity=".45"/>
        <path d="M99.111 30.555a.5.5 0 00-.682.186l-22.1 38.56a.5.5 0 00.867.496l22.1-38.56a.5.5 0 00-.185-.682zM22.65 44.609a.5.5 0 01.663-.244l50.87 23.6a.5.5 0 01-.42.907l-50.87-23.6a.5.5 0 01-.244-.663zm55.94 26.106a.5.5 0 01.706 0l13.63 13.64a.5.5 0 01-.707.707l-13.63-13.64a.5.5 0 010-.707z" fill="#8F959E"/>
        <path d="M11.797 85.076c.096.265.382.41.638.324l13.99-4.695a.486.486 0 00.29-.635.515.515 0 00-.637-.324l-13.99 4.695a.486.486 0 00-.29.635zm16.86 8.06a.48.48 0 00.674-.168l3.574-6.425a.523.523 0 00-.194-.694.478.478 0 00-.674.168l-3.574 6.425a.523.523 0 00.194.694zm11.693 5.218a.472.472 0 00.604-.335l1.753-6.816a.53.53 0 00-.356-.63.473.473 0 00-.604.335l-1.753 6.816a.53.53 0 00.604-.335z" fill="#0C296E"/>
      </svg>
      <p>暂未提交</p>
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

defineProps<{ reference: PerformanceReferenceTab }>()
defineEmits<{ remind: [reference: PerformanceReferenceTab] }>()
</script>

<style scoped>
.performance-reference-content{width:100%;min-height:100%;box-sizing:border-box}.performance-reference-empty{display:flex;min-height:360px;flex-direction:column;align-items:center;justify-content:center;color:#646a73}.performance-reference-empty p{margin:8px 0 20px;color:#646a73;font-size:16px;line-height:24px}.performance-reminder-button{display:flex;position:relative;justify-content:center;align-items:center;width:80px;height:32px;min-width:80px;padding:4px 11px;box-sizing:border-box;border:1px solid #1456f0;border-radius:6px;background:#c2d4ff;color:#1456f0;cursor:pointer;transition:color .1s ease-in,background-color .1s ease-in,border-color .1s ease-in,width .2s ease-in}.performance-reminder-button:hover,.performance-reminder-button:focus-visible{background:#abc4ff;outline:0}.performance-reminder-button:active{background:#9ebaff}.performance-reminder-button__icon{display:block;line-height:0}.performance-reminder-button svg{display:inline-block;overflow:hidden;width:14px;height:14px;line-height:14px}
</style>
