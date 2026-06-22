import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ArrowUpRight, 
  Calculator, 
  MessageSquare, 
  Sparkles, 
  HelpCircle, 
  RefreshCw, 
  Layers, 
  CheckSquare, 
  Square, 
  Zap, 
  Info, 
  Bot, 
  Cpu, 
  Code, 
  Search, 
  ExternalLink 
} from "lucide-react";
import { SEO } from "../components/ui";
import { useCurrency } from "../context/CurrencyContext";

const MotionDiv = motion.div;

const providers = ["All", "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"];

const providerColorMap = {
  OpenAI: {
    badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    bar: "bg-gradient-to-r from-emerald-500 to-teal-500",
  },
  Anthropic: {
    badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    bar: "bg-gradient-to-r from-orange-500 to-red-500",
  },
  Google: {
    badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    bar: "bg-gradient-to-r from-blue-500 to-indigo-600",
  },
  Meta: {
    badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
    bar: "bg-gradient-to-r from-purple-500 to-indigo-500",
  },
  DeepSeek: {
    badge: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
    bar: "bg-gradient-to-r from-cyan-500 to-teal-500",
  },
  Mistral: {
    badge: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
    bar: "bg-gradient-to-r from-rose-500 to-orange-500",
  },
  default: {
    badge: "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20",
    bar: "bg-gradient-to-r from-gray-500 to-slate-500",
  }
};

const latencyBadges = {
  Instant: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  Fast: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  Moderate: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  Thinking: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

const reliabilityBadges = {
  Enterprise: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
  High: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20",
  Standard: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
};

const modelsData = [
  {
    name: "GPT-4o",
    provider: "OpenAI",
    slug: "gpt-4o",
    inputCost: 2.50,
    outputCost: 10.00,
    contextWindow: "128,000",
    maxOutput: "16,384",
    latency: "Fast",
    reliability: "Enterprise",
    strengths: "Flagship high-speed model, superb multimodal, logic, reasoning and translation.",
  },
  {
    name: "GPT-4.5",
    provider: "OpenAI",
    slug: "gpt-4-5",
    inputCost: 75.00,
    outputCost: 150.00,
    contextWindow: "128,000",
    maxOutput: "4,096",
    latency: "Moderate",
    reliability: "High",
    strengths: "Ultra-premium frontier intelligence, deep world knowledge, agentic task mastery.",
  },
  {
    name: "o1",
    provider: "OpenAI",
    slug: "o1",
    inputCost: 15.00,
    outputCost: 60.00,
    contextWindow: "200,000",
    maxOutput: "100,000",
    latency: "Thinking",
    reliability: "Enterprise",
    strengths: "State-of-the-art complex scientific reasoning, mathematics, coding, and logical planning.",
  },
  {
    name: "o3-mini",
    provider: "OpenAI",
    slug: "o3-mini",
    inputCost: 1.10,
    outputCost: 4.40,
    contextWindow: "200,000",
    maxOutput: "100,000",
    latency: "Fast",
    reliability: "Enterprise",
    strengths: "High-reasoning speed specialist. Exceptional math, science, and coding at low cost.",
  },
  {
    name: "Claude 3.7 Sonnet",
    provider: "Anthropic",
    slug: "claude-3-7-sonnet",
    inputCost: 3.00,
    outputCost: 15.00,
    contextWindow: "200,000",
    maxOutput: "8,192",
    latency: "Fast",
    reliability: "Enterprise",
    strengths: "State-of-the-art programming, hybrid reasoning, and excellent visual/image understanding.",
  },
  {
    name: "Claude 4.7 Opus",
    provider: "Anthropic",
    slug: "claude-4-7-opus",
    inputCost: 15.00,
    outputCost: 75.00,
    contextWindow: "200,000",
    maxOutput: "8,192",
    latency: "Moderate",
    reliability: "Enterprise",
    strengths: "Ultra-advanced analysis, research, coding, and executive business logic orchestration.",
  },
  {
    name: "Claude Fable",
    provider: "Anthropic",
    slug: "claude-fable",
    inputCost: 0.25,
    outputCost: 1.25,
    contextWindow: "200,000",
    maxOutput: "4,096",
    latency: "Instant",
    reliability: "High",
    strengths: "Next-gen ultra-fast semantic routing, simple classification, and sub-second agent queries.",
  },
  {
    name: "Gemini 2.0 Flash",
    provider: "Google",
    slug: "gemini-2-0-flash",
    inputCost: 0.075,
    outputCost: 0.30,
    contextWindow: "1,048,576",
    maxOutput: "8,192",
    latency: "Instant",
    reliability: "Enterprise",
    strengths: "Blazing fast, massive context, native multimodal video/audio support.",
  },
  {
    name: "Gemini 2.0 Pro",
    provider: "Google",
    slug: "gemini-2-0-pro",
    inputCost: 1.25,
    outputCost: 5.00,
    contextWindow: "2,097,152",
    maxOutput: "8,192",
    latency: "Moderate",
    reliability: "Enterprise",
    strengths: "Industry-leading 2M token context, high reasoning depth, optimal for massive document RAG.",
  },
  {
    name: "DeepSeek-V3",
    provider: "DeepSeek",
    slug: "deepseek-v3",
    inputCost: 0.14,
    outputCost: 0.28,
    contextWindow: "64,000",
    maxOutput: "8,192",
    latency: "Fast",
    reliability: "Standard",
    strengths: "Unbelievable price-to-performance, excellent coding and general benchmarks.",
  },
  {
    name: "DeepSeek-R1",
    provider: "DeepSeek",
    slug: "deepseek-r1",
    inputCost: 0.55,
    outputCost: 2.19,
    contextWindow: "128,000",
    maxOutput: "8,192",
    latency: "Thinking",
    reliability: "High",
    strengths: "Open-source reasoning benchmark leader, matches OpenAI's o1 in math and coding.",
  },
  {
    name: "Llama 3.3 70B",
    provider: "Meta",
    slug: "llama-3-3-70b",
    inputCost: 0.35,
    outputCost: 0.40,
    contextWindow: "128,000",
    maxOutput: "4,096",
    latency: "Fast",
    reliability: "Standard",
    strengths: "Top open-weights benchmark performer, excellent customization and self-hosting.",
  },
  {
    name: "Mistral Large 3",
    provider: "Mistral",
    slug: "mistral-large-3",
    inputCost: 2.00,
    outputCost: 6.00,
    contextWindow: "128,000",
    maxOutput: "8,192",
    latency: "Moderate",
    reliability: "High",
    strengths: "Flagship European model, strong multilingual capabilities and agent function calling.",
  },
];

const presets = [
  { label: "Simple Chatbot", icon: "MessageSquare", prompt: 1000, response: 300, requests: 5000 },
  { label: "Document RAG", icon: "Layers", prompt: 45000, response: 1500, requests: 500 },
  { label: "Code Assistant", icon: "Code", prompt: 8000, response: 1000, requests: 2000 },
  { label: "AI Agent", icon: "Bot", prompt: 5000, response: 2500, requests: 20000 },
];

const parseInlineMarkdown = (text) => {
  if (!text) return "";
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <span key={i} className="text-ink font-normal">{part.slice(2, -2)}</span>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="px-1.5 py-0.5 rounded bg-bg-elev border border-line text-ink font-mono text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
};

const renderMarkdown = (text) => {
  if (!text) return null;
  const blocks = text.split(/\n\n+/);
  return blocks.map((block, index) => {
    const trimmed = block.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('###')) {
      const headerText = trimmed.replace(/^###\s+/, '');
      return (
        <h4 key={index} className="text-sm font-semibold text-ink mt-5 mb-2 first:mt-0">
          {parseInlineMarkdown(headerText)}
        </h4>
      );
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const items = trimmed.split(/\n[-*]\s+/).map(item => item.replace(/^[-*]\s+/, ''));
      return (
        <ul key={index} className="list-disc list-inside space-y-1.5 mb-3 text-ink pl-2">
          {items.map((item, i) => (
            <li key={i}>{parseInlineMarkdown(item)}</li>
          ))}
        </ul>
      );
    }

    return (
      <p key={index} className="mb-3 text-ink last:mb-0">
        {parseInlineMarkdown(trimmed)}
      </p>
    );
  });
};

export default function ModelComparisonPage() {
  const { selectedCurrency, exchangeRates, currentSymbol } = useCurrency();
  const rate = exchangeRates[selectedCurrency] || 1.0;

  const [selectedProvider, setSelectedProvider] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModels, setSelectedModels] = useState([]);

  // Cost calculator states
  const [promptTokens, setPromptTokens] = useState(10000);
  const [responseTokens, setResponseTokens] = useState(2000);
  const [requestsCount, setRequestsCount] = useState(1000);

  // AI Advisor states
  const [requirements, setRequirements] = useState("");
  const [advisorResponse, setAdvisorResponse] = useState("");
  const [isAdvisorLoading, setIsAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Cost Calculation
  const calculateCost = (inputCostPerM, outputCostPerM) => {
    const promptCost = (promptTokens / 1000000) * inputCostPerM;
    const responseCost = (responseTokens / 1000000) * outputCostPerM;
    const singleRunCost = promptCost + responseCost;
    return (singleRunCost * requestsCount).toFixed(4);
  };

  // Preset Handler
  const handleApplyPreset = (preset) => {
    setPromptTokens(preset.prompt);
    setResponseTokens(preset.response);
    setRequestsCount(preset.requests);
  };

  // Input vs Output Token split ratio
  const totalTokens = promptTokens + responseTokens;
  const inputRatio = promptTokens / (totalTokens || 1);
  const outputRatio = responseTokens / (totalTokens || 1);

  // Filter models
  const filteredModels = modelsData.filter((model) => {
    const matchesProvider = selectedProvider === "All" || model.provider === selectedProvider;
    const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          model.provider.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  // Sort models for calculator results (cheapest first)
  const sortedCalculatorResults = [...modelsData]
    .map((m) => ({
      ...m,
      totalCost: parseFloat(calculateCost(m.inputCost, m.outputCost)),
    }))
    .sort((a, b) => a.totalCost - b.totalCost);

  // Toggle Model Comparison Checkbox
  const toggleModelSelection = (slug) => {
    if (selectedModels.includes(slug)) {
      setSelectedModels(selectedModels.filter((s) => s !== slug));
    } else {
      setSelectedModels([...selectedModels, slug]);
    }
  };

  // Call AI Advisor
  const getAdvisorRecommendation = async () => {
    if (!requirements.trim()) {
      setAdvisorError("Please describe your project requirements first.");
      return;
    }

    setIsAdvisorLoading(true);
    setAdvisorError("");
    setAdvisorResponse("");

    try {
      const resp = await fetch("/api/v1/model-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirements,
          promptTokens,
          responseTokens,
          requestsCount,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `Advisor API returned Status ${resp.status}`);
      }

      const data = await resp.json();
      const text = data.recommendation;
      if (!text) throw new Error("Empty response from advisor.");
      setAdvisorResponse(text);
    } catch (err) {
      console.error(err);
      setAdvisorError(err.message || "Failed to contact advisor. Please try again.");
    } finally {
      setIsAdvisorLoading(false);
    }
  };

  const renderPresetIcon = (iconName) => {
    switch (iconName) {
      case "MessageSquare": return <MessageSquare className="h-4 w-4 text-accent" />;
      case "Layers": return <Layers className="h-4 w-4 text-accent" />;
      case "Code": return <Code className="h-4 w-4 text-accent" />;
      case "Bot": return <Bot className="h-4 w-4 text-accent" />;
      default: return <Zap className="h-4 w-4 text-accent" />;
    }
  };

  return (
    <>
      <SEO
        title="LLM API Cost Calculator & Pricing Comparison 2026"
        description="Calculate and estimate your LLM API billing costs. Compare token pricing, context windows, and latency across GPT-4o, Claude 3.7, Gemini 2.0, DeepSeek R1, and Llama 3.3."
        path="/model-comparison"
      />

      <div className="font-sans min-h-screen bg-bg text-ink relative overflow-hidden pb-16">
        {/* Glow Blobs */}
        <div className="absolute top-[-100px] left-[50%] translate-x-[-50%] w-[600px] h-[350px] bg-gradient-to-br from-accent/10 to-brand-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute top-[600px] right-[-100px] w-[300px] h-[300px] bg-accent/5 rounded-full blur-[80px] pointer-events-none" />

        {/* Hero */}
        <div className="mx-auto max-w-5xl px-4 pt-16 pb-6 text-center relative z-10">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-accent-ink mb-6">
            <Calculator className="h-3.5 w-3.5" />
            LLM API Cost Calculator · 2026 Updates
          </div>
          <h1 className="text-[clamp(2.2rem,5vw,3.5rem)] font-extrabold leading-[1.15] tracking-tight text-ink mb-5 bg-gradient-to-r from-ink via-accent to-brand-600 bg-clip-text">
            LLM API Cost Calculator
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[700px] mx-auto mb-8 font-normal">
            Calculate your production LLM API billing. Simulate prompt sizes, completion lengths, and traffic across OpenAI, Anthropic, Google, DeepSeek, and Meta.
          </p>
        </div>

        {/* Presets Controls panel */}
        <div className="mx-auto max-w-5xl px-4 mb-8 relative z-10">
          <div className="rounded-2xl border border-line bg-bg-elev/80 backdrop-blur-md p-5 flex flex-wrap items-center gap-4 justify-between shadow-sm">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-accent-soft text-accent">
                <Zap className="h-4.5 w-4.5" />
              </div>
              <div>
                <span className="text-xs font-bold text-muted uppercase tracking-wider block">Usage Presets</span>
                <span className="text-[11px] text-muted-2 block">Quick configurations for typical architectures</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleApplyPreset(preset)}
                  className="inline-flex items-center gap-2 rounded-xl border border-line bg-bg px-4 py-2 text-xs font-semibold text-ink-2 hover:border-accent/30 hover:bg-bg-sunk hover:shadow-sm transition-all duration-200"
                >
                  {renderPresetIcon(preset.icon)}
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cost Calculator Grid */}
        <div className="mx-auto max-w-5xl px-4 mb-12 relative z-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_430px]">
            
            {/* Input Controls Card */}
            <div className="rounded-3xl border border-line bg-bg-elev/95 p-6 sm:p-8 shadow-md hover:shadow-lg transition-shadow duration-300">
              <div className="flex items-center gap-3 mb-8 border-b border-line pb-4">
                <div className="p-2 rounded-xl bg-accent/10 text-accent">
                  <Calculator className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-ink">API Cost Estimator</h2>
                  <p className="text-xs text-muted-2">Input your projected prompt sizes and traffic volumes</p>
                </div>
              </div>

              <div className="space-y-8 mb-8">
                {/* Prompt Tokens */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-ink-2">Prompt Input Tokens</span>
                    <span className="text-accent font-extrabold text-base bg-accent-soft px-2 py-0.5 rounded-lg border border-accent/10">
                      {promptTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setPromptTokens(prev => Math.max(500, prev - 5000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      -5k
                    </button>
                    <input
                      type="range"
                      min="500"
                      max="150000"
                      step="500"
                      value={promptTokens}
                      onChange={(e) => setPromptTokens(Number(e.target.value))}
                      className="flex-grow h-2 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent border border-line"
                    />
                    <button 
                      onClick={() => setPromptTokens(prev => Math.min(150000, prev + 5000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      +5k
                    </button>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-2">
                    <span>500</span>
                    <span>150,000 max tokens</span>
                  </div>
                </div>

                {/* Response Tokens */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-ink-2">Response Output Tokens</span>
                    <span className="text-accent font-extrabold text-base bg-accent-soft px-2 py-0.5 rounded-lg border border-accent/10">
                      {responseTokens.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setResponseTokens(prev => Math.max(100, prev - 1000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      -1k
                    </button>
                    <input
                      type="range"
                      min="100"
                      max="16384"
                      step="100"
                      value={responseTokens}
                      onChange={(e) => setResponseTokens(Number(e.target.value))}
                      className="flex-grow h-2 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent border border-line"
                    />
                    <button 
                      onClick={() => setResponseTokens(prev => Math.min(16384, prev + 1000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      +1k
                    </button>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-2">
                    <span>100</span>
                    <span>16,384 max tokens</span>
                  </div>
                </div>

                {/* Requests */}
                <div className="space-y-2">
                  <div className="flex justify-between items-end">
                    <span className="text-sm font-bold text-ink-2">Number of Requests</span>
                    <span className="text-accent font-extrabold text-base bg-accent-soft px-2 py-0.5 rounded-lg border border-accent/10">
                      {requestsCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={() => setRequestsCount(prev => Math.max(100, prev - 5000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      -5k
                    </button>
                    <input
                      type="range"
                      min="100"
                      max="100000"
                      step="500"
                      value={requestsCount}
                      onChange={(e) => setRequestsCount(Number(e.target.value))}
                      className="flex-grow h-2 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent border border-line"
                    />
                    <button 
                      onClick={() => setRequestsCount(prev => Math.min(100000, prev + 5000))}
                      className="text-xs font-bold border border-line px-2 py-1 rounded bg-bg hover:bg-bg-sunk text-ink-2"
                    >
                      +5k
                    </button>
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-2">
                    <span>100</span>
                    <span>100,000 runs</span>
                  </div>
                </div>
              </div>

              {/* Ratio Bar */}
              <div className="border-t border-line pt-5">
                <div className="flex justify-between text-xs font-bold text-muted-2 uppercase tracking-wider mb-3">
                  <span>Prompt vs Response Ratio</span>
                  <span>{promptTokens.toLocaleString()} vs {responseTokens.toLocaleString()} tokens</span>
                </div>
                
                {/* Thick Progress Bar */}
                <div className="w-full bg-bg-sunk rounded-full h-6 overflow-hidden flex border border-line p-1 shadow-inner relative">
                  <div 
                    style={{ width: `${inputRatio * 100}%` }} 
                    className="bg-accent rounded-full h-full transition-all duration-500 ease-out" 
                  />
                  <div 
                    style={{ width: `${outputRatio * 100}%` }} 
                    className="bg-ink dark:bg-slate-200 rounded-full h-full transition-all duration-500 ease-out -ml-1.5" 
                  />
                </div>
                
                {/* Legend */}
                <div className="flex justify-between items-center mt-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent inline-block animate-pulse" />
                    <span className="font-semibold text-ink-2">Input ({Math.round(inputRatio * 100)}%)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-ink dark:bg-slate-200 inline-block" />
                    <span className="font-semibold text-ink-2">Output ({Math.round(outputRatio * 100)}%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Dynamic Cost Bars Card */}
            <div className="rounded-3xl border border-line bg-bg-elev/80 backdrop-blur-md p-6 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-accent/5 rounded-full blur-[60px] pointer-events-none" />
              
              <div>
                <div className="flex items-center justify-between gap-2 border-b border-line pb-4 mb-5">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-accent" />
                    <h3 className="font-extrabold text-ink uppercase tracking-wider text-xs">Cost Comparison ({selectedCurrency})</h3>
                  </div>
                  <span className="text-[10px] bg-accent-soft text-accent border border-accent/15 px-2 py-0.5 rounded-full font-semibold">
                    Simulated Total
                  </span>
                </div>

                {/* Horizontal Cost comparison chart */}
                <div className="space-y-4 overflow-y-auto max-h-[350px] pr-1.5">
                  {(() => {
                    const visibleResults = sortedCalculatorResults.slice(0, 8);
                    const maxCost = Math.max(...visibleResults.map(x => x.totalCost), 0.0001);
                    return visibleResults.map((m, idx) => {
                      const percentage = (m.totalCost / maxCost) * 100;
                      const providerConfig = providerColorMap[m.provider] || providerColorMap.default;

                      return (
                        <div key={m.slug} className="space-y-1.5 p-2 rounded-2xl border border-line/40 bg-bg/40 hover:bg-bg transition duration-200">
                          <div className="flex justify-between items-center text-xs">
                            <div className="flex items-center gap-2 overflow-hidden">
                              {idx === 0 && (
                                <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider shrink-0">
                                  Best Value
                                </span>
                              )}
                              <span className="font-bold text-ink-2 truncate">{m.name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border shrink-0 ${providerConfig.badge}`}>
                                {m.provider}
                              </span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-extrabold text-ink block">
                                {currentSymbol}{(m.totalCost * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-muted-2 block">
                                {currentSymbol}{((m.totalCost / requestsCount) * rate).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}/run
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-bg-sunk rounded-full h-3.5 overflow-hidden relative border border-line shadow-inner">
                            <MotionDiv
                              initial={{ width: 0 }}
                              animate={{ width: `${percentage}%` }}
                              transition={{ duration: 0.5, ease: "easeOut" }}
                              className={`h-full rounded-full ${providerConfig.bar}`}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-line text-xs text-muted-2 flex justify-between items-center">
                <span>Calculated in {selectedCurrency}</span>
                <span>Rates: 1 USD = {rate.toFixed(2)} {selectedCurrency}</span>
              </div>
            </div>

          </div>
        </div>

        {/* Side-by-Side Comparison Matrix Panel */}
        <AnimatePresence>
          {selectedModels.length > 0 && (
            <div className="mx-auto max-w-5xl px-4 mb-12 relative z-10 font-sans">
              <MotionDiv
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="rounded-3xl border border-line bg-bg-elev/95 p-6 sm:p-8 shadow-xl"
              >
                <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
                  <div className="flex items-center gap-2.5">
                    <Layers className="h-6 w-6 text-accent" />
                    <div>
                      <h2 className="text-lg font-bold text-ink">Side-by-Side Comparison ({selectedModels.length})</h2>
                      <p className="text-xs text-muted-2">Detailed technical matrix comparison</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedModels([])}
                    className="text-xs bg-danger-soft text-danger border border-danger/10 rounded-lg px-3 py-1 font-semibold hover:bg-danger/10 transition"
                  >
                    Clear Matrix
                  </button>
                </div>

                <div className="grid gap-5 md:grid-flow-col overflow-x-auto pb-3 scrollbar-thin">
                  {selectedModels.map((slug) => {
                    const model = modelsData.find((m) => m.slug === slug);
                    if (!model) return null;
                    const calculatedTotal = calculateCost(model.inputCost, model.outputCost);
                    const providerConfig = providerColorMap[model.provider] || providerColorMap.default;

                    return (
                      <div key={model.slug} className="border border-line rounded-2xl p-5 bg-bg/50 backdrop-blur min-w-[270px] shadow-sm">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h3 className="font-extrabold text-base text-ink mb-1">{model.name}</h3>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${providerConfig.badge}`}>
                              {model.provider}
                            </span>
                          </div>
                        </div>
                        
                        <dl className="space-y-2 text-xs border-t border-line pt-3 mt-2">
                          <div className="flex justify-between py-0.5">
                            <dt className="text-muted">Input Price</dt>
                            <dd className="font-bold text-ink">${model.inputCost.toFixed(2)}/M</dd>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <dt className="text-muted">Output Price</dt>
                            <dd className="font-bold text-ink">${model.outputCost.toFixed(2)}/M</dd>
                          </div>
                          <div className="flex justify-between py-0.5 border-t border-line/40 pt-2">
                            <dt className="text-muted">Context Size</dt>
                            <dd className="font-semibold text-ink-2 bg-bg-sunk px-2 py-0.5 rounded border border-line">{model.contextWindow}</dd>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <dt className="text-muted">Max Output</dt>
                            <dd className="font-semibold text-ink-2 bg-bg-sunk px-2 py-0.5 rounded border border-line">{model.maxOutput}</dd>
                          </div>
                          <div className="flex justify-between py-0.5 border-t border-line/40 pt-2">
                            <dt className="text-muted">Latency</dt>
                            <dd>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${latencyBadges[model.latency]}`}>
                                {model.latency}
                              </span>
                            </dd>
                          </div>
                          <div className="flex justify-between py-0.5">
                            <dt className="text-muted">Reliability</dt>
                            <dd>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${reliabilityBadges[model.reliability]}`}>
                                {model.reliability}
                              </span>
                            </dd>
                          </div>
                          <div className="flex justify-between border-t border-line-strong pt-3 mt-3">
                            <dt className="text-muted font-bold">Total Est. Cost</dt>
                            <dd className="font-black text-sm text-accent bg-accent-soft px-2 py-1 rounded-lg border border-accent/20">
                              {currentSymbol}{(parseFloat(calculatedTotal) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    );
                  })}
                </div>
              </MotionDiv>
            </div>
          )}
        </AnimatePresence>

        {/* AI Advisor Panel */}
        <div className="mx-auto max-w-5xl px-4 mb-16 relative z-10 font-sans">
          <div className="rounded-3xl border border-line bg-bg-elev/90 backdrop-blur-md p-6 sm:p-8 shadow-md hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center gap-3 mb-6 border-b border-line pb-4">
              <div className="p-2 rounded-xl bg-accent-soft text-accent">
                <MessageSquare className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-ink">Interactive Model Advisor</h2>
                <p className="text-xs text-muted-2">Describe project priorities to receive contextual recommendations</p>
              </div>
            </div>

            {/* Requirement Form */}
            <div className="grid gap-6 md:grid-cols-[1fr_240px] items-start">
              <div>
                <label className="block text-xs font-bold text-ink-2 mb-2 uppercase tracking-wide">
                  Describe your project requirements
                </label>
                <textarea
                  placeholder="Example: I am building a student tutor for math. The system must process quick user questions with low cost and response latencies, but doesn't need giant context windows."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  className="w-full h-28 rounded-2xl border border-line p-4 text-sm bg-bg focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition duration-200 shadow-inner resize-none"
                />
              </div>
              <div className="space-y-4">
                <button
                  onClick={getAdvisorRecommendation}
                  disabled={isAdvisorLoading}
                  className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-brand-600 hover:to-brand-700 px-5 py-3.5 text-sm font-semibold text-bg transition-all hover:shadow-md hover:scale-[1.01] active:scale-[0.99] disabled:from-accent/40 disabled:to-brand-600/40 disabled:pointer-events-none"
                >
                  {isAdvisorLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Get Recommendation
                    </>
                  )}
                </button>
                <div className="text-[11px] text-muted-2 text-center flex items-center justify-center gap-1 bg-bg-sunk rounded-lg py-2 border border-line">
                  <HelpCircle className="h-3.5 w-3.5 text-accent" />
                  Processed securely via Advisor
                </div>
              </div>
            </div>

            {/* Error or Response display */}
            {advisorError && (
              <div className="mt-5 rounded-2xl border border-danger/20 bg-danger-soft px-5 py-4 text-sm text-danger font-semibold flex items-center gap-2 shadow-sm animate-pulse-1.5">
                <Info className="h-4 w-4 shrink-0" />
                {advisorError}
              </div>
            )}

            {advisorResponse && (
              <div className="mt-6 rounded-2xl border border-line bg-bg-sunk p-5 sm:p-6 relative">
                <div className="flex items-center gap-2 mb-4 border-b border-line pb-3">
                  <Bot className="h-5 w-5 text-accent" />
                  <h3 className="font-bold text-sm text-ink uppercase tracking-wider">Advisor Recommendation</h3>
                </div>
                <div className="text-sm leading-relaxed text-ink font-normal space-y-4">
                  {renderMarkdown(advisorResponse)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabular Comparison */}
        <div className="mx-auto max-w-5xl px-4 relative z-10 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-ink">Token Pricing Database</h2>
              <p className="text-xs text-muted-2">Search and compare parameters across frontier LLMs</p>
            </div>
            
            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-2" />
              <input
                type="text"
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-full border border-line pl-10 pr-4 py-2 text-sm bg-bg-elev focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none transition"
              />
            </div>
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap gap-2.5 mb-6">
            {providers.map((provider) => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                className={`rounded-xl px-4 py-1.5 text-xs font-bold border transition-all duration-200 ${
                  selectedProvider === provider
                    ? "bg-ink text-bg border-ink shadow-sm scale-[1.02]"
                    : "border-line text-muted hover:border-line-strong hover:bg-bg-elev"
                }`}
              >
                {provider}
              </button>
            ))}
          </div>

          {/* Models Table */}
          <div className="overflow-x-auto rounded-3xl border border-line bg-bg-elev/90 shadow-md">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-[10px] font-bold uppercase tracking-wider text-muted">
                  <th className="px-6 py-4">Compare</th>
                  <th className="px-6 py-4">Model Name</th>
                  <th className="px-6 py-4">Provider</th>
                  <th className="px-6 py-4">Input Price / M</th>
                  <th className="px-6 py-4">Output Price / M</th>
                  <th className="px-6 py-4">Context Size</th>
                  <th className="px-6 py-4">Max Output</th>
                  <th className="px-6 py-4">Latency</th>
                  <th className="px-6 py-4">Reliability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {filteredModels.map((m) => {
                  const providerConfig = providerColorMap[m.provider] || providerColorMap.default;
                  const isChecked = selectedModels.includes(m.slug);

                  return (
                    <tr key={m.slug} className={`transition-colors hover:bg-bg-sunk/30 ${isChecked ? "bg-accent-soft/10" : ""}`}>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleModelSelection(m.slug)}
                          className="text-accent hover:scale-105 transition duration-150"
                        >
                          {isChecked ? (
                            <CheckSquare className="h-5 w-5 text-accent" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-2" />
                          )}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 font-bold text-ink text-sm">
                        {m.name}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded-full font-semibold border ${providerConfig.badge}`}>
                          {m.provider}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-ink font-semibold text-xs">
                        {currentSymbol}{(m.inputCost * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-ink font-semibold text-xs">
                        {currentSymbol}{(m.outputCost * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs font-medium text-ink-2">
                        {m.contextWindow}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs font-medium text-ink-2">
                        {m.maxOutput}
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded font-bold border ${latencyBadges[m.latency] || latencyBadges.Moderate}`}>
                          {m.latency}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded font-bold border ${reliabilityBadges[m.reliability] || reliabilityBadges.Standard}`}>
                          {m.reliability}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {filteredModels.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-6 py-8 text-center text-muted">
                      No models match your query. Try searching for something else.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
