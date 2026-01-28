module.exports = {
  preset: 'react-native',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.{ts,tsx}',
    '**/?(*.)+(test|property).{ts,tsx}'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.test.{ts,tsx}',
    '!src/**/*.property.{ts,tsx}'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  testTimeout: 10000,
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  // Separate test patterns for unit and property tests
  projects: [
    {
      preset: 'react-native',
      displayName: 'unit',
      testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
      testTimeout: 5000,
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
    },
    {
      preset: 'react-native',
      displayName: 'property',
      testMatch: ['<rootDir>/src/**/*.property.{ts,tsx}'],
      testTimeout: 30000,
      setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts']
    }
  ]
};