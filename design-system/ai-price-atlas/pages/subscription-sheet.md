# Subscription Sheet Override

## Purpose

Collect one email address and the selected product or plan without interrupting price exploration.

## Interaction

- Desktop: anchored popover/dialog from the subscribe trigger.
- Mobile: bottom sheet following the trigger source and exiting along the same path.
- Autofocus email only on desktop; avoid forcing the mobile keyboard before the user acts.
- Inline validation with `role="alert"`.
- Submit button provides immediate press feedback and a clear pending state.
- Success state remains in the same surface; do not open a second modal.

## Visual

- Solid or strongly frosted surface; never stack translucent layers.
- One email field, one scope summary, one primary action.
- Success and privacy copy limited to one concise sentence each.
