<template>
  <PerformanceSurfaceCard title="完成率">
    <div class="toolbar">
      <PerformanceSegmentedControl v-model="viewMode" :options="viewOptions" aria-label="完成率查看维度" />
      <PerformanceFilterButton />
    </div>
    <div class="node-grid">
      <CompletionNodeCard v-for="node in nodes" :key="node.key" :node="node">
        <template v-if="node.key === 'view-result'" #header-extra>
          <PerformanceSegmentedControl v-model="resultView" size="sm" :options="resultOptions" aria-label="结果查看维度" />
        </template>
        <template v-if="node.key !== 'result-reconsideration'" #actions>
          <PerformanceTextButton
            class="node-action"
            :label="node.key === 'view-result' ? '去开通' : '去催办'"
            @click="emit('action', { action: node.key === 'view-result' ? 'enable-result' : 'remind', nodeKey: node.key })"
          />
        </template>
      </CompletionNodeCard>
    </div>
  </PerformanceSurfaceCard>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import PerformanceSurfaceCard from './PerformanceSurfaceCard.vue'
import PerformanceSegmentedControl from './PerformanceSegmentedControl.vue'
import PerformanceFilterButton from './PerformanceFilterButton.vue'
import PerformanceTextButton from './PerformanceTextButton.vue'
import CompletionNodeCard, { type CompletionNode } from './CompletionNodeCard.vue'
import ViewVideoOutlinedIcon from './ViewVideoOutlinedIcon.vue'
import OrganizationOutlinedIcon from './OrganizationOutlinedIcon.vue'

defineProps<{
  nodes: CompletionNode[]
}>()

const emit = defineEmits<{
  action: [payload: { action: 'remind' | 'enable-result'; nodeKey: string }]
}>()

const viewMode = ref('by-person')
const viewOptions = [
  { value: 'by-person', label: '按人查看', icon: ViewVideoOutlinedIcon },
  { value: 'by-org', label: '按组织查看', icon: OrganizationOutlinedIcon },
]

const resultView = ref('opened')
const resultOptions = [
  { value: 'opened', label: '已开通' },
  { value: 'reconsidered', label: '已复议' },
]
</script>

<style scoped>
.toolbar { display: flex; height: 32px; flex: none; justify-content: space-between; }
.node-grid { display: grid; flex: 1; min-width: 0; min-height: 0; padding-top: 16px; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); align-content: start; }
.node-action { margin: -2px -4px -2px 16px; }
</style>
