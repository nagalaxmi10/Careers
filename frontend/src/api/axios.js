import axios from "axios"

const API = axios.create({
  baseURL: "http://127.0.0.1:8000/api/",
})

// Request interceptor — attach access token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("token")
  if (token) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptor — on 401, try to refresh the access token once
let isRefreshing = false
let failedQueue = []

const processQueue = (error, token = null) => {
  failedQueue.forEach((p) => {
    if (error) {
      p.reject(error)
    } else {
      p.resolve(token)
    }
  })
  failedQueue = []
}

API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error?.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error)
    }

    const refreshToken = localStorage.getItem("refresh")
    if (!refreshToken) {
      // No refresh token at all — send to login
      localStorage.removeItem("token")
      localStorage.removeItem("refresh")
      window.location.href = "/"
      return Promise.reject(error)
    }

    // If a refresh is already in flight, queue this request until it resolves
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject })
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`
        return API(originalRequest)
      }).catch((err) => Promise.reject(err))
    }

    originalRequest._retry = true
    isRefreshing = true

    try {
      // Call the refresh endpoint directly with plain axios — NOT the API instance,
      // otherwise a 401 on the refresh call would trigger this interceptor again
      const res = await axios.post("http://127.0.0.1:8000/api/token/refresh/", {
        refresh: refreshToken,
      })

      const newAccessToken = res.data.access
      localStorage.setItem("token", newAccessToken)

      // Update the default header for future requests
      API.defaults.headers.common["Authorization"] = `Bearer ${newAccessToken}`

      // Retry all queued requests with the new token
      processQueue(null, newAccessToken)

      // Retry the original request
      originalRequest.headers.Authorization = `Bearer ${newAccessToken}`
      return API(originalRequest)

    } catch (refreshError) {
      // Refresh token is expired or invalid — force logout
      processQueue(refreshError, null)
      localStorage.removeItem("token")
      localStorage.removeItem("refresh")
      window.location.href = "/"
      return Promise.reject(refreshError)
    } finally {
      isRefreshing = false
    }
  }
)

export default API
