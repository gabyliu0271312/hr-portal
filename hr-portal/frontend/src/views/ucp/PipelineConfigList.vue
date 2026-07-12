<template>
  <div class="redirect-msg">
    <el-icon class="is-loading"><Loading /></el-icon>
    <p>正在跳转到新的数据接入页面…</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Loading } from '@element-plus/icons-vue'

const router = useRouter()

onMounted(() => {
  router.replace({ name: 'UcpIndex' })
})
</script>

<style scoped>
.redirect-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 100px 0;
  color: #8f959e;
  font-size: 14px;
}
.redirect-msg .el-icon {
  font-size: 32px;
}
</style>
