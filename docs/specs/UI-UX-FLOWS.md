# BlueTrace Engineer Workspace — UX Flows

This is the interaction contract for the supported PDF review and MEP takeoff workflow. It describes existing endpoints and controls; it does not promise revision comparison, pricing, custom report building, or batch edits.

## 1. Open a package

1. The engineer selects or drops a PDF. Validate the extension, file signature, and supported size before upload.
2. Upload through the existing API. Fetch the first page preview immediately after upload succeeds.
3. Put the PDF in the central canvas as soon as the preview is ready. Sheet discovery and the local audit start independently in the background.
4. Keep navigation usable while discovery runs. The engineer can switch sheets or jump to a page without waiting for the audit.
5. If upload or preview fails, retain the error near the upload/workspace controls and offer a direct retry or return action.

## 2. Review the package

- Show page count and discovered sheet count separately. Do not call every PDF page a classified sheet.
- Present each discovered sheet's title, discipline, sheet type, and scale state.
- Support direct page-number navigation and sheet navigation for large packages.
- Plan pages are eligible for takeoff analysis. Schedules and legends provide context and are not treated as plans. Detail, information, cover, and index sheets can be browsed without a scale error.
- A page with no classification is pending; a non-plan information page can have scale marked not applicable.

## 3. Start and monitor analysis

1. Run local sheet discovery by default. The first render and local work do not require Meta consent.
2. Before any Meta-backed pass, show an unchecked, package-scoped consent control that clearly states page imagery/text will be sent to Meta for vision analysis. Do not infer consent from a stored key.
3. Show actual status, classified page count, proposal/review counts, and events from the persisted job stream. Do not show fabricated estimates or simulated agent activity.
4. Identify agent roles and assignments only when the job events or route data support them. Distinguish queued, working, complete, and needs review.
5. Allow cancellation. Preserve checkpoints and expose resume for recoverable interrupted jobs. A server restart must not discard the persisted snapshot or event history.

## 4. Work a sheet

- Keep the PDF central, at the highest useful size. Sidebars and activity rows must not stack over drawing evidence.
- The left sheet navigator selects the active PDF page. The central canvas supports pan, zoom, and contextual interactions.
- The right review rail presents one active view at a time: takeoff, schedules, issues, or Copilot.
- Compact icon controls need an accessible name, hover label, keyboard focus, and keyboard activation.
- Preserve the rendered PDF colors in light and dark themes.

## 5. Verify scale and detections

- Display scale as verified, manually calibrated, conflicting, unverified, awaiting classification, or not applicable.
- Conflicting or unverified scale must not yield confirmed linear footage. Keep affected quantities at review state until validated.
- Manual calibration is tied to the active sheet and updates its measurement state and review surfaces through the existing calibration flow.
- Symbol proposals stay connected to drawing coordinates and evidence. Where legend context is available, show its label/class context with the proposed detection. Accept, reject, and reclassify through supported review endpoints and preserve the audit event.
- Missing legend evidence must be visible as a review condition. Do not imply that a model proposal is accepted.

## 6. Review and ask

- Takeoff, schedules, discrepancies, and Copilot are available from the right-side review rail without overlapping drawers.
- Copilot answers should cite the active sheet and evidence when available, state uncertainty, and distinguish recommendations from completed actions.
- Ask only for decisions that change the work. Execute only actions backed by a real endpoint and show the confirmed result.

## 7. Recover and export

- Keep loading, empty, success, offline, and error states in stable locations with a clear next action.
- Preserve review history and the current takeoff ledger.
- CSV and JSON exports remain available through the existing export API.
- A failed agent job offers its server message and a resume action when the saved checkpoint is resumable.

## Surface map

| Surface | Responsibility |
|---|---|
| Package intake | Upload, preview readiness, package summary, analysis consent and controls |
| Sheet navigator | Sheet/page selection, title, type, discipline, scale state |
| Drawing canvas | PDF rendering, pan/zoom, evidence and proposal overlays |
| Takeoff tab | Proposal review, accepted quantities, audit-linked actions |
| Schedule tab | Schedule parsing and sheet-linked context |
| Issues tab | Scale, evidence, and discrepancy review |
| Ask tab | Grounded Copilot conversation and evidence references |
| Activity tray | Persisted job status, actual assignments, event-derived progress |
| Settings | Persistent light/dark choice and application preferences |

## Interaction exclusions

Revision diff, pricing/catalog lookup, custom report design, and bulk edits are separate product work. Do not add UI affordances for them until their data contracts and endpoints exist.
