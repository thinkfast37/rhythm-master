import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js', '.claude/skills/*/tests/*.test.js'],
    environment: 'node',
    reporters: ['default', ['json', { outputFile: 'tests/.vitest-report.json' }]],
  },
});
