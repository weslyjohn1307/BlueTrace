import { s } from './theme';

/**
 * Locked shot timing (seconds). Voiceover lines are the verified 2-minute narration in
 * Demo film narration timing — record VO against these windows.
 */
export const TIMELINE = [
  { id: 'open', start: 0, end: 10, vo: 'For mechanical estimators who need faster takeoffs and zero guesswork: Introducing BlueTraceAI. Built to turn complex construction drawings into verified takeoffs at the speed of thought.' },
  { id: 'layers', start: 10, end: 27, vo: 'BlueTraceAI is an ongoing MEP takeoff project. It began before this hackathon, with a simple goal: help estimators move from complex plan sheets to takeoffs they can verify.' },
  { id: 'thesis', start: 27, end: 43, vo: 'For this hackathon, I’m extending that foundation toward a team of specialized agents. Meta models help read drawing content; local geometry keeps measurement grounded.' },
  { id: 'slotA', start: 43, end: 62, vo: 'A visual guess is not a measurement. BlueTraceAI checks scale and drawing geometry, and surfaces uncertainty for review instead of presenting an unverified quantity as fact.' },
  { id: 'slotB', start: 62, end: 83, vo: 'Suggestions stay connected to the sheet. The estimator checks the evidence and decides what belongs in the takeoff.' },
  { id: 'slotC', start: 83, end: 103, vo: 'The copilot can help investigate the work in front of you, while keeping its answer tied to evidence the engineer can inspect.' },
  { id: 'return', start: 103, end: 115, vo: 'The aim is not to replace engineering judgment. It’s to make drawing review more traceable, and takeoff work easier to verify.' },
  { id: 'end', start: 115, end: 120, vo: 'BlueTraceAI. From drawing to reviewable takeoff.' },
] as const;

export type ShotId = (typeof TIMELINE)[number]['id'];

export const shot = (id: ShotId) => {
  const t = TIMELINE.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown shot ${id}`);
  return { from: s(t.start), durationInFrames: s(t.end) - s(t.start) };
};

export const TOTAL_FRAMES = s(TIMELINE[TIMELINE.length - 1].end);
