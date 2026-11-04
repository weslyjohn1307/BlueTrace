/**
 * Real media slots. Paths are relative to film/public/.
 * Leave a value null until the real asset exists — the film then renders an honest,
 * clearly-labelled placeholder instead of simulated product UI.
 *
 * Footage rules (docs/hackathon/VIDEO_AND_SUBMISSION_CONTENT.md):
 *  - real, legible workspace recordings only; no simulated product behaviour
 *  - public-safe drawing; no customer identifiers or credentials on screen
 *  - 1920×1080 or larger, ≥ the slot duration below
 */
export const MEDIA: {
  voiceover: string | null;
  slotA: string | null;
  slotB: string | null;
  slotC: string | null;
} = {
  voiceover: null, // e.g. 'audio/voiceover.wav' — Meta model narration, 120 s, aligned to TIMELINE
  slotA: null, // e.g. 'footage/slot-a.mp4'
  slotB: null,
  slotC: null,
};
