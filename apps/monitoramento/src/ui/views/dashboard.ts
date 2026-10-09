import { calcResumo, somaDeltas } from "../../domain/calc";
import { CAMPOS, GRUPOS } from "../../domain/config";
import { dFmt, dtFmt, esc, fmt } from "../../domain/format";
import type { CampoKey, Point, Reading } from "../../domain/types";
import { leiturasVisiveis, state } from "../../data/store";
import type { ChartConfiguration, ChartTypeRegistry } from "chart.js";
import { Chart, PAST, cor, coresTela, linhas, tickData, type Serie } from "../charts";
import { F, filtrosHtml, janela, ligarFiltros, pontosFiltro, regsFiltro } from "../filtros";
import type { View } from "../dom";

const MSG_CONS = "Disponível a partir da segunda leitura de cada ponto, quando o consumo já pode ser calculado.";

interface Indicador {
  v: string;
  rot: string;
  campo: CampoKey;
  modo: "v" | "d";
}

export function indicadores(): Indicador[] {
  const cs = new Set<CampoKey>();
  pontosFiltro().forEach((p) => GRUPOS[p.grupo].campos.forEach((k) => cs.add(k)));
  const l: Indicador[] = [];
  (Object.keys(CAMPOS) as CampoKey[]).forEach((k) => {
    if (!cs.has(k)) return;
    const d = CAMPOS[k];
    l.push({ v: k + "|v", rot: k === "nivel" ? "Nível d'água (m)" : `${d.rot}, leitura acumulada (${d.un})`, campo: k, modo: "v" });
    if (d.cum) l.push({ v: k + "|d", rot: `${d.rot}, ${k === "hid" ? "volume entre uma leitura e outra (m³)" : "horas funcionadas entre leituras (h)"}`, campo: k, modo: "d" });
  });
  return l;
}

export function viewDashboard(): View {
  const charts: Record<string, Chart<keyof ChartTypeRegistry, unknown, unknown>> = {};
  let el!: HTMLElement;

  const destruir = (id: string) => {
    charts[id]?.destroy();
    delete charts[id];
  };
  const mk = (id: string, cfg: ChartConfiguration<keyof ChartTypeRegistry, unknown, unknown>) => {
    destruir(id);
    const cv = el.querySelector<HTMLCanvasElement>("#" + id);
    if (cv) charts[id] = new Chart(cv.getContext("2d")!, cfg);
  };
  const estado = (id: string, ok: boolean, msg: string) => {
    const cv = el.querySelector<HTMLElement>("#" + id);
    const box = cv?.parentElement;
    const n = el.querySelector<HTMLElement>("#n-" + id);
    if (box) box.hidden = !ok;
    if (n) {
      n.className = ok ? "nota" : "vazio";
      n.textContent = ok ? "" : msg;
    }
    if (!ok) destruir(id);
  };

  function porPonto(rs: Reading[], campo: CampoKey): { nome: string; val: number }[] {
    return pontosFiltro()
      .filter((p) => GRUPOS[p.grupo].campos.includes(campo))
      .map((p) => ({ nome: p.nome, val: somaDeltas(state.index, rs.filter((r) => r.point_id === p.id), campo) || 0 }));
  }

  function pizza(id: string, dados: { nome: string; val: number }[], un: string): void {
    const l = dados.filter((d) => d.val > 0);
    estado(id, l.length > 0, MSG_CONS);
    if (!l.length) return;
    const tot = l.reduce((a, d) => a + d.val, 0);
    mk(id, {
      type: "pie",
      data: {
        labels: l.map((d) => `${d.nome} · ${fmt(d.val)} ${un} (${((d.val / tot) * 100).toFixed(1).replace(".", ",")}%)`),
        datasets: [{ data: l.map((d) => d.val), backgroundColor: l.map((_d, i) => PAST[i % PAST.length].f), borderColor: cor("--surface"), borderWidth: 3, hoverOffset: 8 }]
      },
      options: { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { position: "bottom", labels: { color: cor("--ink"), boxWidth: 12, padding: 10 } }, tooltip: { callbacks: { label: (it) => `${fmt(it.parsed)} ${un}` } } } }
    });
  }

  function opcoesEvol(campos: CampoKey[]) {
    const o: { v: string; nome: string; p: Point; campo: CampoKey }[] = [];
    pontosFiltro().forEach((p) =>
      GRUPOS[p.grupo].campos.forEach((k) => {
        if (campos.includes(k)) o.push({ v: p.id + "|" + k, nome: p.grupo === "ete" ? `${p.nome}, ${CAMPOS[k].rot.toLowerCase()}` : p.nome, p, campo: k });
      })
    );
    return o;
  }

  function evol(key: "pz" | "hid" | "hor", campos: CampoKey[], modoKey: "hidm" | "horm" | null, cIdx: number, rs: Reading[], w: { ini: number; fim: number }): void {
    const ops = opcoesEvol(campos);
    const sel = el.querySelector<HTMLSelectElement>("#e-" + key)!;
    const sub = el.querySelector<HTMLElement>("#es-" + key)!;
    const cvId = "ec-" + key;
    if (!ops.some((o) => o.v === F[key])) {
      const com = ops.find((o) => rs.some((r) => r.point_id === o.p.id && r.v[o.campo] != null));
      F[key] = (com ?? ops[0])?.v ?? "";
    }
    sel.innerHTML = ops.map((o) => `<option value="${esc(o.v)}"${o.v === F[key] ? " selected" : ""}>${esc(o.nome)}</option>`).join("");
    sel.hidden = !ops.length;
    const modo = (modoKey ? F[modoKey] : "v") as "v" | "d";
    if (modoKey) el.querySelector<HTMLSelectElement>(`#e-${key}-m`)!.value = modo;
    const o = ops.find((x) => x.v === F[key]);
    sub.textContent = "";
    estado(cvId, true, "");
    if (!o) return estado(cvId, false, "Nenhum ponto deste tipo corresponde aos filtros selecionados.");
    const d = CAMPOS[o.campo];
    const l = rs.filter((r) => r.point_id === o.p.id && r.v[o.campo] != null).sort((a, b) => a.ts - b.ts);
    const pts = l.map((r) => ({ x: r.ts, y: modo === "d" ? state.index.delta(r, o.campo) : (r.v[o.campo] as number) })).filter((q): q is { x: number; y: number } => q.y != null);
    if (!pts.length) {
      estado(cvId, false, l.length && modo === "d" ? MSG_CONS : "Não há leituras deste ponto no período selecionado.");
      if (l.length) sub.textContent = `Última leitura: ${fmt(l[l.length - 1].v[o.campo])} ${d.un} em ${dtFmt(l[l.length - 1].ts)}`;
      return;
    }
    const ult = l[l.length - 1];
    let t: string;
    if (modo === "d") t = `Total no período: ${fmt(pts.reduce((a, q) => a + q.y, 0))} ${d.un} em ${pts.length} ${pts.length === 1 ? "intervalo" : "intervalos"}`;
    else {
      t = `Última leitura: ${fmt(ult.v[o.campo])} ${d.un} em ${dtFmt(ult.ts)}`;
      if (l.length > 1) {
        const dv = (ult.v[o.campo] as number) - (l[0].v[o.campo] as number);
        t += ` · variação ${dv > 0 ? "+" : ""}${fmt(dv)} ${d.un}${o.campo === "nivel" ? (dv > 0.004 ? " (nível mais fundo)" : dv < -0.004 ? " (nível mais raso)" : " (estável)") : ""}`;
      }
    }
    if (o.p.prof && o.campo === "nivel") t += ` · profundidade ${o.p.prof} m`;
    sub.textContent = t;
    if (pts.length === 1) el.querySelector<HTMLElement>("#n-" + cvId)!.textContent = "Há apenas uma leitura no período. A linha de evolução aparece a partir da segunda.";
    const c = PAST[cIdx];
    const umDia = isFinite(w.ini) && isFinite(w.fim) && w.fim - w.ini < 2 * 86400000;
    mk(cvId, {
      type: "line",
      data: { datasets: [{ label: o.nome, data: pts, borderColor: c.s, backgroundColor: c.f + "66", pointBackgroundColor: c.f, pointBorderColor: c.s, pointRadius: 5, pointHoverRadius: 7, borderWidth: 2.5, tension: 0.15, fill: true }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false, parsing: false,
        scales: {
          x: { type: "linear", min: isFinite(w.ini) ? w.ini : undefined, max: isFinite(w.fim) ? w.fim : undefined, ticks: { color: cor("--muted"), maxTicksLimit: 6, callback: (v) => tickData(v, umDia) }, grid: { color: cor("--line") } },
          y: { reverse: o.campo === "nivel", beginAtZero: modo === "d", ticks: { color: cor("--muted") }, grid: { color: cor("--line") }, title: { display: true, text: o.campo === "nivel" ? "metros de profundidade" : d.un, color: cor("--muted") } }
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (it) => dtFmt(it[0].parsed.x as number), label: (it) => `${fmt(it.parsed.y as number)} ${d.un}` } } }
      }
    });
  }

  function comparacoes(rs: Reading[], w: { ini: number; fim: number }): void {
    pizza("c-vol", porPonto(rs, "hid"), "m³");
    pizza("c-hor", porPonto(rs, "hor"), "h");
    const nivs: { nome: string; val: number }[] = [];
    pontosFiltro().filter((p) => p.grupo === "pz").forEach((p) => {
      const l = rs.filter((r) => r.point_id === p.id && r.v.nivel != null).sort((a, b) => b.ts - a.ts)[0];
      if (l) nivs.push({ nome: p.nome, val: l.v.nivel as number });
    });
    estado("c-niv", nivs.length > 0, "Não há leituras de piezômetros no período selecionado.");
    if (nivs.length)
      mk("c-niv", {
        type: "bar",
        data: { labels: nivs.map((d) => d.nome), datasets: [{ label: "Nível (m)", data: nivs.map((d) => d.val), backgroundColor: nivs.map((_d, i) => PAST[i % PAST.length].f), borderColor: nivs.map((_d, i) => PAST[i % PAST.length].s), borderWidth: 1.5, borderRadius: 6 }] },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { beginAtZero: true, ticks: { color: cor("--muted") }, grid: { color: cor("--line") }, title: { display: true, text: "metros", color: cor("--muted") } }, y: { ticks: { color: cor("--ink") }, grid: { display: false } } }, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (it) => `${fmt(it.parsed.x as number)} m` } } } }
      });

    const opcs: { v: string; rot: string; un: string }[] = [];
    if (pontosFiltro().some((p) => GRUPOS[p.grupo].campos.includes("hid"))) opcs.push({ v: "hid", rot: "Volume (m³)", un: "m³" });
    if (pontosFiltro().some((p) => GRUPOS[p.grupo].campos.includes("hor"))) opcs.push({ v: "hor", rot: "Horas de funcionamento (h)", un: "h" });
    if (!opcs.some((o) => o.v === F.comp)) F.comp = opcs[0]?.v ?? "";
    const dc = el.querySelector<HTMLSelectElement>("#d-comp")!;
    dc.innerHTML = opcs.map((o) => `<option value="${o.v}"${o.v === F.comp ? " selected" : ""}>${esc(o.rot)}</option>`).join("");
    dc.hidden = !opcs.length;
    const op = opcs.find((o) => o.v === F.comp);
    const sub = el.querySelector<HTMLElement>("#s-comp")!;
    sub.textContent = "Compara o consumo de cada ponto com o período anterior de mesma duração.";
    if (!op) return estado("c-comp", false, "Selecione a categoria Poços e Cava (ou todas) para comparar volume e horas.");
    if (!isFinite(w.ini) || !isFinite(w.fim)) return estado("c-comp", false, "Informe a data inicial e a data final para comparar com o período anterior.");
    const L = w.fim - w.ini + 1000;
    const pIni = w.ini - L;
    const pFim = w.ini - 1;
    sub.textContent = `Período anterior: ${dFmt(pIni)} a ${dFmt(pFim)}.`;
    const ids = new Set(pontosFiltro().map((p) => p.id));
    const prev = leiturasVisiveis().filter((r) => ids.has(r.point_id) && r.ts >= pIni && r.ts <= pFim);
    const cur = porPonto(rs, op.v as CampoKey);
    const ant = porPonto(prev, op.v as CampoKey);
    const rot: string[] = [], dcur: number[] = [], dant: number[] = [];
    cur.forEach((c, i) => {
      if (c.val > 0 || ant[i].val > 0) {
        rot.push(c.nome);
        dcur.push(c.val);
        dant.push(ant[i].val);
      }
    });
    estado("c-comp", rot.length > 0, MSG_CONS);
    if (!rot.length) return;
    mk("c-comp", {
      type: "bar",
      data: { labels: rot, datasets: [
        { label: "Período anterior", data: dant, backgroundColor: PAST[7].f, borderColor: PAST[7].s, borderWidth: 1.5, borderRadius: 6 },
        { label: "Período atual", data: dcur, backgroundColor: PAST[0].f, borderColor: PAST[0].s, borderWidth: 1.5, borderRadius: 6 }] },
      options: { responsive: true, maintainAspectRatio: false, animation: false, scales: { x: { ticks: { color: cor("--ink") }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: cor("--muted") }, grid: { color: cor("--line") }, title: { display: true, text: op.un, color: cor("--muted") } } }, plugins: { legend: { labels: { color: cor("--ink") } }, tooltip: { callbacks: { label: (it) => `${it.dataset.label}: ${fmt(it.parsed.y as number)} ${op.un}` } } } }
    });
  }

  function seriesDe(ind: Indicador, rs: Reading[]): Serie[] {
    const out: Serie[] = [];
    pontosFiltro().forEach((p) => {
      if (!GRUPOS[p.grupo].campos.includes(ind.campo)) return;
      const pts = rs
        .filter((r) => r.point_id === p.id && r.v[ind.campo] != null)
        .sort((a, b) => a.ts - b.ts)
        .map((r) => ({ x: r.ts, y: ind.modo === "d" ? state.index.delta(r, ind.campo) : (r.v[ind.campo] as number) }))
        .filter((q): q is { x: number; y: number } => q.y != null);
      if (pts.length) out.push({ nome: p.nome, pts });
    });
    return out;
  }

  const kpi = (k: string, v: string, u: string) => `<div class="kpi"><div class="k">${esc(k)}</div><div class="v">${v}${u ? `<small>${u}</small>` : ""}</div></div>`;

  function draw(): void {
    const rs = regsFiltro();
    const w = janela();
    el.querySelector("#filtros")!.innerHTML = filtrosHtml();
    let k = kpi("Leituras registradas", String(rs.length), "");
    k += kpi("Pontos monitorados", String(new Set(rs.map((r) => r.point_id)).size), "");
    const vol = somaDeltas(state.index, rs, "hid");
    if (vol != null) k += kpi("Volume medido nos hidrômetros", fmt(vol), "m³");
    const hb = somaDeltas(state.index, rs, "hor");
    if (hb != null) k += kpi("Horas de funcionamento (poços e cava)", fmt(hb), "h");
    const h1 = somaDeltas(state.index, rs, "hor1");
    const h2 = somaDeltas(state.index, rs, "hor2");
    if (h1 != null) k += kpi("ETE: horas do horímetro 1", fmt(h1), "h");
    if (h2 != null) k += kpi("ETE: horas do horímetro 2", fmt(h2), "h");
    const nv = rs.filter((r) => r.v.nivel != null).map((r) => r.v.nivel as number);
    if (nv.length) k += kpi("Nível médio dos piezômetros", fmt(nv.reduce((a, b) => a + b, 0) / nv.length), "m");
    el.querySelector("#kpis")!.innerHTML = k;

    const inds = indicadores();
    if (!inds.some((i) => i.v === F.ind)) F.ind = inds[0]?.v ?? "";
    el.querySelector("#d-ind")!.innerHTML = inds.map((i) => `<option value="${i.v}"${i.v === F.ind ? " selected" : ""}>${esc(i.rot)}</option>`).join("");
    destruir("grafico");
    const nota = el.querySelector<HTMLElement>("#graf-nota")!;
    nota.textContent = "";
    const ind = inds.find((i) => i.v === F.ind);
    if (ind) {
      const s = seriesDe(ind, leiturasVisiveis().filter((r) => r.ts >= w.ini && r.ts <= w.fim));
      if (s.length) {
        charts.grafico = new Chart(el.querySelector<HTMLCanvasElement>("#grafico")!.getContext("2d")!, linhas(ind.campo, ind.modo, coresTela(), s, w));
        if (ind.campo === "nivel") nota.textContent = "Eixo invertido: quanto mais abaixo no gráfico, maior a profundidade do nível d'água.";
      } else nota.textContent = "Não há leituras deste indicador para o período e os pontos selecionados.";
    } else nota.textContent = "Nenhum indicador disponível para os filtros selecionados.";

    const res = calcResumo(state.index, pontosFiltro(), rs);
    el.querySelector("#resumo")!.innerHTML = res.length
      ? `<thead><tr><th>Ponto</th><th>Medição</th><th class="n">Leituras</th><th>Primeira data</th><th>Última data</th><th class="n">Mínimo</th><th class="n">Máximo</th><th class="n">Último valor</th><th class="n">Consumo ou variação</th></tr></thead><tbody>${res
          .map((x) => `<tr><td>${esc(x.ponto)}</td><td>${esc(x.campo)}</td><td class="n">${x.n}</td><td>${dtFmt(x.prim)}</td><td>${dtFmt(x.ult)}</td><td class="n">${fmt(x.min)}</td><td class="n">${fmt(x.max)}</td><td class="n">${fmt(x.uv)}</td><td class="n">${x.tot == null ? "" : (x.cum ? "" : x.tot > 0 ? "+" : "") + fmt(x.tot)}</td></tr>`)
          .join("")}</tbody>`
      : "<tbody><tr><td>Não há leituras no período selecionado.</td></tr></tbody>";
    evol("pz", ["nivel"], null, 0, rs, w);
    evol("hid", ["hid"], "hidm", 3, rs, w);
    evol("hor", ["hor", "hor1", "hor2"], "horm", 1, rs, w);
    comparacoes(rs, w);
  }

  return {
    render(root) {
      el = root;
      const modoSel = (id: string) => `<select id="${id}" aria-label="O que mostrar"><option value="v">Leitura acumulada</option><option value="d">Consumo entre leituras</option></select>`;
      el.innerHTML = `<div class="pagehead"><div><h1>Dashboard</h1><span class="sub">Indicadores e evolução das medições</span></div></div>
        <section class="card" id="filtros"></section>
        <div class="kpis" id="kpis"></div>
        <h2>Evolução por ponto</h2>
        <div class="graficos">
          <div class="card gc"><h3>Nível d'água</h3><div class="sub" id="es-pz"></div><select id="e-pz" aria-label="Piezômetro"></select><div class="chartbox sm"><canvas id="ec-pz"></canvas></div><div class="nota" id="n-ec-pz"></div></div>
          <div class="card gc"><h3>Hidrômetro</h3><div class="sub" id="es-hid"></div><div class="duo"><select id="e-hid" aria-label="Ponto do hidrômetro"></select>${modoSel("e-hid-m")}</div><div class="chartbox sm"><canvas id="ec-hid"></canvas></div><div class="nota" id="n-ec-hid"></div></div>
          <div class="card gc"><h3>Horímetro</h3><div class="sub" id="es-hor"></div><div class="duo"><select id="e-hor" aria-label="Ponto do horímetro"></select>${modoSel("e-hor-m")}</div><div class="chartbox sm"><canvas id="ec-hor"></canvas></div><div class="nota" id="n-ec-hor"></div></div>
        </div>
        <div class="sec-tit"><h2>Comparar pontos no mesmo gráfico</h2><div style="min-width:min(100%,280px)"><label for="d-ind" style="margin:0 0 4px">Indicador</label><select id="d-ind"></select></div></div>
        <div class="card"><div class="chartbox"><canvas id="grafico"></canvas></div><div class="nota" id="graf-nota"></div></div>
        <h2>Divisão por ponto</h2>
        <div class="graficos">
          <div class="card gc"><h3>Volume por ponto</h3><div class="sub">Quanto cada hidrômetro representa do volume total do período.</div><div class="chartbox sm"><canvas id="c-vol"></canvas></div><div class="nota" id="n-c-vol"></div></div>
          <div class="card gc"><h3>Horas de funcionamento por ponto</h3><div class="sub">Quanto cada poço e a cava representam do total de horas do período.</div><div class="chartbox sm"><canvas id="c-hor"></canvas></div><div class="nota" id="n-c-hor"></div></div>
        </div>
        <h2>Comparativo e níveis atuais</h2>
        <div class="graficos">
          <div class="card gc"><h3>Período atual e período anterior</h3><div class="sub" id="s-comp"></div><select id="d-comp" aria-label="Indicador do comparativo"></select><div class="chartbox sm"><canvas id="c-comp"></canvas></div><div class="nota" id="n-c-comp"></div></div>
          <div class="card gc"><h3>Última leitura dos piezômetros</h3><div class="sub">Última leitura de cada ponto no período, em metros de profundidade.</div><div class="chartbox sm"><canvas id="c-niv"></canvas></div><div class="nota" id="n-c-niv"></div></div>
        </div>
        <h2>Resumo por ponto</h2><div class="tbl"><table id="resumo"></table></div>`;
      ligarFiltros(el, draw);
      el.addEventListener("change", (e) => {
        const t = e.target as HTMLSelectElement;
        const mapa: Record<string, "pz" | "hid" | "hor" | "hidm" | "horm" | "ind" | "comp"> = { "e-pz": "pz", "e-hid": "hid", "e-hor": "hor", "e-hid-m": "hidm", "e-hor-m": "horm", "d-ind": "ind", "d-comp": "comp" };
        const k = mapa[t.id];
        if (!k) return;
        F[k] = t.value;
        draw();
      });
      draw();
    },
    onData() {
      draw();
    },
    destroy() {
      Object.keys(charts).forEach(destruir);
    }
  };
}
