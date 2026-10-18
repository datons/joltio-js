<script lang="ts">
	let { data } = $props();

	const W = 720;
	const H = 260;
	const PAD = 40;

	const series = $derived(
		['PDBF', 'P48'].map((program) => ({
			program,
			points: data.hours.filter((h) => h.program === program)
		}))
	);
	const values = $derived(data.hours.map((h) => h.mwh));
	const min = $derived(Math.min(0, ...values));
	const max = $derived(Math.max(1, ...values));
	const x = (i: number) => PAD + (i * (W - 2 * PAD)) / 23;
	const y = (v: number) => H - PAD - ((v - min) * (H - 2 * PAD)) / (max - min);
	const hourLabel = (d: Date) => d.toLocaleTimeString('es-ES', { hour: '2-digit', timeZone: 'Europe/Madrid' });
</script>

<main>
	<h1>Programa diario y final de una batería</h1>
	<p class="sub">I90 de REE vía <code>@joltioapp/client</code> · {data.day} · consultado en el servidor</p>

	<form method="GET">
		<label>Día <input type="date" name="day" value={data.day} /></label>
		<button>Ver</button>
	</form>

	<nav>
		{#each data.units as u}
			<a href="?day={data.day}&unit={u.unit}" class:active={u.unit === data.unit}>
				{u.planta ?? u.unit} <small>{u.agente ?? ''} · {u.mwh.toFixed(0)} MWh</small>
			</a>
		{/each}
	</nav>

	{#if data.hours.length}
		<svg viewBox="0 0 {W} {H}" role="img" aria-label="Energía por hora, PDBF frente a P48">
			<line x1={PAD} x2={W - PAD} y1={y(0)} y2={y(0)} class="zero" />
			{#each series as s}
				<polyline class={s.program} points={s.points.map((p, i) => `${x(i)},${y(p.mwh)}`).join(' ')} />
			{/each}
			{#each series[0].points as p, i}
				{#if i % 3 === 0}<text x={x(i)} y={H - 12} text-anchor="middle">{hourLabel(p.hora)}h</text>{/if}
			{/each}
			<text x={PAD} y={18}>MWh</text>
		</svg>
		<p class="legend"><span class="PDBF">■ PDBF (diario)</span> <span class="P48">■ P48 (final)</span></p>
	{:else}
		<p>Sin datos para ese día.</p>
	{/if}
</main>

<style>
	main { max-width: 760px; margin: 2rem auto; font-family: system-ui, sans-serif; padding: 0 16px; }
	.sub { color: #666; margin-top: -0.5rem; }
	form { display: flex; gap: 0.5rem; align-items: end; margin: 1rem 0; }
	nav { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
	nav a { padding: 0.35rem 0.6rem; border: 1px solid #ddd; border-radius: 6px; text-decoration: none; color: inherit; }
	nav a.active { border-color: #0f766e; background: #f0fdfa; }
	small { color: #666; }
	svg { width: 100%; height: auto; }
	polyline { fill: none; stroke-width: 2; }
	polyline.PDBF, .legend .PDBF { stroke: #2563eb; color: #2563eb; }
	polyline.P48, .legend .P48 { stroke: #ea580c; color: #ea580c; }
	.zero { stroke: #ccc; }
	text { font-size: 11px; fill: #666; }
	.legend { display: flex; gap: 1rem; font-size: 0.9rem; }
</style>
