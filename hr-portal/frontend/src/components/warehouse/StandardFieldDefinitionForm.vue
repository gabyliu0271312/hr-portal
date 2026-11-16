<script setup lang="ts">
import type { StandardFieldDefinitionPayload, FieldGroup } from '@/api/standardFields'
import type { FieldCategory } from '@/api/field_categories'
import type { EntityDefinition } from '@/api/masterData'
import StandardFieldValueDomain from './StandardFieldValueDomain.vue'
import PerformanceTextField from '@/components/performance/PerformanceTextField.vue'
import PerformanceAssessmentSelect from '@/components/performance/PerformanceAssessmentSelect.vue'
import PerformanceMultiSelect from '@/components/performance/PerformanceMultiSelect.vue'
import PerformanceRequiredLabel from '@/components/performance/PerformanceRequiredLabel.vue'

const props = defineProps<{ modelValue: StandardFieldDefinitionPayload; mode: 'create' | 'edit'; saving: boolean; categories: FieldCategory[]; groups?: FieldGroup[]; entities?: EntityDefinition[]; entityLocked?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: StandardFieldDefinitionPayload]; submit: [] }>()
function update(key: string, value: unknown) { emit('update:modelValue', { ...props.modelValue, [key]: value } as StandardFieldDefinitionPayload) }
const dataTypes = [{ id: 'string', label: '字符串' }, { id: 'number', label: '数值' }, { id: 'date', label: '日期' }, { id: 'datetime', label: '日期时间' }, { id: 'bool', label: '布尔' }, { id: 'enum', label: '枚举' }]
const entityOptions = (props.entities || []).map(entity => ({ id: String(entity.id), label: `${entity.name}（${entity.entity_code}）` }))
const groupOptions = (props.groups || []).map(group => ({ id: String(group.id), label: group.name }))
const categoryOptions = (props.categories || []).map(category => ({ value: String(category.id), label: category.is_sensitive ? `${category.name}（敏感）` : category.name }))
</script>

<template>
  <form class="standard-field-form" @submit.prevent="emit('submit')">
    <label class="standard-field-form__item">
      <PerformanceRequiredLabel label="字段编码" :required="true" />
      <PerformanceTextField :model-value="modelValue.field_code || ''" :disabled="mode !== 'create'" :maxlength="64" placeholder="例如 employee_no" @update:model-value="update('field_code', $event)" />
    </label>
    <label class="standard-field-form__item">
      <PerformanceRequiredLabel label="字段名称" :required="true" />
      <PerformanceTextField :model-value="modelValue.field_name || ''" :maxlength="128" @update:model-value="update('field_name', $event)" />
    </label>
    <label class="standard-field-form__item">
      <PerformanceRequiredLabel label="业务定义" :required="true" />
      <PerformanceTextField :model-value="modelValue.business_definition || ''" type="textarea" :maxlength="4000" @update:model-value="update('business_definition', $event)" />
    </label>
    <div class="standard-field-form__item">
      <PerformanceAssessmentSelect label="数据类型" :required="true" :model-value="modelValue.data_type" :options="dataTypes" @update:model-value="update('data_type', $event)" />
    </div>
    <StandardFieldValueDomain v-if="modelValue.data_type === 'enum'" :model-value="modelValue.value_domain || null" :op="mode === 'edit' ? 'U' : 'C'" :readonly="saving" @update:model-value="update('value_domain', $event)" />
    <div class="standard-field-form__item">
      <PerformanceAssessmentSelect label="归属实体" :model-value="modelValue.entity_id ? String(modelValue.entity_id) : ''" :options="entityOptions" placeholder="选择有权实体；存量未归属字段不自动分配" :disabled="saving || entityLocked" @update:model-value="update('entity_id', $event ? Number($event) : null)" />
    </div>
    <div class="standard-field-form__item">
      <PerformanceRequiredLabel label="敏感字段分类" :required="false" />
      <PerformanceMultiSelect :model-value="(modelValue.category_ids || []).map(id => String(id))" :options="categoryOptions" placeholder="可选已有敏感分类" :disabled="saving" @update:model-value="update('category_ids', ($event as string[]).map(v => Number(v)))" />
    </div>
    <div class="standard-field-form__item">
      <PerformanceAssessmentSelect label="业务分组" :model-value="modelValue.group_id ? String(modelValue.group_id) : ''" :options="groupOptions" placeholder="按创梦人力字段设置分组组织（可选）" :disabled="saving" @update:model-value="update('group_id', $event ? Number($event) : null)" />
    </div>
  </form>
</template>

<style scoped>
/* 对齐 Ardot 13:60：上标签 + 下输入框，字段间距 20、label 下距 8，全部消费 token。 */
.standard-field-form { display: grid; gap: var(--ui-form-item-gap); }
.standard-field-form__item { display: grid; gap: var(--ui-form-label-gap); min-width: 0; }
</style>
