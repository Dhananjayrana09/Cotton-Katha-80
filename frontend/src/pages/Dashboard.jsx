/**
 * Dashboard page component
 * Displays overview statistics and quick actions
 */

import React, { useRef, useEffect } from 'react'
import { useQuery } from 'react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import LoadingSpinner from '../components/LoadingSpinner'
import {
  ClipboardList,
  Currency,
  FileText,
  Beaker,
  ShoppingCart,
  Users,
  AlertTriangle
} from 'lucide-react'
import toast from 'react-hot-toast'

const Dashboard = () => {
  const { user, isAdmin } = useAuth()

  // Fetch dashboard overview data
  const { data: overviewData, isLoading: overviewLoading } = useQuery(
    'dashboard-overview',
    () => api.get('/dashboard/overview'),
    {
      enabled: isAdmin(),
      refetchInterval: 30000, // Refresh every 30 seconds
    }
  )

  // Fetch alerts data
  const { data: alertsData, isLoading: alertsLoading } = useQuery(
    'dashboard-alerts',
    () => api.get('/dashboard/alerts'),
    {
      enabled: isAdmin(),
      refetchInterval: 60000, // Refresh every minute
    }
  )

  const overview = overviewData?.data?.data?.overview || {}
  const alerts = alertsData?.data?.data?.alerts || []

  // Track last seen alert to show toast for new/critical alerts
  const lastAlertId = useRef(null)
  useEffect(() => {
    if (isAdmin() && alerts.length > 0) {
      const latest = alerts[0]
      if (latest && latest.id !== lastAlertId.current) {
        lastAlertId.current = latest.id
        toast((t) => (
          <span>
            <AlertTriangle className="inline h-5 w-5 text-yellow-500 mr-2" />
            <b>System Alert:</b> {latest.message}
            {latest.action_url && (
              <>
                {' '}
                <Link to={latest.action_url} className="underline text-blue-600 ml-2" onClick={() => toast.dismiss(t.id)}>
                  View
                </Link>
              </>
            )}
          </span>
        ), { icon: false, duration: 8000 })
      }
    }
  }, [alerts, isAdmin])

  // Quick action cards based on user role
  const getQuickActions = () => {
    const actions = []

    if (isAdmin()) {
      actions.push(
        { name: 'View Allocations', href: '/allocations', icon: ClipboardList, color: 'bg-blue-500' },
        { name: 'Pending UTRs', href: '/utr/pending', icon: Currency, color: 'bg-yellow-500' },
        { name: 'Admin Contracts', href: '/admin/contracts', icon: FileText, color: 'bg-green-500' },
        { name: 'Lot Override', href: '/admin/lot-override', icon: Users, color: 'bg-purple-500' },
      )
    } else if (user?.role === 'trader') {
      actions.push(
        { name: 'My Allocations', href: '/allocations', icon: ClipboardList, color: 'bg-blue-500' },
        { name: 'Upload Contract', href: '/contract/search', icon: FileText, color: 'bg-green-500' },
        { name: 'Sampling Entry', href: '/sampling-entry', icon: Beaker, color: 'bg-orange-500' },
        { name: 'Sales Processing', href: '/sales-processing', icon: ShoppingCart, color: 'bg-indigo-500' },
      )
    } else if (user?.role === 'customer') {
      actions.push(
        { name: 'My Lot Assignments', href: '/customer/my-lots', icon: Users, color: 'bg-purple-500' },
      )
    }

    return actions
  }

  const quickActions = getQuickActions()

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Welcome back, {user?.first_name}!
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Here's what's happening with your cotton trading operations today.
        </p>
      </div>

      {/* Alerts Section */}
      {isAdmin() && alerts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                System Alerts ({alerts.length})
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <ul className="list-disc pl-5 space-y-1">
                  {alerts.slice(0, 3).map((alert, index) => (
                    <li key={index}>
                      <Link
                        to={alert.action_url}
                        className="hover:underline font-medium"
                      >
                        {alert.message}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overview Statistics (Admin only) */}
      {isAdmin() && (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {overviewLoading ? (
            <div className="col-span-full flex justify-center py-8">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <>
              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <ClipboardList className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Allocations
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {overview.total_allocations || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Currency className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Payments
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {overview.total_payments || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Beaker className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Inventory Lots
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {overview.total_inventory || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white overflow-hidden shadow rounded-lg">
                <div className="p-5">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Users className="h-6 w-6 text-gray-400" />
                    </div>
                    <div className="ml-5 w-0 flex-1">
                      <dl>
                        <dt className="text-sm font-medium text-gray-500 truncate">
                          Total Customers
                        </dt>
                        <dd className="text-lg font-medium text-gray-900">
                          {overview.total_customers || 0}
                        </dd>
                      </dl>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-medium text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quickActions.map((action) => (
            <Link
              key={action.name}
              to={action.href}
              className="relative group bg-white p-6 focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-500 rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div>
                <span className={`rounded-lg inline-flex p-3 ${action.color} text-white`}>
                  <action.icon className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-4">
                <h3 className="text-lg font-medium text-gray-900">
                  <span className="absolute inset-0" />
                  {action.name}
                </h3>
                <p className="mt-2 text-sm text-gray-500">
                  Access {action.name.toLowerCase()} functionality
                </p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity (if admin) */}
      {isAdmin() && overviewData?.data?.data?.recent_activities && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
              Recent Activity
            </h3>
            <div className="space-y-3">
              {overviewData.data.data.recent_activities.slice(0, 5).map((activity, index) => (
                <div key={index} className="flex items-center text-sm">
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      {activity.users?.first_name} {activity.users?.last_name}
                    </span>
                    <span className="text-gray-500 ml-2">
                      {activity.action.replace(/_/g, ' ').toLowerCase()}
                    </span>
                  </div>
                  <div className="text-gray-400 text-xs">
                    {new Date(activity.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Dashboard