export interface GetDeckNamesMessage {
  action: "getDeckNames";
}

export interface AddTextNoteMessage {
  action: "addTextNote";
  deckName: string;
  front: string;
  back: string;
  tags: string[];
}

export interface FindNotesMessage {
  action: "findNotes";
  query: string;
}

export interface NotesInfoMessage {
  action: "notesInfo";
  notes: number[];
}

export interface DeleteNotesMessage {
  action: "deleteNotes";
  notes: number[];
}

export interface StoreMediaFileMessage {
  action: "storeMediaFile";
  filename: string;
  data: string;
}

export interface SelectorStat {
  found: boolean;
  count: number;
}

export interface StepStructureSummary {
  index: number;
  id: string | null;
  name: string;
  type: "example" | "question" | "unknown";
  hasFront: boolean;
  hasBack: boolean;
  hasChoices: boolean;
  hasGraphic: boolean;
}

export interface DomSnippet {
  selector: string;
  html: string;
}

export interface ExtractStructureMessage {
  action: "extractStructure";
  maxSnippets?: number;
  maxSnippetLength?: number;
}

export interface StructureSnapshot {
  timestamp: string;
  url: string;
  title: string;
  lessonName: string;
  selectors: Record<string, SelectorStat>;
  stepSummary: {
    total: number;
    examples: number;
    questions: number;
    unknown: number;
  };
  steps: StepStructureSummary[];
  snippets: DomSnippet[];
  warnings: string[];
}

export interface ExtractStructureErrorResponse {
  error: string;
}

export type ExtractStructureResponse =
  | StructureSnapshot
  | ExtractStructureErrorResponse;

export type AutobotMessage =
  | GetDeckNamesMessage
  | AddTextNoteMessage
  | FindNotesMessage
  | NotesInfoMessage
  | DeleteNotesMessage
  | StoreMediaFileMessage
  | ExtractStructureMessage;
