import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { Navbar } from './components/ui'
import AuthCallbackPage from './pages/AuthCallbackPage'
import DashboardPage from './pages/DashboardPage'
import DirectoryPage from './pages/DirectoryPage'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ToolDetailPage from './pages/ToolDetailPage'
import ToolFinderPage from './pages/ToolFinderPage'

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-white">
        <Navbar />
        <Routes>
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/" element={<HomePage />} />
          <Route path="/tools" element={<DirectoryPage />} />
          <Route path="/tools/:slug" element={<ToolDetailPage />} />
          <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
