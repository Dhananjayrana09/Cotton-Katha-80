import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';

const PAGE_SIZE = 10;

export default function DOSpecificationsHistory() {
  const [records, setRecords] = useState([]);
  const [pagination, setPagination] = useState({ current_page: 1, total_pages: 1, total_records: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const fetchRecords = async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/do-specifications', { params: { page, limit: PAGE_SIZE } });
      setRecords(res.data.data.records);
      setPagination(res.data.data.pagination);
    } catch (err) {
      setError('Failed to fetch records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords(1);
  }, []);

  const handlePageChange = (page) => {
    fetchRecords(page);
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">DO Specifications History</h1>
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
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Created At</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Total Lots</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Bid Price</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Zone</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {records.map((rec) => (
                <tr key={rec.id}>
                  <td className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">{new Date(rec.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{rec.customer_id}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{rec.total_lots}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{rec.bid_price}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">{rec.zone}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-sm">
                    <button className="text-blue-600 hover:underline" onClick={() => navigate(`/do-specifications/${rec.id}`)}>View Details</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Pagination */}
          {pagination.total_pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <div>
                <p className="text-sm text-gray-700">
                  Showing page {pagination.current_page} of {pagination.total_pages} ({pagination.total_records} total records)
                </p>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => handlePageChange(pagination.current_page - 1)}
                  disabled={!pagination.has_previous}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.current_page + 1)}
                  disabled={!pagination.has_next}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 