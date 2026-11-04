import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { GlobalTopNav } from '../app/GlobalTopNav';
import { useTakeoffSession } from './hooks/useTakeoffSession';
import { UploadCard } from './components/UploadCard';
import { PackageIntake } from './components/PackageIntake';
import { ActivityTray } from './components/ActivityTray';
import { SheetCanvas, type CalibrationResult, type CanvasPin, type VectorRun } from './components/SheetCanvas';
import { CalibrationModal } from './components/CalibrationModal';
import { HoverBadge } from './components/HoverBadge';
import { type SheetItemData } from './components/SheetTree';
import { LedgerPanel } from './components/LedgerPanel';
import { CorrectionModal, type CorrectionSubmitPayload } from './components/CorrectionModal';
import { RejectionModal } from './components/modals/RejectionModal';
import { SchedulePanel } from './components/SchedulePanel';
import { QAPanel } from './components/QAPanel';
import { CopilotPanel } from './components/CopilotPanel';
import { DiscrepancyList } from './components/DiscrepancyList';
import {
  WorkstationHeader,
  SidebarLeft,
  SidebarRight,
  ViewportContainer,
} from './components/layout';
import { apiClient, ApiError } from '../api/client';
import type {
  CursorCropResponse,
  DiscrepancyItem,
  QAAnnotation,
  QAChecklist,
  ReconcilePlanSymbol,
  ReconcileScheduledItem,
  ScheduledItem,
  TakeoffRecord,
} from '../api/contracts';
import { mapReconcileGhostPins, pinFocusCoords } from './utils/reconcilePins';
import { agentDisplayName, progressDisplayMessage } from './utils/agentDisplay';
import { debugSkipUnknownItem, logAcceptTelemetry, logRejectTelemetry, logReviewTelemetry } from './utils/reviewTelemetry';
import { displaySheetNumber } from './utils/sheetLabels';

type RightTab = 'ledger' | 'schedule' | 'qa' | 'copilot';
type SheetPanelMode = 'tree' | 'filmstrip';

export const TakeoffWorkspace: React.FC = () => {
  const { state, checkBackend, selectFile, openFixture, selectSheet, selectPreviewPage, scanAll, cancelAnalysis, resumeAnalysis, setMetaConsent, setItemStatus, reset, refreshLedger, applyCalibrationResult } =
    useTakeoffSession();
  const [badge, setBadge] = useState<CursorCropResponse | null>(null);
  const [badgeBusy, setBadgeBusy] = useState(false);
  const [badgeCursor, setBadgeCursor] = useState<[number, number] | null>(null);
  const [ghostPins, setGhostPins] = useState<CanvasPin[]>([]);
  const [evidencePins, setEvidencePins] = useState<CanvasPin[]>([]);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ x: number; y: number; zoom?: number; timestamp?: number } | null>(null);
  const [disciplineFilter, setDisciplineFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [reconcileError, setReconcileError] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightTab>('ledger');
  const [qaAnnotations, setQaAnnotations] = useState<QAAnnotation[]>([]);
  const [qaChecklist, setQaChecklist] = useState<QAChecklist[]>([]);
  const [qaLoading, setQaLoading] = useState(false);
  const [qaError, setQaError] = useState<string | null>(null);
  const qaOpenCount = qaAnnotations.filter((a) => a.status === 'OPEN').length;
  // Keep both side panels open on wide workstations. At smaller sizes they
  // become drawers so the drawing retains the full work area by default.
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(() => window.innerWidth >= 1280);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() => window.innerWidth >= 1280);
  const wideViewportRef = useRef(window.innerWidth >= 1280);

  useEffect(() => {
    const syncPanelLayout = () => {
      const nextWide = window.innerWidth >= 1280;
      if (nextWide === wideViewportRef.current) return;

      wideViewportRef.current = nextWide;
      setLeftSidebarOpen(nextWide);
      setRightSidebarOpen(nextWide);
    };

    window.addEventListener('resize', syncPanelLayout);
    return () => window.removeEventListener('resize', syncPanelLayout);
  }, []);
  // Sheets panel view: hierarchical tree (default) or thumbnail filmstrip.
  const [sheetPanelMode, setSheetPanelMode] = useState<SheetPanelMode>('tree');
  // Two-point calibration session state: points from the canvas, modal
  // confirm posts to the backend, then the session (sheet meta + ledger)
  // refreshes so footage recomputes under the calibrated scale.
  const [calPoints, setCalPoints] = useState<{ p1: [number, number]; p2: [number, number] } | null>(null);
  const [calOpen, setCalOpen] = useState(false);
  const [calSubmitting, setCalSubmitting] = useState(false);
  const [calError, setCalError] = useState<string | null>(null);
  const [calibrationResult, setCalibrationResult] = useState<CalibrationResult | null>(null);
  // REV-002 correction session: which ledger item the CorrectionModal is editing.
  const [correctingItem, setCorrectingItem] = useState<TakeoffRecord | null>(null);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  // Rejection modal session: which ledger item the RejectionModal is rejecting.
  const [rejectingItem, setRejectingItem] = useState<TakeoffRecord | null>(null);

  // Optimistic status transitions (<16ms instant feedback)
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<
      string,
      {
        status: 'SUGGESTED' | 'ACCEPTED' | 'CORRECTED' | 'REJECTED' | 'CANNOT_DETERMINE';
        dimension_label?: string;
        system?: string;
      }
    >
  >({});

  useEffect(() => {
    setOptimisticOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const item of state.items) {
        if (next[item.item_id] && item.status === next[item.item_id].status) {
          delete next[item.item_id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [state.items]);

  const effectiveItems = useMemo(() => {
    return state.items.map((item) => {
      const override = optimisticOverrides[item.item_id];
      if (!override) return item;
      return {
        ...item,
        status: override.status,
        dimension_label: override.dimension_label ?? item.dimension_label,
        system: override.system ?? item.system,
      };
    });
  }, [state.items, optimisticOverrides]);

  // Ruler overlay is per-sheet evidence: never let it leak across sheets.
  const activeSheetId = state.activeSheetId;
  useEffect(() => {
    setCalibrationResult(null);
  }, [activeSheetId]);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const refreshQAAnnotations = useCallback(async () => {
    if (!state.projectName) {
      setQaAnnotations([]);
      setQaChecklist([]);
      return;
    }
    setQaLoading(true);
    setQaError(null);
    try {
      const [annotations, watchdog] = await Promise.all([
        apiClient.listQAAnnotations(state.projectName, { status: 'OPEN' }),
        apiClient.runWatchdogQA({ project_id: state.projectName }),
      ]);
      setQaAnnotations(annotations);
      setQaChecklist(watchdog.checklist);
    } catch (err) {
      setQaError(err instanceof ApiError ? err.message : 'Failed to load QA annotations.');
    } finally {
      setQaLoading(false);
    }
  }, [state.projectName]);

  useEffect(() => {
    void refreshQAAnnotations();
  }, [refreshQAAnnotations]);

  const handleQAResolve = useCallback(
    (annotationId: string, status: 'CONFIRMED' | 'DISMISSED', reason?: string) => {
      void apiClient
        .resolveQAAnnotation(annotationId, { status, resolution_reason: reason })
        .then(() => refreshQAAnnotations())
        .catch((err: unknown) => {
          setQaError(err instanceof ApiError ? err.message : 'Failed to resolve QA annotation.');
        });
    },
    [refreshQAAnnotations]
  );

  const activeSheet = state.sheets.find((s) => s.meta.sheet_id === state.activeSheetId) ?? null;
  const treeSheets: SheetItemData[] = state.sheets.map((s) => ({
    sheet_id: s.meta.sheet_id,
    sheet_number: s.meta.sheet_number,
    sheet_title: s.meta.sheet_title,
    discipline: s.meta.discipline,
    scale_raw: s.meta.scale_raw,
    scale_ratio: s.meta.scale_ratio,
    scale_status: s.meta.scale_status,
    page_index: s.meta.page_index,
    sheet_type: s.meta.sheet_type,
  }));

  const vectorRuns: VectorRun[] = effectiveItems.flatMap((item) => {
    if (state.activeSheetId && item.sheet_id !== state.activeSheetId) return [];
    const geometry = item.geometry as { points?: unknown };
    if (
      geometry === null ||
      typeof geometry !== 'object' ||
      !Array.isArray(geometry.points) ||
      geometry.points.length < 2
    ) {
      return [];
    }
    const points = geometry.points.filter(
      (pt): pt is [number, number] =>
        Array.isArray(pt) &&
        pt.length >= 2 &&
        typeof pt[0] === 'number' &&
        typeof pt[1] === 'number' &&
        Number.isFinite(pt[0]) &&
        Number.isFinite(pt[1])
    ) as [number, number][];
    if (points.length < 2) return [];
    return [
      {
        id: item.item_id,
        points,
        system: item.system,
        status: item.status,
        reviewRequired: item.review_required ?? false,
        label: item.dimension_label,
        length_ft: item.total_length_ft,
      },
    ];
  });

  const itemPins: CanvasPin[] = effectiveItems.flatMap<CanvasPin>((item) => {
    const geometry = item.geometry as { type?: unknown; coordinates?: unknown; bbox?: unknown };
    if (geometry === null || typeof geometry !== 'object' || Array.isArray(geometry)) return [];

    if (
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.length >= 2 &&
      typeof geometry.coordinates[0] === 'number' &&
      typeof geometry.coordinates[1] === 'number' &&
      Number.isFinite(geometry.coordinates[0]) &&
      Number.isFinite(geometry.coordinates[1])
    ) {
      return [{
        id: item.item_id,
        x: geometry.coordinates[0],
        y: geometry.coordinates[1],
        kind: 'item' as const,
        label: item.dimension_label,
        tag: item.dimension_label,
        system: item.system,
        status: item.status,
        confidence: item.confidence ?? undefined,
      }];
    }

    if (
      geometry.type === 'bbox' &&
      Array.isArray(geometry.bbox) &&
      geometry.bbox.length === 4 &&
      geometry.bbox.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
    ) {
      const [x0, y0, x1, y1] = geometry.bbox as [number, number, number, number];
      const bbox: [number, number, number, number] = [
        Math.min(x0, x1),
        Math.min(y0, y1),
        Math.max(x0, x1),
        Math.max(y0, y1),
      ];
      return [{
        id: item.item_id,
        x: (bbox[0] + bbox[2]) / 2,
        y: (bbox[1] + bbox[3]) / 2,
        kind: 'symbol' as const,
        label: item.dimension_label,
        tag: item.dimension_label,
        system: item.system,
        status: item.status,
        confidence: item.confidence ?? undefined,
        reviewRequired: item.review_required ?? item.status === 'SUGGESTED',
        bbox,
      }];
    }

    return [];
  });

  const handlePlaceGhostPin = (ghostId: string, pagePoint: [number, number]) => {
    if (state.projectName && state.activeSheetId) {
      // Placing a ghost pin IS an accept: the scheduled equipment is confirmed
      // at this plan location, so the event is ACCEPT/ACCEPTED (never CORRECT).
      const prevPin = ghostPins.find((p) => p.id === ghostId || p.tag === ghostId);
      if (!prevPin || !prevPin.status) {
        debugSkipUnknownItem(ghostId, 'ACCEPT');
      } else {
        logAcceptTelemetry({
          projectId: state.projectName,
          sheetId: state.activeSheetId,
          itemId: ghostId,
          previousStatus: prevPin.status,
          pageIndex: activeSheet?.pageIndex ?? null,
          originalOutput: prevPin
            ? { tag: prevPin.tag, system: prevPin.system ?? null }
            : null,
          correctedOutput: { page_point: pagePoint },
        });
      }
    }
    setGhostPins((prev) =>
      prev.map((pin) =>
        pin.id === ghostId || pin.tag === ghostId
          ? {
              ...pin,
              x: pagePoint[0],
              y: pagePoint[1],
              status: 'ACCEPTED',
              kind: 'item',
            }
          : pin
      )
    );
    setDiscrepancies((prev) =>
      prev.map((d) =>
        d.item_id === ghostId || `ghost-${d.tag}` === ghostId || d.tag === ghostId
          ? {
              ...d,
              status: 'MATCHED',
              location_pt: pagePoint,
              variance: 0,
              plan_qty: d.schedule_qty,
            }
          : d
      )
    );
  };

  const handleLocateItem = (coords: [number, number], zoom = 1.5) => {
    setFocusTarget({
      x: coords[0],
      y: coords[1],
      zoom,
      timestamp: Date.now(),
    });
  };

  const handleCalibrationPointsSelected = useCallback((p1: [number, number], p2: [number, number]) => {
    setCalPoints({ p1, p2 });
    setCalError(null);
    setCalOpen(true);
  }, []);

  const handleCalibrationCancel = useCallback(() => {
    setCalOpen(false);
    setCalPoints(null);
    setCalError(null);
    setCalSubmitting(false);
  }, []);

  const handleCalibrationConfirm = useCallback(
    async (payload: { realFt: number; realIn: number }) => {
      if (!activeSheet || !calPoints) return;
      setCalSubmitting(true);
      setCalError(null);
      try {
        const resp = await apiClient.calibrateSheetScale(activeSheet.meta.sheet_id, {
          p1: calPoints.p1,
          p2: calPoints.p2,
          real_ft: payload.realFt,
          real_in: payload.realIn,
        });
        const lengthPt = Math.hypot(calPoints.p2[0] - calPoints.p1[0], calPoints.p2[1] - calPoints.p1[1]);
        setCalibrationResult({
          p1: calPoints.p1,
          p2: calPoints.p2,
          lengthPt,
          scaleRatio: resp.scale_ratio,
          scaleRaw: resp.scale_raw,
        });
        await applyCalibrationResult(activeSheet.meta.sheet_id, {
          scale_ratio: resp.scale_ratio,
          scale_raw: resp.scale_raw,
          scale_status: 'CALIBRATED',
        });
        setCalOpen(false);
        setCalPoints(null);
      } catch (err) {
        setCalError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Calibration failed. Previous scale is unchanged.'
        );
      } finally {
        setCalSubmitting(false);
      }
    },
    [activeSheet, calPoints, applyCalibrationResult]
  );

  const runReconcile = useCallback(
    async (scheduled: ReconcileScheduledItem[], planSymbols?: ReconcilePlanSymbol[]) => {
      if (scheduled.length === 0) return;
      setReconcileError(null);
      try {
        const derivedSymbols: ReconcilePlanSymbol[] =
          planSymbols ??
          (state.activeSheetId
            ? itemPins.map((pin) => ({
                label: pin.tag || pin.label || pin.id,
                sheet_id: state.activeSheetId as string,
                location_pt: [pin.x, pin.y] as [number, number],
                system: pin.system,
              }))
            : []);
        const report = await apiClient.reconcileTakeoff({
          project_id: state.projectName || undefined,
          sheet_id: state.activeSheetId ?? undefined,
          scheduled_items: scheduled,
          plan_symbols: derivedSymbols,
        });
        setDiscrepancies(report.discrepancies ?? []);
        const newGhostPins = mapReconcileGhostPins(report.ghost_pins ?? []);
        // Wholesale-replace reconcile-sourced ghosts so a successful reconcile
        // with zero ghosts clears stale UNPLACED ghosts. Placed pins (kind
        // flipped to 'item' / status ACCEPTED by handlePlaceGhostPin) and
        // evidence/item pins (held outside ghostPins) are preserved.
        setGhostPins((prev) => [
          ...prev.filter((pin) => pin.kind !== 'ghost' || pin.status === 'ACCEPTED'),
          ...newGhostPins,
        ]);
        setReconcileError(null);
      } catch (err) {
        // Fail closed: keep existing discrepancies/pins, never fabricate results.
        setReconcileError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Reconciliation failed. Previous results are unchanged.'
        );
      }
    },
    // itemPins is derived from state.items on every render; reconcile reads the latest via closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.projectName, state.activeSheetId, state.items]
  );

  // Convenience overload for SchedulePanel's ScheduledItem[] shape.
  const runReconcileFromSchedule = useCallback(
    (scheduled: ScheduledItem[], scheduleSheet: string) => {
      const mapped: ReconcileScheduledItem[] = scheduled.map((item) => ({
        tag: item.tag,
        description: item.description,
        schedule_sheet: scheduleSheet,
        quantity: 1,
        system: item.system,
        cfm: item.cfm ?? undefined,
        dimension: item.dimension ?? undefined,
      }));
      return runReconcile(mapped);
    },
    [runReconcile]
  );

  const handleEvidence = (boxes: number[][]) => {
    if (!boxes || boxes.length === 0) return;
    const newPins: CanvasPin[] = boxes.map((box, i) => {
      const x = box.length >= 4 ? (box[0] + box[2]) / 2 : box[0];
      const y = box.length >= 4 ? (box[1] + box[3]) / 2 : box[1];
      return {
        id: `evidence-${Date.now()}-${i}`,
        x,
        y,
        kind: 'evidence' as const,
        label: `Evidence [${x.toFixed(0)}, ${y.toFixed(0)}]`,
        tag: `EV-${i + 1}`,
        status: 'MATCHED',
      };
    });
    setEvidencePins(newPins);
    if (newPins.length > 0) {
      setFocusTarget({
        x: newPins[0].x,
        y: newPins[0].y,
        zoom: 1.5,
        timestamp: Date.now(),
      });
    }
  };

  const allPins: CanvasPin[] = [...itemPins, ...ghostPins, ...evidencePins];

  const filteredPins = allPins.filter((pin) => {
    if (disciplineFilter !== 'ALL') {
      const disc = (pin.discipline || pin.system || '').toLowerCase();
      if (!disc.includes(disciplineFilter.toLowerCase())) return false;
    }
    if (statusFilter !== 'ALL') {
      const st = (pin.status || '').toUpperCase();
      if (statusFilter === 'GHOST' && pin.kind !== 'ghost' && st !== 'UNPLACED_GHOST') {
        return false;
      }
      if (
        statusFilter === 'DISCREPANCIES' &&
        st !== 'UNDERCOUNT' &&
        st !== 'OVERCOUNT' &&
        st !== 'UNPLACED_GHOST'
      ) {
        return false;
      }
      if (statusFilter === 'MATCHED' && st !== 'MATCHED' && st !== 'ACCEPTED') {
        return false;
      }
    }
    return true;
  });

  const handleCrop = async (cursorPt: [number, number], imageBase64: string) => {
    if (!activeSheet || badgeBusy) return;
    setBadgeBusy(true);
    setBadgeCursor(cursorPt);
    try {
      const res = await apiClient.extractCropOcr({
        sheet_id: activeSheet.meta.sheet_id,
        cursor_pt: cursorPt,
        crop_size_pt: 150,
        image_base64: imageBase64,
      });
      setBadge(res);
    } catch {
      setBadge(null);
    } finally {
      setBadgeBusy(false);
    }
  };

  const acceptBadge = useCallback(async () => {    if (!badge || !badgeCursor || !activeSheet || badge.review_required) return;
    const parsed = badge.parsed_dimension;
    const label = parsed
      ? `${parsed.width_in}${parsed.height_in ? `x${parsed.height_in}` : ''} ${parsed.shape === 'ROUND' ? 'Round' : 'Rectangular'} Duct`
      : badge.detected_text || 'QuickDraw dimension';
    try {
      await apiClient.createTakeoffItem({
        project_id: state.projectName || 'default_project',
        sheet_id: activeSheet.meta.sheet_id,
        category: 'DUCTWORK',
        system: 'Supply Air',
        dimension_label: label,
        status: 'ACCEPTED',
        source: 'QUICKDRAW_HOVER',
        total_length_ft: 0,
        count: 1,
        geometry: { type: 'point', coordinates: [badgeCursor[0], badgeCursor[1]] },
        confidence: badge.confidence,
      });
      setBadge(null);
      await refreshLedger();
    } catch {
      setBadge(null);
    }
  }, [badge, badgeCursor, activeSheet, state.projectName, refreshLedger]);

  const handleCorrectionCancel = useCallback(() => {
    setCorrectingItem(null);
    setCorrectionError(null);
    setCorrectionSubmitting(false);
  }, []);

  const handleCorrectionSubmit = useCallback(
    async (
      payload: CorrectionSubmitPayload,
      context: {
        projectId: string | null;
        sheetId: string | null;
        item: TakeoffRecord | null;
      },
    ) => {
      setCorrectionSubmitting(true);
      setCorrectionError(null);
      if (context.item) {
        setOptimisticOverrides((prev) => ({
          ...prev,
          [payload.itemId]: {
            status: 'CORRECTED',
            dimension_label: payload.correctedValues.dimensionLabel,
            system: payload.correctedValues.system,
          },
        }));
      }
      setCorrectingItem(null);
      try {
        await apiClient.submitItemCorrection(payload.itemId, {
          status: payload.status,
          reason: payload.reason,
          originalProposal: payload.originalProposal,
          correctedValues: payload.correctedValues,
        });
        // CORRECT is reserved for explicit CorrectionModal submits: the
        // reviewer overrode the proposal, so the event carries both sides.
        // Ghost-pin placement is an ACCEPT and never logs here.
        if (context.projectId && context.sheetId) {
          if (!context.item) {
            debugSkipUnknownItem(payload.itemId, 'CORRECT');
          } else {
            logReviewTelemetry({
              projectId: context.projectId,
              sheetId: context.sheetId,
              itemId: payload.itemId,
              action: 'CORRECT',
              previousStatus: context.item.status,
              newStatus: 'CORRECTED',
              originalOutput: {
                dimension_label: payload.originalProposal.dimensionLabel,
                cfm: payload.originalProposal.cfm,
                system: payload.originalProposal.system,
                category: payload.originalProposal.category,
              },
              correctedOutput: {
                dimension_label: payload.correctedValues.dimensionLabel,
                cfm: payload.correctedValues.cfm,
                system: payload.correctedValues.system,
                category: payload.correctedValues.category,
              },
              correctionReason: payload.reason,
            });
          }
        }
        await refreshLedger();
      } catch (err) {
        // Failure rollback: restore previous values
        setOptimisticOverrides((prev) => {
          const next = { ...prev };
          delete next[payload.itemId];
          return next;
        });
        setCorrectingItem(context.item);
        // Fail closed: keep the modal open with the error; ledger is untouched.
        setCorrectionError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Correction failed. Previous values are unchanged.'
        );
      } finally {
        setCorrectionSubmitting(false);
      }
    },
    [refreshLedger]
  );

  const handleAcceptItem = useCallback(
    async (id: string) => {
      const item = effectiveItems.find((i) => i.item_id === id);
      const prevStatus = item?.status ?? 'SUGGESTED';
      // Immediate optimistic transition (<16ms)
      setOptimisticOverrides((prev) => ({
        ...prev,
        [id]: { status: 'ACCEPTED' },
      }));
      try {
        await setItemStatus(id, 'ACCEPTED');
        if (state.projectName && state.activeSheetId) {
          if (!item) {
            debugSkipUnknownItem(id, 'ACCEPT');
          } else {
            logAcceptTelemetry({
              projectId: state.projectName,
              sheetId: state.activeSheetId,
              itemId: id,
              previousStatus: prevStatus,
              originalOutput: item
                ? { dimension_label: item.dimension_label, system: item.system }
                : null,
            });
          }
        }
      } catch {
        // Failure rollback
        setOptimisticOverrides((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [effectiveItems, setItemStatus, state.projectName, state.activeSheetId]
  );

  // Viewport autosave sink: SheetCanvas debounces manual pan/zoom and calls
  // this with the settled coordinates; the PUT restores on next launch.
  const handleViewportSave = useCallback(
    (viewport: { viewport_scale: number; viewport_tx: number; viewport_ty: number }) => {
      const pid = state.projectName;
      if (!pid) return Promise.resolve();
      return apiClient.saveProjectSession(pid, viewport).then(() => undefined);
    },
    [state.projectName]
  );

  // Rehydrated sessions carry no pdf bytes until the sheet row's stored
  // pdf_path resolves (persisted at scan time for feedback crops); a restored
  // sheet with an empty pdfPath shows an explicit re-open prompt instead of a
  // broken image request. Never fabricate a path.
  const sheetImageAvailable = activeSheet !== null && activeSheet.pdfPath !== '';

  // Global Keyboard Shortcuts ([, ], Cmd+K, Esc, Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === '[') {
        e.preventDefault();
        setLeftSidebarOpen((prev) => !prev);
      } else if (e.key === ']') {
        e.preventDefault();
        setRightSidebarOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        if (rightTab === 'copilot' && rightSidebarOpen) setRightSidebarOpen(false);
        else {
          setRightTab('copilot');
          setRightSidebarOpen(true);
          if (window.innerWidth < 1280) setLeftSidebarOpen(false);
        }
      } else if (e.key === 'Escape') {
        if (rightSidebarOpen) setRightSidebarOpen(false);
        if (badge) setBadge(null);
      } else if (e.key === 'Enter' && badge && !badge.review_required) {
        e.preventDefault();
        void acceptBadge();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [rightTab, rightSidebarOpen, badge, acceptBadge]);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const showWorkspace = activeSheet !== null;
  const packageBusy =
    state.stage === 'uploading' || state.stage === 'scanning' || state.stage === 'orchestrating';
  const scaleOk =
    activeSheet &&
    (activeSheet.meta.scale_status === 'VERIFIED' || activeSheet.meta.scale_status === 'CALIBRATED');

  const handlePackagePageChange = useCallback((pageIndex: number) => {
    const indexedSheet = state.sheets.find((sheet) => sheet.pageIndex === pageIndex);
    if (indexedSheet) selectSheet(indexedSheet.meta.sheet_id);
    else void selectPreviewPage(pageIndex);
  }, [state.sheets, selectSheet, selectPreviewPage]);

  return (
    <div className="bt-app workspace-root flex h-screen min-h-0 select-none flex-col overflow-hidden bg-bt-canvas text-bt-text-primary">
      <GlobalTopNav
        backendOnline={state.backendOnline}
        aiConfigured={state.aiConfigured}
        fileActionsDisabled={packageBusy}
        onLoadSample={() => void openFixture('fixtures/mechanical/hvac_plan_level2.pdf')}
        onNewAnalysis={reset}
        onFileSelect={(file) => void selectFile(file)}
      />

      {!showWorkspace ? (
        <main className="flex flex-1 items-center justify-center overflow-y-auto p-4">
          {state.stage === 'orchestrating' && state.agentProgress ? (
            <section
              data-testid="package-processing-state"
              aria-live="polite"
              className="mx-auto flex w-full max-w-md flex-col items-center justify-center rounded-xl border border-bt-border-subtle bg-bt-surface p-6 text-center shadow-lg"
            >
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-bt-brand border-t-transparent" />
              <h2 className="text-base font-semibold text-bt-text-primary">
                Reading drawing package…
              </h2>
              <p className="mt-1 text-xs font-medium text-bt-brand">
                {agentDisplayName(state.agentProgress.currentAgent)}
              </p>
              <p className="mt-1 text-xs text-bt-text-secondary">
                {progressDisplayMessage(state.agentProgress.currentMessage)}
              </p>
              {typeof state.agentProgress.totalPages === 'number' && state.agentProgress.totalPages > 0 && (
                <p className="mt-2 font-mono text-xs text-bt-text-tertiary">
                  {state.agentProgress.classifiedPages} of {state.agentProgress.totalPages} pages classified
                </p>
              )}
            </section>
          ) : (
            <UploadCard
              loading={packageBusy}
              loadingStage={state.stage === 'uploading' || state.stage === 'scanning' ? state.stage : undefined}
              error={state.error}
              onFile={(file) => void selectFile(file)}
            />
          )}
        </main>
      ) : (
        <main className="relative flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          <SidebarLeft
            open={leftSidebarOpen}
            sheetPanelMode={sheetPanelMode}
            onSheetPanelModeChange={setSheetPanelMode}
            treeSheets={treeSheets}
            sheets={state.sheets}
            activeSheetId={state.activeSheetId}
            onSelectSheet={selectSheet}
            projectId={state.projectName || null}
            onClose={() => setLeftSidebarOpen(false)}
          />

          <div className="relative flex flex-1 flex-col overflow-hidden" style={{ minHeight: 0 }}>
            <WorkstationHeader
              sheetNumber={displaySheetNumber(activeSheet.meta.sheet_number, activeSheet.pageIndex)}
              sheetTitle={activeSheet.meta.sheet_title}
              discipline={activeSheet.meta.discipline}
              scaleRaw={activeSheet.meta.scale_raw}
              scaleStatus={activeSheet.meta.scale_status}
              sheetType={activeSheet.meta.sheet_type}
              leftSidebarOpen={leftSidebarOpen}
              onToggleLeftSidebar={() => {
                const nextOpen = !leftSidebarOpen;
                setLeftSidebarOpen(nextOpen);
                if (nextOpen && window.innerWidth < 1280) setRightSidebarOpen(false);
              }}
              rightSidebarOpen={rightSidebarOpen}
              onToggleRightSidebar={() => {
                const nextOpen = !rightSidebarOpen;
                setRightSidebarOpen(nextOpen);
                if (nextOpen && window.innerWidth < 1280) setLeftSidebarOpen(false);
              }}
              disciplineFilter={disciplineFilter as 'ALL' | 'Supply' | 'Return' | 'Exhaust'}
              onDisciplineFilterChange={setDisciplineFilter}
              statusFilter={statusFilter as 'ALL' | 'MATCHED' | 'DISCREPANCIES' | 'GHOST'}
              onStatusFilterChange={setStatusFilter}
              onOpenCopilot={() => {
                setRightTab('copilot');
                setRightSidebarOpen(true);
                if (window.innerWidth < 1280) setLeftSidebarOpen(false);
              }}
            />

            {state.source && activeSheet ? (
              <PackageIntake
                fileName={state.source.fileName}
                pageIndex={activeSheet.pageIndex}
                totalPages={state.totalPages}
                summarySheets={state.sheets.map((sheet) => ({
                  sheetType: sheet.meta.sheet_type,
                  title: sheet.meta.sheet_title,
                  discipline: sheet.meta.discipline,
                  scaleStatus: sheet.meta.scale_status,
                }))}
                sheetNumber={activeSheet.meta.sheet_number}
                sheetTitle={activeSheet.meta.sheet_title}
                discipline={activeSheet.meta.discipline}
                scaleStatus={activeSheet.meta.scale_status}
                sheetType={activeSheet.meta.sheet_type}
                progress={state.agentProgress}
                analysisScope={state.agentProgress?.analysisScope ?? null}
                metaConsent={state.metaConsent}
                onMetaConsentChange={setMetaConsent}
                agentName={agentDisplayName(state.agentProgress?.currentAgent)}
                message={progressDisplayMessage(state.agentProgress?.currentMessage)}
                running={state.stage === 'orchestrating'}
                onPageChange={handlePackagePageChange}
              onStart={(metaConsent) => void scanAll(state.source!.filePath, state.source!.fileName, state.projectName, { metaConsent, analysisScope: metaConsent ? 'vision' : 'all' })}
                onCancel={() => void cancelAnalysis()}
                onResume={() => void resumeAnalysis()}
              />
            ) : null}

            <ViewportContainer
              error={state.error}
              reconcileError={reconcileError}
              sheetImageAvailable={sheetImageAvailable}
            >
              <SheetCanvas
                imageUrl={apiClient.getPageImageUrl(activeSheet.pdfPath, activeSheet.pageIndex, 150)}
                thumbnailUrl={apiClient.getPageImageUrl(activeSheet.pdfPath, activeSheet.pageIndex, 72)}
                widthPt={activeSheet.meta.width_pt}
                heightPt={activeSheet.meta.height_pt}
                pins={filteredPins}
                vectorRuns={vectorRuns}
                cropEnabled={state.metaConsent}
                metaEnabled={state.metaConsent}
                scaleRatio={activeSheet.meta.scale_ratio ?? undefined}
                scaleStatus={activeSheet.meta.scale_status}
                calibrationResult={calibrationResult}
                onCalibrationPointsSelected={handleCalibrationPointsSelected}
                onCalibrationCancel={handleCalibrationCancel}
                selectedPinId={selectedPinId}
                projectId={state.projectName || null}
                onViewportSave={handleViewportSave}
                initialTransform={state.initialTransform}
                onSelectPin={(pin) => {
                  setSelectedPinId(pin.id);
                  const focus = pinFocusCoords(pin);
                  if (focus) handleLocateItem(focus);
                }}
                onPlaceGhostPin={handlePlaceGhostPin}
                focusTarget={focusTarget}
                onCropRequest={(pt, b64) => void handleCrop(pt, b64)}
                renderBadge={(screen) =>
                  badge ? (
                    <HoverBadge
                      x={screen.x}
                      y={screen.y}
                      detectedText={badge.detected_text}
                      latencyMs={badge.latency_ms}
                      confidence={badge.confidence}
                      reviewRequired={badge.review_required}
                      onAccept={badge.review_required ? undefined : () => void acceptBadge()}
                      onReject={() => setBadge(null)}
                    />
                  ) : badgeBusy ? (
                    <HoverBadge x={screen.x} y={screen.y} detectedText="" latencyMs={0} confidence={0} />
                  ) : null
                }
              />
            </ViewportContainer>
          </div>

          {/* Right Ledger & Schedule Sidebar (Progressive Disclosure) */}
          <SidebarRight
            open={rightSidebarOpen}
            rightTab={rightTab}
            onTabChange={setRightTab}
            qaOpenCount={qaOpenCount}
            onClose={() => setRightSidebarOpen(false)}
          >
            {rightTab === 'ledger' && (
              <LedgerPanel
                items={effectiveItems}
                summary={state.summary}
                loading={state.itemsLoading}
                scaleCalibrated={Boolean(scaleOk)}
                onAccept={(id) => void handleAcceptItem(id)}
                onReject={(id) => {
                  const item = effectiveItems.find((i) => i.item_id === id);
                  if (item) {
                    setRejectingItem(item);
                  } else {
                    void handleAcceptItem(id);
                  }
                }}
                onCorrect={(id) => {
                  const item = effectiveItems.find((i) => i.item_id === id) ?? null;
                  setCorrectionError(null);
                  setCorrectingItem(item);
                }}
                onExportCsv={() =>
                  void apiClient
                    .exportTakeoffCsv({ project_id: state.projectName, sheet_id: state.activeSheetId ?? undefined })
                    .then((blob) => downloadBlob(blob, 'bluetrace_takeoff.csv'))
                }
                onExportJson={() =>
                  void apiClient
                    .exportTakeoffJson({ project_id: state.projectName, sheet_id: state.activeSheetId ?? undefined })
                    .then((blob) => downloadBlob(blob, 'bluetrace_takeoff.json'))
                }
              />
            )}
            {rightTab === 'schedule' && (
              <SchedulePanel
                projectName={state.projectName}
                sheetId={state.activeSheetId}
                pdfPath={activeSheet.pdfPath}
                pageIndex={activeSheet.pageIndex}
                onGhostPins={setGhostPins}
                onReconcile={(scheduled, scheduleSheet) =>
                  void runReconcileFromSchedule(scheduled, scheduleSheet)
                }
                onLinked={() => void refreshLedger()}
              />
            )}
            {rightTab === 'qa' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                <QAPanel
                  annotations={qaAnnotations}
                  checklist={qaChecklist}
                  loading={qaLoading}
                  error={qaError}
                  onResolve={handleQAResolve}
                  onRefresh={() => void refreshQAAnnotations()}
                />
                <div className="min-h-64 flex-1 border-t border-bt-border-subtle">
                  <DiscrepancyList
                    discrepancies={discrepancies}
                    onLocateItem={handleLocateItem}
                    onPlaceGhostPin={(ghostId) => handlePlaceGhostPin(ghostId, [400, 300])}
                    onDismissDiscrepancy={(id) => setDiscrepancies((prev) => prev.filter((item) => item.item_id !== id))}
                    onVerifyDiscrepancy={(id) => setDiscrepancies((prev) => prev.map((item) => item.item_id === id ? { ...item, severity: 'INFO' } : item))}
                    onEvidence={handleEvidence}
                  />
                </div>
              </div>
            )}
            {rightTab === 'copilot' && (
              <CopilotPanel sheetId={state.activeSheetId} onEvidence={handleEvidence} />
            )}
          </SidebarRight>
        </main>
      )}

      {showWorkspace && (
        <ActivityTray
          progress={state.agentProgress}
          run={state.agentRun}
          running={state.stage === 'orchestrating'}
        />
      )}

      {/* Two-point scale calibration dialog + session refresh on confirm */}
      {calPoints && (
        <CalibrationModal
          open={calOpen}
          p1={calPoints.p1}
          p2={calPoints.p2}
          lengthPt={Math.hypot(calPoints.p2[0] - calPoints.p1[0], calPoints.p2[1] - calPoints.p1[1])}
          isSubmitting={calSubmitting}
          submitError={calError}
          onConfirm={(payload) => void handleCalibrationConfirm(payload)}
          onCancel={handleCalibrationCancel}
        />
      )}

      {/* REV-002 field-level correction dialog */}
      {correctingItem && (
        <CorrectionModal
          open
          itemId={correctingItem.item_id}
          itemLabel={correctingItem.dimension_label}
          initial={{
            dimensionLabel: correctingItem.dimension_label,
            cfm: null,
            system: correctingItem.system,
            category: correctingItem.category,
          }}
          isSubmitting={correctionSubmitting}
          submitError={correctionError}
          onSubmit={(payload) =>
            void handleCorrectionSubmit(payload, {
              projectId: state.projectName,
              sheetId: state.activeSheetId,
              item: correctingItem,
            })
          }
          onCancel={handleCorrectionCancel}
        />
      )}

      {/* Accessible Rejection Modal with AEC Reason Codes */}
      {rejectingItem && (
        <RejectionModal
          open={rejectingItem !== null}
          itemId={rejectingItem.item_id}
          itemLabel={rejectingItem.dimension_label ?? rejectingItem.item_id}
          onConfirm={(reasonCode, note) => {
            const id = rejectingItem.item_id;
            const combinedReason = note ? `${reasonCode}: ${note}` : reasonCode;
            const prevStatus = rejectingItem.status;
            // Immediate optimistic state transition (<16ms)
            setOptimisticOverrides((prev) => ({
              ...prev,
              [id]: { status: 'REJECTED' },
            }));
            setRejectingItem(null);
            void (async () => {
              try {
                await setItemStatus(id, 'REJECTED');
                if (state.projectName && state.activeSheetId) {
                  logRejectTelemetry({
                    projectId: state.projectName,
                    sheetId: state.activeSheetId,
                    itemId: id,
                    previousStatus: prevStatus,
                    originalOutput: {
                      dimension_label: rejectingItem.dimension_label,
                      system: rejectingItem.system,
                    },
                    reason: combinedReason,
                  });
                }
              } catch {
                // Failure rollback
                setOptimisticOverrides((prev) => {
                  const next = { ...prev };
                  delete next[id];
                  return next;
                });
              }
            })();
          }}
          onCancel={() => setRejectingItem(null)}
        />
      )}

    </div>
  );
};
