# RES-04: BlueTraceAI MEP Design Architecture & ParseBench Analysis

## 1. Executive Summary & Context

The proposal for BlueTraceAI transitions our system from an autonomous black-box batch processor into an interactive, **Drawing-Aware Engineering Assistant**. Rather than expecting a multimodal model to autonomously extract and calculate every engineering quantity from scratch, the system establishes a clear division of labor:
1. **Document Understanding Layer**: Examines document hierarchy, disciplines, title blocks, schedules, and legends.
2. **Deterministic Geometric Engine**: Performs exact mathematical pixel-to-foot conversions, vector extraction, and centerline tracing.
3. **Interactive Human-in-the-Loop Review**: Surfaces visual evidence at the point of need so the engineer can inspect, verify, and correct findings.

This architecture directly integrates findings from **ParseBench: A Document Parsing Benchmark for AI Agents (arXiv:2604.08538)** and Jerry Liu's talk (*"My Agent Can't Read a PDF?"*).

---

## 2. Core Architectural Principles from ParseBench (arXiv:2604.08538)

ParseBench evaluates document parsing across five core dimensions:
* **Visual Grounding**: Retaining spatial bounding boxes for every extracted entity.
* **Tables & Schedules**: Preserving the structural relationship between cells, headers, and values.
* **Content Faithfulness**: Refusing to invent or hallucinate missing information.
* **Semantic Formatting**: Relating page title blocks to discipline intent.
* **Charts & Legends**: Connecting graphical symbols to descriptive definitions.

### The Fundamental Axiom: "Read Cheaply First, Reason Visually Selectively"
* **Macro (Low Cost, High Breadth)**:
  - Parse native PDF text layers and vector geometry across all pages first using lightweight deterministic libraries (PyMuPDF).
  - Extract sheet numbers, disciplines, and candidate scale text with zero model token consumption.
* **Micro (High Precision, Targeted Visual Context)**:
  - When visual interpretation is strictly necessary (e.g. dense equipment schedule tables, graphic symbol legends, ambiguous title blocks), take high-resolution 150–300 DPI crops and pass them to Meta's multimodal VLM (`muse-spark-1.3`).
  - Store the resulting structured output in a persistent document map for reuse across the entire user session.

---

## 3. The 4 Bounded Agent Roles

Rather than an unconstrained swarm of autonomous agents, BlueTraceAI organizes operations into four deterministic, bounded workflows:

```
[ Uploaded Multi-Sheet PDF ]
              │
              ▼
  ┌────────────────────────────────────────────────┐
  │ Agent 1: Document Reconnaissance               │
  │ - PyMuPDF text & vector enumeration            │
  │ - Title block & discipline identification      │
  │ - Generates structured document_map.json       │
  └───────────────────────┬────────────────────────┘
                          │
                          ▼
  ┌────────────────────────────────────────────────┐
  │ Agent 2: Sheet & Legend Interpreter            │
  │ - Targeted muse-spark-1.3 crops of legends     │
  │ - Maps graphical symbols to class targets      │
  │ - Extracts equipment schedule matrices         │
  └───────────────────────┬────────────────────────┘
                          │
                          ▼
  ┌────────────────────────────────────────────────┐
  │ Agent 3: Task Router & Tool Orchestrator       │
  │ - Dispatches user queries to specific engines  │
  │ - Counts -> Level 1 detector / DB query        │
  │ - Lengths -> Level 2 vector run graph          │
  └───────────────────────┬────────────────────────┘
                          │
                          ▼
  ┌────────────────────────────────────────────────┐
  │ Agent 4: Evidence Verifier (The Guardrail)     │
  │ - Validates scale provenance (fail-closed)     │
  │ - Binds coordinate bounding boxes to answers   │
  │ - Flags unverified items for human review      │
  └───────────────────────┬────────────────────────┘
                          │
                          ▼
[ Interactive Drawing Viewer & Live Assistant ]
```

### Agent 1: Document Reconnaissance
* **Trigger**: Triggered upon PDF upload.
* **Inputs**: Multi-sheet vector PDF.
* **Outputs**: `document_map.json` mapping page indices to sheet IDs (e.g. `M-101`, `P-201`), sheet titles, drawing disciplines, and bounding boxes of title blocks, legends, and schedules.

### Agent 2: Sheet & Legend Interpreter
* **Trigger**: Triggered during background indexing or when a sheet is opened.
* **Inputs**: High-resolution image crops of detected legend blocks and schedule tables.
* **Outputs**: `sheet_context_{sheet_id}.json` with structured symbol-to-label mappings and equipment lists.

### Agent 3: Task Router
* **Trigger**: User interaction or conversational query (e.g. *"What is the total length of 12-inch duct on this floor?"*).
* **Inputs**: Active sheet context, user query, active selection coordinates.
* **Outputs**: Selected tool call with typed arguments dispatched to the local SQLite database or vector engine.

### Agent 4: Evidence Verifier
* **Trigger**: Pre-response validation hook.
* **Inputs**: Raw tool output and supporting spatial coordinates.
* **Outputs**: Grounded response containing both conversational text and highlight coordinates `[x1, y1, x2, y2]` on the drawing sheet. If scale is unverified or continuity is broken, surfaces an explicit warning rather than guessing.

---

## 4. Key Failure Modes & Protective Guardrails

| Failure Mode | Architectural Risk | Protective System Guardrail |
| :--- | :--- | :--- |
| **VLM Hallucination** | Model invents duct dimensions or misreads schedule CFM values | All mathematical lengths and counts come from deterministic engine; VLM output is strictly validated against Pydantic schemas |
| **False Scale Application** | Model assumes 1/4" = 1'-0" on an enlarged 1/2" detail sheet | Scale validator requires deterministic string match or explicit user confirmation; fail-closed by default |
| **Cross-Sheet Context Bleed** | Assistant applies symbols from sheet E-101 to M-201 | All queries are strictly scoped to the active sheet ID in the project store |
| **Excessive API Latency** | Re-analyzing full pages on every click wastes tokens and time | Pre-index sheet structure once; runtime hover queries operate on 300x300 px crops taking < 500ms |
