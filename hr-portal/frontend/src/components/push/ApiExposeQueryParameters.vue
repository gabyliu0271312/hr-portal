<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { pushTargetsApi, type QueryParameterInput, type ReportFilterMetadata } from '@/api/push_targets'

const props = defineProps<{ sourceTable: string; modelValue: QueryParameterInput[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: QueryParameterInput[]] }>()

const filters = ref<ReportFilterMetadata[]>([])
const loading = ref(false)

watch(() => props.sourceTable, async (sourceTable) => {
  if (!sourceTable) {
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

const selectedColumns = computed(() => new Set(props.modelValue.map((item) => item.column)))

function update(value: QueryParameterInput[]) {
  emit('update:modelValue', value)
}

function addParameter() {
  const filter = filters.value.find((item) => !selectedColumns.value.has(item.column))
  if (!filter) {
    ElMessage.warning('没有可新增的报表筛选字段')
    return
  }
  update([...props.modelValue, { column: filter.column, required: false }])
}

function removeParameter(index: number) {
  update(props.modelValue.filter((_, current) => current !== index))
}

function optionsFor(currentColumn: string) {
  return filters.value.filter((item) => item.column === currentColumn || !selectedColumns.value.has(item.column))
}
</script>

<template>
  <div class="section-title">受控查询参数</div>
  <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
    选择允许对方传入的报表筛选字段。接口参数名称、格式和调用示例将自动生成在对接文档中。
  </el-alert>
  <div v-for="(item, index) in modelValue" :key="item.column" class="parameter-row">
    <el-select v-model="item.column" placeholder="选择筛选字段" style="width: 100%">
      <el-option
        v-for="filter in optionsFor(item.column)"
        :key="filter.column"
        :label="filter.label"
        :value="filter.column"
      />
    </el-select>
    <el-switch v-model="item.required" active-text="必填" inactive-text="可选" />
    <el-button link type="danger" @click="removeParameter(index)">删除</el-button>
  </div>
  <el-button size="small" :loading="loading" @click="addParameter">添加筛选参数</el-button>
</template>

<style scoped>
.section-title { font-size: 12px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--color-border-light); }
.parameter-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; margin-bottom: 8px; }
</style>
