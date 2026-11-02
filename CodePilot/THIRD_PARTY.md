# Third-Party Components

CodePilot uses standard open-source application dependencies installed from their official package registries. The runtime package manifests are the source of truth for exact installed versions.

Main components include FastAPI, Uvicorn, SQLAlchemy, Psycopg, React, Vite, Lucide React, PostgreSQL, and Nginx. Review the licenses distributed with those packages before commercial redistribution.

No external model vendor is hard-coded into the product. The optional inference integration is a vendor-neutral HTTP contract configured through environment variables.
