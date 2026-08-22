// Prints a VAPID key pair. Put the public key in wrangler.toml and the private key in `wrangler secret put`.
import { webcrypto as c } from 'node:crypto'

const pair = await c.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])
const b64 = (b) => Buffer.from(b).toString('base64url')
const pub = b64(await c.subtle.exportKey('raw', pair.publicKey))
const priv = (await c.subtle.exportKey('jwk', pair.privateKey)).d
console.log(`VAPID_PUBLIC_KEY=${pub}\nVAPID_PRIVATE_KEY=${priv}`)
