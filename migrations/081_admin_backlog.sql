-- 081: admin backlog / kanban board — track future + open items across the app.
CREATE TABLE IF NOT EXISTS admin_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  detail text,
  status text NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog','in_progress','done')),
  priority text NOT NULL DEFAULT 'med' CHECK (priority IN ('low','med','high')),
  category text,
  sort_order double precision NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_backlog_status_idx ON admin_backlog (status, sort_order, created_at DESC);
