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
