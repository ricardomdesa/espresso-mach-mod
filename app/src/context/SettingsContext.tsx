import React, { createContext, useContext, useState, useCallback } from 'react'

export type TemperatureUnit = 'celsius' | 'fahrenheit'
export type PressureUnit = 'bar' | 'psi'

interface Settings {
  tempUnit: TemperatureUnit
  pressureUnit: PressureUnit
}

interface SettingsContextValue extends Settings {
  setTempUnit: (u: TemperatureUnit) => void
  setPressureUnit: (u: PressureUnit) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tempUnit, setTempUnit] = useState<TemperatureUnit>('celsius')
  const [pressureUnit, setPressureUnit] = useState<PressureUnit>('bar')

  const handleSetTempUnit = useCallback((u: TemperatureUnit) => setTempUnit(u), [])
  const handleSetPressureUnit = useCallback((u: PressureUnit) => setPressureUnit(u), [])

  return (
    <SettingsContext.Provider
      value={{
        tempUnit,
        pressureUnit,
        setTempUnit: handleSetTempUnit,
        setPressureUnit: handleSetPressureUnit,
      }}
    >
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
