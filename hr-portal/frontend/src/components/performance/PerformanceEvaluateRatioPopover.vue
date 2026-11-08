<template>
  <span ref="anchor" class="evaluate-ratio-anchor" :aria-label="`360° 评估率 ${completion}`" @mouseenter="open" @mouseleave="scheduleClose" @focusin="open" @focusout="close">
    <span class="evaluate-ratio-text">{{ completion }}</span>
    <PerformancePopover :visible="visible" :anchor="anchor" name="evaluate-ratio-popover" :width="380" :gap="10" :viewport-margin="16" content-class="evaluate-ratio-popover__content" @close="close" @mouseenter="keepOpen" @mouseleave="scheduleClose">
      <template #default>
        <div class="evaluate-ratio-title-row">
          <span class="evaluate-ratio-title-bar" aria-hidden="true"></span>
          <span class="evaluate-ratio-title">邀请和评估情况</span>
        </div>

        <div v-if="hasInvites" class="evaluate-ratio-list">
          <div class="evaluate-ratio-group">
            <div class="evaluate-ratio-group-head">
              <span class="evaluate-ratio-group-label">已评估：{{ evaluated.length }}</span>
            </div>
            <div class="evaluate-ratio-people">
              <PerformanceMemberIdentity v-for="person in evaluated" :key="`e-${person.name}`" :display-name="person.name" size="sm" :dimission="person.dimission" />
            </div>
          </div>
          <div class="evaluate-ratio-group">
            <div class="evaluate-ratio-group-head">
              <span class="evaluate-ratio-group-label">未评估：{{ pending.length }}</span>
              <span v-if="canRemindVisible" class="evaluate-ratio-remind">
                <button type="button" class="evaluate-ratio-remind-btn" :aria-label="`催办 ${pending.length} 名未评估人`" @click="remind">
                  <BellOutlinedIcon />催办
                </button>
              </span>
            </div>
            <div class="evaluate-ratio-people">
              <PerformanceMemberIdentity v-for="person in pending" :key="`p-${person.name}`" :display-name="person.name" size="sm" :dimission="person.dimission" />
            </div>
          </div>
        </div>
        <div v-else class="evaluate-ratio-empty">暂未邀请360°评估人</div>

        <div v-if="dimissionCount > 0" class="evaluate-ratio-dimission">有 {{ dimissionCount }} 名已离职或账号暂停使用的成员：</div>
      </template>
    </PerformancePopover>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PerformanceEvaluateRatio } from '@/api/performance'
import PerformancePopover from './PerformancePopover.vue'
import PerformanceMemberIdentity from './PerformanceMemberIdentity.vue'
import BellOutlinedIcon from './BellOutlinedIcon.vue'

const props = withDefaults(defineProps<{
  completion: string
  ratio?: PerformanceEvaluateRatio | null
  canRemind?: boolean
}>(), { ratio: null, canRemind: false })
const emit = defineEmits<{ remind: [count: number] }>()

const anchor = ref<HTMLElement | null>(null)
const visible = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | null = null

const hasInvites = computed(() => Boolean(props.ratio && (props.ratio.evaluated.length || props.ratio.pending.length)))
const evaluated = computed(() => props.ratio?.evaluated || [])
const pending = computed(() => props.ratio?.pending || [])
const dimissionCount = computed(() => props.ratio?.dimission_count || 0)
const canRemindVisible = computed(() => Boolean(props.ratio && props.ratio.invite_stage === 'in_progress' && props.canRemind))

function keepOpen() { if (closeTimer !== null) clearTimeout(closeTimer); closeTimer = null }
function open() {
  keepOpen()
  visible.value = true
}
function scheduleClose() {
  keepOpen()
  if (visible.value) closeTimer = setTimeout(close, 120)
}
function close() {
  keepOpen()
  visible.value = false
}
function remind() { emit('remind', pending.value.length) }
</script>

<style scoped>
.evaluate-ratio-anchor { display: inline-block; cursor: default; }
.evaluate-ratio-text { color: var(--color-primary); }
.evaluate-ratio-title-row { display: flex; align-items: center; margin-bottom: 10px; }
.evaluate-ratio-title-bar { display: inline-block; width: 4px; height: 16px; margin: 4px 8px 4px 0; border-radius: 2px; background: var(--color-primary); flex: none; }
.evaluate-ratio-title { color: var(--color-text-primary); font-size: 16px; font-weight: 600; line-height: 24px; }
.evaluate-ratio-list { display: flex; flex-direction: column; }
.evaluate-ratio-group { padding: 12px; margin-bottom: 20px; border-radius: 6px; background: var(--performance-member-avatar-background); }
.evaluate-ratio-group:last-child { margin-bottom: 0; }
.evaluate-ratio-group-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; line-height: 22px; }
.evaluate-ratio-group-label { color: var(--color-text-primary); font-size: 14px; font-weight: 600; }
.evaluate-ratio-people { display: flex; flex-wrap: wrap; gap: 8px; }
.evaluate-ratio-people :deep(.member-name) { font-size: 14px; line-height: 22px; }
.evaluate-ratio-empty { color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }
.evaluate-ratio-dimission { padding-top: 12px; color: var(--color-text-secondary); font-size: 14px; line-height: 22px; }
.evaluate-ratio-remind { margin-left: 12px; }
.evaluate-ratio-remind-btn { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 4px; border: 0; border-radius: 6px; background: transparent; color: var(--color-primary-hover); font-size: 14px; line-height: 18px; cursor: pointer; }
.evaluate-ratio-remind-btn:hover:not(:disabled) { background: rgba(20, 86, 240, 0.2); }
.evaluate-ratio-remind-btn svg { display: inline-block; width: 14px; height: 14px; }
</style>
