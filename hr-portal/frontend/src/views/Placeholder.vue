<script setup lang="ts">
import { useRoute } from 'vue-router'
import { computed } from 'vue'
import { Tools } from '@element-plus/icons-vue'

const route = useRoute()
const label = computed(() => (route.meta.label as string) || '页面')
const code = computed(() => (route.meta.menuCode as string) || '')
</script>

<template>
  <div style="padding: 24px">
    <el-card>
      <template #header>
        <span style="font-size: 16px; font-weight: 600">{{ label }}</span>
      </template>

      <el-empty description="该模块开发中">
        <template #image>
          <el-icon :size="60" style="color: var(--color-text-placeholder)">
            <Tools />
          </el-icon>
        </template>
        <div style="text-align: center; max-width: 480px; margin: 0 auto">
          <p style="color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; margin: 0 0 12px">
            菜单编码：<span style="font-family: monospace; color: var(--color-text-primary)">{{ code || '—' }}</span>
          </p>
          <p style="color: var(--color-text-secondary); font-size: 13px; line-height: 1.6; margin: 0">
            该页面尚未实装。Phase 1-3 已完成系统骨架与权限管理；
            数据接入相关页面将在 Phase 4 完成（北森接入 + 5 张数据表 + 双层级树）；
            报表向导将在 Phase 6 完成。
          </p>
        </div>
      </el-empty>
    </el-card>
  </div>
</template>

