<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DatasetItem } from '@/api/datasets'

const props = defineProps<{
  name: string
  description: string
  datasetId: number | null
  isPublished: boolean
  datasets: DatasetItem[]
  currentDataset: DatasetItem | null
}>()

const emit = defineEmits<{
  'update:name': [v: string]
  'update:description': [v: string]
  'update:datasetId': [v: number | null]
  'update:isPublished': [v: boolean]
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
const datasetIdModel = computed({
  get: () => props.datasetId,
  set: (v) => emit('update:datasetId', v),
})
const isPublishedModel = computed({
  get: () => props.isPublished,
  set: (v) => emit('update:isPublished', v),
})

const showDescription = ref(!!props.description)
watch(
  () => props.description,
  (value) => {
    if (value) showDescription.value = true
  },
)

function datasetTableName(table: DatasetItem['tables'][number]): string {
  const label = table.table_label || table.table_name
  return table.alias && table.alias !== label ? `${label} (${table.alias})` : label
}
</script>

<template>
  <div class="report-basic-info">
    <div class="basic-grid">
      <el-form-item class="name-field" label="报表名" required>
        <el-input v-model="nameModel" size="small" placeholder="例如：研发部花名册导出" maxlength="128" />
      </el-form-item>

      <el-form-item class="source-field" label="数据集" required>
        <el-select
          v-model="datasetIdModel"
          size="small"
          style="width: 100%"
          placeholder="选择数据集"
          filterable
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
        <div v-if="datasetId && currentDataset" class="dataset-meta">
          包含表：{{ currentDataset.tables.map(datasetTableName).join(', ') }} ·
          关联：{{ currentDataset.relations.length }} 个
        </div>
      </el-form-item>

      <el-form-item class="status-field" label="发布状态">
        <div class="status-row">
          <el-switch v-model="isPublishedModel" />
          <span class="status-text">{{ isPublished ? '已发布' : '草稿' }}</span>
          <el-button size="small" link @click="showDescription = !showDescription">
            {{ showDescription ? '收起描述' : descModel ? '查看描述' : '添加描述' }}
          </el-button>
        </div>
      </el-form-item>
    </div>

    <el-form-item v-if="showDescription" class="description-field" label="描述">
      <el-input v-model="descModel" type="textarea" :rows="2" maxlength="500" placeholder="可选" />
    </el-form-item>
  </div>
</template>

<style scoped>
.report-basic-info {
  padding: 10px 12px;
  border: 1px solid var(--color-border-light);
  border-radius: 8px;
  background: var(--color-bg-elevated);
}
.basic-grid {
  display: grid;
  grid-template-columns: minmax(260px, 1.3fr) minmax(280px, 1fr) minmax(180px, 0.7fr);
  gap: 8px 12px;
  align-items: start;
}
.report-basic-info :deep(.el-form-item) {
  margin-bottom: 0;
}
.report-basic-info :deep(.el-form-item__label) {
  margin-bottom: 4px;
  line-height: 18px;
}
.dataset-meta {
  max-width: 100%;
  margin-top: 4px;
  overflow: hidden;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
}
.status-text {
  color: var(--color-text-secondary);
  font-size: 12px;
  white-space: nowrap;
}
.description-field {
  margin-top: 8px;
}
@media (max-width: 1100px) {
  .basic-grid {
    grid-template-columns: repeat(2, minmax(220px, 1fr));
  }
}
@media (max-width: 720px) {
  .basic-grid {
    grid-template-columns: 1fr;
  }
}
</style>
