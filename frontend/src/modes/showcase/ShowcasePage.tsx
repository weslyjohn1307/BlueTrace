import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowRight, Check, MoveUpRight, Pause, Play, Sparkles } from 'lucide-react';
import { BrandIcon, BrandLockup, type BrandIconName } from '../../components/brand/BrandAssets';
import { ShowcaseSceneCanvas } from './ShowcaseSceneCanvas';
import type { HoveredSceneItem, ShowcaseBeat, ShowcaseReviewState, ShowcaseSystem } from './showcaseScene';
import './showcase.css';

gsap.registerPlugin(ScrollTrigger);

const chapters: {
  id: string;
  beat: ShowcaseBeat;
  number: string;
  icon: BrandIconName;
  eyebrow: string;
  title: React.ReactNode;
  copy: string;
  cue: string;
  metrics: { label: string; value: string }[];
}[] = [
  {
    id: 'story-intake',
    beat: 'intake',
    number: '01',
    icon: 'project',
    eyebrow: 'Read the sheet',
    title: (
      <>
        First, find
        <br />
        what matters.
      </>
    ),
    copy: 'BlueTrace starts with an engineering PDF: sheet identity, CSI discipline classification, equipment legend, schedule boundaries, and title-block scale witnesses.',
    cue: 'TITLE BLOCK · LEGEND · SCHEDULE RECONNAISSANCE',
    metrics: [
      { label: 'Sheet ID', value: 'M-201 Level 2' },
      { label: 'Discipline', value: 'Div 23 HVAC' },
    ],
  },
  {
    id: 'story-recognition',
    beat: 'recognition',
    number: '02',
    icon: 'detect',
    eyebrow: 'Recognise evidence',
    title: (
      <>
        Make the page
        <br />
        legible.
      </>
    ),
    copy: 'Symbol candidates, equipment tags, and airflow callouts are anchored to exact bounding regions on the sheet and inspected with 150 DPI point-of-need crops.',
    cue: 'MUSE-SPARK-1.3 OCR · SAM-3.1 REGION MASKING',
    metrics: [
      { label: 'Candidates', value: 'VAV-01..03, CD-01..04' },
      { label: 'Crop Latency', value: '184 ms (300×300 px)' },
    ],
  },
  {
    id: 'story-trace',
    beat: 'trace',
    number: '03',
    icon: 'measure',
    eyebrow: 'Trace geometry',
    title: (
      <>
        Follow the line
        <br />
        that is there.
      </>
    ),
    copy: 'Deterministic PyMuPDF vector extraction pairs parallel duct walls, traces topological centerlines across fittings, and preserves the exact source path.',
    cue: 'VECTOR WALL PAIRING · TOPOLOGICAL CENTERLINE GRAPH',
    metrics: [
      { label: 'Primary Trunk', value: 'Route D-04 (24"×12")' },
      { label: 'Vector Path', value: '548.0 pt raw span' },
    ],
  },
  {
    id: 'story-layers',
    beat: 'layers',
    number: '04',
    icon: 'layers',
    eyebrow: 'See the systems',
    title: (
      <>
        One sheet.
        <br />
        <em>Several systems.</em>
      </>
    ),
    copy: 'Mechanical supply ducts, chilled-water piping, and electrical cable trays are separated into an interactive 3D exploded view so routing clashes and system hierarchies stand out.',
    cue: '3D EXPLODED LAYER STACK · INTERACTIVE Z-LIFT',
    metrics: [
      { label: 'Div 23 / 22 / 26', value: '3 MEP Systems' },
      { label: 'View Mode', value: '2.5D / 3D Orbit + Lift' },
    ],
  },
  {
    id: 'story-scale',
    beat: 'scale',
    number: '05',
    icon: 'measure',
    eyebrow: 'Validate scale',
    title: (
      <>
        A line is not
        <br />a length yet.
      </>
    ),
    copy: 'Until scale is verified against a calibration bar or confirmed title-block ratio, BlueTrace fails closed—holding linear footage in review rather than guessing.',
    cue: 'FAIL-CLOSED INVARIANT · TWO-POINT CALIBRATION GATE',
    metrics: [
      { label: 'Detected Ratio', value: '1/8" = 1\'-0" (1:96)' },
      { label: 'Fail-Closed Gate', value: 'Active until verified' },
    ],
  },
  {
    id: 'story-reconcile',
    beat: 'reconcile',
    number: '06',
    icon: 'layers',
    eyebrow: 'Check the schedule',
    title: (
      <>
        Compare page
        <br />
        to schedule.
      </>
    ),
    copy: 'Plan callouts and mechanical schedule rows are linked in 3D space so airflow or neck-size discrepancies between the drawing and the table surface immediately.',
    cue: 'PLAN-TO-SCHEDULE ARCS · CFM & NECK RECONCILIATION',
    metrics: [
      { label: 'Schedule Match', value: '3 / 3 VAV Units Linked' },
      { label: 'Total Airflow', value: '3,750 CFM Verified' },
    ],
  },
  {
    id: 'story-takeoff',
    beat: 'takeoff',
    number: '07',
    icon: 'takeoff',
    eyebrow: 'Prepare takeoff',
    title: (
      <>
        Gather evidence.
        <br />
        Suggest a quantity.
      </>
    ),
    copy: 'Every proposed takeoff row bundles its vector geometry, sheet coordinates, schedule cross-reference, and validation status into a single auditable record.',
    cue: 'EVIDENCE PACKET · GEOMETRY + SCHEDULE + SCALE',
    metrics: [
      { label: 'Proposed Trunk', value: '68.5 LF (24"×12")' },
      { label: 'Terminal Count', value: '3 VAV · 4 Diffusers' },
    ],
  },
  {
    id: 'story-review',
    beat: 'review',
    number: '08',
    icon: 'review',
    eyebrow: 'Engineer review',
    title: (
      <>
        The engineer
        <br />
        <em>decides.</em>
      </>
    ),
    copy: 'Accept, correct, reject, or flag for determination. Calibrate the sheet scale below to unlock final acceptance and watch the 3D route commit to the ledger.',
    cue: 'HUMAN-IN-THE-LOOP GATE · IMMUTABLE AUDIT TRAIL',
    metrics: [
      { label: 'Review Target', value: 'Route D-04 + VAV-02' },
      { label: 'Audit Trail', value: 'SQLite Event Ledger' },
    ],
  },
  {
    id: 'story-export',
    beat: 'export',
    number: '09',
    icon: 'takeoff',
    eyebrow: 'Traceable output',
    title: (
      <>
        Keep the source
        <br />
        attached.
      </>
    ),
    copy: 'Exported BOM tables and ledger rollups retain full provenance from sheet region, through deterministic vector geometry and scale checks, to the estimator’s sign-off.',
    cue: 'SOURCE PDF → VECTOR GEOMETRY → VERIFIED LEDGER',
    metrics: [
      { label: 'Export Formats', value: 'CSV · JSON · Audit Log' },
      { label: 'Provenance', value: '100% Coordinate Linked' },
    ],
  },
];

export function ShowcasePage() {
  const [beat, setBeat] = useState<ShowcaseBeat>('overview');
  const [selectedSystem, setSelectedSystem] = useState<ShowcaseSystem>('all');
  const [hoveredItem, setHoveredItem] = useState<HoveredSceneItem | null>(null);
  const [scaleCalibrated, setScaleCalibrated] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<ShowcaseReviewState>('review');
  const [explodeFactor, setExplodeFactor] = useState<number | undefined>(undefined);
  const [autoTour, setAutoTour] = useState(false);

  const handleHoverItem = useCallback((item: HoveredSceneItem | null) => setHoveredItem(item), []);

  // Auto-Tour timer: steps smoothly through chapters when active
  useEffect(() => {
    if (!autoTour) return undefined;
    const sequence: ShowcaseBeat[] = [
      'intake',
      'recognition',
      'trace',
      'layers',
      'scale',
      'reconcile',
      'takeoff',
      'review',
      'export',
    ];
    const interval = window.setInterval(() => {
      setBeat((prev) => {
        const idx = sequence.indexOf(prev);
        const nextBeat = sequence[(idx + 1) % sequence.length];
        const targetChapter = chapters.find((c) => c.beat === nextBeat);
        if (targetChapter) {
          const el = document.getElementById(targetChapter.id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return nextBeat;
      });
    }, 4200);
    return () => window.clearInterval(interval);
  }, [autoTour]);

  const handleToggleScale = useCallback(() => {
    setScaleCalibrated((prev) => {
      const next = !prev;
      if (!next && reviewDecision === 'accepted') {
        setReviewDecision('review');
      }
      return next;
    });
  }, [reviewDecision]);

  useLayoutEffect(() => {
    const root = document.querySelector('.showcase-page');
    if (!root) return;
    const mm = gsap.matchMedia();
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        const intro = document.querySelector('.intro-chapter');
        if (intro) {
          gsap.fromTo(
            intro.querySelectorAll('.chapter-eyebrow, h1, .intro-copy, .intro-actions, .story-credit, .chapter-scrubber'),
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.85, stagger: 0.07, ease: 'power3.out', delay: 0.06 },
          );
        }
        chapters.forEach(({ id, beat: chapterBeat }) => {
          const section = document.getElementById(id);
          if (!section) return;
          ScrollTrigger.create({
            trigger: section,
            start: 'top 56%',
            end: 'bottom 44%',
            onEnter: () => setBeat(chapterBeat),
            onEnterBack: () => setBeat(chapterBeat),
          });
          gsap.fromTo(
            section.querySelectorAll('.chapter-index, h2, .chapter-copy, .chapter-metrics, .chapter-cue'),
            { opacity: 0, y: 22 },
            {
              opacity: 1,
              y: 0,
              duration: 0.68,
              stagger: 0.06,
              ease: 'power2.out',
              scrollTrigger: { trigger: section, start: 'top 72%', toggleActions: 'play none none reverse' },
            },
          );
        });
        document.querySelectorAll('.reveal-on-scroll').forEach((node) =>
          gsap.fromTo(
            node,
            { opacity: 0, y: 20 },
            {
              opacity: 1,
              y: 0,
              duration: 0.7,
              ease: 'power2.out',
              scrollTrigger: { trigger: node, start: 'top 82%', toggleActions: 'play none none reverse' },
            },
          ),
        );
      }, root);
      return () => context.revert();
    });
    mm.add('(prefers-reduced-motion: reduce)', () => {
      chapters.forEach(({ id, beat: chapterBeat }) => {
        const section = document.getElementById(id);
        if (section) {
          ScrollTrigger.create({
            trigger: section,
            start: 'top 56%',
            onEnter: () => setBeat(chapterBeat),
            onEnterBack: () => setBeat(chapterBeat),
          });
        }
      });
    });
    return () => mm.revert();
  }, []);

  useEffect(() => {
    document.title = 'BlueTrace — 3D Visual Experience & MEP Takeoff Intelligence';
  }, []);

  const jumpToChapter = (chapterId: string, chapterBeat: ShowcaseBeat) => {
    setAutoTour(false);
    setBeat(chapterBeat);
    const el = document.getElementById(chapterId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="showcase-page">
      <a className="skip-to-main" href="#main-content">
        Skip to the story
      </a>
      <header className="showcase-header">
        <a
          className="showcase-wordmark"
          href="#showcase-intro"
          aria-label="BlueTrace, back to top"
          onClick={() => {
            setAutoTour(false);
            setBeat('overview');
          }}
        >
          <BrandLockup theme="light" size="md" showDescriptor />
        </a>

        <div className="header-chapter-pills" role="navigation" aria-label="Chapter quick jump">
          {chapters.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`header-beat-chip${beat === ch.beat ? ' is-active' : ''}`}
              onClick={() => jumpToChapter(ch.id, ch.beat)}
              title={`${ch.number} · ${ch.eyebrow}`}
            >
              <span>{ch.number}</span>
              <small>{ch.beat}</small>
            </button>
          ))}
        </div>

        <nav className="showcase-nav" aria-label="Page navigation">
          <button
            type="button"
            className={`tour-button${autoTour ? ' is-playing' : ''}`}
            onClick={() => setAutoTour((v) => !v)}
            aria-pressed={autoTour}
          >
            {autoTour ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
            <span>{autoTour ? 'Pause 3D Tour' : 'Auto-Play 3D Tour'}</span>
          </button>
          <a href="#story-intake">Walkthrough</a>
          <a href="#hackathon-pipeline">Architecture</a>
          <a href="#project-overview">Overview</a>
          <a className="nav-github" href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">
            GitHub <MoveUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="main-content" className="showcase-main">
        <div className="experience-grid">
          <div className="story-column">
            <section className="story-chapter intro-chapter" id="showcase-intro" aria-labelledby="showcase-title">
              <p className="chapter-eyebrow">
                <span className="eyebrow-line" />
                MEP DRAWING INTELLIGENCE <span className="eyebrow-separator">/</span> 3D INTERACTIVE SHOWCASE
              </p>
              <h1 id="showcase-title">
                From drawings
                <br />
                to <em>trusted takeoff.</em>
              </h1>
              <p className="intro-copy">
                BlueTrace pairs Meta visual models with deterministic vector geometry—extruding flat MEP sheets into inspectable systems while keeping every quantity anchored to verified scale and human review.
              </p>
              <div className="intro-actions">
                <a className="action-primary" href="#story-intake">
                  Explore 3D walkthrough <ArrowDown size={16} aria-hidden="true" />
                </a>
                <button
                  type="button"
                  className="action-secondary"
                  onClick={() => {
                    setAutoTour(true);
                    setBeat('intake');
                    document.getElementById('story-intake')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                >
                  <Sparkles size={15} aria-hidden="true" /> Launch guided tour
                </button>
                <a className="action-text" href="#hackathon-pipeline">
                  Hybrid architecture <ArrowRight size={15} aria-hidden="true" />
                </a>
              </div>
              <div className="story-credit">
                <span className="credit-number">SHEET M-201 · LEVEL 2 MECHANICAL CORE</span>
                <span>Scroll to scrub 9 chapters · Drag &amp; zoom the 3D viewport · Hover equipment for live telemetry</span>
              </div>
            </section>

            {chapters.map((chapter) => (
              <section
                className={`story-chapter demo-chapter demo-chapter-${chapter.number}${beat === chapter.beat ? ' is-current-chapter' : ''}`}
                id={chapter.id}
                key={chapter.id}
                aria-labelledby={`${chapter.id}-title`}
              >
                <p className="chapter-index">
                  <span className="chapter-badge">
                    <BrandIcon name={chapter.icon} size={14} />
                  </span>
                  <strong>{chapter.number}</strong> · {chapter.eyebrow}
                </p>
                <h2 id={`${chapter.id}-title`}>{chapter.title}</h2>
                <p className="chapter-copy">{chapter.copy}</p>

                <div className="chapter-metrics" aria-label="Chapter telemetry">
                  {chapter.metrics.map((m) => (
                    <div key={m.label} className="chapter-metric-card">
                      <small>{m.label}</small>
                      <strong>{m.value}</strong>
                    </div>
                  ))}
                </div>

                <p className="chapter-cue">
                  <span className="cue-rule" />
                  {chapter.cue}
                </p>

                {chapter.number === '04' && (
                  <div className="chapter-interactive-box">
                    <p className="visual-disclosure">
                      The lifted 3D layers reconstruct the 2D PDF routes by CSI division so you can inspect crossings and vertical risers. Use the <strong>Z-LIFT</strong> slider on the canvas or presets below:
                    </p>
                    <div className="layer-preset-row">
                      <button
                        type="button"
                        className={`preset-chip${explodeFactor === 0 ? ' is-active' : ''}`}
                        onClick={() => setExplodeFactor(0)}
                      >
                        Flat 2D Sheet (0%)
                      </button>
                      <button
                        type="button"
                        className={`preset-chip${explodeFactor === undefined ? ' is-active' : ''}`}
                        onClick={() => setExplodeFactor(undefined)}
                      >
                        Chapter Auto-Lift
                      </button>
                      <button
                        type="button"
                        className={`preset-chip${explodeFactor === 1 ? ' is-active' : ''}`}
                        onClick={() => setExplodeFactor(1)}
                      >
                        Full 3D Explode (100%)
                      </button>
                    </div>
                  </div>
                )}

                {chapter.number === '05' && (
                  <div className="chapter-interactive-box">
                    <button
                      type="button"
                      className={`scale-calibrate-btn${scaleCalibrated ? ' is-calibrated' : ''}`}
                      onClick={handleToggleScale}
                    >
                      <span className="calibrate-dot" />
                      <span>
                        {scaleCalibrated
                          ? 'Scale Calibrated: 1/8" = 1\'-0" (68.5 LF unlocked)'
                          : 'Simulate 2-Point Scale Calibration (1/8" = 1\'-0")'}
                      </span>
                    </button>
                    <p className="visual-disclosure">
                      {scaleCalibrated
                        ? 'Two-point witness bar verified on Sheet M-201. Linear footage is now unlocked for engineer acceptance in Chapter 08.'
                        : 'Fail-Closed Scale Rule active: physical lengths remain withheld until calibrated against the drawing scale bar.'}
                    </p>
                  </div>
                )}

                {chapter.number === '08' && (
                  <>
                    <div
                      className={`review-state${
                        reviewDecision === 'accepted' || reviewDecision === 'correct'
                          ? ' is-staged'
                          : reviewDecision === 'reject'
                            ? ' is-rejected'
                            : reviewDecision === 'cannot-determine'
                              ? ' is-unknown'
                              : ''
                      }`}
                    >
                      <span className="review-state-mark" aria-hidden="true">
                        {reviewDecision === 'review' ? '!' : <Check size={14} />}
                      </span>
                      <span>
                        <strong>
                          {reviewDecision === 'review'
                            ? 'Review required · Route D-04 (24"×12")'
                            : reviewDecision === 'accepted'
                              ? 'Accepted · 68.5 LF committed to takeoff ledger'
                              : `${
                                  reviewDecision === 'cannot-determine'
                                    ? 'Cannot determine'
                                    : reviewDecision[0].toUpperCase() + reviewDecision.slice(1)
                                } · logged to audit trail`}
                        </strong>
                        <small>
                          {scaleCalibrated
                            ? 'Scale verified (1/8" = 1\'-0") · Ready for engineer sign-off'
                            : 'Scale unverified · Calibrate scale below to unlock Accept'}
                        </small>
                      </span>
                    </div>

                    {!scaleCalibrated && (
                      <button type="button" className="scale-calibrate-btn" onClick={handleToggleScale}>
                        <span className="calibrate-dot" />
                        <span>Calibrate Scale Now (1/8&quot; = 1&apos;-0&quot;) to Unlock Accept</span>
                      </button>
                    )}

                    <div className="review-actions" role="group" aria-label="Demonstration review actions">
                      <button
                        type="button"
                        aria-pressed={reviewDecision === 'review'}
                        onClick={() => setReviewDecision('review')}
                      >
                        Keep in review
                      </button>
                      <button
                        type="button"
                        disabled={!scaleCalibrated}
                        aria-pressed={reviewDecision === 'accepted'}
                        aria-describedby={!scaleCalibrated ? 'review-scale-block' : undefined}
                        title={scaleCalibrated ? 'Accept verified takeoff quantity' : 'Scale is unverified'}
                        onClick={() => setReviewDecision('accepted')}
                      >
                        Accept (68.5 LF)
                      </button>
                      <button
                        type="button"
                        aria-pressed={reviewDecision === 'correct'}
                        onClick={() => setReviewDecision('correct')}
                      >
                        Correct
                      </button>
                      <button
                        type="button"
                        aria-pressed={reviewDecision === 'reject'}
                        onClick={() => setReviewDecision('reject')}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        aria-pressed={reviewDecision === 'cannot-determine'}
                        onClick={() => setReviewDecision('cannot-determine')}
                      >
                        Cannot determine
                      </button>
                    </div>
                    {!scaleCalibrated && (
                      <p className="review-scale-block" id="review-scale-block">
                        Accept is unavailable while scale remains unverified (Fail-Closed Scale Rule).
                      </p>
                    )}
                    <p className="sr-only" role="status" aria-live="polite">
                      {reviewDecision === 'review'
                        ? 'Item remains in review.'
                        : `${reviewDecision} selected in the interactive showcase.`}
                    </p>
                  </>
                )}

                {chapter.number === '09' && (
                  <a className="chapter-link" href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">
                    Inspect the full repository &amp; desktop workstation <ArrowRight size={16} aria-hidden="true" />
                  </a>
                )}
              </section>
            ))}
          </div>

          <aside className="scene-slot" aria-label="Interactive 3D MEP drawing reconstruction">
            <ShowcaseSceneCanvas
              beat={beat}
              selectedSystem={selectedSystem}
              onSelectSystem={setSelectedSystem}
              hoveredItem={hoveredItem}
              onHoverItem={handleHoverItem}
              reviewDecision={reviewDecision}
              scaleCalibrated={scaleCalibrated}
              onToggleScaleCalibrated={handleToggleScale}
              explodeFactor={explodeFactor}
              onExplodeFactorChange={setExplodeFactor}
            />
          </aside>
        </div>

        <section className="story-support" id="hackathon-pipeline" aria-labelledby="pipeline-title">
          <div className="support-heading reveal-on-scroll">
            <p className="chapter-index">
              <span className="chapter-badge">
                <BrandIcon name="layers" size={14} />
              </span>
              <strong>ARCHITECTURE</strong> · Hybrid Engine
            </p>
            <h2 id="pipeline-title">
              A careful path
              <br />
              through the drawing.
            </h2>
            <p>
              BlueTrace separates visual comprehension from physical measurement: Meta vision models read context and schedules, while deterministic local geometry computes centerlines and scale math.
            </p>
          </div>
          <ol className="pipeline-list">
            <li className="reveal-on-scroll">
              <span className="pipeline-number">01</span>
              <span>
                <strong>Sheet Reconnaissance &amp; Classification</strong>
                <small>
                  PyMuPDF vector inspection + <code>muse-spark-1.3</code> parse title blocks, CSI divisions (22 / 23 / 26), and scale callouts.
                </small>
              </span>
              <span className="pipeline-state state-foundation">Spark 1.3 + PyMuPDF</span>
            </li>
            <li className="reveal-on-scroll">
              <span className="pipeline-number">02</span>
              <span>
                <strong>Point-of-Need Crop &amp; Region Segmentation</strong>
                <small>
                  <code>sam-3.1</code> isolates dense symbol clusters and equipment schedules; 150 DPI 300×300 px crops keep hover latency sub-second.
                </small>
              </span>
              <span className="pipeline-state state-progress">SAM 3.1 + 150 DPI</span>
            </li>
            <li className="reveal-on-scroll">
              <span className="pipeline-number">03</span>
              <span>
                <strong>Deterministic Centerline &amp; Fail-Closed Scale</strong>
                <small>
                  Shapely and NetworkX pair parallel walls into topological duct graphs; conflicting or missing scales lock quantities in <code>review_required</code>.
                </small>
              </span>
              <span className="pipeline-state state-foundation">NetworkX + Shapely</span>
            </li>
            <li className="reveal-on-scroll">
              <span className="pipeline-number">04</span>
              <span>
                <strong>Schedule Reconciliation &amp; Engineer Gate</strong>
                <small>
                  <code>muse-wonder-1.0</code> cross-checks plan tags against schedule rows before the human estimator commits verified quantities to SQLite.
                </small>
              </span>
              <span className="pipeline-state state-review">Wonder 1.0 + HITL</span>
            </li>
          </ol>
        </section>

        <section className="project-overview" id="project-overview" aria-labelledby="project-title">
          <div className="project-story reveal-on-scroll">
            <p className="chapter-index">
              <span className="chapter-badge">
                <BrandIcon name="review" size={14} />
              </span>
              <strong>THE CONSTITUTION</strong> · Engineering Trust
            </p>
            <h2 id="project-title">
              Why we built
              <br />
              <em>BlueTrace.</em>
            </h2>
            <p>
              MEP takeoff begins with dense construction drawings where a single misread scale or unlinked schedule row can cascade into a costly bidding error. BlueTrace makes every automated step inspectable—linking each quantity back to its exact vector path, crop region, and engineer sign-off.
            </p>
            <p className="trust-line">
              AI helps read the drawing. Verified vector geometry grounds the measurement. The engineer approves the result.
            </p>
            <a
              className="action-text"
              href="https://github.com/weslyjohn1307/BlueTrace"
              target="_blank"
              rel="noreferrer"
            >
              Explore the codebase &amp; benchmarks <MoveUpRight size={14} aria-hidden="true" />
            </a>
          </div>
          <div className="project-map reveal-on-scroll" aria-label="System architecture pillars">
            <div>
              <span className="project-node project-node-done" />
              <small>DETERMINISTIC CORE</small>
              <strong>
                PyMuPDF Vector Graph
                <br />
                Fail-Closed Scale Gate
                <br />
                Transactional SQLite Ledger
              </strong>
            </div>
            <span className="project-map-line" aria-hidden="true" />
            <div>
              <span className="project-node project-node-current" />
              <small>META VLM INTELLIGENCE</small>
              <strong>
                Muse Spark 1.3 Vision/OCR
                <br />
                SAM 3.1 Segmentation
                <br />
                Muse Wonder 1.0 Copilot
              </strong>
            </div>
          </div>
        </section>
      </main>

      <footer className="showcase-footer" id="showcase-footer">
        <div className="footer-brand">
          <BrandLockup theme="dark" size="lg" showDescriptor />
        </div>
        <div className="footer-copy">
          <p className="footer-label">ARCHITECTED BY</p>
          <h2>Wesly John</h2>
          <p>BlueTrace · Hybrid MEP Takeoff Workstation</p>
        </div>
        <p className="footer-note">
          Built around one engineering invariant:
          <br />
          <em>never hallucinate a dimension—show the evidence.</em>
        </p>
        <nav className="footer-links" aria-label="Footer links">
          <a href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">
            GitHub Repository <MoveUpRight size={13} aria-hidden="true" />
          </a>
          <a href="https://github.com/weslyjohn1307/BlueTrace/blob/master/README.md" target="_blank" rel="noreferrer">
            Architecture README <MoveUpRight size={13} aria-hidden="true" />
          </a>
          <a href="https://github.com/weslyjohn1307/BlueTrace/blob/master/docs/EVAL_REPORT.md" target="_blank" rel="noreferrer">
            Evaluation Benchmarks <MoveUpRight size={13} aria-hidden="true" />
          </a>
          <a href="#showcase-intro">
            Back to top <ArrowDown size={13} aria-hidden="true" />
          </a>
        </nav>
        <div className="footer-colophon">
          <span>BLUETRACE / 2026 · BRAND PACK V2 + 3D VISUAL EXPERIENCE</span>
          <span>SHEET M-201 · 3D EXTRUDED VECTOR RECONSTRUCTION</span>
        </div>
      </footer>
    </div>
  );
}
