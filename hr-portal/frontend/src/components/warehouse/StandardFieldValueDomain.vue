<script setup lang="ts">
import { computed } from 'vue'
import PermissionButton from '@/components/PermissionButton.vue'
import type { StandardFieldEnumValue, StandardFieldValueDomain } from '@/api/standardFields'

const props = defineProps<{ modelValue: StandardFieldValueDomain | null; readonly?: boolean; op?: 'C' | 'U' }>()
const emit = defineEmits<{ 'update:modelValue': [value: StandardFieldValueDomain] }>()
const legacy = computed(() => props.modelValue !== null && props.modelValue !== undefined && !Array.isArray(props.modelValue.items))
const locked = computed(() => props.readonly || legacy.value)
const items = computed(() => legacy.value ? [] : props.modelValue?.items || [])
function update(index: number, key: keyof StandardFieldEnumValue, value: unknown) {
  if (locked.value) return
  emit('update:modelValue', { ...props.modelValue, items: items.value.map((item, i) => i === index ? { ...item, [key]: value } : item) })
}
function add() {
  if (locked.value) return
  emit('update:modelValue', { ...props.modelValue, items: [...items.value, { code: '', name: '', enabled: true, sort_order: items.value.length }] })
}
function remove(index: number) {
  if (locked.value) return
  emit('update:modelValue', { ...props.modelValue, items: items.value.filter((_, i) => i !== index) })
}
</script>

<template>
  <section class="value-domain">
    <div class="value-domain__heading"><strong>枚举值域</strong><PermissionButton v-if="!locked" menu="warehouse.standard_fields.catalog" :op="op || 'U'" size="small" @click="add">添加枚举值</PermissionButton></div>
    <p>仅维护人工定义的编码与名称，不读取业务数据或自动推断值。{{ readonly ? '已保存版本只读；已启用值域请通过新建版本调整。' : '保存草稿不会自动启用或转换业务值。' }}</p>
    <p v-if="legacy" role="status">此版本使用旧格式值域，仅只读保留原定义；请先完成格式迁移，当前不能添加或覆盖枚举项。</p>
    <div v-else style="overflow-x: auto">
      <el-table :data="items" stripe style="width: 100%" max-height="600" empty-text="尚未维护枚举值域">
        <el-table-column label="编码" min-width="140"><template #default="{ row, $index }"><span v-if="locked">{{ row.code }}</span><el-input v-else :model-value="row.code" aria-label="枚举编码" maxlength="128" @update:model-value="update($index, 'code', $event)" /></template></el-table-column>
        <el-table-column label="名称" min-width="140"><template #default="{ row, $index }"><span v-if="locked">{{ row.name }}</span><el-input v-else :model-value="row.name" aria-label="枚举名称" maxlength="128" @update:model-value="update($index, 'name', $event)" /></template></el-table-column>
        <el-table-column label="启用" min-width="90"><template #default="{ row, $index }"><span v-if="locked">{{ row.enabled ? '是' : '否' }}</span><el-switch v-else :model-value="row.enabled" aria-label="枚举启用" @update:model-value="update($index, 'enabled', $event)" /></template></el-table-column>
        <el-table-column label="排序" min-width="150"><template #default="{ row, $index }"><span v-if="locked">{{ row.sort_order }}</span><el-input-number v-else :model-value="row.sort_order" :min="0" :precision="0" aria-label="枚举排序" controls-position="right" @update:model-value="update($index, 'sort_order', $event)" /></template></el-table-column>
        <el-table-column v-if="!locked" label="操作" width="280" fixed="right"><template #default="{ $index }"><PermissionButton menu="warehouse.standard_fields.catalog" :op="op || 'U'" size="small" @click="remove($index)">移除</PermissionButton></template></el-table-column>
      </el-table>
    </div>
  </section>
</template>

<style scoped>
.value-domain { display: grid; gap: 8px; margin-block: 12px; }
.value-domain__heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.value-domain p { margin: 0; color: var(--color-text-secondary); font-size: 12px; line-height: 1.6; }
</style>
