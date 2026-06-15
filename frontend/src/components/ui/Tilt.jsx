import React, { useRef, useState, useEffect } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

const springConfig = { damping: 20, stiffness: 300, mass: 0.5 };
const MotionDiv = motion.div;

export default function Tilt({ children, className = '', rotation = 10, scale = 1.02 }) {
  const ref = useRef(null);
  const rectRef = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  
  const x = useSpring(0, springConfig);
  const y = useSpring(0, springConfig);

  const rotateX = useTransform(y, (value) => value * -rotation);
  const rotateY = useTransform(x, (value) => value * rotation);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (ref.current) {
      rectRef.current = ref.current.getBoundingClientRect();
    }
  };

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    if (!rectRef.current) {
      rectRef.current = ref.current.getBoundingClientRect();
    }
    const rect = rectRef.current;
    const width = rect.width;
    const height = rect.height;
    
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const xPct = (mouseX / width) - 0.5;
    const yPct = (mouseY / height) - 0.5;
    
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rectRef.current = null;
    x.set(0);
    y.set(0);
  };

  useEffect(() => {
    if (!isHovered) return undefined;
    const handleScroll = () => {
      rectRef.current = null;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isHovered]);

  return (
    <MotionDiv
      ref={ref}
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ scale: isHovered ? scale : 1 }}
      style={{
        rotateX: isHovered ? rotateX : 0,
        rotateY: isHovered ? rotateY : 0,
        transformStyle: 'preserve-3d',
        perspective: 1000,
      }}
      className={`relative will-change-transform ${className}`}
    >
      {children}
    </MotionDiv>
  );
}
