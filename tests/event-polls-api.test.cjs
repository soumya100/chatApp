const test = require("node:test");
const assert = require("node:assert/strict");
const h = require("./helpers/group-api-harness.cjs");

const features = h.loadRoute("src/app/api/group/[groupId]/features/route.ts");
const context = { params: Promise.resolve({ groupId: "g1" }) };
const post = (payload, route = features) => route.POST(h.request(payload), context);
const get = () => features.GET(h.request(undefined, "GET"), context);
const read = async response => ({ status: response.status, data: await h.body(response) });
const future = (minutes = 2) => Date.now() + minutes * 60_000;
const createPollEvent = (overrides = {}) => post({
  action: "createEvent",
  title: "Planning session",
  startsAt: future(),
  timeOptions: [future(3), future(4)],
  ...overrides,
});

test("event poll security: unauthenticated create, vote, RSVP and read are rejected", async () => {
  h.reset({ session: null });
  for (const response of [
    await read(await createPollEvent()),
    await read(await post({ action: "voteEvent", eventId: "e1", optionIds: ["a"] })),
    await read(await post({ action: "respondEvent", eventId: "e1", response: "going" })),
    await read(await get()),
  ]) assert.equal(response.status, 401);
});

test("event poll security: non-members cannot create, vote, RSVP or read group events", async () => {
  h.reset();
  h.setSession("outsider");
  for (const response of [
    await read(await createPollEvent()),
    await read(await post({ action: "voteEvent", eventId: "e1", optionIds: ["a"] })),
    await read(await post({ action: "respondEvent", eventId: "e1", response: "going" })),
    await read(await get()),
  ]) assert.equal(response.status, 403);
});

test("event poll authorization: admin-only event creation blocks members but permits admins", async () => {
  h.reset({ group: { settings: { onlyAdminsCanCreateEvents: true } } });
  h.setSession("member");
  assert.equal((await read(await createPollEvent())).status, 403);
  h.setSession("admin");
  const result = await read(await createPollEvent());
  assert.equal(result.status, 200);
  assert.equal(result.data.result.createdBy, "admin");
});

test("event poll validation: malformed JSON and unknown actions fail closed", async () => {
  h.reset();
  const malformed = await features.POST(h.requestRaw("{"), context);
  assert.equal(malformed.status, 400);
  assert.equal((await read(await post({ action: "executeLua", payload: "return 1" }))).status, 400);
});

test("event poll validation: title, timestamps and optional fields enforce schema limits", async () => {
  h.reset();
  const invalid = [
    { title: "ab" },
    { title: "x".repeat(121) },
    { description: "x".repeat(1001) },
    { location: "x".repeat(201) },
    { startsAt: 0 },
    { startsAt: Date.now() + 1.5 },
    { startsAt: "tomorrow" },
  ];
  for (const override of invalid) {
    assert.equal((await read(await createPollEvent(override))).status, 400, JSON.stringify(Object.keys(override)));
  }
  assert.equal((await read(await post({ action: "createEvent", title: "Past event", startsAt: Date.now() - 1 }))).status, 400);
});

test("event poll validation: accepts the minimum two and maximum six unique choices", async () => {
  h.reset();
  const two = await read(await createPollEvent({ timeOptions: [future(3), future(4)] }));
  assert.equal(two.status, 200);
  assert.equal(two.data.result.timeOptions.length, 2);
  const six = await read(await createPollEvent({ timeOptions: Array.from({ length: 6 }, (_, i) => future(i + 3)) }));
  assert.equal(six.status, 200);
  assert.equal(six.data.result.timeOptions.length, 6);
  assert.ok(six.data.result.timeOptions.every(option => option.votes.length === 0));
});

test("event poll validation: rejects one, seven, malformed, and past time options", async () => {
  h.reset();
  const invalidChoices = [
    [future(3)],
    [future(3), future(3)],
    Array.from({ length: 7 }, (_, i) => future(i + 3)),
    [future(3), "not-a-date"],
    [future(3), Date.now() - 1],
    [future(3), 1.25],
  ];
  for (const timeOptions of invalidChoices) {
    assert.equal((await read(await createPollEvent({ timeOptions }))).status, 400);
  }
});

test("event poll creation: fixed events remain compatible and polls initialize safely", async () => {
  h.reset();
  const result = await read(await post({ action: "createEvent", title: "Fixed event", startsAt: future() }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.result.timeOptions, []);
  assert.deepEqual(result.data.result.responses, { going: [], maybe: [], "not-going": [] });
  assert.equal(result.data.result.createdBy, "owner");
  assert.equal(result.data.result.title, "Fixed event");
  assert.equal(result.data.features.events[0].id, result.data.result.id);
  assert.ok(h.getMessages().some(message => message.featureType === "event" && message.featureId === result.data.result.id));
  assert.ok(h.pusherEvents.some(event => event.event === "group_feature_updated"));
});

test("event poll voting: duplicate choices are deduplicated and multiple time slots are supported", async () => {
  h.reset();
  h.setSession("member");
  const created = await read(await createPollEvent());
  const { id, timeOptions } = created.data.result;
  const selected = [timeOptions[0].id, timeOptions[1].id, timeOptions[0].id];
  const voted = await read(await post({ action: "voteEvent", eventId: id, optionIds: selected }));
  assert.equal(voted.status, 200);
  assert.deepEqual(voted.data.result.timeOptions.map(option => option.votes), [["member"], ["member"]]);
  assert.ok(h.pusherEvents.some(event => event.event === "group_feature_updated" && event.data.action === "voteEvent"));
});

test("event poll voting: changing or clearing a vote replaces every previous selection", async () => {
  h.reset();
  h.setSession("member");
  const created = await read(await createPollEvent());
  const { id, timeOptions } = created.data.result;
  await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[0].id, timeOptions[1].id] }));
  const changed = await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[1].id] }));
  assert.deepEqual(changed.data.result.timeOptions.map(option => option.votes), [[], ["member"]]);
  h.setSession("other");
  const otherVote = await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[0].id] }));
  assert.deepEqual(otherVote.data.result.timeOptions.map(option => option.votes), [["other"], ["member"]]);
  h.setSession("member");
  const empty = await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[0].id] }));
  assert.deepEqual(empty.data.result.timeOptions.map(option => option.votes), [["other", "member"], []]);
});

test("event poll voting: invalid, missing, non-poll and empty selections never mutate votes", async () => {
  h.reset();
  h.setSession("member");
  const fixed = await read(await post({ action: "createEvent", title: "Fixed event", startsAt: future() }));
  assert.equal((await read(await post({ action: "voteEvent", eventId: fixed.data.result.id, optionIds: ["x"] }))).status, 400);
  assert.equal((await read(await post({ action: "voteEvent", eventId: "missing", optionIds: ["x"] }))).status, 404);
  const poll = await read(await createPollEvent());
  const id = poll.data.result.id;
  const before = JSON.stringify(h.getFeatures());
  for (const optionIds of [[], ["unknown"], ["x".repeat(500)], Array.from({ length: 7 }, (_, i) => "id-" + i)]) {
    assert.equal((await read(await post({ action: "voteEvent", eventId: id, optionIds }))).status, 400);
    assert.equal(JSON.stringify(h.getFeatures()), before, "rejected votes must not alter stored features");
  }
});

test("event poll RSVP: all states are exclusive, repeatable, and independent from time votes", async () => {
  h.reset();
  h.setSession("member");
  const created = await read(await createPollEvent());
  const { id, timeOptions } = created.data.result;
  await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[0].id] }));
  for (const response of ["maybe", "not-going", "going", "going"]) {
    assert.equal((await read(await post({ action: "respondEvent", eventId: id, response }))).status, 200);
  }
  const loaded = await read(await get());
  const event = loaded.data.features.events[0];
  assert.deepEqual(event.responses, { going: ["member"], maybe: [], "not-going": [] });
  assert.equal(event.myResponse, "going");
  assert.deepEqual(event.myOptionIds, [timeOptions[0].id]);
  assert.equal((await read(await post({ action: "respondEvent", eventId: "missing", response: "going" }))).status, 404);
});

test("event poll privacy: GET exposes the requesting member's choices, not another member's identity", async () => {
  h.reset();
  const created = await read(await createPollEvent());
  const { id, timeOptions } = created.data.result;
  h.setSession("member");
  await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[0].id] }));
  h.setSession("other");
  await read(await post({ action: "voteEvent", eventId: id, optionIds: [timeOptions[1].id] }));
  const result = await read(await get());
  const event = result.data.features.events[0];
  assert.deepEqual(event.myOptionIds, [timeOptions[1].id]);
  assert.equal(event.myResponse, null);
  assert.deepEqual(event.timeOptions.map(option => option.votes.length), [1, 1]);
});

test("event poll privacy: missing groups return 404 without exposing stored data", async () => {
  h.reset({ group: null });
  assert.equal((await read(await get())).status, 404);
});

test("event poll input: HTML-like titles and descriptions remain inert text data", async () => {
  h.reset();
  const title = "<script>alert(1)</script>";
  const description = "<img src=x onerror=alert(1)>";
  const result = await read(await post({
    action: "createEvent",
    title,
    description,
    startsAt: future(),
  }));
  assert.equal(result.status, 200);
  assert.equal(result.data.result.title, title);
  assert.equal(result.data.result.description, description);
});
