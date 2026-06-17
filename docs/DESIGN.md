# DESIGN.md

## Product Style

Build a clean, calm, modern SaaS interface.

The UI should feel:

- minimal
- professional
- premium but quiet
- card-based but not heavy
- suitable for AI tools, creative tools, and production dashboards

Avoid visual noise. Prefer clarity over decoration.

## Color System

Use a restrained neutral palette.

```css
--bg: #F6F7F9;
--surface: #FFFFFF;
--surface-soft: #F9FAFB;
--border: #E5E7EB;

--text-primary: #111827;
--text-secondary: #6B7280;
--text-muted: #9CA3AF;

--accent: #2563EB;
--accent-hover: #1D4ED8;
--accent-soft: #EFF6FF;

--success: #16A34A;
--warning: #F59E0B;
--danger: #DC2626;
--info: #2563EB;
```

Rules:

- Use one main accent color.
- Use status colors only for real status.
- Do not decorate the page with many bright colors.
- Prefer neutral surfaces and subtle borders.

## Typography

Recommended font stack:

```css
font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Type scale:

```txt
Page title:     28px / 36px / 700
Section title:  20px / 28px / 600
Card title:     16px / 24px / 600
Body:           14px / 22px / 400
Caption:        12px / 18px / 400
```

Rules:

- Do not use too many font sizes.
- Do not make everything bold.
- Use spacing and color to create hierarchy.

## Spacing

Use an 8px spacing system.

Allowed values:

```txt
4, 8, 12, 16, 20, 24, 32, 40, 48, 64
```

Common usage:

```txt
Page padding: 24px or 32px
Card padding: 20px or 24px
Section gap: 24px or 32px
Field gap: 12px or 16px
Button gap: 8px or 12px
```

Avoid random spacing values.

## Radius

Use consistent radius:

```txt
Small controls: 8px
Cards: 12px
Large panels: 16px
Pills / badges: 999px
```

Avoid overly rounded cards unless the product intentionally needs a playful style.

## Shadows

Prefer borders over heavy shadows.

Default card style:

```css
background: #FFFFFF;
border: 1px solid #E5E7EB;
border-radius: 12px;
box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
```

Avoid large blurry shadows, dark shadows, and glassmorphism everywhere.

## Layout

Use clear page structure:

```txt
Page Header
Main Content
Secondary Content / Right Panel when needed
```

Rules:

- Align everything to a grid.
- Keep layouts breathable.
- Avoid card inside card.
- Avoid too many columns.
- Do not overload the first screen.

## Copywriting

UI copy should be short, clear, and action-oriented.

Good button labels:

```txt
Create project
Save changes
Start workflow
Invite member
Export file
```

Avoid vague labels:

```txt
OK
Submit
Confirm
Click here
```
