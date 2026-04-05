import { autoUpdater, UpdateCheckResult } from 'electron-updater'
import { BrowserWindow, ipcMain, dialog } from 'electron'
import logger from 'electron-log'
import { isDev } from './pathUtils'

let mainWindow: BrowserWindow | null = null
let updateAvailable = false

/**
 * Initialize auto-updater
 */
export function initializeUpdater(window: BrowserWindow): void {
  mainWindow = window

  if (isDev()) {
    // Disable auto-updater in development
    autoUpdater.disableWebInstaller = false
    return
  }

  // Configure logger
  autoUpdater.logger = logger
  autoUpdater.logger.transports.file.level = 'info'

  // Set up update check
  autoUpdater.checkForUpdatesAndNotify()

  // Handle update available
  autoUpdater.on('update-available', (info: UpdateCheckResult) => {
    updateAvailable = true
    logger.info('[Updater] Update available:', info.version)

    // Notify renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    }

    // Show notification dialog
    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Available',
      message: `Soundboard ${info.version} is available`,
      detail: 'Do you want to download and install it now?',
      buttons: ['Update', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        // User clicked "Update"
        autoUpdater.downloadUpdate()
      }
    })
  })

  // Handle update downloaded
  autoUpdater.on('update-downloaded', () => {
    logger.info('[Updater] Update downloaded')

    dialog.showMessageBox(mainWindow!, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update has been downloaded',
      detail: 'The app will restart to apply the update.',
      buttons: ['Install Now', 'Later'],
    }).then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall()
      }
    })
  })

  // Handle errors
  autoUpdater.on('error', (error) => {
    logger.error('[Updater] Error:', error)
  })
}

/**
 * Check for updates (can be called from menu)
 */
export async function checkForUpdates(): Promise<void> {
  if (isDev()) return

  try {
    const result = await autoUpdater.checkForUpdates()

    if (!result || !result.updateInfo) {
      dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'No Updates',
        message: 'You are already running the latest version.',
      })
    }
  } catch (error) {
    logger.error('[Updater] Check failed:', error)
    dialog.showErrorBox('Update Check Failed', 'Could not check for updates.')
  }
}

/**
 * Check if update is available
 */
export function isUpdateAvailable(): boolean {
  return updateAvailable
}
