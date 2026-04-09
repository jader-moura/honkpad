import https from 'https'
import { createWriteStream, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import os from 'os'

const tempDir = join(os.tmpdir(), 'vbcable-test-' + Date.now())
mkdirSync(tempDir, { recursive: true })

console.log('VB-Cable Download & Extraction Test')
console.log('===================================\n')
console.log('Temp directory:', tempDir)

// Step 1: Get download URL
async function getVBCableDownloadUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    console.log('\n[1] Fetching VB-Cable download page...')
    https.get('https://vb-audio.com/Cable/', (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => {
        try {
          const html = Buffer.concat(chunks).toString('utf-8')
          const match = html.match(/href="(https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack\d+\.zip)"/i)
          if (match && match[1]) {
            console.log('✓ Found download URL:', match[1])
            resolve(match[1])
          } else {
            console.error('✗ Could not find download link in page')
            resolve(null)
          }
        } catch (err) {
          console.error('✗ Error parsing page:', err)
          resolve(null)
        }
      })
    }).on('error', (err) => {
      console.error('✗ Failed to fetch page:', err.message)
      resolve(null)
    })
  })
}

// Step 2: Download
async function downloadFile(url: string, destPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('\n[2] Downloading VB-Cable...')
    const file = createWriteStream(destPath)
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        console.error(`✗ Download failed with status ${response.statusCode}`)
        file.destroy()
        resolve(false)
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log('✓ Download completed')
        resolve(true)
      })
    }).on('error', (err) => {
      console.error('✗ Download error:', err.message)
      file.destroy()
      resolve(false)
    })
  })
}

// Step 3: Extract
function extractZip(zipPath: string, destDir: string): boolean {
  console.log('\n[3] Extracting ZIP...')
  try {
    const extractCmd = `Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`
    execSync(`powershell.exe -NoProfile -NonInteractive -Command "${extractCmd.replace(/"/g, '\\"')}"`, {
      windowsHide: true,
    })
    console.log('✓ Extraction completed')
    return true
  } catch (err) {
    console.error('✗ Extraction failed:', err)
    return false
  }
}

// Step 4: List all files
function listAllFiles(dir: string, indent = '') {
  try {
    const files = readdirSync(dir)
    for (const file of files) {
      const filePath = join(dir, file)
      const stat = statSync(filePath)
      const marker = stat.isDirectory() ? '📁' : '📄'
      console.log(`${indent}${marker} ${file}`)
      if (stat.isDirectory()) {
        listAllFiles(filePath, indent + '  ')
      }
    }
  } catch (err) {
    console.error(`${indent}✗ Error reading directory:`, err)
  }
}

// Step 5: Search for setup executable
function findSetupExe(dir: string, exePatterns: string[]): string | null {
  console.log('\n[5] Searching for setup executable...')
  console.log('Patterns to match:', exePatterns)

  let found: string | null = null

  function search(currentDir: string, depth = 0): void {
    try {
      const files = readdirSync(currentDir)
      for (const file of files) {
        const filePath = join(currentDir, file)
        const stat = statSync(filePath)

        if (stat.isFile() && file.endsWith('.exe')) {
          console.log(`  Found .exe: ${file}`)
          // Check if matches any pattern
          const matches = exePatterns.some(pattern =>
            file.toLowerCase().includes(pattern.toLowerCase())
          )
          if (matches) {
            console.log(`    ✓ MATCH! This looks like the setup exe`)
            found = filePath
            return
          }
        }

        if (stat.isDirectory() && depth < 5) {
          search(filePath, depth + 1)
        }
      }
    } catch (err) {
      console.error(`  Error searching:`, err)
    }
  }

  search(dir)
  return found
}

// Main test
async function test() {
  try {
    const downloadUrl = await getVBCableDownloadUrl()
    if (!downloadUrl) {
      console.error('\n✗ Could not get download URL')
      return
    }

    const zipPath = join(tempDir, 'vbcable.zip')
    const extractDir = join(tempDir, 'extracted')
    mkdirSync(extractDir, { recursive: true })

    const downloaded = await downloadFile(downloadUrl, zipPath)
    if (!downloaded) {
      console.error('\n✗ Download failed')
      return
    }

    const extracted = extractZip(zipPath, extractDir)
    if (!extracted) {
      console.error('\n✗ Extraction failed')
      return
    }

    console.log('\n[4] Listing extracted files:')
    listAllFiles(extractDir)

    const exePatterns = ['VBCable_PackSetup.exe', 'VBCABLE_Setup_x64.exe', 'Setup.exe']
    const foundExe = findSetupExe(extractDir, exePatterns)

    if (foundExe) {
      console.log(`\n✓ SUCCESS! Found setup exe at: ${foundExe}`)
    } else {
      console.log('\n✗ FAILED! Could not find setup executable')
      console.log('\nSearching for ANY .exe files...')
      function findAllExes(dir: string): string[] {
        let exes: string[] = []
        try {
          const files = readdirSync(dir)
          for (const file of files) {
            const filePath = join(dir, file)
            const stat = statSync(filePath)
            if (stat.isFile() && file.endsWith('.exe')) {
              exes.push(filePath)
            }
            if (stat.isDirectory()) {
              exes = exes.concat(findAllExes(filePath))
            }
          }
        } catch (err) {
          console.error('Error:', err)
        }
        return exes
      }
      const allExes = findAllExes(extractDir)
      console.log('All .exe files found:')
      allExes.forEach(exe => console.log('  -', exe))
    }

  } catch (err) {
    console.error('Test error:', err)
  } finally {
    console.log('\n[Cleanup] Removing temp directory...')
    try {
      execSync(`rmdir /s /q "${tempDir}"`, { windowsHide: true })
      console.log('✓ Temp directory removed')
    } catch (err) {
      console.warn('⚠ Could not remove temp directory (it may be in use):', tempDir)
    }
  }
}

test()
