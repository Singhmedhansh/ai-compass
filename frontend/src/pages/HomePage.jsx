import { Helmet } from 'react-helmet-async'

import CurationDiscipline from '../components/home/CurationDiscipline'
import FinalCTA from '../components/home/FinalCTA'
import Hero from '../components/home/Hero'
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
        <link rel="canonical" href="https://ai-compass.in/" />
        {/* WebSite + SearchAction enables the Google "sitelinks search
            box" — Google shows a search input directly under our SERP
            entry that, when used, hits /tools?query=… on our site. */}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            url: 'https://ai-compass.in/',
            name: 'AI Compass',
            description: 'Curated AI tools directory for students.',
            potentialAction: {
              '@type': 'SearchAction',
              target: {
                '@type': 'EntryPoint',
                urlTemplate: 'https://ai-compass.in/tools?query={search_term_string}',
              },
              'query-input': 'required name=search_term_string',
            },
          })}
        </script>
        {/* Organization markup — gives Google a publisher identity to
            attach to all our Article/SoftwareApplication entries. */}
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Organization',
            name: 'AI Compass',
            url: 'https://ai-compass.in/',
            logo: 'https://ai-compass.in/apple-touch-icon.png',
            sameAs: [],
          })}
        </script>
      </Helmet>

      <Hero />
      <WizardDemo />
      <CurationDiscipline />
      <SunoStory />
      <FinalCTA />
      <SubmitInvite />
    </>
  )
}
