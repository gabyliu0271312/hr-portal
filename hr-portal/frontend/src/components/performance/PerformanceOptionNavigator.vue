<template>
  <div
    class="performance-option-navigator"
    :class="[`is-${layoutMode}`, `is-${appearanceVariant}`, { 'is-fluid': fluid, 'is-readonly': !interactive }]"
    :style="{
      '--navigator-width': fluid ? '100%' : `${policy.viewportWidth}px`,
      '--navigator-height': `${policy.viewportHeight}px`,
      '--navigator-option-min-width': `${policy.optionMinWidth}px`,
      '--navigator-option-height': `${policy.optionHeight}px`,
      '--navigator-connector-min': `${policy.connectorMinWidth}px`,
      '--navigator-connector-max': `${policy.connectorMaxWidth}px`,
    }"
    :aria-label="label"
  >
    <div class="performance-option-navigator__viewport">
      <div ref="scrollRef" class="performance-option-navigator__scroll">
        <div class="performance-option-navigator__track" :class="{ 'is-overflowing': isOverflowing }" :style="{ transform: `translateX(${trackOffset}px)` }">
          <template v-for="(option, index) in options" :key="option.id">
            <div
              class="performance-option-navigator__option"
              :class="{ 'is-hovered': hoveredIndex === index }"
              :tabindex="interactive ? 0 : undefined"
              :role="interactive ? 'button' : undefined"
              :aria-disabled="interactive ? undefined : 'true'"
              @mouseenter="handleHover(index)"
              @focus="handleHover(index)"
            >
              {{ option.label }}
            </div>
            <div v-if="index < options.length - 1" class="performance-option-navigator__connector" :class="{ 'is-overflowing': isOverflowing }" aria-hidden="true"></div>
          </template>
        </div>
      </div>
    </div>
    <div v-if="showPrevious" class="performance-option-navigator__arrow-wrap performance-option-navigator__arrow-wrap--previous">
      <div class="performance-option-navigator__mask performance-option-navigator__mask--previous" aria-hidden="true"></div>
      <button class="performance-option-navigator__arrow" type="button" :disabled="!interactive" :aria-disabled="interactive ? undefined : 'true'" :aria-label="previousLabel" @click="movePrevious">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" data-icon="LeftOutlined" aria-hidden="true">
          <path d="M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 1 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z" fill="currentColor" />
        </svg>
      </button>
    </div>
    <div v-if="showNext" class="performance-option-navigator__arrow-wrap performance-option-navigator__arrow-wrap--next">
      <div class="performance-option-navigator__mask performance-option-navigator__mask--next" aria-hidden="true"></div>
      <button class="performance-option-navigator__arrow" type="button" :disabled="!interactive" :aria-disabled="interactive ? undefined : 'true'" :aria-label="nextLabel" @click="moveNext">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" data-icon="RightOutlined" aria-hidden="true">
          <path d="M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 1 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0Z" fill="currentColor" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface PerformanceOption {
  id: string
  label: string
}

export interface PerformanceOptionLayoutPolicy {
  viewportWidth?: number
  viewportHeight?: number
  optionMinWidth?: number
  optionHeight?: number
  connectorMinWidth?: number
  connectorMaxWidth?: number
  overflowGap?: number
  naturalMax?: number
  distributedMax?: number
}

const props = withDefaults(defineProps<{
  options: PerformanceOption[]
  label?: string
  previousLabel?: string
  nextLabel?: string
  appearanceVariant?: string
  layoutPolicy?: PerformanceOptionLayoutPolicy
  fluid?: boolean
  interactive?: boolean
}>(), {
  label: '选项预览',
  previousLabel: '上一组选项',
  nextLabel: '下一组选项',
  appearanceVariant: 'default',
  layoutPolicy: () => ({}),
  fluid: false,
  interactive: true,
})

const emit = defineEmits<{
  next: []
  previous: []
  hover: [index: number]
}>()

const policy = computed(() => {
  const custom = props.layoutPolicy
  return {
    viewportWidth: custom.viewportWidth ?? 552,
    viewportHeight: custom.viewportHeight ?? 38,
    optionMinWidth: custom.optionMinWidth ?? 42,
    optionHeight: custom.optionHeight ?? 32,
    connectorMinWidth: custom.connectorMinWidth ?? 12,
    connectorMaxWidth: custom.connectorMaxWidth ?? 88,
    overflowGap: custom.overflowGap ?? 12,
    naturalMax: custom.naturalMax ?? 5,
    distributedMax: custom.distributedMax ?? 10,
  }
})
const estimatedTrackWidth = computed(() => props.options.length * policy.value.optionMinWidth + Math.max(0, props.options.length - 1) * policy.value.overflowGap)
const measuredScrollWidth = ref<number | null>(null)
const measuredClientWidth = ref<number | null>(null)
const scrollRef = ref<HTMLElement>()
const currentPage = ref(0)
const hoveredIndex = ref<number | null>(null)
const effectiveScrollWidth = computed(() => measuredScrollWidth.value ?? estimatedTrackWidth.value)
const effectiveClientWidth = computed(() => measuredClientWidth.value ?? policy.value.viewportWidth)
const isOverflowing = computed(() => effectiveScrollWidth.value > effectiveClientWidth.value)
const layoutMode = computed(() => isOverflowing.value ? 'overflow' : props.options.length <= policy.value.naturalMax ? 'natural' : props.options.length <= policy.value.distributedMax ? 'distributed' : 'fit')
const maxTrackOffset = computed(() => -Math.max(0, effectiveScrollWidth.value - effectiveClientWidth.value))
const pageCount = computed(() => isOverflowing.value ? Math.max(2, Math.ceil(effectiveScrollWidth.value / effectiveClientWidth.value)) : 1)
const trackOffset = computed(() => {
  if (!props.interactive || currentPage.value <= 0) return 0
  return Math.max(-currentPage.value * effectiveClientWidth.value, maxTrackOffset.value)
})
const showPrevious = computed(() => props.interactive && currentPage.value > 0)
const showNext = computed(() => currentPage.value < pageCount.value - 1)
let resizeObserver: ResizeObserver | undefined

function measureOverflow() {
  const element = scrollRef.value
  if (!element || element.clientWidth <= 0 || element.scrollWidth <= 0) return
  measuredScrollWidth.value = element.scrollWidth
  measuredClientWidth.value = element.clientWidth
}

function scheduleMeasure() {
  void nextTick(measureOverflow)
}

watch(() => props.options.map((option) => `${option.id}:${option.label}`).join('|'), () => {
  measuredScrollWidth.value = null
  measuredClientWidth.value = null
  currentPage.value = 0
  hoveredIndex.value = null
  scheduleMeasure()
})
watch(pageCount, (value) => {
  if (currentPage.value >= value) currentPage.value = value - 1
})

onMounted(() => {
  scheduleMeasure()
  if (typeof ResizeObserver !== 'undefined' && scrollRef.value) {
    resizeObserver = new ResizeObserver(measureOverflow)
    resizeObserver.observe(scrollRef.value)
  }
})

onBeforeUnmount(() => resizeObserver?.disconnect())

function handleHover(index: number) {
  if (!props.interactive) return
  hoveredIndex.value = index
  emit('hover', index)
}

function moveNext() {
  if (!props.interactive || !showNext.value) return
  currentPage.value += 1
  hoveredIndex.value = null
  emit('next')
}

function movePrevious() {
  if (!props.interactive || !showPrevious.value) return
  currentPage.value -= 1
  hoveredIndex.value = null
  emit('previous')
}
</script>

<style scoped>
.performance-option-navigator { position: relative; width: var(--navigator-width); max-width: 100%; height: var(--navigator-height); overflow: hidden; }
.performance-option-navigator.is-readonly { pointer-events: none; }
.performance-option-navigator__viewport { position: relative; width: var(--navigator-width); max-width: 100%; height: var(--navigator-height); overflow: hidden; }
.performance-option-navigator__scroll { width: var(--navigator-width); max-width: 100%; height: 48px; padding: 4px 0 12px; box-sizing: border-box; overflow: auto hidden; scrollbar-width: none; }
.performance-option-navigator__scroll::-webkit-scrollbar { display: none; }
.performance-option-navigator__track { display: flex; align-items: center; width: 100%; min-width: 100%; height: var(--navigator-option-height); }
.performance-option-navigator__track.is-overflowing { width: max-content; min-width: 0; }
.performance-option-navigator__option { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: max-content; min-width: var(--navigator-option-min-width); height: var(--navigator-option-height); padding: 6px 12px; box-sizing: border-box; border: 0.666667px solid #d0d3d6; border-radius: 9999px; background: #fff; color: #646a73; font-size: 14px; font-weight: 600; line-height: 18px; cursor: pointer; outline: none; }
.performance-option-navigator__option.is-hovered,
.performance-option-navigator__option:hover,
.performance-option-navigator__option:focus-visible { border-color: #f0f4ff; background: #f0f4ff; color: #0c296e; }
.performance-option-navigator__connector { flex: 1 1 0%; min-width: var(--navigator-connector-min); max-width: var(--navigator-connector-max); height: 0.666667px; border-top: 0.666667px solid #d0d3d6; box-sizing: border-box; }
.performance-option-navigator__connector.is-overflowing { flex: 0 0 12px; min-width: 12px; max-width: 12px; }
.performance-option-navigator__arrow-wrap { position: absolute; top: 0; z-index: 20; display: flex; align-items: center; width: 48px; height: 38px; }
.performance-option-navigator__arrow-wrap--previous { left: 0; justify-content: flex-start; padding-right: 24px; }
.performance-option-navigator__arrow-wrap--next { right: 0; justify-content: flex-end; padding-left: 24px; }
.performance-option-navigator__mask { position: absolute; top: 0; z-index: 10; width: 100px; height: 38px; pointer-events: none; }
.performance-option-navigator__mask--previous { left: -2px; background: linear-gradient(to right, #fff, rgba(255,255,255,0)); }
.performance-option-navigator__mask--next { right: -2px; background: linear-gradient(to left, #fff, rgba(255,255,255,0)); }
.performance-option-navigator__arrow { position: relative; z-index: 20; display: flex; align-items: center; justify-content: center; width: 24px; height: 38px; padding: 0; border: 0; background: linear-gradient(269.77deg, #fff 68.99%, rgba(255,255,255,0) 99.31%); color: #8f959e; cursor: pointer; outline: none; }
.performance-option-navigator.is-readonly .performance-option-navigator__arrow { color: #8f959e; cursor: default; opacity: 1; }
.performance-option-navigator__arrow:hover,
.performance-option-navigator__arrow:focus-visible { color: #3370ff; }
.performance-option-navigator__arrow svg { display: block; width: 16px; height: 16px; }
</style>
