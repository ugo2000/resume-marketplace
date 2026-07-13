export const Pagination = ({
  page,
  total,
  pageSize,
  baseUrl,
}: {
  page: number;
  total: number;
  pageSize: number;
  baseUrl: string;
}) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <nav class="pagination" aria-label="Job result pages">
      {page > 1 ? <a href={`${baseUrl}?page=${page - 1}`}>Previous</a> : <span />}
      <span>Page {page} of {pages}</span>
      {page < pages ? <a href={`${baseUrl}?page=${page + 1}`}>Next</a> : <span />}
    </nav>
  );
};
