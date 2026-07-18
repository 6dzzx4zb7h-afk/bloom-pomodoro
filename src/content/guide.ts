/**
 * Bundled Field Guide content model (PLAN 6.1).
 *
 * The guide is static TypeScript data so it remains fully available offline.
 * Full references and evidence grading live in docs/science.md; runtime source
 * strings stay short and contain no external links.
 */

import type { EvidenceKey } from '../insights/why';

export const GUIDE_STAGE_TAGS = ['start', 'stay', 'recover', 'science'] as const;

export type GuideStageTag = (typeof GUIDE_STAGE_TAGS)[number];

export type GuideKeyPoints =
  | readonly [string, string, string]
  | readonly [string, string, string, string]
  | readonly [string, string, string, string, string];

export type GuideSources = readonly [string, ...string[]];

export interface GuideArticle {
  id: string;
  stageTag: GuideStageTag;
  title: string;
  keyPoints: GuideKeyPoints;
  practicalExercise: string;
  sources: GuideSources;
}

export const GUIDE_ARTICLES = [
  {
    id: 'first-pebble',
    stageTag: 'start',
    title: 'Start with the first pebble',
    keyPoints: [
      'Starting often feels hardest when a task feels costly right now.',
      'That feeling says nothing about your character.',
      'A small, visible action can lower the cost of beginning.',
      'Momentum is often easier to build once something is moving.',
    ],
    practicalExercise:
      'Pick the smallest visible action: rename the task, add one bullet, or write one rough sentence. If you like, try it for two minutes.',
    sources: [
      'Sirois (2023), Stress and Health',
      'Felkey (2023), Southern Economic Journal',
      'Kim & Seo (2015), Personality and Individual Differences',
    ],
  },
  {
    id: 'if-then',
    stageTag: 'start',
    title: 'If–then beats try harder',
    keyPoints: [
      '“Try harder” is vague. It leaves the opening move hidden.',
      'An if–then plan joins one clear cue to one action.',
      'The cue can carry your first move when the moment arrives.',
      'Planning that cue can matter as much as naming the goal.',
    ],
    practicalExercise:
      'Fill one sentence: “If ___ happens, then I will ___.” Save it as a session opener, or skip it anytime.',
    sources: [
      'Gollwitzer & Sheeran (2006), Advances in Experimental Social Psychology',
      'Wang et al. (2021), Frontiers in Psychology',
    ],
  },
  {
    id: 'tiny-start',
    stageTag: 'start',
    title: 'Make a tiny start honest and doable',
    keyPoints: [
      'A tiny start does not pretend the whole task is small.',
      'It chooses one honest action that feels doable now.',
      'That can make beginning a little less fragile.',
      'Evidence is promising, but most direct studies are in education contexts.',
    ],
    practicalExercise:
      'Write three rungs: two minutes, ten minutes, and a full session. If you like, begin with rung one.',
    sources: ['Felkey (2023), Southern Economic Journal'],
  },
  {
    id: 'desk-help',
    stageTag: 'start',
    title: 'Make your desk help you',
    keyPoints: [
      'Your space can make the first move feel lighter.',
      'A phone can tug at attention without making a sound.',
      'A short ritual can help your mind rejoin the task.',
      'The aim is less friction, not a perfect desk.',
    ],
    practicalExercise:
      'Before a timer, try four tiny moves: phone away, task named, first action named, distracting tabs closed.',
    sources: [
      'Sonnentag & Kühnel (2016), Journal of Occupational Health Psychology',
      'Ward et al. (2017), Journal of the Association for Consumer Research',
    ],
  },
  {
    id: 'attention-fades',
    stageTag: 'stay',
    title: 'Attention naturally fades',
    keyPoints: [
      'Attention often softens as time on a task grows.',
      'This is especially common during repetitive or dull work.',
      'Mind-wandering also tends to grow as a session continues.',
      'A mid-session slump is weather, not a personal grade.',
    ],
    practicalExercise:
      'For one week, tag your first noticeable drift as early, middle, or late. Then gently look for patterns.',
    sources: ['Al-Shargie et al. (2019), Brain Sciences'],
  },
  {
    id: 'breaks-are-fuel',
    stageTag: 'stay',
    title: 'Breaks help attention recover',
    keyPoints: [
      'Short breaks often support performance and ease fatigue.',
      'Research does not point to one ratio for everyone.',
      'A 25/5 rhythm is useful because it is simple.',
      'The task and the break both shape which cadence fits.',
    ],
    practicalExercise:
      'Try two cadences this week, such as 25/5 and 40/8. Compare distraction tags and finish rates.',
    sources: ['Albulescu et al. (2022), PLOS ONE'],
  },
  {
    id: 'flow-needs',
    stageTag: 'stay',
    title: 'What flow really needs',
    keyPoints: [
      'Flow is easier to find when the goal is clear.',
      'The challenge needs to fit the skills available right now.',
      'Quick feedback helps you see whether the work is moving.',
      'Too much challenge can swamp you. Too little can feel flat.',
    ],
    practicalExercise:
      'Before a session, choose one target. Make it meaningful and small enough to finish within the block.',
    sources: [
      'Fong et al. (2015), Journal of Positive Psychology',
      'Liu et al. (2023), Organizational Behavior and Human Decision Processes',
    ],
  },
  {
    id: 'music-and-lyrics',
    stageTag: 'stay',
    title: 'Music can help, but lyrics often do not',
    keyPoints: [
      'Background audio affects tasks and people differently.',
      'Lyrics often interfere with reading, writing, and memory work.',
      'Instrumental music is often neutral rather than a performance boost.',
      'Moderate ambient noise may fit brainstorming better than analysis.',
    ],
    practicalExercise:
      'Try separate blocks with silence, instrumental audio, and ambient noise. Save lyrics for routine tasks, if you like.',
    sources: [
      'Cheah et al. (2022), Music & Science',
      'Souza et al. (2023), Journal of Cognition',
      'Mehta et al. (2012), Journal of Consumer Research',
    ],
  },
  {
    id: 'kind-restart',
    stageTag: 'recover',
    title: 'After distraction, soften the next step',
    keyPoints: [
      'One distraction can be followed by harsh self-talk.',
      'That extra pressure can move the task farther away.',
      'A kind restart can make returning feel more reachable.',
      'Kindness here is practical. It keeps the next move close.',
    ],
    practicalExercise:
      'When a drift happens, try: “Noted. Next step is ___.” When you are ready, do that one step.',
    sources: [
      'Wohl et al. (2010), Personality and Individual Differences',
      'Sirois (2014), Self and Identity',
    ],
  },
  {
    id: 'parking-lot',
    stageTag: 'recover',
    title: 'Park an urge-to-check thought',
    keyPoints: [
      'An urge-to-check thought can keep asking for mental space.',
      'Writing it down moves it from memory into the environment.',
      'Cognitive offloading is well supported, but direct parking evidence is thin.',
      'A focus-session parking lot is worth an experiment, not a promise.',
    ],
    practicalExercise:
      'When a thought appears, park it in five words. You can revisit it at the next break.',
    sources: [
      'Risko & Gilbert (2016), Trends in Cognitive Sciences',
      'Scullin et al. (2018), Journal of Experimental Psychology: General',
    ],
  },
  {
    id: 'one-minute-reentry',
    stageTag: 'recover',
    title: 'A one-minute re-entry ritual',
    keyPoints: [
      'The first seconds after an interruption can feel disorienting.',
      'Visible task context can make the restart easier to find.',
      'A short cue can answer “what was I doing?”',
      'Then the next physical action gives attention somewhere to land.',
    ],
    practicalExercise:
      'Read your last note, restate the target, and do the next physical action. That is the whole ritual.',
    sources: [
      'Leroy (2009), Organizational Behavior and Human Decision Processes',
      'Trafton et al. (2003), International Journal of Human-Computer Studies',
      'Altmann & Trafton (2004), Cognitive Science',
    ],
  },
  {
    id: 'tracking-without-pressure',
    stageTag: 'science',
    title: 'Why tracking helps and when it turns into pressure',
    keyPoints: [
      'Tracking can support action by making progress visible.',
      'It tends to help when the behavior is actually recorded.',
      'Metrics are mirrors, not grades. A perfect graph is not the goal.',
      'Timing patterns are clues, not rules. Bloom treats recent sessions as something to explore, not proof of a natural best hour.',
      'Some people, including some people with ADHD, may find shorter steps and stronger external cues helpful; this app is not medical advice.',
    ],
    practicalExercise:
      'Review one week. Ask: “What helped me start?” and “What helped me recover?” Leave grades out of it.',
    sources: [
      'Harkin et al. (2016), Psychological Bulletin',
      'Deci et al. (1999), Psychological Bulletin',
      'Krukowski et al. (2024), International Journal of Behavioral Nutrition and Physical Activity',
      'May, Hasher & Healey (2023), Perspectives on Psychological Science',
      'Chauhan et al. (2025), Chronobiology International',
    ],
  },
] as const satisfies readonly GuideArticle[];

export type GuideArticleId = (typeof GUIDE_ARTICLES)[number]['id'];

/**
 * Destination for every explanation emitted by the why/recipe engines.
 *
 * `golden-hours` is the existing internal key. The research term is the
 * chronotype–time-of-day synchrony effect, and the evidence is mixed. Bloom's
 * rule observes completion history rather than a biological peak, so its
 * destination is the tracking article and its deliberately cautious note.
 */
export const GUIDE_ARTICLE_ID_BY_EVIDENCE_KEY = {
  'kind-restart': 'kind-restart',
  'attention-fades': 'attention-fades',
  'breaks-are-fuel': 'breaks-are-fuel',
  'golden-hours': 'tracking-without-pressure',
  'tiny-start': 'tiny-start',
  'still-learning': 'tracking-without-pressure',
  'if-then': 'if-then',
  'desk-help': 'desk-help',
  'parking-lot': 'parking-lot',
} as const satisfies Record<EvidenceKey, GuideArticleId>;
