import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import './Profile.css'

const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Phoenix', label: 'Mountain Time - Arizona (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii-Aleutian Time (HAT)' },
]

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function Profile() {
  const { user, logout, refreshUser } = useAuth()
  const [timezone, setTimezone] = useState<string>('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [stravaMessage, setStravaMessage] = useState('')

  useEffect(() => {
    if (user?.timezone) {
      setTimezone(user.timezone)
    }
  }, [user])

  useEffect(() => {
    // Check for Strava OAuth redirect messages
    const params = new URLSearchParams(window.location.search)
    const stravaConnected = params.get('strava_connected')
    const stravaError = params.get('strava_error')

    if (stravaConnected === 'true') {
      setStravaMessage('Successfully connected to Strava!')
      refreshUser() // Refresh to get updated stravaId
      // Clear URL params
      window.history.replaceState({}, '', '/profile')
      setTimeout(() => setStravaMessage(''), 5000)
    } else if (stravaError) {
      setStravaMessage(`Error: ${stravaError}`)
      window.history.replaceState({}, '', '/profile')
      setTimeout(() => setStravaMessage(''), 5000)
    }
  }, [])

  const handleSaveTimezone = async () => {
    try {
      setIsSaving(true)
      setSaveMessage('')

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ timezone }),
      })

      if (!response.ok) {
        throw new Error('Failed to update timezone')
      }

      // Refresh user data in context
      await refreshUser()
      setSaveMessage('Timezone saved successfully!')

      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      setSaveMessage('Failed to save timezone')
      console.error('Error saving timezone:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleConnectStrava = () => {
    const token = localStorage.getItem('token')
    // Redirect to backend OAuth endpoint
    window.location.href = `${API_URL}/api/strava/authorize?token=${token}`
  }

  const handleDisconnectStrava = async () => {
    try {
      setStravaMessage('')
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/strava/disconnect`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to disconnect Strava')
      }

      await refreshUser()
      setStravaMessage('Successfully disconnected from Strava')
      setTimeout(() => setStravaMessage(''), 3000)
    } catch (error) {
      setStravaMessage('Failed to disconnect Strava')
      console.error('Error disconnecting Strava:', error)
    }
  }

  if (!user) {
    return <p>Please sign in to view your profile.</p>
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="profile-info">
          <div className="info-row">
            <span className="label">Name:</span>
            <span className="value">{user.name || 'Not set'}</span>
          </div>
          <div className="info-row">
            <span className="label">Email:</span>
            <span className="value">{user.email}</span>
          </div>
          <div className="info-row">
            <span className="label">Timezone:</span>
            <div className="timezone-selector">
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="timezone-dropdown"
              >
                {US_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
              <button
                onClick={handleSaveTimezone}
                disabled={isSaving || timezone === user.timezone}
                className="save-timezone-btn"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
          <div className="info-row">
            <span className="label">Strava:</span>
            <div className="strava-section">
              {user.stravaId ? (
                <div className="strava-connected">
                  <span className="strava-status">Connected (ID: {user.stravaId})</span>
                  <button onClick={handleDisconnectStrava} className="disconnect-strava-btn">
                    Disconnect
                  </button>
                </div>
              ) : (
                <button onClick={handleConnectStrava} className="connect-strava-btn">
                  Connect to Strava
                </button>
              )}
            </div>
          </div>
        </div>
        <button className="signout-btn" onClick={logout}>Sign Out</button>
      </div>
      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('success') ? 'success' : 'error'}`}>
          {saveMessage}
        </div>
      )}
      {stravaMessage && (
        <div className={`save-message ${stravaMessage.includes('Success') ? 'success' : 'error'}`}>
          {stravaMessage}
        </div>
      )}
    </div>
  )
}
