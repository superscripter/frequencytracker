import { useState, useEffect } from 'react'
import { formatInTimeZone } from 'date-fns-tz'
import { useAuth } from '../context/AuthContext'
import './ActivitiesControls.css'

interface ActivityType {
  id: string
  name: string
  tagId?: string | null
}

interface Tag {
  id: string
  name: string
  color: string | null
}

interface UserPreferences {
  highlightOverdueActivities: boolean
  showDetailedCardData: boolean
  showStreakFlame: boolean
  cardSize: 'small' | 'medium' | 'large'
  mobileCardSize: 'small' | 'medium' | 'large'
}

interface RecommendationsControlsProps {
  onActivityAdded?: () => void
  preferences: UserPreferences
  onPreferenceChange: (key: keyof UserPreferences, value: boolean | string) => void
  selectedTagId: string
  onTagFilterChange: (tagId: string) => void
  selectedTypeId: string
  onTypeFilterChange: (typeId: string) => void
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function RecommendationsControls({
  onActivityAdded,
  preferences,
  onPreferenceChange,
  selectedTagId,
  onTagFilterChange,
  selectedTypeId,
  onTypeFilterChange,
}: RecommendationsControlsProps) {
  const { user } = useAuth()
  const userTimezone = user?.timezone || 'America/New_York'

  const [activeTab, setActiveTab] = useState<'add' | 'filters' | 'preferences' | null>(null)
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [error, setError] = useState('')

  // Add activity form state
  const [addTypeId, setAddTypeId] = useState<string>('')
  const [addDate, setAddDate] = useState<string>(() => {
    return formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd')
  })
  const [addTime, setAddTime] = useState<string>('12:00')

  useEffect(() => {
    fetchActivityTypes()
    fetchTags()
  }, [])

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

  const fetchTags = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/tags`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!response.ok) throw new Error('Failed to fetch tags')
      const data = await response.json()
      setTags(data)
    } catch (err) {
      console.error('Failed to load tags:', err)
    }
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

      const dateTimeString = `${addDate}T${addTime}`
      const utcDate = formatInTimeZone(
        new Date(dateTimeString),
        userTimezone,
        "yyyy-MM-dd'T'HH:mm:ss.SSSxxx"
      )

      const response = await fetch(`${API_URL}/api/activities`, {
        method: 'POST',
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
        throw new Error(data.error || 'Failed to add activity')
      }

      // Reset form
      setAddTypeId('')
      setAddDate(formatInTimeZone(new Date(), userTimezone, 'yyyy-MM-dd'))
      setAddTime('12:00')
      setActiveTab(null)

      // Notify parent
      onActivityAdded?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity')
    }
  }

  const handleTabClick = (tab: 'add' | 'filters' | 'preferences') => {
    if (activeTab === tab) {
      setActiveTab(null)
    } else {
      setActiveTab(tab)
    }
  }

  return (
    <div className="activities-controls">
      <div className="tabbed-section">
        <div className="tab-buttons">
          <button
            className={`tab-button ${activeTab === 'add' ? 'active' : ''}`}
            onClick={() => handleTabClick('add')}
          >
            Add
          </button>
          <button
            className={`tab-button ${activeTab === 'filters' ? 'active' : ''}`}
            onClick={() => handleTabClick('filters')}
          >
            Filters
          </button>
          <button
            className={`tab-button ${activeTab === 'preferences' ? 'active' : ''}`}
            onClick={() => handleTabClick('preferences')}
          >
            Preferences
          </button>
        </div>

        <div className={`tab-content ${activeTab ? 'expanded' : ''}`}>
          {activeTab === 'add' && (
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
                Add Activity
              </button>
            </form>
          )}

          {activeTab === 'filters' && (
            <div className="filters-content">
              <div className="filter-group">
                <label htmlFor="tag-filter">Filter by Tag:</label>
                <select
                  id="tag-filter"
                  value={selectedTagId}
                  onChange={(e) => {
                    onTagFilterChange(e.target.value)
                    // Reset type filter when tag changes
                    if (selectedTypeId !== 'all') {
                      onTypeFilterChange('all')
                    }
                  }}
                  className="filter-select"
                >
                  <option value="all">All Tags</option>
                  {tags.map((tag) => (
                    <option key={tag.id} value={tag.id}>
                      {tag.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="filter-group">
                <label htmlFor="type-filter">Filter by Activity Type:</label>
                <select
                  id="type-filter"
                  value={selectedTypeId}
                  onChange={(e) => onTypeFilterChange(e.target.value)}
                  className="filter-select"
                >
                  <option value="all">All Activity Types</option>
                  {activityTypes
                    .filter((type) => {
                      // Filter by tag first
                      if (selectedTagId === 'all') return true
                      return type.tagId === selectedTagId
                    })
                    .map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="preferences-content">
              <div className="preference-group">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.highlightOverdueActivities}
                    onChange={(e) => onPreferenceChange('highlightOverdueActivities', e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Highlight Overdue Activities</span>
                </label>
              </div>
              <div className="preference-group">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.showDetailedCardData}
                    onChange={(e) => onPreferenceChange('showDetailedCardData', e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Show Detailed Card Data</span>
                </label>
              </div>
              <div className="preference-group">
                <label>
                  <input
                    type="checkbox"
                    checked={preferences.showStreakFlame}
                    onChange={(e) => onPreferenceChange('showStreakFlame', e.target.checked)}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Show Streak Flame</span>
                </label>
              </div>
              <div className="preference-group">
                <label htmlFor="card-size-select" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Card Size:
                </label>
                <select
                  id="card-size-select"
                  value={preferences.cardSize}
                  onChange={(e) => onPreferenceChange('cardSize', e.target.value)}
                  className="filter-select"
                  style={{ width: '100%' }}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
              <div className="preference-group">
                <label htmlFor="mobile-card-size-select" style={{ display: 'block', marginBottom: '0.5rem' }}>
                  Card Size on Mobile:
                </label>
                <select
                  id="mobile-card-size-select"
                  value={preferences.mobileCardSize}
                  onChange={(e) => onPreferenceChange('mobileCardSize', e.target.value)}
                  className="filter-select"
                  style={{ width: '100%' }}
                >
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-message">{error}</div>}
    </div>
  )
}
