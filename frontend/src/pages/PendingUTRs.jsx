/**
 * Pending UTRs page - Flow 2
 * Admin view of overdue payments for sending reminders
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  AlertTriangle,
  Currency,
  CalendarDays,
  Mail,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'

const PendingUTRs = () => {
  const { user, isAdmin } = useAuth()
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [sendingReminders, setSendingReminders] = useState({})
  const [selectedPayments, setSelectedPayments] = useState([])

  // Fetch pending UTR payments
  useEffect(() => {
    const fetchPendingPayments = async () => {
      try {
        const response = await api.get('/utr/pending')
        setPayments(response.data.data.pending_payments)
      } catch (error) {
        console.error('Error fetching pending payments:', error)
        toast.error('Failed to fetch pending payments')
      } finally {
        setLoading(false)
      }
    }

    if (isAdmin()) {
      fetchPendingPayments()
    } else {
      setLoading(false)
    }
  }, [isAdmin])

  // Calculate overdue days
  const getOverdueDays = (dueDate) => {
    const today = new Date()
    const due = new Date(dueDate)
    const diffTime = today - due
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }

  // Get overdue severity
  const getOverdueSeverity = (days) => {
    if (days <= 7) return 'low'
    if (days <= 14) return 'medium'
    return 'high'
  }

  // Send individual reminder
  const sendReminder = async (paymentId) => {
    try {
      setSendingReminders(prev => ({ ...prev, [paymentId]: true }))
      
      await api.post('/payment/send-reminder', {
        payment_ids: [paymentId]
      })
      
      toast.success('Reminder sent successfully')
    } catch (error) {
      console.error('Error sending reminder:', error)
      toast.error(error.response?.data?.message || 'Failed to send reminder')
    } finally {
      setSendingReminders(prev => ({ ...prev, [paymentId]: false }))
    }
  }

  // Send bulk reminders
  const sendBulkReminders = async () => {
    if (selectedPayments.length === 0) {
      toast.error('Please select payments to send reminders')
      return
    }

    try {
      setSendingReminders(prev => ({ ...prev, bulk: true }))
      
      await api.post('/payment/send-reminder', {
        payment_ids: selectedPayments
      })
      
      toast.success(`Reminders sent to ${selectedPayments.length} payments`)
      setSelectedPayments([])
    } catch (error) {
      console.error('Error sending bulk reminders:', error)
      toast.error(error.response?.data?.message || 'Failed to send reminders')
    } finally {
      setSendingReminders(prev => ({ ...prev, bulk: false }))
    }
  }

  // Toggle payment selection
  const togglePaymentSelection = (paymentId) => {
    setSelectedPayments(prev => 
      prev.includes(paymentId) 
        ? prev.filter(id => id !== paymentId)
        : [...prev, paymentId]
    )
  }

  // Select all payments
  const selectAllPayments = () => {
    if (selectedPayments.length === payments.length) {
      setSelectedPayments([])
    } else {
      setSelectedPayments(payments.map(p => p.id))
    }
  }

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pending UTR Submissions</h1>
            <p className="mt-1 text-sm text-gray-600">
              Monitor overdue payments and send reminder notifications
            </p>
          </div>
          
          {selectedPayments.length > 0 && (
            <button
              onClick={sendBulkReminders}
              disabled={sendingReminders.bulk}
              className="btn-primary"
            >
              {sendingReminders.bulk ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Sending...</span>
                </>
              ) : (
                <>
                  <Mail className="h-4 w-4 mr-2" />
                  Send Reminders ({selectedPayments.length})
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Currency className="h-8 w-8 text-red-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Pending</p>
              <p className="text-lg font-semibold text-gray-900">{payments.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <AlertTriangle className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Critical ({'>14'} days)</p>
              <p className="text-lg font-semibold text-gray-900">
                {payments.filter(p => getOverdueDays(p.due_date) > 14).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CalendarDays className="h-8 w-8 text-orange-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Overdue Amount</p>
              <p className="text-lg font-semibold text-gray-900">
                ₹{payments.reduce((sum, p) => sum + p.amount, 0).toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Mail className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Selected</p>
              <p className="text-lg font-semibold text-gray-900">{selectedPayments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Payments Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        {payments.length > 0 && (
          <div className="px-4 py-3 border-b border-gray-200">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selectedPayments.length === payments.length}
                onChange={selectAllPayments}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <span className="ml-2 text-sm text-gray-700">
                Select All ({payments.length})
              </span>
            </label>
          </div>
        )}

        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Select
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Payment Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Procurement Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Due Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Overdue
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payments.map((payment) => {
                const overdueDays = getOverdueDays(payment.due_date)
                const severity = getOverdueSeverity(overdueDays)
                
                return (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedPayments.includes(payment.id)}
                        onChange={() => togglePaymentSelection(payment.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    
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
                          Branch: {payment.procurement_dump?.allocation?.branch_information?.branch_name}
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {new Date(payment.due_date).toLocaleDateString()}
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        severity === 'high' ? 'bg-red-100 text-red-800' :
                        severity === 'medium' ? 'bg-orange-100 text-orange-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {overdueDays} days
                      </span>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                      <button
                        onClick={() => sendReminder(payment.id)}
                        disabled={sendingReminders[payment.id]}
                        className="inline-flex items-center text-blue-600 hover:text-blue-900"
                      >
                        {sendingReminders[payment.id] ? (
                          <LoadingSpinner size="sm" />
                        ) : (
                          <Mail className="h-4 w-4" />
                        )}
                        <span className="ml-1">Send Reminder</span>
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {payments.length === 0 && (
          <div className="text-center py-12">
            <Currency className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No pending UTRs</h3>
            <p className="mt-1 text-sm text-gray-500">
              All payments have received UTR submissions.
            </p>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">Reminder Guidelines</h3>
            <ul className="mt-2 text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>Send reminders for payments overdue by 3+ days</li>
              <li>Critical payments ({'>14'} days overdue) require immediate attention</li>
              <li>Use bulk reminders for multiple payments from the same firm</li>
              <li>Follow up with phone calls for high-value overdue payments</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PendingUTRs