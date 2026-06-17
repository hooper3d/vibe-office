# UI_COMPONENTS.md

## Core Principle

Use reusable components and consistent patterns. Do not create random visual styles.

Every component should support a clean, calm, modern SaaS UI.

## App Shell

Use this structure for main product pages:

```txt
Sidebar / Topbar / Main Content
```

Recommended:

```txt
Sidebar: 240px, white background, subtle right border
Topbar: 56-64px height, simple page/global actions
Main: soft neutral background, 24-32px padding
```

Rules:

- Sidebar is for main navigation.
- Topbar is for page context and quick actions.
- Main content should be aligned, breathable, and not overcrowded.

## Page Header

Every main page should start with:

```txt
Title
One-sentence description
Primary action when needed
```

Example:

```txt
Projects
Manage your AI production workflows and recent activity.
[New Project]
```

Rules:

- The page title must be obvious.
- The primary action should be easy to find.
- Do not add decorative header elements unless useful.

## Cards

Base card:

```css
background: #FFFFFF;
border: 1px solid #E5E7EB;
border-radius: 12px;
padding: 20px;
box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
```

Rules:

- One card = one clear content group.
- Avoid card inside card.
- Prefer border over heavy shadow.
- Keep card titles short.

## Metric Cards

Use for dashboard numbers.

Structure:

```txt
Label
Value
Change / helper text
```

Rules:

- Use no more than 4 metric cards in one row.
- Avoid fake analytics.
- Use status color only when the number represents status.

## Buttons

Use clear hierarchy:

```txt
Primary: main action only
Secondary: supporting action
Ghost: lightweight action
Danger: destructive action
```

Primary button:

```css
height: 40px;
padding: 0 16px;
border-radius: 8px;
background: #2563EB;
color: #FFFFFF;
font-size: 14px;
font-weight: 500;
```

Secondary button:

```css
height: 40px;
padding: 0 16px;
border-radius: 8px;
background: #FFFFFF;
border: 1px solid #D1D5DB;
color: #374151;
font-size: 14px;
font-weight: 500;
```

Rules:

- One dominant primary action per area.
- Danger actions require confirmation.
- Button labels must be specific verbs.

## Forms

Every field should have:

```txt
Label
Input
Helper text or error text
```

Input style:

```css
height: 40px;
padding: 0 12px;
border: 1px solid #D1D5DB;
border-radius: 8px;
background: #FFFFFF;
font-size: 14px;
```

Rules:

- Do not use placeholder as the only label.
- Group related fields.
- Keep forms breathable.
- Show clear errors below the field.

Agent avatar fields should use image upload with a preview and remove action for private/local use. Do not require users to host avatars at a URL or expose the browser's raw file input as the main UI.

Agent capability tags should use a compact multi-select chip control when the options are known. Agent IP address, instance location, and profile notes are local registry notes for the user; do not present them as prompt memory or chat context.

## Badges

Use badges for status or short metadata.

Base style:

```css
display: inline-flex;
align-items: center;
height: 24px;
padding: 0 8px;
border-radius: 999px;
font-size: 12px;
font-weight: 500;
```

Status mapping:

```txt
Active / Completed -> Success
Running -> Info
Draft / Archived -> Neutral
Pending / Paused -> Warning
Risk / Failed -> Danger
```

Rules:

- Keep badge text short.
- Do not use badges as decoration.
- Do not rely on color alone; include text.

## Tables

Use tables for structured data.

Rules:

- Comfortable row height.
- No vertical borders.
- Status uses badges.
- Actions align right.
- Empty table must show an empty state.
- On mobile, tables may become cards.

## Empty States

Every empty state needs:

```txt
Title
Short explanation
Primary action when possible
```

Example:

```txt
No projects yet
Create your first project to start organizing your workflow.
[Create project]
```

## Conversation

This is a private-use workspace, not a customer support product.

Rules:

- Do not show speaker labels like `You`, `User`, `Assistant`, or agent names inside message bubbles.
- User messages align right and keep a subtle bordered bubble.
- Agent messages align left as direct text output without a surrounding bubble.
- Agent output should render Markdown, including lists, code blocks, links, tables, and Markdown images.
- System/error messages may use restrained inline styling, but should not look like another speaker.
- Keep conversation chrome minimal; avoid chat-app decoration.

## Artifacts

Rules:

- Render text artifacts as Markdown when the content is text.
- Render image artifacts directly inline when an artifact file part is an image.
- Constrain images to the output panel width and avoid decorative frames beyond the standard border/radius.

## Loading States

Prefer skeleton loading for main content.

Rules:

- Avoid blank pages.
- Avoid full-screen spinners unless the whole page is blocked.
- Disable buttons during submitting and prevent duplicate actions.

## Error States

Every error state should explain:

```txt
What failed
What user can do next
Retry action when possible
```

Example:

```txt
Failed to load projects.
Please check your connection and try again.
[Retry]
```

Do not show raw technical errors to normal users.

## Modals

Use modal only for focused tasks:

- create item
- invite member
- rename item
- confirm deletion

Avoid modal for complex settings, long forms, or full workflows.

Structure:

```txt
Title
Short description
Content
[Cancel] [Primary Action]
```

## Drawers

Use drawer for secondary detail preview or quick edit.

Recommended width:

```txt
360px - 420px
```

On mobile, drawer can become full screen.

## Search and Filters

Use search near the list it controls.

Filter bar example:

```txt
[Search] [Status] [Date] [More filters] [Reset]
```

Rules:

- Do not show too many filters by default.
- Show active filters clearly.
- Provide reset option.

## Responsive

Rules:

```txt
Desktop: sidebar + main content
Tablet: sidebar can collapse
Mobile: stack columns vertically
```

- Avoid unwanted horizontal overflow.
- Tables may become cards on mobile.
- Primary action should remain accessible.

## Accessibility

Required:

- visible focus state
- keyboard navigation
- aria-label for icon-only buttons
- status not communicated by color alone
