"""首次启动数据初始化

- 创建 admin 用户（密码取 ADMIN_INIT_PASSWORD）
- 注入全量菜单（三级结构：tab → 分组 → 叶子）
- 创建"超级管理员"角色 + 全菜单全操作权限
- 把 admin 绑到超级管理员

幂等：已存在时不重复创建；菜单结构变化时只新增不删除。
"""
import logging

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.core.config import settings
from app.datasources.models import DataSource
from app.data.models import RegisteredTable
from app.datasets.single_table import ensure_single_table_dataset
from app.tools.document_templates import DEFAULT_TEMPLATES
from app.tools.models import DocumentTemplate, DocumentTemplateBlock, DocumentTemplateVariable
from app.users.models import Menu, Role, RoleMenu, User, UserRole
try:
    from app.performance.seed import seed_performance_authorization_defaults
except ImportError:
    seed_performance_authorization_defaults = None  # type: ignore

logger = logging.getLogger("seed")


# ===== 菜单清单（三层结构）=====
# 一级（顶部 tab）→ 二级（左侧分组）→ 三级（左侧叶子，对应路由页面）
MENU_TREE: list[dict] = [
    # 一级 1：系统设置
    {
        "code": "system",
        "label": "系统设置",
        "icon": "Setting",
        "children": [
            # 二级 1.1：权限管理
            {
                "code": "system.auth",
                "label": "权限管理",
                "icon": "Lock",
                "children": [
                    {"code": "system.users", "label": "用户管理", "icon": "User"},
                    {"code": "system.roles", "label": "角色配置", "icon": "Avatar"},
                    {"code": "system.scopes", "label": "管理单元", "icon": "Connection"},
                    {"code": "system.field_categories", "label": "字段分类", "icon": "Stamp"},
                    {"code": "system.field_columns", "label": "字段管理", "icon": "Grid"},
                ],
            },
            # 二级 1.2：数据接入（仅保留非 UCP 的旧数据源配置）
            {
                "code": "system.datasource",
                "label": "数据接入",
                "icon": "Download",
                "children": [
                    {"code": "datasource.endpoints", "label": "接口配置", "icon": "Link"},
                    {"code": "datasource.sync_runs", "label": "同步历史", "icon": "Clock"},
                    {"code": "datasource.datasets", "label": "表间关联", "icon": "Share"},
                    {"code": "data.view", "label": "数据视图", "icon": "DataAnalysis"},
                ],
            },
            # 二级 1.3：参数配置
            {
                "code": "system.params",
                "label": "参数配置",
                "icon": "Operation",
                "children": [
                    {"code": "system.compensation_caps", "label": "补偿金规则维护", "icon": "Money"},
                    {"code": "system.document_templates", "label": "模板维护", "icon": "Document"},
                    {"code": "system.ai_config", "label": "AI 基础配置", "icon": "Cpu"},
                    {"code": "system.function_library", "label": "函数库管理", "icon": "Collection"},
                    {"code": "system.data_compare", "label": "数据对比", "icon": "DataAnalysis"},
                ],
            },
            # 二级 1.4：日志管理
            {
                "code": "system.logs",
                "label": "日志管理",
                "icon": "Tickets",
                "children": [
                    {"code": "system.logs.ai", "label": "AI 调用日志", "icon": "ChatDotRound"},
                    {"code": "system.logs.operation", "label": "操作日志", "icon": "List"},
                ],
            },
        ],
    },
    # 一级 2：数据连接（UCP — 通用数据连接平台，应用化预留）
    # 导航重构：16 项→7 项，取消二级分组，叶子直接挂 Tab 下；被合并的权限 code 仍保留在 DB 中
    {
        "code": "ucp",
        "label": "数据连接",
        "icon": "Connection",
        "children": [
            {"code": "ucp.systems", "label": "接入系统", "icon": "DataBoard"},
            {"code": "ucp.connector_catalog", "label": "接入类型管理", "icon": "Collection"},
            {"code": "ucp.pipelines", "label": "流程编排", "icon": "Share"},
            {"code": "ucp.executions", "label": "运行中心", "icon": "Clock"},
            {"code": "ucp.events", "label": "事件处理", "icon": "BellFilled"},
            {"code": "ucp.monitor", "label": "监控告警", "icon": "TrendCharts"},
            {"code": "ucp.scenarios", "label": "场景方案", "icon": "Connection"},
            {"code": "ucp.assets", "label": "资产治理", "icon": "FolderOpened"},
        ],
    },
    # 一级 3：数据仓库
    {
        "code": "warehouse",
        "label": "数据仓库",
        "icon": "DataBoard",
        "children": [
            {"code": "warehouse.assets", "label": "数据资产", "icon": "Folder"},
            {"code": "warehouse.cleaning", "label": "数据清洗", "icon": "Brush"},
            {"code": "warehouse.modeling", "label": "数据建模", "icon": "Edit"},
            {"code": "warehouse.metrics", "label": "指标管理", "icon": "TrendCharts"},
            {"code": "warehouse.service", "label": "数据服务", "icon": "Share"},
            {"code": "warehouse.governance", "label": "数据治理", "icon": "Checked"},
            {"code": "warehouse.impact", "label": "影响分析", "icon": "Connection"},
            {"code": "warehouse.automation", "label": "自动化配置", "icon": "SetUp"},
        ],
    },
    # 一级 4：报表管理
    {
        "code": "report",
        "label": "报表管理",
        "icon": "PieChart",
        "children": [
            {
                "code": "report.main",
                "label": "报表",
                "icon": "Document",
                "children": [
                    {"code": "report.list", "label": "报表管理", "icon": "Document"},
                ],
            },
        ],
    },
    # 一级 4：提效工具
    {
        "code": "tools",
        "label": "提效工具",
        "icon": "Tools",
        "children": [
            {
                "code": "tools.hr",
                "label": "HR 小工具",
                "icon": "Briefcase",
                "children": [
                    {"code": "tools.center", "label": "工具中心", "icon": "Grid"},
                    {"code": "tools.compensation_calc", "label": "补偿金计算", "icon": "Money"},
                    {"code": "employee.profile", "label": "员工基础信息查询", "icon": "User"},
                    {"code": "tools.income_certificate", "label": "证明开具", "icon": "Document"},
                    {"code": "tools.cost_allocation", "label": "成本分摊", "icon": "Histogram"},
                    {"code": "table_tools", "label": "表格归集", "icon": "Grid"},
                    {"code": "automation.rules", "label": "自动通知", "icon": "Notification"},
                ],
            },
        ],
    },
    # 一级 5：绩效管理（独立业务应用入口）
    {
        "code": "performance",
        "label": "绩效管理",
        "icon": "TrendCharts",
        "children": [
            {
                "code": "performance.access",
                "label": "应用入口",
                "icon": "Guide",
                "children": [
                    {"code": "performance.app", "label": "绩效管理入口", "icon": "DataBoard"},
                    {"code": "performance.admin", "label": "绩效后台设置", "icon": "Setting"},
                ],
            },
        ],
    },
    # 一级 6：成本分摊（已上线独立业务应用入口）
    {
        "code": "cost_allocation",
        "label": "成本分摊",
        "icon": "Histogram",
        "children": [
            {
                "code": "cost_allocation.access",
                "label": "应用入口",
                "icon": "Guide",
                "children": [
                    {"code": "cost_allocation.app", "label": "成本分摊系统入口", "icon": "Histogram"},
                    {"code": "cost_allocation.admin", "label": "成本分摊后台入口", "icon": "Setting"},
                ],
            },
        ],
    },
]


async def _ensure_menus(db: AsyncSession) -> dict[str, Menu]:
    """幂等地写入菜单。返回 code → Menu 的映射"""
    existing = (await db.execute(select(Menu))).scalars().all()
    by_code: dict[str, Menu] = {m.code: m for m in existing}

    order = 0
    async def add(node: dict, parent_id: int | None) -> None:
        nonlocal order
        if node["code"] not in by_code:
            m = Menu(
                code=node["code"],
                label=node["label"],
                parent_id=parent_id,
                display_order=order,
                icon=node.get("icon"),
            )
            db.add(m)
            await db.flush()
            by_code[node["code"]] = m
            logger.info("[seed] menu added: %s", node["code"])
        else:
            m = by_code[node["code"]]
            changed = False
            if m.display_order != order:
                m.display_order = order
                changed = True
            if m.parent_id != parent_id:
                m.parent_id = parent_id
                changed = True
            if m.label != node["label"]:
                m.label = node["label"]
                changed = True
            if m.icon != node.get("icon"):
                m.icon = node.get("icon")
                changed = True
            if changed:
                logger.info("[seed] menu updated: %s label=%s order=%d parent=%s", node["code"], node["label"], order, parent_id)
        order += 10
        for child in node.get("children", []):
            await add(child, by_code[node["code"]].id)

    for top in MENU_TREE:
        await add(top, None)

    # UCP 导航重构：将旧菜单 reparent 到 ucp Tab 下，前端通过白名单过滤可见项
    ucp = by_code.get("ucp")
    ucp_tree = next((t for t in MENU_TREE if t["code"] == "ucp"), None)
    if ucp and ucp_tree:
        ucp_new_codes = {c["code"] for c in ucp_tree["children"]}
        for m in by_code.values():
            if m.parent_id is not None or m.id == ucp.id:
                continue
            if m.code.startswith("ucp.") and m.code not in ucp_new_codes:
                m.parent_id = ucp.id
                logger.info("[seed] ucp nav: reparent %s → ucp", m.code)

    # 为已有 HR 小工具权限的角色补充表格归集查看权限，避免新增菜单后入口对旧角色不可见。
    hr_menu = by_code.get("tools.hr")
    table_tools_menu = by_code.get("table_tools")
    if hr_menu and table_tools_menu:
        hr_role_ids = (
            await db.execute(
                select(RoleMenu.role_id).where(
                    RoleMenu.menu_id == hr_menu.id,
                    RoleMenu.can_view.is_(True),
                )
            )
        ).scalars().all()
        existing_table_tools_roles = set(
            (
                await db.execute(
                    select(RoleMenu.role_id).where(RoleMenu.menu_id == table_tools_menu.id)
                )
            ).scalars().all()
        )
        for role_id in hr_role_ids:
            if role_id not in existing_table_tools_roles:
                db.add(
                    RoleMenu(
                        role_id=role_id,
                        menu_id=table_tools_menu.id,
                        scope_dimension="none",
                        can_view=True,
                        can_create=False,
                        can_update=False,
                        can_delete=False,
                        can_export=False,
                    )
                )

    await db.commit()
    return by_code
async def _ensure_super_role(db: AsyncSession, menus: dict[str, Menu]) -> Role:
    """超级管理员角色，全菜单全操作"""
    role = (
        await db.execute(select(Role).where(Role.name == "超级管理员"))
    ).scalar_one_or_none()
    if role is None:
        role = Role(name="超级管理员", description="拥有全部菜单与全部操作权限")
        db.add(role)
        await db.flush()
        logger.info("[seed] role 超级管理员 created")

    # 给所有菜单挂上 RoleMenu（包含中间分组节点）—— 操作权限四件套全开
    existing_links = {
        rm.menu_id
        for rm in (
            await db.execute(select(RoleMenu).where(RoleMenu.role_id == role.id))
        )
        .scalars()
        .all()
    }
    for menu in menus.values():
        if menu.id in existing_links:
            continue
        db.add(
            RoleMenu(
                role_id=role.id,
                menu_id=menu.id,
                scope_dimension="none",
                can_view=True,
                can_create=True,
                can_update=True,
                can_delete=True,
                can_export=True,
            )
        )
    await db.commit()
    return role


async def _ensure_admin_user(db: AsyncSession, super_role: Role) -> User:
    user = (
        await db.execute(select(User).where(User.login_name == "admin"))
    ).scalar_one_or_none()
    if user is None:
        user = User(
            login_name="admin",
            display_name="系统管理员",
            password_hash=hash_password(settings.ADMIN_INIT_PASSWORD),
            is_active=True,
        )
        db.add(user)
        await db.flush()
        logger.info("[seed] user admin created")

    # 确保绑定超级管理员角色
    bound = (
        await db.execute(
            select(UserRole).where(
                UserRole.user_id == user.id, UserRole.role_id == super_role.id
            )
        )
    ).first()
    if bound is None:
        db.add(UserRole(user_id=user.id, role_id=super_role.id))
        logger.info("[seed] admin → 超级管理员 bound")

    await db.commit()
    return user


async def run_seed(session_factory) -> None:
    """供 FastAPI 启动事件调用"""
    async with session_factory() as db:
        menus = await _ensure_menus(db)
        super_role = await _ensure_super_role(db, menus)
        await _ensure_admin_user(db, super_role)
        if seed_performance_authorization_defaults is not None:
            await seed_performance_authorization_defaults(db)
        await _ensure_datasources(db)
        await _ensure_datasource_jobs(db)
        await _ensure_ai_controlled_action_retention_job(db)
        await _ensure_ucp_event_maintenance_job(db)
        await _ensure_registered_tables(db)
        await _ensure_single_table_datasets(db)
        await _ensure_document_templates(db)
        await _ensure_formula_functions(db)
        await _ensure_pipeline_templates(db)
        await _ensure_cost_allocation_ingest(db)
        await _ensure_lifecycle_pipeline_triggers(db)
        await _ensure_ods_dwd_automation_rules(db)
        await _ensure_l4_cascade_rules(db)
        await _ensure_db_realtime_auto_rebuild_rules(db)
        logger.info("[seed] done")


# ===== 5 张数据表的初始 datasource 配置（无凭证，待管理员配置）=====


_DATASOURCES_INIT = [
    {
        "table_name": "emp_realtime_roster",
        "table_label": "员工实时花名册",
        "source_type": "beisen_report",
        "schedule": "每日 06:00",
    },
    {
        "table_name": "emp_monthly_roster",
        "table_label": "员工月度花名册",
        "source_type": "beisen_report",
        "schedule": "每月 1 日 06:00",
    },
    {
        "table_name": "emp_monthly_salary",
        "table_label": "员工月度工资表",
        "source_type": "beisen_report",
        "schedule": "每月 5 日 06:00",
    },
    {
        "table_name": "emp_monthly_allocation",
        "table_label": "员工月度成本分摊表",
        "source_type": "upload",
        "schedule": "手动触发",
    },
    {
        "table_name": "cost_center_monthly",
        "table_label": "成本中心月度维护表",
        "source_type": "beisen_report",
        "schedule": "每日 06:00",
    },
    {
        "table_name": "org_unit",
        "table_label": "组织单元",
        "source_type": "beisen_report",
        "schedule": "每日 06:00",
    },
    {
        "table_name": "emp_monthly_cost_result",
        "table_label": "员工月度成本分摊结果",
        "source_type": "internal",
        "schedule": "手动存档",
    },
]


async def _ensure_datasources(db: AsyncSession) -> None:
    existing_names = {
        n for (n,) in (await db.execute(select(DataSource.table_name))).all()
    }
    for cfg in _DATASOURCES_INIT:
        if cfg["table_name"] in existing_names:
            continue
        ds = DataSource(
            table_name=cfg["table_name"],
            table_label=cfg["table_label"],
            source_type=cfg["source_type"],
            schedule=cfg["schedule"],
            settings={},
            secrets_encrypted={},
            is_active=False,
            last_status="pending",
        )
        db.add(ds)
        logger.info("[seed] datasource added: %s", cfg["table_name"])
    await db.commit()


async def _ensure_datasource_jobs(db: AsyncSession) -> None:
    """为每个 datasource 幂等创建 scheduled_jobs 记录（kind=datasource_sync）

    已有的 job 不会被强制覆盖（保留用户后续在前端的 schedule 修改）。
    """
    from app.scheduler.service import get_job_by_business, upsert_job

    dss = (await db.execute(select(DataSource))).scalars().all()
    for ds in dss:
        existing = await get_job_by_business(db, "datasource_sync", ds.id)
        if existing is not None:
            continue
        await upsert_job(
            db,
            kind="datasource_sync",
            business_id=ds.id,
            cron=ds.schedule or "手动触发",
            payload={"table_name": ds.table_name},
            enabled=ds.is_active,
        )
        logger.info("[seed] scheduled_job for ds %d (%s) created", ds.id, ds.table_name)
    await db.commit()


async def _ensure_ai_controlled_action_retention_job(db: AsyncSession) -> None:
    """Create the platform-owned daily cleanup job without exposing business payloads."""
    from app.scheduler.service import upsert_job

    await upsert_job(
        db,
        kind="ai_controlled_action_retention",
        business_id=0,
        cron="30 3 * * *",
        payload={},
        enabled=True,
    )
    await db.commit()


async def _ensure_ucp_event_maintenance_job(db: AsyncSession) -> None:
    """Create the platform-owned UCP recovery job."""
    from app.scheduler.service import get_job_by_business, upsert_job

    if await get_job_by_business(db, "ucp_event_maintenance", 0) is None:
        await upsert_job(db, kind="ucp_event_maintenance", business_id=0, cron="*/1 * * * *", payload={}, enabled=True)
        await db.commit()


# ===== 内置表注册（幂等写入 registered_tables）=====

_BUILTIN_TABLES = [
    {"table_name": "emp_realtime_roster",     "table_label": "员工实时花名册",        "icon": "List",           "display_order": 10,  "is_period": False, "scope_strategy": "person_first"},
    {"table_name": "emp_monthly_roster",      "table_label": "员工月度花名册",        "icon": "Calendar",       "display_order": 20,  "is_period": True,  "period_col": "month", "period_source": "inject", "scope_strategy": "person_first"},
    {"table_name": "emp_monthly_salary",      "table_label": "员工月度工资表",        "icon": "Money",          "display_order": 30,  "is_period": True,  "period_col": "pay_month", "period_source": "field", "roster_join_col": "employee_no", "scope_strategy": "person_first"},
    {"table_name": "emp_monthly_allocation",  "table_label": "员工月度成本分摊表",    "icon": "Histogram",      "display_order": 40,  "is_period": True,  "period_col": "cost_period", "period_source": "field", "roster_join_col": "employee_no", "scope_strategy": "cc_first"},
    {"table_name": "cost_center_monthly",     "table_label": "成本中心月度维护表",    "icon": "OfficeBuilding", "display_order": 50,  "is_period": True,  "period_col": "month", "period_source": "inject", "scope_strategy": "cc_first"},
    {"table_name": "org_unit",                "table_label": "组织单元",              "icon": "Share",          "display_order": 55,  "is_period": False, "scope_strategy": "cross_filter"},
    {"table_name": "emp_monthly_cost_class",  "table_label": "员工月度成本归集分类表","icon": "Collection",     "display_order": 60,  "is_period": False, "scope_strategy": "cc_first"},
    {"table_name": "emp_monthly_cost_result", "table_label": "员工月度成本分摊结果",  "icon": "TrendCharts",    "display_order": 70,  "is_period": True,  "period_col": "month", "period_source": "inject", "is_result_table": True, "scope_strategy": "cc_first"},
]


async def _ensure_registered_tables(db: AsyncSession) -> None:
    existing_rows = (await db.execute(select(RegisteredTable))).scalars().all()
    existing_by_name = {r.table_name: r for r in existing_rows}
    for cfg in _BUILTIN_TABLES:
        existing = existing_by_name.get(cfg["table_name"])
        if existing is not None:
            existing.table_label = cfg["table_label"]
            existing.is_period = cfg.get("is_period", False)
            existing.period_col = cfg.get("period_col", "month")
            existing.period_source = cfg.get("period_source", "field")
            existing.is_builtin = True
            existing.is_result_table = cfg.get("is_result_table", False)
            existing.icon = cfg.get("icon", "Grid")
            existing.display_order = cfg.get("display_order", 999)
            existing.roster_join_col = cfg.get("roster_join_col")
            existing.scope_strategy = cfg.get("scope_strategy", "cross_filter")
            continue
        rt = RegisteredTable(
            table_name=cfg["table_name"],
            table_label=cfg["table_label"],
            description=None,
            is_period=cfg.get("is_period", False),
            period_col=cfg.get("period_col", "month"),
            period_source=cfg.get("period_source", "field"),
            is_builtin=True,
            is_result_table=cfg.get("is_result_table", False),
            icon=cfg.get("icon", "Grid"),
            display_order=cfg.get("display_order", 999),
            roster_join_col=cfg.get("roster_join_col"),
            scope_strategy=cfg.get("scope_strategy", "cross_filter"),
        )
        db.add(rt)
        logger.info("[seed] registered_table added: %s", cfg["table_name"])
    await db.commit()
    await _ensure_scope_role_defaults(db)


async def _ensure_scope_role_defaults(db: AsyncSession) -> None:
    """补齐阶段 4 依赖的内置表权限列声明。"""
    from app.data.models import TableColumn

    row = (
        await db.execute(
            select(TableColumn).where(
                TableColumn.table_name == "emp_monthly_allocation",
                TableColumn.column_code == "code",
            )
        )
    ).scalar_one_or_none()
    if row is not None and not row.scope_role:
        row.scope_role = "cc_code"
        await db.commit()


async def _ensure_single_table_datasets(db: AsyncSession) -> None:
    rows = (
        await db.execute(select(RegisteredTable).order_by(RegisteredTable.display_order, RegisteredTable.id))
    ).scalars().all()
    for row in rows:
        try:
            ds = await ensure_single_table_dataset(
                row.table_name,
                db,
                created_by=None,
                table_label=row.table_label,
            )
        except ValueError:
            continue
        if ds.scope_strategy is None:
            ds.scope_strategy = row.scope_strategy
    await db.commit()


async def _ensure_document_templates(db: AsyncSession) -> None:
    existing_codes = {
        code for (code,) in (await db.execute(select(DocumentTemplate.code))).all()
    }
    for cfg in DEFAULT_TEMPLATES:
        if cfg["code"] in existing_codes:
            continue
        tpl = DocumentTemplate(
            code=cfg["code"],
            name=cfg["name"],
            business_type=cfg["business_type"],
            description=cfg.get("description"),
            is_active=True,
            version=cfg.get("version", "1.0"),
            layout_config={},
        )
        db.add(tpl)
        await db.flush()
        for block in cfg.get("blocks", []):
            db.add(
                DocumentTemplateBlock(
                    template_id=tpl.id,
                    block_type=block["block_type"],
                    content=block["content"],
                    display_order=block.get("display_order", 10),
                    style_config=block.get("style_config") or {},
                )
            )
        for variable in cfg.get("variables", []):
            db.add(
                DocumentTemplateVariable(
                    template_id=tpl.id,
                    variable_code=variable["variable_code"],
                    variable_name=variable["variable_name"],
                    source_type=variable.get("source_type", "manual"),
                    source_key=variable.get("source_key"),
                    default_value=variable.get("default_value"),
                    required=variable.get("required", False),
                    formatter=variable.get("formatter"),
                )
            )
        logger.info("[seed] document_template added: %s", cfg["code"])
    await db.commit()


async def _ensure_formula_functions(db: AsyncSession) -> None:
    from app.ai_formula.models import FormulaFunction

    defaults = [
        {
            "code": "CALC_TAX",
            "name": "个税试算",
            "description": "按内置个税速算逻辑根据输入金额试算个人所得税。",
            "function_type": "system_builtin",
            "parameters": [{"name": "amount", "type": "number", "description": "税前金额"}],
            "return_type": "number",
            "is_sensitive_output": True,
        },
        {
            "code": "SAFE_DIVIDE",
            "name": "安全除法",
            "description": "除数为 0 或空时返回默认值。",
            "function_type": "system_builtin",
            "parameters": [
                {"name": "a", "type": "number"},
                {"name": "b", "type": "number"},
                {"name": "default", "type": "number"},
            ],
            "return_type": "number",
            "is_sensitive_output": False,
        },
    ]
    existing = {code for (code,) in (await db.execute(select(FormulaFunction.code))).all()}
    for cfg in defaults:
        if cfg["code"] in existing:
            continue
        db.add(
            FormulaFunction(
                code=cfg["code"],
                name=cfg["name"],
                description=cfg["description"],
                function_type=cfg["function_type"],
                parameters=cfg["parameters"],
                return_type=cfg["return_type"],
                formula_body=None,
                is_enabled=True,
                is_sensitive_output=cfg["is_sensitive_output"],
            )
        )
        logger.info("[seed] formula function added: %s", cfg["code"])
    await db.commit()


async def _ensure_pipeline_templates(db: AsyncSession) -> None:
    """幂等创建 Phase 4 预置流水线模板：入职账号创建、离职账号停用"""
    from app.ucp.models import UcpPipelineTemplate as PT
    from app.ucp.pipeline_node_catalog import normalize_node_display

    existing_codes = {
        code for (code,) in (await db.execute(select(PT.template_code))).all()
    }

    templates = [
        {
            "template_code": "TPL_ONBOARDING_ACCOUNT",
            "name": "入职账号创建",
            "description": "HR 入职事件触发 → 为员工创建滴滴/曹操等外部系统账号",
            "nodes": [
                {"id": "create_didi", "type": "CONNECTOR", "x": 350, "y": 80, "label": "创建滴滴账号",
                 "config": {"adapter_code": "didi_account_push_adapter", "action": "CREATE"}},
                {"id": "create_caocao", "type": "CONNECTOR", "x": 350, "y": 200, "label": "创建曹操账号",
                 "config": {"adapter_code": "caocao_account_push_adapter", "action": "CREATE"}},
                {"id": "notify", "type": "NOTIFY", "x": 600, "y": 140, "label": "通知 HR",
                 "config": {"template_code": "TPL_ONBOARDING_DONE", "receivers": ["hr_admin"]}},
            ],
            "edges": [
                {"from": "create_didi", "to": "notify"},
                {"from": "create_caocao", "to": "notify"},
            ],
        },
        {
            "template_code": "TPL_OFFBOARDING_ACCOUNT",
            "name": "离职账号停用",
            "description": "离职事件触发 → 生效时间策略 → 审批 → 停用/删除外部系统账号",
            "nodes": [
                {"id": "effective_time", "type": "TIME_STRATEGY", "x": 100, "y": 120, "label": "离职生效时间策略",
                 "config": {"strategy": "LIFECYCLE_RULE", "effective_time_field": "termination_effective_at"}},
                {"id": "approval", "type": "APPROVAL", "x": 350, "y": 120, "label": "审批确认",
                 "config": {"approvers": [], "approval_mode": "SINGLE", "reason": "离职账号停用需审批",
                  "action_summary": "停用离职员工外部账号"}},
                {"id": "disable_didi", "type": "CONNECTOR", "x": 600, "y": 80, "label": "停用滴滴账号",
                 "config": {"adapter_code": "didi_account_push_adapter", "action": "DISABLE"}},
                {"id": "disable_caocao", "type": "CONNECTOR", "x": 600, "y": 200, "label": "停用曹操账号",
                 "config": {"adapter_code": "caocao_account_push_adapter", "action": "DISABLE"}},
                {"id": "notify", "type": "NOTIFY", "x": 850, "y": 140, "label": "通知 HR",
                 "config": {"template_code": "TPL_OFFBOARDING_DONE", "receivers": ["hr_admin"]}},
            ],
            "edges": [
                {"from": "effective_time", "to": "approval"},
                {"from": "approval", "to": "disable_didi"},
                {"from": "approval", "to": "disable_caocao"},
                {"from": "disable_didi", "to": "notify"},
                {"from": "disable_caocao", "to": "notify"},
            ],
        },
    ]

    from app.ucp.x0210_template import PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE
    if PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE["template_code"] not in existing_codes:
        templates.append(PENDING_HIRE_OFFER_ENRICHMENT_TEMPLATE)

    for tpl in templates:
        if tpl["template_code"] in existing_codes:
            continue
        nodes = [dict(node) for node in tpl["nodes"]]
        edges = [dict(edge) for edge in tpl["edges"]]
        if not any(node.get("type") == "START_TRIGGER" for node in nodes):
            inbound_node_ids = {edge.get("to") for edge in edges}
            root_node_ids = [
                node["id"] for node in nodes if node.get("id") not in inbound_node_ids
            ]
            nodes.insert(0, {
                "id": "start_trigger",
                "type": "START_TRIGGER",
                "x": 0,
                "y": 120,
                "label": "Trigger start",
                "config": {
                    "mode": "OR",
                    "trigger_types": ["WEBHOOK", "SCHEDULE", "MANUAL", "PLATFORM_EVENT"],
                    "management_path": "/ucp/events/triggers",
                },
            })
            edges = [
                {"from": "start_trigger", "to": node_id}
                for node_id in root_node_ids
            ] + edges
        for node in nodes:
            node["label"], node["config"] = normalize_node_display(
                node["type"],
                str(node.get("label") or ""),
                dict(node.get("config") or {}),
            )
        db.add(PT(
            template_code=tpl["template_code"],
            name=tpl["name"],
            description=tpl.get("description"),
            nodes_json=nodes,
            edges_json=edges,
            version=tpl.get("version", "1.0.0"),
            created_by="seed",
        ))
        logger.info("[seed] pipeline template added: %s", tpl["template_code"])


def _lifecycle_pipeline_trigger_defaults() -> list[dict]:
    return [
        {
            "trigger_code": "OFFBOARDING_MANUAL_COMPENSATION",
            "trigger_name": "Offboarding manual compensation",
            "pipeline_code": "TPL_OFFBOARDING_ACCOUNT",
            "trigger_type": "MANUAL",
            "schedule_config": {},
        },
    ]


async def _ensure_cost_allocation_ingest(db: AsyncSession) -> None:
    """Seed the non-secret cost-allocation webhook contract in a disabled state."""
    from app.ucp.config_service import upsert_pipeline
    from app.ucp.models import UcpEventDefinition, UcpEventTrigger, UcpPipelineConfig, UcpResource, UcpResourceDataObject, UcpSystem

    system = await db.scalar(select(UcpSystem).where(UcpSystem.system_code == "COST_ALLOCATION_SYSTEM"))
    if system is None:
        system = UcpSystem(system_code="COST_ALLOCATION_SYSTEM", system_name="成本分摊系统", system_type="CUSTOM", description="成本分摊系统 Webhook 事件接入", is_active=1, created_by="seed")
        db.add(system)
        await db.flush()
    resource = await db.scalar(select(UcpResource).where(UcpResource.system_id == system.id, UcpResource.resource_code == "cost-allocation-locked"))
    if resource is None:
        resource = UcpResource(
            system_id=system.id, resource_code="cost-allocation-locked", resource_name="成本分摊系统 Webhook",
            connector_type="webhook_ingress", protocol={"ingress": {
                "verification_strategy": "HMAC_SHA256_TIMESTAMPED", "signature_header": "X-Signature",
                "timestamp_header": "X-Timestamp", "nonce_header": "X-Nonce", "request_id_header": "X-Request-Id",
                "integration_id_header": "X-Integration-Id", "integration_id": "cost_allocation_system",
                "max_timestamp_diff_seconds": 300, "max_body_bytes": 1048576, "rate_limit_per_minute": 120,
                "rate_limit_burst": 10, "event_type_path": "event_type", "event_id_path": "request_id",
                "batch_id_path": "batch_id", "payload_path": ""
            }}, status=0, test_status="NOT_TESTED", created_by="seed"
        )
        db.add(resource)
        await db.flush()
    else:
        resource.resource_name = "成本分摊系统 Webhook"
        resource.connector_type = "webhook_ingress"
    definition = await db.scalar(select(UcpEventDefinition).where(UcpEventDefinition.event_code == "allocation_period.locked", UcpEventDefinition.version == "1.0.0"))
    if definition is None:
        definition = UcpEventDefinition(event_code="allocation_period.locked", event_name="周期锁定", source_system_type="COST_ALLOCATION_SYSTEM", payload_schema={"required": ["event_type", "request_id", "batch_id", "period", "records"]}, verification_strategy="HMAC_SHA256_TIMESTAMPED", version="1.0.0", status="PUBLISHED")
        db.add(definition)
        await db.flush()
    else:
        definition.event_name = "周期锁定"
    event_object = await db.scalar(select(UcpResourceDataObject).where(UcpResourceDataObject.resource_id == resource.id, UcpResourceDataObject.object_code == "ALLOCATION_PERIOD_LOCKED"))
    if event_object is None:
        event_object = UcpResourceDataObject(resource_id=resource.id, connector_type="webhook_ingress", object_code="ALLOCATION_PERIOD_LOCKED", object_name="周期锁定", object_type="EVENT_TYPE", event_definition_id=definition.id, event_config={}, verification_status="PENDING_CREDENTIAL", is_active=1, created_by="seed")
        db.add(event_object)
        await db.flush()
    else:
        event_object.object_name = "周期锁定"
    steps = [{"id": "warehouse_sink", "type": "WAREHOUSE_ASSET_SINK", "input_key": "${event.records}", "event_fields": ["period"], "target_asset": "emp_monthly_allocation", "write_mode": "period_full_snapshot", "period_field": "cost_period", "field_whitelist": ["cost_period", "employee_no", "employee", "code", "dimension_value", "headcount"], "mapping": [{"source": "period", "target": "cost_period", "transform": "yyyy_mm_to_yyyymm", "required": True}, {"source": "employee_no", "target": "employee_no", "transform": "string", "required": True}, {"source": "employee_name", "target": "employee", "required": True}, {"source": "project_code", "target": "code", "required": True}, {"source": "project_name", "target": "dimension_value", "required": True}, {"source": "allocation_percentage", "target": "headcount", "transform": "decimal_divide_100", "required": True, "minimum": 0, "maximum": 1}], "validations": [{"type": "group_sum_equals", "group_by": ["cost_period", "employee_no"], "sum_field": "headcount", "expected": 1, "tolerance": 0.0001}]}]
    pipeline = await db.scalar(select(UcpPipelineConfig).where(UcpPipelineConfig.pipeline_code == "COST_ALLOCATION_LOCKED_INGEST"))
    if pipeline is None:
        await upsert_pipeline(db, "COST_ALLOCATION_LOCKED_INGEST", "成本分摊锁定数据入仓", steps, trigger_type="EVENT", trigger_config={"event_type": "allocation_period.locked"}, description="待绑定凭证并验证后启用", created_by="seed")
    trigger = await db.scalar(select(UcpEventTrigger).where(UcpEventTrigger.trigger_code == "COST_ALLOCATION_LOCKED_TRIGGER"))
    if trigger is None:
        trigger = UcpEventTrigger(trigger_code="COST_ALLOCATION_LOCKED_TRIGGER", trigger_name="成本分摊锁定入仓", event_source="WEBHOOK", event_types="allocation_period.locked", pipeline_code="COST_ALLOCATION_LOCKED_INGEST", source_resource_id=resource.id, source_resource_object_id=event_object.id, trigger_type="WEBHOOK", schedule_config={}, input_schema={}, filter_rule={}, failure_policy="RETRY", is_active=1, migration_status="ACTIVE", created_by="seed")
        db.add(trigger)
    else:
        trigger.trigger_name = "成本分摊锁定入仓"
        trigger.event_source = "WEBHOOK"
        trigger.event_types = "allocation_period.locked"
        trigger.pipeline_code = "COST_ALLOCATION_LOCKED_INGEST"
        trigger.source_resource_id = resource.id
        trigger.source_resource_object_id = event_object.id
        trigger.trigger_type = "WEBHOOK"
        trigger.failure_policy = "RETRY"
        trigger.is_active = 1
        trigger.migration_status = "ACTIVE"
    await db.execute(update(UcpEventTrigger).where(UcpEventTrigger.trigger_code == "COST_ALLOCATION_LOCKED_INGEST").values(is_active=0, migration_status="DISABLED"))
    logger.info("[seed] cost allocation webhook contract ready; bind credential and verify before enabling")


async def _ensure_lifecycle_pipeline_triggers(db: AsyncSession) -> None:
    """Create safe lifecycle entry points after their templates exist.

    Webhook triggers deliberately are not seeded because they must bind a verified
    event object belonging to a tenant's actual ingress resource.
    """
    from app.ucp.models import UcpEventTrigger

    existing_codes = {
        code for (code,) in (await db.execute(select(UcpEventTrigger.trigger_code))).all()
    }
    for config in _lifecycle_pipeline_trigger_defaults():
        if config["trigger_code"] in existing_codes:
            continue
        trigger = UcpEventTrigger(
            trigger_code=config["trigger_code"],
            trigger_name=config["trigger_name"],
            event_source="UCP",
            event_types="",
            pipeline_code=config["pipeline_code"],
            trigger_type=config["trigger_type"],
            schedule_config=config["schedule_config"],
            input_schema={},
            filter_rule={},
            failure_policy="RETRY",
            run_as_type="SERVICE_ACCOUNT",
            is_active=int(config.get("is_active", True)),
            migration_status="ACTIVE",
            created_by="seed",
        )
        db.add(trigger)
        logger.info("[seed] lifecycle pipeline trigger added: %s", config["trigger_code"])


async def _ensure_ods_dwd_automation_rules(db: AsyncSession) -> None:
    """确保 ODS→DWD 自动化的系统级自动化规则存在。"""
    from app.automation.models import AutomationRule

    triggers = [
        "datasource_sync_completed",
        "ods_table_data_changed",
        "ods_table_metadata_changed",
        "standardization_rule_changed",
        "ods_dwd_automation_config_changed",
    ]
    existing = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.trigger_type.in_(triggers),
                AutomationRule.source == "system",
            )
        )
    ).scalars().all()
    existing_types = {r.trigger_type for r in existing}

    for tt in triggers:
        if tt in existing_types:
            continue
        rule = AutomationRule(
            name=f"ODS→DWD 自动标准化 — {tt}",
            description="系统自动创建：ODS 数据变更后触发 DWD 标准化",
            trigger_type=tt,
            trigger_config={},
            condition_config=[],
            actions_config=[{"type": "trigger_dwd_standardization", "config": {}}],
            enabled=True,
            source="system",
        )
        db.add(rule)
        logger.info("[seed] ods-dwd automation rule added: %s", tt)

    await db.commit()


async def _ensure_l4_cascade_rules(db: AsyncSession) -> None:
    """确保 L4 全自动级联的系统级自动化规则存在。"""
    from app.automation.models import AutomationRule

    l4_triggers = [
        "metric_saved",
        "dwd_data_refreshed",
        "dwd_schema_changed",
        "dwd_metadata_changed",
        "datasource_sync_completed",
        "ods_table_metadata_changed",
        "standardization_rule_changed",
        "ods_dwd_automation_config_changed",
    ]
    existing = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.trigger_type.in_(l4_triggers),
                AutomationRule.source == "system",
            )
        )
    ).scalars().all()
    existing_types = {r.trigger_type for r in existing}

    for tt in l4_triggers:
        if tt in existing_types:
            continue
        rule = AutomationRule(
            name=f"L4 全自动级联 — {tt}",
            description="系统自动创建：事件触发 L4 全自动级联检查",
            trigger_type=tt,
            trigger_config={},
            condition_config=[],
            actions_config=[{"type": "l4_cascade_execute", "config": {}}],
            enabled=False,  # Z03 红线：L4 默认禁用，仅审批通过的低风险指标可开放
            source="system",
        )
        db.add(rule)
        logger.info("[seed] l4 cascade rule added: %s", tt)

    await db.commit()


async def _ensure_db_realtime_auto_rebuild_rules(db: AsyncSession) -> None:
    """确保 DWD 刷新后自动重建 db_realtime 视图的系统级自动化规则存在。
    
    通过 _rule_version 跟踪规则配置版本，种子升级时自动更新旧版规则。
    """
    from app.automation.models import AutomationRule

    trigger_type = "dwd_data_refreshed"
    rule_name = "DWD刷新后自动重建实时数据库视图"
    RULE_VERSION = 1

    existing = (
        await db.execute(
            select(AutomationRule).where(
                AutomationRule.trigger_type == trigger_type,
                AutomationRule.name == rule_name,
                AutomationRule.source == "system",
            )
        )
    ).scalar_one_or_none()

    if existing is not None:
        stored_version = (existing.trigger_config or {}).get("_rule_version", 0)
        if stored_version >= RULE_VERSION:
            return
        # 规则版本过旧，更新配置
        existing.trigger_config = {**(existing.trigger_config or {}), "_rule_version": RULE_VERSION}
        existing.description = (
            "系统自动创建：DWD 数据刷新后，自动检测并重建关联的 db_realtime 视图，"
            "使 FineBI 无需手动操作即可获取新增字段"
        )
        existing.actions_config = [{"type": "auto_rebuild_db_realtime_views", "config": {}}]
        logger.info(
            "[seed] db_realtime auto-rebuild rule updated: %s v%d → v%d",
            trigger_type, stored_version, RULE_VERSION,
        )
        return

    rule = AutomationRule(
        name=rule_name,
        description="系统自动创建：DWD 数据刷新后，自动检测并重建关联的 db_realtime 视图，使 FineBI 无需手动操作即可获取新增字段",
        trigger_type=trigger_type,
        trigger_config={"_rule_version": RULE_VERSION},
        condition_config=[],
        actions_config=[{"type": "auto_rebuild_db_realtime_views", "config": {}}],
        enabled=True,
        source="system",
    )
    db.add(rule)
    logger.info("[seed] db_realtime auto-rebuild rule added: %s v%d", trigger_type, RULE_VERSION)
    # NOTE: 不在 seed 函数内部 commit，由 seed 调用方统一管理事务边界。
    # 如果此处提前 commit 而后续 seed 步骤失败回滚，会出现部分提交。
