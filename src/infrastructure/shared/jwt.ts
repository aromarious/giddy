const RE_PLUS = /\+/g
const RE_SLASH = /\//g
const RE_TRAILING_EQ = /=+$/
const RE_PEM_BEGIN = /-----BEGIN [\w\s]+-----/
const RE_PEM_END = /-----END [\w\s]+-----/
const RE_WHITESPACE = /\s/g

export function base64url(input: string): string {
  return input
    .replace(RE_PLUS, "-")
    .replace(RE_SLASH, "_")
    .replace(RE_TRAILING_EQ, "")
}

export async function createGitHubJwt(
  appId: string,
  privateKeyBase64: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })))
  const payload = base64url(
    btoa(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId }))
  )

  // privateKeyBase64 is base64(PEM). Decode to get PEM text, then extract DER.
  const cleanInput = privateKeyBase64.replace(RE_WHITESPACE, "")
  const pem = atob(cleanInput)
  // PEM body is base64-encoded DER — strip headers/whitespace, then decode
  const pemBody = pem
    .replace(RE_PEM_BEGIN, "")
    .replace(RE_PEM_END, "")
    .replace(RE_WHITESPACE, "")
  const keyData = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(`${header}.${payload}`)
  )

  const sig = base64url(btoa(String.fromCharCode(...new Uint8Array(signature))))

  return `${header}.${payload}.${sig}`
}
