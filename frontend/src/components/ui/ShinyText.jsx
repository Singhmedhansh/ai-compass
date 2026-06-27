import { useState, useEffect } from 'react'

export default function ShinyText({ text, children, disabled = false, speed = 3, className = '' }) {
  const content = text || children;
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const shouldDisable = disabled || isMobile;
  
  return (
    <span
      className={`inline-block bg-clip-text text-transparent bg-no-repeat ${shouldDisable ? '' : 'animate-shine'} ${className}`}
      style={{
        backgroundImage: shouldDisable ? 'none' : 'linear-gradient(120deg, rgba(255, 255, 255, 0) 40%, var(--ink) 50%, rgba(255, 255, 255, 0) 60%)',
        backgroundColor: shouldDisable ? 'transparent' : 'var(--muted)',
        color: shouldDisable ? 'var(--ink)' : 'transparent',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: shouldDisable ? 'none' : 'text',
        '--shine-duration': `${speed}s`,
      }}
    >
      {content}
    </span>
  );
}
