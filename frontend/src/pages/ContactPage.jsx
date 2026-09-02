import { motion } from 'framer-motion'
import { Mail, Phone, CreditCard, LifeBuoy } from 'lucide-react'
import { Helmet } from 'react-helmet-async'

import { WordReveal } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

const REVEAL_VIEWPORT = { once: true, margin: '-10% 0px' }

// lucide-react 1.7.0 omits brand icons. Inline SVG paths for GitHub/LinkedIn — currentColor lets them inherit Tailwind text color.
function GithubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

function LinkedinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

// Two addresses, and which one to use, stated before anything else.
//
// This page used to list one personal Gmail for everything. That address is
// gone: a founder deciding whether to send $49 to a directory reads a
// personal Gmail on the contact page as evidence there is no business behind
// it, and the same address handling both "which tier should I buy" and "I was
// charged twice" guarantees the urgent one waits behind the browsing one.
//
// The split is by URGENCY, not by department. Anything about money or a
// listing that did not appear goes to admin@ and is treated as urgent;
// everything else, including pre-sales questions about which tier to pick,
// goes to help@. Both are monitored, and the same split is printed in the
// footer of every email the site sends (app/templates/emails/base.html).
const CONTACT_CHANNELS = [
  {
    icon: LifeBuoy,
    label: 'Help & pre-sales',
    address: 'help@ai-compass.in',
    body:
      'Questions about your listing, the catalogue, or which pricing tier fits your launch. ' +
      'Ask before you buy — we will tell you when the answer is "stay on the free tier".',
    accent: false,
  },
  {
    icon: CreditCard,
    label: 'Payments & urgent issues',
    address: 'admin@ai-compass.in',
    body:
      'A charge that looks wrong, a double charge, a payment we could not confirm, or a paid ' +
      'listing that has not appeared. Include your PayPal reference and we will sort it out.',
    accent: true,
  },
]

export default function ContactPage() {
  return (
    <>
      <Helmet>
        <title>Contact — Get in Touch | AI Compass</title>
        <meta
          name="description"
          content="Contact AI Compass. help@ai-compass.in for listings, the catalogue and pricing questions; admin@ai-compass.in for payments, billing and anything urgent."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-4 py-12 md:py-20">
        <section>
          <h1 className="text-center text-3xl font-bold text-ink sm:text-4xl md:text-5xl">
            <WordReveal>Get in touch</WordReveal>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-center text-base text-muted sm:text-lg">
            Two addresses, so the urgent things are not stuck behind the browsing things. Both are
            read by a person, and email is the fastest way to reach us.
          </p>
        </section>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          {CONTACT_CHANNELS.map((channel) => (
            <a
              key={channel.address}
              href={`mailto:${channel.address}`}
              className={`group flex flex-col rounded-2xl border p-6 outline-none transition focus-visible:ring-2 focus-visible:ring-accent ${
                channel.accent
                  ? 'border-accent/40 bg-accent-soft/10 hover:border-accent'
                  : 'border-line bg-bg-elev hover:border-line-strong'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
                  <channel.icon className="h-5 w-5 text-accent-ink" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{channel.label}</p>
              </div>
              <p className="mt-4 break-all text-base font-semibold text-ink group-hover:text-accent">
                {channel.address}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{channel.body}</p>
            </a>
          ))}
        </MotionDiv>

        {/* The response commitment. Saying nothing about timing is what turns
            a two-day reply into "they ignored me" — and a founder who thinks
            they were ignored after paying tells other founders so. */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-4 rounded-2xl border border-line bg-bg-sunk/50 p-5"
        >
          <h2 className="text-sm font-bold text-ink">When you will hear back</h2>
          <ul className="mt-2 grid gap-1.5 text-sm leading-relaxed text-ink-2 sm:grid-cols-2">
            <li>
              <strong className="font-semibold text-ink">Payment problems</strong> — same day,
              usually within a few hours. Write to admin@.
            </li>
            <li>
              <strong className="font-semibold text-ink">Everything else</strong> — within one
              working day. Write to help@.
            </li>
            <li>
              <strong className="font-semibold text-ink">Paid a tier?</strong> Your invoice and
              dashboard link arrive by email immediately. If neither did, that is an admin@ email.
            </li>
            <li>
              <strong className="font-semibold text-ink">Not heard back?</strong> Resend to the
              other address. It is a mailbox problem, not a decision.
            </li>
          </ul>
        </MotionDiv>

        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          whileInView="animate"
          viewport={REVEAL_VIEWPORT}
          className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <a
            href="tel:+918951382530"
            className="group flex items-start gap-4 rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <Phone className="h-6 w-6 text-accent-ink" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">Phone</p>
              <p className="mt-1 truncate text-base font-semibold text-ink group-hover:text-accent">+91 89513 82530</p>
              <p className="mt-1 text-sm text-muted">Quick questions, India business hours.</p>
            </div>
          </a>

          <a
            href="https://github.com/Singhmedhansh"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <GithubIcon className="h-6 w-6 text-accent-ink" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">GitHub</p>
              <p className="mt-1 truncate text-base font-semibold text-ink group-hover:text-accent">@Singhmedhansh</p>
              <p className="mt-1 text-sm text-muted">The AI Compass codebase.</p>
            </div>
          </a>

          <a
            href="https://www.linkedin.com/in/medhansh-pratap-singh"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start gap-4 rounded-2xl border border-line bg-bg-elev p-6 outline-none transition hover:border-line-strong focus-visible:ring-2 focus-visible:ring-accent"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent-soft">
              <LinkedinIcon className="h-6 w-6 text-accent-ink" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted">LinkedIn</p>
              <p className="mt-1 truncate text-base font-semibold text-ink group-hover:text-accent">AI Compass</p>
              <p className="mt-1 text-sm text-muted">Company updates and background.</p>
            </div>
          </a>
        </MotionDiv>

        <p className="mt-8 text-center text-xs text-muted">
          <Mail className="mr-1 inline h-3 w-3" aria-hidden="true" />
          Mail from AI Compass is sent from medhansh.singh@ai-compass.in. Replies to it reach a
          person.
        </p>
      </div>
    </>
  )
}
