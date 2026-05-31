import { randomBytes, createHash } from 'crypto';

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 產生 PKCE code_verifier 與 S256 challenge，以及防 CSRF 的 state
export function createPkce() {
  const codeVerifier = base64url(randomBytes(48));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const state = base64url(randomBytes(24));
  return { codeVerifier, codeChallenge, state };
}
