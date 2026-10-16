---
version: alpha
name: Whisker & Flame
description: Warm editorial cooking brand featuring two original AI cat chefs.
colors:
  primary: "#AC3E1B"
  background: "#F7F1E6"
  surface: "#FFFCF6"
  text: "#292722"
  secondary: "#666843"
  muted: "#686158"
  border: "#DED4C6"
typography:
  heading:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.15
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 600
    lineHeight: 1.4
rounded:
  card: 20px
  button: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    height: 52px
    typography: "{typography.label}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
    padding: "{spacing.md}"
  badge-free:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
---

## Overview

Whisker & Flame is the consumer brand; Two Cats Kitchen is the working project name. Two original fictional AI cat chefs invite people to discover and cook recipes. The visual identity comes from the two user-supplied reference boards. This is a design handoff, not a released app or connected store.

The first deliverable is an Apple iPhone app design and a matching website with a recipe purchase journey. Existing n8n workflows belong to a later integration stage; do not rebuild them as part of the design.

## Colors

Use cream for large backgrounds, warm white for surfaces, charcoal for text, copper for primary actions, and olive for secondary details. Avoid orange body text and low-contrast text on photography. Keep food photography natural rather than heavily tinted.

## Typography

Playfair Display creates the editorial recipe-book feel. Inter is the reference body family; native implementation may use the system font for utility controls while retaining the same hierarchy. Handwriting belongs only in occasional brand flourishes, never instructions, prices, or navigation. Support Dynamic Type in the Apple app.

## Layout

Design iPhone screens at 393 × 852 points and verify 375 × 667 as the smaller reference. Use 20-point horizontal margins, 16–24-point section gaps, and native safe areas. Bottom navigation has four destinations: Home, Recipes, Cookbook, Chefs. Cooking mode is focused and hides the tab bar. Every tappable control is at least 44 × 44 points. Scroll content must clear the tab bar and home indicator.

Website desktop frame: 1440 pixels, content max-width 1200 pixels, responsive mobile frame at 390 pixels. Put the primary recipe action above the fold. Mobile checkout summaries must remain readable without horizontal scrolling.

## Elevation & Depth

Use subtle borders and soft shadows only where they clarify cards or sheets. Avoid glass effects and competing gradients. Photography supplies the texture and warmth.

## Shapes

Rounded recipe cards, pill-shaped primary buttons, simple line icons. Use consistent icon weights. Keep food photographs inside deliberate aspect ratios; preserve the cats' faces when cropping.

## Components

Recipe card: food image, name, preparation time, difficulty, and explicit free or paid state. Saved state must have both an icon and accessible label. Avoid invented ratings, sales counts, or customer testimonials.

Recipe detail: photo, title, portions, duration, ingredient checklist, cooking method, save action, and Start cooking. Episode media has a reserved content slot; show a video only when a real playable asset exists.

Cooking step: step number, short heading, instruction, optional media, optional timer, Previous and Next. Preserve checked ingredients and step position. Timer behavior must remain correct after backgrounding.

Website purchase card: exact product title, one-time price, what the buyer receives, total currency, and Buy recipe. Prototype pricing is illustrative until configured. Provider checkout handles payment details. Only a verified successful payment unlocks a download or entitlement.

## Do's and Don'ts

- Preserve the same two cats across every asset. Whisker is an orange tabby in a white chef jacket and toque. Flame is a fluffy gray-and-white cat in an olive apron and toque.
- Whisker is precise, calm, and quietly funny. Flame is enthusiastic, impulsive, and lovable. Neither character gives unsafe cooking advice.
- Use warm concise language: “A little chaos. A lot of flavour.” and “Two cats. One kitchen.”
- Describe the characters transparently as fictional AI cat chefs in About content.
- Do not use “available on the App Store” badges before release.
- Do not depict website checkout as an established in-app digital purchase mechanism. Specify the Apple purchasing experience separately at implementation.
- Reference boards are flattened concept artwork, not extracted production logos or standalone character assets.
