/**
 * ─────────────────────────────────────────────────────────────────────────
 *  ALL RESUME CONTENT LIVES HERE. Nothing else needs editing.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Everything below is placeholder text. To publish your real resume:
 *
 *   1. Replace `profile` with your name and title.
 *   2. Replace each section's `title` and `body` paragraphs.
 *   3. Add or remove sections freely — the world adapts. A landmark is
 *      built for each section in this list, the tracker sizes itself to the
 *      count, and the shapes and colours below cycle if you exceed them.
 *
 * The only constraint is that `id` stays unique.
 */

export interface ResumeSection {
  /** Unique key. Used for tracker rows; never shown to the visitor. */
  id: string;
  /** Shown on the landmark's panel and in the expedition log. */
  title: string;
  /** A short line shown above the title when the panel opens. */
  eyebrow: string;
  /** One or more paragraphs of body copy. */
  body: string[];
}

export const profile = {
  name: "Your Name",
  title: "Your Professional Title",
};

export const sections: ResumeSection[] = [
  {
    id: "about",
    title: "About",
    eyebrow: "The Approach",
    body: [
      "Placeholder introduction. Two or three sentences on who you are and the kind of work you want to be known for reads best here — long enough to have a voice, short enough to finish in one breath.",
      "A second paragraph is a good place for what you care about in the craft: the problems you gravitate toward, how you like to work with other people, what you are trying to get better at.",
    ],
  },
  {
    id: "experience",
    title: "Experience",
    eyebrow: "The Voyage So Far",
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
    body: [
      "Placeholder project. One sentence on what it is, one on what was hard about it, one on the outcome. Link it if it is public.",
      "Placeholder project. Side projects earn their place when they show range the day job does not — this site is an example of exactly that.",
    ],
  },
  {
    id: "education",
    title: "Education",
    eyebrow: "Where the Maps Began",
    body: [
      "Placeholder degree — Institution, 20XX. Field of study, and honours if they are worth the line.",
      "Placeholder certification or coursework. Anything ongoing goes here too; showing what you are learning now says more than a decade-old credential.",
    ],
  },
  {
    id: "contact",
    title: "Contact",
    eyebrow: "Send Word",
    body: [
      "Placeholder email — you@example.com",
      "Placeholder links — GitHub, LinkedIn, or a personal site. Two or three at most.",
      "A closing line about what you would like to hear about makes the difference between a list and an invitation.",
    ],
  },
];
