---
name: Everkeep Terminal
description: Transferable NEAR positions in a dark financial terminal with lime signals and orbital artwork.
colors:
  "bg": "#07080C"
  "s1": "#0D0F16"
  "s2": "#141722"
  "s3": "#1C2030"
  "text": "#F0F2EA"
  "muted": "#A6B0A8"
  "brand": "#B5F36B"
  "on-brand": "#07080C"
  "up": "#4FD498"
  "down": "#FF7B88"
  "border": "rgba(255,255,255,0.06)"
  "highlight": "rgba(255,255,255,0.05)"
  "hover": "rgba(255,255,255,0.04)"
  "grid": "rgba(255,255,255,0.025)"
  "brand-glow": "rgba(181,243,107,0.10)"
  "control-border": "#69716E"
  "overlay": "rgba(7,8,12,0.80)"
typography:
  "display":
    fontFamily: "Inter, sans-serif"
    fontSize: "2.5rem"
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  "headline":
    fontFamily: "Inter, sans-serif"
    fontSize: "2rem"
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  "title":
    fontFamily: "Inter, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.03em"
  "lead":
    fontFamily: "Inter, sans-serif"
    fontSize: "1.125rem"
    lineHeight: 1.2
  "body":
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "0em"
  "field":
    fontFamily: "Inter, sans-serif"
    fontSize: "1rem"
  "label":
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
  "numeric":
    fontFamily: "'IBM Plex Mono', monospace"
    fontWeight: 400
rounded:
  "control": "8px"
  "surface": "12px"
  "feature": "20px"
spacing:
  "0": "0px"
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
  "16": "64px"
  "20": "80px"
components:
  "button-primary":
    backgroundColor: "{colors.brand}"
    textColor: "{colors.on-brand}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  "button-primary-hover":
    backgroundColor: "{colors.brand}"
  "button-secondary":
    backgroundColor: "{colors.s2}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  "button-ghost":
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  "button-danger":
    backgroundColor: "{colors.s2}"
    textColor: "{colors.down}"
    rounded: "{rounded.control}"
    padding: "8px 16px"
    height: "44px"
  "input":
    backgroundColor: "{colors.s1}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
    height: "44px"
  "navigation-active":
    textColor: "{colors.text}"
    height: "44px"
  "status-badge":
    backgroundColor: "{colors.s2}"
    textColor: "{colors.muted}"
    rounded: "{rounded.control}"
    padding: "4px 8px"
  "catalogue-card":
    backgroundColor: "{colors.s1}"
    textColor: "{colors.text}"
    rounded: "{rounded.surface}"
  "dialog":
    backgroundColor: "{colors.s2}"
    textColor: "{colors.text}"
    rounded: "{rounded.feature}"
    padding: "24px"
    width: "480px"
---

# Design System: Everkeep Terminal

## Overview

**Creative North Star: "The Everkeep Terminal"**

Everkeep is a dark financial terminal for transferable NEAR positions: the assets, constraints and current owner remain legible before an action is authorized. Near-black surfaces, a retained lime accent and original orbital SVG artwork connect the catalogue to positions, agents and wallet controls. French interface copy and explicit testnet context make the setting concrete.

The approved terminal tokens, primitives and composed components are the current house system. Inter carries interface text and headings; IBM Plex Mono carries financial figures. The existing wordmark stays an outlined SVG asset. Density follows the task: a useful navigation and catalogue strip lead into focused inspection, while transaction reviews keep exact amounts and permission consequences visible.

**Key Characteristics:**

- Near-black tonal layers with restrained lime actions and selection.
- Locally hosted Inter and IBM Plex Mono, with aligned financial numerals.
- Thin borders, soft inset highlights and controlled rounded surfaces.
- Original geometric artwork and optional pointer-responsive editorial frames.
- Truthful availability, explicit units and exact authorization values.

## Colors

Lime supplies the action signal against cool near-black materials; ivory and sage keep dense information readable. The frontmatter is normative and preserves the canonical CSS color formats.

### Primary

**Terminal lime** (`brand`) identifies primary actions, selected filters, focused controls and active detail tabs. **On-brand ink** keeps action labels dark. The restrained `brand-glow` is an atmospheric accent, rather than a second action color.

### Secondary

**Positive mint** (`up`) and **negative rose** (`down`) communicate sourced changes or operational success/error with text or icons. They do not assign an investment rating. No separate decorative secondary or tertiary identity is established.

### Neutral

**Terminal black** (`bg`) anchors the page. **Low surface** (`s1`) contains catalogue cards and operational groups; **raised surface** (`s2`) supports selected controls and dialogs; **floating surface** (`s3`) supports menus and tooltips. **Ivory text** and **sage muted text** provide the reading hierarchy. Thin translucent `border`, `highlight`, `hover` and `grid` values remain subtle; visible control boundaries use `control-border`. The `overlay` dims context behind dialogs.

**The Shared Terminal Rule.** Use the approved terminal materials across catalogue, positions, agents and wallet; vary density and hierarchy with the task.

## Typography

**Display and Body Font:** Inter, sans-serif; locally hosted variable WOFF2 (400–700).
**Numeric Font:** IBM Plex Mono, monospace; locally hosted regular TTF (400). Keep both local font licenses. The wordmark is an existing SVG outline, not a third interface font.

Inter provides a compact, calm reading voice; mono makes financial amounts and addresses easy to compare without turning every label into terminal code.

### Hierarchy

- **Display:** Page headings use the frontmatter display size and tight leading; narrow pages step down to headline size.
- **Headline:** Detail-page headings and narrow viewport page titles.
- **Title:** Section, dialog and action-panel headings; the shared composed headings use semibold weight.
- **Lead:** Supporting headings and desktop catalogue item names; narrow catalogue names step down to the field size.
- **Body:** The interface defaults to the body role. Paragraphs use relaxed leading (1.65), with explanatory measures bounded at 65ch.
- **Field:** Full-size data and field text; narrow-screen inputs use this size. The type scale therefore retains both compact interface and full-size reading values.
- **Label:** Metadata, provenance, catalogue notes and secondary annotations. These are functional labels, not a decorative eyebrow convention.
- **Numeric:** Prices, percentages, balances, exact financial amounts and addresses use mono with tabular numerals. Do not force every statistic label into mono; numbers can be individually wrapped within Inter groups.

**The Exact Money Rule.** Never interpolate financial balances. Disclose approximation in compact overviews and retain selectable exact amounts; confirmations and exports remain exact.

## Layout

The shared content maximum is 1200px. Desktop main and navigation gutters use the 32px spacing step; narrow gutters use 16px. The rhythm is based on 4px increments with an 8px organizing unit. Use the established spacing steps instead of promoting contextual legacy offsets into tokens. Interactive targets have a 44px minimum height; primary button height in frontmatter records that minimum.

The sticky header provides the outlined wordmark, Explorer / Positions / Agents navigation, global search and the existing wallet controls. Cmd/Ctrl+K opens searchable official models and verified active listings. The first viewport includes a truthful catalogue strip, explicit testnet context and a focused explorer. Its counts are observed catalogue state, not a simulated ticker.

The tablet threshold is 960px and mobile threshold is 640px. Above the tablet threshold, optional catalogue filters form a 208px sidebar alongside the three-column grid; detail content uses an optional 320px action column. Detail columns stack at tablet width. Filters begin open on desktop and collapsed at or below 960px; a user's toggle remains effective for the current mount. Do not reset the toggle on every render or resize.

At mobile width the header puts named route links on their own row and keeps search, wallet and account controls compact. Catalogue controls use two columns; card grids become one column, with a compact list/density option retaining image, name, amount and action. Wallet and account panels are fixed within viewport gutters, height-limited and internally scrollable. Preserve zero minimum widths, wrapping identifiers, overflow access and exact-value selection.

## Elevation & Depth

Depth combines tonal layers, single-pixel borders and a soft inset highlight with shared ambient shadows. These shadows are part of the approved terminal materials, rather than the old paper system. The sidecar records their exact values: low surface for cards and primary hover feedback, raised surface for trade panels, floating surface for menus, tooltips and dialogs.

**The Depth Explains State Rule.** Combine tonal surfaces and thin borders at rest; use the stronger shared shadow for floating controls and dialogs. Blur belongs to the sticky header.

The sticky header alone uses a translucent backdrop with 12px blur. The explorer introduction carries one radial lime atmosphere and the original local grain mask at restrained opacity. Card materials may use pointer-positioned foil and glare; that native material is distinct from blurring ordinary content surfaces. Do not repeat the hero treatment behind every operational group.

## Shapes

Use gently rounded controls (the control radius), softened cards and panels (surface radius), and larger dialog corners (feature radius). Keep the frontmatter's three established radius steps; square catalogue tab underlines are a deliberate local pattern. Thin borders and precise geometry anchor the rounded forms.

Original local orbital SVG artwork is framed at a 4:3 ratio. Preserve the existing wordmark outlines and original art instead of introducing unrelated image styles. Matte, metal, holo and animated are editorial material variants. Their JSON names and rarity fields carry no contractual rarity, risk score or financial promise.

## Components

### Buttons

Compact and deliberate. Primary actions pair terminal lime with dark ink, the control radius and frontmatter padding. Secondary actions use the raised surface; ghost controls start transparent; danger actions use negative rose text. Minimum targets remain 44px. All controls retain the shared lime focus outline (2px, offset 4px), clear disabled opacity and busy state.

The isolated primitive primary hover reverses to ivory. On real pages the intentional page integration keeps the primary lime and adds the low-surface shadow. Preserve this scoped page behavior; do not replace it with an unreviewed global override. Ordinary primitive hover raises the surface and strengthens the border; pressed feedback is subtle.

### Chips

Badges are compact, softly rounded and informational: raised-surface fill, muted label and optional semantic tone. Filter selection uses explicit pressed/selected semantics, lime text and an emphasized surface/border. Keep selection understandable beyond color. Noninteractive status badges do not acquire action hover states.

### Cards / Containers

Catalogue cards use the low surface, surface radius, thin border and low ambient shadow. Their footer uses 16px padding with 8px internal gaps; compact mode reduces these to established steps. Hover or focus may lift a card by 4px and reveal the stronger shadow through opacity. Fine-pointer quick actions become available on hover or focus; touch and reduced-motion paths keep the action accessible.

Position, mission and conversation containers use the same materials with task-specific density. A detail action panel keeps financial conditions near the existing action. Do not require every explanatory paragraph to sit in an identical card.

### Inputs / Fields

Real-page fields use the low surface, visible control border and control radius. The isolated primitive field starts on the page background. Decimal and numeric entries use mono; placeholders retain muted text at full opacity. Preserve labels, error explanations, disabled states and keyboard focus. Never use placeholder text as the only label.

### Navigation

The active route is ivory and semibold; inactive links are muted. Real pages retain fragment routes and current environment parameters. Global search offers keyboard selection and focus restoration. Narrow icon controls retain accessible names, and the skip link remains available to keyboard users.

### CardFrame

The validated JSON frame accepts one to three local art layers and approved palette/material choices. Invalid or missing artwork falls back to an explicit unavailable-visual message while the financial information remains readable. Pointer tilt and parallax are restricted to eligible holo/animated frames with fine hover pointers; coarse pointers and reduced motion receive a stable image. Optional quote feedback displays its provenance and is never evidence of a live market by itself. Real catalogue presentation receives validated CatalogueItem data and no specimen fixtures.

### Financial inspection and dialogs

A model shows its creation minimum; an existing position shows the seller's resale price. Inspect model conditions or verified listing terms before the existing authorization flow. Distinguish target allocation from assets actually held and observed funds from withdrawable funds. Where price history is not indexed, display that absence without inventing points. Two unavailable models remain consultable without enabling deposits; the operational liquidity model remains an explicit demoUSD testnet demonstration.

Dialogs and wallet flows preserve their existing focus handling, busy restrictions, permission review, immediate duplicate-submission guards and failure context. Capital, analysis charges, provisions, registration and gas remain distinct where applicable. The design migration changes no contracts, transaction transports or authorization consequences.

Shared motion uses the fast, normal and expressive durations with the UI easing recorded in the sidecar. Keep motion short and tied to state or direct pointer interaction. Reduced-motion disables animations, transitions and smooth scrolling, suppresses tilt/parallax and keeps quick actions available. Financial values update without interpolation; a functional waiting indicator is not decorative continuous motion.

## Do's and Don'ts

### Do:

- **Do** preserve French labels, explicit units, visible testnet context and distinctions between observed funds and hypothetical projections.
- **Do** keep keyboard focus management, accessible names, readable disabled states and selectable exact values.
- **Do** distinguish a creation minimum from a resale price, and target model composition from assets actually held.
- **Do** keep mobile wallet panels inside the viewport with internal scrolling, and mobile catalogue controls in the compact two-column arrangement.
- **Do** derive catalogue availability, listings and amounts from validated product data; show unavailable history explicitly.

### Don't:

- **Don't** animate financial values or present hypothetical yield as earned.
- **Don't** substitute compact figures for exact confirmation amounts or merge capital, fees and technical costs.
- **Don't** treat card-frame names, materials or JSON rarity fields as financial risk ratings, contractual NFT rarity or proof of value.
- **Don't** import specimen inventory, simulated market metrics or invented history into real catalogue pages.
- **Don't** add continuous decorative motion or copy external illustrations; retain the original local SVG artwork.

Documentation authority: design-system/terminal/tokens.json and card-themes.json; canonical components.css and pages.css (generated into src/terminal); src/terminal/primitives.css, CardFrame.tsx, card-frame.css, card-theme.ts, catalogue-presentation.ts and market-components.tsx; MarketplaceV3.tsx, SeriesApp.tsx and WalletConnection.tsx. PRODUCT.md supplies the durable French, testnet, financial and permission constraints. This approved merge retains those constraints while replacing superseded paper/blue/Public Sans and earlier Orbite font/surface values with the actual terminal system. Canonical page CSS maps legacy variables to terminal tokens; update the canonical source, not generated CSS.

Not canonized or repaired: inherited unscoped legacy rules and any residual kicker/eyebrow styles are implementation drift, not new reusable identity. Earlier product art-direction paragraphs are historical where they conflict with the current terminal code. Sidecar tonal ramps are synthesized panel aids; they are not additional shipped color tokens. This documentation pass performs source/schema checks only and makes no independent browser, transaction, accessibility certification or review-pass claim.
