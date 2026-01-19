import { useState, useEffect } from 'react'
import './OffTimeManager.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface Tag {
  id: string
  name: string
  color: string | null
}

interface ActivityType {
  id: string
  name: string
  icon?: string
}

interface OffTime {
  id: string
  tagId: string | null
  tag: Tag | null
  activityTypeId: string | null
  activityType: ActivityType | null
  startDate: string
  endDate: string
}

export function OffTimeManager() {
  const [offTimes, setOffTimes] = useState<OffTime[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [newType, setNewType] = useState<'tag' | 'activityType'>('tag')
  const [newTagId, setNewTagId] = useState('')
  const [newActivityTypeId, setNewActivityTypeId] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editType, setEditType] = useState<'tag' | 'activityType'>('tag')
  const [editTagId, setEditTagId] = useState('')
  const [editActivityTypeId, setEditActivityTypeId] = useState('')
  const [editStartDate, setEditStartDate] = useState('')
  const [editEndDate, setEditEndDate] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchOffTimes()
    fetchTags()
    fetchActivityTypes()
  }, [])

  const fetchOffTimes = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/off-times`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch off times')
      }

      const data = await response.json()
      setOffTimes(data)
    } catch (err) {
      setError('Failed to load off times')
      console.error('Error fetching off times:', err)
    }
  }

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/tags`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch tags')
      }

      const data = await response.json()
      setTags(data)
    } catch (err) {
      console.error('Error fetching tags:', err)
    }
  }

  const fetchActivityTypes = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activity-types`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch activity types')
      }

      const data = await response.json()
      setActivityTypes(data)
    } catch (err) {
      console.error('Error fetching activity types:', err)
    }
  }

  const handleAddOffTime = async () => {
    const hasSelection = newType === 'tag' ? newTagId : newActivityTypeId
    if (!hasSelection || !newStartDate || !newEndDate) {
      setError('All fields are required')
      return
    }

    setIsAdding(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const body: any = {
        startDate: newStartDate,
        endDate: newEndDate,
      }

      if (newType === 'tag') {
        body.tagId = newTagId
      } else {
        body.activityTypeId = newActivityTypeId
      }

      const response = await fetch(`${API_URL}/api/off-times`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create off time')
      }

      await fetchOffTimes()
      setNewTagId('')
      setNewActivityTypeId('')
      setNewStartDate('')
      setNewEndDate('')
      setShowAddForm(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add off time')
      console.error('Error adding off time:', err)
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditOffTime = async (id: string) => {
    const hasSelection = editType === 'tag' ? editTagId : editActivityTypeId
    if (!hasSelection || !editStartDate || !editEndDate) {
      setError('All fields are required')
      return
    }

    setError('')

    try {
      const token = localStorage.getItem('token')
      const body: any = {
        startDate: editStartDate,
        endDate: editEndDate,
      }

      if (editType === 'tag') {
        body.tagId = editTagId
        body.activityTypeId = null
      } else {
        body.activityTypeId = editActivityTypeId
        body.tagId = null
      }

      const response = await fetch(`${API_URL}/api/off-times/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update off time')
      }

      await fetchOffTimes()
      setEditingId(null)
      setEditTagId('')
      setEditActivityTypeId('')
      setEditStartDate('')
      setEditEndDate('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update off time')
      console.error('Error updating off time:', err)
    }
  }

  const handleDeleteOffTime = async (id: string) => {
    if (!confirm('Are you sure you want to delete this off time period?')) {
      return
    }

    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/off-times/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete off time')
      }

      await fetchOffTimes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete off time')
      console.error('Error deleting off time:', err)
    }
  }

  const startEdit = (offTime: OffTime) => {
    setEditingId(offTime.id)
    if (offTime.tagId) {
      setEditType('tag')
      setEditTagId(offTime.tagId)
      setEditActivityTypeId('')
    } else if (offTime.activityTypeId) {
      setEditType('activityType')
      setEditActivityTypeId(offTime.activityTypeId)
      setEditTagId('')
    }
    setEditStartDate(offTime.startDate.split('T')[0])
    setEditEndDate(offTime.endDate.split('T')[0])
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditTagId('')
    setEditActivityTypeId('')
    setEditStartDate('')
    setEditEndDate('')
    setError('')
  }

  const toggleAddForm = () => {
    setShowAddForm(!showAddForm)
    setError('')
    setNewTagId('')
    setNewActivityTypeId('')
    setNewStartDate('')
    setNewEndDate('')
  }

  const formatDate = (dateString: string) => {
    // Extract just the date part (YYYY-MM-DD) and format it
    const datePart = dateString.split('T')[0]
    const [year, month, day] = datePart.split('-')
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC'
    })
  }

  return (
    <div className="off-time-manager">
      <div className="off-time-header">
        <h3>Off Time</h3>
        <button onClick={toggleAddForm} className="add-off-time-toggle-btn">
          {showAddForm ? 'Cancel' : '+ Add Off Time'}
        </button>
      </div>

      <p className="off-time-description">
        Schedule periods when activity days are excluded from calculations and recommendations.
      </p>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="add-off-time-form">
          <select
            value={newType}
            onChange={(e) => {
              setNewType(e.target.value as 'tag' | 'activityType')
              setNewTagId('')
              setNewActivityTypeId('')
            }}
            className="type-select"
          >
            <option value="tag">By Tag</option>
            <option value="activityType">By Activity Type</option>
          </select>

          {newType === 'tag' ? (
            <select
              value={newTagId}
              onChange={(e) => setNewTagId(e.target.value)}
              className="tag-select"
            >
              <option value="">Select tag</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={newActivityTypeId}
              onChange={(e) => setNewActivityTypeId(e.target.value)}
              className="tag-select"
            >
              <option value="">Select activity type</option>
              {activityTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={newStartDate}
            onChange={(e) => setNewStartDate(e.target.value)}
            className="date-input"
          />
          <span className="date-separator">to</span>
          <input
            type="date"
            value={newEndDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="date-input"
          />
          <button
            onClick={handleAddOffTime}
            disabled={isAdding || !(newType === 'tag' ? newTagId : newActivityTypeId) || !newStartDate || !newEndDate}
            className="save-off-time-btn"
          >
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {offTimes.length === 0 ? (
        <p className="no-off-times-message">
          No off time periods set. Add one to exclude specific date ranges from calculations.
        </p>
      ) : (
        <div className="off-times-list">
          {offTimes.map((offTime) => (
            <div key={offTime.id} className="off-time-item">
              {editingId === offTime.id ? (
                <div className="edit-off-time-form">
                  <select
                    value={editType}
                    onChange={(e) => {
                      setEditType(e.target.value as 'tag' | 'activityType')
                      setEditTagId('')
                      setEditActivityTypeId('')
                    }}
                    className="type-select"
                  >
                    <option value="tag">By Tag</option>
                    <option value="activityType">By Activity Type</option>
                  </select>

                  {editType === 'tag' ? (
                    <select
                      value={editTagId}
                      onChange={(e) => setEditTagId(e.target.value)}
                      className="tag-select"
                    >
                      <option value="">Select tag</option>
                      {tags.map((tag) => (
                        <option key={tag.id} value={tag.id}>
                          {tag.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={editActivityTypeId}
                      onChange={(e) => setEditActivityTypeId(e.target.value)}
                      className="tag-select"
                    >
                      <option value="">Select activity type</option>
                      {activityTypes.map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(e) => setEditStartDate(e.target.value)}
                    className="date-input"
                  />
                  <span className="date-separator">to</span>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(e) => setEditEndDate(e.target.value)}
                    className="date-input"
                  />
                  <button
                    onClick={() => handleEditOffTime(offTime.id)}
                    className="save-off-time-btn"
                  >
                    Save
                  </button>
                  <button onClick={cancelEdit} className="cancel-off-time-btn">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="off-time-display">
                  <div className="off-time-info">
                    {offTime.tag && (
                      <>
                        <span
                          className="tag-color-indicator"
                          style={{ backgroundColor: offTime.tag.color || '#3b82f6' }}
                        />
                        <span className="tag-name">{offTime.tag.name}</span>
                      </>
                    )}
                    {offTime.activityType && (
                      <span className="activity-type-name">{offTime.activityType.name}</span>
                    )}
                    <span className="date-range">
                      {formatDate(offTime.startDate)} - {formatDate(offTime.endDate)}
                    </span>
                  </div>
                  <div className="off-time-actions">
                    <button
                      onClick={() => startEdit(offTime)}
                      className="edit-off-time-btn"
                      title="Edit off time"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteOffTime(offTime.id)}
                      className="delete-off-time-btn"
                      title="Delete off time"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
