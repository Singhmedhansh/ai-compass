export default function ShinyText({ text, children, disabled = false, speed = 3, className = '' }) {
  const content = text || children;
  
  return (
    <span
      className={`inline-block bg-clip-text text-transparent bg-no-repeat ${disabled ? '' : 'animate-shine'} ${className}`}
      style={{
        backgroundImage: 'linear-gradient(120deg, rgba(255, 255, 255, 0) 40%, var(--ink) 50%, rgba(255, 255, 255, 0) 60%)',
        backgroundColor: 'var(--muted)',
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        '--shine-duration': `${speed}s`,
      }}
    >
      {content}
    </span>
  );
}
