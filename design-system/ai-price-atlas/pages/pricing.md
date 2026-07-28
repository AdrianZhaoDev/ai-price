# Pricing Workspace Override

This page override replaces the generated E-Ink/marketing recommendations in `MASTER.md` where they conflict with the product brief and Apple-style interaction requirements.

## Direction

- Product workspace, not a pricing-sales landing page.
- Warm neutral canvas with restrained translucent navigation.
- System font stack; do not load Lora or Raleway.
- One blue action tint; provider colors may appear only inside provider marks.
- Cardless price rows with separators. A container may use a surface only when it is an interactive grouping.
- No “popular plan” merchandising, annual discount sales copy, unboxing preview, or CTA repetition.

## Tokens

Use the `atelier` tokens defined in `docs/UI.md`.

## Motion

- No `back.out` overshoot for pricing data.
- Shared selection indicator: critically damped spring.
- List changes: 180–240ms opacity and 8px vertical translation.
- Button press begins on pointer-down with scale `0.98`.
- Respect reduced motion and reduced transparency.

## Layout

- Desktop: compact navigation, mode selector, product rail, price workspace.
- Mobile: horizontal segmented controls and stacked price rows.
- Minimum touch target 44px.
- Safe-area padding for sheets and sticky controls.
