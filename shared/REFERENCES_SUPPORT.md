# Moon-C emotional support advice: sources and limits

> **Moon-C does not diagnose and does not replace professional care.** The advice in `shared/support_advice.json` is supportive, self-help level guidance for crew members. All of it carries `"estado": "supuesto: validar con profesional de salud mental"` and **must be reviewed by a flight surgeon or mental-health professional before real use.** Numbers in brackets point to the [references](#references).

This file explains where each piece of advice comes from, where Moon-C departs from the source and why. Only sources that were actually opened and read are cited. Sources that could not be opened are listed at the end and are **not** used.

## Low mood

| Tip (`id`) | What Moon-C says | Source | Where Moon-C departs, and why |
|---|---|---|---|
| `small_activity` | One small, easy activity today | NHS [1]: low mood can stop us doing important or enjoyable activities; start with easier ones and mood should improve as you progress | "One a day" is Moon-C's simplification to make it concrete. The NHS page suggests a list of activities. |
| `movement` | Use the exercise session as a mood lift, add music | NASA HRP [4]: exercise is an effective way to maintain positive mood; aerobic exercise has established effectiveness against low mood and anxiety, strongest for mild symptoms; Antarctic over-winterers who were physically active had steadier mood. NHS [1]: little things every day to be more active can lift mood | The ISS crew already exercises about 2 h/day. Moon-C only reframes it, it does not prescribe a dose. The Mars-105 trend cited by NASA was not statistically significant. |
| `sleep_routine` | Low mood and tiredness feed each other; keep a regular routine and a calm wind-down | NHS [1]: low mood can make us feel tired, and tiredness can affect mood | **Partly without verified source.** Only the mood-tiredness link was read in the opened text. Specific advice (regular times, wind-down) was seen only in search summaries, so it is general wording, not a quote. **Light and circadian advice was left out: no verified source.** Sleep in orbit is constrained by the mission schedule. |
| `talk_connect` | Don't withdraw; talk with a crewmate or the medical officer; contact home when there is a link | NHS [1]: trusted friends, family and colleagues can help. NASA HRP [4]: social support is beneficial; contact with family and friends is part of in-flight support; isolation and confinement are linked to low-mood symptoms | NASA also notes that seeking support is healthy for some and may signal adjustment difficulty for others, depending on style and team climate [4]. Moon-C words it as an invitation, never as an obligation. Delayed communication with Earth is not covered by the sources. |
| `pleasant_pause` | A chosen pleasant moment: music, film, looking at Earth, personal time | NASA HRP [4]: leisure choices and personal time help prevent behavioral-health distress | The sources describe ISS crews; the Moon and Mars may not offer the same options (for example the view of Earth). |

**When to get help** (`when_to_get_help`): NHS [1] says low mood should lift after a few days, that more than about 2 weeks, or an effect on daily life or distress, is a reason to talk to a clinician, and that anyone who cannot cope or keep themselves safe should get support. Moon-C replaces "NHS 111 / GP" with the on-board medical officer. Moon-C avoids the NHS page's condition label in user text. Thoughts of self-harm open the existing `emotional_crisis` protocol.

## Moment of very high anxiety

| Element | What Moon-C does | Source | Where Moon-C departs, and why |
|---|---|---|---|
| `first_response` | Two short calm sentences, no questions, one action | None verified | **No source.** It follows the design principle of the support guide (do not interrogate someone in distress). |
| `safety_check` | One short question about chest pain, near-fainting, shortness of breath; yes opens `chest_pain`, `breathing_difficulty` or `fainting_unresponsive` and alerts the CMO | None verified | **No source; safety design choice.** The NHS leaflet [5] notes that breathlessness from anxiety can be mistaken for a heart or lung problem, which is a reason not to dismiss it either way. Moon-C cannot tell the two apart, so it treats any yes as physical first. |
| `breathing` | 4 s in, 6 s out, no pause, 6 cycles (about 1 min), up to 30 cycles (5 min) | NHS [2]: belly breathing, in through the nose, out through the mouth, count 1 to 5 in and out, repeat for at least 5 minutes. Zaccaro 2018 [3]: slow breathing under 10 breaths/min; near 6 breaths/min associated with the strongest findings; studies used inspiration:expiration ratios such as 5:5 and 4:6. NHS leaflet [5]: focus on the exhalation | **Design values, not from a guideline:** the exact 4/6 split, the zero pause and the 6-cycle first round. 4 s + 6 s gives 6 breaths/min, consistent with [3]. The NHS page [2] gives only counts, not seconds. The review [3] studied healthy participants, mostly in calm settings, and did not test a person in acute distress. The 1-minute first round is short on purpose for a moment of high anxiety, below the NHS 5-minute practice duration. |
| `grounding` | 5-4-3-2-1 senses, about 41 s in total | NHS leaflet [5] and NHS handout [6]: five things you can see, four to touch, three to hear, two to smell, one to taste (or imagine the taste of a favourite food) | **Seconds per step are a design value; neither handout gives timings.** Examples (vehicle systems, a crewmate's voice) were adapted to the spacecraft. |
| `stay_with_me` | Short companion phrases | NHS leaflet [5]: gentle reminders such as "I am safe" and "This too shall pass" | The other phrases are Moon-C wording in the same spirit. "You are safe" is only used after a negative safety check. |
| `after` | Normalize, water and rest, offer to tell the CMO | None verified | **No source.** The offer to notify the CMO is a Moon-C design choice. |
| `escalate_if` | Triggers that notify the CMO: physical symptoms, not improving after 2 rounds, self-harm words, repeated episodes, user request | None verified | **No source; every trigger and threshold ("2 rounds", "second time in a few days") is a Moon-C design value** and needs clinical review. Self-harm words open `emotional_crisis`. |

## Limits

- Moon-C does **not diagnose**. It uses no condition labels with the user, only plain descriptions such as "low mood" or "a moment of very high anxiety".
- It does **not replace** the medical officer, a flight surgeon or a psychologist. NASA's own model relies on regular private psychological conferences (about every 2 weeks, at least 15 minutes) [4]; Moon-C does not substitute for them.
- The sources are general-population or space-agency materials (UK health service, a systematic review of healthy adults, NASA analog and ISS evidence). **None validates these exact scripts for this crew, in this app, or in a moment of acute anxiety.**
- There is no opened source for the effect of communication delay on these tips.

## Sources opened but not used as evidence

None beyond the references below.

## Sources that could not be verified (not cited as evidence)

- NICE guideline NG222, *Depression in adults* (nice.org.uk): returned HTTP 403. Only search-result excerpts (behavioural activation, group exercise) were seen, so nothing is cited from it. **Recommended to review manually.**
- WHO, *Doing What Matters in Times of Stress: An Illustrated Guide* (2020): the WHO and UN PDF links returned HTTP 403; the landing page does not name the techniques. Not cited.
- NHS Inform, *Grounding exercises*: HTTP 403. Not cited.
- WHO mhGAP Intervention Guide: not opened. Not cited.
- NHS pages `low-mood-and-depression` (nhs.uk/mental-health/...): HTTP 404.
- APA guidance: not searched.

## References

All accessed on 2026-11-15.

1. NHS. *Low mood and depression* (Every Mind Matters). Review date not shown on the page. <https://www.nhs.uk/every-mind-matters/mental-health-issues/low-mood/> (headings and opening sentences read; not every section in full)
2. NHS. *Breathing exercises for stress.* Last reviewed 12 June 2026. <https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/breathing-exercises-for-stress/>
3. Zaccaro A, Piarulli A, Laurino M, Garbella E, Menicucci D, Neri B, Gemignani A. *How Breath-Control Can Change Your Life: A Systematic Review on Psycho-Physiological Correlates of Slow Breathing.* Front Hum Neurosci 2018;12:353. doi:10.3389/fnhum.2018.00353. <https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2018.00353/full> (first ~100,000 of ~170,000 characters read)
4. NASA Human Research Program, Human Factors and Behavioral Performance Element. *Evidence Report: Risk of Adverse Cognitive or Behavioral Changes and Psychiatric Disorders Leading to In-Mission Health and Performance and Long-Term Health Effects.* Approved for public release 10 February 2025. <https://ntrs.nasa.gov/api/citations/20250001454/downloads/BMed%20Evidence%20Report%20final%202-10-25.docx>
5. Royal Berkshire NHS Foundation Trust, Respiratory Medicine. *Grounding techniques to help with anxiety* (leaflet, April 2026). <https://www.royalberkshire.nhs.uk/media/0ptda3ym/grounding-techniques-to-help-with-anxiety_apr26.pdf>
6. Hull and East Yorkshire Hospitals NHS Trust (publisher inferred from the domain). *5-4-3-2-1 Grounding Technique* (handout, HEY1318). File metadata 2021, uploaded 2023. <https://www.hey.nhs.uk/wp/wp-content/uploads/2023/02/HEY1318-2022-5-4-3-2-1-Grounding-Technique.pdf>
