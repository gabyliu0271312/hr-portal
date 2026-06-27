---
name: hr-portal-beisen-report-pagination
description: 北森报表接口分页两个坑(pageSize上限+无序重叠)导致行数拉不全的根因与应对
metadata:
  type: project
---

北森报表 GridData 接口(`beisen_report` 源类型)有两个叠加的坑,曾导致 `emp_monthly_allocation` 源头 944 条只拉到 714 条(丢 230)。

**两个坑:**
1. **`totalRecords` 真实但 `pageSize` 有上限**:接口报 total=944 是准的,但 `pageSize=5000` 直接 400;实测 1000 可用。
2. **分页查询无稳定排序 → 页间随机重叠**:按 page/pageSize 翻页时,page2 会随机重复 page1 的部分行(整行完全相同),于是"翻完所有页"累计看着够数,实际覆盖不到全部记录,且尾页直接返回空 → 永远拉不全。

**排查关键教训(踩过的弯路):**
- 中途看到"page2 有 230 行与 page1 整行重复",误判成"源头有重复、714 才对"——**错了**。一定要让用户**从北森源头导出文件**,代码直接数(openpyxl 整行去重),才能锤定源头到底多少条。本案源头 944 行零重复,证明确实丢数。
- 不要靠"导一次 Excel 数数"定根因——数据随时变。靠**结构化日志自报**(每页 返回/新增/累计 + total)判断。

**应对方案(已实现于 `beisen_client.py::get_grid_data`,commit 6aac25e):**
1. **pageSize 自适应降级**:从默认 1000 起,按 1000→500 探测,遇 400 自动降级取最大可用值。
2. **多轮重扫 + 整行去重**:一整轮翻完所有页并整行去重;未收齐 total 就再整轮重扫(最多 8 轮),直到收齐 total 或一整轮零新增。乱序分页下多轮能把随机漏行逐步捞全;仍不齐则打 ⚠ 告警。
3. 落库侧 `_dynamic_upsert` 仍按业务主键(`table_columns.is_pk_part`)去重——这层是对的,别动;真问题在拉取端没拿全。

**影响面**:所有 `beisen_report` 源类型的表(花名册/工资表/成本中心月度等)共用这套拉取逻辑,一并修复。以前其他表若也"行数对不上"应一并好转,建议核对。

日志监控:同步后看 `docker compose logs backend | grep beisen`,关注 `实拉(去重后)=N / total=N` 是否相等、有无 ⚠ 告警。详见 [[hr_portal_server_deploy]]。
