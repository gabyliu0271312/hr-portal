<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  modelValue: { type?: string; token?: string; roles?: string[] }
}>()

const emit = defineEmits<{ 'update:modelValue': [v: any] }>()

const authType = ref(props.modelValue?.type || 'login')
const token = ref(props.modelValue?.token || '')
const roles = ref<string[]>([...(props.modelValue?.roles || [])])

function emitChange() {
  emit('update:modelValue', {
    type: authType.value,
    ...(authType.value === 'token' ? { token: token.value } : {}),
    ...(authType.value === 'login' ? { roles: roles.value } : {}),
  })
}

watch(authType, emitChange)
watch(token, emitChange)
watch(roles, emitChange, { deep: true })
</script>

<template>
  <div class="perm-editor">
    <el-radio-group v-model="authType" @change="emitChange">
      <el-radio value="login">登录态</el-radio>
      <el-radio value="token">Token</el-radio>
      <el-radio value="internal">内部系统</el-radio>
      <el-radio value="public">公开</el-radio>
    </el-radio-group>

    <div v-if="authType === 'token'" style="margin-top: 8px">
      <el-input v-model="token" placeholder="API Token" style="width: 280px" show-password />
    </div>

    <div v-if="authType === 'login'" style="margin-top: 8px">
      <el-select v-model="roles" multiple placeholder="允许的角色" style="width: 280px">
        <el-option label="管理员" value="admin" />
        <el-option label="HRBP" value="hrbp" />
        <el-option label="薪酬运营" value="compensation" />
      </el-select>
    </div>
  </div>
</template>
