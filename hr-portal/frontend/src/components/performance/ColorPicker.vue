<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { PERFORMANCE_LEVEL_COLORS, type PerformanceColorOption } from './performanceColorOptions'

const props = withDefaults(defineProps<{
  modelValue: string
  options?: PerformanceColorOption[]
  label?: string
}>(), {
  options: () => PERFORMANCE_LEVEL_COLORS,
  label: '选择颜色',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  open: []
  close: []
}>()

const triggerRef = ref<HTMLButtonElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const expanded = ref(false)
const panelPosition = ref({ left: '0px', top: '0px' })
const selected = computed(() => props.options.find((option) => option.value === props.modelValue))
const triggerColor = computed(() => selected.value?.trigger || props.modelValue)

function positionPanel() {
  const rect = triggerRef.value?.getBoundingClientRect()
  if (!rect) return
  const width = 189.333
  const height = 77.333
  const left = Math.min(window.innerWidth - width - 8, Math.max(8, rect.left + rect.width / 2 - width / 2))
  const top = Math.max(8, rect.top - height - 10)
  panelPosition.value = { left: `${left}px`, top: `${top}px` }
}

async function open() {
  expanded.value = true
  emit('open')
  await nextTick()
  positionPanel()
}

function close() {
  if (!expanded.value) return
  expanded.value = false
  emit('close')
}

function toggle() {
  if (expanded.value) close()
  else void open()
}

function selectColor(value: string) {
  emit('update:modelValue', value)
  close()
  triggerRef.value?.focus()
}

function handlePointerDown(event: PointerEvent) {
  const target = event.target as Node
  if (!triggerRef.value?.contains(target) && !panelRef.value?.contains(target)) close()
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('resize', positionPanel)
  window.addEventListener('scroll', positionPanel, true)
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  window.removeEventListener('resize', positionPanel)
  window.removeEventListener('scroll', positionPanel, true)
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <button
    ref="triggerRef"
    class="performance-color-picker-trigger"
    type="button"
    :aria-label="label"
    :aria-expanded="expanded"
    :style="{ backgroundColor: triggerColor }"
    @pointerdown.stop
    @click.stop="toggle"
  >
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" data-icon="ExpandDownFilled" aria-hidden="true">
      <path d="M11.22 18.46a1 1 0 0 0 1.56 0l8.305-10.334a1 1 0 0 0-.78-1.626H3.696a1 1 0 0 0-.78 1.626L11.22 18.46Z" fill="currentColor" />
    </svg>
  </button>

  <Teleport to="body">
    <section
      v-if="expanded"
      ref="panelRef"
      class="performance-color-picker-popover"
      role="tooltip"
      :style="panelPosition"
      @pointerdown.stop
    >
      <div class="performance-color-picker-palette" role="listbox" :aria-label="label">
        <button
          v-for="(option, index) in options"
          :key="option.value"
          class="performance-color-swatch"
          :class="{ active: modelValue === option.value }"
          type="button"
          role="option"
          :aria-label="`颜色 ${index + 1}`"
          :aria-selected="modelValue === option.value"
          :style="{ backgroundColor: option.value }"
          @click="selectColor(option.value)"
        >
          <svg v-if="modelValue === option.value" width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="DoneOutlined" aria-hidden="true">
            <path d="M9.218 17.41 19.83 6.796a.99.99 0 1 1 1.389 1.415c-3.545 3.425-4.251 4.105-11.419 11.074a.997.997 0 0 1-1.375.017c-1.924-1.8-3.709-3.567-5.573-5.428a.999.999 0 0 1 1.414-1.415l4.95 4.95Z" fill="currentColor" />
          </svg>
        </button>
      </div>
      <svg class="performance-color-picker-arrow" width="16" height="8" viewBox="0 0 16 8" fill="none" aria-hidden="true">
        <path d="M8-.5H0v1c1.553 0 3.033.664 4.065 1.825l2.814 3.166a1.5 1.5 0 0 0 2.242 0l2.814-3.166A5.438 5.438 0 0 1 16 .5v-1H8z" />
      </svg>
    </section>
  </Teleport>
</template>

<style scoped>
.performance-color-picker-trigger { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; margin-top: 4px; padding: 0; border: 0; border-radius: 9999px; color: #2b2f36; cursor: pointer; }
.performance-color-picker-trigger:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
.performance-color-picker-popover { position: fixed; z-index: 1030; width: 189.333px; height: 77.333px; padding: 12px 16px; box-sizing: border-box; border: .666667px solid #dee0e3; border-radius: 8px; background: #fff; box-shadow: rgba(31, 35, 41, .04) 0 8px 24px 8px, rgba(31, 35, 41, .04) 0 6px 12px, rgba(31, 35, 41, .06) 0 4px 8px -8px; }
.performance-color-picker-palette { display: grid; grid-template-columns: repeat(6, 18px); grid-template-rows: repeat(2, 18px); gap: 8px; width: 156px; height: 52px; padding: 4px; box-sizing: border-box; }
.performance-color-swatch { display: grid; place-items: center; width: 18px; height: 18px; padding: 0; border: 0; border-radius: 4px; color: #000; cursor: pointer; }
.performance-color-swatch.active { box-shadow: 0 0 0 2px #3370ff; }
.performance-color-picker-arrow { position: absolute; left: calc(50% - 8px); bottom: -8px; overflow: visible; }
.performance-color-picker-arrow path { fill: #fff; stroke: #dee0e3; stroke-width: .666667px; }
</style>
