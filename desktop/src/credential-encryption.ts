import type { SafeStorage } from 'electron'
import type { CredentialEncryption } from '../vendor/siwc-local/src/index.js'

type StorageAPI = Pick<
  SafeStorage,
  'isEncryptionAvailable' | 'encryptString' | 'decryptString' | 'getSelectedStorageBackend'
>

/**
 * Encrypts ChatGPT credentials at rest with Electron's safeStorage (macOS Keychain).
 * Lives in the main process only; keys never cross IPC. Adapted from the devkit example.
 */
export function createElectronCredentialEncryption(
  storage: StorageAPI,
  isReady: () => boolean,
  platform: NodeJS.Platform = process.platform,
): CredentialEncryption {
  const isAvailable = () => {
    if (!isReady() || !storage.isEncryptionAvailable()) return false
    // Electron's Linux basic_text backend uses a hardcoded key. Refuse it.
    return (
      platform !== 'linux' ||
      ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6'].includes(storage.getSelectedStorageBackend())
    )
  }
  const requireAvailable = () => {
    if (!isAvailable()) throw new Error('OS credential encryption is unavailable.')
  }
  return {
    id: 'electron-safe-storage-v1',
    isAvailable,
    encrypt(plaintext) {
      requireAvailable()
      return storage.encryptString(plaintext)
    },
    decrypt(ciphertext) {
      requireAvailable()
      return storage.decryptString(Buffer.from(ciphertext))
    },
  }
}
