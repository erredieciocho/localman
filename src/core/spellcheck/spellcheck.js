export function spellingWords(text) {
  const plain = text
    .replace(/<[^>]*>|(?<!\\)\{[^{}]*?(?<!\\)\}|\\[A-Za-z]+(?:\[[^\]]*\])?|\\[{}]|%[0-9]*\$?[a-zA-Z]/gu, " ");
  return plain.match(/\p{L}[\p{L}\p{M}]*(?:['’\-]\p{L}[\p{L}\p{M}]*)*/gu) ?? [];
}

export function spellingVariants(word) {
  const variants = new Set([word]);
  const stutter = word.match(/^(\p{L})\1*-(.+)$/iu);
  if (stutter) {
    const [, repeated, remainder] = stutter;
    const prefix = repeated.toLocaleLowerCase();
    const rest = remainder.toLocaleLowerCase();
    if (prefix === "o" && rest === "kay") variants.add("okay");
    else if (rest.startsWith(prefix)) variants.add(remainder);
  }

  for (const variant of [...variants]) {
    if (!/(\p{L})\1{2,}/iu.test(variant)) continue;
    variants.add(variant.replace(/(\p{L})\1{2,}/giu, "$1"));
    variants.add(variant.replace(/(\p{L})\1{2,}/giu, "$1$1"));
  }
  return [...variants];
}
