import { env } from '$env/dynamic/private';
import { Joltio } from 'joltio';

/* Server-only module ($lib/server): SvelteKit refuses to import it from code that reaches the browser, so the key stays here. */
export const joltio = new Joltio({ apiKey: env.JOLTIO_API_KEY });
