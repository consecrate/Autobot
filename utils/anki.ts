const ANKI_URL = 'http://127.0.0.1:8765';

interface AnkiRequest {
    action: string;
    version: number;
    params?: Record<string, unknown>;
}

export async function invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const response = await fetch(ANKI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, version: 6, params } as AnkiRequest),
    });
    const text = await response.text();
    if (!text) throw new Error('Empty response from AnkiConnect');
    const json = JSON.parse(text);
    if (json.error) throw new Error(json.error);
    return json.result;
}

export const getDeckNames = () => invoke<string[]>('deckNames');

export const canAddNotes = (notes: Array<{
    deckName: string;
    modelName: string;
    fields: { Front: string; Back: string };
}>) => invoke<boolean[]>('canAddNotes', { notes });

export const addNote = (
    deckName: string,
    frontImg: string,
    backImg: string,
    tags: string[]
) =>
    invoke<number>('addNote', {
        note: {
            deckName,
            modelName: 'Basic',
            fields: {
                Front: `<img src="${frontImg}">`,
                Back: `<img src="${backImg}">`,
            },
            tags,
        },
    });

export const addTextNote = (
    deckName: string,
    front: string,
    back: string,
    tags: string[]
) =>
    invoke<number>('addNote', {
        note: {
            deckName,
            modelName: 'Basic',
            fields: { Front: front, Back: back },
            tags,
        },
    });

export const findNotes = (query: string) =>
    invoke<number[]>('findNotes', { query });

export const deleteNotes = (notes: number[]) =>
    invoke<null>('deleteNotes', { notes });
