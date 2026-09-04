/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ALL RESUME CONTENT LIVES HERE. Nothing else needs editing.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything below is placeholder text. To publish your real resume:
 *
 *   1. Replace `profile` with your name, title, and opening story.
 *   2. Replace each section's `title`, `story`, `hint` and `body`.
 *   3. Add or remove sections freely — the world adapts. A landmark is
 *      built for each section in this list, the tracker sizes itself to the
 *      count, and the shapes and colours cycle if you exceed them.
 *
 * The only constraint is that `id` stays unique.
 */

export interface ResumeSection {
  /** Unique key. Used for tracker rows; never shown to the visitor. */
  id: string;
  /** Shown on the landmark's card and in the expedition log. */
  title: string;
  /** A short line shown above the title when the card opens. */
  eyebrow: string;
  /**
   * The narrative line on the card — the log-entry voice that frames the
   * section before the facts arrive. One or two sentences reads best.
   */
  story: string;
  /**
   * Shown in the on-screen guide while this island is the next one to find.
   * Write it as a heading toward somewhere, not a description of a place.
   */
  hint: string;
  /** One or more paragraphs of body copy. */
  body: string[];
}

export const profile = {
  name: "Your Name",
  title: "Your Professional Title",
  /** The opening story on the start screen. Each entry is a paragraph. */
  story: [
    "The archipelago broke loose from the world a long time ago, and everything worth knowing about a person drifted up with it — the work, the craft, the years, scattered across islands that no longer sit still.",
    "You have the helm of a small airship and the last of the evening light. Six beacons still burn out there. Reach one and it will tell you its part of the story.",
  ],
};

export const sections: ResumeSection[] = [
  {
    id: "about",
    title: "About",
    eyebrow: "The Approach",
    story:
      "The first island sits closest to where the light comes from, which seems about right for a beginning. Its beacon has been lit the longest.",
    hint: "Make for the nearest light — the one that has been burning the longest.",
    body: [
      "Placeholder introduction. Two or three sentences on who you are and the kind of work you want to be known for reads best here — long enough to have a voice, short enough to finish in one breath.",
      "A second paragraph is a good place for what you care about in the craft: the problems you gravitate toward, how you like to work with other people, what you are trying to get better at.",
    ],
  },
  {
    id: "experience",
    title: "Experience",
    eyebrow: "The Voyage So Far",
    story:
      "The largest rock in the chain, and the most weathered. Everything here was built by somebody who had to keep it standing while they built it.",
    hint: "There is a heavier shape on the horizon — older stone, and a light above it.",
    body: [
      "Placeholder role — Company, 20XX to present. Lead with what changed because you were there rather than what you were assigned. Numbers land harder than adjectives.",
      "Placeholder role — Company, 20XX to 20XX. A second entry, same shape. Keep each to a couple of lines; this panel rewards brevity.",
      "Placeholder role — Company, 20XX to 20XX. Earlier work can compress to a single line as it recedes in relevance.",
    ],
  },
  {
    id: "skills",
    title: "Skills",
    eyebrow: "Instruments Aboard",
    story:
      "Less an island than a workshop that happens to be floating. Every tool here was picked up because something needed doing.",
    hint: "Something metallic is catching the sun off the beam — instruments, by the look of it.",
    body: [
      "Placeholder skills. Languages and runtimes you would be comfortable being interviewed on, not everything you have ever touched.",
      "Placeholder tooling. Infrastructure, testing, design tools — whatever is genuinely part of how you work.",
      "Placeholder strengths. The non-technical half: writing, facilitation, mentoring, working across disciplines.",
    ],
  },
  {
    id: "projects",
    title: "Projects",
    eyebrow: "Charts and Findings",
    story:
      "Things made because they wanted making. This sky is one of them, which makes the island you are standing over a little self-referential.",
    hint: "Off the main chain there are smaller rocks — the ones nobody asked for.",
    body: [
      "Placeholder project. One sentence on what it is, one on what was hard about it, one on the outcome. Link it if it is public.",
      "Placeholder project. Side projects earn their place when they show range the day job does not — this site is an example of exactly that.",
    ],
  },
  {
    id: "education",
    title: "Education",
    eyebrow: "Where the Maps Began",
    story:
      "The oldest stone in the archipelago, and the quietest. Worth a pass, though the story has moved on since.",
    hint: "Further out, where the haze thickens, sits the oldest rock of the lot.",
    body: [
      "Placeholder degree — Institution, 20XX. Field of study, and honours if they are worth the line.",
      "Placeholder certification or coursework. Anything ongoing goes here too; showing what you are learning now says more than a decade-old credential.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    eyebrow: "Send Word",
    story:
      "A mooring post at the far edge of the chain, kept lit for anyone who makes it this far out. Which, at this point, is you.",
    hint: "One light remains, at the far edge of the chain. Someone left it on.",
    body: [
      "Placeholder email — you@example.com",
      "Placeholder links — GitHub, LinkedIn, or a personal site. Two or three at most.",
      "A closing line about what you would like to hear about makes the difference between a list and an invitation.",
    ],
  },
];

/** Shown by the guide once every beacon has been found. */
export const completionStory =
  "Every light in the chain is out. The sky is yours to wander now — or send word, if any of it landed.";
