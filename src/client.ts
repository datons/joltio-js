import { decodeRows } from './decode.js';
import { AuthenticationError, JoltioError, QueryError, RateLimitError } from './errors.js';
import type { Coverage, DimensionResult, MetadataResult, QueryResult, Row, SearchResult } from './types.js';

export const VERSION = '0.1.0';
export const DEFAULT_BASE_URL = 'https://api.joltio.app';
const API_PREFIX = '/data';

export interface JoltioOptions {
	/* Defaults to `JOLTIO_API_KEY` from the environment when one is readable (Node, Bun). In SvelteKit, pass it from `$env/static/private`. */
	apiKey?: string;
	baseUrl?: string;
	/* Per-request timeout in milliseconds. */
	timeout?: number;
	/* Custom fetch, e.g. SvelteKit's `event.fetch` or a test double. */
	fetch?: typeof fetch;
	/* The key gives access to your whole plan: it must never reach a browser. Only set this for a key that is meant to be public. */
	dangerouslyAllowBrowser?: boolean;
}

type Params = Record<string, string | number | undefined>;

function envKey(): string | undefined {
	const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
	return env?.JOLTIO_API_KEY || undefined;
}

function inBrowser(): boolean {
	return typeof window !== 'undefined' && typeof document !== 'undefined';
}

class Http {
	readonly baseUrl: string;
	readonly #apiKey: string;
	readonly #timeout: number;
	readonly #fetch: typeof fetch;

	constructor(options: JoltioOptions) {
		if (inBrowser() && !options.dangerouslyAllowBrowser)
			throw new JoltioError('@joltioapp/client runs on the server only: in SvelteKit, call it from +page.server.ts or +server.ts and send the rows to the page, never the key.');
		const apiKey = options.apiKey ?? envKey();
		if (!apiKey) throw new JoltioError('Credentials required. Pass apiKey or set JOLTIO_API_KEY.');
		this.#apiKey = apiKey;
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
		this.#timeout = options.timeout ?? 30_000;
		this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	async request<T>(method: 'GET' | 'POST', path: string, { params, body }: { params?: Params; body?: unknown } = {}): Promise<T> {
		const url = new URL(this.baseUrl + path);
		for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
		/* Cloudflare answers 403 (error 1010) to requests without a User-Agent of their own. Browsers ignore this header, which is fine: the client is server-side. */
		const headers: Record<string, string> = { 'X-API-Key': this.#apiKey, 'User-Agent': `joltio-js/${VERSION}`, Accept: 'application/json' };
		if (body !== undefined) headers['Content-Type'] = 'application/json';
		let response: Response;
		try {
			response = await this.#fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(this.#timeout) });
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new JoltioError(error instanceof Error && error.name === 'TimeoutError' ? `Request timed out after ${this.#timeout} ms` : `Connection failed: ${reason}`);
		}
		if (response.status === 401) throw new AuthenticationError();
		if (response.status === 429) {
			const retryAfter = Number(response.headers.get('Retry-After')) || null;
			const parsed: unknown = await response.json().catch(() => null);
			const detail = parsed && typeof parsed === 'object' && 'detail' in parsed ? (parsed as { detail: unknown }).detail : parsed;
			const tier = detail && typeof detail === 'object' && 'tier' in detail ? String((detail as { tier: unknown }).tier) : null;
			throw new RateLimitError(retryAfter, tier, detail);
		}
		if (response.status >= 400) throw new QueryError(response.status, (await response.text()).slice(0, 500));
		return (await response.json()) as T;
	}
}

/* `/data` endpoints, with the same names and arguments as `client.data` in the Python client. */
export class DataApi {
	readonly #http: Http;

	constructor(http: Http) {
		this.#http = http;
	}

	/* Read-only SQL (ClickHouse dialect). Returns decoded rows: one object per row, datetimes as `Date`. */
	async query<T extends Row = Row>(sql: string, options: { limit?: number } = {}): Promise<T[]> {
		return decodeRows<T>(await this.queryRaw(sql, options));
	}

	/* The response as the API sends it, with `columns`, `truncated` and `max_rows_applied`. */
	queryRaw(sql: string, { limit }: { limit?: number } = {}): Promise<QueryResult> {
		return this.#http.request<QueryResult>('POST', `${API_PREFIX}/query`, { body: limit === undefined ? { sql } : { sql, limit } });
	}

	/* First and last data point, row count and freshness per program. Ask this instead of `max(datetime)` or `count()` over a large table. */
	coverage(table?: string): Promise<Coverage[]> {
		return this.#http.request('GET', `${API_PREFIX}/coverage`, { params: { table } });
	}

	/* Searches the ESIOS indicator catalog. To find an I90 unit, use dimensions('unit', { q }). */
	search(q: string, { column }: { column?: string } = {}): Promise<SearchResult> {
		return this.#http.request('GET', `${API_PREFIX}/search`, { params: { q, column } });
	}

	metadata({ lang = 'en', detail = 'summary' }: { lang?: 'en' | 'es'; detail?: 'summary' | 'full' } = {}): Promise<MetadataResult> {
		return this.#http.request('GET', `${API_PREFIX}/metadata`, { params: { lang, detail } });
	}

	dimensions(dim: 'unit' | 'company' | 'technology' = 'unit', { detail = 'summary', q }: { detail?: 'summary' | 'full'; q?: string } = {}): Promise<DimensionResult> {
		return this.#http.request('GET', `${API_PREFIX}/dimensions`, { params: { dim, detail, q } });
	}

	async health(): Promise<boolean> {
		try {
			return (await this.#http.request<{ status?: string }>('GET', `${API_PREFIX}/health`)).status === 'ok';
		} catch {
			return false;
		}
	}
}

export class Joltio {
	readonly data: DataApi;
	readonly baseUrl: string;

	constructor(options: JoltioOptions = {}) {
		const http = new Http(options);
		this.baseUrl = http.baseUrl;
		this.data = new DataApi(http);
	}
}
