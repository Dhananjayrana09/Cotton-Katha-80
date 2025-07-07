/**
 * Main App component with routing and layout
 */

import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Allocations from './pages/Allocations'
import AllocationDetail from './pages/AllocationDetail'
import PaymentDetail from './pages/PaymentDetail'
import UTRSubmission from './pages/UTRSubmission'
import PendingUTRs from './pages/PendingUTRs'
import VerifiedPayments from './pages/VerifiedPayments'
import ContractSearch from './pages/ContractSearch'
import ContractUpload from './pages/ContractUpload'
import AdminContracts from './pages/AdminContracts'
import ContractLogs from './pages/ContractLogs'
import SamplingEntry from './pages/SamplingEntry'
import SalesProcessing from './pages/SalesProcessing'
import CustomerLots from './pages/CustomerLots'
import AdminLotOverride from './pages/AdminLotOverride'
import LoadingSpinner from './components/LoadingSpinner'
import ManualAllocationEntry from './pages/ManualAllocationEntry'
import LogsViewer from './pages/LogsViewer'

function App() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Login />
  }

  return (
    <Layout>
      <Routes>
        {/* Dashboard */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/dashboard" element={<Dashboard />} />

        {/* Allocations - Flow 2 */}
        <Route path="/allocations" element={<Allocations />} />
        <Route path="/allocation/:id" element={<AllocationDetail />} />
        <Route path="/payment/:id" element={<PaymentDetail />} />
        <Route path="/utr/:id" element={<UTRSubmission />} />
        <Route path="/utr/pending" element={<PendingUTRs />} />
        <Route path="/payments/verified" element={<VerifiedPayments />} />
        <Route path="/allocations/manual-entry" element={<ManualAllocationEntry />} />

        {/* Contracts - Flow 3 */}
        <Route path="/contract/search" element={<ContractSearch />} />
        <Route path="/contract/upload" element={<ContractUpload />} />
        <Route path="/admin/contracts" element={<AdminContracts />} />
        <Route path="/contract/logs" element={<ContractLogs />} />

        {/* Sampling - Flow 4 */}
        <Route path="/sampling-entry" element={<SamplingEntry />} />

        {/* Sales - Flow 5 & 6 */}
        <Route path="/sales-processing" element={<SalesProcessing />} />

        {/* Customer Lots - Flow 7 */}
        <Route path="/customer/my-lots" element={<CustomerLots />} />
        <Route path="/admin/lot-override" element={<AdminLotOverride />} />

        {/* Logs Viewer */}
        <Route path="/logs" element={<LogsViewer />} />

        {/* Catch all route */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App