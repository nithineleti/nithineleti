# Semester Review Presentation Outline

## Slide 1 — Title
**CodePilot**  
Autonomous Software Engineering Agent for Repository-Level Bug Resolution

Include: student name, roll number, department, guide, college and academic year.

## Slide 2 — Problem
Show the manual chain:

**Bug report -> Search code -> Reproduce -> Fix -> Test -> Review -> PR**

Key point: code generation alone does not validate a bug fix.

## Slide 3 — Proposed solution
One sentence:

> CodePilot automates the complete pre-merge bug-resolution workflow and gives a human reviewer evidence rather than an unverified suggestion.

## Slide 4 — Objectives
Use 6 short points: understand, retrieve, reproduce, repair, verify, review/deliver.

## Slide 5 — System architecture
Use the Mermaid architecture from `ARCHITECTURE.md` converted to an image.

## Slide 6 — Multi-agent workflow
Triage -> Retrieval -> Validation -> Repair -> Review -> Delivery.

## Slide 7 — NLP + RAG
Explain bug triage, source chunking, 384-D vectors, cosine/lexical ranking and retrieved context.

## Slide 8 — Learning component
Explain reward signals and UCB1 exploration/exploitation in one diagram.

## Slide 9 — Technology stack
React, FastAPI, PostgreSQL, SQLAlchemy, Git, Pytest, Docker/Nginx.

## Slide 10 — Security architecture
Highlight repository code execution as the major trust boundary and explain human approval.

## Slide 11 — Live demo
Show the loyalty threshold defect and run the pipeline.

## Slide 12 — Before/after evidence
Left: baseline failing test.  
Center: Git diff `> 100` -> `>= 100`.  
Right: verification passing + 100/100 review score.

## Slide 13 — Results
Show:

- Backend automated tests: 4 passing
- Controlled benchmark: 3/3 successful cases
- Main demo: fail -> fix -> pass -> PR preview

Label the 3/3 metric clearly as a **controlled benchmark**, not general accuracy.

## Slide 14 — Limitations
Offline repair family is narrow; arbitrary public repositories need more repair strategies, stronger sandbox execution and a durable queue.

## Slide 15 — Future scope
Semantic embeddings, regression-test generation, graph retrieval, stronger sandboxing, issue/code-host connectors and distributed workers.

## Slide 16 — Conclusion
**Evidence-first autonomous engineering with human-controlled delivery.**

## Slide 17 — Q&A
Keep the architecture diagram available for viva questions.
