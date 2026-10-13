<script setup lang="ts">
import type { ScopeHealth } from '@/api/scopeGovernance'
import PermissionButton from '@/components/PermissionButton.vue'

const props = defineProps<{ rows: ScopeHealth[] }>()
const emit = defineEmits<{ review: [tableName: string]; repair: [tableName: string] }>()
const strategyLabels: Record<string, string> = {
  person_first: '人员范围（旧规则）', cc_first: '成本中心（旧规则）', cross_filter: '交叉范围（旧规则）',
}
</script>

<template>
  <div style="overflow-x: auto">
    <el-table :data="props.rows" stripe style="width: 100%" max-height="600" row-key="table_name">
      <el-table-column prop="table_name" label="数据表" min-width="230" show-overflow-tooltip />
      <el-table-column prop="warehouse_layer" label="分层" min-width="75" />
      <el-table-column label="当前范围配置" min-width="165">
        <template #default="{ row }">{{ strategyLabels[row.scope_strategy] || row.scope_strategy || '继承默认' }}</template>
      </el-table-column>
      <el-table-column label="诊断结果" min-width="300">
        <template #default="{ row }">
          <span v-if="!row.issues.length">本次扫描未发现范围配置问题</span>
          <div v-for="issue in row.issues" :key="issue.code" class="scope-issue">
            <el-tag size="small" :type="issue.severity === 'error' ? 'danger' : 'warning'">{{ issue.severity === 'error' ? '需修复' : '待核对' }}</el-tag>
            <span>{{ issue.message }}</span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="引用" min-width="110">
        <template #default="{ row }">{{ row.dataset_count }} 数据集<br>{{ row.report_count }} 报表</template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <PermissionButton menu="warehouse.governance" op="V" size="small" @click="emit('review', row.table_name)">查看分类</PermissionButton>
          <PermissionButton menu="warehouse.assets" op="V" size="small" @click="emit('repair', row.table_name)">修复字段配置</PermissionButton>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.scope-issue { display: flex; align-items: flex-start; gap: var(--spacing-xs, 8px); margin: 4px 0; }
</style>
