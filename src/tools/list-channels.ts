import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { bufferGraphQL } from "../services/buffer-client.js";
import { ListChannelsInputSchema, type ListChannelsInput } from "../schemas/index.js";

interface ChannelsQueryResult {
  channels: Array<{
    id: string;
    displayName: string;
    service: string;
    isDisconnected: boolean;
  }>;
}

const QUERY = `
  query ListChannels($organizationId: String!) {
    channels(organizationId: $organizationId) {
      id
      displayName
      service
      isDisconnected
    }
  }
`;

export function registerListChannelsTool(server: McpServer): void {
  server.registerTool(
    "buffer_list_channels",
    {
      title: "List Buffer Channels",
      description: `List the social channels connected to a Buffer organization, with their IDs.

Use this first to find the channelId needed by buffer_publish_post.

Args:
  - organizationId (string): Buffer organization ID.

Returns JSON: { "channels": [{ "id", "displayName", "service", "isDisconnected" }] }`,
      inputSchema: ListChannelsInputSchema.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params: ListChannelsInput) => {
      const data = await bufferGraphQL<ChannelsQueryResult>(QUERY, {
        organizationId: params.organizationId,
      });

      return {
        content: [{ type: "text", text: JSON.stringify(data.channels, null, 2) }],
        structuredContent: { channels: data.channels },
      };
    }
  );
}
