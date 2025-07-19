/**
 * Sales Processing page - Flow 5 & 6
 * Handle sales order processing, lot allocation, and confirmations
 * Production-ready implementation for cotton trading automation
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
  Clock,
  Calculator,
  MapPin,
  Package,
  DollarSign,
  Info
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
  const [selectionStats, setSelectionStats] = useState({
    requiredBales: 0,
    selectedBales: 0,
    totalValue: 0,
    brokerCommission: 0,
    netAmount: 0,
    insufficientLots: false,
    warningMessage: ''
  })

  // New Order state
  const [showNewOrderForm, setShowNewOrderForm] = useState(false)
  const [newOrder, setNewOrder] = useState({
    customer_id: '',
    broker_id: '',
    line_items: [{ 
      indent_number: '', 
      quantity: '', 
      broker_brokerage_per_bale: '', 
      our_brokerage_per_bale: '',
      indent_details: null 
    }]
  })
  const [creatingOrder, setCreatingOrder] = useState(false)

  // Fetch options for customer and broker dropdowns
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
      
      // Validate quantity doesn't exceed available bales
      if (field === 'quantity' && items[idx].indent_details) {
        const quantity = Number(value)
        const available = items[idx].indent_details.available_bales
        if (quantity > available) {
          toast.error(`Quantity cannot exceed available bales (${available})`)
          items[idx][field] = available.toString()
        }
      }
      
      return { ...prev, line_items: items }
    })
  }
  
  const addLineItem = () => {
    setNewOrder(prev => ({ 
      ...prev, 
      line_items: [...prev.line_items, { 
        indent_number: '', 
        quantity: '', 
        broker_brokerage_per_bale: '', 
        our_brokerage_per_bale: '',
        indent_details: null 
      }] 
    }))
  }
  
  const removeLineItem = (idx) => {
    setNewOrder(prev => ({ ...prev, line_items: prev.line_items.filter((_, i) => i !== idx) }))
  }

  // Validate indent number and fetch details
  const validateIndent = async (indentNumber, lineIndex) => {
    if (!indentNumber.trim()) {
      toast.error('Please enter an indent number')
      return
    }

    try {
      const response = await api.post('/sales/validate-indent', {
        indent_number: indentNumber.trim().toUpperCase()
      })
      
      const indentDetails = response.data.data.indent
      
      // Update line item with indent details and clear quantity if it exceeds available
      setNewOrder(prev => {
        const items = [...prev.line_items]
        items[lineIndex].indent_details = indentDetails
        
        // Clear quantity if it exceeds available bales
        if (Number(items[lineIndex].quantity) > indentDetails.available_bales) {
          items[lineIndex].quantity = ''
        }
        
        return { ...prev, line_items: items }
      })
      
      toast.success(`Indent ${indentNumber} validated successfully`)
    } catch (error) {
      console.error('Error validating indent:', error)
      const message = error.response?.data?.message || 'Failed to validate indent'
      toast.error(message)
      
      // Clear indent details on error
      setNewOrder(prev => {
        const items = [...prev.line_items]
        items[lineIndex].indent_details = null
        return { ...prev, line_items: items }
      })
    }
  }

  // Calculate order totals
  const calculateOrderTotals = () => {
    let totalLots = 0
    let totalBrokerBrokerage = 0
    let totalOurBrokerage = 0
    
    newOrder.line_items.forEach(item => {
      if (item.indent_details && item.quantity) {
        totalLots += Number(item.quantity)
        totalBrokerBrokerage += Number(item.quantity) * Number(item.broker_brokerage_per_bale || 0)
        totalOurBrokerage += Number(item.quantity) * Number(item.our_brokerage_per_bale || 0)
      }
    })
    
    return {
      totalLots,
      totalBrokerBrokerage,
      totalOurBrokerage
    }
  }

  // Submit new order
  const submitNewOrder = async (e) => {
    e.preventDefault()
    setCreatingOrder(true)
    try {
      // Enhanced validation
      if (!newOrder.customer_id || !newOrder.broker_id || newOrder.line_items.length === 0) {
        toast.error('Please fill all required fields and add at least one line item')
        setCreatingOrder(false)
        return
      }

      // Validate line items
      const invalidLineItems = newOrder.line_items.filter(item => 
        !item.indent_number || !item.quantity || !item.broker_brokerage_per_bale || !item.our_brokerage_per_bale || !item.indent_details
      )
      if (invalidLineItems.length > 0) {
        toast.error('Please fill all fields in line items and validate indents')
        setCreatingOrder(false)
        return
      }

      // Validate quantities are positive
      const invalidQuantities = newOrder.line_items.filter(item => Number(item.quantity) <= 0)
      if (invalidQuantities.length > 0) {
        toast.error('All quantities must be positive')
        setCreatingOrder(false)
        return
      }

      // POST to backend
      await api.post('/sales/new', {
        ...newOrder,
        line_items: newOrder.line_items.map(item => ({
          indent_number: item.indent_number,
          quantity: Number(item.quantity),
          broker_brokerage_per_bale: Number(item.broker_brokerage_per_bale),
          our_brokerage_per_bale: Number(item.our_brokerage_per_bale)
        }))
      })
      
      toast.success('Sales order created successfully!')
      setShowNewOrderForm(false)
      setNewOrder({
        customer_id: '', broker_id: '',
        line_items: [{ 
          indent_number: '', 
          quantity: '', 
          broker_brokerage_per_bale: '', 
          our_brokerage_per_bale: '',
          indent_details: null 
        }]
      })
      fetchPendingOrders()
    } catch (error) {
      console.error('Error creating order:', error)
      const message = error.response?.data?.message || 'Failed to create order'
      toast.error(message)
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
          fetchPendingOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(subscription)
    }
  }, [])

  // Enhanced lot selection calculation
  const calculateRequiredLots = (requestedQty) => {
    // requestedQty is already in lots, no conversion needed
    return requestedQty
  }

  // Select order for processing
  const selectOrder = async (order) => {
    try {
      setSelectedOrder(order)
      setMode('processing')
      
      // Calculate required lots (already in lots)
      const requiredLots = calculateRequiredLots(order.requested_quantity)
      
      // Auto-select lots with enhanced logic
      const response = await api.post('/sales/auto-select-lots', {
        sales_config_id: order.id,
        requested_qty: requiredLots
      })
      
      if (response.data.data.out_of_stock) {
        toast.error('No available lots found matching the criteria')
        setMode('list')
        return
      }
      
      setAvailableLots(response.data.data.available_lots)
      setAutoSelectedLots(response.data.data.auto_selected)
      setManualSelection(response.data.data.auto_selected.map(lot => lot.id))
      
      // Calculate initial stats
      updateSelectionStats(response.data.data.auto_selected, requiredLots, order)
      
      setMode('selection')
    } catch (error) {
      console.error('Error selecting order:', error)
      const message = error.response?.data?.message || 'Failed to process order'
      toast.error(message)
      setMode('list')
    }
  }

  // Update selection statistics
  const updateSelectionStats = (selectedLots, requiredLots, order) => {
    const totalValue = selectedLots.reduce((sum, lot) => sum + (lot.bid_price || 0), 0)
    const brokerCommission = (totalValue * (order.broker_info?.commission_rate || 0)) / 100
    const netAmount = totalValue - brokerCommission
    const insufficientLots = selectedLots.length < requiredLots
    
    let warningMessage = ''
    if (insufficientLots) {
      warningMessage = `Insufficient lots. Required: ${requiredLots}, Selected: ${selectedLots.length}`
    } else if (selectedLots.length > requiredLots * 1.2) {
      warningMessage = `Over-selected lots. Required: ${requiredLots}, Selected: ${selectedLots.length}`
    }

    setSelectionStats({
      requiredBales: requiredLots,
      selectedBales: selectedLots.length,
      totalValue,
      brokerCommission,
      netAmount,
      insufficientLots,
      warningMessage
    })
  }

  // Toggle manual lot selection
  const toggleLotSelection = (lotId) => {
    setManualSelection(prev => {
      const newSelection = prev.includes(lotId) 
        ? prev.filter(id => id !== lotId)
        : [...prev, lotId]
      
      // Update stats when selection changes
      const selectedLots = availableLots.filter(lot => newSelection.includes(lot.id))
      const requiredLots = calculateRequiredLots(selectedOrder.requested_quantity)
      updateSelectionStats(selectedLots, requiredLots, selectedOrder)
      
      return newSelection
    })
  }

  // Validate selection and proceed
  const validateAndProceed = () => {
    const requiredLots = calculateRequiredLots(selectedOrder.requested_quantity)
    
    if (manualSelection.length < requiredLots) {
      toast.error(`Please select at least ${requiredLots} lots`)
      return
    }
    
    if (selectionStats.insufficientLots) {
      toast.error('Insufficient lots selected. Please add more lots or contact inventory management.')
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
        notes: `Draft saved by ${user.first_name} ${user.last_name} on ${new Date().toLocaleString()}`
      })
      
      toast.success('Sales draft saved successfully')
      setMode('list')
      fetchPendingOrders()
    } catch (error) {
      console.error('Error saving draft:', error)
      const message = error.response?.data?.message || 'Failed to save draft'
      toast.error(message)
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
        notes: `Sale confirmed by ${user.first_name} ${user.last_name} on ${new Date().toLocaleString()}`
      })
      
      toast.success('Sales order confirmed successfully! n8n automation triggered.')
      setMode('list')
      fetchPendingOrders()
    } catch (error) {
      console.error('Error confirming sale:', error)
      const message = error.response?.data?.message || 'Failed to confirm sale'
      toast.error(message)
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
    setSelectionStats({
      requiredBales: 0,
      selectedBales: 0,
      totalValue: 0,
      brokerCommission: 0,
      netAmount: 0,
      insufficientLots: false,
      warningMessage: ''
    })
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
              {/* Line Items */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order Lines</label>
                {newOrder.line_items.map((item, idx) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Indent Number</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="input-field flex-1"
                            placeholder="Enter indent number"
                            value={item.indent_number}
                            onChange={e => handleLineItemChange(idx, 'indent_number', e.target.value)}
                            required
                          />
                          <button 
                            type="button" 
                            className="btn-secondary px-3"
                            onClick={() => validateIndent(item.indent_number, idx)}
                            disabled={!item.indent_number.trim()}
                          >
                            Validate
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Indent Details Display */}
                    {item.indent_details && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                        <h4 className="font-medium text-blue-900 mb-2">Indent Details</h4>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <span className="text-gray-600">Bales Quantity:</span>
                            <p className="font-medium">{item.indent_details.bales_quantity}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Available:</span>
                            <p className="font-medium text-green-600">{item.indent_details.available_bales}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Centre:</span>
                            <p className="font-medium">{item.indent_details.centre_name}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Branch:</span>
                            <p className="font-medium">{item.indent_details.branch}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Lifting Period:</span>
                            <p className="font-medium">{item.indent_details.lifting_period}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Fibre Length:</span>
                            <p className="font-medium">{item.indent_details.fibre_length}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Variety:</span>
                            <p className="font-medium">{item.indent_details.variety}</p>
                          </div>
                          <div>
                            <span className="text-gray-600">Bid Price:</span>
                            <p className="font-medium">₹{item.indent_details.bid_price}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Line Quantity and Brokerage */}
                    {item.indent_details && (
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Line Quantity (lots)</label>
                          <input
                            type="number"
                            className="input-field"
                            placeholder="Enter quantity in lots"
                            min={1}
                            max={item.indent_details.available_bales}
                            value={item.quantity}
                            onChange={e => handleLineItemChange(idx, 'quantity', e.target.value)}
                            required
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Max available: {item.indent_details.available_bales} lots
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Broker Brokerage per Bale</label>
                          <input
                            type="number"
                            className="input-field"
                            placeholder="₹ per bale"
                            min={0}
                            step={0.01}
                            value={item.broker_brokerage_per_bale}
                            onChange={e => handleLineItemChange(idx, 'broker_brokerage_per_bale', e.target.value)}
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Our Brokerage per Bale</label>
                          <input
                            type="number"
                            className="input-field"
                            placeholder="₹ per bale"
                            min={0}
                            step={0.01}
                            value={item.our_brokerage_per_bale}
                            onChange={e => handleLineItemChange(idx, 'our_brokerage_per_bale', e.target.value)}
                            required
                          />
                        </div>
                        <div className="flex items-end">
                          <button 
                            type="button" 
                            className="btn-secondary w-full"
                            onClick={() => removeLineItem(idx)} 
                            disabled={newOrder.line_items.length === 1}
                          >
                            Remove Line
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <button type="button" className="btn-primary mt-2" onClick={addLineItem}>Add Order Line</button>
              </div>

              {/* Order Summary */}
              {newOrder.line_items.some(item => item.indent_details && item.quantity) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4">
                  <h4 className="font-medium text-gray-900 mb-3">Order Summary</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Total Lots:</span>
                      <p className="font-medium text-lg">{calculateOrderTotals().totalLots}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Broker Brokerage:</span>
                      <p className="font-medium text-lg">₹{calculateOrderTotals().totalBrokerBrokerage.toFixed(2)}</p>
                    </div>
                    <div>
                      <span className="text-gray-600">Total Our Brokerage:</span>
                      <p className="font-medium text-lg">₹{calculateOrderTotals().totalOurBrokerage.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              )}

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
          <h1 className="text-2xl font-bold text-gray-900">Sales Processing - Flow 6</h1>
          <p className="mt-1 text-sm text-gray-600">
            Process pending sales orders and allocate inventory lots for confirmed contracts
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
                  {pendingOrders.reduce((sum, order) => sum + order.requested_quantity, 0)} lots
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
                        <p className="text-xs text-gray-500">{order.customer_info?.state}</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Broker</h4>
                        <p className="text-sm text-gray-600">{order.broker_info?.broker_name}</p>
                        <p className="text-xs text-gray-500">Commission: {order.broker_info?.commission_rate}%</p>
                      </div>
                      
                      <div>
                        <h4 className="font-medium text-gray-900">Requirements</h4>
                        <p className="text-sm text-gray-600">
                          {order.requested_quantity} lots
                        </p>
                        <p className="text-xs text-gray-500">Period: {order.lifting_period}</p>
                        {order.line_specs && (
                          <p className="text-xs text-gray-500">
                            Specs: {order.line_specs.variety || 'Any'} • {order.line_specs.fibre_length || 'Any'}
                          </p>
                        )}
                        {order.priority_branch && (
                          <p className="text-xs text-blue-600">
                            Priority: {order.priority_branch}
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
          <p className="text-sm text-gray-500">Calculating required lots and fetching inventory</p>
        </div>
      </div>
    )
  }

  // Selection View
  if (mode === 'selection') {
    const selectedLots = availableLots.filter(lot => manualSelection.includes(lot.id))

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
              <p className="text-xs text-gray-500">{selectedOrder.customer_info?.state}</p>
            </div>
            <div>
              <span className="font-medium text-gray-500">Requested Quantity:</span>
              <p className="text-gray-900">
                {selectedOrder.requested_quantity} lots
              </p>
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-blue-600">Required Lots</p>
            <p className="text-2xl font-bold text-blue-900">{selectionStats.requiredBales}</p>
            <p className="text-xs text-blue-600">Required lots</p>
          </div>
          <div className="bg-green-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-green-600">Selected Lots</p>
            <p className="text-2xl font-bold text-green-900">{selectionStats.selectedBales}</p>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-purple-600">Total Value</p>
            <p className="text-2xl font-bold text-purple-900">₹{selectionStats.totalValue.toLocaleString()}</p>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg text-center">
            <p className="text-sm font-medium text-orange-600">Net Amount</p>
            <p className="text-2xl font-bold text-orange-900">₹{selectionStats.netAmount.toLocaleString()}</p>
            <p className="text-xs text-orange-600">After {selectedOrder.broker_info?.commission_rate}% commission</p>
          </div>
        </div>

        {/* Warning Message */}
        {selectionStats.warningMessage && (
          <div className={`p-4 rounded-lg ${
            selectionStats.insufficientLots ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
          }`}>
            <div className="flex items-center">
              <AlertTriangle className={`h-5 w-5 ${
                selectionStats.insufficientLots ? 'text-red-400' : 'text-yellow-400'
              }`} />
              <p className={`ml-2 text-sm ${
                selectionStats.insufficientLots ? 'text-red-700' : 'text-yellow-700'
              }`}>
                {selectionStats.warningMessage}
              </p>
            </div>
          </div>
        )}

        {/* Available Lots */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              Available Lots ({availableLots.length})
            </h3>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  setManualSelection(autoSelectedLots.map(lot => lot.id))
                  updateSelectionStats(autoSelectedLots, selectionStats.requiredBales, selectedOrder)
                }}
                className="btn-secondary text-sm"
              >
                Reset to Auto-Selection
              </button>
              <button
                onClick={() => {
                  setManualSelection(availableLots.map(lot => lot.id))
                  updateSelectionStats(availableLots, selectionStats.requiredBales, selectedOrder)
                }}
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
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Price
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
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
                        <div className="text-xs text-gray-400">Added: {new Date(lot.created_at).toLocaleDateString()}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{lot.variety}</div>
                      <div className="text-sm text-gray-500">{lot.fibre_length}</div>
                      <div className="text-xs text-gray-400">{lot.lifting_period}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{lot.branch}</div>
                      <div className="text-sm text-gray-500">{lot.centre_name}</div>
                      {lot.branch_information && (
                        <div className="text-xs text-gray-400">{lot.branch_information.zone}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">₹{lot.bid_price?.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">per bale</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        lot.status === 'AVAILABLE' ? 'bg-green-100 text-green-800' :
                        lot.status === 'BLOCKED' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {lot.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={validateAndProceed}
              disabled={selectionStats.insufficientLots}
              className={`btn-primary ${selectionStats.insufficientLots ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              Proceed to Confirmation
              ({selectionStats.selectedBales} selected)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirmation View
  if (mode === 'confirm') {
    const selectedLots = availableLots.filter(lot => manualSelection.includes(lot.id))

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
                  <span className="text-gray-500">State:</span>
                  <span className="text-gray-900">{selectedOrder.customer_info?.state}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker:</span>
                  <span className="text-gray-900">{selectedOrder.broker_info?.broker_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Commission Rate:</span>
                  <span className="text-gray-900">{selectedOrder.broker_info?.commission_rate}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Lifting Period:</span>
                  <span className="text-gray-900">{selectedOrder.lifting_period}</span>
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-3">Financial Summary</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Requested Quantity:</span>
                  <span className="text-gray-900">{selectedOrder.requested_quantity} lots</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Required Lots:</span>
                  <span className="text-gray-900">{selectionStats.requiredBales} lots</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Selected Lots:</span>
                  <span className="text-gray-900">{selectionStats.selectedBales} lots</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total Value:</span>
                  <span className="text-gray-900">₹{selectionStats.totalValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Broker Commission:</span>
                  <span className="text-gray-900">₹{selectionStats.brokerCommission.toLocaleString()}</span>
                </div>
                <div className="flex justify-between font-medium border-t pt-2">
                  <span className="text-gray-900">Net Amount:</span>
                  <span className="text-gray-900">₹{selectionStats.netAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Lots Preview */}
        <div className="card p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Selected Lots ({selectedLots.length})
          </h3>
          <div className="max-h-64 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedLots.map((lot) => (
                <div key={lot.id} className="bg-gray-50 p-3 rounded-lg text-sm">
                  <div className="font-medium text-gray-900">{lot.lot_number}</div>
                  <div className="text-gray-600">{lot.indent_number}</div>
                  <div className="text-gray-600">{lot.variety} • {lot.fibre_length}</div>
                  <div className="text-gray-600">{lot.branch} • {lot.centre_name}</div>
                  <div className="text-gray-900 font-medium">₹{lot.bid_price?.toLocaleString()}</div>
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