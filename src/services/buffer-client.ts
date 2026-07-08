// Thin client around Buffer's GraphQL API (api.buffer.com).
// Docs: https://developers.buffer.com

const BUFFER_API_URL = "https://api.buffer.com";
const CHARACTER_LIMIT = 8000;

export class BufferApiError extends Error {
  constructor(message: string, public readonly raw?: unknown) {
    super(message);
    this.name = "BufferApiError";
  }
}

function getApiKey(): string {
  const key = process.env.BUFFER_API_KEY;
  if (!key) {
    throw new BufferApiError(
      "BUFFER_API_KEY is not set. Generate a personal API key as an organization owner " +
        "in Buffer's developer settings, then set it as an environment variable / secret."
    );
  }
  return key;
}

export async function bufferGraphQL<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const res = await fetch(BUFFER_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new BufferApiError(
      `Buffer API returned HTTP ${res.status}. ${text.slice(0, CHARACTER_LIMIT)}`
    );
  }

  const json = (await res.json()) as {
    data?: T;
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) {
    throw new BufferApiError(
      `Buffer API error: ${json.errors.map((e) => e.message).join("; ")}`,
      json.errors
    );
  }

  if (!json.data) {
    throw new BufferApiError("Buffer API returned no data.");
  }

  return json.data;
}

export { CHARACTER_LIMIT };
