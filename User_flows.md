# BlueTraceAI: User Flows & Screen State Contracts

## 1. Primary User Journey

```
[ Upload PDF Blueprint ]
         │
         ▼ (SheetScan Reconnaissance)
[ Sheet Directory & Plan Tree ]
         │
         ▼ (Select Sheet e.g. M-101)
[ 150 DPI Interactive Canvas Viewer ]
         │
         ├── Hover over linework / Hold 'Q' ──► [ Floating Dimension Badge ] ──► [ One-Click Takeoff ]
         │
         ├── Select Schedule Tab ──────────────► [ Interactive Equipment Ledger ] ──► [ Highlight on Plan ]
         │
         ├── Click 'Segment Room / Area' ──────► [ SAM 3.1 Mask Generation ] ──► [ Save Room Boundary ]
         │
         └── Ask Copilot Takeoff Question ─────► [ Grounded Reasoning Query ] ──► [ View Cited Coordinates ]
```

---

## 2. The 5 Mandatory Screen States

Per the Master Checklist, every screen and interactive widget must handle all five explicit states:

### 2.1 State 1: `LOADING`
- **Canvas Viewer**: Pulsing skeleton frame indicating active sheet tile rendering with an indeterminate progress ring.
- **Hover Badge**: Subtle 2px spinner icon adjacent to the cursor indicating sub-second crop transmission.
- **Copilot**: Streaming indicator typing tokens with real-time reasoning thoughts.

### 2.2 State 2: `EMPTY`
- **Initial Upload**: "Drag & drop multi-sheet MEP drawing set (PDF) or click to browse. Max 500 pages."
- **Equipment Schedule**: "No schedules parsed on this sheet. Select a schedule sheet (e.g. M-501) to extract equipment tables."
- **Takeoff Ledger**: "No items measured yet. Hover over duct runs or click symbols to begin takeoff."

### 2.3 State 3: `ERROR`
- **PDF Ingestion Error**: Actionable message specifying page number and failure cause (e.g., "Corrupted PDF stream on Page 4. Please re-export or upload an uncompressed PDF.").
- **Scale Conflict Warning**: "Conflicting scale annotations detected (1/4\" vs 1/8\"). Measurement locked. Click to calibrate manually."
- **Crop OCR Timeout**: "Dimension query timed out (> 2s). Press 'Q' to retry crop."

### 2.4 State 4: `SUCCESS`
- **Sheet Uploaded**: Full sheet tree populated with sheet numbers, disciplines, and verified scale ratios.
- **Takeoff Applied**: Linework highlighted in system color (e.g. Supply Air = #0284c7) with immediate footage addition to summary ledger.
- **Schedule Linked**: Equipment tags pinned on floor plan with green verified checkmarks.

### 2.5 State 5: `OFFLINE`
- **Network Lost**: Non-blocking toast notification: "Offline Mode active. Local vector linework navigation and cached sheets remain fully functional. AI crop OCR and copilot queries will resume when reconnected."
