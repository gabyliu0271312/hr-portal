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

    # 飞书单点登录（用飞书账号登录 HR Portal 本身）
    FEISHU_SSO_ENABLED: bool = False
    FEISHU_APP_ID: str = ""
    FEISHU_APP_SECRET: str = ""
    # 飞书 OAuth 回调地址，必须与开放平台「安全设置-重定向 URL」白名单完全一致
    FEISHU_REDIRECT_URI: str = "http://localhost:8080/auth/feishu/callback"
    # 飞书事件回调验证 Token（开放平台「事件订阅-Encrypt Key」/Verification Token）
    FEISHU_VERIFICATION_TOKEN: str = ""
    # 飞书事件回调最大时间偏差（秒），防重放
    FEISHU_CALLBACK_MAX_TIMESTAMP_DIFF: int = 300

    LOGIN_FAIL_LIMIT: int = 5
    LOGIN_LOCK_MINUTES: int = 15

    # 数据仓库二期灰度开关（Q0002）
    WAREHOUSE_PHASE2_ENABLED: bool = True
    WAREHOUSE_FEATURE_QUALITY_RULES: bool = True
    WAREHOUSE_FEATURE_LINEAGE: bool = True
    WAREHOUSE_FEATURE_UCP_PROXY: bool = False
    WAREHOUSE_FEATURE_MODELING_V2: bool = False
    WAREHOUSE_FEATURE_MONITORING: bool = False
    WAREHOUSE_FEATURE_LAYER_ENHANCEMENT: bool = True

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
