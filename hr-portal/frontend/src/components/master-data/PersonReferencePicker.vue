<script setup lang="ts">
import { ref } from 'vue'
import type { PersonReference } from '@/api/scopes'
import PermissionButton from '@/components/PermissionButton.vue'

const props = defineProps<{ modelValue: PersonReference[]; op: 'C' | 'U'; disabled?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: PersonReference[]] }>()
const entityId = ref<number | undefined>()
const recordId = ref<number | undefined>()
const error = ref('')
function add() {
  if (props.disabled) return
  const entity = entityId.value, record = recordId.value
  if (!Number.isSafeInteger(entity) || !Number.isSafeInteger(record) || !entity || !record || entity <= 0 || record <= 0) {
    error.value = '请输入正整数实体ID和记录ID。'; return
  }
  if (props.modelValue.some(r => r.entity_id === entity && r.record_id === record)) {
    error.value = '该人员记录已添加。'; return
  }
  if (props.modelValue.length >= 100) { error.value = '最多添加100条人员记录。'; return }
  emit('update:modelValue', [...props.modelValue, { entity_id: entity, record_id: record }])
  recordId.value = undefined; error.value = ''
}
function remove(index: number) {
  if (!props.disabled) emit('update:modelValue', props.modelValue.filter((_, i) => i !== index))
}
</script>

<template>
  <section class="person-references">
    <strong>稳定人员记录</strong>
    <p>填写已获权的Person实体ID与记录ID，保存时由服务端复核访问权；不按姓名自动匹配，不搜索全员。</p>
    <el-alert v-if="error" :title="error" type="warning" :closable="false" />
    <div class="reference-row">
      <el-input-number v-model="entityId" :min="1" :precision="0" :controls="false" :disabled="disabled" placeholder="Person实体ID" aria-label="Person实体ID" />
      <el-input-number v-model="recordId" :min="1" :precision="0" :controls="false" :disabled="disabled" placeholder="人员记录ID" aria-label="人员记录ID" />
      <PermissionButton menu="system.scopes" :op="op" :disabled="disabled" @click="add">添加记录引用</PermissionButton>
    </div>
    <div v-for="(reference, index) in modelValue" :key="`${reference.entity_id}-${reference.record_id}`" class="reference-row">
      <span>实体 {{ reference.entity_id }} · 记录 {{ reference.record_id }}</span>
      <PermissionButton menu="system.scopes" :op="op" link type="danger" :disabled="disabled" @click="remove(index)">移除引用</PermissionButton>
    </div>
    <p v-if="!modelValue.length">尚未添加稳定人员记录。</p>
  </section>
</template>

<style scoped>
.person-references { margin-top: 16px; }
p { color: var(--color-text-secondary); font-size: 13px; margin: 8px 0 12px; }
.reference-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-top: 8px; }
</style>
