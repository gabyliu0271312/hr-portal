<template>
  <section class="workbench-timeline" aria-label="绩效流程节点">
    <div ref="viewport" class="timeline-viewport">
      <div ref="track" class="timeline-track" :style="{ transform: `translateX(${trackOffset}px)` }">
        <div v-for="(node, index) in nodes" :key="node.node_id" class="timeline-node" :class="{ completed: node.completed, current: node.current }">
          <div class="node-copy">
            <strong :title="node.node_name">{{ node.node_name }}</strong>
            <span :title="node.range">{{ node.range }}</span>
          </div>
          <div class="node-rail" aria-hidden="true">
            <i class="node-segment" :class="{ 'is-hidden': index === 0 }"></i>
            <span class="node-marker">
              <svg v-if="node.completed" class="node-success" viewBox="0 0 24 24" fill="none" data-icon="SucceedFilled">
                <path d="M11.996 22.98c-6.067 0-10.983-4.918-10.983-10.984S5.93 1.013 11.996 1.013c6.066 0 10.983 4.917 10.983 10.983 0 6.066-4.917 10.984-10.983 10.984Z" fill="currentColor" />
                <path d="M17.537 10.746a1.38 1.38 0 0 0-.005-1.95 1.378 1.378 0 0 0-1.95-.005l-4.89 4.89-2.285-2.285a1.375 1.375 0 0 0-1.942.012 1.373 1.373 0 0 0-.013 1.942c1.178 1.175 2.356 2.348 3.53 3.528.392.394 1.03.394 1.422 0 2.037-2.051 4.087-4.09 6.133-6.132Z" fill="#fff" />
              </svg>
              <span v-else-if="node.current" class="node-current"><i></i></span>
              <span v-else class="node-dot"></span>
            </span>
            <i class="node-segment" :class="{ 'is-hidden': index === nodes.length - 1 }"></i>
          </div>
        </div>
      </div>
    </div>
    <div v-if="showPrevious" class="timeline-navigation is-previous">
      <button type="button" aria-label="查看前序节点" @click="currentPage -= 1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M16.293 2.293a1 1 0 0 1 0 1.414L8 12l8.293 8.293a1 1 0 1 1-1.414 1.414l-8.293-8.293a2 2 0 0 1 0-2.828l8.293-8.293a1 1 0 0 1 1.414 0Z" fill="currentColor" /></svg>
      </button>
    </div>
    <div v-if="showNext" class="timeline-navigation is-next">
      <button type="button" aria-label="查看后续节点" @click="currentPage += 1">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7.707 21.707a1 1 0 0 1 0-1.414L16 12 7.707 3.707a1 1 0 1 1 1.414-1.414l8.293 8.293a2 2 0 0 1 0 2.828l-8.293 8.293a1 1 0 0 1-1.414 0Z" fill="currentColor" /></svg>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

export interface WorkbenchTimelineNode {
  node_id: string
  node_name: string
  range: string
  completed: boolean
  current: boolean
}

const props = defineProps<{ nodes: WorkbenchTimelineNode[] }>()
const viewport = ref<HTMLElement>()
const track = ref<HTMLElement>()
const viewportWidth = ref(0)
const trackWidth = ref(0)
const currentPage = ref(0)
const maxOffset = computed(() => Math.max(0, trackWidth.value - viewportWidth.value))
const pageCount = computed(() => viewportWidth.value > 0 ? Math.max(1, Math.ceil(trackWidth.value / viewportWidth.value)) : 1)
const trackOffset = computed(() => -Math.min(currentPage.value * viewportWidth.value, maxOffset.value))
const showPrevious = computed(() => currentPage.value > 0 && maxOffset.value > 0)
const showNext = computed(() => currentPage.value < pageCount.value - 1)
let observer: ResizeObserver | undefined

function measureOverflow() {
  if (!viewport.value || !track.value) return
  viewportWidth.value = viewport.value.clientWidth
  trackWidth.value = track.value.scrollWidth
  currentPage.value = Math.min(currentPage.value, pageCount.value - 1)
}

watch(() => props.nodes.map(node => node.node_id).join('|'), () => {
  currentPage.value = 0
  void nextTick(measureOverflow)
})

onMounted(() => {
  void nextTick(measureOverflow)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measureOverflow)
    if (viewport.value) observer.observe(viewport.value)
    if (track.value) observer.observe(track.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<style scoped>
.workbench-timeline { position: relative; width: 100%; min-width: 0; height: 66px; }
.timeline-viewport { width: 100%; height: 66px; overflow: hidden; }
.timeline-track { display: flex; width: max-content; height: 66px; padding: 0 2px; box-sizing: border-box; margin: 0 auto; transition: transform .3s cubic-bezier(.4,0,.2,1); }
.timeline-node { width: 160px; flex: 0 0 160px; margin: 0 10px; }
.timeline-node:first-child { margin-left: 0; }
.timeline-node:last-child { margin-right: 0; }
.node-copy { height: 42px; margin-bottom: 8px; color: #1f2329; text-align: center; }
.node-copy strong, .node-copy span { display: block; overflow: hidden; color: #1f2329; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
.node-copy strong { font-size: 14px; line-height: 22px; }
.node-copy span { font-size: 12px; line-height: 20px; }
.node-rail { display: flex; align-items: center; height: 16px; margin: 0 -10px; }
.node-segment { flex: 1 1 0; height: 2px; background: #eff0f1; }
.node-segment.is-hidden { visibility: hidden; }
.node-marker { position: relative; z-index: 1; display: flex; flex: 0 0 0; width: 0; align-items: center; justify-content: center; }
.node-dot { flex: 0 0 8px; width: 8px; height: 8px; border-radius: 50%; background: #bbbfc4; }
.node-current { display: grid; width: 16px; height: 16px; flex: 0 0 16px; place-items: center; padding: 4px; border-radius: 50%; background: rgba(78, 131, 253, 0.15); }
.node-current i { display: block; width: 8px; height: 8px; border-radius: 50%; background: #3370ff; }
.node-success { display: block; flex: 0 0 12px; width: 12px; height: 12px; color: #34c724; }
.timeline-navigation { position: absolute; top: 0; bottom: 0; z-index: 2; display: flex; align-items: center; width: 48px; }
.timeline-navigation::before { content: ''; position: absolute; top: 0; bottom: 0; width: 100px; pointer-events: none; }
.is-next { right: 0; justify-content: flex-end; }
.is-previous { left: 0; justify-content: flex-start; }
.is-next::before { right: 0; background: linear-gradient(to left, #fff, #fff0); }
.is-previous::before { left: 0; background: linear-gradient(to right, #fff, #fff0); }
.timeline-navigation button { position: relative; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 1px solid #eff0f1; border-radius: 50%; background: #fff; color: #8f959e; box-shadow: 0 1px 4px rgba(4,49,114,.05); cursor: pointer; }
.timeline-navigation button:hover { color: #3370ff; }
.timeline-navigation button:focus-visible { outline: 2px solid #3370ff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .timeline-track { transition: none; } }
</style>
