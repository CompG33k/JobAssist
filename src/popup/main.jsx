import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const el = document.getElementById("root");

if (!el) {
  // Fail loudly if popup.html is wrong
  throw new Error("Popup root element (#root) not found.");
}

createRoot(el).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
