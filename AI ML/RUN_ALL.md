# Run / Test All Projects

Each project is standalone.

```bash
cd 01_CodePilot_AI && ./run.sh
cd 02_VisionGuard_AI && ./run.sh
cd 03_RecSysX && ./run.sh
cd 04_ML_Sentinel && ./run.sh
cd 05_FinSight_AI && ./run.sh
```

Default URL: `http://localhost:8000`.

To test a repository:
```bash
pytest -q
```

To avoid port conflicts, set a custom port:
```bash
PORT=8001 ./run.sh
```
