<script setup lang="ts">
/**
 * 按钮级权限封装：根据当前用户对某菜单的操作权限，自动隐藏或置灰
 *
 * <PermissionButton menu="system.users" op="C" type="primary" @click="...">
 *   新建用户
 * </PermissionButton>
 *
 * 无权限时：默认隐藏；mode="disable" 改为置灰
 */
import { computed } from 'vue'
import { useUserStore } from '@/stores/user'

const props = defineProps<{
  menu: string
  op: 'V' | 'C' | 'U' | 'D' | 'E'
  mode?: 'hide' | 'disable'
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default' | 'text'
  size?: 'large' | 'default' | 'small'
  link?: boolean
  plain?: boolean
  disabled?: boolean
}>()

const userStore = useUserStore()
const allowed = computed(() => {
  if (props.op === 'V') {
    return userStore.menus.some((m) => m.code === props.menu)
  }
  return userStore.hasOp(props.menu, props.op)
})
const visible = computed(() => allowed.value || props.mode === 'disable')
const internalDisabled = computed(
  () => props.disabled || (!allowed.value && props.mode === 'disable')
)
</script>

<template>
  <el-button
    v-if="visible"
    :type="type"
    :size="size"
    :link="link"
    :plain="plain"
    :disabled="internalDisabled"
    :title="!allowed ? '无权限' : undefined"
  >
    <slot />
  </el-button>
</template>