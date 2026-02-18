"""
Check whether frontend API calls in frontend/src/lib/api.ts exist in backend routers.
"""

from __future__ import annotations

import os
import re
import sys
from dataclasses import dataclass


@dataclass(frozen=True)
class Route:
    method: str
    path: str


METHODS = ("get", "post", "put", "delete", "patch")


def _normalize_path(path: str) -> str:
    normalized = path.strip()
    if not normalized:
        return "/"
    if not normalized.startswith("/"):
        normalized = "/" + normalized
    normalized = re.sub(r"\$\{[^}]+\}", "{id}", normalized)
    normalized = re.sub(r"\{[^}]+\}", "{id}", normalized)
    normalized = re.sub(r"/+", "/", normalized)
    if len(normalized) > 1:
        normalized = normalized.rstrip("/")
    return normalized


def _join_base(base_url: str, path: str) -> str:
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if base_url and not path.startswith(base_url):
        return _normalize_path(base_url + "/" + path.lstrip("/"))
    return _normalize_path(path)


def extract_frontend_api_calls(api_ts_path: str) -> list[Route]:
    with open(api_ts_path, "r", encoding="utf-8") as file:
        content = file.read()

    base_url_match = re.search(
        r"axios\.create\(\s*\{\s*baseURL:\s*['\"]([^'\"]+)['\"]",
        content,
    )
    base_url = _normalize_path(base_url_match.group(1)) if base_url_match else ""

    pattern = re.compile(
        r"api\.(get|post|put|delete|patch)\(\s*([\"'`])([^\"'`]+)\2",
        re.IGNORECASE,
    )
    calls: list[Route] = []
    for method, _, raw_path in pattern.findall(content):
        full_path = _join_base(base_url, raw_path)
        if full_path.startswith("http://") or full_path.startswith("https://"):
            continue
        calls.append(Route(method=method.upper(), path=full_path))
    return calls


def _extract_router_prefix(router_file_content: str) -> str:
    match = re.search(r"APIRouter\(([^)]*)\)", router_file_content, re.DOTALL)
    if not match:
        return ""
    args = match.group(1)
    prefix_match = re.search(r"prefix\s*=\s*['\"]([^'\"]+)['\"]", args)
    if not prefix_match:
        return ""
    return _normalize_path(prefix_match.group(1))


def extract_backend_routes(routers_dir: str) -> list[Route]:
    routes: list[Route] = []
    for file_name in os.listdir(routers_dir):
        if not file_name.endswith(".py") or file_name.startswith("_"):
            continue
        path = os.path.join(routers_dir, file_name)
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()

        prefix = _extract_router_prefix(content)
        pattern = re.compile(
            r"@router\.(get|post|put|delete|patch)\(\s*['\"]([^'\"]*)['\"]",
            re.IGNORECASE,
        )
        for method, route_path in pattern.findall(content):
            full_path = _normalize_path((prefix or "") + "/" + route_path.lstrip("/"))
            routes.append(Route(method=method.upper(), path=full_path))
    return routes


def check_consistency() -> bool:
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    frontend_calls = extract_frontend_api_calls(
        os.path.join(base_dir, "..", "frontend", "src", "lib", "api.ts")
    )
    backend_routes = extract_backend_routes(os.path.join(base_dir, "routers"))

    backend_set = {(route.method, route.path) for route in backend_routes}
    missing: list[Route] = []

    for call in frontend_calls:
        if (call.method, call.path) not in backend_set:
            missing.append(call)

    if missing:
        print(f"FAIL: frontend calls with no backend route: {len(missing)}")
        for item in sorted(set(missing), key=lambda row: (row.method, row.path)):
            print(f"  {item.method} {item.path}")
        return False

    print(f"OK: all frontend API calls are mapped ({len(frontend_calls)} calls)")
    return True


if __name__ == "__main__":
    success = check_consistency()
    sys.exit(0 if success else 1)
