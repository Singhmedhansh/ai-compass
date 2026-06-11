import React, { createContext, useContext, useState, useEffect } from 'react'

const CurrencyContext = createContext()

export function useCurrency() {
  return useContext(CurrencyContext)
}

const STORAGE_KEY = 'ai-compass-currency'
const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' }
]

export function CurrencyProvider({ children }) {
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? stored : 'USD'
    } catch {
      return 'USD'
    }
  })

  const [exchangeRates, setExchangeRates] = useState({
    USD: 1.0,
    INR: 83.5,
    EUR: 0.92,
    GBP: 0.78
  })
  const [loadingRates, setLoadingRates] = useState(true)

  useEffect(() => {
    const API = import.meta.env.VITE_API_URL || ''
    async function fetchRates() {
      try {
        const response = await fetch(`${API}/api/v1/exchange-rates`)
        if (response.ok) {
          const data = await response.json()
          if (data && data.rates) {
            setExchangeRates(prev => ({
              ...prev,
              ...data.rates
            }))
          }
        }
      } catch (err) {
        console.error('Failed to fetch exchange rates:', err)
      } finally {
        setLoadingRates(false)
      }
    }
    fetchRates()
  }, [])

  const handleSetCurrency = (currencyCode) => {
    setSelectedCurrency(currencyCode)
    try {
      localStorage.setItem(STORAGE_KEY, currencyCode)
      // Dispatch storage event to sync other tabs if needed
      window.dispatchEvent(new Event('currencyChanged'))
    } catch (err) {
      console.error(err)
    }
  }

  // Helper function to rewrite USD pricing strings dynamically
  const convertPrice = (priceStr) => {
    if (!priceStr || typeof priceStr !== 'string') return priceStr
    if (selectedCurrency === 'USD') return priceStr

    const rate = exchangeRates[selectedCurrency]
    if (!rate) return priceStr

    // Regex matches any $ followed by a number (including float)
    return priceStr.replace(/\$([0-9]+(?:\.[0-9]+)?)/g, (match, p1) => {
      const originalPrice = parseFloat(p1)
      if (Number.isNaN(originalPrice)) return match
      
      const converted = originalPrice * rate
      
      const rounded = Math.round(converted)
      if (selectedCurrency === 'INR') {
        const formatted = rounded >= 10000 ? rounded.toLocaleString('en-IN') : String(rounded)
        return '₹' + formatted
      } else if (selectedCurrency === 'EUR') {
        const formatted = rounded >= 10000 ? rounded.toLocaleString('en-US') : String(rounded)
        return '€' + formatted
      } else if (selectedCurrency === 'GBP') {
        const formatted = rounded >= 10000 ? rounded.toLocaleString('en-US') : String(rounded)
        return '£' + formatted
      }
      return match
    })
  }

  const currentSymbol = CURRENCIES.find(c => c.code === selectedCurrency)?.symbol || '$'

  return (
    <CurrencyContext.Provider value={{
      selectedCurrency,
      setSelectedCurrency: handleSetCurrency,
      exchangeRates,
      loadingRates,
      convertPrice,
      currentSymbol,
      currencies: CURRENCIES
    }}>
      {children}
    </CurrencyContext.Provider>
  )
}
