/**
 * ToolDetailPage Component
 * 
 * Premium tool discovery and comparison interface with:
 * - Glassmorphic cards with Framer Motion animations
 * - Smooth tab switcher for Overview, Pricing & Features, Student Perks
 * - Asymmetric two-column layout (left content, right sidebar)
 * - Micro-interactions on buttons, tabs, and list items
 * - Design System: Custom green (#168358/#2FB389), warm neutrals, premium typography
 * 
 * Design Philosophy: Premium Minimalist with Organic Warmth
 * - Intentional hierarchy through typography and spacing
 * - Warm sophistication with emerald green accents
 * - Micro-interactions for responsive feedback
 * - Asymmetric layout breaking grid monotony
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star,
  Globe,
  Bookmark,
  Share2,
  Check,
  AlertCircle,
  TrendingUp,
  Users,
  Award,
  Shield,
  Zap,
  ArrowRight,
  Heart,
  ChevronDown,
  Code,
  Smartphone,
  Globe as GlobeIcon,
} from 'lucide-react';

interface PricingTier {
  name: string;
  price: number;
  frequency: string;
  description: string;
  features: string[];
  isPopular: boolean;
  cta: string;
}

interface StudentPerk {
  title: string;
  description: string;
  discount: string;
}

interface Review {
  author: string;
  rating: number;
  text: string;
  date: string;
}

interface RelatedTool {
  name: string;
  category: string;
  rating: number;
  icon: string;
}

interface ToolData {
  name: string;
  maker: string;
  category: string;
  rating: number;
  reviewCount: number;
  description: string;
  useCases: string[];
  launchYear: number;
  platforms: string[];
  languages: string[];
  difficulty: string;
  verified: boolean;
  pricingTiers: PricingTier[];
  studentPerks: StudentPerk[];
  reviews: Review[];
  relatedTools: RelatedTool[];
  isDirectLanding?: boolean;
}

// Sample data for demonstration
const SAMPLE_TOOL: ToolData = {
  name: 'Figma',
  maker: 'Figma Inc.',
  category: 'Design & Prototyping',
  rating: 4.8,
  reviewCount: 2847,
  description: 'A collaborative interface design tool that brings together design, prototyping, and developer handoff in one platform. Figma enables teams to work together in real-time on design projects from concept to production.',
  useCases: [
    'UI/UX Design',
    'Wireframing',
    'Prototyping',
    'Design Systems',
    'Collaborative Design',
    'Developer Handoff',
  ],
  launchYear: 2016,
  platforms: ['Web', 'iOS', 'Android'],
  languages: ['English', 'Spanish', 'French', 'German', 'Japanese', 'Chinese'],
  difficulty: 'Beginner-Friendly',
  verified: true,
  pricingTiers: [
    {
      name: 'Starter',
      price: 0,
      frequency: 'Free',
      description: 'Perfect for getting started',
      features: [
        'Up to 3 projects',
        'Basic design tools',
        'Community support',
        '2GB file storage',
      ],
      isPopular: false,
      cta: 'Get Started',
    },
    {
      name: 'Professional',
      price: 12,
      frequency: '/month',
      description: 'For professional designers',
      features: [
        'Unlimited projects',
        'Advanced design tools',
        'Priority support',
        '100GB file storage',
        'Team collaboration',
        'Version history',
      ],
      isPopular: true,
      cta: 'Start Free Trial',
    },
    {
      name: 'Organization',
      price: 45,
      frequency: '/month',
      description: 'For large teams',
      features: [
        'Everything in Professional',
        'Advanced admin controls',
        'SSO & SAML',
        'Dedicated support',
        'Custom integrations',
        'Unlimited file storage',
      ],
      isPopular: false,
      cta: 'Contact Sales',
    },
  ],
  studentPerks: [
    {
      title: 'Student Discount',
      description: 'Get 50% off Professional plan with valid student email',
      discount: '50% OFF',
    },
    {
      title: 'UniHack Exclusive',
      description: 'Free access to Figma for hackathon participants',
      discount: 'FREE',
    },
  ],
  reviews: [
    {
      author: 'Sarah Chen',
      rating: 5,
      text: 'Figma has transformed how our design team collaborates. Real-time editing is a game-changer.',
      date: '2 weeks ago',
    },
    {
      author: 'Marcus Johnson',
      rating: 4,
      text: 'Excellent tool for design systems. Learning curve is minimal and the community is very helpful.',
      date: '1 month ago',
    },
  ],
  relatedTools: [
    { name: 'Adobe XD', category: 'Design', rating: 4.5, icon: '🎨' },
    { name: 'Sketch', category: 'Design', rating: 4.6, icon: '✏️' },
    { name: 'Webflow', category: 'Web Design', rating: 4.7, icon: '🌐' },
  ],
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
    },
  },
};

const buttonVariants = {
  rest: { scale: 1 },
  hover: { scale: 1.02 },
  tap: { scale: 0.97 },
};

const tabIndicatorVariants = {
  initial: { x: 0, opacity: 0 },
  animate: (custom: number) => ({
    x: custom * 100,
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  }),
};

// Hero Section Component
const HeroSection: React.FC<{ tool: ToolData }> = ({ tool }) => (
  <motion.section
    className="mb-8"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.4 }}
  >
    {/* Direct Landing Banner */}
    {tool.isDirectLanding && (
      <motion.div
        className="mb-6 p-4 bg-soft-accent border border-[#168358]/20 rounded-[10px] flex items-start gap-3"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <AlertCircle className="w-5 h-5 text-[#168358] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-[#0F1411] dark:text-[#F1F2EE]">
            You're visiting from an external source
          </p>
          <p className="text-xs text-[#6B716D] dark:text-[#8B918C] mt-1">
            Compare this tool with similar alternatives to make the best choice
          </p>
        </div>
      </motion.div>
    )}

    {/* Tool Header */}
    <div className="flex items-start gap-4 mb-6">
      {/* Tool Logo */}
      <motion.div
        className="w-16 h-16 rounded-[10px] bg-gradient-to-br from-[#168358] to-[#0F5A3F] flex items-center justify-center text-3xl font-bold text-white flex-shrink-0"
        whileHover={{ scale: 1.05 }}
        transition={{ duration: 0.2 }}
      >
        🎨
      </motion.div>

      {/* Tool Info */}
      <div className="flex-1">
        <div className="flex items-baseline gap-2 mb-2">
          <h1 className="text-4xl font-bold text-[#0F1411] dark:text-[#F1F2EE]" style={{ fontFamily: "'Geist', system-ui, sans-serif", fontWeight: 700 }}>
            {tool.name}
          </h1>
          <span className="text-sm font-medium text-[#6B716D] dark:text-[#8B918C]">
            by {tool.maker}
          </span>
        </div>

        <div className="flex items-center gap-4 mb-4">
          <span className="inline-block px-3 py-1 bg-soft-accent text-[#168358] dark:text-[#2FB389] text-xs font-semibold rounded-full">
            {tool.category}
          </span>

          {/* Star Rating */}
          <motion.div
            className="flex items-center gap-2"
            whileHover={{ scale: 1.05 }}
          >
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < Math.floor(tool.rating)
                      ? 'fill-[#168358] text-[#168358]'
                      : 'text-[#E6E5DE] dark:text-[#232927]'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm font-semibold text-[#0F1411] dark:text-[#F1F2EE]">
              {tool.rating}
            </span>
            <span className="text-xs text-[#6B716D] dark:text-[#8B918C]">
              ({tool.reviewCount.toLocaleString()} reviews)
            </span>
          </motion.div>
        </div>

        <p className="text-sm text-[#6B716D] dark:text-[#8B918C] leading-relaxed">
          {tool.description}
        </p>
      </div>
    </div>

    {/* Action Buttons */}
    <div className="flex flex-wrap gap-3">
      <motion.button
        className="px-6 py-3 bg-[#168358] dark:bg-[#2FB389] text-white font-semibold rounded-[10px] flex items-center gap-2 hover:bg-[#0F5A3F] dark:hover:bg-[#1FA076] transition-colors"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
        <Globe className="w-4 h-4" />
        Visit Website
        <ArrowRight className="w-4 h-4" />
      </motion.button>

      <motion.button
        className="px-6 py-3 border-2 border-[#E6E5DE] dark:border-[#232927] text-[#0F1411] dark:text-[#F1F2EE] font-semibold rounded-[10px] hover:bg-[#F2F1EB] dark:hover:bg-[#0A0E0C] transition-colors flex items-center gap-2"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
        <TrendingUp className="w-4 h-4" />
        Compare Tool
      </motion.button>

      <motion.button
        className="px-6 py-3 border-2 border-[#E6E5DE] dark:border-[#232927] text-[#0F1411] dark:text-[#F1F2EE] font-semibold rounded-[10px] hover:bg-[#F2F1EB] dark:hover:bg-[#0A0E0C] transition-colors flex items-center gap-2"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
        <Bookmark className="w-4 h-4" />
        Bookmark
      </motion.button>

      <motion.button
        className="px-6 py-3 border-2 border-[#E6E5DE] dark:border-[#232927] text-[#0F1411] dark:text-[#F1F2EE] font-semibold rounded-[10px] hover:bg-[#F2F1EB] dark:hover:bg-[#0A0E0C] transition-colors flex items-center gap-2"
        variants={buttonVariants}
        whileHover="hover"
        whileTap="tap"
      >
        <Share2 className="w-4 h-4" />
      </motion.button>
    </div>
  </motion.section>
);

// Tab Switcher Component
const TabSwitcher: React.FC<{
  tabs: string[];
  activeTab: number;
  onTabChange: (index: number) => void;
}> = ({ tabs, activeTab, onTabChange }) => (
  <motion.div
    className="mb-8 border-b border-[#E6E5DE] dark:border-[#232927]"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3, delay: 0.1 }}
  >
    <div className="flex gap-8 relative">
      {tabs.map((tab, index) => (
        <motion.button
          key={tab}
          onClick={() => onTabChange(index)}
          className={`pb-4 font-semibold text-sm transition-colors ${
            activeTab === index
              ? 'text-[#168358] dark:text-[#2FB389]'
              : 'text-[#6B716D] dark:text-[#8B918C] hover:text-[#0F1411] dark:hover:text-[#F1F2EE]'
          }`}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {tab}
        </motion.button>
      ))}

      {/* Animated Underline */}
      <motion.div
        className="absolute bottom-0 h-1 bg-gradient-to-r from-[#168358] to-[#2FB389] dark:from-[#2FB389] dark:to-[#168358] rounded-full"
        custom={activeTab}
        variants={tabIndicatorVariants}
        initial="initial"
        animate="animate"
        style={{ width: `${100 / tabs.length}%` }}
      />
    </div>
  </motion.div>
);

// Overview Tab Content
const OverviewTab: React.FC<{ tool: ToolData }> = ({ tool }) => (
  <motion.div
    className="space-y-8"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    {/* Use Cases */}
    <motion.div
      className="glass-card p-6"
      variants={itemVariants}
      whileHover={{ y: -2, boxShadow: '0 12px 24px rgba(0,0,0,0.08)' }}
    >
      <h3 className="text-lg font-semibold text-[#0F1411] dark:text-[#F1F2EE] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
        Primary Use Cases
      </h3>
      <div className="grid grid-cols-2 gap-3">
        {tool.useCases.map((useCase, index) => (
          <motion.div
            key={useCase}
            className="flex items-center gap-3 p-3 bg-soft-accent rounded-[10px]"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2, delay: index * 0.05 }}
            whileHover={{ x: 4 }}
          >
            <Check className="w-4 h-4 text-[#168358] dark:text-[#2FB389] flex-shrink-0" />
            <span className="text-sm font-medium text-[#0F1411] dark:text-[#F1F2EE]">
              {useCase}
            </span>
          </motion.div>
        ))}
      </div>
    </motion.div>
  </motion.div>
);

// Pricing Tab Content
const PricingTab: React.FC<{ tiers: PricingTier[] }> = ({ tiers }) => (
  <motion.div
    className="space-y-6"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {tiers.map((tier, index) => (
        <motion.div
          key={tier.name}
          className={`glass-card p-6 relative overflow-hidden ${
            tier.isPopular ? 'ring-2 ring-[#168358] dark:ring-[#2FB389]' : ''
          }`}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.1 }}
          whileHover={{ y: -4 }}
        >
          {tier.isPopular && (
            <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-[#168358] to-[#2FB389] text-white text-xs font-bold rounded-bl-lg">
              POPULAR
            </div>
          )}

          <h4 className="text-lg font-semibold text-[#0F1411] dark:text-[#F1F2EE] mb-2" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
            {tier.name}
          </h4>
          <p className="text-sm text-[#6B716D] dark:text-[#8B918C] mb-4">
            {tier.description}
          </p>

          <div className="mb-6">
            <span className="text-3xl font-bold text-[#0F1411] dark:text-[#F1F2EE]">
              ${tier.price}
            </span>
            <span className="text-sm text-[#6B716D] dark:text-[#8B918C] ml-2">
              {tier.frequency}
            </span>
          </div>

          <motion.button
            className={`w-full py-3 rounded-[10px] font-semibold mb-6 transition-colors ${
              tier.isPopular
                ? 'bg-[#168358] dark:bg-[#2FB389] text-white hover:bg-[#0F5A3F] dark:hover:bg-[#1FA076]'
                : 'border-2 border-[#E6E5DE] dark:border-[#232927] text-[#0F1411] dark:text-[#F1F2EE] hover:bg-[#F2F1EB] dark:hover:bg-[#0A0E0C]'
            }`}
            variants={buttonVariants}
            whileHover="hover"
            whileTap="tap"
          >
            {tier.cta}
          </motion.button>

          <div className="space-y-3">
            {tier.features.map((feature, i) => (
              <motion.div
                key={feature}
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
              >
                <Check className="w-4 h-4 text-[#168358] dark:text-[#2FB389] flex-shrink-0 mt-0.5" />
                <span className="text-sm text-[#0F1411] dark:text-[#F1F2EE]">
                  {feature}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      ))}
    </div>
  </motion.div>
);

// Student Perks Tab Content
const StudentPerksTab: React.FC<{ perks: StudentPerk[] }> = ({ perks }) => (
  <motion.div
    className="space-y-6"
    initial={{ opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.3 }}
  >
    {perks.map((perk, index) => (
      <motion.div
        key={perk.title}
        className="glass-card p-6 border-l-4 border-[#168358] dark:border-[#2FB389]"
        initial={{ opacity: 0, x: -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.3, delay: index * 0.1 }}
        whileHover={{ x: 4 }}
      >
        <div className="flex items-start justify-between mb-3">
          <h4 className="text-lg font-display font-semibold text-[#0F1411] dark:text-[#F1F2EE]">
            {perk.title}
          </h4>
          <span className="px-3 py-1 bg-soft-accent text-[#168358] dark:text-[#2FB389] text-xs font-bold rounded-full">
            {perk.discount}
          </span>
        </div>
        <p className="text-sm text-[#6B716D] dark:text-[#8B918C]">
          {perk.description}
        </p>
      </motion.div>
    ))}

    <motion.div
      className="glass-card p-6 bg-soft-accent"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: perks.length * 0.1 }}
    >
      <h4 className="text-base font-semibold text-[#0F1411] dark:text-[#F1F2EE] mb-3" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
        💡 UniHack Tip
      </h4>
      <p className="text-sm text-[#0F1411] dark:text-[#F1F2EE]">
        Many tools offer exclusive discounts for hackathon participants. Check the tool's website for current student and hackathon promotions.
      </p>
    </motion.div>
  </motion.div>
);

// Reviews Section
const ReviewsSection: React.FC<{ reviews: Review[] }> = ({ reviews }) => (
  <motion.section
    className="mt-12 pt-8 border-t border-[#E6E5DE] dark:border-[#232927]"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: 0.4, delay: 0.2 }}
  >
    <h2 className="text-2xl font-bold text-[#0F1411] dark:text-[#F1F2EE] mb-6" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
      User Reviews
    </h2>

    <motion.div
      className="space-y-4"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {reviews.map((review) => (
        <motion.div
          key={review.author}
          className="glass-card p-6"
          variants={itemVariants}
          whileHover={{ y: -2 }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-semibold text-[#0F1411] dark:text-[#F1F2EE]">
                {review.author}
              </p>
              <p className="text-xs text-[#6B716D] dark:text-[#8B918C]">
                {review.date}
              </p>
            </div>
            <div className="flex gap-1">
              {[...Array(5)].map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${
                    i < review.rating
                      ? 'fill-[#168358] text-[#168358]'
                      : 'text-[#E6E5DE] dark:text-[#232927]'
                  }`}
                />
              ))}
            </div>
          </div>
          <p className="text-sm text-[#0F1411] dark:text-[#F1F2EE] leading-relaxed">
            {review.text}
          </p>
        </motion.div>
      ))}
    </motion.div>
  </motion.section>
);

// Right Sidebar Component
const Sidebar: React.FC<{ tool: ToolData }> = ({ tool }) => (
  <motion.aside
    className="space-y-6"
      initial={{ opacity: 0, x: 12 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ duration: 0.4, delay: 0.15 }}
  >
    {/* Quick Metadata Card */}
    <motion.div
      className="glass-card p-6 sticky top-6"
      whileHover={{ y: -2 }}
    >
      <h3 className="text-lg font-semibold text-[#0F1411] dark:text-[#F1F2EE] mb-6" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
        Quick Info
      </h3>

      <div className="space-y-5">
        {/* Launch Year */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0 }}
        >
          <p className="text-xs font-semibold text-[#6B716D] dark:text-[#8B918C] uppercase tracking-wide mb-1">
            Launch Year
          </p>
          <p className="text-lg font-semibold text-[#0F1411] dark:text-[#F1F2EE]">
            {tool.launchYear}
          </p>
        </motion.div>

        {/* Platforms */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.05 }}
        >
          <p className="text-xs font-semibold text-[#6B716D] dark:text-[#8B918C] uppercase tracking-wide mb-2">
            Platforms
          </p>
          <div className="flex flex-wrap gap-2">
            {tool.platforms.map((platform) => (
              <span
                key={platform}
                className="px-2 py-1 bg-soft-accent text-[#168358] dark:text-[#2FB389] text-xs font-medium rounded-full flex items-center gap-1"
              >
                {platform === 'Web' && <GlobeIcon className="w-3 h-3" />}
                {platform === 'iOS' && <Smartphone className="w-3 h-3" />}
                {platform === 'Android' && <Code className="w-3 h-3" />}
                {platform}
              </span>
            ))}
          </div>
        </motion.div>

        {/* Languages */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <p className="text-xs font-semibold text-[#6B716D] dark:text-[#8B918C] uppercase tracking-wide mb-2">
            Languages ({tool.languages.length})
          </p>
          <p className="text-sm text-[#0F1411] dark:text-[#F1F2EE]">
            {tool.languages.slice(0, 3).join(', ')}
            {tool.languages.length > 3 && ` +${tool.languages.length - 3}`}
          </p>
        </motion.div>

        {/* Difficulty */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.15 }}
        >
          <p className="text-xs font-semibold text-[#6B716D] dark:text-[#8B918C] uppercase tracking-wide mb-1">
            Difficulty
          </p>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#168358] dark:text-[#2FB389]" />
            <span className="text-sm font-medium text-[#0F1411] dark:text-[#F1F2EE]">
              {tool.difficulty}
            </span>
          </div>
        </motion.div>

        {/* Verification */}
        {tool.verified && (
          <motion.div
            className="pt-4 border-t border-[#E6E5DE] dark:border-[#232927] flex items-center gap-2"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Shield className="w-4 h-4 text-[#168358] dark:text-[#2FB389]" />
            <span className="text-xs font-semibold text-[#168358] dark:text-[#2FB389]">
              Verified Tool
            </span>
          </motion.div>
        )}
      </div>
    </motion.div>

    {/* Related Tools */}
    <motion.div
      className="glass-card p-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.25 }}
    >
      <h3 className="text-lg font-semibold text-[#0F1411] dark:text-[#F1F2EE] mb-4" style={{ fontFamily: "'Geist', system-ui, sans-serif" }}>
        Related Tools
      </h3>

      <motion.div
        className="space-y-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {tool.relatedTools.map((relatedTool) => (
          <motion.button
            key={relatedTool.name}
            className="w-full p-3 rounded-[10px] bg-soft-accent hover:bg-[#D4E8E0] dark:hover:bg-[#1A3A2E] transition-colors text-left"
            variants={itemVariants}
            whileHover={{ x: 4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-semibold text-[#0F1411] dark:text-[#F1F2EE] text-sm">
                  {relatedTool.icon} {relatedTool.name}
                </p>
                <p className="text-xs text-[#6B716D] dark:text-[#8B918C]">
                  {relatedTool.category}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Star className="w-3 h-3 fill-[#168358] text-[#168358]" />
                <span className="text-xs font-semibold text-[#0F1411] dark:text-[#F1F2EE]">
                  {relatedTool.rating}
                </span>
              </div>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  </motion.aside>
);

// Main ToolDetailPage Component
export default function ToolDetailPage() {
  const [activeTab, setActiveTab] = useState(0);
  const tabs = ['Overview', 'Pricing & Features', 'Student Perks'];
  const tool = SAMPLE_TOOL;

  return (
    <div className="min-h-screen bg-[#FAFAF7] dark:bg-[#0E1311]">
      <div className="container max-w-7xl mx-auto py-8">
        {/* Hero Section */}
        <HeroSection tool={tool} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2">
            {/* Tab Switcher */}
            <TabSwitcher
              tabs={tabs}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {activeTab === 0 && (
                <OverviewTab key="overview" tool={tool} />
              )}
              {activeTab === 1 && (
                <PricingTab key="pricing" tiers={tool.pricingTiers} />
              )}
              {activeTab === 2 && (
                <StudentPerksTab key="perks" perks={tool.studentPerks} />
              )}
            </AnimatePresence>

            {/* Reviews Section */}
            <ReviewsSection reviews={tool.reviews} />
          </div>

          {/* Right Column - Sidebar */}
          <div className="lg:col-span-1">
            <Sidebar tool={tool} />
          </div>
        </div>
      </div>
    </div>
  );
}
