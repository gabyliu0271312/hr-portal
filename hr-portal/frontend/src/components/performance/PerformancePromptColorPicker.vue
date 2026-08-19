<template><div class="prompt-colors" @mouseleave="activeType = null"><button v-for="color in colors" :key="color.value" class="prompt-color" :class="{ selected: modelValue === color.value }" :style="{ backgroundColor: color.value }" type="button" :aria-label="color.label" @click="$emit('update:modelValue', color.value)" @mouseenter="showPopover(color.type, $event)"><svg v-if="modelValue === color.value" viewBox="0 0 24 24" aria-hidden="true"><path d="m9.218 17.41 10.612-10.614a.99.99 0 1 1 1.389 1.415c-3.545 3.425-4.251 4.105-11.419 11.074a.997.997 0 0 1-1.375.017c-1.924-1.8-3.709-3.567-5.573-5.428a.999.999 0 0 1 1.414-1.415l4.95 4.95Z" /></svg></button><PerformancePromptPopover :visible="activeType !== null" :type="activeType || 'info'" :anchor="anchor" /></div></template>
<script setup lang="ts">
import { ref } from 'vue'
import PerformancePromptPopover from './PerformancePromptPopover.vue'
import type { PromptColorKey } from './PerformancePromptNotice.vue'
const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
void props
void emit
const activeType = ref<PromptColorKey | null>(null)
const anchor = ref<DOMRect | null>(null)
const colors: Array<{ value: string; label: string; type: PromptColorKey }> = [{ value:'#3B82F6', label:'用于常规提示', type:'info' }, { value:'#F97316', label:'用于警示提示', type:'warning' }, { value:'#EF4444', label:'用于较强负面内容提示', type:'error' }, { value:'#10B981', label:'用于正向内容提示', type:'success' }]
function showPopover(type: PromptColorKey, event: MouseEvent) { activeType.value = type; anchor.value = (event.currentTarget as HTMLElement).getBoundingClientRect() }
</script>
<style scoped>.prompt-colors{display:flex;align-items:center;gap:6px;height:16px}.prompt-color{display:flex;width:16px;height:16px;flex:none;padding:0;align-items:center;justify-content:center;border:0;border-radius:4px;cursor:pointer}.prompt-color.selected{outline:2px solid #3370FF;outline-offset:2px}.prompt-color svg{display:block;width:12px;height:12px;fill:#fff}</style>
