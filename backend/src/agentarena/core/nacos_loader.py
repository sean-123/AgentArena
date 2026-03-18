"""
Nacos 配置加载器。

启动时若配置了 NACOS_SERVER_ADDR，则从 Nacos 拉取配置并合并到 os.environ；
未配置则跳过，沿用 .env 与现有环境变量。
"""

import json
import os
import sys

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore


def _is_nacos_configured() -> bool:
    """是否启用了 Nacos：至少需要 NACOS_SERVER_ADDR。"""
    addr = os.environ.get("NACOS_SERVER_ADDR", "").strip()
    return bool(addr)


def _parse_config_content(content: str) -> dict[str, str]:
    """解析 Nacos 配置内容。支持 properties 格式和 JSON 格式。"""
    content = (content or "").strip()
    if not content:
        return {}

    result: dict[str, str] = {}

    # 尝试 JSON
    stripped = content.strip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                for k, v in data.items():
                    if v is not None:
                        result[str(k)] = str(v)
            return result
        except json.JSONDecodeError:
            pass

    # properties 格式：key=value，支持 # 和 ; 注释
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or line.startswith(";"):
            continue
        idx = line.find("=")
        if idx <= 0:
            continue
        key = line[:idx].strip()
        value = line[idx + 1 :].strip()
        if key:
            result[key] = value

    return result


def _merge_into_environ(config: dict[str, str]) -> None:
    """将配置合并到 os.environ，Nacos 值覆盖已有值。"""
    for key, value in config.items():
        if key and value is not None:
            os.environ[key] = str(value)


def _get_nacos_access_token(base: str, username: str, password: str, timeout: float) -> str | None:
    """
    Nacos 启用鉴权时需先登录获取 accessToken。
    POST /nacos/v1/auth/login，返回 accessToken 用于后续请求。
    """
    login_url = f"{base}/nacos/v1/auth/login"
    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.post(
                login_url,
                data={"username": username, "password": password},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
            resp.raise_for_status()
            data = resp.json()
            token = data.get("accessToken") or data.get("token")
            return str(token).strip() if token else None
    except Exception as e:
        print(f"[Nacos] 登录失败: {e}", file=sys.stderr)
        return None


def _fetch_config_from_nacos() -> dict[str, str] | None:
    """从 Nacos 拉取配置。失败返回 None。"""
    if not httpx:
        return None

    addr = os.environ.get("NACOS_SERVER_ADDR", "").strip()
    if not addr:
        return None

    data_id = os.environ.get("NACOS_DATA_ID", "agentarena")
    group = os.environ.get("NACOS_GROUP", "DEFAULT_GROUP")
    namespace_id = os.environ.get("NACOS_NAMESPACE_ID", "").strip()
    username = os.environ.get("NACOS_USERNAME", "").strip()
    password = os.environ.get("NACOS_PASSWORD", "").strip()
    timeout = float(os.environ.get("NACOS_TIMEOUT", "5"))

    # 构建 base URL
    if not addr.startswith(("http://", "https://")):
        addr = f"http://{addr}"
    base = addr.rstrip("/")

    # Nacos 鉴权：需先登录获取 accessToken，再在请求中携带
    # 403 通常表示 Nacos 已开启鉴权，请配置 NACOS_USERNAME 和 NACOS_PASSWORD
    access_token: str | None = None
    if username and password:
        access_token = _get_nacos_access_token(base, username, password, timeout)
        if not access_token:
            return None

    url = f"{base}/nacos/v1/cs/configs?dataId={data_id}&group={group}"
    if namespace_id:
        url += f"&tenant={namespace_id}"
    if access_token:
        url += f"&accessToken={access_token}"

    try:
        with httpx.Client(timeout=timeout) as client:
            resp = client.get(url)
            resp.raise_for_status()
            content = resp.text
            return _parse_config_content(content)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 403:
            print(
                "[Nacos] 拉取配置失败 403：Nacos 已启用鉴权，请配置 NACOS_USERNAME 和 NACOS_PASSWORD",
                file=sys.stderr,
            )
        else:
            print(f"[Nacos] 拉取配置失败: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[Nacos] 拉取配置失败: {e}", file=sys.stderr)
        return None


def load_nacos_config_if_configured() -> bool:
    """
    若配置了 Nacos，则拉取配置并合并到 os.environ。
    返回是否成功从 Nacos 加载并应用了配置。
    """
    if not _is_nacos_configured():
        return False

    config = _fetch_config_from_nacos()
    if config is None:
        return False

    _merge_into_environ(config)
    print(f"[Nacos] 已从 Nacos 加载 {len(config)} 项配置")
    return True
