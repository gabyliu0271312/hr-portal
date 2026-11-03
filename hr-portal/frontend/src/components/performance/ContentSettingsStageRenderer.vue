<template>
  <section class="content-canvas" :aria-label="ariaLabel">
    <div class="content-tabs" role="tablist">
      <button v-for="tab in tabs" :key="tab.key" class="content-tab" :class="{ 'content-tab--active': activeTab === tab.key }" role="tab" :aria-selected="activeTab === tab.key" type="button" @click="$emit('update:activeTab', tab.key)">{{ tab.label }}</button>
      <div class="content-tabs__divider" aria-hidden="true"></div>
    </div>
    <div ref="scrollBodyRef" class="content-canvas__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  tabs: Array<{ key: string; label: string }>
  activeTab: string
  ariaLabel?: string
}>(), { ariaLabel: '' })

defineEmits<{ 'update:activeTab': [value: string] }>()

// 与 REA 一致：只有内容区滚动，切换标签时把内容区回顶
const scrollBodyRef = ref<HTMLElement | null>(null)
watch(() => props.activeTab, () => { if (scrollBodyRef.value) scrollBodyRef.value.scrollTop = 0 })
</script>

<style scoped>
/* 照搬 REA 结构：tab 栏与内容区是兄弟节点，滚动条只长在内容区上，tab 栏天然不跟随滚动 */
.content-canvas { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; overflow: hidden; padding: 0 20px; box-sizing: border-box; background: #f5f6f7; }
.content-tabs { position: relative; flex: 0 0 auto; display: flex; align-items: stretch; width: var(--performance-content-width); max-width: 100%; height: 46px; margin: 8px auto 0; }
.content-tabs__divider { position: absolute; right: 0; top: 46px; left: 0; z-index: 0; height: .666667px; background: rgba(31, 35, 41, .15); }
.content-canvas__body { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; padding-bottom: 20px; box-sizing: border-box; }
.content-tab { position: relative; z-index: 1; display: inline-flex; align-items: center; max-width: 240px; height: 46px; margin-right: 28px; padding: 12px 0; box-sizing: border-box; border: 0; background: transparent; color: #1f2329; font: 400 14px/22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Microsoft YaHei", sans-serif; cursor: pointer; }
.content-tab:last-of-type { margin-right: 0; }
.content-tab--active { color: var(--color-primary); font-weight: 500; }
.content-tab--active::after { position: absolute; right: 0; bottom: 1px; left: 0; z-index: 2; height: 3px; background: var(--color-primary); content: ''; }

</style>
