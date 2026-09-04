import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { PhotoKind, ShotPhoto } from '../api/types'

const SHOTS_ROOT = 'shots'
const shotDir = (shotId: string) => `${SHOTS_ROOT}/${shotId}`

function newFileId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Tira e grava uma foto do shot (RF-13). Comprimida na captura — largura
 * maxima 1280px, qualidade 70 — para nunca precisar de base64 em Preferences
 * (RNF-02/RNF-03).
 */
export async function capturePhoto(shotId: string, kind: PhotoKind): Promise<ShotPhoto> {
  const photo = await Camera.getPhoto({
    resultType: CameraResultType.Base64,
    source: CameraSource.Camera,
    quality: 70,
    width: 1280,
    correctOrientation: true,
  })
  if (!photo.base64String) throw new Error('Camera nao retornou dados da foto')

  const path = `${shotDir(shotId)}/${newFileId()}.jpg`
  await Filesystem.writeFile({
    path,
    data: photo.base64String,
    directory: Directory.Data,
    recursive: true,
  })

  return { path, kind, takenAt: new Date().toISOString() }
}

/** Data URL pronta pra <img src>, lendo o arquivo do disco. */
export async function readPhotoDataUrl(path: string): Promise<string> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
  const base64 = typeof data === 'string' ? data : await data.text()
  return `data:image/jpeg;base64,${base64}`
}

export async function removePhoto(path: string): Promise<void> {
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data })
  } catch {
    // arquivo ja nao existia
  }
}

/** Apaga o diretorio inteiro do shot (D4) — usado ao apagar shot/rascunho. */
export async function removeShotPhotos(shotId: string): Promise<void> {
  try {
    await Filesystem.rmdir({ path: shotDir(shotId), directory: Directory.Data, recursive: true })
  } catch {
    // diretorio nao existia (shot sem fotos)
  }
}

/**
 * Remove diretorios de `shots/` sem shot correspondente no indice (R3):
 * sobra de uma foto gravada entre a captura e o app fechar antes de salvar
 * o registro. Rodar no boot, apos a migracao.
 */
export async function sweepOrphanPhotos(knownShotIds: string[]): Promise<{ removed: number }> {
  let entries: { name: string }[]
  try {
    const res = await Filesystem.readdir({ path: SHOTS_ROOT, directory: Directory.Data })
    entries = res.files
  } catch {
    return { removed: 0 } // shots/ ainda nao existe
  }

  const known = new Set(knownShotIds)
  let removed = 0
  for (const entry of entries) {
    if (known.has(entry.name)) continue
    await removeShotPhotos(entry.name)
    removed++
  }
  return { removed }
}
