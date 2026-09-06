import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  Droplets, Gauge, MapPin, Radio, Siren, History, BarChart3, Sparkles,
  SlidersHorizontal, Cpu, Plus, ChevronRight, ChevronDown, X, Play, Square,
  AlertTriangle, Flame, Wifi, WifiOff, CheckCircle2, RotateCcw, Shuffle,
  Bell, Settings as SettingsIcon, Building2, Waves, TrendingUp, Target,
} from "lucide-react";

/* ============================================================
   AquaGuard — Intelligent Water Wastage Monitoring System
   General-purpose IoT simulation front-end.
   ============================================================ */

/* ---------------------------- constants ---------------------------- */

const LOCATION_TYPES = ["Site", "Building", "Block", "Floor", "Area", "Room", "Water Point", "Custom"];

const SEVERITY = {
  OFFLINE:  { key: "OFFLINE",  label: "Offline",  color: "#64748B", glow: "rgba(100,116,139,.35)", icon: "offline" },
  NORMAL:   { key: "NORMAL",   label: "Normal",   color: "#34D399", glow: "rgba(52,211,153,.35)",  icon: "normal" },
  FLOWING:  { key: "FLOWING",  label: "Flowing",  color: "#38BDF8", glow: "rgba(56,189,248,.4)",   icon: "flowing" },
  WARNING:  { key: "WARNING",  label: "Warning",  color: "#FBBF24", glow: "rgba(251,191,36,.4)",   icon: "warning" },
  WASTAGE:  { key: "WASTAGE",  label: "Wastage",  color: "#F87171", glow: "rgba(248,113,113,.45)", icon: "wastage" },
  CRITICAL: { key: "CRITICAL", label: "Critical", color: "#EF4444", glow: "rgba(239,68,68,.6)",    icon: "critical" },
};

const DEFAULT_SETTINGS = {
  warningSec: 45,
  wastageSec: 60,
  criticalSec: 120,
  maxFlowRate: 8,
  acceptableDurationSec: 60,
};

let __uid = 0;
const uid = (p) => `${p}-${(++__uid).toString(36)}${Math.floor(Math.random() * 900 + 100)}`;

const fmtDuration = (sec) => {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = Math.floor(sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};
const fmtL = (n) => `${n.toFixed(1)} L`;
const fmtTime = (d) => d.toLocaleTimeString([], { hour12: false });

/* ---------------------------- seed data ---------------------------- */

const CAMPUS_NAME = "IIITDMJ Campus";
const HOSTELS = [
  "Maa Saraswathi",
  "Panini Block A",
  "Panini Block B",
  "Vashishta",
  "Nagarjuna",
  "Aryabhata",
  "Vivekananda",
];
const FLOORS_PER_HOSTEL = 3;
const WASHROOMS_PER_FLOOR = 2;

const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function seedLocations() {
  const rows = [["site-campus", CAMPUS_NAME, "Site", null]];
  HOSTELS.forEach((hostelName) => {
    const hostelId = `hostel-${slugify(hostelName)}`;
    rows.push([hostelId, hostelName, "Building", "site-campus"]);
    for (let f = 1; f <= FLOORS_PER_HOSTEL; f++) {
      const floorId = `${hostelId}-floor-${f}`;
      rows.push([floorId, `Floor ${f}`, "Floor", hostelId]);
      for (let w = 1; w <= WASHROOMS_PER_FLOOR; w++) {
        const washroomId = `${floorId}-wash-${w}`;
        rows.push([washroomId, `Washroom ${w}`, "Area", floorId]);
      }
    }
  });
  return rows.map(([id, name, type, parentId]) => ({ id, name, type, parentId }));
}

function seedSensors() {
  const make = (id, name, locationId, flow, status = "ONLINE") => ({
    id, name, locationId, type: "Water Flow Sensor", status,
    baseFlowRate: flow, flowRate: 0, isFlowing: false, duration: 0,
    currentUsed: 0, currentAllowed: 0, currentWasted: 0,
    severity: status === "OFFLINE" ? "OFFLINE" : "NORMAL",
    todayUsed: 0, todayWasted: 0, eventsToday: 0,
    currentAlertId: null, overrides: null,
  });

  const sensors = [];
  let counter = 0;
  HOSTELS.forEach((hostelName, hi) => {
    const hostelId = `hostel-${slugify(hostelName)}`;
    for (let f = 1; f <= FLOORS_PER_HOSTEL; f++) {
      const floorId = `${hostelId}-floor-${f}`;
      for (let w = 1; w <= WASHROOMS_PER_FLOOR; w++) {
        counter += 1;
        const washroomId = `${floorId}-wash-${w}`;
        const id = `WS-${String(counter).padStart(3, "0")}`;
        const name = `${hostelName} · Floor ${f} · Washroom ${w}`;
        const flow = 4.5 + ((hi + f + w) % 4) * 0.8;
        const status = counter % 17 === 0 ? "OFFLINE" : "ONLINE";
        sensors.push(make(id, name, washroomId, Number(flow.toFixed(1)), status));
      }
    }
  });
  return sensors;
}

/* ---------------------------- helpers ---------------------------- */

function locationPath(locations, id) {
  const map = new Map(locations.map((l) => [l.id, l]));
  const path = [];
  let cur = map.get(id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : null;
  }
  return path;
}

function computeSeverity(sensor, settings) {
  if (sensor.status === "OFFLINE") return "OFFLINE";
  const s = sensor.overrides || settings;
  if (!sensor.isFlowing) return "NORMAL";
  if (sensor.duration >= s.criticalSec) return "CRITICAL";
  if (sensor.duration >= s.wastageSec) return "WASTAGE";
  if (sensor.duration >= s.warningSec) return "WARNING";
  if (sensor.flowRate > s.maxFlowRate) return "WARNING";
  return "FLOWING";
}

function playBeep(severity) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const freq = severity === "CRITICAL" ? 880 : 620;
    const beeps = severity === "CRITICAL" ? 3 : 2;
    for (let i = 0; i < beeps; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.value = 0.05;
      osc.connect(gain).connect(ctx.destination);
      const start = ctx.currentTime + i * 0.28;
      osc.start(start);
      osc.stop(start + 0.16);
    }
    setTimeout(() => ctx.close && ctx.close(), 1200);
  } catch (e) { /* audio blocked, ignore */ }
}

/* ============================================================
   ROOT APP
   ============================================================ */

export default function AquaGuardApp() {
  const [locations, setLocations] = useState(seedLocations);
  const [sensors, setSensors] = useState(seedSensors);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [flowHistory, setFlowHistory] = useState(() =>
    Array.from({ length: 20 }, (_, i) => ({ t: i, label: "", flow: 0, cumulative: 0 }))
  );
  const [tab, setTab] = useState("dashboard");
  const [selectedLocationId, setSelectedLocationId] = useState("site-campus");
  const [selectedSensorId, setSelectedSensorId] = useState("WS-001");
  const [activeAlarm, setActiveAlarm] = useState(null);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddSensor, setShowAddSensor] = useState(false);
  const cumulativeRef = useRef(0);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const pushEvent = useCallback((sensorId, text) => {
    setEvents((prev) => [{ id: uid("ev"), time: new Date(), sensorId, text }, ...prev].slice(0, 200));
  }, []);

  /* ---------------- simulation tick ---------------- */
  useEffect(() => {
    const interval = setInterval(() => {
      const s = settingsRef.current;
      let tickFlowTotal = 0;
      let newAlertsBatch = [];
      let updatedAlertsBatch = [];

      setSensors((prev) =>
        prev.map((sensor) => {
          if (!sensor.isFlowing || sensor.status === "OFFLINE") return sensor;

          const eff = sensor.overrides || s;
          const noise = (Math.random() - 0.5) * (sensor.baseFlowRate * 0.12);
          const flowRate = Math.max(0.3, sensor.baseFlowRate + noise);
          const duration = sensor.duration + 1;
          const currentUsed = sensor.currentUsed + flowRate / 60;
          const currentAllowed = (Math.min(duration, eff.acceptableDurationSec) / 60) * flowRate;
          const currentWasted = Math.max(0, currentUsed - currentAllowed);
          const prevSeverity = sensor.severity;
          const severity = computeSeverity({ ...sensor, duration, flowRate }, s);

          tickFlowTotal += flowRate;

          let currentAlertId = sensor.currentAlertId;

          const crossedIntoWastage =
            (severity === "WASTAGE" || severity === "CRITICAL") &&
            !(prevSeverity === "WASTAGE" || prevSeverity === "CRITICAL");

          if (crossedIntoWastage) {
            const path = locationPath(locations, sensor.locationId).map((l) => l.name);
            const alertId = uid("alrt");
            currentAlertId = alertId;
            newAlertsBatch.push({
              id: alertId, sensorId: sensor.id, sensorName: sensor.name,
              locationPath: path, time: new Date(), flowRate, duration,
              waterUsed: currentUsed, allowedWater: currentAllowed, wastedWater: currentWasted,
              severity, acknowledged: false, resolved: false,
            });
            pushEvent(sensor.id, "WASTAGE DETECTED");
          } else if (currentAlertId && (severity === "WASTAGE" || severity === "CRITICAL")) {
            updatedAlertsBatch.push({ id: currentAlertId, flowRate, duration, waterUsed: currentUsed, allowedWater: currentAllowed, wastedWater: currentWasted, severity });
          }

          if (severity === "WARNING" && prevSeverity === "FLOWING") pushEvent(sensor.id, "WARNING THRESHOLD CROSSED");
          if (severity === "CRITICAL" && prevSeverity !== "CRITICAL") pushEvent(sensor.id, "CRITICAL THRESHOLD CROSSED");

          if ((severity === "WASTAGE" || severity === "CRITICAL") && (prevSeverity !== severity)) {
            setActiveAlarm({ sensorId: sensor.id, severity, time: new Date() });
            playBeep(severity);
          }

          return { ...sensor, flowRate, duration, currentUsed, currentAllowed, currentWasted, severity, currentAlertId };
        })
      );

      if (newAlertsBatch.length) setAlerts((prev) => [...newAlertsBatch, ...prev]);
      if (updatedAlertsBatch.length) {
        setAlerts((prev) =>
          prev.map((a) => {
            const u = updatedAlertsBatch.find((x) => x.id === a.id);
            return u ? { ...a, ...u } : a;
          })
        );
      }

      cumulativeRef.current += tickFlowTotal / 60;
      setFlowHistory((prev) => {
        const next = [...prev, { t: prev.length, label: fmtTime(new Date()), flow: Number(tickFlowTotal.toFixed(2)), cumulative: Number(cumulativeRef.current.toFixed(2)) }];
        return next.slice(-30);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [locations, pushEvent]);

  /* ---------------- sensor actions ---------------- */

  const startFlow = useCallback((sensorId, opts = {}) => {
    setSensors((prev) =>
      prev.map((sn) =>
        sn.id === sensorId
          ? {
              ...sn,
              isFlowing: true,
              status: "ONLINE",
              baseFlowRate: opts.flowRate ?? sn.baseFlowRate,
              duration: opts.duration ?? 0,
              currentUsed: 0, currentAllowed: 0, currentWasted: 0,
              severity: "FLOWING", currentAlertId: null,
            }
          : sn
      )
    );
    pushEvent(sensorId, "FLOW STARTED");
  }, [pushEvent]);

  const stopFlow = useCallback((sensorId) => {
    setSensors((prev) =>
      prev.map((sn) => {
        if (sn.id !== sensorId) return sn;
        if (!sn.isFlowing) return sn;
        return {
          ...sn, isFlowing: false, duration: 0, flowRate: 0,
          todayUsed: sn.todayUsed + sn.currentUsed,
          todayWasted: sn.todayWasted + sn.currentWasted,
          eventsToday: sn.eventsToday + (sn.currentWasted > 0 ? 1 : 0),
          currentUsed: 0, currentAllowed: 0, currentWasted: 0,
          severity: "NORMAL", currentAlertId: null,
        };
      })
    );
    setAlerts((prev) => prev.map((a) => (a.sensorId === sensorId && !a.resolved ? { ...a, resolved: true } : a)));
    pushEvent(sensorId, "FLOW STOPPED");
    pushEvent(sensorId, "EVENT RECORDED");
  }, [pushEvent]);

  const jumpTo = useCallback((sensorId, sec) => {
    setSensors((prev) => prev.map((sn) => (sn.id === sensorId ? { ...sn, isFlowing: true, status: "ONLINE", duration: sec } : sn)));
  }, []);

  const resetSensor = useCallback((sensorId) => {
    setSensors((prev) =>
      prev.map((sn) =>
        sn.id === sensorId
          ? { ...sn, isFlowing: false, duration: 0, flowRate: 0, currentUsed: 0, currentAllowed: 0, currentWasted: 0, severity: sn.status === "OFFLINE" ? "OFFLINE" : "NORMAL", currentAlertId: null }
          : sn
      )
    );
  }, []);

  const randomEvent = useCallback(() => {
    const online = sensors.filter((s) => s.status === "ONLINE" && !s.isFlowing);
    if (!online.length) return;
    const pick = online[Math.floor(Math.random() * online.length)];
    const dur = Math.floor(Math.random() * 90);
    startFlow(pick.id, { duration: dur });
    setSelectedSensorId(pick.id);
  }, [sensors, startFlow]);

  const runScenario = useCallback((name) => {
    const ids = sensors.map((s) => s.id);
    const byId = (id) => sensors.find((s) => s.id === id);
    switch (name) {
      case "normal":
        sensors.forEach((s) => stopFlow(s.id));
        break;
      case "tapOpen":
        startFlow(ids[2], { duration: 70 });
        break;
      case "multiPoint":
        [ids[0], ids[2], ids[3]].forEach((id) => startFlow(id, { duration: Math.floor(Math.random() * 30) }));
        break;
      case "highFlow": {
        const target = byId(ids[3]);
        startFlow(ids[3], { flowRate: (target?.baseFlowRate || 6) * 1.8, duration: 20 });
        break;
      }
      case "prolonged":
        startFlow(ids[5], { duration: 130 });
        break;
      case "sensorFailure":
        setSensors((prev) => prev.map((sn) => (sn.id === ids[6] ? { ...sn, status: "OFFLINE", isFlowing: false, severity: "OFFLINE" } : sn)));
        pushEvent(ids[6], "SENSOR WENT OFFLINE");
        break;
      case "multiLocation":
        [ids[2], ids[3], ids[5]].forEach((id) => startFlow(id, { duration: 65 }));
        break;
      default: break;
    }
  }, [sensors, startFlow, stopFlow, pushEvent]);

  const addLocation = useCallback((loc) => setLocations((prev) => [...prev, { id: uid("loc"), ...loc }]), []);
  const addSensor = useCallback((sn) => setSensors((prev) => [...prev, sn]), []);
  const acknowledgeAlert = useCallback((id) => setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))), []);

  /* ---------------- derived aggregates ---------------- */

  const agg = useMemo(() => {
    const activeSensors = sensors.filter((s) => s.status === "ONLINE").length;
    const flowing = sensors.filter((s) => s.isFlowing).length;
    const usedToday = sensors.reduce((sum, s) => sum + s.todayUsed + s.currentUsed, 0);
    const wastedToday = sensors.reduce((sum, s) => sum + s.todayWasted + s.currentWasted, 0);
    const todayStr = new Date().toDateString();
    const incidentsToday = alerts.filter((a) => a.time.toDateString() === todayStr).length;
    return { activeSensors, flowing, usedToday, wastedToday, incidentsToday, potentialSaving: wastedToday };
  }, [sensors, alerts]);

  const topLocations = useMemo(() => locations.filter((l) => !l.parentId), [locations]);

  const locationAgg = useCallback(
    (locId) => {
      const descendantIds = new Set();
      const collect = (id) => {
        descendantIds.add(id);
        locations.filter((l) => l.parentId === id).forEach((c) => collect(c.id));
      };
      collect(locId);
      const list = sensors.filter((s) => descendantIds.has(s.locationId));
      const wastedToday = list.reduce((sum, s) => sum + s.todayWasted + s.currentWasted, 0);
      const flowing = list.filter((s) => s.isFlowing).length;
      const order = ["CRITICAL", "WASTAGE", "WARNING", "FLOWING", "OFFLINE", "NORMAL"];
      let worst = "NORMAL";
      list.forEach((s) => { if (order.indexOf(s.severity) < order.indexOf(worst)) worst = s.severity; });
      return { count: list.length, flowing, wastedToday, worst, sensors: list };
    },
    [locations, sensors]
  );

  const selectedSensor = sensors.find((s) => s.id === selectedSensorId) || sensors[0];

  const ctx = {
    locations, sensors, settings, setSettings, events, alerts, flowHistory,
    tab, setTab, selectedLocationId, setSelectedLocationId, selectedSensorId, setSelectedSensorId,
    activeAlarm, setActiveAlarm, addLocation, addSensor, startFlow, stopFlow, jumpTo, resetSensor,
    randomEvent, runScenario, acknowledgeAlert, agg, topLocations, locationAgg, selectedSensor,
    showAddLocation, setShowAddLocation, showAddSensor, setShowAddSensor,
  };

  return (
    <div className="aq-root">
      <GlobalStyle />
      <Sidebar ctx={ctx} />
      <div className="aq-main">
        <TopBar ctx={ctx} />
        <div className="aq-content">
          {tab === "dashboard" && <Dashboard ctx={ctx} />}
          {tab === "locations" && <LocationsTab ctx={ctx} />}
          {tab === "sensors" && <SensorsTab ctx={ctx} />}
          {tab === "simulation" && <SimulationTab ctx={ctx} />}
          {tab === "alerts" && <AlertsTab ctx={ctx} />}
          {tab === "analytics" && <AnalyticsTab ctx={ctx} />}
          {tab === "settings" && <SettingsTab ctx={ctx} />}
          {tab === "system" && <SystemTab ctx={ctx} />}
        </div>
      </div>
      {activeAlarm && <AlarmOverlay ctx={ctx} />}
      {showAddLocation && <AddLocationModal ctx={ctx} />}
      {showAddSensor && <AddSensorModal ctx={ctx} />}
    </div>
  );
}

/* ============================================================
   SIDEBAR / TOPBAR
   ============================================================ */

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "locations", label: "Locations", icon: MapPin },
  { id: "sensors", label: "Sensors", icon: Radio },
  { id: "simulation", label: "Simulation", icon: Waves },
  { id: "alerts", label: "Alert history", icon: History },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
  { id: "system", label: "System", icon: Cpu },
];

function Sidebar({ ctx }) {
  const unacked = ctx.alerts.filter((a) => !a.acknowledged).length;
  return (
    <div className="aq-sidebar">
      <div className="aq-logo">
        <div className="aq-logo-mark"><Droplets size={20} /></div>
        <div>
          <div className="aq-logo-title">AquaGuard</div>
          <div className="aq-logo-sub">Water intelligence</div>
        </div>
      </div>
      <nav className="aq-nav">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = ctx.tab === n.id;
          return (
            <button key={n.id} className={`aq-nav-item ${active ? "active" : ""}`} onClick={() => ctx.setTab(n.id)}>
              <Icon size={17} />
              <span>{n.label}</span>
              {n.id === "alerts" && unacked > 0 && <span className="aq-nav-badge">{unacked}</span>}
            </button>
          );
        })}
      </nav>
      <div className="aq-sidebar-foot">
        <div className="aq-sim-note">Simulated sensor network</div>
        <div className="aq-sim-dot"><span className="pulse-dot" /> Live</div>
      </div>
    </div>
  );
}

function TopBar({ ctx }) {
  const { agg } = ctx;
  const chips = [
    { label: "Active sensors", value: agg.activeSensors, icon: Radio, color: "var(--c-normal)" },
    { label: "Flowing now", value: agg.flowing, icon: Droplets, color: "var(--c-flow)" },
    { label: "Incidents today", value: agg.incidentsToday, icon: AlertTriangle, color: "var(--c-warning)" },
    { label: "Used today", value: fmtL(agg.usedToday), icon: Gauge, color: "var(--c-flow)" },
    { label: "Wasted today", value: fmtL(agg.wastedToday), icon: Flame, color: "var(--c-wastage)" },
  ];
  return (
    <div className="aq-topbar">
      <div className="aq-topbar-title">
        <h1>{NAV.find((n) => n.id === ctx.tab)?.label}</h1>
      </div>
      <div className="aq-chip-row">
        {chips.map((c) => (
          <div className="aq-chip" key={c.label}>
            <c.icon size={14} color={c.color} />
            <div>
              <div className="aq-chip-value">{c.value}</div>
              <div className="aq-chip-label">{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   DASHBOARD
   ============================================================ */

function StatusDot({ severity, size = 9 }) {
  const s = SEVERITY[severity] || SEVERITY.NORMAL;
  const pulsing = severity === "CRITICAL" || severity === "WASTAGE";
  return <span className={`status-dot ${pulsing ? "pulsing" : ""}`} style={{ "--dot-color": s.color, width: size, height: size }} />;
}

function Dashboard({ ctx }) {
  const { agg, topLocations, locationAgg, flowHistory, alerts } = ctx;
  const potential = agg.wastedToday;
  return (
    <div className="aq-grid-dash">
      <div className="stat-cards">
        <StatCard icon={Radio} label="Active sensors" value={agg.activeSensors} tone="normal" />
        <StatCard icon={Droplets} label="Water flowing" value={agg.flowing} tone="flow" />
        <StatCard icon={AlertTriangle} label="Wastage incidents" value={agg.incidentsToday} tone="warning" />
        <StatCard icon={Gauge} label="Water used today" value={fmtL(agg.usedToday)} tone="flow" />
        <StatCard icon={Flame} label="Water wasted today" value={fmtL(agg.wastedToday)} tone="wastage" />
        <StatCard icon={Target} label="Potential savings" value={fmtL(potential)} tone="normal" />
      </div>

      <div className="panel span-2">
        <div className="panel-head"><h3>Live water flow rate</h3><span className="panel-sub">All sensors combined · L/min</span></div>
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={flowHistory}>
            <CartesianGrid strokeDasharray="3 6" stroke="#1E2C48" />
            <XAxis dataKey="label" tick={{ fill: "#7C8CAE", fontSize: 11 }} interval="preserveEnd" />
            <YAxis tick={{ fill: "#7C8CAE", fontSize: 11 }} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="flow" stroke="#38BDF8" strokeWidth={2.5} dot={false} name="Flow (L/min)" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Recent alerts</h3></div>
        <div className="mini-alert-list">
          {alerts.slice(0, 6).map((a) => (
            <div className="mini-alert" key={a.id}>
              <StatusDot severity={a.severity} />
              <div className="mini-alert-body">
                <div className="mini-alert-top">
                  <strong>{a.sensorId}</strong>
                  <span>{fmtTime(a.time)}</span>
                </div>
                <div className="mini-alert-loc">{a.locationPath.join(" → ")}</div>
              </div>
            </div>
          ))}
          {alerts.length === 0 && <div className="empty-note">No wastage events yet. Start a simulation to see live alerts.</div>}
        </div>
      </div>

      <div className="panel span-3">
        <div className="panel-head"><h3>Location overview</h3><span className="panel-sub">Generated from live sensor data</span></div>
        <div className="loc-overview-grid">
          {topLocations.map((loc) => {
            const a = locationAgg(loc.id);
            const s = SEVERITY[a.worst];
            return (
              <div className="loc-overview-card" key={loc.id} style={{ "--tone": s.color }}>
                <div className="loc-overview-top">
                  <Building2 size={16} />
                  <span>{loc.name}</span>
                </div>
                <div className="loc-overview-stats">
                  <div><span>{a.count}</span><label>Sensors</label></div>
                  <div><span>{a.flowing}</span><label>Flowing</label></div>
                  <div><span>{a.wastedToday.toFixed(0)} L</span><label>Wasted today</label></div>
                </div>
                <div className="loc-overview-status"><StatusDot severity={a.worst} /> {s.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-icon"><Icon size={18} /></div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const tooltipStyle = { background: "#101A2E", border: "1px solid #223151", borderRadius: 10, color: "#E8EEF9", fontSize: 12 };

/* ============================================================
   LOCATIONS TAB
   ============================================================ */

function LocationsTab({ ctx }) {
  const { locations, selectedLocationId, setSelectedLocationId, locationAgg, setShowAddLocation } = ctx;
  const roots = locations.filter((l) => !l.parentId);
  const a = locationAgg(selectedLocationId);
  const selLoc = locations.find((l) => l.id === selectedLocationId);

  return (
    <div className="two-col">
      <div className="panel">
        <div className="panel-head">
          <h3>Location hierarchy</h3>
          <button className="btn-ghost" onClick={() => setShowAddLocation(true)}><Plus size={14} /> Add location</button>
        </div>
        <div className="tree-wrap">
          {roots.map((r) => (
            <LocationNode key={r.id} node={r} depth={0} ctx={ctx} />
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head"><h3>{selLoc ? selLoc.name : "Select a location"}</h3>{selLoc && <span className="panel-sub">{selLoc.type}</span>}</div>
        {selLoc ? (
          <>
            <div className="loc-detail-stats">
              <div><span>{a.count}</span><label>Sensors</label></div>
              <div><span>{a.flowing}</span><label>Flowing now</label></div>
              <div><span>{a.wastedToday.toFixed(1)} L</span><label>Wasted today</label></div>
              <div><StatusDot severity={a.worst} size={11} /><label>{SEVERITY[a.worst].label}</label></div>
            </div>
            <div className="sensor-card-grid">
              {a.sensors.length === 0 && <div className="empty-note">No sensors installed at this location yet.</div>}
              {a.sensors.map((s) => (
                <SensorCard key={s.id} sensor={s} ctx={ctx} onOpen={() => { ctx.setSelectedSensorId(s.id); ctx.setTab("sensors"); }} />
              ))}
            </div>
          </>
        ) : (
          <div className="empty-note">Click a node in the hierarchy to inspect it.</div>
        )}
      </div>
    </div>
  );
}

function LocationNode({ node, depth, ctx }) {
  const { locations, selectedLocationId, setSelectedLocationId, locationAgg } = ctx;
  const [open, setOpen] = useState(depth < 2);
  const children = locations.filter((l) => l.parentId === node.id);
  const a = locationAgg(node.id);
  const s = SEVERITY[a.worst];
  const active = selectedLocationId === node.id;
  return (
    <div className="tree-node">
      <div className={`tree-row ${active ? "active" : ""}`} style={{ paddingLeft: 10 + depth * 18 }} onClick={() => setSelectedLocationId(node.id)}>
        {children.length > 0 ? (
          <span className="tree-caret" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : <span className="tree-caret-spacer" />}
        <StatusDot severity={a.worst} />
        <span className="tree-name">{node.name}</span>
        <span className="tree-type">{node.type}</span>
        {a.count > 0 && <span className="tree-count">{a.count}</span>}
      </div>
      {open && children.map((c) => <LocationNode key={c.id} node={c} depth={depth + 1} ctx={ctx} />)}
    </div>
  );
}

/* ============================================================
   SENSORS TAB
   ============================================================ */

function SensorsTab({ ctx }) {
  const { sensors, locations, setShowAddSensor, setSelectedSensorId, selectedSensorId } = ctx;
  const [filter, setFilter] = useState("ALL");
  const filtered = sensors.filter((s) => filter === "ALL" || s.severity === filter);
  const selected = sensors.find((s) => s.id === selectedSensorId);

  return (
    <div className="two-col">
      <div className="panel">
        <div className="panel-head">
          <h3>Registered sensors</h3>
          <button className="btn-ghost" onClick={() => setShowAddSensor(true)}><Plus size={14} /> Add sensor</button>
        </div>
        <div className="filter-row">
          {["ALL", "FLOWING", "WARNING", "WASTAGE", "CRITICAL", "OFFLINE"].map((f) => (
            <button key={f} className={`filter-pill ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f === "ALL" ? "All" : SEVERITY[f].label}</button>
          ))}
        </div>
        <div className="sensor-card-grid">
          {filtered.map((s) => (
            <SensorCard key={s.id} sensor={s} ctx={ctx} onOpen={() => setSelectedSensorId(s.id)} highlight={s.id === selectedSensorId} />
          ))}
        </div>
      </div>
      <div className="panel">
        {selected ? <SensorDetails sensor={selected} ctx={ctx} /> : <div className="empty-note">Select a sensor to view details.</div>}
      </div>
    </div>
  );
}

function SensorCard({ sensor, ctx, onOpen, highlight }) {
  const s = SEVERITY[sensor.severity];
  const path = locationPath(ctx.locations, sensor.locationId).map((l) => l.name).join(" → ");
  const pulsing = sensor.severity === "CRITICAL" || sensor.severity === "WASTAGE";
  return (
    <div className={`sensor-card ${highlight ? "highlight" : ""} ${pulsing ? "alarm-pulse" : ""}`} style={{ "--tone": s.color }} onClick={onOpen}>
      <div className="sensor-card-top">
        <span className="sensor-id">{sensor.id}</span>
        <StatusDot severity={sensor.severity} />
      </div>
      <div className="sensor-name">{sensor.name}</div>
      <div className="sensor-loc" title={path}>{path}</div>
      <div className="sensor-card-bottom">
        <span className="badge" style={{ color: s.color, borderColor: s.color + "55" }}>{s.label}</span>
        {sensor.isFlowing && <span className="sensor-flow-rate">{sensor.flowRate.toFixed(1)} L/min</span>}
      </div>
    </div>
  );
}

function SensorDetails({ sensor, ctx }) {
  const path = locationPath(ctx.locations, sensor.locationId);
  const s = SEVERITY[sensor.severity];
  const barData = [
    { name: "Allowed", value: Number(sensor.currentAllowed.toFixed(2)) },
    { name: "Actual", value: Number(sensor.currentUsed.toFixed(2)) },
    { name: "Wasted", value: Number(sensor.currentWasted.toFixed(2)) },
  ];
  return (
    <div>
      <div className="panel-head"><h3>{sensor.name}</h3><span className="panel-sub">{sensor.id}</span></div>
      <div className="detail-loc-path">
        {path.map((p, i) => (
          <React.Fragment key={p.id}>
            <span>{p.name}</span>{i < path.length - 1 && <ChevronRight size={12} />}
          </React.Fragment>
        ))}
      </div>
      <div className="detail-readout" style={{ "--tone": s.color }}>
        <div className="detail-readout-status"><StatusDot severity={sensor.severity} size={12} /> {s.label}</div>
        <div className="detail-readout-grid">
          <div><label>Flow rate</label><span>{sensor.flowRate.toFixed(1)} L/min</span></div>
          <div><label>Duration</label><span>{fmtDuration(sensor.duration)}</span></div>
          <div><label>Water used</label><span>{fmtL(sensor.currentUsed)}</span></div>
          <div><label>Allowed</label><span>{fmtL(sensor.currentAllowed)}</span></div>
          <div><label>Wasted</label><span>{fmtL(sensor.currentWasted)}</span></div>
          <div><label>Today total wasted</label><span>{fmtL(sensor.todayWasted + sensor.currentWasted)}</span></div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={barData}>
          <CartesianGrid strokeDasharray="3 6" stroke="#1E2C48" />
          <XAxis dataKey="name" tick={{ fill: "#7C8CAE", fontSize: 11 }} />
          <YAxis tick={{ fill: "#7C8CAE", fontSize: 11 }} />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="detail-actions">
        {sensor.status !== "OFFLINE" && !sensor.isFlowing && <button className="btn-primary" onClick={() => ctx.startFlow(sensor.id)}><Play size={14} /> Start flow</button>}
        {sensor.isFlowing && <button className="btn-danger" onClick={() => ctx.stopFlow(sensor.id)}><Square size={14} /> Stop flow</button>}
        <button className="btn-ghost" onClick={() => { ctx.setSelectedSensorId(sensor.id); ctx.setTab("simulation"); }}><Waves size={14} /> Open in simulator</button>
      </div>
    </div>
  );
}

/* ============================================================
   SIMULATION TAB
   ============================================================ */

const SCENARIOS = [
  { id: "normal", label: "Normal usage", icon: CheckCircle2 },
  { id: "tapOpen", label: "Tap left open", icon: Droplets },
  { id: "multiPoint", label: "Multiple points active", icon: Waves },
  { id: "highFlow", label: "High flow rate", icon: Gauge },
  { id: "prolonged", label: "Prolonged flow", icon: History },
  { id: "sensorFailure", label: "Sensor failure", icon: WifiOff },
  { id: "multiLocation", label: "Multi-location wastage", icon: AlertTriangle },
];

function SimulationTab({ ctx }) {
  const { sensors, selectedSensor, setSelectedSensorId, startFlow, stopFlow, jumpTo, resetSensor, randomEvent, runScenario, settings, flowHistory } = ctx;
  const [flowRate, setFlowRate] = useState(selectedSensor?.baseFlowRate || 6);
  const [startDuration, setStartDuration] = useState(0);

  useEffect(() => { setFlowRate(selectedSensor?.baseFlowRate || 6); }, [selectedSensor?.id]);

  const barData = selectedSensor ? [
    { name: "Allowed", value: Number(selectedSensor.currentAllowed.toFixed(2)) },
    { name: "Actual", value: Number(selectedSensor.currentUsed.toFixed(2)) },
    { name: "Wasted", value: Number(selectedSensor.currentWasted.toFixed(2)) },
  ] : [];

  return (
    <div className="sim-layout">
      <div className="panel">
        <div className="panel-head"><h3>Simulation center</h3><span className="panel-sub">Drive any sensor manually</span></div>
        <label className="field-label">Select sensor</label>
        <select className="aq-select" value={selectedSensor?.id} onChange={(e) => setSelectedSensorId(e.target.value)}>
          {sensors.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
        </select>

        <label className="field-label">Flow rate ({flowRate.toFixed(1)} L/min)</label>
        <input type="range" min="1" max="15" step="0.1" value={flowRate} onChange={(e) => setFlowRate(Number(e.target.value))} className="aq-range" />

        <label className="field-label">Starting duration ({startDuration}s)</label>
        <input type="range" min="0" max="150" step="5" value={startDuration} onChange={(e) => setStartDuration(Number(e.target.value))} className="aq-range" />

        <div className="sim-controls">
          <button className="btn-primary" onClick={() => startFlow(selectedSensor.id, { flowRate, duration: startDuration })}><Play size={14} /> Start flow</button>
          <button className="btn-danger" onClick={() => stopFlow(selectedSensor.id)}><Square size={14} /> Stop flow</button>
          <button className="btn-warn" onClick={() => jumpTo(selectedSensor.id, settings.warningSec)}><AlertTriangle size={14} /> Simulate warning</button>
          <button className="btn-wastage" onClick={() => jumpTo(selectedSensor.id, settings.wastageSec)}><Flame size={14} /> Simulate wastage</button>
          <button className="btn-critical" onClick={() => jumpTo(selectedSensor.id, settings.criticalSec)}><Siren size={14} /> Simulate critical</button>
          <button className="btn-ghost" onClick={randomEvent}><Shuffle size={14} /> Random event</button>
          <button className="btn-ghost" onClick={() => resetSensor(selectedSensor.id)}><RotateCcw size={14} /> Reset</button>
        </div>

        <div className="panel-head" style={{ marginTop: 18 }}><h3>Predefined scenarios</h3></div>
        <div className="scenario-grid">
          {SCENARIOS.map((sc) => (
            <button key={sc.id} className="scenario-btn" onClick={() => runScenario(sc.id)}>
              <sc.icon size={15} /> {sc.label}
            </button>
          ))}
        </div>

        <LiveThresholdControls ctx={ctx} />
      </div>

      <div className="sim-right">
        {selectedSensor && (
          <div className="panel" style={{ "--tone": SEVERITY[selectedSensor.severity].color }}>
            <div className="panel-head"><h3>Live readout — {selectedSensor.id}</h3><StatusDot severity={selectedSensor.severity} size={12} /></div>
            <div className="detail-loc-path">
              {locationPath(ctx.locations, selectedSensor.locationId).map((p, i, arr) => (
                <React.Fragment key={p.id}>
                  <span>{p.name}</span>{i < arr.length - 1 && <ChevronRight size={12} />}
                </React.Fragment>
              ))}
            </div>
            <div className="detail-readout-grid big">
              <div><label>Flow rate</label><span>{selectedSensor.flowRate.toFixed(1)} L/min</span></div>
              <div><label>Duration</label><span>{fmtDuration(selectedSensor.duration)}</span></div>
              <div><label>Water used</label><span>{fmtL(selectedSensor.currentUsed)}</span></div>
              <div><label>Allowed</label><span>{fmtL(selectedSensor.currentAllowed)}</span></div>
              <div><label>Wasted</label><span>{fmtL(selectedSensor.currentWasted)}</span></div>
              <div><label>Status</label><span>{SEVERITY[selectedSensor.severity].label}</span></div>
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-head"><h3>Live water flow rate</h3><span className="panel-sub">L/min</span></div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={flowHistory}>
              <CartesianGrid strokeDasharray="3 6" stroke="#1E2C48" />
              <XAxis dataKey="label" tick={{ fill: "#7C8CAE", fontSize: 10 }} />
              <YAxis tick={{ fill: "#7C8CAE", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="flow" stroke="#38BDF8" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Cumulative water consumption</h3><span className="panel-sub">Litres</span></div>
          <ResponsiveContainer width="100%" height={190}>
            <AreaChart data={flowHistory}>
              <defs>
                <linearGradient id="cumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34D399" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="#34D399" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 6" stroke="#1E2C48" />
              <XAxis dataKey="label" tick={{ fill: "#7C8CAE", fontSize: 10 }} />
              <YAxis tick={{ fill: "#7C8CAE", fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="cumulative" stroke="#34D399" fill="url(#cumGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Allowed vs actual vs wasted</h3><span className="panel-sub">Selected sensor · litres</span></div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 6" stroke="#1E2C48" />
              <XAxis dataKey="name" tick={{ fill: "#7C8CAE", fontSize: 11 }} />
              <YAxis tick={{ fill: "#7C8CAE", fontSize: 11 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#38BDF8" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <EventStream ctx={ctx} />
      </div>
    </div>
  );
}

function LiveThresholdControls({ ctx }) {
  const { settings, setSettings } = ctx;

  const row = (key, label, min, max, step, unit) => (
    <div style={{ marginBottom: 10 }}>
      <label className="field-label" style={{ margin: "10px 0 4px" }}>
        {label} ({settings[key]}{unit})
      </label>
      <input
        type="range"
        className="aq-range"
        min={min}
        max={max}
        step={step}
        value={settings[key]}
        onChange={(e) => setSettings((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
      />
    </div>
  );

  return (
    <div className="panel" style={{ marginTop: 18 }}>
      <div className="panel-head">
        <h3>Live thresholds</h3>
        <span className="panel-sub">Drag while the simulation runs — it updates instantly</span>
      </div>
      {row("warningSec", "Warning at", 5, 180, 1, "s")}
      {row("wastageSec", "Wastage at", 5, 240, 1, "s")}
      {row("criticalSec", "Critical at", 5, 300, 1, "s")}
      {row("maxFlowRate", "Max flow rate", 1, 20, 0.5, " L/min")}
      {row("acceptableDurationSec", "Acceptable duration", 5, 180, 1, "s")}
    </div>
  );
}

function EventStream({ ctx }) {
  const { events, locations, sensors } = ctx;
  return (
    <div className="panel">
      <div className="panel-head"><h3>Live event stream</h3></div>
      <div className="event-stream">
        {events.slice(0, 40).map((e) => (
          <div className="event-row" key={e.id}>
            <span className="event-time">{fmtTime(e.time)}</span>
            <span className="event-sensor">{e.sensorId}</span>
            <span className="event-text">{e.text}</span>
          </div>
        ))}
        {events.length === 0 && <div className="empty-note">No events yet — start a flow to populate the stream.</div>}
      </div>
    </div>
  );
}

/* ============================================================
   ALARM OVERLAY
   ============================================================ */

function AlarmOverlay({ ctx }) {
  const { activeAlarm, setActiveAlarm, sensors, locations, acknowledgeAlert, alerts, setTab, setSelectedSensorId } = ctx;
  const sensor = sensors.find((s) => s.id === activeAlarm.sensorId);
  if (!sensor) return null;
  const path = locationPath(locations, sensor.locationId).map((l) => l.name);
  const relatedAlert = alerts.find((a) => a.sensorId === sensor.id && !a.resolved);
  const s = SEVERITY[activeAlarm.severity];

  return (
    <div className="alarm-overlay-backdrop">
      <div className="alarm-overlay" style={{ "--tone": s.color }}>
        <div className="alarm-head">
          <Siren size={22} />
          <span>{activeAlarm.severity === "CRITICAL" ? "Critical water wastage" : "Water wastage detected"}</span>
        </div>
        <div className="alarm-sensor">{sensor.id} · {sensor.name}</div>
        <div className="alarm-path">{path.join(" → ")}</div>
        <div className="alarm-grid">
          <div><label>Flow rate</label><span>{sensor.flowRate.toFixed(1)} L/min</span></div>
          <div><label>Duration</label><span>{fmtDuration(sensor.duration)}</span></div>
          <div><label>Water used</label><span>{fmtL(sensor.currentUsed)}</span></div>
          <div><label>Water wasted</label><span>{fmtL(sensor.currentWasted)}</span></div>
        </div>
        <div className="alarm-actions">
          <button className="btn-primary" onClick={() => { if (relatedAlert) acknowledgeAlert(relatedAlert.id); setActiveAlarm(null); }}><CheckCircle2 size={14} /> Acknowledge</button>
          <button className="btn-ghost" onClick={() => { setSelectedSensorId(sensor.id); setTab("simulation"); setActiveAlarm(null); }}>View sensor</button>
          <button className="btn-ghost" onClick={() => setActiveAlarm(null)}><X size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   ALERTS TAB
   ============================================================ */

function AlertsTab({ ctx }) {
  const { alerts, locations, sensors, acknowledgeAlert } = ctx;
  const [locFilter, setLocFilter] = useState("ALL");
  const [sevFilter, setSevFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = alerts.filter((a) => {
    if (sevFilter !== "ALL" && a.severity !== sevFilter) return false;
    if (statusFilter === "ACTIVE" && a.resolved) return false;
    if (statusFilter === "RESOLVED" && !a.resolved) return false;
    if (locFilter !== "ALL" && !a.locationPath.includes(locFilter)) return false;
    return true;
  });

  const locNames = [...new Set(locations.map((l) => l.name))];

  return (
    <div className="panel">
      <div className="panel-head"><h3>Alert history</h3><span className="panel-sub">{filtered.length} of {alerts.length} events</span></div>
      <div className="filter-row">
        <select className="aq-select sm" value={locFilter} onChange={(e) => setLocFilter(e.target.value)}>
          <option value="ALL">All locations</option>
          {locNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        <select className="aq-select sm" value={sevFilter} onChange={(e) => setSevFilter(e.target.value)}>
          <option value="ALL">All severities</option>
          {["WARNING", "WASTAGE", "CRITICAL"].map((s) => <option key={s} value={s}>{SEVERITY[s].label}</option>)}
        </select>
        <select className="aq-select sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="ALL">Active + resolved</option>
          <option value="ACTIVE">Active only</option>
          <option value="RESOLVED">Resolved only</option>
        </select>
      </div>
      <div className="table-wrap">
        <table className="aq-table">
          <thead>
            <tr>
              <th>Time</th><th>Sensor</th><th>Location</th><th>Flow rate</th><th>Duration</th>
              <th>Used</th><th>Wasted</th><th>Severity</th><th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id}>
                <td>{fmtTime(a.time)}</td>
                <td>{a.sensorId}</td>
                <td className="loc-cell" title={a.locationPath.join(" → ")}>{a.locationPath.join(" → ")}</td>
                <td>{a.flowRate.toFixed(1)} L/min</td>
                <td>{fmtDuration(a.duration)}</td>
                <td>{fmtL(a.waterUsed)}</td>
                <td>{fmtL(a.wastedWater)}</td>
                <td><span className="badge" style={{ color: SEVERITY[a.severity].color, borderColor: SEVERITY[a.severity].color + "55" }}>{SEVERITY[a.severity].label}</span></td>
                <td>{a.resolved ? "Resolved" : "Active"}</td>
                <td>{!a.acknowledged && <button className="btn-ghost xs" onClick={() => acknowledgeAlert(a.id)}>Ack</button>}</td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={10} className="empty-note">No alerts match these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   ANALYTICS TAB
   ============================================================ */

function AnalyticsTab({ ctx }) {
  const { alerts, sensors, locations, agg } = ctx;
  const [respSec, setRespSec] = useState(30);

  const stats = useMemo(() => {
    const totalUsed = sensors.reduce((s, x) => s + x.todayUsed + x.currentUsed, 0);
    const totalWasted = sensors.reduce((s, x) => s + x.todayWasted + x.currentWasted, 0);
    const wastageRate = totalUsed > 0 ? (totalWasted / totalUsed) * 100 : 0;
    const incidents = alerts.length;
    const avgWastage = incidents > 0 ? totalWasted / incidents : 0;
    const longestFlow = alerts.reduce((m, a) => Math.max(m, a.duration), 0);
    const highestFlow = alerts.reduce((m, a) => Math.max(m, a.flowRate), 0);
    const bySensor = {};
    const byLocation = {};
    alerts.forEach((a) => {
      bySensor[a.sensorId] = (bySensor[a.sensorId] || 0) + a.wastedWater;
      const top = a.locationPath[0] || "Unknown";
      byLocation[top] = (byLocation[top] || 0) + a.wastedWater;
    });
    const worstSensor = Object.entries(bySensor).sort((a, b) => b[1] - a[1])[0];
    const worstLocation = Object.entries(byLocation).sort((a, b) => b[1] - a[1])[0];
    const hourCounts = {};
    alerts.forEach((a) => { const h = a.time.getHours(); hourCounts[h] = (hourCounts[h] || 0) + 1; });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    return { totalUsed, totalWasted, wastageRate, incidents, avgWastage, longestFlow, highestFlow, worstSensor, worstLocation, peakHour };
  }, [alerts, sensors]);

  const insights = useMemo(() => {
    const out = [];
    if (stats.worstSensor && stats.totalWasted > 0) {
      const pct = ((stats.worstSensor[1] / stats.totalWasted) * 100).toFixed(0);
      out.push(`Sensor ${stats.worstSensor[0]} generated ${pct}% of total recorded wastage.`);
    }
    if (stats.peakHour) out.push(`Most wastage incidents occur around ${stats.peakHour[0]}:00.`);
    if (stats.worstLocation) out.push(`${stats.worstLocation[0]} accounts for the highest wastage among all locations, at ${stats.worstLocation[1].toFixed(1)} L.`);
    const monthly = stats.totalWasted * 30;
    if (stats.totalWasted > 0) out.push(`At the current rate, approximately ${monthly.toFixed(0)} litres could be wasted this month if left unaddressed.`);
    out.push(`Reducing average continuous flow duration by 30 seconds could save an estimated ${(sensors.length * 30 * 0.1).toFixed(0)} litres per month across the network.`);
    if (out.length === 1) return ["Run the simulator to generate live, data-driven insights as wastage events occur."];
    return out;
  }, [stats, sensors]);

  const whatIf = useMemo(() => {
    let estimated = 0;
    alerts.forEach((a) => {
      const acceptable = ctx.settings.acceptableDurationSec;
      const cappedDuration = Math.min(a.duration, acceptable + respSec);
      const cappedUsed = (cappedDuration / 60) * a.flowRate;
      const cappedAllowed = (Math.min(cappedDuration, acceptable) / 60) * a.flowRate;
      estimated += Math.max(0, cappedUsed - cappedAllowed);
    });
    const saving = Math.max(0, stats.totalWasted - estimated);
    return { estimated, saving };
  }, [alerts, respSec, stats.totalWasted, ctx.settings]);

  const monthlyPredicted = stats.totalWasted * 30;
  const weeklyPredicted = stats.totalWasted * 7;

  return (
    <div className="analytics-layout">
      <div className="panel">
        <div className="panel-head"><h3>Analytics summary</h3></div>
        <div className="analytics-grid">
          <AnalyticsStat label="Total usage" value={fmtL(stats.totalUsed)} />
          <AnalyticsStat label="Total wasted" value={fmtL(stats.totalWasted)} />
          <AnalyticsStat label="Wastage rate" value={`${stats.wastageRate.toFixed(1)}%`} />
          <AnalyticsStat label="Incidents" value={stats.incidents} />
          <AnalyticsStat label="Avg wastage / incident" value={fmtL(stats.avgWastage)} />
          <AnalyticsStat label="Longest continuous flow" value={fmtDuration(stats.longestFlow)} />
          <AnalyticsStat label="Highest flow rate" value={`${stats.highestFlow.toFixed(1)} L/min`} />
          <AnalyticsStat label="Most wasteful location" value={stats.worstLocation ? stats.worstLocation[0] : "—"} />
          <AnalyticsStat label="Most wasteful sensor" value={stats.worstSensor ? stats.worstSensor[0] : "—"} />
          <AnalyticsStat label="Peak wastage hour" value={stats.peakHour ? `${stats.peakHour[0]}:00` : "—"} />
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3><Sparkles size={15} style={{ marginRight: 6, verticalAlign: -2 }} />Smart insights</h3><span className="panel-sub">Generated from live data</span></div>
        <ul className="insight-list">
          {insights.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Predictive analysis</h3></div>
        <div className="predict-row">
          <div><label>Today</label><span>{fmtL(stats.totalWasted)}</span></div>
          <div><label>Estimated weekly</label><span>{fmtL(weeklyPredicted)}</span></div>
          <div><label>Estimated monthly</label><span>{fmtL(monthlyPredicted)}</span></div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>What-if simulator</h3><span className="panel-sub">If alerts were acted on faster</span></div>
        <label className="field-label">Response time: {respSec}s</label>
        <input type="range" min="10" max="120" step="5" value={respSec} onChange={(e) => setRespSec(Number(e.target.value))} className="aq-range" />
        <div className="predict-row">
          <div><label>Current wastage</label><span>{fmtL(stats.totalWasted)}</span></div>
          <div><label>Estimated with {respSec}s response</label><span>{fmtL(whatIf.estimated)}</span></div>
          <div className="highlight-cell"><label>Potential saving</label><span>{fmtL(whatIf.saving)}</span></div>
        </div>
      </div>
    </div>
  );
}

function AnalyticsStat({ label, value }) {
  return <div className="analytics-stat"><span>{value}</span><label>{label}</label></div>;
}

/* ============================================================
   SETTINGS TAB
   ============================================================ */

function SettingsTab({ ctx }) {
  const { settings, setSettings, sensors, setSensors } = ctx;
  const [sensorId, setSensorId] = useState(sensors[0]?.id);

  const sensor = sensors.find((s) => s.id === sensorId);
  const useOverride = !!sensor?.overrides;
  const overrideVals = sensor?.overrides || settings;

  // Live-bound: every keystroke/drag updates the actual settings object that
  // the running simulation reads on its very next tick — no "Save" step needed.
  const field = (obj, onChange, key, label, step = 1) => (
    <div className="settings-field">
      <label>{label}</label>
      <input
        type="number"
        step={step}
        value={obj[key]}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange({ ...obj, [key]: Number.isNaN(n) ? obj[key] : n });
        }}
      />
    </div>
  );

  const setOverrideVals = (next) => {
    setSensors((prev) => prev.map((s) => (s.id === sensorId ? { ...s, overrides: next } : s)));
  };

  const toggleOverride = (checked) => {
    setSensors((prev) =>
      prev.map((s) => (s.id === sensorId ? { ...s, overrides: checked ? { ...settings } : null } : s))
    );
  };

  return (
    <div className="two-col">
      <div className="panel">
        <div className="panel-head">
          <h3>Global thresholds</h3>
          <span className="panel-sub">Live — changes apply to the running simulation instantly</span>
        </div>
        {field(settings, setSettings, "warningSec", "Warning duration (sec)")}
        {field(settings, setSettings, "wastageSec", "Wastage duration (sec)")}
        {field(settings, setSettings, "criticalSec", "Critical duration (sec)")}
        {field(settings, setSettings, "maxFlowRate", "Max acceptable flow rate (L/min)", 0.5)}
        {field(settings, setSettings, "acceptableDurationSec", "Acceptable duration (sec)")}
        <button className="btn-ghost" style={{ marginTop: 10 }} onClick={() => setSettings(DEFAULT_SETTINGS)}>
          <RotateCcw size={14} /> Reset to defaults
        </button>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Sensor-specific overrides</h3><span className="panel-sub">Live</span></div>
        <label className="field-label">Sensor</label>
        <select className="aq-select" value={sensorId} onChange={(e) => setSensorId(e.target.value)}>
          {sensors.map((s) => <option key={s.id} value={s.id}>{s.id} — {s.name}</option>)}
        </select>
        <label className="check-row">
          <input type="checkbox" checked={useOverride} onChange={(e) => toggleOverride(e.target.checked)} />
          Use custom thresholds for this sensor
        </label>
        {useOverride && (
          <>
            {field(overrideVals, setOverrideVals, "warningSec", "Warning duration (sec)")}
            {field(overrideVals, setOverrideVals, "wastageSec", "Wastage duration (sec)")}
            {field(overrideVals, setOverrideVals, "criticalSec", "Critical duration (sec)")}
            {field(overrideVals, setOverrideVals, "maxFlowRate", "Max acceptable flow rate (L/min)", 0.5)}
            {field(overrideVals, setOverrideVals, "acceptableDurationSec", "Acceptable duration (sec)")}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   SYSTEM TAB
   ============================================================ */

function SystemTab({ ctx }) {
  const { sensors } = ctx;
  return (
    <div className="two-col">
      <div className="panel">
        <div className="panel-head"><h3>System architecture</h3><span className="panel-sub">Current build simulates the hardware layer</span></div>
        <div className="arch-chain">
          {[
            { label: "Water flow sensor", note: "Physical / simulated" },
            { label: "ESP32 microcontroller", note: "Simulated" },
            { label: "Wi-Fi / MQTT", note: "Simulated transport" },
            { label: "Node.js backend", note: "Represented by in-memory logic" },
            { label: "Data processing", note: "Threshold + wastage engine" },
            { label: "React dashboard", note: "This application" },
          ].map((step, i, arr) => (
            <React.Fragment key={step.label}>
              <div className="arch-step">
                <div className="arch-step-label">{step.label}</div>
                <div className="arch-step-note">{step.note}</div>
              </div>
              {i < arr.length - 1 && <div className="arch-arrow">↓</div>}
            </React.Fragment>
          ))}
        </div>
        <div className="arch-callout">
          This prototype runs entirely in the browser. Sensor readings are generated by a JavaScript simulation engine so the exact same wastage-detection logic can later be driven by real ESP32 flow sensors over MQTT into a Node.js/Express backend, with no changes to the dashboard.
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><h3>Sensor network status</h3><span className="panel-sub">Simulated for this prototype</span></div>
        <div className="network-status-row">
          <div className="network-chip"><Cpu size={15} /> ESP32 controller <span className="ok">Connected</span></div>
          <div className="network-chip"><Wifi size={15} /> Network <span className="ok">Stable</span></div>
          <div className="network-chip"><Radio size={15} /> Data transmission <span className="ok">Live</span></div>
        </div>
        <div className="sensor-status-list">
          {sensors.map((s) => (
            <div className="sensor-status-row" key={s.id}>
              <span>{s.id}</span>
              <span className="sensor-status-name">{s.name}</span>
              <span className="badge" style={{ color: SEVERITY[s.severity].color, borderColor: SEVERITY[s.severity].color + "55" }}>
                <StatusDot severity={s.severity} size={7} /> {SEVERITY[s.severity].label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   MODALS
   ============================================================ */

function ModalShell({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

function AddLocationModal({ ctx }) {
  const { locations, addLocation, setShowAddLocation } = ctx;
  const [name, setName] = useState("");
  const [type, setType] = useState("Building");
  const [parentId, setParentId] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    addLocation({ name: name.trim(), type, parentId: parentId || null });
    setShowAddLocation(false);
  };

  return (
    <ModalShell title="Add location" onClose={() => setShowAddLocation(false)}>
      <label className="field-label">Location name</label>
      <input className="aq-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. North Wash Area" />
      <label className="field-label">Type</label>
      <select className="aq-select" value={type} onChange={(e) => setType(e.target.value)}>
        {LOCATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <label className="field-label">Parent location</label>
      <select className="aq-select" value={parentId} onChange={(e) => setParentId(e.target.value)}>
        <option value="">None (top level)</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button className="btn-primary full" onClick={submit}>Create location</button>
    </ModalShell>
  );
}

function AddSensorModal({ ctx }) {
  const { locations, sensors, addSensor, setShowAddSensor } = ctx;
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState(locations[0]?.id || "");
  const [flowRate, setFlowRate] = useState(6);
  const [type, setType] = useState("Water Flow Sensor");
  const [status, setStatus] = useState("ONLINE");
  const [error, setError] = useState("");

  const submit = () => {
    if (!id.trim() || !name.trim()) { setError("Sensor ID and name are required."); return; }
    if (sensors.some((s) => s.id === id.trim())) { setError("A sensor with this ID already exists."); return; }
    addSensor({
      id: id.trim(), name: name.trim(), locationId, type, status,
      baseFlowRate: flowRate, flowRate: 0, isFlowing: false, duration: 0,
      currentUsed: 0, currentAllowed: 0, currentWasted: 0,
      severity: status === "OFFLINE" ? "OFFLINE" : "NORMAL",
      todayUsed: 0, todayWasted: 0, eventsToday: 0, currentAlertId: null, overrides: null,
    });
    setShowAddSensor(false);
  };

  return (
    <ModalShell title="Add sensor" onClose={() => setShowAddSensor(false)}>
      <label className="field-label">Sensor ID</label>
      <input className="aq-input" value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. WS-050" />
      <label className="field-label">Sensor name</label>
      <input className="aq-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Break Room Tap" />
      <label className="field-label">Location</label>
      <select className="aq-select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.type})</option>)}
      </select>
      <label className="field-label">Base flow rate (L/min)</label>
      <input className="aq-input" type="number" step="0.1" value={flowRate} onChange={(e) => setFlowRate(Number(e.target.value))} />
      <label className="field-label">Sensor type</label>
      <input className="aq-input" value={type} onChange={(e) => setType(e.target.value)} />
      <label className="field-label">Status</label>
      <select className="aq-select" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="ONLINE">Online</option>
        <option value="OFFLINE">Offline</option>
      </select>
      {error && <div className="form-error">{error}</div>}
      <button className="btn-primary full" onClick={submit}>Register sensor</button>
    </ModalShell>
  );
}

/* ============================================================
   STYLES
   ============================================================ */

function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

      .aq-root {
        --bg: #0A1220; --panel: #101A2E; --panel-2: #16233D; --border: #223151;
        --text: #E8EEF9; --text-dim: #8FA0BE;
        --c-normal: #34D399; --c-flow: #38BDF8; --c-warning: #FBBF24; --c-wastage: #F87171; --c-critical: #EF4444; --c-offline: #64748B;
        display: flex; width: 100%; min-height: 100vh; background: var(--bg); color: var(--text);
        font-family: 'Inter', system-ui, sans-serif; font-size: 14px;
      }
      .aq-root * { box-sizing: border-box; }
      .aq-root h1, .aq-root h3 { font-family: 'Space Grotesk', 'Inter', sans-serif; margin: 0; }
      .aq-root button { font-family: inherit; cursor: pointer; }
      .aq-root select, .aq-root input { font-family: inherit; }

      /* sidebar */
      .aq-sidebar { width: 216px; flex-shrink: 0; background: var(--panel-2); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 18px 12px; }
      .aq-logo { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
      .aq-logo-mark { width: 34px; height: 34px; border-radius: 10px; background: linear-gradient(135deg, #38BDF8, #22D3C4); display: flex; align-items: center; justify-content: center; color: #06202A; }
      .aq-logo-title { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; letter-spacing: .2px; }
      .aq-logo-sub { font-size: 11px; color: var(--text-dim); }
      .aq-nav { display: flex; flex-direction: column; gap: 3px; flex: 1; }
      .aq-nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 9px; border: none; background: transparent; color: var(--text-dim); text-align: left; font-size: 13.5px; font-weight: 500; position: relative; transition: background .15s, color .15s; }
      .aq-nav-item:hover { background: rgba(255,255,255,.04); color: var(--text); }
      .aq-nav-item.active { background: rgba(56,189,248,.12); color: #7BD4F7; }
      .aq-nav-badge { margin-left: auto; background: var(--c-wastage); color: #2A0A0A; font-size: 10px; font-weight: 700; border-radius: 20px; padding: 1px 6px; }
      .aq-sidebar-foot { border-top: 1px solid var(--border); padding-top: 12px; font-size: 11px; color: var(--text-dim); }
      .aq-sim-note { margin-bottom: 6px; }
      .aq-sim-dot { display: flex; align-items: center; gap: 6px; color: var(--c-normal); font-weight: 600; }
      .pulse-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--c-normal); box-shadow: 0 0 0 0 rgba(52,211,153,.6); animation: pulseDot 1.6s infinite; }
      @keyframes pulseDot { 0%{box-shadow:0 0 0 0 rgba(52,211,153,.55);} 70%{box-shadow:0 0 0 7px rgba(52,211,153,0);} 100%{box-shadow:0 0 0 0 rgba(52,211,153,0);} }

      /* main */
      .aq-main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
      .aq-topbar { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 18px 26px 10px; flex-wrap: wrap; }
      .aq-topbar-title h1 { font-size: 20px; font-weight: 700; }
      .aq-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
      .aq-chip { display: flex; align-items: center; gap: 8px; background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px; }
      .aq-chip-value { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13.5px; line-height: 1.1; }
      .aq-chip-label { font-size: 10px; color: var(--text-dim); }
      .aq-content { flex: 1; padding: 6px 26px 30px; overflow-y: auto; }

      /* panels */
      .panel { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 18px; }
      .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
      .panel-head h3 { font-size: 15px; font-weight: 600; }
      .panel-sub { font-size: 11.5px; color: var(--text-dim); }

      .aq-grid-dash { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; margin-top: 10px; }
      .stat-cards { grid-column: span 6; display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
      .span-2 { grid-column: span 3; }
      .span-3 { grid-column: span 6; }
      @media (max-width: 1100px) { .stat-cards, .aq-grid-dash { grid-template-columns: repeat(2, 1fr); } .span-2, .span-3 { grid-column: span 2; } }

      .stat-card { background: var(--panel); border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; position: relative; overflow: hidden; }
      .stat-icon { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; margin-bottom: 10px; background: rgba(255,255,255,.05); }
      .stat-card.tone-normal .stat-icon { color: var(--c-normal); }
      .stat-card.tone-flow .stat-icon { color: var(--c-flow); }
      .stat-card.tone-warning .stat-icon { color: var(--c-warning); }
      .stat-card.tone-wastage .stat-icon { color: var(--c-wastage); }
      .stat-value { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; line-height: 1; }
      .stat-label { font-size: 11.5px; color: var(--text-dim); margin-top: 5px; }

      .status-dot { display: inline-block; border-radius: 50%; background: var(--dot-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--dot-color) 25%, transparent); flex-shrink: 0; }
      .status-dot.pulsing { animation: dotPulse 1s infinite; }
      @keyframes dotPulse { 0%,100%{ opacity: 1; } 50%{ opacity: .45; } }

      .mini-alert-list { display: flex; flex-direction: column; gap: 10px; max-height: 260px; overflow-y: auto; }
      .mini-alert { display: flex; gap: 9px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border); }
      .mini-alert:last-child { border-bottom: none; }
      .mini-alert-top { display: flex; justify-content: space-between; font-size: 12.5px; gap: 8px; }
      .mini-alert-top span { color: var(--text-dim); font-size: 11px; }
      .mini-alert-loc { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
      .mini-alert-body { flex: 1; min-width: 0; }

      .loc-overview-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
      .loc-overview-card { border: 1px solid var(--border); border-radius: 12px; padding: 13px; border-top: 3px solid var(--tone); background: rgba(255,255,255,.015); }
      .loc-overview-top { display: flex; align-items: center; gap: 7px; font-weight: 600; font-size: 13px; margin-bottom: 10px; }
      .loc-overview-stats { display: flex; justify-content: space-between; margin-bottom: 10px; }
      .loc-overview-stats div { display: flex; flex-direction: column; }
      .loc-overview-stats span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; }
      .loc-overview-stats label { font-size: 10px; color: var(--text-dim); }
      .loc-overview-status { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--text-dim); }

      .two-col { display: grid; grid-template-columns: 1.1fr 1.4fr; gap: 16px; align-items: start; }
      @media (max-width: 1000px) { .two-col { grid-template-columns: 1fr; } }

      .btn-ghost, .btn-primary, .btn-danger, .btn-warn, .btn-wastage, .btn-critical { display: inline-flex; align-items: center; gap: 6px; border-radius: 9px; padding: 8px 13px; font-size: 12.5px; font-weight: 600; border: 1px solid transparent; }
      .btn-ghost { background: rgba(255,255,255,.05); color: var(--text); border-color: var(--border); }
      .btn-ghost:hover { background: rgba(255,255,255,.09); }
      .btn-ghost.xs { padding: 4px 9px; font-size: 11px; }
      .btn-primary { background: linear-gradient(135deg, #38BDF8, #22D3C4); color: #06202A; }
      .btn-danger { background: rgba(248,113,113,.15); color: #FCA5A5; border-color: rgba(248,113,113,.3); }
      .btn-warn { background: rgba(251,191,36,.15); color: #FCD34D; border-color: rgba(251,191,36,.3); }
      .btn-wastage { background: rgba(248,113,113,.18); color: #FCA5A5; border-color: rgba(248,113,113,.35); }
      .btn-critical { background: rgba(239,68,68,.22); color: #FCA5A5; border-color: rgba(239,68,68,.4); }
      .btn-primary.full { width: 100%; justify-content: center; margin-top: 16px; }

      .tree-wrap { max-height: 560px; overflow-y: auto; }
      .tree-row { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
      .tree-row:hover { background: rgba(255,255,255,.04); }
      .tree-row.active { background: rgba(56,189,248,.12); }
      .tree-caret, .tree-caret-spacer { width: 16px; display: flex; align-items: center; color: var(--text-dim); }
      .tree-name { font-weight: 500; }
      .tree-type { font-size: 10.5px; color: var(--text-dim); background: rgba(255,255,255,.05); padding: 1px 6px; border-radius: 6px; }
      .tree-count { margin-left: auto; font-size: 10.5px; color: var(--text-dim); }

      .loc-detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 16px; }
      .loc-detail-stats > div { background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 10px; display: flex; flex-direction: column; gap: 3px; align-items: flex-start; }
      .loc-detail-stats span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; }
      .loc-detail-stats label { font-size: 10.5px; color: var(--text-dim); }

      .sensor-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 12px; }
      .sensor-card { border: 1px solid var(--border); border-top: 3px solid var(--tone); border-radius: 12px; padding: 12px; cursor: pointer; background: rgba(255,255,255,.015); transition: transform .1s; }
      .sensor-card:hover { transform: translateY(-2px); }
      .sensor-card.highlight { outline: 2px solid var(--tone); }
      .sensor-card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .sensor-id { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 12.5px; }
      .sensor-name { font-size: 13px; font-weight: 500; margin-bottom: 4px; }
      .sensor-loc { font-size: 10.5px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 10px; }
      .sensor-card-bottom { display: flex; align-items: center; justify-content: space-between; }
      .sensor-flow-rate { font-size: 11px; color: var(--c-flow); font-weight: 600; }
      .badge { font-size: 10.5px; font-weight: 700; border: 1px solid; border-radius: 20px; padding: 2px 8px; display: inline-flex; align-items: center; gap: 4px; }

      .alarm-pulse { animation: cardAlarm 1s infinite; }
      @keyframes cardAlarm { 0%,100%{ box-shadow: 0 0 0 0 var(--tone); } 50%{ box-shadow: 0 0 14px 1px var(--tone); } }

      .filter-row { display: flex; gap: 7px; flex-wrap: wrap; margin-bottom: 14px; }
      .filter-pill { background: rgba(255,255,255,.04); border: 1px solid var(--border); color: var(--text-dim); font-size: 11.5px; font-weight: 600; padding: 5px 11px; border-radius: 20px; }
      .filter-pill.active { background: rgba(56,189,248,.15); color: #7BD4F7; border-color: rgba(56,189,248,.4); }

      .detail-loc-path { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 11.5px; color: var(--text-dim); margin-bottom: 14px; }
      .detail-readout { border: 1px solid var(--border); border-radius: 12px; padding: 14px; margin-bottom: 16px; border-left: 3px solid var(--tone); }
      .detail-readout-status { display: flex; align-items: center; gap: 8px; font-weight: 600; margin-bottom: 10px; }
      .detail-readout-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
      .detail-readout-grid.big { grid-template-columns: repeat(3, 1fr); }
      .detail-readout-grid div { display: flex; flex-direction: column; gap: 2px; }
      .detail-readout-grid label { font-size: 10.5px; color: var(--text-dim); }
      .detail-readout-grid span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 14.5px; }
      .detail-actions { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }

      .sim-layout { display: grid; grid-template-columns: 360px 1fr; gap: 16px; align-items: start; }
      @media (max-width: 1100px) { .sim-layout { grid-template-columns: 1fr; } }
      .sim-right { display: flex; flex-direction: column; gap: 14px; }
      .field-label { display: block; font-size: 11.5px; color: var(--text-dim); margin: 12px 0 6px; }
      .aq-select, .aq-input { width: 100%; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 8px 10px; font-size: 13px; }
      .aq-select.sm { width: auto; }
      .aq-range { width: 100%; accent-color: #38BDF8; }
      .sim-controls { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
      .scenario-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      .scenario-btn { display: flex; align-items: center; gap: 7px; background: rgba(255,255,255,.04); border: 1px solid var(--border); color: var(--text); border-radius: 9px; padding: 9px 10px; font-size: 12px; font-weight: 500; text-align: left; }
      .scenario-btn:hover { background: rgba(255,255,255,.08); }

      .event-stream { max-height: 220px; overflow-y: auto; display: flex; flex-direction: column-reverse; gap: 0; }
      .event-row { display: flex; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 12px; }
      .event-time { color: var(--text-dim); width: 66px; flex-shrink: 0; font-family: 'Space Grotesk', sans-serif; }
      .event-sensor { font-weight: 700; width: 60px; flex-shrink: 0; }
      .event-text { color: var(--text-dim); }

      .alarm-overlay-backdrop { position: fixed; inset: 0; background: rgba(4,8,16,.72); backdrop-filter: blur(3px); display: flex; align-items: flex-start; justify-content: center; padding-top: 60px; z-index: 60; }
      .alarm-overlay { width: 420px; max-width: 92vw; background: #14131d; border: 1px solid var(--tone); border-radius: 16px; padding: 22px; box-shadow: 0 0 40px 4px color-mix(in srgb, var(--tone) 45%, transparent); animation: alarmIn .25s ease; }
      @keyframes alarmIn { from{ transform: translateY(-14px); opacity: 0;} to{ transform: translateY(0); opacity: 1;} }
      .alarm-head { display: flex; align-items: center; gap: 10px; color: var(--tone); font-weight: 700; font-size: 16px; margin-bottom: 10px; animation: dotPulse 1s infinite; }
      .alarm-sensor { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; }
      .alarm-path { color: var(--text-dim); font-size: 12px; margin: 4px 0 14px; }
      .alarm-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 18px; }
      .alarm-grid div { display: flex; flex-direction: column; gap: 2px; }
      .alarm-grid label { font-size: 10.5px; color: var(--text-dim); }
      .alarm-grid span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 15px; }
      .alarm-actions { display: flex; gap: 8px; flex-wrap: wrap; }

      .table-wrap { overflow-x: auto; }
      .aq-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .aq-table th { text-align: left; color: var(--text-dim); font-weight: 600; padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
      .aq-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
      .loc-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; }

      .analytics-layout { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; }
      @media (max-width: 1000px) { .analytics-layout { grid-template-columns: 1fr; } }
      .analytics-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
      .analytics-stat { background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
      .analytics-stat span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }
      .analytics-stat label { font-size: 10.5px; color: var(--text-dim); }
      .insight-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
      .insight-list li { padding: 10px 12px; background: rgba(56,189,248,.06); border: 1px solid rgba(56,189,248,.18); border-radius: 10px; font-size: 12.5px; line-height: 1.5; }
      .predict-row { display: flex; gap: 12px; flex-wrap: wrap; }
      .predict-row > div { flex: 1; min-width: 130px; background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 12px; display: flex; flex-direction: column; gap: 4px; }
      .predict-row span { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 16px; }
      .predict-row label { font-size: 10.5px; color: var(--text-dim); }
      .highlight-cell { border-color: rgba(52,211,153,.4) !important; background: rgba(52,211,153,.08) !important; }
      .highlight-cell span { color: var(--c-normal); }

      .settings-field { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border); }
      .settings-field label { font-size: 12.5px; color: var(--text-dim); }
      .settings-field input { width: 90px; background: var(--panel-2); border: 1px solid var(--border); color: var(--text); border-radius: 7px; padding: 5px 8px; text-align: right; }
      .check-row { display: flex; align-items: center; gap: 8px; font-size: 12.5px; margin: 14px 0; color: var(--text-dim); }

      .arch-chain { display: flex; flex-direction: column; align-items: center; gap: 4px; margin: 8px 0 18px; }
      .arch-step { width: 100%; max-width: 320px; background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 10px 14px; text-align: center; }
      .arch-step-label { font-family: 'Space Grotesk', sans-serif; font-weight: 700; font-size: 13px; }
      .arch-step-note { font-size: 10.5px; color: var(--text-dim); margin-top: 2px; }
      .arch-arrow { color: var(--text-dim); font-size: 15px; }
      .arch-callout { font-size: 12px; color: var(--text-dim); line-height: 1.6; border-top: 1px solid var(--border); padding-top: 14px; }

      .network-status-row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
      .network-chip { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,.03); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; font-size: 12px; }
      .network-chip .ok { color: var(--c-normal); font-weight: 700; margin-left: 6px; }
      .sensor-status-list { display: flex; flex-direction: column; gap: 6px; max-height: 320px; overflow-y: auto; }
      .sensor-status-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 1px solid var(--border); border-radius: 9px; font-size: 12.5px; }
      .sensor-status-name { color: var(--text-dim); flex: 1; }

      .modal-backdrop { position: fixed; inset: 0; background: rgba(4,8,16,.65); display: flex; align-items: center; justify-content: center; z-index: 70; }
      .modal-card { width: 400px; max-width: 92vw; background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 20px; max-height: 88vh; overflow-y: auto; }
      .modal-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
      .icon-btn { background: transparent; border: none; color: var(--text-dim); padding: 4px; }
      .form-error { color: var(--c-wastage); font-size: 12px; margin-top: 10px; }

      .empty-note { color: var(--text-dim); font-size: 12.5px; padding: 18px 4px; text-align: center; }

      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
    `}</style>
  );
}
