/**
 * Sampling Entry page - Flow 4
 * Interface for entering lot numbers based on indent details
 */

import React, { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Search,
  Beaker,
  Plus,
  Minus,
  CheckCircle,
  AlertTriangle,
  ClipboardList
} from 'lucide-react'
import toast from 'react-hot-toast'
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'
import { Tooltip } from 'react-tooltip'

const SamplingEntry = () => {
  const { user } = useAuth()
  
  const [indentNumber, setIndentNumber] = useState('')
  const [indentDetails, setIndentDetails] = useState(null)
  const [loading, setLoading] = useState(false)
  const [lots, setLots] = useState([])
  const [verificationLots, setVerificationLots] = useState([])
  const [step, setStep] = useState(1) // 1: Search, 2: Entry, 3: Verification, 4: Complete
  const [submitting, setSubmitting] = useState(false)
  const [verificationErrors, setVerificationErrors] = useState([])
  const [entryErrors, setEntryErrors] = useState([])

  // Fetch indent details
  const fetchIndentDetails = async () => {
    if (!indentNumber.trim()) {
      toast.error('Please enter an indent number')
      return
    }

    try {
      setLoading(true)
      const response = await api.get('/sampling/fetch-indent', {
        params: { indent_number: indentNumber.trim() }
      })
      
      setIndentDetails(response.data.data)
      
      // Initialize lots array based on calculated total
      const calculatedLots = response.data.data.calculated_lots
      const initialLots = Array(calculatedLots.total_lots).fill('')
      setLots(initialLots)
      
      setStep(2)
      toast.success('Indent details found')
    } catch (error) {
      console.error('Error fetching indent:', error)
      toast.error(error.response?.data?.message || 'Indent not found')
    } finally {
      setLoading(false)
    }
  }

  // Calculate lot requirements
  const calculateLots = (balesQuantity) => {
    const base = Math.floor(balesQuantity / 100)
    const extra = Math.floor(base * 0.2)
    const total = base + (extra < 1 ? 0 : extra)
    return { base, extra, total }
  }

  // Add lot field
  const addLotField = () => {
    setLots(prev => [...prev, ''])
  }

  // Remove lot field
  const removeLotField = (index) => {
    if (lots.length > 1) {
      setLots(prev => prev.filter((_, i) => i !== index))
    }
  }

  // Update lot value
  const updateLot = (index, value) => {
    setLots(prev => {
      const newLots = [...prev]
      newLots[index] = value.toUpperCase()
      return newLots
    })
    // Clear error for this field on change
    setEntryErrors(prev => {
      const newErrors = [...prev]
      newErrors[index] = ''
      return newErrors
    })
  }

  // Proceed to verification
  const proceedToVerification = () => {
    const filledLots = lots.map(lot => lot.trim())
    const errors = filledLots.map((lot, idx, arr) => {
      if (!lot) return 'Lot number required'
      if (arr.indexOf(lot) !== idx) return 'Duplicate lot number'
      return ''
    })
    setEntryErrors(errors)
    if (errors.some(e => e)) {
      toast.error('Please fix the errors before proceeding')
      return
    }
    setVerificationLots(Array(filledLots.length).fill(''))
    setStep(3)
  }

  // Update verification lot
  const updateVerificationLot = (index, value) => {
    setVerificationLots(prev => {
      const newLots = [...prev]
      newLots[index] = value.toUpperCase()
      return newLots
    })
  }

  // Verify and submit
  const verifyAndSubmit = async () => {
    const originalLots = lots.filter(lot => lot.trim() !== '')
    const verificationLotsFiltered = verificationLots.filter(lot => lot.trim() !== '')

    // Check if all verification lots are filled
    if (verificationLotsFiltered.length !== originalLots.length) {
      toast.error('Please re-enter all lot numbers for verification')
      setVerificationErrors(Array(originalLots.length).fill('Please re-enter this lot number'))
      return
    }

    // Check if they match (field by field)
    const errors = originalLots.map((lot, idx) => lot !== verificationLotsFiltered[idx] ? 'Lot numbers do not match' : '')
    setVerificationErrors(errors)
    const hasMismatch = errors.some(e => e)
    if (hasMismatch) {
      toast.error('Lot numbers do not match. Please check and try again.')
      return
    }

    try {
      setSubmitting(true)
      await api.post('/sampling/save', {
        indent_number: indentNumber,
        lots: originalLots
      })
      setStep(4)
      toast.success('Sampling entries saved successfully!')
    } catch (error) {
      console.error('Error saving sampling:', error)
      toast.error(error.response?.data?.message || 'Failed to save sampling entries')
    } finally {
      setSubmitting(false)
    }
  }

  // Reset form
  const resetForm = () => {
    setIndentNumber('')
    setIndentDetails(null)
    setLots([])
    setVerificationLots([])
    setStep(1)
  }

  if (step === 4) {
    return (
      <div className="space-y-6">
        <div className="card p-8 text-center">
          <CheckCircle className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sampling Entry Completed!</h1>
          <p className="text-gray-600 mb-6">
            Successfully saved {lots.filter(lot => lot.trim() !== '').length} lot numbers for indent {indentNumber}
          </p>

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="text-left space-y-2">
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Indent Number:</span>
                <span className="text-green-800">{indentNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Total Lots Entered:</span>
                <span className="text-green-800">{lots.filter(lot => lot.trim() !== '').length}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-medium text-green-900">Added By:</span>
                <span className="text-green-800">{user?.first_name} {user?.last_name}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-center space-x-4">
            <button
              onClick={resetForm}
              className="btn-secondary"
            >
              Enter Another Indent
            </button>
            <button
              onClick={() => window.location.href = '/sales-processing'}
              className="btn-primary"
            >
              Proceed to Sales
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Sampling Entry</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter lot numbers for inventory management after procurement completion
        </p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          {[
            { number: 1, title: 'Search Indent', active: step === 1, completed: step > 1 },
            { number: 2, title: 'Enter Lots', active: step === 2, completed: step > 2 },
            { number: 3, title: 'Verification', active: step === 3, completed: step > 3 },
            { number: 4, title: 'Complete', active: step === 4, completed: false }
          ].map((stepItem, index) => (
            <div key={stepItem.number} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                stepItem.completed ? 'bg-green-500 text-white' :
                stepItem.active ? 'bg-blue-500 text-white' :
                'bg-gray-300 text-gray-600'
              }`}>
                {stepItem.completed ? <CheckCircle className="h-5 w-5" /> : stepItem.number}
              </div>
              <span className={`ml-2 text-sm font-medium ${
                stepItem.active ? 'text-blue-600' : 'text-gray-500'
              }`}>
                {stepItem.title}
              </span>
              {index < 3 && <div className="w-12 h-0.5 bg-gray-300 mx-4" />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Search Indent */}
      {step === 1 && (
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <Search className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Search Indent Details</h2>
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor="indent" className="block text-sm font-medium text-gray-700 mb-2">
                Indent Number *
              </label>
              <div className="flex space-x-4">
                <input
                  type="text"
                  id="indent"
                  value={indentNumber}
                  onChange={(e) => setIndentNumber(e.target.value.toUpperCase())}
                  placeholder="Enter indent number (e.g., IND001)"
                  className="flex-1 input-field"
                  disabled={loading}
                />
                <button
                  onClick={fetchIndentDetails}
                  disabled={loading || !indentNumber.trim()}
                  className="btn-primary"
                >
                  {loading ? (
                    <>
                      <LoadingSpinner size="sm" />
                      <span className="ml-2">Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Enter Lots */}
      {step === 2 && indentDetails && (
        <div className="space-y-6">
          {/* Indent Information */}
          <div className="card p-6">
            <div className="flex items-center mb-4">
              <ClipboardList className="h-6 w-6 text-green-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Indent Details</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-500">Indent Number:</span>
                <p className="text-gray-900 font-medium">{indentDetails.indent_details.indent_number}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Bales Quantity:</span>
                <p className="text-gray-900">{indentDetails.indent_details.bales_quantity?.toLocaleString()}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Centre:</span>
                <p className="text-gray-900">{indentDetails.indent_details.centre_name}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Branch:</span>
                <p className="text-gray-900">{indentDetails.indent_details.branch}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Variety:</span>
                <p className="text-gray-900">{indentDetails.indent_details.variety}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Fibre Length:</span>
                <p className="text-gray-900">{indentDetails.indent_details.fibre_length}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Bid Price:</span>
                <p className="text-gray-900">₹{indentDetails.indent_details.bid_price}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500">Lifting Period:</span>
                <p className="text-gray-900">{indentDetails.indent_details.lifting_period}</p>
              </div>
            </div>
          </div>

          {/* Lot Calculation */}
          <div className="card p-6">
            <div className="flex items-center mb-4">
              <Beaker className="h-6 w-6 text-purple-500 mr-2" />
              <h2 className="text-lg font-semibold text-gray-900">Calculated Lot Requirements</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-blue-600">Base Lots</p>
                <p className="text-2xl font-bold text-blue-900">{indentDetails.calculated_lots.base_lots}</p>
                <p className="text-xs text-blue-700">({indentDetails.indent_details.bales_quantity} ÷ 100)</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-green-600">Extra Lots (20%)</p>
                <p className="text-2xl font-bold text-green-900">{indentDetails.calculated_lots.extra_lots}</p>
                <p className="text-xs text-green-700">(20% of base lots)</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg text-center">
                <p className="text-sm font-medium text-purple-600">Total Required</p>
                <p className="text-2xl font-bold text-purple-900">{indentDetails.calculated_lots.total_lots}</p>
                <p className="text-xs text-purple-700">(Base + Extra)</p>
              </div>
            </div>

            {indentDetails.sampling_completed && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2" />
                  <p className="text-yellow-800 font-medium">
                    Sampling already completed for this indent with {indentDetails.existing_lots.length} lots.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Lot Entry */}
          {!indentDetails.sampling_completed && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Enter Lot Numbers</h2>
                <div className="flex space-x-2">
                  <button
                    onClick={addLotField}
                    className="btn-secondary text-sm"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add Lot
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                {lots.map((lot, idx) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center gap-2">
                    <input
                      type="text"
                      value={lot}
                      onChange={e => updateLot(idx, e.target.value)}
                      placeholder={`Lot #${idx + 1}`}
                      className={`input-field w-40 ${entryErrors[idx] ? 'border-red-500' : ''}`}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      onClick={() => removeLotField(idx)}
                      className="btn-secondary px-2 py-1"
                      disabled={lots.length === 1}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    {entryErrors[idx] && (
                      <span className="text-xs text-red-600 mt-1 md:ml-2">{entryErrors[idx]}</span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={addLotField}
                  className="btn-secondary"
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Field
                </button>
                <button
                  onClick={proceedToVerification}
                  className="btn-primary"
                >
                  Next: Verify Lots
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3: Verification */}
      {step === 3 && (
        <div className="card p-6">
          <div className="flex items-center mb-6">
            <CheckCircle className="h-6 w-6 text-yellow-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Verify Lot Numbers</h2>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <p className="text-yellow-800 text-sm">
              Please re-enter all lot numbers to verify accuracy. The first entry is masked for security.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Original (Masked) */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Original Entry (Masked)</h3>
              <div className="space-y-2">
                {lots.filter(lot => lot.trim() !== '').map((lot, index) => (
                  <div key={index} className="p-2 bg-gray-100 rounded text-sm text-gray-600">
                    Lot {index + 1}: {'*'.repeat(lot.length)}
                  </div>
                ))}
              </div>
            </div>

            {/* Verification Entry */}
            <div>
              <h3 className="font-medium text-gray-900 mb-3">Re-enter for Verification</h3>
              <div className="space-y-2">
                {lots.filter(lot => lot.trim() !== '').map((lot, index) => (
                  <div key={index} className="flex flex-col">
                    <label className="text-xs text-gray-500 mb-1">Lot #{index + 1}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="password"
                        value={lot}
                        disabled
                        className="input-field w-32 bg-gray-100 text-gray-400"
                        style={{ WebkitTextSecurity: 'disc' }}
                      />
                      <span className="mx-2">→</span>
                      <input
                        type="text"
                        value={verificationLots[index] || ''}
                        onChange={(e) => updateVerificationLot(index, e.target.value)}
                        className={`input-field w-32 ${verificationErrors[index] ? 'border-red-500' : ''}`}
                        autoComplete="off"
                      />
                    </div>
                    {verificationErrors[index] && (
                      <span className="text-xs text-red-600 mt-1">{verificationErrors[index]}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center mt-6">
            <button
              onClick={() => setStep(2)}
              className="btn-secondary"
            >
              Back to Entry
            </button>
            <button
              onClick={verifyAndSubmit}
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? <LoadingSpinner size="sm" /> : 'Submit'}
            </button>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <Beaker className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Sampling Guidelines</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-medium text-gray-900 mb-2">Lot Number Format</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Use consistent naming convention</li>
              <li>• Suggested format: LOT001, LOT002, etc.</li>
              <li>• Ensure uniqueness across all lots</li>
              <li>• Use alphanumeric characters only</li>
              <li>• Maximum 10 characters per lot number</li>
            </ul>
          </div>

          <div>
            <h3 className="font-medium text-gray-900 mb-2">Process Notes</h3>
            <ul className="text-sm text-gray-700 space-y-1">
              <li>• Base lots = Total bales ÷ 100</li>
              <li>• Extra lots = 20% of base lots (minimum buffer)</li>
              <li>• You can add more lots than recommended</li>
              <li>• Verification step prevents data entry errors</li>
              <li>• Once saved, lots become available for sales</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SamplingEntry