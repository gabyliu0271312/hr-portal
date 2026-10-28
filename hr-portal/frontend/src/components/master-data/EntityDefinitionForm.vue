<script setup lang="ts">
import PermissionButton from '@/components/PermissionButton.vue'
defineProps<{ modelValue: { entity_code: string; name: string; description: string }; editing: boolean; saving: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: { entity_code: string; name: string; description: string }]; save: []; cancel: [] }>()
</script>

<template>
  <el-form label-position="top" @submit.prevent="emit('save')">
    <el-form-item label="实体编码" required><el-input :model-value="modelValue.entity_code" :disabled="editing || saving" maxlength="64" placeholder="例如 person" @update:model-value="emit('update:modelValue', { ...modelValue, entity_code: $event })" /></el-form-item>
    <el-form-item label="实体名称" required><el-input :model-value="modelValue.name" :disabled="saving" maxlength="128" placeholder="例如 人员" @update:model-value="emit('update:modelValue', { ...modelValue, name: $event })" /></el-form-item>
    <el-form-item label="业务说明" required><el-input :model-value="modelValue.description" :disabled="saving" type="textarea" :rows="3" maxlength="4000" @update:model-value="emit('update:modelValue', { ...modelValue, description: $event })" /></el-form-item>
    <PermissionButton menu="system.master_entities" :op="editing ? 'U' : 'C'" type="primary" :disabled="saving" @click="emit('save')">{{ saving ? '保存中…' : '保存定义' }}</PermissionButton>
    <PermissionButton menu="system.master_entities" op="V" :disabled="saving" @click="emit('cancel')">取消</PermissionButton>
  </el-form>
</template>
