import type { Env } from "@/types/env"

async function verifySignature(
  request: Request,
  secret: string
): Promise<boolean> {
  const signature = request.headers.get("x-hub-signature-256")
  if (!signature) {
    return false
  }

  const body = await request.clone().text()
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(body))
  const expected = `sha256=${Array.from(new Uint8Array(signed))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`

  return signature === expected
}

export async function handleGitHubWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  const valid = await verifySignature(request, env.GITHUB_WEBHOOK_SECRET)
  if (!valid) {
    return new Response("Invalid signature", { status: 401 })
  }

  // イベントルーティングは Phase 8 で実装
  return new Response("OK", { status: 200 })
}
