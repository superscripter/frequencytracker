import { useState, useEffect } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import { AuthModal } from './components/AuthModal'
import { ActivityTypesManager } from './components/ActivityTypesManager'
import { ActivitiesManager } from './components/ActivitiesManager'
import { CalendarView } from './components/CalendarView'
import { ActivitiesControls } from './components/ActivitiesControls'
import { Profile } from './components/Profile'
import { Recommendations } from './components/Recommendations'
import { Analytics } from './components/Analytics'
import { NotificationPrompt } from './components/NotificationPrompt'
import { TagsManager } from './components/TagsManager'
import { OffTimeManager } from './components/OffTimeManager'

type View = 'Log' | 'Activities' | 'Recommendations' | 'Analytics' | 'Profile'

function App() {
  const [currentView, setCurrentView] = useState<View>('Recommendations')
  const [activitiesViewMode, setActivitiesViewMode] = useState<'calendar' | 'list'>('calendar')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [tagsRefreshTrigger, setTagsRefreshTrigger] = useState(0)
  const [activitiesRefreshTrigger, setActivitiesRefreshTrigger] = useState(0)
  const [selectedTypeId, setSelectedTypeId] = useState<string>('all')
  const [selectedTagId, setSelectedTagId] = useState<string>('all')
  const [defaultView, setDefaultView] = useState<'calendar' | 'list'>(() => {
    // Load from localStorage or default to 'calendar'
    const saved = localStorage.getItem('activitiesDefaultView')
    return (saved as 'calendar' | 'list') || 'calendar'
  })
  const { user, isLoading } = useAuth()

  // Show auth modal if user is not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      setShowAuthModal(true)
    }
  }, [user, isLoading])

  // Save preference to localStorage when it changes (but don't update current view)
  useEffect(() => {
    localStorage.setItem('activitiesDefaultView', defaultView)
  }, [defaultView])

  // Apply preference when Log tab is shown
  useEffect(() => {
    if (currentView === 'Log') {
      setActivitiesViewMode(defaultView)
    }
  }, [currentView, defaultView])

  // Handler for view mode change (doesn't update preference)
  const handleViewModeChange = (mode: 'calendar' | 'list') => {
    setActivitiesViewMode(mode)
  }

  if (isLoading) {
    return (
      <div className="app">
        <div className="container">
          <div className="loading">Loading...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <img src="/frequencytrackericon.png" alt="Frequency Tracker" className="header-logo" />
          <nav className="header-nav">
            <button
              className={currentView === 'Log' ? 'active' : ''}
              onClick={() => setCurrentView('Log')}
            >
              Log
            </button>
            <button
              className={currentView === 'Activities' ? 'active' : ''}
              onClick={() => setCurrentView('Activities')}
            >
              Activities
            </button>
            <button
              className={currentView === 'Recommendations' ? 'active' : ''}
              onClick={() => setCurrentView('Recommendations')}
            >
              Recommendations
            </button>
            <button
              className={currentView === 'Analytics' ? 'active' : ''}
              onClick={() => setCurrentView('Analytics')}
            >
              Analytics
            </button>
            <button
              className={currentView === 'Profile' ? 'active' : ''}
              onClick={() => setCurrentView('Profile')}
            >
              Profile
            </button>
          </nav>
        </div>
      </header>

      <div className="container">
        <main className="main">

          <div className="content">
            {currentView === 'Log' && (
              <div className="activities-view">
                <ActivitiesControls
                  onActivityAdded={() => setActivitiesRefreshTrigger(prev => prev + 1)}
                  selectedTypeId={selectedTypeId}
                  onTypeFilterChange={setSelectedTypeId}
                  selectedTagId={selectedTagId}
                  onTagFilterChange={setSelectedTagId}
                  defaultView={defaultView}
                  onDefaultViewChange={setDefaultView}
                />

                <div className="view-toggle">
                  <button
                    className={activitiesViewMode === 'calendar' ? 'active' : ''}
                    onClick={() => handleViewModeChange('calendar')}
                  >
                    Calendar View
                  </button>
                  <button
                    className={activitiesViewMode === 'list' ? 'active' : ''}
                    onClick={() => handleViewModeChange('list')}
                  >
                    List View
                  </button>
                </div>

                {activitiesViewMode === 'calendar' ? (
                  <CalendarView
                    key={activitiesRefreshTrigger}
                    selectedTypeId={selectedTypeId}
                    selectedTagId={selectedTagId}
                  />
                ) : (
                  <ActivitiesManager
                    key={activitiesRefreshTrigger}
                    selectedTypeId={selectedTypeId}
                  />
                )}
              </div>
            )}
            {currentView === 'Activities' && (
              <div className="activities-management-view">
                <ActivityTypesManager tagsRefreshTrigger={tagsRefreshTrigger} />
                <div className="divider"></div>
                <TagsManager onTagsChange={() => setTagsRefreshTrigger(prev => prev + 1)} />
                <div className="divider"></div>
                <OffTimeManager />
              </div>
            )}
            {currentView === 'Recommendations' && <Recommendations />}
            {currentView === 'Analytics' && <Analytics />}
            {currentView === 'Profile' && (
              <div className="profile-view">
                <Profile onTagsChange={() => setTagsRefreshTrigger(prev => prev + 1)} />
              </div>
            )}
          </div>
        </main>
      </div>

      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
      {user && <NotificationPrompt />}
    </div>
  )
}

export default App
