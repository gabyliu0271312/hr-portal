# START HERE：021报表治理与主数据底座

## 文档定位与本轮决策

本目录是增量规格与待实施任务，不代表代码/生产已完成。**先交付A“现有报表字段口径及授权可靠”，再交付B“可配置HR主数据平台”**；全部建设范围保留，A不等待通用实体/北森接管/组织构树切换。

**交付平台：仅PC浏览器。**2026-10-10用户明确移动端不用处理；021手机适配/走查不计验收或上线门禁，不把历史失败勾成通过。PC真实浏览器/窗口/键盘、权限、生产数据与出口/回滚门禁仍保留；012其他功能的移动要求不受此例外影响。

- [spec.md](spec.md)：业务决策、固定事实样例、字段/操作粒度/多维查询合同、主数据边界、阶段及UI草图。
- [atomic-tasks.md](atomic-tasks.md)：42个父任务，A29项、B9项、后续4项；保留原编号，新增X2106/X2127。具名子项全部通过才勾父项。
- [checklists/requirements.md](checklists/requirements.md)：规格自检与实施待冻结门禁，不是开发测试结果。

**不可再混淆的授权规则：**

1. 人员授权可看有权员工明细及其所有成本中心业务记录；成本中心授权只扩展批准的汇总事实范围。
2. 员工不在人员范围、但分摊到获授权中心时，必须计入中心汇总；不能因此返回逐人/匿名逐行金额、员工档案或下钻明细。
3. 同一批准事实的明细D=人员范围，汇总S=D OR获准中心范围；双路径命中只算一次，不将两份SUM相加。
4. 中心×组织×期间等批准维度是分析分组/业务筛选，不自动加组织授权AND。grain_level是风险提示，内部员工JOIN键和批准COUNT DISTINCT不机械判明细。
5. 数据产品底座登记事实身份/路径/粒度/字段与维度能力一次；用户、报表和每次调用不选person_first/cc_first/cross_filter。服务端验证真实计划，客户端不能伪造summary或legacy参数扩权。
6. 汇总不豁免字段权限；多事实分别受控、员工参考最小投影，不把整张员工表public化；下钻重新执行D。

## 每次开发前必读

1. 本文、spec1/2/3及atomic执行合同/本次任务；B追加spec4。先检查所属A/B、前置和状态，不能把B依赖加回A。
2. 012 [START_HERE](../012-data-warehouse-ucp-integration/START_HERE.md)、spec分层/权限及20.3、atomic A01/A02/A05与相关R/T/N。旧任务状态不因021改写。
3. 涉及UI读012 ui-interaction/ui-implementation-guardrails及本spec7.2线框，开发前细化对应状态；U03/U22存在重复标题时按标题内容/入口定位，不凭第几个同名章节猜。新交互关联N03/N04/N05/N06/N07/N09/N12或B N00/N04/N09/N11。
4. 来源/资源/触发/接管同步读011 [START_HERE](../011-universal-connector-platform/START_HERE.md)、atomic、[warehouse-coordination](../011-universal-connector-platform/warehouse-coordination.md)、012 [ucp-coordination](../012-data-warehouse-ucp-integration/ucp-coordination.md)；不复制凭证/Pipeline。
5. 字段转换读017 [评审决策](../017-mapping-component-reference-governance/code-status-review-and-revision-decision.md)/[主规格](../017-mapping-component-reference-governance/spec.md)及012规则枚举合同；standardization_rules仍唯一ODS→DWD正文，确认绑定不是执行器。
6. 权限读005 [permission-model](../005-unified-permission-model/permission-model.md)的当前适用说明及实际代码；001 [韧性草案](../001-hr-permission-portal/scope-filter-resilience-enhancement.md)只作问题来源，不能按草案恢复第四策略/全表豁免。对比016 [ACL规格](../016-dataset-acl-foundation/spec.md)，不把其未实现全渠道当现状。
7. 测试/验收读012 testing-acceptance；模拟基线不当真实SQL/生产。检查分支/status，已有改动不覆盖；检查旧出口关联与版本隔离，不能仅比列名。

启动确认：

```text
021本次开发启动确认：
- 已读START_HERE/spec/atomic及对应合同：是/否
- 交付包/任务及具名前置子项：A/B/后续，X21xx...
- 已读012 A01/A02/A05及相关章节：是/否
- UI及012 N/本spec7.2/017边界：是/否/不涉及
- UCP/来源同步及011/012协同：是/否/不涉及
- 已检查分支/status/旧报表与外部关联：是/否
- 当前基线/可访问环境/本次计划及阻塞：...
```

## 执行顺序

- A0 X2106/X2102/X2103 → A1 X2110–X2112：最小止损，不等全部主数据设计。legacy先补安全，不静默切新D/S。
- A2目录/确认/当前树/稳定字段 → A3产品准入/实际粒度/D/S/报表 → A4 X2150/X2154/X2153/X2151/X2152：先交付报表可靠性。
- B5 X2105/X2170/X2171/X2172/X2175 → B6 X2173/X2174 → B7 X2176 → B8 X2177：主数据积木、落库接管/持久同步/树切换、消费、整体及A再回归。
- X2160–X2163是后续；员工/组织本地权威、历史/来源裁决和外部渠道不因A/B完成而完成。

## 完成和回滚规则

- 只在全部子项、代码/迁移、UI、自动化/真实执行及必要生产验收通过后勾选；纯合同/盘点按可复核证据，无代码/UI需写不适用。文档编写不是功能完成。
- 新DWD/消费业务输出全字段批准；未知源业务列可留ODS，技术噪音排除有证据，原始报文能力不足标边界。
- X2127稳定字段/批准输出刷新必须先于新发布/运行消费；普通刷新不丢TableColumn/输出/绑定ID、审核/分类，也不自动发新列/schema版本。
- 明细D/汇总S与字段保护同源，运行/计数/预览/导出/下钻覆盖；多维分组不AND组织。混合范围结果标“当前授权范围”而非全量。
- 语义版本可冻结，当前授权/敏感升级/失效不可冻结；回滚不恢复别名跳过或中心明细出口，无安全旧版则暂停。 已确认中心逐人放行风险在A止损即拒绝/暂停，legacy不是豁免；影响旧出口时记录批准缩减/暂停。
- 旧外部绑定对象默认不试点，必须隔离旧执行版本并证明当前创建人/结构/行/金额/可执行性不变或获准安全差异；不可证明则阻断。全渠道迁移仍未完成。
- B主数据非可写DWD，员工/组织仅external_sync，实体菜单权限不等于所有记录访问；关联选择器/COUNT/导出受控，持久同步不乱序/异常批清树，构树单输入。
- 012授权合同修订不取消DWS敏感小组阈值/权限传播，不扩AI业务能力。单人/组合维度推断风险保留，不宣称完全匿名。

交付分别列A/B/后续完成/未完成X21xx、具名子项、文件、真实命令与结果、UI/兼容/迁移/回滚、生产阻塞和残余风险。A完成不等于B或021全项目完成。
