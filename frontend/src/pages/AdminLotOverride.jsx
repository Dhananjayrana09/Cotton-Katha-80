/**
 * Admin Lot Override page - Flow 7
 * Admin interface for overriding customer lot decisions
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ShieldCheck,
  Box,
  User,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Filter
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../services/supabaseClient'

const AdminLotOverride = () => {
  const { user, isAdmin } = useAuth()
  
  const [assignments, setAssignments] = useState([])
  const [loading, setLoading] = useState(true)
  const [overriding, setOverriding] = useState({})
  const [filters, setFilters] = useState({
    status: 'all',
    customer: '',
    date_from: '',
    date_to: ''
  })
  const [stats, setStats] = useState({})
  const [selectedForReminder, setSelectedForReminder] = useState([])
  const [reminderLoading, setReminderLoading] = useState(false)
  const [reminderLogs, setReminderLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)

  // Fetch assignment statistics
  const fetchStats = async () => {
    try {
      const response = await api.get('/customer/assignments/stats')
      setStats(response.data.data.assignment_stats)
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  // Fetch customer assignments for admin view
  const fetchAssignments = async () => {
    try {
      setLoading(true)
      // Note: This would need a dedicated admin endpoint
      // For now, we'll simulate it with the customer endpoint
      const response = await api.get('/customer/lots')
      
      // Combine all assignments for admin view
      const allAssignments = [
        ...response.data.data.assignments.active,
        ...response.data.data.assignments.expired,
        ...response.data.data.assignments.responded
      ]
      
      setAssignments(allAssignments)
    } catch (error) {
      console.error('Error fetching assignments:', error)
      toast.error('Failed to fetch assignments')
    } finally {
      setLoading(false)
    }
  }

  // Fetch reminder logs
  const fetchReminderLogs = async () => {
    try {
      setLogsLoading(true)
      // Fetch audit logs for REMINDER_SENT actions
      const response = await api.get('/logs', {
        params: {
          action: 'REMINDER_SENT',
          table_name: 'customer_assignment_table',
        }
      })
      setReminderLogs(response.data.data.logs || [])
    } catch (error) {
      console.error('Error fetching reminder logs:', error)
      toast.error('Failed to fetch reminder logs')
    } finally {
      setLogsLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin()) {
      fetchAssignments()
      fetchStats()
      fetchReminderLogs()
      // Real-time updates for assignments
      const subscription = supabase
        .channel('public:customer_assignment_table')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'customer_assignment_table' },
          (payload) => {
            fetchAssignments()
            fetchStats()
            fetchReminderLogs()
          }
        )
        .subscribe()
      return () => {
        supabase.removeChannel(subscription)
      }
    } else {
      setLoading(false)
    }
  }, [isAdmin])

  // Admin override decision
  const overrideDecision = async (assignmentId, action, notes = '') => {
    try {
      setOverriding(prev => ({ ...prev, [assignmentId]: true }))
      
      await api.post('/customer/admin/override', {
        assignment_id: assignmentId,
        action,
        notes
      })
      
      toast.success(`Assignment ${action}ed successfully by admin`)
      await fetchAssignments()
      await fetchStats()
    } catch (error) {
      console.error('Error overriding decision:', error)
      toast.error(error.response?.data?.message || 'Failed to override decision')
    } finally {
      setOverriding(prev => ({ ...prev, [assignmentId]: false }))
    }
  }

  // Get status badge
  const getStatusBadge = (status) => {
    const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium"
    switch (status) {
      case 'PENDING':
        return `${baseClasses} bg-yellow-100 text-yellow-800`
      case 'ACCEPTED':
        return `${baseClasses} bg-green-100 text-green-800`
      case 'REJECTED':
        return `${baseClasses} bg-red-100 text-red-800`
      case 'EXPIRED':
        return `${baseClasses} bg-gray-100 text-gray-800`
      default:
        return `${baseClasses} bg-gray-100 text-gray-800`
    }
  }

  // Filter assignments
  const filteredAssignments = assignments.filter(assignment => {
    if (filters.status !== 'all' && assignment.lot_status !== filters.status) return false
    if (filters.customer && !assignment.customer_id?.includes(filters.customer)) return false
    // Add date filtering logic here if needed
    return true
  })

  if (!isAdmin()) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">
          You don't have permission to view this page.
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
        <h1 className="text-2xl font-bold text-gray-900">Lot Assignment Administration</h1>
        <p className="mt-1 text-sm text-gray-600">
          Override customer lot assignment decisions and manage assignments
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-lg font-semibold text-gray-900">{stats.PENDING || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Accepted</p>
              <p className="text-lg font-semibold text-gray-900">{stats.ACCEPTED || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Rejected</p>
              <p className="text-lg font-semibold text-gray-900">{stats.REJECTED || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Box className="h-8 w-8 text-gray-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Expired</p>
              <p className="text-lg font-semibold text-gray-900">{stats.EXPIRED || 0}</p>
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
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="input-field"
            >
              <option value="all">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="ACCEPTED">Accepted</option>
              <option value="REJECTED">Rejected</option>
              <option value="EXPIRED">Expired</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Customer Search
            </label>
            <input
              type="text"
              value={filters.customer}
              onChange={(e) => setFilters(prev => ({ ...prev, customer: e.target.value }))}
              placeholder="Search by customer..."
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
              onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value }))}
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
              onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value }))}
              className="input-field"
            />
          </div>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Assignment Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Window Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Admin Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredAssignments.map((assignment) => (
                <tr key={assignment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {assignment.lot_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {assignment.indent_number}
                      </div>
                      {assignment.inventory_table && (
                        <div className="text-xs text-gray-500">
                          {assignment.inventory_table.variety} • {assignment.inventory_table.fibre_length}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <User className="h-4 w-4 text-gray-400 mr-2" />
                      <div className="text-sm text-gray-900">
                        Customer #{assignment.customer_id}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">
                        {new Date(assignment.window_start_date).toLocaleDateString()} - {' '}
                        {new Date(assignment.window_end_date).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={getStatusBadge(assignment.lot_status)}>
                      {assignment.lot_status}
                    </span>
                    {assignment.responded_at && (
                      <div className="text-xs text-gray-500 mt-1">
                        Responded: {new Date(assignment.responded_at).toLocaleDateString()}
                      </div>
                    )}
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {assignment.lot_status === 'PENDING' ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => overrideDecision(assignment.id, 'reject', 'Admin override - rejected')}
                          disabled={overriding[assignment.id]}
                          className="inline-flex items-center btn-secondary text-xs"
                        >
                          {overriding[assignment.id] ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <XCircle className="h-3 w-3 mr-1" />
                              Override Reject
                            </>
                          )}
                        </button>
                        
                        <button
                          onClick={() => overrideDecision(assignment.id, 'accept', 'Admin override - accepted')}
                          disabled={overriding[assignment.id]}
                          className="inline-flex items-center btn-primary text-xs"
                        >
                          {overriding[assignment.id] ? (
                            <LoadingSpinner size="sm" />
                          ) : (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Override Accept
                            </>
                          )}
                        </button>
                      </div>
                    ) : assignment.lot_status === 'REJECTED' ? (
                      <button
                        onClick={() => overrideDecision(assignment.id, 'accept', 'Admin override - changed to accepted')}
                        disabled={overriding[assignment.id]}
                        className="inline-flex items-center btn-primary text-xs"
                      >
                        {overriding[assignment.id] ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Change to Accept
                          </>
                        )}
                      </button>
                    ) : assignment.lot_status === 'ACCEPTED' ? (
                      <button
                        onClick={() => overrideDecision(assignment.id, 'reject', 'Admin override - changed to rejected')}
                        disabled={overriding[assignment.id]}
                        className="inline-flex items-center btn-secondary text-xs"
                      >
                        {overriding[assignment.id] ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <XCircle className="h-3 w-3 mr-1" />
                            Change to Reject
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">No actions available</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filteredAssignments.length === 0 && (
          <div className="text-center py-12">
            <Box className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No assignments found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No assignments match your current filters.
            </p>
          </div>
        )}
      </div>

      {/* Admin Guidelines */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start">
          <ShieldCheck className="h-5 w-5 text-yellow-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-yellow-900">Admin Override Guidelines</h3>
            <ul className="mt-2 text-sm text-yellow-800 list-disc list-inside space-y-1">
              <li>Override decisions should be used sparingly and with proper justification</li>
              <li>Consider customer requirements and inventory availability before overriding</li>
              <li>All override actions are logged in the audit trail for compliance</li>
              <li>Communicate with customers when their decisions are overridden</li>
              <li>Monitor override usage to ensure fair and consistent treatment</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">Bulk Actions</h3>
            <p className="text-sm text-gray-500">Perform actions on multiple assignments</p>
          </div>
          <div className="space-x-2">
            <button className="btn-secondary text-sm">
              Export Data
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

export default AdminLotOverride