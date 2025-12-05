export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // New feature
        "fix",      // Bug fix
        "docs",     // Documentation
        "style",    // Code style (formatting, etc.)
        "refactor", // Code refactoring
        "perf",     // Performance improvement
        "test",     // Tests
        "build",    // Build system
        "ci",       // CI configuration
        "chore",    // Maintenance
        "revert",   // Revert commit
      ],
    ],
    "subject-case": [0], // Disable case checking for Chinese commits
    "header-max-length": [2, "always", 100],
  },
};
