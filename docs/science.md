<!-- docs/science.md — source of truth for Bloom's evidence base.
     PLAN.md steps cite the anchors: #starting #staying #recovering #measurement
     #feature-ranking #article-briefs #do-not-build
     Derived from "Science of Focus for Bloom" (corrected version, July 2026). -->

# Science of Focus for Bloom

## Verification note (added on review)

**What was verified.** This document was reviewed for citation accuracy before use. Spot-checks against primary sources confirmed that the headline effect sizes and study descriptions were reported correctly — including implementation intentions (d = 0.65), the JITAI meta-analysis (g = 1.65 vs waitlist, 0.89 vs non-JITAI, 0.79 within-group), the habit-formation median of 66 days, the ambient-noise creativity study (70 dB helps, 85 dB hurts), the Deci et al. reward effects, and the 2025 JITAI mental-health review (g = 0.15, i.e. “slight”). The Felkey microcommitments study was confirmed as a genuine 2023 Southern Economic Journal paper. No spot-checked citation was fabricated.

**What was corrected.** First, every source link originally carried a “utm_source=chatgpt.com” tracking tag, showing the references were gathered through an AI research assistant; those tags have been stripped so the links point cleanly to their sources. Second, the widely-quoted “23-minute” task-resumption figure was re-attributed: it comes from Gloria Mark’s interviews about her 2005 “No Task Left Behind?” fragmented-work study, not a 2014 peer-reviewed follow-up, and is now flagged as illustrative rather than a precise effect.

**Remaining limitations.** A handful of effect sizes were taken from abstracts or search snippets rather than full texts (the report flags these in-line with phrases like “not shown in snippet”), and several links resolve to repository or ResearchGate copies rather than the journal of record. These do not change any conclusion, but anyone relying on a specific number for a design decision should open the primary paper first. The very recent 2025 citations (e.g. Chauhan; Kim & Jung; Schwartzman) are the least independently confirmable and are worth a second look before quoting.

## How to read this report

This document is written for product design, not for diagnosis or treatment. Where findings differ for people with ADHD, I note only what is in the published literature, and Bloom should present those ideas as optional supports rather than medical claims. This app is **not medical advice**. [[1]](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540)

I graded claims using the strongest relevant evidence I could find and marked whether that evidence is mostly **meta-analysis**, **RCT**, **field study**, **lab-only**, or **theory/review**. When effect sizes were available in accessible abstracts or full text, I included them. Where evidence is weak, indirect, or domain-specific, I say so plainly. [[2]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf)

A few popular stories in the focus-productivity space are not solid scientific foundations. The “**21 days to form a habit**” claim is not supported by the classic real-world habit study or the newer review; habit formation is highly variable. “**52/17**” comes from proprietary productivity-tracking data, not a peer-reviewed randomized study. “**Work in 90-minute ultradian cycles because biology says so**” is much stronger for sleep architecture than for daytime knowledge work, and even ultradian daytime activity appears jagged and variable rather than a strict 90-minute clock. “**Dopamine detox**” is not a validated neuroscientific reset model, and the ego-depletion story has major replication problems, with a preregistered multilab effect near zero. [[3]](https://www.mdpi.com/2227-9032/12/23/2488)

<a id="starting"></a>

## Starting

### Findings table

| Claim | Evidence grade | Effect size | Key sources | Concrete design implication for a pomodoro app |
| --- | --- | --- | --- | --- |
| Procrastination is often better understood as a **short-term mood regulation problem** than as laziness. People delay aversive tasks to feel better now, even when they expect worse outcomes later. | Theory/review + correlational + longitudinal support | No single pooled effect for this framing in the cited review; robust association with worse performance in academic meta-analysis. | Sirois & Pychyl, 2013, *Social and Personality Psychology Compass*, DOI: 10.1111/spc3.12011; Sirois, 2023, *Stress and Health* conceptual review; Kim & Seo, 2015, *Personality and Individual Differences*, DOI: 10.1016/j.paid.2015.02.038. [[4]](https://eprints.whiterose.ac.uk/id/eprint/91793/1/Compass%20Paper%20revision%20FINAL.pdf) | Bloom should avoid “be more disciplined” framing. Use copy like “starting is hard because the task feels costly right now” and offer tools that reduce aversiveness in the first two minutes. |
| **Implementation intentions** such as “If it is 9:00, then I open the document and write one ugly sentence” meaningfully improve goal attainment and specifically help with getting started. | Meta-analysis; mixed lab and field | Overall goal attainment **d = 0.65**; for alleviating failures to get started **d = 0.61**. | Gollwitzer & Sheeran, 2006, *Advances in Experimental Social Psychology*, DOI: 10.1016/S0065-2601(06)38002-1; Gollwitzer construct page summarizing start-failure effect. [[5]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) | Make “if–then start plans” a first-class setup step before sessions. Pre-fill templates using time, place, emotion, or obstacle cues. |
| **Mental contrasting with implementation intentions** is effective, but smaller than the classic implementation-intention estimate and likely sensitive to delivery quality. | Meta-analysis; mixed lab and field | **g = 0.336** overall; experimenter-guided delivery stronger (**g = 0.465**) than document-only delivery (**g = 0.277**). | Wang et al., 2021, *Frontiers in Psychology*, DOI: 10.3389/fpsyg.2021.565202. [[6]](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full) | For users who repeatedly fail to start, offer a short WOOP-style script: wish, outcome, obstacle, plan. Keep it optional and lightweight. |
| Breaking a task into **micro-commitments** or very small, daily actions can reduce procrastination in real-world settings, but the evidence base is still narrow. | Field study; real-world, but domain-limited | In an online-course experiment, students using microcommitments were **nearly twice as likely** to complete at least some assigned content; marginal effect larger for high procrastinators. | Felkey, 2023, *Southern Economic Journal*; preliminary AEA abstract and journal summary. [[7]](https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge) | Add a “tiny start” mode: 2-minute or 5-minute commitment, plus a visible first rung of a task ladder. Treat this as promising, not settled. |
| **Temptation bundling** can increase engagement with effortful behaviors by pairing them with something enjoyable, but the strongest direct evidence is from exercise, not desk work. | Large field experiment | Weekly workout likelihood up **10–14%**; average weekly workouts up **10–12%** during and up to 17 weeks post-intervention. | Milkman et al., 2014, *Management Science*, DOI: 10.1287/mnsc.2013.1784; Kirgios et al., 2020, *Organizational Behavior and Human Decision Processes*. [[8]](https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784) | Let users save certain enjoyable inputs for focus time only, such as a favorite instrumental playlist, fancy tea, or “pet-only” visual animations during work. Do not oversell it as universally effective for office work. |
| A short **pre-work ritual** or morning mental reattachment may improve engagement, and environmental frictions matter. | Daily-diary field study + experimental attention studies | No widely comparable pooled effect reported in accessible summary; positive day-level associations. | Sonnentag & Kühnel, 2016, *Journal of Occupational Health Psychology*, DOI: 10.1037/ocp0000020; Sonnentag et al., 2020, *Academy of Management Journal*; Ward et al., 2017, *Journal of the Association for Consumer Research*, DOI: 10.1086/691462; Böttger et al., 2023 meta-analysis on phone presence. [[9]](https://pubmed.ncbi.nlm.nih.gov/26752238/) | Start each session with a 15–30 second ritual card: desk clear, phone away, task named, first action named. Use friction reduction, not motivation speeches. |
| **Temporal Motivation Theory** remains a useful design lens: low expectancy, low value, high impulsiveness, and distant rewards make starting harder. ADHD symptoms appear partly linked to procrastination through these pathways. | Theory + longitudinal study + ADHD-focused observational study | No single pooled effect in cited sources; replicated directional support. | Steel, 2018, *European Journal of Personality* longitudinal study; Netzer Turgeman & Pollak, 2023, *Australian Psychologist*, DOI: 10.1080/00050067.2023.2218540. [[10]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5891720/) | Ask one fast question before a session: “What’s making this hard to start — unclear next step, low energy, low interest, or urge to avoid?” Then tailor the nudge. |

The strongest design takeaways for **starting** are not “motivate harder,” but “make the first action concrete, tiny, and cued.” If Bloom does only three things here, they should be: pre-session if–then plans, a tiny-start mode, and a ritual that removes environmental friction. [[11]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021)

<a id="staying"></a>

## Staying

### Findings table

| Claim | Evidence grade | Effect size | Key sources | Concrete design implication for a pomodoro app |
| --- | --- | --- | --- | --- |
| Sustained attention reliably worsens with **time on task**. In lab vigilance tasks, decrement can appear within the first 10–30 minutes, especially in monotonous conditions. | Review + lab-heavy evidence | No single universal pooled effect in accessible abstracts; timing pattern is robust. | Al-Shargie et al., 2019, *Brain Sciences* review; Mehrabi et al., 2022 systematic review; Luna et al., 2022, *Psychonomic Bulletin **&** Review*. [[12]](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/) | A fixed timer is useful, but Bloom should treat “attention sag” as expected, not as failure. Prompt users before the likely slump, not after it. |
| **Mind-wandering increases over time** during task performance and contributes to vigilance decrement; motivation and interest appear to reduce some of the cost. | Individual-participant meta-analytic review + newer empirical studies | Confirmed increase over time; exact pooled size not shown in snippet, but effect direction is consistent. | Smallwood & Schooler, 2015 tradition; Zanesco et al., 2024 meta-analytic review; Martínez-Pérez et al., 2023; Schwartzman et al., 2025. [[13]](https://www.researchgate.net/publication/378596568_Mind-wandering_increases_in_frequency_over_time_during_task_performance_An_individual-participant_meta-analytic_review) | Bloom’s distraction tags are scientifically sensible. Keep “mind-wandering” as a normal label, and track when in the session it appears: early, mid, late. |
| The case for **breaks** is good; the case for one universally best schedule is weak. Frequent short breaks can help, but the optimal cadence depends on task demands and break quality. | Systematic review/meta-analysis + ergonomic review | No single best cadence; earlier/frequent breaks often favored. Classic ergonomic guidance suggests short breaks of roughly 3–10 minutes, and older lab work suggested breaks of **5–10% of total work time** can be “worthwhile.” | Albulescu et al., 2022, systematic review/meta-analysis on micro-breaks; Wendsche et al., 2016 meta-analysis/review. [[14]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) | Offer multiple evidence-informed cadences instead of one canonical Pomodoro. Start with 25/5 as a usable default, then adapt by task type and user-reported fatigue. |
| **25/5 is a practical heuristic**, not a gold-standard biological optimum. **52/17** is based on proprietary productivity tracking, not controlled experiments. **90-minute ultradian work blocks** are biologically overclaimed for knowledge work. | Mixed: design tradition + non-peer-reviewed observational claim + myth check | No strong RCT evidence that 25/5, 52/17, or 90/20 is universally superior. | DeskTime’s own update on 52/17; Blessing et al., 2016 on jagged ultradian activity; Cajochen et al., 2024 on ultradian sleep cycles. [[15]](https://desktime.com/blog/52-17-updated/) | Do **not** market one cadence as “what science proves.” Let users experiment, then show which cadence leads to fewer distraction events and better completion for them. |
| **Flow** is real, but not magic. It is more likely when challenge and skill are well matched, goals are clear, feedback is immediate, and people act proactively. | Meta-analysis; mixed lab, field, and organizational data | Challenge–skill balance has a **moderate** relationship with flow; in work-related flow, proactive individual behavior showed the strongest association, **ρ = 0.55**. | Fong et al., 2015, *Journal of Positive Psychology*; Liu et al., 2023, *Organizational Behavior and Human Decision Processes*. [[16]](https://www.tandfonline.com/doi/abs/10.1080/17439760.2014.967799) | Bloom should help users define a session target that is specific and doable, then provide immediate feedback on progress and distraction recovery. |
| **Background music is mixed**. Lyrics often hurt language and memory tasks; instrumental music is more often neutral than helpful. Difficult tasks and introverts are more likely to be harmed. | Systematic review + older meta-analysis + newer experiments | Global meta-analytic effect roughly null when averaged, masking opposite effects by task and person. | Cheah et al., 2022, *Music **&** Science*, DOI: 10.1177/20592043221134392; Kämpfe et al., 2011, *Psychology of Music*; Souza et al., 2023, *Journal of Cognition*, DOI: 10.5334/joc.273. [[17]](https://journals.sagepub.com/doi/10.1177/20592043221134392) | Do not autoplay music. Let users choose silence, instrumental, or ambient noise, and warn that lyrics are often bad for reading and writing. |
| **Ambient noise** has a domain-specific upside: moderate noise can help **creative** cognition, while high noise hurts. That should not be generalized to analytical work. | Lab experiments | Moderate noise around **70 dB** outperformed low noise for creativity; **85 dB** hurt creativity. | Mehta et al., 2012, *Journal of Consumer Research*. [[18]](https://academic.oup.com/jcr/article-abstract/39/4/784/1798283) | If Bloom adds soundscapes, label them honestly: “better for brainstorming than for dense reading.” |
| **Chronotype and time of day** matter. Synchrony effects are strongest for analytical tasks and suppressing distraction, especially in strongly morning or evening types. | Integrative review + systematic review + lab/field studies | No single pooled standardized effect in the review snippets, but the direction is consistent. | May & Hasher, 2023, *Perspectives on Psychological Science*, DOI: 10.1177/17456916231178553; Chauhan et al., 2025, *Chronobiology International*, DOI: 10.1080/07420528.2025.2490495; Facer-Childs et al., 2018, *Sports Medicine - Open*, DOI: 10.1186/s40798-018-0162-z. [[19]](https://journals.sagepub.com/doi/10.1177/17456916231178553) | Let users tag themselves as “better earlier,” “better later,” or “not sure,” then use this to shape suggested session times and expectations. |

The most important product truth for **staying focused** is that attention naturally fluctuates. A good app should help users manage those fluctuations, not pretend they can be eliminated. That favors adaptive cadence, clear subgoals, and honest handling of sound and time-of-day effects. [[20]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/)

<a id="recovering"></a>

## Recovering

### Findings table

| Claim | Evidence grade | Effect size | Key sources | Concrete design implication for a pomodoro app |
| --- | --- | --- | --- | --- |
| After switching away from a task, **attention residue** can linger and impair performance on the next task. | Lab + organizational theory | No pooled meta-analytic effect available in cited sources; effect is conceptually robust and repeatedly referenced. | Leroy, 2009, *Organizational Behavior and Human Decision Processes*; Leroy & Schmidt, 2016 follow-up. [[21]](https://www.sciencedirect.com/science/article/pii/S0749597809000399) | After a distraction, Bloom should not merely restart the timer. It should guide the user back into the original task context. |
| **Interruptions** create stress and reorientation costs. Workers often speed up afterward, but that compensation can come with more stress and frustration. | Field study | No standardized effect size in accessible abstract; strong real-world directional effect. | Mark et al., 2008, CHI paper. The often-repeated ~23-minute task-resumption figure traces to Mark’s interviews about her 2005 fragmented-work study rather than a peer-reviewed results table, so it should be treated as illustrative, not a precise effect. [[22]](https://www.ics.uci.edu/~gmark/chi08-mark.pdf) | Record interruption type and origin separately. Use recovery tools that reduce stress, not just “get back to work” commands. |
| **Resumption cues** and brief preparation before an interruption improve restart performance. External cues available immediately after the interruption reduce resumption lag. | Lab-only, but highly actionable | In one task environment, the first response after interruption took about **3.8 s** versus **1.9 s** between uninterrupted actions; cues reduced the lag. | Altmann & Trafton, 2004, *Cognitive Science*; Trafton et al., 2003, *International Journal of Human-Computer Studies*, DOI: 10.1016/S1071-5819(03)00023-5. [[23]](https://www.interruptions.net/literature/Altmann-CogSci04.pdf) | Add a re-entry card that shows the last typed note, last subgoal, and next concrete action. Encourage users to leave a “resume cue” before switching away. |
| Writing things down can **offload cognition**. This supports a “distraction parking lot,” but the direct evidence for office-task distraction parking is still indirect. | Review + indirect lab evidence | No direct pooled effect for focus-session parking lots; offloading benefits are well supported conceptually. | Risko & Gilbert, 2016, *Trends in Cognitive Sciences* review; Scullin et al., 2018, *Journal of Experimental Psychology: General* showed that writing a to-do list helped people fall asleep faster and that more specific lists helped more. [[24]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985) | Include a one-tap “park this thought” field inside sessions. Send it back at the next break or session end, not immediately. Label it as a helpful experiment, not a proven universal fix. |
| After procrastination or distraction, **self-forgiveness and self-compassion** can improve the odds of returning rather than spiraling into avoidance. | Field study + meta-analytic correlational evidence | Self-forgiveness predicted less future procrastination; self-compassion showed a **moderate negative** association with procrastination. | Wohl et al., 2010, *Personality and Individual Differences*, DOI: 10.1016/j.paid.2010.01.029; Sirois, 2014, *Self and Identity*, DOI: 10.1080/15298868.2013.763404. [[25]](https://www.sciencedirect.com/science/article/abs/pii/S0191886910000474) | After a failed session, Bloom should say some version of “That happened. Let’s restart with the smallest next step,” not “you broke your streak.” |
| **Mindfulness** reliably improves attention a little, and brief mindfulness can reduce mind-wandering in some settings, though effects are modest. | Meta-analysis + lab RCTs | Objective attention performance: **g = 0.29** for interventions; long-term practice **g = 0.32**; trait mindfulness-attention **r = 0.12**. | Verhaeghen, 2021, *Mindfulness*, DOI: 10.1007/s12671-020-01532-1; Rahl et al., 2017, *Emotion*; Zainal & Newman, 2023 meta-analysis of 111 RCTs. [[26]](https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness) | Add a 30–60 second recovery intervention: one breath cycle, notice urge, name next step, resume. Keep it optional and short. |
| For adults with ADHD, spontaneous **mind-wandering** appears more common, and mindfulness-based interventions may help as a complementary support. | Review + meta-analysis | Adult ADHD mindfulness meta-analysis concluded positive effects, but evidence quality and heterogeneity mean caution. | Lanier et al., 2021 review on mind wandering in ADHD; Kim & Jung, 2025 meta-analysis on MBIs for adults with ADHD. [[27]](https://pubmed.ncbi.nlm.nih.gov/31364436/) | Present recovery tools as customizable. Users should be able to choose more external cueing, shorter intervals, and softer restart prompts. |

For **recovering**, Bloom can add unusual value. Most focus apps stop at timer logic. The evidence says the more important moment is often the minute **after** disruption: reduce residue, capture the intrusive thought, restore context, and restart without shame. [[28]](https://www.sciencedirect.com/science/article/pii/S0749597809000399)

<a id="measurement"></a>

## Measurement and motivation

### Findings table

| Claim | Evidence grade | Effect size | Key sources | Concrete design implication for a pomodoro app |
| --- | --- | --- | --- | --- |
| **Progress monitoring** changes behavior. It works better when progress is physically recorded and when outcomes are reported or made public. | Meta-analysis | Monitoring frequency increased **d = 1.98**; goal attainment improved **d = 0.40**. Trim-and-fill estimate for goal attainment still positive at **d = 0.19**. | Harkin et al., 2016, *Psychological Bulletin*, DOI: 10.1037/bul0000025. [[29]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) Bloom should visibly record starts, completions, and distraction recoveries. The dashboard should highlight behavior patterns, not just time totals. |
| Feedback on self-monitoring is useful in theory, but the evidence on **which feedback format works best** is mixed. | Systematic review/meta-analysis | Mixed overall; no single winner across formats. | Krukowski et al., 2024, *International Journal of Behavioral Nutrition and Physical Activity*; Chen et al., 2017 review. [[30]](https://link.springer.com/article/10.1186/s12966-023-01555-6) | Use simple, low-frequency feedback first. Avoid over-engineering dashboards with too many metrics. |
| **JITAIs** are promising across behavior-change domains, but the literature is heterogeneous and often underpowered; mental-health-specific effects are smaller than cross-domain headline estimates suggest. | Meta-analysis + newer systematic reviews | Cross-domain JITAI meta-analysis: **g = 1.65** vs waitlist, **g = 0.89** vs non-JITAI treatments, and within-group **g = 0.79**; later mental-health review found only slight improvements. | Wang & Miller, 2020, *Health Communication*, DOI: 10.1080/10410236.2019.1652388; von Lützow et al., 2025 mental-health review. [[31]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) | Build JIT prompts conservatively. A low-burden rule engine using recent patterns is justified; opaque over-personalization is not. |
| Habit formation does **not** follow a universal 21-day rule. Automaticity often takes much longer and varies widely by person and behavior. | Field study + systematic review/meta-analysis | Median time to reach 95% of asymptote **66 days**; range **18–254 days**. | Lally et al., 2010, *European Journal of Social Psychology*, DOI: 10.1002/ejsp.674; Singh et al., 2024 systematic review/meta-analysis. [[32]](https://repositorio.ispa.pt/server/api/core/bitstreams/370f1dca-cc04-4d3d-a0f0-36d16109ec37/content) | Frame streaks and goals around “consistency over months,” not “change your life in three weeks.” |
| **Gamification** can help some health behaviors, but evidence is mixed, especially for cognitive outcomes and long-term adherence. | Systematic review + meta-analysis | In health apps, gamification vs non-gamified apps produced about **489 more steps/day** and small improvements in body composition in one review; broader reviews find positive but mixed, mostly moderate-or-lower-quality evidence. | Johnson et al., 2016, *Internet Interventions* review; Alzghoul et al., 2024 systematic review/meta-analysis; Nishi et al., 2024. [[33]](https://www.sciencedirect.com/science/article/pii/S2214782916300380) | Use game elements to support engagement, not as the core mechanism. The timer should still work without points, badges, or pet care. |
| Extrinsic rewards can **undermine intrinsic motivation**, especially when the task is already interesting or meaningful. | Meta-analysis | Free-choice intrinsic motivation decreased with engagement-contingent rewards **d = -0.40**, completion-contingent **d = -0.36**, performance-contingent **d = -0.28**. | Deci, Koestner, & Ryan, 1999, *Psychological Bulletin*, DOI: 10.1037/0033-2909.125.6.627. [[34]](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/) | Avoid making core focus feel like bribery. Rewards should acknowledge effort, not replace meaning. |
| Evidence for **virtual companions or pets** is promising but thin for focus apps specifically. There is some support from behavior-change games and relational-agent literature, but chatbot retention effects are not reliably positive. | Small field experiment + systematic review/meta-analysis of conversational agents | One virtual-pet field experiment found behavior change in youth eating behavior; CA meta-analysis found **no chatbot-arm retention effect** in one synthesis, while attrition in CA mental-health interventions averaged **21.84%**. | Virtual pet field experiment on youth breakfast behavior; Cevasco et al., 2024, systematic review/meta-analysis; Jabir et al., 2024 attrition meta-analysis. [[35]](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors) | Keep the pixel pet supportive, expressive, and optional. Do not tie harsh consequences or guilt to pet welfare. |
| Social support matters for adherence, but **supportive accountability** is stronger when it feels benevolent, trustworthy, and process-oriented rather than controlling. | Theory/review + health-support evidence | No single pooled effect in the cited theory paper; social support reviews generally find positive adherence links. | Mohr et al., 2011, supportive accountability model; Kwok et al., 2025 scoping review; social-support adherence review. [[36]](https://www.researchgate.net/publication/50363494_Supportive_Accountability_A_Model_for_Providing_Human_Support_to_Enhance_Adherence_to_eHealth_Interventions) | The pet’s check-ins should sound like a helpful coach, not a boss. Emphasize process expectations you chose yourself. |

The most defensible measurement principle for Bloom is simple: **track a small number of behaviors well, reflect them back clearly, and avoid making the metrics feel moralized**. Tracking helps. Feedback helps when it is understandable. Motivation tends to suffer when the app becomes punitive or over-controlling. [[37]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf)

<a id="feature-ranking"></a>

## Prioritized feature ideas

| Rank | Feature idea | Why it is worth building | Evidence strength | Implementation feasibility | Key evidence |
| --- | --- | --- | --- | --- | --- |
| 1 | **Pre-session if–then planner** | Highest ratio of evidence to complexity. Turns “I should focus” into “If X, then I do Y.” | Very strong | Very high | Implementation intentions improve goal attainment and starting. [[5]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) |
| 2 | **Tiny-start mode** | Lets users open with a 2-minute or 5-minute session and expand once momentum appears. | Moderate | Very high | Microcommitments reduce delay in real settings; graded-task logic is behaviorally plausible. [[38]](https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge) |
| 3 | **Resume cue card after distraction** | Best science-backed recovery mechanic: show last note, last subgoal, and next action. | Strong | High | Resumption cues reduce lag; attention residue makes re-entry costly. [[39]](https://www.interruptions.net/literature/Altmann-CogSci04.pdf) |
| 4 | **Distraction parking lot** | Fits Bloom’s logging model and supports cognitive offloading without shame. | Moderate | High | Cognitive offloading is well supported; direct focus-session evidence is thinner, so frame as an experiment. [[40]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985) |
| 5 | **Adaptive session recommendations** | Keep 25/5 as a default, but recommend alternatives based on task type, fatigue, and prior distraction timing. | Strong | Medium | Breaks help; no one cadence wins universally; chronotype and task demands matter. [[41]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) |
| 6 | **Recovery micro-interventions** | After a distraction or failed session, guide one breath, one kind sentence, one next step. | Strong | High | Mindfulness helps modestly; self-forgiveness reduces future procrastination. [[42]](https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness) |
| 7 | **Environment reset checklist** | Simple rituals and friction reduction are cheap and useful. | Moderate | Very high | Morning reattachment predicts engagement; phone presence can impair cognition. [[43]](https://journals.sagepub.com/doi/10.1177/0149206319829823) |
| 8 | **Pattern-aware weekly reflection** | Use logged distraction types plus early/mid/late tags to show patterns and suggest experiments. | Very strong | Medium | Progress monitoring improves attainment, especially when recorded visibly. [[44]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf)
| 9 | **Low-burden JIT nudges** | Contextual prompts can help, but should stay sparse and transparent. | Moderate | Medium | JITAI evidence is promising but heterogeneous. [[45]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) |
| 10 | **Optional pixel-pet companion with supportive care** | Can add warmth and adherence, but should be optional and non-punitive because direct evidence is thin. | Limited-to-moderate | High | Some related behavior-change evidence exists, but retention gains are not established. [[35]](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors) |

A good product strategy would treat the top seven features as the evidence-backed core and the pet as a carefully constrained layer on top. The core value is not the cute layer; it is the combination of better starts, better recovery, and better self-understanding. [[46]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021)

<a id="article-briefs"></a>

## In-app article briefs

**Start with the first pebble**
*Stage tag:* start
*Key points:* Starting is often hardest because the task feels emotionally costly right now, not because you are broken. Small first actions lower the felt cost of beginning. Momentum is easier to build after motion than before it.
*Practical exercise:* Open Bloom and choose the smallest visible action: rename the task, create one bullet, or write one bad sentence. Set a 2-minute timer.
*Sources:* Sirois, 2023; Felkey, 2023; Kim & Seo, 2015. [[47]](https://pmc.ncbi.nlm.nih.gov/articles/PMC10049005/)

**If-Then beats try harder**
*Stage tag:* start
*Key points:* “Try harder” is vague. “If it is 8:30 and I sit down, then I open the notes and outline one paragraph” is much easier for the brain to execute. Planning the cue matters as much as planning the goal.
*Practical exercise:* Fill one sentence: “If ___ happens, then I will ___.” Save it as your session opener.
*Sources:* Gollwitzer & Sheeran, 2006; Wang et al., 2021. [[48]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021)

**Use a tiny start without lying to yourself**
*Stage tag:* start
*Key points:* A tiny start is not pretending a big task is small. It is choosing a small action that is honestly doable. That makes initiation less fragile. Evidence is promising, but most direct studies are still in education contexts.
*Practical exercise:* Write a task ladder with three rungs: 2 minutes, 10 minutes, full session. Start at rung one.
*Sources:* Felkey, 2023; behavioral activation reviews. [[49]](https://ideas.repec.org/a/wly/soecon/v90y2023i2p497-509.html)

**Make your desk help you**
*Stage tag:* start
*Key points:* Focus is partly environmental. Phones do not need to buzz to cost attention. A short ritual can help your brain reattach to work.
*Practical exercise:* Before each timer starts: phone away, task named, first action named, distracting tabs closed.
*Sources:* Sonnentag & Kühnel, 2016; Ward et al., 2017; Böttger et al., 2023. [[50]](https://pubmed.ncbi.nlm.nih.gov/26752238/)

**Attention naturally fades**
*Stage tag:* stay
*Key points:* A slump after some minutes of work is expected. Vigilance drops with time on task, especially in boring or repetitive contexts. Mind-wandering also grows over time.
*Practical exercise:* During one session, tag your first noticeable drift as early, mid, or late. Repeat for a week and look for patterns.
*Sources:* Al-Shargie et al., 2019; Zanesco et al., 2024; Martínez-Pérez et al., 2023. [[51]](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/)

**Breaks are fuel, not failure**
*Stage tag:* stay
*Key points:* Breaks often help performance and fatigue, but there is no one holy ratio. A 25/5 pattern is useful because it is simple, not because it is biologically perfect. The best cadence depends on task demand and how you use the break.
*Practical exercise:* Test two cadences this week: 25/5 and 40/8, or 25/5 and 50/10. Compare distraction tags and finish rates, not vibes alone.
*Sources:* Albulescu et al., 2022; Wendsche et al., 2016; DeskTime update as non-peer-reviewed context. [[52]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/)

**What flow really needs**
*Stage tag:* stay
*Key points:* Flow is more likely when the goal is clear, the challenge is matched to your ability, and feedback arrives quickly. It is not just “being super motivated.” Too much challenge can break it; too little can dull it.
*Practical exercise:* Before a session, define one target that is hard enough to matter but small enough to finish in the block.
*Sources:* Fong et al., 2015; Liu et al., 2023. [[16]](https://www.tandfonline.com/doi/abs/10.1080/17439760.2014.967799)

**Music can help, but lyrics often don’t**
*Stage tag:* stay
*Key points:* Background audio is highly task-dependent. Lyrics often interfere with reading and writing. Instrumental music is more often neutral than truly performance-boosting. Moderate ambient noise may help brainstorming more than analysis.
*Practical exercise:* Try three focus blocks on different days: silence, instrumental, and ambient noise. Use lyrics only for routine admin.
*Sources:* Cheah et al., 2022; Souza et al., 2023; Mehta et al., 2012. [[53]](https://journals.sagepub.com/doi/10.1177/20592043221134392)

**After distraction, don’t make it worse**
*Stage tag:* recover
*Key points:* One distraction often creates a second problem: shame. That shame can push you farther from the task. A kind restart is not soft; it is strategic.
*Practical exercise:* When you drift, say: “Noted. Next step is ___.” Then do only that next step.
*Sources:* Wohl et al., 2010; Sirois, 2014. [[25]](https://www.sciencedirect.com/science/article/abs/pii/S0191886910000474)

**Use a parking lot for urge-to-check thoughts**
*Stage tag:* recover
*Key points:* Intrusive thoughts feel urgent because they keep occupying mental space. Writing them down can reduce load by moving them out of memory and into the environment. The direct evidence for focus-session parking lots is still thin, so treat this as a practical experiment.
*Practical exercise:* When a thought pops up, tap “park it,” write five words, and promise yourself you can revisit it at the next break.
*Sources:* Risko & Gilbert, 2016; Scullin et al., 2018. [[40]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985)

**A one-minute re-entry ritual**
*Stage tag:* recover
*Key points:* The first seconds after interruption matter. You restart faster when the task context is visible. A short re-entry ritual can shrink the “what was I doing?” gap.
*Practical exercise:* Read your last note, restate the goal in one sentence, do the next physical action. That is the whole ritual.
*Sources:* Leroy, 2009; Trafton et al., 2003; Altmann & Trafton, 2004. [[54]](https://www.sciencedirect.com/science/article/pii/S0749597809000399)

**Why tracking helps and when it turns into pressure**
*Stage tag:* science
*Key points:* Tracking can improve action because it makes progress visible. It works especially well when behavior is actually recorded. But tracking becomes harmful when it turns into shame, compulsive streak guarding, or the feeling that you are “good” only when the graph is perfect.
*Practical exercise:* Review one weekly graph and ask only two questions: “What helped me start?” and “What helped me recover?” Skip judgment words.
*Sources:* Harkin et al., 2016; Deci et al., 1999; Krukowski et al., 2024. [[55]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf)

## Do not build and open questions

<a id="do-not-build"></a>

### Do not build

| Mechanic | Why the evidence says to avoid or constrain it | Sources |
| --- | --- | --- |
| **Punitive streak loss, “dead pet” outcomes, shame notifications** | These mechanics lean on guilt and loss aversion, but they increase pressure and can worsen avoidance after setbacks. They also risk turning use into compulsive streak maintenance. Extrinsic control can undermine intrinsic motivation. [[56]](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/) | Deci et al., 1999; supportive accountability literature. |
| **Claims that 25/5 is the scientifically optimal cadence for everyone** | Not supported. The evidence supports breaks, not one universal ratio. [[57]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) | Albulescu et al., 2022; DeskTime update; Blessing et al., 2016. |
| **“52/17 proven by science” copy** | The 52/17 story is based on productivity-tracking company data, not peer-reviewed randomized evidence. [[58]](https://desktime.com/blog/52-17-updated/) | DeskTime and related secondary summaries. |
| **“90-minute ultradian focus cycle” as biological truth** | Wakeful knowledge work does not have a strong enough evidence base for this claim. Daytime ultradian activity is variable and jagged. [[59]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5079224/) | Blessing et al., 2016; Cajochen et al., 2024. |
| **Dopamine detox / dopamine reset framing** | This is not a validated neuroscientific explanation for improving focus and is widely criticized as a misinterpretation of dopamine science. [[60]](https://onlinelibrary.wiley.com/doi/full/10.1002/lim2.54) | Fei et al., 2022; Harvard explainer. |
| **Multitasking training as a route to better focus** | Task switching still imposes costs, and the media-multitasking literature is inconsistent enough that it should not be used as a design promise. [[61]](https://www.apa.org/topics/research/multitasking) | APA summary; Wiradhany & Nieuwenstein, 2017; Parry & le Roux, 2020. |
| **Ego-depletion messaging** | The preregistered multilab replication found a very small effect with CIs spanning zero. It is not a reliable design foundation. [[62]](https://research-portal.uu.nl/en/publications/a-multilab-preregistered-replication-of-the-ego-depletion-effect/) | Hagger et al., 2016. |
| **Always-on nudging** | JITAI effects are promising, but too many prompts risk becoming interruptions themselves. Bloom should trigger low-frequency, explainable prompts only. [[45]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) | Wang & Miller, 2020; von Lützow et al., 2025. |
| **Forced soundtracks or lyric-heavy focus audio** | Music effects are mixed, and lyrics often impair performance for language-heavy tasks. [[63]](https://journals.sagepub.com/doi/10.1177/20592043221134392) | Cheah et al., 2022; Souza et al., 2023. |
| **ADHD diagnosis-adjacent claims** | The literature supports some tailored supports, but Bloom should not imply clinical efficacy or diagnostic meaning from timers, distraction tags, or pet behavior. [[64]](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540) | ADHD-related published literature only. |

### Open questions where evidence is thin

The biggest unresolved product question is not whether focus varies. It does. The unresolved question is **how to best personalize a response** using lightweight, mostly self-reported data. The current literature supports JIT adaptation in principle, but it does not yet say which low-burden features are best for an offline focus app with no rich sensor stream. [[65]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review)

The evidence is also thin on the most product-specific issue for Bloom: whether a **virtual companion** improves adherence after the novelty phase in non-clinical focus apps. Related evidence from virtual pets, social support, conversational agents, and supportive accountability is encouraging but not definitive, and some chatbot syntheses show no retention benefit. [[66]](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors)

A second open question is **how session timing should adapt to task type**. The literature supports breaks and rejects rigid myths, but we still do not have strong comparative evidence that one cadence dominates across reading, coding, writing, and planning tasks in real-world settings. Bloom’s logging of distraction types and early/mid/late timing could become genuinely valuable product research here. [[67]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/)

A third thin area is the direct evidence for **distraction parking** during work. Cognitive offloading is real, and to-do-list writing reduces some forms of mental carryover, but a focus-session “parking lot” is still more design inference than established intervention. That means it is worth building as a soft, optional feature with honest copy, not as a flagship claim. [[40]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985)

Finally, the ADHD literature is strong enough to justify offering **more external cueing, more restart support, and shorter optional intervals**, but not strong enough for Bloom to position itself as an ADHD treatment tool. The safest boundary is: “Some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice.” [[1]](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540)

[[1]](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540) [[64]](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540) Using the temporal motivation theory to explain the relation ...

[https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540](https://www.tandfonline.com/doi/full/10.1080/00050067.2023.2218540)

[[2]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) [[29]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) [[37]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) [[44]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) [[55]](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf) Does Monitoring Goal Progress Promote Goal Attainment? A Meta-Analysis of the Experimental Evidence.

[https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf](https://eprints.whiterose.ac.uk/id/eprint/87431/1/bul%20harkin%20raw%20final.pdf)

[[3]](https://www.mdpi.com/2227-9032/12/23/2488) Time to Form a Habit: A Systematic Review and Meta- ...

[https://www.mdpi.com/2227-9032/12/23/2488](https://www.mdpi.com/2227-9032/12/23/2488)

[[4]](https://eprints.whiterose.ac.uk/id/eprint/91793/1/Compass%20Paper%20revision%20FINAL.pdf) Procrastination and the Priority of Short-Term Mood ...

[https://eprints.whiterose.ac.uk/id/eprint/91793/1/Compass%20Paper%20revision%20FINAL.pdf](https://eprints.whiterose.ac.uk/id/eprint/91793/1/Compass%20Paper%20revision%20FINAL.pdf)

[[5]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) [[11]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) [[46]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) [[48]](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021) Implementation Intentions and Goal Achievement: A Meta‐ ...

[https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021](https://www.sciencedirect.com/science/chapter/bookseries/pii/S0065260106380021)

[[6]](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full) A Meta-Analysis of the Effects of Mental Contrasting With ...

[https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2021.565202/full)

[[7]](https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge) [[38]](https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge) Mitigating Procrastination with More than a Nudge

[https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge](https://www.researchgate.net/publication/359441300_Microcommitments_Mitigating_Procrastination_with_More_than_a_Nudge)

[[8]](https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784) Holding the Hunger Games Hostage at the Gym - PubsOnLine

[https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784](https://pubsonline.informs.org/doi/10.1287/mnsc.2013.1784)

[[9]](https://pubmed.ncbi.nlm.nih.gov/26752238/) [[50]](https://pubmed.ncbi.nlm.nih.gov/26752238/) Coming back to work in the morning: Psychological ...

[https://pubmed.ncbi.nlm.nih.gov/26752238/](https://pubmed.ncbi.nlm.nih.gov/26752238/)

[[10]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5891720/) A Longitudinal Study of Temporal Motivation Theory - PMC - NIH

[https://pmc.ncbi.nlm.nih.gov/articles/PMC5891720/](https://pmc.ncbi.nlm.nih.gov/articles/PMC5891720/)

[[12]](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/) [[51]](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/) Vigilance Decrement and Enhancement Techniques: A Review

[https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/](https://pmc.ncbi.nlm.nih.gov/articles/PMC6721323/)

[[13]](https://www.researchgate.net/publication/378596568_Mind-wandering_increases_in_frequency_over_time_during_task_performance_An_individual-participant_meta-analytic_review) Mind-Wandering Increases in Frequency Over Time During ...

[https://www.researchgate.net/publication/378596568_Mind-wandering_increases_in_frequency_over_time_during_task_performance_An_individual-participant_meta-analytic_review](https://www.researchgate.net/publication/378596568_Mind-wandering_increases_in_frequency_over_time_during_task_performance_An_individual-participant_meta-analytic_review)

[[14]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) [[20]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) [[41]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) [[52]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) [[57]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) [[67]](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/) "Give me a break!" A systematic review and meta-analysis on ...

[https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/](https://pmc.ncbi.nlm.nih.gov/articles/PMC9432722/)

[[15]](https://desktime.com/blog/52-17-updated/) [[58]](https://desktime.com/blog/52-17-updated/) Does the 52-17 rule really hold up?

[https://desktime.com/blog/52-17-updated/](https://desktime.com/blog/52-17-updated/)

[[16]](https://www.tandfonline.com/doi/abs/10.1080/17439760.2014.967799) The challenge–skill balance and antecedents of flow

[https://www.tandfonline.com/doi/abs/10.1080/17439760.2014.967799](https://www.tandfonline.com/doi/abs/10.1080/17439760.2014.967799)

[[17]](https://journals.sagepub.com/doi/10.1177/20592043221134392) [[53]](https://journals.sagepub.com/doi/10.1177/20592043221134392) [[63]](https://journals.sagepub.com/doi/10.1177/20592043221134392) A Systematic Review of Task, Music, and Population Impact

[https://journals.sagepub.com/doi/10.1177/20592043221134392](https://journals.sagepub.com/doi/10.1177/20592043221134392)

[[18]](https://academic.oup.com/jcr/article-abstract/39/4/784/1798283) Is Noise Always Bad? Exploring the Effects of Ambient Noise ...

[https://academic.oup.com/jcr/article-abstract/39/4/784/1798283](https://academic.oup.com/jcr/article-abstract/39/4/784/1798283)

[[19]](https://journals.sagepub.com/doi/10.1177/17456916231178553) For Whom (and When) the Time Bell Tolls: Chronotypes ...

[https://journals.sagepub.com/doi/10.1177/17456916231178553](https://journals.sagepub.com/doi/10.1177/17456916231178553)

[[21]](https://www.sciencedirect.com/science/article/pii/S0749597809000399) [[28]](https://www.sciencedirect.com/science/article/pii/S0749597809000399) [[54]](https://www.sciencedirect.com/science/article/pii/S0749597809000399) Why is it so hard to do my work? The challenge of attention ...

[https://www.sciencedirect.com/science/article/pii/S0749597809000399](https://www.sciencedirect.com/science/article/pii/S0749597809000399)

[[22]](https://www.ics.uci.edu/~gmark/chi08-mark.pdf) The Cost of Interrupted Work: More Speed and Stress

[https://www.ics.uci.edu/~gmark/chi08-mark.pdf](https://www.ics.uci.edu/~gmark/chi08-mark.pdf)

[[23]](https://www.interruptions.net/literature/Altmann-CogSci04.pdf) [[39]](https://www.interruptions.net/literature/Altmann-CogSci04.pdf) Task interruption: Resumption lag and the role of cues

[https://www.interruptions.net/literature/Altmann-CogSci04.pdf](https://www.interruptions.net/literature/Altmann-CogSci04.pdf)

[[24]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985) [[40]](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985) Cognitive Offloading

[https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985](https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985)

[[25]](https://www.sciencedirect.com/science/article/abs/pii/S0191886910000474) I forgive myself, now I can study: How self ...

[https://www.sciencedirect.com/science/article/abs/pii/S0191886910000474](https://www.sciencedirect.com/science/article/abs/pii/S0191886910000474)

[[26]](https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness) [[42]](https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness) (PDF) Mindfulness as Attention Training: Meta-Analyses on ...

[https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness](https://www.researchgate.net/publication/346532196_Mindfulness_as_Attention_Training_Meta-Analyses_on_the_Links_Between_Attention_Performance_and_Mindfulness_Interventions_Long-Term_Meditation_Practice_and_Trait_Mindfulness)

[[27]](https://pubmed.ncbi.nlm.nih.gov/31364436/) Mind Wandering (Internal Distractibility) in ADHD

[https://pubmed.ncbi.nlm.nih.gov/31364436/](https://pubmed.ncbi.nlm.nih.gov/31364436/)

[[30]](https://link.springer.com/article/10.1186/s12966-023-01555-6) Impact of feedback generation and presentation on self ...

[https://link.springer.com/article/10.1186/s12966-023-01555-6](https://link.springer.com/article/10.1186/s12966-023-01555-6)

[[31]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) [[45]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) [[65]](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review) Just-in-the-Moment Adaptive Interventions (JITAI): A Meta- ...

[https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review](https://www.researchgate.net/publication/335656965_Just-in-the-Moment_Adaptive_Interventions_JITAI_A_Meta-Analytical_Review)

[[32]](https://repositorio.ispa.pt/server/api/core/bitstreams/370f1dca-cc04-4d3d-a0f0-36d16109ec37/content) Modelling habit formation in the real world

[https://repositorio.ispa.pt/server/api/core/bitstreams/370f1dca-cc04-4d3d-a0f0-36d16109ec37/content](https://repositorio.ispa.pt/server/api/core/bitstreams/370f1dca-cc04-4d3d-a0f0-36d16109ec37/content)

[[33]](https://www.sciencedirect.com/science/article/pii/S2214782916300380) Gamification for health and wellbeing: A systematic review ...

[https://www.sciencedirect.com/science/article/pii/S2214782916300380](https://www.sciencedirect.com/science/article/pii/S2214782916300380)

[[34]](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/) [[56]](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/) A meta-analytic review of experiments examining the ...

[https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/](https://pure.ewha.ac.kr/en/publications/a-meta-analytic-review-of-experiments-examining-the-effects-of-ex/)

[[35]](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors) [[66]](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors) Caring for Mobile Phone-Based Virtual Pets can Influence ...

[https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors](https://www.researchgate.net/publication/272118751_Caring_for_Mobile_Phone-Based_Virtual_Pets_can_Influence_Youth_Eating_Behaviors)

[[36]](https://www.researchgate.net/publication/50363494_Supportive_Accountability_A_Model_for_Providing_Human_Support_to_Enhance_Adherence_to_eHealth_Interventions) Supportive Accountability: A Model for Providing Human ...

[https://www.researchgate.net/publication/50363494_Supportive_Accountability_A_Model_for_Providing_Human_Support_to_Enhance_Adherence_to_eHealth_Interventions](https://www.researchgate.net/publication/50363494_Supportive_Accountability_A_Model_for_Providing_Human_Support_to_Enhance_Adherence_to_eHealth_Interventions)

[[43]](https://journals.sagepub.com/doi/10.1177/0149206319829823) Morning Reattachment to Work and Work Engagement ...

[https://journals.sagepub.com/doi/10.1177/0149206319829823](https://journals.sagepub.com/doi/10.1177/0149206319829823)

[[47]](https://pmc.ncbi.nlm.nih.gov/articles/PMC10049005/) Procrastination and Stress: A Conceptual Review of Why ...

[https://pmc.ncbi.nlm.nih.gov/articles/PMC10049005/](https://pmc.ncbi.nlm.nih.gov/articles/PMC10049005/)

[[49]](https://ideas.repec.org/a/wly/soecon/v90y2023i2p497-509.html) Microcommitments: Mitigating procrastination with more than

[https://ideas.repec.org/a/wly/soecon/v90y2023i2p497-509.html](https://ideas.repec.org/a/wly/soecon/v90y2023i2p497-509.html)

[[59]](https://pmc.ncbi.nlm.nih.gov/articles/PMC5079224/) Timing of activities of daily life is jaggy: How episodic ultradian ...

[https://pmc.ncbi.nlm.nih.gov/articles/PMC5079224/](https://pmc.ncbi.nlm.nih.gov/articles/PMC5079224/)

[[60]](https://onlinelibrary.wiley.com/doi/full/10.1002/lim2.54) Maladaptive or misunderstood? Dopamine fasting as a ...

[https://onlinelibrary.wiley.com/doi/full/10.1002/lim2.54](https://onlinelibrary.wiley.com/doi/full/10.1002/lim2.54)

[[61]](https://www.apa.org/topics/research/multitasking) Multitasking: Switching costs

[https://www.apa.org/topics/research/multitasking](https://www.apa.org/topics/research/multitasking)

[[62]](https://research-portal.uu.nl/en/publications/a-multilab-preregistered-replication-of-the-ego-depletion-effect/) A multilab preregistered replication of the ego-depletion ...

[https://research-portal.uu.nl/en/publications/a-multilab-preregistered-replication-of-the-ego-depletion-effect/](https://research-portal.uu.nl/en/publications/a-multilab-preregistered-replication-of-the-ego-depletion-effect/)