"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertTriangle, CalendarDays, CheckCircle2, CloudRain, Database, Download, Droplets, ExternalLink, History, RefreshCw, Search, ShieldCheck, Target, Thermometer, Wind } from "lucide-react";

type WeatherPoint = { time: string; temperature: number; humidity: number; rain: number; wind: number; source: "historical" | "forecast"; rainMetric?: "amount" | "probability" | "derived_risk" };
type PersistenceMetrics = { status: string; observations: number; forecasts: number; accuracySamples: number; temperatureMae: number | null; lastRunAt?: string; lastRunStatus?: string; provider?: string };
type WeatherApiResponse = { points: WeatherPoint[]; invalidRecords: number; collectedAt: string; persistence: PersistenceMetrics; sources?: { forecast?: string } };
type Period = "forecast" | "30" | "90" | "365";
type SectionId = "overview" | "forecast" | "quality" | "data" | "pipeline";
const NAV_ITEMS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "forecast", label: "Previsão" },
  { id: "quality", label: "Qualidade" },
  { id: "data", label: "Dados" },
  { id: "pipeline", label: "Pipeline" },
];
const PERIODS: { value: Period; label: string }[] = [
  { value: "forecast", label: "Previsão 16d" },
  { value: "30", label: "Histórico 30d" },
  { value: "90", label: "90 dias" },
  { value: "365", label: "1 ano" },
];
const AUTO_REFRESH_MS = 60 * 60 * 1000;

function formatHour(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" }).format(new Date(value));
}

function LineChart({ data }: { data: WeatherPoint[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 960, height = 230;
  const temperatures = data.map((point) => point.temperature);
  const min = Math.floor(Math.min(...temperatures) - 2), max = Math.ceil(Math.max(...temperatures) + 2);
  const range = Math.max(max - min, 1);
  const points = data.map((point, index) => `${(index / Math.max(data.length - 1, 1)) * width},${height - ((point.temperature - min) / range) * height}`).join(" ");
  const area = `0,${height} ${points} ${width},${height}`;
  const hoveredPoint = hovered === null ? null : data[hovered];
  return <div className="chart-wrap" aria-label="Gráfico interativo da evolução da temperatura">
    <div className="chart-scale"><span>{max}°</span><span>{Math.round((max + min) / 2)}°</span><span>{min}°</span></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" onMouseLeave={() => setHovered(null)} onMouseMove={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setHovered(Math.min(data.length - 1, Math.max(0, Math.round(((event.clientX - rect.left) / rect.width) * (data.length - 1))))); }}><defs><linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2f73ff" stopOpacity=".28" /><stop offset="100%" stopColor="#2f73ff" stopOpacity="0" /></linearGradient></defs>
      {[0, .5, 1].map((position) => <line key={position} x1="0" x2={width} y1={position * height} y2={position * height} stroke="#e7edf6" strokeDasharray="5 7" />)}
      <polygon points={area} fill="url(#tempFill)" /><polyline points={points} fill="none" stroke="#2f73ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      {hoveredPoint && <><line x1={(hovered! / Math.max(data.length - 1, 1)) * width} x2={(hovered! / Math.max(data.length - 1, 1)) * width} y1="0" y2={height} stroke="#10233f" strokeDasharray="4 5" /><circle cx={(hovered! / Math.max(data.length - 1, 1)) * width} cy={height - ((hoveredPoint.temperature - min) / range) * height} r="7" fill="#fff" stroke="#2f73ff" strokeWidth="4" /></>}
    </svg>
    {hoveredPoint && <div className="chart-tooltip" style={{ left: `${(hovered! / Math.max(data.length - 1, 1)) * 100}%` }}><strong>{hoveredPoint.temperature.toFixed(1)} °C</strong><span>{formatHour(hoveredPoint.time)}</span><small>{hoveredPoint.source === "forecast" ? "Previsão" : "Histórico"}</small></div>}
    <div className="chart-labels">{[0, Math.floor(data.length / 3), Math.floor(data.length * 2 / 3), data.length - 1].map((index) => <span key={index}>{data[index] ? formatHour(data[index].time) : "—"}</span>)}</div>
  </div>;
}

function RainChart({ data }: { data: WeatherPoint[] }) {
  const grouped = data.filter((_, index) => index % Math.max(Math.floor(data.length / 20), 1) === 0).slice(0, 20);
  const amountMode = grouped[0]?.rainMetric === "amount";
  const scale = amountMode ? Math.max(...grouped.map((point) => point.rain), 1) : 100;
  const unit = amountMode ? "mm" : "%";
  return <div className="rain-chart" role="img" aria-label={`Gráfico de ${amountMode ? "precipitação observada" : "probabilidade de chuva"}`}>{grouped.map((point) => <div className="rain-column" key={point.time} title={`${formatHour(point.time)} — ${point.rain.toFixed(amountMode ? 1 : 0)} ${unit}`}><div className="rain-bar" style={{ height: `${Math.max((point.rain / scale) * 100, 3)}%` }} /></div>)}</div>;
}

function MetricCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div><p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-note">{note}</p></div></article>;
}

export default function Home() {
  const [weather, setWeather] = useState<WeatherPoint[]>([]);
  const [period, setPeriod] = useState<Period>("forecast");
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [nextRefreshAt, setNextRefreshAt] = useState<Date | null>(null);
  const [clock, setClock] = useState(0);
  const [search, setSearch] = useState("");
  const [invalidRecords, setInvalidRecords] = useState(0);
  const [persistence, setPersistence] = useState<PersistenceMetrics>({ status: "loading", observations: 0, forecasts: 0, accuracySamples: 0, temperatureMae: null });
  const [forecastProvider, setForecastProvider] = useState("open_meteo");
  const [activeSection, setActiveSection] = useState<SectionId>("overview");
  const navigationLocked = useRef(false);
  const navigationUnlockTimer = useRef<number | undefined>(undefined);

  async function loadWeather() {
    setLoading(true); setError(false);
    try {
      const response = await fetch("/api/weather", { cache: "no-store" });
      if (!response.ok) throw new Error("Falha na API interna");
      const payload = await response.json() as WeatherApiResponse;
      setInvalidRecords(payload.invalidRecords);
      setWeather(payload.points);
      setPersistence(payload.persistence);
      setForecastProvider(payload.sources?.forecast ?? "open_meteo");
      setUpdatedAt(new Date(payload.collectedAt));
      setNextRefreshAt(new Date(Date.now() + AUTO_REFRESH_MS));
    } catch { setError(true); } finally { setLoading(false); }
  }

  useEffect(() => {
    let lastRefresh = Date.now();
    const refresh = () => { lastRefresh = Date.now(); setClock(lastRefresh); loadWeather(); };
    refresh();
    const refreshTimer = window.setInterval(refresh, AUTO_REFRESH_MS);
    const clockTimer = window.setInterval(() => setClock(Date.now()), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastRefresh >= AUTO_REFRESH_MS) refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(refreshTimer);
      window.clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const sections = NAV_ITEMS.map(({ id }) => document.getElementById(id)).filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver((entries) => {
      if (navigationLocked.current) return;
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id as SectionId);
    }, { rootMargin: "-90px 0px -60% 0px", threshold: [0, .15, .4] });
    sections.forEach((section) => observer.observe(section));
    return () => {
      observer.disconnect();
      window.clearTimeout(navigationUnlockTimer.current);
    };
  }, []);

  function navigateToSection(event: React.MouseEvent<HTMLAnchorElement>, id: SectionId) {
    event.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    navigationLocked.current = true;
    window.clearTimeout(navigationUnlockTimer.current);
    navigationUnlockTimer.current = window.setTimeout(() => { navigationLocked.current = false; }, 1200);
    setActiveSection(id);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
  }
  const forecast = useMemo(() => weather.filter((point) => point.source === "forecast"), [weather]);
  const historical = useMemo(() => weather.filter((point) => point.source === "historical"), [weather]);
  const visible = useMemo(() => period === "forecast" ? (forecast.length ? forecast : historical.slice(-30 * 24)) : historical.slice(-Number(period) * 24), [forecast, historical, period]);
  const current = useMemo(() => {
    if (!forecast.length) return historical.at(-1);
    const now = clock;
    return forecast.reduce((closest, point) => Math.abs(new Date(point.time).getTime() - now) < Math.abs(new Date(closest.time).getTime() - now) ? point : closest);
  }, [forecast, historical, clock]);
  const maxTemperature = visible.length ? Math.max(...visible.map((point) => point.temperature)) : 0;
  const maxRain = visible.length ? Math.max(...visible.map((point) => point.rain)) : 0;
  const duplicates = weather.length - new Set(weather.map((point) => point.time)).size;
  const missingValues = weather.reduce((total, point) => total + [point.temperature, point.humidity, point.rain, point.wind].filter((value) => !Number.isFinite(value)).length, 0);
  const minutesToRefresh = nextRefreshAt ? Math.max(0, Math.ceil((nextRefreshAt.getTime() - clock) / 60_000)) : null;
  const next24Hours = forecast.filter((point) => new Date(point.time).getTime() >= clock - 60 * 60 * 1000).slice(0, 24);
  const riskRain = next24Hours.length ? Math.max(...next24Hours.map((point) => point.rain)) : 0;
  const riskWind = next24Hours.length ? Math.max(...next24Hours.map((point) => point.wind)) : 0;
  const temperatureRange = next24Hours.length ? Math.max(...next24Hours.map((point) => point.temperature)) - Math.min(...next24Hours.map((point) => point.temperature)) : 0;
  const riskIndex = Math.round(riskRain * .55 + Math.min(riskWind / 50 * 100, 100) * .25 + Math.min(temperatureRange / 15 * 100, 100) * .2);
  const riskLabel = riskIndex < 35 ? "Baixo" : riskIndex < 65 ? "Moderado" : "Elevado";
  const dailyForecast = useMemo(() => {
    const grouped = new Map<string, WeatherPoint[]>();
    forecast.forEach((point) => { const date = point.time.slice(0, 10); grouped.set(date, [...(grouped.get(date) ?? []), point]); });
    return Array.from(grouped.entries()).slice(0, 7).map(([date, points]) => ({ date, min: Math.min(...points.map((point) => point.temperature)), max: Math.max(...points.map((point) => point.temperature)), rain: Math.max(...points.map((point) => point.rain)), wind: Math.max(...points.map((point) => point.wind)) }));
  }, [forecast]);
  const filteredRows = useMemo(() => visible.filter((point) => !search || point.time.toLowerCase().includes(search.toLowerCase()) || formatHour(point.time).includes(search)).slice(0, 50), [visible, search]);

  function downloadCsv() {
    const header = "data_hora,origem,temperatura_c,umidade_pct,chuva_valor,chuva_metrica,vento_kmh";
    const rows = visible.map((point) => [point.time, point.source, point.temperature, point.humidity, point.rain, point.rainMetric ?? "probability", point.wind].join(","));
    const url = URL.createObjectURL(new Blob([[header, ...rows].join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `weatherflow-${period}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#overview" aria-label="WeatherFlow Analytics"><span className="brand-mark"><Activity size={21} /></span><span><strong>WeatherFlow</strong><small>Analytics</small></span></a>
      <nav aria-label="Navegação principal">{NAV_ITEMS.map((item) => <a key={item.id} href={`#${item.id}`} className={activeSection === item.id ? "active" : ""} aria-current={activeSection === item.id ? "page" : undefined} onClick={(event) => navigateToSection(event, item.id)}>{item.label}</a>)}</nav>
      <a className="github-link" href="https://github.com/MatheusAlmeidaSiqueira/data-automation" target="_blank" rel="noreferrer"><ExternalLink size={17} /> Código-fonte</a>
    </header>
    <div className="page-container">
      <section className="overview-head" id="overview"><div><div className="location-line"><span className="status-dot" /> Guarulhos, São Paulo</div><h1>Monitoramento meteorológico</h1><p>Um ano de histórico e 16 dias de previsão transformados em indicadores para análise.</p><div className="automation-status"><span><RefreshCw size={13} /> API e atualização automática ativas</span><b>{minutesToRefresh === null ? "Sincronizando…" : `Próxima consulta em ${minutesToRefresh} min`}</b></div></div><button className="refresh-button" onClick={loadWeather} disabled={loading}><RefreshCw size={17} className={loading ? "spin" : ""} /> {loading ? "Carregando base…" : "Atualizar agora"}</button></section>
      {error && <div className="error-state" role="alert" aria-live="polite">Não foi possível consultar a previsão agora. Tente atualizar novamente em alguns instantes.</div>}
      <section className="metric-grid" aria-label="Indicadores atuais">
        <MetricCard icon={<Thermometer size={21} />} label={forecast.length ? "Temperatura prevista" : "Última temperatura registrada"} value={current ? `${current.temperature.toFixed(1)} °C` : "—"} note={forecast.length ? "Horário mais próximo do atual" : "Modo resiliente: último dado histórico"} tone="blue" />
        <MetricCard icon={<Droplets size={21} />} label="Umidade relativa" value={current ? `${current.humidity}%` : "—"} note="Concentração de vapor no ar" tone="cyan" />
        <MetricCard icon={<CloudRain size={21} />} label={forecastProvider === "met_norway_fallback" ? "Risco de chuva" : "Chance de chuva"} value={current ? `${current.rain}%` : "—"} note={forecastProvider === "met_norway_fallback" ? "Índice derivado da condição prevista" : "Probabilidade estimada"} tone="violet" />
        <MetricCard icon={<Wind size={21} />} label="Velocidade do vento" value={current ? `${current.wind.toFixed(1)} km/h` : "—"} note="Medição prevista a 10 metros" tone="amber" />
      </section>
      <section className={`risk-banner risk-${riskLabel.toLowerCase()}`} aria-label={`WeatherFlow Risk Index: ${riskIndex} de 100`}>
        <div className="risk-score"><span>WeatherFlow</span><strong>{riskIndex}<small>/100</small></strong><b>Risk Index</b></div>
        <div className="risk-copy"><span className="eyebrow">INDICADOR EXCLUSIVO</span><h2>Risco meteorológico {riskLabel.toLowerCase()}</h2><p>Índice calculado para as próximas 24 horas com chuva, vento e amplitude térmica.</p><div className="risk-factors"><span><CloudRain size={14} /> Chuva {riskRain}%</span><span><Wind size={14} /> Vento {riskWind.toFixed(1)} km/h</span><span><Thermometer size={14} /> Variação {temperatureRange.toFixed(1)} °C</span></div></div>
        <div className="risk-gauge"><i style={{ width: `${riskIndex}%` }} /><span>0</span><span>100</span></div>
      </section>
      <section className="daily-section" id="forecast"><div className="section-heading"><div><span className="eyebrow">PRÓXIMOS DIAS</span><h2>Previsão diária</h2><p>Resumo de temperatura, chuva e vento para planejamento rápido.</p></div><span className="forecast-badge"><CalendarDays size={14} /> 7 dias</span></div>{dailyForecast.length ? <div className="daily-grid">{dailyForecast.map((day, index) => <article className={index === 0 ? "daily-card today" : "daily-card"} key={day.date}><div><span>{index === 0 ? "Hoje" : new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(new Date(`${day.date}T12:00:00`)).replace(".", "")}</span><small>{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(new Date(`${day.date}T12:00:00`))}</small></div><strong>{day.max.toFixed(0)}° <small>{day.min.toFixed(0)}°</small></strong><p><CloudRain size={13} /> {day.rain}%</p><p><Wind size={13} /> {day.wind.toFixed(0)} km/h</p></article>)}</div> : <div className="forecast-empty"><AlertTriangle size={20} /><div><strong>Previsão temporariamente indisponível</strong><span>O histórico real continua disponível. Uma nova tentativa será feita automaticamente.</span></div></div>}</section>
      <section className="dashboard-grid">
        <article className="panel temperature-panel"><div className="panel-head"><div><span className="eyebrow">TENDÊNCIA TÉRMICA</span><h2>Evolução da temperatura</h2><p>{period === "forecast" ? "Previsão futura hora a hora" : "Comportamento histórico no período selecionado"}</p></div><div className="period-control" aria-label="Selecionar período">{PERIODS.map((option) => <button key={option.value} type="button" aria-pressed={period === option.value} className={period === option.value ? "selected" : ""} onClick={() => setPeriod(option.value)}>{option.label}</button>)}</div></div>{visible.length ? <LineChart data={visible} /> : <div className="chart-loading">Carregando série meteorológica…</div>}</article>
        <aside className="panel insight-panel"><div className="panel-head"><div><span className="eyebrow">LEITURA RÁPIDA</span><h2>Destaques da previsão</h2><p>Principais pontos do período</p></div></div><div className="insight-list"><div><span className="insight-icon warm"><Thermometer size={19} /></span><p><small>Maior temperatura</small><strong>{visible.length ? `${maxTemperature.toFixed(1)} °C` : "—"}</strong></p></div><div><span className="insight-icon rain"><CloudRain size={19} /></span><p><small>Pico de chuva</small><strong>{visible.length ? `${maxRain}%` : "—"}</strong></p></div><div><span className="insight-icon records"><Database size={19} /></span><p><small>Registros analisados</small><strong>{visible.length || "—"}</strong></p></div></div><div className="source-note"><ShieldCheck size={17} /><span><strong>Fontes verificadas</strong>{forecastProvider === "met_norway_fallback" ? "Previsão MET Norway; histórico Open-Meteo." : "Dados fornecidos pela Open-Meteo API."}</span></div></aside>
        <article className="panel rain-panel"><div className="panel-head"><div><span className="eyebrow">PRECIPITAÇÃO</span><h2>{period === "forecast" ? "Probabilidade de chuva" : "Precipitação observada"}</h2><p>{period === "forecast" ? "Percentual estimado por horário" : "Quantidade registrada por horário"}</p></div><span className="panel-unit">{period === "forecast" ? "0–100%" : "milímetros"}</span></div>{visible.length ? <RainChart data={visible} /> : <div className="chart-loading small">Carregando…</div>}</article>
        <article className="panel quality-panel" id="quality"><div className="panel-head"><div><span className="eyebrow">CONFIABILIDADE</span><h2>Qualidade da base</h2><p>Métricas calculadas após validação dos dados recebidos</p></div><span className={missingValues === 0 && duplicates === 0 ? "approved" : "attention"}>{missingValues === 0 && duplicates === 0 ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />} {missingValues === 0 && duplicates === 0 ? "Base tratada" : "Requer atenção"}</span></div><div className="quality-stats"><div><strong>{weather.length.toLocaleString("pt-BR") || "—"}</strong><span>registros válidos</span></div><div><strong>{missingValues}</strong><span>valores ausentes</span></div><div><strong>{duplicates}</strong><span>duplicidades</span></div><div><strong>{invalidRecords}</strong><span>registros rejeitados</span></div></div></article>
        <article className="panel persistence-panel"><div className="panel-head"><div><span className="eyebrow">HISTÓRICO PRÓPRIO</span><h2>Persistência e monitoramento</h2><p>Banco, execução do pipeline e origem da previsão em uma visão auditável</p></div><span className={persistence.status === "active" ? "approved" : "attention"}><Database size={15} /> {persistence.status === "active" ? "Banco ativo" : "Inicializando"}</span></div><div className="persistence-stats"><div><History size={18} /><p><strong>{persistence.observations.toLocaleString("pt-BR")}</strong><span>observações salvas</span></p></div><div><Database size={18} /><p><strong>{persistence.forecasts.toLocaleString("pt-BR")}</strong><span>previsões versionadas</span></p></div><div><CheckCircle2 size={18} /><p><strong>{persistence.lastRunStatus === "success" ? "Concluída" : "Verificando"}</strong><span>{persistence.lastRunAt ? `última execução ${new Date(persistence.lastRunAt).toLocaleString("pt-BR")}` : "aguardando execução"}</span></p></div><div><ShieldCheck size={18} /><p><strong>{persistence.provider === "met_norway_fallback" ? "MET Norway" : persistence.provider === "database_fallback" ? "Banco histórico" : "Open-Meteo"}</strong><span>fonte ativa da previsão</span></p></div><div><Target size={18} /><p><strong>{persistence.temperatureMae == null ? "Coletando" : `${persistence.temperatureMae.toFixed(2)} °C`}</strong><span>{persistence.accuracySamples ? `MAE em ${persistence.accuracySamples} comparações` : "precisão após o primeiro ciclo"}</span></p></div></div></article>
      </section>
      <section className="data-section" id="data"><div className="section-heading"><div><span className="eyebrow">EXPLORADOR DE DADOS</span><h2>Consulte a base tratada</h2><p>Exibição limitada a 50 linhas; o download inclui todo o período selecionado.</p></div><button type="button" className="download-button" onClick={downloadCsv}><Download size={15} /> Baixar CSV ({visible.length.toLocaleString("pt-BR")} linhas)</button></div><div className="table-toolbar"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar data ou horário…" aria-label="Pesquisar registros" /><span aria-live="polite">{filteredRows.length} resultados exibidos</span></div><div className="table-wrap"><table><caption className="sr-only">Registros meteorológicos do período selecionado</caption><thead><tr><th scope="col">Data e hora</th><th scope="col">Origem</th><th scope="col">Temperatura</th><th scope="col">Umidade</th><th scope="col">Chuva</th><th scope="col">Vento</th></tr></thead><tbody>{filteredRows.map((point) => <tr key={`${point.source}-${point.time}`}><td>{new Date(point.time).toLocaleString("pt-BR")}</td><td><span className={`source-pill ${point.source}`}>{point.source === "forecast" ? "Previsão" : "Histórico"}</span></td><td>{point.temperature.toFixed(1)} °C</td><td>{point.humidity}%</td><td>{point.rain.toFixed(point.rainMetric === "amount" ? 1 : 0)} {point.rainMetric === "amount" ? "mm" : "%"}</td><td>{point.wind.toFixed(1)} km/h</td></tr>)}</tbody></table></div></section>
      <section className="pipeline-section" id="pipeline"><div><span className="eyebrow">ENGENHARIA DE DADOS</span><h2>Do dado bruto à informação</h2><p>API interna, validação, persistência histórica e visualização em um fluxo rastreável.</p></div><div className="pipeline-flow">{["Open-Meteo", "API interna", "Validação", "Banco histórico", "Dashboard"].map((step, index) => <div key={step} className="pipeline-step"><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < 4 && <b>→</b>}</div>)}</div></section>
      <footer><div><strong>WeatherFlow Analytics</strong><span>Projeto de dados desenvolvido por Matheus Almeida Siqueira · Dados: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> e <a href="https://api.met.no/" target="_blank" rel="noreferrer">MET Norway</a></span></div><p>{updatedAt ? `Dados sincronizados em ${updatedAt.toLocaleString("pt-BR")} · atualização automática a cada hora` : "Aguardando atualização dos dados"}</p></footer>
    </div>
  </main>;
}
