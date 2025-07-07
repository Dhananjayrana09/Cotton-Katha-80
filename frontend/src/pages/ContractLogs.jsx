/**
 * Contract Logs page - Flow 3
 * Shows audit trail of all contract operations
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  FileText,
  Clock,
  User,
  Eye,
  Filter,
  CalendarDays
} from 'lucide-react'
import { supabase } from '../services/supabaseClient'
import toast from 'react-hot-toast'

const ContractLogs = () => {
  const { user, isAdmin } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_records: 0
  })
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20
  })

  // Fetch contract logs
  const fetchLogs = async () => {
    try {
      setLoading(true)
      const params = {
        page: filters.page,
        limit: filters.limit
      }

      const response = await api.get('/contract/logs', { params })
      setLogs(response.data.data.logs)
      setPagination(response.data.data.pagination)
    } catch (error) {
      console.error('Error fetching contract logs:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin()) {
      fetchLogs()
    } else {
      setLoading(false)
    }
  }, [filters, isAdmin])

  // Real-time subscription for contract logs
  useEffect(() => {
    if (!isAdmin()) return;
    const channel = supabase.channel('realtime:contract_logs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contract_logs' }, (payload) => {
        fetchLogs();
        if (payload.eventType === 'INSERT') {
          toast.success('New contract log entry');
        } else if (payload.eventType === 'UPDATE') {
          toast('Contract log updated');
        } else if (payload.eventType === 'DELETE') {
          toast('Contract log removed');
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, isAdmin]);

  // Handle pagination
  const handlePageChange = (newPage) => {
    setFilters(prev => ({ ...prev, page: newPage }))
  }

  // Get action icon and color
  const getActionDisplay = (action) => {
    switch (action) {
      case 'uploaded':
        return { icon: FileText, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Uploaded' }
      case 'approved':
        return { icon: Clock, color: 'text-green-600', bg: 'bg-green-100', label: 'Approved' }
      case 'sent':
        return { icon: User, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Sent' }
      case 'rejected':
        return { icon: Eye, color: 'text-red-600', bg: 'bg-red-100', label: 'Rejected' }
      default:
        return { icon: FileText, color: 'text-gray-600', bg: 'bg-gray-100', label: action }
    }
  }

  if (!isAdmin()) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have permission to view contract logs.
        </p>
      </div>
    )
  }

  if (loading) {
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
        <h1 className="text-2xl font-bold text-gray-900">Contract Audit Logs</h1>
        <p className="mt-1 text-sm text-gray-600">
          Complete audit trail of all contract operations and status changes
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Logs</p>
              <p className="text-lg font-semibold text-gray-900">{pagination.total_records}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Today's Activities</p>
              <p className="text-lg font-semibold text-gray-900">
                {logs.filter(log => {
                  const today = new Date().toDateString()
                  return new Date(log.timestamp).toDateString() === today
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <User className="h-8 w-8 text-purple-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Sent Contracts</p>
              <p className="text-lg font-semibold text-gray-900">
                {logs.filter(log => log.action === 'sent').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CalendarDays className="h-8 w-8 text-orange-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">This Week</p>
              <p className="text-lg font-semibold text-gray-900">
                {logs.filter(log => {
                  const weekAgo = new Date()
                  weekAgo.setDate(weekAgo.getDate() - 7)
                  return new Date(log.timestamp) > weekAgo
                }).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Filter className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Activity Log</h3>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={filters.limit}
              onChange={(e) => setFilters(prev => ({ ...prev, limit: parseInt(e.target.value), page: 1 }))}
              className="text-sm border border-gray-300 rounded-md px-3 py-1"
            >
              <option value={10}>10 per page</option>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
            </select>
            <button
              onClick={fetchLogs}
              className="btn-secondary text-sm"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Logs Timeline */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Contract Activity Timeline</h3>
        </div>

        <div className="flow-root">
          <ul className="-mb-8">
            {logs.map((log, logIndex) => {
              const actionDisplay = getActionDisplay(log.action)
              const ActionIcon = actionDisplay.icon

              return (
                <li key={log.id}>
                  <div className="relative pb-8">
                    {logIndex !== logs.length - 1 && (
                      <span className="absolute top-5 left-5 -ml-px h-full w-0.5 bg-gray-200" />
                    )}
                    <div className="relative flex items-start space-x-3">
                      <div className={`relative px-1`}>
                        <div className={`h-8 w-8 ${actionDisplay.bg} rounded-full ring-8 ring-white flex items-center justify-center`}>
                          <ActionIcon className={`h-4 w-4 ${actionDisplay.color}`} />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${actionDisplay.bg} ${actionDisplay.color}`}>
                                {actionDisplay.label}
                              </span>
                              <span className="text-sm font-medium text-gray-900">
                                {log.purchase_contract_table?.indent_number}
                              </span>
                            </div>
                            <time className="text-xs text-gray-500">
                              {new Date(log.timestamp).toLocaleString()}
                            </time>
                          </div>

                          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <span className="font-medium text-gray-500">Contract:</span>
                              <p className="text-gray-900">{log.purchase_contract_table?.firm_name}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-500">Status:</span>
                              <p className="text-gray-900">{log.purchase_contract_table?.status}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-500">User:</span>
                              <p className="text-gray-900">
                                {log.users?.first_name} {log.users?.last_name}
                              </p>
                            </div>
                          </div>

                          {log.notes && (
                            <div className="mt-2">
                              <span className="font-medium text-gray-500 text-sm">Notes:</span>
                              <p className="text-sm text-gray-700 mt-1">{log.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>

        {/* Empty State */}
        {logs.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No contract logs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              Contract activities will appear here as they occur.
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
            <h3 className="text-sm font-medium text-gray-900">Export Logs</h3>
            <p className="text-sm text-gray-500">Download contract activity logs for reporting</p>
          </div>
          <div className="space-x-2">
            <button className="btn-secondary text-sm">
              Export CSV
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

export default ContractLogs