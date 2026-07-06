<script setup lang="ts">
import { computed } from 'vue'
import { getWarehouseLayerMeta } from '@/constants/warehouseLayers'

const props = defineProps<{
  layer: string | null | undefined
}>()

const meta = computed(() => getWarehouseLayerMeta(props.layer))
</script>

<template>
  <el-tag :type="meta.tagType" size="small" effect="plain">
    {{ meta.label }}
  </el-tag>
</template>