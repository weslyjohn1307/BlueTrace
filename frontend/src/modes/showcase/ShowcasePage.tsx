import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowDown, ArrowRight, Check, MoveUpRight } from 'lucide-react';
import { ShowcaseSceneCanvas } from './ShowcaseSceneCanvas';
import type { HoveredSceneItem, ShowcaseBeat, ShowcaseSystem } from './showcaseScene';
import './showcase.css';

gsap.registerPlugin(ScrollTrigger);

const chapters: { id: string; beat: ShowcaseBeat }[] = [
  { id: 'showcase-intro', beat: 'overview' },
  { id: 'showcase-origin', beat: 'layers' },
  { id: 'showcase-demo', beat: 'evidence' },
  { id: 'showcase-review', beat: 'review' },
  { id: 'showcase-pipeline', beat: 'pipeline' },
  { id: 'showcase-project', beat: 'close' },
];

export function ShowcasePage() {
  const [beat, setBeat] = useState<ShowcaseBeat>('overview');
  const [selectedSystem, setSelectedSystem] = useState<ShowcaseSystem>('all');
  const [hoveredItem, setHoveredItem] = useState<HoveredSceneItem | null>(null);
  const [reviewStaged, setReviewStaged] = useState(false);

  const handleHoverItem = useCallback((item: HoveredSceneItem | null) => setHoveredItem(item), []);

  useLayoutEffect(() => {
    const root = document.querySelector('.showcase-page');
    if (!root) return;
    const mm = gsap.matchMedia();

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const context = gsap.context(() => {
        const intro = document.querySelector('.intro-chapter');
        if (intro) {
          gsap.fromTo(intro.querySelectorAll('.chapter-eyebrow, h1, .intro-copy, .intro-actions, .story-credit'),
            { opacity: 0, y: 26 },
            { opacity: 1, y: 0, duration: 0.9, stagger: 0.1, ease: 'power3.out', delay: 0.12 },
          );
        }

        chapters.forEach(({ id, beat }) => {
          const section = document.getElementById(id);
          if (!section) return;
          ScrollTrigger.create({
            trigger: section,
            start: 'top 56%',
            end: 'bottom 44%',
            onEnter: () => setBeat(beat),
            onEnterBack: () => setBeat(beat),
          });

          if (id === 'showcase-intro') return;
          const parts = section.querySelectorAll('.chapter-index, h2, :scope > p:not(.sr-only), .answer-note, .demo-instruction, .review-state, .review-action, .pipeline-list li, .project-origin-line, .chapter-link');
          if (!parts.length) return;
          gsap.fromTo(parts,
            { opacity: 0, y: 28 },
            {
              opacity: 1, y: 0, duration: 0.72, stagger: 0.075, ease: 'power2.out',
              scrollTrigger: { trigger: section, start: 'top 72%', toggleActions: 'play none none reverse' },
            },
          );
        });
      }, root);

      return () => context.revert();
    });

    mm.add('(prefers-reduced-motion: reduce)', () => {
      // Native scroll and a still, legible scene remain complete without choreography.
      chapters.forEach(({ id, beat }) => {
        const section = document.getElementById(id);
        if (section) ScrollTrigger.create({ trigger: section, start: 'top 56%', onEnter: () => setBeat(beat), onEnterBack: () => setBeat(beat) });
      });
    });
    return () => mm.revert();
  }, []);

  useEffect(() => {
    document.title = 'BlueTraceAI — MEP takeoff, traced to the sheet';
  }, []);

  const stageReview = () => {
    setReviewStaged(true);
    setSelectedSystem('mechanical');
    document.getElementById('showcase-review')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <div className="showcase-page">
      <a className="skip-to-main" href="#showcase-intro">Skip to the story</a>
      <header className="showcase-header">
        <a className="showcase-wordmark" href="#showcase-intro" aria-label="BlueTraceAI, back to top">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>
          <span>BlueTrace<span className="brand-ai">AI</span></span>
        </a>
        <nav className="showcase-nav" aria-label="Page navigation">
          <a href="#showcase-demo">The demo</a>
          <a href="#showcase-pipeline">The build</a>
          <a href="#showcase-project">Project status</a>
          <a className="nav-github" href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">
            Source <MoveUpRight size={13} aria-hidden="true" />
          </a>
        </nav>
      </header>

      <main id="main-content" className="showcase-main">
        <div className="showcase-grid">
          <section className="story-chapter intro-chapter" id="showcase-intro" aria-labelledby="showcase-title">
            <p className="chapter-eyebrow"><span className="eyebrow-line" />Meta Global AI Developer Hackathon · Indie developer</p>
            <h1 id="showcase-title">MEP takeoff,<br /><em>traced to the sheet.</em></h1>
            <p className="intro-copy">BlueTraceAI connects drawing interpretation, local geometry, and engineer review in one traceable workflow.</p>
            <div className="intro-actions">
              <a className="action-primary" href="#showcase-demo">Explore the demo <ArrowDown size={16} aria-hidden="true" /></a>
              <a className="action-text" href="#showcase-project">Project overview <ArrowRight size={15} aria-hidden="true" /></a>
            </div>
            <p className="story-credit"><span className="credit-number">01</span><span>A scripted walkthrough. Synthetic drawing. No live extraction.</span></p>
          </section>

          <aside className="scene-slot" aria-label="Interactive synthetic MEP drawing">
            <ShowcaseSceneCanvas
              beat={beat}
              selectedSystem={selectedSystem}
              onSelectSystem={setSelectedSystem}
              hoveredItem={hoveredItem}
              onHoverItem={handleHoverItem}
            />
          </aside>

          <section className="story-chapter origin-chapter" id="showcase-origin" aria-labelledby="origin-title">
            <p className="chapter-index"><span>02</span> Why this project</p>
            <h2 id="origin-title">Every quantity<br />starts somewhere.</h2>
            <p>I started BlueTraceAI with a question: can software help read an MEP drawing while keeping every quantity tied to its source and reviewer?</p>
            <div className="answer-note">
              <span className="note-rule" />
              <p><strong>The principle</strong> Models can help interpret a sheet. Physical measurement stays with local geometry, verified scale, and an engineer’s decision.</p>
            </div>
          </section>

          <section className="story-chapter demo-chapter" id="showcase-demo" aria-labelledby="demo-title">
            <p className="chapter-index"><span>03</span> Product demo</p>
            <h2 id="demo-title">A drawing has layers.</h2>
            <p>Choose a trade in the model. Hover a route to inspect its label and source context.</p>
            <div className="demo-instruction">
              <span className="instruction-cursor" aria-hidden="true">⌖</span>
              <span><strong>{hoveredItem?.title ?? 'Try the mechanical route'}</strong><small>{hoveredItem?.detail ?? 'Blue line · synthetic example · no quantity inferred'}</small></span>
            </div>
            <button className="chapter-link" type="button" onClick={stageReview}>
              Follow it to the review gate <ArrowRight size={16} aria-hidden="true" />
            </button>
          </section>

          <section className="story-chapter review-chapter" id="showcase-review" aria-labelledby="review-title">
            <p className="chapter-index"><span>04</span> The trust boundary</p>
            <h2 id="review-title">No scale.<br /><em>No number.</em></h2>
            <p>When scale is unverified, the quantity stays out of the ledger until a person can review it.</p>
            <div className={`review-state${reviewStaged ? ' is-staged' : ''}`}>
              <span className="review-state-mark" aria-hidden="true">{reviewStaged ? <Check size={14} /> : '!'}</span>
              <span><strong>{reviewStaged ? 'Kept in review' : 'Review required'}</strong><small>{reviewStaged ? 'Local demo state · nothing saved' : 'Scale not verified · no physical length shown'}</small></span>
            </div>
            <button className="action-primary review-action" type="button" onClick={() => setReviewStaged((value) => !value)}>
              {reviewStaged ? 'Reset review state' : 'Keep this item in review'}
              <ArrowRight size={15} aria-hidden="true" />
            </button>
            <p className="sr-only" role="status">{reviewStaged ? 'The synthetic item is kept in review. No data was saved.' : ''}</p>
          </section>

          <section className="story-chapter pipeline-chapter" id="showcase-pipeline" aria-labelledby="pipeline-title">
            <p className="chapter-index"><span>05</span> Hackathon pipeline</p>
            <h2 id="pipeline-title">A careful path<br />through the sheet.</h2>
            <p>The project combines model-assisted reading with local geometry and a human review gate.</p>
            <ol className="pipeline-list">
              <li><span className="pipeline-number">01</span><span><strong>Set the sheet context</strong><small>Discipline, title block, and scale</small></span><span className="pipeline-state state-foundation">Workspace</span></li>
              <li><span className="pipeline-number">02</span><span><strong>Interpret drawing evidence</strong><small>OCR and visual context from Meta models</small></span><span className="pipeline-state state-progress">In progress</span></li>
              <li><span className="pipeline-number">03</span><span><strong>Trace geometry locally</strong><small>Vector paths and validated scale</small></span><span className="pipeline-state state-foundation">Foundation</span></li>
              <li><span className="pipeline-number">04</span><span><strong>Leave the decision to a person</strong><small>Uncertain items stay in review</small></span><span className="pipeline-state state-review">Always</span></li>
            </ol>
            <p className="pipeline-footnote">The full multi-agent workflow is still in development. This page does not run it.</p>
          </section>

          <section className="story-chapter project-chapter" id="showcase-project" aria-labelledby="project-title">
            <p className="chapter-index"><span>06</span> Project overview</p>
            <h2 id="project-title">The work before<br />the hackathon.</h2>
            <p>BlueTraceAI began as an MEP takeoff workspace. The hackathon extends that foundation toward a more coordinated, evidence-led workflow.</p>
            <div className="project-origin-line">
              <div><span className="origin-marker" /><small>EXISTING FOUNDATION</small><strong>Drawing workspace<br />Vector geometry<br />Takeoff review</strong></div>
              <div className="origin-connector" aria-hidden="true" />
              <div><span className="origin-marker is-current" /><small>HACKATHON WORK</small><strong>Model-assisted reading<br />Agent coordination<br />End-to-end verification ahead</strong></div>
            </div>
            <a className="chapter-link" href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">
              Explore the project <MoveUpRight size={15} aria-hidden="true" />
            </a>
          </section>
        </div>
      </main>

      <footer className="showcase-footer" id="showcase-footer">
        <div className="footer-mark" aria-hidden="true"><i /><i /><i /></div>
        <div className="footer-copy">
          <p className="footer-label">MADE BY</p>
          <h2>Wesly John</h2>
          <p>Independent developer · BlueTraceAI</p>
        </div>
        <p className="footer-note">A work in progress, built around one rule:<br /><em>show the evidence.</em></p>
        <div className="footer-links">
          <a href="https://github.com/weslyjohn1307/BlueTrace" target="_blank" rel="noreferrer">GitHub <MoveUpRight size={13} aria-hidden="true" /></a>
          <a href="https://github.com/weslyjohn1307/BlueTrace/blob/main/README.md" target="_blank" rel="noreferrer">Project README <MoveUpRight size={13} aria-hidden="true" /></a>
          <a href="#showcase-intro">Back to top <ArrowDown size={13} aria-hidden="true" /></a>
        </div>
        <div className="footer-colophon"><span>BLUE TRACE / 2026</span><span>ILLUSTRATIVE DEMO · SYNTHETIC LINEWORK</span></div>
      </footer>
    </div>
  );
}
