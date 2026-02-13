import type { Env } from "@/types/env"

export default {
  fetch(_request: Request, _env: Env): Response {
    return new Response("Giddy is running")
  },
} satisfies ExportedHandler<Env>
