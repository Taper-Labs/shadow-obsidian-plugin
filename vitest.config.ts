import { defineConfig } from 'vitest/config';

// Shadow writes the local calendar day in `date`; pin a zone east of UTC so
// tests catch code that uses the UTC day instead.
process.env.TZ = 'Asia/Seoul';

export default defineConfig({
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
	},
});
