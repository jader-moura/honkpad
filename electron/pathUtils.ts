import path from 'path'
import { app } from 'electron'

/**
 * Utility functions for resolving paths in dev vs production
 */

/**
 * Get the path to app resources (vbcable, etc)
 * In dev: src directory
 * In prod: asar/resources directory (via electron-builder)
 */
export function getResourcesPath(): string {
  if (app.isPackaged) {
    // Production: use app's resources path
    return path.join(process.resourcesPath)
  } else {
    // Development: use project root resources
    return path.join(__dirname, '..', 'resources')
  }
}

/**
 * Get VB-Cable installer path
 */
export function getVBCableInstallerPath(): string {
  const resourcesPath = getResourcesPath()
  return path.join(resourcesPath, 'vbcable', 'VBCABLE_Setup_x64.exe')
}

/**
 * Get user data directory (for sounds, store, logs)
 */
export function getUserDataPath(): string {
  return app.getPath('userData')
}

/**
 * Get sounds directory (persisted user directory)
 */
export function getSoundsPath(): string {
  return path.join(getUserDataPath(), 'sounds')
}

/**
 * Get logs directory
 */
export function getLogsPath(): string {
  return path.join(getUserDataPath(), 'logs')
}

/**
 * Get electron-store config path
 */
export function getStorePath(): string {
  return path.join(getUserDataPath(), 'store.json')
}

/**
 * Check if running in dev mode
 */
export function isDev(): boolean {
  return !app.isPackaged
}
