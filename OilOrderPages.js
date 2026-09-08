import React, { useState } from "react";
import axios from "axios";
import "./BookingPage.css";
import AlertDialog from "./AlertDialog";

function OilBookingPage() {
  const [formData, setFormData] = useState({
    imie_nazwisko: "",
    numer_telefonu: "",
    rodzaj_oleju: "",
    ilosc: "",
  });
  const [alertMessage, setAlertMessage] = useState("");
  const [showAlert, setShowAlert] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    axios
      .post("http://localhost:5000/api/oleje", formData)
      .then((response) => {
        showAlertWithMessage(response.data.message);
        setFormData({ imie_nazwisko: "", numer_telefonu: "", rodzaj_oleju: "", ilosc: "" });
      })
      .catch((err) => showAlertWithMessage("Błąd: " + err.message));
  };

  const showAlertWithMessage = (message) => {
    setAlertMessage(message);
    setShowAlert(true);
  };

  const handleCloseAlert = () => {
    setShowAlert(false);
  };

  return (
    <div className="booking-container">
      <form className="booking-form" onSubmit={handleSubmit}>
        <h2>Zamów olej</h2>
        <input
          type="text"
          name="imie_nazwisko"
          placeholder="Imię i nazwisko"
          value={formData.imie_nazwisko}
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
          name="rodzaj_oleju"
          placeholder="Rodzaj oleju"
          value={formData.rodzaj_oleju}
          onChange={handleChange}
          required
        />
        <input
          type="number"
          name="ilosc"
          placeholder="Ilość oleju (w litrach)"
          value={formData.ilosc}
          onChange={handleChange}
          required
        />
        <button type="submit">Zamów olej</button>
      </form>

      {showAlert && <AlertDialog message={alertMessage} onClose={handleCloseAlert} />}
    </div>
  );
}

export default OilBookingPage;
