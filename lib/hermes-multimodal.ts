import { readArtifactContent } from "@/lib/artifacts";
import type { AguiIntent } from "@/types/agent";
import type { Artifact } from "@/types/artifact";

export type HermesInputContent =
  | {
      type: "input_text";
      text: string;
    }
  | {
      type: "input_image";
      image_url: string;
      detail?: "auto" | "low" | "high";
    };

export type HermesResponsesInput =
  | string
  | Array<{
      role: "user";
      content: HermesInputContent[];
    }>;

function attachmentToArtifact(attachment: NonNullable<AguiIntent["attachments"]>[number]): Artifact {
  return {
    id: attachment.id,
    type: attachment.type,
    title: attachment.title,
    owner: "User",
    projectId: "demo-project",
    createdAt: new Date().toISOString(),
    sourceUrl: attachment.sourceUrl,
    path: attachment.path,
    accessUrl: attachment.accessUrl,
    mimeType: attachment.mimeType,
    description: attachment.description
  };
}

async function imageAttachmentToDataUrl(attachment: NonNullable<AguiIntent["attachments"]>[number]) {
  if (attachment.type !== "image" && !attachment.mimeType?.startsWith("image/")) return null;

  const content = await readArtifactContent(attachmentToArtifact(attachment));
  const contentType = content.contentType || attachment.mimeType || "image/png";
  if (!contentType.startsWith("image/")) return null;

  const bytes = content.body instanceof ArrayBuffer ? new Uint8Array(content.body) : content.body;
  const base64 = Buffer.from(bytes).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

export async function buildHermesResponsesInput(input: {
  message: string;
  attachments?: AguiIntent["attachments"];
}): Promise<HermesResponsesInput> {
  const images: HermesInputContent[] = [];

  for (const attachment of input.attachments || []) {
    const imageUrl = await imageAttachmentToDataUrl(attachment);
    if (imageUrl) {
      images.push({
        type: "input_image",
        image_url: imageUrl,
        detail: "auto"
      });
    }
  }

  if (!images.length) return input.message;

  return [
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: input.message
        },
        ...images
      ]
    }
  ];
}
