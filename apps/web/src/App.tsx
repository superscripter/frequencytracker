import { useState, useEffect } from 'react'
import './App.css'
import { useAuth } from './context/AuthContext'
import { AuthModal } from './components/AuthModal'
import { ActivityTypesManager } from './components/ActivityTypesManager'
import { ActivitiesManager } from './components/ActivitiesManager'
import { Profile } from './components/Profile'
import { Recommendations } from './components/Recommendations'
import { Analytics } from './components/Analytics'
import { NotificationPrompt } from './components/NotificationPrompt'

type View = 'Activities' | 'Recommendations' | 'Analytics' | 'Profile'

function App() {
  const [currentView, setCurrentView] = useState<View>('Recommendations')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { user, isLoading } = useAuth()

  // Show auth modal if user is not logged in
  useEffect(() => {
    if (!isLoading && !user) {
      setShowAuthModal(true)
    }
  }, [user, isLoading])

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
      <div className="container">
        <header className="header">
          <h1>Frequency Tracker</h1>
          <img src="/freqTrackerIcon.png" alt="Frequency Tracker" className="header-icon" />
        </header>

        <main className="main">
          <nav className="tabs">
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

          <div className="content">
            {currentView === 'Activities' && (
              <div className="activities-view">
                <ActivitiesManager />
              </div>
            )}
            {currentView === 'Recommendations' && <Recommendations />}
            {currentView === 'Analytics' && <Analytics />}
            {currentView === 'Profile' && (
              <div className="profile-view">
                <Profile />
                <div className="divider"></div>
                <ActivityTypesManager />
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
