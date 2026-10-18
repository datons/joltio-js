import type { QueryColumn, QueryResult, Row } from './types.js';

const WRAPPER = /^(?:Nullable|LowCardinality)\((.*)\)$/;
const TIME_ZONE = /DateTime(?:64)?\((?:\s*\d+\s*,)?\s*'([^']+)'\s*\)/;
const HAS_OFFSET = /(?:[+-]\d{2}:?\d{2}|Z)$/;

/* `Nullable(LowCardinality(String))` → `String`. */
function baseType(type: string): string {
	let t = type.trim();
	for (let m = t.match(WRAPPER); m; m = t.match(WRAPPER)) t = m[1].trim();
	return t;
}

type Decoder = (value: unknown) => unknown;

/* Offset of `zone` at `instant`, in ms: the wall clock the zone shows minus UTC. */
function zoneOffsetMs(instant: number, zone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(instant));
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant;
}

/* A wall-clock `YYYY-MM-DD HH:MM:SS` in `zone` → the instant. Two passes settle the offset on DST days; the repeated autumn hour resolves to its first occurrence. */
function wallClockInZone(text: string, zone: string): Date {
	const [date, time = '00:00:00'] = text.trim().split(/[ T]/);
	const [y, mo, d] = date.split('-').map(Number);
	const [h, mi, s] = time.split(':').map(Number);
	const asUtc = Date.UTC(y, mo - 1, d, h, mi, Math.trunc(s || 0), Math.round(((s || 0) % 1) * 1000));
	let instant = asUtc - zoneOffsetMs(asUtc, zone);
	instant = asUtc - zoneOffsetMs(instant, zone);
	return new Date(instant);
}

function toNumber(value: unknown): unknown {
	if (typeof value !== 'string') return value;
	const n = Number(value);
	if (Number.isNaN(n)) return value;
	return Number.isSafeInteger(n) || !/^-?\d+$/.test(value) ? n : BigInt(value);
}

function decoderFor(column: QueryColumn): Decoder | null {
	const type = baseType(column.type);
	if (/^DateTime/i.test(type)) {
		/* A datetime with an explicit offset is an instant already. Without one, it is wall-clock time in the zone of the column type, or UTC when the type names none. */
		const zone = type.match(TIME_ZONE)?.[1] ?? 'UTC';
		return (value) => {
			if (typeof value !== 'string') return value;
			const text = value.trim();
			return HAS_OFFSET.test(text) ? new Date(text.replace(' ', 'T')) : wallClockInZone(text, zone);
		};
	}
	/* `Date`/`Date32` stay `YYYY-MM-DD`: a JavaScript Date would pin a calendar day to midnight UTC and shift it in other zones. */
	if (/^Date/i.test(type)) return null;
	if (/^(?:U?Int\d+|Float\d+|Decimal)/i.test(type)) return toNumber;
	return null;
}

export function decodeRows<T extends Row = Row>(result: QueryResult): T[] {
	const decoders = result.columns.map(decoderFor);
	return result.rows.map((row) => {
		const out: Row = {};
		result.columns.forEach((column, i) => {
			const value = row[i];
			const decode = decoders[i];
			out[column.name] = value === null || value === undefined || !decode ? value : decode(value);
		});
		return out as T;
	});
}
