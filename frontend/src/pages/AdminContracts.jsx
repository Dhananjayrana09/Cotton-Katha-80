/**
 * Admin Contracts page - Flow 3
 * Admin interface for reviewing and approving uploaded contracts
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  FileText,
  CheckCircle,
  Clock,
  Eye,
  Send,
  AlertTriangle,
  Filter
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../services/supabaseClient'
import Skeleton from 'react-loading-skeleton'
import 'react-loading-skeleton/dist/skeleton.css'
import { Tooltip } from 'react-tooltip'

const N8N_CONTRACT_APPROVE_SEND_WEBHOOK='https://primary-production-b52e.up.railway.app/webhook-test/contract-approve'; 

const AdminContracts = () => {
  const { user, isAdmin } = useAuth()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState({})
  const [filters, setFilters] = useState({
    status: 'pending'
  })

  // Fetch pending contracts
  const fetchContracts = async () => {
    try {
      setLoading(true)
      const response = await api.get('/contract/pending')
      setContracts(response.data.data.contracts)
    } catch (error) {
      console.error('Error fetching contracts:', error)
      toast.error('Failed to fetch contracts')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin()) {
      fetchContracts()
    } else {
      setLoading(false)
    }
  }, [isAdmin])

  // Real-time subscription for contract status
  useEffect(() => {
    if (!isAdmin()) return;
    const channel = supabase.channel('realtime:purchase_contract_table')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_contract_table' }, (payload) => {
        fetchContracts();
        if (payload.eventType === 'INSERT') {
          toast.success('New contract uploaded and pending review');
        } else if (payload.eventType === 'UPDATE') {
          if (payload.new.status === 'sent') {
            toast.success('Contract approved and sent to branch');
          } else if (payload.new.status === 'failed') {
            toast.error('Contract sending failed');
          } else {
            toast('Contract status updated');
          }
        } else if (payload.eventType === 'DELETE') {
          toast('Contract removed');
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  // Approve and send contract
  const approveAndSend = async (contractId) => {
    try {
      setApproving(prev => ({ ...prev, [contractId]: true }))
      const contract = contracts.find(c => c.id === contractId)
      // Prepare payload for n8n webhook
      const payload = {
        contract_id: contractId,
        indent_number: contract.indent_number,
        firm_name: contract.firm_name,
        file_url: contract.file_url,
        branch_name: contract.branch_name, // if available
        // Add more fields if needed by n8n
      }
      const response = await fetch(N8N_CONTRACT_APPROVE_SEND_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to approve contract')
      }
      toast.success('Contract approved and sent successfully!')
      setContracts(prev => prev.filter(c => c.id !== contractId))
    } catch (error) {
      console.error('Error approving contract:', error)
      toast.error(error.message || 'Failed to approve contract')
    } finally {
      setApproving(prev => ({ ...prev, [contractId]: false }))
    }
  }

  // View contract (open in new tab)
  const viewContract = (fileUrl) => {
    window.open(fileUrl, '_blank')
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
      <div className="space-y-6">
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Contract Administration</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review and approve uploaded purchase contracts
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} height={80} />
          ))}
        </div>
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <Skeleton height={48} count={6} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">Contract Administration</h1>
        <p className="mt-1 text-sm text-gray-600">
          Review and approve uploaded purchase contracts
        </p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Clock className="h-8 w-8 text-yellow-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending Review</p>
              <p className="text-lg font-semibold text-gray-900">{contracts.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <FileText className="h-8 w-8 text-blue-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Contracts</p>
              <p className="text-lg font-semibold text-gray-900">{contracts.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <CheckCircle className="h-8 w-8 text-green-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Approved Today</p>
              <p className="text-lg font-semibold text-gray-900">
                {contracts.filter(c => {
                  const today = new Date().toDateString()
                  return new Date(c.uploaded_at).toDateString() === today
                }).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center">
            <Send className="h-8 w-8 text-purple-500" />
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Avg Review Time</p>
              <p className="text-lg font-semibold text-gray-900">2.5h</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Filter className="h-5 w-5 text-gray-400 mr-2" />
            <h3 className="text-lg font-medium text-gray-900">Filters</h3>
          </div>
          <button
            onClick={fetchContracts}
            className="btn-secondary text-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Contracts Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="table-container">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contract Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Procurement Info
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Upload Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                  <span data-tip data-for="actionsTip" className="ml-1 cursor-pointer text-blue-500">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-8 4a1 1 0 100-2 1 1 0 000 2zm1-7V7a1 1 0 10-2 0v1a1 1 0 00.293.707l1 1A1 1 0 0110 11a1 1 0 01-1-1H8a2 2 0 104 0 2 2 0 01-2 2z" /></svg>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contracts.map((contract) => (
                <tr key={contract.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {contract.indent_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {contract.firm_name}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        File: {contract.file_name}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      View in procurement section
                    </div>
                    <div className="text-sm text-gray-500">
                      Related to {contract.indent_number}
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">
                        {contract.uploaded_user?.first_name} {contract.uploaded_user?.last_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(contract.uploaded_at).toLocaleDateString()}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(contract.uploaded_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="status-badge status-pending">
                      <Clock className="h-3 w-3 mr-1" />
                      {contract.status}
                    </span>
                  </td>

                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-y-2">
                    <div className="flex space-x-2">
                      <button
                        onClick={() => viewContract(contract.file_url)}
                        className="inline-flex items-center text-blue-600 hover:text-blue-900"
                        data-tip data-for="viewTip"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View PDF
                      </button>
                      <Tooltip id="viewTip" place="top" effect="solid">
                        View the uploaded contract PDF in a new tab.
                      </Tooltip>
                    </div>
                    
                    <div>
                      <button
                        onClick={() => approveAndSend(contract.id)}
                        disabled={approving[contract.id]}
                        className="inline-flex items-center btn-primary text-sm"
                        data-tip data-for="approveTip"
                      >
                        {approving[contract.id] ? (
                          <>
                            <Skeleton width={16} height={16} circle={true} inline={true} />
                            <span className="ml-2">Processing...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4 mr-1" />
                            Approve & Send
                          </>
                        )}
                      </button>
                      <Tooltip id="approveTip" place="top" effect="solid">
                        Approve the contract and send it to the branch email.
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {contracts.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No pending contracts</h3>
            <p className="mt-1 text-sm text-gray-500">
              All contracts have been reviewed and processed.
            </p>
          </div>
        )}
      </div>

      {/* Review Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-blue-900">Contract Review Guidelines</h3>
            <ul className="mt-2 text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>Verify that the indent number matches the procurement record</li>
              <li>Ensure the firm name is correct and matches procurement details</li>
              <li>Check that the contract is properly signed and dated</li>
              <li>Verify all terms and conditions are clearly mentioned</li>
              <li>Ensure the PDF is clear and readable</li>
              <li>Once approved, the contract will be automatically sent to the branch email</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Approval Process */}
      <div className="card p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Approval Process</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="bg-blue-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-blue-600 font-bold">1</span>
            </div>
            <h4 className="font-medium text-gray-900">Review</h4>
            <p className="text-sm text-gray-500">Check contract details and PDF quality</p>
          </div>

          <div className="text-center">
            <div className="bg-yellow-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-yellow-600 font-bold">2</span>
            </div>
            <h4 className="font-medium text-gray-900">Validate</h4>
            <p className="text-sm text-gray-500">Verify against procurement data</p>
          </div>

          <div className="text-center">
            <div className="bg-green-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-green-600 font-bold">3</span>
            </div>
            <h4 className="font-medium text-gray-900">Approve</h4>
            <p className="text-sm text-gray-500">Click approve & send button</p>
          </div>

          <div className="text-center">
            <div className="bg-purple-100 rounded-full p-3 w-12 h-12 flex items-center justify-center mx-auto mb-2">
              <span className="text-purple-600 font-bold">4</span>
            </div>
            <h4 className="font-medium text-gray-900">Send</h4>
            <p className="text-sm text-gray-500">Automatically emailed to branch</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AdminContracts