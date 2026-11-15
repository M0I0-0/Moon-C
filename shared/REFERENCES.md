# Moon-C health parameters: sources and space context

> **Moon-C does not diagnose.** The ranges in `protocols.json` come from published clinical guidelines and NASA standards. They describe healthy adults at rest and **have not been validated for this crew**: a flight surgeon or the mission's medical team must review them before any real use.

This file explains where every number in `shared/protocols.json` comes from, where Moon-C deliberately departs from a source and why, and what spaceflight does to each sign. Numbers in brackets point to the [references](#references).

## How Moon-C uses the ranges

- **Three statuses.** *Normal*: no action. *Attention*: rest, measure again and tell the medical officer if it persists. *Urgent*: alert the medical officer now and open the matching protocol.
- **One rule for every indicator.** *Normal* is the healthy-adult reference range. *Urgent* is a published early-warning or emergency threshold, mostly a NEWS2 "red score" (3 points in a single parameter, which "should prompt a review by a clinician") [2]. *Attention* is everything in between, including the gaps between bands, so a value is never silently treated as normal.
- **Resting readings.** Crews exercise about 2 hours a day in orbit, which legitimately raises heart rate, breathing and temperature. The ranges apply to readings taken at rest.

## Summary

| Indicator | Normal | Attention | Urgent | Main sources |
|---|---|---|---|---|
| Heart rate (bpm) | 50–100 | 41–49 · 101–130 | ≤ 40 · ≥ 131 | ACC/AHA/HRS [1], NEWS2 [2] |
| Body temperature (°C) | 36.1–38.0 | 35.1–36.0 · 38.1–39.0 | ≤ 35.0 · ≥ 39.1 | NEWS2 [2], CDC [3], Stahn 2017 [4] |
| SpO2 (%) | 95–100 | 92–94 | ≤ 91 | NEWS2 [2], WHO [5], BTS [6] |
| Respiratory rate (breaths/min) | 12–20 | 9–11 · 21–24 | ≤ 8 · ≥ 25 | NEWS2 [2] |
| Blood pressure, systolic (mmHg) | 101–129 | 91–100 · 130–180 | ≤ 90 · > 180 | AHA/ACC 2025 [7], NEWS2 [2] |
| Blood pressure, diastolic (mmHg) | 60–79 | < 60 · 80–120 | > 120 | AHA/ACC 2025 [7], NHS [8] |
| Sleep (h, last main sleep) | 7–9 | 5–6.9 · > 9 | < 5 | AASM/SRS [9], NASA [10], Dawson & McCulloch [11] |
| Mood (1–5 self-report) | 3–5 | 2 | 1 | Moon-C design, not a validated scale (see WHO-5 [13]) |
| Radiation (µSv/h) | 0–100 | 101–999 | ≥ 1000 | NASA-STD-3001 [17] and measured backgrounds [18–22]; the thresholds are a Moon-C design choice |

Before v0.2 these were made-up example values. The changes that matter most are listed below.

| Indicator | v0.1 (example) | v0.2 (sourced) | Why |
|---|---|---|---|
| Heart rate | urgent < 50 or > 120 | urgent ≤ 40 or ≥ 131 | NEWS2 red scores; 50–59 is normal for fit adults [1] |
| Temperature | urgent ≥ 38.0 | normal up to 38.0, urgent ≥ 39.1 | resting core temperature rises about 1 °C in long missions [4] |
| SpO2 | urgent ≤ 90 | urgent ≤ 91 | NEWS2 scale 1 [2] |
| Respiratory rate | urgent < 8 or > 30 | urgent ≤ 8 or ≥ 25 | NEWS2 [2] |
| Systolic | normal from 90 | normal from 101, urgent ≤ 90 | NEWS2 low-pressure scores [2] |
| Diastolic | normal up to 84 | normal up to 79 | AHA/ACC: 80 or more is stage 1 [7] |
| Sleep | urgent < 4 h | urgent < 5 h | prior sleep-wake rule for safety-critical work [11] |
| Radiation | urgent > 100 µSv/h | urgent ≥ 1000 µSv/h | 100 µSv/h is close to the normal background in deep space [20] |

## Indicator by indicator

### Heart rate

- **Normal 50–100 bpm.** The 2018 ACC/AHA/HRS guideline sets the normal resting rate at 50–100 bpm; 60 was the older lower limit [1]. Fit crew members often rest at 50–60.
- **Urgent ≤ 40 or ≥ 131 bpm** (NEWS2 3 points) [2]. NEWS2 also scores 41–50 and 91–130. Moon-C keeps 91–100 as normal because it is normal for healthy adults at rest. That is a deliberate deviation from NEWS2.
- **In space.** On the ISS, 24-hour heart rate did not change in flight (about 63–64 bpm), while 24-hour blood pressure fell 8–10 mmHg, stroke volume rose 35%, cardiac output rose 41% and vascular resistance fell 39% [25]. The problem appears when gravity returns. On landing day only 2 of 6 ISS astronauts completed a 10-minute 80° tilt test, against 80% of Shuttle astronauts, and almost all recovered by day 3 [26]. A heart rate that jumps when standing up is the expected sign.
- **Not covered.** Exercise heart rate, and rhythm (that needs an ECG).

### Body temperature

- **Bands from NEWS2** [2]. It scores 36.1–38.0 °C as 0, 35.1–36.0 and 38.1–39.0 as 1, ≥ 39.1 as 2 and ≤ 35.0 as 3.
- **Deviation: ≥ 39.1 °C is urgent in Moon-C.** The CDC lists 103 °F (39.4 °C) or more as a warning sign of heat stroke that needs emergency help [3]. In space the body heats up faster during exercise: 0.15 °C/min against 0.1 °C/min on the ground, and above 40 °C in some astronauts [4].
- **In space ("space fever").** Resting core temperature rose about 1 °C over roughly 2.5 months and plateaued after about 75 days (11 ISS astronauts) [4]. A fixed fever line at 38.0 would fire too often. The normal band up to 38.0 absorbs that rise.
- **Sensor note.** A wrist bracelet measures skin temperature, which is lower and noisier than core temperature. The NASA study used a forehead heat-flux sensor [4]. Readings typed into the manual should come from the on-board thermometer.

### SpO2

- **Normal ≥ 95%.** The WHO pulse oximetry manual calls for action when SpO2 is 94% or below [5], and the BTS target range for most adults is 94–98% [6].
- **Urgent ≤ 91%** (NEWS2 scale 1, 3 points) [2]. That is stricter than the "below 90%" emergency line many references use.
- **In space.** ISS air is close to sea level (14.7 psi, about 21% O2), so Earth values apply. Lunar and Mars habitats will probably use NASA's exploration atmosphere: 8.2 psi with 34% O2. Its inspired O2 pressure is 128 mmHg, the same hypoxia as breathing air at about 1,220 m [31]. Healthy saturation should stay at or above 95%. If several crew members drop at the same time, suspect the cabin, not the people.
- **Sensor note.** Pulse oximeters read less accurately with cold fingers, movement or nail polish, and can over-read on darker skin (FDA safety communication, 2021).

### Respiratory rate

- **All bands from NEWS2** [2]. It scores 12–20 as 0, 9–11 as 1, 21–24 as 2, and ≤ 8 or ≥ 25 as 3.
- **In space.** In sustained microgravity tidal volume fell about 15% and breathing rate rose about 9% (Spacelab SLS-1/2), still within the normal range [29].
- **Cabin CO2.** NASA-STD-3001 [V2 6004] limits CO2 to 3 mmHg as a 1-hour average [30], down from an earlier 3.8–7.5 mmHg. NASA links higher levels on the ISS to crew headaches. Faster breathing or headaches in several people at once point to the cabin air.

### Blood pressure

- **High side: AHA/ACC 2025** [7]. The guideline keeps the 2017 categories:
  - normal: < 120/80;
  - elevated: 120–129 and < 80;
  - stage 1: 130–139 or 80–89;
  - stage 2: ≥ 140 or ≥ 90;
  - above 180 and/or above 120: the AHA's "consult your doctor immediately" category (an emergency with symptoms).

  Moon-C counts "elevated" as normal because it needs no immediate action. Stages 1–2 are attention, and > 180 or > 120 is urgent.
- **Low side: NEWS2** [2]. It scores systolic ≤ 90 as 3, 91–100 as 2 and 101–110 as 1. Moon-C keeps 101–110 as normal (a deviation), because healthy crews lose about 8 mmHg of 24-hour systolic pressure in flight [25]. A diastolic below 60 is attention (NHS: low blood pressure is below 90/60) [8].
- **Standing test after landing.** The consensus definition of a pressure drop on standing is a sustained fall of ≥ 20 mmHg systolic or ≥ 10 mmHg diastolic within 3 minutes [27]. It is a good candidate for a post-landing check (see next steps).
- **Veins.** On about flight day 50, 6 of 11 ISS crew members had stagnant or reversed flow in the internal jugular vein. One had a clot that caused no symptoms [28].

### Sleep

- **Normal 7–9 h.** The AASM/SRS consensus is 7 hours or more on a regular basis; more than 9 can be appropriate when recovering [9]. NASA's sleep technical brief cites the 7–9 hour recommendation [10].
- **Urgent < 5 h.** The prior sleep-wake rule used in fatigue risk management says that less than 5 h of sleep in the last 24 h (or less than 12 h in 48 h) means no safety-critical work without fatigue controls [11]. Transport Canada uses 6 h for high-risk operations [37]. The urgent step is operational: avoid critical tasks and tell the commander.
- **In space.** Astronauts average about 6 h a night (5.96 h on the Shuttle, 6.09 h on the ISS) despite 8.5 h scheduled. 78% used sleep medication at least once, on 52% of nights in flight [12]. NASA notes that a week of 6-hour nights impairs performance as much as 24–36 hours awake [10]. The ISS sees about 16 sunrises a day, daylight on the Moon lasts about two weeks, and a day on Mars lasts 24 h 39 min. Expect many *attention* readings: that is realistic, and it is the point.

### Mood

- **No official threshold exists for a single 1–5 question.** Moon-C's bands are a design choice: a low check-in starts a supportive reply and informs the medical officer.
- **Validated alternative: the WHO-5 Well-Being Index** [13]. It has 5 questions with a raw score of 0–25. A score below 13, or any item answered 0–1, means a professional should follow up. A weekly WHO-5 would replace guesswork with a validated screen.
- **In space.** NASA lists isolation and confinement and distance from Earth among the five hazards of spaceflight [16]. In the 520-day Mars-500 simulation (6 crew):
  - sleep and activity changed for most of the crew;
  - one crew member drifted to a 25-hour day;
  - one crew member reported low mood in 93% of mission weeks [14, 15].

  Messages from Mars take up to about 20 minutes each way, which is exactly the gap Moon-C is meant to cover.
- **Gap.** The keyword router has no words for self-harm or crisis yet (see next steps).

### Radiation

- **Official limits** [17] (NASA-STD-3001 Vol. 1 Rev C and Vol. 2):
  - career effective dose < 600 mSv for all ages and sexes [V1 4030];
  - < 250 mSv per solar particle event [V1 4031];
  - doses as low as reasonably achievable [V1 4029];
  - the vehicle must alert the crew when radiation is expected to exceed acceptable levels [V2 6100].
- **Typical backgrounds:**

  | Place | Daily dose | Dose rate |
  |---|---|---|
  | Earth | about 2.4 mSv/year [24] | ~0.3 µSv/h |
  | ISS | 0.2–0.5 mSv/day, effective dose [21] | 8–21 µSv/h |
  | Mars surface | 0.67 mSv/day [19] | ~28 µSv/h |
  | Lunar surface | 1,369 µSv/day [18] | ~57 µSv/h |
  | Cruise to Mars | 1.8 mSv/day [20] | ~75 µSv/h |

- **Solar particle events** multiply these within hours, and shielding works against them. For Orion, a simulated October 1989–like event peaked at 414 µGy/min at crew positions against 95 µGy/min inside the storm shelter [22]. Artemis II uses two alert tiers: caution first, then a recommendation to shelter. The thresholds are not public [23].
- **Moon-C thresholds (design choice, to be replaced by the habitat's flight rules):**
  - *normal ≤ 100 µSv/h*, above every nominal background, including deep space;
  - *attention 101–999*: above any normal background, from a solar event starting, a pass through the South Atlantic Anomaly or a shielding problem, so follow ALARA;
  - *urgent ≥ 1000 µSv/h* (1 mSv/h): more than 13 times the deep-space background. At that rate the crew gets a full day of deep-space dose in under 2 hours, so go to the shelter.

## Spaceflight effects Moon-C cannot measure (yet)

| Effect | What happens | How it reaches Moon-C |
|---|---|---|
| Return to gravity | Dizziness or fainting on standing after landing; for Mars, after 6–9 months with no ground support [26] | Heart rate and blood pressure; "dizzy" opens the feeling-unwell guidance and "about to faint" the fainting protocol |
| Vision changes (SANS) | Swelling at the back of the eye: about 64% show it on OCT, 15% have retinal folds, 26% have globe flattening [32] | Not measurable; changes in vision should be reported to the medical officer |
| Bone loss | 1–1.5% of hip and spine density per month [33]; incomplete recovery 1 year later [34] | Not measurable; NASA tracks a related risk of kidney stones |
| Space motion sickness | Nearly 70% of astronauts and cosmonauts are affected during their first days of flight [35] | "I feel sick" opens the feeling-unwell guidance |
| Blood clots in the neck | Stagnant flow in 6 of 11 crew; 1 clot [28] | Not measurable |
| Cabin CO2 | Headaches above about 3 mmHg [30] | Respiratory rate; several crew with symptoms at once |
| Lunar dust | Apollo crews reported "hay fever"-like eye and nose irritation; NASA's limit is 0.3 mg/m³ for a 6-month stay [36] | Not measurable |
| Partial gravity | Moon 1/6 g, Mars 3/8 g [16]; no long-term human data (the longest Apollo surface stay was about 3 days) | Apply the microgravity notes until there is data |

## Known limitations

1. **NEWS2 was designed for adults in hospital, not healthy astronauts.** Moon-C uses its single-parameter thresholds, not its aggregate score.
2. **No activity context.** A reading during exercise is judged with resting ranges.
3. **Population ranges, not personal baselines.** Flight surgeons compare each astronaut with their own preflight values, and a clear change from one's usual value can matter even inside the normal band.
4. **Sensors.** Wrist temperature is not core temperature, and wrist or finger SpO2 has known accuracy limits.
5. **Mood** uses an unvalidated single question, and the chat has no crisis keywords.
6. **Radiation thresholds** are design choices, and Moon-C does not yet track the accumulated mission dose.
7. **Partial gravity:** almost nothing is known yet about how 1/6 g or 3/8 g changes these values.

## Recommended next steps

1. **Medical review** of `protocols.json` by a flight surgeon or physician, recorded in `review_status`.
2. **Personal baselines** per crew member in `crew.json`, with an alert on deviation from one's own normal.
3. **Activity context** (exercise sessions, EVA) so exercise does not raise false alarms.
4. **NEWS2-style aggregate** across the live signs: 5 or more for an urgent review, 7 or more for an emergency.
5. **Standing test after landing** using the consensus criteria [27].
6. **Weekly WHO-5**, plus crisis keywords and a mental-health support protocol.
7. **Accumulated radiation dose** against the 600 mSv career limit, with backgrounds per habitat.

## References

1. Kusumoto FM, et al. *2018 ACC/AHA/HRS Guideline on the Evaluation and Management of Patients With Bradycardia and Cardiac Conduction Delay.* J Am Coll Cardiol 2019;74:e51–e156. doi:10.1016/j.jacc.2018.10.044. ACC press release (normal 50–100 bpm): <https://www.acc.org/about-acc/press-releases/2018/11/06/13/31/societies-publish-new-guidance-for-the-treatment-of-slow-irregular-heartbeats>
2. Royal College of Physicians. *National Early Warning Score (NEWS) 2: Standardising the assessment of acute-illness severity in the NHS.* London: RCP, 2017. <https://www.rcp.ac.uk/resources/national-early-warning-score-news-2/>
3. CDC. *Heat-related illness: warning signs and symptoms* (heat stroke: 103 °F or higher). <https://cdc.gov/natural-disasters/media/pdfs/2026/09/Heat_Related_Illness-NEWLOGO.pdf>
4. Stahn AC, et al. *Increased core body temperature in astronauts during long-duration space missions.* Sci Rep 2017;7:16180. <https://pmc.ncbi.nlm.nih.gov/articles/PMC5701078>
5. World Health Organization. *Pulse Oximetry Training Manual.* Geneva: WHO, 2011. <https://medbox.org/document/pulse-oximetry-training-manual>
6. O'Driscoll BR, et al. *BTS guideline for oxygen use in adults in healthcare and emergency settings.* Thorax 2017;72(Suppl 1):ii1–ii90.
7. *2025 AHA/ACC/AANP/AAPA/ABC/ACCP/ACPM/AGS/AMA/ASPC/NMA/PCNA/SGIM Guideline for the Prevention, Detection, Evaluation and Management of High Blood Pressure in Adults.* Hypertension 2025;82:e212–e316. doi:10.1161/HYP.0000000000000249. AHA chart: <https://heart.org/bplevels>
8. NHS. *Low blood pressure (hypotension).* <https://www.nhs.uk/conditions/low-blood-pressure-hypotension/>
9. Watson NF, et al. *Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and SRS.* Sleep 2015;38(6):843–844. <https://www.aasm.org/resources/pdf/adultsleepdurationconsensus.pdf>
10. NASA OCHMO. *NASA-STD-3001 Technical Brief: Sleep Accommodations* (Rev A, 2021). <https://www.nasa.gov/wp-content/uploads/2023/03/sleep-accomodations-technical-brief-ochmo.pdf>
11. Dawson D, McCulloch K. *Managing fatigue: it's about sleep.* Sleep Med Rev 2005;9(5):365–380. <https://pubmed.ncbi.nlm.nih.gov/16099184/>
12. Barger LK, et al. *Prevalence of sleep deficiency and use of hypnotic drugs in astronauts before, during, and after spaceflight.* Lancet Neurol 2014;13(9):904–912. doi:10.1016/S1474-4422(14)70122-X
13. Topp CW, et al. *The WHO-5 Well-Being Index: a systematic review of the literature.* Psychother Psychosom 2015;84(3):167–176.
14. Basner M, et al. *Mars 520-d mission simulation reveals protracted crew hypokinesis and alterations of sleep duration and timing.* PNAS 2013;110(7):2635–2640.
15. Basner M, et al. *Psychological and behavioral changes during confinement in a 520-day simulated interplanetary mission to Mars.* PLoS ONE 2014;9(3):e93298. doi:10.1371/journal.pone.0093298
16. NASA Human Research Program. *The five hazards of human spaceflight.* <https://www.nasa.gov/hrp/hazards>
17. NASA. *NASA-STD-3001 Volume 1, Revision C* (2023) <https://standards.nasa.gov/sites/default/files/standards/NASA/C//nasa-std-3001-vol-1-rev-c-signature.pdf> and *OCHMO-TB-020 Design for Ionizing Radiation Protection* (Rev E, 2022) <https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf>
18. Zhang S, et al. *First measurements of the radiation dose on the lunar surface.* Sci Adv 2020;6(39):eaaz1334.
19. Hassler DM, et al. *Mars' surface radiation environment measured with the Mars Science Laboratory's Curiosity rover.* Science 2014;343(6169):1244797. SwRI summary (0.67 mSv/day): <https://www.swri.org/press-release/swri-scientists-publish-first-radiation-measurements-surface-mars>
20. Zeitlin C, et al. *Measurements of energetic particle radiation in transit to Mars on the Mars Science Laboratory.* Science 2013;340(6136):1080–1084.
21. Simonsen L, et al. (NASA). ISS effective dose 0.2–0.5 mSv/day; draft paper, 2025. <https://ntrs.nasa.gov/api/citations/20250006168/downloads/ASCEND%20Simonsen%20draft%201.pdf>
22. *Space radiation measurements during the Artemis I lunar mission.* Nature 2024. doi:10.1038/s41586-024-07927-7
23. NASA. *To protect Artemis II astronauts, NASA experts keep their eyes on the sun* (2026). <https://phys.org/news/2026-03-artemis-ii-astronauts-nasa-experts.html>
24. UNSCEAR, via the Canadian Nuclear Safety Commission: worldwide natural background about 2.4 mSv/year. <https://www.cnsc-ccsn.gc.ca/eng/resources/fact-sheets/natural-background-radiation/>
25. Norsk P, et al. *Fluid shifts, vasodilatation and ambulatory blood pressure reduction during long duration spaceflight.* J Physiol 2015;593(3):573–584. <https://pmc.ncbi.nlm.nih.gov/articles/PMC4324706/>
26. Lee SMC, et al. *Orthostatic intolerance after ISS and Space Shuttle missions.* Aerosp Med Hum Perform 2015;86(12 Suppl):A54–A67. <https://pubmed.ncbi.nlm.nih.gov/26630196/>
27. Freeman R, et al. *Consensus statement on the definition of orthostatic hypotension, neurally mediated syncope and the postural tachycardia syndrome.* Clin Auton Res 2011;21(2):69–72. doi:10.1007/s10286-011-0119-5
28. Marshall-Goebel K, et al. *Assessment of jugular venous blood flow stasis and thrombosis during spaceflight.* JAMA Netw Open 2019;2(11):e1915011.
29. Prisk GK, et al. *Pulmonary gas exchange and its determinants during sustained microgravity on Spacelabs SLS-1 and SLS-2.* J Appl Physiol 1995;79(4):1290–1298.
30. NASA OCHMO. *OCHMO-TB-004 Carbon Dioxide.* <https://www.nasa.gov/wp-content/uploads/2023/12/ochmo-tb-004-carbon-dioxide.pdf>
31. Conkin J, et al. *Designing an Exploration Atmosphere Prebreathe Protocol* (NASA, 2015) <https://ntrs.nasa.gov/citations/20140012830>; Norcross JR, et al. *Evidence Report: Risk of Hypobaric Hypoxia from the Exploration Atmosphere* (NASA, 2015) <https://ntrs.nasa.gov/citations/20150021491>
32. Brunstetter TJ, et al. *Spaceflight Associated Neuro-Ocular Syndrome (SANS): 2023 Clinical Update.* NASA HRP Investigators' Workshop 2023. <https://ntrs.nasa.gov/citations/20220014606>
33. LeBlanc A, et al. *Bone mineral and lean tissue loss after long duration space flight.* J Musculoskelet Neuronal Interact 2000;1(2):157–160.
34. Gabel L, et al. *Incomplete recovery of bone strength and trabecular microarchitecture at the distal tibia 1 year after return from long duration spaceflight.* Sci Rep 2022;12:9446.
35. Lackner JR, DiZio P. *Space adaptation syndrome: multiple etiological factors and individual differences* (1991). <https://ntrs.nasa.gov/citations/20040089364>
36. NASA OCHMO. *Lunar Dust technical brief* (OCHMO-TB-011) <https://www.nasa.gov/wp-content/uploads/2023/03/lunar-dust-technical-brief-ochmo.pdf>; LADTAG exposure limit: <https://ntrs.nasa.gov/citations/20150016031>
37. Transport Canada. *Fatigue risk management for employees.* <https://tc.canada.ca/en/aviation/commercial-air-services/fatigue-management-aviation/fatigue-risk-management-employees>
