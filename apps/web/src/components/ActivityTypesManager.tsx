import { useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import * as TablerIcons from '@tabler/icons-react'
import { IconPicker } from './IconPicker'
import { useAuth } from '../context/AuthContext'
import './ActivityTypesManager.css'

interface Tag {
  id: string
  name: string
  color: string | null
}

interface ActivityType {
  id: string
  name: string
  description?: string
  freqWinter: number
  freqSpring: number
  freqSummer: number
  freqFall: number
  desiredFrequency?: number // computed by API for current season, kept for backward compat
  tagId?: string | null
  tag?: Tag | null
  icon?: string
}

type SortField = 'name' | 'freqWinter' | 'freqSpring' | 'freqSummer' | 'freqFall'
type SortOrder = 'asc' | 'desc'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface ActivityTypesManagerProps {
  tagsRefreshTrigger?: number
}

export function ActivityTypesManager({ tagsRefreshTrigger }: ActivityTypesManagerProps) {
  const { user } = useAuth()
  const [activityTypes, setActivityTypes] = useState<ActivityType[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortOrder, setSortOrder] = useState<SortOrder>('asc')
  const [editingId, setEditingId] = useState<string | null>(null)

  // Icon picker state
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerTargetId, setIconPickerTargetId] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formFreqWinter, setFormFreqWinter] = useState(1)
  const [formFreqSpring, setFormFreqSpring] = useState(1)
  const [formFreqSummer, setFormFreqSummer] = useState(1)
  const [formFreqFall, setFormFreqFall] = useState(1)
  const [formTagId, setFormTagId] = useState<string>('')
  const [formIcon, setFormIcon] = useState('Run')

  useEffect(() => {
    fetchActivityTypes()
    fetchTags()
  }, [])

  // Refetch tags when the refresh trigger changes
  useEffect(() => {
    if (tagsRefreshTrigger !== undefined && tagsRefreshTrigger > 0) {
      fetchTags()
    }
  }, [tagsRefreshTrigger])

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
      console.error('Error fetching tags:', err)
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

  const renderIcon = (iconName?: string, color?: string | null) => {
    if (!iconName) iconName = 'Run'
    const IconComponent = (TablerIcons as any)[`Icon${iconName}`]
    // Fallback to Run icon if the icon doesn't exist
    const FallbackIcon = IconComponent || (TablerIcons as any)['IconRun']
    return FallbackIcon ? <FallbackIcon size={20} stroke={1.5} style={{ color: color || 'currentColor' }} /> : null
  }

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
          freqWinter: formFreqWinter,
          freqSpring: formFreqSpring,
          freqSummer: formFreqSummer,
          freqFall: formFreqFall,
          tagId: formTagId || null,
          icon: formIcon,
        }),
      })

      if (!response.ok) {
        const data = await response.json()

        // Check for subscription limit error
        if (data.code === 'SUBSCRIPTION_LIMIT_REACHED') {
          setError(`${data.error} Go to the Profile tab to upgrade to Premium.`)
          return
        }

        throw new Error(data.error || 'Failed to create activity type')
      }

      await fetchActivityTypes()
      setFormName('')
      setFormFreqWinter(1)
      setFormFreqSpring(1)
      setFormFreqSummer(1)
      setFormFreqFall(1)
      setFormTagId('')
      setFormIcon('Run')
      setIsAdding(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add activity type')
    }
  }

  const handleUpdate = async (
    id: string,
    name: string,
    freqWinter: number,
    freqSpring: number,
    freqSummer: number,
    freqFall: number,
    tagId: string | null,
    icon?: string
  ) => {
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
          freqWinter,
          freqSpring,
          freqSummer,
          freqFall,
          tagId: tagId || null,
          icon,
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

  // Check if user is approaching free tier limit
  const isFree = user?.subscriptionTier !== 'premium'
  const activityTypeCount = activityTypes.length
  const nearLimit = isFree && activityTypeCount >= 4

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortOrder === 'asc' ? ' ↑' : ' ↓') : ''

  return (
    <div className="activity-types-manager">
      <div className="activity-types-header">
        <h2 className="activity-types-title">Activity Types</h2>
        <button className="add-btn" onClick={() => setIsAdding(!isAdding)}>
          {isAdding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {nearLimit && (
        <div className="limit-warning">
          You're using {activityTypeCount}/5 activity types.
          Upgrade to Premium for unlimited activity types!
        </div>
      )}

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
          <div className="season-freq-group">
            <label className="season-freq-label">
              <span>W</span>
              <input
                type="number"
                min="0"
                step="any"
                value={formFreqWinter}
                onChange={(e) => setFormFreqWinter(Number(e.target.value))}
              />
            </label>
            <label className="season-freq-label">
              <span>Sp</span>
              <input
                type="number"
                min="0"
                step="any"
                value={formFreqSpring}
                onChange={(e) => setFormFreqSpring(Number(e.target.value))}
              />
            </label>
            <label className="season-freq-label">
              <span>Su</span>
              <input
                type="number"
                min="0"
                step="any"
                value={formFreqSummer}
                onChange={(e) => setFormFreqSummer(Number(e.target.value))}
              />
            </label>
            <label className="season-freq-label">
              <span>F</span>
              <input
                type="number"
                min="0"
                step="any"
                value={formFreqFall}
                onChange={(e) => setFormFreqFall(Number(e.target.value))}
              />
            </label>
          </div>
          <select
            value={formTagId}
            onChange={(e) => setFormTagId(e.target.value)}
            className="tag-select"
          >
            <option value="">No tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="icon-select-btn"
            onClick={() => {
              setIconPickerTargetId('new')
              setShowIconPicker(true)
            }}
          >
            {renderIcon(formIcon)}
            <span>{formIcon}</span>
          </button>
          <button type="submit" className="save-btn">Add</button>
        </form>
      )}

      <table className="activity-types-table">
        <thead>
          <tr>
            <th onClick={() => handleSort('name')} className="sortable">
              Activity Type{sortIndicator('name')}
            </th>
            <th onClick={() => handleSort('freqWinter')} className="sortable season-col" title="Winter (Dec–Feb)">
              W{sortIndicator('freqWinter')}
            </th>
            <th onClick={() => handleSort('freqSpring')} className="sortable season-col" title="Spring (Mar–May)">
              Sp{sortIndicator('freqSpring')}
            </th>
            <th onClick={() => handleSort('freqSummer')} className="sortable season-col" title="Summer (Jun–Aug)">
              Su{sortIndicator('freqSummer')}
            </th>
            <th onClick={() => handleSort('freqFall')} className="sortable season-col" title="Fall (Sep–Nov)">
              F{sortIndicator('freqFall')}
            </th>
            <th>Tag</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sortedActivityTypes.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-state">
                No activity types yet. Add one to get started!
              </td>
            </tr>
          ) : (
            sortedActivityTypes.map((type) => (
              <ActivityTypeRow
                key={type.id}
                type={type}
                tags={tags}
                onUpdate={handleUpdate}
                onDelete={handleDelete}
                isEditing={editingId === type.id}
                setIsEditing={(editing) => setEditingId(editing ? type.id : null)}
                renderIcon={renderIcon}
                onOpenIconPicker={(id) => {
                  setIconPickerTargetId(id)
                  setShowIconPicker(true)
                }}
              />
            ))
          )}
        </tbody>
      </table>

      {showIconPicker && (
        <IconPicker
          selectedIcon={iconPickerTargetId === 'new' ? formIcon : activityTypes.find(t => t.id === iconPickerTargetId)?.icon || 'Activity'}
          onSelectIcon={(icon) => {
            if (iconPickerTargetId === 'new') {
              setFormIcon(icon)
            } else {
              // Find the type being edited and update it
              const typeToUpdate = activityTypes.find(t => t.id === iconPickerTargetId)
              if (typeToUpdate) {
                handleUpdate(
                  typeToUpdate.id,
                  typeToUpdate.name,
                  typeToUpdate.freqWinter,
                  typeToUpdate.freqSpring,
                  typeToUpdate.freqSummer,
                  typeToUpdate.freqFall,
                  typeToUpdate.tagId || null,
                  icon
                )
              }
            }
          }}
          onClose={() => {
            setShowIconPicker(false)
            setIconPickerTargetId(null)
          }}
        />
      )}
    </div>
  )
}

interface ActivityTypeRowProps {
  type: ActivityType
  tags: Tag[]
  onUpdate: (id: string, name: string, freqWinter: number, freqSpring: number, freqSummer: number, freqFall: number, tagId: string | null, icon?: string) => void
  onDelete: (id: string) => void
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
  renderIcon: (iconName?: string, color?: string | null) => ReactElement | null
  onOpenIconPicker: (id: string) => void
}

function ActivityTypeRow({ type, tags, onUpdate, onDelete, isEditing, setIsEditing, renderIcon, onOpenIconPicker }: ActivityTypeRowProps) {
  const [editName, setEditName] = useState(type.name)
  const [editFreqWinter, setEditFreqWinter] = useState(type.freqWinter)
  const [editFreqSpring, setEditFreqSpring] = useState(type.freqSpring)
  const [editFreqSummer, setEditFreqSummer] = useState(type.freqSummer)
  const [editFreqFall, setEditFreqFall] = useState(type.freqFall)
  const [editTagId, setEditTagId] = useState<string>(type.tagId || '')
  const [editIcon, setEditIcon] = useState<string>(type.icon || 'Run')

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleSave = () => {
    const hasChanges =
      editName !== type.name ||
      editFreqWinter !== type.freqWinter ||
      editFreqSpring !== type.freqSpring ||
      editFreqSummer !== type.freqSummer ||
      editFreqFall !== type.freqFall ||
      editTagId !== (type.tagId || '') ||
      editIcon !== (type.icon || 'Run')

    if (editName.trim() !== '' && hasChanges) {
      onUpdate(type.id, editName, editFreqWinter, editFreqSpring, editFreqSummer, editFreqFall, editTagId || null, editIcon)
    }
    setIsEditing(false)
  }

  const handleCancel = () => {
    setEditName(type.name)
    setEditFreqWinter(type.freqWinter)
    setEditFreqSpring(type.freqSpring)
    setEditFreqSummer(type.freqSummer)
    setEditFreqFall(type.freqFall)
    setEditTagId(type.tagId || '')
    setEditIcon(type.icon || 'Run')
    setIsEditing(false)
  }

  const freqDisplay = (val: number) => val === 0 ? '—' : val

  const freqInput = (val: number, setter: (n: number) => void) => (
    <input
      type="number"
      min="0"
      step="any"
      value={val === 0 ? '' : val}
      onChange={(e) => setter(e.target.value === '' ? 0 : Number(e.target.value))}
      className="editable-cell season-input"
    />
  )

  return (
    <tr>
      <td className="activity-type-with-icon">
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="editable-cell"
            autoFocus
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              className="icon-cell-btn"
              onClick={() => onOpenIconPicker(type.id)}
              title="Change icon"
            >
              {renderIcon(type.icon, type.tag?.color)}
            </button>
            <span className="activity-name">{type.name}</span>
          </div>
        )}
      </td>
      <td className="season-col">
        {isEditing ? freqInput(editFreqWinter, setEditFreqWinter) : <span>{freqDisplay(type.freqWinter)}</span>}
      </td>
      <td className="season-col">
        {isEditing ? freqInput(editFreqSpring, setEditFreqSpring) : <span>{freqDisplay(type.freqSpring)}</span>}
      </td>
      <td className="season-col">
        {isEditing ? freqInput(editFreqSummer, setEditFreqSummer) : <span>{freqDisplay(type.freqSummer)}</span>}
      </td>
      <td className="season-col">
        {isEditing ? freqInput(editFreqFall, setEditFreqFall) : <span>{freqDisplay(type.freqFall)}</span>}
      </td>
      <td>
        {isEditing ? (
          <select
            value={editTagId}
            onChange={(e) => setEditTagId(e.target.value)}
            className="tag-select-inline"
          >
            <option value="">No tag</option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="tag-display-inline">
            {type.tag ? (
              <>
                <span
                  className="tag-color-dot"
                  style={{ backgroundColor: type.tag.color || '#3b82f6' }}
                />
                {type.tag.name}
              </>
            ) : (
              <span className="no-tag">—</span>
            )}
          </span>
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
