# Design System Specification: The Clinical Intelligence Framework

## 1. Overview & Creative North Star
**Creative North Star: The Sovereign Architect**

In the high-stakes environment of Ethiopian pharmacy management, "standard" UI is a liability. This design system rejects the cluttered, line-heavy aesthetic of legacy medical software in favor of **The Sovereign Architect**—a philosophy that prioritizes structural authority, tonal depth, and breathless efficiency. 

We break the "template" look by replacing rigid grids with **Intentional Asymmetry**. Large, high-contrast data displays are balanced by expansive white space. We do not use borders to contain information; we use light and depth to organize it. The result is an editorial-grade operational tool that feels like a premium diagnostic instrument rather than a basic database.

---

## 2. Colors & Tonal Architecture
The palette is rooted in a deep, authoritative teal (`primary: #004253`), balanced by a clinical hierarchy of whites and grays.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning. Boundaries must be defined solely through background color shifts or subtle tonal transitions. 
*   *Implementation:* A `surface-container-low` section sitting on a `surface` background creates a clean, sophisticated break without the visual "noise" of a line.

### Surface Hierarchy & Nesting
Treat the UI as a series of physical layers. Use the `surface-container` tiers to define importance:
*   **Base Level:** `surface` (#f7f9fb) for the main application background.
*   **Secondary Level:** `surface-container-low` (#f2f4f6) for sidebar navigation or secondary utility panels.
*   **Action Level:** `surface-container-highest` (#e0e3e5) for active workspace areas or "nested" data containers.

### The "Glass & Signature Texture" Rule
To elevate the experience, use **Glassmorphism** for floating elements (e.g., sync status modals or quick-search overlays). Apply `surface_container_lowest` with a 80% opacity and a `20px` backdrop-blur. 
*   **Signature Gradient:** For primary CTAs and critical inventory headers, use a subtle linear gradient: `primary` (#004253) to `primary_container` (#005b71) at a 135-degree angle. This adds "soul" and a tactile, metallic quality to the clinical environment.

---

## 3. Typography: The Editorial Grid
We utilize **Inter** for its neutral, high-legibility x-height, optimized for dense pharmaceutical data.

*   **Display & Headline:** Use `display-md` (2.75rem) for dashboard summaries (e.g., "Total Stock Value"). These should feel like news headlines—bold and unignorable.
*   **The Data Workhorse:** `body-md` (0.875rem) is the standard for table cells. Use `label-md` (0.75rem) for metadata (Batch IDs, Expiry Dates) to create a clear typographic hierarchy within a single row.
*   **Functional Contrast:** Titles (`title-lg`) should always use `on_surface` (#191c1e), while supporting labels use `on_surface_variant` (#40484c). This 20% contrast gap directs the eye to critical information first.

---

## 4. Elevation & Depth
In this system, depth is a functional tool, not a decoration.

*   **The Layering Principle:** Achieve lift by stacking. Place a `surface-container-lowest` (#ffffff) card on a `surface-container-low` (#f2f4f6) background. This creates a "soft lift" that feels architectural.
*   **Ambient Shadows:** For floating elements (like a medication search dropdown), use an extra-diffused shadow: `box-shadow: 0 12px 40px rgba(0, 66, 83, 0.08)`. Notice the shadow is tinted with the `primary` color, mimicking natural ambient light.
*   **Ghost Borders:** If accessibility requires a container edge (e.g., in high-glare environments), use a "Ghost Border": `outline-variant` (#bfc8cc) at **15% opacity**. Never use 100% opaque borders.

---

## 5. Components & Primitive Logic

### Buttons (The Precision Tools)
*   **Primary:** Gradient fill (`primary` to `primary_container`), `4px` (0.25rem) corner radius. No border.
*   **Secondary:** `surface_container_high` background with `on_secondary_container` text. This blends into the UI until hovered.

### Structured Data Tables (The Core)
*   **Layout:** Forbid horizontal lines. Use `1.3rem` (Spacing 6) of vertical padding between rows. 
*   **Alternating Tones:** Use a subtle shift from `surface` to `surface-container-low` for zebra-striping to guide the eye across dense rows of stock data.

### Status Chips (The Indicators)
*   **Success (In Stock):** Background `secondary_container`, Text `on_secondary_container`.
*   **Warning (Near Expiry):** Background `tertiary_fixed`, Text `on_tertiary_fixed_variant` (#6e3900).
*   **Danger (Expired/Low):** Background `error_container`, Text `on_error_container` (#93000a).
*   *Note:* Chips use `full` (9999px) roundedness for a distinct organic shape against the geometric data grid.

### Input & Search (The Command Center)
*   **Prominent Search:** Large `4.5rem` (Spacing 20) height search bars with `surface_container_lowest` backgrounds. 
*   **Sync/Offline Icons:** Placed in the top-right utility bar using `outline` (#70787d). When offline, the icon shifts to `tertiary` (#5e3000) with a subtle pulse animation.

---

## 6. Do’s and Don'ts

### Do
*   **Do** use white space as a separator. If two sections feel cluttered, increase the spacing to `2.25rem` (Spacing 10) instead of adding a line.
*   **Do** align all data to a strict baseline grid to ensure readability in 50+ row tables.
*   **Do** use "surface-tint" overlays for modal backdrops to maintain brand immersion.

### Don’t
*   **Don't** use pure black (#000000). Use `on_surface` (#191c1e) for all "black" text to reduce eye strain.
*   **Don't** use standard Material Design drop shadows. They are too heavy for a clinical retail environment.
*   **Don't** use rounded corners larger than `0.5rem` (lg) for functional cards; stay "sharp" to maintain a professional, high-performance feel.