<template>
  <aside ref="root" class="report-navigation" :class="{ collapsed }" aria-label="统计报表目录">
    <div v-if="!collapsed" class="report-menu-wrapper">
      <div class="report-collapse-row">
        <PerformanceIconButton class="report-collapse-button" icon="UpLeftOutlined" label="收起报表目录" :expanded="true" @click="toggle(true)" />
      </div>
      <nav ref="menu" class="report-menu" :style="{ maxHeight: `${menuHeight}px` }" aria-label="报表章节">
        <div class="report-menu-rail" :style="{ height: `${items.length * 34}px` }" aria-hidden="true">
          <div class="report-menu-indicator" :style="{ transform: `translateY(${activeIndex * 34 + 7}px)` }" />
        </div>
        <div class="report-menu-items">
          <template v-for="item in items" :key="item.key">
            <div v-if="item.group" class="report-menu-group">{{ item.label }}</div>
            <button v-else type="button" class="report-menu-item" :class="{ active: activeKey === item.key }" :data-key="item.key" :aria-current="activeKey === item.key ? 'location' : undefined" @click="emit('select', item.key)">{{ item.label }}</button>
          </template>
        </div>
      </nav>
    </div>
    <div v-else class="report-expand-handle">
      <PerformanceIconButton icon="UpLeftOutlined" label="展开报表目录" :expanded="false" @click="toggle(false)" />
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PerformanceIconButton from './PerformanceIconButton.vue'
import { reportGroups } from './projectStatisticsReport'

const props = defineProps<{ collapsed: boolean; activeKey: string; menuHeight: number }>()
const emit = defineEmits<{ 'update:collapsed': [value: boolean]; select: [key: string] }>()
const root = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const items = reportGroups.flatMap(group => [
  { key: group.key, label: group.label, group: true },
  ...group.sections.map(section => ({ ...section, group: false })),
])
const activeIndex = computed(() => Math.max(0, items.findIndex(item => item.key === props.activeKey)))

async function toggle(value: boolean) {
  emit('update:collapsed', value)
  await nextTick()
  root.value?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus({ preventScroll: true })
}

watch(() => [props.activeKey, props.collapsed], async () => {
  await nextTick()
  const el = menu.value
  if (!el || el.clientHeight <= 0) return
  const top = activeIndex.value * 34
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + 34 > el.scrollTop + el.clientHeight) el.scrollTop = top + 34 - el.clientHeight
})
</script>

<style scoped>
.report-navigation { position: sticky; top: var(--report-sticky-top, 68px); z-index: 10; flex: 0 0 200px; width: 200px; height: 0; }
.report-navigation.collapsed { width: 0; flex-basis: 0; }
.report-menu-wrapper { display: flex; flex-direction: column; }
.report-collapse-row { display: flex; align-items: center; height: 32px; }
.report-collapse-button { margin-left: 16px; width: 24px; height: 24px; padding: 4px; border-radius: 6px; color: #8f959e; transform: rotate(180deg); }
.report-menu { display: flex; align-items: flex-start; overflow-y: auto; scrollbar-width: thin; }
.report-menu-rail { position: relative; width: 4px; flex: 0 0 4px; background: #eff0f1; border-radius: 2px; }
.report-menu-indicator { position: absolute; inset: 0 auto auto 0; width: 4px; height: 20px; background: #3370ff; border-radius: 2px; transition: transform .3s ease-out; }
.report-menu-items { flex: 1; min-width: 0; margin-left: 16px; }
.report-menu-group, .report-menu-item { display: flex; align-items: center; height: 34px; box-sizing: border-box; font: inherit; font-size: 14px; line-height: 21px; white-space: nowrap; }
.report-menu-group { color: #9ca2a9; }
.report-menu-item { width: calc(100% - 16px); margin-left: 16px; padding: 0; border: 0; background: transparent; color: #1f2329; text-align: left; cursor: pointer; }
.report-menu-item:hover, .report-menu-item.active { color: #3370ff; }
.report-menu-item.active { font-weight: 600; }
.report-menu-item:focus-visible { outline: 2px solid #3370ff; outline-offset: -2px; }
.report-expand-handle { position: absolute; top: 4px; left: -8px; width: 32px; height: 24px; overflow: hidden; border-radius: 18px 0 0 18px; }
.report-expand-handle :deep(button) { width: 32px; height: 24px; padding: 4px; border-radius: 6px; background: #fff; color: #2b2f36; }
.report-expand-handle :deep(button:focus-visible) { outline: 2px solid #3370ff; outline-offset: -2px; }
@media (prefers-reduced-motion: reduce) { .report-menu-indicator { transition: none; } }
</style>
