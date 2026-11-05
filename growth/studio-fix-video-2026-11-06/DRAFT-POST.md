# HomePlan: studio-apartment fix, build-in-public post (draft, 2026-11-06)

Video: `homeplan-studio-apartment-fix-2026-11-06.mp4` (31.5s, 1920x1080, real screen capture
of `https://homeplan-arhansubas-projects.vercel.app/`, the live production app -- not a mockup,
not an AI-generated clip). Stills backing every claim below are in `stills/`.

Posting itself is out of scope for this pass (needs the owner's X/LinkedIn login) -- this is a
draft to review and post manually. Written to stand alone per the standing house rule: no
emoji, no invented metrics/users/testimonials, every claim checked against the real commit and
the real before/after screenshots in this folder.

---

## X / LinkedIn (same copy, "Show, don't tell" build-in-public post)

**Post:**

Real bug, found today in HomePlan (open-source floor-plan generator):

Typing "studio apartment 450 sqft" generated a plan with 6-8 structural warnings on every
variant -- every public room below its comfortable minimum, bedroom flagged an unrealistic
shape, a door swinging into furniture. Worst-possible first impression for a query people
actually type.

Root cause: the generator knew it was a studio (dropped the bedroom count to 1) but never
told the rest of the pipeline -- bathrooms still defaulted to 2, the living/kitchen/dining
still generated as 3 separate crammed rooms instead of one open room, and the primary bedroom
was still held to a full house's 140 sqft minimum on a 450 sqft footprint.

Fixed: studio briefs now default to 1 bathroom, force an open floor plan, and size the sleeping
area as a real studio alcove (100 sqft ideal, 64 sqft min) instead of a full primary suite.

Same exact query, same live app, before and after in the video: 8 warnings / 8-room cramped
program -> 2 honest warnings / correct 5-room program (entry, great room, sleeping area, bath,
hallway).

Open source, MIT licensed, self-hostable: github.com/caelum0x/homeplan
Try it: homeplan-arhansubas-projects.vercel.app

**Alt shorter version (if the above is cut for a reply/quote-tweet):**

Found and fixed a real bug in HomePlan today: "studio apartment 450 sqft" was generating
6-8 structural warnings (cramped rooms, a door into furniture). Root cause was a studio
brief only changing bedroom count, not bathroom count or room layout. Fixed -- same query,
same live app, now 1-2 warnings. Before/after in the video. Open source, MIT.

---

## Notes for whoever posts this

- No fake view counts, no "users are loving this" -- none exist yet, don't imply they do.
- CTA link should carry the `utm_source=<channel>&utm_medium=social&utm_campaign=...` pattern
  used elsewhere in `plans/gtm/ad-videos/` once an actual campaign name is picked -- left
  plain here since this is a draft, not a scheduled post.
- Good fit for rule 7/9 in `plans/gtm/DISTRIBUTION-PLAYBOOK-OWNER-2026-10-13.md` ("Show,
  don't tell: short demo on X and LinkedIn" / "build in public 3-4 posts/day") -- this is a
  real bug-to-fix story, not a feature announcement, so it reads as build-in-public rather
  than a product pitch.
