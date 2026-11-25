<template>
  <div class="report-cycle-selector" :class="`is-${axis}`">
    <ElPopover v-model:visible="open" trigger="click" placement="bottom-start" :width="240" :show-arrow="false">
      <template #reference><button class="axis-trigger" type="button" :aria-label="label" aria-haspopup="menu" :aria-expanded="open"><span>{{ label }}</span><DownOutlinedIcon /></button></template>
      <div role="menu" aria-label="绩效周期" @keydown.esc="open = false">
        <ElPopover v-for="cycle in cycles" :key="cycle.id" :trigger="['hover', 'click']" placement="right-start" :fallback-placements="['left-start', 'bottom-start']" :width="220" :show-arrow="false" @show="load(cycle.id)">
          <template #reference><button class="cycle-option" type="button" role="menuitem" aria-haspopup="menu" @focus="load(cycle.id)" @click="load(cycle.id)">{{ cycle.name }}<span aria-hidden="true">›</span></button></template>
          <div role="menu" :aria-label="`${cycle.name}评估项`">
            <p v-if="loading[cycle.id]" role="status">正在加载评估项…</p>
            <div v-else-if="errors[cycle.id]" role="alert">评估项加载失败<button class="cycle-option" type="button" @click="load(cycle.id)">重新加载</button></div>
            <template v-else><button v-for="item in options[cycle.id] || []" :key="item.key" class="cycle-option" type="button" role="menuitem" @click="choose(cycle.id, item.key)">{{ item.label }}<span v-if="cycle.id === selectedCycle && item.key === selectedKey" aria-hidden="true">✓</span></button><p v-if="options[cycle.id]?.length === 0">暂无可用评估项</p></template>
          </div>
        </ElPopover>
        <p v-if="!cycles.length">暂无可选周期</p>
      </div>
    </ElPopover>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElPopover } from 'element-plus'
import DownOutlinedIcon from './DownOutlinedIcon.vue'
import type { ReportIndicator } from './projectStatisticsReport'
const props = defineProps<{ axis: 'x' | 'y'; label: string; cycles: { id: number; name: string }[]; selectedCycle?: number; selectedKey?: string; loadOptions: (cycleId: number) => Promise<ReportIndicator[]> }>()
const emit = defineEmits<{ select: [cycleId: number, key: string] }>()
const open = ref(false)
const options = ref<Record<number, ReportIndicator[]>>({})
const loading = ref<Record<number, boolean>>({})
const errors = ref<Record<number, boolean>>({})
let generation = 0
watch(() => props.loadOptions, () => { generation++; options.value = {}; loading.value = {}; errors.value = {}; open.value = false })
async function load(id: number) {
  if (options.value[id] || loading.value[id]) return
  const version = generation
  loading.value[id] = true; errors.value[id] = false
  try { const value = await props.loadOptions(id); if (version === generation) options.value[id] = value }
  catch { if (version === generation) errors.value[id] = true }
  finally { if (version === generation) loading.value[id] = false }
}
function choose(id: number, key: string) { emit('select', id, key); open.value = false }
</script>
<style scoped>
.report-cycle-selector { position: relative; z-index: 3; }
.is-x { height: 48px; margin-left: var(--spacing-2); }
.is-y { position: absolute; top: var(--spacing-3); left: var(--spacing-2); width: 28px; }
.axis-trigger { display: inline-flex; align-items: center; gap: var(--spacing-1); border: 0; padding: var(--spacing-1); background: transparent; color: var(--color-text-primary); cursor: pointer; font: inherit; white-space: nowrap; }
.is-x .axis-trigger { height: 48px; }
.is-y .axis-trigger { writing-mode: vertical-rl; text-orientation: mixed; width: 28px; }
.axis-trigger svg { width: 14px; height: 14px; }
.cycle-option { display: flex; justify-content: space-between; align-items: center; gap: var(--spacing-2); width: 100%; min-height: var(--performance-select-option-height); padding: var(--spacing-1) var(--spacing-2); border: 0; border-radius: var(--performance-control-radius); background: transparent; color: var(--color-text-primary); font: inherit; text-align: left; cursor: pointer; }
.cycle-option:hover, .cycle-option:focus-visible { background: var(--performance-button-text-neutral-hover-background); }
.axis-trigger:focus-visible { outline: none; box-shadow: var(--performance-button-focus-ring); }
p { margin: var(--spacing-2); color: var(--color-text-secondary); }
</style>
