# CodePilot Semester-End Submission Checklist

## Must-submit items

- [ ] Final source-code ZIP (`CodePilot.zip`).
- [ ] Project report signed/approved in your college's required format.
- [ ] Synopsis / abstract (1-3 pages depending on department format).
- [ ] Software Requirements Specification (SRS).
- [ ] System architecture and module design diagrams.
- [ ] Database schema / ER diagram.
- [ ] Test plan, test cases, and final test evidence.
- [ ] User manual / installation guide.
- [ ] Demo script with one successful end-to-end bug-resolution case.
- [ ] Presentation deck for project review/viva.
- [ ] Short demo video or screen recording if your department accepts/requires it.
- [ ] Source-control history or repository link if requested by faculty.
- [ ] Plagiarism/originality declaration if required by your institution.
- [ ] Team contribution sheet if this is a group project.

## Recommended evidence for a high-quality evaluation

- [ ] Screenshot: login/dashboard.
- [ ] Screenshot: repository/project creation.
- [ ] Screenshot: bug report submitted.
- [ ] Screenshot: retrieved relevant code files.
- [ ] Screenshot: baseline failing test.
- [ ] Screenshot: generated Git diff.
- [ ] Screenshot: verification tests passing.
- [ ] Screenshot: automated review result.
- [ ] Screenshot: PR preview.
- [ ] API documentation screenshot (`/docs`).
- [ ] CI test run screenshot.
- [ ] Docker Compose run screenshot.
- [ ] Metrics table: retrieval hit rate, patch success rate on demo cases, average runtime, test pass rate.

## Suggested report chapter order

1. Title Page
2. Bonafide / Certificate page (college template)
3. Declaration
4. Acknowledgement
5. Abstract
6. Table of Contents
7. List of Figures / Tables
8. Introduction
9. Problem Statement
10. Objectives
11. Existing System and Limitations
12. Proposed System
13. Literature / Technology Review
14. Requirements Analysis
15. System Design and Architecture
16. Database Design
17. Module Description
18. Implementation
19. Testing and Results
20. Security and Limitations
21. Deployment
22. Future Enhancements
23. Conclusion
24. References
25. Appendix (API endpoints, screenshots, important code snippets)

## Viva preparation

Be ready to explain these five points without reading:

1. Why CodePilot is more than a code-completion tool.
2. How repository retrieval/RAG narrows the context before patch generation.
3. Why tests and automated review are mandatory gates.
4. Why production execution of untrusted repositories requires isolation.
5. Why the system still requires human approval before merge.

## Files already included in this package

- `ABSTRACT.md` — short abstract draft.
- `SYNOPSIS.md` — synopsis draft.
- `PROJECT_REPORT.md` — technical report draft.
- `SRS.md` — software requirements specification.
- `ARCHITECTURE.md` / `DIAGRAMS.md` — architecture and diagram source.
- `TEST_PLAN.md` — automated/manual validation plan.
- `BENCHMARK_RESULTS.txt` — captured 3/3 controlled benchmark output.
- `DEMO_OUTPUT.txt` — captured successful end-to-end CLI demonstration.
- `DEMO_SCRIPT.md` — 7-minute review demonstration sequence.
- `USER_MANUAL.md` — application usage guide.
- `DEPLOYMENT.md` — local/Docker setup.
- `SECURITY.md` — threat model and production hardening.
- `VIVA_QA.md` — viva preparation.
- `PRESENTATION_OUTLINE.md` — recommended review deck flow.
- `ACADEMIC_SUBMISSION_NOTES.md` — college-specific items you must personalize.
