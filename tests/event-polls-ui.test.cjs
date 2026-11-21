const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../src/components/Chat/GroupFeaturesPanel.tsx"), "utf8");

test("event poll UI: creation exposes two default time choices and caps alternatives at six", () => {
  assert.match(source, /useState\(\[\"\", \"\"\]\)/);
  assert.match(source, /prev\.length\s*<\s*6/);
  assert.match(source, /DateTimePicker/);\n  assert.doesNotMatch(source, /type=\"datetime-local\"/);
  assert.match(source, /selectedTimes\.length === 1/);
  assert.match(source, /timeOptions: selectedTimes/);
});

test("event poll UI: vote selections are controlled and submitted to the event API", () => {
  assert.match(source, /checked=\{\(eventSelections\[event\.id\]\?\?event\.myOptionIds\?\?\[\]\)\.includes\(option\.id\)\}/);
  assert.match(source, /action:\"voteEvent\"/);
  assert.match(source, /optionIds:eventSelections\[event\.id\]\?\?event\.myOptionIds\?\?\[\]/);
  assert.match(source, /option\.votes\?\.length/);
});

test("event poll UI: attendance responses remain independently actionable", () => {
  assert.match(source, /\[\"going\",\"maybe\",\"not-going\"\]/);
  assert.match(source, /action:\"respondEvent\"/);
  assert.match(source, /event\.myResponse===response/);
  assert.match(source, /event\.responses\?\.going\?\.length/);
});

test("event calendar UI: month navigation, 42-day grid, event dots and day filtering exist", () => {
  assert.match(source, /Array\.from\(\{ length: 42 \}/);
  assert.match(source, /aria-label=\"Previous month\"/);
  assert.match(source, /aria-label=\"Next month\"/);
  assert.match(source, /setSelectedCalendarDay\(selected\?null:day\)/);
  assert.match(source, /visibleEvents\.map\(event/);
  assert.match(source, /timeOptions \|\| \[\]/);
  assert.match(source, /Show all events/);
});

test("event poll UI: live updates bind and unbind only the feature listener on the shared group channel", () => {
  assert.match(source, /pusherClient\.subscribe\(toPusherKey\("private-chat:group--" \+ groupId\)\)/);
  assert.match(source, /channel\.bind\("group_feature_updated", refresh\)/);
  assert.match(source, /channel\.unbind\("group_feature_updated", refresh\)/);
  assert.doesNotMatch(source, /pusherClient\.unsubscribe\(toPusherKey\("private-chat:group--"/);
});

test("event poll UI: controls disable during requests and successful actions refresh server state", () => {
  assert.match(source, /if \(busy\) return false/);
  assert.match(source, /await load\(false\)/);
  assert.match(source, /disabled=\{busy\|\|!\(/);
});

test("event poll UI: user-provided event content is rendered as React text, never raw HTML", () => {
  assert.match(source, /\{event\.title\}/);
  assert.match(source, /\{event\.description\}/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
});

test("event and poll creation are optimistic and remove temporary entries on API failure", () => {
  assert.match(source, /optimistic-poll-/);
  assert.match(source, /optimistic-event-/);
  assert.match(source, /polls: \[optimisticPoll, \.\.\.current\.polls\]/);
  assert.match(source, /events: \[optimisticEvent, \.\.\.current\.events\]/);
  assert.match(source, /polls: current\.polls\.filter\(item => item\.id !== optimisticId\)/);
  assert.match(source, /events: current\.events\.filter\(item => item\.id !== optimisticId\)/);
});
