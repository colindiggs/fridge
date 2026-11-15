#!/bin/bash
# Fail if any published file names a store number or a street address.
#   bash .github/guard.sh _site data/snapshot.json
set -uo pipefail
SUFFIX='St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Way|Pike|Ct|Court|Pl|Place|Hwy|Highway|Pkwy|Parkway|Cir|Circle|Ter|Terrace|Sq|Square'
PATTERNS=(
  '[Ss][Aa][Ff][Ee][Ww][Aa][Yy][^A-Za-z]{0,3}[0-9]+'                     # Safeway 1234, SAFEWAY #1234
  '\b[0-9]{1,6}\s+([A-Z][A-Za-z.'"'"'-]*\s+){1,3}('"$SUFFIX"')\b'        # 1234 Main St
  '\b[0-9]{1,6}\s+([A-Z][A-Z.'"'"'-]*\s+){1,3}('"${SUFFIX^^}"')\b'       # 1234 MAIN ST
  '\b[A-Z]{2}\s+[0-9]{5}(-[0-9]{4})?\b'                                  # MD 20814
)
bad=0
for p in "${PATTERNS[@]}"; do
  if hits=$(grep -rnoP -- "$p" "$@"); then
    echo "::error::possible store number or address matched /$p/:"; echo "$hits" | head -20
    bad=1
  fi
done
[ "$bad" -eq 0 ] && echo "guard: no store numbers or street addresses in: $*"
exit "$bad"
