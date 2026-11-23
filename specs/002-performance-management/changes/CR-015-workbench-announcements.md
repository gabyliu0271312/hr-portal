# CR-015 工作台公告与按周期知悉

日期：2026-11-23。状态：代码、定向测试及实际 Vue 受控 API 页面验收完成；真实 PostgreSQL 迁移/并发验收 blocked，未部署。

## 权威与范围

用户已授权按 REA 实采完成全链路开发、必要规格/UI蓝图/测试文件。入口：后台应用设置→系统设置→工作台设置→公告；员工工作台。知悉唯一键为员工身份+公告ID+周期，跨设备有效。修改任何原公告字段、停用再启用均不重置；需要再次知悉必须新建公告。不创建内容版本。所有周期公告仍按当前具体周期独立确认。无周期不要求确认。

角色：HRBP、REAL_LINE_MANAGER 多选，任一满足即可见。关联周期内项目当前成员快照中的实际参评人及其冻结HRBP/实线上级关系；不查实时花名册。无员工映射/身份冲突不作为员工角色，系统账号无自动绕过。所有人公告对已有绩效入口权限的登录用户可见。配置接口继续要求 performance.configuration.manage。图片读取须为管理员或可见该公告的登录者，不公开静态上传目录。

不做定时弹出、其他弹出页面、消息通知、生产部署，不改其他在途项目。

## UI蓝图 v1（基于本会话 REA 实采，用户已授权照此完成开发）

后台沿现有路由与弹窗：600px宽；标题16/24、600；标题区72px；内边距24px；独立内容滚动；页脚取消/保存/启用80×32、gap12。标题、链接支持中文/英文；展示周期沿现有单周期合同；可见范围改“指定角色”、多选框32px、缩进24px、24px标签；切换范围保留本次选择。知悉开关28×16；说明与查看示例另起正文行；开启后显示可选描述（各语言≤1000字）、配图（各语言一张JPG/JPEG/PNG≤10MiB）；关闭再开保留内容。hover示例为标题+468×286示意图，复用Popover的避让/阴影/token，允许键盘聚焦/Escape。

员工：可见公告列表、失败重试；当前周期待知悉公告依排序逐一弹出，标题、描述、可选图片、查看详情/我已知悉，不以外链访问代替确认；确认中禁用，失败保留并重试，成功下一份；周期/身份切换立即清除旧弹窗，晚响应不回填。确认不允许遮罩/Escape绕过。已确认公告仍保留列表入口。

复用 PerformanceSearchSelect、PerformancePopover、PerformanceTextField、PerformanceRadioGroup、UiSwitch、UiButton、UiDialogShell；新增组件职责限多语言输入/图片上传/知悉配置/公告正文。新增token仅写入tokens.css。所有新交互覆盖default/hover/focus/active/disabled/loading/error，上传补预览/替换/移除/超限。

## 冻结合同

既有公告CRUD路径不变。公告新增 visibility_roles: ('HRBP'|'REAL_LINE_MANAGER')[]、title_en、link_en、description、description_en（字符串默认空）、image_id、image_en_id（整数或null）；原 visibility_role 通过新迁移转数组后退役，禁止两套写入。visibility存“所有人”或“指定角色”，指定角色至少一项；无效URL/未知角色拒绝422；原合法相对路径保留。普通PATCH不修改知悉表。

GET /performance/workbench/announcements 接受cycle_ref或cycle_id，返回既有feed加cycle_ref及每项acknowledged（无周期为false）、上述正文/图片字段。feed中的require_ack表示当前可执行要求：配置要求确认、已解析EMPLOYEE身份且有具体周期时才为true；后台CRUD保留配置原值。系统/未映射/冲突身份可读所有人公告但不陷入不可提交的强制弹窗，不绕过角色筛选。无周期只返回所有周期公告，角色范围按含实际参评成员的周期关系并集判断。POST /performance/workbench/announcements/{id}/acknowledge，body {cycle_ref}，返回{acknowledged:true}；在同一事务重新校验启用/可见性/周期/需知悉，采用数据库唯一约束和幂等插入。不存在或不可见404 ANNOUNCEMENT_NOT_FOUND，停用或不要求知悉409 ANNOUNCEMENT_ACK_NOT_REQUIRED，身份未映射403 ANNOUNCEMENT_EMPLOYEE_REQUIRED。

POST /performance/workbench-settings/announcement-images，multipart file，返回{id}；图片数据库存储，验证实际图片格式及长度，不信任声明mime。GET /performance/workbench/announcement-images/{id}?cycle_ref=...，认证blob读取；管理员或公告可见用户可读，不可枚举未关联上传。后端限制10MiB，响应nosniff/no-store。

新迁移由后台任务唯一持有，执行前确认单head。图片/确认记录独立表；确认唯一(announcement_id,employee_no,cycle_ref)，公告删除级联。无内容版本，无临时浏览器持久化。

## 原子任务与验收

- [ ] CR-015-T01 后端合同/迁移/角色过滤/图片/幂等知悉。允许models.py公告相关、workbench_settings_router.py、新公告服务/迁移和相关tests；禁止改其他router及生产。Given双角色/真实成员/未映射/无周期；When读取feed或确认；Then最小权限、按周期独立、重复确认幂等、编辑不重置。验证图片权限/实际格式/超限。迁移升级、旧单角色迁移、降级及回滚分别记录，不运行即not-run。
- [x] CR-015-T02 后台组件配置与示例hover。允许WorkbenchSettingEditor及独立公告组件、WorkbenchSettings、tokens、API公告段、定向测试。共享API仅主线程串行编辑。Given开关/角色切换/中英文；When保存/回显/上传失败；Then数据不丢、多选真实提交、按钮与输入完整状态。UI证据 ui-blueprints/CR-015-T02-announcement-editor.png。
- [x] CR-015-T03 员工公告与知悉。允许Workbench及独立公告组件、API公告段、定向测试。Given周期A已确认/B未确认及迟到响应；When重进/切周期/失败重试；Then仅本周期确认、原公告编辑不重置、多公告顺序、拒绝越权。UI证据 ui-blueprints/CR-015-T03-announcement-ack.png。

必读：START_HERE、overview/integration/permission-model/data-model/workflow-design、Spec012 UI守则、design-system、上述现有代码。只主线程可勾选完成；开发、测试、实际UI/数据库证据分别报告，缺环境不提升验收状态。生产发布需另行授权。

## 验收记录

2026-11-23 最终集成证据：

- 前端：`npx vitest run src/components/ui/UiDialogShell.spec.ts src/components/ui/UiButton.spec.ts src/components/performance/WorkbenchSettingEditor.spec.ts src/components/performance/WorkbenchLocalizedField.spec.ts src/components/performance/WorkbenchAnnouncementScopes.spec.ts src/components/performance/WorkbenchAnnouncementAcknowledgement.spec.ts src/components/performance/WorkbenchAnnouncementImageUpload.spec.ts src/components/performance/WorkbenchAnnouncementExample.spec.ts src/views/performance/WorkbenchSettings.spec.ts src/views/performance/Workbench.spec.ts src/components/performance/WorkbenchAnnouncementAckDialog.spec.ts`，11文件86项通过。已有jsdom修改键外链navigation未实现提示，不影响退出码0。
- 后端：`python -m pytest -q tests/test_performance_announcements.py tests/test_performance_workbench_settings.py tests/test_performance_announcements_postgres.py`，44 passed、1 skipped（PG专用）、1条python_multipart弃用warning。包含真实SQLite SQL/外键/唯一约束、按周期独立确认、编辑不重置、角色并集与拒绝、系统/未映射/冲突身份不阻塞、认证图片/超限/解码校验。SQLite证据不等同PostgreSQL证据。
- 迁移：`python -m alembic heads`仅0323_pm_workbench_announcements，down_revision=0322_pm_calibration_completion；PG离线升级SQL生成成功。`--postgres-acceptance`实际执行退出2，数据库主机解析失败`[Errno 11001] getaddrinfo failed`，无测试运行；Docker daemon不可达。本轮未对生产运行迁移或降级。T01因此仍保持未勾选，真实升级/旧数据迁移/降级/并发验收blocked。
- 额外身份基线：后台代理单独运行test_performance_member_identity.py，60 passed、5 failed；失败是未改路径的项目列表schema替身缺execute、催办rows缺selectable、360提示/调度probe缺scalar，未越界修改。
- 页面：实际Vite应用`/performance/settings/system/workbench`，隔离浏览器受控API验证双角色保存payload、保存停用、编辑回显、中英文/开关联动及示例hover，pageerror为空；不是生产API联调。截图为`ui-blueprints/CR-015-T02-announcement-editor.png`及`CR-015-T02-announcement-example-hover.png`。示例使用原站静态图片的本地副本`frontend/public/announcement-example/announcement-detail-cn.png`，无运行时第三方图片请求。
- 员工页面：实际Vite应用`/performance/workbench`，受控API验证503确认失败→重试→成功、同周期刷新不重弹、切第二周期独立确认，无项目但有周期仍加载公告；pageerror为空。截图`ui-blueprints/CR-015-T03-announcement-ack.png`和`CR-015-T03-announcement-ack-error.png`。受控接口状态仅用于隔离验收，不用于业务持久化。
- 共享组件：UiDialogShell新增dismissible（默认true），知悉传false且无关闭按钮；UiButton补secondary/outline-primary active token消费；既有默认行为回归通过。Pillow>=12,<14已声明部署依赖。
- `git diff --check`通过，仅已有LF/CRLF提示。未提交git、未部署、未操作生产。用户/其他会话在途改动不作为本轮交付。
- 最终生产构建：`npm run build`（vue-tsc --noEmit && vite build）退出码0，Vite 43.60s构建完成；仅第三方@vueuse PURE注释位置提示，不影响构建。

部署前必须恢复可用PostgreSQL，执行PG专用验收及正常新迁移升级，再运行真实身份的配置→上传→feed→确认→回读。降级存在新正文、多角色、图片或确认记录时主动拒绝数据丢失。
