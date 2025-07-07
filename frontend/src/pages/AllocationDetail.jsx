/**
 * Allocation Detail page - Flow 2
 * Shows allocation details and procurement calculator
 */

import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ClipboardList,
  Currency,
  Calculator,
  FileText,
  Building2,
  CalendarDays
} from 'lucide-react'
import toast from 'react-hot-toast'

const AllocationDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [allocation, setAllocation] = useState(null)
  const [procurement, setProcurement] = useState(null)
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [generatingCDU, setGeneratingCDU] = useState(false)

  // Fetch allocation details
  useEffect(() => {
    const fetchAllocation = async () => {
      try {
        const response = await api.get(`/allocations/${id}`)
        setAllocation(response.data.data.allocation)
      } catch (error) {
        console.error('Error fetching allocation:', error)
        toast.error('Failed to fetch allocation details')
      } finally {
        setLoading(false)
      }
    }

    fetchAllocation()
  }, [id])

  // Calculate procurement costs
  const calculateProcurement = async () => {
    try {
      setCalculating(true)
      const response = await api.post('/procurement/calculate', {
        indent_number: allocation.indent_number
      })
      setProcurement(response.data.data.procurement)
      toast.success('Procurement costs calculated successfully')
    } catch (error) {
      console.error('Error calculating procurement:', error)
      toast.error(error.response?.data?.message || 'Failed to calculate procurement costs')
    } finally {
      setCalculating(false)
    }
  }

  // Generate CDU draft
  const generateCDU = async () => {
    if (!procurement) {
      toast.error('Please calculate procurement costs first')
      return
    }

    try {
      setGeneratingCDU(true)
      const response = await api.post('/payment/cdu', {
        procurement_id: procurement.id
      })
      
      const paymentId = response.data.data.payment_id
      toast.success('CDU generated successfully')
      navigate(`/payment/${paymentId}`)
    } catch (error) {
      console.error('Error generating CDU:', error)
      toast.error(error.response?.data?.message || 'Failed to generate CDU')
    } finally {
      setGeneratingCDU(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!allocation) {
    return (
      <div className="text-center py-12">
        <h3 className="text-lg font-medium text-gray-900">Allocation not found</h3>
        <button
          onClick={() => navigate('/allocations')}
          className="mt-4 btn-primary"
        >
          Back to Allocations
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Allocation Details - {allocation.indent_number}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              View allocation information and calculate procurement costs
            </p>
          </div>
          <button
            onClick={() => navigate('/allocations')}
            className="btn-secondary"
          >
            Back to List
          </button>
        </div>
      </div>

      {/* Allocation Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basic Details */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <ClipboardList className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
          </div>
          
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Indent Number</label>
                <p className="text-lg font-medium text-gray-900">{allocation.indent_number}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Crop Year</label>
                <p className="text-lg text-gray-900">{allocation.crop_year}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Buyer Type</label>
                <p className="text-lg text-gray-900">{allocation.buyer_type}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Status</label>
                <span className={`status-badge status-${allocation.allocation_status}`}>
                  {allocation.allocation_status}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-500">Lifting Period</label>
              <p className="text-lg text-gray-900">{allocation.lifting_period}</p>
            </div>
          </div>
        </div>

        {/* Branch & Quantity Details */}
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <Building2 className="h-6 w-6 text-green-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Branch & Quantity</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-500">Branch</label>
              <p className="text-lg font-medium text-gray-900">
                {allocation.branch_information?.branch_name || allocation.branch_name}
              </p>
              <p className="text-sm text-gray-500">{allocation.zone} Zone</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Bale Quantity</label>
                <p className="text-xl font-bold text-blue-600">
                  {allocation.bale_quantity?.toLocaleString()} bales
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">OTR Price</label>
                <p className="text-xl font-bold text-green-600">
                  ₹{allocation.otr_price} per candy
                </p>
              </div>
            </div>

            {allocation.parsed_data && (
              <div className="pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block font-medium text-gray-500">Firm Name</label>
                    <p className="text-gray-900">{allocation.parsed_data.firm_name}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-500">Centre</label>
                    <p className="text-gray-900">{allocation.parsed_data.centre_name}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-500">Variety</label>
                    <p className="text-gray-900">{allocation.parsed_data.variety}</p>
                  </div>
                  <div>
                    <label className="block font-medium text-gray-500">Fibre Length</label>
                    <p className="text-gray-900">{allocation.parsed_data.fibre_length}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Procurement Calculator */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Calculator className="h-6 w-6 text-purple-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Procurement Cost Calculator</h2>
          </div>
          
          {!procurement && (
            <button
              onClick={calculateProcurement}
              disabled={calculating}
              className="btn-primary"
            >
              {calculating ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Calculating...</span>
                </>
              ) : (
                'Calculate Costs'
              )}
            </button>
          )}
        </div>

        {procurement ? (
          <div className="space-y-6">
            {/* Cost Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-blue-600">Cotton Value</p>
                <p className="text-2xl font-bold text-blue-900">
                  ₹{procurement.breakdown.cotton_value.toLocaleString()}
                </p>
              </div>
              
              <div className="bg-yellow-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-yellow-600">
                  EMD Amount ({procurement.breakdown.emd_percentage}%)
                </p>
                <p className="text-2xl font-bold text-yellow-900">
                  ₹{procurement.breakdown.emd_amount.toLocaleString()}
                </p>
              </div>
              
              <div className="bg-green-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-green-600">GST Amount</p>
                <p className="text-2xl font-bold text-green-900">
                  ₹{procurement.breakdown.gst_breakdown.total_gst.toLocaleString()}
                </p>
              </div>
              
              <div className="bg-purple-50 p-4 rounded-lg">
                <p className="text-sm font-medium text-purple-600">Total Amount</p>
                <p className="text-2xl font-bold text-purple-900">
                  ₹{procurement.breakdown.total_amount.toLocaleString()}
                </p>
              </div>
            </div>

            {/* GST Breakdown */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="text-sm font-medium text-gray-900 mb-3">GST Breakdown</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {procurement.breakdown.gst_breakdown.igst > 0 && (
                  <div>
                    <span className="text-gray-500">IGST (18%):</span>
                    <span className="ml-2 font-medium">₹{procurement.breakdown.gst_breakdown.igst.toLocaleString()}</span>
                  </div>
                )}
                {procurement.breakdown.gst_breakdown.cgst > 0 && (
                  <div>
                    <span className="text-gray-500">CGST (9%):</span>
                    <span className="ml-2 font-medium">₹{procurement.breakdown.gst_breakdown.cgst.toLocaleString()}</span>
                  </div>
                )}
                {procurement.breakdown.gst_breakdown.sgst > 0 && (
                  <div>
                    <span className="text-gray-500">SGST (9%):</span>
                    <span className="ml-2 font-medium">₹{procurement.breakdown.gst_breakdown.sgst.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4">
              <button
                onClick={calculateProcurement}
                disabled={calculating}
                className="btn-secondary"
              >
                {calculating ? 'Recalculating...' : 'Recalculate'}
              </button>
              
              <button
                onClick={generateCDU}
                disabled={generatingCDU}
                className="btn-primary"
              >
                {generatingCDU ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Generating...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4 mr-2" />
                    Generate CDU Draft
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Calculator className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <p className="text-lg">Click "Calculate Costs" to view procurement breakdown</p>
            <p className="text-sm">This will calculate EMD, GST, and total amounts</p>
          </div>
        )}
      </div>

      {/* Procurement History */}
      {allocation.procurement_dump && allocation.procurement_dump.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center mb-4">
            <CalendarDays className="h-6 w-6 text-orange-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Procurement History</h2>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Total Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    EMD Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Due Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {allocation.procurement_dump.map((proc) => (
                  <tr key={proc.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(proc.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      ₹{proc.total_amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₹{proc.emd_amount.toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {new Date(proc.due_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => navigate(`/procurement/${proc.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default AllocationDetail