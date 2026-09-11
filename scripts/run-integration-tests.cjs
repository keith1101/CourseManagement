const { execFileSync } = require('node:child_process');

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  console.error(
    'TEST_DATABASE_URL is required. Use a disposable PostgreSQL database; never run integration tests against the development/cloud-proxy database.',
  );
  process.exit(1);
}

const env = {
  ...process.env,
  // The integration suite intentionally uses this isolated URL instead of
  // inheriting DATABASE_URL from a developer's .env file.
  DATABASE_URL: testDatabaseUrl,
};

execFileSync(
  process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
  ['exec', 'jest', '--runInBand', 'attempts.integration.spec.ts'],
  { stdio: 'inherit', env },
);
