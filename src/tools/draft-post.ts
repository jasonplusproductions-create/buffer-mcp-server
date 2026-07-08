import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bufferGraphQL, BufferApiError } from "../services/buffer-client.js";
import { DraftPostInputSchema, type DraftPostInput } from "../schemas/index.js";

interface CreatePostResult {
  createPost:
    | { post: { id: string; text: string; dueAt: string | null } }
    | { message: string };
}

const MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess { post { id text dueAt } }
      ... on MutationError { message }
    }
  }
`;

export function registerDraftPostTool(server: McpServer): void {
  server.registerTool(
    "buffer_create_draft_post",
    {
      title: "Create a Buffer Draft Post (no approval needed — nothing goes live)",
      description: `Create a real Buffer draft post. Always saved as a draft (saveToDraft is
hardcoded true, not a parameter) — use this freely for review/iteration without needing
prior approval, since it cannot publish anything. For an approved post that should
actually go live, use buffer_publish_post instead.

Args:
  - channelId (string): Buffer channel ID from buffer_list_channels.
  - text (string): Exact post body text.
  - suggestedDueAt (string, ISO 8601 UTC, optional): informational only.

Returns JSON: { "id", "text", "dueAt" }`,
      inputSchema: DraftPostInputSchema.shape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (params: DraftPostInput) => {
      try {
        const data = await bufferGraphQL<CreatePostResult>(MUTATION, {
          input: {
            text: params.text,
            channelId: params.channelId,
            schedulingType: "automatic",
            mode: "addToQueue",
            saveToDraft: true,
            // Buffer's CreatePostInput requires assets (non-null list); empty for text-only posts.
            assets: [],
            ...(params.suggestedDueAt ? { dueAt: params.suggestedDueAt } : {}),
          },
        });
        const result = data.createPost;
        if ("message" in result) {
          return { content: [{ type: "text", text: `Error: Buffer rejected the post: ${result.message}` }], isError: true };
        }
        return {
          content: [{ type: "text", text: `Draft created (not published).\n${JSON.stringify(result.post, null, 2)}` }],
          structuredContent: result.post,
        };
      } catch (err) {
        const message = err instanceof BufferApiError ? err.message : String(err);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    }
  );
}
