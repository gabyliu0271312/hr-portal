<template>
  <div class="credential-form">
    <el-form-item label="认证方式" required>
      <el-select v-model="model.auth_type" style="width:100%" :disabled="readonlyAuth">
        <el-option v-for="item in authOptions" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>
    </el-form-item>
    <el-form-item label="密钥配置" required>
      <div v-for="field in fields" :key="field.key" class="secret-row">
        <el-input :model-value="field.label" disabled style="width:160px" />
        <el-input v-model="model.secrets[field.key]" :type="showSecret ? 'text' : 'password'" :placeholder="editMode ? `留空则不修改；输入新的 ${field.label}` : `输入 ${field.label}`" style="flex:1" />
      </div>
      <el-button size="small" link @click="showSecret = !showSecret">{{ showSecret ? '隐藏' : '显示' }}值</el-button>
    </el-form-item>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
const props = defineProps<{ modelValue: { auth_type: string; secrets: Record<string, string> }; schema?: any[]; allowedAuthTypes?: string[]; editMode?: boolean; readonlyAuth?: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: typeof props.modelValue] }>()
const showSecret = ref(false)
const defaults: Record<string, { label: string; fields: { key: string; label: string }[] }> = {
  none: { label: '无认证', fields: [] },
  api_key: { label: 'API Key', fields: [{ key: 'api_key', label: 'API Key' }] },
  app_key_secret: { label: 'App Key / Secret', fields: [{ key: 'app_id', label: 'App ID' }, { key: 'app_secret', label: 'App Secret' }] },
  basic: { label: 'Basic Auth', fields: [{ key: 'username', label: '用户名' }, { key: 'password', label: '密码' }] },
  oauth2: { label: 'OAuth2', fields: [{ key: 'client_id', label: 'Client ID' }, { key: 'client_secret', label: 'Client Secret' }] },
  token: { label: 'Token', fields: [{ key: 'token', label: 'Token' }] },
  hmac_sha256_timestamped: { label: 'HMAC-SHA256 时间戳签名', fields: [{ key: 'signing_secret', label: '签名密钥' }] },
}
const model = computed({ get: () => props.modelValue, set: (value) => emit('update:modelValue', value) })
const authOptions = computed(() => Object.entries(defaults)
  .filter(([value]) => !props.allowedAuthTypes?.length || props.allowedAuthTypes.includes(value))
  .map(([value, item]) => ({ value, label: item.label })))
const fields = computed(() => props.schema?.length ? props.schema.filter((item) => item.required !== false).map((item) => ({ key: item.key, label: item.label || item.key })) : defaults[model.value.auth_type]?.fields || [])
watch(() => model.value.auth_type, (value, oldValue) => { if (value !== oldValue && !props.editMode) model.value.secrets = {} })
</script>
<style scoped>.secret-row { display:flex; gap:8px; margin-bottom:8px }</style>
