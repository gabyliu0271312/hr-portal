<template>
  <button type="button" class="performance-sort-header" :class="`is-align-${align}`" :aria-label="`${label}，${orderLabel}，点击切换排序`" @click.stop="emit('click')">
    <span class="sort-header-label"><slot>{{ label }}</slot></span>
    <span ref="iconsRef" class="sort-header-icons" aria-hidden="true" @mouseenter="showTooltip" @mouseleave="hideTooltip">
      <svg viewBox="0 0 24 24" data-icon="ExpandUpFilled" :class="{ active: order === 'ascending' }"><path d="M11.228 5.376a1 1 0 0 1 1.559 0l8.305 10.334a1 1 0 0 1-.78 1.626H3.703a1 1 0 0 1-.78-1.626l8.306-10.334Z" fill="currentColor" /></svg>
      <svg viewBox="0 0 24 24" data-icon="ExpandDownFilled" :class="{ active: order === 'descending' }"><path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" /></svg>
    </span>
    <Teleport to="body">
      <div v-if="tooltipVisible" class="performance-sort-tooltip" :style="tooltipStyle" role="tooltip">{{ sortTooltip }}</div>
    </Teleport>
  </button>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
const props = withDefaults(defineProps<{ label: string; order?: 'ascending' | 'descending' | null; align?: 'left' | 'right' }>(), { align: 'right' })
const emit = defineEmits<{ click: [] }>()
const orderLabel = computed(() => props.order === 'ascending' ? '升序' : props.order === 'descending' ? '降序' : '未排序')
const sortTooltip = computed(() => props.order === 'ascending' ? '取消排序' : props.order === 'descending' ? '点击升序' : '点击降序')

const iconsRef = ref<HTMLElement | null>(null)
const tooltipVisible = ref(false)
const tooltipStyle = ref<Record<string, string>>({})
function showTooltip() {
  const element = iconsRef.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  tooltipStyle.value = { left: `${rect.left + rect.width / 2}px`, top: `${rect.top - 8}px` }
  tooltipVisible.value = true
  window.addEventListener('scroll', hideTooltip, { capture: true, once: true })
}
function hideTooltip() {
  tooltipVisible.value = false
}
onBeforeUnmount(() => {
  window.removeEventListener('scroll', hideTooltip, { capture: true } as EventListenerOptions)
})
</script>

<style scoped>
.performance-sort-header { display: inline-flex; align-items: center; justify-content: flex-start; max-width: 100%; min-width: 0; height: 30px; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; font-size: 14px; font-weight: 500; line-height: 22px; text-align: left; cursor: pointer; }
.performance-sort-header.is-align-right { justify-content: flex-end; }
.sort-header-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sort-header-icons { display: flex; flex: 0 0 10px; flex-direction: column; width: 10px; height: 17px; margin-left: 8px; color: #646a73; }
.sort-header-icons svg { display: block; flex: 0 0 10px; width: 10px; height: 10px; opacity: .35; }
.sort-header-icons svg + svg { margin-top: -3px; }
.sort-header-icons svg.active { opacity: 1; }
.performance-sort-header:hover .sort-header-icons svg { opacity: .7; }
.performance-sort-header:hover .sort-header-icons svg.active { opacity: 1; }
.performance-sort-header:focus-visible { outline: 2px solid var(--color-primary, #3370ff); outline-offset: 2px; }
</style>

<style>
.performance-sort-tooltip { position: fixed; z-index: 3000; padding: 4px 8px; border-radius: 4px; background: #1f2329; box-shadow: 0 2px 8px rgba(31, 35, 41, 0.2); color: #fff; font-size: 12px; line-height: 20px; white-space: nowrap; pointer-events: none; transform: translate(-50%, -100%); }
</style>
