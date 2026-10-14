/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: '<rootDir>/src/test/environment.cjs',
  // Resolve packages to their Node/CommonJS builds instead of the browser ESM builds.
  testEnvironmentOptions: { customExportConditions: [''] },
  roots: ['<rootDir>/src'],
  setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
  transform: {
    '^.+\\.(t|j)sx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', tsx: true },
          transform: { react: { runtime: 'automatic' } },
        },
      },
    ],
  },
  moduleNameMapper: { '\\.css$': '<rootDir>/src/test/styleMock.cjs' },
};
