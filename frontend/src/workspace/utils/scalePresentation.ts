import type { ScaleStatus } from '../../api/contracts';

export type ScalePresentation = {
  kind: 'not_applicable' | 'verified' | 'calibrated' | 'conflict' | 'unverified' | 'pending';
  label: string;
  detail: string;
};

const NON_PLAN_TYPES = new Set(['schedule', 'legend', 'detail', 'diagram', 'riser', 'info', 'cover', 'index', 'other']);
const NON_PLAN_TITLE = /legend|schedule|abbreviation|symbol|detail|diagram|riser|notes|cover|index|specification/i;

export function scalePresentation(
  status: ScaleStatus | string,
  sheetType?: string | null,
  sheetTitle?: string,
): ScalePresentation {
  const type = sheetType?.toLowerCase() ?? '';
  if (NON_PLAN_TYPES.has(type) || (!type && NON_PLAN_TITLE.test(sheetTitle ?? ''))) {
    return {
      kind: 'not_applicable',
      label: 'Not applicable',
      detail: 'This sheet type does not use measured plan scale.',
    };
  }
  if (!type && status === 'UNVERIFIED') {
    return {
      kind: 'pending',
      label: 'Awaiting classification',
      detail: 'Scale state will be shown after sheet classification.',
    };
  }
  if (status === 'CONFLICT') {
    return {
      kind: 'conflict',
      label: 'Scale conflict',
      detail: 'Scale evidence conflicts. Measurements remain locked until resolved.',
    };
  }
  if (status === 'CALIBRATED') {
    return {
      kind: 'calibrated',
      label: 'Manually calibrated',
      detail: 'Scale was calibrated by an engineer on this sheet.',
    };
  }
  if (status === 'VERIFIED') {
    return {
      kind: 'verified',
      label: 'Scale verified',
      detail: 'The printed scale was verified for this sheet.',
    };
  }
  return {
    kind: 'unverified',
    label: status === 'NOT_TO_SCALE' ? 'Not to scale' : 'Scale needs review',
    detail: 'Measured lengths stay in review until scale is verified or calibrated.',
  };
}
