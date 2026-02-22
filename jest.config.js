/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    collectCoverageFrom: [
        "src/**/*.ts",
        "!src/index.ts",
        "!src/**/*.d.ts"
    ]
};
