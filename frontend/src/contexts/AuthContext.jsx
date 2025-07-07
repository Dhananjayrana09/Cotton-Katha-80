/**
 * Authentication Context
 * Manages user authentication state and provides auth functions
 */

import React, { createContext, useContext, useEffect, useState } from 'react'
import { authService } from '../services/authService'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

const AuthContext = createContext({})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Check for existing token on app start
  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const token = Cookies.get(import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token')
        if (token) {
          // Verify token validity
          const userData = await authService.getProfile()
          setUser(userData.data.data.user)
        }
      } catch (error) {
        console.error('Auth initialization error:', error)
        // Clear invalid token
        Cookies.remove(import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token')
      } finally {
        setLoading(false)
      }
    }
    initializeAuth()
  }, [])

  // Login function
  const login = async (email, password) => {
    try {
      setLoading(true)
      const response = await authService.login(email, password)
      console.log("login response", response);
      
      if (response.data.data.token) {
        const tokenKey = import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token'
        Cookies.set(tokenKey, response.data.data.token, { expires: 7 }) // 7 days expiry
        setUser(response.data.data.user)
        toast.success('Login successful!')
        return { success: true }
      } else {
        throw new Error('No token received')
      }
    } catch (error) {
      // Improved error handling
      let message = error.response?.data?.message || 'Login failed'
      if (error.response?.data?.errors) {
        message += '\n' + error.response.data.errors.map(e => e.message).join('\n')
      }
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  // Register function
  const register = async (userData) => {
    try {
      setLoading(true)
      const response = await authService.register(userData)
      
      if (response.data.data.token) {
        const tokenKey = import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token'
        Cookies.set(tokenKey, response.data.data.token, { expires: 7 })
        setUser(response.data.data.user)
        toast.success('Registration successful!')
        return { success: true }
      } else {
        throw new Error('No token received')
      }
    } catch (error) {
      // Improved error handling
      let message = error.response?.data?.message || 'Registration failed'
      if (error.response?.data?.errors) {
        message += '\n' + error.response.data.errors.map(e => e.message).join('\n')
      }
      toast.error(message)
      return { success: false, message }
    } finally {
      setLoading(false)
    }
  }

  // Logout function
  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      const tokenKey = import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token'
      Cookies.remove(tokenKey)
      setUser(null)
      toast.success('Logged out successfully')
    }
  }

  // Update profile function
  const updateProfile = async (profileData) => {
    try {
      const response = await authService.updateProfile(profileData)
      setUser(response.data.data.user) //fixed
      toast.success('Profile updated successfully!')
      return { success: true }
    } catch (error) {
      // Improved error handling
      let message = error.response?.data?.message || 'Profile update failed'
      if (error.response?.data?.errors) {
        message += '\n' + error.response.data.errors.map(e => e.message).join('\n')
      }
      toast.error(message)
      return { success: false, message }
    }
  }

  // Check if user has required role
  const hasRole = (requiredRole) => {
    if (!user) return false
    if (Array.isArray(requiredRole)) {
      return requiredRole.includes(user.role)
    }
    return user.role === requiredRole
  }

  // Check if user is admin
  const isAdmin = () => hasRole('admin')

  // Check if user is trader
  const isTrader = () => hasRole('trader')

  // Check if user is customer
  const isCustomer = () => hasRole('customer')

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
    hasRole,
    isAdmin,
    isTrader,
    isCustomer
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}