# Demo Guide
1. Run `./run.sh` and open `http://localhost:8000`.
2. Keep the default bug report and click **Analyze & validate**.
3. Explain the retrieved-file ranking and why `pricing.py` is selected.
4. Show the unified diff: `>= 100` becomes `> 100`.
5. Compare the test output: the original repository fails; the temporary patched repository passes.
6. Close by explaining that production usage would add authentication, Git provider integration, a stronger code-embedding model, policy checks and pull-request creation.
