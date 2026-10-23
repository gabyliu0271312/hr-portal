<script setup lang="ts">
import type { StandardFieldDefinitionPayload } from '@/api/standardFields'
import type { FieldCategory } from '@/api/field_categories'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'

const props = defineProps<{ modelValue: StandardFieldDefinitionPayload; mode: 'create' | 'version' | 'edit'; saving: boolean; categories: FieldCategory[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: StandardFieldDefinitionPayload]; submit: [] }>()
function update(key: keyof StandardFieldDefinitionPayload, value: unknown) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
const dataTypes = [{ value: 'string', label: '字符串' }, { value: 'number', label: '数值' }, { value: 'date', label: '日期' }, { value: 'datetime', label: '日期时间' }, { value: 'bool', label: '布尔' }, { value: 'enum', label: '枚举' }]
const grains = [{ value: 'coarse', label: '粗粒度' }, { value: 'fine', label: '细粒度' }, { value: 'identifying', label: '个人标识' }]
const domains = [{ value: 'public', label: '通用' }, { value: 'org', label: '组织' }, { value: 'cost_center', label: '成本中心' }, { value: 'salary', label: '薪酬' }, { value: 'personal', label: '个人信息' }]
</script>

<template>
  <el-form label-position="top" @submit.prevent="emit('submit')">
    <el-form-item label="字段编码" required><el-input :model-value="modelValue.field_code" :disabled="mode !== 'create'" maxlength="64" placeholder="例如 employee_no" @update:model-value="update('field_code', $event)" /></el-form-item>
    <el-form-item label="字段名称" required><el-input :model-value="modelValue.field_name" maxlength="128" @update:model-value="update('field_name', $event)" /></el-form-item>
    <el-form-item label="业务定义" required><el-input :model-value="modelValue.business_definition" type="textarea" :rows="3" maxlength="4000" @update:model-value="update('business_definition', $event)" /></el-form-item>
    <el-form-item label="数据类型" required><el-select :model-value="modelValue.data_type" style="width: 100%" @update:model-value="update('data_type', $event)"><el-option v-for="item in dataTypes" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
    <StandardFieldValueDomain v-if="modelValue.data_type === 'enum'" :model-value="modelValue.value_domain || null" :op="mode === 'edit' ? 'U' : 'C'" :readonly="saving" @update:model-value="update('value_domain', $event)" />
    <el-form-item label="识别粒度"><el-select :model-value="modelValue.grain_level" clearable placeholder="请选择" style="width: 100%" @update:model-value="update('grain_level', $event)"><el-option v-for="item in grains" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
    <el-form-item label="语义域" required><el-select :model-value="modelValue.permission_domain" style="width: 100%" @update:model-value="update('permission_domain', $event)"><el-option v-for="item in domains" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
    <el-form-item label="负责人用户 ID" required><el-input-number :model-value="modelValue.owner_user_id" :min="1" :precision="0" controls-position="right" @update:model-value="update('owner_user_id', $event)" /></el-form-item>
    <el-form-item label="字段分类"><el-select :model-value="modelValue.category_ids" multiple clearable placeholder="可选已有分类" style="width: 100%" @update:model-value="update('category_ids', $event)"><el-option v-for="category in categories" :key="category.id" :label="category.name" :value="category.id" /></el-select></el-form-item>
    <el-form-item label="权限锚点候选"><el-switch :model-value="modelValue.is_permission_anchor" @update:model-value="update('is_permission_anchor', $event)" /></el-form-item>
  </el-form>
</template>
