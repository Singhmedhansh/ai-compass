import { motion } from 'framer-motion'
import { ArrowRight, Calendar, GraduationCap, MapPin } from 'lucide-react'
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

import medhanshPhoto from '../assets/medhansh.jpeg'
import { MagneticWrapper, WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

// Imported asset bundled by Vite with content-hash filename. Falls back to initial-circle "M" if set back to null.
const PHOTO_URL = medhanshPhoto

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

export default function TeamPage() {
  return (
    <>
      <Helmet>
        <title>About — Built by Medhansh | AI Compass</title>
        <meta
          name="description"
          content="AI Compass is built by Medhansh, a CS AI/ML student at RVCE Bengaluru. Curated AI tools directory for students, hand-tested weekly."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-12 md:py-20">
        <section>
          {PHOTO_URL ? (
            <img
              src={PHOTO_URL}
              alt="Medhansh Pratap Singh"
              className="mx-auto h-32 w-32 rounded-full object-cover ring-4 ring-bg-elev"
            />
          ) : (
            <div
              aria-hidden="true"
              className="mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-accent text-4xl font-semibold text-bg ring-4 ring-bg-elev"
            >
              M
            </div>
          )}
          <h1 className="mt-6 text-center text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
            <WordReveal>Built by Medhansh</WordReveal>
          </h1>
          <p className="mt-4 text-center text-base text-muted sm:text-lg">
            First-year B.E. CS (AI/ML) student at RVCE, Bengaluru. Building the AI tool resource I wished existed.
          </p>
        </section>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-16 md:mt-24"
        >
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">Why AI Compass</h2>
          <div className="mt-4 rounded-2xl border border-line bg-bg-elev p-6 md:p-8">
            <p className="leading-relaxed text-ink-2">
              I started AI Compass because students kept asking me which AI tools were actually worth the time, and I was tired of pointing them at SEO-bait listicles. The directories that came up first on Google read like affiliate spam — ranked by referral rates, not by what students would actually use for an essay, a project, or a job application.
            </p>
            <p className="mt-3 leading-relaxed text-ink-2">
              Every tool in this catalog is something I vetted personally or had real users review. Pricing tiers spelled out, no fake testimonials, no rankings for sale. It&apos;s hand-curated and maintained out of Bengaluru, with the goal of being the resource I wish existed when I was first exploring what AI could do for my coursework.
            </p>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-12"
        >
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">Background</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-line bg-bg-elev p-5">
              <GraduationCap className="h-5 w-5 text-accent" aria-hidden="true" />
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">EDUCATION</p>
              <p className="mt-1 text-sm text-ink">RV College of Engineering, Bengaluru — B.E. Computer Science (AI/ML)</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-elev p-5">
              <Calendar className="h-5 w-5 text-accent" aria-hidden="true" />
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">YEAR</p>
              <p className="mt-1 text-sm text-ink">First year</p>
            </div>
            <div className="rounded-xl border border-line bg-bg-elev p-5">
              <MapPin className="h-5 w-5 text-accent" aria-hidden="true" />
              <p className="mt-3 text-xs uppercase tracking-wide text-muted">LOCATION</p>
              <p className="mt-1 text-sm text-ink">Bengaluru, India</p>
            </div>
          </div>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-12"
        >
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">Get in touch</h2>
          <p className="mt-2 text-sm text-muted">Tool suggestions, feedback, or collaboration — all welcome.</p>
          <MagneticWrapper strength={0.25} className="mt-4">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-bg outline-none transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-accent"
            >
              Contact me
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </MagneticWrapper>
        </MotionDiv>
      </div>
    </>
  )
}
