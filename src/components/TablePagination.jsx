import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * Reusable Professional Table Pagination Component
 *
 * @param {number} totalItems - Total count of filtered items
 * @param {number} currentPage - Currently active 1-indexed page
 * @param {number} pageSize - Number of items shown per page
 * @param {number[]} pageSizeOptions - Options for page size dropdown
 * @param {function} onPageChange - Callback when page changes (page: number)
 * @param {function} onPageSizeChange - Callback when page size changes (size: number)
 * @param {string} itemLabel - Descriptive label for items (e.g. "leads", "calls")
 */
export default function TablePagination({
  totalItems = 0,
  currentPage = 1,
  pageSize = 10,
  pageSizeOptions = [10, 20, 50, 100],
  onPageChange,
  onPageSizeChange,
  itemLabel = 'records',
  className = '',
  style = {},
  idPrefix = ''
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const endItem = Math.min(safePage * pageSize, totalItems);

  // Generate page numbers with smart ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    if (safePage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    if (safePage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [1, '...', safePage - 1, safePage, safePage + 1, '...', totalPages];
  };

  const pages = getPageNumbers();

  const handleSelectPage = (p) => {
    if (typeof p !== 'number') return;
    if (p < 1 || p > totalPages || p === safePage) return;
    if (onPageChange) onPageChange(p);
  };

  const handlePageSizeChange = (e) => {
    const newSize = parseInt(e.target.value, 10) || 10;
    if (onPageSizeChange) {
      onPageSizeChange(newSize);
    }
  };

  const selectId = `${idPrefix ? idPrefix + '-' : ''}page-size-${itemLabel}`;

  return (
    <div className={`pagination-bar ${className}`.trim()} style={style}>
      {/* Left section: Rows Per Page & Range Info */}
      <div className="pagination-left">
        <div className="pagination-page-size">
          <label htmlFor={selectId} style={{ fontSize: '0.85rem' }}>
            Rows per page:
          </label>
          <select
            id={selectId}
            value={pageSize}
            onChange={handlePageSizeChange}
            className="pagination-select"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div className="pagination-info">
          {totalItems === 0 ? (
            <span>No {itemLabel}</span>
          ) : (
            <span>
              Showing <strong>{startItem}</strong>–<strong>{endItem}</strong> of{' '}
              <strong>{totalItems.toLocaleString()}</strong> {itemLabel}
            </span>
          )}
        </div>
      </div>

      {/* Right section: Navigation Controls */}
      {totalPages > 1 && (
        <div className="pagination-right">
          {/* Jump to first page */}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handleSelectPage(1)}
            disabled={safePage <= 1}
            title="First Page"
            aria-label="First Page"
          >
            <ChevronsLeft size={16} />
          </button>

          {/* Previous page */}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handleSelectPage(safePage - 1)}
            disabled={safePage <= 1}
            title="Previous Page"
            aria-label="Previous Page"
          >
            <ChevronLeft size={16} />
            <span className="pagination-btn-text">Prev</span>
          </button>

          {/* Numbered page buttons & ellipsis */}
          <div className="pagination-numbers">
            {pages.map((p, idx) => {
              if (p === '...') {
                return (
                  <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                    …
                  </span>
                );
              }
              const isActive = p === safePage;
              return (
                <button
                  key={`page-${p}`}
                  type="button"
                  className={`pagination-btn pagination-num ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectPage(p)}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {p}
                </button>
              );
            })}
          </div>

          {/* Next page */}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handleSelectPage(safePage + 1)}
            disabled={safePage >= totalPages}
            title="Next Page"
            aria-label="Next Page"
          >
            <span className="pagination-btn-text">Next</span>
            <ChevronRight size={16} />
          </button>

          {/* Jump to last page */}
          <button
            type="button"
            className="pagination-btn"
            onClick={() => handleSelectPage(totalPages)}
            disabled={safePage >= totalPages}
            title="Last Page"
            aria-label="Last Page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
