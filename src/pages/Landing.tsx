import { useEffect, useRef, useState } from 'react'
import { ArrowRight, Download, FolderClosed, Globe, Play, RotateCcw, Search } from 'lucide-react'
import { Board } from '../components/Board'
import { DocEditor } from '../components/DocEditor'
import { FloatingField } from '../components/landing/FloatingField'
import { LinkShowcase } from '../components/landing/LinkShowcase'
import { PlatformBadge } from '../components/PlatformBadge'
import { CalendarWidget, ClockWidget } from '../components/widgets/Widgets'
import { useWorkspace } from '../hooks/useWorkspace'
import { createDocBlock } from '../lib/blocks'
import { BoardEnvContext, type BoardEnv } from '../lib/boardEnv'
import { DEMO_ITEMS, DEMO_STROKES, demoBlobUrl, photo } from '../lib/landingDemo'
import { normalizeUrl } from '../lib/platforms'
import { href, navigate } from '../lib/router'
import type { DocBlock, WidgetItem } from '../types'
import { PENDING_LINK_KEY } from './BoardPage'
import './landing.css'

const demoEnv: BoardEnv = { readOnly: true, allowEmbeds: false, blobUrl: demoBlobUrl }
const noop = () => {}

const PLACEHOLDERS = ['Paste a Figma file…', 'Paste a TikTok…', 'Paste a Notion page…', 'Paste a Pinterest pin…', 'Paste any link…']

export function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="2" width="9" height="20" rx="3.2" />
      <rect x="13" y="2" width="9" height="9" rx="3.2" />
      <rect x="13" y="13" width="9" height="9" rx="3.2" />
    </svg>
  )
}

/** Writes 0→1 into a CSS variable as the element travels up through the viewport. */
function useScrollProgress<T extends HTMLElement>(start = 1, end = 0.25) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = el.getBoundingClientRect().top / window.innerHeight
      const progress = Math.min(1, Math.max(0, (start - top) / (start - end)))
      el.style.setProperty('--p', progress.toFixed(3))
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [start, end])
  return ref
}

function useStart() {
  const ws = useWorkspace()
  return (link?: string) => {
    if (!ws.loaded) return
    if (!link && ws.activeBoards.length) return navigate(href.recent())
    const board = ws.createBoard(null)
    if (link) sessionStorage.setItem(PENDING_LINK_KEY, link)
    navigate(href.board(board.id))
  }
}

function Nav() {
  const start = useStart()
  const [scrolled, setScrolled] = useState(false)
  const [value, setValue] = useState('')
  const [placeholder, setPlaceholder] = useState(0)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setPlaceholder((i) => (i + 1) % PLACEHOLDERS.length), 2600)
    return () => clearInterval(timer)
  }, [])

  const url = normalizeUrl(value)

  return (
    <header className={`l-nav${scrolled ? ' scrolled' : ''}`}>
      <div className="l-nav-left">
        <a className="l-logo" href={href.landing()} aria-label="embeddd home">
          <Mark />
        </a>
        <a href="#tour">Tour</a>
        <a href="#features">Features</a>
        <a href="#integrations">Integrations</a>
      </div>
      <form
        className={`l-search${url ? ' ready' : ''}`}
        onSubmit={(e) => {
          e.preventDefault()
          if (url) start(url)
        }}
      >
        <Search size={16} />
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={PLACEHOLDERS[placeholder]} aria-label="Paste a link to start a board" />
        {url && (
          <button type="submit" aria-label="Create board">
            <ArrowRight size={15} />
          </button>
        )}
      </form>
      <div className="l-nav-right">
        <a className="l-link" href={href.recent()}>
          Open app
        </a>
        <button className="l-btn l-btn-dark l-btn-sm" onClick={() => start()}>
          Start for free
        </button>
      </div>
    </header>
  )
}

const FEATURE_DOC: DocBlock[] = [
  { ...createDocBlock('h3', 'Shoot day'), id: 'f1' },
  { ...createDocBlock('todo', 'Confirm location'), id: 'f2', checked: true },
  { ...createDocBlock('todo', 'Print the moodboard'), id: 'f3' },
  { ...createDocBlock('quote', 'Less, but better.'), id: 'f4' },
  { ...createDocBlock('code', 'palette = ["#E8DCCB", "#1F3A2E"]'), id: 'f5' },
]

const clock: WidgetItem = { id: 'w1', kind: 'widget', widget: 'clock', size: 'S', createdAt: 0, city: { name: 'New York', latitude: 40.71, longitude: -74, timezone: 'America/New_York' } }
const calendar: WidgetItem = { id: 'w2', kind: 'widget', widget: 'calendar', size: 'S', createdAt: 0 }

function DrawingLoop() {
  return (
    <svg className="draw-loop" viewBox="180 140 840 620" aria-hidden>
      {DEMO_STROKES.map((s, i) => (
        <polyline
          key={i}
          points={s.points.map(([x, y]) => `${x},${y}`).join(' ')}
          stroke={s.color}
          strokeWidth={s.size}
          pathLength={1}
          style={{ animationDelay: `${i * 0.35}s` }}
        />
      ))}
    </svg>
  )
}

const STEPS = [
  {
    key: 'projects',
    title: 'Projects, like in Figma',
    text: 'Boards live in projects. Drag a board onto a folder to move it, search across everything, and pick up where you left off in Recents.',
  },
  {
    key: 'share',
    title: 'One switch to share',
    text: 'Publish a view-only link to a board or a whole project. Keep editing — the link updates on its own.',
  },
  {
    key: 'detail',
    title: 'Every card has a story',
    text: 'Open any card to give it a title, notes and tags, then filter the board by tag when it grows.',
  },
  {
    key: 'export',
    title: 'Take it anywhere',
    text: 'Export to PDF, Markdown, HTML or CSV. Deleted cards and boards wait 30 days in Trash, just in case.',
  },
]

function StepVisual({ step }: { step: string }) {
  if (step === 'projects') {
    return (
      <div className="mock mock-projects">
        <div className="mock-sidebar">
          <span className="mock-logo">
            <Mark size={16} /> embeddd
          </span>
          <span className="mock-nav active">
            <FolderClosed size={14} /> Spring campaign
          </span>
          <span className="mock-nav">
            <FolderClosed size={14} /> Home refresh
          </span>
          <span className="mock-nav">
            <FolderClosed size={14} /> Research
          </span>
        </div>
        <div className="mock-tiles">
          {[13, 20, 16, 1].map((n, i) => (
            <div key={n} className="mock-tile">
              <img src={`/${photo(n)}`} alt="" />
              <b>{['Studio', 'Styling', 'Spaces', 'Rituals'][i]}</b>
            </div>
          ))}
        </div>
      </div>
    )
  }
  if (step === 'share') {
    return (
      <div className="mock mock-share">
        <b>Share “Spring campaign”</b>
        <div className="share-row">
          <span className="share-icon on">
            <Globe size={18} />
          </span>
          <div className="share-row-text">
            <div>Anyone with the link</div>
            <small>can view this project and all its boards</small>
          </div>
          <span className="switch on">
            <span />
          </span>
        </div>
        <div className="mock-link">
          <span>embeddd/s/k2Fq9xVb</span>
          <span className="l-btn l-btn-dark l-btn-sm">Copy link</span>
        </div>
        <small className="mock-muted">Up to date · published just now</small>
      </div>
    )
  }
  if (step === 'detail') {
    return (
      <div className="mock mock-detail">
        <img src={`/${photo(2)}`} alt="" />
        <div className="mock-detail-side">
          <b>Moraine Lake</b>
          <small>DESCRIPTION</small>
          <p>Pink light on the peaks — reference for the sunrise shoot.</p>
          <small>TAGS</small>
          <div className="tags">
            <span className="tag">#travel</span>
            <span className="tag">#light</span>
            <span className="tag">#mood</span>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="mock mock-export">
      {['PDF', 'Markdown', 'HTML', 'CSV'].map((f) => (
        <span key={f} className="mock-file">
          <Download size={16} /> {f}
        </span>
      ))}
      <span className="mock-restore">
        <RotateCcw size={14} /> Restore from Trash · 30 days
      </span>
    </div>
  )
}

function Steps() {
  const [active, setActive] = useState(0)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index))
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    refs.current.forEach((el) => el && observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <section className="steps">
      <h2 className="steps-title">
        Organized
        <br />
        like a studio.
      </h2>
      <div className="steps-visual">
        {STEPS.map((s, i) => (
          <div key={s.key} className={`steps-frame${i === active ? ' active' : ''}`}>
            <StepVisual step={s.key} />
          </div>
        ))}
      </div>
      <div className="steps-list">
        {STEPS.map((s, i) => (
          <div key={s.key} ref={(el) => void (refs.current[i] = el)} data-index={i} className={`step${i === active ? ' active' : ''}`}>
            <span className="step-index">0{i + 1}</span>
            <h3>{s.title}</h3>
            <p>{s.text}</p>
            <div className="step-inline">
              <StepVisual step={s.key} />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

const INTEGRATIONS = [
  { name: 'Notion', platform: 'notion' },
  { name: 'Figma', platform: 'figma' },
  { name: 'Miro', platform: 'miro' },
  { name: 'Pinterest', platform: 'pinterest' },
  { name: 'Instagram', platform: 'instagram' },
  { name: 'TikTok', platform: 'tiktok' },
  { name: 'YouTube', platform: 'youtube' },
] as const

export function Landing() {
  const start = useStart()
  const tourRef = useScrollProgress<HTMLDivElement>(1, 0.15)
  const heroCopy = useRef<HTMLDivElement>(null)
  const finalCopy = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = 'embeddd — collect the internet in one board'
    return () => {
      document.title = 'embeddd'
    }
  }, [])

  return (
    <div className="landing">
      <Nav />

      <section className="hero">
        <FloatingField seed={11} avoid={heroCopy} />
        <div className="hero-copy" ref={heroCopy}>
          <span className="hero-wordmark">embeddd</span>
          <h1>
            Collect the internet
            <br />
            in one board
          </h1>
          <p>Links, notes, sketches and widgets — arranged like a moodboard, organized like Figma.</p>
          <div className="hero-cta">
            <button className="l-btn l-btn-dark" onClick={() => start()}>
              Start for free
            </button>
            <a className="l-btn l-btn-light" href="#tour">
              See it in action
            </a>
          </div>
        </div>
        <a className="hero-tour" href="#tour">
          <Play size={13} fill="currentColor" /> Take the tour
        </a>
      </section>

      <section id="tour" className="tour">
        <div className="tour-frame" ref={tourRef}>
          <div className="tour-chrome">
            <span className="tour-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="tour-crumbs">
              Spring campaign / <b>Launch board</b>
            </span>
            <span className="tour-actions">
              <span className="btn-share btn">Share</span>
            </span>
          </div>
          <BoardEnvContext.Provider value={demoEnv}>
            <div className="board-wrap tour-board" data-cols={6}>
              <Board items={DEMO_ITEMS} columns={6} focusId={null} onUpdate={noop} onRemove={noop} onMove={noop} />
            </div>
          </BoardEnvContext.Provider>
        </div>
        <p className="tour-note">This is the real app — open any card.</p>
      </section>

      <section className="showcase">
        <h2 className="l-h2">
          Paste a link.
          <br />
          Keep a card.
        </h2>
        <BoardEnvContext.Provider value={demoEnv}>
          <LinkShowcase />
        </BoardEnvContext.Provider>
        <p className="l-sub">
          Figma, Notion, Miro, Pinterest, Instagram, TikTok and YouTube
          <br />
          become rich previews you can play, open and arrange.
        </p>
      </section>

      <section id="features" className="trio">
        <h2 className="l-h2">Make every board yours.</h2>
        <div className="trio-grid">
          <figure>
            <div className="trio-card trio-doc">
              <BoardEnvContext.Provider value={demoEnv}>
                <div className="card size-M kind-text">
                  <div className="card-body">
                    <DocEditor className="doc-card" blocks={FEATURE_DOC} onChange={noop} />
                  </div>
                </div>
              </BoardEnvContext.Provider>
              <div className="trio-slash">
                <span>/</span> Heading · To-do · Callout · Code
              </div>
            </div>
            <figcaption>Write like in Notion</figcaption>
          </figure>
          <figure>
            <div className="trio-card trio-sketch">
              <DrawingLoop />
            </div>
            <figcaption>Sketch like on paper</figcaption>
          </figure>
          <figure>
            <div className="trio-card trio-widgets">
              <div className="card size-S kind-widget widget-clock">
                <div className="card-body">
                  <ClockWidget item={clock} onUpdate={noop} />
                </div>
              </div>
              <div className="card size-S kind-widget widget-calendar">
                <div className="card-body">
                  <CalendarWidget item={calendar} onUpdate={noop} />
                </div>
              </div>
            </div>
            <figcaption>Widgets that stay live</figcaption>
          </figure>
        </div>
      </section>

      <Steps />

      <section id="integrations" className="integrations">
        <h2 className="l-h2 l-h2-small">Works with the places your ideas already live.</h2>
        <div className="marquee">
          <div className="marquee-track">
            {[...INTEGRATIONS, ...INTEGRATIONS].map((it, i) => (
              <span key={i} className="marquee-item">
                <PlatformBadge platform={it.platform} shorts={it.platform === 'youtube'} size={44} />
                {it.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="final">
        <FloatingField seed={29} avoid={finalCopy} density={0.9} scrollDepth={false} />
        <div className="final-copy" ref={finalCopy}>
          <span>Start with one link.</span>
          <button className="l-btn l-btn-dark l-btn-xl" onClick={() => start()}>
            Open embeddd
          </button>
          <small>No sign-up. Your boards stay in your browser.</small>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-footer-row">
          <nav>
            <a href="#tour">Tour</a>
            <a href="#features">Features</a>
            <a href="#integrations">Integrations</a>
          </nav>
          <Mark size={26} />
          <nav>
            <a href={href.recent()}>Open app</a>
            <a href={href.trash()}>Trash</a>
            <a href={href.achievements()}>Achievements</a>
          </nav>
        </div>
        <div className="l-giant" aria-hidden>
          embeddd
        </div>
      </footer>
    </div>
  )
}
