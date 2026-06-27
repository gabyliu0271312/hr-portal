"""飞书通知标准 Schema

ReceiverRule 协议：
  - fixed_users:               指定系统用户列表
  - fixed_chats:               指定飞书群列表
  - employee_field_user:       员工字段对应人员（从花名册字段取人）
  - employee_department_manager: 员工所在部门负责人

NotificationConfig：前端配置组件产出的标准配置格式，业务模块保存并在触发通知时传入后端。
NotificationContext：业务模块在触发通知时传入的上下文，用于接收人解析和模板渲染。
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ===== ReceiverRule =====

class FixedUsersRule(BaseModel):
    type: Literal["fixed_users"]
    user_ids: list[int] = Field(default_factory=list, description="系统用户 ID 列表")


class FixedChatsRule(BaseModel):
    type: Literal["fixed_chats"]
    chat_ids: list[str] = Field(default_factory=list, description="飞书群 chat_id 列表")


class EmployeeFieldUserRule(BaseModel):
    type: Literal["employee_field_user"]
    source_table: str = Field("emp_realtime_roster", description="来源表，第一期固定为 emp_realtime_roster")
    employee_key_field: str = Field("employee_no", description="员工主键字段，第一期固定为 employee_no")
    target_field: str = Field(description="目标字段，如 direct_supervisor、hrbp")
    resolve_mode: Literal["user_mapping"] = "user_mapping"


class EmployeeDepartmentManagerRule(BaseModel):
    type: Literal["employee_department_manager"]
    source_table: str = Field("emp_realtime_roster", description="来源表")
    employee_key_field: str = Field("employee_no", description="员工主键字段")
    department_field: str = Field(description="部门字段，如 department, department_2 ... department_5")
    manager_source: Literal["org_tree"] = "org_tree"


ReceiverRule = FixedUsersRule | FixedChatsRule | EmployeeFieldUserRule | EmployeeDepartmentManagerRule


# ===== Resource 资源链接 =====

class ResourceLink(BaseModel):
    type: Literal["system_page", "feishu_doc", "external_url"] = "system_page"
    title: str = Field(description="链接显示文字")
    url_template: str = Field(description="URL 模板，支持 {{变量}} 插值")


# ===== 消息配置 =====

class MessageConfig(BaseModel):
    message_format: Literal["text", "markdown"] = "markdown"
    title_template: str = Field("", description="标题模板，支持 {{变量}}")
    content_template: str = Field(description="正文模板，支持 {{变量}}")
    resources: list[ResourceLink] = Field(default_factory=list, description="资源链接列表")


# ===== NotificationConfig =====

class CardButtonConfig(BaseModel):
    """自定义卡片按钮配置：用户点击后跳转至指定页面"""
    enabled: bool = Field(default=False, description="是否启用卡片跳转按钮")
    text: str = Field(default="查看详情", description="按钮显示文案")
    url: str = Field(default="", description="跳转链接，支持 {{变量}} 插值")


class NotificationConfig(BaseModel):
    enabled: bool = True
    receivers: list[ReceiverRule] = Field(default_factory=list)
    message: MessageConfig
    require_completion: bool = Field(
        default=False,
        description=(
            "是否需要收件人标记完成。开启后消息会附带'标记完成'互动按钮，"
            "已完成的人在下次发送同 biz_type+biz_id 通知时会被过滤。"
            "私聊：按钮按人禁用；群聊：显示进度条+已完成名单。"
        ),
    )
    card_button: CardButtonConfig = Field(
        default_factory=CardButtonConfig,
        description=(
            "卡片跳转按钮配置。开启后消息以飞书交互式卡片形式发送，"
            "底部附带可点击的跳转按钮（与标记完成独立，可同时使用）。"
        ),
    )


# ===== NotificationContext =====

class NotificationContext(BaseModel):
    """业务模块传入的通知上下文，用于接收人解析和模板变量替换。"""
    model_config = {"extra": "allow"}

    employee_no: str | None = None
    # 其他字段由业务模块动态传入（extra="allow"）


# ===== 解析结果 =====

class ResolvedReceiver(BaseModel):
    receiver_type: Literal["user", "chat"]
    receiver_id: str  # 飞书 open_id（user） 或 chat_id（chat）
    display_name: str
    source: str  # 来源描述，如 "fixed_users" / "employee_field_user:direct_supervisor"


class ResolveError(BaseModel):
    rule_type: str
    message: str


class ResolveResult(BaseModel):
    ok: bool
    receivers: list[ResolvedReceiver] = Field(default_factory=list)
    errors: list[ResolveError] = Field(default_factory=list)


# ===== 消息预览 =====

class MessagePreviewRequest(BaseModel):
    message: MessageConfig
    context: dict[str, Any] = Field(default_factory=dict)
    require_completion: bool = Field(
        default=False,
        description="是否开启标记完成，预览时会在消息底部显示「标记完成」按钮",
    )


class MessagePreviewResponse(BaseModel):
    rendered_title: str
    rendered_content: str
    rendered_resources: list[ResourceLink] = Field(default_factory=list)
    missing_variables: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)


# ===== 发送请求/响应 =====

class NotificationResolveRequest(BaseModel):
    config: NotificationConfig
    context: dict[str, Any] = Field(default_factory=dict, description="通知上下文")


class NotificationTestRequest(BaseModel):
    config: NotificationConfig
    context: dict[str, Any] = Field(default_factory=dict)


class NotificationSendRequest(BaseModel):
    biz_type: str = Field(description="业务类型，如 report、cost_allocation")
    biz_id: str = Field(description="业务 ID，如报表 ID、运行 ID")
    config: NotificationConfig
    context: dict[str, Any] = Field(default_factory=dict)


class NotificationSendResponse(BaseModel):
    ok: bool
    status: Literal["success", "partial_success", "failed", "skipped"]
    success_count: int = 0
    failed_count: int = 0
    log_id: int | None = None
    errors: list[str] = Field(default_factory=list)


# ===== 标记完成 =====

class CompletionRecord(BaseModel):
    """单条完成记录"""
    id: int
    notification_log_id: int
    open_id: str
    display_name: str | None = None
    biz_type: str | None = None
    biz_id: str | None = None
    status: str = "completed"
    completed_at: str

    model_config = {"from_attributes": True}


class CompletionListResponse(BaseModel):
    """完成记录列表响应"""
    items: list[CompletionRecord] = Field(default_factory=list)
    total: int = 0


class CardActionCallbackPayload(BaseModel):
    """飞书卡片按钮回调的简化 Schema"""
    action: str = Field(description="按钮动作: mark_complete / dismiss")
    notification_log_id: int = Field(description="通知日志 ID")
    biz_type: str | None = None
    biz_id: str | None = None
