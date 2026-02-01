import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

interface User {
  id: string
  email: string
  name: string | null
  timezone?: string
  autoSync?: boolean
  stravaId?: string | null
  enableDailyNotifications?: boolean
  notificationTime?: string
  subscriptionTier?: 'free' | 'premium'
  subscriptionStatus?: string | null
  subscriptionEndDate?: string | null
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const triggerAutoSync = async (user: User) => {
    // Only auto-sync if enabled and user has Strava connected
    if (!user.autoSync || !user.stravaId) return

    try {
      const token = localStorage.getItem('token')
      if (!token) return

      // Calculate 10 days ago
      const date = new Date()
      date.setDate(date.getDate() - 10)
      const afterDate = date.toISOString()

      // Trigger sync in background (don't await or show errors to user)
      fetch(`${API_URL}/api/strava/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ afterDate }),
      }).catch(() => {
        // Silently fail - user can manually sync if needed
      })
    } catch (error) {
      // Silently fail
    }
  }

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token')
    if (token) {
      // Verify token and get user info
      fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
        .then((res) => {
          if (!res.ok) {
            localStorage.removeItem('token')
            throw new Error('Invalid token')
          }
          return res.json()
        })
        .then((data) => {
          setUser(data.user)
          // Trigger auto-sync after user is loaded
          triggerAutoSync(data.user)
        })
        .catch(() => {
          localStorage.removeItem('token')
        })
        .finally(() => {
          setIsLoading(false)
        })
    } else {
      setIsLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Login failed')
    }

    const data = await response.json()
    localStorage.setItem('token', data.token)
    setUser(data.user)
    // Trigger auto-sync after login
    triggerAutoSync(data.user)
  }

  const register = async (email: string, password: string, name: string) => {
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, name }),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Registration failed')
    }

    const data = await response.json()
    localStorage.setItem('token', data.token)
    setUser(data.user)
    // Trigger auto-sync after registration
    triggerAutoSync(data.user)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const refreshUser = async () => {
    const token = localStorage.getItem('token')
    if (!token) return

    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch user')
      }

      const data = await response.json()
      setUser(data.user)
    } catch (error) {
      console.error('Error refreshing user:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, register, logout, refreshUser, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
