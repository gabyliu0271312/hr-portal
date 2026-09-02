<script setup lang="ts">
import { Delete, Plus } from '@element-plus/icons-vue'
import type { DimensionMergeRule } from '@/api/reports'

const props = defineProps<{
  rules: DimensionMergeRule[]
  selectedId: string
  errorRuleIds?: string[]
}>()

const emit = defineEmits<{
  select: [id: string]
  add: []
  remove: [id: string]
}>()
</script>

<template>
  <aside class="rule-list" aria-label="维度归并规则列表">
    <div class="rule-list-head">
      <strong>归并规则</strong>
      <el-button type="primary" link @click="emit('add')">
        <el-icon><Plus /></el-icon>新建
      </el-button>
    </div>
    <el-empty v-if="!rules.length" description="暂无归并规则" :image-size="64" />
    <button
      v-for="rule in rules"
      v-else
      :key="rule.id"
      type="button"
      class="rule-item"
      :class="{ active: selectedId === rule.id, invalid: props.errorRuleIds?.includes(rule.id) }"
      @click="emit('select', rule.id)"
    >
      <span class="rule-main">
        <strong>{{ rule.name || '未命名规则' }}</strong>
        <small>{{ rule.sources.length }} 个来源组合</small>
      </span>
      <el-button
        link
        type="danger"
        aria-label="删除归并规则"
        @click.stop="emit('remove', rule.id)"
      >
        <el-icon><Delete /></el-icon>
      </el-button>
    </button>
  </aside>
</template>

<style scoped>
.rule-list { width: 244px; flex: 0 0 244px; padding: 14px; border-right: 1px solid var(--color-border-light); background: var(--color-bg-page); overflow-y: auto; }
.rule-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rule-item { width: 100%; min-height: 58px; margin-bottom: 8px; padding: 10px 8px 10px 12px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--color-border-light); border-radius: 6px; background: #fff; color: var(--color-text-primary); text-align: left; cursor: pointer; }
.rule-item:hover { border-color: var(--color-primary-light-3); }
.rule-item.active { border-color: var(--color-primary); background: var(--color-primary-light-9); }
.rule-item.invalid { border-color: var(--color-danger); }
.rule-main { min-width: 0; flex: 1; display: grid; gap: 4px; }
.rule-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rule-main small { color: var(--color-text-secondary); }
@media (max-width: 768px) { .rule-list { width: 100%; flex-basis: auto; max-height: 220px; border-right: 0; border-bottom: 1px solid var(--color-border-light); } }
</style>
