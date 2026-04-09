import { readdirSync } from 'fs'
import { join, dirname } from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const testsDir = dirname(__filename)
const testFiles = readdirSync(testsDir)
  .filter(file => file.endsWith('.test.ts'))
  .sort()

console.log('🧪 Test Runner')
console.log('==============\n')
console.log(`Found ${testFiles.length} test(s):\n`)

testFiles.forEach((file, index) => {
  console.log(`${index + 1}. ${file}`)
})

console.log('\n' + '='.repeat(50) + '\n')

let passedTests = 0
let failedTests = 0

async function runTest(testFile: string): Promise<boolean> {
  return new Promise((resolve) => {
    const testPath = join(testsDir, testFile)
    const testName = testFile.replace('.test.ts', '')

    console.log(`\n📝 Running: ${testName}`)
    console.log('-'.repeat(50))

    const child = spawn('npx', ['ts-node', '--transpile-only', testPath], {
      stdio: 'inherit',
      shell: true,
      cwd: join(testsDir, '..'),
    })

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ PASSED: ${testName}\n`)
        passedTests++
        resolve(true)
      } else {
        console.log(`❌ FAILED: ${testName} (exit code: ${code})\n`)
        failedTests++
        resolve(false)
      }
    })

    child.on('error', (err) => {
      console.error(`❌ ERROR running ${testName}:`, err.message)
      failedTests++
      resolve(false)
    })
  })
}

async function runAllTests() {
  for (const testFile of testFiles) {
    await runTest(testFile)
  }

  console.log('='.repeat(50))
  console.log(`\n📊 Results: ${passedTests} passed, ${failedTests} failed\n`)

  if (failedTests > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

if (testFiles.length === 0) {
  console.log('❌ No test files found!')
  process.exit(1)
}

runAllTests()
