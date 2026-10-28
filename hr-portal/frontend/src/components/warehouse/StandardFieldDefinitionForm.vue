<script setup lang="ts">
import type { StandardFieldDefinitionPayload } from '@/api/standardFields'
import type { FieldCategory } from '@/api/field_categories'
import type { EntityDefinition } from '@/api/masterData'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'

const props = defineProps<{ modelValue: StandardFieldDefinitionPayload; mode: 'create' | 'edit'; saving: boolean; categories: FieldCategory[]; entities?: EntityDefinition[]; entityLocked?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: StandardFieldDefinitionPayload]; submit: [] }>()
function update(key: keyof StandardFieldDefinitionPayload, value: unknown) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
const dataTypes = [{ value: 'string', label: '字符串' }, { value: 'number', label: '数值' }, { value: 'date', label: '日期' }, { value: 'datetime', label: '日期时间' }, { value: 'bool', label: '布尔' }, { value: 'enum', label: '枚举' }]
</script>

<template>
  <el-form label-position="top" @submit.prevent="emit('submit')">
    <el-form-item label="字段编码" required><el-input :model-value="modelValue.field_code" :disabled="mode !== 'create'" maxlength="64" placeholder="例如 employee_no" @update:model-value="update('field_code', $event)" /></el-form-item>
    <el-form-item label="字段名称" required><el-input :model-value="modelValue.field_name" maxlength="128" @update:model-value="update('field_name', $event)" /></el-form-item>
    <el-form-item label="业务定义" required><el-input :model-value="modelValue.business_definition" type="textarea" :rows="3" maxlength="4000" @update:model-value="update('business_definition', $event)" /></el-form-item>
    <el-form-item label="数据类型" required><el-select :model-value="modelValue.data_type" style="width: 100%" @update:model-value="update('data_type', $event)"><el-option v-for="item in dataTypes" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
    <StandardFieldValueDomain v-if="modelValue.data_type === 'enum'" :model-value="modelValue.value_domain || null" :op="mode === 'edit' ? 'U' : 'C'" :readonly="saving" @update:model-value="update('value_domain', $event)" />
    <el-form-item label="归属实体"><el-select :model-value="modelValue.entity_id" clearable :disabled="saving || entityLocked" placeholder="选择有权实体；存量未归属字段不自动分配" style="width: 100%" @update:model-value="update('entity_id', $event || null)"><el-option v-for="entity in entities || []" :key="entity.id" :value="entity.id" :label="`${entity.name}（${entity.entity_code}）`" /></el-select></el-form-item>
    <el-form-item label="敏感字段分类"><el-select :model-value="modelValue.category_ids" multiple clearable placeholder="可选已有敏感分类" style="width: 100%" @update:model-value="update('category_ids', $event)"><el-option v-for="category in categories" :key="category.id" :label="category.is_sensitive ? `${category.name}（敏感）` : category.name" :value="category.id" /></el-select></el-form-item>
  </el-form>
</template>
