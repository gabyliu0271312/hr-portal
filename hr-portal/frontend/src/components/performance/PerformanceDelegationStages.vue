<template>
  <div class="delegation-stages" role="group" aria-label="按执行角色选择环节">
    <div class="delegation-stages__roles">
      <p>按执行角色选择</p>
      <button v-for="role in roles" :key="role.key" type="button" :aria-pressed="role.key === modelValue" :disabled="disabled" @click="$emit('update:modelValue', role.key)">{{ role.label }}</button>
    </div>
    <div class="delegation-stages__tasks">
      <p>{{ roles.find(role => role.key === modelValue)?.label }}执行的任务</p>
      <div class="delegation-stages__list">
        <div v-for="stage in stages" :key="stage.key" class="delegation-stages__task">
          <PerformanceCheckbox :model-value="selected.includes(stage.key)" :label="stage.label" :disabled="disabled || stage.disabled" @update:model-value="checked => $emit('toggle', stage.key, checked)" />
        </div>
        <span v-if="!stages.length" class="delegation-stages__empty">{{ emptyText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import PerformanceCheckbox from './PerformanceCheckbox.vue'
withDefaults(defineProps<{
  modelValue: string
  roles: Array<{ key: string; label: string }>
  stages: Array<{ key: string; label: string; disabled: boolean }>
  selected: string[]
  disabled?: boolean
  emptyText?: string
}>(), { emptyText: '暂无可处理的任务' })
defineEmits<{ 'update:modelValue': [value: string]; toggle: [key: string, checked: boolean] }>()
</script>

<style scoped>
.delegation-stages { display:flex; min-height:192px; border:1px solid var(--color-line-divider, #dee0e3); border-radius:var(--performance-dialog-radius); overflow:hidden; }
.delegation-stages p { margin:0; color:var(--color-text-secondary); font-size:var(--font-size-xs); line-height:20px; }
.delegation-stages__roles { flex:0 0 var(--performance-delegation-roles-width); box-sizing:border-box; padding:8px 0 4px; border-right:1px solid var(--color-line-divider, #dee0e3); }
.delegation-stages__roles p { padding:0 12px 8px; }
.delegation-stages__roles button { display:block; width:calc(100% - 16px); min-height:32px; margin:1px 8px; padding:4px 8px; border:0; border-radius:4px; background:transparent; color:var(--color-text-primary); font:400 var(--font-size-md)/22px var(--font-sans); text-align:left; cursor:pointer; }
.delegation-stages__roles button[aria-pressed=true] { background:var(--performance-delegation-role-selected-bg); color:var(--color-action-primary); font-weight:500; }
.delegation-stages__roles button:disabled { cursor:not-allowed; }
.delegation-stages__tasks { display:flex; flex:1; min-width:0; flex-direction:column; padding:8px 12px 4px; }
.delegation-stages__tasks > p { margin-bottom:12px; }
.delegation-stages__list { max-height:var(--performance-delegation-list-max-height); overflow:auto; }
.delegation-stages__task { margin-bottom:8px; }
.delegation-stages__task:last-child { margin-bottom:0; }
.delegation-stages__empty { color:var(--color-text-secondary); font-size:var(--font-size-md); }
</style>
