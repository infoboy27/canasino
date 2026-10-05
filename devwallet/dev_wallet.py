"""DEV-ONLY mock FleetWallet backend. Signs with a throwaway BLS key against the
ISOLATED local test chain (chain 1). Never point this at production."""
import json, os, sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from blspy import BasicSchemeMPL, PrivateKey
from gameserver.chain import CanopyBridge, Key

b = CanopyBridge(query_url=os.environ['CANOPY_QUERY_URL'], admin_url=os.environ['CANOPY_ADMIN_URL'],
                 plugin_url=os.environ['CANOPY_PLUGIN_URL'], chain_id=int(os.environ['CANOPY_CHAIN_ID']),
                 network_id=int(os.environ['CANOPY_NETWORK_ID']))
assert os.environ['CANOPY_CHAIN_ID'] == '1', 'refusing to run against a non-test chain'
KEYFILE = '/w/key.json'
if os.path.exists(KEYFILE):
    KEY = Key(**json.load(open(KEYFILE)))
else:
    KEY = b.new_key('devwallet'); os.makedirs('/w', exist_ok=True)
    json.dump(KEY.__dict__, open(KEYFILE, 'w'))
c = sqlite3.connect('/app/data/canasino.db')
r = c.execute("select address,public_key,private_key from keys where label='operator'").fetchone()
OPERATOR = Key(address=r[0], public_key=r[1], private_key=r[2])

def top_up():
    if b.account_balance(KEY.address) < 500_000_000:
        b.buy_coins(OPERATOR, KEY.address, 2_000_000_000)   # 2000 CNPY of valueless test coins

def varint(n):
    out = bytearray()
    while True:
        bits = n & 0x7f; n >>= 7
        out.append(bits | (0x80 if n else 0))
        if not n: return bytes(out)

def encode(fields):
    out = b''
    for f in fields:
        num, typ = f['number'], f['type']
        if typ == 'uint64':
            out += varint(num << 3) + varint(int(f['value']))
        else:
            if f.get('fromSigner'): data = KEY.addr_bytes
            elif typ == 'bytes': data = bytes.fromhex(f['value'])
            else: data = str(f['value']).encode()
            out += varint(num << 3 | 2) + varint(len(data)) + data
    return out

def handle(method, params):
    if method in ('connect', 'getAccount'):
        top_up(); return {'address': KEY.address}
    if method == 'getBalance':
        whole = b.account_balance(KEY.address)
        return {'whole': f'{whole // 1_000_000}.{whole % 1_000_000:06d}', 'symbol': 'CNPY'}
    if method == 'canopy_signMessage':
        sk = PrivateKey.from_bytes(bytes.fromhex(KEY.private_key))
        sig = BasicSchemeMPL.sign(sk, bytes.fromhex(params[0]['messageHex']))
        return {'publicKey': KEY.public_key, 'signature': bytes(sig).hex()}
    if method == 'canopy_signAndSubmit':
        p = params[0]
        txh = b.submit_and_wait(KEY, p['messageName'], encode(p['fields']))
        return {'txHash': txh}
    raise ValueError('unsupported method ' + method)

class H(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'content-type')
    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        try:
            res, code = {'result': handle(body['method'], body.get('params') or [])}, 200
        except Exception as e:
            res, code = {'error': {'message': str(e)[:300], 'code': 4000}}, 200
        data = json.dumps(res).encode()
        self.send_response(code); self._cors(); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self, *a): pass

print('dev wallet', KEY.address, flush=True)
ThreadingHTTPServer(('0.0.0.0', 8094), H).serve_forever()
