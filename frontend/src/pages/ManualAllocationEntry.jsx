import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';

const initialState = {
  indent_number: '',
  buyer_type: '',
  centre_name: '',
  variety: '',
  bale_quantity: '',
  crop_year: '',
  offer_price: '',
  bid_price: '',
  lifting_period: '',
  fibre_length: '',
  ccl_discount: '',
};

const schema = yup.object().shape({
  indent_number: yup.string().required('Indent Number is required'),
  buyer_type: yup.string().required('Buyer Type is required'),
  branch_name: yup.string().required('Branch is required'),
  zone: yup.string().required('Zone is required'),
  centre_name: yup.string().required('Center Name is required'),
  variety: yup.string().required('Variety is required'),
  bale_quantity: yup.number().typeError('Bale Quantity must be a number').required('Bale Quantity is required').min(1),
  crop_year: yup.string().required('Crop Year is required'),
  offer_price: yup.number().typeError('Offer Price must be a number').required('Offer Price is required').min(0),
  bid_price: yup.number().typeError('Bid Price must be a number').required('Bid Price is required').min(0),
  lifting_period: yup.string().required('Lifting Period is required'),
  fibre_length: yup.string().required('Fibre Length is required'),
  ccl_discount: yup.number().typeError('CCL Discount must be a number').nullable().transform((v, o) => o === '' ? null : v),
});

const ManualAllocationEntry = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [branchOptions, setBranchOptions] = useState([]);
  const [zoneOptions, setZoneOptions] = useState([]);
  const [buyerTypeOptions, setBuyerTypeOptions] = useState([
    'TRADER', 'MILL', 'EXPORTER', 'OTHER'
  ]);
  const [lovLoading, setLovLoading] = useState(true);
  const [lovError, setLovError] = useState('');
  const navigate = useNavigate();

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: initialState
  });

  useEffect(() => {
    const fetchLOVs = async () => {
      setLovLoading(true);
      setLovError('');
      try {
        const res = await api.get('/dashboard/branch-info');
        const branches = res.data.data || [];
        setBranchOptions(branches.map(b => b.branch_name));
        setZoneOptions([...new Set(branches.map(b => b.zone))]);
      } catch (err) {
        setLovError('Failed to load branch/zone options');
      } finally {
        setLovLoading(false);
      }
    };
    fetchLOVs();
  }, []);

  const onSubmit = async (data) => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = {
        ...data,
        bale_quantity: Number(data.bale_quantity),
        offer_price: Number(data.offer_price),
        bid_price: Number(data.bid_price),
        ccl_discount: data.ccl_discount ? Number(data.ccl_discount) : null,
      };
      const res = await api.post('/allocations/manual', payload);
      setSuccess('Allocation created successfully!');
      setTimeout(() => navigate('/allocations'), 1200);
      reset();
    } catch (err) {
      setError(
        err.response?.data?.message || 'Failed to create allocation. Please check your input.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-4">Manual Allocation Entry</h1>
      {lovLoading ? (
        <div className="text-center py-8">Loading options...</div>
      ) : lovError ? (
        <div className="text-red-600 text-center py-8">{lovError}</div>
      ) : (
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 bg-white p-6 rounded shadow">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Indent Number *</label>
            <input {...register('indent_number')} className="input-field" />
            {errors.indent_number && <div className="error-message">{errors.indent_number.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Buyer Type *</label>
            <select {...register('buyer_type')} className="input-field">
              <option value="">Select Buyer Type</option>
              {buyerTypeOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.buyer_type && <div className="error-message">{errors.buyer_type.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Branch *</label>
            <select {...register('branch_name')} className="input-field">
              <option value="">Select Branch</option>
              {branchOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.branch_name && <div className="error-message">{errors.branch_name.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Zone *</label>
            <select {...register('zone')} className="input-field">
              <option value="">Select Zone</option>
              {zoneOptions.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {errors.zone && <div className="error-message">{errors.zone.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Center Name *</label>
            <input {...register('centre_name')} className="input-field" />
            {errors.centre_name && <div className="error-message">{errors.centre_name.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Variety *</label>
            <input {...register('variety')} className="input-field" />
            {errors.variety && <div className="error-message">{errors.variety.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Bale Quantity *</label>
            <input type="number" {...register('bale_quantity')} className="input-field" min="1" />
            {errors.bale_quantity && <div className="error-message">{errors.bale_quantity.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Crop Year *</label>
            <input {...register('crop_year')} className="input-field" />
            {errors.crop_year && <div className="error-message">{errors.crop_year.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Offer Price *</label>
            <input type="number" {...register('offer_price')} className="input-field" min="0" />
            {errors.offer_price && <div className="error-message">{errors.offer_price.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Bid Price *</label>
            <input type="number" {...register('bid_price')} className="input-field" min="0" />
            {errors.bid_price && <div className="error-message">{errors.bid_price.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Lifting Period *</label>
            <input {...register('lifting_period')} className="input-field" />
            {errors.lifting_period && <div className="error-message">{errors.lifting_period.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">Fibre Length *</label>
            <input {...register('fibre_length')} className="input-field" />
            {errors.fibre_length && <div className="error-message">{errors.fibre_length.message}</div>}
          </div>
          <div>
            <label className="block text-sm font-medium">CCL Discount</label>
            <input type="number" {...register('ccl_discount')} className="input-field" />
            {errors.ccl_discount && <div className="error-message">{errors.ccl_discount.message}</div>}
          </div>
        </div>
        {error && <div className="text-red-600 text-sm">{error}</div>}
        {success && <div className="text-green-600 text-sm">{success}</div>}
        <div className="flex items-center space-x-4 mt-4">
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <LoadingSpinner size="sm" /> : 'Create Allocation'}
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/allocations')} disabled={loading}>
            Cancel
          </button>
        </div>
      </form>
      )}
    </div>
  );
};

export default ManualAllocationEntry; 