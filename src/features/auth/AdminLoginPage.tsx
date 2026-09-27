import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "./useAuth";
import "./admin-login.css";

export function AdminLoginPage() {
  const { signIn, error: authError, status } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isDisabled = isSubmitting || status === "loading";
  const hasError = Boolean(submitError || authError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setSubmitError("Completá el correo electrónico y la contraseña.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signIn(normalizedEmail, password);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "No se pudo iniciar sesión.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="admin-login" aria-labelledby="admin-login-title">
      <section className="admin-login__card">
        <div className="admin-login__brand" aria-hidden="true">
          <img
            src="/mascot/icon_chef.png"
            alt="Mascota Todo Artesanal"
            className="admin-login__brand-logo"
            width="44"
            height="44"
          />
          <span>Todo Artesanal</span>
        </div>

        <div className="admin-login__mascot" aria-hidden="true">
          <img
            src="/mascot/bienvenidos.png"
            alt=""
            className="admin-login__mascot-img"
            width="200"
            height="212"
          />
        </div>

        <header className="admin-login__header">
          <p className="admin-login__eyebrow">Administración</p>
          <h1 id="admin-login-title">Bienvenido de nuevo</h1>
          <p>Ingresá para gestionar clientes, menú y pedidos.</p>
        </header>

        <form className="admin-login__form" onSubmit={handleSubmit} noValidate>
          <div className="admin-login__field">
            <label htmlFor="admin-email">Correo electrónico</label>
            <input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={isDisabled}
              required
              aria-invalid={hasError}
            />
          </div>

          <div className="admin-login__field">
            <label htmlFor="admin-password">Contraseña</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isDisabled}
              required
              aria-invalid={hasError}
            />
          </div>

          {hasError && (
            <p className="admin-login__error" role="alert">
              {submitError ?? authError}
            </p>
          )}

          <button
            className="admin-login__submit"
            type="submit"
            disabled={isDisabled}
          >
            {isSubmitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </section>
    </main>
  );
}
