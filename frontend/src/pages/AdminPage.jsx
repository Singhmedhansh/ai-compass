import { Eye, Pencil } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import PageTransition from '../components/PageTransition'
import SearchInput from '../components/ui/SearchInput'

const ADMIN_EMAILS = ['singhmedhansh07@gmail.com']
const TOOLS_PAGE_SIZE = 15
const COLLECTIONS_COUNT = 7
const TABS = ['Overview', 'Tools', 'Users', 'ML Model']

const CATEGORY_STYLES = {
  Coding: 'bg-blue-500',
  'Writing & Docs': 'bg-purple-500',
  Research: 'bg-emerald-500',
  Productivity: 'bg-amber-500',
  'Image Gen': 'bg-pink-500',
  'Video Gen': 'bg-red-500',
  Design: 'bg-cyan-500',
}

const CATEGORY_ORDER = [
  'Writing & Docs',
  'Coding',
  'Research',
  'Productivity',
  'Image Gen',
  'Video Gen',
  'Design',
]

function getToolSlug(tool = {}) {
  if (tool.slug) {
    return String(tool.slug)
  }
  return String(tool.name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
}

function getToolRating(tool = {}) {
  return Number(tool.rating || tool.average_rating || tool.averageRating || 0)
}

function isFreeTool(tool = {}) {
  const pricingTier = String(tool.pricing_tier || '').toLowerCase()
  const pricing = String(tool.pricing || '').toLowerCase()
  return pricingTier === 'free' || pricing === 'free'
}

function downloadTextFile(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function buildCsvRow(values) {
  return values
    .map((value) => {
      const text = String(value ?? '')
      const escaped = text.replaceAll('"', '""')
      return `"${escaped}"`
    })
    .join(',')
}

function EditToolModal({ tool, onClose, onSave }) {
  const [name, setName] = useState(tool?.name || '')
  const [description, setDescription] = useState(tool?.description || tool?.shortDescription || '')

  if (!tool) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-xl">
        <h3 className="text-xl font-semibold text-white">Edit Tool</h3>
        <p className="mt-1 text-sm text-slate-400">Local inline edit preview for admin workflow.</p>

        <label className="mt-4 block text-sm text-slate-300">Name</label>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label className="mt-4 block text-sm text-slate-300">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave({ ...tool, name, description })}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminPage() {
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState('Overview')
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [runningAction, setRunningAction] = useState('')

  const [stats, setStats] = useState({
    total_tools: 0,
    total_users: 0,
    model_status: 'inactive',
  })

  const [tools, setTools] = useState([])
  const [users, setUsers] = useState([])

  const [toolsQuery, setToolsQuery] = useState('')
  const [toolsPage, setToolsPage] = useState(1)

  const [editingTool, setEditingTool] = useState(null)

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (!user || !ADMIN_EMAILS.includes(user.email)) {
      navigate('/')
      return
    }

    setIsAuthorized(true)
  }, [navigate])

  useEffect(() => {
    if (!isAuthorized) {
      return
    }

    let mounted = true

    async function loadAdminData() {
      try {
        const [statsResponse, toolsResponse, usersResponse] = await Promise.all([
          fetch('/api/v1/admin/stats'),
          fetch('/api/v1/tools'),
          fetch('/api/v1/admin/users'),
        ])

        const statsData = statsResponse.ok ? await statsResponse.json() : {}
        const toolsData = toolsResponse.ok ? await toolsResponse.json() : []
        const usersData = usersResponse.ok ? await usersResponse.json() : []

        if (!mounted) {
          return
        }

        setStats({
          total_tools: Number(statsData.total_tools || 0),
          total_users: Number(statsData.total_users || 0),
          model_status: String(statsData.model_status || 'inactive').toLowerCase(),
        })
        setTools(Array.isArray(toolsData) ? toolsData : [])
        setUsers(Array.isArray(usersData) ? usersData : [])
      } catch {
        if (mounted) {
          toast.error('Failed to load admin data')
        }
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    loadAdminData()

    return () => {
      mounted = false
    }
  }, [isAuthorized])

  const modelActive = stats.model_status === 'active'

  const freeToolsPercent = useMemo(() => {
    if (!tools.length) {
      return 0
    }
    const freeCount = tools.filter(isFreeTool).length
    return Math.round((freeCount / tools.length) * 100)
  }, [tools])

  const categoryBreakdown = useMemo(() => {
    const counts = CATEGORY_ORDER.map((category) => {
      const count = tools.filter((tool) => String(tool.category || '').trim() === category).length
      return { category, count }
    })
    const maxCount = Math.max(1, ...counts.map((item) => item.count))

    return counts.map((item) => ({
      ...item,
      widthPercent: Math.max(2, Math.round((item.count / maxCount) * 100)),
      barClass: CATEGORY_STYLES[item.category] || 'bg-slate-500',
    }))
  }, [tools])

  const filteredTools = useMemo(() => {
    const normalized = toolsQuery.trim().toLowerCase()
    if (!normalized) {
      return tools
    }

    return tools.filter((tool) => {
      const name = String(tool.name || '').toLowerCase()
      const category = String(tool.category || '').toLowerCase()
      return name.includes(normalized) || category.includes(normalized)
    })
  }, [tools, toolsQuery])

  const totalToolsPages = Math.max(1, Math.ceil(filteredTools.length / TOOLS_PAGE_SIZE))

  const paginatedTools = useMemo(() => {
    const safePage = Math.min(toolsPage, totalToolsPages)
    const start = (safePage - 1) * TOOLS_PAGE_SIZE
    return filteredTools.slice(start, start + TOOLS_PAGE_SIZE)
  }, [filteredTools, toolsPage, totalToolsPages])

  useEffect(() => {
    setToolsPage(1)
  }, [toolsQuery])

  useEffect(() => {
    if (toolsPage > totalToolsPages) {
      setToolsPage(totalToolsPages)
    }
  }, [toolsPage, totalToolsPages])

  const handleSaveEditedTool = (updatedTool) => {
    setTools((prev) =>
      prev.map((tool) => {
        if (getToolSlug(tool) === getToolSlug(updatedTool)) {
          return {
            ...tool,
            name: updatedTool.name,
            description: updatedTool.description,
          }
        }
        return tool
      }),
    )
    setEditingTool(null)
    toast.success('Tool updated in admin view')
  }

  const handleExportCsv = () => {
    const header = buildCsvRow(['Name', 'Category', 'Rating', 'Pricing', 'Student Friendly', 'Slug'])
    const rows = tools.map((tool) =>
      buildCsvRow([
        tool.name || '',
        tool.category || '',
        getToolRating(tool).toFixed(1),
        tool.pricing || tool.pricing_tier || '',
        String(tool.student_friendly === true),
        getToolSlug(tool),
      ]),
    )

    downloadTextFile('ai-compass-tools.csv', [header, ...rows].join('\n'), 'text/csv;charset=utf-8;')
    toast.success('CSV exported')
  }

  const handleRetrainModel = async () => {
    setRunningAction('retrain')
    try {
      const response = await fetch('/api/v1/admin/retrain', { method: 'POST' })
      const payload = await response.json()
      if (payload.success) {
        toast.success('Model retrained successfully')
      } else {
        toast.error('Model retrain failed')
      }
    } catch {
      toast.error('Failed to retrain model')
    } finally {
      setRunningAction('')
    }
  }

  const handleClearCache = async () => {
    setRunningAction('cache')
    try {
      const response = await fetch('/api/v1/admin/clear-cache', { method: 'POST' })
      const payload = await response.json()
      if (payload.success) {
        toast.success(payload.message || 'Cache cleared')
      } else {
        toast.error('Cache clear failed')
      }
    } catch {
      toast.error('Failed to clear cache')
    } finally {
      setRunningAction('')
    }
  }

  const renderOverviewTab = () => (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Tools</p>
          <p className="mt-2 text-3xl font-bold text-white">{loading ? '...' : stats.total_tools}</p>
          <p className="mt-1 text-sm text-emerald-400">+12 this week</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Total Users</p>
          <p className="mt-2 text-3xl font-bold text-white">{loading ? '...' : stats.total_users}</p>
          <p className="mt-1 text-sm text-emerald-400">↑ 2 new today</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">ML Model</p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${modelActive ? 'animate-pulse bg-emerald-400' : 'bg-rose-400'}`} />
            <p className="text-lg font-semibold text-white">{modelActive ? 'Active' : 'Inactive'}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Collections</p>
          <p className="mt-2 text-3xl font-bold text-white">{COLLECTIONS_COUNT}</p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">Free Tools %</p>
          <p className="mt-2 text-3xl font-bold text-white">{freeToolsPercent}%</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="text-lg font-semibold text-white">Category Breakdown</h2>
        <div className="mt-4 space-y-3">
          {categoryBreakdown.map((item) => (
            <div key={item.category} className="grid grid-cols-[160px_1fr_48px] items-center gap-3">
              <p className="truncate text-sm text-slate-300">{item.category}</p>
              <div className="h-6 rounded-md bg-slate-800 p-1">
                <div
                  className={`h-full rounded ${item.barClass}`}
                  style={{ width: `${item.widthPercent}%` }}
                  aria-label={`${item.category} ${item.count}`}
                />
              </div>
              <p className="text-right text-sm font-semibold text-slate-200">{item.count}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )

  const renderToolsTab = () => (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-xl font-semibold text-white">Tools</h2>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <div className="w-full md:w-80">
            <SearchInput
              value={toolsQuery}
              onChange={setToolsQuery}
              onClear={() => setToolsQuery('')}
              placeholder="Search name or category"
            />
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Category</th>
              <th className="px-3 py-2 font-semibold">Rating</th>
              <th className="px-3 py-2 font-semibold">Pricing</th>
              <th className="px-3 py-2 font-semibold">Student Friendly</th>
              <th className="px-3 py-2 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedTools.map((tool) => {
              const slug = getToolSlug(tool)

              return (
                <tr key={slug} className="border-b border-slate-800">
                  <td className="px-3 py-2 text-slate-100">{tool.name || 'Unknown'}</td>
                  <td className="px-3 py-2 text-slate-300">{tool.category || 'Uncategorized'}</td>
                  <td className="px-3 py-2 text-slate-300">{getToolRating(tool).toFixed(1)}</td>
                  <td className="px-3 py-2 text-slate-300">{tool.pricing || tool.pricing_tier || 'Unknown'}</td>
                  <td className="px-3 py-2 text-slate-300">{tool.student_friendly === true ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => window.open(`/tools/${slug}`, '_blank', 'noopener,noreferrer')}
                        className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:bg-slate-800"
                        aria-label={`View ${tool.name}`}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingTool(tool)}
                        className="rounded-md border border-slate-700 p-1.5 text-slate-300 transition hover:bg-slate-800"
                        aria-label={`Edit ${tool.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}

            {!loading && paginatedTools.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No tools found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Showing {paginatedTools.length} of {filteredTools.length}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setToolsPage((prev) => Math.max(1, prev - 1))}
            disabled={toolsPage <= 1}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="text-sm text-slate-300">
            Page {toolsPage} / {totalToolsPages}
          </span>
          <button
            type="button"
            onClick={() => setToolsPage((prev) => Math.min(totalToolsPages, prev + 1))}
            disabled={toolsPage >= totalToolsPages}
            className="rounded-md border border-slate-700 px-3 py-1 text-sm text-slate-300 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  )

  const renderUsersTab = () => (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-xl font-semibold text-white">Users</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-700 text-slate-400">
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 font-semibold">Name</th>
              <th className="px-3 py-2 font-semibold">Email</th>
              <th className="px-3 py-2 font-semibold">OAuth Provider</th>
              <th className="px-3 py-2 font-semibold">Member Since</th>
              <th className="px-3 py-2 font-semibold">Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-slate-800">
                <td className="px-3 py-2 text-slate-300">{user.id}</td>
                <td className="px-3 py-2 text-slate-100">{user.display_name || 'Unknown'}</td>
                <td className="px-3 py-2 text-slate-300">{user.email || 'Unknown'}</td>
                <td className="px-3 py-2 text-slate-300">{user.oauth_provider || 'password'}</td>
                <td className="px-3 py-2 text-slate-300">
                  {user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                </td>
                <td className="px-3 py-2">
                  {user.is_admin ? (
                    <span className="rounded-full bg-emerald-900/60 px-2 py-1 text-xs font-semibold text-emerald-300">Admin</span>
                  ) : (
                    <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">User</span>
                  )}
                </td>
              </tr>
            ))}
            {!loading && users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                  No users found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )

  const renderModelTab = () => (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-xl font-semibold text-white">ML Model</h2>
      <p className={`mt-3 text-lg font-semibold ${modelActive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {modelActive ? 'ML Model: Active ✓' : 'ML Model: Inactive'}
      </p>
      <p className="mt-2 text-sm text-slate-400">Use quick actions to retrain and refresh cached tool data.</p>
    </section>
  )

  if (!isAuthorized) {
    return null
  }

  return (
    <PageTransition>
      <main className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-lg">
        <h1 className="text-3xl font-bold tracking-tight text-white">Admin Dashboard</h1>
        <p className="mt-2 text-sm text-slate-300">Platform analytics, inventory control, and model operations.</p>
      </section>

      <section className="mb-6 flex items-center gap-6 border-b border-slate-800">
        {TABS.map((tab) => {
          const active = tab === activeTab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-semibold transition ${
                active ? 'border-b-2 border-indigo-500 text-indigo-400' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          )
        })}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
        <div>
          {activeTab === 'Overview' ? renderOverviewTab() : null}
          {activeTab === 'Tools' ? renderToolsTab() : null}
          {activeTab === 'Users' ? renderUsersTab() : null}
          {activeTab === 'ML Model' ? renderModelTab() : null}
        </div>

        <aside className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Quick Actions</h2>
          <div className="mt-4 space-y-3">
            <button
              type="button"
              onClick={handleRetrainModel}
              disabled={runningAction === 'retrain'}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-60"
            >
              {runningAction === 'retrain' ? 'Retraining...' : 'Retrain ML Model'}
            </button>

            <button
              type="button"
              onClick={handleClearCache}
              disabled={runningAction === 'cache'}
              className="w-full rounded-lg border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
            >
              {runningAction === 'cache' ? 'Clearing...' : 'Clear Tool Cache'}
            </button>

            <a
              href="/data/tools.json"
              download
              className="block w-full rounded-lg border border-slate-700 px-4 py-2 text-center text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
            >
              Export All Tools JSON
            </a>
          </div>
        </aside>
      </section>

      {editingTool ? (
        <EditToolModal
          tool={editingTool}
          onClose={() => setEditingTool(null)}
          onSave={handleSaveEditedTool}
        />
      ) : null}
      </main>
    </PageTransition>
  )
}

export default AdminPage
