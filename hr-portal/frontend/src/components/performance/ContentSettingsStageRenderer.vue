<template>
  <section class="content-canvas" :aria-label="ariaLabel">
    <div class="content-tabs" role="tablist">
      <button v-for="tab in tabs" :key="tab.key" class="content-tab" :class="{ 'content-tab--active': activeTab === tab.key }" role="tab" :aria-selected="activeTab === tab.key" type="button" @click="$emit('update:activeTab', tab.key)">{{ tab.label }}</button>
      <div class="content-tabs__divider" aria-hidden="true"></div>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tabs: Array<{ key: string; label: string }>
  activeTab: string
  ariaLabel?: string
}>(), { ariaLabel: '' })

defineEmits<{ 'update:activeTab': [value: string] }>()
</script>

<style scoped>
.content-canvas { min-width: 0; min-height: 0; overflow: auto; padding: 0 20px 20px; box-sizing: border-box; background: #f5f6f7; }
.content-tabs { position: relative; display: flex; align-items: stretch; max-width: 800px; height: 46px; margin: 8px auto 0; }
.content-tabs__divider { position: absolute; right: 0; top: 46px; left: 0; z-index: 0; height: .666667px; background: rgba(31, 35, 41, .15); }
.content-tab { position: relative; z-index: 1; display: inline-flex; align-items: center; max-width: 240px; height: 46px; margin-right: 28px; padding: 12px 0; box-sizing: border-box; border: 0; background: transparent; color: #1f2329; font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
.content-tab:last-of-type { margin-right: 0; }
.content-tab--active { color: #1456f0; font-weight: 500; }
.content-tab--active::after { position: absolute; right: 0; bottom: 1px; left: 0; z-index: 2; height: 3px; background: #1456f0; content: ''; }

</style>
