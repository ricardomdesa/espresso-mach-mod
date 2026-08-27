import { useCallback } from 'react'
import { useMachine } from '../context/MachineContext'
import { PIDParams, ExtractionProfile } from '../api/types'

export function useMachineApi() {
  const { api, refreshStatus, refreshProfiles } = useMachine()

  const setTemp = useCallback(
    async (temp: number) => {
      if (!api) throw new Error('Not connected')
      await api.setTempSetpoint(temp)
      await refreshStatus()
    },
    [api, refreshStatus],
  )

  const setLed = useCallback(
    async (on: boolean) => {
      if (!api) throw new Error('Not connected')
      await api.setLed(on)
      await refreshStatus()
    },
    [api, refreshStatus],
  )

  const setPump = useCallback(
    async (on: boolean) => {
      if (!api) throw new Error('Not connected')
      await api.setPump(on)
      await refreshStatus()
    },
    [api, refreshStatus],
  )

  const setPID = useCallback(
    async (params: PIDParams) => {
      if (!api) throw new Error('Not connected')
      await api.setPID(params)
      await refreshStatus()
    },
    [api, refreshStatus],
  )

  const startExtraction = useCallback(async () => {
    if (!api) throw new Error('Not connected')
    await api.startExtraction()
    await refreshStatus()
  }, [api, refreshStatus])

  const stopExtraction = useCallback(async () => {
    if (!api) throw new Error('Not connected')
    await api.stopExtraction()
    await refreshStatus()
  }, [api, refreshStatus])

  const createProfile = useCallback(
    async (profile: Omit<ExtractionProfile, 'id'>) => {
      if (!api) throw new Error('Not connected')
      await api.createProfile(profile)
      await refreshProfiles()
    },
    [api, refreshProfiles],
  )

  const updateProfile = useCallback(
    async (id: string, profile: Omit<ExtractionProfile, 'id'>) => {
      if (!api) throw new Error('Not connected')
      await api.updateProfile(id, profile)
      await refreshProfiles()
    },
    [api, refreshProfiles],
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      if (!api) throw new Error('Not connected')
      await api.deleteProfile(id)
      await refreshProfiles()
    },
    [api, refreshProfiles],
  )

  const setActiveProfile = useCallback(
    async (id: string) => {
      if (!api) throw new Error('Not connected')
      await api.setActiveProfile(id)
      await refreshStatus()
    },
    [api, refreshStatus],
  )

  return {
    setTemp,
    setLed,
    setPump,
    setPID,
    startExtraction,
    stopExtraction,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
  }
}
