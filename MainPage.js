import React from "react";
import "./MainPage.css";

// Numer telefonu warsztatu - ten sam wyświetla się w tekście i jest wybierany
// po kliknięciu przycisku (podmień na prawdziwy numer, jeśli inny)
const PHONE_DISPLAY = "+48  502 207 616";
const PHONE_HREF = "tel:+48502207616";

// Proste ikonki SVG wbudowane w kod - nie zależą od żadnych plików graficznych,
// więc zawsze się wyświetlą, nawet jeśli obrazki *_bw.png / *_color.png nie istnieją na serwerze.
function IconInfo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.25" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="8" r="1.15" fill="currentColor" />
      <path d="M12 11.5V16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M14.7 6.3a4 4 0 00-5.4 4.9L4 16.5V20h3.5l5.3-5.3a4 4 0 004.9-5.4l-2.6 2.6-2-2 2.6-2.6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconPhone() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M6.6 10.8c1.3 2.6 3 4.3 5.6 5.6l1.9-1.9c.25-.25.6-.33.9-.2 1 .35 2.1.55 3.2.55.5 0 .9.4.9.9v3c0 .5-.4.9-.9.9C9.4 19.65 4.35 14.6 4.35 5.9c0-.5.4-.9.9-.9h3c.5 0 .9.4.9.9 0 1.1.2 2.2.55 3.2.1.3.03.65-.2.9l-1.9 1.9z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MainPage() {
  const scrollToSection = (sectionId) => {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="main-page" id="page-top">
      {/* Pasek z logo */}
      <header className="logo-header">
        <img
          src="/photos/logo.png"
          alt="Logo warsztatu"
          className="logo"
          onClick={() => scrollToSection("page-top")}
        />
      </header>

      {/* Sekcja O nas / hero - w tle zdjęcie warsztatu z zewnątrz */}
      <section id="about-section" className="section hero-section">
        <div className="section-inner">
          <p className="hero-eyebrow">Olvit Auto Serwis</p>
          <h1 className="hero-title">Twoje auto w dobrych rękach</h1>
          <h2 className="hero-subtitle">O nas</h2>
          <p>
            Witamy w naszym warsztacie samochodowym, który od ponad 20 lat dba o niezawodność i
            bezpieczeństwo pojazdów naszych klientów. Nasza pasja do motoryzacji i doświadczenie
            pozwalają nam oferować usługi na najwyższym poziomie – od przeglądów technicznych po
            skomplikowane naprawy silników. Nasz zespół to wykwalifikowani mechanicy, dla których
            każdy samochód to nowe wyzwanie. Zaufaj nam, a Twoje auto będzie w najlepszych rękach!
          </p>

          {/* Przyciski nawigacyjne */}
          <div className="nav-buttons">
            <button
              type="button"
              className="nav-button"
              onClick={() => scrollToSection("about-section")}
            >
              <span className="nav-button-icon">
                <IconInfo />
              </span>
              <span className="nav-button-label">O nas</span>
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={() => scrollToSection("workshop-section")}
            >
              <span className="nav-button-icon">
                <IconWrench />
              </span>
              <span className="nav-button-label">Warsztat</span>
            </button>
            <button
              type="button"
              className="nav-button"
              onClick={() => scrollToSection("contact-section")}
            >
              <span className="nav-button-icon">
                <IconPhone />
              </span>
              <span className="nav-button-label">Kontakt</span>
            </button>
          </div>
        </div>
      </section>

      {/* Sekcja Warsztat - w tle zdjęcie wnętrza warsztatu */}
      <section id="workshop-section" className="section workshop-section">
        <div className="section-inner">
          <h2>Warsztat</h2>
          <p>
            Nasz warsztat to miejsce, gdzie Twoje auto otrzyma profesjonalną opiekę. Oferujemy pełen
            zakres usług naprawczych, od wymiany oleju po naprawę układów hamulcowych i silników.
            Dzięki nowoczesnemu sprzętowi i doświadczonej ekipie, każda wizyta w naszym warsztacie
            to gwarancja jakości.
          </p>

          <a href={PHONE_HREF} className="action-button phone-button">
            <IconPhone />
            Zadzwoń i umów wizytę
          </a>
          <p className="phone-hint">lub zadzwoń bezpośrednio: {PHONE_DISPLAY}</p>
        </div>
      </section>

      {/* Sekcja Kontakt */}
      <section id="contact-section" className="section contact-section">
        <div className="section-inner">
          <h2>Kontakt</h2>
          <p>Skontaktuj się z nami, aby uzyskać więcej informacji lub umówić wizytę:</p>
          <ul>
            <li>Email: olwit.biuro@gmail.com</li>
            <li>Telefon: {PHONE_DISPLAY}</li>
            <li>Adres: ul. Granicza 10, 41-300 Dąbrowa Gornicza</li>
          </ul>
          <a href={PHONE_HREF} className="action-button">
            Zadzwoń: {PHONE_DISPLAY}
          </a>
        </div>
      </section>
    </div>
  );
}

export default MainPage;
