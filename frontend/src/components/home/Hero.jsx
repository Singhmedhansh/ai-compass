import { Link } from 'react-router-dom'
import { HelpCircle } from 'lucide-react'

import { useCatalogStats } from '../../hooks/useCatalogStats'
import AnimatedCompass from '../ui/AnimatedCompass'
import { MagneticWrapper, WordReveal, AuroraBackground, ShinyText, FlipWords, InfiniteMarquee } from '../ui'

// Static fallback covers the ~100ms before /api/v1/stats responds — kept close to the live count so the page never reads as broken.
const FALLBACK_TOOL_COUNT = 400

const MARQUEE_LOGOS = [
  { name: 'ChatGPT', domain: 'openai.com', slug: 'chatgpt' },
  { name: 'Claude', domain: 'anthropic.com', slug: 'claude' },
  { name: 'Gemini', domain: 'gemini.google.com', slug: 'gemini' },
  { name: 'Midjourney', domain: 'midjourney.com', slug: 'midjourney' },
  { name: 'Perplexity', domain: 'perplexity.ai', slug: 'perplexity-ai' },
  { name: 'Notion', domain: 'notion.so', slug: 'notion' },
  { name: 'Cursor', domain: 'cursor.com', slug: 'cursor' },
  { name: 'ElevenLabs', domain: 'elevenlabs.io', slug: 'elevenlabs' },
  { name: 'Runway', domain: 'runwayml.com', slug: 'runway-gen-3' },
  { name: 'QuillBot', domain: 'quillbot.com', slug: 'quillbot' },
  { name: 'Suno', domain: 'suno.com', slug: 'suno' },
  { name: 'v0', domain: 'v0.dev', slug: 'vercel-v0' },
  { name: 'Canva', domain: 'canva.com', slug: 'canva' },
  { name: 'Grammarly', domain: 'grammarly.com', slug: 'grammarly' },
  { name: 'DeepL', domain: 'deepl.com', slug: 'deepl' }
]

export default function Hero() {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}
  
  const audienceWords = ["Students.", "Researchers.", "Coders.", "Writers.", "Designers."]

  const handleStartTour = () => {
    window.dispatchEvent(new CustomEvent('ai-compass-start-tour'))
  }

  return (
    <AuroraBackground>
      <header className="relative pt-9 pb-8 md:pt-20 md:pb-16">
        <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-5 md:grid-cols-[minmax(0,1fr)_auto] md:gap-16 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line/40 bg-bg-elev/40 backdrop-blur-sm shadow-sm px-2.5 py-1 text-xs font-medium text-muted">
              <span
                aria-hidden="true"
                className="h-1.5 w-1.5 rounded-full bg-accent"
                style={{ boxShadow: '0 0 0 3px color-mix(in oklab, var(--accent) 25%, transparent)' }}
              />
              For undergraduates · {roundedToolsText} tools curated {/* Dynamic — do not hardcode */}
            </div>

            <h1 className="mt-4 mb-3.5 text-balance text-4xl sm:text-5xl lg:text-6xl font-semibold leading-[1.1] tracking-tight text-ink md:max-w-[16ch]">
              <ShinyText text="Find the perfect AI tool." className="leading-[1.1]" />
              <br className="hidden md:block" />
              <span className="text-muted-2 text-4xl sm:text-5xl lg:text-6xl">For <FlipWords words={audienceWords} className="text-ink" /></span>
            </h1>

            <p className="mb-5 max-w-[36ch] text-pretty text-[15px] text-muted md:max-w-[48ch] md:text-lg">
              Stop endlessly searching. Tell us your use case, budget, and platform,
              and get <strong className="font-medium text-ink-2">the exact AI tools you need in 30 seconds</strong>. Hand-tested. Free. No login required.
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <MagneticWrapper strength={0.25}>
                <Link
                  to="/ai-tool-finder"
                  className="group inline-flex items-center gap-2 rounded-full bg-ink px-[18px] py-3 text-sm font-medium text-bg transition-all hover:-translate-y-px hover:shadow-md"
                >
                  Start the wizard
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                  >
                    <path d="M3 8h10M9 4l4 4-4 4" />
                  </svg>
                </Link>
              </MagneticWrapper>
              <Link
                to="/tools"
                className="inline-flex items-center gap-2 rounded-full border border-line/50 bg-bg-elev/30 backdrop-blur-sm shadow-sm px-[18px] py-3 text-sm font-medium text-ink transition-all hover:border-line-strong hover:bg-bg-elev/50 hover:backdrop-blur-md"
              >
                Browse the catalog
              </Link>
              <button
                type="button"
                onClick={handleStartTour}
                className="inline-flex items-center gap-1.5 rounded-full border border-line/50 bg-bg-elev/30 backdrop-blur-sm shadow-sm px-[18px] py-3 text-sm font-medium text-muted hover:text-ink hover:border-line-strong hover:bg-bg-elev/50 hover:backdrop-blur-md transition-all"
              >
                <HelpCircle className="h-4 w-4" /> Take a Tour
              </button>
            </div>

            <div
              className="mt-6 flex flex-wrap gap-[18px] text-[13px] text-muted"
              aria-label="Quick facts"
            >
              <span className="inline-flex items-center gap-1.5">
                <b className="font-semibold text-ink">30 sec</b> · to a shortlist
              </span>
              <span className="inline-flex items-center gap-1.5">
                <b className="font-semibold text-ink">0</b> · accounts required
              </span>
              <span className="inline-flex items-center gap-1.5 border-l border-line pl-4">
                <span className="flex -space-x-2 mr-1">
                  <img className="inline-block h-5 w-5 rounded-full ring-2 ring-bg" src="https://i.pravatar.cc/100?img=1" alt=""/>
                  <img className="inline-block h-5 w-5 rounded-full ring-2 ring-bg" src="https://i.pravatar.cc/100?img=2" alt=""/>
                  <img className="inline-block h-5 w-5 rounded-full ring-2 ring-bg" src="https://i.pravatar.cc/100?img=3" alt=""/>
                </span>
                <b className="font-semibold text-ink">1,000+</b> · users finding tools
              </span>
            </div>

            <div
              aria-hidden="true"
              className="mt-7 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-2 md:hidden"
            >
              <span>Scroll</span>
              <svg
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="M3 5l3 3 3-3" />
              </svg>
            </div>
          </div>

          <div className="hidden justify-center md:flex">
            <AnimatedCompass size={340} />
          </div>
        </div>

        {/* Horizontal Looping Marquee */}
        <div className="mt-20 md:mt-24 w-full relative z-10 hidden md:block">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-2 mb-5">
            Discover & Compare {roundedToolsText} Hand-Tested AI Tools {/* Dynamic — do not hardcode */}
          </p>
          <div className="py-3 min-h-[80px]">
            <InfiniteMarquee
              items={MARQUEE_LOGOS}
              speed={40}
              gap="1rem"
              renderItem={(logo, index) => (
                <Link
                  key={`${logo.name}-${index}`}
                  to={`/tools/${logo.slug}`}
                  className="flex items-center gap-3 rounded-2xl border border-line/50 bg-bg-elev/40 backdrop-blur-md px-5 py-3 shadow-lg hover:border-accent/50 hover:bg-bg-elev/60 transition-all duration-300 transform hover:scale-[1.05] cursor-pointer"
                >
                  <img
                    src={`/icon/${logo.domain}`}
                    alt={logo.name}
                    className="h-7 w-7 rounded-lg p-0.5 object-contain shadow-[0_1px_4px_rgba(0,0,0,0.10)] border border-line/30"
                    style={{ backgroundColor: 'var(--logo-bg)' }}
                    loading="lazy"
                  />
                  <span className="font-semibold text-ink-2">{logo.name}</span>
                </Link>
              )}
            />
          </div>
        </div>
      </header>
    </AuroraBackground>
  )
}
