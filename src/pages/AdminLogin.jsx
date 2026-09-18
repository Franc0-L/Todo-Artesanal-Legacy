import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const navigate = useNavigate();

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setCargando(false);
    if (error) {
      setError("Usuario o contraseña incorrectos.");
      return;
    }
    navigate("/admin");
  }

  return (
    <div className="login-shell">
      <form onSubmit={enviar} className="login-card">
        <h1 className="login-title">Todo Artesanal</h1>

        <label className="login-field">
          <span className="field-label">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="control"
          />
        </label>

        <label className="login-field login-field-password">
          <span className="field-label">Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="control"
          />
        </label>

        {error && (
          <p role="alert" className="alert-copy">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="primary-button login-submit"
        >
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
