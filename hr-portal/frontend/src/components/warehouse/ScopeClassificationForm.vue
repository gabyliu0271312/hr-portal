<script setup lang="ts">
import { scopeClassificationLabels, type ScopeApprovalDraft, type ScopeClassificationRecord } from '@/api/scopeGovernance'

const props = defineProps<{
  modelValue: ScopeApprovalDraft; record: ScopeClassificationRecord; readonly: boolean; busy: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [draft: ScopeApprovalDraft] }>()
function update(key: keyof ScopeApprovalDraft, value: string) {
  emit('update:modelValue', { ...props.modelValue, [key]: value })
}
</script>

<template>
  <section>
  <el-descriptions :column="1" border>
    <el-descriptions-item label="当前分类">{{ scopeClassificationLabels[record.security_classification] || '未知分类' }}</el-descriptions-item>
    <el-descriptions-item label="版本">{{ record.version }}</el-descriptions-item>
    <el-descriptions-item label="批准人 ID">{{ record.approved_by ?? '尚未批准' }}</el-descriptions-item>
    <el-descriptions-item label="批准时间">{{ record.approved_at || '尚未批准' }}</el-descriptions-item>
    <el-descriptions-item label="当前批准原因">{{ record.reason || '尚未填写' }}</el-descriptions-item>
  </el-descriptions>
  <el-form v-if="!readonly" label-position="top" class="scope-classification-fields">
    <el-form-item label="治理分类" required>
      <el-select :model-value="modelValue.security_classification" :disabled="busy" style="width: 100%" aria-label="治理分类" @update:model-value="update('security_classification', $event)">
        <el-option v-for="(label, value) in scopeClassificationLabels" :key="value" :label="label" :value="value" />
      </el-select>
    </el-form-item>
    <el-form-item label="批准原因（请勿填写员工、金额或凭证信息）" required>
      <el-input :model-value="modelValue.reason" :disabled="busy" type="textarea" :rows="4" :maxlength="1000" show-word-limit aria-label="批准原因" placeholder="说明分类依据、适用边界及核对结果" @update:model-value="update('reason', $event)" />
    </el-form-item>
  </el-form>
  <p v-else class="scope-readonly">当前仅有查看权限，不能修改批准记录。</p>
  </section>
</template>

<style scoped>
.scope-classification-fields { margin-top: var(--spacing-lg, 24px); }
.scope-readonly { color: var(--color-text-secondary); margin-top: 16px; }
</style>
