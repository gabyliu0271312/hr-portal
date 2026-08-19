<template>
  <div ref="root" class="performance-role-multi-select" :class="{ disabled, open, 'has-options': options.length > 0 }">
    <button
      ref="trigger"
      class="role-select-trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="options.length > 0 ? open : undefined"
      aria-haspopup="listbox"
      :aria-invalid="ariaInvalid || undefined"
      @click="toggle"
    >
      <span class="role-select-content">
        <span v-if="modelValue.length === 0" class="role-select-placeholder">请选择</span>
        <span v-for="role in modelValue" v-else :key="role" class="role-select-tag">
          <span>{{ role }}</span>
          <span class="role-select-tag-close" role="button" tabindex="0" :aria-label="`移除${role}`" @click.stop="remove(role)" @keydown.enter.stop.prevent="remove(role)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19.778 19.778a1.5 1.5 0 0 0 0-2.121L14.122 12l5.656-5.657a1.5 1.5 0 1 0-2.12-2.121L12 9.879 6.343 4.222a1.5 1.5 0 1 0-2.12 2.121L9.878 12l-5.657 5.657a1.5 1.5 0 1 0 2.121 2.121L12 14.121l5.657 5.657a1.5 1.5 0 0 0 2.121 0Z" fill="currentColor" /></svg>
          </span>
        </span>
      </span>
      <span class="role-select-arrow" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m3.414 7.086-.707.707a1 1 0 0 0 0 1.414l7.778 7.778a2 2 0 0 0 2.829 0l7.778-7.778a1 1 0 0 0 0-1.414l-.707-.707a1 1 0 0 0-1.415 0l-7.07 7.07-7.072-7.07a1 1 0 0 0-1.414 0Z" fill="currentColor" /></svg></span>
    </button>
    <Teleport to="body">
      <div v-if="open && options.length > 0" ref="dropdown" class="role-select-dropdown" :style="dropdownStyle" role="listbox" aria-multiselectable="true">
        <div class="role-select-menu">
          <button
            v-for="role in options"
            :key="role"
            class="role-select-option"
            :class="{ active: activeRole === role, selected: modelValue.includes(role) }"
            type="button"
            role="option"
            :aria-selected="modelValue.includes(role)"
            @mouseenter="activeRole = role"
            @focus="activeRole = role"
            @click="toggleRole(role)"
          >
            <span>{{ role }}</span>
            <svg v-if="modelValue.includes(role)" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 11.293a1 1 0 0 1 1.414 0l4.072 4.07 9.07-9.07a1 1 0 0 1 1.415 0l.706.707a1 1 0 0 1 0 1.414L10.193 18.9a1 1 0 0 1-1.415 0l-5.485-5.485a1 1 0 0 1 0-1.414L4 11.293Z" fill="currentColor" /></svg>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

const props = withDefaults(defineProps<{
  modelValue: string[]
  options: string[]
  disabled?: boolean
  ariaInvalid?: boolean
}>(), { disabled: false, ariaInvalid: false })
const emit = defineEmits<{ (event: 'update:modelValue', value: string[]): void }>()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLElement | null>(null)
const dropdown = ref<HTMLElement | null>(null)
const open = ref(false)
const activeRole = ref('')
const dropdownStyle = ref<Record<string, string>>({})

function positionDropdown() {
  if (!trigger.value) return
  const rect = trigger.value.getBoundingClientRect()
  const estimatedHeight = Math.max(37.333, Math.min(184, props.options.length * 32 + 5.333))
  const placeAbove = window.innerHeight - rect.bottom < estimatedHeight + 4 && rect.top >= estimatedHeight + 4
  dropdownStyle.value = {
    left: `${rect.left}px`,
    top: `${placeAbove ? rect.top - estimatedHeight - 4 : rect.bottom + 4}px`,
    width: `${rect.width}px`,
    maxHeight: '184px',
    transformOrigin: placeAbove ? '50% 100%' : '50% 0',
  }
}
function close() { open.value = false }
function onDocumentPointerDown(event: Event) {
  const target = event.target
  if (!(target instanceof Node)) return
  if (!root.value?.contains(target) && !dropdown.value?.contains(target)) close()
}
function toggle() {
  if (props.disabled) return
  open.value = !open.value
  if (!open.value) return
  activeRole.value = props.modelValue.find((role) => props.options.includes(role)) || props.options[0] || ''
  void nextTick(positionDropdown)
}
function toggleRole(role: string) {
  emit('update:modelValue', props.modelValue.includes(role) ? props.modelValue.filter((item) => item !== role) : [...props.modelValue, role])
}
function remove(role: string) { emit('update:modelValue', props.modelValue.filter((item) => item !== role)) }

document.addEventListener('pointerdown', onDocumentPointerDown)
window.addEventListener('resize', positionDropdown)
window.addEventListener('scroll', positionDropdown, true)
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  window.removeEventListener('resize', positionDropdown)
  window.removeEventListener('scroll', positionDropdown, true)
})
</script>

<style scoped>
.performance-role-multi-select{width:215.333px;max-width:100%}.role-select-trigger{display:flex;align-items:center;width:100%;min-height:32px;max-height:90px;padding:1px 11px;box-sizing:border-box;border:.666667px solid #d0d3d6;border-radius:6px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;text-align:left;cursor:pointer}.performance-role-multi-select.open.has-options .role-select-trigger{border-color:#1456f0}.role-select-content{display:flex;flex:1 1 auto;align-items:center;overflow:auto;min-width:0;min-height:28px;flex-wrap:wrap}.role-select-placeholder{overflow:hidden;color:#8f959e;white-space:nowrap}.role-select-tag{display:flex;align-items:center;height:24px;margin:2px 4px 2px 0;padding:0 6px;box-sizing:border-box;border-radius:4px;background:rgba(31,35,41,.1);white-space:nowrap}.role-select-tag-close{display:flex;align-items:center;justify-content:center;width:12px;height:12px;margin-left:4px;color:#646a73}.role-select-tag-close svg{display:block}.role-select-arrow{display:flex;align-items:center;justify-content:center;flex:0 0 12px;width:12px;height:28px;margin-left:8px;color:#646a73}.role-select-arrow svg{display:block}.role-select-dropdown{position:fixed;z-index:1050;overflow:auto;box-sizing:border-box;border:.666667px solid #dee0e3;border-radius:6px;background:#fff;box-shadow:rgba(31,35,41,.04) 0 8px 24px 8px,rgba(31,35,41,.04) 0 6px 12px,rgba(31,35,41,.06) 0 4px 8px -8px}.role-select-menu{padding:2px 0}.role-select-option{display:flex;align-items:center;justify-content:space-between;width:calc(100% - 6px);height:30px;margin:1px 3px;padding:4px 8px;box-sizing:border-box;border:0;border-radius:4px;background:#fff;color:#1f2329;font:400 14px/22px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue","PingFang SC","Microsoft YaHei",sans-serif;text-align:left;cursor:pointer}.role-select-option.active{background:rgba(31,35,41,.08)}.role-select-option svg{color:#3370ff}.performance-role-multi-select.disabled .role-select-trigger{background:#f5f6f7;color:#bbbfc4;cursor:not-allowed}
</style>
