import React from "react";
import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import MainPage from "./MainPage";
import BookingPage from "./BookingPage";
import AdminPanel from "./AdminPanel";
import OilsPage from "./OilOrderPages";
import DisplayBoard from "./DisplayBoard";
import "./App.css";

function App() {
  return (
    <Router>
      <div className="content-wrapper">
        <Routes>
          <Route path="/" element={<MainPage />} />
          <Route path="/zapisz-sie" element={<BookingPage />} />
          <Route path="/admin" element={<AdminPanel />} />
          <Route path="/oleje" element={<OilsPage />} />
          <Route path="/wyswietlacz" element={<DisplayBoard />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
