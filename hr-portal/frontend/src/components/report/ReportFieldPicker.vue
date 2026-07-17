<script setup lang="ts">
import { computed } from 'vue'
import type { ColumnInfo } from '@/api/data'

const props = defineProps<{
  selectedCodes: string[]
  allColumns: ColumnInfo[]
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:selectedCodes': [v: string[]]
}>()

/** 所有字段始终可选（Track B：支持重复选择） */
const availableColumns = computed(() => props.allColumns)

/** 最大后缀+1 生成下一个 instance_id */
function nextInstanceId(sourceCode: string): string {
  const suffixes: number[] = []
  for (const id of props.selectedCodes) {
    if (id === sourceCode) {
      suffixes.push(1)
    } else if (id.startsWith(sourceCode + '#')) {
      const n = Number(id.split('#').pop())
      if (!isNaN(n)) suffixes.push(n)
    }
  }
  const next = Math.max(0, ...suffixes, 0) + 1
  return next === 1 ? sourceCode : `${sourceCode}#${next}`
}

function toggleColumn(sourceCode: string) {
  const next = [...props.selectedCodes]
  next.push(nextInstanceId(sourceCode))
  emit('update:selectedCodes', next)
}

function removeAt(index: number) {
  const next = [...props.selectedCodes]
  next.splice(index, 1)
  emit('update:selectedCodes', next)
}

function moveAt(index: number, dir: -1 | 1) {
  const next = [...props.selectedCodes]
  const j = index + dir
  if (j < 0 || j >= next.length) return
  ;[next[index], next[j]] = [next[j], next[index]]
  emit('update:selectedCodes', next)
}

/** instance_id → 显示名 */
function instanceLabel(instanceId: string): string {
  const base = instanceId.replace(/#\d+$/, '')
  const col = props.allColumns.find(c => c.code === base)
  const baseLabel = col?.label ?? base
  if (instanceId === base) return baseLabel
  const n = instanceId.split('#').pop()
  return `${baseLabel} (${n})`
}

/** 全选：仅选中当前未出现的 source_code（避免重复全选产生大量重复） */
function selectAll() {
  const existingSources = new Set(
    props.selectedCodes.map(id => id.replace(/#\d+$/, ''))
  )
  const next = [...props.selectedCodes]
  for (const c of props.allColumns) {
    if (c.is_visible && !existingSources.has(c.code)) {
      next.push(c.code)
    }
  }
  emit('update:selectedCodes', next)
}

function clearAll() {
  emit('update:selectedCodes', [])
}
</script>

<template>
  <div v-loading="loading" class="columns-picker">
    <div class="picker-pane">
      <div class="pane-head">
        <span>可选字段（{{ availableColumns.length }}）</span>
        <el-button link size="small" @click="selectAll">全选可见</el-button>
      </div>
      <div class="pane-body">
        <div
          v-for="c in availableColumns"
          :key="c.code"
          class="col-item"
          @click="toggleColumn(c.code)"
        >
          <span>{{ c.label }}</span>
          <el-tag v-if="c.is_pk_part" size="small" type="primary" effect="plain">PK</el-tag>
          <el-tag v-if="c.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
          <el-tag v-if="!c.is_visible" size="small" type="info" effect="plain">隐藏</el-tag>
          <span style="font-family: monospace; font-size: 11px; color: var(--color-text-placeholder); margin-left: auto">{{ c.code }}</span>
        </div>
        <div v-if="!availableColumns.length" class="empty-tip">所有字段已选入</div>
      </div>
    </div>
    <div class="picker-pane">
      <div class="pane-head">
        <span>已选字段（{{ selectedCodes.length }}）</span>
        <el-button link size="small" :disabled="!selectedCodes.length" @click="clearAll">清空</el-button>
      </div>
      <div class="pane-body">
        <div
          v-for="(id, i) in selectedCodes"
          :key="id"
          class="col-item col-item--selected"
        >
          <span class="order-num">{{ i + 1 }}.</span>
          <span>{{ instanceLabel(id) }}</span>
          <el-tag
            v-if="allColumns.find(c => c.code === id.replace(/#\d+$/, ''))?.is_sensitive"
            size="small" type="danger" effect="plain"
          >敏感</el-tag>
          <div style="margin-left: auto; display: flex; gap: 4px">
            <el-button size="small" link :disabled="i === 0" @click="moveAt(i, -1)">上移</el-button>
            <el-button size="small" link :disabled="i === selectedCodes.length - 1" @click="moveAt(i, 1)">下移</el-button>
            <el-button size="small" link type="danger" @click="removeAt(i)">移除</el-button>
          </div>
        </div>
        <div v-if="!selectedCodes.length" class="empty-tip">从左侧点选字段加入</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.columns-picker {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  min-height: 320px;
}
.picker-pane {
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-page);
}
.pane-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-bg-elevated);
}
.pane-body {
  flex: 1;
  overflow-y: auto;
  max-height: 320px;
  padding: 4px;
}
.col-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
}
.col-item:hover {
  background: var(--color-bg-page);
}
.col-item--selected {
  cursor: default;
}
.col-item--selected:hover {
  background: transparent;
}
.order-num {
  color: var(--color-text-placeholder);
  font-family: monospace;
  font-size: 12px;
  min-width: 24px;
}
.empty-tip {
  padding: 24px;
  text-align: center;
  color: var(--color-text-placeholder);
  font-size: 13px;
}
</style>
