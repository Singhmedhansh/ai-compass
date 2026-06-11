import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Helmet } from 'react-helmet-async'
import { 
  Globe, 
  Loader2, 
  Sparkles, 
  Heart, 
  Layers, 
  AlertCircle, 
  ArrowRight,
  BookOpen,
  User
} from 'lucide-react'

// Custom SVGs for brand icons not present in lucide-react 1.7.0
function Github(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden="true" style={{ width: '1em', height: '1em' }}>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.69-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.51-1.47.11-3.06 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.77.12 3.06.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56C20.22 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  )
}

function Linkedin(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden="true" style={{ width: '1em', height: '1em' }}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.95v5.66H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.45v6.29ZM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12Zm1.78 13.02H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.72v20.55C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.72C24 .77 23.2 0 22.22 0Z" />
    </svg>
  )
}

function Twitter(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={props.className} aria-hidden="true" style={{ width: '1em', height: '1em' }}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

import { Button, ToolLogo } from '../components/ui'
import { sectionReveal } from '../lib/motion'

const MotionDiv = motion.div

export default function PublicProfilePage() {
  const { username } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    
    async function loadPublicProfile() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`${API}/api/v1/users/profile/${username}`)
        if (response.status === 404) {
          throw new Error('Profile not found or is private.')
        }
        if (!response.ok) {
          throw new Error('Failed to load profile.')
        }
        const profileData = await response.json()
        setData(profileData)
      } catch (err) {
        console.error(err)
        setError(err.message || 'An error occurred while loading this profile.')
      } finally {
        setLoading(false)
      }
    }

    if (username) {
      loadPublicProfile()
    }
  }, [username])

  const avatarLetter = useMemo(() => {
    if (!data?.display_name) return 'U'
    return String(data.display_name).charAt(0).toUpperCase()
  }, [data?.display_name])

  if (loading) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center text-center">
        <Loader2 className="h-10 w-10 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Retrieving developer portfolio...</p>
      </div>
    )
  }

  if (error || !data) {
    return (
      <>
        <Helmet>
          <title>Profile Not Found | AI Compass</title>
          <meta name="robots" content="noindex" />
        </Helmet>
        <div className="mx-auto max-w-md px-4 py-24 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-danger-soft text-danger mb-6">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-ink">Profile Not Found</h2>
          <p className="mt-3 text-sm text-muted">
            The profile <strong>/u/{username}</strong> does not exist, or has been set to private by the owner.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="primary" className="font-semibold" onClick={() => navigate('/tools')}>
              Browse All Tools
            </Button>
            <Button variant="secondary" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Helmet>
        <title>{data.display_name}’s AI Portfolio | AI Compass</title>
        <meta
          name="description"
          content={`Check out ${data.display_name}’s student developer portfolio on AI Compass. Explore their favorited AI tools and curated tool stacks.`}
        />
      </Helmet>

      {/* Decorative background glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.03] dark:opacity-[0.05]">
        <div className="absolute -left-1/4 -top-1/4 h-[800px] w-[800px] rounded-full bg-accent blur-[120px]" />
        <div className="absolute -right-1/4 -bottom-1/4 h-[800px] w-[800px] rounded-full bg-pink-500 blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl px-4 py-12 md:py-20">
        
        {/* Profile Header Card */}
        <MotionDiv
          variants={sectionReveal}
          initial="initial"
          animate="animate"
          className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev p-6 md:p-10 shadow-xl"
        >
          {/* Glassmorphic border glow overlay */}
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-pink-500/5 pointer-events-none" />
          
          <div className="relative flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-8">
            {/* Avatar */}
            <div className="shrink-0">
              {data.avatar_url ? (
                <img
                  src={data.avatar_url}
                  alt={data.display_name}
                  className="h-24 w-24 rounded-full object-cover border-4 border-accent-soft shadow-lg"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-accent text-white text-3xl font-bold border-4 border-accent-soft shadow-lg select-none">
                  {avatarLetter}
                </div>
              )}
            </div>

            {/* Profile Info */}
            <div className="flex-1 text-center md:text-left space-y-4">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent mb-2">
                  <Sparkles className="h-3.5 w-3.5" />
                  Student Portfolio
                </span>
                <h1 className="text-3xl font-extrabold text-ink tracking-tight">{data.display_name}</h1>
                <p className="text-sm text-muted-2 mt-1">/u/{username}</p>
              </div>

              {data.bio ? (
                <blockquote className="text-base text-ink-2 font-medium italic border-l-2 border-accent pl-4 py-1 inline-block text-left max-w-2xl bg-bg-sunk/35 rounded-r-2xl pr-4">
                  "{data.bio}"
                </blockquote>
              ) : (
                <p className="text-sm text-muted italic">This developer hasn't written a biography yet.</p>
              )}

              {/* Social Accounts */}
              {(data.github_username || data.linkedin_username || data.twitter_username) && (
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
                  {data.github_username && (
                    <a
                      href={`https://github.com/${data.github_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:bg-bg-elev transition"
                    >
                      <Github className="h-4 w-4" />
                      GitHub
                    </a>
                  )}
                  {data.linkedin_username && (
                    <a
                      href={`https://linkedin.com/in/${data.linkedin_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:bg-bg-elev transition"
                    >
                      <Linkedin className="h-4 w-4" />
                      LinkedIn
                    </a>
                  )}
                  {data.twitter_username && (
                    <a
                      href={`https://twitter.com/${data.twitter_username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg-sunk px-3 py-1.5 text-xs font-semibold text-ink hover:border-accent hover:bg-bg-elev transition"
                    >
                      <Twitter className="h-4 w-4" />
                      Twitter/X
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </MotionDiv>

        {/* Content sections */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Favorites list (1/3 width on wide screens) */}
          <div className="space-y-6 lg:col-span-1">
            <div className="flex items-center gap-2">
              <Heart className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-bold text-ink">Favorite Tools</h2>
              <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-accent">
                {data.favorites?.length || 0}
              </span>
            </div>

            {data.favorites?.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-bg-elev/40 p-6 text-center text-sm text-muted">
                No favorited tools listed.
              </div>
            ) : (
              <div className="space-y-3">
                {data.favorites?.map((fav) => (
                  <div
                    key={fav.slug}
                    onClick={() => navigate(`/tools/${fav.slug}`)}
                    className="group flex items-center gap-3 rounded-2xl border border-line bg-bg-elev/40 p-3 shadow-sm hover:border-accent/40 hover:bg-bg-elev hover:shadow transition cursor-pointer"
                  >
                    <div className="shrink-0">
                      <ToolLogo tool={fav} size={36} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-sm text-ink group-hover:text-accent transition-colors truncate">
                        {fav.name}
                      </h4>
                      <p className="text-xs text-muted truncate">{fav.tagline || fav.category}</p>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-2 group-hover:text-accent group-hover:translate-x-0.5 transition" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Stacks list (2/3 width on wide screens) */}
          <div className="space-y-6 lg:col-span-2">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-accent" />
              <h2 className="text-xl font-bold text-ink">Public Stacks</h2>
              <span className="rounded-md bg-pink-500/10 px-1.5 py-0.5 text-xs font-bold text-pink-500">
                {data.stacks?.length || 0}
              </span>
            </div>

            {data.stacks?.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line bg-bg-elev/40 p-8 text-center text-sm text-muted">
                No public stacks curated yet.
              </div>
            ) : (
              <div className="space-y-6">
                {data.stacks?.map((stack) => (
                  <div
                    key={stack.id}
                    className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev/40 p-6 shadow-sm hover:border-line-strong hover:bg-bg-elev/80 transition duration-300"
                  >
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                        <h3 className="font-extrabold text-lg text-ink tracking-tight">{stack.name}</h3>
                        <div className="flex flex-wrap gap-1.5">
                          {stack.budget && (
                            <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase text-accent">
                              {stack.budget}
                            </span>
                          )}
                          {stack.platform && (
                            <span className="rounded-md bg-pink-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-pink-500">
                              {stack.platform}
                            </span>
                          )}
                          {stack.level && (
                            <span className="rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-500">
                              {stack.level}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {stack.goal && (
                        <p className="mt-3 text-sm text-ink-2 font-medium">
                          <strong className="text-accent font-semibold">Goal:</strong> {stack.goal}
                        </p>
                      )}

                      {/* Tool inside Stack */}
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                        {stack.tools?.map((tool) => (
                          <div
                            key={tool.slug}
                            onClick={() => navigate(`/tools/${tool.slug}`)}
                            className="group/tool flex items-center gap-3 rounded-2xl border border-line bg-bg-sunk/35 p-3 hover:border-accent/40 hover:bg-bg-elev transition cursor-pointer"
                          >
                            <ToolLogo tool={tool} size={32} />
                            <div className="min-w-0 flex-1">
                              <h5 className="font-bold text-xs text-ink group-hover/tool:text-accent transition-colors truncate">
                                {tool.name}
                              </h5>
                              <p className="text-[10px] text-muted truncate">{tool.category}</p>
                            </div>
                            <ArrowRight className="h-3 w-3 text-muted-2 group-hover/tool:text-accent transition" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Explore more footer banner */}
        <div className="mt-20 text-center border-t border-line pt-10">
          <h3 className="text-lg font-bold text-ink">Want to discover student AI tools?</h3>
          <p className="mt-2 text-sm text-muted max-w-sm mx-auto">
            AI Compass tracks hundreds of hand-tested tools to supercharge your college workflow.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="primary" className="font-semibold" onClick={() => navigate('/tools')}>
              Explore Catalog
            </Button>
            <Button variant="secondary" onClick={() => navigate('/ai-tool-finder')}>
              Find My Stack
            </Button>
          </div>
        </div>
        
      </div>
    </>
  )
}
