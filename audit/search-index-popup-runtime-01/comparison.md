# Popup response comparison (flag 0 vs 1)

| Query | Overlap | Field parity | Off uses products JOIN | On index-only popup |
|-------|---------|--------------|------------------------|---------------------|
| bugi toyota | 6 | PASS | yes | yes |
| má phanh vios | 6 | PASS | yes | yes |
| lọc dầu mazda | 2 | PASS | yes | yes |
| 04465-0D140 | 0 | PASS | yes | no |

## Verified popup fields

Title (`displayTitle`), thumbnail (`image`), vehicle meta (`subtitleLine1` / `cardHighlights`), price (`priceText`), shop/province (via highlights), URL (`canonicalUrl`), part number.

All shared products match between flag 0 and flag 1.
