<template>
  <div class="line-tabs" :class="{ sticky, flush }">
    <div class="line-tabs-holder">
      <div ref="wrapRef" class="line-tabs-wrap">
        <div class="line-tabs-overflow">
          <div v-for="tab in tabs" :key="tab.key" class="line-tabs-item">
            <button
              type="button"
              class="line-tab"
              :class="{ active: tab.key === modelValue, disabled: tab.disabled }"
              :disabled="tab.disabled"
              :aria-selected="tab.key === modelValue"
              role="tab"
              @click="select(tab)"
            >{{ tab.label }}</button>
          </div>
          <div class="line-tabs-ink" :style="inkStyle"></div>
        </div>
        <div class="line-tabs-divider" aria-hidden="true"></div>
      </div>
    </div>
    <div class="line-tabs-content">
      <div class="line-tabs-pane">
        <slot />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface PerformanceLineTab {
  key: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  tabs: PerformanceLineTab[]
  modelValue: string
  sticky?: boolean
  flush?: boolean
}>(), {
  sticky: false,
  flush: false,
})

const emit = defineEmits<{
  'update:modelValue': [key: string]
}>()

const wrapRef = ref<HTMLElement | null>(null)
const ink = ref({ left: 0, width: 0, ready: false })

function measureInk() {
  const root = wrapRef.value
  if (!root) return
  const active = root.querySelector<HTMLElement>('.line-tab.active')
  if (!active) {
    ink.value = { left: 0, width: 0, ready: false }
    return
  }
  ink.value = { left: active.offsetLeft, width: active.offsetWidth, ready: true }
}

const inkStyle = computed(() => ink.value.ready
  ? { left: `${ink.value.left}px`, width: `${ink.value.width}px` }
  : { opacity: '0' })

function select(tab: PerformanceLineTab) {
  if (tab.disabled || tab.key === props.modelValue) return
  emit('update:modelValue', tab.key)
}

let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await nextTick()
  measureInk()
  if (typeof ResizeObserver !== 'undefined' && wrapRef.value) {
    resizeObserver = new ResizeObserver(() => measureInk())
    resizeObserver.observe(wrapRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch(() => [props.modelValue, props.tabs], async () => {
  await nextTick()
  measureInk()
}, { deep: true })
</script>

<style scoped>
.line-tabs { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.line-tabs.sticky .line-tabs-holder { position: sticky; top: calc(-1 * var(--performance-review-surface-inset)); z-index: 30; }
.line-tabs-holder { display: flex; position: relative; margin: 0 calc(-1 * var(--performance-review-surface-inset)); padding-top: 12px; padding-right: var(--performance-review-surface-inset); padding-left: var(--performance-review-surface-inset); background: var(--performance-line-tabs-surface); }
.line-tabs.flush .line-tabs-holder { margin-right: 0; margin-left: 0; padding-right: 0; padding-left: 0; }
.line-tabs-wrap { position: relative; flex: 1; min-width: 0; }
.line-tabs-overflow { display: flex; position: relative; flex-wrap: wrap; min-width: 0; min-height: 0; margin-bottom: 12px; }
.line-tabs-item { min-width: 0; min-height: 0; }
.line-tab { display: inline-flex; position: relative; align-items: center; max-width: 240px; margin-right: 28px; padding: 0 0 12px; overflow: hidden; border: 0; background: transparent; color: var(--performance-line-tabs-text); cursor: pointer; font-family: inherit; font-size: 16px; font-weight: 400; line-height: 24px; text-overflow: ellipsis; transition: color 0.1s linear, background-color 0.1s linear, border-color 0.1s linear; white-space: nowrap; }
.line-tab:hover { color: var(--performance-line-tabs-ink); }
.line-tab.active { color: var(--performance-line-tabs-ink); font-weight: 600; }
.line-tab.disabled { color: var(--performance-line-tabs-text); cursor: not-allowed; opacity: 0.55; }
.line-tabs-ink { position: absolute; top: 33px; bottom: 0; left: 0; z-index: 1; overflow: hidden; width: 0; height: 3px; min-width: 0; min-height: 0; background: var(--performance-line-tabs-ink); transition: width 0.3s cubic-bezier(0.34, 0.69, 0.1, 1), left 0.3s cubic-bezier(0.34, 0.69, 0.1, 1), top 0.3s cubic-bezier(0.34, 0.69, 0.1, 1); }
.line-tabs-divider { position: absolute; top: 35px; right: 0; bottom: 0; left: 0; z-index: 0; height: 1px; background: var(--performance-line-tabs-divider); }
.line-tabs-content { min-height: 0; padding-top: 0; background: var(--performance-line-tabs-surface); }
.line-tabs-pane { min-width: 0; min-height: 0; }
</style>
