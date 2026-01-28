module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(test|property).ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.property.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 10000,
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  // Separate test patterns for unit and property tests
  projects: [
    {
      preset: 'ts-jest',
      testEnvironment: 'node',
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testTimeout: 5000,
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
    },
    {
      preset: 'ts-jest',
      testEnvironment: 'node',
      displayName: 'property',
      testMatch: ['<rootDir>/src/**/*.property.ts'],
      testTimeout: 30000,
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
    }
  ]
};