<script setup lang="ts">
import { computed } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'

interface ValueRule {
  target: string
  factor: string
}

const props = defineProps<{
  valueRules: ValueRule[]
  selectedCodes: string[]
  allColumns: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:valueRules': [v: ValueRule[]]
}>()

const isNumericCol = (c: ColumnInfo) => c.agg_role === 'measure' || c.data_type === 'number'

const numericSelectedCols = computed(() =>
  props.selectedCodes
    .map((code) => props.allColumns.find((c) => c.code === code))
    .filter((c): c is ColumnInfo => !!c && isNumericCol(c))
)

const numericAllCols = computed(() => props.allColumns.filter(isNumericCol))

function colLabel(code: string): string {
  return props.allColumns.find((c) => c.code === code)?.label ?? code
}

function addRule() {
  emit('update:valueRules', [...props.valueRules, { target: '', factor: '' }])
}

function removeRule(i: number) {
  const next = [...props.valueRules]
  next.splice(i, 1)
  emit('update:valueRules', next)
}
</script>

<template>
  <div>
    <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
      把一个金额按系数拆开。例：个税总额 × 系数 → 各成本中心分摊到的个税。<br />
      「被拆分的列」会被改写成 取整两位小数(该列值 × 系数列值)，必须是已选中的显示列；非数值/空显示为空；筛选与排序仍按原始值。
    </div>
    <div v-for="(v, i) in valueRules" :key="i" class="rule-row">
      <span style="color: var(--color-text-secondary); font-size: 13px">被拆分的列</span>
      <el-select v-model="v.target" placeholder="选要改写的金额列" style="width: 240px" filterable>
        <el-option v-for="c in numericSelectedCols" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <span style="color: var(--color-text-secondary); font-size: 13px">×　系数列</span>
      <el-select v-model="v.factor" placeholder="选系数列" style="width: 240px" filterable>
        <el-option v-for="c in numericAllCols" :key="c.code" :label="c.label" :value="c.code" />
      </el-select>
      <span v-if="v.target && v.factor" style="color: var(--color-primary); font-size: 12px">
        {{ colLabel(v.target) }} = {{ colLabel(v.target) }} × {{ colLabel(v.factor) }}
      </span>
      <el-button link type="danger" @click="removeRule(i)">
        <el-icon><Delete /></el-icon>
      </el-button>
    </div>
    <el-button link type="primary" @click="addRule">
      <el-icon style="margin-right: 4px"><Plus /></el-icon>添加拆分规则
    </el-button>
  </div>
</template>

<style scoped>
.rule-row {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
</style>
