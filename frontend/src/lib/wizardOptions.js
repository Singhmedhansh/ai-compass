/**
 * The wizard's answer vocabulary, shared by the Stack Architect itself and by
 * anything that links into it.
 *
 * This lives outside ToolFinderPage so the inline pickers on the SEO landing
 * pages offer exactly the values readWizardPrefill() will accept. A second
 * hand-maintained copy would drift, and the drift would be silent: the link
 * would simply be ignored and the visitor dropped on a cold question 1.
 */
import { BarChart, BookOpen, Bookmark, Bot, Bug, Calendar, Code, FileText, Film, FlaskConical, Globe, GraduationCap, Layout, Megaphone, MessageSquare, Mic, Palette, PenTool, Plug, Search, Zap } from 'lucide-react'

export const GOAL_OPTIONS = [
  { id: 'learning', label: 'Learn & Study', icon: GraduationCap, desc: 'Study, exam prep, and new skills' },
  { id: 'coding', label: 'Build & Code', icon: Code, desc: 'Build apps, debug, and write scripts' },
  { id: 'writing', label: 'Write faster', icon: PenTool, desc: 'Essays, copy, editing, and grammar' },
  { id: 'research', label: 'Find information', icon: BookOpen, desc: 'Papers, citations, and literature search' },
  { id: 'creating', label: 'Create media', icon: Palette, desc: 'Images, video, audio, and slides' },
  { id: 'productivity', label: 'Get organized', icon: Zap, desc: 'Tasks, notes, meetings, and automation' },
]

export const SUB_CATEGORIES = {
  learning: [
    { id: 'exam-prep', label: 'Exam prep', desc: 'Prepare for exams, generate quiz questions.', icon: GraduationCap, primary: true },
    { id: 'study-guides', label: 'Study guides', desc: 'Summarize topics and create study guides.', icon: FileText, primary: true },
    { id: 'math-science', label: 'Math & Science', desc: 'Solve equations and explain complex concepts.', icon: FlaskConical, primary: false },
    { id: 'language-learning', label: 'Language learning', desc: 'Practice speaking and translate texts.', icon: Globe, primary: false },
  ],
  coding: [
    { id: 'build-app', label: 'Build a web app', desc: 'Generate boilerplate and build app features.', icon: Code, primary: true },
    { id: 'debugging', label: 'Debugging', desc: 'Find errors and explain broken code.', icon: Bug, primary: true },
    { id: 'learning-code', label: 'Learning to code', desc: 'Explain syntax and teach coding concepts.', icon: BookOpen, primary: false },
    { id: 'api-integration', label: 'API Integration', desc: 'Connect services and write API clients.', icon: Plug, primary: false },
  ],
  writing: [
    { id: 'write-essays', label: 'Write essays', desc: 'Draft outlines, thesis statements, and paragraphs.', icon: PenTool, primary: true },
    { id: 'copywriting', label: 'Copywriting', desc: 'Generate marketing copies and social posts.', icon: Megaphone, primary: true },
    { id: 'grammar-editor', label: 'Grammar & Editing', desc: 'Check spelling and improve writing style.', icon: Search, primary: false },
    { id: 'translation', label: 'Translation', desc: 'Translate text between multiple languages.', icon: MessageSquare, primary: false },
  ],
  research: [
    { id: 'review-papers', label: 'Review papers', desc: 'Summarize academic articles and PDFs.', icon: BookOpen, primary: true },
    { id: 'literature-search', label: 'Literature search', desc: 'Find academic papers and sources.', icon: Search, primary: true },
    { id: 'data-analysis', label: 'Data analysis', desc: 'Extract info and compile data tables.', icon: BarChart, primary: false },
    { id: 'citation-maker', label: 'Citations', desc: 'Format APA, MLA, and other citations.', icon: Bookmark, primary: false },
  ],
  creating: [
    { id: 'image-generation', label: 'Image generation', desc: 'Create visuals from text descriptions.', icon: Palette, primary: true },
    { id: 'video-editing', label: 'Video generation', desc: 'Generate clips and edit videos.', icon: Film, primary: true },
    { id: 'audio-voice', label: 'Audio & Voice', desc: 'TTS, music, and voice voiceovers.', icon: Mic, primary: false },
    { id: 'presentation-slides', label: 'Slides & Decks', desc: 'Create presentation slides and layouts.', icon: Layout, primary: false },
  ],
  productivity: [
    { id: 'task-management', label: 'Task management', desc: 'Track tasks, schedules, and workflows.', icon: Calendar, primary: true },
    { id: 'note-taking', label: 'Note-taking', desc: 'Organize notes and document info.', icon: FileText, primary: true },
    { id: 'meeting-summaries', label: 'Meeting summaries', desc: 'Transcribe and summarize audio.', icon: Mic, primary: false },
    { id: 'automation-zapier', label: 'Workflow automation', desc: 'Connect apps and automate tasks.', icon: Bot, primary: false },
  ],
}

export const BUDGET_OPTIONS = [
  { id: 'free', label: 'Free only' },
  { id: 'freemium', label: 'Freemium' },
  { id: 'any', label: 'Any budget' },
]
