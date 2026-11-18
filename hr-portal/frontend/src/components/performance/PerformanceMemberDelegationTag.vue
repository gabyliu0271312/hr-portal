<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { PerformanceMemberDelegation } from '@/api/performance'
import { formatDisplayDateTime } from '@/utils/datetime'
import PerformancePopover from './PerformancePopover.vue'

const props = defineProps<{ type: 'AUTHORIZE' | 'TRANSFER'; records: PerformanceMemberDelegation[] }>()
const label = computed(() => props.type === 'AUTHORIZE' ? '已授权' : '已转交')
const verb = computed(() => props.type === 'AUTHORIZE' ? '授权' : '转交')
const active = computed(() => props.records.some(record => record.authorization_type === props.type && record.status === 'ACTIVE'))
const history = computed(() => props.records.filter(record => record.authorization_type === props.type).slice().sort((a, b) => Date.parse(b.operated_at || b.created_at) - Date.parse(a.operated_at || a.created_at) || b.id - a.id))
const anchor = ref<HTMLElement | null>(null)
const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
function keepOpen() { clearTimeout(timer) }
function close() { keepOpen(); visible.value = false }
function open() { keepOpen(); visible.value = active.value }
function scheduleClose() {
  keepOpen()
  const delay = anchor.value ? parseFloat(getComputedStyle(anchor.value).getPropertyValue('--performance-member-hover-close-delay')) : 0
  timer = setTimeout(close, delay)
}
watch(active, value => { if (!value) close() })
onBeforeUnmount(keepOpen)
</script>

<template>
  <span v-if="active" class="member-delegation" @click.stop @keydown.esc.stop="close">
    <button ref="anchor" type="button" class="member-status-tag member-status-tag--delegation" :aria-label="`查看${verb}记录`" :aria-expanded="visible" @mouseenter="open" @mouseleave="scheduleClose" @focus="open" @blur="scheduleClose" @click="open">{{ label }}</button>
    <PerformancePopover :visible="visible" :anchor="anchor" name="member-delegation-popover" @close="close" @mouseenter="keepOpen" @mouseleave="scheduleClose">
      <div class="member-delegation-history">
        <div v-for="record in history" :key="record.id" class="member-delegation-record">
          <div class="member-delegation-record__description"><span class="member-delegation-record__person">{{ record.operator_name }}</span>已将该人员以下评估任务{{ verb }}给<span class="member-delegation-record__person">{{ record.recipient_name }}</span>：</div>
          <div class="member-delegation-record__stage">{{ record.stage_name }}</div>
          <div class="member-delegation-record__meta"><time>{{ formatDisplayDateTime(record.operated_at || record.created_at) }}</time><span>{{ record.status === 'ACTIVE' ? '生效中' : record.status === 'REVOKED' ? '已撤销' : '已替换' }}</span><span v-if="record.status === 'REVOKED' && record.revoked_by_name">{{ record.revoked_by_name }}撤销</span></div>
        </div>
      </div>
    </PerformancePopover>
  </span>
</template>

<style scoped>
.member-delegation{display:inline-flex;flex:none}
.member-status-tag{display:inline-flex;align-items:center;justify-content:center;flex:none;height:var(--performance-member-status-height);padding:0 var(--performance-member-status-padding-x);border:0;border-radius:var(--performance-member-status-radius);font:var(--font-weight-normal) var(--performance-member-status-font-size)/var(--performance-member-status-line-height) var(--font-sans);white-space:nowrap}
.member-status-tag--delegation{background:var(--performance-member-status-delegation-background);color:var(--performance-member-status-delegation-color);cursor:pointer}
.member-status-tag:focus-visible{outline:var(--ui-control-border-width) solid var(--color-primary);outline-offset:var(--performance-member-status-focus-offset)}
.member-delegation-history{display:flex;flex-direction:column;gap:var(--performance-member-history-gap)}
.member-delegation-record__description{font-weight:var(--performance-member-history-heading-weight)}
.member-delegation-record__person{color:var(--color-primary)}
.member-delegation-record__stage{margin-top:var(--performance-member-history-heading-gap);color:var(--color-text-tertiary)}
.member-delegation-record__meta{display:flex;flex-wrap:wrap;gap:var(--performance-member-history-meta-gap);margin-top:var(--performance-member-history-heading-gap);color:var(--color-text-tertiary);font-size:var(--performance-member-status-font-size)}
</style>
