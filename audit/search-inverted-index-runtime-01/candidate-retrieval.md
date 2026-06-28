# Candidate Retrieval

100% SQL on `search_token_index`:

```sql
SELECT product_id, COUNT(DISTINCT token) AS matched_tokens, SUM(weight) AS score
FROM search_token_index
WHERE token IN (?)
GROUP BY product_id
ORDER BY matched_tokens DESC, score DESC
LIMIT 500
```

No LIKE. No FULLTEXT. No products scan.
