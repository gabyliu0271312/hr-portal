<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = defineProps<{ people: Array<{ employee_no: string; display_name: string }> }>()
const root = ref<HTMLElement>()
const probe = ref<HTMLElement>()
const visibleCount = ref(0)
const visible = computed(() => props.people.slice(0, visibleCount.value))
let observer: ResizeObserver | undefined
function measure() {
  if (!root.value || !probe.value) return
  const widths = Array.from(probe.value.children, child => child.getBoundingClientRect().width)
  const available = root.value.clientWidth
  let used = 0
  let count = 0
  for (const width of widths) {
    const remaining = widths.length - count - 1
    const reserve = remaining ? 18 + String(remaining).length * 8 : 0
    if (used + width + reserve > available) break
    used += width
    count++
  }
  visibleCount.value = count
}
onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') { observer = new ResizeObserver(measure); observer.observe(root.value!) }
  measure()
})
watch(() => props.people, () => { void nextTick(measure) })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="root" class="compact-people">
    <span v-for="(person, index) in visible" :key="person.employee_no" class="compact-people__item" :title="person.display_name">
      <span class="compact-people__name">{{ person.display_name }}</span><span v-if="index < people.length - 1">,</span>
    </span>
    <span v-if="visibleCount < people.length" class="compact-people__overflow" :title="people.slice(visibleCount).map(person => person.display_name).join('、')">+{{ people.length - visibleCount }}</span>
    <span ref="probe" class="compact-people__probe" aria-hidden="true"><span v-for="(person, index) in people" :key="person.employee_no" class="compact-people__item"><span class="compact-people__name">{{ person.display_name }}</span><span v-if="index < people.length - 1">,</span></span></span>
  </div>
</template>

<style scoped>
.compact-people{position:relative;display:flex;align-items:center;width:100%;min-width:0;height:30px;overflow:hidden;margin-left:-8px}
.compact-people__item{display:inline-flex;flex:0 0 auto;align-items:center;box-sizing:border-box;padding:4px 8px;line-height:22px;white-space:nowrap}
.compact-people__name{max-width:76px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.compact-people__overflow{flex:0 0 auto;margin-left:10px;color:var(--color-primary);white-space:nowrap}
.compact-people__probe{position:absolute;top:0;left:0;display:flex;width:max-content;visibility:hidden;pointer-events:none}
</style>
