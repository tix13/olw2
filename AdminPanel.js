import React, { useState, useEffect } from "react";
import Swal from "sweetalert2";
import "./AdminPanel.css";

// ---------------------------------------------------------------------------
// Ścieżka do Twojego skryptu PHP na Twoim hostingu
// Np. "https://twojadomena.pl/api.php" albo po prostu "/api.php" jeśli jest w tym samym folderze
// ---------------------------------------------------------------------------
const API_URL = "/api.php";
const ADMIN_ACCOUNTS = [
  { name: "Vitalii", password: "Olwit25!" },
  { name: "Radek", password: "Nowystart25!" },
];

// Zapisana sesja logowania w przeglądarce - ważna przez 30 dni,
// żeby nie trzeba było wpisywać hasła za każdym razem
const SESSION_KEY = "olwit_admin_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 dni

const readSession = () => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (
      session &&
      typeof session.expires === "number" &&
      session.expires > Date.now() &&
      session.user
    ) {
      return session.user;
    }
    localStorage.removeItem(SESSION_KEY);
    return null;
  } catch (e) {
    return null;
  }
};

const writeSession = (user) => {
  try {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ expires: Date.now() + SESSION_DURATION_MS, user })
    );
  } catch (e) {
    // Prywatny tryb przeglądarki / brak dostępu do localStorage - logowanie
    // po prostu nie zostanie zapamiętane między wizytami
  }
};

const clearSession = () => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {
    // ignorujemy
  }
};

const emptyDb = () => ({
  appointments: [],
  inactiveDays: [],
  orders: [],
  reserveList: [],
  notices: [],
  stanowiska: [],
});

// Liczba fizycznych stanowisk (podnośników) na hali
const STATION_COUNT = 4;

// Zawsze zwraca tablicę dokładnie STATION_COUNT slotów (1..N), uzupełniając
// braki pustymi stanowiskami - niezależnie od tego, ile faktycznie jest
// zapisane w bazie (np. przy pierwszym uruchomieniu tabela jest pusta)
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

const MONTH_NAMES = [
  "Styczeń",
  "Luty",
  "Marzec",
  "Kwiecień",
  "Maj",
  "Czerwiec",
  "Lipiec",
  "Sierpień",
  "Wrzesień",
  "Październik",
  "Listopad",
  "Grudzień",
];

const WEEKDAY_NAMES = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nie"];

const STATUS_CLASS = {
  oczekujące: "pending",
  zaakceptowane: "accepted",
  odrzucone: "rejected",
};

// ---------------------------------------------------------------------------
// Limity mocy przerobowej warsztatu - dostosuj do rzeczywistej liczby
// mechaników i godzin pracy, jeśli się zmienią
// ---------------------------------------------------------------------------
const MECHANICS_COUNT = 4;
const WORKDAY_HOURS = 8;
const DAILY_CAPACITY_HOURS = MECHANICS_COUNT * WORKDAY_HOURS; // 32h dziennie łącznie

// Domyślny czas naprawy dla starych zapisów sprzed wprowadzenia godzin
const DEFAULT_REPAIR_HOURS = 1;

// Ujednolica pojedynczy wpis naprawy do postaci { nazwa, godziny },
// niezależnie od tego czy przyszedł jako obiekt (nowy format) czy zwykły tekst (stary format)
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

// Zwraca listę rodzajów napraw (z godzinami) niezależnie od tego, czy dane zostały
// zapisane jako tablica obiektów (nowy format), tablica tekstów (starszy format),
// czy jako pojedynczy tekst (najstarsze dane)
const getRepairTypes = (appointment) => {
  if (Array.isArray(appointment.rodzaj_naprawy)) {
    return appointment.rodzaj_naprawy.map(normalizeRepair);
  }
  if (typeof appointment.rodzaj_naprawy === "string" && appointment.rodzaj_naprawy.trim()) {
    return [normalizeRepair(appointment.rodzaj_naprawy)];
  }
  return [];
};

// Suma godzin wszystkich napraw w danej wizycie
const getAppointmentHours = (appointment) =>
  getRepairTypes(appointment).reduce((sum, r) => sum + r.godziny, 0);

// Suma godzin już zaplanowanych na dany dzień (pomijając odrzucone wizyty,
// opcjonalnie pomijając też jedną konkretną wizytę - przydatne przy edycji)
const getDayLoadHours = (dateKey, appointments, excludeId = null) =>
  appointments
    .filter(
      (a) =>
        a.date && a.date.slice(0, 10) === dateKey && a.status !== "odrzucone" && a.id !== excludeId
    )
    .reduce((sum, a) => sum + getAppointmentHours(a), 0);

// Zwraca zakres dat (od-do) dla dnia nieczynnego, obsługując też stare
// dane zapisane jako pojedyncza data (bez date_from/date_to)
const getInactiveRange = (day) => {
  const from = day.date_from || day.date || "";
  const to = day.date_to || day.date_from || day.date || "";
  return { from, to };
};

// Sprawdza, czy dana data (w formacie yyyy-mm-dd) mieści się w którymkolwiek
// z zapisanych zakresów dni nieczynnych
const isDateInactive = (inactiveDays, key) =>
  inactiveDays.some((day) => {
    const { from, to } = getInactiveRange(day);
    if (!from || !to) return false;
    return key >= from && key <= to;
  });

const formatDateKey = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

// Dodaje N dni do daty w formacie yyyy-mm-dd i zwraca nowy klucz w tym samym formacie
const addDaysToDateKey = (dateKey, days) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const result = new Date(y, m - 1, d);
  result.setDate(result.getDate() + days);
  return formatDateKey(result);
};

// Sprawdza, czy data (yyyy-mm-dd) przypada na dzień roboczy (poniedziałek-piątek)
const isWeekday = (dateKey) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day >= 1 && day <= 5;
};

// Dolicza N dni ROBOCZYCH do daty startowej (start powinien już być dniem
// roboczym), pomijając po drodze soboty/niedziele - np. "3 dni" zaczęte w
// piątek kończą się we wtorek (piątek, [weekend pominięty], pon, wt)
const addWorkdays = (startKey, extraWorkdays) => {
  let current = startKey;
  let remaining = extraWorkdays;
  let guard = 0;
  while (remaining > 0 && guard < 3660) {
    current = addDaysToDateKey(current, 1);
    if (isWeekday(current)) remaining--;
    guard++;
  }
  return current;
};

// Liczy dni robocze w zakresie [from, to] włącznie - odwrotność addWorkdays,
// używana do odtworzenia "Liczby dni" przy edycji wielodniowej wizyty
const countWorkdaysInRange = (from, to) => {
  let count = 0;
  let current = from;
  let guard = 0;
  while (current <= to && guard < 3660) {
    if (isWeekday(current)) count++;
    current = addDaysToDateKey(current, 1);
    guard++;
  }
  return count;
};

// Ile dni roboczych trwa wizyta (1 = jednodniowa) - na podstawie date i date_to
const getAppointmentDayCount = (appointment) => {
  if (!appointment.date_to || appointment.date_to === appointment.date) return 1;
  const from = appointment.date.slice(0, 10);
  const to = appointment.date_to.slice(0, 10);
  const count = countWorkdaysInRange(from, to);
  return count > 0 ? count : 1;
};

// Zwraca zakres dat (od-do) wizyty - jednodniowe wizyty mają from === to
const getAppointmentRange = (appointment) => {
  const from = (appointment.date || "").slice(0, 10);
  const to = (appointment.date_to || appointment.date || "").slice(0, 10);
  return { from, to };
};

// Sprawdza, czy wizyta obejmuje daną datę (w tym wielodniowe naprawy)
const isAppointmentOnDate = (appointment, key) => {
  const { from, to } = getAppointmentRange(appointment);
  if (!from) return false;
  return key >= from && key <= to;
};

// Zwraca komunikaty (adnotacje) aktywne w danym dniu
const getNoticesForDate = (notices, key) =>
  notices.filter((n) => n.date_from && n.date_to && key >= n.date_from && key <= n.date_to);

// Zwraca 42 dni (6 tygodni) obejmujące cały miesiąc, zaczynając od poniedziałku
const getCalendarDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = poniedziałek
  const startDate = new Date(year, month, 1 - firstWeekday);
  const days = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    days.push(d);
  }
  return days;
};

function AdminPanel() {
  const [db, setDb] = useState(emptyDb());
  const [password, setPassword] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!readSession());
  const [currentUser, setCurrentUser] = useState(() => readSession() || "");

  const [selectedAppointments, setSelectedAppointments] = useState([]);

  const [newAppointment, setNewAppointment] = useState({
    numer_telefonu: "",
    model_auta: "",
    rodzaj_naprawy: [],
    notatka: "",
  });

  const [repairInput, setRepairInput] = useState("");
  const [repairHours, setRepairHours] = useState("1");
  const [liczbaDni, setLiczbaDni] = useState("1");
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [appointmentSearchQuery, setAppointmentSearchQuery] = useState("");

  const [editingAppointmentId, setEditingAppointmentId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [editRepairInput, setEditRepairInput] = useState("");
  const [editRepairHours, setEditRepairHours] = useState("1");
  const [editLiczbaDni, setEditLiczbaDni] = useState("1");

  // Edycja pojedynczej, już przypisanej naprawy wewnątrz edytowanej wizyty
  const [editingRepairIndex, setEditingRepairIndex] = useState(null);
  const [editRepairEditNazwa, setEditRepairEditNazwa] = useState("");
  const [editRepairEditGodziny, setEditRepairEditGodziny] = useState("");

  // ---------------- Lista rezerwowa ----------------
  const [newReserveEntry, setNewReserveEntry] = useState({
    numer_telefonu: "",
    model_auta: "",
    rodzaj_naprawy: [],
  });
  const [reserveRepairInput, setReserveRepairInput] = useState("");
  const [reserveRepairHours, setReserveRepairHours] = useState("1");

  const [newInactiveDay, setNewInactiveDay] = useState({
    date_from: "",
    date_to: "",
    reason: "",
  });

  // ---------------- Komunikaty kalendarza (np. brak mechanika w danym okresie) ----------------
  const [newNotice, setNewNotice] = useState({
    date_from: "",
    date_to: "",
    tresc: "",
  });

  // ---------------- Stanowiska (podnośniki na hali) ----------------
  const [stationDrafts, setStationDrafts] = useState(() => {
    const drafts = {};
    for (let numer = 1; numer <= STATION_COUNT; numer++) {
      drafts[numer] = { appointmentId: "", godziny: "", customName: "" };
    }
    return drafts;
  });

  // Pobiera aktualny stan bazy z serwera (bez dotykania stanu komponentu)
  const fetchLatestDb = async () => {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Błąd odczytu");
    const data = await res.json();
    return {
      appointments: data.appointments || [],
      inactiveDays: data.inactiveDays || [],
      orders: data.orders || [],
      reserveList: data.reserveList || [],
      notices: data.notices || [],
      stanowiska: data.stanowiska || [],
    };
  };

  // Ładowanie całej bazy JSON z serwera przez PHP
  const loadDbFromServer = async () => {
    try {
      const data = await fetchLatestDb();
      setDb(data);
    } catch (e) {
      console.error("Błąd odczytu bazy z serwera:", e);
      Swal.fire({
        icon: "error",
        title: "Błąd bazy",
        text: "Nie udało się pobrać danych z pliku JSON.",
      });
    }
  };

  // Zapisywanie całej bazy JSON na serwer przez PHP. Zwraca true/false, żeby
  // wywołujący kod wiedział, czy zapis faktycznie się udał.
  const saveDbToServer = async (updatedDb) => {
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatedDb),
      });
      if (!res.ok) throw new Error();
      setDb(updatedDb);
      return true;
    } catch (e) {
      console.error("Błąd zapisu bazy na serwer:", e);
      Swal.fire({
        icon: "error",
        title: "Błąd zapisu",
        text: "Nie udało się zapisać danych na serwerze.",
      });
      return false;
    }
  };

  // Pobiera NAJŚWIEŻSZY stan z serwera i dopiero na nim wykonuje podaną zmianę,
  // zamiast bazować na lokalnej (być może nieaktualnej) kopii `db`. Bez tego,
  // jeśli druga osoba (np. na innym komputerze) dodała coś w międzyczasie, a Ty
  // masz otwarty panel dłużej bez odświeżania, Twój zapis nadpisywał całą bazę
  // swoją starą wersją i kasował cudzy świeży wpis. Zwraca true/false.
  const mutateAndSave = async (mutatorFn) => {
    let latest;
    try {
      latest = await fetchLatestDb();
    } catch (e) {
      console.error("Błąd pobierania najświeższych danych przed zapisem:", e);
      Swal.fire({
        icon: "error",
        title: "Błąd zapisu",
        text: "Nie udało się pobrać najświeższych danych z serwera przed zapisem. Spróbuj ponownie.",
      });
      return false;
    }
    return saveDbToServer(mutatorFn(latest));
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadDbFromServer();
    }
  }, [isAuthenticated]);

  // Trzyma lokalne pola formularza stanowisk zsynchronizowane z tym, co ostatnio
  // wczytano z serwera (np. po zapisie albo po odświeżeniu przez inną osobę)
  useEffect(() => {
    const normalized = normalizeStanowiska(db.stanowiska);
    const drafts = {};
    normalized.forEach((s) => {
      drafts[s.numer] = {
        appointmentId: s.appointmentId ? String(s.appointmentId) : "",
        godziny: s.godziny != null ? String(s.godziny) : "",
        customName: s.customName || "",
      };
    });
    setStationDrafts(drafts);
  }, [db.stanowiska]);

  const handleLogin = (e) => {
    e.preventDefault();
    const account = ADMIN_ACCOUNTS.find((acc) => acc.password === password);
    if (account) {
      writeSession(account.name);
      setCurrentUser(account.name);
      setIsAuthenticated(true);
    } else {
      Swal.fire({
        icon: "error",
        title: "Błąd logowania",
        text: "Nieprawidłowe hasło",
      });
    }
  };

  const handleLogout = () => {
    clearSession();
    setIsAuthenticated(false);
    setCurrentUser("");
    setPassword("");
  };

  // Generowanie unikalnego ID (skoro nie mamy auto-increment bazy danych)
  const generateId = (collection) => {
    if (collection.length === 0) return 1;
    return Math.max(...collection.map((item) => item.id || 0)) + 1;
  };

  // ---------------- Umówione auta (wizyty) ----------------

  const handleNewAppointmentChange = (e) => {
    setNewAppointment({ ...newAppointment, [e.target.name]: e.target.value });
  };

  const handleAddAppointment = (e) => {
    e.preventDefault();
    if (!selectedDate) {
      Swal.fire({
        icon: "warning",
        title: "Wybierz dzień",
        text: "Najpierw wybierz dzień w kalendarzu, dla którego chcesz dodać wizytę.",
      });
      return;
    }
    if (
      !newAppointment.numer_telefonu ||
      !newAppointment.model_auta ||
      newAppointment.rodzaj_naprawy.length === 0
    ) {
      Swal.fire({
        icon: "warning",
        title: "Uzupełnij wszystkie pola",
        text: "Dodaj przynajmniej jeden rodzaj naprawy.",
      });
      return;
    }

    const dni = parseInt(liczbaDni, 10);
    if (!Number.isFinite(dni) || dni < 1) {
      Swal.fire({
        icon: "warning",
        title: "Nieprawidłowa liczba dni",
        text: "Liczba dni musi być liczbą całkowitą, przynajmniej 1.",
      });
      return;
    }
    if (!isWeekday(selectedDate)) {
      Swal.fire({
        icon: "warning",
        title: "Weekend jest niedostępny",
        text: `${new Date(selectedDate).toLocaleDateString(
          "pl-PL"
        )} to sobota/niedziela. Wizyty można umawiać tylko w dni robocze (pon-pt).`,
      });
      return;
    }
    // Wielodniowe naprawy same pomijają weekendy przy liczeniu dni - "3 dni"
    // zaczęte w piątek skończą się we wtorek, bez liczenia soboty/niedzieli.
    const dateTo = dni > 1 ? addWorkdays(selectedDate, dni - 1) : selectedDate;

    const newHours = newAppointment.rodzaj_naprawy.reduce((sum, r) => sum + r.godziny, 0);
    const existingLoad = getDayLoadHours(selectedDate, db.appointments);
    const total = existingLoad + newHours;

    const saveAppointment = async () => {
      const ok = await mutateAndSave((latest) => ({
        ...latest,
        appointments: [
          ...latest.appointments,
          {
            id: generateId(latest.appointments),
            ...newAppointment,
            date: selectedDate,
            date_to: dateTo,
            status: "oczekujące",
            dodane_przez: currentUser,
          },
        ],
      }));
      if (!ok) return;
      setNewAppointment({
        numer_telefonu: "",
        model_auta: "",
        rodzaj_naprawy: [],
        notatka: "",
      });
      setRepairInput("");
      setRepairHours("1");
      setLiczbaDni("1");
      Swal.fire({
        icon: "success",
        title: "Dodano",
        text:
          dni > 1
            ? `Wizyta została zapisana na ${dni} dni (${new Date(selectedDate).toLocaleDateString(
                "pl-PL"
              )} – ${new Date(dateTo).toLocaleDateString("pl-PL")}).`
            : "Wizyta została zapisana.",
      });
    };

    if (total > DAILY_CAPACITY_HOURS) {
      Swal.fire({
        icon: "warning",
        title: "Przekroczony dzienny limit godzin",
        html:
          `Na <b>${new Date(selectedDate).toLocaleDateString("pl-PL")}</b> zaplanowano już ` +
          `<b>${existingLoad}h</b> pracy z limitu <b>${DAILY_CAPACITY_HOURS}h</b> ` +
          `(${MECHANICS_COUNT} mechaników × ${WORKDAY_HOURS}h). Ta wizyta doda kolejne ` +
          `<b>${newHours}h</b> - łącznie <b>${total}h</b> ` +
          `(przekroczenie o ${(total - DAILY_CAPACITY_HOURS).toFixed(2)}h).<br/><br/>` +
          `Czy mimo to dodać wizytę?`,
        showCancelButton: true,
        confirmButtonText: "Dodaj mimo to",
        cancelButtonText: "Anuluj",
        confirmButtonColor: "#d4af37",
        cancelButtonColor: "#6c757d",
      }).then((result) => {
        if (result.isConfirmed) saveAppointment();
      });
    } else {
      saveAppointment();
    }
  };

  // Dodawanie pojedynczego rodzaju naprawy (z czasem w godzinach) do listy w formularzu
  const handleAddRepairType = () => {
    const nazwa = repairInput.trim();
    const godziny = parseFloat(repairHours);
    if (!nazwa) return;
    if (!Number.isFinite(godziny) || godziny <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Podaj czas naprawy",
        text: "Czas musi być liczbą większą od zera (np. 1 albo 1.5).",
      });
      return;
    }
    setNewAppointment((prev) => ({
      ...prev,
      rodzaj_naprawy: [...prev.rodzaj_naprawy, { nazwa, godziny }],
    }));
    setRepairInput("");
    setRepairHours("1");
  };

  const handleRemoveRepairType = (index) => {
    setNewAppointment((prev) => ({
      ...prev,
      rodzaj_naprawy: prev.rodzaj_naprawy.filter((_, i) => i !== index),
    }));
  };

  const handleRepairInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddRepairType();
    }
  };

  // ---------------- Kalendarz wizyt ----------------

  const handlePrevMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  const handleGoToday = () => {
    setCalendarMonth(new Date());
    setSelectedDate(formatDateKey(new Date()));
  };

  // Wyszukiwarka wizyt (po telefonie, modelu auta lub rodzaju naprawy) —
  // przeszukuje wszystkie wizyty niezależnie od miesiąca/dnia w kalendarzu
  const getAppointmentSearchResults = () => {
    const query = appointmentSearchQuery.trim().toLowerCase();
    if (!query) return [];
    return db.appointments
      .filter((a) => {
        const haystack = [
          a.numer_telefonu,
          a.model_auta,
          a.notatka,
          ...getRepairTypes(a).map((r) => r.nazwa),
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  };

  // Przełącza kalendarz na miesiąc i dzień danej wizyty, żeby można było ją
  // od razu zobaczyć/edytować w zwykłym widoku dnia
  const handleJumpToAppointmentDate = (appointment) => {
    const dateKey = (appointment.date || "").slice(0, 10);
    if (!dateKey) return;
    const [year, month] = dateKey.split("-").map(Number);
    setCalendarMonth(new Date(year, month - 1, 1));
    setSelectedDate(dateKey);
    setAppointmentSearchQuery("");
  };

  const handleStatusChange = (id, newStatus) => {
    mutateAndSave((latest) => ({
      ...latest,
      appointments: latest.appointments.map((a) => (a.id === id ? { ...a, status: newStatus } : a)),
    }));
    setSelectedAppointments([]);
  };

  const handleDeleteAppointment = (id) => {
    Swal.fire({
      title: "Czy na pewno?",
      text: "Czy chcesz usunąć tę wizytę?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Usuń",
      cancelButtonText: "Anuluj",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await mutateAndSave((latest) => ({
          ...latest,
          appointments: latest.appointments.filter((a) => a.id !== id),
        }));
        if (!ok) return;
        setSelectedAppointments((prev) => prev.filter((item) => item !== id));
        Swal.fire({ icon: "success", title: "Usunięto" });
      }
    });
  };

  const handleBulkDeleteAppointments = () => {
    if (selectedAppointments.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Brak wyboru",
        text: "Nie wybrano żadnych wizyt do usunięcia.",
      });
      return;
    }
    Swal.fire({
      title: "Czy na pewno?",
      text: `Czy chcesz usunąć ${selectedAppointments.length} wizyt(y)?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Usuń",
      cancelButtonText: "Anuluj",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await mutateAndSave((latest) => ({
          ...latest,
          appointments: latest.appointments.filter((a) => !selectedAppointments.includes(a.id)),
        }));
        if (!ok) return;
        setSelectedAppointments([]);
        Swal.fire({
          icon: "success",
          title: "Usunięto",
          text: "Wybrane wizyty zostały usunięte.",
        });
      }
    });
  };

  const handleSelectAppointment = (id) => {
    setSelectedAppointments((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ---------------- Edycja istniejącej wizyty ----------------

  const handleStartEditAppointment = (appointment) => {
    setEditingAppointmentId(appointment.id);
    setEditDraft({
      numer_telefonu: appointment.numer_telefonu,
      model_auta: appointment.model_auta,
      date: appointment.date,
      rodzaj_naprawy: getRepairTypes(appointment),
      notatka: appointment.notatka || "",
    });
    setEditRepairInput("");
    setEditRepairHours("1");
    setEditingRepairIndex(null);
    setEditLiczbaDni(String(getAppointmentDayCount(appointment)));
  };

  const handleCancelEditAppointment = () => {
    setEditingAppointmentId(null);
    setEditDraft(null);
    setEditRepairInput("");
    setEditRepairHours("1");
    setEditingRepairIndex(null);
    setEditLiczbaDni("1");
  };

  const handleEditDraftChange = (e) => {
    setEditDraft((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAddEditRepairType = () => {
    const nazwa = editRepairInput.trim();
    const godziny = parseFloat(editRepairHours);
    if (!nazwa) return;
    if (!Number.isFinite(godziny) || godziny <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Podaj czas naprawy",
        text: "Czas musi być liczbą większą od zera (np. 1 albo 1.5).",
      });
      return;
    }
    setEditDraft((prev) => ({
      ...prev,
      rodzaj_naprawy: [...prev.rodzaj_naprawy, { nazwa, godziny }],
    }));
    setEditRepairInput("");
    setEditRepairHours("1");
  };

  const handleRemoveEditRepairType = (index) => {
    setEditDraft((prev) => ({
      ...prev,
      rodzaj_naprawy: prev.rodzaj_naprawy.filter((_, i) => i !== index),
    }));
    if (editingRepairIndex === index) {
      setEditingRepairIndex(null);
    }
  };

  // Edycja już przypisanej naprawy (zamiast usuwania i dodawania od nowa)
  const handleStartEditRepairItem = (index, repair) => {
    setEditingRepairIndex(index);
    setEditRepairEditNazwa(repair.nazwa);
    setEditRepairEditGodziny(String(repair.godziny));
  };

  const handleCancelEditRepairItem = () => {
    setEditingRepairIndex(null);
    setEditRepairEditNazwa("");
    setEditRepairEditGodziny("");
  };

  const handleSaveEditRepairItem = () => {
    const nazwa = editRepairEditNazwa.trim();
    const godziny = parseFloat(editRepairEditGodziny);
    if (!nazwa) return;
    if (!Number.isFinite(godziny) || godziny <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Podaj czas naprawy",
        text: "Czas musi być liczbą większą od zera (np. 1 albo 1.5).",
      });
      return;
    }
    setEditDraft((prev) => ({
      ...prev,
      rodzaj_naprawy: prev.rodzaj_naprawy.map((r, i) =>
        i === editingRepairIndex ? { nazwa, godziny } : r
      ),
    }));
    handleCancelEditRepairItem();
  };

  const handleSaveEditAppointment = () => {
    if (!editDraft.numer_telefonu || !editDraft.model_auta || !editDraft.date) {
      Swal.fire({
        icon: "warning",
        title: "Uzupełnij wszystkie pola",
        text: "Telefon, model auta i data są wymagane.",
      });
      return;
    }
    if (editDraft.rodzaj_naprawy.length === 0) {
      Swal.fire({
        icon: "warning",
        title: "Dodaj rodzaj naprawy",
        text: "Wizyta musi mieć przynajmniej jeden rodzaj naprawy.",
      });
      return;
    }
    const editDni = parseInt(editLiczbaDni, 10);
    if (!Number.isFinite(editDni) || editDni < 1) {
      Swal.fire({
        icon: "warning",
        title: "Nieprawidłowa liczba dni",
        text: "Liczba dni musi być liczbą całkowitą, przynajmniej 1.",
      });
      return;
    }
    if (!isWeekday(editDraft.date)) {
      Swal.fire({
        icon: "warning",
        title: "Weekend jest niedostępny",
        text: `${new Date(editDraft.date).toLocaleDateString(
          "pl-PL"
        )} to sobota/niedziela. Wizyty można umawiać tylko w dni robocze (pon-pt).`,
      });
      return;
    }
    const editDateTo = editDni > 1 ? addWorkdays(editDraft.date, editDni - 1) : editDraft.date;

    const newHours = editDraft.rodzaj_naprawy.reduce((sum, r) => sum + r.godziny, 0);
    const existingLoad = getDayLoadHours(editDraft.date, db.appointments, editingAppointmentId);
    const total = existingLoad + newHours;

    const saveChanges = async () => {
      const ok = await mutateAndSave((latest) => ({
        ...latest,
        appointments: latest.appointments.map((a) =>
          a.id === editingAppointmentId
            ? {
                ...a,
                numer_telefonu: editDraft.numer_telefonu,
                model_auta: editDraft.model_auta,
                date: editDraft.date,
                date_to: editDateTo,
                rodzaj_naprawy: editDraft.rodzaj_naprawy,
                notatka: editDraft.notatka,
              }
            : a
        ),
      }));
      if (!ok) return;
      setEditingAppointmentId(null);
      setEditDraft(null);
      setEditingRepairIndex(null);
      setEditLiczbaDni("1");
      Swal.fire({
        icon: "success",
        title: "Zapisano",
        text: "Wizyta została zaktualizowana.",
      });
    };

    if (total > DAILY_CAPACITY_HOURS) {
      Swal.fire({
        icon: "warning",
        title: "Przekroczony dzienny limit godzin",
        html:
          `Na <b>${new Date(editDraft.date).toLocaleDateString("pl-PL")}</b> zaplanowano już ` +
          `<b>${existingLoad}h</b> pracy (bez tej wizyty) z limitu <b>${DAILY_CAPACITY_HOURS}h</b> ` +
          `(${MECHANICS_COUNT} mechaników × ${WORKDAY_HOURS}h). Po edycji ta wizyta zajmie ` +
          `<b>${newHours}h</b> - łącznie <b>${total}h</b> ` +
          `(przekroczenie o ${(total - DAILY_CAPACITY_HOURS).toFixed(2)}h).<br/><br/>` +
          `Czy mimo to zapisać zmiany?`,
        showCancelButton: true,
        confirmButtonText: "Zapisz mimo to",
        cancelButtonText: "Anuluj",
        confirmButtonColor: "#d4af37",
        cancelButtonColor: "#6c757d",
      }).then((result) => {
        if (result.isConfirmed) saveChanges();
      });
    } else {
      saveChanges();
    }
  };

  // ---------------- Lista rezerwowa ----------------
  // Auta zgłoszone, ale jeszcze bez przypisanego dnia w kalendarzu.
  // Stąd admin może w dowolnym momencie przenieść wpis na wybrany dzień kalendarza.

  const handleNewReserveChange = (e) => {
    setNewReserveEntry({ ...newReserveEntry, [e.target.name]: e.target.value });
  };

  const handleAddReserveRepairType = () => {
    const nazwa = reserveRepairInput.trim();
    const godziny = parseFloat(reserveRepairHours);
    if (!nazwa) return;
    if (!Number.isFinite(godziny) || godziny <= 0) {
      Swal.fire({
        icon: "warning",
        title: "Podaj czas naprawy",
        text: "Czas musi być liczbą większą od zera (np. 1 albo 1.5).",
      });
      return;
    }
    setNewReserveEntry((prev) => ({
      ...prev,
      rodzaj_naprawy: [...prev.rodzaj_naprawy, { nazwa, godziny }],
    }));
    setReserveRepairInput("");
    setReserveRepairHours("1");
  };

  const handleRemoveReserveRepairType = (index) => {
    setNewReserveEntry((prev) => ({
      ...prev,
      rodzaj_naprawy: prev.rodzaj_naprawy.filter((_, i) => i !== index),
    }));
  };

  const handleReserveRepairInputKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddReserveRepairType();
    }
  };

  const handleAddReserveEntry = async (e) => {
    e.preventDefault();
    if (
      !newReserveEntry.numer_telefonu ||
      !newReserveEntry.model_auta ||
      newReserveEntry.rodzaj_naprawy.length === 0
    ) {
      Swal.fire({
        icon: "warning",
        title: "Uzupełnij wszystkie pola",
        text: "Dodaj przynajmniej jeden rodzaj naprawy.",
      });
      return;
    }

    const ok = await mutateAndSave((latest) => ({
      ...latest,
      reserveList: [
        ...latest.reserveList,
        {
          id: generateId(latest.reserveList),
          ...newReserveEntry,
          dodane_przez: currentUser,
        },
      ],
    }));
    if (!ok) return;
    setNewReserveEntry({ numer_telefonu: "", model_auta: "", rodzaj_naprawy: [] });
    setReserveRepairInput("");
    setReserveRepairHours("1");
    Swal.fire({
      icon: "success",
      title: "Dodano",
      text: "Auto dodane do listy rezerwowej.",
    });
  };

  const handleDeleteReserveEntry = (id) => {
    Swal.fire({
      title: "Czy na pewno?",
      text: "Czy chcesz usunąć ten wpis z listy rezerwowej?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Usuń",
      cancelButtonText: "Anuluj",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await mutateAndSave((latest) => ({
          ...latest,
          reserveList: latest.reserveList.filter((r) => r.id !== id),
        }));
        if (!ok) return;
        Swal.fire({ icon: "success", title: "Usunięto" });
      }
    });
  };

  // Przenosi wpis z listy rezerwowej na aktualnie wybrany w kalendarzu dzień
  const handleMoveReserveToCalendar = (entry) => {
    if (!selectedDate) {
      Swal.fire({
        icon: "warning",
        title: "Wybierz dzień",
        text: "Najpierw wybierz dzień w kalendarzu, na który chcesz przenieść to auto.",
      });
      return;
    }

    if (!isWeekday(selectedDate)) {
      Swal.fire({
        icon: "warning",
        title: "Weekend jest niedostępny",
        text: `${new Date(selectedDate).toLocaleDateString(
          "pl-PL"
        )} to sobota/niedziela. Wizyty można umawiać tylko w dni robocze (pon-pt).`,
      });
      return;
    }

    const entryHours = getAppointmentHours(entry);
    const existingLoad = getDayLoadHours(selectedDate, db.appointments);
    const total = existingLoad + entryHours;

    const moveEntry = async () => {
      const ok = await mutateAndSave((latest) => ({
        ...latest,
        appointments: [
          ...latest.appointments,
          {
            id: generateId(latest.appointments),
            numer_telefonu: entry.numer_telefonu,
            model_auta: entry.model_auta,
            rodzaj_naprawy: entry.rodzaj_naprawy,
            date: selectedDate,
            status: "oczekujące",
            dodane_przez: currentUser,
          },
        ],
        reserveList: latest.reserveList.filter((r) => r.id !== entry.id),
      }));
      if (!ok) return;
      Swal.fire({
        icon: "success",
        title: "Przeniesiono",
        text: `Auto przeniesione na ${new Date(selectedDate).toLocaleDateString("pl-PL")}.`,
      });
    };

    if (total > DAILY_CAPACITY_HOURS) {
      Swal.fire({
        icon: "warning",
        title: "Przekroczony dzienny limit godzin",
        html:
          `Na <b>${new Date(selectedDate).toLocaleDateString("pl-PL")}</b> zaplanowano już ` +
          `<b>${existingLoad}h</b> pracy z limitu <b>${DAILY_CAPACITY_HOURS}h</b> ` +
          `(${MECHANICS_COUNT} mechaników × ${WORKDAY_HOURS}h). To auto doda kolejne ` +
          `<b>${entryHours}h</b> - łącznie <b>${total}h</b> ` +
          `(przekroczenie o ${(total - DAILY_CAPACITY_HOURS).toFixed(2)}h).<br/><br/>` +
          `Czy mimo to przenieść na ten dzień?`,
        showCancelButton: true,
        confirmButtonText: "Przenieś mimo to",
        cancelButtonText: "Anuluj",
        confirmButtonColor: "#d4af37",
        cancelButtonColor: "#6c757d",
      }).then((result) => {
        if (result.isConfirmed) moveEntry();
      });
    } else {
      moveEntry();
    }
  };

  // ---------------- Dni nieczynne ----------------

  const handleInactiveDayChange = (e) => {
    setNewInactiveDay({ ...newInactiveDay, [e.target.name]: e.target.value });
  };

  const handleAddInactiveDay = async (e) => {
    e.preventDefault();
    if (!newInactiveDay.date_from || !newInactiveDay.date_to || !newInactiveDay.reason) {
      Swal.fire({
        icon: "warning",
        title: "Uzupełnij wszystkie pola",
        text: "Podaj datę od, datę do oraz powód.",
      });
      return;
    }
    if (newInactiveDay.date_to < newInactiveDay.date_from) {
      Swal.fire({
        icon: "warning",
        title: "Nieprawidłowy zakres dat",
        text: "Data „do” nie może być wcześniejsza niż data „od”.",
      });
      return;
    }
    const ok = await mutateAndSave((latest) => ({
      ...latest,
      inactiveDays: [
        ...latest.inactiveDays,
        {
          id: generateId(latest.inactiveDays),
          date_from: newInactiveDay.date_from,
          date_to: newInactiveDay.date_to,
          reason: newInactiveDay.reason,
          dodane_przez: currentUser,
        },
      ],
    }));
    if (!ok) return;
    setNewInactiveDay({ date_from: "", date_to: "", reason: "" });
    Swal.fire({
      icon: "success",
      title: "Dodano",
      text: "Dzień(dni) nieczynne zostały dodane.",
    });
  };

  const handleDeleteInactiveDay = (id) => {
    Swal.fire({
      title: "Czy na pewno?",
      text: "Czy chcesz usunąć ten dzień nieczynny?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Usuń",
      cancelButtonText: "Anuluj",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await mutateAndSave((latest) => ({
          ...latest,
          inactiveDays: latest.inactiveDays.filter((d) => d.id !== id),
        }));
        if (!ok) return;
        Swal.fire({ icon: "success", title: "Usunięto" });
      }
    });
  };

  // ---------------- Komunikaty kalendarza ----------------
  // Adnotacje na wybrany okres, np. "brak jednego mechanika" - w odróżnieniu
  // od dni nieczynnych, nie blokują rezerwacji, tylko wyświetlają ostrzeżenie.

  const handleNoticeChange = (e) => {
    setNewNotice({ ...newNotice, [e.target.name]: e.target.value });
  };

  const handleAddNotice = async (e) => {
    e.preventDefault();
    if (!newNotice.date_from || !newNotice.date_to || !newNotice.tresc) {
      Swal.fire({
        icon: "warning",
        title: "Uzupełnij wszystkie pola",
        text: "Podaj datę od, datę do oraz treść komunikatu.",
      });
      return;
    }
    if (newNotice.date_to < newNotice.date_from) {
      Swal.fire({
        icon: "warning",
        title: "Nieprawidłowy zakres dat",
        text: "Data „do” nie może być wcześniejsza niż data „od”.",
      });
      return;
    }
    const ok = await mutateAndSave((latest) => ({
      ...latest,
      notices: [
        ...latest.notices,
        {
          id: generateId(latest.notices),
          date_from: newNotice.date_from,
          date_to: newNotice.date_to,
          tresc: newNotice.tresc,
          dodane_przez: currentUser,
        },
      ],
    }));
    if (!ok) return;
    setNewNotice({ date_from: "", date_to: "", tresc: "" });
    Swal.fire({
      icon: "success",
      title: "Dodano",
      text: "Komunikat został dodany.",
    });
  };

  const handleDeleteNotice = (id) => {
    Swal.fire({
      title: "Czy na pewno?",
      text: "Czy chcesz usunąć ten komunikat?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Usuń",
      cancelButtonText: "Anuluj",
    }).then(async (result) => {
      if (result.isConfirmed) {
        const ok = await mutateAndSave((latest) => ({
          ...latest,
          notices: latest.notices.filter((n) => n.id !== id),
        }));
        if (!ok) return;
        Swal.fire({ icon: "success", title: "Usunięto" });
      }
    });
  };

  // ---------------- Stanowiska (podnośniki na hali) ----------------

  const handleStationDraftChange = (numer, field, value) => {
    setStationDrafts((prev) => ({
      ...prev,
      [numer]: { ...prev[numer], [field]: value },
    }));
  };

  const handleSaveStation = async (numer) => {
    const draft = stationDrafts[numer] || { appointmentId: "", godziny: "", customName: "" };
    const customName = draft.customName.trim();
    // Ręcznie wpisane auto ma pierwszeństwo przed wyborem z listy wizyt
    const appointmentId = customName
      ? null
      : draft.appointmentId
      ? parseInt(draft.appointmentId, 10)
      : null;
    const godzinyRaw = draft.godziny.trim();
    const godziny = godzinyRaw ? parseFloat(godzinyRaw) : null;

    if (godzinyRaw && (!Number.isFinite(godziny) || godziny <= 0)) {
      Swal.fire({
        icon: "warning",
        title: "Nieprawidłowy czas",
        text: "Szacowany czas musi być liczbą większą od zera (np. 1 albo 1.5).",
      });
      return;
    }

    const ok = await mutateAndSave((latest) => ({
      ...latest,
      stanowiska: normalizeStanowiska(latest.stanowiska).map((s) =>
        s.numer === numer ? { numer, appointmentId, godziny, customName: customName || null } : s
      ),
    }));
    if (!ok) return;
    Swal.fire({ icon: "success", title: "Zapisano", text: `Stanowisko ${numer} zaktualizowane.` });
  };

  const handleClearStation = async (numer) => {
    const ok = await mutateAndSave((latest) => ({
      ...latest,
      stanowiska: normalizeStanowiska(latest.stanowiska).map((s) =>
        s.numer === numer ? { numer, appointmentId: null, godziny: null, customName: null } : s
      ),
    }));
    if (!ok) return;
    Swal.fire({
      icon: "success",
      title: "Zwolniono",
      text: `Stanowisko ${numer} jest teraz wolne.`,
    });
  };

  // ---------------- Dostęp do bazy MySQL programu ERP ----------------
  // Hasło do bazy NIE jest nigdzie trzymane jako statyczny plik do pobrania —
  // za każdym razem trzeba je ponownie potwierdzić, a api.php weryfikuje je
  // po stronie serwera (patrz public/db_secret.php + akcja "download_db_config"
  // w public/api.php) zanim cokolwiek wyśle.
  const handleDownloadDbConfig = async () => {
    const { value: pwd } = await Swal.fire({
      title: "Potwierdź hasło",
      input: "password",
      inputLabel: "Hasło administratora",
      inputPlaceholder: "Wpisz hasło, aby pobrać dostęp do bazy",
      showCancelButton: true,
      confirmButtonText: "Pobierz",
      cancelButtonText: "Anuluj",
      confirmButtonColor: "#d4af37",
    });
    if (!pwd) return;

    try {
      const res = await fetch(`${API_URL}?action=download_db_config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwd }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Nieprawidłowe hasło albo błąd serwera.");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "db_config.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      Swal.fire({
        icon: "error",
        title: "Błąd pobierania",
        text: e.message || "Nie udało się pobrać danych dostępowych do bazy.",
      });
    }
  };

  // ---------------- Kopia zapasowa (Lokalna) ----------------

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `olw-baza-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const merged = {
          appointments: parsed.appointments || [],
          inactiveDays: parsed.inactiveDays || [],
          orders: parsed.orders || [],
          reserveList: parsed.reserveList || [],
          notices: parsed.notices || [],
          stanowiska: parsed.stanowiska || [],
        };
        saveDbToServer(merged);
        Swal.fire({
          icon: "success",
          title: "Zaimportowano",
          text: "Dane zostały zapisane na serwerze.",
        });
      } catch (err) {
        Swal.fire({
          icon: "error",
          title: "Błąd",
          text: "Nieprawidłowy plik JSON.",
        });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleClearAll = () => {
    Swal.fire({
      title: "Na pewno wyczyścić wszystko?",
      text: "Ta operacja usunie wszystkie zapisane dane z pliku na serwerze.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#dc3545",
      cancelButtonColor: "#6c757d",
      confirmButtonText: "Wyczyść",
      cancelButtonText: "Anuluj",
    }).then((result) => {
      if (result.isConfirmed) {
        saveDbToServer(emptyDb());
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="admin-page">
        <div className="admin-container admin-container-login">
          <form onSubmit={handleLogin} className="admin-login">
            <h2>Panel Admina</h2>
            <input
              type="password"
              placeholder="Hasło"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit">Zaloguj</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-container">
        <div className="admin-topbar">
          <h2>Panel Admina</h2>
          <div className="admin-topbar-actions">
            <span className="current-user-badge">Zalogowano jako: {currentUser}</span>
            <a href="/downloads/OLW-ERP.exe" download className="erp-download-link">
              📥 Pobierz program ERP (.exe)
            </a>
            <button onClick={handleDownloadDbConfig}>🔑 Pobierz dostęp do bazy</button>
            <button onClick={handleExport}>Eksportuj dane (JSON)</button>
            <label className="import-label">
              Importuj dane (JSON)
              <input type="file" accept="application/json" onChange={handleImportFile} hidden />
            </label>
            <button className="delete-button" onClick={handleClearAll}>
              Wyczyść wszystko
            </button>
            <button className="logout-button" onClick={handleLogout}>
              Wyloguj
            </button>
          </div>
        </div>

        {/* Sekcja wizyt - widok kalendarza */}
        <h3>Wizyty</h3>

        <div className="appointment-search-bar">
          <span className="appointment-search-icon" aria-hidden="true">
            🔍
          </span>
          <input
            type="text"
            className="appointment-search-input"
            placeholder="Szukaj po telefonie, modelu auta, notatce lub rodzaju naprawy…"
            value={appointmentSearchQuery}
            onChange={(e) => setAppointmentSearchQuery(e.target.value)}
          />
          {appointmentSearchQuery && (
            <button
              type="button"
              className="appointment-search-clear"
              onClick={() => setAppointmentSearchQuery("")}
              aria-label="Wyczyść wyszukiwanie"
            >
              ×
            </button>
          )}
        </div>

        {appointmentSearchQuery.trim() &&
          (() => {
            const results = getAppointmentSearchResults();
            return (
              <div className="day-agenda appointment-search-results">
                <h4 className="search-results-heading">
                  Wyniki wyszukiwania
                  <span className="search-results-count">{results.length}</span>
                </h4>
                {results.length === 0 ? (
                  <p>Brak wizyt pasujących do wyszukiwania.</p>
                ) : (
                  <div className="agenda-list">
                    {results.map((appointment) => (
                      <div
                        key={appointment.id}
                        className={`agenda-card search-result-card search-result-card-${
                          STATUS_CLASS[appointment.status] || "pending"
                        }`}
                      >
                        <div className="agenda-card-header">
                          <span className="search-result-date">
                            {appointment.date
                              ? getAppointmentDayCount(appointment) > 1
                                ? `${new Date(appointment.date).toLocaleDateString(
                                    "pl-PL"
                                  )} – ${new Date(appointment.date_to).toLocaleDateString("pl-PL")}`
                                : new Date(appointment.date).toLocaleDateString("pl-PL")
                              : "—"}
                          </span>
                          <span
                            className={`agenda-status agenda-status-${
                              STATUS_CLASS[appointment.status] || "pending"
                            }`}
                          >
                            {appointment.status}
                          </span>
                        </div>
                        <div className="agenda-card-body">
                          <div className="agenda-field">
                            <strong>Model auta:</strong> {appointment.model_auta}
                          </div>
                          <div className="agenda-field">
                            <strong>Telefon:</strong> {appointment.numer_telefonu}
                          </div>
                          <div className="agenda-field">
                            <strong>Rodzaj naprawy:</strong>
                            <div className="repair-chips">
                              {getRepairTypes(appointment).map((repair, index) => (
                                <span key={index} className="repair-chip repair-chip-static">
                                  {repair.nazwa}
                                  <span className="repair-chip-hours">({repair.godziny}h)</span>
                                </span>
                              ))}
                            </div>
                          </div>
                          {appointment.notatka && (
                            <div className="agenda-field">
                              <strong>Notatka:</strong> {appointment.notatka}
                            </div>
                          )}
                        </div>
                        <div className="agenda-card-actions">
                          <button
                            className="edit-button"
                            onClick={() => handleJumpToAppointmentDate(appointment)}
                          >
                            Pokaż w kalendarzu
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

        {db.appointments.length > 0 && (
          <button
            className="delete-button"
            onClick={handleBulkDeleteAppointments}
            style={{ marginBottom: "10px" }}
          >
            Usuń wybrane wizyty
          </button>
        )}

        <div className="calendar-wrapper">
          <div className="calendar-header">
            <button type="button" className="calendar-nav-button" onClick={handlePrevMonth}>
              ‹
            </button>
            <div className="calendar-title">
              {MONTH_NAMES[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
            </div>
            <button type="button" className="calendar-nav-button" onClick={handleNextMonth}>
              ›
            </button>
            <button type="button" className="calendar-today-button" onClick={handleGoToday}>
              Dziś
            </button>
          </div>

          <div className="calendar-grid calendar-weekdays">
            {WEEKDAY_NAMES.map((name) => (
              <div key={name} className="calendar-weekday">
                {name}
              </div>
            ))}
          </div>

          <div className="calendar-grid">
            {getCalendarDays(calendarMonth).map((day) => {
              const key = formatDateKey(day);
              const inMonth = day.getMonth() === calendarMonth.getMonth();
              const isToday = key === formatDateKey(new Date());
              const isSelected = key === selectedDate;
              const inactive = isDateInactive(db.inactiveDays, key);
              const weekend = !isWeekday(key);
              // W weekend nigdy nie pokazujemy aut na kalendarzu - nawet jeśli jakaś
              // stara, wielodniowa naprawa (sprzed wprowadzenia tej zasady) technicznie
              // obejmuje sobotę/niedzielę w zapisanym zakresie dat.
              const dayAppointments = weekend
                ? []
                : db.appointments.filter((a) => isAppointmentOnDate(a, key));
              const dayNotices = getNoticesForDate(db.notices, key);
              const dayHours = weekend ? 0 : getDayLoadHours(key, db.appointments);
              const isOverloaded = dayHours > DAILY_CAPACITY_HOURS;

              return (
                <div
                  key={key}
                  className={[
                    "calendar-day",
                    inMonth ? "" : "calendar-day-outside",
                    isToday ? "calendar-day-today" : "",
                    isSelected ? "calendar-day-selected" : "",
                    inactive ? "calendar-day-inactive" : "",
                    !inactive && weekend ? "calendar-day-weekend" : "",
                    isOverloaded ? "calendar-day-overloaded" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => setSelectedDate(isSelected ? null : key)}
                >
                  <span className="calendar-day-number">{day.getDate()}</span>
                  {inactive && <span className="calendar-day-inactive-label">Nieczynne</span>}
                  {dayNotices.length > 0 && (
                    <span
                      className="calendar-day-notice-label"
                      title={dayNotices.map((n) => n.tresc).join(" • ")}
                    >
                      📌 {dayNotices[0].tresc}
                    </span>
                  )}
                  {isOverloaded && (
                    <span
                      className="calendar-day-overloaded-label"
                      title="Przekroczony limit godzin"
                    >
                      ⚠ {dayHours}h
                    </span>
                  )}
                  {dayAppointments.length > 0 && (
                    <div className="calendar-day-appointments">
                      {dayAppointments.slice(0, 2).map((appointment) => (
                        <div
                          key={appointment.id}
                          className={`calendar-badge calendar-badge-${
                            STATUS_CLASS[appointment.status] || "pending"
                          }`}
                          title={
                            appointment.date.slice(0, 10) !== key
                              ? `Kontynuacja naprawy (${new Date(
                                  appointment.date
                                ).toLocaleDateString("pl-PL")} – ${new Date(
                                  appointment.date_to
                                ).toLocaleDateString("pl-PL")})`
                              : undefined
                          }
                        >
                          {appointment.date.slice(0, 10) !== key ? "→ " : ""}
                          {appointment.model_auta}
                        </div>
                      ))}
                      {dayAppointments.length > 2 && (
                        <div className="calendar-badge-more">
                          +{dayAppointments.length - 2} więcej
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Formularz i szczegóły wybranego dnia - widoczne dopiero po wybraniu dnia w kalendarzu */}
        {!selectedDate ? (
          <p className="calendar-hint">
            Wybierz dzień w kalendarzu powyżej, aby dodać wizytę lub zobaczyć zaplanowane naprawy.
          </p>
        ) : (
          <>
            {isDateInactive(db.inactiveDays, selectedDate) && (
              <div className="inactive-day-warning">
                Uwaga: {new Date(selectedDate).toLocaleDateString("pl-PL")} jest oznaczone jako
                dzień nieczynny.
              </div>
            )}

            {getNoticesForDate(db.notices, selectedDate).map((notice) => (
              <div key={notice.id} className="notice-day-warning">
                📌 {notice.tresc}
              </div>
            ))}

            <h4 className="selected-day-heading">
              Wybrany dzień: {new Date(selectedDate).toLocaleDateString("pl-PL")}
            </h4>

            {(() => {
              const dayLoad = getDayLoadHours(selectedDate, db.appointments);
              const dayLoadPercent = Math.min(100, (dayLoad / DAILY_CAPACITY_HOURS) * 100);
              const overLimit = dayLoad > DAILY_CAPACITY_HOURS;
              return (
                <div className="capacity-meter">
                  <div className="capacity-meter-bar">
                    <div
                      className={`capacity-meter-fill${
                        overLimit ? " capacity-meter-fill-over" : ""
                      }`}
                      style={{ width: `${dayLoadPercent}%` }}
                    />
                  </div>
                  <span className="capacity-meter-label">
                    Obciążenie: {dayLoad}h / {DAILY_CAPACITY_HOURS}h ({MECHANICS_COUNT} mechaników ×{" "}
                    {WORKDAY_HOURS}h)
                    {overLimit && (
                      <strong className="capacity-over-label">
                        {" "}
                        — przekroczono o {(dayLoad - DAILY_CAPACITY_HOURS).toFixed(2)}h
                      </strong>
                    )}
                  </span>
                </div>
              );
            })()}

            <form onSubmit={handleAddAppointment} className="appointment-form">
              <div className="appointment-form-fields">
                <input
                  type="text"
                  name="numer_telefonu"
                  placeholder="Telefon"
                  value={newAppointment.numer_telefonu}
                  onChange={handleNewAppointmentChange}
                  required
                />
                <input
                  type="text"
                  name="model_auta"
                  placeholder="Model auta"
                  value={newAppointment.model_auta}
                  onChange={handleNewAppointmentChange}
                  required
                />
                <label className="liczba-dni-field">
                  <span className="liczba-dni-label">Liczba dni</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="liczba-dni-input"
                    value={liczbaDni}
                    onChange={(e) => setLiczbaDni(e.target.value)}
                    title="Na ile dni ma zostać zarezerwowane auto (np. przy większych naprawach)"
                  />
                </label>
              </div>

              <div className="repair-type-adder">
                <label className="repair-type-label">Rodzaje napraw (dodaj każdą osobno):</label>
                <div className="repair-type-input-row">
                  <input
                    type="text"
                    placeholder="np. wymiana oleju"
                    value={repairInput}
                    onChange={(e) => setRepairInput(e.target.value)}
                    onKeyDown={handleRepairInputKeyDown}
                  />
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    placeholder="Godziny"
                    className="repair-hours-input"
                    value={repairHours}
                    onChange={(e) => setRepairHours(e.target.value)}
                    onKeyDown={handleRepairInputKeyDown}
                  />
                  <button type="button" onClick={handleAddRepairType}>
                    Dodaj naprawę
                  </button>
                </div>
                <p className="repair-hours-hint">
                  Orientacyjne czasy: wymiana oleju ~1–1.5h, klimatyzacja ~0.7h (40 min), rozrząd
                  nawet 8h (cała dniówka), sprzęgło min. 6h - dostosuj do konkretnego auta.
                </p>
                {newAppointment.rodzaj_naprawy.length > 0 && (
                  <div className="repair-chips">
                    {newAppointment.rodzaj_naprawy.map((repair, index) => (
                      <span key={`${repair.nazwa}-${index}`} className="repair-chip">
                        {repair.nazwa}
                        <span className="repair-chip-hours">({repair.godziny}h)</span>
                        <button
                          type="button"
                          className="repair-chip-remove"
                          onClick={() => handleRemoveRepairType(index)}
                          aria-label={`Usuń ${repair.nazwa}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="appointment-note-field">
                <label className="repair-type-label" htmlFor="new-appointment-notatka">
                  Notatka (opcjonalnie):
                </label>
                <textarea
                  id="new-appointment-notatka"
                  name="notatka"
                  className="appointment-note-textarea"
                  placeholder="Dodatkowe informacje o wizycie…"
                  value={newAppointment.notatka}
                  onChange={handleNewAppointmentChange}
                  rows={2}
                />
              </div>

              <button type="submit" className="appointment-submit-button">
                Dodaj wizytę
              </button>
            </form>

            <div className="day-agenda">
              <h4>Wizyty na {new Date(selectedDate).toLocaleDateString("pl-PL")}</h4>
              {db.appointments.filter((a) => a.date && a.date.slice(0, 10) === selectedDate)
                .length === 0 ? (
                <p>Brak wizyt tego dnia.</p>
              ) : (
                <div className="agenda-list">
                  {db.appointments
                    .filter((a) => a.date && a.date.slice(0, 10) === selectedDate)
                    .map((appointment) =>
                      editingAppointmentId === appointment.id ? (
                        <div key={appointment.id} className="agenda-card agenda-card-editing">
                          <div className="edit-form-heading">✎ Edycja wizyty</div>
                          <div className="appointment-form-fields">
                            <label className="inactive-day-field">
                              <span className="inactive-day-label">Telefon</span>
                              <input
                                type="text"
                                name="numer_telefonu"
                                placeholder="Telefon"
                                value={editDraft.numer_telefonu}
                                onChange={handleEditDraftChange}
                              />
                            </label>
                            <label className="inactive-day-field">
                              <span className="inactive-day-label">Model auta</span>
                              <input
                                type="text"
                                name="model_auta"
                                placeholder="Model auta"
                                value={editDraft.model_auta}
                                onChange={handleEditDraftChange}
                              />
                            </label>
                            <label className="inactive-day-field">
                              <span className="inactive-day-label">Data</span>
                              <input
                                type="date"
                                name="date"
                                value={editDraft.date}
                                onChange={handleEditDraftChange}
                              />
                            </label>
                            <label className="liczba-dni-field">
                              <span className="liczba-dni-label">Liczba dni</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                className="liczba-dni-input"
                                value={editLiczbaDni}
                                onChange={(e) => setEditLiczbaDni(e.target.value)}
                              />
                            </label>
                          </div>
                          {parseInt(editLiczbaDni, 10) > 1 && (
                            <p className="liczba-dni-range-hint">
                              Wizyta zajmie kalendarz od{" "}
                              {new Date(editDraft.date).toLocaleDateString("pl-PL")} do{" "}
                              {new Date(
                                addWorkdays(editDraft.date, parseInt(editLiczbaDni, 10) - 1)
                              ).toLocaleDateString("pl-PL")}
                              .
                            </p>
                          )}

                          <div className="repair-type-adder">
                            <label className="repair-type-label">Rodzaje napraw:</label>
                            <div className="repair-type-input-row">
                              <input
                                type="text"
                                placeholder="np. wymiana oleju"
                                value={editRepairInput}
                                onChange={(e) => setEditRepairInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddEditRepairType();
                                  }
                                }}
                              />
                              <input
                                type="number"
                                step="0.25"
                                min="0.25"
                                placeholder="Godziny"
                                className="repair-hours-input"
                                value={editRepairHours}
                                onChange={(e) => setEditRepairHours(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    handleAddEditRepairType();
                                  }
                                }}
                              />
                              <button type="button" onClick={handleAddEditRepairType}>
                                Dodaj naprawę
                              </button>
                            </div>
                            {editDraft.rodzaj_naprawy.length > 0 && (
                              <div className="repair-chips">
                                {editDraft.rodzaj_naprawy.map((repair, index) =>
                                  editingRepairIndex === index ? (
                                    <span
                                      key={`${repair.nazwa}-${index}`}
                                      className="repair-chip repair-chip-editing-item"
                                    >
                                      <input
                                        type="text"
                                        className="repair-chip-edit-input"
                                        value={editRepairEditNazwa}
                                        onChange={(e) => setEditRepairEditNazwa(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleSaveEditRepairItem();
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <input
                                        type="number"
                                        step="0.25"
                                        min="0.25"
                                        className="repair-hours-input repair-chip-edit-hours"
                                        value={editRepairEditGodziny}
                                        onChange={(e) => setEditRepairEditGodziny(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            handleSaveEditRepairItem();
                                          }
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="repair-chip-save"
                                        onClick={handleSaveEditRepairItem}
                                        aria-label="Zapisz naprawę"
                                      >
                                        ✓
                                      </button>
                                      <button
                                        type="button"
                                        className="repair-chip-remove"
                                        onClick={handleCancelEditRepairItem}
                                        aria-label="Anuluj edycję naprawy"
                                      >
                                        ×
                                      </button>
                                    </span>
                                  ) : (
                                    <span key={`${repair.nazwa}-${index}`} className="repair-chip">
                                      {repair.nazwa}
                                      <span className="repair-chip-hours">({repair.godziny}h)</span>
                                      <button
                                        type="button"
                                        className="repair-chip-edit"
                                        onClick={() => handleStartEditRepairItem(index, repair)}
                                        aria-label={`Edytuj ${repair.nazwa}`}
                                      >
                                        ✎
                                      </button>
                                      <button
                                        type="button"
                                        className="repair-chip-remove"
                                        onClick={() => handleRemoveEditRepairType(index)}
                                        aria-label={`Usuń ${repair.nazwa}`}
                                      >
                                        ×
                                      </button>
                                    </span>
                                  )
                                )}
                              </div>
                            )}
                          </div>

                          <div className="appointment-note-field">
                            <label className="repair-type-label" htmlFor="edit-appointment-notatka">
                              Notatka (opcjonalnie):
                            </label>
                            <textarea
                              id="edit-appointment-notatka"
                              name="notatka"
                              className="appointment-note-textarea"
                              placeholder="Dodatkowe informacje o wizycie…"
                              value={editDraft.notatka}
                              onChange={handleEditDraftChange}
                              rows={2}
                            />
                          </div>

                          <div className="agenda-card-actions">
                            <button className="accept-button" onClick={handleSaveEditAppointment}>
                              Zapisz zmiany
                            </button>
                            <button className="delete-button" onClick={handleCancelEditAppointment}>
                              Anuluj
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div key={appointment.id} className="agenda-card">
                          <div className="agenda-card-header">
                            <label className="agenda-checkbox">
                              <input
                                type="checkbox"
                                checked={selectedAppointments.includes(appointment.id)}
                                onChange={() => handleSelectAppointment(appointment.id)}
                              />
                            </label>
                            <span
                              className={`agenda-status agenda-status-${
                                STATUS_CLASS[appointment.status] || "pending"
                              }`}
                            >
                              {appointment.status}
                            </span>
                          </div>
                          <div className="agenda-card-body">
                            <div className="agenda-field">
                              <strong>Model auta:</strong> {appointment.model_auta}
                            </div>
                            <div className="agenda-field">
                              <strong>Telefon:</strong> {appointment.numer_telefonu}
                            </div>
                            {getAppointmentDayCount(appointment) > 1 && (
                              <div className="agenda-field">
                                <strong>Zajęte dni:</strong>{" "}
                                {new Date(appointment.date).toLocaleDateString("pl-PL")} –{" "}
                                {new Date(appointment.date_to).toLocaleDateString("pl-PL")} (
                                {getAppointmentDayCount(appointment)} dni)
                              </div>
                            )}
                            <div className="agenda-field">
                              <strong>Dodane przez:</strong> {appointment.dodane_przez || "—"}
                            </div>
                            <div className="agenda-field">
                              <strong>Rodzaj naprawy:</strong>
                              <div className="repair-chips">
                                {getRepairTypes(appointment).map((repair, index) => (
                                  <span key={index} className="repair-chip repair-chip-static">
                                    {repair.nazwa}
                                    <span className="repair-chip-hours">({repair.godziny}h)</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                            {appointment.notatka && (
                              <div className="agenda-field">
                                <strong>Notatka:</strong> {appointment.notatka}
                              </div>
                            )}
                          </div>
                          <div className="agenda-card-actions">
                            {appointment.status === "oczekujące" && (
                              <>
                                <button
                                  className="accept-button"
                                  onClick={() =>
                                    handleStatusChange(appointment.id, "zaakceptowane")
                                  }
                                >
                                  Zaakceptuj
                                </button>
                                <button
                                  className="reject-button"
                                  onClick={() => handleStatusChange(appointment.id, "odrzucone")}
                                >
                                  Odrzuć
                                </button>
                              </>
                            )}
                            <button
                              className="edit-button"
                              onClick={() => handleStartEditAppointment(appointment)}
                            >
                              Edytuj
                            </button>
                            <button
                              className="delete-button"
                              onClick={() => handleDeleteAppointment(appointment.id)}
                            >
                              Usuń
                            </button>
                          </div>
                        </div>
                      )
                    )}
                </div>
              )}
            </div>
          </>
        )}

        {/* Sekcja stanowisk (podnośników na hali) */}
        <h3>Stanowiska</h3>
        <p className="reserve-list-hint">
          Przypisz auto do jednego z {STATION_COUNT} stanowisk na hali i podaj szacowany czas -
          widoczne na wyświetlaczu (/wyswietlacz). Do wyboru są tylko wizyty zaplanowane na dziś.
        </p>
        <div className="stations-grid">
          {normalizeStanowiska(db.stanowiska).map((station) => {
            const draft = stationDrafts[station.numer] || { appointmentId: "", godziny: "" };
            const todayKey = formatDateKey(new Date());
            const assignedElsewhere = new Set(
              Object.entries(stationDrafts)
                .filter(([numer]) => Number(numer) !== station.numer)
                .map(([, d]) => d.appointmentId)
                .filter(Boolean)
                .map(Number)
            );
            const candidates = db.appointments.filter(
              (a) =>
                a.status !== "odrzucone" &&
                isAppointmentOnDate(a, todayKey) &&
                !assignedElsewhere.has(a.id)
            );
            const assignedAppointment = draft.appointmentId
              ? db.appointments.find((a) => a.id === Number(draft.appointmentId))
              : null;

            return (
              <div key={station.numer} className="station-card">
                <div className="station-card-header">Stanowisko {station.numer}</div>
                <select
                  className="station-select"
                  style={draft.customName.trim() ? { opacity: 0.5 } : undefined}
                  value={draft.appointmentId}
                  onChange={(e) => {
                    handleStationDraftChange(station.numer, "appointmentId", e.target.value);
                    handleStationDraftChange(station.numer, "customName", "");
                  }}
                >
                  <option value="">— wolne —</option>
                  {candidates.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.model_auta} ({a.numer_telefonu})
                    </option>
                  ))}
                </select>
                {assignedAppointment && getRepairTypes(assignedAppointment).length > 0 && (
                  <div className="repair-chips">
                    {getRepairTypes(assignedAppointment).map((r, i) => (
                      <span key={i} className="repair-chip repair-chip-static">
                        {r.nazwa}
                      </span>
                    ))}
                  </div>
                )}
                <label className="station-hours-field">
                  <span className="inactive-day-label">lub wpisz auto ręcznie</span>
                  <input
                    type="text"
                    value={draft.customName}
                    onChange={(e) =>
                      handleStationDraftChange(station.numer, "customName", e.target.value)
                    }
                    placeholder="np. Auto klienta na gwarancji"
                  />
                </label>
                <label className="station-hours-field">
                  <span className="inactive-day-label">Szacowany czas (h)</span>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    value={draft.godziny}
                    onChange={(e) =>
                      handleStationDraftChange(station.numer, "godziny", e.target.value)
                    }
                    placeholder="np. 2"
                  />
                </label>
                <div className="station-card-actions">
                  <button
                    className="accept-button"
                    onClick={() => handleSaveStation(station.numer)}
                  >
                    Zapisz
                  </button>
                  <button
                    className="delete-button"
                    onClick={() => handleClearStation(station.numer)}
                  >
                    Zwolnij
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sekcja listy rezerwowej */}
        <h3>Lista rezerwowa</h3>
        <p className="reserve-list-hint">
          Auta bez przypisanego dnia w kalendarzu. Aby przenieść wpis na kalendarz, najpierw wybierz
          dzień w kalendarzu powyżej, a potem kliknij „Przenieś na kalendarz” przy danym wpisie.
        </p>

        <form onSubmit={handleAddReserveEntry} className="appointment-form">
          <div className="appointment-form-fields">
            <input
              type="text"
              name="numer_telefonu"
              placeholder="Telefon"
              value={newReserveEntry.numer_telefonu}
              onChange={handleNewReserveChange}
              required
            />
            <input
              type="text"
              name="model_auta"
              placeholder="Model auta"
              value={newReserveEntry.model_auta}
              onChange={handleNewReserveChange}
              required
            />
          </div>

          <div className="repair-type-adder">
            <label className="repair-type-label">Rodzaje napraw (dodaj każdą osobno):</label>
            <div className="repair-type-input-row">
              <input
                type="text"
                placeholder="np. wymiana oleju"
                value={reserveRepairInput}
                onChange={(e) => setReserveRepairInput(e.target.value)}
                onKeyDown={handleReserveRepairInputKeyDown}
              />
              <input
                type="number"
                step="0.25"
                min="0.25"
                placeholder="Godziny"
                className="repair-hours-input"
                value={reserveRepairHours}
                onChange={(e) => setReserveRepairHours(e.target.value)}
                onKeyDown={handleReserveRepairInputKeyDown}
              />
              <button type="button" onClick={handleAddReserveRepairType}>
                Dodaj naprawę
              </button>
            </div>
            {newReserveEntry.rodzaj_naprawy.length > 0 && (
              <div className="repair-chips">
                {newReserveEntry.rodzaj_naprawy.map((repair, index) => (
                  <span key={`${repair.nazwa}-${index}`} className="repair-chip">
                    {repair.nazwa}
                    <span className="repair-chip-hours">({repair.godziny}h)</span>
                    <button
                      type="button"
                      className="repair-chip-remove"
                      onClick={() => handleRemoveReserveRepairType(index)}
                      aria-label={`Usuń ${repair.nazwa}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <button type="submit" className="appointment-submit-button">
            Dodaj do listy rezerwowej
          </button>
        </form>

        <div className="day-agenda">
          <h4>Wpisy na liście rezerwowej</h4>
          {db.reserveList.length === 0 ? (
            <p>Brak wpisów na liście rezerwowej.</p>
          ) : (
            <div className="agenda-list">
              {db.reserveList.map((entry) => (
                <div key={entry.id} className="agenda-card">
                  <div className="agenda-card-body">
                    <div className="agenda-field">
                      <strong>Model auta:</strong> {entry.model_auta}
                    </div>
                    <div className="agenda-field">
                      <strong>Telefon:</strong> {entry.numer_telefonu}
                    </div>
                    <div className="agenda-field">
                      <strong>Dodane przez:</strong> {entry.dodane_przez || "—"}
                    </div>
                    <div className="agenda-field">
                      <strong>Rodzaj naprawy:</strong>
                      <div className="repair-chips">
                        {getRepairTypes(entry).map((repair, index) => (
                          <span key={index} className="repair-chip repair-chip-static">
                            {repair.nazwa}
                            <span className="repair-chip-hours">({repair.godziny}h)</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="agenda-card-actions">
                    <button
                      className="move-button"
                      onClick={() => handleMoveReserveToCalendar(entry)}
                      title={
                        selectedDate
                          ? `Przenieś na ${new Date(selectedDate).toLocaleDateString("pl-PL")}`
                          : "Najpierw wybierz dzień w kalendarzu"
                      }
                    >
                      Przenieś na kalendarz
                      {selectedDate
                        ? ` (${new Date(selectedDate).toLocaleDateString("pl-PL")})`
                        : ""}
                    </button>
                    <button
                      className="delete-button"
                      onClick={() => handleDeleteReserveEntry(entry.id)}
                    >
                      Usuń
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sekcja dni nieczynnych */}
        <h3>Dni nieczynne</h3>
        <form onSubmit={handleAddInactiveDay} className="inactive-day-form">
          <label className="inactive-day-field">
            <span className="inactive-day-label">Od</span>
            <input
              type="date"
              name="date_from"
              value={newInactiveDay.date_from}
              onChange={handleInactiveDayChange}
              required
            />
          </label>
          <label className="inactive-day-field">
            <span className="inactive-day-label">Do</span>
            <input
              type="date"
              name="date_to"
              value={newInactiveDay.date_to}
              onChange={handleInactiveDayChange}
              min={newInactiveDay.date_from || undefined}
              required
            />
          </label>
          <input
            type="text"
            name="reason"
            placeholder="Powód (np. Święto)"
            value={newInactiveDay.reason}
            onChange={handleInactiveDayChange}
            required
          />
          <button type="submit">Dodaj dzień(dni) nieczynne</button>
        </form>

        <h4>Lista dni nieczynnych</h4>
        {db.inactiveDays.length === 0 ? (
          <p>Brak dni nieczynnych.</p>
        ) : (
          <ul>
            {db.inactiveDays.map((day) => {
              const { from, to } = getInactiveRange(day);
              const rangeLabel =
                from === to
                  ? new Date(from).toLocaleDateString("pl-PL")
                  : `${new Date(from).toLocaleDateString("pl-PL")} – ${new Date(
                      to
                    ).toLocaleDateString("pl-PL")}`;
              return (
                <li key={day.id}>
                  {rangeLabel} - {day.reason}
                  {day.dodane_przez && (
                    <span className="inactive-day-author"> (dodane przez: {day.dodane_przez})</span>
                  )}
                  <button className="delete-button" onClick={() => handleDeleteInactiveDay(day.id)}>
                    Usuń
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {/* Sekcja komunikatów kalendarza */}
        <h3>Komunikaty kalendarza</h3>
        <p className="notice-section-hint">
          Adnotacje na wybrany okres (np. „Brak jednego mechanika”), widoczne na kalendarzu i przy
          wybranym dniu. W odróżnieniu od dni nieczynnych nie blokują dodawania wizyt.
        </p>
        <form onSubmit={handleAddNotice} className="inactive-day-form">
          <label className="inactive-day-field">
            <span className="inactive-day-label">Od</span>
            <input
              type="date"
              name="date_from"
              value={newNotice.date_from}
              onChange={handleNoticeChange}
              required
            />
          </label>
          <label className="inactive-day-field">
            <span className="inactive-day-label">Do</span>
            <input
              type="date"
              name="date_to"
              value={newNotice.date_to}
              onChange={handleNoticeChange}
              min={newNotice.date_from || undefined}
              required
            />
          </label>
          <input
            type="text"
            name="tresc"
            placeholder="Treść komunikatu (np. Brak jednego mechanika)"
            value={newNotice.tresc}
            onChange={handleNoticeChange}
            required
          />
          <button type="submit">Dodaj komunikat</button>
        </form>

        <h4>Lista komunikatów</h4>
        {db.notices.length === 0 ? (
          <p>Brak komunikatów.</p>
        ) : (
          <ul>
            {db.notices.map((notice) => {
              const rangeLabel =
                notice.date_from === notice.date_to
                  ? new Date(notice.date_from).toLocaleDateString("pl-PL")
                  : `${new Date(notice.date_from).toLocaleDateString("pl-PL")} – ${new Date(
                      notice.date_to
                    ).toLocaleDateString("pl-PL")}`;
              return (
                <li key={notice.id}>
                  {rangeLabel} - {notice.tresc}
                  {notice.dodane_przez && (
                    <span className="inactive-day-author">
                      {" "}
                      (dodane przez: {notice.dodane_przez})
                    </span>
                  )}
                  <button className="delete-button" onClick={() => handleDeleteNotice(notice.id)}>
                    Usuń
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;
