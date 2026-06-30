<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DatasetItem } from '@/api/datasets'
import { reportsApi, type ReportAclItem, type ReportVisibility } from '@/api/reports'
import AclEditor from '@/components/AclEditor.vue'
import { SCOPE_STRATEGY_OPTIONS, type ScopeStrategy } from '@/constants/scopeStrategy'

const props = defineProps<{
  name: string
  description: string
  datasetId: number | null
  visibility: ReportVisibility
  scopeStrategy: ScopeStrategy | null
  acl: ReportAclItem[]
  datasets: DatasetItem[]
  currentDataset: DatasetItem | null
}>()

const emit = defineEmits<{
  'update:name': [v: string]
  'update:description': [v: string]
  'update:datasetId': [v: number | null]
  'update:visibility': [v: ReportVisibility]
  'update:scopeStrategy': [v: ScopeStrategy | null]
  'update:acl': [v: ReportAclItem[]]
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
const visibilityModel = computed({
  get: () => props.visibility,
  set: (v) => emit('update:visibility', v),
})
const scopeStrategyModel = computed({
  get: () => props.scopeStrategy,
  set: (v) => emit('update:scopeStrategy', v),
})
const aclModel = computed({
  get: () => props.acl,
  set: (v) => emit('update:acl', v),
})

const VISIBILITY_OPTIONS: { value: ReportVisibility; label: string; desc: string }[] = [
  { value: 'private', label: '私密', desc: '仅创建者与超级管理员可见' },
  { value: 'scoped', label: '指定范围', desc: '在拥有该数据集权限的角色/用户中,指定可见者' },
  { value: 'public', label: '公开', desc: '所有拥有该数据集权限的角色/用户均可见' },
]

const showDescription = ref(!!props.description)
watch(
  () => props.description,
  (value) => {
    if (value) showDescription.value = true
  },
)

function datasetTableName(table: DatasetItem['tables'][number]): string {
  return table.table_label || table.table_name
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

      <el-form-item class="status-field" label="可见性">
        <div class="status-row">
          <el-radio-group v-model="visibilityModel" size="small">
            <el-radio-button
              v-for="opt in VISIBILITY_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
          <el-button size="small" link @click="showDescription = !showDescription">
            {{ showDescription ? '收起描述' : descModel ? '查看描述' : '添加描述' }}
          </el-button>
        </div>
        <div class="visibility-hint">
          {{ VISIBILITY_OPTIONS.find((o) => o.value === visibilityModel)?.desc }}
        </div>
      </el-form-item>

      <el-form-item class="strategy-field" label="数据范围策略">
        <el-select v-model="scopeStrategyModel" size="small" clearable placeholder="继承默认" style="width: 100%">
          <el-option
            v-for="item in SCOPE_STRATEGY_OPTIONS"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
      </el-form-item>
    </div>

    <el-form-item v-if="showDescription" class="description-field" label="描述">
      <el-input v-model="descModel" type="textarea" :rows="2" maxlength="500" placeholder="可选" />
    </el-form-item>

    <div v-if="visibilityModel === 'scoped'" class="acl-inline">
      <div class="acl-inline-title">访问授权</div>
      <el-alert
        v-if="!datasetId"
        type="warning"
        :closable="false"
        show-icon
        title="请先选择数据集,再添加授权对象"
        style="margin-bottom: 12px"
      />
      <AclEditor
        v-else
        v-model="aclModel"
        :dataset-id="datasetId"
        :load-options="reportsApi.aclOptions"
      />
    </div>
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
  grid-template-columns: minmax(240px, 1.2fr) minmax(260px, 1fr) minmax(160px, 0.6fr) minmax(180px, 0.7fr);
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
.visibility-hint {
  margin-top: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;
  line-height: 18px;
}
.acl-inline {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--color-border-light);
}
.acl-inline-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
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
