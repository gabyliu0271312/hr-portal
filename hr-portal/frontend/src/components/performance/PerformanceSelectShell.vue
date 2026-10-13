<template>
  <div ref="root" class="performance-select-shell" :class="{ 'is-open': open }">
    <div class="performance-select-shell__selector" :class="[$attrs.class, { 'has-value': selectedItems.length }]" @click="openMenu">
      <div class="performance-select-shell__content">
        <span v-if="!selectedItems.length && !query" class="performance-select-shell__placeholder">{{ placeholder }}</span>
        <div v-for="item in selectedItems" :key="item.value" class="performance-select-shell__tag" @click.stop>
          <span class="performance-select-shell__tag-content">{{ item.label }}</span>
          <button class="performance-select-shell__tag-close" type="button" :aria-label="`移除${item.label}`" @click.stop="removeValue(item.value)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="CloseBoldOutlined" aria-hidden="true"><path d="M19.778 19.778a1.5 1.5 0 0 0 0-2.121L14.122 12l5.656-5.657a1.5 1.5 0 1 0-2.121-2.121L12 9.879 6.343 4.222a1.5 1.5 0 1 0-2.121 2.121L9.878 12l-5.657 5.657a1.5 1.5 0 0 0 2.121 2.121L12 14.121l5.657 5.657a1.5 1.5 0 0 0 2.121 0Z" fill="currentColor" /></svg>
          </button>
        </div>
        <input ref="searchInput" v-model="query" class="performance-select-shell__input" type="search" role="combobox" autocomplete="off" :aria-label="ariaLabel" :aria-expanded="open" :placeholder="selectedItems.length ? undefined : placeholder" :style="{ width: query ? `${Math.max(6, query.length * 14)}px` : '6px' }" @focus="openMenu" @keydown.esc.stop="close" />
      </div>
      <button v-if="selectedItems.length" class="performance-select-shell__clear" type="button" :aria-label="clearLabel" @click.stop="clearAll">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" data-icon="EmptyFilled" aria-hidden="true"><path d="M12 23C5.925 23 1 18.075 1 12S5.925 1 12 1s11 4.925 11 11-4.925 11-11 11Zm3.874-16.635L12 10.239 8.126 6.365a1.245 1.245 0 1 0-1.761 1.76L10.239 12l-3.874 3.874a1.245 1.245 0 1 0 1.76 1.761L12 13.761l3.874 3.874a1.245 1.245 0 0 0 1.761-1.76L13.761 12l3.874-3.874a1.245 1.245 0 0 0-1.76-1.761Z" fill="currentColor" /></svg>
      </button>
      <DownBoldOutlinedIcon :size="12" class="performance-select-shell__arrow" />
    </div>
    <Teleport to="body">
      <div v-if="open" ref="popup" class="performance-select-shell__popup" :style="{ ...popupStyle, height: popupHeightStyle, maxHeight: `${popupMaxHeight}px` }">
        <section class="performance-select-shell__dialog" role="dialog" :aria-label="popupLabel">
          <slot :query="query" :close="close" :focus="focusSearch" />
        </section>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import DownBoldOutlinedIcon from './DownBoldOutlinedIcon.vue'

defineOptions({ inheritAttrs: false })

export type PerformanceSelectItem = { value: string; label: string }

const props = withDefaults(defineProps<{
  modelValue: string[]
  selectedItems?: PerformanceSelectItem[]
  placeholder?: string
  ariaLabel?: string
  popupLabel?: string
  clearLabel?: string
  popupHeight?: number | 'auto'
  popupMaxHeight?: number
}>(), {
  selectedItems: () => [],
  placeholder: '请选择',
  ariaLabel: '选择器',
  popupLabel: '选项',
  clearLabel: '清空已选',
  popupHeight: 'auto',
  popupMaxHeight: 320,
})
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
  'update:query': [value: string]
  open: []
  close: []
}>()
const root = ref<HTMLElement | null>(null)
const popup = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = defineModel<string>('query', { default: '' })
const popupStyle = ref<Record<string, string>>({ visibility: 'hidden' })
const popupHeightStyle = computed(() => props.popupHeight === 'auto' ? 'auto' : `${props.popupHeight}px`)

function updatePosition() {
  if (!open.value || !root.value) return
  const box = root.value.getBoundingClientRect()
  const gap = 4
  const margin = 8
  const below = box.bottom + gap
  const popupContentHeight = props.popupHeight === 'auto'
    ? Math.min(props.popupMaxHeight, popup.value?.getBoundingClientRect().height || props.popupMaxHeight)
    : props.popupHeight
  const top = below + popupContentHeight <= window.innerHeight - margin ? below : Math.max(margin, box.top - popupContentHeight - gap)
  const left = Math.min(box.left, Math.max(margin, window.innerWidth - box.width - margin))
  popupStyle.value = { position: 'fixed', top: `${top}px`, left: `${left}px`, width: `${box.width}px`, minWidth: `${box.width}px`, visibility: 'visible' }
}
function openMenu() {
  if (open.value) return
  open.value = true
  popupStyle.value = { visibility: 'hidden' }
  emit('open')
  void nextTick(() => { updatePosition(); focusSearch() })
}
function close() {
  if (!open.value) return
  open.value = false
  query.value = ''
  emit('close')
  popupStyle.value = { visibility: 'hidden' }
}
function focusSearch() { void nextTick(() => searchInput.value?.focus()) }
function removeValue(value: string) { emit('update:modelValue', props.modelValue.filter(item => item !== value)); focusSearch() }
function clearAll() { emit('update:modelValue', []); focusSearch() }
function onOutside(event: PointerEvent) {
  const target = event.target
  if (!(target instanceof Node) || root.value?.contains(target) || popup.value?.contains(target)) return
  close()
}
function onViewportChange() { if (open.value) updatePosition() }
onMounted(() => { document.addEventListener('pointerdown', onOutside); window.addEventListener('resize', onViewportChange); window.addEventListener('scroll', onViewportChange, true) })
onBeforeUnmount(() => { document.removeEventListener('pointerdown', onOutside); window.removeEventListener('resize', onViewportChange); window.removeEventListener('scroll', onViewportChange, true) })
</script>

<style scoped>
.performance-select-shell { position: relative; width: 100%; min-width: 0; }
.performance-select-shell__selector { display: flex; align-items: flex-start; overflow: hidden auto; width: 100%; min-height: 32px; max-height: 188px; padding: 1px 11px; box-sizing: border-box; border: 1px solid #d0d3d6; border-radius: 6px; background: #fff; color: #1f2329; font: 400 14px/22px var(--font-sans); cursor: text; transition: border .2s cubic-bezier(.34,.69,.1,1), background .2s cubic-bezier(.34,.69,.1,1); }
.performance-select-shell__selector.has-value { padding-left: 3px; }
.performance-select-shell__selector:hover, .performance-select-shell.is-open .performance-select-shell__selector { border-color: #336df4; }
.performance-select-shell__content { position: relative; display: flex; overflow: hidden; min-width: 0; flex: 1; flex-wrap: wrap; align-items: center; min-height: 28px; }
.performance-select-shell__placeholder { overflow: hidden; min-width: 0; max-width: 100%; color: #8f959e; line-height: 28px; text-overflow: ellipsis; white-space: nowrap; }
.performance-select-shell__tag { display: inline-flex; position: relative; z-index: 1; overflow: hidden; min-width: 0; max-width: 100%; height: 24px; flex: 0 1 auto; align-items: center; margin: 2px 4px 2px 0; padding: 0 6px; box-sizing: border-box; border-radius: 4px; background: rgba(31,35,41,.1); color: #1f2329; font: 400 14px/22px var(--font-sans); white-space: nowrap; cursor: text; }
.performance-select-shell__tag-content { display: block; overflow: hidden; max-width: 144px; text-overflow: ellipsis; white-space: nowrap; }
.performance-select-shell__tag-close { display: inline-flex; position: relative; z-index: 2; align-items: center; justify-content: center; width: 12px; height: 12px; min-width: 12px; max-width: 12px; flex: 0 0 12px; margin: 0 0 0 4px; padding: 0; box-sizing: border-box; border: 0; appearance: none; background: transparent; color: #1f2329; line-height: 0; opacity: .6; cursor: pointer; visibility: visible; }
.performance-select-shell__tag-close:hover { opacity: 1; }
.performance-select-shell__tag-close svg { display: block; overflow: visible; width: 12px !important; height: 12px !important; min-width: 12px; min-height: 12px; visibility: visible !important; opacity: 1 !important; }
.performance-select-shell__tag-close svg path { fill: currentColor !important; visibility: visible !important; opacity: 1 !important; }
.performance-select-shell__input { width: 6px; height: 28px; min-width: 6px; max-width: 100%; margin: 0; padding: 0; border: 0; outline: 0; background: transparent; color: #1f2329; font: 400 14px/22px var(--font-sans); }
.performance-select-shell__input::-webkit-search-cancel-button { display: none; }
.performance-select-shell__selector:not(.has-value) .performance-select-shell__input { position: absolute; inset: 0; z-index: 1; width: 100% !important; }
.performance-select-shell__clear { position: sticky; top: 0; display: flex; width: 12px; height: 28px; flex: 0 0 12px; align-items: center; justify-content: center; margin-left: 8px; padding: 0; border: 0; background: transparent; color: #646a73; cursor: pointer; opacity: 0; pointer-events: none; transition: opacity .1s ease-in; }
.performance-select-shell__selector:hover .performance-select-shell__clear { opacity: 1; pointer-events: auto; }
.performance-select-shell__arrow { position: sticky; top: 0; display: block; flex: 0 0 12px; margin: 8px 0 0 8px; color: #646a73; }
.performance-select-shell__popup { z-index: calc(var(--performance-confirm-z-index) + 1); display: flex; flex-direction: column; box-sizing: border-box; }
.performance-select-shell__dialog { display: flex; min-width: 0; min-height: 0; flex: 1; flex-direction: column; overflow: hidden; border-radius: 6px; outline: 0; background: #fff; box-shadow: rgba(31,35,41,.04) 0 8px 24px 8px, rgba(31,35,41,.04) 0 6px 12px, rgba(31,35,41,.06) 0 4px 8px -8px; }
</style>
