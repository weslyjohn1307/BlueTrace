# BlueTraceAI: Locked Technology Stack Manifest

## 1. Core Runtimes & Languages
- **Python**: `3.13.x` (64-bit AMD64)
- **Node.js**: `v24.13.x` (LTS)
- **Package Manager**: `npm 11.8.x` / Python standard virtual environment (`venv`)

## 2. Backend Architecture
- **Framework**: FastAPI `0.115+`
- **ASGI Server**: Uvicorn `0.32+`
- **Data Validation & Schemas**: Pydantic v2 (`pydantic >= 2.9.0`)
- **PDF & Vector Extraction**: PyMuPDF (`fitz >= 1.24.0`)
- **Spatial Geometry & Graphs**:
  - Shapely (`>= 2.0.0`)
  - NetworkX (`>= 3.3`)
- **HTTP Client**: HTTPX (`>= 0.27.0`) for async calls to Meta Model API
- **AI SDK**: OpenAI Python SDK (`openai >= 1.50.0`) for OpenAI-compatible Meta Model API endpoints
- **Persistence**: SQLite with `aiosqlite` for asynchronous project storage

## 3. Frontend Architecture
- **Framework**: React 19 (`react >= 19.0.0`, `react-dom >= 19.0.0`)
- **Build Tool**: Vite `6.x`
- **Language**: TypeScript `5.7+`
- **Styling**: Tailwind CSS `3.4+` (configured with modern OKLCH color tokens)
- **Icons**: Lucide React (`lucide-react`)
- **Canvas Rendering**: HTML5 2D Canvas with 150 DPI DPR scaling and hardware-accelerated transforms (matrix pan/zoom)

## 4. Perception & Reasoning Models (Meta Model API)
- **Base URL**: `https://api.meta.ai/v1`
- **Authentication**: `Bearer $MODEL_API_KEY`
- **Models**:
  - `muse-spark-1.3`: Multimodal vision, title block extraction, equipment schedule parsing, point-of-need hover OCR.
  - `sam-3.1`: Concept and coordinate-prompted zero-shot mask/polygon segmentation via `/v1/responses`.
  - `muse-wonder-1.0`: Copilot reasoning, takeoff calculations, and parallel tool calling over local project DB.
  - Files API: Single-upload PDF drawing caching via `POST /v1/files`.
