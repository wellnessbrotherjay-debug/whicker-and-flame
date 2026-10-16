# Whisker & Flame — app and website design

Status: visual design proposal, 15 October 2026. No production app, checkout, payment processing, or publishing is connected by this deliverable.

## Agreed direction

Design the Apple app first. Create a matching landing page with checkout for individual recipes and, later, recipe collections. Use the supplied Whisker & Flame identity and two cat characters. The consumer journey is discover → open recipe → cook → save; the website also supports buy → receive recipe.

## Apple app screens

1. **Home:** character-led hero, Explore recipes, featured free recipes, and an episode section when actual video assets are available.
2. **Recipes:** search by name or ingredient; category filters; recipe cards showing free/locked state, duration, and difficulty. Include empty results and reset filters.
3. **Recipe detail:** food photograph, title, portions, ingredients, method, save action, and Start cooking. An episode can sit above the recipe when supplied. Three starter recipes are proposed as free samples; their final content must be approved before release.
4. **Cooking mode:** one step at a time, readable instructions, ingredient progress, timer when needed, Previous and Next. Exiting preserves progress. Completing the final step offers Finish and Return to recipe.
5. **My Cookbook:** Saved and Purchased tabs. Empty state: “Your next favourite is waiting” with Browse recipes. Saved recipes are not automatically paid entitlements. Account sync is a production feature, not implied by the mockup.
6. **Meet the Chefs:** distinct portraits, personalities, and each chef's recipes. Whisker is the perfectionist; Flame is the lovable troublemaker. No chatbot is assumed.

Native purchase controls, restore purchases, account management, accessibility, loading, errors, offline states, and account deletion belong in the implementation specification once account and purchasing scope is settled. The visual concept intentionally makes no external-checkout claim inside the app.

## Landing page

Header: Whisker & Flame wordmark; Recipes; Meet the chefs; primary Explore recipes action.

Hero: both cats, the headline “A little chaos. A lot of flavour.”, one sentence explaining the concept, Browse recipes and Meet the chefs. Hero photography must feel like the supplied rustic kitchen references.

Featured recipes: three cards with real dish photographs, title, duration, and price or Free label. Each card opens its own recipe page.

Character section: introduce Whisker and Flame with their contrasting personalities. Clearly identify the fictional AI characters in supporting brand copy.

App preview: a small group of app screens, copy describing the forthcoming cooking companion, and “Apple app in development”. Do not imply an active App Store listing.

Footer: contact, privacy, terms, refund policy, and accessibility entry points; final destinations require actual business details.

## Recipe page and website checkout

Use a stable URL per recipe, such as `/recipes/creamy-tomato-dreams`. Show the episode only when a playable asset exists. Display product contents, sample ingredients, prep/cook time, servings, allergens, and an explicit one-time price. The sample visual uses US$1.00 solely to reflect the supplied business concept; final pricing and currency remain configurable.

Purchase flow:

1. Buyer chooses Buy recipe on the website.
2. Backend creates a checkout session for the selected server-side product and price.
3. Hosted Stripe Checkout collects payment and email. Do not build a pretend card-capture form.
4. Return page shows Processing until payment is verified, then offers the purchased recipe download.
5. Verified webhook creates one order and entitlement, with idempotent handling, and queues the delivery email through the existing automation infrastructure.
6. Failed/cancelled checkout returns to the same recipe without granting access. Delayed payments remain pending. Delivery failure provides a retry/support route without charging again.

Website purchases and future Apple purchases should map to shared product identifiers. The implementation must settle Apple purchasing requirements before shipping a purchase flow in the iPhone app. The design does not assume Stripe website payment automatically permits an in-app checkout.

## Character consistency

**Chef Whisker:** orange tabby, broad serious face, greenish eyes, white toque, white double-breasted jacket. Warm perfectionist; patient explanations and deadpan humour. Sample line: “A little patience. A lot of flavour.”

**Chef Flame:** fluffy gray-and-white coat, expressive face, white toque, olive apron, wooden spoon. Mischievous and enthusiastic. Sample line: “I measured that with my heart.”

Keep fur patterns, wardrobe, scale, and character names consistent. Generate separate production character portraits and a proper vector wordmark in the asset-production stage; do not treat a screenshot crop as a finished logo master.

## Design acceptance

- The visual style is recognizable from the supplied brand boards.
- Each screen has one clear primary action and readable text.
- Free, saved, and purchased states remain distinct.
- Cooking mode keeps controls clear of safe areas and works with larger text.
- Website price and included deliverables are clear before checkout.
- No invented video playback, payments, reviews, download links, or released-app claims.
- Final implementation tests must cover real recipe navigation, saving, ingredient checks, timer/background behavior, checkout cancellation, verified fulfillment, and account-library access.

## Deliverables and next stage

`DESIGN.md` contains reusable tokens and visual rules. `design/` contains generated presentation boards and the exact prompts. The boards communicate visual direction; this document takes precedence over incidental generated text or layout inconsistencies.

### Visual review notes

The app board presents Creamy Tomato Dreams as a free starter recipe, while the website board prices its printable PDF at US$1.00. Treat these as proposed separate formats (free in-app recipe versus optional paid printable), not a finalized catalog or entitlement rule. Confirm the commercial mapping before implementation.

The image generator used inconsistent Recipes icons across screens. Production must use one consistent recipe icon and explicit active states. Recipe quantities in the mockup are illustrative design text, not an approved cooking recipe. The domain in the website's browser chrome is illustrative and has not been verified or registered. Payment-method availability and the actual hosted checkout layout will depend on the configured provider account and buyer context.

Design token validation completed with zero errors. Two informational-use color tokens (muted and border) were flagged as not referenced by the limited component token definitions; they remain available for secondary labels and dividers.

After design review, prepare the implementation plan for the Apple app and website. The existing n8n flows should be inspected and integrated later, not recreated from the historical brainstorm.
