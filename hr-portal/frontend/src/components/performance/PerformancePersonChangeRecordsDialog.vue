<script setup lang="ts">
import { ref, watch } from 'vue'
import { performanceCycleApi, type PerformancePersonChangeRecord } from '@/api/performance'

const props = defineProps<{
  modelValue: boolean
  cycleId: number
  employeeNo: string
  employeeName: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const records = ref<PerformancePersonChangeRecord[]>([])
const loading = ref(false)

watch(() => props.modelValue, open => {
  if (open) void load()
})

async function load() {
  loading.value = true
  records.value = []
  try {
    records.value = await performanceCycleApi.listPersonChangeRecords(props.cycleId, props.employeeNo)
  } finally {
    loading.value = false
  }
}

/** 事件类型 → 状态 tag 文案（REA：新增/变更/停用） */
const EVENT_TYPE_TAGS: Record<string, { label: string; tone: 'add' | 'change' | 'end' }> = {
  PERFORMANCE_CYCLE_PEOPLE_INFO_UPDATED: { label: '变更', tone: 'change' },
  PERFORMANCE_CYCLE_PEOPLE_MANUALLY_UPDATED: { label: '变更', tone: 'change' },
  PERFORMANCE_CYCLE_PEOPLE_UPDATED: { label: '变更', tone: 'change' },
}
function tagFor(eventType: string) {
  return EVENT_TYPE_TAGS[eventType] || { label: eventType, tone: 'change' as const }
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatValue(value: string | null): string {
  return value && value.length ? value : '（空）'
}

/** 头像：工号取色 + 首字（REA 头像 32px 圆） */
function avatarChar(name: string): string {
  return (name || '?').trim().charAt(0)
}
</script>

<template>
  <div v-if="modelValue" class="pcr">
    <!-- REA：透明遮罩 maskStyle backgroundColor transparent -->
    <div class="pcr__mask" @click="emit('update:modelValue', false)" />
    <div class="pcr__dialog" role="dialog" aria-modal="true" aria-label="人员变更记录">
      <div class="pcr__header">
        <div class="pcr__title">人员变更记录</div>
        <button type="button" class="pcr__close" aria-label="关闭" @click="emit('update:modelValue', false)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M20.207 20.207a.99.99 0 0 0 .003-1.403L13.406 12l6.804-6.804a.99.99 0 0 0-.003-1.403.99.99 0 0 0-1.403-.003L12 10.594 5.196 3.79a.99.99 0 0 0-1.403.003.99.99 0 0 0-.003 1.403L10.594 12 3.79 18.804a.99.99 0 0 0 .003 1.403.99.99 0 0 0 1.403.003L12 13.406l6.804 6.804a.99.99 0 0 0 1.403-.003Z" fill="currentColor"/></svg>
        </button>
      </div>
      <div class="pcr__body">
        <div v-if="loading" class="pcr__loading">加载中…</div>
        <div v-else-if="!records.length" class="pcr__empty">
          <!-- REA：空态插图 250×125 -->
          <svg width="250" height="125" viewBox="0 0 250 125" fill="none" aria-hidden="true">
            <rect x="0" y="0" width="250" height="125" rx="8" fill="var(--performance-empty-illustration-background)"/>
            <circle cx="125" cy="52" r="22" fill="var(--performance-empty-illustration-body)"/>
            <path d="M93 92c3-14 13-20 32-20s29 6 32 20" fill="var(--performance-empty-illustration-body)"/>
            <path d="M105 56l14-8 14 8-14 8z" fill="var(--color-bg-card)"/>
            <path d="M112 88l8-4 8 4-8 4z" fill="var(--performance-empty-illustration-accent)"/>
            <rect x="92" y="96" width="66" height="3" rx="1.5" fill="var(--performance-empty-illustration-line)"/>
            <rect x="106" y="104" width="38" height="3" rx="1.5" fill="var(--performance-empty-illustration-line)"/>
          </svg>
          <div class="pcr__empty-text">暂无数据</div>
        </div>
        <ul v-else class="pcr__timeline">
          <li v-for="record in records" :key="record.event_id" class="pcr__item">
            <span class="pcr__dot" aria-hidden="true" />
            <div class="pcr__item-body">
              <div class="pcr__item-head">
                <span class="pcr__avatar" aria-hidden="true">{{ avatarChar(props.employeeName) }}</span>
                <span class="pcr__name">{{ props.employeeName }}</span>
                <span class="pcr__time">{{ formatTime(record.event_at) }}</span>
                <span class="pcr__tag" :class="`pcr__tag--${tagFor(record.event_type).tone}`">{{ tagFor(record.event_type).label }}</span>
              </div>
              <div v-for="(change, index) in record.changes" :key="index" class="pcr__change">
                <span class="pcr__change-label">{{ change.label }}</span>
                <span class="pcr__change-arrow" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h7m0 0L6.5 3.5M9 6L6.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="pcr__change-value pcr__change-value--before">{{ formatValue(change.before) }}</span>
                <span class="pcr__change-arrow" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h7m0 0L6.5 3.5M9 6L6.5 8.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </span>
                <span class="pcr__change-value pcr__change-value--after">{{ formatValue(change.after) }}</span>
              </div>
            </div>
          </li>
        </ul>
      </div>
      <div class="pcr__footer">
        <button type="button" class="pcr__btn" @click="emit('update:modelValue', false)">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ============ REA 实测（bundle 8113 he 组件逆向）像素规格 ============
 * 容器 480px、透明遮罩；header 同弹窗 A（24/56/24/24、16/24 w600）；
 * 时间线 item：头像 32px 圆 + 姓名(14px) + 时间 YYYY-MM-DD HH:mm + 状态 tag；
 * 每条变更一行「字段 旧值 → 新值」；空态插图 250×125 + 「暂无数据」。
 */
.pcr {
  position: fixed;
  inset: 0;
  z-index: var(--performance-confirm-z-index, 2200);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 96px;
}
.pcr__mask {
  position: absolute;
  inset: 0;
  background: transparent;
}
.pcr__dialog {
  position: relative;
  width: 480px;
  max-width: calc(100vw - 32px);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  box-shadow: var(--performance-dialog-shadow);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 120px);
}
.pcr__header {
  position: relative;
  padding: 24px 56px 24px 24px;
  flex: none;
}
.pcr__title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  line-height: 24px;
  color: var(--color-text-primary);
}
.pcr__close {
  position: absolute;
  right: 24px;
  top: 24px;
  margin: -2px -4px;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--performance-text-secondary);
  font-size: var(--performance-header-icon-size);
  cursor: pointer;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pcr__close:hover {
  background: var(--performance-interactive-hover-background);
}
.pcr__body {
  padding: 0 24px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}
.pcr__loading {
  padding: 48px 0;
  text-align: center;
  color: var(--performance-text-secondary);
  font-size: var(--font-size-md);
}
.pcr__empty {
  padding: 40px 0;
  text-align: center;
}
.pcr__empty-text {
  margin-top: 8px;
  color: var(--performance-text-secondary);
  font-size: var(--font-size-md);
  line-height: 22px;
}
.pcr__timeline {
  list-style: none;
  margin: 0;
  padding: 8px 0 0;
}
.pcr__item {
  position: relative;
  display: flex;
  gap: 12px;
  padding-bottom: 24px;
}
.pcr__dot {
  position: absolute;
  left: 11px;
  top: 15px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--performance-primary-deep);
  box-shadow: 0 0 0 2px var(--color-bg-card);
  z-index: 1;
}
.pcr__item::before {
  content: '';
  position: absolute;
  left: 13px;
  top: 24px;
  bottom: 0;
  width: 1px;
  background: var(--performance-timeline-line);
}
.pcr__item:last-child::before {
  display: none;
}
.pcr__item-body {
  flex: 1 1 auto;
  min-width: 0;
  padding-left: 16px;
}
.pcr__item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.pcr__avatar {
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--performance-tag-blue-background);
  color: var(--performance-tag-blue-text);
  font-size: var(--font-size-md);
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pcr__name {
  font-size: var(--font-size-md);
  font-weight: 500;
  color: var(--color-text-primary);
  line-height: 22px;
}
.pcr__time {
  font-size: var(--font-size-sm);
  color: var(--performance-text-secondary);
  line-height: 22px;
}
.pcr__tag {
  font-size: var(--font-size-xs);
  line-height: 18px;
  padding: 1px 8px;
  border-radius: 9px;
  font-weight: 500;
}
.pcr__tag--add {
  background: var(--performance-tag-success-background);
  color: var(--performance-tag-success-text);
}
.pcr__tag--change {
  background: var(--performance-tag-blue-background);
  color: var(--performance-tag-blue-text);
}
.pcr__tag--end {
  background: var(--color-danger-light);
  color: var(--color-danger);
}
.pcr__change {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--font-size-sm);
  line-height: 20px;
  padding: 2px 0;
}
.pcr__change-label {
  flex: 0 0 72px;
  color: var(--performance-text-secondary);
}
.pcr__change-arrow {
  flex: none;
  color: var(--color-text-placeholder);
  display: inline-flex;
}
.pcr__change-value {
  overflow-wrap: anywhere;
}
.pcr__change-value--before {
  color: var(--performance-text-secondary);
  text-decoration: line-through;
}
.pcr__change-value--after {
  color: var(--color-text-primary);
  font-weight: 500;
}
.pcr__footer {
  flex: none;
  padding: 0 24px 24px;
  display: flex;
  justify-content: flex-end;
}
.pcr__btn {
  height: var(--performance-button-height);
  min-width: var(--performance-button-min-width);
  padding: 4px 11px;
  border-radius: var(--performance-button-radius);
  font-size: var(--performance-button-font-size);
  line-height: 22px;
  box-sizing: border-box;
  cursor: pointer;
  background: var(--color-bg-card);
  border: 1px solid var(--color-line-control);
  color: var(--color-text-primary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pcr__btn:hover {
  background: var(--performance-button-cancel-hover-background);
}
</style>
