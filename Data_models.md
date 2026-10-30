# BlueTraceAI: Behavioral Data Models & Schema Contracts

## 1. Domain Entities & Storage Schemas

### 1.1 Project & Sheet Set
```json
{
  "project_id": "proj_uuid",
  "name": "Commercial Office Fitout MEP",
  "created_at": "2026-10-30T10:00:00Z",
  "updated_at": "2026-10-30T10:00:00Z",
  "meta_file_id": "file_meta_blueprint_12345",
  "sheets": [
    {
      "sheet_id": "sheet_uuid_001",
      "page_index": 0,
      "sheet_number": "M-101",
      "sheet_title": "SECOND FLOOR HVAC PLAN",
      "discipline": "MECHANICAL",
      "scale_raw": "1/4\" = 1'-0\"",
      "scale_ratio": 48.0,
      "scale_status": "VERIFIED",
      "width_pt": 2592.0,
      "height_pt": 1728.0,
      "dpi": 150
    }
  ]
}
```

### 1.2 Title Block & Legend Extraction
```json
{
  "sheet_id": "sheet_uuid_001",
  "title_block_bbox": [2200.0, 1400.0, 2580.0, 1700.0],
  "legend_bbox": [50.0, 100.0, 400.0, 800.0],
  "extracted_symbols": [
    {
      "symbol_id": "sym_001",
      "label": "Supply Air Diffuser 24x24",
      "type": "DIFFUSER_SUPPLY",
      "tag": "S1",
      "bbox_in_legend": [60.0, 120.0, 100.0, 160.0]
    }
  ]
}
```

### 1.3 Equipment Schedule Matrix
```json
{
  "schedule_id": "sched_uuid_001",
  "sheet_id": "sheet_uuid_002",
  "schedule_title": "VARIABLE AIR VOLUME TERMINAL UNIT SCHEDULE",
  "records": [
    {
      "tag": "VAV-1",
      "type": "VAV Box",
      "min_cfm": 250,
      "max_cfm": 850,
      "inlet_dia_in": 10.0,
      "reheat_kw": 4.5,
      "status": "UNLINKED",
      "plan_locations": [
        {
          "sheet_id": "sheet_uuid_001",
          "coordinates": [1240.5, 820.3],
          "confidence": 0.94
        }
      ]
    }
  ]
}
```

### 1.4 Vector Linework & Takeoff Item
```json
{
  "item_id": "item_uuid_001",
  "sheet_id": "sheet_uuid_001",
  "category": "DUCTWORK",
  "system": "SUPPLY_AIR",
  "dimension_label": "24x12",
  "width_in": 24.0,
  "height_in": 12.0,
  "shape": "RECTANGULAR",
  "segments": [
    {
      "segment_id": "seg_001",
      "start_pt": [1020.0, 500.0],
      "end_pt": [1220.0, 500.0],
      "length_pt": 200.0,
      "length_ft": 13.88
    }
  ],
  "total_length_ft": 13.88,
  "review_status": "ACCEPTED"
}
```

### 1.5 Point-of-Need Cursor Crop Request / Response
* **Request (`POST /api/crop-ocr`)**:
```json
{
  "sheet_id": "sheet_uuid_001",
  "cursor_pt": [1120.0, 500.0],
  "crop_size_pt": 150.0,
  "image_base64": "<PNG_BASE64_DATA>"
}
```
* **Response**:
```json
{
  "latency_ms": 320,
  "detected_text": "24/12",
  "parsed_dimension": {
    "width_in": 24.0,
    "height_in": 12.0,
    "shape": "RECTANGULAR"
  },
  "confidence": 0.96,
  "badge_text": "24x12 Rectangular Duct"
}
```
