"""应用配置：从 .env 读取所有运行时参数"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    APP_NAME: str = "HR Portal"
    APP_ENV: str = Field(default="dev", description="dev | staging | prod")
    API_PREFIX: str = "/api/v1"

    DB_HOST: str = "db"
    DB_PORT: int = 5432
    DB_NAME: str = "hr_portal"
    DB_USER: str = "hr_portal"
    DB_PASSWORD: str = "change-me"

    JWT_SECRET: str = "please-change-in-env"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 480

    ADMIN_INIT_PASSWORD: str = "Admin@2026"

    BEISEN_BASE_URL: str = ""
    BEISEN_APP_KEY: str = ""
    BEISEN_APP_SECRET: str = ""

    # 数据源凭证加密 key（Fernet 32-byte base64）—— 生产请改 .env
    SECRET_BOX_KEY: str = "1xGgQjEZi4j-Jy6fLG6_jL5LhJ_NjUUz8jbMTwJ-w1k="

    ORG_ROOT_NAME: str = "创梦天地"

    COST_ALLOCATION_APP_URL: str = "http://192.168.10.13:37800/"
    COST_ALLOCATION_ADMIN_PATH: str = "/admin/workbench"

    LOGIN_FAIL_LIMIT: int = 5
    LOGIN_LOCK_MINUTES: int = 15

    @property
    def db_url_async(self) -> str:
        return (
            f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def db_url_sync(self) -> str:
        return (
            f"postgresql+psycopg2://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
