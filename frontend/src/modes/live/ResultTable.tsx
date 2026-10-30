import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
} from 'lucide-react';
import type { RouteItem, ObjectItem } from '../../api/contracts';

export type UnifiedResultItem =
  | { kind: 'route'; data: RouteItem }
  | { kind: 'object'; data: ObjectItem };

export interface ResultTableProps {
  items: UnifiedResultItem[];
  selectedId: string | null;
  onSelect: (id: string, type: 'route' | 'object') => void;
  pageSize?: number;
}

export const ResultTable: React.FC<ResultTableProps> = ({
  items,
  selectedId,
  onSelect,
  pageSize = 25,
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  // Automatically switch page when selectedId is on another page
  useEffect(() => {
    if (!selectedId) return;
    const selectedIndex = items.findIndex((it) => {
      const id = it.kind === 'route' ? it.data.route_id : it.data.object_id;
      return id === selectedId;
    });
    if (selectedIndex !== -1) {
      const targetPage = Math.floor(selectedIndex / pageSize) + 1;
      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
    }
  }, [selectedId, items, pageSize, currentPage]);

  const startIndex = (currentPage - 1) * pageSize;
  const paginatedItems = items.slice(startIndex, startIndex + pageSize);

  return (
    <div
      data-testid="result-table-container"
      className="bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden text-xs shadow-2xs"
    >
      {/* Table Header / Pagination Bar */}
      <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <FileSpreadsheet className="w-4 h-4 text-[#006D84]" aria-hidden="true" />
          <h3 className="font-heading font-semibold text-slate-800">
            Extraction Quantities Ledger
          </h3>
          <span className="text-[11px] font-mono text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded">
            {items.length} items
          </span>
        </div>

        {/* Pagination controls */}
        {totalPages > 1 && (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <span className="font-mono text-[11px] text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              className="p-1 rounded border border-slate-200 text-slate-600 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto max-h-72 overflow-y-auto">
        <table className="w-full text-left border-collapse" role="table">
          <caption className="sr-only">Quantifiable objects and linear routes ledger</caption>
          <thead className="bg-slate-100/75 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500 sticky top-0 z-10 font-semibold font-mono">
            <tr>
              <th scope="col" className="px-3 py-2">Type</th>
              <th scope="col" className="px-3 py-2">Canonical ID</th>
              <th scope="col" className="px-3 py-2">Category</th>
              <th scope="col" className="px-3 py-2">Representation</th>
              <th scope="col" className="px-3 py-2">Continuity</th>
              <th scope="col" className="px-3 py-2">Confidence</th>
              <th scope="col" className="px-3 py-2" title="Scale unverified: Physical length is unavailable">
                Physical Length <span className="text-amber-600 text-[10px]">*</span>
              </th>
              <th scope="col" className="px-3 py-2">Review Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-sans">
                  No extracted results match the current filters.
                </td>
              </tr>
            ) : (
              paginatedItems.map((item) => {
                const isRoute = item.kind === 'route';
                const id = isRoute ? item.data.route_id : item.data.object_id;
                const isSelected = selectedId === id;
                const revStatus = item.data.review_projection?.reviewed_status || 'PENDING';

                return (
                  <tr
                    key={id}
                    data-testid="result-table-row"
                    data-result-id={id}
                    aria-selected={isSelected}
                    tabIndex={0}
                    onClick={() => onSelect(id, isRoute ? 'route' : 'object')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(id, isRoute ? 'route' : 'object');
                      }
                    }}
                    className={`cursor-pointer transition-colors focus:outline-none ${
                      isSelected
                        ? 'bg-teal-50/80 border-l-4 border-l-[#006D84] text-slate-900 font-bold'
                        : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    {/* 1. Type */}
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                      {isRoute ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-800 border border-blue-200">
                          ROUTE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-50 text-red-800 border border-red-200">
                          OBJECT
                        </span>
                      )}
                    </td>

                    {/* 2. Canonical ID */}
                    <td className="px-3 py-2 text-[11px] font-bold text-slate-900 whitespace-nowrap">
                      {id}
                    </td>

                    {/* 3. Category */}
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                      {item.data.object_type}
                    </td>

                    {/* 4. Representation */}
                    <td className="px-3 py-2 text-[10px] text-slate-600 whitespace-nowrap">
                      {item.data.representation_state || '—'}
                    </td>

                    {/* 5. Continuity */}
                    <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                      {isRoute ? (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            item.data.continuity_status === 'CONTINUOUS'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              : item.data.continuity_status === 'REVIEW_REQUIRED'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {item.data.continuity_status || 'UNKNOWN'}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* 6. Confidence */}
                    <td className="px-3 py-2 text-[11px] whitespace-nowrap">
                      {item.data.confidence != null ? (
                        `${(item.data.confidence * 100).toFixed(1)}%`
                      ) : (
                        <span className="text-slate-400 italic">Not available</span>
                      )}
                    </td>

                    {/* 7. Physical Length (Strictly fail-closed) */}
                    <td className="px-3 py-2 text-[11px] text-slate-500 whitespace-nowrap">
                      {isRoute && item.data.physical_length?.value != null ? (
                        <span className="font-bold text-slate-900">
                          {item.data.physical_length.value.toFixed(2)} m
                        </span>
                      ) : (
                        <span className="text-slate-400 font-bold" title="Drawing scale unconfirmed (G3). Length is not available.">
                          —
                        </span>
                      )}
                    </td>

                    {/* 8. Review Status */}
                    <td className="px-3 py-2 text-[10px] whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          revStatus === 'ACCEPTED'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : revStatus === 'REJECTED'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : revStatus === 'NEEDS_REVIEW'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {revStatus}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer scale notification banner */}
      <div className="px-4 py-2 bg-amber-50/70 border-t border-amber-200 text-[11px] text-amber-800 flex items-center justify-between font-sans">
        <span className="flex items-center space-x-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
          <span>
            * Drawing scale could not be verified from title block (G3 fail-closed). All physical lengths are null.
          </span>
        </span>
        <span className="font-mono text-[10px] text-amber-700">SCALE: UNAVAILABLE</span>
      </div>
    </div>
  );
};
