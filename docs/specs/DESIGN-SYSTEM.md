# BlueTrace Engineer Workspace — Design System

This document describes the application design contract. Tokens are implemented in `frontend/src/styles/bluetrace.tokens.css`; Tailwind mappings and global type rules live in `frontend/src/styles/index.css`.

## Product direction

BlueTrace is a drawing review and MEP takeoff workstation. The PDF remains the primary work surface. Package navigation, findings, agent activity, scale state, takeoff review, and Copilot stay adjacent to the drawing and must not hide it behind a blocking process screen.

The interface should feel calm and precise under dense, technical content. Prefer clear hierarchy, stable panel placement, compact but readable rows, and direct language. Remove decorative motion and ornamental labels. Use icons with accessible names and hover/focus labels for compact controls.

## Themes and surfaces

- Light and dark themes apply to all application chrome, dialogs, settings, and showcase surfaces through `data-theme` on the document root.
- Theme preference is persistent through the app theme setting.
- PDF pages retain their original white drawing pixels in either theme. Theme changes must not recolor the rendered page.
- UI discipline chips use theme-aware `--mep-ui-*` tokens. Drawing overlays use the stable `--mep-*` palette and distinguish disciplines with color plus line or shape cues.
- Status always combines color with text or a recognizable icon. Scale is described as verified, manually calibrated, conflicting, unverified, awaiting classification, or not applicable.

## Typography

- **Lora** is the editorial face for page titles and section headings.
- **Inter** is the interface face for controls, navigation, labels, and prose.
- **Inconsolata** is for dimensions, coordinates, ratios, sheet identifiers, and other technical values.
- Font imports are centralized in `frontend/src/main.tsx`; global family and size rules are in `frontend/src/styles/index.css`.
- Application text does not fall below 12px. Use weight, color, spacing, and placement to establish hierarchy before adding more sizes.

## Layout and spacing

- Use a 4px base spacing rhythm and align panels to a consistent workstation grid.
- Keep the drawing canvas central and give it the largest uninterrupted area.
- Left-side navigation is for package sheets. Right-side review tabs contain takeoff, schedules, issues, and Copilot; one contextual surface is open at a time.
- Package summaries and agent activity remain compact and collapsible. Avoid panels stacked over each other or covering drawing evidence.
- Use the shared control, card, panel, and dialog radii from the token file. Avoid arbitrary rounding and decorative shadows.
- Controls must preserve keyboard operation, visible focus, and practical hit targets.

## Motion and feedback

- Motion is limited to feedback that clarifies a state change. Prefer opacity/transform and a short ease-out transition.
- Respect `prefers-reduced-motion`.
- Loading feedback should identify the specific operation and keep the page navigable where possible. Do not use scanner or searchlight effects.
- Never invent an elapsed-time estimate. Show actual page counts, emitted events, and current task state.

## Overlay language

- Overlay categories have stable colors on the unchanged PDF surface.
- Categories must also differ by stroke style, shape, or a readable label so color is not the only cue.
- Proposed detections remain visually distinct from accepted items. Unverified or conflicting scale keeps linear quantities locked and visibly in review.
- Evidence overlays must be tied to a sheet and drawing coordinates; do not render synthetic geometry as measured work.

## Copy rules

- Use direct engineering language: “Scale needs review”, “Page 6 of 25”, “Send pages to Meta for vision analysis”.
- Explain a control at its point of use only when the layout alone does not make its effect clear.
- Avoid marketing claims, fake agent dialogue, invented progress, and labels that claim an action completed before the endpoint confirms it.

## Token ownership

`bluetrace.tokens.css` owns application surfaces, semantic status colors, brand colors, UI-only MEP chip colors, spacing, radii, and font names. PDF overlay colors remain separate from theme-aware UI colors. Components should consume these tokens rather than adding new hard-coded theme palettes.
