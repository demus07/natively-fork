# Overlay UI Reference

This document describes the current overlay UI in detail: layout, surfaces, colors, controls, rounded geometry, and the supporting modal/panel states used in the renderer.

## Overview

The overlay is designed as a compact floating HUD rather than a full application window. Visually it is built from two primary layers:

1. A narrow top capsule that acts as the control bar.
2. A larger rounded glass panel underneath that holds live transcript, quick actions, and AI response content.

The overall visual direction is dark, translucent, and soft-edged. Almost every visible overlay surface uses:

- a dark semi-transparent background
- a subtle white border with low opacity
- heavy backdrop blur
- rounded corners
- soft drop shadows

The effect is a floating glass assistant that stays readable on top of arbitrary desktop content.

## Primary Layout

The overlay stack lives in the `overlay-column` container.

- Width: `720px`
- Max width: `720px`
- Vertical gap between major surfaces: `10px`
- Entrance animation: short fade/slide-in (`fade-overlay-in`)

The shell is vertically structured like this:

1. Top pill / title bar
2. Main glass body
3. Transcript strip
4. Quick actions row
5. AI response card
6. Optional settings modal overlay

## Color and Material System

The overlay uses a dark translucent palette rather than a flat opaque one.

### Core backgrounds

Most primary surfaces use:

- `rgba(20, 20, 20, 0.75)` as the base fill
- `backdrop-filter: blur(20px)` or `blur(24px)`

This gives the overlay its smoked-glass appearance.

### Borders

Most important surfaces use:

- `1px solid rgba(255, 255, 255, 0.08)`

That border is intentionally faint so the surfaces feel defined but not boxed in.

### Text

The overlay relies mostly on white text with opacity shifts:

- Primary text: near-white / white
- Secondary text: reduced opacity white
- Muted transcript/status text: roughly `rgba(255,255,255,0.55)`

### Accent usage

Accent color appears in small doses:

- purple-tinted chips and active quick actions
- mic/display active buttons
- status indicators
- user message chip styling

The accent is used as feedback, not as a dominant page color.

## Rounding System

The overlay heavily favors rounded geometry.

### Fully pill-shaped controls

Used for:

- top bar outer shape
- quick action pills
- mic/display/hide utility buttons

These use very high radii, typically `9999px`.

### Soft rounded panels

Used for:

- main glass body
- response card
- settings modal

Panel corner radii:

- glass body: `20px`
- response card: `20px`
- settings modal: `16px`

This gives the overlay a softer and more premium appearance than squared desktop chrome.

## Top Pill / Title Bar

The top control strip is the `top-pill`.

### Physical styling

- Height: `34px`
- Background: `rgba(20, 20, 20, 0.75)`
- Blur: `20px`
- Border: `1px solid rgba(255,255,255,0.08)`
- Radius: `9999px`
- Shadow: `0 8px 24px rgba(0,0,0,0.26)`
- Horizontal padding: compact, symmetrical capsule spacing

### Layout

The title bar is split into left and right zones.

#### Left side

Contains:

- app logo
- `Hide` button

The logo is rendered as a small image mark using `/logo_transparent.png`. It is intentionally small and sits flush without a heavy framed box.

The `Hide` control is a lightweight ghost-style pill with an eye-off icon. It is meant to dismiss or tuck away the overlay without feeling like a destructive action.

#### Right side

Contains utility/action buttons:

- `End + review`
- display visibility toggle
- mic toggle

These are all compact rounded capsule buttons.

### Button behavior and visual language

#### End + review

- Primary session-ending action in the top bar
- Includes a flag icon
- More prominent than the utility toggles because it changes session state

#### Display toggle

- Uses a monitor icon
- Indicates whether screenshot/screen context is active
- Active state uses a highlighted filled treatment

#### Mic toggle

- Uses a mic icon
- Indicates whether the audio input path is active
- Active state uses the accent highlight

The right side generally reads as "live session controls", while the left side reads as "identity and visibility controls."

## Main Glass Body

The large central panel is the `glass-body`.

### Physical styling

- Width: `640px`
- Min height: `78px`
- Background: `rgba(20, 20, 20, 0.75)`
- Blur: `24px`
- Border: `1px solid rgba(255,255,255,0.08)`
- Radius: `20px`
- Shadow: `0 20px 50px rgba(0,0,0,0.45)`

This is the main visual anchor of the overlay. It carries the strongest shadow and feels more substantial than the top capsule.

### Function

This body acts as the main working area for:

- transcript awareness
- quick prompting
- answer generation
- typed or contextual assistance

It is intentionally shallow rather than tall so the overlay stays compact over desktop content.

## Transcript Panel

The transcript section is a narrow live strip rendered by `TranscriptPanel`.

### Purpose

It provides a constantly updating line of live context without expanding into a full transcript window.

### Styling

- Single-line horizontal ticker treatment
- Muted text
- Transcript copy uses italic styling
- Text color around `rgba(255,255,255,0.55)`
- Compact vertical height

### Empty state

When no transcript is present, it shows:

- `Waiting for live transcript`

This makes the overlay feel alive even before speech arrives.

### Live behavior

The panel can show:

- finalized transcript lines
- interim transcript text

The visual effect is intentionally quiet so it does not compete with the answer panel.

## Quick Actions Row

Quick actions are rendered by `QuickActions`.

### Role

These are small one-tap prompt templates that help the user steer the assistant without typing a full prompt.

### Actions currently present

- `What to answer?`
- `Shorten`
- `Recap`
- `Follow Up Question`
- `Answer`

### Pill styling

Each quick action is a small rounded pill:

- Height: `28px`
- Radius: `9999px`
- Font size: `12px`
- Font weight: `500`
- Semi-translucent background
- Subtle border

### Active/loading state

When active:

- the pill changes to a purple-tinted highlighted state
- a spinner appears

This makes the row feel interactive without becoming button-heavy.

## AI Response Card

The response area is the `hud-response-card`, rendered through `ChatPanel`.

### Physical styling

- Width: `640px`
- Max height: `208px`
- Background: same dark glass treatment as the rest of the overlay
- Border: `1px solid rgba(255,255,255,0.08)`
- Radius: `20px`
- Padding: `14px 16px`

### Empty state

When there is no AI response yet, the card shows:

- `Ask anything on screen or conversation`

This preserves the overlay shape without forcing empty whitespace.

### Message types inside the card

#### User messages

Rendered as `hud-user-chip`.

- Max width: roughly `70%`
- Compact chip styling
- Purple-tinted fill
- Small text (`11px`)
- Rounded chip shape

These feel like lightweight command labels rather than full chat bubbles.

#### System/status messages

Rendered inline with muted styling through `hud-system-inline`.

These are secondary operational messages, not conversational content.

#### Assistant messages

Rendered in `hud-msg-ai` / `hud-msg-ai-content`.

Visual character:

- more spacious than chips
- markdown-aware
- supports code blocks and formatted text
- font size around `13.5px`
- line height around `1.6`

This makes the assistant output legible while still fitting inside a compact HUD.

### Copy control

Each assistant response can expose a copy button (`copy-btn`).

- Small utility control
- Secondary visual weight
- Intended to stay out of the way until needed

## Input / Composer Interface

The overlay styling also defines a composer/input area even when it is not the dominant visual element.

Associated classes include:

- `inputbar-shell`
- `inputbar-row`
- `hud-input-card`
- `composer-input`
- `inputbar-icon-btn`
- `send-btn`
- `hud-input-actions`
- `hud-input-hint`

### Visual style

The composer follows the same glass pattern:

- dark translucent background
- rounded panel treatment
- compact icon buttons
- subtle helper text

### Attachments / previews

The input bar supports image preview surfaces through `inputbar-preview`.

- preview thumbnail shown inline
- removable via a dedicated remove button

This keeps screenshot context close to the prompt input without expanding the overlay vertically too much.

## Diagnostics Strip

The overlay includes a diagnostics/status strip styled by `diagnostics-strip`.

This area is used for operational feedback such as:

- connection/test status
- internal health or provider state
- short-lived assistant/system notices

It is intentionally understated and utility-oriented.

## Settings Modal

The settings interface appears as an overlay modal above the floating HUD.

Rendered through `SettingsModal`.

### Overlay backdrop

The backdrop is `settings-overlay`.

- full-screen dimming layer
- darkened translucent background
- blur effect

This separates the settings state from the live overlay without opening a separate desktop window.

### Modal card

The modal itself is `settings-modal`.

- Width: `360px`
- Max height: `80vh`
- Background: `rgba(18,18,24,0.95)`
- Border: `1px solid rgba(255,255,255,0.1)`
- Radius: `16px`
- Padding: `24px`

Compared to the overlay itself, the modal is slightly more opaque so forms remain easy to read.

### Internal structure

The settings modal contains:

- close button
- section titles
- labeled fields
- provider dropdowns/selects
- status row
- help text
- save action

### Form controls

Key field classes:

- `settings-field`
- `settings-label`
- `settings-select`

Visual character:

- clean vertical stacking
- compact labels
- dark inputs with clear boundaries
- low-noise utility copy

### Actions

The save button (`settings-save-btn`) is the main confirmation action inside the modal.

There is also an explicit close button (`settings-close-btn`) for quick dismissal.

## Motion and Feedback

The overlay includes subtle motion rather than heavy transitions.

### Animations in use

- `fade-overlay-in`
- `pulse`
- `spin`
- `pulse-dot`
- `blink-cursor`

### Visual purpose

- fade-in softens window appearance
- spinner indicates active background work
- pulsing signals waiting/listening/processing states
- blinking cursor supports live/transcript or generation feel

The motion style is minimal and functional, not decorative.

## Button Language Summary

The overlay uses a few distinct button categories.

### Utility capsules

Examples:

- Hide
- display toggle
- mic toggle

Characteristics:

- pill-shaped
- low-profile
- icon-led
- translucent

### Session action button

Example:

- `End + review`

Characteristics:

- still rounded and compact
- more semantically important
- placed in top-right control cluster

### Quick action pills

Examples:

- Recap
- Answer
- Shorten

Characteristics:

- small
- prompt-like
- emphasize speed and repetition

### Modal action buttons

Examples:

- Save
- Close

Characteristics:

- more conventional form actions
- still styled inside the dark glass system

## Overall Visual Personality

The overlay is intentionally:

- compact
- dark
- translucent
- highly rounded
- desktop-native rather than web-page-like
- focused on low visual noise

It avoids large flat panels or bright UI chrome. Instead it uses blur, opacity, rounded corners, and subtle white edging to create a lightweight assistant that can sit over any desktop surface without visually dominating it.

## Component Map

The overlay UI is primarily composed from these renderer components:

- `renderer/components/TitleBar.tsx`
- `renderer/components/TranscriptPanel.tsx`
- `renderer/components/QuickActions.tsx`
- `renderer/components/ChatPanel.tsx`
- `renderer/components/SettingsModal.tsx`

The main styling lives in:

- `renderer/index.css`

These files together define the full visual system of the current overlay.
