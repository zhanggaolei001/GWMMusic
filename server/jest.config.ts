import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  // Ignore E2E tests by default; run them via dedicated scripts
  testPathIgnorePatterns: ['<rootDir>/test/.*e2e.*\\.test\\.ts$'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    '^(.*)\\.(css|less|scss|sass)$': '<rootDir>/test/__mocks__/styleMock.ts',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.test.json',
      },
    ],
  },
};

export default config;
