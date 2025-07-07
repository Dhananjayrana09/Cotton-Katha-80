/**
 * Sales Processing page - Flow 5 & 6
 * Handle sales order processing, lot allocation, and confirmations
 */

import React, { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ShoppingCart,
  Box,
  Users,
  CheckCircle,
  AlertTriangle,
  FileText,
  Clock
} from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '../services/supabaseClient'

const SalesProcessing = () => {
  const { user } = useAuth()
  
  const [pendingOrders, setPendingOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [availableLots, setAvailableLots] = useState([])
  const [autoSelectedLots, setAutoSelectedLots] = useState([])
  const [manualSelection, setManualSelection] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingSales, setProcessingSales] = useState(false)
  const [mode, setMode] = useState('list') // 'list', 'processing', 'selection', 'confirm'

  // New Order state
  const [showNewOrderForm, setShowNewOrderForm] = useState(false)
  const [newOrder, setNewOrder] = useState({
    customer_id: '',
    broker_id: '',
    requested_quantity: '',
    lifting_period: '',
    priority_branch: '',
    line_items: [{ indent_number: '', quantity: '', commission_rate: '' }]
  })
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Fetch options for customer and broker dropdowns (optional, can be improved)
  const [customerOptions, setCustomerOptions] = useState([])
  const [brokerOptions, setBrokerOptions] = useState([])
  useEffect(() => {
    // Fetch customers
    api.get('/customer-info')
      .then(res => setCustomerOptions(res.data.data.customers || []))
      .catch(() => setCustomerOptions([]))
    // Fetch brokers
    api.get('/broker-info')
      .then(res => setBrokerOptions(res.data.data.brokers || []))
      .catch(() => setBrokerOptions([]))
  }, [])

  // Handle new order form changes
  const handleNewOrderChange = (field, value) => {
    setNewOrder(prev => ({ ...prev, [field]: value }))
  }
  const handleLineItemChange = (idx, field, value) => {
    setNewOrder(prev => {
      const items = [...prev.line_items]
      items[idx][field] = value
      return { ...prev, line_items: items }
    })
  }
  const addLineItem = () => {
    setNewOrder(prev => ({ ...prev, line_items: [...prev.line_items, { indent_number: '', quantity: '', commission_rate: '' }] }))
  }
  const removeLineItem = (idx) => {
    setNewOrder(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) }))
  }

  // Submit new order
  const submitNewOrder = async (e) => {
    e.preventDefault()
    setCreatingOrder(true)
    try {
      // Validate fields (basic)
      if (!newOrder.customer_id || !newOrder.broker_id || !newOrder.requested_quantity || !newOrder.lifting_period || newOrder.line_items.length === 0) {
        toast.error('Please fill all required fields and add at least one line item')
        setCreatingOrder(false)
        return
      }
      // POST to backend
      await api.post('/sales/new', {
        ...newOrder,
        requested_quantity: Number(newOrder.requested_quantity),
        line_items: newOrder.line_items.map(item => ({
          ...item,
          quantity: Number(item.quantity),
          commission_rate: Number(item.commission_rate)
        }))
      })
      toast.success('Sales order created!')
      setShowNewOrderForm(false)
      setNewOrder({
        customer_id: '', broker_id: '', requested_quantity: '', lifting_period: '', priority_branch: '',
        line_items: [{ indent_number: '', quantity: '', commission_rate: '' }]
      })
      fetchPendingOrders()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create order')
    } finally {
      setCreatingOrder(false)
    }
  }

  // Fetch pending sales orders
  const fetchPendingOrders = async () => {
    try {
      setLoading(true)
      const response = await api.get('/sales/pending-orders')
      setPendingOrders(response.data.data.orders)
    } catch (error) {
      console.error('Error fetching pending orders:', error)
      // Only show toast for non-401 errors, as 401 is handled by global interceptor
      if (error.response?.status !== 401) {
        toast.error('Failed to fetch pending orders')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingOrders()

    // Real-time subscription for sales_configuration changes
    const subscription = supabase
      .channel('public:sales_configuration')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sales_configuration' },
        (payload) => {
          // Only refresh if status is not 'completed' (pending/processing)
          fetchPendingOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  // Select order for processing
  const selectOrder = async (order) => {
    try {
      setSelectedOrder(order)
      setMode('processing')
      
      // Auto-select lots
      const response = await api.post('/sales/auto-select-lots', {
        sales_config_id: order.id,
        requested_qty: order.requested_quantity
      })
      
      if (response.data.data.out_of_stock) {
        toast.error('No available lots found matching the criteria')
        setMode('list')
        return
      }
      
      setAvailableLots(response.data.data.available_lots)
      setAutoSelectedLots(response.data.data.auto_selected)
      setManualSelection(response.data.data.auto_selected.map(lot => lot.id))
      setMode('selection')
    } catch (error) {
      console.error('Error selecting order:', error)
      toast.error(error.response?.data?.message || 'Failed to process order')
      setMode('list')
    }
  }

  // Toggle manual lot selection
  const toggleLotSelection = (lotId) => {
    setManualSelection(prev => 
      prev.includes(lotId) 
        ? prev.filter(id => id !== lotId)
        : [...prev, lotId]
    )
  }

  // Validate selection and proceed
  const validateAndProceed = () => {
    if (manualSelection.length < selectedOrder.requested_quantity) {
      toast.error(`Please select at least ${selectedOrder.requested_quantity} lots`)
      return
    }
    setMode('confirm')
  }

  // Save as draft
  const saveDraft = async () => {
    try {
      setProcessingSales(true)
      
      await api.post('/sales/save-draft', {
        sales_config_id: selectedOrder.id,
        selected_lots: manualSelection,
        notes: 'Draft saved from sales processing'
      })
      
      toast.success('Sales draft saved successfully')
      setMode('list')
      fetchPendingOrders()
    } catch (error) {
      console.error('Error saving draft:', error)
      toast.error(error.response?.data?.message || 'Failed to save draft')
    } finally {
      setProcessingSales(false)
    }
  }

  // Confirm sale
  const confirmSale = async () => {
    try {
      setProcessingSales(true)
      
      await api.post('/sales/confirm', {
        sales_config_id: selectedOrder.id,
        selected_lots: manualSelection,
        notes: 'Sale confirmed from sales processing'
      })
      
      toast.success('Sales order confirmed successfully!')
      setMode('list')
      fetchPendingOrders()
    } catch (error) {
      console.error('Error confirming sale:', error)
      toast.error(error.response?.data?.message || 'Failed to confirm sale')
    } finally {
      setProcessingSales(false)
    }
  }

  // Reset to list view
  const resetToList = () => {
    setSelectedOrder(null)
    setAvailableLots([])
    setAutoSelectedLots([])
    setManualSelection([])
    setMode('list')
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  // List View
  if (mode === 'list') {
    return (
      <div className="space-y-6">
        {/* New Order Section */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Create New Sales Order</h2>
            <button className="btn-primary" onClick={() => setShowNewOrderForm(v => !v)}>
              {showNewOrderForm ? 'Cancel' : 'New Order'}
            </button>
          </div>
          {showNewOrderForm && (
            <form className="mt-4 space-y-4" onSubmit={submitNewOrder}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Customer</label>
                  <select
                    className="input-field"
                    value={newOrder.customer_id}
                    onChange={e => handleNewOrderChange('customer_id', e.target.value)}
                    required
                  >
                    <option value="">Select Customer</option>
                    {customerOptions.map(c => (
                      <option key={c.id} value={c.id}>{c.customer_name} ({c.customer_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Broker</label>
                  <select
                    className="input-field"
                    value={newOrder.broker_id}
                    onChange={e => handleNewOrderChange('broker_id', e.target.value)}
                    required
                  >
                    <option value="">Select Broker</option>
                    {brokerOptions.map(b => (
                      <option key={b.id} value={b.id}>{b.broker_name} ({b.broker_code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Requested Quantity (bales)</label>
                  <input
                    type="number"
                    className="input-field"
                    value={newOrder.requested_quantity}
                    onChange={e => handleNewOrderChange('requested_quantity', e.target.value)}
                    min={1}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Lifting Period</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newOrder.lifting_period}
                    onChange={e => handleNewOrderChange('lifting_period', e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Priority Branch</label>
                  <input
                    type="text"
                    className="input-field"
                    value={newOrder.priority_branch}
                    onChange={e => handleNewOrderChange('priority_branch', e.target.value)}
                  />
                </div>
              </div>
              {/* Line Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Line Items</label>
                {newOrder.line_items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-2 items-end">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Indent Number"
                      value={item.indent_number}
                      onChange={e => handleLineItemChange(idx, 'indent_number', e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      className="input-field"
                      placeholder="Quantity"
                      min={1}
                      value={item.quantity}
                      onChange={e => handleLineItemChange(idx, 'quantity', e.target.value)}
                      required
                    />
                    <input
                      type="number"
                      className="input-field"
                      placeholder="Commission Rate (%)"
                      min={0}
                      value={item.commission_rate}
                      onChange={e => handleLineItemChange(idx, 'commission_rate', e.target.value)}
                      required
                    />
                    <button type="button" className="btn-secondary" onClick={() => removeLineItem(idx)} disabled={newOrder.line_items.length === 1}>Remove</button>
                  </div>
                ))}
                <button type="button" className="btn-primary mt-2" onClick={addLineItem}>Add Line Item</button>
              </div>
              <div className="flex justify-end">
                <button type="submit" className="btn-primary" disabled={creatingOrder}>
                  {creatingOrder ? 'Creating...' : 'Create Order'}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Sales Processing</h1>
          <p className="mt-1 text-sm text-gray-600">
            Process pending sales orders and allocate inventory lots
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <ShoppingCart className="h-8 w-8 text-blue-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Pending Orders</p>
                <p className="text-lg font-semibold text-gray-900">{pendingOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Box className="h-8 w-8 text-green-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Requested</p>
                <p className="text-lg font-semibold text-gray-900">
                  {pendingOrders.reduce((sum, order) => sum + order.requested_quantity, 0)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-purple-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Customers</p>
                <p className="text-lg font-semibold text-gray-900">
                  {new Set(pendingOrders.map(order => order.customer_info?.id)).size}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-orange-500" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Processing</p>
                <p className="text-lg font-semibold text-gray-900">
                  {pendingOrders.filter(order => order.status === 'processing').length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Pending Orders */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Pending Sales Orders
            </h3>
            
            {pendingOrders.length > 0 ? (
              <div className="space-y-4">
                {pendingOrders.map((order) => (
                  <div key={order.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <h4 className="font-medium text-gray-900">Customer</h4>
                        <p className="text-sm text-gray-600">{order.customer_info?.customer_name}</p>
                        <p className="text-xs text-gray-500">{order.customer_info?.customer_code}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Broker</h4>
                        <p className="text-sm text-gray-600">{order.broker_info?.broker_name}</p>
                        <p className="text-xs text-gray-500">Commission: {order.broker_info?.commission_rate}%</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Requirements</h4>
                        <p className="text-sm text-gray-600">Quantity: {order.requested_quantity} bales</p>
                        <p className="text-xs text-gray-500">Period: {order.lifting_period}</p>
                        {order.line_specs && (
                          <p className="text-xs text-gray-500">
                            Specs: {order.line_specs.variety || 'Any'} • {order.line_specs.fibre_length || 'Any'}
                          </p>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`status-badge ${
                            order.status === 'pending' ? 'status-pending' : 
                            order.status === 'processing' ? 'status-active' : 'status-completed'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <button
                          onClick={() => selectOrder(order)}
                          className="btn-primary text-sm"
                        >
                          Process Order
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <ShoppingCart className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No pending orders</h3>
                <p className="mt-1 text-sm text-gray-500">
                  All sales orders have been processed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Processing View
  if (mode === 'processing') {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600">Processing sales order...</p>
        </div>
      </div>
    )
  }

  // Selection View
  if (mode === 'selection') {
    const selectedLots = availableLots.filter(lot => manualSelection.includes(lot.id))
    const totalValue = selectedLots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0)

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lot Selection</h1>
              <p className="mt-1 text-sm text-gray-600">
                Select lots for {selectedOrder.customer_info?.customer_name}
              </p>
            </div>
            <button
              onClick={resetToList}
              className="btn-secondary"
            >
              Back to Orders
            </button>
          </div>
        </div>

        {/* Order Details */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Order Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-500">Customer:</span>
              <p className="text-gray-900">{selectedOrder.customer_info?.customer_name}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Requested Quantity:</span>
              <p className="text-gray-900">{selectedOrder.requested_quantity} bales</p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Priority Branch:</span>
              <p className="text-gray-900">{selectedOrder.priority_branch || 'Any'}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Lifting Period:</span>
              <p className="text-gray-900">{selectedOrder.lifting_period}</p>
            </div>
          </div>
        </div>

        {/* Selection Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-blue-600">Required</p>
            <p className="text-2xl font-bold text-blue-900">{selectedOrder.requested_quantity}</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-green-600">Selected</p>
            <p className="text-2xl font-bold text-green-900">{manualSelection.length}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-purple-600">Total Value</p>
            <p className="text-2xl font-bold text-purple-900">₹{totalValue.toLocaleString()}</p>
          </div>
        </div>

        {/* Available Lots */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Available Lots</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setManualSelection(autoSelectedLots.map(lot => lot.id))}
                className="btn-secondary text-sm"
              >
                Reset to Auto-Selection
              </button>
              <button
                onClick={() => setManualSelection(availableLots.map(lot => lot.id))}
                className="btn-secondary text-sm"
              >
                Select All
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Select
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Lot Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Specifications
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Branch
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {availableLots.map((lot) => (
                  <tr key={lot.id} className={`hover:bg-gray-50 ${manualSelection.includes(lot.id) ? 'bg-blue-50' : ''}`}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={manualSelection.includes(lot.id)}
                        onChange={() => toggleLotSelection(lot.id)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{lot.lot_number}</div>
                        <div className="text-sm text-gray-500">{lot.indent_number}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{lot.variety}</div>
                      <div className="text-sm text-gray-500">{lot.fibre_length}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{lot.branch}</div>
                      <div className="text-sm text-gray-500">{lot.centre_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">₹{lot.bid_price}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={validateAndProceed}
              disabled={manualSelection.length < selectedOrder.requested_quantity}
              className="btn-primary"
            >
              Proceed to Confirmation
              ({manualSelection.length} selected)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation View
  if (mode === 'confirm') {
    const selectedLots = availableLots.filter(lot => manualSelection.includes(lot.id))
    const totalValue = selectedLots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0)
    const brokerCommission = (totalValue * (selectedOrder.broker_info?.commission_rate || 0)) / 100

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="border-b border-gray-200 pb-4">
          <h1 className="text-2xl font-bold text-gray-900">Confirm Sales Order</h1>
          <p className="mt-1 text-sm text-gray-600">
            Review and confirm the sales order details
          </p>
        </div>

        {/* Summary */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Order Summary</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Customer & Broker</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Customer:</span>
                  <span className="text-gray-900">{selectedOrder.customer_info?.customer_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker:</span>
                  <span className="text-gray-900">{selectedOrder.broker_info?.broker_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Commission Rate:</span>
                  <span className="text-gray-900">{selectedOrder.broker_info?.commission_rate}%</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-3">Financial Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Lots:</span>
                  <span className="text-gray-900">{selectedLots.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Value:</span>
                  <span className="text-gray-900">₹{totalValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker Commission:</span>
                  <span className="text-gray-900">₹{brokerCommission.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-gray-900">Net Amount:</span>
                  <span className="text-gray-900">₹{(totalValue - brokerCommission).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Lots Preview */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Selected Lots ({selectedLots.length})</h3>
          <div className="max-h-64 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedLots.map((lot) => (
                <div key={lot.id} className="bg-gray-50 p-3 rounded-lg text-sm">
                  <div className="font-medium text-gray-900">{lot.lot_number}</div>
                  <div className="text-gray-600">{lot.indent_number}</div>
                  <div className="text-gray-600">{lot.variety} • {lot.fibre_length}</div>
                  <div className="text-gray-900 font-medium">₹{lot.bid_price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-between">
          <button
            onClick={() => setMode('selection')}
            className="btn-secondary"
          >
            Back to Selection
          </button>
          
          <div className="space-x-4">
            <button
              onClick={saveDraft}
              disabled={processingSales}
              className="btn-secondary"
            >
              {processingSales ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Saving...</span>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Save as Draft
                </>
              )}
            </button>
            
            <button
              onClick={confirmSale}
              disabled={processingSales}
              className="btn-primary"
            >
              {processingSales ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Confirming...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Confirm Sale
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default SalesProcessing