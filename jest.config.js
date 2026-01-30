const { createDefaultPreset } = require('ts-jest');

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: 'node',
  transform: {
    ...tsJestTransformCfg,
  },
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@types/uuid)/)'
  ],
  moduleNameMapper: {
    '^uuid$': '<rootDir>/tests/mocks/uuid.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  reporters: ['default', '<rootDir>/tests/jest-qa-reporter.js'],
};
