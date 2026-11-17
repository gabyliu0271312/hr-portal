"""Cross-stage rating comparison contracts."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, model_validator


class ComparisonIndicatorRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_id: str = Field(min_length=1, max_length=128)
    item_id: str = Field(min_length=1, max_length=128)
    operator: Literal["eq", "gt", "gte", "lt", "lte"]
    threshold: Annotated[StrictInt, Field(ge=1, le=10000)]


class ComparisonRule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str | None = Field(default=None, min_length=1, max_length=64)
    template_id: int = Field(ge=1)
    first_node_id: str = Field(min_length=1, max_length=128)
    second_node_id: str = Field(min_length=1, max_length=128)
    indicator_diff_rules: list[ComparisonIndicatorRule] = Field(min_length=1, max_length=100)
    show_notice_in_review: bool = False
    fill_in_diff_reason: bool = False
    diff_reason_required: bool = True
    send_notification: bool = False

    @model_validator(mode="after")
    def validate_group(self):
        if self.first_node_id == self.second_node_id:
            raise ValueError("两个评估环节不能相同")
        if not (self.show_notice_in_review or self.fill_in_diff_reason or self.send_notification):
            raise ValueError("至少选择一种提示方式")
        identities = [(rule.content_id, rule.item_id, rule.operator, rule.threshold) for rule in self.indicator_diff_rules]
        if len(identities) != len(set(identities)):
            raise ValueError("差异条件不能重复")
        return self


class ComparisonCandidatesPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_ids: list[Annotated[int, Field(ge=1)]] = Field(min_length=1, max_length=100)
    cycle_id: int | None = Field(default=None, ge=1)
    template_id: int | None = Field(default=None, ge=1)
    first_node_id: str | None = Field(default=None, max_length=128)
    second_node_id: str | None = Field(default=None, max_length=128)


class ComparisonPreviewPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answers: dict = Field(default_factory=dict)
    version: int | None = Field(default=None, ge=1)
    result_version: int | None = Field(default=None, ge=0)
