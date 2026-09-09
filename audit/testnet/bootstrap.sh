#!/bin/sh
set -eu

# A known password is intentional here: this entire identity and data volume
# are disposable test fixtures and must never receive tokens from another
# network. The first short run creates Canopy's default config and validator.
if [ ! -s /root/.canopy/config.json ] || [ ! -s /root/.canopy/validator_key.json ]; then
  timeout 4 ./canopy start --password valueless-test-only || rc=$?
  if [ "${rc:-0}" -ne 0 ] && [ "${rc:-0}" -ne 124 ]; then
    exit "$rc"
  fi
fi

python -c "import json; p='/root/.canopy/config.json'; d=json.load(open(p)); d['plugin']='python'; open(p,'w').write(json.dumps(d,indent=2))"
exec ./canopy start --password valueless-test-only
