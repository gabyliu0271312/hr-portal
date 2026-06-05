<script setup lang="ts">
import { computed } from 'vue'
import type { DatasetItem } from '@/api/datasets'

interface TableOption {
  value: string
  label: string
}

const props = defineProps<{
  name: string
  description: string
  sourceType: 'single' | 'dataset'
  tableName: string
  datasetId: number | null
  isPublished: boolean
  tables: TableOption[]
  datasets: DatasetItem[]
  currentDataset: DatasetItem | null
}>()

const emit = defineEmits<{
  'update:name': [v: string]
  'update:description': [v: string]
  'update:sourceType': [v: 'single' | 'dataset']
  'update:tableName': [v: string]
  'update:datasetId': [v: number | null]
  'update:isPublished': [v: boolean]
  'source-change': []
  'table-change': []
  'dataset-change': []
}>()

const nameModel = computed({
  get: () => props.name,
  set: (v) => emit('update:name', v),
})
const descModel = computed({
  get: () => props.description,
  set: (v) => emit('update:description', v),
})
const sourceTypeModel = computed({
  get: () => props.sourceType,
  set: (v) => emit('update:sourceType', v),
})
const tableNameModel = computed({
  get: () => props.tableName,
  set: (v) => emit('update:tableName', v),
})
const datasetIdModel = computed({
  get: () => props.datasetId,
  set: (v) => emit('update:datasetId', v),
})
const isPublishedModel = computed({
  get: () => props.isPublished,
  set: (v) => emit('update:isPublished', v),
})
</script>

<template>
  <div>
    <el-form-item label="报表名" required>
      <el-input v-model="nameModel" placeholder="例如：研发部花名册导出" maxlength="128" />
    </el-form-item>
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 16px">
      <el-form-item label="数据来源" required>
        <el-radio-group v-model="sourceTypeModel" @change="emit('source-change')">
          <el-radio-button value="single">单表</el-radio-button>
          <el-radio-button value="dataset">数据集</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="sourceType === 'single'" label="数据表" required>
        <el-select v-model="tableNameModel" style="width: 100%" @change="emit('table-change')">
          <el-option v-for="t in tables" :key="t.value" :label="t.label" :value="t.value" />
        </el-select>
      </el-form-item>
      <el-form-item v-else label="数据集" required>
        <el-select
          v-model="datasetIdModel"
          style="width: 100%"
          placeholder="选择数据集"
          @change="emit('dataset-change')"
        >
          <el-option
            v-for="d in datasets"
            :key="d.id"
            :label="d.name"
            :value="d.id"
            :disabled="!d.is_active"
          />
        </el-select>
        <div
          v-if="datasetId && currentDataset"
          style="margin-top: 6px; font-size: 12px; color: var(--color-text-secondary)"
        >
          包含表：{{ currentDataset.tables.map((t) => t.alias).join(', ') }} ·
          关联：{{ currentDataset.relations.length }} 个
        </div>
      </el-form-item>
    </div>
    <el-form-item label="描述">
      <el-input v-model="descModel" type="textarea" :rows="2" maxlength="500" placeholder="可选" />
    </el-form-item>
    <el-form-item label="发布状态">
      <el-switch
        v-model="isPublishedModel"
        active-text="已发布（其他人可见）"
        inactive-text="草稿（仅自己可见）"
      />
    </el-form-item>
  </div>
</template>
