<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string[]
  candidates: string[]
  labels?: Record<string, string>
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>()

const dragging = ref('')

// 空清单 = 全部输出；非空 = 严格按清单（过滤已删除字段）
const isAll = computed(() => props.modelValue.length === 0)
const outputFields = computed(() => {
  if (isAll.value) return [...props.candidates]
  return props.modelValue.filter((f) => props.candidates.includes(f))
})
const hiddenFields = computed(() => {
  if (isAll.value) return []
  return props.candidates.filter((f) => !outputFields.value.includes(f))
})
function fieldLabel(field: string) {
  return props.labels?.[field] || field
}

function hideField(f: string) {
  if (isAll.value) {
    // 首次移除：从「全部输出」固化为「自定义清单」
    emit('update:modelValue', props.candidates.filter((x) => x !== f))
  } else {
    emit('update:modelValue', outputFields.value.filter((x) => x !== f))
  }
}
function restoreField(f: string) {
  emit('update:modelValue', [...outputFields.value, f])
}
function resetAll() {
  emit('update:modelValue', [])
}
function reorder(code: string, target: string) {
  if (!code || !target || code === target) return
  const next = [...outputFields.value]
  const from = next.indexOf(code)
  const to = next.indexOf(target)
  if (from < 0 || to < 0) return
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  emit('update:modelValue', next)
}
</script>

<template>
  <div class="output-fields">
    <p class="of-hint">
      <template v-if="isAll">当前输出全部字段；点掉标签可隐藏，拖拽调整列序。</template>
      <template v-else>按下方顺序导出；点掉标签隐藏、点置灰标签恢复，拖拽调整顺序。</template>
    </p>
    <div v-if="!isAll" class="of-actions">
      <el-button size="small" link type="primary" @click="resetAll">恢复全部输出</el-button>
    </div>
    <div class="of-tags">
      <el-tag
        v-for="f in outputFields"
        :key="f"
        closable
        class="of-tag"
        draggable="true"
        @close="hideField(f)"
        @dragstart="dragging = f"
        @dragend="dragging = ''"
        @dragover.prevent
        @drop.prevent="reorder(dragging, f); dragging = ''"
      >{{ fieldLabel(f) }}</el-tag>
      <el-tag
        v-for="f in hiddenFields"
        :key="'hidden-' + f"
        class="of-tag-hidden"
        title="点击恢复输出"
        @click="restoreField(f)"
      >{{ fieldLabel(f) }}</el-tag>
    </div>
    <p v-if="hiddenFields.length" class="of-hidden-hint">置灰字段不导出，点击可恢复。</p>
  </div>
</template>

<style scoped>
.output-fields { display: flex; flex-direction: column; gap: 12px; }
.of-hint { margin: 0; font-size: 13px; color: #8f959e; line-height: 1.6; }
.of-actions { display: flex; }
.of-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.of-tag { cursor: grab; user-select: none; }
.of-tag-hidden { cursor: pointer; opacity: 0.45; text-decoration: line-through; }
.of-hidden-hint { margin: 0; font-size: 12px; color: #bbb; }
</style>
