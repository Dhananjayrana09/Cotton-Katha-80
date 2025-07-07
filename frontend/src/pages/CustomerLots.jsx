/**
 * Customer Lots page - Flow 7
 * Customer interface for accepting/rejecting assigned lots
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Box,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  CalendarDays,
  Trophy
} from 'lucide-react'
import toast from 'react-hot-toast'

const CustomerLots = () => {
  const { user, isCustomer } = useAuth()
  
  const [assignments, setAssignments] = useState({
    active: [],
    expired: [],
    responded: []
  })
  const [summary, setSummary] = useState({
    total_assigned: 0,
    total_accepted: 0,
    total_rejected: 0,
    total_pending: 0,
    total_expired: 0
  })
  const [loading, setLoading] = useState(true)
  const [responding, setResponding] = useState({})

  // Fetch customer lot assignments
  const fetchAssignments = async () => {
    try {
      setLoading(true)
      const response = await api.get('/customer/lots')
      setAssignments(response.data.data.assignments)
      setSummary(response.data.data.summary)
    } catch (error) {
      console.error('Error fetching assignments:', error)
      toast.error('Failed to fetch lot assignments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isCustomer()) {
      fetchAssignments()
    } else {
      setLoading(false)
    }
  }, [isCustomer])

  // Accept lot assignment
  const acceptLot = async (assignmentId) => {
    try {
      setResponding(prev => ({ ...prev, [assignmentId]: 'accepting' }))
      
      await api.post('/customer/accept', {
        assignment_id: assignmentId
      })
      
      toast.success('Lot accepted successfully!')
      await fetchAssignments() // Refresh data
    } catch (error) {
      console.error('Error accepting lot:', error)
      toast.error(error.response?.data?.message || 'Failed to accept lot')
    } finally {
      setResponding(prev => ({ ...prev, [assignmentId]: null }))
    }
  }

  // Reject lot assignment
  const rejectLot = async (assignmentId) => {
    try {
      setResponding(prev => ({ ...prev, [assignmentId]: 'rejecting' }))
      
      await api.post('/customer/reject', {
        assignment_id: assignmentId
      })
      
      toast.success('Lot rejected successfully!')
      await fetchAssignments() // Refresh data
    } catch (error) {
      console.error('Error rejecting lot:', error)
      toast.error(error.response?.data?.message || 'Failed to reject lot')
    } finally {
      setResponding(prev => ({ ...prev, [assignmentId]: null }))
    }
  }

  // Get days remaining
  const getDaysRemaining = (endDate) => {
    const today = new Date()
    const end = new Date(endDate)
    const diffTime = end - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
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

  if (!isCustomer()) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Access Denied</h3>
        <p className="mt-1 text-sm text-gray-500">
          This page is only accessible to customers.
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
        <h1 className="text-2xl font-bold text-gray-900">My Lot Assignments</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review and respond to your assigned cotton lots
        </p>
      </div>

      {/* Summary Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Box className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Assigned</p>
              <p className="text-lg font-semibold text-gray-900">{summary.total_assigned}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-lg font-semibold text-gray-900">{summary.total_pending}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Accepted</p>
              <p className="text-lg font-semibold text-gray-900">{summary.total_accepted}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <XCircle className="h-8 w-8 text-red-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Rejected</p>
              <p className="text-lg font-semibold text-gray-900">{summary.total_rejected}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CalendarDays className="h-8 w-8 text-gray-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Expired</p>
              <p className="text-lg font-semibold text-gray-900">{summary.total_expired}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      {summary.total_pending > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
            <div>
              <h3 className="text-sm font-medium text-yellow-900">
                Action Required
              </h3>
              <p className="text-sm text-yellow-700">
                You have {summary.total_pending} pending lot assignment(s) that require your response.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Active Assignments */}
      {assignments.active.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <Clock className="h-6 w-6 text-yellow-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Assignments ({assignments.active.length})
            </h2>
          </div>

          <div className="space-y-4">
            {assignments.active.map((assignment) => {
              const daysRemaining = getDaysRemaining(assignment.window_end_date)
              
              return (
                <div key={assignment.id} className="border border-yellow-200 rounded-lg p-4 bg-yellow-50">
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                    <div>
                      <h3 className="font-medium text-gray-900">Lot Details</h3>
                      <p className="text-sm text-gray-600">{assignment.lot_number}</p>
                      <p className="text-sm text-gray-600">{assignment.indent_number}</p>
                      {assignment.inventory_table && (
                        <div className="text-xs text-gray-500 mt-1">
                          <p>{assignment.inventory_table.variety} • {assignment.inventory_table.fibre_length}</p>
                          <p>₹{assignment.inventory_table.bid_price}</p>
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-900">Assignment Window</h3>
                      <p className="text-sm text-gray-600">
                        Until: {new Date(assignment.window_end_date).toLocaleDateString()}
                      </p>
                      <p className={`text-sm font-medium ${
                        daysRemaining <= 1 ? 'text-red-600' : 
                        daysRemaining <= 3 ? 'text-yellow-600' : 'text-green-600'
                      }`}>
                        {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expires today'}
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium text-gray-900">Status</h3>
                      <span className={getStatusBadge(assignment.lot_status)}>
                        {assignment.lot_status}
                      </span>
                      <p className="text-xs text-gray-500 mt-1">
                        Assigned: {new Date(assignment.assigned_at).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => rejectLot(assignment.id)}
                        disabled={responding[assignment.id]}
                        className="btn-secondary text-sm"
                      >
                        {responding[assignment.id] === 'rejecting' ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </>
                        )}
                      </button>
                      
                      <button
                        onClick={() => acceptLot(assignment.id)}
                        disabled={responding[assignment.id]}
                        className="btn-primary text-sm"
                      >
                        {responding[assignment.id] === 'accepting' ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Accept
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Responded Assignments */}
      {assignments.responded.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <Trophy className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">
              Completed Assignments ({assignments.responded.length})
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Lot Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Specifications
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Response
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date Responded
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {assignments.responded.map((assignment) => (
                  <tr key={assignment.id}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{assignment.lot_number}</div>
                        <div className="text-sm text-gray-500">{assignment.indent_number}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {assignment.inventory_table && (
                        <div>
                          <div className="text-sm text-gray-900">{assignment.inventory_table.variety}</div>
                          <div className="text-sm text-gray-500">{assignment.inventory_table.fibre_length}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={getStatusBadge(assignment.lot_status)}>
                        {assignment.lot_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {assignment.responded_at ? new Date(assignment.responded_at).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expired Assignments */}
      {assignments.expired.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <CalendarDays className="h-6 w-6 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">
              Expired Assignments ({assignments.expired.length})
            </h2>
          </div>

          <div className="space-y-3">
            {assignments.expired.map((assignment) => (
              <div key={assignment.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="font-medium text-gray-500">Lot:</span>
                    <p className="text-gray-900">{assignment.lot_number}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Indent:</span>
                    <p className="text-gray-900">{assignment.indent_number}</p>
                  </div>
                  <div>
                    <span className="font-medium text-gray-500">Expired:</span>
                    <p className="text-gray-900">{new Date(assignment.window_end_date).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className={getStatusBadge('EXPIRED')}>
                      EXPIRED
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {assignments.active.length === 0 && assignments.responded.length === 0 && assignments.expired.length === 0 && (
        <div className="text-center py-12">
          <Box className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No lot assignments</h3>
          <p className="mt-1 text-sm text-gray-500">
            You don't have any lot assignments at the moment.
          </p>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">Important Guidelines</h3>
            <ul className="mt-2 text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>Review lot specifications carefully before accepting or rejecting</li>
              <li>Respond within the assignment window to avoid automatic expiration</li>
              <li>Once accepted, the lot will be reserved for you and marked as sold</li>
              <li>Rejected lots will be returned to available inventory</li>
              <li>Contact support if you need assistance with your assignments</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default CustomerLots