import { useCallback, useEffect, useRef, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { ExtractionRecord } from '../api/types'

const HISTORY_KEY = 'philco_extraction_history'

export function useLocalHistory() {
  const [records, setRecords] = useState<ExtractionRecord[]>([])
  const [loaded, setLoaded] = useState(false)
  // Espelha `records` fora do estado do React para que add/remove/clear não
  // precisem depender dele — mantém a identidade dessas funções estável
  // entre renders (efeitos que dependem delas não disparam à toa).
  const recordsRef = useRef<ExtractionRecord[]>([])

  const load = useCallback(async () => {
    const { value } = await Preferences.get({ key: HISTORY_KEY })
    if (value) {
      try {
        const parsed = JSON.parse(value) as ExtractionRecord[]
        recordsRef.current = parsed
        setRecords(parsed)
      } catch {
        recordsRef.current = []
        setRecords([])
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (newRecords: ExtractionRecord[]) => {
    recordsRef.current = newRecords
    await Preferences.set({
      key: HISTORY_KEY,
      value: JSON.stringify(newRecords),
    })
    setRecords(newRecords)
  }, [])

  const add = useCallback(
    async (record: ExtractionRecord) => {
      const updated = [record, ...recordsRef.current]
      // manter no max 500 registros
      const trimmed = updated.slice(0, 500)
      await save(trimmed)
    },
    [save],
  )

  const remove = useCallback(
    async (id: string) => {
      const updated = recordsRef.current.filter((r) => r.id !== id)
      await save(updated)
    },
    [save],
  )

  const update = useCallback(
    async (id: string, patch: Partial<ExtractionRecord>) => {
      const updated = recordsRef.current.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      )
      await save(updated)
    },
    [save],
  )

  const clear = useCallback(async () => {
    await save([])
  }, [save])

  return { records, loaded, add, remove, update, clear, reload: load }
}
