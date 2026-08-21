<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string[]
  candidates: string[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>()

const dragging = ref('')
const picked = ref('')

// 空清单 = 全部输出：展示全部候选；非空 = 严格按清单（过滤已删除字段）
const selected = computed(() => {
  return props.modelValue.length === 0
    ? [...props.candidates]
    : props.modelValue.filter((f) => props.candidates.includes(f))
})
// 可选 = 候选池中未在当前清单中的
const available = computed(() => props.candidates.filter((f) => !selected.value.includes(f)))
const isAll = computed(() => props.modelValue.length === 0)

function addField() {
  const v = picked.value
  if (!v) return
  emit('update:modelValue', [...selected.value, v])
  picked.value = ''
}
function removeField(f: string) {
  if (props.modelValue.length === 0) {
    // 首次移除：从「全部输出」固化为「自定义清单」，写入去掉该字段后的全量
    emit('update:modelValue', props.candidates.filter((x) => x !== f))
  } else {
    emit('update:modelValue', selected.value.filter((x) => x !== f))
  }
}
function reorder(code: string, target: string) {
  if (!code || !target || code === target) return
  const next = [...selected.value]
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
      <template v-if="isAll">当前输出全部字段；点掉标签即可隐藏不需要的字段，拖拽可调整列序。</template>
      <template v-else>按下方清单顺序导出；点掉标签隐藏字段，拖拽调整顺序，可从下拉重新加入。</template>
    </p>
    <div class="of-tags">
      <el-tag
        v-for="f in selected"
        :key="f"
        closable
        class="of-tag"
        draggable="true"
        @close="removeField(f)"
        @dragstart="dragging = f"
        @dragend="dragging = ''"
        @dragover.prevent
        @drop.prevent="reorder(dragging, f); dragging = ''"
      >{{ f }}</el-tag>
    </div>
    <div class="of-add">
      <el-select v-model="picked" filterable placeholder="添加输出字段" size="small" style="flex:1" @change="addField">
        <el-option v-for="f in available" :key="f" :label="f" :value="f" />
      </el-select>
      <span v-if="!available.length" class="of-empty">候选字段均已输出</span>
    </div>
  </div>
</template>

<style scoped>
.output-fields { display: flex; flex-direction: column; gap: 12px; }
.of-hint { margin: 0; font-size: 13px; color: #8f959e; line-height: 1.6; }
.of-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.of-tag { cursor: grab; user-select: none; }
.of-add { display: flex; align-items: center; gap: 8px; }
.of-empty { font-size: 12px; color: #bbb; }
</style>
