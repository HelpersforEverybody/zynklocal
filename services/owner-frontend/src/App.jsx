// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";

/* Owner pages */
import OwnerDashboard from "./pages/OwnerDashboard";
import MerchantSignup from "./pages/MerchantSignup";
import MerchantLogin from "./pages/MerchantLogin";

/* Keep App minimal and owner-focused — no customer pages here */
export default function App() {
    return (
        <BrowserRouter>
            <nav style={{ padding: 12, borderBottom: "1px solid #ddd", display: "flex", gap: 12 }}>
                <Link to="/">Owner Dashboard</Link>
                <Link to="/merchant-signup">Merchant Signup</Link>
                <Link to="/merchant-login">Merchant Login</Link>
            </nav>

            <main style={{ padding: 16 }}>
                <Routes>
                    <Route path="/" element={<OwnerDashboard />} />
                    <Route path="/merchant-signup" element={<MerchantSignup />} />
                    <Route path="/merchant-login" element={<MerchantLogin />} />
                    <Route path="/owner-dashboard" element={<OwnerDashboard />} />
                </Routes>
            </main>
        </BrowserRouter>
    );
}
