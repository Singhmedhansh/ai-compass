import { Helmet } from 'react-helmet-async'

import CurationDiscipline from '../components/home/CurationDiscipline'
import FinalCTA from '../components/home/FinalCTA'
import Hero from '../components/home/Hero'
import NewsletterCapture from '../components/home/NewsletterCapture'
import SubmitInvite from '../components/home/SubmitInvite'
import SunoStory from '../components/home/SunoStory'
import WizardDemo from '../components/home/WizardDemo'

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>Free AI Tools for Students — 400+ Hand-Tested | AI Compass</title>
        <meta name="description" content="400+ free and freemium AI tools, hand-tested for students. Find the right one in 30 seconds. No login, no signup, no ranking tricks." />
        <meta property="og:title" content="Free AI Tools for Students — 400+ Hand-Tested | AI Compass" />
        <meta property="og:description" content="400+ free and freemium AI tools, hand-tested for students. Find the right one in 30 seconds. No login, no signup, no ranking tricks." />
        {/* Canonical is emitted server-side (index.html default, rewritten
            per-route by _inject_meta) to avoid a duplicate <link> tag. */}
      </Helmet>

      <Hero />
      <WizardDemo />
      <CurationDiscipline />
      <NewsletterCapture />
      <SunoStory />
      <FinalCTA />
      <SubmitInvite />
    </>
  )
}
