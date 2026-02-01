import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import './SubscriptionManager.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export function SubscriptionManager() {
  const { user, refreshUser } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [promoCode, setPromoCode] = useState('')
  const [promoLoading, setPromoLoading] = useState(false)
  const [promoError, setPromoError] = useState('')
  const [promoSuccess, setPromoSuccess] = useState('')
  const [showPromoInput, setShowPromoInput] = useState(false)

  const handleUpgrade = async (priceId: string) => {
    setIsLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/subscriptions/create-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ priceId }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to create checkout session')
      }

      const { url } = await response.json()
      window.location.href = url // Redirect to Stripe Checkout
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRedeemPromo = async () => {
    if (!promoCode.trim()) {
      setPromoError('Please enter a promo code')
      return
    }

    setPromoLoading(true)
    setPromoError('')
    setPromoSuccess('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/subscriptions/redeem-promo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: promoCode.trim() }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to redeem promo code')
      }

      setPromoSuccess(data.message || 'Promo code redeemed successfully!')
      setPromoCode('')
      await refreshUser() // Refresh user data to update subscription status
    } catch (err) {
      setPromoError(err instanceof Error ? err.message : 'Failed to redeem promo code')
    } finally {
      setPromoLoading(false)
    }
  }

  const handleManageSubscription = async () => {
    setIsLoading(true)
    setError('')

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_URL}/api/subscriptions/create-portal`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to open customer portal')
      }

      const { url } = await response.json()
      window.location.href = url // Redirect to Stripe Customer Portal
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to manage subscription')
    } finally {
      setIsLoading(false)
    }
  }

  const isPremium = user?.subscriptionTier === 'premium'
  const monthlyPriceId = import.meta.env.VITE_STRIPE_PRICE_ID_MONTHLY
  const annualPriceId = import.meta.env.VITE_STRIPE_PRICE_ID_ANNUAL

  return (
    <div className="subscription-manager">
      {error && <div className="error-message">{error}</div>}

      <div className="subscription-header">
        <div className="subscription-header-left">
          <h3>Subscription</h3>
          <div className={`tier-badge ${isPremium ? 'premium' : 'free'}`}>
            {isPremium ? '⭐ Premium' : '🆓 Free'}
          </div>
        </div>
      </div>

      {!isPremium && (
        <div className="upgrade-section">
          <div className="benefits-section">
            <h4>Benefits of Premium</h4>
            <ul className="benefits-list">
              <li>Limit of activity types increased from 5 to 100!</li>
            </ul>
          </div>

          <p className="support-text">
            For any questions please contact{' '}
            <a
              href="mailto:frequencytrackerhelp@gmail.com"
              className="support-link"
            >
              frequencytrackerhelp@gmail.com
            </a>
          </p>

          <div className="pricing-options">
            <div className="pricing-card">
              <h5>Monthly</h5>
              <p className="price">$1/month</p>
              <button
                onClick={() => handleUpgrade(monthlyPriceId)}
                disabled={isLoading}
                className="upgrade-btn"
              >
                {isLoading ? 'Loading...' : 'Subscribe Monthly'}
              </button>
            </div>

            <div className="pricing-card recommended">
              <div className="recommended-badge">Best Value</div>
              <h5>Annual</h5>
              <p className="price">$10/year</p>
              <button
                onClick={() => handleUpgrade(annualPriceId)}
                disabled={isLoading}
                className="upgrade-btn premium"
              >
                {isLoading ? 'Loading...' : 'Subscribe Annually'}
              </button>
            </div>
          </div>

          <div className="promo-section">
            <button
              className="promo-toggle"
              onClick={() => setShowPromoInput(!showPromoInput)}
            >
              {showPromoInput ? 'Hide promo code' : 'Have a promo code?'}
            </button>

            {showPromoInput && (
              <div className="promo-input-section">
                {promoError && <div className="promo-error">{promoError}</div>}
                {promoSuccess && <div className="promo-success">{promoSuccess}</div>}
                <div className="promo-input-row">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    placeholder="Enter promo code"
                    className="promo-input"
                    disabled={promoLoading}
                  />
                  <button
                    onClick={handleRedeemPromo}
                    disabled={promoLoading || !promoCode.trim()}
                    className="promo-btn"
                  >
                    {promoLoading ? 'Redeeming...' : 'Redeem'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {isPremium && (
        <div className="manage-section">
          <p>Thank you for being a Premium member!</p>
          <button
            onClick={handleManageSubscription}
            disabled={isLoading}
            className="manage-btn"
          >
            {isLoading ? 'Loading...' : 'Manage Subscription'}
          </button>
        </div>
      )}
    </div>
  )
}
