import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Helmet } from "react-helmet-async";
import { ArrowUpRight, Calculator, MessageSquare, Sparkles, HelpCircle, RefreshCw, Layers, CheckSquare, Square, Zap, Info } from "lucide-react";
import { SEO } from "../components/ui";
import { useCurrency } from "../context/CurrencyContext";

const MotionDiv = motion.div;

const providers = ["All", "OpenAI", "Anthropic", "Google", "Meta", "DeepSeek", "Mistral"];

const modelsData = [
  {
    name: "GPT-4o",
    provider: "OpenAI",
    slug: "gpt-4o",
    inputCost: 5.0,
    outputCost: 15.0,
    contextWindow: "128,000",
    maxOutput: "4,096",
    latency: "Fast",
    reliability: "Enterprise",
    strengths: "Universal industry standard, excellent code & logic, multimodal capabilities.",
  },
  {
    name: "GPT-4o mini",
    provider: "OpenAI",
    slug: "gpt-4o-mini",
    inputCost: 0.15,
    outputCost: 0.6,
    contextWindow: "128,000",
    maxOutput: "16,384",
    latency: "Instant",
    reliability: "Enterprise",
    strengths: "Extremely cost-effective, blazing fast speed, great for high-frequency lightweight tasks.",
  },
  {
    name: "o1-preview",
    provider: "OpenAI",
    slug: "o1-preview",
    inputCost: 15.0,
    outputCost: 60.0,
    contextWindow: "128,000",
    maxOutput: "32,768",
    latency: "Thinking",
    reliability: "High",
    strengths: "State-of-the-art complex reasoning, mathematical proofs, and advanced code design.",
  },
  {
    name: "o1-mini",
    provider: "OpenAI",
    slug: "o1-mini",
    inputCost: 3.0,
    outputCost: 12.0,
    contextWindow: "128,000",
    maxOutput: "65,536",
    latency: "Fast",
    reliability: "High",
    strengths: "Math and coding specialist. High reasoning depth at a fraction of o1-preview's cost.",
  },
  {
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    slug: "claude-3-5-sonnet",
    inputCost: 3.0,
    outputCost: 15.0,
    contextWindow: "200,000",
    maxOutput: "8,192",
    latency: "Fast",
    reliability: "Enterprise",
    strengths: "Unmatched writing nuance, top-tier coding, excellent instruction following.",
  },
  {
    name: "Claude 3 Opus",
    provider: "Anthropic",
    slug: "claude-3-opus",
    inputCost: 15.0,
    outputCost: 75.0,
    contextWindow: "200,000",
    maxOutput: "4,096",
    latency: "Moderate",
    reliability: "Enterprise",
    strengths: "Deep analysis, executive summaries, complex business logic translation.",
  },
  {
    name: "Claude 3 Haiku",
    provider: "Anthropic",
    slug: "claude-3-haiku",
    inputCost: 0.25,
    outputCost: 1.25,
    contextWindow: "200,000",
    maxOutput: "4,096",
    latency: "Instant",
    reliability: "High",
    strengths: "Fast response latency, perfect for simple classification and parsing.",
  },
  {
    name: "Gemini 1.5 Pro",
    provider: "Google",
    slug: "gemini-1-5-pro",
    inputCost: 1.25,
    outputCost: 5.0,
    contextWindow: "2,000,000",
    maxOutput: "8,192",
    latency: "Moderate",
    reliability: "Enterprise",
    strengths: "Industry-leading 2M token context, native audio/video understanding, Google integration.",
  },
  {
    name: "Gemini 1.5 Flash",
    provider: "Google",
    slug: "gemini-1-5-flash",
    inputCost: 0.075,
    outputCost: 0.3,
    contextWindow: "1,000,000",
    maxOutput: "8,192",
    latency: "Instant",
    reliability: "Enterprise",
    strengths: "Incredibly fast, vast context window for the price, highly affordable.",
  },
  {
    name: "Gemini 2.0 Flash",
    provider: "Google",
    slug: "gemini-2-0-flash",
    inputCost: 0.075,
    outputCost: 0.3,
    contextWindow: "1,000,000",
    maxOutput: "8,192",
    latency: "Instant",
    reliability: "High",
    strengths: "Next-gen real-time audio and visual streaming capabilities, faster speeds.",
  },
  {
    name: "Llama 3.1 405B",
    provider: "Meta",
    slug: "llama-3-1-405b",
    inputCost: 2.66,
    outputCost: 2.66,
    contextWindow: "128,000",
    maxOutput: "4,096",
    latency: "Moderate",
    reliability: "Standard",
    strengths: "Open-source flagship model, matches GPT-4 level on benchmarks, privacy safe.",
  },
  {
    name: "Llama 3.1 70B",
    provider: "Meta",
    slug: "llama-3-1-70b",
    inputCost: 0.6,
    outputCost: 0.6,
    contextWindow: "128,000",
    maxOutput: "4,096",
    latency: "Fast",
    reliability: "Standard",
    strengths: "Best balance of reasoning vs self-hosting costs. Highly customizable.",
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
    strengths: "Top-tier coding, reasoning performance at a tiny fraction of US frontier models.",
  },
  {
    name: "Mistral Large 2",
    provider: "Mistral",
    slug: "mistral-large-2",
    inputCost: 2.0,
    outputCost: 6.0,
    contextWindow: "128,000",
    maxOutput: "8,192",
    latency: "Moderate",
    reliability: "High",
    strengths: "Strong multilingual support, complex function calling and agentic actions.",
  },
];

const presets = [
  { label: "Simple Chatbot", prompt: 1000, response: 300, requests: 5000 },
  { label: "Document RAG", prompt: 45000, response: 1500, requests: 500 },
  { label: "Code Assistant", prompt: 8000, response: 1000, requests: 2000 },
  { label: "AI Agent", prompt: 5000, response: 2500, requests: 20000 },
];

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

  return (
    <>
      <SEO
        title="AI API Model Pricing & Context Comparison 2026"
        description="Compare tokens pricing, context windows, and strengths across GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, and Llama 3.1. Calculate API costs instantly."
        path="/model-comparison"
      />

      <div className="font-serif">
        {/* Hero */}
        <div className="mx-auto max-w-5xl px-4 pt-16 pb-8 text-center">
          <div className="inline-block rounded-full border border-accent bg-accent-soft px-4 py-1.5 text-[13px] uppercase tracking-widest text-accent-ink mb-6 font-sans">
            Comparative Model Analysis · Real-time Estimates
          </div>
          <h1 className="text-[clamp(2rem,5vw,3.2rem)] font-bold leading-[1.15] tracking-tight text-ink mb-5">
            Compare API Models & Costs
          </h1>
          <p className="text-[1.15rem] leading-[1.75] text-muted max-w-[680px] mx-auto mb-8 font-sans">
            Decide between proprietary and open-source models. Filter by provider, estimate custom prompt costs, and consult our AI Advisor to select the best fit.
          </p>
        </div>

        {/* Comparison Presets block */}
        <div className="mx-auto max-w-5xl px-4 mb-8 font-sans">
          <div className="rounded-2xl border border-line bg-bg-elev p-5 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4.5 w-4.5 text-accent" />
              <span className="text-xs font-semibold text-muted-2 uppercase tracking-wider">Quick Presets:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {presets.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => handleApplyPreset(preset)}
                  className="rounded-lg border border-line bg-bg px-3 py-1.5 text-xs font-medium text-ink-2 hover:border-line-strong hover:bg-bg-sunk transition"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cost Calculator Section */}
        <div className="mx-auto max-w-5xl px-4 mb-12 font-sans">
          <div className="grid gap-8 lg:grid-cols-[1fr_420px]">
            {/* Calculator Controls */}
            <div className="rounded-3xl border border-line bg-bg-elev p-6 sm:p-8">
              <div className="flex items-center gap-3 mb-6">
                <Calculator className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-bold text-ink">API Cost Estimator</h2>
              </div>

              <div className="space-y-6 mb-6">
                {/* Prompt Tokens */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-ink-2">Prompt Input Tokens</span>
                    <span className="text-accent font-bold">{(promptTokens).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="500"
                    max="150000"
                    step="500"
                    value={promptTokens}
                    onChange={(e) => setPromptTokens(Number(e.target.value))}
                    className="w-full h-1.5 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-xs text-muted-2 mt-1">
                    <span>500</span>
                    <span>150,000 tokens</span>
                  </div>
                </div>

                {/* Response Tokens */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-ink-2">Response Output Tokens</span>
                    <span className="text-accent font-bold">{(responseTokens).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="16384"
                    step="100"
                    value={responseTokens}
                    onChange={(e) => setResponseTokens(Number(e.target.value))}
                    className="w-full h-1.5 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-xs text-muted-2 mt-1">
                    <span>100</span>
                    <span>16,384 tokens</span>
                  </div>
                </div>

                {/* Requests */}
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-semibold text-ink-2">Number of Requests</span>
                    <span className="text-accent font-bold">{(requestsCount).toLocaleString()}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="100000"
                    step="500"
                    value={requestsCount}
                    onChange={(e) => setRequestsCount(Number(e.target.value))}
                    className="w-full h-1.5 bg-bg-sunk rounded-lg appearance-none cursor-pointer accent-accent"
                  />
                  <div className="flex justify-between text-xs text-muted-2 mt-1">
                    <span>100</span>
                    <span>100,000 runs</span>
                  </div>
                </div>
              </div>

              {/* Cost Split Ratio Bar */}
              <div className="border-t border-line pt-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-xs font-semibold text-muted-2 uppercase tracking-wider">Prompt vs Response Ratio</span>
                </div>
                <div className="w-full bg-bg-sunk rounded-full h-4 overflow-hidden flex border border-line text-[9px] font-bold text-bg text-center">
                  <div style={{ width: `${inputRatio * 100}%` }} className="bg-accent flex items-center justify-center min-w-[30px] transition-all">
                    Input ({Math.round(inputRatio * 100)}%)
                  </div>
                  <div style={{ width: `${outputRatio * 100}%` }} className="bg-ink flex items-center justify-center min-w-[30px] transition-all">
                    Output ({Math.round(outputRatio * 100)}%)
                  </div>
                </div>
              </div>
            </div>

            {/* Visual Dynamic cost bars */}
            <div className="rounded-3xl border border-accent bg-accent-soft/30 p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Sparkles className="h-5 w-5 text-accent" />
                  <h3 className="font-bold text-ink uppercase tracking-wider text-xs">Cost Comparison ({selectedCurrency})</h3>
                </div>

                {/* Horizontal Cost comparison chart */}
                <div className="space-y-3 overflow-y-auto max-h-[340px] pr-2">
                  {sortedCalculatorResults.slice(0, 8).map((m, idx) => {
                    const maxCost = Math.max(...sortedCalculatorResults.map(x => x.totalCost), 0.0001);
                    const percentage = (m.totalCost / maxCost) * 100;
                    return (
                      <div key={m.slug} className="space-y-1">
                        <div className="flex justify-between text-xs font-semibold text-ink-2">
                          <span>{m.name} ({m.provider})</span>
                          <span className="font-bold">{currentSymbol}{(m.totalCost * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                        </div>
                        <div className="w-full bg-bg-sunk rounded-full h-2 overflow-hidden relative border border-line">
                          <MotionDiv
                            initial={{ width: 0 }}
                            animate={{ width: `${percentage}%` }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className={`h-full rounded-full ${idx === 0 ? "bg-accent" : "bg-muted"}`}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-line text-xs text-muted-2 flex justify-between items-center">
                <span>Calculated in {selectedCurrency}</span>
                <span>Rates: 1 USD = {rate.toFixed(2)} {selectedCurrency}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Comparison Matrix Panel */}
        <AnimatePresence>
          {selectedModels.length > 0 && (
            <div className="mx-auto max-w-5xl px-4 mb-12 font-sans">
              <MotionDiv
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 15 }}
                className="rounded-3xl border border-line bg-bg-elev p-6 sm:p-8 shadow-md"
              >
                <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
                  <div className="flex items-center gap-2">
                    <Layers className="h-6 w-6 text-accent" />
                    <h2 className="text-xl font-bold text-ink">Side-by-Side Comparison ({selectedModels.length})</h2>
                  </div>
                  <button
                    onClick={() => setSelectedModels([])}
                    className="text-xs text-danger font-semibold hover:underline"
                  >
                    Clear Matrix
                  </button>
                </div>

                <div className="grid gap-4 md:grid-flow-col overflow-x-auto pb-2">
                  {selectedModels.map((slug) => {
                    const model = modelsData.find((m) => m.slug === slug);
                    if (!model) return null;
                    const calculatedTotal = calculateCost(model.inputCost, model.outputCost);
                    return (
                      <div key={model.slug} className="border border-line rounded-2xl p-5 bg-bg min-w-[240px]">
                        <h3 className="font-bold text-lg text-ink mb-1">{model.name}</h3>
                        <p className="text-xs text-muted-2 mb-4 font-semibold uppercase tracking-wider">{model.provider}</p>
                        
                        <dl className="space-y-2 text-sm border-t border-line pt-3">
                          <div className="flex justify-between">
                            <dt className="text-muted">Input Price</dt>
                            <dd className="font-semibold text-ink">${model.inputCost}/M</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Output Price</dt>
                            <dd className="font-semibold text-ink">${model.outputCost}/M</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Context Size</dt>
                            <dd className="font-semibold text-ink-2">{model.contextWindow}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Max Output</dt>
                            <dd className="font-semibold text-ink-2">{model.maxOutput}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Latency</dt>
                            <dd className="font-semibold text-accent">{model.latency}</dd>
                          </div>
                          <div className="flex justify-between">
                            <dt className="text-muted">Reliability</dt>
                            <dd className="font-semibold text-ink-2">{model.reliability}</dd>
                          </div>
                          <div className="flex justify-between border-t border-line pt-2 mt-2">
                            <dt className="text-muted font-semibold">Total Est. Cost</dt>
                            <dd className="font-bold text-accent">{currentSymbol}{(parseFloat(calculatedTotal) * rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</dd>
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
        <div className="mx-auto max-w-5xl px-4 mb-16 font-sans">
          <div className="rounded-3xl border border-line bg-bg-elev p-6 sm:p-8 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-6 w-6 text-accent" />
                <h2 className="text-xl font-bold text-ink">Interactive Model Advisor</h2>
              </div>
            </div>

            {/* Requirement Form */}
            <div className="grid gap-6 md:grid-cols-[1fr_240px] items-start">
              <div>
                <label className="block text-sm font-semibold text-ink-2 mb-2">
                  Describe your project requirements
                </label>
                <textarea
                  placeholder="Example: I am building a student tutor for math. The system must process quick user questions with low cost and response latencies, but doesn't need giant context windows."
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  className="w-full h-24 rounded-2xl border border-line p-4 text-sm bg-bg focus:border-accent focus:outline-none"
                />
              </div>
              <div className="space-y-3">
                <button
                  onClick={getAdvisorRecommendation}
                  disabled={isAdvisorLoading}
                  className="w-full inline-flex justify-center items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-bg transition hover:bg-accent/95 disabled:bg-accent/40"
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
                <div className="text-[11px] text-muted-2 text-center flex items-center justify-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  Processed securely via AI Compass Advisor
                </div>
              </div>
            </div>

            {/* Error or Response display */}
            {advisorError && (
              <div className="mt-4 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger font-medium">
                {advisorError}
              </div>
            )}

            {advisorResponse && (
              <div className="mt-6 rounded-2xl border border-accent bg-accent-soft/20 p-5 sm:p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-ink">Advisor Recommendation</h3>
                </div>
                <div className="text-sm leading-relaxed text-ink-2 whitespace-pre-line font-sans font-medium">
                  {advisorResponse}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tabular Comparison */}
        <div className="mx-auto max-w-5xl px-4 mb-20 font-sans">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">Token pricing database</h2>
            {/* Search Input */}
            <input
              type="text"
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="rounded-full border border-line px-4 py-1.5 text-sm bg-bg-elev focus:border-accent focus:outline-none"
            />
          </div>

          {/* Provider chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            {providers.map((provider) => (
              <button
                key={provider}
                onClick={() => setSelectedProvider(provider)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold border ${
                  selectedProvider === provider
                    ? "bg-ink text-bg border-ink"
                    : "border-line text-muted hover:border-line-strong"
                }`}
              >
                {provider}
              </button>
            ))}
          </div>

          {/* Models Table */}
          <div className="overflow-x-auto rounded-2xl border border-line bg-bg-elev shadow-sm">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-bg-sunk text-xs font-semibold uppercase tracking-wider text-ink-2">
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
                {filteredModels.map((m) => (
                  <tr key={m.slug} className="transition-colors hover:bg-bg-sunk/40">
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleModelSelection(m.slug)}
                        className="text-accent hover:scale-105 transition"
                      >
                        {selectedModels.includes(m.slug) ? (
                          <CheckSquare className="h-5 w-5" />
                        ) : (
                          <Square className="h-5 w-5 text-muted-2" />
                        )}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 font-semibold text-ink">
                      {m.name}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted-2">
                      {m.provider}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-ink font-semibold">
                      ${m.inputCost.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-ink font-semibold">
                      ${m.outputCost.toFixed(2)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted">
                      {m.contextWindow}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted">
                      {m.maxOutput}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted font-medium text-accent">
                      {m.latency}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-muted">
                      {m.reliability}
                    </td>
                  </tr>
                ))}
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
