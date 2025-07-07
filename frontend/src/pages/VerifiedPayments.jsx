/**
 * Verified Payments page - Flow 2
 * Shows list of all verified payment transactions
 */

import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  CheckCircle,
  Currency,
  FileText,
  Eye,
  CalendarDays,
  Filter
} from 'lucide-react'
import toast from 'react-hot-toast'

const VerifiedPayments = () => {
  const { user, isAdmin } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_records: 0
  })
  const [filters, setFilters] = useState({
    page: 1,
    limit: 10,
    search: '',
    date_from: '',
    date_to: ''
  })
  const [stats, setStats] = useState({
    total_amount: 0,
    total_count: 0,
    this_month: 0
  })

  // Fetch verified payments
  const fetchPayments = async () => {
    try {
      setLoading(true)
      const params = {
        page: filters.page,
        limit: filters.limit,
        ...(filters.search && { search: filters.search }),
        ...(filters.date_from && { date_from: filters.date_from }),
        ...(filters.date_to && { date_to: filters.date_to })
      }

      const response = await api.get('/payment/verified', { params })
      setPayments(response.data.data.payments)
      setPagination(response.data.data.pagination)
      
      // Calculate stats
      const totalAmount = response.data.data.payments.reduce((sum, p) => sum + p.amount, 0)
      const thisMonth = response.data.data.payments.filter(p => {
        const verifiedDate = new Date(p.verified_at)
        const currentMonth = new Date()
        return verifiedDate.getMonth() === currentMonth.getMonth() && 
               verifiedDate.getFullYear() === currentMonth.getFullYear()
      }).length

      setStats({
        total_amount: totalAmount,
        total_count: response.data.data.payments.length,
        this_month: thisMonth
      })
    } catch (error) {
      console.error('Error fetching verified payments:', error)
      toast.error('Failed to fetch verified payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPayments()
  }, [filters])

  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value,
      page: 1 // Reset to first page when filtering
    }))
  }

  // Handle pagination
  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }))
  }

  // Clear filters
  const clearFilters = () => {
    setFilters({
      page: 1,
      limit: 10,
      search: '',
      date_from: '',
      date_to: ''
    })
  }

  if (loading && payments.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Verified Payments</h1>
        <p className="mt-1 text-sm text-gray-600">
          View all verified payment transactions with UTR details
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Verified</p>
              <p className="text-lg font-semibold text-gray-900">{stats.total_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Currency className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                ₹{stats.total_amount.toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CalendarDays className="h-8 w-8 text-purple-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">This Month</p>
              <p className="text-lg font-semibold text-gray-900">{stats.this_month}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-orange-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Avg Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                ₹{stats.total_count > 0 ? Math.round(stats.total_amount / stats.total_count).toLocaleString() : 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center mb-4">
          <Filter className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="UTR, indent number..."
              className="input-field"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <input
              type="date"
              value={filters.date_from}
              onChange={(e) => handleFilterChange('date_from', e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <input
              type="date"
              value={filters.date_to}
              onChange={(e) => handleFilterChange('date_to', e.target.value)}
              className="input-field"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Per Page
            </label>
            <select
              value={filters.limit}
              onChange={(e) => handleFilterChange('limit', parseInt(e.target.value))}
              className="input-field"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
          </div>

          <div className="flex items-end space-x-2">
            <button
              onClick={fetchPayments}
              className="btn-primary flex-1"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="btn-secondary flex-1"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Payment Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  UTR Information
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Procurement
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Verification
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        ₹{payment.amount.toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.payment_mode} • {payment.payment_type}
                      </div>
                      <div className="text-sm text-gray-500">
                        Bank: {payment.bank}
                      </div>
                      <div className="text-sm text-gray-500">
                        Due: {new Date(payment.due_date).toLocaleDateString()}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {payment.utr_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        Submitted: {new Date(payment.verified_at).toLocaleDateString()}
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Verified
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {payment.procurement_dump?.indent_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.procurement_dump?.firm_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {payment.procurement_dump?.bale_quantity?.toLocaleString()} bales
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">
                        By: {payment.verified_user?.first_name} {payment.verified_user?.last_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(payment.verified_at).toLocaleString()}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link
                      to={`/payment/${payment.id}`}
                      className="inline-flex items-center text-blue-600 hover:text-blue-900"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {payments.length === 0 && !loading && (
          <div className="text-center py-12">
            <CheckCircle className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No verified payments found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No payments match your current filters.
            </p>
          </div>
        )}

        {/* Pagination */}
        {pagination.total_pages > 1 && (
          <div className="bg-white px-4 py-3 border-t border-gray-200 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page {pagination.current_page} of {pagination.total_pages} 
                  ({pagination.total_records} total records)
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={!pagination.has_previous}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                  disabled={!pagination.has_next}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Export Options */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Export Options</h3>
            <p className="text-sm text-gray-500">Download verified payments data</p>
          </div>
          <div className="space-x-2">
            <button className="btn-secondary text-sm">
              Export CSV
            </button>
            <button className="btn-secondary text-sm">
              Export Excel
            </button>
            <button className="btn-primary text-sm">
              Generate Report
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default VerifiedPayments