export interface GetDeckNamesMessage {
  action: 'getDeckNames';
}

export interface CanAddNotesMessage {
  action: 'canAddNotes';
  notes: Array<{
    deckName: string;
    modelName: string;
    fields: { Front: string; Back: string };
  }>;
}

export interface AddNoteMessage {
  action: 'addNote';
  deckName: string;
  frontImg: string;
  backImg: string;
  tags: string[];
}

export interface AddTextNoteMessage {
  action: 'addTextNote';
  deckName: string;
  front: string;
  back: string;
  tags: string[];
}

export interface FindNotesMessage {
  action: 'findNotes';
  query: string;
}

export interface DeleteNotesMessage {
  action: 'deleteNotes';
  notes: number[];
}

export interface StoreMediaFileMessage {
  action: 'storeMediaFile';
  filename: string;
  data: string;
}

export type AutobotMessage =
  | GetDeckNamesMessage
  | CanAddNotesMessage
  | AddNoteMessage
  | AddTextNoteMessage
  | FindNotesMessage
  | DeleteNotesMessage
  | StoreMediaFileMessage;
