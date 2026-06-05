<script setup lang="ts">
import type { ColumnInfo } from '@/api/data'

const props = defineProps<{
  aggregate: boolean
  aggregations: Record<string, string>
  selectedDimensions: ColumnInfo[]
  selectedMeasures: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:aggregate': [v: boolean]
  'update:aggregations': [v: Record<string, string>]
}>()

const AGG_FUNCS = [
  { value: 'sum', label: '求和' },
  { value: 'avg', label: '平均' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
  { value: 'count', label: '计数' },
]

function setAggFunc(code: string, v: string) {
  emit('update:aggregations', { ...props.aggregations, [code]: v })
}
</script>

<template>
  <div>
    <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
      开启后按「维度」列分组（GROUP BY），对「度量」列按指定方式汇总。维度/度量在
      <strong>字段管理</strong> 里标注，此处只选聚合方式。<br />
      顺序为<strong>先拆分、后聚合</strong>：先按上方规则逐行拆分，再分组汇总。
    </div>
    <el-form-item>
      <el-switch
        :model-value="aggregate"
        active-text="开启聚合"
        inactive-text="明细（不聚合）"
        @update:model-value="(v: boolean) => emit('update:aggregate', v)"
      />
    </el-form-item>
    <template v-if="aggregate">
      <div class="agg-box">
        <div class="agg-line">
          <span class="agg-label">分组维度</span>
          <template v-if="selectedDimensions.length">
            <el-tag
              v-for="c in selectedDimensions"
              :key="c.code"
              size="small"
              effect="plain"
              style="margin-right: 6px"
            >{{ c.label }}</el-tag>
          </template>
          <span v-else style="color: var(--color-danger); font-size: 12px">
            未选中任何维度列，请先在已选字段里加入维度列
          </span>
        </div>
        <div class="agg-line" style="align-items: flex-start">
          <span class="agg-label">度量汇总</span>
          <div style="flex: 1">
            <div
              v-for="c in selectedMeasures"
              :key="c.code"
              style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px"
            >
              <span style="width: 200px; font-size: 13px">{{ c.label }}</span>
              <el-select
                :model-value="aggregations[c.code] || 'sum'"
                style="width: 120px"
                size="small"
                @update:model-value="(v: string) => setAggFunc(c.code, v)"
              >
                <el-option v-for="a in AGG_FUNCS" :key="a.value" :label="a.label" :value="a.value" />
              </el-select>
            </div>
            <span v-if="!selectedMeasures.length" style="color: var(--color-danger); font-size: 12px">
              未选中任何度量列，请先在已选字段里加入度量列
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.agg-box {
  border: 1px solid var(--color-border-light);
  border-radius: 6px;
  padding: 12px;
  background: var(--color-bg-page);
}
.agg-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.agg-line:last-child {
  margin-bottom: 0;
}
.agg-label {
  width: 72px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
}
</style>
