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


class EntityListOut(BaseModel):
    total: int
    items: list[EntityOut]
