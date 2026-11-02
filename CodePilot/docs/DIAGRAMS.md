# Diagrams for Report / PPT

## Run sequence

```mermaid
sequenceDiagram
    actor D as Developer
    participant UI as React UI
    participant API as FastAPI
    participant DB as PostgreSQL
    participant W as Worker
    participant R as Repository

    D->>UI: Submit repository + bug report
    UI->>API: POST /runs
    API->>DB: Store queued run
    W->>DB: Claim queued run
    W->>R: Prepare workspace
    W->>R: Index and retrieve relevant code
    W->>R: Run baseline tests
    W->>R: Generate/apply patch
    W->>R: Run verification tests
    W->>R: Review diff
    W->>DB: Store evidence + PR preview
    UI->>API: Poll run
    API->>DB: Read run/events
    API-->>UI: Status, diff, tests, review
    UI-->>D: Human approval screen
```

## Recommended PPT figures

1. Problem workflow: Bug -> Search -> Fix -> Test -> Review -> PR.
2. System architecture diagram from `ARCHITECTURE.md`.
3. Database ER diagram from `ARCHITECTURE.md`.
4. Autonomous run sequence above.
5. Security trust boundary: UI/API | Worker Sandbox | External Repository.
6. Demo evidence screenshots.
