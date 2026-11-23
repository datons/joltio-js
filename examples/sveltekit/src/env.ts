/* Environment variables of the app (SvelteKit 3): declared here and imported from $app/env/private. */
import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	JOLTIO_API_KEY: {
		/* Required when the app starts; optional during `bun run build`, which does not need it. */
		schema: (value) => {
			if (!value && !building) throw new Error('Missing JOLTIO_API_KEY in .env');
			return value ?? '';
		}
	}
});
