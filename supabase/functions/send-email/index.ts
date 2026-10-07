// Edge Function /send-email — e-mails automatiques d'Axone, envoyés avec Resend.
//
// Entrées (JSON) :
//   { type: "welcome" }  connexion de l'étudiant : e-mail de bienvenue, une seule fois par compte
//   { type: "test" }     connexion d'un administrateur : envoie le message de bienvenue à son adresse
//   { type: "daily" }    appelée chaque jour par la base (en-tête x-notify-secret) : relances et fins d'abonnement
//
// Secrets : RESEND_API_KEY, MAIL_FROM (ex. « Axone <bonjour@axonerevision.com> »), NOTIFY_SECRET,
//          MAIL_REPLY_TO (facultatif : adresse qui reçoit les réponses des étudiants).
// Déploiement : supabase functions deploy send-email --no-verify-jwt  (l'autorisation est vérifiée ici).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-notify-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const SITE = 'https://www.axonerevision.com'
const WHATSAPP = 'https://wa.me/22241513211'
// Si une adresse de réponse est configurée, on invite à répondre (les réponses aident aussi à arriver dans la boîte principale)
const CAN_REPLY = !!Deno.env.get('MAIL_REPLY_TO')

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const first = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || ''

type Step = { title: string; text: string }
type Content = {
  preheader: string
  title: string // titre de l'en-tête (blanc sur bleu nuit)
  subtitle?: string
  intro: string[] // paragraphes
  steps?: Step[]
  highlight?: { label: string; value: string }
  cta: { label: string; url: string }
  after?: string[] // paragraphes sous le bouton
  avatar?: boolean // Dr. Ahmed en tête du message
}

/** Habillage commun : en-tête bleu nuit avec le logo, carte blanche, bouton, signature. Compatible Gmail, Outlook, Apple Mail. */
function layout(c: Content): string {
  const p = (t: string, extra = '') => `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:#2a3b4d;${extra}">${esc(t)}</p>`
  const steps = (c.steps ?? [])
    .map(
      (st, i) => `<tr>
        <td width="44" valign="top" style="padding:0 0 18px"><div style="width:32px;height:32px;border-radius:16px;background:#e3f6f3;color:#058a7b;font-weight:800;font-size:15px;line-height:32px;text-align:center">${i + 1}</div></td>
        <td valign="top" style="padding:0 0 18px"><div style="font-size:16px;font-weight:700;color:#0b1e34;line-height:1.35">${esc(st.title)}</div><div style="font-size:15px;line-height:1.55;color:#5b6b7c;margin-top:2px">${esc(st.text)}</div></td>
      </tr>`,
    )
    .join('')
  const highlight = c.highlight
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px"><tr><td style="background:#fff6e6;border:1px solid #f5d9a0;border-radius:14px;padding:16px 20px">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#a56a00;font-weight:700">${esc(c.highlight.label)}</div>
        <div style="font-size:22px;font-weight:800;color:#0b1e34;margin-top:4px">${esc(c.highlight.value)}</div></td></tr></table>`
    : ''
  const avatar = c.avatar
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 22px"><tr>
        <td width="64" valign="middle"><img src="${SITE}/email/dr-ahmed.png" width="56" height="56" alt="Dr. Ahmed" style="display:block;border-radius:28px;border:0"></td>
        <td valign="middle" style="padding-left:6px"><div style="font-size:15px;font-weight:700;color:#0b1e34">Dr. Ahmed</div><div style="font-size:13px;color:#7a8896">Ton assistant de révision</div></td></tr></table>`
    : ''
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(c.title)}</title></head>
<body style="margin:0;padding:0;background:#eef2f6;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(c.preheader)}${'&#8199;&#65279;&#847;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef2f6"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <tr><td style="background:#0b1e34;border-radius:22px 22px 0 0;padding:30px 36px 0"><img src="${SITE}/email/logo.png" width="164" height="41" alt="axone" style="display:block;border:0;height:41px;width:164px"></td></tr>
  <tr><td style="background:#0b1e34;padding:26px 36px 40px">
    <h1 style="margin:0;font-size:31px;line-height:1.15;letter-spacing:-0.8px;color:#ffffff;font-weight:800">${esc(c.title)}</h1>
    ${c.subtitle ? `<p style="margin:12px 0 0;font-size:17px;line-height:1.5;color:#b8c7d6">${esc(c.subtitle)}</p>` : ''}
  </td></tr>
  <tr><td style="background:#07a997;height:4px;line-height:4px;font-size:0">&nbsp;</td></tr>
  <tr><td style="background:#ffffff;padding:34px 36px 30px;border-radius:0 0 22px 22px;border:1px solid #e3e9ef;border-top:0">
    ${avatar}
    ${c.intro.map(t => p(t)).join('')}
    ${highlight}
    ${steps ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 6px">${steps}</table>` : ''}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:14px 0 26px"><tr><td style="background:#0b1e34;border-radius:999px"><a href="${c.cta.url}" style="display:inline-block;padding:16px 34px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none">${esc(c.cta.label)} &rarr;</a></td></tr></table>
    ${(c.after ?? []).map(t => p(t, 'font-size:15px;color:#5b6b7c')).join('')}
    <div style="border-top:1px solid #e8edf2;margin-top:8px;padding-top:20px;font-size:15px;line-height:1.55;color:#2a3b4d">À très vite,<br><strong style="color:#0b1e34">L'équipe Axone</strong></div>
  </td></tr>
  <tr><td style="padding:22px 12px 0;text-align:center;font-size:12.5px;line-height:1.7;color:#8696a6">
    Une question ? Réponds-nous sur <a href="${WHATSAPP}" style="color:#058a7b;text-decoration:underline">WhatsApp</a>, on est là.<br>
    Axone &middot; Mauritanie, Sénégal, Maroc<br>
    Tu reçois cet e-mail parce que tu as un compte Axone. Pour ne plus recevoir de rappels, écris-nous sur WhatsApp.
  </td></tr>
</table></td></tr></table></body></html>`
}

type Mail = { subject: string; html: string; text: string }

const plain = (c: Content) =>
  [
    c.title,
    c.subtitle ?? '',
    '',
    ...c.intro,
    c.highlight ? `${c.highlight.label} : ${c.highlight.value}` : '',
    ...(c.steps ?? []).map((s, i) => `${i + 1}. ${s.title} : ${s.text}`),
    '',
    `${c.cta.label} : ${c.cta.url}`,
    '',
    ...(c.after ?? []),
    '',
    "À très vite,\nL'équipe Axone",
    `WhatsApp : ${WHATSAPP}`,
  ].join('\n')

function welcome(name: string): Mail {
  const f = first(name)
  const c: Content = {
    preheader: "Ton espace est prêt. Voici comment réviser plus vite dès aujourd'hui.",
    title: f ? `Bienvenue, ${f}.` : 'Bienvenue sur Axone.',
    subtitle: 'Ton espace de révision est prêt.',
    avatar: true,
    intro: [
      "Dr. Ahmed, ton assistant de révision, t'attend. Axone transforme tes cours en fiches, flashcards, QCM et cas cliniques, et répond à tes questions à partir de ce que tu as déposé.",
      "Pour sentir la différence dès aujourd'hui, trois étapes, moins de cinq minutes :",
    ],
    steps: [
      { title: 'Dépose un cours', text: 'Un PDF ou quelques photos de tes notes : Axone lit tout.' },
      { title: 'Génère ta fiche et ton QCM', text: 'En quelques secondes, avec une correction expliquée pour chaque réponse.' },
      { title: 'Pose tes questions à Dr. Ahmed', text: 'Il répond à partir de ton cours, pas au hasard.' },
    ],
    cta: { label: 'Déposer mon premier cours', url: `${SITE}/app/cours` },
    after: [CAN_REPLY ? "Si tu bloques quelque part, réponds simplement à cet e-mail : on lit tout et on t'aide." : "Si tu bloques quelque part, écris-nous sur WhatsApp : on t'aide tout de suite."],
  }
  return { subject: f ? `Bienvenue sur Axone, ${f}` : 'Bienvenue sur Axone', html: layout(c), text: plain(c) }
}

function nudge(name: string): Mail {
  const f = first(name)
  const c: Content = {
    preheader: 'Un seul chapitre suffit pour voir la différence.',
    title: 'Un chapitre suffit.',
    subtitle: f ? `${f}, ton espace Axone t'attend.` : "Ton espace Axone t'attend.",
    intro: [
      "Tu as créé ton compte, mais ton espace est encore vide. Le plus dur, c'est de commencer, alors commençons petit.",
      'Dépose un seul chapitre (PDF ou photos de tes notes). En quelques secondes, tu obtiens une fiche claire, des flashcards et un QCM corrigé, pour réviser sans rien recopier.',
    ],
    cta: { label: 'Déposer un chapitre', url: `${SITE}/app/cours` },
    after: [CAN_REPLY ? "Un souci pour t'y retrouver ? Réponds simplement à cet e-mail, on t'aide tout de suite." : "Un souci pour t'y retrouver ? Écris-nous sur WhatsApp, on t'aide tout de suite."],
  }
  return { subject: f ? `${f}, ton premier cours t'attend` : "Ton premier cours t'attend sur Axone", html: layout(c), text: plain(c) }
}

function expirySoon(name: string, plan: string, expires: string): Mail {
  const f = first(name)
  const label = plan === 'premium' ? 'Premium' : plan === 'standard' ? 'Standard' : plan
  const day = new Date(expires).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
  const c: Content = {
    preheader: `Renouvelle-le avant le ${day} pour ne rien interrompre.`,
    title: `Ton plan ${label} se termine bientôt.`,
    subtitle: 'Renouvelle-le pour continuer sans interruption.',
    intro: [
      f ? `Bonjour ${f},` : 'Bonjour,',
      `Ton plan ${label} arrive à son terme. Pour garder tes QCM, tes questions à Dr. Ahmed et tout ce que ton plan débloque, il suffit de le renouveler.`,
    ],
    highlight: { label: 'Fin du plan', value: day },
    cta: { label: 'Renouveler mon plan', url: `${SITE}/app/abonnement` },
    after: [
      "Le renouvellement s'ajoute à ce qu'il te reste : tu ne perds aucun jour.",
      'Tu peux payer avec Bankily, Masrivi, Sedad ou Click. Ton plan est activé sous 24 heures après vérification.',
    ],
  }
  return { subject: `Ton plan ${label} se termine le ${day}`, html: layout(c), text: plain(c) }
}

async function send(to: string, mail: Mail): Promise<string | null> {
  const key = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('MAIL_FROM') ?? 'Axone <bonjour@axonerevision.com>'
  if (!key) return 'resend_not_configured'
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: mail.subject, html: mail.html, text: mail.text, ...(Deno.env.get('MAIL_REPLY_TO') ? { reply_to: Deno.env.get('MAIL_REPLY_TO') } : {}) }),
  })
  return res.ok ? null : `resend_${res.status}: ${(await res.text()).slice(0, 200)}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({}))
  const type = body?.type as string | undefined

  // ── Tâche quotidienne (appelée par la base, jamais ouverte au public) ──
  if (type === 'daily') {
    const secret = Deno.env.get('NOTIFY_SECRET')
    if (!secret || req.headers.get('x-notify-secret') !== secret) return json({ error: 'unauthorized' }, 401)
    const { data: due, error } = await admin.rpc('emails_due')
    if (error) return json({ error: error.message }, 500)
    let sent = 0
    const failed: string[] = []
    for (const r of (due ?? []) as { user_id: string; email: string; name: string | null; kind: string; ref: string; plan: string | null; expires_at: string | null }[]) {
      // On réserve d'abord l'envoi dans le journal : jamais deux fois le même e-mail
      const { error: logErr } = await admin.from('email_log').insert({ user_id: r.user_id, kind: r.kind, ref: r.ref })
      if (logErr) continue
      const mail = r.kind === 'expiry_soon' ? expirySoon(r.name ?? '', r.plan ?? '', r.expires_at ?? '') : nudge(r.name ?? '')
      const err = await send(r.email, mail)
      if (err) {
        failed.push(`${r.kind}: ${err}`)
        await admin.from('email_log').delete().match({ user_id: r.user_id, kind: r.kind, ref: r.ref }) // sera retenté demain
      } else sent++
    }
    return json({ sent, failed })
  }

  // ── Bienvenue et test : réservés à l'étudiant connecté ──
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const { data: u } = await admin.auth.getUser(token)
  const user = u?.user
  if (!user?.email) return json({ error: 'unauthorized' }, 401)

  const { data: student } = await admin.from('students').select('name').eq('user_id', user.id).maybeSingle()
  const name = (student?.name as string | undefined) ?? (user.user_metadata?.full_name as string | undefined) ?? ''

  if (type === 'test') {
    const { data: isAdmin } = await admin.from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
    if (!isAdmin) return json({ error: 'forbidden' }, 403)
    // Destinataire : l'adresse demandée (e-mail valide), sinon celle du compte administrateur
    const asked = typeof body?.to === 'string' ? body.to.trim() : ''
    const to = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(asked) ? asked : user.email
    if (body?.all) {
      // Les trois e-mails d'un coup, pour juger le rendu (données d'exemple)
      const soon = new Date(Date.now() + 3 * 86400000).toISOString()
      const mails = [welcome(name), nudge(name), expirySoon(name, 'premium', soon)]
      for (const m of mails) {
        const err = await send(to, { ...m, subject: `[TEST] ${m.subject}` })
        if (err) return json({ error: err }, 500)
      }
      return json({ ok: true, to, count: mails.length })
    }
    const err = await send(to, welcome(name))
    return err ? json({ error: err }, 500) : json({ ok: true, to })
  }

  if (type === 'welcome') {
    const { error: logErr } = await admin.from('email_log').insert({ user_id: user.id, kind: 'welcome', ref: '' })
    if (logErr) return json({ ok: true, already: true })
    const err = await send(user.email, welcome(name))
    if (err) {
      await admin.from('email_log').delete().match({ user_id: user.id, kind: 'welcome', ref: '' })
      return json({ error: err }, 500)
    }
    return json({ ok: true })
  }

  return json({ error: 'unknown_type' }, 400)
})
