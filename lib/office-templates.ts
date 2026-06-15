import type { OfficeTemplate } from "@/types/provisioning";

export const officeTemplates: OfficeTemplate[] = [
  {
    id: "default-product-team",
    name: "Product Team",
    description: "Chief coordinates Builder, Writer, and Operator to deliver product work through shared project context.",
    agents: [
      {
        id: "manager",
        displayName: "Chief",
        role: "Coordinates agents and context",
        profileName: "default",
        isChief: true,
        soulTemplate: "chief-existing-hermes",
        defaultTools: ["planning", "review", "handoff"],
        contextFiles: ["PROJECT_BRIEF.md", "PROGRESS_SUMMARY.md", "DECISIONS.md", "HANDOFF.md", "ARTIFACTS.md"]
      },
      {
        id: "engineer",
        displayName: "Builder",
        role: "Builds and fixes",
        profileName: "vibe-engineer",
        soulTemplate: "full-stack-engineer",
        defaultTools: ["code", "tests", "project-context"],
        contextFiles: ["PROJECT_BRIEF.md", "DECISIONS.md", "DEV_LOG.md", "HANDOFF.md", "ARTIFACTS.md"]
      },
      {
        id: "content",
        displayName: "Writer",
        role: "Publishes and summarizes",
        profileName: "vibe-content",
        soulTemplate: "content-publishing-agent",
        defaultTools: ["content", "image", "release-notes"],
        contextFiles: ["BLOG_CONTEXT.md", "RELEASE_NOTES.md", "ARTIFACTS.md", "PROJECT_BRIEF.md"]
      },
      {
        id: "tools",
        displayName: "Operator",
        role: "External tools and special skills",
        profileName: "vibe-tools",
        soulTemplate: "tools-specialist-agent",
        defaultTools: ["tools", "skills", "integrations"],
        contextFiles: ["PROJECT_BRIEF.md", "DECISIONS.md", "HANDOFF.md", "ARTIFACTS.md"]
      }
    ]
  }
];

export function getOfficeTemplate(templateId: string) {
  return officeTemplates.find((template) => template.id === templateId);
}
