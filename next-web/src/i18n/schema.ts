export type Primitive = string | number | boolean | null | undefined;

export type MessageTree = {
  [key: string]: Primitive | Primitive[] | MessageTree | MessageTree[];
};
