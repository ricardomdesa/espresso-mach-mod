import { useCallback } from 'react'
import { useMachine } from '../context/MachineContext'
import { PIDParams, ExtractionProfile } from '../api/types'

export function useMachineApi() {
  const { api, refreshStatus, saveProfile, removeProfile } = useMachine()

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

  const setSteam = useCallback(
    async (on: boolean) => {
      if (!api) throw new Error('Not connected')
      await api.setSteam(on)
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

  // Perfis funcionam offline: gravam no cache local e sincronizam com a
  // máquina assim que ela responde (ver MachineContext).
  const createProfile = useCallback(
    async (profile: Omit<ExtractionProfile, 'id'>) => {
      await saveProfile(profile)
    },
    [saveProfile],
  )

  const updateProfile = useCallback(
    async (id: string, profile: Omit<ExtractionProfile, 'id'>) => {
      await saveProfile(profile, id)
    },
    [saveProfile],
  )

  const deleteProfile = useCallback(
    async (id: string) => {
      await removeProfile(id)
    },
    [removeProfile],
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
    setSteam,
    setPID,
    startExtraction,
    stopExtraction,
    createProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
  }
}
