<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pushTargetsApi, type QueryParameter, type ReportFilterMetadata } from '@/api/push_targets'

const props = defineProps<{ sourceTable: string; modelValue: QueryParameter[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: QueryParameter[]] }>()

const filters = ref<ReportFilterMetadata[]>([])
const loading = ref(false)

watch(() => props.sourceTable, async (sourceTable) => {
  if (!sourceTable.startsWith('report:')) {
    filters.value = []
    return
  }
  loading.value = true
  try {
    filters.value = await pushTargetsApi.queryParameterMetadata(sourceTable)
  } catch {
    filters.value = []
  } finally {
    loading.value = false
  }
}, { immediate: true })

function update(value: QueryParameter[]) {
  emit('update:modelValue', value)
}

function addMonthPreset() {
  if (props.modelValue.some((item) => item.name === 'period_ym')) {
    ElMessage.warning('月份参数已存在')
    return
  }
  const filter = filters.value.find((item) => /month|月份|发薪月/i.test(item.column)) || filters.value[0]
  if (!filter) {
    ElMessage.warning('当前报表没有可覆盖的筛选条件')
    return
  }
  update([...props.modelValue, {
    name: 'period_ym', label: '月份', column: filter.column, op: 'eq', required: true,
    pattern: '^\\d{6}$', format_hint: 'YYYYMM', example: '202606',
  }])
}

function addParameter() {
  const filter = filters.value[0]
  if (!filter) {
    ElMessage.warning('当前报表没有可覆盖的筛选条件')
    return
  }
  update([...props.modelValue, {
    name: '', label: '', column: filter.column, op: 'eq', required: false, example: '',
  }])
}

function removeParameter(index: number) {
  update(props.modelValue.filter((_, current) => current !== index))
}
</script>

<template>
  <div class="section-title">受控查询参数</div>
  <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
    仅允许调用方覆盖报表中可见且未锁定的既有筛选条件。必填参数缺失、格式错误或携带未登记参数时，接口将返回 400。
  </el-alert>
  <div class="actions">
    <el-button size="small" :loading="loading" @click="addMonthPreset">添加月份（YYYYMM）预设</el-button>
    <el-button size="small" :loading="loading" @click="addParameter">添加精确匹配参数</el-button>
  </div>
  <div v-for="(item, index) in modelValue" :key="index" class="parameter-row">
    <el-input v-model="item.name" placeholder="参数名，如 period_ym" />
    <el-input v-model="item.label" placeholder="中文名称" />
    <el-select v-model="item.column" placeholder="绑定报表筛选">
      <el-option v-for="filter in filters" :key="filter.column" :label="filter.column" :value="filter.column" />
    </el-select>
    <el-switch v-model="item.required" active-text="必填" inactive-text="可选" />
    <el-input v-model="item.format_hint" placeholder="格式提示，如 YYYYMM" />
    <el-input v-model="item.pattern" placeholder="正则，如 ^\d{6}$" />
    <el-input v-model="item.example" placeholder="示例值" />
    <el-button link type="danger" @click="removeParameter(index)">删除</el-button>
  </div>
</template>

<style scoped>
.section-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border-light); }
.actions { display: flex; gap: 8px; margin-bottom: 12px; }
.parameter-row { display: grid; grid-template-columns: 1fr 1fr 1.4fr auto 1fr 1fr 1fr auto; gap: 8px; align-items: center; margin-bottom: 8px; }
</style>
