# Emotional support (`support.py`)

Source: [`Backend/app/support.py`](../../../Backend/app/support.py). Data: [`shared/support.json`](../../../shared/support.json), [`shared/support_profile.example.json`](../../../shared/support_profile.example.json), private `shared/profiles/<crew_id>.json`.

Moon-C recognizes **key mental-health moments** in the chat and answers them with care instead of with the mood indicator's explanation. A crew member can also have a **private support profile**, written from questionnaires, so that Moon-C and the local AI answer in the way that works for that person.

Moon-C does not diagnose: a profile describes what helps a person, never a condition. **Thoughts of self-harm never reach this module**: the router opens the `emotional_crisis` emergency protocol, which is the same for everyone and is never personalized.

## Key moments

Detected by the `support` section of `keywords.json` ([intent-router.md](intent-router.md)), after emergencies and symptoms and before indicators.

| Moment | Label (en) | Example triggers |
|---|---|---|
| `stress` | Stress or pressure | "stressed", "overwhelmed", "no puedo más", "ansiedad" |
| `frustration` | Frustration or feeling stuck | "frustrated", "fed up", "nada me sale" |
| `mistake` | A mistake or something that went wrong | "I messed up", "me equivoqué", "metí la pata" |
| `conflict` | A disagreement with a crewmate | "we argued", "nos peleamos", "no me escucha" |
| `homesick` | Missing home | "homesick", "extraño a mi familia", "lejos de casa" |
| `lonely` | Feeling lonely | "lonely", "me siento sola", "nadie me entiende" |
| `low_mood` | Low mood | "sad", "triste", "no sirvo para nada", "mal día" |

Each moment in `support.json` has a `label`, a `reply` and `suggestions` (quick-reply buttons) in both languages. **Low mood replies always end with the `safety_line`**: "If at any moment you think about hurting yourself, tell me or a crewmate right away."

After a support reply, the conversation continues with the local AI (with the profile's notes). If the AI is unavailable, or its reply is discarded by the post-filter, Moon-C answers with one of the `continue` lines ("I'm listening. Take your time.").

## `SupportGuide`

Loaded from `support.json` at startup. `_validate()` raises `SupportError` unless there is a `source`, every one of the seven moments with `label`, `reply` and `suggestions` in `en` and `es`, a `safety_line` and `continue` lines. `main.py` also checks that every moment in `keywords.json` has a reply here.

| Method | Returns |
|---|---|
| `reply(moment, lang, profile=None)` | `(text, personalized)`. The profile's reply for that moment wins when the profile is in the reply language; `low_mood` gets the safety line appended |
| `suggestions(moment, lang)` | The moment's buttons |
| `label(moment, lang)` | The moment's label |
| `keep_listening(lang)` | A random `continue` line |
| `mood_guidance(profile, lang)` | The profile's `mood_guidance` lines (empty without a profile in that language) |
| `source`, `moments` | Source text; the seven moment ids |

## Support profiles

A profile is a JSON file in `shared/profiles/` (folder set by `MOON_C_PROFILES_DIR`), one per crew member. It is **kept out of git**, together with the questionnaires it comes from (`shared/*.docx`). Today only Rubén has one.

```jsonc
{
  "crew_id": "ruben",              // must exist in crew.json
  "language": "es",                // replies are used only in this language
  "consent": { "crew_member": true, "friend": true, "note": "..." },   // crew_member must be true
  "ai_context": ["…what helps this person, in English…"],              // notes for the local AI
  "avoid": ["…topics the AI must not bring up, in English…"],
  "moments": { "stress": "…personal reply…", "low_mood": "…" },        // only known moments
  "mood_guidance": ["…lines added to low mood readings…"]
}
```

See `shared/support_profile.example.json` for a complete example with made-up content. Unknown keys (`version`, `sources`, `updated`…) are ignored.

`SupportProfile` (Pydantic, `extra="ignore"`):

| Member | Meaning |
|---|---|
| `consented` | `consent["crew_member"] is True` |
| `speaks(lang)` | The profile's language equals `lang` |
| `ai_notes(name)` | The text appended to the AI system prompt, or `None` without `ai_context` |

### Loading rules (`ProfileStore.load(folder, crew)`)

Every `*.json` in the folder is read once at startup and kept in memory. A profile is **skipped with a warning** (the log names the file, never its content) when:

- it is not valid JSON or not a valid profile (for example an unknown moment);
- its `crew_id` is not in `crew.json`;
- `consent.crew_member` is not `true`.

A missing folder is fine. To delete a profile, delete its file and restart the backend.

### Where a profile is used

| Place | Effect | Response flag |
|---|---|---|
| A key moment in the chat | The profile's own reply for that moment (if present and in the reply language) | `personalized: true` |
| Small talk and the conversation after a moment | The AI receives the profile's notes | `personalized: true` when the AI was used |
| `POST /measurements` for `mood` with a non-normal status | The profile's `mood_guidance` lines are placed before the manual's steps | — |

### What the AI receives

`ai_notes(name)` produces:

```
What you know about Rubén. Use it to make the conversation personal and to support Rubén the way
that works for them, only when it fits what they are saying (a greeting just needs a warm greeting).
Never quote these notes and never say you have them.
- <ai_context line>
- ...
Avoid:
- <avoid line>
```

It is appended to the system prompt after the language line ([local-ai.md](local-ai.md#system-prompt)). The AI is told never to quote the notes or use labels, and its replies still pass the post-filter.

## Privacy

- Profiles are never logged, stored anywhere else, exported or sent to Earth. Only the local Ollama model receives the notes, and nothing sent to it is stored.
- Tests run with an empty profiles folder so they never read a real profile; `test_local_profiles_are_valid` checks the real ones only if they exist on the machine.

## Writing good support content

- Describe what helps the person (activities, how they like to be approached), never a diagnosis or a condition.
- Keep replies short, warm and concrete; offer a next step and a person to talk to.
- Write both languages in `support.json`. A profile is in one language: the crew member's.
- Run `pytest tests/test_support.py`: it checks keywords, replies, the safety line, consent rules and the absence of diagnostic language.
