/**
 * Main layout component
 * Provides navigation and overall structure
 */

import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  Home,
  ClipboardList,
  Currency,
  FileText,
  Beaker,
  ShoppingCart,
  Users,
  Settings2,
  LogOut,
  Menu,
  X,
  ChevronDown
} from 'lucide-react'

const Layout = ({ children }) => {
  const { user, logout, isAdmin, isTrader, isCustomer } = useAuth()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Navigation items based on user role
  const getNavigationItems = () => {
    const items = [
      { name: 'Dashboard', href: '/dashboard', icon: Home, roles: ['admin', 'trader', 'customer'] },
    ]

    if (isAdmin() || isTrader()) {
      items.push(
        { name: 'Allocations', href: '/allocations', icon: ClipboardList, roles: ['admin', 'trader'] },
        { name: 'Payments', href: '/payments/verified', icon: Currency, roles: ['admin', 'trader'] },
        { name: 'Contracts', href: '/contract/search', icon: FileText, roles: ['admin', 'trader'] },
        { name: 'Sampling', href: '/sampling-entry', icon: Beaker, roles: ['admin', 'trader'] },
        { name: 'Sales', href: '/sales-processing', icon: ShoppingCart, roles: ['admin', 'trader'] },
        { name: 'DO Specifications', href: '/do-specifications', icon: FileText, roles: ['admin', 'trader'] },
        { name: 'DO Specifications History', href: '/do-specifications/history', icon: ClipboardList, roles: ['admin', 'trader'] },
      )
    }

    if (isAdmin()) {
      items.push(
        { name: 'Pending UTRs', href: '/utr/pending', icon: Currency, roles: ['admin'] },
        { name: 'Admin Contracts', href: '/admin/contracts', icon: FileText, roles: ['admin'] },
        { name: 'Lot Override', href: '/admin/lot-override', icon: Users, roles: ['admin'] },
      )
    }

    if (isCustomer()) {
      items.push(
        { name: 'My Lots', href: '/customer/my-lots', icon: Users, roles: ['customer'] },
      )
    }

    return items.filter(item => item.roles.includes(user?.role))
  }

  const navigationItems = getNavigationItems()

  const handleLogout = async () => {
    await logout()
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <h1 className="text-xl font-bold text-gray-900">Cotton Trading</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 px-4 py-4">
            <ul className="space-y-2">
              {navigationItems.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.href}
                    className={`flex items-center px-4 py-2 text-sm font-medium rounded-md ${
                      location.pathname === item.href
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                    }`}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="mr-3 h-5 w-5" />
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
        <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6">
          <div className="flex h-16 shrink-0 items-center">
            <h1 className="text-xl font-bold text-gray-900">Cotton Trading</h1>
          </div>
          <nav className="flex flex-1 flex-col">
            <ul className="flex flex-1 flex-col gap-y-7">
              <li>
                <ul className="-mx-2 space-y-1">
                  {navigationItems.map((item) => (
                    <li key={item.name}>
                      <Link
                        to={item.href}
                        className={`group flex gap-x-3 rounded-md p-2 text-sm leading-6 font-semibold ${
                          location.pathname === item.href
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:text-blue-700 hover:bg-gray-50'
                        }`}
                      >
                        <item.icon className="h-6 w-6 shrink-0" />
                        {item.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-4 border-b border-gray-200 bg-white px-4 shadow-sm sm:gap-x-6 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2.5 p-2.5 text-gray-700 lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="flex flex-1 gap-x-4 self-stretch lg:gap-x-6">
            <div className="flex flex-1" />
            <div className="flex items-center gap-x-4 lg:gap-x-6">
              {/* User menu */}
              <div className="relative">
                <button
                  type="button"
                  className="flex items-center gap-x-1 text-sm font-semibold leading-6 text-gray-900"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <span className="sr-only">Open user menu</span>
                  <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <span className="text-white text-sm font-medium">
                      {user?.first_name?.[0]}{user?.last_name?.[0]}
                    </span>
                  </div>
                  <span className="hidden lg:flex lg:items-center">
                    <span className="ml-4 text-sm font-semibold leading-6 text-gray-900">
                      {user?.first_name} {user?.last_name}
                    </span>
                    <ChevronDown className="ml-2 h-5 w-5 text-gray-400" />
                  </span>
                </button>

                {dropdownOpen && (
                  <div className="absolute right-0 z-10 mt-2.5 w-32 origin-top-right rounded-md bg-white py-2 shadow-lg ring-1 ring-gray-900/5">
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center px-3 py-1 text-sm leading-6 text-gray-900 hover:bg-gray-50"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="py-10">
          <div className="px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}

export default Layout