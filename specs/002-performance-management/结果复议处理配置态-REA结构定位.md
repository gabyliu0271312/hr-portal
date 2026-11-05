# 结果复议处理配置态：REA 结构定位（DOM 实测）

> 采集：rea-extract/out/capture2/step3-recon2/（dom.json，模板 7699791798989900738 内容设置 → 结果复议处理）
> 日期：2026-11-05。仅定位，不改代码。

---

## 一、REA 复议处理配置态完整结构

```
ud__tabs__pane（x=440 宽 792）
└─ ud__space ud__space-vertical（垂直布局，item 间距 24）
   ├─ 模块1：复议理由（ud__space__item 1，y=126 h=245）
   │  └─ settingArea（r4）
   │     ├─ 表头「复议理由」（58 高、pd 16/24、text-18/600、mb-12、bg #fff）
   │     └─ ud__collapse（y=196 h=175）
   │        └─ px-12 bg-N-0 rounded + templateItemContainer（-mx-1 pd 16/24）
   │           「这里展示被评估人发起复议时填写的内容」
   │
   ├─ sticky 工具条（y=371 h=54、bg #fff、rounded、flex row items-center）
   │  「添加内容」「添加提示」按钮（模块1 底部操作条，sticky 吸顶）
   │
   └─ 模块2：上级评估（final 环节，ud__space__item 2，y=449）
      └─ settingArea（r4）
         ├─ 表头「上级评估」（58 高、pd 16/24、text-18/600、mb-12、bg #fff）
         ├─ notice「1. 评级和评语，在上级完成「绩效沟通并开通结果」后对被评估人可见...」
         │  （14/22 两行 38.7 高，ud__notice-info = 添加提示配置的 prompt）
         └─ 内容链（final 环节 fill 内容）：
            工作总结（16/600 标题 + 重点工作字段）
            价值贡献（16/600 + 做得好的/待改进的）
            综合评级（16/600 + 绩效评级 1星~5星）
            标签型填写题（16/600 + 价值贡献 勾选标签）
```

**模块间距**：模块1 底 371 → 模块2 顶 449，扣除 sticky 工具条 54 → **内容间距 24px**（`ud__space__item mb=24`，与查看绩效结果设计 token 一致）。

---

## 二、用户 3 点问题定位

### ① 内容设置区参考区应与校准一致
复议处理 reference tab 应显示 **final 参考链**（工作总结/自评/上级评估），与校准环节同构。
我们现状：`reconsiderationContents`（final 内容投影）已实现（104ae069），reference tab 走通用 referenceGroups——**需确认复议处理参考区与校准一致**（同源 final 链）。

### ② 添加内容/添加提示按钮位置
REA：模块1（复议理由）**底部 sticky 工具条**（54 高、bg #fff、flex row）含「添加内容」「添加提示」——参考**查看绩效结果**的 operate bar 实现（result-view-content-footer，80 行）。
我们现状：operate bar 在 `result-reconsideration-section` 内（136 行 `PerformanceTemplateOperateBar`）——**需对齐到模块底部 sticky 结构**。

### ③ 最终评估结果环节独立模块（含表头）
REA：模块2 = **「上级评估」表头（58 高、pd 16/24、text-18/600、mb-12）+ notice + final 内容链**，与模块1 间距 **24**。
我们现状：configured-content-section（144 行）直接渲染 final 内容列表，**无「上级评估」独立表头模块、无 24 间距模块结构**。

---

## 三、修复方向（待确认后实施）

| # | 项 | 动作 |
|---|---|---|
| 1 | 参考区与校准一致 | 核对复议处理 reference tab 走 final 参考链（与校准同构）|
| 2 | 添加按钮位置 | 复议理由模块底部 sticky 工具条（54 高 bg#fff flex）+ 添加内容/添加提示（参考 result_view 的 operate bar）|
| 3 | final 独立模块 | 复议处理 fill tab 结构改为：复议理由模块（表头 58 + collapse 内容 + 底部操作条）→ 间距 24 → 上级评估模块（表头 58 + notice + final 内容链）|
