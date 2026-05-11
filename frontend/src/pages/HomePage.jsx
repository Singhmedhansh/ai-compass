import { Helmet } from 'react-helmet-async'

import CurationDiscipline from '../components/home/CurationDiscipline'
import FinalCTA from '../components/home/FinalCTA'
import Hero from '../components/home/Hero'
import SunoStory from '../components/home/SunoStory'
import WizardDemo from '../components/home/WizardDemo'

export default function HomePage() {
  return (
    <>
      <Helmet>
        <title>AI Compass — Find & Compare AI Tools | ChatGPT, Claude & 450+ More</title>
        <meta name="description" content="AI Compass helps students discover and compare 450+ AI tools including ChatGPT, Claude, Grammarly and more. Free tool finder, ratings, and personalized recommendations." />
        <meta property="og:title" content="AI Compass — Find & Compare AI Tools | ChatGPT, Claude & 450+ More" />
        <meta property="og:description" content="Discover and compare 450+ AI tools. Free personalized recommendations for students." />
        <link rel="canonical" href="https://ai-compass.in/" />
      </Helmet>

      <Hero />
      <WizardDemo />
      <CurationDiscipline />
      <SunoStory />
      <FinalCTA />
    </>
  )
}
