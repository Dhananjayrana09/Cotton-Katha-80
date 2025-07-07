/**
 * API service configuration
 * Handles HTTP requests with authentication and error handling
 */

import axios from 'axios'
import toast from 'react-hot-toast'
import Cookies from 'js-cookie'

// Create axios instance with base configuration
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api',
  timeout: import.meta.env.VITE_API_TIMEOUT || 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = Cookies.get(
      import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token'
    )
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error) => {
    const { response } = error

    // Handle different error cases
    if (response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      Cookies.remove(
        import.meta.env.VITE_TOKEN_STORAGE_KEY || 'cotton_trading_token'
      )
      window.location.href = '/login'
      toast.error('Session expired. Please log in again.')
    } else if (response?.status === 403) {
      // Forbidden
      toast.error('You do not have permission to perform this action')
    } else if (response?.status === 404) {
      // Not found
      toast.error('Resource not found')
    } else if (response?.status >= 500) {
      // Server error
      toast.error('Server error. Please try again later.')
    } else if (error.code === 'ECONNABORTED') {
      // Request timeout
      toast.error('Request timeout. Please try again.')
    } else if (!response) {
      // Network error
      toast.error('Network error. Please check your connection.')
    }

    return Promise.reject(error)
  }
)

// Helper function to handle file uploads
export const uploadFile = async (url, formData, onUploadProgress) => {
  return api.post(url, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  })
}

// Helper function for GET requests with query parameters
export const get = (url, params = {}) => {
  return api.get(url, { params })
}

// Helper function for POST requests
export const post = (url, data = {}) => {
  return api.post(url, data)
}

// Helper function for PUT requests
export const put = (url, data = {}) => {
  return api.put(url, data)
}

// Helper function for DELETE requests
export const del = (url) => {
  return api.delete(url)
}

export default api