import { useState, useEffect } from 'react'
import './TagsManager.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

interface Tag {
  id: string
  name: string
  color: string | null
  _count?: {
    activityTypes: number
  }
}

interface TagsManagerProps {
  onTagsChange?: () => void
}

export function TagsManager({ onTagsChange }: TagsManagerProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3b82f6')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    fetchTags()
  }, [])

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
      setError('Failed to load tags')
      console.error('Error fetching tags:', err)
    }
  }

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      setError('Tag name is required')
      return
    }

    setIsAdding(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: newTagName.trim(),
          color: newTagColor,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to create tag')
      }

      await fetchTags()
      setNewTagName('')
      setNewTagColor('#3b82f6')
      setShowAddForm(false)
      onTagsChange?.() // Notify parent component
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add tag')
      console.error('Error adding tag:', err)
    } finally {
      setIsAdding(false)
    }
  }

  const handleEditTag = async (id: string) => {
    if (!editName.trim()) {
      setError('Tag name is required')
      return
    }

    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/tags/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: editName.trim(),
          color: editColor,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update tag')
      }

      await fetchTags()
      setEditingId(null)
      setEditName('')
      setEditColor('')
      onTagsChange?.() // Notify parent component
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update tag')
      console.error('Error updating tag:', err)
    }
  }

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Are you sure you want to delete this tag? Activity types using this tag will have their tag removed.')) {
      return
    }

    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/tags/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to delete tag')
      }

      await fetchTags()
      onTagsChange?.() // Notify parent component
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete tag')
      console.error('Error deleting tag:', err)
    }
  }

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color || '#3b82f6')
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditName('')
    setEditColor('')
    setError('')
  }

  const toggleAddForm = () => {
    setShowAddForm(!showAddForm)
    setError('')
    setNewTagName('')
    setNewTagColor('#3b82f6')
  }

  return (
    <div className="tags-manager">
      <div className="tags-header">
        <h3>Tags</h3>
        <button onClick={toggleAddForm} className="add-tag-toggle-btn">
          {showAddForm ? 'Cancel' : '+ Add Tag'}
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {showAddForm && (
        <div className="add-tag-form">
          <input
            type="text"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            className="tag-name-input"
          />
          <input
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
            className="tag-color-input"
            title="Tag color"
          />
          <button
            onClick={handleAddTag}
            disabled={isAdding || !newTagName.trim()}
            className="save-tag-btn"
          >
            {isAdding ? 'Adding...' : 'Add'}
          </button>
        </div>
      )}

      {tags.length === 0 ? (
        <p className="no-tags-message">No tags yet. Create one to start grouping activity types.</p>
      ) : (
        <div className="tags-list">
          {tags.map((tag) => (
            <div key={tag.id} className="tag-item">
              {editingId === tag.id ? (
                <div className="edit-tag-form">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="tag-name-input"
                  />
                  <input
                    type="color"
                    value={editColor}
                    onChange={(e) => setEditColor(e.target.value)}
                    className="tag-color-input"
                    title="Tag color"
                  />
                  <button
                    onClick={() => handleEditTag(tag.id)}
                    className="save-tag-btn"
                  >
                    Save
                  </button>
                  <button onClick={cancelEdit} className="cancel-tag-btn">
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="tag-display">
                  <div className="tag-info">
                    <span
                      className="tag-color-indicator"
                      style={{ backgroundColor: tag.color || '#3b82f6' }}
                    />
                    <span className="tag-name">{tag.name}</span>
                    {tag._count && tag._count.activityTypes > 0 && (
                      <span className="tag-count">
                        ({tag._count.activityTypes} type{tag._count.activityTypes !== 1 ? 's' : ''})
                      </span>
                    )}
                  </div>
                  <div className="tag-actions">
                    <button
                      onClick={() => startEdit(tag)}
                      className="edit-tag-btn"
                      title="Edit tag"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={() => handleDeleteTag(tag.id)}
                      className="delete-tag-btn"
                      title="Delete tag"
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
