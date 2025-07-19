/**
 * Contract Search page - Flow 3
 * Search procurement by indent number for contract upload
 */

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  Search,
  FileText,
  ClipboardList,
  ArrowRight,
  AlertTriangle,
  Filter,
  CheckCircle,
  Clock,
  Eye
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Tooltip } from 'react-tooltip';

const schema = yup.object().shape({
  indentNumber: yup.string().required('Indent number is required').matches(/^\w+$/, 'Invalid indent number format'),
});

const ContractSearch = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  const [procurement, setProcurement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [indentStatus, setIndentStatus] = useState([])
  const [loadingIndentStatus, setLoadingIndentStatus] = useState(false)
  const [showIndentStatus, setShowIndentStatus] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'pending', 'uploaded'
  const [searchTerm, setSearchTerm] = useState('')

  const { register, handleSubmit, formState: { errors }, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { indentNumber: '' }
  });

  // Search for procurement by indent number
  const searchProcurement = async (data) => {
    const indentNumber = data.indentNumber.trim();
    try {
      setLoading(true)
      setProcurement(null)
      setSearched(false)
      const response = await api.get('/contract/search', {
        params: { indent_number: indentNumber }
      })
      setProcurement(response.data.data.procurement)
      setSearched(true)
      if (response.data.data.procurement) {
        toast.success('Procurement details found')
      }
    } catch (error) {
      console.error('Error searching procurement:', error)
      setSearched(true)
      if (error.response?.status === 404) {
        toast.error('No procurement found for this indent number')
      } else {
        toast.error(error.response?.data?.message || 'Failed to search procurement')
      }
    } finally {
      setLoading(false)
    }
  }

  // Fetch indent status
  const fetchIndentStatus = async () => {
    try {
      setLoadingIndentStatus(true)
      const response = await api.get('/contract/indent-status')
      setIndentStatus(response.data.data.indent_status)
    } catch (error) {
      console.error('Error fetching indent status:', error)
      toast.error('Failed to fetch indent status')
    } finally {
      setLoadingIndentStatus(false)
    }
  }

  // Load indent status on component mount
  useEffect(() => {
    fetchIndentStatus()
  }, [])

  // Navigate to contract upload
  const proceedToUpload = () => {
    navigate('/contract/upload', {
      state: {
        procurement,
        indentNumber: procurement.indent_number
      }
    })
  }

  // Navigate to contract upload for specific indent
  const uploadForIndent = (indentNumber) => {
    const indent = indentStatus.find(item => item.indent_number === indentNumber)
    if (indent) {
      navigate('/contract/upload', {
        state: {
          procurement: {
            indent_number: indent.indent_number,
            firm_name: indent.firm_name,
            bale_quantity: indent.bale_quantity,
            total_amount: indent.total_amount,
            allocation: {
              branch_information: {
                branch_name: indent.branch_name,
                branch_code: indent.branch_code
              }
            }
          },
          indentNumber: indent.indent_number
        }
      })
    }
  }

  // Filter indent status based on contract status and search term
  const filteredIndentStatus = indentStatus.filter(item => {
    // Filter by status
    if (filterStatus === 'all') {
      // No status filter
    } else if (filterStatus === 'pending') {
      if (item.contract_status !== 'pending') return false
    } else if (filterStatus === 'uploaded') {
      if (item.contract_status === 'pending') return false
    }

    // Filter by search term
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      return (
        item.indent_number.toLowerCase().includes(searchLower) ||
        item.firm_name.toLowerCase().includes(searchLower) ||
        (item.branch_name && item.branch_name.toLowerCase().includes(searchLower))
      )
    }

    return true
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Contract Upload</h1>
        <p className="mt-1 text-sm text-gray-600">
          Search for procurement details and upload purchase contract
        </p>
      </div>

      {/* Search Form */}
      <div className="card p-6">
        <div className="flex items-center mb-6">
          <Search className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Search Procurement</h2>
        </div>

        <form onSubmit={handleSubmit(searchProcurement)} className="space-y-4">
          <div>
            <label htmlFor="indent" className="block text-sm font-medium text-gray-700 mb-2">
              Indent Number *
              <span data-tip data-for="indentTip" className="ml-1 cursor-pointer text-blue-500">
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-8 4a1 1 0 100-2 1 1 0 000 2zm1-7V7a1 1 0 10-2 0v1a1 1 0 00.293.707l1 1A1 1 0 0110 11a1 1 0 01-1-1H8a2 2 0 104 0 2 2 0 01-2 2z" /></svg>
              </span>
              <Tooltip id="indentTip" place="top" effect="solid">
                Enter the exact indent number as provided in your procurement confirmation (e.g., IND001)
              </Tooltip>
            </label>
            <div className="flex space-x-4">
              <input
                type="text"
                id="indent"
                {...register('indentNumber')}
                placeholder="Enter indent number (e.g., IND001)"
                className={`flex-1 input-field ${errors.indentNumber ? 'border-red-500' : ''}`}
                disabled={loading}
                onChange={e => setValue('indentNumber', e.target.value.toUpperCase())}
              />
              <button
                type="submit"
                disabled={loading}
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
            {errors.indentNumber && (
              <p className="mt-1 text-xs text-red-600">{errors.indentNumber.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              Enter the exact indent number from your procurement confirmation
            </p>
          </div>
        </form>
      </div>

      {/* Indent Status Overview */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Filter className="h-6 w-6 text-blue-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Indent Contract Status</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchIndentStatus}
              disabled={loadingIndentStatus}
              className="btn-secondary"
            >
              {loadingIndentStatus ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Refreshing...</span>
                </>
              ) : (
                <>
                  <Filter className="h-4 w-4 mr-2" />
                  Refresh
                </>
              )}
            </button>
            <button
              onClick={() => setShowIndentStatus(!showIndentStatus)}
              className="btn-secondary"
            >
              {showIndentStatus ? 'Hide' : 'Show'} Indent Status
            </button>
          </div>
        </div>

        {showIndentStatus && (
          <>
            {/* Statistics */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <ClipboardList className="h-6 w-6 text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">Total Indents</p>
                    <p className="text-lg font-semibold text-blue-900">{indentStatus.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-yellow-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <Clock className="h-6 w-6 text-yellow-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-yellow-700">Pending Contracts</p>
                    <p className="text-lg font-semibold text-yellow-900">
                      {indentStatus.filter(item => item.contract_status === 'pending').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <CheckCircle className="h-6 w-6 text-green-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-green-700">Uploaded Contracts</p>
                    <p className="text-lg font-semibold text-green-900">
                      {indentStatus.filter(item => item.contract_status !== 'pending').length}
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <div className="flex items-center">
                  <FileText className="h-6 w-6 text-purple-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-purple-700">Approved & Sent</p>
                    <p className="text-lg font-semibold text-purple-900">
                      {indentStatus.filter(item => item.contract_status === 'sent').length}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter Controls */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 sm:space-x-4 mb-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Filter by status:</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="input-field max-w-xs"
                >
                  <option value="all">All Indents</option>
                  <option value="pending">Pending Contracts</option>
                  <option value="uploaded">Uploaded Contracts</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Search:</label>
                <input
                  type="text"
                  placeholder="Search by indent number, firm name, or branch..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="input-field max-w-xs"
                />
              </div>
            </div>

            {/* Results Summary */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Showing <span className="font-medium">{filteredIndentStatus.length}</span> of <span className="font-medium">{indentStatus.length}</span> indents
                {searchTerm && (
                  <span> matching "<span className="font-medium">{searchTerm}</span>"</span>
                )}
                {filterStatus !== 'all' && (
                  <span> with {filterStatus} contracts</span>
                )}
              </p>
            </div>

            {/* Indent Status Table */}
            {loadingIndentStatus ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} height={60} />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Indent Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Firm Name
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Branch
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contract Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredIndentStatus.map((indent) => (
                      <tr key={indent.indent_number} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {indent.indent_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {indent.bale_quantity?.toLocaleString()} bales
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{indent.firm_name}</div>
                          <div className="text-sm text-gray-500">
                            ₹{indent.total_amount?.toLocaleString()}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{indent.branch_name}</div>
                          <div className="text-sm text-gray-500">{indent.branch_code}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {indent.contract_status === 'pending' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              <Clock className="h-3 w-3 mr-1" />
                              Pending
                            </span>
                          ) : indent.contract_status === 'sent' ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Sent
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              <FileText className="h-3 w-3 mr-1" />
                              Uploaded
                            </span>
                          )}
                          {indent.contract_uploaded_at && (
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(indent.contract_uploaded_at).toLocaleDateString()}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          {indent.contract_status === 'pending' ? (
                            <button
                              onClick={() => uploadForIndent(indent.indent_number)}
                              className="text-blue-600 hover:text-blue-900 btn-secondary"
                            >
                              <FileText className="h-4 w-4 mr-1" />
                              Upload Contract
                            </button>
                          ) : (
                            <div className="flex items-center space-x-2">
                              <span className="text-green-600 text-sm">Contract uploaded</span>
                              {indent.contract_file_name && (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredIndentStatus.length === 0 && (
                  <div className="text-center py-8">
                    <AlertTriangle className="mx-auto h-8 w-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">No indents found with the selected filter.</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Search Results */}
      {loading && (
        <div className="card p-6">
          <Skeleton height={32} count={6} />
        </div>
      )}
      {searched && !loading && (
        <div className="card p-6">
          {procurement ? (
            <>
              {/* Procurement Found */}
              <div className="flex items-center mb-6">
                <ClipboardList className="h-6 w-6 text-green-500 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900">Procurement Details Found</h2>
              </div>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center">
                  <ClipboardList className="h-5 w-5 text-green-500 mr-2" />
                  <p className="text-green-800 font-medium">
                    Procurement record found for indent {procurement.indent_number}
                  </p>
                </div>
              </div>

              {/* Procurement Information */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-900 border-b pb-2">
                    Basic Information
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Indent Number</label>
                      <p className="text-lg font-medium text-gray-900">{procurement.indent_number}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Firm Name</label>
                      <p className="text-lg text-gray-900">{procurement.firm_name}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Bale Quantity</label>
                      <p className="text-lg text-gray-900">{procurement.bale_quantity?.toLocaleString()} bales</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Zone</label>
                      <p className="text-lg text-gray-900">{procurement.zone}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Transaction Type</label>
                    <p className="text-lg text-gray-900">{procurement.transaction_type}</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-md font-medium text-gray-900 border-b pb-2">
                    Financial Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Cotton Value</label>
                      <p className="text-lg text-gray-900">₹{procurement.cotton_value?.toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">EMD Amount</label>
                      <p className="text-lg text-gray-900">₹{procurement.emd_amount?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500">GST Amount</label>
                      <p className="text-lg text-gray-900">₹{procurement.gst_amount?.toLocaleString()}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-500">Total Amount</label>
                      <p className="text-xl font-bold text-green-600">₹{procurement.total_amount?.toLocaleString()}</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-500">Due Date</label>
                    <p className="text-lg text-gray-900">{new Date(procurement.due_date).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>

              {/* Branch Information */}
              {procurement.allocation?.branch_information && (
                <div className="bg-gray-50 p-4 rounded-lg mb-6">
                  <h3 className="text-md font-medium text-gray-900 mb-3">Branch Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-500">Branch Name:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_name}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Branch Code:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_code}</p>
                    </div>
                    <div>
                      <span className="font-medium text-gray-500">Email:</span>
                      <p className="text-gray-900">{procurement.allocation.branch_information.branch_email_id}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div className="flex justify-end">
                <button
                  onClick={proceedToUpload}
                  className="btn-primary"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Proceed to Upload Contract
                  <ArrowRight className="h-4 w-4 ml-2" />
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-red-500 mr-2" />
              <span className="text-red-700 font-medium">No procurement found for this indent number.</span>
            </div>
          )}
        </div>
      )}

      {/* Instructions */}
      <div className="card p-6">
        <div className="flex items-center mb-4">
          <FileText className="h-6 w-6 text-purple-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Contract Upload Process</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h3 className="font-medium text-gray-900">Search</h3>
            <p className="text-sm text-gray-500">Enter indent number to find procurement details</p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-green-600 font-bold">2</span>
            </div>
            <h3 className="font-medium text-gray-900">Upload</h3>
            <p className="text-sm text-gray-500">Upload PDF contract file with proper naming</p>
          </div>

          <div className="text-center">
            <div className="bg-yellow-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-yellow-600 font-bold">3</span>
            </div>
            <h3 className="font-medium text-gray-900">Review</h3>
            <p className="text-sm text-gray-500">Admin reviews and approves the contract</p>
          </div>

          <div className="text-center">
            <div className="bg-purple-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-purple-600 font-bold">4</span>
            </div>
            <h3 className="font-medium text-gray-900">Send</h3>
            <p className="text-sm text-gray-500">Contract is emailed to relevant branch</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ContractSearch