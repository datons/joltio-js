# @joltioapp/client

TypeScript client for [Joltio Data](https://joltio.app/data/docs) (`api.joltio.app`): Spanish electricity-market data (ESIOS, I90, OMIE, MIBGAS) with read-only SQL. Same methods as the Python client [`joltio`](https://pypi.org/project/joltio/), for servers: SvelteKit, Bun, Node and edge runtimes. No dependencies; it uses `fetch`.

```bash
bun add @joltioapp/client
```

## Use it on the server

Your key gives access to your whole plan, so it must never reach a browser. The client refuses to start in one.

In SvelteKit 3, declare the key in `src/env.ts` and import it from `$app/env/private` (the `$env/*` modules are deprecated):

```ts
// src/env.ts
import { building } from '$app/env';
import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	JOLTIO_API_KEY: {
		// Required when the app starts; optional during `vite build`, which does not need it.
		schema: (value) => {
			if (!value && !building) throw new Error('Missing JOLTIO_API_KEY in .env');
			return value ?? '';
		}
	}
});
```

Create the client on first use, not when the module loads: `vite build` imports server modules without the key, and `new Joltio()` without a key throws `Credentials required`.

```ts
// src/lib/server/joltio.ts
import { JOLTIO_API_KEY } from '$app/env/private';
import { Joltio } from '@joltioapp/client';

let client: Joltio | undefined;
export const joltio = () => (client ??= new Joltio({ apiKey: JOLTIO_API_KEY }));
```

```ts
// src/routes/+page.server.ts
import { joltio } from '#lib/server/joltio.ts';

export const load = async () => ({
	prices: await joltio().data.query<{ day: Date; price: number }>(`
		SELECT toStartOfDay(datetime) AS day, avg(price) AS price
		FROM (SELECT datetime, argMax(price, inserted_at) AS price FROM omie.prices
		      WHERE country = 'ES' AND program = 'PDBF' AND datetime >= today() - 7
		      GROUP BY datetime)
		GROUP BY day ORDER BY day`)
});
```

SvelteKit reads `.env` from the app folder. If yours lives in a parent folder, add `env: { dir: '..' }` inside `sveltekit({...})` in `vite.config.ts`. On SvelteKit 2, read the key from `$env/dynamic/private` and import with `$lib/server/joltio`; the lazy client is the same.

The page receives plain rows; `examples/sveltekit` charts the day-ahead against the final I90 schedule of a battery.

Outside SvelteKit, `new Joltio()` reads `JOLTIO_API_KEY` from the environment.

## API

`client.data`:

| Method | Returns |
|---|---|
| `query<T>(sql, { limit? })` | Decoded rows: datetimes as `Date`, integers and decimals as `number` (`bigint` past 2^53), dates as `YYYY-MM-DD` |
| `queryRaw(sql, { limit? })` | The response as sent: `columns`, `rows`, `truncated`, `max_rows_applied` |
| `coverage(table?)` | First and last data point, rows and freshness per program |
| `search(q, { column? })` | Search the ESIOS indicator catalog by name |
| `metadata({ lang?, detail? })` | Schema, programs and global stats |
| `dimensions(dim?, { detail?, q? })` | Unit, company or technology registry (`items`); find an I90 unit code with `dimensions('unit', { q })` |
| `health()` | `true` when the API answers |

Before querying a large table, read `coverage()` instead of `max(datetime)` or `count()`, and always filter by date and program in the SQL.

## Errors

| Error | When |
|---|---|
| `AuthenticationError` | 401: missing or invalid key |
| `QueryError` (`status`, `detail`) | Bad SQL, `table_not_allowed` (your plan), `query_too_expensive` (422: narrow the range) |
| `RateLimitError` (`retryAfter`, `tier`) | 429 `quota_exhausted`: wait, don't retry the same query |
| `JoltioError` | Base class; also connection failures and timeouts |

## Development

```bash
bun install
bun test                               # unit tests; the live test runs when JOLTIO_API_KEY is set
bun run check && bun run build
```
