export function spellingWords(text) {
  const plain = text
    .replace(/<[^>]*>|(?<!\\)\{[^{}]*?(?<!\\)\}|\\[A-Za-z]+(?:\[[^\]]*\])?|\\[{}]|%[0-9]*\$?[a-zA-Z]/gu, " ");
  return plain.match(/\p{L}[\p{L}\p{M}]*(?:['’\-]\p{L}[\p{L}\p{M}]*)*/gu) ?? [];
}
