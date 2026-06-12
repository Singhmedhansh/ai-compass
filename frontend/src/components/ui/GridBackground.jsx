import React from 'react';

export default function GridBackground({ children, className = "" }) {
  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {/* The dot pattern */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      
      {/* Radial gradient mask to fade the edges */}
      <div className="absolute pointer-events-none inset-0 flex items-center justify-center bg-bg [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] z-0"></div>
      
      {/* Content wrapper */}
      <div className="relative z-10 w-full h-full">
        {children}
      </div>
    </div>
  );
}
