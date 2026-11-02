from __future__ import annotations

import time

from sqlalchemy import select

from .database import SessionLocal, init_db
from .models import Run
from .pipeline import execute_run


def claim() -> int | None:
    with SessionLocal() as db:
        run = db.scalar(select(Run).where(Run.status == "queued").order_by(Run.id.asc()).limit(1).with_for_update(skip_locked=True))
        if not run:
            return None
        run.status = "claimed"
        db.commit()
        return run.id


def main() -> None:
    init_db()
    print("CodePilot worker started")
    while True:
        run_id = claim()
        if run_id is None:
            time.sleep(1.5)
            continue
        execute_run(run_id)


if __name__ == "__main__":
    main()
