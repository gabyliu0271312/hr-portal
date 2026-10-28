<template>
  <PerformanceSnapshotFieldSelect v-bind="{ ...$attrs, ...props }" field="position_level" @open="emit('open')" @update:model-value="emit('update:modelValue', $event)" />
</template>

<script setup lang="ts">
import PerformanceSnapshotFieldSelect from './PerformanceSnapshotFieldSelect.vue'
import type { PerformanceSearchSelectOption } from './PerformanceSearchSelect.vue'

defineOptions({ inheritAttrs: false })
const props = withDefaults(defineProps<{ modelValue: string | string[] | null; cycleId?: number | null; options?: PerformanceSearchSelectOption[]; multiple?: boolean; disabled?: boolean; ariaLabel?: string; placeholder?: string }>(), { multiple: true, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [value: string | string[] | null]; open: [] }>()
</script>
