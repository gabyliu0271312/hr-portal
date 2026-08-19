<template>
  <div ref="root" class="ud__select__selector ud__select__selector-md ud__select__selector-border-normal ud__select__selector-not-empty" :class="{ 'is-open': open, 'is-disabled': disabled }" role="combobox" :aria-expanded="open" :aria-disabled="disabled" tabindex="0" @mouseenter="show" @mouseover="show" @mouseleave="close" @click="show" @keydown.enter.prevent="show" @keydown.space.prevent="show" @keydown.esc="close">
    <span class="ud__empty-inline-element">&nbsp;</span>
    <div class="ud__select__selector__content">
      <div class="ud__text ud__select__selector__selectItem">{{ modelValue }}</div>
      <div class="ud__select__selector__search">
        <input ref="searchInput" v-model="query" class="ud__select__selector__search__input ud__native-input" role="combobox" autocomplete="off" type="search" aria-label="搜索环节执行人" :tabindex="open ? 0 : -1" @click.stop @keydown.esc="close" @keydown.enter.prevent="chooseFirst" />
      </div>
    </div>
    <div class="ud__select__selector__arrow"><span class="universe-icon"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" data-icon="DownBoldOutlined"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0-1.414-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg></span></div>
    <div v-if="open" class="executor-options" :class="{ 'has-hovered': hoveredOption !== null }" role="listbox" @mouseleave="hoveredOption = null">
      <button v-for="option in filteredOptions" :key="option.type" class="executor-option" :class="{ 'is-hovered': hoveredOption === option.type, 'is-selected-visible': option.label === modelValue && hoveredOption === null }" type="button" role="option" :aria-selected="option.label === modelValue" @mouseenter="hoveredOption = option.type" @mousemove="hoveredOption = option.type" @click.stop="choose(option.label)"><span class="executor-option__content">{{ option.label }}</span><span v-if="option.label === modelValue" class="executor-option__check" aria-hidden="true"><svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg></span></button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import type { PerformanceExecutorOption } from './performanceExecutorOptions'

const props = defineProps<{ modelValue: string; options: readonly PerformanceExecutorOption[]; disabled?: boolean }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
const root = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const query = ref('')
const hoveredOption = ref<string | null>(null)
const filteredOptions = computed(() => {
  const keyword = query.value.trim()
  return keyword ? props.options.filter((option) => option.label.includes(keyword)) : props.options
})
function toggle() { if (props.disabled) return; open.value ? close() : show() }
function show() { open.value = true; query.value = ''; hoveredOption.value = null; void nextTick(() => searchInput.value?.focus()) }
function close() { open.value = false; query.value = ''; hoveredOption.value = null }
function choose(value: string) { emit('update:modelValue', value); close() }
function chooseFirst() { const first = filteredOptions.value[0]; if (first) choose(first.label) }
function handleOutside(event: MouseEvent) { if (root.value && event.target instanceof Node && !root.value.contains(event.target)) close() }
document.addEventListener('mousedown', handleOutside)
onBeforeUnmount(() => document.removeEventListener('mousedown', handleOutside))
</script>

<style scoped>
.ud__select__selector{position:relative;display:flex;align-items:flex-start;width:263.333px;height:32px;min-width:0;min-height:0;padding:1px 11px;box-sizing:border-box;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;color:#1f2329;background:#fff;border:.666667px solid #d0d3d6;border-radius:6px;cursor:text;transition:border .2s cubic-bezier(.34,.69,.1,1),background .2s cubic-bezier(.34,.69,.1,1)}
.ud__select__selector.is-open,.ud__select__selector:focus-visible{border-color:#336df4;outline:none}.ud__select__selector.is-disabled{background:#f5f6f7;color:#8f959e;cursor:not-allowed}
.ud__empty-inline-element{display:block;overflow:hidden;box-sizing:border-box;line-height:28px}.ud__select__selector__content{position:relative;width:220px;height:28.667px;overflow:hidden;box-sizing:border-box}.ud__text{display:block;width:220px;height:28px;overflow:hidden;box-sizing:border-box;font:400 14px/28px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;white-space:nowrap;word-break:keep-all;color:#1f2329}.ud__select__selector__search{position:absolute;inset:0;width:220px;height:28px;box-sizing:border-box}.ud__select__selector__search__input{display:block;width:220px;height:28px;padding:0;border:0;outline:0;background:transparent;color:transparent;font:400 14px/22.001px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;caret-color:transparent}.ud__select__selector.is-open .ud__select__selector__search__input{color:#1f2329;caret-color:#1f2329}.ud__select__selector__arrow{display:flex;position:sticky;top:0;align-items:center;width:12px;height:28px;margin-left:8px;box-sizing:border-box;font-size:12px;line-height:18.858px;color:#646a73}.universe-icon{display:block;width:12px;height:12px;font-size:12px;line-height:12px;text-align:center;color:#646a73}.universe-icon svg{display:inline-block;overflow:hidden;width:12px;height:12px;box-sizing:border-box}.executor-options{position:absolute;top:31px;left:-.666667px;z-index:20;width:263.333px;max-height:220px;overflow:auto;padding:4px 0;box-sizing:border-box;border:.666667px solid #d0d3d6;border-radius:6px;background:#fff;box-shadow:0 4px 12px rgba(31,35,41,.12)}.executor-option{display:block;width:100%;height:32px;padding:0 11px;border:0;background:#fff;color:#1f2329;text-align:left;font:400 14px/32px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}.executor-option:hover,.executor-option[aria-selected=true]{background:rgba(51,112,255,.08);color:#1f2329}
</style>

<style scoped>
.executor-options{top:32px;left:-.666667px;z-index:1050;width:263.323px;min-width:263.328px;max-width:420px;height:auto;max-height:165.333px;overflow:auto;padding:2px 0;background:transparent;transform:none;transform-origin:49.9406% 0;box-shadow:none}
.executor-options::before{position:absolute;inset:0;z-index:0;border-radius:6px;background:#fff;box-shadow:0 4px 12px rgba(31,35,41,.12);content:""}
.executor-option{position:relative;z-index:1;display:flex;align-items:center;width:calc(100% - 6px);height:30px;margin:1px 3px;padding:4px 8px;border-radius:4px;line-height:22px}
.executor-option:hover,.executor-option.is-hovered{background:rgba(31,35,41,.08)}
.executor-option[aria-selected=true]{background:#fff}
.executor-option.is-selected-visible{background:rgba(31,35,41,.08)}
.executor-options.has-hovered .executor-option[aria-selected=true]{background:#fff !important}
.executor-option__content{display:block;flex:1;min-width:0;overflow:hidden;line-height:22px;white-space:nowrap}.executor-option__check{display:flex;align-items:center;justify-content:center;width:16px;height:22px;color:#1456f0}.executor-option__check svg{width:16px;height:16px}
</style>
