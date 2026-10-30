---
name: meta-vlm-prompting
description: Best practices and prompt schemas for Meta's Muse Spark 1.3, SAM 3.1, and Muse Wonder 1.0.
---

# Meta VLM Prompting Skill

Use this skill when designing or refining prompts for Meta Model API services in `src/meta_services/`.

## Model Roles
1. **Muse Spark 1.3**:
   - Best for OCR, title block detection, and localized 300x300 point-of-need hover crops.
   - Temperature: $0.1$.
   - Output format: Force strict JSON schemas via system instructions.

2. **SAM 3.1**:
   - Best for pixel-level boundary masks (room delineation, duct run contours).
   - Input: Image crop + prompt bounding box or click coordinates $[x, y]$.

3. **Muse Wonder 1.0**:
   - Best for complex copilot queries, schedule table reconciliation, and multi-step reasoning.
   - Streaming: Always stream responses over SSE (`text/event-stream`).
