from __future__ import annotations
import json
import time
from collections import defaultdict, deque
from ..config import get_settings

settings = get_settings()
_memory: dict[str, tuple[float, str]] = {}
_rate: dict[str, deque[float]] = defaultdict(deque)


class CacheService:
    def __init__(self):
        self.redis = None
        if settings.redis_url:
            try:
                import redis
                client = redis.Redis.from_url(settings.redis_url, decode_responses=True, socket_connect_timeout=1)
                client.ping()
                self.redis = client
            except Exception:
                self.redis = None

    @property
    def backend(self) -> str:
        return "redis" if self.redis is not None else "memory"

    def get_json(self, key: str):
        if self.redis is not None:
            raw = self.redis.get(key)
            return json.loads(raw) if raw else None
        item = _memory.get(key)
        if not item:
            return None
        expires, raw = item
        if expires < time.time():
            _memory.pop(key, None)
            return None
        return json.loads(raw)

    def set_json(self, key: str, value, ttl: int = 120):
        raw = json.dumps(value, default=str)
        if self.redis is not None:
            self.redis.setex(key, ttl, raw)
        else:
            _memory[key] = (time.time() + ttl, raw)

    def allow_request(self, key: str, limit: int) -> bool:
        now = time.time()
        if self.redis is not None:
            bucket = f"rate:{key}:{int(now // 60)}"
            count = int(self.redis.incr(bucket))
            if count == 1:
                self.redis.expire(bucket, 65)
            return count <= limit
        q = _rate[key]
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


cache = CacheService()
