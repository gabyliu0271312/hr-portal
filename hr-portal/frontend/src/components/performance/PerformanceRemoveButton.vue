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
@font-face{font-family:iconfont;src:url('https://at.alicdn.com/t/font_1769538_no05thuu20i.woff2?t=1620623497753') format('woff2'),url('https://at.alicdn.com/t/font_1769538_no05thuu20i.woff?t=1620623497753') format('woff'),url('https://at.alicdn.com/t/font_1769538_no05thuu20i.ttf?t=1620623497753') format('truetype')}.iconfont{font-family:iconfont!important;font-size:16px;font-style:normal;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}.icon-remove:before{content:'\ee7a'}.performance-remove-button{display:block;width:16px;height:24px;margin:0;padding:0;border:0;background:transparent;color:#646a73;cursor:pointer;font:400 16px/24px iconfont}.performance-remove-button__icon{display:block;width:16px;height:24px;line-height:24px}.performance-remove-button:hover,.performance-remove-button:focus-visible{color:#4e83fd;outline:0}
</style>
