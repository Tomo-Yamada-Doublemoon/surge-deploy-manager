type MessageBody = {
  messages?: string[]
}

export function messageFrom(body: unknown, fallback: string): string {
  const messages = (body as MessageBody | null)?.messages
  return messages?.length ? messages.join(", ") : fallback
}
