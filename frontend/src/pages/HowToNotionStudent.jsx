import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, AlertTriangle, ExternalLink, GraduationCap, ClipboardList, ShieldCheck, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const MotionDiv = motion.div;

export default function HowToNotionStudent() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const steps = [
    {
      num: "01",
      title: "Sign Up with Your School Email",
      desc: "Create a new Notion account using your school-provided email address (e.g., name@university.edu). If you already have an active Notion account on a personal email, you can change your email to your school address in account settings first.",
      icon: GraduationCap,
    },
    {
      num: "02",
      title: "Open Settings & Members",
      desc: "Navigate to the sidebar on the left and click 'Settings & Members' (on desktop) or tap the gear icon (on mobile). Select the 'Plan' tab from the submenu.",
      icon: ClipboardList,
    },
    {
      num: "03",
      title: "Upgrade to the Student Plan",
      desc: "Scroll down to the bottom of the Plans page. You should see a button or link that says 'Get free education plan'. Click it. Notion will automatically verify your school domain against its database.",
      icon: CheckCircle,
      warning: "If your workspace contains more than one member, the system will not let you upgrade. Ensure your workspace is a personal one with just you in it.",
    },
    {
      num: "04",
      title: "Check Your Plus Plan Status",
      desc: "If the automatic domain check is successful, your account will immediately upgrade to the 'Plus Plan (Education)'. This unlocks unlimited workspace blocks, 30-day page history, and the ability to upload files of any size (removing the 5MB free limit).",
      icon: ShieldCheck,
    },
    {
      num: "05",
      title: "Optional: Add Notion AI at 50% Off",
      desc: "Go to settings and toggle 'Notion AI'. Approved students can subscribe to Notion AI for just $5/month (a 50% discount from the standard price). Notion AI is excellent for summarizing lecture notes, correcting spelling, and drafting templates.",
      icon: ExternalLink,
    },
  ];

  const faqs = [
    {
      q: "My school domain is not recognized. How do I get verified?",
      a: "If your school email does not trigger the auto-upgrade, fill out Notion's education support form. Upload a copy of your student ID card or official course registration showing your school's name and your active status. Support typically approves requests in 2-3 business days.",
    },
    {
      q: "Can I collaborate with other students on the free Education Plan?",
      a: "Yes! You can invite up to 100 guests to collaborate on specific pages inside your workspace. However, you cannot add full workspace members (admins/editors) without converting it into a paid team plan.",
    },
    {
      q: "What happens to my notes after I graduate?",
      a: "Your notes are yours forever. Once you graduate, you can change your account email back to a personal address (Gmail, Outlook, etc.). Your account will revert to the standard Free Plan, but you will keep all your pages and notes.",
    },
  ];

  return (
    <>
      <Helmet>
        <title>How to Get Notion Plus & Notion AI for Students (Step-by-Step) | AI Compass</title>
        <meta
          name="description"
          content="Learn how to claim your free Notion Plus Education plan. Save $10/month and get unlimited blocks, large file uploads, and discounted Notion AI."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-5 py-10 md:py-16">
        {/* Back Link */}
        <Link
          to="/best-ai-tools-for-students"
          className="group inline-flex items-center gap-2 mb-8 text-sm font-semibold text-accent no-underline hover:text-accent-hover transition-colors"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Students Guide
        </Link>

        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev/40 px-6 py-10 md:p-12 text-center backdrop-blur-xl mb-12">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-accent/5 pointer-events-none" />
          <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent mb-4 uppercase tracking-wider">
            Step-by-Step Student Guide
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            Claim Your Free <br/>
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              Notion Plus Education Plan
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-muted text-base md:text-lg">
            Organize your notes, lecture slides, and study schedules. Get Notion's $120/year Plus plan 
            completely free, and optional <strong>Notion AI</strong> for 50% off.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="space-y-6 mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-accent" /> Activation Walkthrough
          </h2>

          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <MotionDiv
                key={idx}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: idx * 0.05 }}
                className="relative flex flex-col md:flex-row gap-6 p-6 rounded-2xl border border-line bg-bg-elev/30 hover:bg-bg-elev/50 transition-colors"
              >
                {/* Step number badge */}
                <div className="flex items-start justify-between md:justify-start">
                  <span className="text-4xl md:text-5xl font-black text-accent/10 select-none font-mono">
                    {step.num}
                  </span>
                  <div className="p-2.5 rounded-xl bg-accent/10 text-accent md:hidden">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="hidden md:flex p-2 rounded-xl bg-accent/10 text-accent">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="text-lg md:text-xl font-bold">{step.title}</h3>
                  </div>
                  <p className="text-muted text-sm md:text-base leading-relaxed">
                    {step.desc}
                  </p>

                  {step.warning && (
                    <div className="mt-3 flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3 text-xs text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{step.warning}</span>
                    </div>
                  )}
                </div>
              </MotionDiv>
            );
          })}
        </div>

        {/* Pro Tips Section */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 md:p-8 mb-16">
          <h3 className="text-lg md:text-xl font-bold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Essential Workspace Setup Tips
          </h3>
          <ul className="space-y-3 text-sm md:text-base text-muted list-disc list-inside">
            <li>
              <strong>Convert Personal Account:</strong> Don't create a new account if you already have notes. Just go to settings, change your login email to the school email, and then run the upgrade.
            </li>
            <li>
              <strong>Check Workspace Members:</strong> If you see a warning about members, go to 'Settings & Members' - 'Members' and remove any guests or other members from your workspace list before upgrading.
            </li>
            <li>
              <strong>Template resources:</strong> Explore Notion's student template gallery for free class hubs, lecture organizers, and job application trackers designed specifically for academic workflows.
            </li>
          </ul>
        </div>

        {/* FAQs */}
        <div className="border-t border-line pt-12">
          <h2 className="text-2xl font-bold mb-8 flex items-center gap-2">
            <HelpCircle className="h-6 w-6 text-accent" /> Frequently Asked Questions
          </h2>
          <div className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq, idx) => (
              <div key={idx} className="p-5 rounded-xl border border-line bg-bg-elev/20">
                <h4 className="font-bold text-base md:text-lg mb-2">{faq.q}</h4>
                <p className="text-muted text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
