export interface MarkerLookup {
  canonical: string;
}

export interface LessonStepMarkerInput {
  lessonSlug: string;
  stepId: string;
}

export interface ResultMarkerInput {
  lessonSlug: string;
  questionId: string;
}

interface NoteInfoLike {
  fields?: Record<string, { value?: string }>;
}

const AUTOBOT_COMMENT_REGEX = /<!--([\s\S]*?)-->/g;
const PREFETCH_NOTES_INFO_CHUNK_SIZE = 250;

function escapeForAnkiQuery(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

export function buildLessonStepMarkers(
  input: LessonStepMarkerInput,
): MarkerLookup {
  const canonical = `<!-- autobot:v2:lesson:${input.lessonSlug}:${input.stepId} -->`;
  return { canonical };
}

export function buildResultMarkers(input: ResultMarkerInput): MarkerLookup {
  const canonical = `<!-- autobot:v2:result:${input.lessonSlug}:${input.questionId} -->`;
  return { canonical };
}

export function buildFrontMarkerQuery(marker: string): string {
  return `"Front:${escapeForAnkiQuery(marker)}"`;
}

function buildFrontContainsQuery(value: string): string {
  return `Front:*${escapeForAnkiQuery(value)}*`;
}

export function normalizeMarker(marker: string): string {
  const trimmed = marker.trim();
  const match = trimmed.match(/^<!--\s*([\s\S]*?)\s*-->$/);
  const body = (match ? match[1] : trimmed).replace(/\s+/g, " ").trim();
  return `<!-- ${body} -->`;
}

export function getLookupMarkers(lookup: MarkerLookup): string[] {
  return [lookup.canonical];
}

export function buildLessonPrefetchQueries(lessonSlug: string): string[] {
  return unique([
    buildFrontContainsQuery(`autobot:v2:lesson:${lessonSlug}:`),
    buildFrontContainsQuery(`autobot:${lessonSlug}:`),
    buildFrontContainsQuery(`autobot:v2:result:${lessonSlug}:`),
    buildFrontContainsQuery(`autobot-result:${lessonSlug}:`),
  ]);
}

export async function findNoteIdsByQueries(
  queries: string[],
): Promise<number[]> {
  const noteIds: number[] = [];

  for (const query of unique(queries)) {
    const found = await browser.runtime.sendMessage({
      action: "findNotes",
      query,
    });
    if (Array.isArray(found)) {
      noteIds.push(...found);
    }
  }

  return unique(noteIds.map((value) => String(value))).map((value) =>
    Number(value),
  );
}

async function fetchNotesInfoInChunks(
  noteIds: number[],
): Promise<NoteInfoLike[]> {
  const notesInfo: NoteInfoLike[] = [];

  for (let i = 0; i < noteIds.length; i += PREFETCH_NOTES_INFO_CHUNK_SIZE) {
    const chunk = noteIds.slice(i, i + PREFETCH_NOTES_INFO_CHUNK_SIZE);
    if (chunk.length === 0) continue;

    const found = await browser.runtime.sendMessage({
      action: "notesInfo",
      notes: chunk,
    });

    if (Array.isArray(found)) {
      notesInfo.push(...(found as NoteInfoLike[]));
    }
  }

  return notesInfo;
}

function extractAutobotMarkersFromFront(front: string): string[] {
  const markers: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = AUTOBOT_COMMENT_REGEX.exec(front)) !== null) {
    const body = match[1]?.trim();
    if (!body) continue;

    if (body.startsWith("autobot:") || body.startsWith("autobot-result:")) {
      markers.push(normalizeMarker(`<!-- ${body} -->`));
    }
  }

  AUTOBOT_COMMENT_REGEX.lastIndex = 0;
  return markers;
}

export async function prefetchLessonMarkers(
  lessonSlug: string,
): Promise<Set<string>> {
  const queries = buildLessonPrefetchQueries(lessonSlug);
  const noteIds = await findNoteIdsByQueries(queries);
  if (noteIds.length === 0) return new Set<string>();

  const infos = await fetchNotesInfoInChunks(noteIds);
  const markers = new Set<string>();

  for (const info of infos) {
    const frontValue = info.fields?.Front?.value;
    if (typeof frontValue !== "string" || frontValue.length === 0) continue;

    for (const marker of extractAutobotMarkersFromFront(frontValue)) {
      markers.add(marker);
    }
  }

  return markers;
}

export async function findNoteIdsByMarkers(
  markers: string[],
): Promise<number[]> {
  const noteIds: number[] = [];

  for (const marker of unique(markers)) {
    const found = await browser.runtime.sendMessage({
      action: "findNotes",
      query: buildFrontMarkerQuery(marker),
    });
    if (Array.isArray(found)) {
      noteIds.push(...found);
    }
  }

  return unique(noteIds.map((value) => String(value))).map((value) =>
    Number(value),
  );
}

export async function removeNotesByMarkers(markers: string[]): Promise<void> {
  const noteIds = await findNoteIdsByMarkers(markers);
  if (noteIds.length === 0) return;

  await browser.runtime.sendMessage({
    action: "deleteNotes",
    notes: noteIds,
  });
}
