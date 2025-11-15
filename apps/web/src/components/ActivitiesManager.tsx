import { useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { useAuth } from '../context/AuthContext'
import './ActivitiesManager.css'

interface Activity {
  id: string
  name: string
  date: string
  type: {
    id: string
    name: string
  }
}

interface ActivityType {
  id: string
  name: string
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function ActivitiesManager() {
  const { user } = useAuth()
  const [activities, setActivities] = useState<Activity[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Get user timezone or default to Eastern Time
  const userTimezone = user?.timezone || 'America/New_York'

  // Add/Edit activity form state
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [addTypeId, setAddTypeId] = useState<string>('')
  const [addDate, setAddDate] = useState<string>(() => {
    // Get current date in user's timezone
    return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')
  })
  const [addTime, setAddTime] = useState<string>('12:00')

  // Sync state
  const [syncDate, setSyncDate] = useState<string>(() => {
    // Default to 20 days ago in user's timezone
    const date = new Date()
    date.setDate(date.getDate() - 20)
    return formatInTimeZone(date, userTimezone, 'yyyy-MM-dd')
  })
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const perPage = 20

  useEffect(() => {
    fetchActivityTypes()
  }, [])

  useEffect(() => {
    setCurrentPage(1) // Reset to page 1 when filter changes
    fetchActivities()
  }, [selectedTypeId])

  useEffect(() => {
    if (currentPage > 1) {
      fetchActivities()
    }
  }, [currentPage])

  // Update the date picker default when timezone changes
  useEffect(() => {
    setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'))
  }, [userTimezone])

  const fetchActivityTypes = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activity-types`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) throw new Error('Failed to fetch activity types')
      const data = await response.json()
      setActivityTypes(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activity types')
    }
  }

  const fetchActivities = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: perPage.toString(),
      })

      if (selectedTypeId !== 'all') {
        params.append('typeId', selectedTypeId)
      }

      const url = `${API_URL}/api/activities?${params.toString()}`
      const token = localStorage.getItem('token')
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) throw new Error('Failed to fetch activities')
      const data = await response.json()
      setActivities(data.activities)
      setTotalPages(data.pagination.totalPages)
      setTotalCount(data.pagination.totalCount)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load activities')
    } finally {
      setIsLoading(false)
    }
  }

  const formatDateTime = (dateString: string) => {
    // Convert the date and time to the user's timezone and format it
    return formatInTimeZone(
      new Date(dateString),
      userTimezone,
      'MMM d, yyyy h:mm a'
    )
  }

  const handleSubmitActivity = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!addTypeId) {
      setError('Please select an activity type')
      return
    }

    try {
      const token = localStorage.getItem('token')
      const selectedType = activityTypes.find(t => t.id === addTypeId)

      // Combine date and time in user's timezone, then convert to UTC
      const dateTimeString = `${addDate}T${addTime}`
      const utcDate = formatInTimeZone(
        new Date(dateTimeString),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      )

      const url = editingActivity
        ? `${API_URL}/api/activities/${editingActivity.id}`
        : `${API_URL}/api/activities`

      const response = await fetch(url, {
        method: editingActivity ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          typeId: addTypeId,
          name: selectedType?.name || 'Activity',
          date: new Date(utcDate).toISOString(),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || `Failed to ${editingActivity ? 'update' : 'add'} activity`)
      }

      // Reset form
      setEditingActivity(null)
      setAddTypeId('')
      setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'))
      setAddTime('12:00')

      // Refresh activities
      await fetchActivities()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${editingActivity ? 'update' : 'add'} activity`)
    }
  }

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity)
    setAddTypeId(activity.type.id)

    // Convert the activity date to user's timezone for editing
    const activityDate = new Date(activity.date)
    setAddDate(formatInTimeZone(activityDate, userTimezone, 'yyyy-MM-dd'))
    setAddTime(formatInTimeZone(activityDate, userTimezone, 'HH:mm'))
  }

  const handleCancelEdit = () => {
    setEditingActivity(null)
    setAddTypeId('')
    setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'))
    setAddTime('12:00')
  }

  const handleDeleteActivity = async (activityId: string) => {
    if (!confirm('Are you sure you want to delete this activity?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activities/${activityId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to delete activity')
      }

      // Refresh activities
      await fetchActivities()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete activity')
    }
  }

  const handleSyncActivities = async () => {
    try {
      setIsSyncing(true)
      setSyncMessage('')

      const token = localStorage.getItem('token')

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

      // Refresh activities
      await fetchActivities()

      // Clear message after 5 seconds
      setTimeout(() => setSyncMessage(''), 5000)
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Failed to sync activities')
      setTimeout(() => setSyncMessage(''), 5000)
    } finally {
      setIsSyncing(false)
    }
  }

  if (isLoading) {
    return <div className="activities-loading">Loading activities...</div>
  }

  return (
    <div className="activities-manager">
      <div className="sync-section">
        <label htmlFor="sync-date">Sync from third-party platforms:</label>
        <input
          id="sync-date"
          type="date"
          value={syncDate}
          onChange={(e) => setSyncDate(e.target.value)}
          className="sync-date-input"
        />
        <button
          onClick={handleSyncActivities}
          disabled={isSyncing || !user?.stravaId}
          className="sync-btn"
          title={!user?.stravaId ? 'Connect Strava account in Profile to sync' : 'Sync activities from Strava'}
        >
          {isSyncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {syncMessage && (
        <div className={`sync-message ${syncMessage.includes('complete') ? 'success' : 'error'}`}>
          {syncMessage}
        </div>
      )}

      <form className="add-activity-form" onSubmit={handleSubmitActivity}>
        <select
          value={addTypeId}
          onChange={(e) => setAddTypeId(e.target.value)}
          className="activity-type-select"
          required
        >
          <option value="">Select Activity Type</option>
          {activityTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={addDate}
          onChange={(e) => setAddDate(e.target.value)}
          className="activity-date-input"
          required
        />
        <input
          type="time"
          value={addTime}
          onChange={(e) => setAddTime(e.target.value)}
          className="activity-time-input"
          required
        />
        <button type="submit" className="add-activity-btn">
          {editingActivity ? 'Update Activity' : 'Add Activity'}
        </button>
        {editingActivity && (
          <button type="button" onClick={handleCancelEdit} className="cancel-edit-btn">
            Cancel
          </button>
        )}
      </form>

      {error && <div className="error-message">{error}</div>}

      <div className="filter-group">
        <label htmlFor="type-filter">Filter Table by Activity Type:</label>
        <select
          id="type-filter"
          value={selectedTypeId}
          onChange={(e) => setSelectedTypeId(e.target.value)}
          className="type-filter"
        >
          <option value="all">All Activities</option>
          {activityTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>

      <table className="activities-table">
        <thead>
          <tr>
            <th>Activity Type</th>
            <th>Date & Time</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {activities.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-state">
                No activities yet. Start tracking your activities!
              </td>
            </tr>
          ) : (
            activities.map((activity) => (
              <tr key={activity.id}>
                <td>{activity.type.name}</td>
                <td>{formatDateTime(activity.date)}</td>
                <td className="actions-cell">
                  <button
                    onClick={() => handleEditActivity(activity)}
                    className="edit-btn"
                    title="Edit activity"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteActivity(activity.id)}
                    className="delete-btn"
                    title="Delete activity"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {totalCount > 0 && (
        <div className="pagination-container">
          <div className="pagination-info">
            Showing {(currentPage - 1) * perPage + 1} to {Math.min(currentPage * perPage, totalCount)} of {totalCount} activities
          </div>
          <div className="pagination-controls">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="pagination-btn"
            >
              Previous
            </button>
            <span className="pagination-pages">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Next
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="pagination-btn"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
