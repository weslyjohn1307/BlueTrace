# RES-03: Equipment Schedule Extraction & Entity Linking

## 1. Challenge & Opportunity
MEP drawing sets always include tabular schedules (e.g., Diffuser Schedule, VAV Schedule, Air Handling Unit Schedule). 

Traditionally, estimators manually match IDs in the schedule (e.g. `VAV-1`) to individual callouts scattered across floor plans. BlueTraceAI automates this cross-referencing.

---

## 2. Two-Stage Extraction & Matching Pipeline

```text
[ Schedule Sheet ]
       │
       ▼ (muse-spark-1.3 Tabular Parser)
Structured Equipment Matrix:
[
  {"tag": "VAV-1", "type": "VAV Box", "cfm": 850, "inlet": "10""},
  {"tag": "S1", "type": "Supply Diffuser", "cfm": 150, "size": "12x12"}
]
       │
       ▼ (Entity Search & Plan Spatial Index)
[ Floor Plan Sheets ]
       │
       ▼
Matching Candidate Pins:
- "VAV-1" located at Sheet M-201, Room 203 (Confidence: 0.96)
- "S1" located at Sheet M-201, 14 instances (Confidence: 0.94)
       │
       ▼
Interactive Accept / Reject Workflow in Takeoff Ledger
```
