<template>
  <button class="performance-remove-button" type="button" :aria-label="label" @click="$emit('click')">
    <i class="performance-remove-button__icon iconfont icon-remove" aria-hidden="true"></i>
  </button>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ label?: string }>(), { label: '移除' })
defineEmits<{ click: [] }>()
</script>

<style scoped>
@font-face{font-family:iconfont;src:url('https://at.alicdn.com/t/font_1769538_no05thuu20i.woff2?t=1620623497753') format('woff2'),url('https://at.alicdn.com/t/font_1769538_no05thuu20i.woff?t=1620623497753') format('woff'),url('https://at.alicdn.com/t/font_1769538_no05thuu20i.ttf?t=1620623497753') format('truetype')}.iconfont{font-family:iconfont!important;font-size:16px;font-style:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.icon-remove:before{content:'\ee7a'}.performance-remove-button{display:block;width:16px;height:24px;margin:0;padding:0;border:0;border-radius:var(--performance-button-radius);background:transparent;color:var(--color-text-secondary);cursor:pointer;font:400 16px/24px iconfont;transition:color var(--duration-fast) var(--ease-standard),background-color var(--duration-fast) var(--ease-standard)}.performance-remove-button__icon{display:block;width:16px;height:24px;line-height:24px}.performance-remove-button:hover,.performance-remove-button:focus-visible{background:var(--color-surface-disabled);color:var(--color-action-primary-hover);outline:0;box-shadow:var(--performance-button-focus-ring)}
</style>
