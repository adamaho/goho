# Books search — native captures

Unedited screenshots of the ordinary Goho Dev app on the Pixel 9 API 36 emulator, October 24, 2026. The app used a separate disposable backend with synthetic saved books and failed/processing scans. No private household data, preview activity or app test harness was used.

- `open-light.png`: empty query, 13 saved books, keyboard visible; the two unfinished scans are excluded.
- `results-light.png` and `results-dark.png`: `dav` matches three saved titles/authors in A–Z order. The light capture follows Back (field retains focus); the dark capture follows IME Search (field at rest).
- `no-matches-light.png` and `no-matches-dark.png`: the unchanged approved magnifying-glass Bram, wrapped query title, explanatory copy and small Clear search above the keyboard.
- `no-matches-compact-2x-dark.png`: 320×640dp, 2× text, animations disabled, after scrolling hides the keyboard; Clear search remains reachable and works.

Normal captures are 720×1600px at 280dpi; the compact capture is 560×1120px at the same density. System bars are included. The 13-book count follows deletion of one owned QA sample from the initial 14.

Manual checks covered title/author/case/space/literal-punctuation matching, keyboard entry/Search/Back/Clear/drag behavior, filter and exact scroll restoration, result tap/hold, overlay/sheet Back priority, deletion cancellation and success, and background refresh without resetting query or scroll. Native accessibility inspection confirmed labelled controls and the debounced count node. Android build, lint and formatting checks passed. TalkBack speech and physical-device haptics were not exercised. No app unit or integration tests or test harnesses were added or run.

Approved design renders remain in the parent directory. The written screen specification wins where samples differ.
