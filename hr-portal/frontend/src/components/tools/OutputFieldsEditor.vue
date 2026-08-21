<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue: string[]
  candidates: string[]
}>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string[]): void }>()

const dragging = ref('')
const picked = ref('')

// 已选 = 清单中仍在候选池内的字段（自动过滤已删除字段）
const selected = computed(() => props.modelValue.filter((f) => props.candidates.includes(f)))
// 可选 = 候选池中未选中的
const available = computed(() => props.candidates.filter((f) => !selected.value.includes(f)))
const custom = computed(() => selected.value.length > 0)

function addField() {
  const v = picked.value
  if (!v) return
  emit('update:modelValue', [...selected.value, v])
  picked.value = ''
}
function removeField(f: string) {
  emit('update:modelValue', selected.value.filter((x) => x !== f))
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
      <template v-if="custom">输出列严格按下方清单顺序导出；不在清单内的字段仅参与归集与计算、不导出。</template>
      <template v-else>当前为「全部输出」：主键 + 标准字段 + DWD 补充字段按默认顺序全部导出。添加字段后即切换为自定义清单。</template>
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
