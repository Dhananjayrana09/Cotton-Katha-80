/**
 * Authentication service
 * Handles all authentication-related API calls
 */

import api from './api'

export const authService = {
  // Login user
  login: async (email, password) => {
    return api.post('/auth/login', { email, password })
  },

  // Register user
  register: async (userData) => {
    return api.post('/auth/register', userData)
  },

  // Logout user
  logout: async () => {
    return api.post('/auth/logout')
  },

  // Get current user profile
  getProfile: async () => {
    return api.get('/auth/me')
  },

  // Update user profile
  updateProfile: async (profileData) => {
    return api.put('/auth/profile', profileData)
  },
}