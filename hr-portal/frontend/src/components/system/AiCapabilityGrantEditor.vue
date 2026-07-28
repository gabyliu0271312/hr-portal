<template>
  <el-alert
    v-if="loadError"
    :title="loadError"
    type="error"
    :closable="false"
    style="margin-bottom: 12px"
  />
  <el-checkbox-group v-model="selected" style="display: flex; flex-direction: column; gap: 8px">
    <el-checkbox v-for="capability in capabilities" :key="capability.capability_id" :value="capability.capability_id">
      {{ capability.name }}
      <span style="color: var(--color-text-placeholder); font-size: 12px; margin-left: 6px">{{ capability.description }}</span>
    </el-checkbox>
  </el-checkbox-group>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { aiApi, type AiCapability } from '@/api/ai'

const props = defineProps<{ modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()
const capabilities = ref<AiCapability[]>([])
const loadError = ref('')
const selected = computed({
  get: () => props.modelValue,
  set: (value: string[]) => emit('update:modelValue', value),
})

onMounted(async () => {
  try {
    capabilities.value = await aiApi.registry()
  } catch {
    loadError.value = 'AI 能力目录加载失败，无法安全修改授权。'
    ElMessage.error(loadError.value)
  }
})
</script>
