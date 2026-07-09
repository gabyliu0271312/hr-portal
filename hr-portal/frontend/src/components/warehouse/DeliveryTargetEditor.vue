<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: { target: string; address?: string }
}>()

const emit = defineEmits<{ 'update:modelValue': [v: any] }>()

const target = ref(props.modelValue?.target || 'feishu')
const address = ref(props.modelValue?.address || '')

const TARGETS = [
  { label: '飞书消息', value: 'feishu' },
  { label: '邮件', value: 'email' },
  { label: 'Webhook', value: 'webhook' },
  { label: '文件下载', value: 'file' },
]

function emitChange() {
  emit('update:modelValue', { target: target.value, address: address.value })
}

watch(target, emitChange)
watch(address, emitChange)
</script>

<template>
  <div class="delivery-editor">
    <el-select v-model="target" placeholder="投递方式" style="width: 160px">
      <el-option v-for="t in TARGETS" :key="t.value" :label="t.label" :value="t.value" />
    </el-select>
    <el-input
      v-if="target === 'webhook' || target === 'email'"
      v-model="address"
      :placeholder="target === 'webhook' ? 'Webhook URL' : '邮箱地址'"
      style="width: 280px; margin-left: 8px"
    />
  </div>
</template>

<style scoped>
.delivery-editor { display: flex; align-items: center; }
</style>
