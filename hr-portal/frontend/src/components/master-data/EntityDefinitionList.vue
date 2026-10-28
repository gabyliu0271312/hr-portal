<script setup lang="ts">
import type { EntityDefinition } from '@/api/masterData'
import PermissionButton from '@/components/PermissionButton.vue'
defineProps<{ items: EntityDefinition[]; loading: boolean }>()
const emit = defineEmits<{ select: [entity: EntityDefinition]; edit: [entity: EntityDefinition] }>()
</script>

<template>
  <div style="overflow-x: auto">
    <el-table v-loading="loading" :data="items" stripe style="width: 100%" max-height="600" empty-text="还没有可访问的实体定义，可先创建Person（人员）定义。">
      <el-table-column prop="entity_code" label="实体编码" min-width="150" />
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column prop="description" label="业务说明" min-width="250" show-overflow-tooltip />
      <el-table-column label="状态" min-width="100"><template #default="{ row }">{{ row.is_active ? '定义草稿' : '已失效' }}</template></el-table-column>
      <el-table-column label="操作" width="280" fixed="right"><template #default="{ row }">
        <PermissionButton menu="system.master_entities" op="V" link type="primary" @click="emit('select', row)">查看字段引用</PermissionButton>
        <PermissionButton menu="system.master_entities" op="U" link :disabled="!row.is_active" @click="emit('edit', row)">编辑定义</PermissionButton>
      </template></el-table-column>
    </el-table>
  </div>
</template>
