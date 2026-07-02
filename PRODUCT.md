# Product

## Register

product

## Users

The primary users are real estate photographers, real estate agencies, property managers,
architects, designers, and other virtual-tour professionals who need to create, edit, publish,
share, and measure immersive 360-degree tours. They work in a task-focused environment where speed,
clarity, reliability, and predictable controls matter more than decorative novelty.

Public viewers are buyers, tenants, clients, and stakeholders who open a tour from a share link,
embed, or property listing. They need the viewer to load quickly, explain the space clearly, support
mobile gestures and keyboard access, and avoid trapping them inside unfamiliar controls.

## Product Purpose

360 Viewer is a virtual-tour creation and hosting platform for building a Matterport-class tour
experience around 360 Ghar workflows. Users should be able to upload panoramas, assemble scenes,
add and manage hotspots, configure branding and viewer behavior, publish tours, share them through
links, embeds, QR codes, and social channels, and review performance analytics.

Success means a creator can move from raw panoramas to a polished, shareable tour with minimal
manual friction, while viewers can explore published tours smoothly across desktop, mobile, and
embedded contexts.

## Brand Personality

Professional, warm, and efficient. The interface should feel like a serious property-tech tool:
confident enough for agencies and photographers, approachable enough for first-time creators, and
quiet enough that the tour content remains the focus.

## Anti-references

Do not make the product feel like a decorative landing page, a toy panorama demo, or a generic admin
template with weak states. Avoid copying Matterport's branding or interaction language directly;
match the expected capability level while keeping 360 Ghar's own product identity. Avoid workflows
that depend only on spatial 360-degree navigation when a list, panel, or text alternative would make
the task clearer or more accessible.

## Design Principles

1. Make the next action obvious: creation, editing, publishing, sharing, and viewing flows should
   always expose the user's next useful step.
2. Keep controls familiar: use standard buttons, menus, forms, tabs, panels, and dialogs so users can
   focus on tour decisions instead of learning invented UI.
3. Preserve creator confidence: destructive actions, async jobs, uploads, publishing, sharing, and
   analytics must show clear status, errors, recovery paths, and confirmation where needed.
4. Respect the viewer's context: public and embedded tours must prioritize fast loading, stable
   navigation, mobile ergonomics, and unobtrusive controls.
5. Treat accessibility as a product feature: provide keyboard paths, visible focus, text alternatives,
   non-color-only states, reduced-motion behavior, and usable touch targets.

## Accessibility & Inclusion

Target WCAG 2.1 Level AA for all non-viewer UI. The 360 viewer must provide practical mitigations
for inherently visual panorama content: keyboard controls, scene titles and descriptions, accessible
hotspot labels, and scene-list navigation that does not require spatial awareness. Interactive
targets should be at least 44x44px, focus indicators must remain visible, and motion-heavy behavior
such as auto-rotate should respect `prefers-reduced-motion`.
