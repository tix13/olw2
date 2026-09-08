"use client";

import React, { useEffect, useState } from "react";
import "./MainPage.css";

const PHONE_DISPLAY = "+48 502 207 616";
const PHONE_HREF = "tel:+48502207616";
const EMAIL_HREF = "mailto:olwit.biuro@gmail.com";

const services = [
  [
    "01",
    "Diagnostyka komputerowa",
    "Precyzyjnie znajdujemy źródło problemu, zanim zaczniemy naprawę.",
  ],
  [
    "02",
    "Mechanika pojazdowa",
    "Hamulec, zawieszenie, silnik — kompleksowa opieka nad autem.",
  ],
  [
    "03",
    "Serwis okresowy",
    "Olej, filtry i przegląd, który daje Ci spokój na kolejne kilometry.",
  ],
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h13M14 6l6 6-6 6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.1 4.6 4.8 6.9c-.2 5.4 4.8 10.4 10.2 10.2l2.3-2.3-2.7-2.7-1.8.9a11.2 11.2 0 0 1-1.9-1.6 11.2 11.2 0 0 1-1.6-1.9l.9-1.8-3.1-3.1Z" />
      <path d="M14.5 5.5c2.2.4 3.6 1.8 4 4M14.5 2.5c3.8.4 6.6 3.2 7 7" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function MainPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("start");

  useEffect(() => {
    const sections = ["start", "services", "workshop", "contact"]
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) =>
        entries.forEach(
          (entry) => entry.isIntersecting && setActiveSection(entry.target.id)
        ),
      { rootMargin: "-38% 0px -55% 0px" }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  const goTo = (id) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
  };

  const navItems = [
    ["Start", "start"],
    ["Usługi", "services"],
    ["Warsztat", "workshop"],
    ["Kontakt", "contact"],
  ];

  return (
    <main className="main-page">
      <header className="site-header">
        <button
          className="brand"
          onClick={() => goTo("start")}
          aria-label="OLWIT Auto Serwis — strona główna"
        >
          <span className="brand-mark">O.</span>
          <span>
            OLVIT <b>AUTO SERWIS</b>
          </span>
        </button>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Otwórz menu"
          aria-expanded={menuOpen}
        >
          <MenuIcon />
        </button>
        <nav
          className={menuOpen ? "site-nav is-open" : "site-nav"}
          aria-label="Główna nawigacja"
        >
          {navItems.map(([label, id]) => (
            <button
              key={id}
              className={activeSection === id ? "active" : ""}
              onClick={() => goTo(id)}
            >
              {label}
            </button>
          ))}
          <a href={PHONE_HREF} className="nav-call">
            <PhoneIcon /> Umów wizytę
          </a>
        </nav>
      </header>

      <section className="hero" id="start">
        <div className="hero-glow glow-one" />
        <div className="hero-glow glow-two" />
        <div className="hero-grid" />
        <div className="hero-content">
          <p className="eyebrow">
            <span /> Dąbrowa Górnicza · od 2016
          </p>
          <h1>
            Twoje auto.
            <br />
            <em>Nasza odpowiedzialność.</em>
          </h1>
          <p className="hero-copy">
            Rzetelna diagnostyka, uczciwe doradztwo i fachowa naprawa. Zostaw
            nam samochód — odbierz pewność na każdej trasie.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href={PHONE_HREF}>
              Umów wizytę <ArrowIcon />
            </a>
            <button className="text-button" onClick={() => goTo("services")}>
              Poznaj usługi <span>↓</span>
            </button>
          </div>
        </div>
        <aside className="hero-card" aria-label="Godziny pracy">
          <span className="status-dot" /> <span>Dzisiaj otwarte</span>
          <strong>08:00 — 16:00</strong>
          <small>Poniedziałek — Piątek</small>
        </aside>
        <div className="hero-number">
          10
          <small>
            lat
            <br />
            doświadczenia
          </small>
        </div>
        <div className="scroll-cue">
          <span /> PRZEWIŃ, ABY ODKRYĆ
        </div>
      </section>

      <section className="services section" id="services">
        <div className="section-heading reveal">
          <p className="eyebrow">
            <span /> Co robimy najlepiej
          </p>
          <h2>
            Serwis, któremu
            <br />
            <em>możesz zaufać.</em>
          </h2>
        </div>
        <div className="service-list">
          {services.map(([number, title, description]) => (
            <article className="service-card" key={number}>
              <span className="service-number">{number}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
              <button
                onClick={() => goTo("contact")}
                aria-label={`Zapytaj o: ${title}`}
              >
                <ArrowIcon />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="workshop section" id="workshop">
        <div
          className="workshop-photo"
          role="img"
          aria-label="Mechanik pracujący przy samochodzie"
        />
        <div className="workshop-copy">
          <p className="eyebrow">
            <span /> Poznaj OLWIT
          </p>
          <h2>
            Dobry serwis
            <br />
            zaczyna się od <em>rozmowy.</em>
          </h2>
          <p>
            Nie wymieniamy części na ślepo. Najpierw słuchamy, sprawdzamy i
            jasno wyjaśniamy, co jest potrzebne Twojemu autu.
          </p>
          <a href={EMAIL_HREF} className="inline-link">
            Napisz do nas <ArrowIcon />
          </a>
        </div>
      </section>

      <section className="contact section" id="contact">
        <p className="eyebrow">
          <span /> Zadbaj o swoje auto
        </p>
        <h2>Porozmawiajmy.</h2>
        <p className="contact-lead">
          Zadzwoń lub napisz — wspólnie znajdziemy dogodny termin.
        </p>
        <a className="contact-phone" href={PHONE_HREF}>
          {PHONE_DISPLAY}
        </a>
        <div className="contact-details">
          <a href={EMAIL_HREF}>olwit.biuro@gmail.com</a>
          <span /> <address>ul. Graniczna 10, 41-300 Dąbrowa Górnicza</address>
        </div>
      </section>
      <footer>
        <span>© {new Date().getFullYear()} OLWIT Auto Serwis</span>
        <button onClick={() => goTo("start")}>Wróć na górę ↑</button>
      </footer>
    </main>
  );
}

export default MainPage;
