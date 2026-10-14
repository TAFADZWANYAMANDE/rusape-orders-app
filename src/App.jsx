import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignupPage from './pages/SignupPage'
import LoginPage from './pages/LoginPage'
import ShopDashboard from './pages/ShopDashboard'
import SupplierDashboard from './pages/SupplierDashboard'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/shop/dashboard" element={<ShopDashboard />} />
        <Route path="/supplier/dashboard" element={<SupplierDashboard />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
