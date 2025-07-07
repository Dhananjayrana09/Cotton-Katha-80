/**
 * Allocations page - Flow 2
 * Shows list of allocations with procurement actions
 */

import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ClipboardList,
  Eye,
  Currency,
  Calendar,
  Building
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'

const Allocations = () => {
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [allocations, setAllocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_records: 0
  })
  const [filters, setFilters] = useState({
    status: '',
    search: '',
    page: 1,
    limit: 10
  })

  // Fetch allocations
  const fetchAllocations = async () => {
    try {
      setLoading(true)
      const params = {
        page: filters.page,
        limit: filters.limit,
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search })
      }

      const response = await api.get('/allocations', { params })
      setAllocations(response.data.data.allocations)
      setPagination(response.data.data.pagination)
    } catch (error) {
      console.error('Error fetching allocations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllocations()
  }, [filters])

  // Real-time subscription for allocations
  useEffect(() => {
    const channel = supabase.channel('realtime:allocations')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'allocation' }, () => {
        fetchAllocations();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters]);

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

  // Get status badge style
  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    switch (status) {
      case 'pending':
        return `${baseClasses} bg-yellow-100 text-yellow-800`
      case 'active':
        return `${baseClasses} bg-green-100 text-green-800`
      case 'completed':
        return `${baseClasses} bg-blue-100 text-blue-800`
      case 'cancelled':
        return `${baseClasses} bg-red-100 text-red-800`
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`
    }
  }

  if (loading && allocations.length === 0) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Allocations</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage cotton allocation and procurement processes
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <button
              className="btn-primary"
              onClick={() => navigate('/allocations/manual-entry')}
            >
              + Manual Allocation Entry
            </button>
            <button
              className="btn-secondary"
              onClick={() => navigate('/logs')}
            >
              View Logs
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => handleFilterChange('status', e.target.value)}
              className="input-field"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="Search by indent number..."
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

          <div className="flex items-end">
            <button
              onClick={fetchAllocations}
              className="btn-primary w-full"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <ClipboardList className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total</p>
              <p className="text-lg font-semibold text-gray-900">{pagination.total_records}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-lg font-semibold text-gray-900">
                {allocations.filter(a => a.allocation_status === 'pending').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Building className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Active</p>
              <p className="text-lg font-semibold text-gray-900">
                {allocations.filter(a => a.allocation_status === 'active').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Currency className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-lg font-semibold text-gray-900">
                {allocations.filter(a => a.allocation_status === 'completed').length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Allocations Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Indent Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Branch & Zone
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity & Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {allocations.map((allocation) => (
                <tr key={allocation.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {allocation.indent_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {allocation.crop_year} • {allocation.buyer_type}
                      </div>
                      <div className="text-sm text-gray-500">
                        Period: {allocation.lifting_period}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {allocation.branch_information?.branch_name || allocation.branch_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {allocation.zone} Zone
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {allocation.bale_quantity?.toLocaleString()} bales
                      </div>
                      <div className="text-sm text-gray-500">
                        ₹{allocation.otr_price} per candy
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadge(allocation.allocation_status)}>
                      {allocation.allocation_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link
                      to={`/allocation/${allocation.id}`}
                      className="inline-flex items-center text-blue-600 hover:text-blue-900"
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View Details
                    </Link>
                    
                    {allocation.allocation_status === 'active' && (
                      <Link
                        to={`/allocation/${allocation.id}`}
                        className="inline-flex items-center text-green-600 hover:text-green-900"
                      >
                        <Currency className="h-4 w-4 mr-1" />
                        Start Procurement
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {allocations.length === 0 && !loading && (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No allocations found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No allocations match your current filters.
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
    </div>
  )
}

export default Allocations