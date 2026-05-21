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
        <title>AI Compass — 399 Hand-Tested AI Tools for Students</title>
        <meta name="description" content="Curated AI tools directory for students. 399 tools hand-tested, with a one-line reason each. Free to browse, updated weekly." />
        <meta property="og:title" content="AI Compass — 399 Hand-Tested AI Tools for Students" />
        <meta property="og:description" content="Curated AI tools directory for students. 399 tools hand-tested, with a one-line reason each. Free to browse, updated weekly." />
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
