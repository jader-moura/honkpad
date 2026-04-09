# Tests

This directory contains all test files for the Honkpad application.

## Available Tests

- `vbcable-download.test.ts` - Tests VB-Cable download, extraction, and setup executable discovery

## Running Tests

### Run all tests at once
```bash
npm test
```

### Run a specific test
```bash
npm run test:vbcable
```

## Test Naming Convention

- Test files should be named with `.test.ts` suffix (e.g., `feature.test.ts`)
- The test runner automatically discovers all `.test.ts` files in this directory

## Adding New Tests

1. Create a new file in the `tests/` directory with `.test.ts` suffix
2. Add the test logic
3. The test runner will automatically pick it up
4. Add a specific npm script in `package.json` if needed for quick access

## Output

Tests output results to the console with:
- ✅ for passed tests
- ❌ for failed tests
- 📊 summary with total passed/failed counts
