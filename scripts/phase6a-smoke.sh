#!/usr/bin/env bash
# ====================================================================
# Phase 6A smoke test — exercises the wildcard subdomain rollout
# end-to-end against the LIVE host (default: otofine.com).
#
# Usage:
#   bash scripts/phase6a-smoke.sh                       # prod (otofine.com)
#   APEX=otofine.com SHOP=phutungoto355 bash scripts/phase6a-smoke.sh
#   OTHER=somerandomshop bash scripts/phase6a-smoke.sh  # non-allowlisted shop
#
# Exits 0 if every check passes, 1 on the first failure. Output is
# intentionally chatty so the operator can see the actual values.
# ====================================================================

set -u

APEX="${APEX:-otofine.com}"
SHOP="${SHOP:-phutungoto355}"
OTHER="${OTHER:-}"
TIMEOUT="${TIMEOUT:-10}"

PASS=0
FAIL=0
FAILED_NAMES=()

c_red()    { printf '\033[31m%s\033[0m\n' "$*"; }
c_green()  { printf '\033[32m%s\033[0m\n' "$*"; }
c_dim()    { printf '\033[2m%s\033[0m\n' "$*"; }
c_bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

http_status() {
    curl -sS -o /dev/null -m "$TIMEOUT" -w '%{http_code}' "$@"
}

body_grep() {
    local url="$1"; shift
    curl -sS -m "$TIMEOUT" -L "$url" 2>/dev/null | grep -E "$@" | head -5
}

check() {
    local name="$1"; local got="$2"; local want_regex="$3"
    if printf '%s' "$got" | grep -qE "$want_regex"; then
        c_green   "  PASS  $name"
        c_dim     "        got: $got"
        PASS=$((PASS + 1))
    else
        c_red     "  FAIL  $name"
        c_dim     "        got:  $got"
        c_dim     "        want: $want_regex"
        FAIL=$((FAIL + 1))
        FAILED_NAMES+=("$name")
    fi
}

section() {
    printf '\n'
    c_bold "== $* =="
}

# --------------------------------------------------------------------
section "Apex unchanged"
# --------------------------------------------------------------------
status="$(http_status -I "https://${APEX}/")"
check "apex home returns 200"             "$status"   '^200$'

status="$(http_status -I "https://www.${APEX}/")"
check "www apex returns 200"              "$status"   '^200$'

status="$(http_status -I "https://${APEX}/product/2913")"
check "apex product returns 200"          "$status"   '^200$'

robots="$(body_grep "https://${APEX}/product/2913" 'name="robots"')"
check "apex product is index,follow"      "$robots"   'index'

canon="$(body_grep "https://${APEX}/product/2913" 'rel="canonical"')"
check "apex product canonical = apex"     "$canon"    "${APEX}/product/2913"

# --------------------------------------------------------------------
section "Allowlisted subdomain — ${SHOP}.${APEX}"
# --------------------------------------------------------------------
status="$(http_status -I "https://${SHOP}.${APEX}/")"
check "subdomain home returns 200"        "$status"   '^200$'

status="$(http_status -I "https://${SHOP}.${APEX}/san-pham")"
check "subdomain /san-pham returns 200"   "$status"   '^200$'

status="$(http_status -I "https://${SHOP}.${APEX}/gioi-thieu")"
check "subdomain /gioi-thieu returns 200" "$status"   '^200$'

status="$(http_status -I "https://${SHOP}.${APEX}/lien-he")"
check "subdomain /lien-he returns 200"    "$status"   '^200$'

robots="$(body_grep "https://${SHOP}.${APEX}/" 'name="robots"')"
check "subdomain is noindex,nofollow"     "$robots"   'noindex'

canon="$(body_grep "https://${SHOP}.${APEX}/" 'rel="canonical"')"
check "subdomain canonical = self"        "$canon"    "${SHOP}\\.${APEX}"

ogimg="$(body_grep "https://${SHOP}.${APEX}/" 'property="og:image"')"
check "subdomain emits og:image"          "$ogimg"    'og:image'

# Product detail must NOT change canonical when accessed via subdomain
canon="$(body_grep "https://${SHOP}.${APEX}/product/2913" 'rel="canonical"')"
check "product detail keeps apex canonical (no duplicate index)" \
                                          "$canon"    "${APEX}/product/2913"

# --------------------------------------------------------------------
section "Reserved + malformed hosts"
# --------------------------------------------------------------------
# Reserved labels return 404 (nginx-side). Some are apex blocks that
# return 200 (www); skip those.
for sub in api docs blog status seller staging; do
    status="$(http_status -I "https://${sub}.${APEX}/")"
    check "reserved label '${sub}' is 404"    "$status"   '^404$'
done

# Malformed slug (must be rejected — leading hyphen)
status="$(http_status -I "https://-bad.${APEX}/")"
check "malformed slug rejected"           "$status"   '^(400|404|421|444)$'

# Multi-level
status="$(http_status -I "https://a.b.${APEX}/")"
check "multi-level subdomain rejected"    "$status"   '^(404|421|444)$'

# --------------------------------------------------------------------
section "Non-allowlisted shop falls through to apex"
# --------------------------------------------------------------------
if [[ -n "$OTHER" ]]; then
    status="$(http_status -I "https://${OTHER}.${APEX}/")"
    check "non-allowlisted subdomain returns 200" "$status"   '^200$'

    title="$(body_grep "https://${OTHER}.${APEX}/" '<title')"
    check "non-allowlisted subdomain renders apex marketplace title" \
                                              "$title"    '.+'
else
    c_dim "  (skipped — set OTHER=<slug> to enable)"
fi

# --------------------------------------------------------------------
section "Summary"
# --------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
if [[ $FAIL -eq 0 ]]; then
    c_green "  $PASS / $TOTAL checks passed"
    exit 0
else
    c_red   "  $FAIL / $TOTAL checks FAILED:"
    for n in "${FAILED_NAMES[@]}"; do
        c_red "    - $n"
    done
    exit 1
fi
