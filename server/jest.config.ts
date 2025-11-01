import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/?(*.)+(spec|test).ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js'],
  clearMocks: true,
  verbose: true,
  moduleNameMapper: {
    '^(.*)\\.(css|less|scss|sass)$': '<rootDir>/test/__mocks__/styleMock.ts',
  },
};

export default config;

