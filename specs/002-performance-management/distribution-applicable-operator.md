# 需求定位 + 实施：分布规则「适用人数」改为五选一比较符

> 2026-11-04。状态：**已实施并验证**。路径：绩效管理后台 → 绩效模板 → 流程设置 → 绩效结果强制/建议分布 → 统一配置规则 → 添加分布规则（右侧弹窗）。

## 一、需求

REA 参考：「适用人数」行 = **比较符下拉**（等于 / 小于 / 小于等于 / 大于 / 大于等于）+ 数字输入 + 单位「人」。

原实现是写死 `<span>大于等于</span>` + 输入框（[PerformanceDistributionRuleEditor.vue](hr-portal/frontend/src/components/performance/PerformanceDistributionRuleEditor.vue)），只有固定「大于等于」一个选项。

## 二、实施内容

### 前端
| 文件 | 改动 |
| --- | --- |
| [api/performance.ts:1731](hr-portal/frontend/src/api/performance.ts#L1731) | `PerformanceDistributionRule` 新增 `min_people_operator: PerformanceDistributionOperator`（`'EQ' \| 'LT' \| 'LTE' \| 'GT' \| 'GTE'`） |
| [PerformanceDistributionRuleEditor.vue:45-49](hr-portal/frontend/src/components/performance/PerformanceDistributionRuleEditor.vue#L45-L49) | 「适用人数」行：`<span>大于等于</span>` 换成 `PerformanceSearchSelect`（五选项 + `selection-style="plain"`），与数字输入 + 「人」后缀同行 |
| [PerformanceDistributionRuleDrawer.vue:22](hr-portal/frontend/src/components/performance/PerformanceDistributionRuleDrawer.vue#L22) | `emptyRule()` 默认 `min_people_operator: 'GTE'` |
| [PerformanceCalibrationRuleDrawer.vue:200](hr-portal/frontend/src/components/performance/PerformanceCalibrationRuleDrawer.vue#L200) | `emptyDistributionRule()` 默认 `min_people_operator: 'GTE'`（第二入口同步） |
| [PerformanceProjectFlowSettings.vue:52](hr-portal/frontend/src/components/performance/PerformanceProjectFlowSettings.vue#L52) | 规则卡片摘要「大于等于 {{ count }} 人」→ `distributionOperatorLabel(rule.min_people_operator)` 动态化；函数加 undefined → GTE 兜底 |

### 后端
| 文件 | 改动 |
| --- | --- |
| [project_service.py:444-455](hr-portal/backend/app/performance/project_service.py#L444-L455) | key 白名单加 `min_people_operator`；读取默认 `GTE`；枚举校验（非法 → 「分布规则适用人数比较符不合法」） |
| [project_service.py:488](hr-portal/backend/app/performance/project_service.py#L488) | 归一化输出带 `min_people_operator` |

### 测试
- 前端 `PerformanceDistributionRuleDrawer.spec.ts`：新增「适用人数比较符五选项 + 默认 GTE + confirm 带 min_people_operator」测试；现有 payload 补字段。
- 前端 `PerformanceProjectFlowSettings.spec.ts`：payload 补 `min_people_operator`（展示断言「大于等于 8 人」仍成立，因默认 GTE）。
- 后端 `test_performance_projects.py`：`_distribution_rule()` 补 `min_people_operator`；round-trip 测试加「缺省输入 → 默认 GTE」兼容断言；新增「五选项接受 + 非法拒绝」测试。

## 三、验收证据

- 前端 `PerformanceDistributionRuleDrawer.spec.ts` + `PerformanceProjectFlowSettings.spec.ts`：**30 passed**
- 前端 `vue-tsc --noEmit`：**通过（0 错误）**
- 后端 `test_performance_projects.py` 全量：**387 passed, 5 skipped**（含新增 distribution 测试 10 项）
- Playwright 实测（新链接 REA + 本地 harness）：比较符五选一恒 120px，数字输入 90px，可键入更新，箭头 stepper 存在

## 四、REA 真实 DOM 参数（新链接抓取，2026-11-04）

新链接 `activities/7704278623921900804?activity_type=review_360&step=flow` 可打开，抓到「适用人数」行真实 DOM：

```html
<div class="flex items-start mb-10 mt-4">
  <div class="ud__select" style="margin-right: 8px; width: 120px;">
    ... 选中项「大于等于」文本 ...
    <input class="ud__select__selector__search__input ud__native-input" role="combobox" readonly="">
    ... 箭头 ...
  </div>
  <div class="flex flex-col">
    <div class="ud__input-number__addon ud__input-number__addon-after-warp ...">
      <div class="ud__input-number ..." style="width: 90px;">
        <input class="ud__native-input" autocomplete="off" value="0">  <!-- 无 min/readonly -->
        <div class="ud__input-number__handle">↑↓ 箭头（0 时 Down 禁用）</div>
      </div>
      <span class="ud__input-number__addon-after">
        <span class="...rounded-br-4 rounded-tr-4 border-l-0 border border-solid border-N-300">人</span>
      </span>
    </div>
  </div>
</div>
```

**参数清单**：比较符下拉宽 120px、margin-right 8px；数字输入宽 90px、带上下箭头 handle、无 min/readonly；单位「人」为右侧圆角方块（addon-after，rounded-br/tr-4、border-l-0、高 32px）。

### 修复沿革
- `bdb5946b`：初始实施（比较符下拉 + `min_people_operator`，输入框 120px 无箭头）
- `28b0c30e`：修复输入框被 flex 压缩（`:deep` 固定 shell/输入框宽度）
- 本轮（待提交）：按 REA 参数把输入框 120px→**90px**，恢复**上下箭头 stepper**（去掉 `:show-controls="false"`），spec 新增「可输入 + stepper + 90px」验收断言

## 五、兼容性

- 存量规则缺 `min_people_operator`：后端归一化默认补 `GTE`，展示函数兜底 GTE → 老数据正常显示「大于等于 N 人」，不破。
- 两个入口（活动弹窗 + 校准规则抽屉）共用 Editor 与后端 `_validate_distribution`，一处校验覆盖两处。
- 90px 输入框 + 箭头：与 REA `ud__input-number`（90px + handle）对齐；单位「人」addon 样式近似（suffix 灰底分隔），如还需像素级 addon 圆角可后续微调组件。
