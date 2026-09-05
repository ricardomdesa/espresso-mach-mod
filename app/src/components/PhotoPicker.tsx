import React, { useEffect, useRef, useState } from 'react'
import { PhotoKind, ShotPhoto } from '../api/types'
import { capturePhoto, readPhotoDataUrl, removePhoto } from '../utils/photoStore'
import { errorMessage } from '../utils/errors'

function isUserCancelled(e: unknown): boolean {
  return /cancel/i.test(errorMessage(e))
}

const KIND_LABELS: Record<PhotoKind, string> = {
  puckLevel: 'Puck nivelado',
  puckTamped: 'Puck tampado',
  stream: 'Jato',
  cup: 'Xicara',
  spentPuck: 'Fundo do puck',
}

const ALL_KINDS = Object.keys(KIND_LABELS) as PhotoKind[]
const MAX_PHOTOS = 6

interface PhotoThumbProps {
  photo: ShotPhoto
  onRemove: () => void
}

const PhotoThumb: React.FC<PhotoThumbProps> = ({ photo, onRemove }) => {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    readPhotoDataUrl(photo.path)
      .then((u) => {
        if (!cancelled) setUrl(u)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [photo.path])

  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-foam">
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remover foto"
        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink/70 text-xs font-bold text-cream"
      >
        ×
      </button>
    </div>
  )
}

interface PhotoPickerProps {
  shotId: string
  photos: ShotPhoto[]
  onChange: (photos: ShotPhoto[]) => void
}

/** Grade de fotos por fase (RF-13): captura, remove, teto de 6 por shot. */
const PhotoPicker: React.FC<PhotoPickerProps> = ({ shotId, photos, onChange }) => {
  const [busyKind, setBusyKind] = useState<PhotoKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos

  const atCap = photos.length >= MAX_PHOTOS
  const busy = busyKind !== null

  const handleCapture = async (kind: PhotoKind) => {
    if (busy || photosRef.current.length >= MAX_PHOTOS) return
    setError(null)
    setBusyKind(kind)
    try {
      const photo = await capturePhoto(shotId, kind)
      onChange([...photosRef.current, photo])
    } catch (e) {
      // Usuario cancelou a captura: nao e falha, so nao ha foto pra adicionar.
      if (!isUserCancelled(e)) {
        // R5: sem permissao/camera indisponivel, degrada pra "sem foto" em vez de travar.
        setError('Nao foi possivel usar a camera: ' + errorMessage(e))
      }
    } finally {
      setBusyKind(null)
    }
  }

  const handleRemove = async (photo: ShotPhoto) => {
    await removePhoto(photo.path)
    onChange(photos.filter((p) => p.path !== photo.path))
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-brick/30 bg-brick/10 px-3 py-2 text-xs text-brick">
          {error}
        </div>
      )}
      {ALL_KINDS.map((kind) => {
        const kindPhotos = photos.filter((p) => p.kind === kind)
        return (
          <div key={kind}>
            <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted">
              {KIND_LABELS[kind]}
            </div>
            <div className="flex flex-wrap gap-2">
              {kindPhotos.map((photo) => (
                <PhotoThumb key={photo.path} photo={photo} onRemove={() => handleRemove(photo)} />
              ))}
              <button
                type="button"
                onClick={() => handleCapture(kind)}
                disabled={atCap || busy}
                aria-label={`Tirar foto: ${KIND_LABELS[kind]}`}
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-dashed border-line-strong text-2xl font-light text-muted active:bg-foam disabled:opacity-40"
              >
                {busyKind === kind ? '...' : '+'}
              </button>
            </div>
          </div>
        )
      })}
      {atCap && <p className="text-xs text-muted">Maximo de {MAX_PHOTOS} fotos por shot.</p>}
    </div>
  )
}

export default PhotoPicker
