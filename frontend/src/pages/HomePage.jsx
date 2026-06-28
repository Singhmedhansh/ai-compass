import { Helmet } from 'react-helmet-async'
import { useCatalogStats } from '../hooks/useCatalogStats'

import CurationDiscipline from '../components/home/CurationDiscipline'
import FinalCTA from '../components/home/FinalCTA'
import Hero from '../components/home/Hero'
import NewsletterCapture from '../components/home/NewsletterCapture'
import SubmitInvite from '../components/home/SubmitInvite'
import SunoStory from '../components/home/SunoStory'
import WizardDemo from '../components/home/WizardDemo'

export default function HomePage() {
  const { roundedToolsText } = useCatalogStats() // {/* Dynamic — do not hardcode */}

  return (
    <>
      <Helmet>
        <title>Free AI Tools for Students — {roundedToolsText} Hand-Tested | AI Compass {/* Dynamic — do not hardcode */}</title>
        <meta name="description" content={`${roundedToolsText} free and freemium AI tools, hand-tested for students. Find the right one in 30 seconds. No login, no signup, no ranking tricks.`} /* Dynamic — do not hardcode */ />
        <meta property="og:title" content={`Free AI Tools for Students — ${roundedToolsText} Hand-Tested | AI Compass`} /* Dynamic — do not hardcode */ />
        <meta property="og:description" content={`${roundedToolsText} free and freemium AI tools, hand-tested for students. Find the right one in 30 seconds. No login, no signup, no ranking tricks.`} /* Dynamic — do not hardcode */ />
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
