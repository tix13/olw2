import React, { useState, useEffect } from "react";
import axios from "axios";
import Calendar from "react-calendar";
import "./BookingPage.css";
import AlertDialog from "./AlertDialog"; // Zaimportuj komponent alertu

function BookingPage() {
  const [formData, setFormData] = useState({
    dane: "",
    numer_telefonu: "",
    model_auta: "",
    rodzaj_naprawy: "",
  });
  const [bookedDays, setBookedDays] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertMessage, setAlertMessage] = useState(""); // Nowy stan dla wiadomości alertu
  const [showAlert, setShowAlert] = useState(false); // Nowy stan dla pokazywania alertu

  useEffect(() => {
    setLoading(true);

    axios
      .get("http://localhost:5000/api/dostepne-terminy")
      .then((response) => {
        const days = response.data.bookedDays || [];
        setBookedDays(days);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Nie udało się pobrać terminów. Możesz jednak wybrać datę i spróbować zapisać wizytę."
        );
        setBookedDays([]);
        setLoading(false);
      });
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleDateChange = (date) => {
    setSelectedDate(date);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedDate) {
      showAlertWithMessage("Wybierz datę z kalendarza!");
      return;
    }

    const currentYear = new Date().getFullYear();
    const finalDate = new Date(selectedDate);
    finalDate.setFullYear(currentYear);

    const formattedDate = finalDate.toISOString().split("T")[0];
    axios
      .post("http://localhost:5000/api/warsztat", { ...formData, date: formattedDate })
      .then((response) => {
        showAlertWithMessage(response.data.message);
        setFormData({ dane: "", numer_telefonu: "", model_auta: "", rodzaj_naprawy: "" });
        setSelectedDate(null);
      })
      .catch((err) => showAlertWithMessage("Błąd: " + err.message));
  };

  const tileDisabled = ({ date }) => {
    const dateStr = date.toISOString().split("T")[0];
    return bookedDays.includes(dateStr);
  };

  const currentYear = new Date().getFullYear();
  const maxDate = new Date(currentYear, 11, 31);

  // Funkcja wyświetlająca alert
  const showAlertWithMessage = (message) => {
    setAlertMessage(message);
    setShowAlert(true);
  };

  const handleCloseAlert = () => {
    setShowAlert(false);
  };

  if (loading) {
    return (
      <div className="booking-container">
        <div className="loading">Ładowanie danych...</div>
      </div>
    );
  }

  return (
    <div className="booking-container">
      {error && <div className="error-message">{error}</div>}
      <form className="booking-form" onSubmit={handleSubmit}>
        <h2>Umów wizytę</h2>
        <input
          type="text"
          name="dane"
          placeholder="Imię i nazwisko"
          value={formData.dane}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="numer_telefonu"
          placeholder="Telefon"
          value={formData.numer_telefonu}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="model_auta"
          placeholder="Model auta"
          value={formData.model_auta}
          onChange={handleChange}
          required
        />
        <input
          type="text"
          name="rodzaj_naprawy"
          placeholder="Rodzaj naprawy"
          value={formData.rodzaj_naprawy}
          onChange={handleChange}
          required
        />
        <Calendar
          onChange={handleDateChange}
          value={selectedDate}
          tileDisabled={tileDisabled}
          minDate={new Date()}
          maxDate={maxDate}
          view="month"
          navigationLabel={({ date }) => date.toLocaleString("default", { month: "long" })}
        />
        <button type="submit">Zapisz się</button>
      </form>

      {/* Pokaż alert, jeśli jest aktywny */}
      {showAlert && <AlertDialog message={alertMessage} onClose={handleCloseAlert} />}
    </div>
  );
}

export default BookingPage;
