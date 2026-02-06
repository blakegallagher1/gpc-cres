import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const customConfig = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/test-utils/jest.setup.ts"],
  testPathIgnorePatterns: ["<rootDir>/e2e/"]
};

export default createJestConfig(customConfig);
