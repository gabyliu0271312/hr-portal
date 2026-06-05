<script setup lang="ts">
import { Plus, Delete } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'

interface RoundingCorrection {
  group_by: string
  target_cols: string[]
}

const props = defineProps<{
  roundingCorrections: RoundingCorrection[]
  selectedDimensions: ColumnInfo[]
  selectedMeasures: ColumnInfo[]
  aggregate: boolean
}>()

const emit = defineEmits<{
  'update:roundingCorrections': [v: RoundingCorrection[]]
}>()

function addRule() {
  emit('update:roundingCorrections', [...props.roundingCorrections, { group_by: '', target_cols: [] }])
}

function removeRule(i: number) {
  const next = [...props.roundingCorrections]
  next.splice(i, 1)
  emit('update:roundingCorrections', next)
}
</script>

<template>
  <div>
    <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
      用于解决拆分取整后的 0.01 差异：按指定维度分组，自动把差额补到该组最后一行，确保合计与原始薪资列一致。
    </div>
    <template v-if="aggregate">
      <div
        v-for="(rc, i) in roundingCorrections"
        :key="i"
        class="agg-box"
        style="margin-bottom: 10px"
      >
        <div class="agg-line" style="align-items: flex-start">
          <span class="agg-label">分组维度</span>
          <el-select v-model="rc.group_by" filterable clearable style="width: 220px" placeholder="选择收口维度">
            <el-option v-for="c in selectedDimensions" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <span class="agg-label" style="margin-left: 12px">收口字段</span>
          <el-select v-model="rc.target_cols" multiple filterable clearable style="width: 320px" placeholder="选择金额字段">
            <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <el-button link type="danger" @click="removeRule(i)">删除</el-button>
        </div>
      </div>
      <el-button link type="primary" @click="addRule">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>添加余差收口规则
      </el-button>
    </template>
    <div v-else style="color: var(--color-text-placeholder); font-size: 12px">
      余差收口仅在开启聚合后生效。
    </div>
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
