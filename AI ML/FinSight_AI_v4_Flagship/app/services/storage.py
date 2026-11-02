from __future__ import annotations
from pathlib import Path
from ..config import BASE_DIR, get_settings

settings = get_settings()


class LocalStorage:
    name = "local"

    def save(self, filename: str, raw: bytes, digest: str) -> str:
        root = BASE_DIR / "runtime" / "uploads"
        root.mkdir(parents=True, exist_ok=True)
        safe = Path(filename).name.replace(" ", "_")
        path = root / f"{digest[:12]}_{safe}"
        path.write_bytes(raw)
        return str(path.relative_to(BASE_DIR))


class S3Storage:
    name = "s3"

    def save(self, filename: str, raw: bytes, digest: str) -> str:
        import boto3
        kwargs = {"region_name": settings.aws_region}
        if settings.s3_endpoint_url:
            kwargs["endpoint_url"] = settings.s3_endpoint_url
        client = boto3.client("s3", **kwargs)
        key = f"financial-documents/{digest[:12]}/{Path(filename).name}"
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=raw)
        return f"s3://{settings.s3_bucket}/{key}"


def get_storage():
    if settings.s3_bucket:
        try:
            import boto3  # noqa: F401
            return S3Storage()
        except Exception:
            pass
    return LocalStorage()
