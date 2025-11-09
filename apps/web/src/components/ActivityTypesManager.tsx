import { useState, useEffect } from 'react'
import './ActivityTypesManager.css'

interface ActivityType {
  id: string
  name: string
  description?: string
  desiredFrequency: number
}

type SortField = 'name' | 'desiredFrequency'
type SortOrder = 'asc' | 'desc'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function ActivityTypesManager() {
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formFrequency, setFormFrequency] = useState(1)

  useEffect(() => {
    fetchActivityTypes()
  }, [])

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
    } finally {
      setIsLoading(false)
    }
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortOrder('asc')
    }
  }

  const sortedActivityTypes = [...activityTypes].sort((a, b) => {
    const aValue = a[sortField]
    const bValue = b[sortField]

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return sortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue)
    }

    return sortOrder === 'asc'
      ? (aValue as number) - (bValue as number)
      : (bValue as number) - (aValue as number)
  })

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activity-types`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName,
          desiredFrequency: formFrequency,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create activity type')
      }

      await fetchActivityTypes()
      setFormName('')
      setFormFrequency(1)
      setIsAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity type')
    }
  }

  const handleUpdate = async (id: string, name: string, frequency: number) => {
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activity-types/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name,
          desiredFrequency: frequency,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update activity type')
      }

      await fetchActivityTypes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update activity type')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this activity type? This cannot be undone if activities are using it.')) {
      return
    }

    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/activity-types/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to delete activity type')
      }

      await fetchActivityTypes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete activity type')
    }
  }

  if (isLoading) {
    return <div className="activity-types-loading">Loading activity types...</div>
  }

  return (
    <div className="activity-types-manager">
      <div className="activity-types-header">
        <button className="add-btn" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : '+ Add Activity Type'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {isAdding && (
        <form className="add-form" onSubmit={handleAdd}>
          <input
            type="text"
            placeholder="Activity name (e.g., Basketball)"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <input
            type="number"
            min="0"
            step="0.1"
            placeholder="Frequency per week"
            value={formFrequency}
            onChange={(e) => setFormFrequency(Number(e.target.value))}
            required
          />
          <button type="submit" className="save-btn">Add</button>
        </form>
      )}

      <table className="activity-types-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('name')} className="sortable">
              Activity Type {sortField === 'name' && (sortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => handleSort('desiredFrequency')} className="sortable">
              Desired Frequency {sortField === 'desiredFrequency' && (sortOrder === 'asc' ? '↑' : '↓')}
            </th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedActivityTypes.length === 0 ? (
            <tr>
              <td colSpan={3} className="empty-state">
                No activity types yet. Add one to get started!
              </td>
            </tr>
          ) : (
            sortedActivityTypes.map((type) => (
              <ActivityTypeRow
                key={type.id}
                type={type}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                isEditing={editingId === type.id}
                setIsEditing={(editing) => setEditingId(editing ? type.id : null)}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

interface ActivityTypeRowProps {
  type: ActivityType
  onUpdate: (id: string, name: string, frequency: number) => void
  onDelete: (id: string) => void
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
}

function ActivityTypeRow({ type, onUpdate, onDelete, isEditing, setIsEditing }: ActivityTypeRowProps) {
  const [editName, setEditName] = useState(type.name)
  const [editFrequency, setEditFrequency] = useState(type.desiredFrequency)

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    if (editName.trim() !== '' && (editName !== type.name || editFrequency !== type.desiredFrequency)) {
      onUpdate(type.id, editName, editFrequency)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditName(type.name)
    setEditFrequency(type.desiredFrequency)
    setIsEditing(false)
  }

  return (
    <tr>
      <td>
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="editable-cell"
            autoFocus
          />
        ) : (
          <span>{type.name}</span>
        )}
      </td>
      <td>
        {isEditing ? (
          <input
            type="number"
            min="0"
            step="0.1"
            value={editFrequency}
            onChange={(e) => setEditFrequency(Number(e.target.value))}
            className="editable-cell"
          />
        ) : (
          <span>{type.desiredFrequency}</span>
        )}
      </td>
      <td className="actions-cell">
        {isEditing ? (
          <>
            <button
              onClick={handleSave}
              className="save-btn-inline"
              title="Save changes"
            >
              ✓
            </button>
            <button
              onClick={handleCancel}
              className="cancel-btn-inline"
              title="Cancel editing"
            >
              ✗
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleEdit}
              className="edit-btn"
              title="Edit activity type"
            >
              ✏️
            </button>
            <button
              onClick={() => onDelete(type.id)}
              className="delete-btn"
              title="Delete activity type"
            >
              🗑️
            </button>
          </>
        )}
      </td>
    </tr>
  )
}
