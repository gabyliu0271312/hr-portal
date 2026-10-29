from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class EntityDefinitionIn(BaseModel):
    model_config = {"extra": "forbid"}
    name: str = Field(min_length=1, max_length=128)
    description: str = Field(min_length=1, max_length=4000)

    @field_validator("name", "description")
    @classmethod
    def nonempty(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("名称和业务说明不能为空")
        return value


class EntityCreateIn(EntityDefinitionIn):
    entity_code: str = Field(pattern=r"^[a-z][a-z0-9_]{0,63}$")


class EntityUpdateIn(EntityDefinitionIn):
    expected_revision: int = Field(ge=0, strict=True)


class EntityOut(BaseModel):
    model_config = {"from_attributes": True}
    id: int
    entity_code: str
    name: str
    description: str
    revision: int
    is_active: bool
    published_at: datetime | None = None


class EntityListOut(BaseModel):
    total: int
    items: list[EntityOut]


class EntityPublishIn(BaseModel):
    model_config = {"extra": "forbid"}
    expected_revision: int = Field(ge=0, strict=True)


class EntityRecordUserAccessIn(BaseModel):
    model_config = {"extra": "forbid"}
    allowed: bool = Field(strict=True)


class EntityRecordAccessIn(BaseModel):
    model_config = {"extra": "forbid"}
    user_ids: list[int] = Field(default_factory=list, max_length=100)
    role_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator("user_ids", "role_ids")
    @classmethod
    def valid_subjects(cls, values):
        if any(v <= 0 for v in values) or len(values) != len(set(values)):
            raise ValueError("授权主体必须为不重复的有效ID")
        return values
