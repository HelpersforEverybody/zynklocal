// src/pages/MerchantLogin.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getApiBase } from "../hooks/useApi";

export default function MerchantLogin() {
  const API_BASE = getApiBase();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [rawResponse, setRawResponse] = useState(null);

  async function handleSubmit(e) {
    e && e.preventDefault();
    setStatusMsg("Logging in...");
    setRawResponse(null);

    try {
      const url = `${API_BASE}/auth/merchant-login`;
      console.log("POST ->", url, { email });
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      // read raw text first
      const text = await resp.text();
      setRawResponse({ status: resp.status, headers: Object.fromEntries(resp.headers.entries()), text });

      // try parse JSON if possible
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch (err) { json = null; }

      console.log("Response status:", resp.status, "text:", text, "json:", json);

      if (!resp.ok) {
        setStatusMsg(`Login failed: ${resp.status} ${resp.statusText}`);
        if (json && json.error) setStatusMsg(`Login failed: ${json.error}`);
        return;
      }

      // If JSON present and has token -> success
      if (json && json.token) {
        localStorage.setItem("merchant_token", json.token);
        if (json.userId) localStorage.setItem("merchant_userId", json.userId);
        setStatusMsg("Login successful — token saved. Redirecting...");
        // small delay so message shows
        setTimeout(() => navigate("/owner-dashboard"), 400);
        return;
      }

      // If server responded success but no token:
      setStatusMsg("Login succeeded but no token received. Check server response (below).");
      // leave rawResponse visible for debugging
    } catch (err) {
      console.error("Network/login error:", err);
      setStatusMsg("Network or server error. See console and raw response (below).");
    }
  }

  function handleClear() {
    setEmail("");
    setPassword("");
    setStatusMsg("");
    setRawResponse(null);
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui, sans-serif" }}>
      <h1>Merchant Login</h1>
      <form onSubmit={handleSubmit} style={{ maxWidth: 480 }}>
        <div style={{ marginBottom: 8 }}>
          <label>Email</label><br />
          <input value={email} onChange={e => setEmail(e.target.value)} style={{ width: "100%", padding: 6 }} />
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>Password</label><br />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" style={{ width: "100%", padding: 6 }} />
        </div>

        <div style={{ marginBottom: 12 }}>
          <button type="submit" style={{ marginRight: 8 }}>Sign in</button>
          <button type="button" onClick={handleClear}>Clear</button>
        </div>

        <div style={{ color: rawResponse && rawResponse.status >= 400 ? "red" : "green" }}>
          {statusMsg}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "#444" }}>
          <div>API: {API_BASE}</div>
        </div>
      </form>

      {rawResponse && (
        <div style={{ marginTop: 18, fontSize: 13 }}>
          <h3>Raw response (debug)</h3>
          <div><strong>HTTP status:</strong> {rawResponse.status}</div>
          <div style={{ marginTop: 6 }}>
            <strong>Headers:</strong>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 8 }}>{JSON.stringify(rawResponse.headers, null, 2)}</pre>
          </div>
          <div style={{ marginTop: 6 }}>
            <strong>Body:</strong>
            <pre style={{ whiteSpace: "pre-wrap", background: "#f7f7f7", padding: 8 }}>{rawResponse.text}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
