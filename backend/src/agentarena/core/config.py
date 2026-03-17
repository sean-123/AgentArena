"""Application configuration."""

from functools import lru_cache
from pathlib import Path
from urllib.parse import quote

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """AgentArena settings loaded from environment."""

    model_config = SettingsConfigDict(
        env_prefix="AGENTARENA_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # 忽略 .env 中未定义的变量（如 AGENT_TW_SERVICE_TOKEN）
    )

    # Database
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "agent_arena"

    @property
    def database_url(self) -> str:
        return (
            f"mysql+aiomysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def database_url_sync(self) -> str:
        """Sync URL for migrations / init (no aiomysql)."""
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    # Redis（支持独立参数或完整 URL）
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_password: str = ""
    redis_db: int = 0
    redis_url_override: str | None = Field(default=None, alias="redis_url")

    @property
    def redis_url(self) -> str:
        """最终使用的 Redis 连接 URL。优先用 redis_url 覆盖，否则由 host/port/password/db 拼接。"""
        override = self.redis_url_override
        if override:
            return override
        if self.redis_password:
            # URL 编码密码，避免 @ : / 等字符破坏解析
            pwd = quote(self.redis_password, safe="")
            return f"redis://:{pwd}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # LLM Judge
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    llm_model: str = "gpt-4o-mini"

    # 对比通用大模型（DouBao/Qwen/DeepSeek）- 均使用 OpenAI SDK 调用
    doubao_api_key: str = ""
    doubao_base_url: str = "https://ark.cn-beijing.volces.com/api/v3"
    doubao_model: str = ""  # 火山方舟推理接入点 ID，如 ep-xxx

    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    qwen_model: str = "qwen-turbo"

    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-chat"

    # Paths
    base_dir: Path = Path(__file__).resolve().parent.parent.parent.parent


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
