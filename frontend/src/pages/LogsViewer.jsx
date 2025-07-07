import React, { useEffect, useState } from 'react';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { supabase } from '../services/supabaseClient';

const PAGE_SIZE = 20;

const LogsViewer = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1 });
  const [filters, setFilters] = useState({ table_name: '', action: '', search: '' });

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: PAGE_SIZE,
        ...Object.fromEntries(Object.entries(filters).filter(([k, v]) => v)),
      };
      const res = await api.get('/dashboard/logs', { params });
      setLogs(res.data.data.logs);
      setPagination(res.data.data.pagination);
    } catch (err) {
      setError('Failed to fetch logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line
  }, [filters]);

  // Real-time subscription for logs
  useEffect(() => {
    const channel = supabase.channel('realtime:audit_log')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' }, () => {
        fetchLogs(pagination.current_page);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters, pagination.current_page]);

  const handlePageChange = (page) => {
    fetchLogs(page);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Audit Logs</h1>
      <div className="bg-white p-4 rounded shadow mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm font-medium">Table</label>
          <input name="table_name" value={filters.table_name} onChange={handleFilterChange} className="input-field" placeholder="e.g. allocation" />
        </div>
        <div>
          <label className="block text-sm font-medium">Action</label>
          <input name="action" value={filters.action} onChange={handleFilterChange} className="input-field" placeholder="e.g. MANUAL_CREATE" />
        </div>
        <div className="flex-1">
          <label className="block text-sm font-medium">Search</label>
          <input name="search" value={filters.search} onChange={handleFilterChange} className="input-field" placeholder="Search details..." />
        </div>
        <button className="btn-secondary" onClick={() => fetchLogs(1)} disabled={loading}>
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : error ? (
        <div className="text-red-600 text-center py-8">{error}</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded shadow">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Timestamp</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Table</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{log.table_name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{log.action}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    {log.users ? `${log.users.first_name} ${log.users.last_name}` : log.user_id || '-'}
                  </td>
                  <td className="px-4 py-2 whitespace-pre-wrap text-xs max-w-xs break-words">
                    {log.new_values ? JSON.stringify(log.new_values, null, 2) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          <div className="flex justify-between items-center p-4 border-t">
            <span className="text-sm text-gray-600">
              Page {pagination.current_page} of {pagination.total_pages} ({pagination.total_records} records)
            </span>
            <div className="space-x-2">
              <button
                className="btn-secondary"
                onClick={() => handlePageChange(pagination.current_page - 1)}
                disabled={pagination.current_page <= 1 || loading}
              >
                Previous
              </button>
              <button
                className="btn-secondary"
                onClick={() => handlePageChange(pagination.current_page + 1)}
                disabled={pagination.current_page >= pagination.total_pages || loading}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LogsViewer; 