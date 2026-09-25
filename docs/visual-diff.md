# Visual difference log

Updated: 2026-09-14

## Source visual truth

The source visual truth is the supplied design/style document:
`/Users/tangyichuan/Documents/spicychat-design-style.md`, supplemented by the execution plan's layout measurements. The two public reference image URLs in the plan were attempted in the available browser, but the image cache endpoint and original site did not provide a stable, capturable source image. No access restriction was bypassed.

The implementation therefore follows the verified document-level constraints: near-black canvas, muted gray surfaces, violet/blue emphasis, desktop navigation and filter rails, dense character grid, large portrait crops, mobile two-column cards, and a centered chat reading column. Exact reference typography, pixel spacing, and source asset crop remain unverified.

## Implementation evidence

| Route/state | Intended viewport | Capture status | Notes |
| --- | --- | --- | --- |
| Home / desktop | browser viewport (CUA capture emitted inline) | PARTIAL | Local CUA browser rendered the page and showed the intended 5-column desktop grid; target viewport was not controllable and no local path was exposed. |
| Home / mobile | 390×844 | BLOCKED | The available browser viewport could not be set to 390×844. |
| Chat / desktop | 1440×900 | PARTIAL | Local CUA browser rendered the persisted chat, streaming/retry state, and sticky-header fix; target viewport was not controllable and no local path was exposed. |
| Subscribe / desktop | 1440×900 | PARTIAL | Local CUA browser rendered the single-plan page and login state; target viewport was not controllable and no local path was exposed. |
| Me / desktop | 1440×900 | PARTIAL | Local CUA browser rendered account, recent conversation, favorites, and subscription states; target viewport was not controllable and no local path was exposed. |

The CUA desktop capture is browser-rendered evidence, but it is not a target-size golden. The code review and production build confirm the intended responsive rules but do not replace matched mobile visual QA.

## Difference list

- P2 / unverified: exact font metrics and reference image crop cannot be sampled from a stable source capture.
- P2 / unverified: desktop and mobile density need a real browser screenshot pass.
- P3 / expected: Yellow uses a text wordmark placeholder because no approved logo asset was supplied.
- P3 / expected: original generated character portraits intentionally differ from the source site's character art and are used only as safe demo assets.

## Next visual QA pass

Capture the five states above at equal CSS viewports, place source and implementation in one comparison input, then record focused checks for card crop, text wrapping, composer geometry, plan card hierarchy, and mobile bottom navigation.
