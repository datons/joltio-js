import { JOLTIO_API_KEY } from '$app/env/private';
import { Joltio } from '@joltioapp/client';

/* Server-only module (src/lib/server): SvelteKit refuses to import it from code that reaches the browser, so the key stays here. The client is created on first use, inside a load function: `bun run build` imports server modules without the key. */
let client: Joltio | undefined;
export const joltio = () => (client ??= new Joltio({ apiKey: JOLTIO_API_KEY }));
