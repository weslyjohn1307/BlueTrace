import type { ObjectItem, RouteItem, SheetItem } from '../../api/contracts';

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, data: unknown) {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function generateTakeoffCsv(
  _projectName: string,
  objects: ObjectItem[],
  routes: RouteItem[],
  _sheets: SheetItem[],
  scaleRatioLabel?: string | null,
  scaleRatioValue?: number | null
): string {
  const headers = [
    'Item ID',
    'Sheet ID',
    'Level',
    'Object Type',
    'Confidence',
    'Drawing Length (pt)',
    'Physical Length (m)',
    'Scale Status',
    'Review Status',
  ];

  const rows: string[][] = [];

  // L1 Objects
  objects.forEach((obj) => {
    rows.push([
      `"${obj.object_id}"`,
      `"${obj.sheet_id || ''}"`,
      '"Level 1 (Object)"',
      `"${obj.object_type}"`,
      obj.confidence !== null && obj.confidence !== undefined ? String(obj.confidence) : '""',
      '""',
      '""',
      '""',
      `"${obj.review_projection?.reviewed_status || 'PENDING'}"`,
    ]);
  });

  // L2 Routes
  routes.forEach((route) => {
    const points = route.geometry?.location_or_path?.points || [];
    let routePt = 0;
    for (let i = 1; i < points.length; i++) {
      const dx = points[i][0] - points[i - 1][0];
      const dy = points[i][1] - points[i - 1][1];
      routePt += Math.sqrt(dx * dx + dy * dy);
    }

    const physicalM =
      scaleRatioValue && routePt > 0
        ? (routePt * scaleRatioValue).toFixed(2)
        : route.physical_length_m
        ? route.physical_length_m.toFixed(2)
        : '';

    rows.push([
      `"${route.route_id}"`,
      `"${route.sheet_id || ''}"`,
      '"Level 2 (Route)"',
      `"${route.object_type}"`,
      '""',
      String(Math.round(routePt)),
      physicalM ? `"${physicalM}"` : '""',
      `"${scaleRatioLabel || route.scale_status || 'SCALE_UNREADABLE'}"`,
      `"${route.review_projection?.reviewed_status || 'PENDING'}"`,
    ]);
  });

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export function generateTakeoffJson(
  runId: string,
  projectName: string,
  objects: ObjectItem[],
  routes: RouteItem[],
  scaleRatioLabel?: string | null,
  scaleRatioValue?: number | null
) {
  const items = [
    ...objects.map((obj) => ({
      id: obj.object_id,
      entity_type: obj.object_type,
      category: 'LEVEL_1_OBJECT',
      sheet_id: obj.sheet_id,
      confidence: obj.confidence,
      count_or_length: 1,
      unit: 'count',
      review_status: obj.review_projection?.reviewed_status || 'PENDING',
    })),
    ...routes.map((route) => {
      const points = route.geometry?.location_or_path?.points || [];
      let routePt = 0;
      for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i - 1][0];
        const dy = points[i][1] - points[i - 1][1];
        routePt += Math.sqrt(dx * dx + dy * dy);
      }

      const physicalM =
        scaleRatioValue && routePt > 0
          ? parseFloat((routePt * scaleRatioValue).toFixed(2))
          : route.physical_length_m ?? null;

      return {
        id: route.route_id,
        entity_type: route.object_type,
        category: 'LEVEL_2_ROUTE',
        sheet_id: route.sheet_id,
        drawing_length_pt: Math.round(routePt),
        physical_length_m: physicalM,
        scale_status: scaleRatioLabel ? 'MANUALLY_CONFIRMED' : route.scale_status || 'SCALE_UNREADABLE',
        continuity_status: route.continuity_status,
        review_status: route.review_projection?.reviewed_status || 'PENDING',
      };
    }),
  ];

  return {
    run_id: runId,
    project_name: projectName,
    timestamp: new Date().toISOString(),
    total_objects: objects.length,
    total_routes: routes.length,
    scale_calibration: scaleRatioLabel || 'UNVERIFIED',
    takeoff_ledger: items,
  };
}
