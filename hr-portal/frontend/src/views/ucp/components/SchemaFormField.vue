<template>
  <div class="schema-section">
    <el-divider v-if="title" content-position="left">
      <span style="font-size: 13px; color: #1f2329">{{ title }}</span>
    </el-divider>

    <!-- 1. schema 为空 -->
    <div v-if="!schema || schema.categories.length === 0" class="schema-empty">
      <el-text type="info" size="small">{{ emptyText }}</el-text>
    </div>

    <!-- 2. 按 category 分组渲染字段 -->
    <div v-for="cat in schema?.categories || []" :key="cat.key" class="schema-category">
      <div v-if="showCategoryLabel" class="schema-category-title">
        <el-icon><Document /></el-icon>
        {{ cat.label }}
      </div>
      <el-form-item
        v-for="f in cat.fields"
        :key="f.name"
        :label="f.name"
        :required="!!f.required"
      >
        <!-- text -->
        <el-input
          v-if="controlTypeOf(f) === 'text'"
          :model-value="getValue(cat.key, f.name)"
          :placeholder="defaultPlaceholder(f)"
          @update:model-value="(v: any) => setValue(cat.key, f.name, v)"
        />
        <!-- number -->
        <el-input-number
          v-else-if="controlTypeOf(f) === 'number'"
          :model-value="getValue(cat.key, f.name)"
          :placeholder="defaultPlaceholder(f)"
          style="width: 100%"
          @update:model-value="(v: any) => setValue(cat.key, f.name, v)"
        />
        <!-- boolean -->
        <el-switch
          v-else-if="controlTypeOf(f) === 'boolean'"
          :model-value="getValue(cat.key, f.name)"
          @update:model-value="(v: any) => setValue(cat.key, f.name, v)"
        />
        <!-- select (enum) -->
        <el-select
          v-else-if="controlTypeOf(f) === 'select'"
          :model-value="getValue(cat.key, f.name)"
          :placeholder="defaultPlaceholder(f)"
          clearable
          style="width: 100%"
          @update:model-value="(v: any) => setValue(cat.key, f.name, v)"
        >
          <el-option
            v-for="opt in (f.enum || [])"
            :key="String(opt)"
            :label="String(opt)"
            :value="opt"
          />
        </el-select>
        <!-- fallback: JSON textarea -->
        <el-input
          v-else
          :model-value="getValue(cat.key, f.name)"
          type="textarea"
          :rows="3"
          :placeholder="defaultPlaceholder(f) + ' (JSON)'"
          @update:model-value="(v: any) => setValue(cat.key, f.name, v)"
        />
        <div v-if="f.help" class="schema-field-help">{{ f.help }}</div>
      </el-form-item>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * SchemaFormField — 通用 schema 驱动的字段渲染器
 *
 * 用法:
 *   <SchemaFormField
 *     :schema="schema"
 *     v-model="formValues"
 *     title="配置"
 *     :show-category-label="true"
 *     :empty-text="'未注册 schema, 无扩展字段'"
 *   />
 *
 * v-model 协议:
 *   formValues: { [categoryKey]: { [fieldName]: any } }
 *
 * 渲染规则:
 *   - f.type === 'string' | 'text'         → el-input
 *   - f.type === 'integer' | 'number'      → el-input-number
 *   - f.type === 'boolean'                  → el-switch
 *   - f.enum                                → el-select
 *   - 其他 (含 object / array / 未指定)     → JSON textarea
 */
import { Document } from '@element-plus/icons-vue'

export interface SchemaField {
  name: string
  type?: string
  required?: boolean
  enum?: any[]
  default?: any
  help?: string
  label?: string
}

export interface SchemaCategory {
  key: string
  label: string
  fields: SchemaField[]
}

export interface AdapterSchema {
  categories: SchemaCategory[]
}

const props = withDefaults(
  defineProps<{
    schema: AdapterSchema | null | undefined
    modelValue: Record<string, Record<string, any>>
    title?: string
    showCategoryLabel?: boolean
    emptyText?: string
  }>(),
  {
    title: '',
    showCategoryLabel: true,
    emptyText: '当前 adapter 未注册 schema, 无扩展字段。',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, Record<string, any>>]
}>()

function controlTypeOf(f: SchemaField): 'text' | 'number' | 'boolean' | 'select' | 'json' {
  if (f.enum && f.enum.length > 0) return 'select'
  const t = (f.type || '').toLowerCase()
  if (t === 'integer' || t === 'number') return 'number'
  if (t === 'boolean') return 'boolean'
  if (t === 'string' || t === 'text') return 'text'
  return 'json'
}

function defaultPlaceholder(f: SchemaField): string {
  if (f.default !== undefined) return `默认: ${JSON.stringify(f.default)}`
  if (f.enum && f.enum.length > 0) return `选择 ${f.name}`
  if (f.help) return f.help
  return `输入 ${f.name}`
}

function getValue(catKey: string, fieldName: string): any {
  return props.modelValue?.[catKey]?.[fieldName]
}

function setValue(catKey: string, fieldName: string, val: any) {
  const next = { ...(props.modelValue || {}) }
  if (!next[catKey]) next[catKey] = {}
  next[catKey] = { ...next[catKey], [fieldName]: val }
  emit('update:modelValue', next)
}
</script>

<style scoped>
.schema-section {
  margin-top: 8px;
}
.schema-category {
  margin-bottom: 8px;
}
.schema-category-title {
  font-size: 12px;
  color: #4e5969;
  font-weight: 600;
  margin: 8px 0 4px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.schema-empty {
  padding: 12px 16px;
  background: #f7f8fa;
  border-radius: 6px;
  border: 1px dashed #e5e6eb;
}
.schema-field-help {
  font-size: 11px;
  color: #86909c;
  line-height: 1.5;
  margin-top: 2px;
}
</style>
