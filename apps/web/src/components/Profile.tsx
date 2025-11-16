import { useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
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
  const [autoSync, setAutoSync] = useState<boolean>(false)
  const [enableDailyNotifications, setEnableDailyNotifications] = useState<boolean>(false)
  const [notificationTime, setNotificationTime] = useState<string>('08:00')
  const [isSaving, setIsSaving] = useState(false)
  const [isSavingAutoSync, setIsSavingAutoSync] = useState(false)
  const [isSavingNotifications, setIsSavingNotifications] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [stravaMessage, setStravaMessage] = useState('')

  // Sync state
  const [syncDate, setSyncDate] = useState<string>(() => {
    // Default to 10 days ago in user's timezone
    const userTimezone = user?.timezone || 'America/New_York'
    const date = new Date()
    date.setDate(date.getDate() - 10)
    return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd')
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  useEffect(() => {
    if (user?.timezone) {
      setTimezone(user.timezone)
    }
    if (user?.autoSync !== undefined) {
      setAutoSync(user.autoSync)
    }
    if (user?.enableDailyNotifications !== undefined) {
      setEnableDailyNotifications(user.enableDailyNotifications)
    }
    if (user?.notificationTime) {
      setNotificationTime(user.notificationTime)
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

  const handleAutoSyncChange = async (checked: boolean) => {
    setAutoSync(checked)

    try {
      setIsSavingAutoSync(true)

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ autoSync: checked }),
      })

      if (!response.ok) {
        throw new Error('Failed to update auto-sync')
      }

      // Refresh user data in context
      await refreshUser()
    } catch (error) {
      // Revert on error
      setAutoSync(!checked)
      console.error('Error saving auto-sync:', error)
    } finally {
      setIsSavingAutoSync(false)
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

  const handleNotificationSettingsChange = async (updates: { enableDailyNotifications?: boolean; notificationTime?: string }) => {
    try {
      setIsSavingNotifications(true)

      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(updates),
      })

      if (!response.ok) {
        throw new Error('Failed to update notification settings')
      }

      // Refresh user data in context
      await refreshUser()
      setSaveMessage('Notification settings saved successfully!')
      setTimeout(() => setSaveMessage(''), 3000)
    } catch (error) {
      setSaveMessage('Failed to save notification settings')
      console.error('Error saving notification settings:', error)
    } finally {
      setIsSavingNotifications(false)
    }
  }

  const handleEnableNotificationsChange = (checked: boolean) => {
    setEnableDailyNotifications(checked)
    handleNotificationSettingsChange({ enableDailyNotifications: checked })
  }

  const handleNotificationTimeChange = (time: string) => {
    setNotificationTime(time)
  }

  const handleSaveNotificationTime = () => {
    handleNotificationSettingsChange({ notificationTime })
  }

  const handleSyncActivities = async () => {
    try {
      setIsSyncing(true)
      setSyncMessage('')

      const token = localStorage.getItem('token')
      const userTimezone = user?.timezone || 'America/New_York'

      // Convert sync date to ISO string at start of day in user's timezone
      const syncDateTime = `${syncDate}T00:00:00`
      const isoDate = formatInTimeZone(
        new Date(syncDateTime),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      )

      const response = await fetch(`${API_URL}/api/strava/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          afterDate: new Date(isoDate).toISOString(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to sync activities')
      }

      const result = await response.json()
      setSyncMessage(
        `Sync complete: ${result.imported} imported, ${result.skipped} skipped${result.errors.length > 0 ? `, ${result.errors.length} errors` : ''}`
      )

      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(''), 5000)
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync activities')
      setTimeout(() => setSyncMessage(''), 5000)
    } finally {
      setIsSyncing(false)
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
            <span className="label">Auto Sync:</span>
            <div className="auto-sync-section">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => handleAutoSyncChange(e.target.checked)}
                className="auto-sync-checkbox"
                disabled={!user?.stravaId || isSavingAutoSync}
                title={!user?.stravaId ? 'Connect Strava account to enable auto-sync' : 'Automatically sync activities on page load'}
              />
            </div>
          </div>
          <div className="info-row notification-settings-row">
            <span className="label">Daily Notifications:</span>
            <div className="notification-settings">
              <div className="notification-enable">
                <input
                  type="checkbox"
                  checked={enableDailyNotifications}
                  onChange={(e) => handleEnableNotificationsChange(e.target.checked)}
                  className="notification-checkbox"
                  disabled={isSavingNotifications}
                />
                <span className="notification-label">Enable daily reminders at 6:00 AM MT</span>
              </div>
            </div>
          </div>
          <div className="info-row strava-row">
            <span className="label">Strava:</span>
            <div className="strava-section">
              {user.stravaId ? (
                <>
                  <div className="strava-connected">
                    <span className="strava-status">Connected (ID: {user.stravaId})</span>
                    <button onClick={handleDisconnectStrava} className="disconnect-strava-btn">
                      Disconnect
                    </button>
                  </div>
                  <div className="strava-sync">
                    <label htmlFor="sync-date">Sync activities from:</label>
                    <input
                      id="sync-date"
                      type="date"
                      value={syncDate}
                      onChange={(e) => setSyncDate(e.target.value)}
                      className="sync-date-input"
                    />
                    <button
                      onClick={handleSyncActivities}
                      disabled={isSyncing}
                      className="sync-btn"
                    >
                      {isSyncing ? 'Syncing...' : 'Sync'}
                    </button>
                  </div>
                </>
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
      {syncMessage && (
        <div className={`save-message ${syncMessage.includes('complete') ? 'success' : 'error'}`}>
          {syncMessage}
        </div>
      )}
    </div>
  )
}
