import { motion } from "framer-motion"

export default function AuroraBackground({ children, className = "" }) {
  return (
    <div className={`relative flex flex-col items-center justify-center bg-bg bg-gradient-to-b from-accent-soft/20 via-bg to-bg md:from-bg md:via-bg md:to-bg transition-bg overflow-hidden w-full h-full ${className}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 mask-gradient-b hidden md:block">
        <div
          className={`
            [--white-gradient:repeating-linear-gradient(100deg,var(--bg)_0%,var(--bg)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--bg)_16%)]
            [--dark-gradient:repeating-linear-gradient(100deg,var(--bg)_0%,var(--bg)_7%,var(--transparent)_10%,var(--transparent)_12%,var(--bg)_16%)]
            [--aurora:repeating-linear-gradient(100deg,var(--accent)_10%,var(--accent-soft)_15%,var(--bg-elev)_20%,var(--accent-ink)_25%,var(--accent)_30%)]
            [background-image:var(--white-gradient),var(--aurora)]
            dark:[background-image:var(--dark-gradient),var(--aurora)]
            [background-size:300%,_200%]
            [background-position:50%_50%,50%_50%]
            filter blur-[10px] invert dark:invert-0
            after:content-[''] after:absolute after:inset-0 after:[background-image:var(--white-gradient),var(--aurora)]
            after:dark:[background-image:var(--dark-gradient),var(--aurora)]
            after:[background-size:200%,_100%]
            after:animate-aurora after:[background-attachment:fixed] after:mix-blend-difference
            pointer-events-none
            absolute -inset-[10px] opacity-30 will-change-transform
          `}
        />
      </div>
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  )
}
