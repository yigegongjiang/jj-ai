export function parseFilterTerms(query: string) {
  const inc: string[] = [];
  const exc: string[] = [];
  for (const term of query.trim().toLowerCase().split(/\s+/)) {
    if (!term || term === "-") continue;
    if (term.startsWith("-")) exc.push(term.slice(1));
    else inc.push(term);
  }
  return { inc, exc };
}

export function matchesFilterTerms(
  value: string,
  { inc, exc }: ReturnType<typeof parseFilterTerms>,
) {
  const text = value.toLowerCase();
  return inc.every((term) => text.includes(term)) && !exc.some((term) => text.includes(term));
}
