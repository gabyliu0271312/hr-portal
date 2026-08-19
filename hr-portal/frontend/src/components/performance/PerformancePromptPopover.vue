<template><Teleport to="body"><div v-if="visible && anchor" class="prompt-popover" :style="popoverStyle" role="tooltip"><PerformancePromptNotice :type="type" /><svg class="prompt-popover__arrow" width="16" height="8" viewBox="0 0 16 8" fill="none"><path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 002.242 0l2.814-3.166A5.438 5.438 0 0116 .5v-1H8z" fill="#fff" /></svg></div></Teleport></template>
<script setup lang="ts">
import { computed } from 'vue'
import PerformancePromptNotice, { type PromptColorKey } from './PerformancePromptNotice.vue'
const props = defineProps<{ visible: boolean; type: PromptColorKey; anchor: DOMRect | null }>()
const popoverStyle = computed(() => props.anchor ? { left: `${props.anchor.left + props.anchor.width / 2}px`, top: `${props.anchor.top - 8}px` } : {})
</script>
<style scoped>.prompt-popover{position:fixed;z-index:1030;box-sizing:border-box;padding:12px 16px;overflow:visible;background:#fff;border:.666667px solid #DEE0E3;border-radius:8px;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px 0,rgba(31,35,41,.06) 0 4px 8px -8px;transform:translate(-50%,-100%)}.prompt-popover__arrow{position:absolute;left:50%;bottom:-8px;width:16px;height:8px;overflow:hidden;transform:translateX(-50%)}</style>
