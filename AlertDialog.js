import React from "react";
import PropTypes from "prop-types";
import "./AlertDialog.css";

function AlertDialog({ message, onClose }) {
  return (
    <div className="alert-dialog-overlay">
      <div className="alert-dialog">
        <h3>Powiadomienie</h3>
        <p>{message}</p>
        <button className="alert-dialog-close" onClick={onClose}>
          Zamknij
        </button>
      </div>
    </div>
  );
}

AlertDialog.propTypes = {
  message: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default AlertDialog;
