import { describe, expect, it } from 'bun:test';
import { AuthenticationError, Joltio, JoltioError, QueryError, RateLimitError, decodeRows } from '../src/index.js';

type Call = { url: URL; init: RequestInit };

function fakeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
	const calls: Call[] = [];
	const fn = (async (url: URL, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
	}) as unknown as typeof fetch;
	return { fn, calls };
}

const result = {
	columns: [
		{ name: 'hora', type: "DateTime('Europe/Madrid')" },
		{ name: 'program', type: 'LowCardinality(String)' },
		{ name: 'mwh', type: 'Nullable(Float64)' },
		{ name: 'filas', type: 'UInt64' },
		{ name: 'dia', type: 'Date' }
	],
	rows: [['2026-07-01 00:00:00', 'PDBF', 20.175, '96', '2026-07-01']],
	row_count: 1,
	query_type: 'aggregated',
	max_rows_applied: 10000,
	truncated: false
};

describe('request contract', () => {
	it('posts the SQL with the key and a User-Agent of its own', async () => {
		const { fn, calls } = fakeFetch(200, result);
		const rows = await new Joltio({ apiKey: 'jol_test', fetch: fn }).data.query('SELECT 1', { limit: 5 });
		expect(rows).toHaveLength(1);
		const [{ url, init }] = calls;
		expect(url.href).toBe('https://api.joltio.app/data/query');
		expect(init.method).toBe('POST');
		expect(JSON.parse(String(init.body))).toEqual({ sql: 'SELECT 1', limit: 5 });
		const headers = init.headers as Record<string, string>;
		expect(headers['X-API-Key']).toBe('jol_test');
		expect(headers['User-Agent']).toMatch(/^joltio-js\//);
	});

	it('sends GET parameters and drops the undefined ones', async () => {
		const { fn, calls } = fakeFetch(200, []);
		await new Joltio({ apiKey: 'k', fetch: fn, baseUrl: 'https://example.test/' }).data.coverage('esios.archives_i90');
		await new Joltio({ apiKey: 'k', fetch: fn }).data.coverage();
		expect(calls[0].url.href).toBe('https://example.test/data/coverage?table=esios.archives_i90');
		expect(calls[1].url.search).toBe('');
	});

	it('requires a key', () => {
		const saved = process.env.JOLTIO_API_KEY;
		delete process.env.JOLTIO_API_KEY;
		expect(() => new Joltio()).toThrow(JoltioError);
		if (saved) process.env.JOLTIO_API_KEY = saved;
	});

	it('refuses to run in a browser unless told to', () => {
		const g = globalThis as Record<string, unknown>;
		g.window = {};
		g.document = {};
		try {
			expect(() => new Joltio({ apiKey: 'k' })).toThrow(/server only/);
			expect(() => new Joltio({ apiKey: 'k', dangerouslyAllowBrowser: true })).not.toThrow();
		} finally {
			delete g.window;
			delete g.document;
		}
	});
});

describe('errors', () => {
	it('maps 401, 422 and 429 like the Python client', async () => {
		const client = (status: number, body: unknown, headers?: Record<string, string>) => new Joltio({ apiKey: 'k', fetch: fakeFetch(status, body, headers).fn });
		expect(client(401, {}).data.query('x')).rejects.toBeInstanceOf(AuthenticationError);
		const tooExpensive = await client(422, '{"error":"query_too_expensive"}').data.query('x').catch((e) => e);
		expect(tooExpensive).toBeInstanceOf(QueryError);
		expect(tooExpensive.status).toBe(422);
		expect(tooExpensive.detail).toContain('query_too_expensive');
		const limited = await client(429, { detail: { error: 'quota_exhausted', tier: 'explorer' } }, { 'Retry-After': '120' }).data.query('x').catch((e) => e);
		expect(limited).toBeInstanceOf(RateLimitError);
		expect(limited.retryAfter).toBe(120);
		expect(limited.tier).toBe('explorer');
	});

	it('health is false instead of throwing', async () => {
		expect(await new Joltio({ apiKey: 'k', fetch: fakeFetch(503, 'down').fn }).data.health()).toBe(false);
		expect(await new Joltio({ apiKey: 'k', fetch: fakeFetch(200, { status: 'ok' }).fn }).data.health()).toBe(true);
	});
});

describe('decoding', () => {
	it('turns rows into objects with typed values', () => {
		const [row] = decodeRows(result);
		expect(row.hora).toEqual(new Date('2026-06-30T22:00:00Z'));
		expect(row.program).toBe('PDBF');
		expect(row.mwh).toBe(20.175);
		expect(row.filas).toBe(96);
		expect(row.dia).toBe('2026-07-01');
	});

	it('keeps an explicit offset and resolves wall-clock time across the DST change', () => {
		const rows = decodeRows({
			...result,
			columns: [{ name: 't', type: "DateTime('Europe/Madrid')" }],
			rows: [['2026-07-01T00:00:00+02:00'], ['2026-10-25 01:00:00'], ['2026-10-25 04:00:00'], ['2026-03-29 03:00:00']]
		});
		expect(rows.map((r) => (r.t as Date).toISOString())).toEqual(['2026-06-30T22:00:00.000Z', '2026-10-24T23:00:00.000Z', '2026-10-25T03:00:00.000Z', '2026-03-29T01:00:00.000Z']);
	});

	it('leaves nulls alone and uses bigint past 2^53', () => {
		const [row] = decodeRows({ ...result, columns: [{ name: 'a', type: 'Nullable(Float64)' }, { name: 'b', type: 'UInt64' }], rows: [[null, '18446744073709551615']] });
		expect(row.a).toBeNull();
		expect(row.b).toBe(18446744073709551615n);
	});
});

const liveKey = process.env.JOLTIO_API_KEY;
describe.skipIf(!liveKey)('live API', () => {
	it('answers a bounded I90 query', async () => {
		const j = new Joltio();
		expect(await j.data.health()).toBe(true);
		const rows = await j.data.query<{ hora: Date; program: string; mwh: number }>(
			"SELECT toStartOfHour(datetime) AS hora, program, sum(energy) AS mwh FROM esios.archives_i90 WHERE program IN ('PDBF', 'P48') AND datetime >= '2026-07-01' AND datetime < '2026-07-02' AND technology = 'Batería electroquímica' GROUP BY hora, program ORDER BY hora, program"
		);
		expect(rows.length).toBe(48);
		expect(rows[0].hora).toBeInstanceOf(Date);
		expect(rows[0].hora.toISOString()).toBe('2026-06-30T22:00:00.000Z');
		expect(typeof rows[0].mwh).toBe('number');
	}, 60_000);
});
