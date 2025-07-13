# Integration Test Suite

This comprehensive integration test suite provides end-to-end testing for all workflows and features of the launchpadder-web application.

## Overview

The integration test suite covers:

- **Authentication Workflows**: User registration, login, logout, password reset, and session management
- **Submission Workflows**: URL submission, metadata fetching, AI enhancement, payment processing, and approval
- **Federation Workflows**: Partner registration, API authentication, cross-platform sharing, and badge integration
- **Admin & Moderation**: Dashboard functionality, content moderation, user management, and system configuration
- **API Endpoints**: REST API functionality, rate limiting, error handling, and performance testing
- **I18n & Accessibility**: Multi-language support, theme switching, mobile responsiveness, and PWA features
- **Monitoring & Logging**: Health checks, error tracking, metrics collection, and audit trails

## Test Structure

```
test/integration/
├── setup.js                           # Global test setup and configuration
├── fixtures/
│   └── database.js                     # Test data fixtures and factories
├── helpers/
│   └── api-helpers.js                  # API testing utilities and validators
├── workflows/
│   ├── auth-workflows.test.js          # Authentication workflow tests
│   ├── submission-workflows.test.js    # Submission workflow tests
│   ├── federation-workflows.test.js    # Federation workflow tests
│   └── admin-moderation-workflows.test.js # Admin and moderation tests
├── api/
│   └── api-endpoints.test.js           # API endpoint integration tests
├── features/
│   ├── i18n-accessibility.test.js      # I18n and accessibility tests
│   └── monitoring-logging.test.js      # Monitoring and logging tests
└── README.md                           # This documentation
```

## Prerequisites

### Environment Setup

1. **Node.js**: Version 20 or newer
2. **Database**: PostgreSQL with Supabase
3. **Environment Variables**: Create `.env.test` file

```bash
# .env.test
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-test-anon-key
SUPABASE_SERVICE_KEY=your-test-service-key
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54322/postgres
TEST_BASE_URL=http://localhost:3000
VERBOSE_TESTS=false
```

### Dependencies

Install test dependencies:

```bash
pnpm install --dev
```

Required test dependencies:
- `mocha` - Test framework
- `chai` - Assertion library
- `supertest` - HTTP testing
- `nock` - HTTP mocking
- `sinon` - Test spies and stubs
- `c8` - Code coverage

## Running Tests

### All Integration Tests

```bash
# Run all integration tests
pnpm test:integration

# Run with coverage
pnpm test:integration:coverage

# Run in watch mode
pnpm test:integration:watch
```

### Specific Test Categories

```bash
# Authentication workflows
pnpm test test/integration/workflows/auth-workflows.test.js

# Submission workflows
pnpm test test/integration/workflows/submission-workflows.test.js

# Federation workflows
pnpm test test/integration/workflows/federation-workflows.test.js

# Admin and moderation
pnpm test test/integration/workflows/admin-moderation-workflows.test.js

# API endpoints
pnpm test test/integration/api/api-endpoints.test.js

# I18n and accessibility
pnpm test test/integration/features/i18n-accessibility.test.js

# Monitoring and logging
pnpm test test/integration/features/monitoring-logging.test.js
```

### Test Filtering

```bash
# Run tests matching pattern
pnpm test --grep "authentication"

# Run specific test suite
pnpm test --grep "User Registration Workflow"

# Skip slow tests
pnpm test --grep "performance" --invert
```

## Test Configuration

### Mocha Configuration

The test suite uses Mocha with the following configuration (`.mocharc.json`):

```json
{
  "spec": "test/integration/**/*.test.js",
  "recursive": true,
  "timeout": 20000,
  "require": ["test/integration/setup.js"],
  "reporter": "spec",
  "exit": true,
  "bail": false,
  "checkLeaks": true,
  "globals": ["fetch", "Request", "Response", "Headers"],
  "extension": ["js"]
}
```

### Test Database

Integration tests use a separate test database to avoid conflicts with development data:

- **Isolation**: Each test suite cleans up after itself
- **Fixtures**: Consistent test data using factories
- **Transactions**: Tests run in isolated transactions when possible
- **Cleanup**: Automatic cleanup of test data patterns

## Writing Integration Tests

### Test Structure

Follow this pattern for new integration tests:

```javascript
import { expect } from 'chai';
import { testSupabase, testAuth, testUtils } from '../setup.js';
import DatabaseFixtures from '../fixtures/database.js';

describe('Feature Name', function() {
  this.timeout(15000);
  
  let fixtures;
  let testUser;
  let userSession;

  before(async () => {
    fixtures = new DatabaseFixtures();
  });

  beforeEach(async () => {
    await testUtils.cleanupTestData(['test_pattern_%']);
    
    testUser = await fixtures.createUser();
    const signInResult = await testAuth.signInUser(
      testUser.credentials.email,
      testUser.credentials.password
    );
    userSession = signInResult.session;
  });

  afterEach(async () => {
    await fixtures.cleanup();
  });

  describe('Specific Workflow', () => {
    it('should perform expected behavior', async function() {
      // Test implementation
      expect(result).to.be.true;
    });
  });
});
```

### Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always clean up test data to prevent interference
3. **Realistic Data**: Use realistic test data that mirrors production scenarios
4. **Error Cases**: Test both success and failure scenarios
5. **Performance**: Include performance assertions for critical paths
6. **Documentation**: Document complex test scenarios and edge cases

### Test Utilities

#### Database Fixtures

```javascript
// Create test user
const user = await fixtures.createUser({
  email: 'test@example.com',
  username: 'testuser'
});

// Create test submission
const submission = await fixtures.createSubmission(user.profile.id, {
  url: 'https://example.com',
  status: 'approved'
});

// Create complete scenario
const scenario = await fixtures.createCompleteScenario({
  userCount: 5,
  submissionCount: 10,
  withVotes: true,
  withComments: true
});
```

#### Authentication Helpers

```javascript
// Sign in user
const session = await testAuth.signInUser(email, password);

// Get auth headers
const headers = testAuth.getAuthHeaders(session);

// Create admin session
const adminSession = await testAuth.createAdminSession();
```

#### Test Utilities

```javascript
// Generate unique test ID
const testId = testUtils.generateTestId();

// Wait for async operations
await testUtils.sleep(1000);

// Retry flaky operations
const result = await testUtils.retry(async () => {
  return await someAsyncOperation();
}, 3, 1000);

// Clean up test data
await testUtils.cleanupTestData(['pattern_%']);
```

## Continuous Integration

### GitHub Actions

Example workflow for running integration tests:

```yaml
name: Integration Tests

on: [push, pull_request]

jobs:
  integration-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'pnpm'
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Setup test database
        run: |
          pnpm supabase start
          pnpm db:migrate
      
      - name: Run integration tests
        run: pnpm test:integration:coverage
        env:
          SUPABASE_URL: http://localhost:54321
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### Verbose Output

Enable verbose test output:

```bash
VERBOSE_TESTS=true pnpm test:integration
```

### Debug Specific Tests

```bash
# Debug with Node.js inspector
node --inspect-brk ./node_modules/.bin/mocha test/integration/workflows/auth-workflows.test.js

# Run single test with detailed output
pnpm test test/integration/workflows/auth-workflows.test.js --grep "should register new user" --reporter tap
```

### Common Issues

1. **Database Connection**: Ensure test database is running and accessible
2. **Environment Variables**: Check `.env.test` file is properly configured
3. **Port Conflicts**: Ensure test ports are available
4. **Cleanup Issues**: Run cleanup manually if tests leave orphaned data
5. **Timeout Issues**: Increase timeout for slow operations

### Cleanup Commands

```bash
# Clean up test database
pnpm db:reset:test

# Remove test files
rm -rf test/temp/*

# Reset test environment
pnpm test:setup:clean
```

## Coverage Reports

### Generating Coverage

```bash
# Generate coverage report
pnpm test:integration:coverage

# View HTML coverage report
open coverage/index.html

# Coverage thresholds
# - Statements: 80%
# - Branches: 75%
# - Functions: 80%
# - Lines: 80%
```

### Coverage Configuration

Coverage is configured in `package.json`:

```json
{
  "c8": {
    "reporter": ["text", "html", "lcov"],
    "exclude": [
      "test/**",
      "coverage/**",
      "node_modules/**"
    ],
    "threshold": {
      "statements": 80,
      "branches": 75,
      "functions": 80,
      "lines": 80
    }
  }
}
```

## Performance Testing

### Load Testing

Some integration tests include performance assertions:

```javascript
it('should handle concurrent requests efficiently', async function() {
  this.timeout(15000);
  
  const concurrentRequests = 50;
  const startTime = Date.now();
  
  // ... test implementation
  
  const duration = Date.now() - startTime;
  expect(duration).to.be.lessThan(5000); // Complete within 5 seconds
});
```

### Memory Testing

Monitor memory usage during tests:

```javascript
it('should not leak memory', async function() {
  const initialMemory = process.memoryUsage().heapUsed;
  
  // ... test operations
  
  global.gc(); // Force garbage collection
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = finalMemory - initialMemory;
  
  expect(memoryIncrease).to.be.lessThan(50 * 1024 * 1024); // Less than 50MB
});
```

## Contributing

### Adding New Tests

1. **Identify the workflow or feature** to test
2. **Create appropriate test file** in the correct directory
3. **Follow naming conventions**: `feature-name.test.js`
4. **Include comprehensive test cases** covering success, failure, and edge cases
5. **Add documentation** for complex test scenarios
6. **Update this README** if adding new test categories

### Test Review Checklist

- [ ] Tests are isolated and independent
- [ ] Test data is cleaned up properly
- [ ] Both success and failure cases are covered
- [ ] Performance assertions are included where relevant
- [ ] Tests follow the established patterns
- [ ] Documentation is updated if needed

## Troubleshooting

### Common Error Messages

**"Database connection failed"**
- Check if Supabase is running: `pnpm supabase status`
- Verify environment variables in `.env.test`
- Ensure test database is accessible

**"Test timeout"**
- Increase timeout in test or globally
- Check for hanging promises or unclosed connections
- Review async/await usage

**"Port already in use"**
- Stop other instances of the application
- Use different ports for testing
- Check for zombie processes

**"Authentication failed"**
- Verify test user creation
- Check session management
- Ensure proper cleanup between tests

### Getting Help

1. **Check the logs**: Enable verbose output for detailed information
2. **Review test patterns**: Look at existing tests for reference
3. **Database state**: Verify test database is in expected state
4. **Environment**: Ensure all required services are running

For additional help, consult the main project documentation or reach out to the development team.