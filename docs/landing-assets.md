# star23sharp landing assets

The landing page follows the reference image supplied by the user on 2026-10-16. Page headings, copy, buttons, navigation, feature explanations, and walkthrough cards are real HTML. The example stories are explicitly identified as illustrative content, not verified user testimonials.

## Editable vector assets

`public/assets/landing/` contains `brand-star.svg`, `feature-star.svg`, `feature-persona.svg`, `feature-chat.svg`, `feature-simulation.svg`, `feature-connection.svg`, and `avatar-{boy,girl,rose,violet}.svg`.

These SVGs trace the reference's original colored pixel runs into filled vector paths, retaining the source colors and antialiasing. They contain no embedded raster images. The trace preserves the supplied resolution; it does not infer missing higher-resolution geometry. The girl avatar uses the unframed character from the reference's simulation panel.

## Generated scene assets

The complex city artwork and phone mockups use raster assets generated with the built-in `image_gen` tool through the `imagegen` skill. They are faithful recreations, not claims of a pixel-identical source reconstruction. The two phone screens form part of the hero artwork; they are illustrative, not interactive controls.

- `public/assets/landing/hero-scene.png`: generated source image, 1829 × 860.
- `public/assets/landing/footer-scene.png`: generated source image, 1983 × 793.
- `hero-scene.webp` and `footer-scene.webp`: lossless WebP copies used by the page. Their decoded RGB pixels were checked against the PNG sources and are identical.

The PNG originals are retained for asset reuse. No API key or external runtime image service is needed to display these files.

## Final generation prompts

Both calls used the user's complete reference image as their sole reference, with `transparent_background: false` and the built-in tool (not the CLI fallback).

### Hero scene

Use case: ads-marketing. Asset type: production website HERO BACKGROUND, wide 2048x960 PNG. Reference image supplied is the exact design to reproduce. Recreate with extremely close fidelity ONLY its hero region from y=58 to y=540: the navy midnight star sky fading to mauve and pink pixel clouds, 16-bit pixel city skyline at bottom, tall pixel rooftop signboards on extreme RIGHT and two little white and black cats at bottom right, and the two large angled realistic black iPhones centered on the RIGHT HALF. Phones are the central subject: match left phone angle leaning left, pink screen with tiny pixel star, exact English 'It’s a Match!', black-haired boy and girl pixel portraits in pink square frames joined by a small pink heart; small Korean mutual-like caption, pink rounded call-to-action near bottom. Right phone leans right and overlaps front with a white chat screen, female pixel avatar, pastel pink and gray Korean message bubbles and text-entry bar. Preserve reference phone proportions and composition. Phone group occupies x=43% to 89%, top=5%, bottom=100%. Dark empty navy usable area x=0 to 41% above skyline for HTML headline. Keep right signs 'SAME RANDOM THOUGHTS BRIGHTER DAYS ♡' and 'GOOD PEOPLE BETTER DAYS *23#'. Style: exact detailed pixel-art night-city backdrop from reference with crisp pixels; realistic phone bevels, pastel pixel UI. CRITICAL: remove ALL main webpage text on left: NO Korean main headline, NO explanatory paragraph, NO pink website CTA button, NO top navigation, NO webpage header, NO handwritten slogans, NO white lower feature section. Those are editable HTML placed later. Do not create a screenshot of the whole page. Output only the seamless edge-to-edge hero artwork as one wide landscape asset. Match reference colors and positions faithfully. No watermark, no additional objects.

### Footer scene

Use case: ads-marketing. Asset type: production website bottom CTA BACKGROUND, wide 2048x560 PNG. Use supplied reference image as exact style and composition guide. Reproduce ONLY the bottom wide pixel city banner at y=1227 to1461. Edge-to-edge dusk city, beautiful mauve violet sky and pink pixel clouds, river with small pink light reflections, dark bridge crossing left to center, dense retro 16-bit city buildings in silhouette, right side has a tall freestanding black pixel billboard with neon pink frame and exact stacked lettering 'LOVE / LEARN / CONNECT / GROW / *23#'. Preserve reference view, pixel grid texture, pink lit windows, building shapes and skyline. Center x=30% to65% sky kept open for later HTML text. NO center Korean headline, NO webpage button, NO paragraph or typography in the center, NO handwritten text on left, NO webpage footer/header, no phones. Only illustrated city backdrop and the RIGHT billboard text. Match the exact reference visual rather than inventing a new style. Wide landscape ratio approx 3.5:1, keep entire river edge at bottom. No watermark.
