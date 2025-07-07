/**
 * UTR Submission page - Flow 2
 * Allow users to submit UTR number for payment verification
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Currency,
  FileText,
  CheckCircle,
  Image,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

const UTRSubmission = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [utrNumber, setUtrNumber] = useState('')
  const [screenshot, setScreenshot] = useState(null)

  // Fetch payment details
  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const response = await api.get(`/payment/${id}`)
        setPayment(response.data.data.payment)
        
        // If UTR already submitted, redirect to verified payments
        if (response.data.data.payment.utr_number) {
        
          navigate('/payment/verified')
          return
        }
      } catch (error) {
        console.error('Error fetching payment:', error)
        toast.error('Failed to fetch payment details')
      } finally {
        setLoading(false)
      }
    }

    fetchPayment()
  }, [id, navigate])

  // Handle UTR submission
  const submitUTR = async () => {
    if (!utrNumber || utrNumber.length < 12) {
      toast.error('Please enter a valid UTR number (minimum 12 characters)')
      return
    }

    try {
      setSubmitting(true)
      await api.post('/utr/submit', {
        payment_id: id,
        utr_number: utrNumber
      })
      
      toast.success('UTR submitted successfully!')
      navigate('/payment/verified')
    } catch (error) {
      console.error('Error submitting UTR:', error)
      toast.error(error.response?.data?.message || 'Failed to submit UTR')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle screenshot upload
  const handleScreenshotChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        toast.error('File size must be less than 5MB')
        return
      }
      setScreenshot(file)
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

  const isOverdue = new Date() > new Date(payment.due_date)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Submit UTR Number</h1>
            <p className="mt-1 text-sm text-gray-600">
              Enter your UTR number to verify payment completion
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

      {/* Overdue Warning */}
      {isOverdue && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mr-3" />
            <div>
              <h3 className="text-lg font-medium text-red-900">Payment Overdue</h3>
              <p className="text-sm text-red-700">
                This payment was due on {new Date(payment.due_date).toLocaleDateString()}. 
                Please submit UTR immediately to avoid delays.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* UTR Submission Form */}
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <FileText className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">UTR Submission</h2>
          </div>

          <div className="space-y-6">
            {/* UTR Number Input */}
            <div>
              <label htmlFor="utr" className="block text-sm font-medium text-gray-700 mb-2">
                UTR Number *
              </label>
              <input
                type="text"
                id="utr"
                value={utrNumber}
                onChange={(e) => setUtrNumber(e.target.value.toUpperCase())}
                placeholder="Enter 12-22 digit UTR number"
                className="input-field"
                maxLength={22}
                minLength={12}
              />
              <p className="mt-1 text-xs text-gray-500">
                UTR (Unique Transaction Reference) number from your bank statement
              </p>
            </div>

            {/* Screenshot Upload (Optional) */}
            <div>
              <label htmlFor="screenshot" className="block text-sm font-medium text-gray-700 mb-2">
                Payment Screenshot (Optional)
              </label>
              <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                <div className="space-y-1 text-center">
                  <Image className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="flex text-sm text-gray-600">
                    <label
                      htmlFor="screenshot"
                      className="relative cursor-pointer bg-white rounded-md font-medium text-blue-600 hover:text-blue-500"
                    >
                      <span>Upload a file</span>
                      <input
                        id="screenshot"
                        name="screenshot"
                        type="file"
                        className="sr-only"
                        accept="image/*"
                        onChange={handleScreenshotChange}
                      />
                    </label>
                    <p className="pl-1">or drag and drop</p>
                  </div>
                  <p className="text-xs text-gray-500">PNG, JPG, GIF up to 5MB</p>
                </div>
              </div>
              {screenshot && (
                <p className="mt-2 text-sm text-green-600">
                  Selected: {screenshot.name}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              onClick={submitUTR}
              disabled={submitting || !utrNumber || utrNumber.length < 12}
              className="w-full btn-primary"
            >
              {submitting ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Submitting...</span>
                </>
              ) : (
                'Submit UTR Number'
              )}
            </button>
          </div>
        </div>

        {/* Payment Information */}
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <Currency className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Payment Information</h2>
          </div>

          <div className="space-y-4">
            {/* Amount */}
            <div className="text-center bg-green-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-green-600 mb-1">Payment Amount</p>
              <p className="text-3xl font-bold text-green-900">
                ₹{payment.amount.toLocaleString()}
              </p>
            </div>

            {/* Payment Details */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Payment Mode</span>
                <span className="text-sm font-medium text-gray-900">{payment.payment_mode}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Payment Type</span>
                <span className="text-sm font-medium text-gray-900">{payment.payment_type}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Bank</span>
                <span className="text-sm font-medium text-gray-900">{payment.bank}</span>
              </div>
              
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">Due Date</span>
                <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                  {new Date(payment.due_date).toLocaleDateString()}
                  {isOverdue && ' (Overdue)'}
                </span>
              </div>
            </div>

            {/* Procurement Info */}
            {payment.procurement_dump && (
              <div className="pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-3">Related Procurement</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Indent Number</span>
                    <span className="font-medium text-gray-900">
                      {payment.procurement_dump.indent_number}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Firm Name</span>
                    <span className="text-gray-900">{payment.procurement_dump.firm_name}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <CheckCircle className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">UTR Submission Guidelines</h2>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <ul className="list-disc list-inside space-y-2 text-sm text-blue-900">
            <li>UTR number is a 12-22 digit unique reference number provided by your bank</li>
            <li>Check your bank statement, payment receipt, or mobile banking app for UTR</li>
            <li>Ensure the UTR corresponds to the exact payment amount mentioned above</li>
            <li>Screenshot upload is optional but recommended for faster verification</li>
            <li>Once submitted, UTR cannot be modified. Please verify before submission</li>
            <li>After successful submission, payment status will be updated to "Verified"</li>
          </ul>
        </div>
      </div>

      {/* Sample UTR Formats */}
      <div className="card p-6">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Sample UTR Formats</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="font-medium text-gray-900 mb-1">SBI</p>
            <p className="text-gray-600">123456789012</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="font-medium text-gray-900 mb-1">HDFC</p>
            <p className="text-gray-600">H123456789012345</p>
          </div>
          <div className="bg-gray-50 p-3 rounded-md">
            <p className="font-medium text-gray-900 mb-1">ICICI</p>
            <p className="text-gray-600">12345678901234</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UTRSubmission