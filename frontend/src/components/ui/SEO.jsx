import { Helmet } from 'react-helmet-async'

export default function SEO({ title, description, path, image }) {
  const baseDomain = 'https://ai-compass.in'
  const defaultTitle = 'AI Compass - Find the Best AI Tools for Students'
  const defaultDescription = 'Discover, compare, and choose the most effective AI tools to supercharge your academic and creative workflows.'
  const defaultImage = `${baseDomain}/og-image.png`

  const seoTitle = title ? `${title} | AI Compass` : defaultTitle
  const seoDescription = description || defaultDescription
  const seoUrl = path ? `${baseDomain}${path}` : baseDomain
  const seoImage = image || defaultImage

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    'name': 'AI Compass',
    'applicationCategory': 'EducationalApplication',
    'operatingSystem': 'All',
    'description': seoDescription,
    'url': seoUrl,
    'image': seoImage
  }

  return (
    <Helmet>
      {/* Standard HTML Elements */}
      <title>{seoTitle}</title>
      <meta name="description" content={seoDescription} />

      {/* Structured JSON-LD Data for AEO */}
      <script type="application/ld+json">
        {JSON.stringify(jsonLd)}
      </script>

      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={seoTitle} />
      <meta property="og:description" content={seoDescription} />
      <meta property="og:image" content={seoImage} />
      <meta property="og:url" content={seoUrl} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="AI Compass" />

      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={seoTitle} />
      <meta name="twitter:description" content={seoDescription} />
      <meta name="twitter:image" content={seoImage} />
    </Helmet>
  )
}
