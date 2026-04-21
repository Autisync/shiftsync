export const DEFAULT_PAGE_SIZE = 5;

export function getPaginationSummary(
  page: number,
  pageSize: number,
  total: number,
): string {
  if (total <= 0) {
    return "Sem resultados";
  }

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return `A mostrar ${from}-${to} de ${total}`;
}

export function shouldShowPagination(total: number, pageSize: number): boolean {
  return total > pageSize;
}
