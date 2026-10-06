import { useState } from 'react'
import { supabase } from '../lib/supabase'

const POINTS = [
  'Suivre les élèves et leur activité',
  'Gérer les abonnements et les paiements',
  'Lire les retours des élèves sur les réponses de Dr. Ahmed',
  'Traiter les erreurs signalées sur les fiches, QCM, flashcards et cas cliniques',
  'Envoyer les rapports aux parents',
]

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(
        /invalid login|credentials/i.test(error.message)
          ? 'Email ou mot de passe incorrect.'
          : /fetch|network/i.test(error.message)
            ? 'Connexion au serveur impossible. Vérifie ta connexion internet.'
            : error.message,
      )
    }
    setLoading(false)
  }

  return (
    <div className="lg">
      <aside className="lg-side">
        <div className="lg-brand">
          axone<span>.</span>
        </div>
        <div>
          <p className="lg-eyebrow">Administration</p>
          <h1 className="lg-title">Le tableau de bord d&apos;Axone.</h1>
          <ul className="lg-points">
            {POINTS.map(p => (
              <li key={p}>
                <span aria-hidden className="lg-dot" />
                {p}
              </li>
            ))}
          </ul>
        </div>
        <p className="lg-foot">Accès réservé à l&apos;équipe Axone.</p>
      </aside>

      <main className="lg-main">
        <form className="lg-form" onSubmit={handleLogin}>
          <div className="lg-brand lg-brand-sm">
            axone<span>.</span>
          </div>
          <h2 className="lg-h2">Connexion</h2>
          <p className="lg-sub">Entre l&apos;email et le mot de passe de ton compte administrateur.</p>

          <label className="lg-label" htmlFor="lg-email">
            Email
          </label>
          <input
            id="lg-email"
            className="lg-input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            placeholder="admin@axone.app"
          />

          <label className="lg-label" htmlFor="lg-pass">
            Mot de passe
          </label>
          <div className="lg-pass">
            <input
              id="lg-pass"
              className="lg-input"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="Ton mot de passe"
            />
            <button type="button" className="lg-eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
              {show ? 'Masquer' : 'Afficher'}
            </button>
          </div>

          {error && (
            <p className="lg-err" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="lg-btn" disabled={loading}>
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </main>
    </div>
  )
}
