/**
 * Payment Detail page - Flow 2
 * Shows CDU payment preview and confirmation
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Currency,
  FileText,
  Banknote,
  CalendarDays,
  Library,
  CheckCircle
} from 'lucide-react'
import toast from 'react-hot-toast'

const PaymentDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirming, setConfirming] = useState(false)

  // Fetch payment details
  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const response = await api.get(`/payment/${id}`)
        setPayment(response.data.data.payment)
      } catch (error) {
        console.error('Error fetching payment:', error)
        toast.error('Failed to fetch payment details')
      } finally {
        setLoading(false)
      }
    }

    fetchPayment()
  }, [id])

  // Confirm payment (this just updates UI, actual CDU generation already happened)
  const confirmPayment = async () => {
    try {
      setConfirming(true)
      // In a real scenario, this might trigger additional processing
      toast.success('Payment details confirmed')
      navigate(`/utr/${id}`)
    } catch (error) {
      console.error('Error confirming payment:', error)
      toast.error('Failed to confirm payment')
    } finally {
      setConfirming(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Payment not found</h3>
        <button
          onClick={() => navigate('/allocations')}
          className="mt-4 btn-primary"
        >
          Back to Allocations
        </button>
      </div>
    )
  }

  const cduData = {
    payment_mode: payment.payment_mode,
    payment_type: payment.payment_type,
    amount: payment.amount,
    bank: payment.bank,
    due_date: payment.due_date,
    remarks: payment.remarks
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CDU Payment Preview</h1>
            <p className="mt-1 text-sm text-gray-600">
              Review payment details and proceed to UTR submission
            </p>
          </div>
          <button
            onClick={() => navigate(-1)}
            className="btn-secondary"
          >
            Back
          </button>
        </div>
      </div>

      {/* Payment Status */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center">
          <FileText className="h-6 w-6 text-blue-500 mr-3" />
          <div>
            <h3 className="text-lg font-medium text-blue-900">CDU Generated Successfully</h3>
            <p className="text-sm text-blue-700">
              Payment draft has been created. Please review the details below and proceed with payment.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CDU Details */}
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <Currency className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">CDU Payment Details</h2>
          </div>

          <div className="space-y-6">
            {/* Amount */}
            <div className="text-center bg-green-50 p-6 rounded-lg">
              <p className="text-sm font-medium text-green-600 mb-2">Payment Amount</p>
              <p className="text-4xl font-bold text-green-900">
                ₹{cduData.amount.toLocaleString()}
              </p>
            </div>

            {/* Payment Details */}
            <div className="grid grid-cols-1 gap-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-500">Payment Mode</span>
                <span className="text-sm text-gray-900 font-medium">{cduData.payment_mode}</span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-500">Payment Type</span>
                <span className="text-sm text-gray-900 font-medium">{cduData.payment_type}</span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-500">Preferred Bank</span>
                <span className="text-sm text-gray-900 font-medium">{cduData.bank}</span>
              </div>
              
              <div className="flex items-center justify-between py-3 border-b border-gray-200">
                <span className="text-sm font-medium text-gray-500">Due Date</span>
                <span className="text-sm text-gray-900 font-medium">
                  {new Date(cduData.due_date).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Remarks */}
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-2">Remarks</label>
              <div className="bg-gray-50 p-3 rounded-md">
                <p className="text-sm text-gray-900">{cduData.remarks}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Procurement Information */}
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <FileText className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Related Procurement</h2>
          </div>

          {payment.procurement_dump && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Indent Number</label>
                <p className="text-lg font-medium text-gray-900">
                  {payment.procurement_dump.indent_number}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500">Firm Name</label>
                <p className="text-lg text-gray-900">{payment.procurement_dump.firm_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Bale Quantity</label>
                  <p className="text-lg text-gray-900">
                    {payment.procurement_dump.bale_quantity?.toLocaleString()} bales
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Zone</label>
                  <p className="text-lg text-gray-900">{payment.procurement_dump.zone}</p>
                </div>
              </div>

              {payment.procurement_dump.allocation && (
                <div className="pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-500 mb-2">
                    Branch Information
                  </label>
                  <div className="bg-gray-50 p-3 rounded-md space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">Branch:</span> {' '}
                      {payment.procurement_dump.allocation.branch_information?.branch_name}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Code:</span> {' '}
                      {payment.procurement_dump.allocation.branch_information?.branch_code}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <Banknote className="h-6 w-6 text-purple-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Payment Instructions</h2>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <ol className="list-decimal list-inside space-y-2 text-sm text-purple-900">
            <li>Use the payment mode: <strong>{cduData.payment_mode}</strong></li>
            <li>Transfer amount: <strong>₹{cduData.amount.toLocaleString()}</strong></li>
            <li>Preferred bank: <strong>{cduData.bank}</strong></li>
            <li>Complete payment before due date: <strong>{new Date(cduData.due_date).toLocaleDateString()}</strong></li>
            <li>After successful payment, submit UTR number in the next step</li>
            <li>Keep payment receipt for your records</li>
          </ol>
        </div>
      </div>

      {/* Current Status */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <CalendarDays className="h-6 w-6 text-orange-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Payment Status</h2>
        </div>

        <div className="space-y-3">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-500 mr-3" />
            <span className="text-sm text-gray-900">CDU Generated</span>
            <span className="ml-auto text-xs text-gray-500">
              {new Date(payment.created_at).toLocaleString()}
            </span>
          </div>

          <div className="flex items-center">
            <div className="h-5 w-5 border-2 border-gray-300 rounded-full mr-3"></div>
            <span className="text-sm text-gray-500">Payment Pending</span>
          </div>

          <div className="flex items-center">
            <div className="h-5 w-5 border-2 border-gray-300 rounded-full mr-3"></div>
            <span className="text-sm text-gray-500">UTR Submission</span>
          </div>

          <div className="flex items-center">
            <div className="h-5 w-5 border-2 border-gray-300 rounded-full mr-3"></div>
            <span className="text-sm text-gray-500">Payment Verification</span>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-4">
        <button
          onClick={() => window.print()}
          className="btn-secondary"
        >
          <FileText className="h-4 w-4 mr-2" />
          Print CDU
        </button>
        
        <button
          onClick={confirmPayment}
          disabled={confirming}
          className="btn-primary"
        >
          {confirming ? (
            <>
              <LoadingSpinner size="sm" />
              <span className="ml-2">Processing...</span>
            </>
          ) : (
            'Proceed to UTR Submission'
          )}
        </button>
      </div>
    </div>
  )
}

export default PaymentDetail