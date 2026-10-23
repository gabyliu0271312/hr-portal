<script setup lang="ts">
import PermissionButton from '@/components/PermissionButton.vue'
import type { StandardFieldDetail, StandardFieldVersion } from '@/api/standardFields'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'
defineProps<{ detail: StandardFieldDetail; saving: boolean; migrationRequired: boolean }>()
const emit = defineEmits<{ createVersion: []; edit: []; transition: [version: StandardFieldVersion, action: 'approve' | 'deprecate' | 'archive'] }>()
const statusLabels: Record<string, string> = { draft: '草稿', active: '已启用', deprecated: '已弃用', archived: '已归档' }
</script>

<template>
  <el-descriptions :column="1" border>
    <el-descriptions-item label="编码">{{ detail.field_code }}</el-descriptions-item>
    <el-descriptions-item label="当前已批准版本">{{ detail.current_active_version_id ? `#${detail.current_active_version_id}` : '暂无' }}</el-descriptions-item>
  </el-descriptions>
  <section class="standard-field-versions">
    <div class="standard-field-versions__heading"><strong>语义版本</strong><PermissionButton menu="warehouse.standard_fields.catalog" op="C" size="small" :disabled="saving || migrationRequired" @click="emit('createVersion')">新建版本</PermissionButton></div>
    <div v-for="version in detail.versions" :key="version.id" class="standard-field-versions__item">
      <div><strong>v{{ version.version }} · {{ version.field_name }}</strong> <el-tag size="small">{{ statusLabels[version.status] || version.status }}</el-tag></div>
      <p>{{ version.business_definition }}</p>
      <p v-if="version.status === 'draft'">草稿可编辑，点击「编辑草稿」调整定义与枚举值域。</p>
      <p v-else-if="version.status === 'active'">已启用版本不可原地改，点击「新建版本」调整；旧绑定不会自动切换。</p>
      <StandardFieldValueDomain v-if="version.data_type === 'enum'" :model-value="version.value_domain" readonly />
      <div class="standard-field-versions__actions">
        <PermissionButton v-if="version.id === detail.latest_version.id && version.status === 'draft'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="saving" @click="emit('edit')">编辑草稿</PermissionButton>
        <PermissionButton v-if="version.status === 'draft'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="saving" @click="emit('transition', version, 'approve')">审核启用</PermissionButton>
        <PermissionButton v-if="version.status === 'active'" menu="warehouse.standard_fields.catalog" op="U" size="small" :disabled="saving" @click="emit('transition', version, 'deprecate')">弃用</PermissionButton>
        <PermissionButton v-if="version.status !== 'archived'" menu="warehouse.standard_fields.catalog" op="D" size="small" :disabled="saving" @click="emit('transition', version, 'archive')">归档</PermissionButton>
      </div>
    </div>
  </section>
</template>

<style scoped>
.standard-field-versions { display: grid; gap: 12px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.standard-field-versions__heading, .standard-field-versions__actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.standard-field-versions__heading { justify-content: space-between; }
.standard-field-versions__item { padding: 12px 0; border-bottom: 1px solid var(--color-border); }
.standard-field-versions__item p { margin: 8px 0; color: var(--color-text-secondary); }
</style>
