import { useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, CheckCircle, AlertTriangle, ExternalLink, GraduationCap, Code, ShieldCheck, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const MotionDiv = motion.div;

export default function HowToGithubStudentPack() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const steps = [
    {
      num: "01",
      title: "Prepare Your Academic Proof",
      desc: "Gather your official school-issued email address (ending in .edu or your school's local domain). If your school doesn't issue emails, get a clear photo of your student ID card, current semester enrollment letter, or fee receipt.",
      icon: GraduationCap,
    },
    {
      num: "02",
      title: "Disable Your VPN & Adblocker",
      desc: "GitHub's verification system cross-references your physical IP location with the location of your academic institution. Using a VPN is the #1 reason student applications are auto-rejected. Ensure location services are active.",
      icon: ShieldCheck,
      warning: "Do not use your phone's cellular data if it routes through a distant server. Use your campus Wi-Fi if possible.",
    },
    {
      num: "03",
      title: "Access the GitHub Education Portal",
      desc: "Navigate to education.github.com/pack and click 'Get your Pack'. Select 'Student' and sign in with your primary personal GitHub account. You can link your school email to your personal account in settings later.",
      icon: ExternalLink,
      link: "https://education.github.com/pack",
    },
    {
      num: "04",
      title: "Add and Verify Your School Email",
      desc: "If you haven't already, add your school email address to your GitHub account settings. Keep it un-primary if you prefer, but it must be verified. Select this email on the application form and type your school's official name.",
      icon: CheckCircle,
    },
    {
      num: "05",
      title: "Upload Verification Documents",
      desc: "GitHub will ask you to use your webcam or upload a photo of your school proof. Take a high-resolution, well-lit picture of your student ID or official transcript. The text must be clearly legible and show the current academic year.",
      icon: Code,
    },
    {
      num: "06",
      title: "Submit and Claim Your Perks",
      desc: "Submit your application. Automated reviews take anywhere from a few minutes to 3 days. Once approved, you will receive a confirmation email. Return to the portal to claim free GitHub Copilot, Canva Pro, JetBrains, and $100 in DigitalOcean credits.",
      icon: ShieldCheck,
    },
  ];

  const faqs = [
    {
      q: "My school does not issue .edu emails. Can I still apply?",
      a: "Yes! You can apply using your personal email address. You will just need to upload official documentation (student ID, report card, or enrollment letter) that clearly states your name and the current date/semester.",
    },
    {
      q: "Why was my application immediately rejected?",
      a: "The most common reasons are using a VPN, mismatched profile names (your GitHub account name should resemble your legal/academic name), or poor document image quality where the date or school name is unreadable.",
    },
    {
      q: "How do I activate GitHub Copilot once approved?",
      a: "Once approved, go to github.com/settings/copilot. You should see a message stating that Copilot is free for you as an approved student. Click 'Get Access' and authorize it.",
    },
    {
      q: "How long does the approval stay active?",
      a: "Approval is usually valid for 1 year. GitHub will send you an email reminder to re-verify your student status when the year is up, which you can do as long as you are still enrolled.",
    },
  ];

  return (
    <>
      <Helmet>
        <title>How to Claim GitHub Student Developer Pack (Step-by-Step) | AI Compass</title>
        <meta
          name="description"
          content="Get GitHub Copilot, Canva Pro, and $100 in cloud credits free. A step-by-step guide for students to successfully apply for the GitHub Student Developer Pack."
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
            Claim Your GitHub <br/>
            <span className="bg-gradient-to-r from-accent to-accent-hover bg-clip-text text-transparent">
              Student Developer Pack
            </span>
          </h1>
          <p className="mx-auto max-w-2xl text-muted text-base md:text-lg">
            Unlock over $40,000 worth of premium software, including <strong>GitHub Copilot</strong>, 
            Canva Pro, DigitalOcean, and JetBrains IDEs for 100% free while you study.
          </p>
        </div>

        {/* Steps Grid */}
        <div className="space-y-6 mb-16">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Code className="h-6 w-6 text-accent" /> Application Walkthrough
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
                      Visit the Portal <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </MotionDiv>
            );
          })}
        </div>

        {/* Pro Tips Section */}
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-6 md:p-8 mb-16">
          <h3 className="text-lg md:text-xl font-bold text-yellow-700 dark:text-yellow-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> Crucial Tips to Avoid Instant Rejections
          </h3>
          <ul className="space-y-3 text-sm md:text-base text-muted list-disc list-inside">
            <li>
              <strong>Make your profile match:</strong> Before applying, edit your public GitHub profile name to match the name on your student ID/document exactly.
            </li>
            <li>
              <strong>Physical Location Check:</strong> Apply while physically located in the same city/region as your school. If you are study-from-home elsewhere, mention it in the notes.
            </li>
            <li>
              <strong>Webcam Document Capture:</strong> If you use your laptop webcam, hold the document extremely still, adjust lighting to avoid glare on plastic cards, and wait for autofocus.
            </li>
            <li>
              <strong>Clear Personal Account:</strong> GitHub forbids having multiple accounts. Apply on your primary personal account (that you will keep after graduating) so you retain your code history.
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
