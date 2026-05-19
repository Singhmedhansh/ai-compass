import clsx from 'clsx'
import { motion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { DenseToolCard } from '../ui'
import { sectionReveal, staggerChild, staggerParent } from '../../lib/motion'

const MotionDiv = motion.div

function CategorySection({ id, title, tools, seeAllHref, seeAllLabel, emphasis = false }) {
  return (
    <MotionDiv
      id={id}
      variants={sectionReveal}
      initial="initial"
      whileInView="animate"
      viewport={{ once: true, amount: 0.15 }}
      className={clsx(
        'scroll-mt-40',
        emphasis
          ? 'mb-12 rounded-2xl border border-accent/30 bg-accent-soft p-5 sm:p-6'
          : 'mb-12',
      )}
    >
      <div className="mb-4 flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="text-xl font-bold tracking-tight text-ink">{title}</h2>
          {emphasis && (
            <span className="rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-bg">
              Editor&apos;s picks
            </span>
          )}
        </div>
        <Link
          to={seeAllHref}
          className="inline-flex shrink-0 items-center gap-1 self-start text-sm font-semibold text-accent-ink transition-colors hover:text-accent sm:self-auto"
        >
          {seeAllLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <MotionDiv
        variants={staggerParent}
        initial="initial"
        whileInView="animate"
        viewport={{ once: true, amount: 0.15 }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {tools.map((tool) => (
          <MotionDiv key={tool.slug || tool.name} variants={staggerChild}>
            <DenseToolCard tool={tool} />
          </MotionDiv>
        ))}
      </MotionDiv>
    </MotionDiv>
  )
}

export default CategorySection
