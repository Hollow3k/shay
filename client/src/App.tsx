import { Navigate, Route, Routes } from 'react-router-dom'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import ProjectPage from './pages/ProjectPage'
import { ProtectedRoute } from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path='/' element={<Landing />} />
      <Route path='/login' element={<Landing />} />
      <Route element={<ProtectedRoute />}>
        <Route path='/dashboard' element={<Dashboard />} />
        <Route path='/project/:projectId' element={<ProjectPage />} />
      </Route>
      <Route path='*' element={<Navigate to='/' replace />} />
    </Routes>
  )
}

export default App
