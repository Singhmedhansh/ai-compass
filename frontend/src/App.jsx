import { BrowserRouter, Route, Routes } from 'react-router-dom'

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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/tools" element={<DirectoryPage />} />
        <Route path="/tools/:slug" element={<ToolDetailPage />} />
        <Route path="/ai-tool-finder" element={<ToolFinderPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
