<script setup lang="ts">
import PerformanceManagementTable from './PerformanceManagementTable.vue'
import PerformanceDisabledReason from './PerformanceDisabledReason.vue'
import { REVIEW_RULE_METHOD_LABELS, type ReviewRule } from './reviewRuleTypes'

withDefaults(defineProps<{
  rules: ReviewRule[]
  loading: boolean
  page?: number
  pageSize?: number
  total?: number
}>(), {
  page: 1,
  pageSize: 10,
})

const emit = defineEmits<{
  edit: [rule: ReviewRule]
  remove: [rule: ReviewRule]
  'page-change': [page: number]
  'page-size-change': [pageSize: number]
}>()

function handleRemove(rule: ReviewRule) {
  if (rule.deletable) emit('remove', rule)
}
</script>

<template>
  <PerformanceManagementTable
    :rows="rules"
    :loading="loading"
    loading-text="正在加载评估规则..."
    empty-text="暂无评估规则"
    table-aria-label="评估规则表格"
    pagination-aria-label="评估规则分页"
    :page="page"
    :page-size="pageSize"
    :total="total"
    @page-change="emit('page-change', $event)"
    @page-size-change="emit('page-size-change', $event)"
  >
    <el-table-column prop="name" label="名称" min-width="120" show-overflow-tooltip />
    <el-table-column label="评估方式" min-width="120">
      <template #default="{ row }">{{ REVIEW_RULE_METHOD_LABELS[row.method as ReviewRule['method']] }}</template>
    </el-table-column>
    <el-table-column label="创建人" min-width="160">
      <template #default="{ row }">
        <span class="creator-chip">
          <img v-if="row.creatorAvatar" :src="row.creatorAvatar" alt="" />
          <span v-else class="creator-avatar" aria-hidden="true">{{ row.creator.slice(0, 1) }}</span>
          <span class="creator-name">{{ row.creator }}</span>
        </span>
      </template>
    </el-table-column>
    <el-table-column prop="createdAt" label="创建时间" min-width="160" />
    <el-table-column prop="remark" label="备注" min-width="240" show-overflow-tooltip />
    <el-table-column label="操作" min-width="128" fixed="right">
      <template #default="{ row }">
        <div class="row-actions">
          <el-button link type="primary" @click="emit('edit', row)">编辑</el-button>
          <PerformanceDisabledReason :disabled="!row.deletable" reason="此评估规则已被使用，不允许删除">
            <el-button link class="delete-button" :disabled="!row.deletable" @click="handleRemove(row)">删除</el-button>
          </PerformanceDisabledReason>
        </div>
      </template>
    </el-table-column>
  </PerformanceManagementTable>
</template>

<style scoped>
.creator-chip { display: inline-flex; align-items: center; max-width: 100%; height: 24px; padding: 0 6px 0 2px; border-radius: 12px; background: #eff0f1; }
.creator-chip img, .creator-avatar { width: 20px; height: 20px; flex: none; border-radius: 50%; }
.creator-avatar { display: grid; place-items: center; background: #dee0e3; color: #646a73; font-size: 11px; }
.creator-name { margin-left: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; align-items: center; gap: 4px; }
.delete-button:disabled { color: rgb(187, 191, 196); }
/* 评估规则页自身的列几何（源自其采集契约），不进共享表格组件 */
:deep(.performance-management-table colgroup col:nth-child(1)) { width: 12.9325% !important; }
:deep(.performance-management-table colgroup col:nth-child(2)) { width: 12.9325% !important; }
:deep(.performance-management-table colgroup col:nth-child(3)) { width: 17.231375% !important; }
:deep(.performance-management-table colgroup col:nth-child(4)) { width: 17.243125% !important; }
:deep(.performance-management-table colgroup col:nth-child(5)) { width: 25.865% !important; }
:deep(.performance-management-table colgroup col:nth-child(6)) { width: 13.794875% !important; }
</style>
