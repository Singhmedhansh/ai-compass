import React, { useRef, useEffect, useState } from "react";
import { motion, useAnimationFrame } from "framer-motion";

export default function InfiniteMarquee({
  items,
  renderItem,
  speed = 40,
  direction = "left",
  className = "",
  pauseOnHover = true,
  gap = "1rem"
}) {
  const contentRef = useRef(null);
  
  const [contentWidth, setContentWidth] = useState(0);
  const [x, setX] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (contentRef.current) {
      setContentWidth(contentRef.current.offsetWidth);
    }
    
    // Recalculate on resize
    const handleResize = () => {
      if (contentRef.current) {
        setContentWidth(contentRef.current.offsetWidth);
      }
    };
    
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [items]);

  useAnimationFrame((t, delta) => {
    if (pauseOnHover && isHovered) return;
    
    // Optional safeguard for very long delays
    if (delta > 100) delta = 16.66;
    
    const moveAmount = (speed * delta) / 1000;
    
    setX((prev) => {
      const nextX = direction === "left" ? prev - moveAmount : prev + moveAmount;
      
      // If we've scrolled a full content width, reset
      if (direction === "left" && nextX <= -contentWidth) {
        return nextX + contentWidth;
      }
      if (direction === "right" && nextX >= 0) {
        return nextX - contentWidth;
      }
      return nextX;
    });
  });

  return (
    <div
      className={`overflow-hidden whitespace-nowrap flex w-full ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}
    >
      <motion.div
        className="flex shrink-0 will-change-transform"
        style={{ x, gap }}
      >
        <div ref={contentRef} className="flex shrink-0" style={{ gap }}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
        <div className="flex shrink-0" style={{ gap }}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
      </motion.div>
    </div>
  );
}
