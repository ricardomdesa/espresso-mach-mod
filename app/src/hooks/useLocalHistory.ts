import { useCallback, useEffect, useState } from 'react'
import { Preferences } from '@capacitor/preferences'
import { ExtractionRecord } from '../api/types'

const HISTORY_KEY = 'philco_extraction_history'

export function useLocalHistory() {
  const [records, setRecords] = useState<ExtractionRecord[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    const { value } = await Preferences.get({ key: HISTORY_KEY })
    if (value) {
      try {
        const parsed = JSON.parse(value) as ExtractionRecord[]
        setRecords(parsed)
      } catch {
        setRecords([])
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const save = useCallback(async (newRecords: ExtractionRecord[]) => {
    await Preferences.set({
      key: HISTORY_KEY,
      value: JSON.stringify(newRecords),
    })
    setRecords(newRecords)
  }, [])

  const add = useCallback(
    async (record: ExtractionRecord) => {
      const updated = [record, ...records]
      // manter no max 500 registros
      const trimmed = updated.slice(0, 500)
      await save(trimmed)
    },
    [records, save],
  )

  const remove = useCallback(
    async (id: string) => {
      const updated = records.filter((r) => r.id !== id)
      await save(updated)
    },
    [records, save],
  )

  const clear = useCallback(async () => {
    await save([])
  }, [save])

  return { records, loaded, add, remove, clear, reload: load }
}
