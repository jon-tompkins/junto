-- Allow user-authored 'note' entries on a trade's journal timeline.
ALTER TABLE trade_journal_entries DROP CONSTRAINT IF EXISTS trade_journal_entries_kind_check;
ALTER TABLE trade_journal_entries ADD CONSTRAINT trade_journal_entries_kind_check
  CHECK (kind IN ('entry', 'daily', 'exit', 'post_mortem', 'note'));
