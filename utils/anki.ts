const ANKI_URL = "http://127.0.0.1:8765";

interface AnkiRequest {
  action: string;
  version: number;
  params?: Record<string, unknown>;
}

export async function invoke<T>(
  action: string,
  params?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, params } as AnkiRequest),
  });
  const text = await response.text();
  if (!text) throw new Error("Empty response from AnkiConnect");
  const json = JSON.parse(text);
  if (json.error) throw new Error(json.error);
  return json.result;
}

export const getDeckNames = () => invoke<string[]>("deckNames");

export const storeMediaFile = (filename: string, data: string) =>
  invoke<string>("storeMediaFile", {
    filename,
    data,
  });

export const addTextNote = (
  deckName: string,
  front: string,
  back: string,
  tags: string[],
) =>
  invoke<number>("addNote", {
    note: {
      deckName,
      modelName: "Basic",
      fields: { Front: front, Back: back },
      tags,
    },
  });

export const findNotes = (query: string) =>
  invoke<number[]>("findNotes", { query });

export interface NoteInfo {
  noteId: number;
  fields?: Record<string, { value?: string }>;
}

export const notesInfo = (notes: number[]) =>
  invoke<NoteInfo[]>("notesInfo", { notes });

export const deleteNotes = (notes: number[]) =>
  invoke<null>("deleteNotes", { notes });
