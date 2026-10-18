import { joltio } from '$lib/server/joltio';
import type { PageServerLoad } from './$types';

type Unit = { unit: string; planta: string; agente: string | null; mwh: number };
type Hour = { hora: Date; program: string; mwh: number };

export const load: PageServerLoad = async ({ url }) => {
	const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('day') ?? '') ? url.searchParams.get('day')! : '2026-07-01';
	const next = new Date(`${day}T00:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	const range = `datetime >= '${day}' AND datetime < '${next.toISOString().slice(0, 10)}'`;

	const units = await joltio.data.query<Unit>(
		`SELECT unit, any(plant_name) AS planta, any(agent_group) AS agente, sum(abs(energy)) AS mwh
		 FROM esios.archives_i90
		 WHERE program = 'P48' AND ${range} AND technology = 'Batería electroquímica'
		 GROUP BY unit ORDER BY mwh DESC LIMIT 5`
	);
	const requested = url.searchParams.get('unit');
	const unit = units.find((u) => u.unit === requested)?.unit ?? units[0]?.unit;

	const hours = unit
		? await joltio.data.query<Hour>(
				`SELECT toStartOfHour(datetime) AS hora, program, sum(energy) AS mwh
				 FROM esios.archives_i90
				 WHERE unit = '${unit}' AND program IN ('PDBF', 'P48') AND ${range}
				 GROUP BY hora, program ORDER BY hora, program`
			)
		: [];

	return { day, unit, units, hours };
};
