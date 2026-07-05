import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("output workspace keeps browser preview and project outputs in focused components", async () => {
  const outputWorkspace = await readFile(path.join(process.cwd(), "src", "components", "OutputWorkspace.tsx"), "utf8");
  const browserPreview = await readFile(path.join(process.cwd(), "src", "components", "BrowserPreview.tsx"), "utf8");
  const projectOutputs = await readFile(path.join(process.cwd(), "src", "components", "ProjectOutputs.tsx"), "utf8");
  const projectOutputPrimitives = await readFile(path.join(process.cwd(), "src", "components", "ProjectOutputPrimitives.tsx"), "utf8");
  const projectTasks = await readFile(path.join(process.cwd(), "src", "components", "ProjectTasks.tsx"), "utf8");
  const projectArtifacts = await readFile(path.join(process.cwd(), "src", "components", "ProjectArtifacts.tsx"), "utf8");
  const projectArtifactViewer = await readFile(path.join(process.cwd(), "src", "components", "ProjectArtifactViewer.tsx"), "utf8");
  const projectArtifactContent = await readFile(path.join(process.cwd(), "src", "services", "projectArtifactContent.ts"), "utf8");

  assert.match(outputWorkspace, /export \{ BrowserPreview \} from "\.\/BrowserPreview"/);
  assert.match(outputWorkspace, /export \{ ProjectOutputs \} from "\.\/ProjectOutputs"/);
  assert.doesNotMatch(outputWorkspace, /function BrowserPreview|function ProjectOutputs/);
  assert.match(browserPreview, /export function BrowserPreview/);
  assert.match(projectOutputs, /export function ProjectOutputs/);
  assert.match(projectOutputs, /getOutputAgentGroups/);
  assert.match(projectOutputs, /assignPreviewToOutputGroups/);
  assert.match(projectOutputs, /ProjectOutputPrimitives/);
  assert.doesNotMatch(projectOutputs, /function OutputTypeButton|function PreviewOutputSection/);
  assert.match(projectOutputPrimitives, /export function OutputTypeButton/);
  assert.match(projectOutputPrimitives, /export function PreviewOutputSection/);
  assert.match(projectTasks, /getTrackableTaskOutputItems/);
  assert.doesNotMatch(projectTasks, /getVisibleOutputRuns|getStandaloneOutputTasks/);
  assert.match(projectArtifacts, /ProjectArtifactBrowser/);
  assert.match(projectArtifacts, /ProjectArtifactDetail/);
  assert.match(projectArtifacts, /projectArtifactContent/);
  assert.match(projectArtifacts, /const fileUri = filePart\?\.kind === "file" \? filePart\.file\.uri : undefined/);
  assert.match(projectArtifacts, /isLocalTrustedMediaUrl\(fileUri\)/);
  assert.doesNotMatch(projectArtifacts, /function ArtifactPreview|function getArtifactCopyText/);
  assert.match(projectArtifactViewer, /export function ProjectArtifactBrowser/);
  assert.match(projectArtifactViewer, /export function ProjectArtifactDetail/);
  assert.match(projectArtifactContent, /export function getArtifactCopyText/);
  assert.match(projectArtifactContent, /export function getOpenableArtifactUrl/);
  assert.match(projectArtifactContent, /export function isLocalTrustedMediaUrl/);
});

test("project artifact downloads only fetch local trusted media", async () => {
  const projectArtifacts = await readFile(path.join(process.cwd(), "src", "components", "ProjectArtifacts.tsx"), "utf8");
  const projectArtifactContent = await readFile(path.join(process.cwd(), "src", "services", "projectArtifactContent.ts"), "utf8");
  const localTrustedMediaHelper = projectArtifactContent.match(/export function isLocalTrustedMediaUrl[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(projectArtifacts, /if \(isLocalTrustedMediaUrl\(fileUri\)\)/);
  assert.match(localTrustedMediaHelper, /value\?\.startsWith\("\/workspace-local\/media"\)/);
  assert.doesNotMatch(projectArtifacts, /fetch\(filePart\.file\.uri\)/);
  assert.doesNotMatch(localTrustedMediaHelper, /https?:/);
});

test("app shell delegates main workspace rendering to a focused component", async () => {
  const app = await readFile(path.join(process.cwd(), "src", "App.tsx"), "utf8");
  const mainWorkspace = await readFile(path.join(process.cwd(), "src", "components", "MainWorkspace.tsx"), "utf8");

  assert.match(app, /MainWorkspace/);
  assert.doesNotMatch(app, /<ConversationWorkspace/);
  assert.doesNotMatch(app, /<OutputPanel/);
  assert.doesNotMatch(app, /className="main-split"/);
  assert.doesNotMatch(app, /showDirectoryPicker|DirectoryPickerHandle/);
  assert.match(mainWorkspace, /export function MainWorkspace/);
  assert.match(mainWorkspace, /<ConversationWorkspace/);
  assert.match(mainWorkspace, /<OutputPanel/);
  assert.match(mainWorkspace, /className="main-split"/);
});

test("agent provider settings expose credential status without storing browser keys", async () => {
  const source = await readFile(path.join(process.cwd(), "src", "components", "AgentProviderSettings.tsx"), "utf8");

  assert.match(source, /credential-pill/);
  assert.match(source, /Saved locally/);
  assert.match(source, /Missing/);
  assert.match(source, /name="apiKey"[\s\S]*defaultValue=""/);
  assert.match(source, /autoComplete="off"/);
  assert.doesNotMatch(source, /field-note/);
  assert.doesNotMatch(source, /defaultValue=\{agent\?\.apiKey/);
});

test("free chat history exposes rename and delete actions without nesting buttons", async () => {
  const source = await readFile(path.join(process.cwd(), "src", "components", "ConversationViews.tsx"), "utf8");

  assert.match(source, /onRenameConversation/);
  assert.match(source, /onDeleteConversation/);
  assert.match(source, /aria-label=\{`Rename \$\{item\.title\}`\}/);
  assert.match(source, /aria-label=\{`Delete \$\{item\.title\}`\}/);
  assert.match(source, /className="free-chat-history-select"/);
  assert.doesNotMatch(source, /<button\b(?:(?!<\/button>)[\s\S])*className=\{`free-chat-history-item/);
});

test("conversation scroll keeps a readable resting space above the composer", async () => {
  const styles = await readFile(path.join(process.cwd(), "src", "styles.css"), "utf8");
  const source = await readFile(path.join(process.cwd(), "src", "components", "ConversationViews.tsx"), "utf8");

  assert.match(styles, /--conversation-scroll-rest-space: clamp\(64px, 10vh, 120px\)/);
  assert.match(styles, /padding: 20px 0 var\(--conversation-scroll-rest-space\)/);
  assert.match(source, /bodyRef\.current\?\.scrollTo\(\{ top: bodyRef\.current\.scrollHeight, behavior: "smooth" \}\)/);
});

test("browser preview uses a flat workspace frame instead of a nested card", async () => {
  const styles = await readFile(path.join(process.cwd(), "src", "styles.css"), "utf8");
  const browserFrameBlock = styles.match(/\.browser-frame \{[\s\S]*?\n\}/)?.[0] ?? "";

  assert.match(browserFrameBlock, /border: 0/);
  assert.match(browserFrameBlock, /border-radius: 0/);
  assert.match(browserFrameBlock, /background: transparent/);
  assert.doesNotMatch(browserFrameBlock, /box-shadow|border-(?:top|right|bottom|left)|border: 1px solid/);
});
