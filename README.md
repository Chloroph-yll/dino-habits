# DinoHabits

A habit tracker I built as a product management portfolio project. It runs entirely in the browser, with no login and no backend. Your data stays in your own browser's storage.

Live demo: [add your Vercel link here]

![DinoHabits screenshot](screenshot.png)

## Why I built it

Most habit apps punish you for a single bad day. A broken streak makes people feel like they've failed, and a lot of people then stop opening the app. I wanted to see how far a small set of product decisions could go in the other direction:

- **Forgiving streaks.** One missed day in any 7 doesn't break your streak. Two misses in the same week do. The rule lives in one function (`streakEnding` in `App.jsx`) so it's easy to change and test.
- **A small reward that varies.** Checking off a habit plays one of four hand-drawn animations, picked at random. It's turned off for people who have "reduce motion" enabled on their device.
- **Notes, not just ticks.** Press and hold (or right-click) a habit to log mood, energy and a short note. The Insights tab then compares your average mood on days you did a habit against days you didn't. It shows a pattern in your own data and doesn't claim to prove cause.
- **Three tabs only.** Today, Insights and Tasks. The calendar sits inside Insights because it's something you look back at, not something you do daily.

## What it does

- Create, edit, archive, restore and delete habits (name, icon, colour, optional daily target text)
- One-tap check-in, plus a visible "Add note" button for people who don't know about long-press
- Week and month calendar showing how much you completed each day; tap a day to edit it
- Eisenhower matrix for tasks (drag between quadrants, or use the dropdown)
- Dashboard: 7-day, 30-day and all-time completion, current and best streak, total check-ins, a 30-day bar chart, and a per-habit breakdown. Everything is calculated from your saved data
- Light and dark theme, defaulting to your system setting
- "Load sample data" button so the dashboard isn't empty on first visit

## Built with

React, Tailwind CSS, lucide-react (icons) and Vite. The charts are plain SVG and there are no chart libraries, no APIs and no paid services.

## Run it yourself

You need [Node.js](https://nodejs.org) (the LTS version).

```
npm install
npm run dev
```

Then open the link it prints, usually http://localhost:5173.

## How data is saved

Everything goes into the browser's LocalStorage under a single key, `dinohabits:v1`. The "v1" is there so a future version can upgrade old data instead of breaking it. If the stored data is missing or damaged, the app starts fresh rather than crashing.

## Known limitations

- Data lives in one browser on one device. Clearing your browser data deletes it, and there is no sync or export yet.
- The "daily target" is a text label. It doesn't count anything yet, so "8 glasses" is a reminder, not a tally.
- The overall streak counts a day as done if any habit was checked. The per-habit streaks are stricter.
- Days are based on your device's clock. If you change time zones, a day can look slightly off.
- Drag and drop for tasks works with a mouse. On phones, use the dropdown on each task.
- I have not run formal usability tests or measured retention. The design choices come from reasoning about the problem, not from user research.

## What I'd do next

1. Export and import your data as a file, to fix the one-device limitation.
2. Counted daily targets (for example, 3 of 8 glasses).
3. Short interviews with a few people who've quit habit apps, to check whether forgiving streaks matter to them.

## About me

[Your name], business student interested in product management. [Link to LinkedIn]
