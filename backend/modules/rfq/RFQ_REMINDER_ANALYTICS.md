# RFQ Reminder Analytics & Conversion Attribution

## Attribution model

```
Reminder sent (rfq_reminder_sends)
        │
        ├── Push click → rfq.reminder.opened (outcome: opened)
        │
        └── Buyer activity within 24h (RFQ_BUYER_REMINDER_ATTRIBUTION_HOURS)
                ├── GET /rfq/by-token        → converted / reopen
                ├── History open             → converted / reopen
                ├── Quotes on viewer load    → converted / quote_view
                └── Buyer chat message       → converted / buyer_message

Opt-out (pref_reminders=0 on register) → outcome: opt_out (linked to recent sends for subscription)
```

Each **send** row stores:
- `rfq_request_id`, `reminder_type`, `phone_hash`, `subscription_ids` (JSON)
- OneSignal notification id after delivery

Push payload includes `attributionId` for click tracking.

## Anti-double-counting

| Rule | Mechanism |
|------|-----------|
| One open per send | `UNIQUE (send_id, outcome='opened', conversion_kind='')` |
| One conversion kind per send | `UNIQUE (send_id, outcome='converted', conversion_kind)` |
| Latest send wins | `findAttributableSendForRfq` — most recent send in 24h window |
| Dismissed sends excluded | No further conversions after `dismissed` outcome |
| Metrics use DISTINCT send_id | Aggregation counts sends once per outcome type |

**Conversion rate** = sends with any `converted` outcome / total sends  
**Open rate** = sends with `opened` / total sends  
**Opt-out rate** = sends with `opt_out` / total sends (spam risk signal)

## Aggregation strategy

- **Storage:** `rfq_reminder_sends` + `rfq_reminder_outcomes` (migration `037`)
- **Query:** SQL `LEFT JOIN` outcomes by type; grouped by `reminder_type` + totals
- **Endpoint:** `GET /api/admin/rfq/reminder-metrics?days=7`
- **Logs:** Structured `rfqLog.info` for real-time tail / log aggregator
- **Counters:** `buyer_reminder_opened`, `buyer_reminder_converted_*`, `buyer_reminder_opt_out`

No external analytics dependency.

## Admin response shape

```json
{
  "window_days": 7,
  "attribution_window_hours": 24,
  "totals": {
    "sends": 120,
    "opens": 45,
    "converted_any": 38,
    "opt_out": 3,
    "open_rate_pct": 37.5,
    "conversion_rate_pct": 31.67,
    "opt_out_rate_pct": 2.5
  },
  "by_type": [ ... ],
  "spam_risk": {
    "opt_out_rate_pct": 2.5,
    "flag_high_opt_out": false
  }
}
```

`flag_high_opt_out` when opt-out rate > 5%.

## Rollout plan

1. `npm run migrate:rfq:reminder-attribution`
2. Deploy backend + frontend (push click wiring)
3. Verify with dry-run reminders then live send
4. Monitor `GET /api/admin/rfq/reminder-metrics?days=1`
5. Tune reminder thresholds if opt-out rate rises

## Rollback

- Stop attributing: revert hooks in `rfq.public.controller`, `rfqConversation.service`, `rfq.history.controller`
- Metrics endpoint returns empty if tables dropped
- Tables are additive — safe to leave in place when worker disabled

## Deploy

```bash
cd backend && npm run migrate:rfq:reminder-attribution
pm2 restart otofine-backend otofine-frontend --update-env
```
