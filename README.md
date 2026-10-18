# @joltioapp/client

TypeScript client for [Joltio Data](https://joltio.app/data/docs) (`api.joltio.app`): Spanish electricity-market data (ESIOS, I90, OMIE, MIBGAS) with read-only SQL. Same methods as the Python client [`joltio`](https://pypi.org/project/joltio/), for servers: SvelteKit, Bun, Node and edge runtimes. No dependencies; it uses `fetch`.

```bash
bun add @joltioapp/client
```

## Use it on the server

Your key gives access to your whole plan, so it must never reach a browser. The client refuses to start in one.

```ts
// src/lib/server/joltio.ts
import { env } from '$env/dynamic/private';
import { Joltio } from '@joltioapp/client';

export const joltio = new Joltio({ apiKey: env.JOLTIO_API_KEY });
```

```ts
// src/routes/+page.server.ts
import { joltio } from '$lib/server/joltio';

export const load = async () => ({
	prices: await joltio.data.query<{ day: Date; price: number }>(`
		SELECT toStartOfDay(datetime) AS day, avg(price) AS price
		FROM (SELECT datetime, argMax(price, inserted_at) AS price FROM omie.prices
		      WHERE country = 'ES' AND program = 'PDBF' AND datetime >= today() - 7
		      GROUP BY datetime)
		GROUP BY day ORDER BY day`)
});
```

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
