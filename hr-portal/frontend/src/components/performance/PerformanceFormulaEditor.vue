<template>
  <div class="performance-formula-editor" :class="{ 'is-invalid': invalid }">
    <section class="formula-editor-input" aria-label="公式输入区">
      <textarea
        ref="editorRef"
        :value="modelValue"
        :placeholder="editorPlaceholder"
        aria-label="公式编辑器"
        :aria-invalid="invalid || undefined"
        spellcheck="false"
        @input="updateFormula"
      />
    </section>

    <section class="formula-resource-panel" aria-label="公式资源面板">
      <div class="formula-resource-tabs" role="tablist" aria-label="公式资源类型">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.value"
          :class="{ 'is-active': activeTab === tab.value }"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <div class="formula-resource-content">
        <div class="formula-resource-list-panel">
          <PerformanceSearchInput
            v-model="searchKeyword"
            placeholder="搜索"
            aria-label="搜索公式资源"
            width="var(--performance-formula-resource-search-width)"
            variant="compact"
          />
          <div class="formula-resource-list" role="listbox" :aria-label="`${activeTabLabel}列表`">
            <button
              v-for="resource in filteredResources"
              :key="resource.name"
              type="button"
              class="formula-resource-item"
              role="option"
              :aria-selected="hoveredResource?.name === resource.name"
              @mouseenter="hoveredResourceName = resource.name"
              @mouseleave="hoveredResourceName = ''"
              @click="selectResource(resource)"
            >
              <span class="formula-resource-item__name">{{ resource.name }}</span>
              <span class="formula-resource-item__action">插入</span>
            </button>
            <div v-if="!filteredResources.length" class="formula-resource-empty">暂无数据</div>
          </div>
        </div>

        <div v-if="hoveredResource" class="formula-resource-description" aria-live="polite">
          <div class="formula-resource-description__title">{{ hoveredResource.syntax || hoveredResource.name }}</div>
          <div v-if="hoveredResource.description" class="formula-resource-description__tips">{{ hoveredResource.description }}</div>
          <div v-if="hoveredResource.example?.length || activeTab === 'operator'" class="formula-resource-example">
            <div class="formula-resource-example__title">示例</div>
            <div class="formula-resource-example__code">
              <div v-if="hoveredResource.example?.length" class="formula-resource-example__row">
                <span v-for="(example, index) in hoveredResource.example" :key="index" class="formula-resource-example__number">{{ example }}</span>
              </div>
              <div v-if="hoveredResource.example?.length" class="formula-resource-example__result">
                <span>返回值</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18.627 11.22a1 1 0 0 1 0 1.56L8.291 21.084a1 1 0 0 1-1.626-.78V3.696a1 1 0 0 1 1.626-.78l10.335 8.305Z" fill="currentColor" /></svg>
                <span v-if="hoveredResource.result">{{ hoveredResource.result }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import PerformanceSearchInput from './PerformanceSearchInput.vue'

export type PerformanceFormulaResourceKind = 'function' | 'field' | 'operator'

export interface PerformanceFormulaResource {
  name: string
  kind?: PerformanceFormulaResourceKind
  syntax?: string
  description?: string
  example?: string[]
  result?: string
}

const editorPlaceholder = '1. 可直接输入函数或字段名称搜索，或在右侧面板中选择\n2. 可在函数或字段后输入 「.」 符号，快速调用其他函数或字段\n3. 请使用英文半角格式符号'
const tabs: Array<{ value: PerformanceFormulaResourceKind; label: string }> = [
  { value: 'function', label: '函数' },
  { value: 'field', label: '字段' },
  { value: 'operator', label: '运算符' },
]

const props = withDefaults(defineProps<{
  modelValue: string
  invalid?: boolean
  functions?: PerformanceFormulaResource[]
  fields?: PerformanceFormulaResource[]
  operators?: PerformanceFormulaResource[]
}>(), {
  invalid: false,
  functions: () => [
    { name: 'Int', syntax: 'Int(数字)', description: '向下取整，采用小于（或等于）且最接近该数的整数', example: ['99.44'] }, { name: 'Round' },
    { name: 'RoundUp', syntax: 'RoundUp(数字, 小数位数)', description: '对目标数字向上舍入到指定小数位数', example: ['99.44', '1'] },
    { name: 'RoundDown' }, { name: 'Ceiling' }, { name: 'Floor' }, { name: 'Max' }, { name: 'Min' }, { name: 'IsNull' },
  ],
  fields: () => [],
  operators: () => ['+', '-', '*', '/', '==', '!=', '<', '<=', 'and', 'or', 'if', 'then', 'else'].map(name => ({ name })),
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  insert: [resource: PerformanceFormulaResource]
}>()

const editorRef = ref<HTMLTextAreaElement | null>(null)
const activeTab = ref<PerformanceFormulaResourceKind>('function')
const searchKeyword = ref('')
const hoveredResourceName = ref('')

const activeTabLabel = computed(() => tabs.find(tab => tab.value === activeTab.value)?.label || '资源')
const activeResources = computed(() => {
  if (activeTab.value === 'field') return props.fields
  if (activeTab.value === 'operator') return props.operators
  return props.functions
})
const filteredResources = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) return activeResources.value
  return activeResources.value.filter(resource => resource.name.toLowerCase().includes(keyword))
})
const hoveredResource = computed(() => filteredResources.value.find(resource => resource.name === hoveredResourceName.value) || null)

function updateFormula(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

function selectResource(resource: PerformanceFormulaResource) {
  const editor = editorRef.value
  if (!editor) return
  const start = editor.selectionStart
  const end = editor.selectionEnd
  const nextValue = `${props.modelValue.slice(0, start)}${resource.name}${props.modelValue.slice(end)}`
  emit('update:modelValue', nextValue)
  emit('insert', resource)
  void nextTick(() => {
    editor.focus()
    const cursor = start + resource.name.length
    editor.setSelectionRange(cursor, cursor)
  })
}
</script>

<style scoped>
.performance-formula-editor { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(410px, 1fr); min-width: 0; height: 400px; color: var(--color-text-primary); font: 400 var(--font-size-md)/var(--performance-input-line-height) var(--font-sans); }
.formula-editor-input { min-width: 0; overflow: auto; border: 1px solid var(--color-border-light); border-right: 0; border-radius: var(--radius-md) 0 0 var(--radius-md); background: var(--color-bg-card); }
.formula-editor-input textarea { display: block; width: 100%; height: 100%; min-height: 0; padding: var(--spacing-3); box-sizing: border-box; resize: none; border: 0; outline: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/30px var(--font-sans); white-space: pre-wrap; }
.formula-editor-input textarea::placeholder { color: var(--color-text-primary); opacity: 1; }
.formula-editor-input textarea:focus { box-shadow: inset 0 0 0 2px var(--color-primary-light); }
.performance-formula-editor.is-invalid .formula-editor-input { border-color: var(--performance-field-border-invalid); }
.formula-resource-panel { display: flex; min-width: 0; flex-direction: column; overflow: hidden; border: 1px solid var(--color-border-light); border-radius: 0 var(--radius-md) var(--radius-md) 0; background: var(--color-bg-card); }
.formula-resource-tabs { display: flex; align-items: stretch; flex: 0 0 46px; min-width: 0; overflow: hidden; border-bottom: 1px solid var(--performance-line-tabs-divider); }
.formula-resource-tabs button { position: relative; flex: 0 0 auto; height: 46px; padding: 12px var(--spacing-3); border: 0; background: transparent; color: var(--color-text-primary); font: 400 var(--font-size-md)/22px var(--font-sans); cursor: pointer; }
.formula-resource-tabs button:hover { color: var(--color-action-primary-hover); }
.formula-resource-tabs button.is-active { color: var(--color-action-primary-hover); font-weight: 500; }
.formula-resource-tabs button.is-active::after { position: absolute; right: var(--spacing-3); bottom: -1px; left: var(--spacing-3); height: 3px; background: var(--performance-line-tabs-ink); content: ''; }
.formula-resource-content { display: grid; grid-template-columns: minmax(175px, .8fr) minmax(205px, 1fr); min-height: 0; flex: 1; }
.formula-resource-list-panel { min-width: 0; overflow: hidden; padding-top: var(--spacing-1); }
.formula-resource-list-panel :deep(.performance-search-input) { max-width: calc(100% - 2 * var(--spacing-3)); margin: var(--spacing-1) var(--spacing-3) var(--spacing-2); }
.formula-resource-list { height: calc(100% - 47px); overflow: auto; padding: var(--spacing-1) var(--spacing-2); }
.formula-resource-item { display: flex; align-items: center; width: 100%; min-height: 30px; padding: 0 var(--spacing-2); border: 0; border-radius: var(--radius-sm); background: transparent; color: var(--color-text-primary); font: inherit; line-height: 30px; text-align: left; cursor: pointer; }
.formula-resource-item:hover { background: var(--performance-formula-resource-hover-bg); color: var(--color-primary); }
.formula-resource-item:focus-visible { outline: 2px solid var(--color-action-primary-hover); outline-offset: -2px; }
.formula-resource-item__name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.formula-resource-item__action { display: none; margin-left: auto; color: var(--color-primary); }
.formula-resource-item:hover .formula-resource-item__action, .formula-resource-item:focus-visible .formula-resource-item__action { display: inline; }
.formula-resource-empty { padding: var(--spacing-4); color: var(--color-text-secondary); text-align: center; }
.formula-resource-description { min-width: 0; overflow: auto; padding: var(--spacing-1) var(--spacing-3) var(--spacing-3); border-left: 1px solid var(--color-border-light); }
.formula-resource-description__title { margin-bottom: 2px; color: var(--color-text-primary); font-weight: 500; line-height: 22px; }
.formula-resource-description__tips { margin-bottom: var(--spacing-4); color: var(--color-text-secondary); line-height: 22px; }
.formula-resource-example { border-top: 1px dashed var(--color-border); }
.formula-resource-example__title { margin: var(--spacing-4) 0 var(--spacing-1); color: var(--color-text-secondary); }
.formula-resource-example__code { padding: 6px var(--spacing-3); border-radius: var(--radius-sm); background: var(--color-bg-subtle); line-height: 26px; }
.formula-resource-example__row { height: 26px; }
.formula-resource-example__number { margin-right: var(--spacing-2); color: var(--performance-formula-example-number); }
.formula-resource-example__result { display: flex; align-items: center; gap: 2px; color: var(--color-text-primary); }
.formula-resource-example__result span:first-child { color: var(--color-text-placeholder); font-size: var(--font-size-xs); }
.formula-resource-example__result svg { color: var(--color-border); }
@media (max-width: 860px) {
  .performance-formula-editor { grid-template-columns: minmax(0, 1fr); height: auto; gap: var(--spacing-3); }
  .formula-editor-input { height: 180px; border-right: 1px solid var(--color-border-light); border-radius: var(--radius-md); }
  .formula-resource-panel { min-height: 360px; border-radius: var(--radius-md); }
}
</style>
