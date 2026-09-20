<template>
  <Teleport to="body">
    <div v-if="modelValue" class="performance-drawer" role="presentation">
      <div class="performance-drawer__mask" @click="close" />
      <section class="performance-drawer__panel" :style="{ width }" role="dialog" aria-modal="true" :aria-label="title">
        <header class="performance-drawer__header">
          <h2>{{ title }}</h2>
          <button class="performance-drawer__close" type="button" aria-label="关闭" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" data-icon="CloseOutlined" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </button>
        </header>
        <div class="performance-drawer__body"><slot /></div>
        <slot name="footer" />
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ modelValue: boolean; title: string; width?: string }>(), { width: '480px' })
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; close: [] }>()
function close() { emit('close'); emit('update:modelValue', false) }
</script>

<style scoped>
.performance-drawer__mask{position:fixed;inset:0;z-index:calc(var(--performance-drawer-z-index) - 1);background:rgba(31,35,41,.25)}.performance-drawer__panel{position:fixed;top:0;right:0;bottom:0;z-index:var(--performance-drawer-z-index);display:flex;flex-direction:column;max-width:100vw;background:#fff;box-shadow:-8px 0 24px rgba(31,35,41,.16)}.performance-drawer__header{display:flex;align-items:center;justify-content:space-between;flex:0 0 56px;padding:16px 24px;box-sizing:border-box;border-bottom:1px solid #dee0e3;color:#1f2329}.performance-drawer__header h2{margin:0;font:600 16px/24px inherit}.performance-drawer__close{display:grid;place-items:center;width:24px;height:24px;margin:0 -4px;padding:4px;border:0;border-radius:6px;background:transparent;color:#646a73;cursor:pointer}.performance-drawer__close:hover,.performance-drawer__close:focus-visible{background:#eff0f1;color:#4e83fd;outline:0}.performance-drawer__close svg{width:16px;height:16px}.performance-drawer__body{display:flex;flex:1;min-height:0;overflow:hidden}
</style>
