-- Paiements : l'administrateur peut modifier les numéros de paiement (Bankily, Masrivi, Sedad, Click)
-- et le numéro WhatsApp du support depuis l'onglet « Paiements » des Paramètres.
-- La lecture reste publique (l'application affiche le numéro à l'étudiant).

drop policy if exists "payment_accounts_admin_write" on public.payment_accounts;
create policy "payment_accounts_admin_write" on public.payment_accounts
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "app_config_admin_write" on public.app_config;
create policy "app_config_admin_write" on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());
