import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, AlertTriangle, ExternalLink, GraduationCap, Laptop, ShieldCheck, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const MotionDiv = motion.div;

export default function HowToJetBrainsStudent() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const steps = [
    {
      num: "01",
      title: "Confirm Your Student Status",
      desc: "Ensure you have an active school email (e.g., student@university.edu) or an International Student Identity Card (ISIC). If neither is available, obtain a digital copy of your student transcript, official enrollment certificate, or tuition receipt.",
      icon: GraduationCap,
    },
    {
      num: "02",
      title: "Go to JetBrains Education Portal",
      desc: "Open your browser and navigate to jetbrains.com/community/education/#students. Scroll down and click the 'Apply Now' button to open the registration form.",
      icon: ExternalLink,
      link: "https://www.jetbrains.com/community/education/#students",
    },
    {
      num: "03",
      title: "Choose Verification Method",
      desc: "Choose from University email address (recommended, instantaneous), ISIC/ITIC card, or official documents. Fill out your level of study, your name, country of study, and submit the form.",
      icon: Laptop,
    },
    {
      num: "04",
      title: "Click the Email Verification Link",
      desc: "JetBrains will send a confirmation link to your school email (or personal email if verified by documents). Open your inbox, find the mail from JetBrains, and click the confirmation link to accept their license agreement terms.",
      icon: CheckCircle,
    },
    {
      num: "05",
      title: "Link License to Your JetBrains Account",
      desc: "Once verified, you will be prompted to log in or create a JetBrains Account. Create the account using your verified academic email. Your license will automatically attach to this profile.",
      icon: ShieldCheck,
    },
    {
      num: "06",
      title: "Activate inside your IDE",
      desc: "Download and install any JetBrains IDE (IntelliJ IDEA Ultimate, WebStorm, PyCharm Pro, Rider, CLion). When opening the IDE, select 'Activate License', choose 'JetBrains Account', and log in to sync your active license.",
      icon: Laptop,
    },
  ];

  const faqs = [
    {
      q: "Which JetBrains IDEs are included in the student license?",
      a: "The Educational license includes ALL professional JetBrains desktop tools: IntelliJ IDEA Ultimate, PyCharm Professional, WebStorm, CLion, Rider, ReSharper, DataGrip, RubyMine, GoLand, and PHPStorm.",
    },
    {
      q: "Can I use student licenses for commercial work or internships?",
      a: "No. The license terms strictly specify that educational licenses must only be used for learning, classroom assignments, and non-commercial research. For internships that involve commercial projects, the company must provide you with a commercial license.",
    },
    {
      q: "How do I renew my license after it expires?",
      a: "Your license is valid for exactly 1 year. One week before it expires, JetBrains will send you an email with a renewal link. Click it to log in and re-verify your student status (usually using your school email domain check) to extend it for another year.",
    },
  ];

  return (
    <>
      <Helmet>
        <title>How to Get JetBrains Free Student License (Step-by-Step) | AI Compass</title>
        <meta
          name="description"
          content="Unlock PyCharm Pro, IntelliJ IDEA Ultimate, WebStorm, and other professional JetBrains tools 100% free. A complete application guide for students."
        />
      </Helmet>

      <div className="mx-auto max-w-4xl px-5 py-10 md:py-16">
        {/* Back Link */}
        <Link
          to="/best-coding-tools-for-students"
          className="group inline-flex items-center gap-2 mb-8 text-sm font-semibold text-accent no-underline hover:text-accent-hover transition-colors"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
          Back to Coding Tools Guide
        </Link>

        {/* Hero Section */}
        <div className="relative overflow-hidden rounded-3xl border border-line bg-bg-elev/40 px-6 py-10 md:p-12 text-center backdrop-blur-xl mb-12">
          <div className="absolute inset-0 bg-gradient-to-tr from-accent/5 via-transparent to-accent/5 pointer-events-none" />
          <span className="inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-bold text-accent mb-4 uppercase tracking-wider">
            Step-by-Step Student Guide
          </span>
          <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
            Claim Your Free JetBrains <br/>
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              All Products Pack License
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-muted text-base md:text-lg">
            Get 100% free access to PyCharm Pro, IntelliJ Ultimate, WebStorm, and all other professional 
            developer IDEs ($250+/year value) while you are in school or university.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="space-y-6 mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Laptop className="h-6 w-6 text-accent" /> License Application Walkthrough
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

                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 text-xs font-bold text-accent hover:underline"
                    >
                      Visit the Application Site <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </MotionDiv>
            );
          })}
        </div>

        {/* License Verification Advice */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 md:p-8 mb-16">
          <h3 className="text-lg md:text-xl font-bold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Verification Troubleshooting & Rules
          </h3>
          <ul className="space-y-3 text-sm md:text-base text-muted list-disc list-inside">
            <li>
              <strong>Instant vs. Manual Approval:</strong> If you use your university email address and your university domain is listed in JetBrains' approved global database, your license is granted instantly. Manual document review takes up to 7-10 days.
            </li>
            <li>
              <strong>Use JetBrains Toolbox App:</strong> Download the JetBrains Toolbox app first. It is the easiest way to download, update, and manage all your installed IDEs, and it handles the login activation context for all IDEs simultaneously.
            </li>
            <li>
              <strong>Graduation discount:</strong> When you graduate, JetBrains offers a 25% 'graduation discount' on standard commercial licenses, which is valid for 1 year after your student status ends.
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
