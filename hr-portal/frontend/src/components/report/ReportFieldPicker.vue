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

const availableColumns = computed(() =>
  props.allColumns.filter((c) => !props.selectedCodes.includes(c.code))
)

const selectedColsDetail = computed(() =>
  props.selectedCodes
    .map((code) => props.allColumns.find((c) => c.code === code))
    .filter(Boolean) as ColumnInfo[]
)

function toggleColumn(code: string) {
  const next = [...props.selectedCodes]
  const i = next.indexOf(code)
  if (i >= 0) next.splice(i, 1)
  else next.push(code)
  emit('update:selectedCodes', next)
}

function moveColumn(code: string, dir: -1 | 1) {
  const next = [...props.selectedCodes]
  const i = next.indexOf(code)
  if (i < 0) return
  const j = i + dir
  if (j < 0 || j >= next.length) return
  ;[next[i], next[j]] = [next[j], next[i]]
  emit('update:selectedCodes', next)
}

function selectAll() {
  emit('update:selectedCodes', props.allColumns.filter((c) => c.is_visible).map((c) => c.code))
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
        <span>已选字段（{{ selectedColsDetail.length }}）</span>
        <el-button link size="small" :disabled="!selectedColsDetail.length" @click="clearAll">清空</el-button>
      </div>
      <div class="pane-body">
        <div
          v-for="(c, i) in selectedColsDetail"
          :key="c.code"
          class="col-item col-item--selected"
        >
          <span class="order-num">{{ i + 1 }}.</span>
          <span>{{ c.label }}</span>
          <el-tag v-if="c.is_sensitive" size="small" type="danger" effect="plain">敏感</el-tag>
          <div style="margin-left: auto; display: flex; gap: 4px">
            <el-button size="small" link :disabled="i === 0" @click="moveColumn(c.code, -1)">上移</el-button>
            <el-button size="small" link :disabled="i === selectedColsDetail.length - 1" @click="moveColumn(c.code, 1)">下移</el-button>
            <el-button size="small" link type="danger" @click="toggleColumn(c.code)">移除</el-button>
          </div>
        </div>
        <div v-if="!selectedColsDetail.length" class="empty-tip">从左侧点选字段加入</div>
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
