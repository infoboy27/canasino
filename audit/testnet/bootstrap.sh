#!/bin/sh
set -eu

# A known password is intentional here: this entire identity and data volume
# are disposable test fixtures and must never receive tokens from another
# network. Any non-start command runs Canopy's data-dir initializer first; the
# expected failed height query then exits without spawning consensus or a
# plugin child.
if [ ! -s /root/.canopy/config.json ] || [ ! -s /root/.canopy/validator_key.json ]; then
  ./canopy query height --nickname valueless-validator --password valueless-test-only || true
fi

python -c "import json; p='/root/.canopy/config.json'; d=json.load(open(p)); d.update({'plugin':'python','newHeightTimeoutMS':250,'electionTimeoutMS':250,'electionVoteTimeoutMS':250,'proposeTimeoutMS':250,'proposeVoteTimeoutMS':250,'precommitTimeoutMS':250,'precommitVoteTimeoutMS':250,'commitTimeoutMS':250,'roundInterruptTimeoutMS':1000}); open(p,'w').write(json.dumps(d,indent=2))"
exec ./canopy start --password valueless-test-only
