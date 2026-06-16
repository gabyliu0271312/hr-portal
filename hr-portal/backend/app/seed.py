"""首次启动数据初始化

- 创建 admin 用户（密码取 ADMIN_INIT_PASSWORD）
- 注入全量菜单（三级结构：tab → 分组 → 叶子）
- 创建"超级管理员"角色 + 全菜单全操作权限
- 把 admin 绑到超级管理员

幂等：已存在时不重复创建；菜单结构变化时只新增不删除。
"""
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.password import hash_password
from app.core.config import settings
from app.datasources.models import DataSource
from app.data.models import RegisteredTable
from app.datasets.single_table import ensure_single_table_dataset
from app.tools.document_templates import DEFAULT_TEMPLATES
from app.tools.models import DocumentTemplate, DocumentTemplateBlock, DocumentTemplateVariable
from app.users.models import Menu, Role, RoleMenu, User, UserRole

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
                    {"code": "system.global_fields", "label": "全局字段字典", "icon": "Collection"},
                    {"code": "system.field_columns", "label": "字段管理", "icon": "Grid"},
                ],
            },
            # 二级 1.2：数据接入
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
                ],
            },
            # 二级 1.4：日志管理
            {
                "code": "system.logs",
                "label": "日志管理",
                "icon": "Tickets",
                "children": [
                    {"code": "system.logs.ai", "label": "AI 调用日志", "icon": "ChatDotRound"},
                ],
            },
        ],
    },
    # 一级 2：报表管理
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
    # 一级 3：提效工具
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
                    {"code": "tools.income_certificate", "label": "证明开具", "icon": "Document"},
                    {"code": "tools.cost_allocation", "label": "成本分摊", "icon": "Histogram"},
                ],
            },
        ],
    },
    # 一级 4：绩效管理（独立业务应用入口）
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
    # 一级 5：成本分摊（已上线独立业务应用入口）
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
            if m.display_order != order:
                m.display_order = order
                logger.info("[seed] menu order updated: %s → %d", node["code"], order)
        order += 10
        for child in node.get("children", []):
            await add(child, by_code[node["code"]].id)

    for top in MENU_TREE:
        await add(top, None)

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
        await _ensure_datasources(db)
        await _ensure_datasource_jobs(db)
        await _ensure_registered_tables(db)
        await _ensure_single_table_datasets(db)
        await _ensure_document_templates(db)
        await _ensure_formula_functions(db)
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


# ===== 内置表注册（幂等写入 registered_tables）=====

_BUILTIN_TABLES = [
    {"table_name": "emp_realtime_roster",     "table_label": "员工实时花名册",        "icon": "List",           "display_order": 10,  "is_period": False},
    {"table_name": "emp_monthly_roster",      "table_label": "员工月度花名册",        "icon": "Calendar",       "display_order": 20,  "is_period": True,  "period_col": "month", "period_source": "field"},
    {"table_name": "emp_monthly_salary",      "table_label": "员工月度工资表",        "icon": "Money",          "display_order": 30,  "is_period": True,  "period_col": "month", "period_source": "field"},
    {"table_name": "emp_monthly_allocation",  "table_label": "员工月度成本分摊表",    "icon": "Histogram",      "display_order": 40,  "is_period": True,  "period_col": "cost_period", "period_source": "field"},
    {"table_name": "cost_center_monthly",     "table_label": "成本中心月度维护表",    "icon": "OfficeBuilding", "display_order": 50,  "is_period": True,  "period_col": "month", "period_source": "inject"},
    {"table_name": "emp_monthly_cost_class",  "table_label": "员工月度成本归集分类表","icon": "Collection",     "display_order": 60,  "is_period": False},
    {"table_name": "emp_monthly_cost_result", "table_label": "员工月度成本分摊结果",  "icon": "TrendCharts",    "display_order": 70,  "is_period": True,  "period_col": "month", "period_source": "inject", "is_result_table": True},
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
        )
        db.add(rt)
        logger.info("[seed] registered_table added: %s", cfg["table_name"])
    await db.commit()


async def _ensure_single_table_datasets(db: AsyncSession) -> None:
    rows = (
        await db.execute(select(RegisteredTable).order_by(RegisteredTable.display_order, RegisteredTable.id))
    ).scalars().all()
    for row in rows:
        try:
            await ensure_single_table_dataset(
                row.table_name,
                db,
                created_by=None,
                table_label=row.table_label,
            )
        except ValueError:
            continue
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
