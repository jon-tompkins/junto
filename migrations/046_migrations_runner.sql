-- One-time bootstrap so future migrations apply themselves on deploy.
-- Paste this into the Supabase SQL editor. After this, the admin /migrate
-- route handles every subsequent .sql file in migrations/.

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename    TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- exec_sql is invoked over PostgREST RPC by the runner. SECURITY DEFINER lets
-- it run DDL using the function owner's privileges (postgres role).
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql;
END;
$$;

REVOKE ALL ON FUNCTION exec_sql(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION exec_sql(TEXT) TO service_role;

-- Backfill: everything in migrations/ as of this commit is already in prod.
INSERT INTO schema_migrations (filename)
SELECT unnest(ARRAY[
  '001_add_tweet_tables.sql',
  '002_tweet_freshness_fix.sql',
  '003_fix_user_columns.sql',
  '004_newsletter_ingestion.sql',
  '005_watchlist_tables.sql',
  '006_research_requests.sql',
  '007_newsletter_marketplace.sql',
  '008_subscription_email_and_credits.sql',
  '009_research_reports_table.sql',
  '010_juntos.sql',
  '011_send_windows.sql',
  '012_schedule_days_and_timezone.sql',
  '013_onboarding.sql',
  '014_prompt_templates.sql',
  '014_research_slugs.sql',
  '015_supplier_costs.sql',
  '016_telegram_delivery.sql',
  '016_thesis_tracker.sql',
  '017_allow_personal_sources.sql',
  '017_newsletter_observability.sql',
  '019_source_analyst_profiles.sql',
  '020_atomic_credit_deduct.sql',
  '025_junto_subscription_gate.sql',
  '030_juntos.sql',
  '031_watchlists.sql',
  '032_subscription_both_channel.sql',
  '033_featured_junto.sql',
  '034_is_pro.sql',
  '035_stripe_subscription.sql',
  '036_promo_codes.sql',
  '037_ticker_reports.sql',
  '038_personal_dispatches.sql',
  '039_api_keys.sql',
  '040_dispatch_delivery_prefs.sql',
  '041_dispatch_audio_feed.sql',
  '042_unify_personal_dispatch.sql',
  '043_dispatch_delivery_channels.sql',
  '044_dispatch_watchlist_backfill.sql',
  '045_dispatch_audio_toggle.sql',
  '046_migrations_runner.sql'
])
ON CONFLICT (filename) DO NOTHING;
