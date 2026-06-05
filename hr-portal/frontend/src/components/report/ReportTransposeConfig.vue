<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Delete } from '@element-plus/icons-vue'
import type { ColumnInfo } from '@/api/data'
import { dataApi } from '@/api/data'

interface TransposeDim {
  dim: string
  value: string
}

interface TransposeRule {
  source_col: string
  dims: TransposeDim[]
  target_cols: string[]
}

interface TransposeConfig {
  enabled: boolean
  drop_zero_measures: boolean
  rules: TransposeRule[]
}

const props = defineProps<{
  transpose: TransposeConfig
  selectedDimensions: ColumnInfo[]
  selectedMeasures: ColumnInfo[]
}>()

const emit = defineEmits<{
  'update:transpose': [v: TransposeConfig]
}>()

const ccNameOptions = ref<{ value: string; label: string; extra: string }[]>([])
const ccCodeOptions = ref<{ value: string; label: string }[]>([])
let ccMasterLoaded = false

async function ensureCcMaster() {
  if (ccMasterLoaded) return
  ccMasterLoaded = true
  try {
    const names = await dataApi.distinct('cost_center_monthly', '名称', '编码')
    ccNameOptions.value = names.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
      extra: r.extra || '',
    }))
    const codes = await dataApi.distinct('cost_center_monthly', '编码', '名称')
    ccCodeOptions.value = codes.map((r) => ({
      value: r.value,
      label: r.extra ? `${r.value} (${r.extra})` : r.value,
    }))
  } catch {
    ccMasterLoaded = false
  }
}

function tdimKind(qual: string): 'name' | 'code' | null {
  const t = qual.includes('.') ? qual.slice(qual.indexOf('.') + 1) : qual
  if (t === '维度值' || t === '名称') return 'name'
  if (t === '编码') return 'code'
  return null
}

function onTransposeDimValue(rule: TransposeRule, d: TransposeDim) {
  if (tdimKind(d.dim) !== 'name') return
  const opt = ccNameOptions.value.find((o) => o.value === d.value)
  if (!opt || !opt.extra) return
  const codeQuals = props.selectedDimensions
    .filter((c) => (c.code.includes('.') ? c.code.slice(c.code.indexOf('.') + 1) : c.code) === '编码')
    .map((c) => c.code)
  for (const cq of codeQuals) {
    const ex = rule.dims.find((x) => x.dim === cq)
    if (ex) ex.value = opt.extra
    else rule.dims.push({ dim: cq, value: opt.extra })
  }
}

function patch(changes: Partial<TransposeConfig>) {
  emit('update:transpose', { ...props.transpose, ...changes })
}

function addRule() {
  patch({ rules: [...props.transpose.rules, { source_col: '', dims: [{ dim: '', value: '' }], target_cols: [] }] })
}

function removeRule(i: number) {
  const rules = [...props.transpose.rules]
  rules.splice(i, 1)
  patch({ rules })
}

function addDimUpdate(ruleIdx: number) {
  const rules = props.transpose.rules.map((r, i) =>
    i === ruleIdx ? { ...r, dims: [...r.dims, { dim: '', value: '' }] } : r
  )
  patch({ rules })
}

function removeDimUpdate(ruleIdx: number, dimIdx: number) {
  const rules = props.transpose.rules.map((r, i) => {
    if (i !== ruleIdx) return r
    const dims = [...r.dims]
    dims.splice(dimIdx, 1)
    return { ...r, dims }
  })
  patch({ rules })
}

defineExpose({ ensureCcMaster })
</script>

<template>
  <div>
    <div style="font-size: 12px; color: var(--color-text-placeholder); margin-bottom: 8px; line-height: 1.6">
      把某些度量从原维度组合搬到新维度组合下，保留其余记录（源度量清零）。例：把「内退费用」搬到成本中心=招聘，并写入应发工资/税前成本。<br />
      维度/度量来自<strong>字段管理</strong>标注；顺序为<strong>先拆分 → 再转置 → 后聚合</strong>。<br />
      维度更新选「维度值/名称」时从<strong>成本中心主数据</strong>选（带编码）；选定后会<strong>自动把已选的「编码」列也设为该成本中心编码</strong>，报表即可带出正确编码。
    </div>
    <el-form-item>
      <el-switch
        :model-value="transpose.enabled"
        active-text="开启转置"
        inactive-text="不转置"
        @update:model-value="(v: boolean) => patch({ enabled: v })"
      />
      <el-switch
        :model-value="transpose.drop_zero_measures"
        style="margin-left: 16px"
        active-text="删除全零度量列"
        :disabled="!transpose.enabled"
        @update:model-value="(v: boolean) => patch({ drop_zero_measures: v })"
      />
    </el-form-item>

    <template v-if="transpose.enabled">
      <div
        v-for="(rule, ri) in transpose.rules"
        :key="ri"
        class="agg-box"
        style="margin-bottom: 10px"
      >
        <div class="agg-line">
          <span class="agg-label">源度量</span>
          <el-select v-model="rule.source_col" placeholder="选要搬运的度量列" style="width: 220px" filterable>
            <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
          <el-button link type="danger" style="margin-left: auto" @click="removeRule(ri)">
            <el-icon><Delete /></el-icon>删除规则
          </el-button>
        </div>
        <div class="agg-line" style="align-items: flex-start">
          <span class="agg-label">维度更新</span>
          <div style="flex: 1">
            <div
              v-for="(d, di) in rule.dims"
              :key="di"
              style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px"
            >
              <el-select
                v-model="d.dim"
                placeholder="维度列"
                style="width: 200px"
                filterable
                @change="ensureCcMaster()"
              >
                <el-option v-for="c in selectedDimensions" :key="c.code" :label="c.label" :value="c.code" />
              </el-select>
              <span style="color: var(--color-text-secondary)">→</span>
              <el-select
                v-if="tdimKind(d.dim) === 'name'"
                v-model="d.value"
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                placeholder="选成本中心（带编码）或手填"
                style="width: 240px"
                @visible-change="(v: boolean) => v && ensureCcMaster()"
                @change="onTransposeDimValue(rule, d)"
              >
                <el-option v-for="o in ccNameOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-select
                v-else-if="tdimKind(d.dim) === 'code'"
                v-model="d.value"
                filterable
                allow-create
                default-first-option
                :reserve-keyword="false"
                placeholder="选编码（带名称）或手填"
                style="width: 240px"
                @visible-change="(v: boolean) => v && ensureCcMaster()"
              >
                <el-option v-for="o in ccCodeOptions" :key="o.value" :label="o.label" :value="o.value" />
              </el-select>
              <el-input v-else v-model="d.value" placeholder="新值，如：招聘" style="width: 240px" />
              <el-button
                link
                type="danger"
                :disabled="rule.dims.length === 1"
                @click="removeDimUpdate(ri, di)"
              >
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
            <el-button link type="primary" size="small" @click="addDimUpdate(ri)">
              <el-icon style="margin-right: 4px"><Plus /></el-icon>添加维度更新
            </el-button>
          </div>
        </div>
        <div class="agg-line" style="align-items: flex-start">
          <span class="agg-label">目标度量</span>
          <el-select
            v-model="rule.target_cols"
            multiple
            placeholder="源值写入这些度量列"
            style="flex: 1"
            filterable
          >
            <el-option v-for="c in selectedMeasures" :key="c.code" :label="c.label" :value="c.code" />
          </el-select>
        </div>
      </div>
      <el-button link type="primary" @click="addRule">
        <el-icon style="margin-right: 4px"><Plus /></el-icon>添加转置规则
      </el-button>
      <div
        v-if="!selectedMeasures.length || !selectedDimensions.length"
        style="color: var(--color-danger); font-size: 12px; margin-top: 6px"
      >
        转置需要已选字段里同时有维度列和度量列（在字段管理里标注）。
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
