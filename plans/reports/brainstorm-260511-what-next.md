# Brainstorm: What Next for Vega (< 24h to deadline)

**Date**: 2026-05-11
**Context**: Live at https://app.vega-fi.workers.dev. GitHub: hien-p/vega + hien-p/vega-web. Akindo Buildathon (SoSoValue) wave deadline < 24h. Form NOT submitted yet.

---

## Problem statement

User has a fully working hackathon submission ready (live demo + integrated APIs + clean repo + integration doc) but has not submitted. User intuition says "deepen (app) pages" feels weakest. Question: where to spend the last < 24h?

**Brutal honest take**: User is optimizing the wrong axis. Submission is the bottleneck, not depth.

---

## Constraints

- < 24h hard deadline
- Solo builder
- No Anthropic API key provisioned yet
- Form not submitted (highest project-risk)
- (app) routes are UI shells cloned from ClashX, render but no real data

---

## What the judging actually weights

| Category | Weight | Current Vega state |
|---|---:|---|
| User Value & Practical Impact | 30% | ✅ One-person fund pitch + tradable MAG7 SSI on SoDEX (rare tie-in) |
| Functionality & Working Demo | 25% | ✅ 3 live API panels on landing |
| Logic, Workflow & Product | 20% | ✅ INTEGRATION.md 7-step lifecycle |
| Data / API Integration | 15% | ✅ Both APIs called, full endpoint coverage |
| UX & Clarity | 10% | ✅ Aurora Blur + Agentic Ball + transitions |

We already score on every line. Marginal points from deepening (app) pages = 0 because judges don't deep-click in 2-5 min.

---

## Options evaluated

### A. Submit + Video (RECOMMENDED)
- 15 min: fill form, submit
- 30 min: record 90s screencast (script: pitch → scroll landing showing live data → click Builder → close)
- 15 min: upload YouTube unlisted + paste URL in form
- **Total**: ~60 min
- **Pros**: Submit locked. Video differentiates from ~80% of submissions that skip it. Low risk, low effort, maximum judging-weight ROI per hour.
- **Cons**: Doesn't deepen (app) pages.

### B. Submit + Real AI Copilot wire (medium risk)
- 15 min: submit
- 60 min: wire Anthropic SDK client-side with streaming + 1 SoSoValue tool call
- 30 min: test, fix CORS errors, redeploy
- 60 min: video on top
- **Total**: ~2.5h
- **Pros**: Unlocks "AI-enhanced functionality" bonus explicitly listed in brief. /copilot stops being mock.
- **Cons**: Needs Anthropic API key (~$5 min deposit). API key leaks client-side. Failure mode is last-hour breakage.

### C. Submit + Deepen 1 (app) page (user's gut pick)
- 15 min: submit
- 3-5h: wire /dashboard with real SoSoValue chart
- **Pros**: Addresses the "hollow" feeling user reported.
- **Cons**: Judges spend 2-5 min, won't see depth. Landing already shows live ETF widget — dashboard repeat = duplicate signal. Highest hour-cost, lowest score gain. Risk of breaking what works.

---

## Recommendation

**A first. B if energy left. Skip C this wave.**

Reasoning:
- Submission is the single non-negotiable. Until form is in, nothing else matters.
- Video is a force-multiplier on what already exists (live data → narrated proof).
- AI Copilot wire is high-impact but adds breakage surface in the last 6h.
- Deepening (app) pages doesn't move the needle for THIS audience in THIS time budget.

---

## Implementation order (concrete)

1. **NOW** (15 min): Open Akindo form, paste:
   - One-sentence: drafted earlier in chat
   - GitHub: `https://github.com/hien-p/vega`
   - Live demo: `https://app.vega-fi.workers.dev`
   - Additional notes: drafted block from earlier
2. **Next** (60 min): Record + upload demo video
3. **If time** (90 min): Wire Anthropic to /copilot
4. **Wave 2 backlog**:
   - Deep /dashboard with live ETF history chart
   - Wire xyflow Builder to real strategy save
   - SoDEX EIP712 sign flow on testnet
   - Apply for Buildathon higher rate limits

---

## Risks

- **Don't break what works.** Resist any "small refactor" urge in last 6h.
- **Video script discipline.** 90s max — pitch first 10s, demo next 60s, close 20s. Practice once before recording.
- **Anthropic key leak**. If doing B, accept the leak (Demo-tier-equivalent, rotate later) OR add a tiny Cloudflare Worker function as a proxy.

---

## Success metrics

- **Hard**: Form submitted before deadline ≡ project enters judging pool
- **Soft**: Video uploaded ≡ above-median signal
- **Stretch**: AI Copilot fires a real Claude response ≡ unlocks AI bonus criterion

---

## Decisions

- ✅ Submit form FIRST, no exceptions
- ✅ Video next (recommended path A)
- ⏸️ AI Copilot wire — if-time-permits (path B)
- ❌ (app) page deepening — defer to wave 2 (path C rejected)
