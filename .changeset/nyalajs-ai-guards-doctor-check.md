---
"@nyalajs/ai": minor
---

`nyala doctor` gains `guards-and-interceptors-wired`: flags apps using `@UseGuards()`/`@UseInterceptors()` while running an `@nyalajs/core` version older than `2.0.1`, the release that fixed `RouteResolver` silently never wiring that metadata (every "protected" route ran with no guard checks at all, regardless of what was declared — see `@nyalajs/core`'s changelog). Warns instead of failing when `@nyalajs/core` can't be resolved yet (e.g. before the first `npm install`).
