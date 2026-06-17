import { useEffect } from "react";
import { motion } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { 
  ShieldAlert, 
  BookOpen, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  HelpCircle, 
  Lock, 
  Compass, 
  Users, 
  Settings, 
  ArrowLeft,
  ChevronRight,
  GraduationCap
} from "lucide-react";

import { WordReveal } from "../components/ui";
import { sectionReveal, staggerParent, staggerChild } from "../lib/motion";

const MotionDiv = motion.div;

const detectorMatrix = {
  headers: ["Detector", "LMS Integration", "Accuracy Claim", "Paraphrase Capture", "Code Plagiarism", "False Positive Risk"],
  rows: [
    {
      name: "Turnitin AI Detector",
      lms: "Native (Canvas, Blackboard, Moodle)",
      accuracy: "High (~98% claim)",
      paraphrase: "Moderate (struggles with heavy spins)",
      code: "Basic",
      risk: "Significant (flags formal student writing)",
    },
    {
      name: "GPTZero",
      lms: "Browser Extension / Web Portal",
      accuracy: "Moderate (~85-90% claim)",
      paraphrase: "Poor (easily bypassed by QuillBot)",
      code: "None",
      risk: "High (detects perplexity baseline patterns)",
    },
    {
      name: "CopyLeaks",
      lms: "Canvas, Blackboard, Web API",
      accuracy: "Very High (~99% claim)",
      paraphrase: "Excellent (detects semantic patterns)",
      code: "High (recognizes AI structure in code)",
      risk: "Moderate (highly customizable sensitivity)",
    },
    {
      name: "Winston AI",
      lms: "Web Portal / API Only",
      accuracy: "High (~99% claim)",
      paraphrase: "Good",
      code: "None",
      risk: "Moderate",
    },
  ],
};

const policyTiers = [
  {
    tier: "RED TIER",
    name: "Zero AI Assistance",
    desc: "AI tools are strictly prohibited. All brainstorming, outlining, and writing must be done individually by the student.",
    useCases: ["In-class exams", "Standard quizzes", "Initial baseline writing assessments"],
    color: "#ef4444",
  },
  {
    tier: "YELLOW TIER",
    name: "Assistive AI Use",
    desc: "Students may use AI for research, planning, outlines, or grammar check. The final prose must be written by the student.",
    useCases: ["Generating outline ideas", "Finding typos / proofreading", "Explaining complex source material"],
    color: "#f59e0b",
  },
  {
    tier: "GREEN TIER",
    name: "Full Collaborative Integration",
    desc: "AI is treated as a collaborative partner. Students may co-write, generate draft sections, or utilize AI APIs to complete projects, provided AI contributions are explicitly cited.",
    useCases: ["Advanced coding assignments", "AI evaluation/critique tasks", "Generative design projects"],
    color: "#10b981",
  },
];

export default function BestAIToolsForTeachers() {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <>
      <Helmet>
        <title>AI Plagiarism, Detection & Classroom Policy: Educator's Guide | AI Compass</title>
        <meta
          name="description"
          content="A comprehensive academic guide on AI plagiarism. Compare Turnitin vs GPTZero vs CopyLeaks, understand bypass methods, and design AI-resistant assessments."
        />
        <meta
          name="keywords"
          content="AI plagiarism, AI detector accuracy, Turnitin AI detection, bypass AI detectors, AI-resistant assignments, classroom AI policy, neurodivergent false positives"
        />
        <link rel="canonical" href="https://ai-compass.in/best-ai-tools-for-teachers" />
      </Helmet>

      <div className="font-serif bg-bg text-ink">
        {/* Back Link */}
        <div className="mx-auto max-w-[960px] px-6 pt-8">
          <Link
            to="/tools"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-accent no-underline hover:text-accent-hover transition-colors font-sans"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
            Back to Directory
          </Link>
        </div>

        {/* Hero Section */}
        <div className="mx-auto max-w-[960px] px-6 pt-12 pb-12 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            <GraduationCap className="h-4 w-4" /> Educator Advisory Board · Verified June 2026
          </div>
          <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            <WordReveal>The Educator&apos;s Blueprint</WordReveal>
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[700px] mx-auto mb-8 font-sans">
            A comprehensive, research-backed guide on AI plagiarism detection, bypass tactics, 
            false positive risks, and actionable pedagogy strategies.
          </p>
        </div>

        {/* SECTION 1: THE REALITY OF AI IN ACCADEMICS */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <BookOpen className="h-6 w-6 text-accent" /> 1. The Classroom Reality
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-4 font-serif">
            As AI models reach human-level fluency, traditional boundaries of plagiarism have dissolved. 
            Banning AI outright has proven ineffective; instead, schools must transition from a model of 
            <strong> catch-and-punish detection</strong> to <strong>mitigation and authentic assessment</strong>.
          </p>
          <p className="text-muted text-sm md:text-base leading-relaxed font-serif">
            Students utilize AI not just to ghostwrite essays, but to format structures, summarize papers, 
            debug code, and generate outline drafts. Recognizing the distinction between assistive and 
            plagiaristic use is the first step toward modern syllabus planning.
          </p>
        </div>

        {/* SECTION 2: PLAGIARISM DETECTION COMPARED */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <ShieldAlert className="h-6 w-6 text-accent" /> 2. AI Plagiarism Detectors Deconstructed
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-6 font-serif">
            Most AI detectors look for statistical patterns: <strong>Perplexity</strong> (how random or common the 
            word choice is) and <strong>Burstiness</strong> (how much sentence lengths vary). Because AI outputs 
            are mathematically predictable, they exhibit low perplexity and low burstiness.
          </p>

          {/* Detector Table */}
          <div className="overflow-x-auto rounded-2xl border border-line bg-bg-elev shadow-sm mb-6">
            <table className="w-full border-collapse text-left text-sm min-w-[650px]">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-xs font-semibold uppercase tracking-wider text-ink-2">
                  {detectorMatrix.headers.map((h, idx) => (
                    <th key={idx} className="px-5 py-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {detectorMatrix.rows.map((row, idx) => (
                  <tr key={idx} className="transition-colors hover:bg-accent-soft/10">
                    <td className="px-5 py-4 font-bold text-ink">{row.name}</td>
                    <td className="px-5 py-4 text-muted">{row.lms}</td>
                    <td className="px-5 py-4 text-muted">{row.accuracy}</td>
                    <td className="px-5 py-4 text-muted">{row.paraphrase}</td>
                    <td className="px-5 py-4 text-muted">{row.code}</td>
                    <td className="px-5 py-4 font-medium text-danger bg-red-500/5">{row.risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* SECTION 3: THE TECHNICAL TRUTH ABOUT BYPASSING */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <Lock className="h-6 w-6 text-accent" /> 3. Can Students Bypass AI Detectors?
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-4 font-serif">
            <strong>The technical reality is simple: Yes, easily.</strong> Relying on AI detectors to enforce 
            academic integrity is a losing battle.
          </p>

          <div className="grid md:grid-cols-3 gap-6 my-6">
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">Paraphrasing Tools</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Tools like QuillBot or Undetectable AI rewrite AI-generated drafts. By changing synonyms and adjusting structures, 
                they raise the perplexity score, tricking the detector.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">Prompt Engineering</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Students instruct AI to write using custom parameters: &quot;write with high perplexity and sentence variety,&quot; 
                or &quot;mimic the writing style of an undergraduate.&quot; This alters the mathematical fingerprint.
              </p>
            </div>
            <div className="p-5 rounded-xl border border-line bg-bg-elev/40">
              <h4 className="font-bold text-base mb-2">Watermarking Limits</h4>
              <p className="text-xs text-muted leading-relaxed font-serif">
                Cryptographic watermarking (embedding hidden tags in AI prose) fails. Translating the text to French and back, 
                or replacing every fifth word manually, completely strips the watermark.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 flex gap-4">
            <AlertTriangle className="h-6 w-6 text-danger shrink-0 mt-0.5" />
            <div>
              <h4 className="font-bold text-danger mb-1">OpenAI&apos;s Own Classifier Shutdown</h4>
              <p className="text-xs md:text-sm text-muted leading-relaxed font-serif">
                In July 2023, OpenAI shut down its official AI Classifier tool due to its low rate of accuracy and high 
                false positive rates, stating that reliable automated detection is mathematically impossible to sustain.
              </p>
            </div>
          </div>
        </div>

        {/* SECTION 4: THE FALSE POSITIVE WARNING */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <Users className="h-6 w-6 text-accent" /> 4. The Critical Danger: False Positives
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-4 font-serif font-medium text-ink">
            Accusing an honest student of cheating based on a probabilistic AI detector score can cause severe academic and emotional damage.
          </p>
          <ul className="space-y-4 text-sm md:text-base text-muted list-disc list-inside font-serif leading-relaxed">
            <li>
              <strong>Non-Native Speakers Disproportionately Flagged:</strong> Studies have shown that AI detectors flag 
              prose written by English-as-a-Second-Language (ESL) students over 50% of the time. Non-native speakers naturally 
              use a more restricted, formal, and predictable vocabulary—exactly the baseline criteria detectors flag as AI.
            </li>
            <li>
              <strong>Neurodivergent Writers Mapped:</strong> Students on the autism spectrum or with ADHD often write with 
              highly structured, objective, and repetitive syntaxes, which trigger false AI detection ratings.
            </li>
            <li>
              <strong>The Citation Effect:</strong> Academic templates, formulas, and exact bibliographies are highly 
              standardized, causing detectors to misclassify these sections as machine-generated.
            </li>
          </ul>
        </div>

        {/* SECTION 5: PEDAGOGY AND ASSESSMENT REDESIGN */}
        <div className="mx-auto max-w-[860px] px-6 mb-16 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <Settings className="h-6 w-6 text-accent" /> 5. AI-Resistant Assessment Design
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-6 font-serif">
            Rather than trying to detect AI in final essays, change the design of the assignment to evaluate 
            the student&apos;s active learning process.
          </p>

          <div className="space-y-6">
            <div className="flex gap-4 p-5 rounded-xl border border-line bg-bg-elev/30">
              <span className="text-2xl font-black text-accent/15 select-none font-mono">01</span>
              <div>
                <h4 className="font-bold text-base mb-1">Require Google Docs Edit History</h4>
                <p className="text-xs md:text-sm text-muted leading-relaxed font-serif">
                  Instruct students to compose their work in Google Docs or Word Online and share a link showing their 
                  version history. A genuine essay will show hours of steady drafting, deletions, and typos. An AI-cheated 
                  essay will show a blank document followed by a sudden copy-paste of 2,000 words.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-xl border border-line bg-bg-elev/30">
              <span className="text-2xl font-black text-accent/15 select-none font-mono">02</span>
              <div>
                <h4 className="font-bold text-base mb-1">Conduct 5-Minute Oral Defenses</h4>
                <p className="text-xs md:text-sm text-muted leading-relaxed font-serif">
                  Instead of evaluating a 10-page paper in isolation, dedicate a portion of the grade to a quick verbal Q&A. 
                  Ask the student to explain why they chose a specific argument, define a term they wrote, or explain one of 
                  their references. If they did not write it, it becomes obvious within 60 seconds.
                </p>
              </div>
            </div>

            <div className="flex gap-4 p-5 rounded-xl border border-line bg-bg-elev/30">
              <span className="text-2xl font-black text-accent/15 select-none font-mono">03</span>
              <div>
                <h4 className="font-bold text-base mb-1">Localized & Class-Specific Prompts</h4>
                <p className="text-xs md:text-sm text-muted leading-relaxed font-serif">
                  Avoid generic essay prompts like &quot;Discuss the themes of Hamlet.&quot; AI has answered this thousands of times. 
                  Instead, prompt: &quot;Relate Hamlet&quot;s hesitation to the specific guest lecture given by Dr. Smith on Tuesday.&quot; 
                  AI does not have access to your specific classroom lectures or hand-outs.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 6: SYLLABUS POLICY FRAMEWORK */}
        <div className="mx-auto max-w-[860px] px-6 mb-20 font-sans">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2 border-b border-line pb-3">
            <FileText className="h-6 w-6 text-accent" /> 6. Establishing Classroom Policies
          </h2>
          <p className="text-muted text-sm md:text-base leading-relaxed mb-6 font-serif">
            A clear syllabus prevents misunderstandings. We recommend adopting a three-tiered traffic light model for 
            every assignment, clearly labeling the bounds of acceptable AI usage.
          </p>

          <div className="space-y-4">
            {policyTiers.map((tier, idx) => (
              <div 
                key={idx} 
                className="p-5 rounded-xl border border-line bg-bg-elev/20 flex flex-col md:flex-row md:items-start gap-4"
              >
                <span 
                  className="px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-wider shrink-0 text-center md:w-32"
                  style={{ backgroundColor: tier.color }}
                >
                  {tier.tier}
                </span>
                <div>
                  <h4 className="font-bold text-base mb-1">{tier.name}</h4>
                  <p className="text-xs md:text-sm text-muted leading-relaxed font-serif mb-3">
                    {tier.desc}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {tier.useCases.map((uc, uidx) => (
                      <span key={uidx} className="text-[11px] bg-bg-sunk text-ink-2 px-2.5 py-0.5 rounded-md border border-line">
                        {uc}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
