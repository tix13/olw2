import React, { useState, useEffect } from "react";
import "./DisplayBoard.css";

const API_URL = "/api.php";
const REFRESH_MS = 60000;
const DEFAULT_REPAIR_HOURS = 1;

// Te same reguły odczytu danych co w panelu admina (AdminPanel.js) - trzymane
// tu osobno, bo to publiczna, niezależna strona bez logowania.
const normalizeRepair = (item) => {
  if (item && typeof item === "object") {
    const godziny = Number(item.godziny);
    return {
      nazwa: item.nazwa || "",
      godziny: Number.isFinite(godziny) && godziny > 0 ? godziny : DEFAULT_REPAIR_HOURS,
    };
  }
  return { nazwa: String(item), godziny: DEFAULT_REPAIR_HOURS };
};

const getRepairTypes = (appointment) => {
  if (Array.isArray(appointment.rodzaj_naprawy)) {
    return appointment.rodzaj_naprawy.map(normalizeRepair);
  }
  if (typeof appointment.rodzaj_naprawy === "string" && appointment.rodzaj_naprawy.trim()) {
    return [normalizeRepair(appointment.rodzaj_naprawy)];
  }
  return [];
};

const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Uwzględnia wielodniowe naprawy (date_to) - auto pojawia się na każdym dniu
// swojego zakresu, nie tylko w dniu rozpoczęcia
const isAppointmentOnDate = (appointment, key) => {
  const from = (appointment.date || "").slice(0, 10);
  const to = (appointment.date_to || appointment.date || "").slice(0, 10);
  if (!from) return false;
  return key >= from && key <= to;
};

const STATUS_LABELS = {
  oczekujące: "Do potwierdzenia",
  zaakceptowane: "Potwierdzona",
};

const STATION_COUNT = 4;

// Zawsze zwraca dokładnie STATION_COUNT slotów (1..N), uzupełniając ewentualne
// braki pustymi stanowiskami
const normalizeStanowiska = (stanowiska) => {
  const byNumer = new Map((stanowiska || []).map((s) => [s.numer, s]));
  const result = [];
  for (let numer = 1; numer <= STATION_COUNT; numer++) {
    const existing = byNumer.get(numer);
    result.push({
      numer,
      appointmentId: existing?.appointmentId ?? null,
      godziny: existing?.godziny ?? null,
      customName: existing?.customName ?? null,
    });
  }
  return result;
};

function DisplayBoard() {
  const [appointments, setAppointments] = useState([]);
  const [stanowiska, setStanowiska] = useState([]);
  const [now, setNow] = useState(new Date());
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        const res = await fetch(API_URL);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setAppointments(data.appointments || []);
        setStanowiska(data.stanowiska || []);
        setHasError(false);
      } catch (e) {
        setHasError(true);
      }
      setNow(new Date());
    };

    loadData();
    const interval = setInterval(loadData, REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const forDay = (key) =>
    appointments
      .filter((a) => a.status !== "odrzucone" && isAppointmentOnDate(a, key))
      .sort((a, b) => (a.model_auta || "").localeCompare(b.model_auta || ""));

  const todayList = forDay(formatDateKey(now));
  const tomorrowList = forDay(formatDateKey(tomorrow));

  const dayLabel = (date) =>
    date.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });

  const renderColumn = (title, dateObj, list) => (
    <div className="board-column">
      <div className="board-column-header">
        <h2>{title}</h2>
        <span className="board-column-date">{dayLabel(dateObj)}</span>
      </div>
      {list.length === 0 ? (
        <p className="board-empty">Brak zaplanowanych aut.</p>
      ) : (
        <div className="board-list">
          {list.map((a) => (
            <div
              key={a.id}
              className={`board-card board-card-${
                a.status === "zaakceptowane" ? "accepted" : "pending"
              }`}
            >
              <div className="board-card-top">
                <span className="board-card-model">{a.model_auta}</span>
                <span className="board-card-status">{STATUS_LABELS[a.status] || a.status}</span>
              </div>
              {getRepairTypes(a).length > 0 && (
                <div className="board-card-repairs">
                  {getRepairTypes(a).map((r, i) => (
                    <span key={i} className="board-repair-chip">
                      {r.nazwa}
                    </span>
                  ))}
                </div>
              )}
              {a.notatka && <div className="board-card-note">📝 {a.notatka}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="display-board">
      <div className="board-header">
        <h1>Olwit Auto Serwis</h1>
        <span className="board-clock">
          {now.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
        </span>
        {hasError && (
          <span className="board-error">⚠ Błąd połączenia — dane mogą być nieaktualne</span>
        )}
      </div>
      <div className="board-columns">
        {renderColumn("Dziś", now, todayList)}
        {renderColumn("Jutro", tomorrow, tomorrowList)}
      </div>

      <div className="board-stations">
        <h2 className="board-stations-title">Stanowiska</h2>
        <div className="board-stations-grid">
          {normalizeStanowiska(stanowiska).map((station) => {
            const appointment = station.appointmentId
              ? appointments.find((a) => a.id === station.appointmentId)
              : null;
            const displayName = station.customName || appointment?.model_auta || null;
            return (
              <div
                key={station.numer}
                className={`board-station-card${displayName ? " board-station-card-busy" : ""}`}
              >
                <div className="board-station-number">Stanowisko {station.numer}</div>
                {displayName ? (
                  <>
                    <div className="board-station-model">{displayName}</div>
                    {appointment && getRepairTypes(appointment).length > 0 && (
                      <div className="board-station-repairs">
                        {getRepairTypes(appointment)
                          .map((r) => r.nazwa)
                          .join(", ")}
                      </div>
                    )}
                    {station.godziny != null && (
                      <div className="board-station-hours">⏱ ok. {station.godziny}h</div>
                    )}
                  </>
                ) : (
                  <div className="board-station-empty">Wolne</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default DisplayBoard;
