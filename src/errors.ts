/* Same hierarchy as the Python client (`joltio.exceptions`), so a skill can describe one set of errors for both languages. */

export class JoltioError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'JoltioError';
	}
}

export class AuthenticationError extends JoltioError {
	constructor(message = 'Invalid or missing API key.') {
		super(message);
		this.name = 'AuthenticationError';
	}
}

/* Invalid SQL, a table outside the plan (`table_not_allowed`), a query over the read cap (`query_too_expensive`, 422) or any other 4xx/5xx. */
export class QueryError extends JoltioError {
	readonly status: number;
	readonly detail: string;

	constructor(status: number, detail = '') {
		super(`Query error (${status}): ${detail}`);
		this.name = 'QueryError';
		this.status = status;
		this.detail = detail;
	}
}

/* 429 `quota_exhausted`: the hourly allowance of that traffic class is spent. Retrying the same query before `retryAfter` only spends more. */
export class RateLimitError extends JoltioError {
	readonly retryAfter: number | null;
	readonly tier: string | null;
	readonly detail: unknown;

	constructor(retryAfter: number | null, tier: string | null, detail: unknown) {
		const body = detail && typeof detail === 'object' ? (detail as { error?: string; upgrade?: string }) : null;
		const message = body
			? [body.error ?? 'Rate limit exceeded.', body.upgrade].filter(Boolean).join(' ')
			: `Rate limit exceeded.${retryAfter ? ` Retry after ${retryAfter}s.` : ''}`;
		super(message);
		this.name = 'RateLimitError';
		this.retryAfter = retryAfter;
		this.tier = tier;
		this.detail = detail;
	}
}
