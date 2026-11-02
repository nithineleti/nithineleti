def retry_allowed(attempts: int) -> bool:
    return attempts < 3
