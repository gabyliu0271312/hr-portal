<script setup lang="ts">
import { Delete, Document, Plus, Upload } from '@element-plus/icons-vue'
import PermissionButton from '@/components/PermissionButton.vue'
import type { TemplateOut } from '@/api/tableTools'

const props = defineProps<{
  template: TemplateOut
  canModify: boolean
}>()

const emit = defineEmits<{
  merge: [item: TemplateOut]
  add: [item: TemplateOut]
  edit: [item: TemplateOut]
  delete: [item: TemplateOut]
}>()

function openPrimary() {
  if (props.canModify) {
    emit('edit', props.template)
  } else {
    emit('merge', props.template)
  }
}
</script>

<template>
  <article class="template-card">
    <button
      type="button"
      class="template-card-body"
      :aria-label="canModify ? `编辑模板${template.name}` : `使用模板${template.name}进行合并`"
      @click="openPrimary"
    >
      <span class="template-card-icon"><el-icon><Document /></el-icon></span>
      <span class="template-card-info">
        <strong class="template-name">{{ template.name }}</strong>
        <span v-if="template.description" class="template-description" :title="template.description">
          {{ template.description }}
        </span>
        <span class="template-meta">
          <span v-for="key in template.merge_keys" :key="key" class="meta-tag">{{ key }}</span>
          <span class="meta-separator" aria-hidden="true">·</span>
          <span class="meta-count">{{ template.mapping_count }} 个数据源</span>
        </span>
      </span>
    </button>

    <footer class="template-card-actions">
      <el-button type="primary" size="small" :icon="Upload" @click="emit('merge', template)">合并</el-button>
      <PermissionButton
        v-if="canModify"
        menu="table_tools"
        op="U"
        size="small"
        :icon="Plus"
        @click="emit('add', template)"
      >
        新增
      </PermissionButton>
      <PermissionButton
        v-if="canModify"
        menu="table_tools"
        op="D"
        size="small"
        type="danger"
        :icon="Delete"
        @click="emit('delete', template)"
      >
        删除
      </PermissionButton>
    </footer>
  </article>
</template>

<style scoped>
.template-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  padding: 18px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  transition: border-color var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard);
}
.template-card:hover, .template-card:focus-within {
  border-color: var(--color-primary);
  background: var(--color-primary-subtle);
}
.template-card-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.template-card-body:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 4px; }
.template-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  flex: none;
  border-radius: var(--radius-md);
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-size: 22px;
}
.template-card-info { display: flex; flex: 1; min-width: 0; flex-direction: column; }
.template-name { overflow: hidden; color: var(--color-text-primary); font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.template-description {
  display: -webkit-box;
  margin-top: 8px;
  overflow: hidden;
  color: var(--color-text-regular);
  font-size: 13px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.template-meta { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; margin-top: 10px; }
.meta-tag { padding: 1px 6px; border-radius: var(--radius-pill); background: var(--color-primary-light); color: var(--color-primary); font-size: 11px; }
.meta-separator { color: var(--color-text-placeholder); }
.meta-count { color: var(--color-text-secondary); font-size: 12px; }
.template-card-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--color-border); }
</style>
