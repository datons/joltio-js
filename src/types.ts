/* Response shapes of the `/data` endpoints, kept in the API's own snake_case so they match the docs and the Python models (`joltio.esios.models`). */

export interface QueryColumn {
	name: string;
	/* ClickHouse type, e.g. `DateTime('Europe/Madrid')`, `Nullable(Float64)`, `LowCardinality(String)`. */
	type: string;
}

export interface QueryResult {
	columns: QueryColumn[];
	rows: unknown[][];
	row_count: number;
	query_type: string;
	max_rows_applied: number;
	truncated: boolean;
}

export interface CoverageSplit {
	table_name: string;
	split_value: string | null;
	min_datetime: string | null;
	max_datetime: string | null;
	max_actual_datetime: string | null;
	row_count: number | null;
	last_ingest_at: string | null;
	expected_lag: string | null;
	status: string | null;
}

export interface Coverage extends CoverageSplit {
	splits?: CoverageSplit[];
	tiers?: string[];
	[key: string]: unknown;
}

export interface SearchResult {
	query: string;
	count: number;
	results: Record<string, unknown>[];
	hints: string[] | null;
	offset: number;
}

export interface DimensionResult {
	dimension: string;
	detail: string;
	count: number;
	values: string[];
	records: Record<string, unknown>[];
}

export interface MetadataResult {
	schema_info: { table: string; database: string; engine?: string | null; columns: { name: string; type: string; nullable?: boolean; description?: string }[] };
	programs: Record<string, unknown>[];
	global_stats?: Record<string, unknown> | null;
	categorical_values?: Record<string, string[]>;
}

/* A decoded row: datetimes become `Date`, integers and decimals become `number` (or `bigint` past 2^53), dates stay `YYYY-MM-DD` strings. */
export type Row = Record<string, unknown>;
