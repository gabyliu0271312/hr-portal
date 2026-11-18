<script setup lang="ts">
import { ref, watch } from 'vue'
import PerformancePopover from './PerformancePopover.vue'
import PerformancePersonSelect from './PerformancePersonSelect.vue'
import UiButton from '@/components/ui/UiButton.vue'
const props = defineProps<{ visible: boolean; anchor: HTMLElement | null; calibrators: string[]; reviewees: string[]; calibratorOptions: Array<{ value: string; label: string }>; revieweeOptions: Array<{ value: string; label: string }> }>()
const emit = defineEmits<{ close: []; apply: [calibrators: string[], reviewees: string[]] }>()
const selectedCalibrators = ref<string[]>([])
const selectedReviewees = ref<string[]>([])
watch(() => props.visible, open => { if (open) { selectedCalibrators.value = [...props.calibrators]; selectedReviewees.value = [...props.reviewees] } })
function apply() { emit('apply', selectedCalibrators.value, selectedReviewees.value); emit('close') }
</script>

<template>
  <PerformancePopover :visible="visible" :anchor="anchor" :width="348" role="dialog" name="calibration-filter" @close="emit('close')">
    <form class="calibration-filter-form" @submit.prevent="apply">
      <label>校准人</label>
      <PerformancePersonSelect v-model="selectedCalibrators" :options="calibratorOptions" multiple placeholder="全部" aria-label="筛选校准人" :remote-search="false" />
      <label>被校准人</label>
      <PerformancePersonSelect v-model="selectedReviewees" :options="revieweeOptions" multiple placeholder="全部" aria-label="筛选被校准人" :remote-search="false" />
      <div class="calibration-filter-actions"><UiButton variant="link" @click="selectedCalibrators = []; selectedReviewees = []">清除</UiButton><UiButton size="small" @click="emit('close')">取消</UiButton><UiButton variant="primary" size="small" type="submit">确定</UiButton></div>
    </form>
  </PerformancePopover>
</template>

<style scoped>
.calibration-filter-form{display:flex;flex-direction:column;padding:12px 8px}
.calibration-filter-form>label{padding-bottom:8px;font-weight:600;line-height:22px}
.calibration-filter-form>label:not(:first-child){margin-top:16px}
.calibration-filter-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;margin-top:20px}
.calibration-filter-actions .performance-button{min-width:60px;height:28px;line-height:18px}
</style>
<style>
.calibration-filter{z-index:calc(var(--z-index-drawer) + 2);--performance-popover-padding-x:16px;--performance-popover-padding-y:12px}
.calibration-filter>.performance-popover__arrow{display:none}
</style>
